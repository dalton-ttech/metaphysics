import type { EventDomain } from "@/lib/types";
import { birthSeedFingerprint, buildCandidateCodebook, stableHash32 } from "@/lib/tieban-v4-codebook";
import type {
  AtomicFact,
  BirthSeed,
  CandidateProfile,
  CandidateRankingV4,
  CandidateState,
  TiebanAnswer,
  TiebanClause,
  TiebanFactApplicabilityResult,
  TiebanIntake,
  TiebanMutualExclusionConstraint,
  TiebanV4Phase,
  TiebanV4Session
} from "@/lib/tieban-v4-types";

export const TIEBAN_V4_CANDIDATE_COUNT = 120;
export const TIEBAN_V4_MIN_TURNS = 14;
export const TIEBAN_V4_TARGET_TURNS = 18;
export const TIEBAN_V4_MAX_TURNS = 24;
export const TIEBAN_V4_CORPUS_VERSION = "2026.07.22-v4.2.1";

const CODEBOOK_SHICHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

const TOP_ONE_DECISIVE = 0.88;
const TOP_BUCKET_DECISIVE = 0.96;
const MARGIN_DECISIVE = 0.28;
const TOP_ONE_STABLE = 0.72;
const TOP_BUCKET_STABLE = 0.9;
const MARGIN_STABLE = 0.14;

function clamp(value: number, min = 0.001, max = 0.999) {
  return Math.min(max, Math.max(min, value));
}

export function stableHashV4(value: string) {
  return stableHash32(value);
}

function hashUnit(value: string) {
  return stableHashV4(value) / 0xffffffff;
}

function codebookBirthSeedInput(intake: TiebanIntake) {
  return {
    birthDate: intake.birthDate,
    shichen: CODEBOOK_SHICHEN[((intake.birthShichen % 12) + 12) % 12],
    gender: intake.gender === "male" ? "乾" : intake.gender === "female" ? "坤" : "未说明",
    birthplace: intake.birthplace.normalize("NFKC").trim().replace(/\s+/gu, " ") || "未录"
  };
}

