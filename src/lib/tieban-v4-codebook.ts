/**
 * Browser-safe, typed port of scripts/v4/codebook-core-v4.mjs.
 *
 * This module intentionally has no Node imports, wall-clock reads or calls to
 * Math.random(). Given identical content arrays and BirthSeed it must remain
 * byte-for-byte equivalent to the JavaScript reference implementation.
 */

const CANDIDATE_COUNT = 120;
const DOMAIN_ORDER = [
  "family",
  "education_mobility",
  "career",
  "wealth",
  "relationship",
  "health",
  "law_social",
  "turning_point"
] as const;

export interface CodebookBirthSeedInput {
  birthDate: string;
  shichen: string;
  gender: string;
  birthplace: string;
}

export interface NormalizedCodebookBirthSeed {
  birthDate: string;
  shichen: string;
  gender: string;
  birthplace: string;
}

export interface CodebookFactInput {
  id: string;
  predicate: string;
  domain: string;
  applicability?: {
    requiredContexts?: Array<{ groupId: string; allowedFactIds: string[] }>;
    excludedContexts?: Array<{ groupId: string; allowedFactIds: string[] }>;
  };
}

export interface CodebookCalibrationClauseInput {
  id: string;
  displayNumber: string;
  primaryFactId: string;
  category: string;
}

export interface CodebookFateClauseInput {
  id: string;
  displayNumber: string;
  primaryFactId: string;
  category: string;
  conditionFactIds?: string[];
}

export interface CodebookConstraintInput {
  id: string;
  factIds: string[];
}

export interface CandidateCodebookProfile {
  id: string;
  minuteOffset: number;
  prior: number;
  factProbabilities: Record<string, number>;
  exclusiveSelections: Record<string, string>;
  coreFactIds: string[];
  coreFactsByDomain: Record<string, string[]>;
  fateClauseIds: string[];
  fateClauseCountByCategory: Record<string, number>;
  signature: string;
}

export interface CandidateClauseMapping {
  clauseId: string;
  displayNumber: string;
  primaryFactId: string;
  category: string;
  candidatePYes: Record<string, number>;
  yesCandidateCount: number;
  noCandidateCount: number;
  splitRatio: number;
  binaryEntropy: number;
  mappingDigest: string;
}

export interface CandidateCodebook {
  schemaVersion: "4.0.0";
  corpusVersion: string;
  birthSeed: NormalizedCodebookBirthSeed;
  birthSeedFieldsUsed: string[];
  seedFingerprint: string;
  contentDigest: string;
  replayKey: string;
  generatedBeforeAnswers: true;
  answerHistoryUsed: false;
  candidateCount: number;
  factCount: number;
  calibrationClauseCount: number;
  fateClauseCount: number;
  mutualExclusionGroupCount: number;
  candidates: CandidateCodebookProfile[];
  clauseMappings: CandidateClauseMapping[];
}

export interface CandidateCodebookInput {
  birthSeed: CodebookBirthSeedInput;
  corpusVersion: string;
  facts: CodebookFactInput[];
  calibrationClauses: CodebookCalibrationClauseInput[];
  fateClauses: CodebookFateClauseInput[];
  constraints: CodebookConstraintInput[];
}

