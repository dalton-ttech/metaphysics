import { V4_CONFIG } from "../config/experiment-config.mjs";
import { FACT_CATALOG } from "../domain/fact-catalog.mjs";
import { createDeterministicRandom, fnv1a32, mix32, unitFromIntegers } from "../lib/deterministic.mjs";

const DOMAINS = [...new Set(FACT_CATALOG.map((fact) => fact.domain))];

function between(random, minimum, maximum) {
  return minimum + random() * (maximum - minimum);
}

function buildPersona(index) {
  const random = createDeterministicRandom(`sealed-tieban-v4/persona/${index}`);
  const strategy = index < 500 ? "literal" : index < 1000 ? "cautious" : "conflicted";
  const ranges = {
    literal: { flip: [0.006, 0.022], unknown: [0.01, 0.035], memory: [0.93, 0.995], comprehension: [0.94, 0.995] },
    cautious: { flip: [0.012, 0.04], unknown: [0.09, 0.19], memory: [0.82, 0.95], comprehension: [0.86, 0.97] },
    conflicted: { flip: [0.075, 0.145], unknown: [0.045, 0.12], memory: [0.68, 0.88], comprehension: [0.72, 0.92] }
  }[strategy];
  const domainModifiers = Object.fromEntries(DOMAINS.map((domain) => [domain, Number(between(random, 0.82, 1.20).toFixed(4))]));
  return Object.freeze({
    id: `P4-${String(index + 1).padStart(4, "0")}`,
    index,
    strategy,
    responseSeed: mix32(fnv1a32(`persona-response/${index}`)),
    flipRate: Number(between(random, ...ranges.flip).toFixed(4)),
    unknownRate: Number(between(random, ...ranges.unknown).toFixed(4)),
    memoryStability: Number(between(random, ...ranges.memory).toFixed(4)),
    comprehension: Number(between(random, ...ranges.comprehension).toFixed(4)),
    domainModifiers,
    stableConflictDomain: strategy === "conflicted" ? DOMAINS[Math.floor(random() * DOMAINS.length)] : null
  });
}

export function buildPersonaConfigs(count = V4_CONFIG.personaCount) {
  if (count !== V4_CONFIG.personaCount) throw new Error(`V4 requires exactly ${V4_CONFIG.personaCount} reusable personas.`);
  return Object.freeze(Array.from({ length: count }, (_, index) => buildPersona(index)));
}

export function simulatePersonaAnswer({ persona, subjectSeed, fact, truth, turn, extreme = false }) {
  const domainFactor = persona.domainModifiers[fact.domain] ?? 1;
  const sensitivityFactor = fact.sensitivity === "intense" ? 1.16 : fact.sensitivity === "private" ? 1.08 : 1;
  const comprehensionPenalty = (1 - persona.comprehension) * 0.25;
  const memoryPenalty = (1 - persona.memoryStability) * 0.18;
  const unknownRate = Math.min(0.42, persona.unknownRate * domainFactor * sensitivityFactor + memoryPenalty);
  let flipRate = Math.min(0.38, persona.flipRate * domainFactor + comprehensionPenalty);
  const stableDomainConflict = persona.strategy === "conflicted" && persona.stableConflictDomain === fact.domain;
  if (stableDomainConflict) flipRate = Math.min(0.48, flipRate + 0.16);
  if (extreme) flipRate = Math.min(0.49, flipRate + 0.04);

  const unknownDraw = unitFromIntegers(persona.responseSeed, subjectSeed, fact.index, turn, 0x51f15e);
  if (unknownDraw < unknownRate) return "未明";
  const flipDraw = unitFromIntegers(persona.responseSeed, subjectSeed, fact.index, turn, 0x9e3779);
  const observedTruth = flipDraw < flipRate ? !truth : truth;
  return observedTruth ? "应" : "不应";
}