export function buildBirthSeed(intake: TiebanIntake): BirthSeed {
  const input = codebookBirthSeedInput(intake);
  const normalized = `${input.birthDate}|${input.shichen}|${input.gender}|${input.birthplace.toLocaleLowerCase("zh-CN")}`;
  const digest = birthSeedFingerprint(input);
  const year = Number(intake.birthDate.slice(0, 4)) || 1990;
  return {
    normalized,
    digest,
    cohortKey: `${Math.floor(year / 10) * 10}-${input.gender}-${stableHashV4(input.birthplace).toString(36).slice(0, 3)}`,
    ritualBase: 10000 + stableHash32(`ritual:${digest}`) % 2000,
    replayKey: `${TIEBAN_V4_CORPUS_VERSION}:${digest}`,
    contentDigest: ""
  };
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

export function buildCandidateStatesV4(birthShichen: number): CandidateState[] {
  const start = shichenStartMinutes(birthShichen);
  return Array.from({ length: TIEBAN_V4_CANDIDATE_COUNT }, (_, index) => ({
    id: `C${String(index + 1).padStart(3, "0")}`,
    index,
    minuteOffset: index,
    clockTime: formatClock(start + index),
    keIndex: Math.floor(index / 15) + 1,
    minuteWithinKe: index % 15
  }));
}

export function ageAtV4(birthDate: string, timestamp = Date.now()) {
  const born = new Date(`${birthDate}T00:00:00`);
  const now = new Date(timestamp);
  if (Number.isNaN(born.getTime())) return 30;
  let age = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age -= 1;
  return Math.max(0, age);
}

function factIsAgeEligible(fact: AtomicFact, age: number) {
  return age >= (fact.minCurrentAge ?? fact.earliestAge);
}

function directFactAnswerV4(session: TiebanV4Session, factId: string): boolean | null {
  for (let index = session.answers.length - 1; index >= 0; index -= 1) {
    const record = session.answers[index];
    if (record.factId !== factId || record.answer === "unclear") continue;
    return record.answer === "resonates";
  }
  return null;
}

export function resolvedExclusiveGroupV4(
  session: TiebanV4Session,
  facts: AtomicFact[],
  groupId: string
): string | null {
  const groupFacts = facts.filter((fact) => fact.mutualExclusionGroup === groupId);
  if (!groupFacts.length) return null;
  const affirmed = groupFacts.filter((fact) => directFactAnswerV4(session, fact.id) === true);
  if (affirmed.length === 1) return affirmed[0].id;
  if (affirmed.length > 1) return null;
  const rejected = new Set(groupFacts.filter((fact) => directFactAnswerV4(session, fact.id) === false).map((fact) => fact.id));
  const remaining = groupFacts.filter((fact) => !rejected.has(fact.id));
  return remaining.length === 1 ? remaining[0].id : null;
}

export function factApplicabilityV4(
  session: TiebanV4Session,
  fact: AtomicFact,
  facts: AtomicFact[],
  age = ageAtV4(session.intake.birthDate, session.createdAt),
  forQuestionSelection = true
): TiebanFactApplicabilityResult {
  if (!factIsAgeEligible(fact, age)) return { status: "not_applicable", reason: "age" };

  if (forQuestionSelection && fact.applicability?.questionMode === "derived") {
    return { status: "not_applicable", reason: "derived_fact" };
  }

  if (forQuestionSelection && fact.mutualExclusionGroup) {
    const resolved = resolvedExclusiveGroupV4(session, facts, fact.mutualExclusionGroup);
    if (resolved) {
      return {
        status: "not_applicable",
        reason: "resolved_group",
        contextGroupId: fact.mutualExclusionGroup,
        resolvedFactId: resolved
      };
    }
  }

  for (const requirement of fact.applicability?.requiredContexts ?? []) {
    const resolved = resolvedExclusiveGroupV4(session, facts, requirement.groupId);
    if (!resolved) {
      return {
        status: "deferred",
        reason: "required_context_unresolved",
        contextGroupId: requirement.groupId,
        resolvedFactId: null
      };
    }
    if (!requirement.allowedFactIds.includes(resolved)) {
      return {
        status: "not_applicable",
        reason: "required_context_mismatch",
        contextGroupId: requirement.groupId,
        resolvedFactId: resolved
      };
    }
  }

  for (const exclusion of fact.applicability?.excludedContexts ?? []) {
    const resolved = resolvedExclusiveGroupV4(session, facts, exclusion.groupId);
    if (resolved && exclusion.allowedFactIds.includes(resolved)) {
      return {
        status: "not_applicable",
        reason: "excluded_context",
        contextGroupId: exclusion.groupId,
        resolvedFactId: resolved
      };
    }
  }
  return { status: "eligible", reason: "eligible" };
}

export function evidenceWeightV4(
  session: TiebanV4Session,
  fact: AtomicFact,
  answer: TiebanAnswer,
  facts: AtomicFact[]
) {
  if (answer === "unclear") return 0;
  const policy = fact.evidencePolicy;
  let weight = answer === "resonates"
    ? policy?.resonatesWeight ?? 1
    : policy?.notResonatesWeight ?? 1;
  if (answer === "resonates" && policy?.resonatesContextGroupId && policy.resonatesWeightByFactId) {
    const contextFactId = resolvedExclusiveGroupV4(session, facts, policy.resonatesContextGroupId);
    if (contextFactId) weight *= policy.resonatesWeightByFactId[contextFactId] ?? 1;
  }
  return Math.min(1, Math.max(0, weight));
}

/**
 * A candidate profile is fixed before any answers are observed. The full birth
 * seed permutes the codebook; the candidate minute selects one row from it.
 */
export function candidateFactSignal(seed: BirthSeed, candidateIndex: number, factId: string) {
  return stableHash32(`${seed.digest}|${candidateIndex}|${factId}`) % 2 === 1;
}

function normalizePositive(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => value / total);
}

