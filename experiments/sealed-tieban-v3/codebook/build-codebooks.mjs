import { generateCohort } from "../../sealed-synthetic-v1/generator/index.mjs";
import { DEFAULT_GENERATOR_CONFIG } from "../../sealed-synthetic-v1/config/generator-config.v1.mjs";
import { sha256 } from "../../sealed-synthetic-v1/oracle/primitives.mjs";
import { V3_CONFIG } from "../config/experiment-config.mjs";
import { FACT_CATALOG, buildClauseCodebook, deriveFactIds } from "./fact-catalog.mjs";

const CANDIDATE_CACHE = new Map();

function hamming(left, right, weights) {
  let distance = 0;
  for (const fact of FACT_CATALOG) {
    if (left.has(fact.id) !== right.has(fact.id)) distance += weights.get(fact.id);
  }
  return distance;
}

export function buildCandidateCodebook({ seed = "sealed-tieban-v3-public-candidate-codebook" } = {}) {
  if (CANDIDATE_CACHE.has(seed)) return CANDIDATE_CACHE.get(seed);
  const generatorConfig = structuredClone(DEFAULT_GENERATOR_CONFIG);
  generatorConfig.version = "sealed-tieban-v3-candidate-pool-v1";
  generatorConfig.cohorts = [{ id: "candidate_pool", profiles: V3_CONFIG.candidatePoolSize, agentProfiles: 0 }];
  generatorConfig.retest = { cohort: "candidate_pool", respondentMode: "rule", sessions: 0, intervalDays: [7, 14] };
  const cohort = generateCohort({ seed, config: generatorConfig });
  const unique = new Map();
  for (const profile of cohort.profiles) {
    const factIds = deriveFactIds(profile).sort();
    if (factIds.length < 5 || factIds.length > 32) continue;
    const signature = factIds.join("|");
    if (!unique.has(signature)) unique.set(signature, { factIds, set: new Set(factIds), signatureHash: sha256(signature), minimumDistance: Infinity });
  }
  const pool = [...unique.values()];
  if (pool.length < V3_CONFIG.candidateCount) throw new Error("Candidate pool did not produce 120 unique profiles.");

  const prevalence = new Map(
    FACT_CATALOG.map((fact) => [fact.id, pool.filter((item) => item.set.has(fact.id)).length / pool.length])
  );
  const weights = new Map(
    FACT_CATALOG.map((fact) => [fact.id, 1 / Math.sqrt(Math.max(0.04, prevalence.get(fact.id)))])
  );
  const selected = [];
  const remaining = new Set(pool);
  const uncovered = new Set(FACT_CATALOG.map((fact) => fact.id));

  while (selected.length < V3_CONFIG.candidateCount) {
    let best = null;
    for (const candidate of remaining) {
      const minimumDistance = selected.length ? candidate.minimumDistance : 0;
      const newCoverage = [...candidate.set].filter((factId) => uncovered.has(factId)).length;
      const countRegularity = -Math.abs(candidate.factIds.length - 14) * 0.035;
      const score = minimumDistance + newCoverage * (selected.length < 40 ? 3.5 : 0.35) + countRegularity;
      if (!best || score > best.score || (score === best.score && candidate.signatureHash < best.candidate.signatureHash)) {
        best = { candidate, score };
      }
    }
    selected.push(best.candidate);
    remaining.delete(best.candidate);
    for (const factId of best.candidate.factIds) uncovered.delete(factId);
    for (const candidate of remaining) {
      candidate.minimumDistance = Math.min(candidate.minimumDistance, hamming(candidate.set, best.candidate.set, weights));
    }
  }

  const candidates = selected.map((item, index) => ({
    id: `KF-${String(index + 1).padStart(3, "0")}`,
    ordinal: index + 1,
    prior: 1 / V3_CONFIG.candidateCount,
    factIds: item.factIds
  }));
  const factCoverage = Object.fromEntries(
    FACT_CATALOG.map((fact) => [fact.id, candidates.filter((candidate) => candidate.factIds.includes(fact.id)).length])
  );
  let minimumHammingDistance = Infinity;
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const a = new Set(candidates[left].factIds);
      const b = new Set(candidates[right].factIds);
      const distance = new Set([...a, ...b]).size - [...a].filter((factId) => b.has(factId)).length;
      minimumHammingDistance = Math.min(minimumHammingDistance, distance);
    }
  }
  const result = {
    version: "tieban-candidate-codebook-v1",
    candidates,
    diagnostics: {
      sourcePoolProfiles: cohort.profiles.length,
      uniqueSourceSignatures: pool.length,
      uncoveredFacts: [...uncovered],
      factCoverage,
      minimumHammingDistance
    },
    hash: sha256(candidates)
  };
  CANDIDATE_CACHE.set(seed, result);
  return result;
}

export function buildPublicCodebooks(options) {
  const clauses = buildClauseCodebook();
  const candidateCodebook = buildCandidateCodebook(options);
  return {
    clauseCodebook: {
      version: "tieban-clause-codebook-v1",
      clauses,
      hash: sha256(clauses)
    },
    candidateCodebook
  };
}
