import type { EventDomain } from "@/lib/types";
import type {
  AtomicFact,
  CandidateState,
  TiebanAnswer,
  TiebanClause,
  TiebanIntake
} from "@/lib/tieban-v3-types";

export type TiebanV4Phase =
  | "initial"
  | "recalculate"
  | "narrowing"
  | "verification"
  | "locked"
  | "undetermined";

export type TiebanV4UndeterminedReason =
  | "no_age_eligible_clause"
  | "posterior_not_converged"
  | "clause_pool_exhausted";

export interface BirthSeed {
  normalized: string;
  digest: string;
  cohortKey: string;
  ritualBase: number;
  replayKey: string;
  contentDigest: string;
}

export interface TiebanMutualExclusionConstraint {
  id: string;
  title: string;
  domain: EventDomain;
  factIds: string[];
}

export interface CandidateProfile extends CandidateState {
  profileCode: string;
  signature: string;
  priorProbability: number;
  ritualBase: number;
  /** Probability vector aligned to the immutable facts array supplied to the engine. */
  factProbabilities: number[];
  coreFactIds: string[];
  fateClauseIds: string[];
}

export interface TiebanV4AnswerRecord {
  clauseId: string;
  factId: string;
  answer: TiebanAnswer;
  answeredAt: number;
  testedCandidateId: string;
  topCandidateBefore: string;
  topCandidateAfter: string;
  topProbabilityAfter: number;
  fourMinuteProbabilityAfter: number;
  /** Reliability actually applied to this answer; unclear is always zero. */
  evidenceWeight?: number;
}

export type TiebanFactApplicabilityStatus = "eligible" | "deferred" | "not_applicable";

export interface TiebanFactApplicabilityResult {
  status: TiebanFactApplicabilityStatus;
  reason: "age" | "derived_fact" | "resolved_group" | "required_context_unresolved" | "required_context_mismatch" | "excluded_context" | "eligible";
  contextGroupId?: string;
  resolvedFactId?: string | null;
}

export interface TiebanV4Session {
  version: "4.0.0";
  intake: TiebanIntake;
  birthSeed: BirthSeed;
  candidates: CandidateState[];
  profiles: CandidateProfile[];
  candidateLogWeights: number[];
  answers: TiebanV4AnswerRecord[];
  askedClauseIds: string[];
  currentClauseId: string | null;
  currentTestedCandidateId: string | null;
  domainCoverage: Partial<Record<EventDomain, number>>;
  positiveDomainCoverage: Partial<Record<EventDomain, number>>;
  phase: TiebanV4Phase;
  createdAt: number;
  completedAt: number | null;
  lockedCandidateId: string | null;
  lockStrength: "decisive" | "stable" | null;
  undeterminedReason: TiebanV4UndeterminedReason | null;
}

export interface CandidateRankingV4 {
  candidate: CandidateState;
  profile: CandidateProfile;
  probability: number;
}

export interface RitualTrace {
  birthNumber: string;
  candidateNumber: string;
  clauseNumber: string;
  volume: number;
  article: number;
  testedCandidateId: string;
}

export interface PastLifeNodeV4 {
  id: string;
  factId: string;
  clauseNumber: string;
  domain: EventDomain;
  title: string;
  ageRange: string;
  subject: string;
  summary: string;
  aftereffect: string;
  probability: number;
  evidenceClauseIds: string[];
  inference: "profile_confirmed" | "profile_inferred";
  askedDirectly: boolean;
}

export interface FutureFateNodeV4 {
  id: string;
  clauseId: string;
  ageStart: number;
  ageEnd: number;
  horizon: string;
  decadeLabel: string;
  domain: EventDomain;
  eventKey: string;
  verse: string;
  sign: string;
  reading: string;
  sourceType: "original" | "classic";
  sourceReference: string;
  sourceProfileId: string;
  terminal: boolean;
}

export interface TiebanIdentityV4 {
  title: string;
  dictum: string;
  reading: string;
}

export interface TiebanStoryEdgeV4 {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  text: string;
}

export interface TiebanBookV4 {
  title: string;
  seal: string;
  exactTime: string;
  keLabel: string;
  profileCode: string;
  currentAge: number;
  terminalAge: number;
  opening: string;
  identity: TiebanIdentityV4;
  ironEvidence: PastLifeNodeV4[];
  pastNodes: PastLifeNodeV4[];
  storyEdges: TiebanStoryEdgeV4[];
  unaskedInsight: PastLifeNodeV4 | null;
  futureNodes: FutureFateNodeV4[];
  closing: string;
}

export type { AtomicFact, CandidateState, TiebanAnswer, TiebanClause, TiebanIntake };