export function buildCandidateProfiles(
  intake: TiebanIntake,
  facts: AtomicFact[],
  fateClauses: TiebanClause[] = [],
  timestamp = Date.now(),
  constraints: TiebanMutualExclusionConstraint[] = [],
  calibrationClauses: TiebanClause[] = []
): { birthSeed: BirthSeed; candidates: CandidateState[]; profiles: CandidateProfile[] } {
  const codebook = buildCandidateCodebook({
    birthSeed: codebookBirthSeedInput(intake),
    corpusVersion: TIEBAN_V4_CORPUS_VERSION,
    facts: facts.map((fact) => ({
      id: fact.id,
      predicate: fact.definition.replace(/^.*?，/u, "").replace(/[。！？]+$/u, ""),
      domain: fact.domain,
      applicability: fact.applicability
    })),
    calibrationClauses: calibrationClauses.map((clause) => ({
      id: clause.id,
      displayNumber: clause.displayCode,
      primaryFactId: clause.primaryFactId,
      category: clause.category ?? "定分"
    })),
    fateClauses: fateClauses.map((clause) => ({
      id: clause.id,
      displayNumber: clause.displayCode,
      primaryFactId: clause.primaryFactId,
      category: clause.category ?? (clause.kind === "future" ? "运限" : "命局"),
      conditionFactIds: clause.conditionFactIds
    })),
    constraints
  });
  const initialSeed = buildBirthSeed(intake);
  const birthSeed: BirthSeed = {
    ...initialSeed,
    digest: codebook.seedFingerprint,
    replayKey: codebook.replayKey,
    contentDigest: codebook.contentDigest
  };
  const candidates = buildCandidateStatesV4(intake.birthShichen);
  const profiles = candidates.map((candidate, index): CandidateProfile => {
    const source = codebook.candidates[index];
    const factProbabilities = facts.map((fact) => source.factProbabilities[fact.id] ?? 0.01);
    const profileNumber = 10000 + stableHash32(`profile:${birthSeed.digest}:${candidate.index}`) % 2000;
    return {
      ...candidate,
      profileCode: `${birthSeed.digest.slice(0, 4).toUpperCase()}-${String(profileNumber)}-${String(candidate.index + 1).padStart(3, "0")}`,
      signature: source.signature,
      priorProbability: source.prior,
      ritualBase: profileNumber,
      factProbabilities,
      coreFactIds: [...source.coreFactIds],
      fateClauseIds: [...source.fateClauseIds]
    };
  });
  return { birthSeed, candidates, profiles };
}

function normalizeLogWeights(logWeights: number[]) {
  const max = Math.max(...logWeights);
  const raw = logWeights.map((weight) => Math.exp(weight - max));
  return normalizePositive(raw);
}

export function rankCandidatesV4(session: TiebanV4Session): CandidateRankingV4[] {
  const probabilities = normalizeLogWeights(session.candidateLogWeights);
  return session.candidates
    .map((candidate, index) => ({ candidate, profile: session.profiles[index], probability: probabilities[index] }))
    .sort((a, b) => b.probability - a.probability || a.candidate.index - b.candidate.index);
}

export function fourMinuteBucketProbability(session: TiebanV4Session, candidateIndex: number) {
  const probabilities = normalizeLogWeights(session.candidateLogWeights);
  const bucket = Math.floor(candidateIndex / 4);
  return probabilities.reduce((sum, probability, index) => sum + (Math.floor(index / 4) === bucket ? probability : 0), 0);
}

function entropy(distribution: number[]) {
  return distribution.reduce((sum, probability) => probability > 0 ? sum - probability * Math.log2(probability) : sum, 0);
}

function clauseYesProbability(seed: BirthSeed, profile: CandidateProfile, factIndex: number, clause: TiebanClause) {
  const factProbability = profile.factProbabilities[factIndex] ?? 0.01;
  const jitter = (hashUnit(`${seed.digest}|${TIEBAN_V4_CORPUS_VERSION}|mapping|${clause.id}|${profile.id}`) - 0.5) * 0.04;
  return clamp(factProbability + jitter, 0.01, 0.99);
}

function answerLikelihood(seed: BirthSeed, profile: CandidateProfile, factIndex: number, clause: TiebanClause, answer: Exclude<TiebanAnswer, "unclear">) {
  const yesProbability = clauseYesProbability(seed, profile, factIndex, clause);
  return answer === "resonates" ? yesProbability : 1 - yesProbability;
}

function expectedInformation(session: TiebanV4Session, clause: TiebanClause, factIndex: number) {
  const distribution = normalizeLogWeights(session.candidateLogWeights);
  const priorEntropy = entropy(distribution);
  const yesLikelihoods = session.profiles.map((profile) => clauseYesProbability(session.birthSeed, profile, factIndex, clause));
  const yesMass = distribution.reduce((sum, probability, index) => sum + probability * yesLikelihoods[index], 0);
  const posteriorEntropy = (yes: boolean) => {
    const likelihoods = yesLikelihoods.map((value) => yes ? value : 1 - value);
    const total = distribution.reduce((sum, probability, index) => sum + probability * likelihoods[index], 0) || 1;
    return entropy(distribution.map((probability, index) => probability * likelihoods[index] / total));
  };
  return priorEntropy - yesMass * posteriorEntropy(true) - (1 - yesMass) * posteriorEntropy(false);
}