export function normalizeBirthSeed(input: CodebookBirthSeedInput): NormalizedCodebookBirthSeed {
  const normalized = {
    birthDate: String(input?.birthDate ?? "").trim(),
    shichen: String(input?.shichen ?? "").trim().toLowerCase(),
    gender: String(input?.gender ?? "").trim().toLowerCase(),
    birthplace: String(input?.birthplace ?? "").trim().replace(/\s+/g, " ").toLowerCase()
  };
  for (const [key, value] of Object.entries(normalized)) {
    if (!value) throw new Error(`BirthSeed缺少必填字段：${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.birthDate)) {
    throw new Error("birthDate必须为YYYY-MM-DD");
  }
  return normalized;
}

export function stableHash32(value: unknown, basis = 2166136261): number {
  let hash = basis >>> 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function birthSeedFingerprint(input: CodebookBirthSeedInput): string {
  const seed = normalizeBirthSeed(input);
  const canonical = `${seed.birthDate}|${seed.shichen}|${seed.gender}|${seed.birthplace}`;
  const bases = [2166136261, 2654435761, 2246822507, 3266489909];
  return bases
    .map((basis, index) => stableHash32(`${index}|${canonical}`, basis).toString(16).padStart(8, "0"))
    .join("");
}

function unitHash(value: string): number {
  return stableHash32(value) / 0xffffffff;
}

function round(value: number, digits = 9): number {
  return Number(value.toFixed(digits));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function candidateId(index: number): string {
  return `C${String(index + 1).padStart(3, "0")}`;
}

function digestList(items: string[]): string {
  const joined = items.join("|");
  const first = stableHash32(joined, 2166136261).toString(16).padStart(8, "0");
  const second = stableHash32(joined, 2654435761).toString(16).padStart(8, "0");
  return `${first}${second}`;
}

function binaryEntropy(ratio: number): number {
  if (ratio <= 0 || ratio >= 1) return 0;
  return -ratio * Math.log2(ratio) - (1 - ratio) * Math.log2(1 - ratio);
}

interface FactProbabilityBuildInput {
  candidates: CandidateCodebookProfile[];
  baseFacts: CodebookFactInput[];
  fingerprint: string;
  corpusVersion: string;
}

function buildBaseFactProbabilities({
  candidates,
  baseFacts,
  fingerprint,
  corpusVersion
}: FactProbabilityBuildInput): void {
  for (const fact of baseFacts) {
    const ranked = candidates
      .map((candidate, index) => ({
        index,
        score: unitHash(`${fingerprint}|${corpusVersion}|base-fact|${fact.id}|${candidate.id}`)
      }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const high = new Set(ranked.slice(0, CANDIDATE_COUNT / 2).map((item) => item.index));
    candidates.forEach((candidate, index) => {
      const jitter = unitHash(`${fingerprint}|${fact.id}|${candidate.id}|probability`);
      candidate.factProbabilities[fact.id] = high.has(index)
        ? round(0.78 + jitter * 0.17)
        : round(0.04 + jitter * 0.14);
    });
  }
}

interface ExclusiveProbabilityBuildInput {
  candidates: CandidateCodebookProfile[];
  constraints: CodebookConstraintInput[];
  factById: Map<string, CodebookFactInput>;
  fingerprint: string;
  corpusVersion: string;
}

function buildExclusiveProbabilities({
  candidates,
  constraints,
  factById,
  fingerprint,
  corpusVersion
}: ExclusiveProbabilityBuildInput): void {
  for (const constraint of constraints) {
    const optionCount = constraint.factIds.length;
    if (optionCount < 2) throw new Error(`${constraint.id} 至少需要2个互斥选项`);
    const rotation = stableHash32(`${fingerprint}|${corpusVersion}|${constraint.id}|rotation`) % optionCount;
    const assignmentByCandidateIndex = new Map(
      candidates
        .map((candidate, index) => ({ index, score: unitHash(`${fingerprint}|${corpusVersion}|${constraint.id}|assignment|${candidate.id}`) }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map((item, position) => [item.index, (position + rotation) % optionCount])
    );

    candidates.forEach((candidate, index) => {
      const selectedIndex = assignmentByCandidateIndex.get(index) ?? 0;
      const selectedProbability = 0.84 + unitHash(`${fingerprint}|${constraint.id}|${candidate.id}|selected`) * 0.11;
      const remaining = 1 - selectedProbability;
      const rawWeights = constraint.factIds.map((factId, optionIndex) =>
        optionIndex === selectedIndex
          ? 0
          : 0.5 + unitHash(`${fingerprint}|${constraint.id}|${candidate.id}|${factId}|rest`)
      );
      const weightSum = rawWeights.reduce((sum, value) => sum + value, 0);
      let assignedSum = 0;
      constraint.factIds.forEach((factId, optionIndex) => {
        if (!factById.has(factId)) throw new Error(`${constraint.id}引用不存在事实${factId}`);
        const probability = optionIndex === selectedIndex
          ? selectedProbability
          : remaining * rawWeights[optionIndex] / weightSum;
        candidate.factProbabilities[factId] = round(probability, 12);
        assignedSum += candidate.factProbabilities[factId];
      });
      const selectedFactId = constraint.factIds[selectedIndex];
      candidate.factProbabilities[selectedFactId] = round(
        candidate.factProbabilities[selectedFactId] + (1 - assignedSum),
        12
      );
      candidate.exclusiveSelections[constraint.id] = selectedFactId;
    });
  }
}

function assignExclusiveSelection(
  candidate: CandidateCodebookProfile,
  constraint: CodebookConstraintInput,
  selectedFactId: string,
  fingerprint: string
) {
  if (!constraint.factIds.includes(selectedFactId)) return;
  const selectedProbability = 0.88 + unitHash(`${fingerprint}|coherence|${constraint.id}|${candidate.id}|${selectedFactId}`) * 0.08;
  const remaining = 1 - selectedProbability;
  const otherFactIds = constraint.factIds.filter((factId) => factId !== selectedFactId);
  const rawWeights = otherFactIds.map((factId) => 0.5 + unitHash(`${fingerprint}|coherence|${constraint.id}|${candidate.id}|${factId}`));
  const weightSum = rawWeights.reduce((sum, value) => sum + value, 0) || 1;
  constraint.factIds.forEach((factId) => {
    if (factId === selectedFactId) candidate.factProbabilities[factId] = round(selectedProbability, 12);
    else candidate.factProbabilities[factId] = round(remaining * rawWeights[otherFactIds.indexOf(factId)] / weightSum, 12);
  });
  const assigned = constraint.factIds.reduce((sum, factId) => sum + candidate.factProbabilities[factId], 0);
  candidate.factProbabilities[selectedFactId] = round(candidate.factProbabilities[selectedFactId] + (1 - assigned), 12);
  candidate.exclusiveSelections[constraint.id] = selectedFactId;
}

function applyCrossAxisConsistency(
  candidates: CandidateCodebookProfile[],
  constraints: CodebookConstraintInput[],
  fingerprint: string
) {
  const constraintById = new Map(constraints.map((constraint) => [constraint.id, constraint]));
  const birthOrder = constraintById.get("mx.birth_order");
  if (!birthOrder) return;
  for (const candidate of candidates) {
    const siblingCount = candidate.exclusiveSelections["mx.siblings_count"];
    let selectedBirthOrder: string | null = null;
    if (siblingCount === "fact.v4.axis.siblings_count.0") {
      selectedBirthOrder = "fact.v4.axis.birth_order.only";
    } else if (siblingCount === "fact.v4.axis.siblings_count.1") {
      selectedBirthOrder = stableHash32(`${fingerprint}|birth-order|${candidate.id}`) % 2 === 0
        ? "fact.v4.axis.birth_order.eldest"
        : "fact.v4.axis.birth_order.youngest";
    } else if (siblingCount) {
      const slot = stableHash32(`${fingerprint}|birth-order|${candidate.id}`) % 4;
      selectedBirthOrder = slot < 2
        ? "fact.v4.axis.birth_order.middle"
        : slot === 2
          ? "fact.v4.axis.birth_order.eldest"
          : "fact.v4.axis.birth_order.youngest";
    }
    if (selectedBirthOrder) assignExclusiveSelection(candidate, birthOrder, selectedBirthOrder, fingerprint);

    const marriageCount = constraintById.get("mx.marriage_count");
    const relationshipCount = candidate.exclusiveSelections["mx.major_relationship_count"];
    if (marriageCount && relationshipCount) {
      const slot = stableHash32(`${fingerprint}|marriage-within-relationships|${candidate.id}`);
      const selected = relationshipCount.endsWith(".0")
        ? "fact.v4.axis.marriage_count.0"
        : relationshipCount.endsWith(".1")
          ? slot % 2 === 0 ? "fact.v4.axis.marriage_count.0" : "fact.v4.axis.marriage_count.1"
          : relationshipCount.endsWith(".2")
            ? ["fact.v4.axis.marriage_count.0", "fact.v4.axis.marriage_count.1", "fact.v4.axis.marriage_count.2"][slot % 3]
            : slot % 2 === 0 ? "fact.v4.axis.marriage_count.2" : "fact.v4.axis.marriage_count.3p";
      assignExclusiveSelection(candidate, marriageCount, selected, fingerprint);
    }

    const fatherState = candidate.exclusiveSelections["mx.father_state_30"];
    const motherState = candidate.exclusiveSelections["mx.mother_state_30"];
    const firstLoss = constraintById.get("mx.first_close_loss");
    const parentDeceased = fatherState === "fact.v4.axis.father_state_30.deceased"
      || motherState === "fact.v4.axis.mother_state_30.deceased";
    if (firstLoss
      && candidate.exclusiveSelections["mx.first_close_loss"] === "fact.v4.axis.first_close_loss.none"
      && parentDeceased) {
      assignExclusiveSelection(candidate, firstLoss, "fact.v4.axis.first_close_loss.parent", fingerprint);
    }
  }
}

function candidateFactIsApplicable(candidate: CandidateCodebookProfile, fact: CodebookFactInput | undefined) {
  if (!fact) return false;
  for (const requirement of fact.applicability?.requiredContexts ?? []) {
    const selected = candidate.exclusiveSelections[requirement.groupId];
    if (!selected || !requirement.allowedFactIds.includes(selected)) return false;
  }
  for (const exclusion of fact.applicability?.excludedContexts ?? []) {
    const selected = candidate.exclusiveSelections[exclusion.groupId];
    if (selected && exclusion.allowedFactIds.includes(selected)) return false;
  }
  return true;
}

interface CandidateSummaryBuildInput {
  candidates: CandidateCodebookProfile[];
  facts: CodebookFactInput[];
  fateClauses: CodebookFateClauseInput[];
  fingerprint: string;
}

function attachCandidateSummaries({
  candidates,
  facts,
  fateClauses,
  fingerprint
}: CandidateSummaryBuildInput): void {
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  for (const candidate of candidates) {
    const coreFacts = Object.entries(candidate.factProbabilities)
      .filter(([factId, probability]) => probability >= 0.72 && candidateFactIsApplicable(candidate, factById.get(factId)))
      .map(([factId, probability]) => ({
        factId,
        probability,
        domain: factById.get(factId)?.domain
      }))
      .sort((left, right) => right.probability - left.probability || left.factId.localeCompare(right.factId));

    candidate.coreFactIds = coreFacts.map((item) => item.factId);
    candidate.coreFactsByDomain = Object.fromEntries(
      DOMAIN_ORDER.map((domain) => [
        domain,
        coreFacts.filter((item) => item.domain === domain).map((item) => item.factId)
      ])
    );

    const eligibleFate = fateClauses
      .map((clause) => {
        const conditionIds = clause.conditionFactIds?.length
          ? clause.conditionFactIds
          : [clause.primaryFactId];
        const support = Math.max(...conditionIds.map((factId) => candidateFactIsApplicable(candidate, factById.get(factId))
          ? candidate.factProbabilities[factId] ?? 0
          : 0));
        const tieBreak = unitHash(`${fingerprint}|${candidate.id}|fate|${clause.id}`);
        return { clause, support, score: support * 0.85 + tieBreak * 0.15 };
      })
      .filter((item) => item.support >= 0.72)
      .sort((left, right) => right.score - left.score || left.clause.id.localeCompare(right.clause.id));

    const chosen: typeof eligibleFate = [];
    for (const category of ["命局", "运限"]) {
      chosen.push(...eligibleFate.filter((item) => item.clause.category === category).slice(0, 24));
    }
    if (chosen.length < 40) {
      const selected = new Set(chosen.map((item) => item.clause.id));
      chosen.push(
        ...eligibleFate
          .filter((item) => !selected.has(item.clause.id))
          .slice(0, 40 - chosen.length)
      );
    }
    candidate.fateClauseIds = chosen.map((item) => item.clause.id).sort();
    candidate.fateClauseCountByCategory = Object.fromEntries(
      ["命局", "运限"].map((category) => [
        category,
        chosen.filter((item) => item.clause.category === category).length
      ])
    );
    candidate.signature = digestList([...candidate.coreFactIds, ...candidate.fateClauseIds]);
  }
}

interface ClauseMappingBuildInput {
  candidates: CandidateCodebookProfile[];
  calibrationClauses: CodebookCalibrationClauseInput[];
  fingerprint: string;
  corpusVersion: string;
}

function buildClauseMappings({
  candidates,
  calibrationClauses,
  fingerprint,
  corpusVersion
}: ClauseMappingBuildInput): CandidateClauseMapping[] {
  return calibrationClauses.map((clause) => {
    const candidatePYes: Record<string, number> = {};
    let yesCandidateCount = 0;
    for (const candidate of candidates) {
      const factProbability = candidate.factProbabilities[clause.primaryFactId];
      if (factProbability === undefined) {
        throw new Error(`${clause.id}缺少候选事实概率：${clause.primaryFactId}`);
      }
      const jitter = (
        unitHash(`${fingerprint}|${corpusVersion}|mapping|${clause.id}|${candidate.id}`) - 0.5
      ) * 0.04;
      const pYes = round(clamp(factProbability + jitter, 0.01, 0.99));
      candidatePYes[candidate.id] = pYes;
      if (pYes >= 0.5) yesCandidateCount += 1;
    }
    const splitRatio = yesCandidateCount / candidates.length;
    return {
      clauseId: clause.id,
      displayNumber: clause.displayNumber,
      primaryFactId: clause.primaryFactId,
      category: clause.category,
      candidatePYes,
      yesCandidateCount,
      noCandidateCount: candidates.length - yesCandidateCount,
      splitRatio: round(splitRatio),
      binaryEntropy: round(binaryEntropy(splitRatio)),
      mappingDigest: digestList(
        Object.entries(candidatePYes).map(([id, probability]) => `${id}:${probability}`)
      )
    };
  });
}

export function buildCandidateCodebook({
  birthSeed,
  corpusVersion,
  facts,
  calibrationClauses,
  fateClauses,
  constraints
}: CandidateCodebookInput): CandidateCodebook {
  const normalizedBirthSeed = normalizeBirthSeed(birthSeed);
  const fingerprint = birthSeedFingerprint(normalizedBirthSeed);
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const exclusiveFactIds = new Set(constraints.flatMap((constraint) => constraint.factIds));
  const baseFacts = facts.filter((fact) => !exclusiveFactIds.has(fact.id));

  const priorRaw = Array.from(
    { length: CANDIDATE_COUNT },
    (_, index) => 0.5 + unitHash(`${fingerprint}|${corpusVersion}|prior|${candidateId(index)}`) * 1.5
  );
  const priorTotal = priorRaw.reduce((sum, value) => sum + value, 0);
  const candidates: CandidateCodebookProfile[] = Array.from(
    { length: CANDIDATE_COUNT },
    (_, index) => ({
      id: candidateId(index),
      minuteOffset: index,
      prior: round(priorRaw[index] / priorTotal, 12),
      factProbabilities: {},
      exclusiveSelections: {},
      coreFactIds: [],
      coreFactsByDomain: {},
      fateClauseIds: [],
      fateClauseCountByCategory: {},
      signature: ""
    })
  );
  const priorRoundingDelta = 1 - candidates.reduce((sum, candidate) => sum + candidate.prior, 0);
  candidates[0].prior = round(candidates[0].prior + priorRoundingDelta, 12);

  buildBaseFactProbabilities({ candidates, baseFacts, fingerprint, corpusVersion });
  buildExclusiveProbabilities({ candidates, constraints, factById, fingerprint, corpusVersion });
  applyCrossAxisConsistency(candidates, constraints, fingerprint);
  attachCandidateSummaries({ candidates, facts, fateClauses, fingerprint });
  const clauseMappings = buildClauseMappings({
    candidates,
    calibrationClauses,
    fingerprint,
    corpusVersion
  });

  const contentDigest = digestList([
    ...facts.map((item) => `${item.id}:${item.predicate}:${JSON.stringify({
      requiredContexts: item.applicability?.requiredContexts ?? [],
      excludedContexts: item.applicability?.excludedContexts ?? []
    })}`),
    ...calibrationClauses.map((item) => `${item.id}:${item.displayNumber}:${item.primaryFactId}`),
    ...fateClauses.map((item) => `${item.id}:${item.displayNumber}:${item.primaryFactId}`),
    ...constraints.map((item) => `${item.id}:${item.factIds.join(",")}`)
  ]);

  return {
    schemaVersion: "4.0.0",
    corpusVersion,
    birthSeed: normalizedBirthSeed,
    birthSeedFieldsUsed: ["birthDate", "shichen", "gender", "birthplace"],
    seedFingerprint: fingerprint,
    contentDigest,
    replayKey: `${corpusVersion}:${fingerprint}:${contentDigest}`,
    generatedBeforeAnswers: true,
    answerHistoryUsed: false,
    candidateCount: candidates.length,
    factCount: facts.length,
    calibrationClauseCount: calibrationClauses.length,
    fateClauseCount: fateClauses.length,
    mutualExclusionGroupCount: constraints.length,
    candidates,
    clauseMappings
  };
}
