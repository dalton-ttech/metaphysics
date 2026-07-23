export type EventDomain =
  | "family"
  | "education_mobility"
  | "career"
  | "wealth"
  | "relationship"
  | "health"
  | "law_social"
  | "turning_point";

export type Gender = "male" | "female" | "unspecified";
export type Focus = "overall" | "career_wealth" | "relationship" | "health_family";
export type Answer = "yes" | "no" | "unsure";
export type QuestionPhase = "screen" | "discriminate" | "verify";

export interface LifeEvent {
  id: string;
  domain: EventDomain;
  label: string;
  description: string;
  cue: string;
  verificationCue: string;
  baseRate: number;
  earliestAge: number;
  salience: 1 | 2 | 3 | 4 | 5;
  sensitivity: "ordinary" | "private" | "intense";
  related: string[];
  futureSignal: "expansion" | "stability" | "recovery" | "relationship" | "risk" | "reinvention";
}

export interface Intake {
  name: string;
  birthDate: string;
  gender: Gender;
  birthplace: string;
  focus: Focus;
}

export interface Question {
  id: string;
  phase: QuestionPhase;
  eventIds: string[];
  text: string;
  plainRule: string;
  styleVariant: number;
}

export interface AnswerRecord {
  questionId: string;
  answer: Answer;
  answeredAt: number;
  probabilityBefore: number;
  probabilityAfter: number;
}

export interface DecoderSession {
  intake: Intake;
  probabilities: Record<string, number>;
  evidence: Record<string, number>;
  answers: AnswerRecord[];
  askedQuestionIds: string[];
  currentQuestionId: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface ProfileEvent {
  eventId: string;
  probability: number;
  confidence: "high" | "medium" | "tentative";
  evidenceCount: number;
}

export interface DomainProfile {
  domain: EventDomain;
  title: string;
  summary: string;
  events: ProfileEvent[];
  confidence: number;
}

export interface LifeProfile {
  generatedAt: number;
  overallConfidence: number;
  highConfidence: ProfileEvent[];
  domains: DomainProfile[];
  evidenceTrail: string[];
}

export interface DestinyChapter {
  id: string;
  title: string;
  horizon: string;
  verse: string;
  interpretation: string;
  triggers: string[];
  confidence: number;
  evidenceEventIds: string[];
}

export interface DestinyBook {
  title: string;
  seal: string;
  opening: string;
  chapters: DestinyChapter[];
  closing: string;
}