function phaseFor(answerCount: number): TiebanV4Phase {
  if (answerCount < 4) return "initial";
  if (answerCount < 9) return "recalculate";
  if (answerCount < 13) return "narrowing";
  return "verification";
}

function repeatedDomainPenalty(session: TiebanV4Session, domain: EventDomain) {
  const recent = session.answers.slice(-3).filter((answer) => answer.answer !== "unclear" && (answer.evidenceWeight ?? 1) > 0);
  return recent.reduce((penalty, answer) => {
    const covered = session.domainCoverage[domain] ?? 0;
    return penalty + (covered > 0 && answer.factId ? 0.012 : 0);
  }, 0);
}

export function selectNextClauseV4(
  session: TiebanV4Session,
  clauses: TiebanClause[],
  facts: AtomicFact[]
): { clause: TiebanClause; testedCandidateId: string } | null {
  const age = ageAtV4(session.intake.birthDate, session.createdAt);
  const factIndexById = new Map(facts.map((fact, index) => [fact.id, index]));
  const ranking = rankCandidatesV4(session);
  const tested = ranking[0];
  if (!tested) return null;
  const eligible = clauses.filter((clause) => {
    if (clause.kind !== "calibration" || session.askedClauseIds.includes(clause.id)) return false;
    const factIndex = factIndexById.get(clause.primaryFactId);
    return factIndex !== undefined && factApplicabilityV4(session, facts[factIndex], facts, age).status === "eligible";
  });
  if (!eligible.length) return null;
  const clearAnswers = session.answers.filter((record) => record.answer !== "unclear" && (record.evidenceWeight ?? 1) >= 0.5);
  const positiveCount = clearAnswers.filter((record) => record.answer === "resonates").length;
  const negativeCount = clearAnswers.filter((record) => record.answer === "not_resonates").length;
  const needOpposingPrediction = positiveCount - negativeCount;
  const scored = eligible.map((clause) => {
    const factIndex = factIndexById.get(clause.primaryFactId)!;
    const fact = facts[factIndex];
    const gain = expectedInformation(session, clause, factIndex);
    const unseenDomain = (session.domainCoverage[fact.domain] ?? 0) === 0 ? 0.055 : 0;
    const topProbability = tested.profile.factProbabilities[factIndex];
    const discriminatingPolarity = Math.abs(topProbability - 0.5) * 0.055;
    const balanceBonus = needOpposingPrediction >= 2 && topProbability < 0.42
      ? 0.09
      : needOpposingPrediction <= -2 && topProbability > 0.58
        ? 0.09
        : 0;
    const verificationBonus = session.phase === "verification" && (topProbability >= 0.78 || topProbability <= 0.22) ? 0.06 : 0;
    const utility = gain + unseenDomain + discriminatingPolarity + balanceBonus + verificationBonus + fact.salience * 0.004 - clause.ambiguity * 0.035 - repeatedDomainPenalty(session, fact.domain);
    return { clause, utility, gain };
  });
  scored.sort((a, b) => b.utility - a.utility || b.gain - a.gain || a.clause.id.localeCompare(b.clause.id));
  return scored[0] ? { clause: scored[0].clause, testedCandidateId: tested.candidate.id } : null;
}

function positiveDomainCount(session: TiebanV4Session) {
  return Object.values(session.positiveDomainCoverage).filter((count) => (count ?? 0) >= 0.5).length;
}

