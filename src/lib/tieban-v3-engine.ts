import type { EventDomain } from "@/lib/types";
import type {
  AtomicFact,
  CandidateRanking,
  CandidateState,
  TiebanAnswer,
  TiebanClause,
  TiebanIntake,
  TiebanPhase,
  TiebanSession
} from "@/lib/tieban-v3-types";

export const TIEBAN_CANDIDATE_COUNT = 120;
export const TIEBAN_MIN_TURNS = 12;
export const TIEBAN_TARGET_TURNS = 18;
export const TIEBAN_MAX_TURNS = 26;
export const TIEBAN_MIN_CONFIRMED_FACTS = 6;

const TOP_ONE_STOP = 0.9;
const TOP_THREE_STOP = 0.97;
const MIN_MARGIN_STOP = 0.35;

function clamp(value: number, min = 0.001, max = 0.999) {
  return Math.min(max, Math.max(min, value));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function parity(value: number) {
  let current = value >>> 0;
  let bit = 0;
  while (current) {
    bit ^= current & 1;
    current >>>= 1;
  }
  return bit === 1;
}

export function candidateClauseSignal(candidateIndex: number, clauseId: string) {
  const mask = (stableHash(`tieban-v3:${clauseId}`) % 127) + 1;
  const shifted = ((candidateIndex + 1) * 73) & 127;
  return parity(shifted & mask);
}

function shichenStartMinutes(shichen: number) {
  const normalized = ((shichen % 12) + 12) % 12;
  return ((normalized * 2 + 23) % 24) * 60;
}

function formatClock(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function buildCandidateStates(birthShichen: number): CandidateState[] {
  const start = shichenStartMinutes(birthShichen);
  return Array.from({ length: TIEBAN_CANDIDATE_COUNT }, (_, index) => ({
    id: `刻-${String(index + 1).padStart(3, "0")}`,
    index,
    minuteOffset: index,
    clockTime: formatClock(start + index),
    keIndex: Math.floor(index / 15) + 1,
    minuteWithinKe: index % 15
  }));
}

function ageFromBirthDate(birthDate: string) {
  const born = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return 30;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday = now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

function initialFactProbability(fact: AtomicFact, intake: TiebanIntake) {
  const age = ageFromBirthDate(intake.birthDate);
  if (age < fact.earliestAge) return 0.01;
  if (fact.latestAge !== null && fact.earliestAge > age) return 0.01;
  const exposure = Math.min(1.35, 0.72 + Math.log2(Math.max(2, age - fact.earliestAge + 2)) / 8);
  return clamp(fact.baseRate * exposure, 0.015, 0.78);
}

function normalizeLogWeights(logWeights: number[]) {
  const max = Math.max(...logWeights);
  const raw = logWeights.map((weight) => Math.exp(weight - max));
  const total = raw.reduce((sum, weight) => sum + weight, 0) || 1;
  return raw.map((weight) => weight / total);
}

function entropy(distribution: number[]) {
  return distribution.reduce((sum, probability) => {
    if (probability <= 0) return sum;
    return sum - probability * Math.log2(probability);
  }, 0);
}

function binaryEntropy(probability: number) {
  const p = clamp(probability);
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

export function rankCandidates(session: TiebanSession): CandidateRanking[] {
  const probabilities = normalizeLogWeights(session.candidateLogWeights);
  return session.candidates
    .map((candidate, index) => ({ candidate, probability: probabilities[index] }))
    .sort((a, b) => b.probability - a.probability || a.candidate.index - b.candidate.index);
}

function answerLikelihood(signal: boolean, clause: TiebanClause, answer: Exclude<TiebanAnswer, "unclear">) {
  const yesProbability = signal ? clause.sensitivity : 1 - clause.specificity;
  return clamp(answer === "resonates" ? yesProbability : 1 - yesProbability, 0.0001, 0.9999);
}

function factPosterior(prior: number, clause: TiebanClause, answer: Exclude<TiebanAnswer, "unclear">) {
  const trueLikelihood = answer === "resonates" ? clause.sensitivity : 1 - clause.sensitivity;
  const falseLikelihood = answer === "resonates" ? 1 - clause.specificity : clause.specificity;
  const denominator = prior * trueLikelihood + (1 - prior) * falseLikelihood;
  return denominator <= 0 ? prior : clamp((prior * trueLikelihood) / denominator);
}

function expectedCandidateInformation(session: TiebanSession, clause: TiebanClause) {
  const distribution = normalizeLogWeights(session.candidateLogWeights);
  const priorEntropy = entropy(distribution);
  const yesMass = distribution.reduce((sum, probability, index) => {
    const signal = candidateClauseSignal(index, clause.id);
    return sum + probability * (signal ? clause.sensitivity : 1 - clause.specificity);
  }, 0);
  const posteriorEntropy = (answer: "resonates" | "not_resonates") => {
    const likelihoods = distribution.map((_, index) => answerLikelihood(candidateClauseSignal(index, clause.id), clause, answer));
    const total = distribution.reduce((sum, probability, index) => sum + probability * likelihoods[index], 0) || 1;
    return entropy(distribution.map((probability, index) => probability * likelihoods[index] / total));
  };
  return priorEntropy - yesMass * posteriorEntropy("resonates") - (1 - yesMass) * posteriorEntropy("not_resonates");
}

function expectedFactInformation(probability: number, clause: TiebanClause) {
  const prior = clamp(probability);
  const yesProbability = prior * clause.sensitivity + (1 - prior) * (1 - clause.specificity);
  const posteriorYes = clamp(prior * clause.sensitivity / Math.max(yesProbability, 0.0001));
  const posteriorNo = clamp(prior * (1 - clause.sensitivity) / Math.max(1 - yesProbability, 0.0001));
  return binaryEntropy(prior) - yesProbability * binaryEntropy(posteriorYes) - (1 - yesProbability) * binaryEntropy(posteriorNo);
}

function phaseFor(answerCount: number, completed: boolean): TiebanPhase {
  if (completed) return "locked";
  if (answerCount < 4) return "initial";
  if (answerCount < 12) return "recalculate";
  return "narrowing";
}

function confirmedFactCount(session: TiebanSession, clauses: TiebanClause[]) {
  const clauseById = new Map(clauses.map((clause) => [clause.id, clause]));
  return new Set(
    session.answers
      .filter((record) => record.answer === "resonates")
      .map((record) => clauseById.get(record.clauseId)?.primaryFactId)
      .filter((factId): factId is string => Boolean(factId))
      .map((factId) => factId.replace(/\.\d+$/u, ""))
  ).size;
}

function stopState(session: TiebanSession, clauses: TiebanClause[]) {
  const ranking = rankCandidates(session);
  const topOne = ranking[0]?.probability ?? 0;
  const topTwo = ranking[1]?.probability ?? 0;
  const topThree = ranking.slice(0, 3).reduce((sum, item) => sum + item.probability, 0);
  const margin = topOne - topTwo;
  const enoughAnswers = session.answers.length >= TIEBAN_MIN_TURNS;
  const enoughConfirmedFacts = confirmedFactCount(session, clauses) >= TIEBAN_MIN_CONFIRMED_FACTS;
  const decisive = enoughAnswers && enoughConfirmedFacts && topOne >= TOP_ONE_STOP && topThree >= TOP_THREE_STOP && margin >= MIN_MARGIN_STOP;
  const stable = session.answers.length >= TIEBAN_TARGET_TURNS && enoughConfirmedFacts && topOne >= 0.78 && topThree >= 0.94 && margin >= 0.18;
  const exhausted = session.answers.length >= TIEBAN_MAX_TURNS;
  return { ranking, decisive, stable, exhausted, shouldStop: decisive || stable || exhausted };
}

function eligibleClauses(session: TiebanSession, clauses: TiebanClause[], facts: AtomicFact[]) {
  const age = ageFromBirthDate(session.intake.birthDate);
  const factById = Object.fromEntries(facts.map((fact) => [fact.id, fact]));
  const clauseById = new Map(clauses.map((clause) => [clause.id, clause]));
  const confirmedFamilies = new Set(session.answers
    .filter((record) => record.answer === "resonates")
    .map((record) => clauseById.get(record.clauseId)?.primaryFactId.replace(/\.\d+$/u, ""))
    .filter((familyId): familyId is string => Boolean(familyId)));
  return clauses.filter((clause) => {
    if (clause.kind !== "calibration" || session.askedClauseIds.includes(clause.id)) return false;
    const fact = factById[clause.primaryFactId];
    if (!fact || age < fact.earliestAge) return false;
    if (confirmedFamilies.has(fact.id.replace(/\.\d+$/u, ""))) return false;
    return (session.factEvidence[fact.id] ?? 0) < 2;
  });
}

export function selectNextClause(session: TiebanSession, clauses: TiebanClause[], facts: AtomicFact[]) {
  const factById = Object.fromEntries(facts.map((fact) => [fact.id, fact]));
  const candidates = eligibleClauses(session, clauses, facts).map((clause) => {
    const fact = factById[clause.primaryFactId];
    const candidateGain = expectedCandidateInformation(session, clause);
    const factGain = expectedFactInformation(session.factProbabilities[fact.id] ?? fact.baseRate, clause);
    const uncovered = (session.domainCoverage[fact.domain] ?? 0) === 0 ? 1 : 0;
    const ambiguityPenalty = clause.ambiguity * 0.16;
    const utility = candidateGain * 0.58 + factGain * 0.24 + uncovered * 0.1 + fact.salience / 5 * 0.08 - ambiguityPenalty;
    return { clause, utility, candidateGain, factGain };
  });
  return candidates.sort((a, b) =>
    b.utility - a.utility || b.candidateGain - a.candidateGain || b.factGain - a.factGain || a.clause.id.localeCompare(b.clause.id)
  )[0]?.clause ?? null;
}

export function createTiebanSession(
  intake: TiebanIntake,
  clauses: TiebanClause[],
  facts: AtomicFact[],
  now = Date.now()
): TiebanSession {
  const candidates = buildCandidateStates(intake.birthShichen);
  const session: TiebanSession = {
    version: "3.0.0",
    intake,
    candidates,
    candidateLogWeights: candidates.map(() => 0),
    factProbabilities: Object.fromEntries(facts.map((fact) => [fact.id, initialFactProbability(fact, intake)])),
    factEvidence: Object.fromEntries(facts.map((fact) => [fact.id, 0])),
    domainCoverage: {},
    answers: [],
    askedClauseIds: [],
    currentClauseId: null,
    phase: "initial",
    createdAt: now,
    completedAt: null,
    lockedCandidateId: null,
    lockStrength: null
  };
  const first = selectNextClause(session, clauses, facts);
  session.currentClauseId = first?.id ?? null;
  if (first) session.askedClauseIds.push(first.id);
  return session;
}

export function answerTiebanClause(
  session: TiebanSession,
  answer: TiebanAnswer,
  clauses: TiebanClause[],
  facts: AtomicFact[],
  now = Date.now()
): TiebanSession {
  if (!session.currentClauseId || session.completedAt) return session;
  const clause = clauses.find((item) => item.id === session.currentClauseId);
  const fact = clause ? facts.find((item) => item.id === clause.primaryFactId) : null;
  if (!clause || !fact) return session;

  const beforeRanking = rankCandidates(session);
  const beforeFact = session.factProbabilities[fact.id] ?? fact.baseRate;
  let candidateLogWeights = [...session.candidateLogWeights];
  let factProbabilities = { ...session.factProbabilities };
  const factEvidence = { ...session.factEvidence };
  const domainCoverage = { ...session.domainCoverage };

  if (answer !== "unclear") {
    candidateLogWeights = candidateLogWeights.map((weight, index) =>
      weight + Math.log(answerLikelihood(candidateClauseSignal(index, clause.id), clause, answer))
    );
    const posterior = factPosterior(beforeFact, clause, answer);
    // 条文只问一个可核对事实；用户明确作答本身就是该事实的直接证据。
    // 候选刻分仍按噪声似然更新，但画像层将“应/不应”锚定为高置信确认，
    // 避免低基础率把用户刚刚确认的事实重新稀释掉。
    factProbabilities[fact.id] = answer === "resonates"
      ? Math.max(0.94, posterior)
      : Math.min(0.06, posterior);
    factEvidence[fact.id] = (factEvidence[fact.id] ?? 0) + 1;
    domainCoverage[fact.domain] = (domainCoverage[fact.domain] ?? 0) + 1;
  }

  const provisional: TiebanSession = {
    ...session,
    candidateLogWeights,
    factProbabilities,
    factEvidence,
    domainCoverage,
    currentClauseId: null
  };
  const afterRanking = rankCandidates(provisional);
  provisional.answers = [...session.answers, {
    clauseId: clause.id,
    answer,
    answeredAt: now,
    topCandidateBefore: beforeRanking[0]?.candidate.id ?? "",
    topCandidateAfter: afterRanking[0]?.candidate.id ?? "",
    topProbabilityAfter: afterRanking[0]?.probability ?? 0,
    factProbabilityBefore: beforeFact,
    factProbabilityAfter: factProbabilities[fact.id]
  }];

  const stopping = stopState(provisional, clauses);
  if (stopping.shouldStop) {
    const lockStrength = stopping.decisive ? "decisive" : stopping.stable ? "stable" : "best_fit";
    return {
      ...provisional,
      phase: "locked",
      completedAt: now,
      lockedCandidateId: stopping.ranking[0]?.candidate.id ?? null,
      lockStrength
    };
  }

  const following = selectNextClause(provisional, clauses, facts);
  const completed = !following;
  return {
    ...provisional,
    currentClauseId: following?.id ?? null,
    askedClauseIds: following ? [...provisional.askedClauseIds, following.id] : provisional.askedClauseIds,
    phase: phaseFor(provisional.answers.length, completed),
    completedAt: completed ? now : null,
    lockedCandidateId: completed ? stopping.ranking[0]?.candidate.id ?? null : null,
    lockStrength: completed ? "best_fit" : null
  };
}

export function getLockedCandidate(session: TiebanSession) {
  const id = session.lockedCandidateId ?? rankCandidates(session)[0]?.candidate.id;
  return session.candidates.find((candidate) => candidate.id === id) ?? session.candidates[0];
}

export function getRitualPhaseLabel(phase: TiebanPhase) {
  if (phase === "initial") return "初起";
  if (phase === "recalculate") return "复算";
  if (phase === "narrowing") return "刻渐明";
  return "刻成";
}

export function coveredDomains(session: TiebanSession): EventDomain[] {
  return Object.entries(session.domainCoverage)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([domain]) => domain as EventDomain);
}
