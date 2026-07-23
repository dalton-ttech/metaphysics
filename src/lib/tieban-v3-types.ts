import type { EventDomain, Gender } from "@/lib/types";

export type TiebanAnswer = "resonates" | "not_resonates" | "unclear";
export type TiebanPhase = "initial" | "recalculate" | "narrowing" | "locked";
export type ClauseKind = "calibration" | "past" | "present" | "future";

export interface TiebanIntake {
  name: string;
  birthDate: string;
  birthShichen: number;
  gender: Gender;
  birthplace: string;
}

export interface TiebanFactContextRequirement {
  kind: "resolved_exclusive_group";
  groupId: string;
  allowedFactIds: string[];
}

export interface TiebanFactEvidencePolicy {
  /** Optional weights applied when this fact is affirmed under a resolved context option. */
  resonatesContextGroupId?: string;
  resonatesWeightByFactId?: Record<string, number>;
  resonatesWeight?: number;
  notResonatesWeight?: number;
}

export interface TiebanFactApplicability {
  requiredContexts: TiebanFactContextRequirement[];
  excludedContexts: TiebanFactContextRequirement[];
  /** Derived facts may appear in the book but are never shown as calibration questions. */
  questionMode?: "ask" | "derived";
}

export interface AtomicFact {
  id: string;
  domain: EventDomain;
  domainTitle?: string;
  label: string;
  definition: string;
  timeLabel?: string;
  semanticFamily?: string;
  subject: "self" | "father" | "mother" | "parents" | "siblings" | "partner" | "children" | "family";
  earliestAge: number;
  latestAge: number | null;
  minCurrentAge?: number;
  baseRate: number;
  salience: 1 | 2 | 3 | 4 | 5;
  mutualExclusionGroup?: string | null;
  applicability?: TiebanFactApplicability;
  evidencePolicy?: TiebanFactEvidencePolicy;
}

export interface TiebanClause {
  id: string;
  volume: number;
  article: number;
  displayCode: string;
  primaryFactId: string;
  kind: ClauseKind;
  text: string;
  interpretation: string;
  ambiguity: number;
  sensitivity: number;
  specificity: number;
  sourceKind: "modern_fabricated" | "modern_composed" | "public_domain_adapted" | "historical_reference";
  sourceNote: string;
  category?: "六亲考刻" | "定分" | "命局" | "运限";
  conditionFactIds?: string[];
}

export interface CandidateState {
  id: string;
  index: number;
  minuteOffset: number;
  clockTime: string;
  keIndex: number;
  minuteWithinKe: number;
}

export interface TiebanAnswerRecord {
  clauseId: string;
  answer: TiebanAnswer;
  answeredAt: number;
  topCandidateBefore: string;
  topCandidateAfter: string;
  topProbabilityAfter: number;
  factProbabilityBefore: number;
  factProbabilityAfter: number;
}

export interface TiebanSession {
  version: "3.0.0";
  intake: TiebanIntake;
  candidates: CandidateState[];
  candidateLogWeights: number[];
  factProbabilities: Record<string, number>;
  factEvidence: Record<string, number>;
  domainCoverage: Partial<Record<EventDomain, number>>;
  answers: TiebanAnswerRecord[];
  askedClauseIds: string[];
  currentClauseId: string | null;
  phase: TiebanPhase;
  createdAt: number;
  completedAt: number | null;
  lockedCandidateId: string | null;
  lockStrength: "decisive" | "stable" | "best_fit" | null;
}

export interface CandidateRanking {
  candidate: CandidateState;
  probability: number;
}

export interface PastLifeNode {
  id: string;
  factId: string;
  domain: EventDomain;
  title: string;
  ageRange: string;
  subject: string;
  summary: string;
  aftereffect: string;
  probability: number;
  evidenceClauseIds: string[];
}

export interface FutureFateNode {
  id: string;
  title: string;
  horizon: string;
  verse: string;
  reading: string;
  consequence: string;
  evidenceFactIds: string[];
}

export interface TiebanBook {
  title: string;
  seal: string;
  exactTime: string;
  keLabel: string;
  opening: string;
  pastNodes: PastLifeNode[];
  futureNodes: FutureFateNode[];
  closing: string;
}