export function responseIntegrityV4(session: TiebanV4Session) {
  const clear = session.answers.filter((record) => record.answer !== "unclear" && (record.evidenceWeight ?? 1) >= 0.5);
  const positive = clear.filter((record) => record.answer === "resonates").length;
  const negative = clear.filter((record) => record.answer === "not_resonates").length;
  let longestRun = 0;
  let currentRun = 0;
  let previous: TiebanAnswer | null = null;
  let alternatingTransitions = 0;
  for (const record of clear) {
    if (previous && record.answer !== previous) alternatingTransitions += 1;
    if (record.answer === previous) currentRun += 1;
    else currentRun = 1;
    previous = record.answer;
    longestRun = Math.max(longestRun, currentRun);
  }
  const distinctFacts = new Set(clear.map((record) => record.factId)).size;
  const balancedEvidence = positive >= 2 && negative >= 2;
  const mechanicalAlternation = clear.length >= 8 && alternatingTransitions === clear.length - 1;
  return {
    clear: clear.length,
    positive,
    negative,
    longestRun,
    distinctFacts,
    balancedEvidence,
    mechanicalAlternation,
    canLock: balancedEvidence && !mechanicalAlternation && longestRun <= 9 && distinctFacts >= 10
  };
}

function stopState(session: TiebanV4Session, verificationMatches: boolean) {
  const ranking = rankCandidatesV4(session);
  const top = ranking[0];
  const second = ranking[1];
  const topProbability = top?.probability ?? 0;
  const margin = topProbability - (second?.probability ?? 0);
  const bucketProbability = top ? fourMinuteBucketProbability(session, top.candidate.index) : 0;
  const clearAnswers = session.answers.filter((answer) => answer.answer !== "unclear" && (answer.evidenceWeight ?? 1) >= 0.5).length;
  const positiveDomains = positiveDomainCount(session);
  const coveredDomains = Object.values(session.domainCoverage).filter((count) => (count ?? 0) >= 0.5).length;
  const integrity = responseIntegrityV4(session);
  const enoughAnswers = session.answers.length >= TIEBAN_V4_MIN_TURNS && clearAnswers >= 11;
  const hasIndependentEvidence = integrity.canLock && coveredDomains >= 4 && verificationMatches;
  const decisive = enoughAnswers && hasIndependentEvidence && positiveDomains >= 2 && topProbability >= TOP_ONE_DECISIVE && bucketProbability >= TOP_BUCKET_DECISIVE && margin >= MARGIN_DECISIVE;
  const stable = session.answers.length >= TIEBAN_V4_TARGET_TURNS && clearAnswers >= 14 && hasIndependentEvidence && positiveDomains >= 2 && topProbability >= TOP_ONE_STABLE && bucketProbability >= TOP_BUCKET_STABLE && margin >= MARGIN_STABLE;
  const exhausted = session.answers.length >= TIEBAN_V4_MAX_TURNS;
  const exhaustivelyStable = exhausted && hasIndependentEvidence && positiveDomains >= 2 && topProbability >= 0.5 && bucketProbability >= 0.72;
  return { ranking, topProbability, bucketProbability, margin, decisive, stable: stable || exhaustivelyStable, exhausted };
}

export function createTiebanSessionV4(
  intake: TiebanIntake,
  clauses: TiebanClause[],
  facts: AtomicFact[],
  fateClauses: TiebanClause[] = [],
  now = Date.now(),
  constraints: TiebanMutualExclusionConstraint[] = []
): TiebanV4Session {
  const model = buildCandidateProfiles(intake, facts, fateClauses, now, constraints, clauses);
  const session: TiebanV4Session = {
    version: "4.0.0",
    intake,
    birthSeed: model.birthSeed,
    candidates: model.candidates,
    profiles: model.profiles,
    candidateLogWeights: model.profiles.map((profile) => Math.log(profile.priorProbability)),
    answers: [],
    askedClauseIds: [],
    currentClauseId: null,
    currentTestedCandidateId: null,
    domainCoverage: {},
    positiveDomainCoverage: {},
    phase: "initial",
    createdAt: now,
    completedAt: null,
    lockedCandidateId: null,
    lockStrength: null,
    undeterminedReason: null
  };
  const first = selectNextClauseV4(session, clauses, facts);
  if (first) {
    session.currentClauseId = first.clause.id;
    session.currentTestedCandidateId = first.testedCandidateId;
    session.askedClauseIds = [first.clause.id];
  } else {
    session.phase = "undetermined";
    session.completedAt = now;
    session.undeterminedReason = "no_age_eligible_clause";
  }
  return session;
}

export function answerTiebanClauseV4(
  session: TiebanV4Session,
  answer: TiebanAnswer,
  clauses: TiebanClause[],
  facts: AtomicFact[],
  now = Date.now()
): TiebanV4Session {
  if (!session.currentClauseId || session.completedAt) return session;
  const clause = clauses.find((item) => item.id === session.currentClauseId);
  const factIndex = clause ? facts.findIndex((item) => item.id === clause.primaryFactId) : -1;
  if (!clause || factIndex < 0) return session;
  const fact = facts[factIndex];
  const evidenceWeight = evidenceWeightV4(session, fact, answer, facts);
  const before = rankCandidatesV4(session);
  const testedProfile = before[0]?.profile;
  const predictedYes = (testedProfile?.factProbabilities[factIndex] ?? 0.5) >= 0.5;
  const verificationMatches = session.phase === "verification"
    && answer !== "unclear"
    && evidenceWeight >= 0.5
    && ((answer === "resonates") === predictedYes);
  let candidateLogWeights = [...session.candidateLogWeights];
  if (answer !== "unclear" && evidenceWeight > 0) {
    candidateLogWeights = candidateLogWeights.map((weight, index) =>
      weight + evidenceWeight * Math.log(answerLikelihood(session.birthSeed, session.profiles[index], factIndex, clause, answer))
    );
  }
  const domainCoverage = { ...session.domainCoverage };
  const positiveDomainCoverage = { ...session.positiveDomainCoverage };
  if (answer !== "unclear" && evidenceWeight > 0) domainCoverage[fact.domain] = (domainCoverage[fact.domain] ?? 0) + evidenceWeight;
  if (answer === "resonates" && evidenceWeight > 0) positiveDomainCoverage[fact.domain] = (positiveDomainCoverage[fact.domain] ?? 0) + evidenceWeight;
  const provisional: TiebanV4Session = {
    ...session,
    candidateLogWeights,
    domainCoverage,
    positiveDomainCoverage,
    currentClauseId: null,
    currentTestedCandidateId: null
  };
  const after = rankCandidatesV4(provisional);
  const top = after[0];
  provisional.answers = [...session.answers, {
    clauseId: clause.id,
    factId: fact.id,
    answer,
    answeredAt: now,
    testedCandidateId: session.currentTestedCandidateId ?? before[0]?.candidate.id ?? "",
    topCandidateBefore: before[0]?.candidate.id ?? "",
    topCandidateAfter: top?.candidate.id ?? "",
    topProbabilityAfter: top?.probability ?? 0,
    fourMinuteProbabilityAfter: top ? fourMinuteBucketProbability(provisional, top.candidate.index) : 0,
    evidenceWeight
  }];
  const stopping = stopState(provisional, verificationMatches);
  if (stopping.decisive || stopping.stable) {
    return {
      ...provisional,
      phase: "locked",
      completedAt: now,
      lockedCandidateId: stopping.ranking[0]?.candidate.id ?? null,
      lockStrength: stopping.decisive ? "decisive" : "stable"
    };
  }
  if (stopping.exhausted) {
    return {
      ...provisional,
      phase: "undetermined",
      completedAt: now,
      undeterminedReason: "posterior_not_converged"
    };
  }
  const next = selectNextClauseV4(provisional, clauses, facts);
  if (!next) {
    return {
      ...provisional,
      phase: "undetermined",
      completedAt: now,
      undeterminedReason: "clause_pool_exhausted"
    };
  }
  return {
    ...provisional,
    currentClauseId: next.clause.id,
    currentTestedCandidateId: next.testedCandidateId,
    askedClauseIds: [...provisional.askedClauseIds, next.clause.id],
    phase: phaseFor(provisional.answers.length)
  };
}

export function getLockedCandidateV4(session: TiebanV4Session) {
  const candidate = session.candidates.find((item) => item.id === session.lockedCandidateId);
  if (!candidate) throw new Error("考刻尚未完成，不能读取定刻结果");
  return candidate;
}

export function getLockedProfileV4(session: TiebanV4Session) {
  const profile = session.profiles.find((item) => item.id === session.lockedCandidateId);
  if (!profile) throw new Error("考刻尚未完成，不能读取命籍");
  return profile;
}

export function posteriorFactProbabilityV4(session: TiebanV4Session, factIndex: number) {
  const distribution = normalizeLogWeights(session.candidateLogWeights);
  return session.profiles.reduce((sum, profile, index) => sum + distribution[index] * (profile.factProbabilities[factIndex] ?? 0), 0);
}
