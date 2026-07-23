import { DOMAIN_META, EVENT_BY_ID, getAge, LIFE_EVENTS } from "@/lib/events";
import { QUESTION_BANK, QUESTION_BY_ID, TARGETED_VERIFICATION_QUESTIONS } from "@/lib/questions";
import type {
  Answer,
  AnswerRecord,
  DecoderSession,
  DomainProfile,
  EventDomain,
  Focus,
  Intake,
  LifeProfile,
  ProfileEvent,
  Question
} from "@/lib/types";

export const BASELINE_TURNS = 24;
export const ADAPTIVE_VERIFICATION_TURNS = 8;
export const MAX_TURNS = BASELINE_TURNS + ADAPTIVE_VERIFICATION_TURNS;

const TARGETED_RANGE = [0.25, 0.88] as const;
const TARGETED_SENSITIVITY = 0.9;
const TARGETED_SPECIFICITY = 0.95;

function clamp(value: number, min = 0.015, max = 0.985) {
  return Math.min(max, Math.max(min, value));
}

function entropy(probability: number) {
  const p = clamp(probability, 0.001, 0.999);
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

export function expectedSingleEventInformation(probability: number) {
  const prior = clamp(probability, 0.001, 0.999);
  const yesProbability = clamp(
    TARGETED_SENSITIVITY * prior + (1 - TARGETED_SPECIFICITY) * (1 - prior),
    0.001,
    0.999
  );
  const posteriorYes = clamp(TARGETED_SENSITIVITY * prior / yesProbability, 0.001, 0.999);
  const posteriorNo = clamp((1 - TARGETED_SENSITIVITY) * prior / (1 - yesProbability), 0.001, 0.999);
  return entropy(prior) - yesProbability * entropy(posteriorYes) - (1 - yesProbability) * entropy(posteriorNo);
}

function focusDomains(focus: Focus): EventDomain[] {
  if (focus === "career_wealth") return ["career", "wealth"];
  if (focus === "relationship") return ["relationship", "family"];
  if (focus === "health_family") return ["health", "family", "turning_point"];
  return [];
}

export function getPersonalizedPrior(intake: Intake) {
  const age = getAge(intake.birthDate);
  const preferred = focusDomains(intake.focus);

  return Object.fromEntries(
    LIFE_EVENTS.map((event) => {
      if (age < event.earliestAge) return [event.id, 0.01];

      const exposureYears = Math.max(1, age - event.earliestAge + 1);
      const exposureFactor = Math.min(1.45, 0.58 + Math.log2(exposureYears + 1) / 5);
      let prior = event.baseRate * exposureFactor;

      if (preferred.includes(event.domain)) prior *= 1.04;
      if (event.id === "health_reproductive") {
        prior *= intake.gender === "female" ? 1.18 : intake.gender === "male" ? 0.86 : 1;
      }
      if (["rel_marriage", "rel_divorce", "turn_child_arrival", "wealth_property"].includes(event.id) && age < 24) {
        prior *= 0.46;
      }
      if (["turn_close_death", "fam_caregiving", "health_chronic"].includes(event.id) && age >= 45) {
        prior *= 1.24;
      }

      return [event.id, clamp(prior, 0.01, 0.72)];
    })
  );
}

function questionNoise(question: Question) {
  if (question.phase === "verify") return { falsePositive: 0.05, falseNegative: 0.1 };
  if (question.eventIds.length === 3) return { falsePositive: 0.096, falseNegative: 0.17 };
  return { falsePositive: 0.078, falseNegative: 0.145 };
}

export function questionYesProbability(question: Question, probabilities: Record<string, number>) {
  const anyProbability = 1 - question.eventIds.reduce((product, id) => product * (1 - (probabilities[id] ?? 0.1)), 1);
  const { falsePositive, falseNegative } = questionNoise(question);
  return clamp(falsePositive + (1 - falsePositive - falseNegative) * anyProbability, 0.001, 0.999);
}

function posteriorForEvent(
  question: Question,
  eventId: string,
  answer: Exclude<Answer, "unsure">,
  probabilities: Record<string, number>
) {
  const prior = probabilities[eventId];
  const others = question.eventIds.filter((id) => id !== eventId);
  const anyOther = 1 - others.reduce((product, id) => product * (1 - (probabilities[id] ?? 0.1)), 1);
  const { falsePositive, falseNegative } = questionNoise(question);
  const yesGivenTrue = 1 - falseNegative;
  const yesGivenFalse = falsePositive + (1 - falsePositive - falseNegative) * anyOther;
  const likelihoodTrue = answer === "yes" ? yesGivenTrue : 1 - yesGivenTrue;
  const likelihoodFalse = answer === "yes" ? yesGivenFalse : 1 - yesGivenFalse;
  const denominator = prior * likelihoodTrue + (1 - prior) * likelihoodFalse;
  return denominator <= 0 ? prior : clamp((prior * likelihoodTrue) / denominator);
}

function hasSufficientConsistentEvidence(session: DecoderSession, eventId: string) {
  const directAnswers = session.answers
    .filter((record) => {
      const question = QUESTION_BY_ID[record.questionId];
      return question?.phase === "verify" && question.eventIds.length === 1 && question.eventIds[0] === eventId;
    })
    .map((record) => record.answer)
    .filter((answer) => answer !== "unsure");
  return directAnswers.length >= 2 && new Set(directAnswers).size === 1;
}

function selectTargetedVerification(session: DecoderSession) {
  const [lower, upper] = TARGETED_RANGE;
  const candidates = TARGETED_VERIFICATION_QUESTIONS
    .filter((question) => !session.askedQuestionIds.includes(question.id))
    .filter((question) => !hasSufficientConsistentEvidence(session, question.eventIds[0]))
    .map((question) => {
      const event = EVENT_BY_ID[question.eventIds[0]];
      const probability = session.probabilities[event.id] ?? 0.1;
      const preferred = probability >= lower && probability <= upper;
      const informationGain = expectedSingleEventInformation(probability);
      const utility = informationGain * 0.72 + (event.salience / 5) * 0.2 + (preferred ? 0.08 : 0);
      return { question, preferred, informationGain, utility };
    });
  if (!candidates.length) return null;
  const preferred = candidates.filter((candidate) => candidate.preferred);
  return [...(preferred.length ? preferred : candidates)].sort(
    (a, b) => b.utility - a.utility || b.informationGain - a.informationGain || a.question.id.localeCompare(b.question.id)
  )[0].question;
}

function candidateQuestions(session: DecoderSession) {
  if (session.answers.length < BASELINE_TURNS) {
    const next = QUESTION_BANK[session.answers.length];
    return next && !session.askedQuestionIds.slice(0, -1).includes(next.id) ? [next] : [];
  }
  if (session.answers.length < MAX_TURNS) {
    const targeted = selectTargetedVerification(session);
    return targeted ? [targeted] : [];
  }
  return [];
}

export function selectNextQuestion(session: DecoderSession) {
  const candidates = candidateQuestions(session);
  return candidates[0] ?? null;
}

export function createSession(intake: Intake, now = Date.now()): DecoderSession {
  const session: DecoderSession = {
    intake,
    probabilities: getPersonalizedPrior(intake),
    evidence: Object.fromEntries(LIFE_EVENTS.map((event) => [event.id, 0])),
    answers: [],
    askedQuestionIds: [],
    currentQuestionId: null,
    createdAt: now,
    completedAt: null
  };
  const first = selectNextQuestion(session);
  session.currentQuestionId = first?.id ?? null;
  if (first) session.askedQuestionIds.push(first.id);
  return session;
}

export function isSessionReady(session: DecoderSession) {
  return session.answers.length >= MAX_TURNS;
}

export function answerCurrentQuestion(session: DecoderSession, answer: Answer, now = Date.now()): DecoderSession {
  if (!session.currentQuestionId || session.completedAt) return session;
  const question = QUESTION_BY_ID[session.currentQuestionId];
  if (!question) return session;

  const beforeYes = questionYesProbability(question, session.probabilities);
  let probabilities = { ...session.probabilities };
  const evidence = { ...session.evidence };

  if (answer !== "unsure") {
    for (const eventId of question.eventIds) {
      const posterior = posteriorForEvent(question, eventId, answer, session.probabilities);
      probabilities[eventId] = posterior;
      evidence[eventId] = (evidence[eventId] ?? 0) + (answer === "yes" ? 1 : -1);
    }
  }

  const afterYes = questionYesProbability(question, probabilities);
  const record: AnswerRecord = {
    questionId: question.id,
    answer,
    answeredAt: now,
    probabilityBefore: beforeYes,
    probabilityAfter: afterYes
  };
  const next: DecoderSession = {
    ...session,
    probabilities,
    evidence,
    answers: [...session.answers, record],
    currentQuestionId: null
  };

  if (isSessionReady(next)) {
    next.completedAt = now;
    return next;
  }

  const following = selectNextQuestion(next);
  next.currentQuestionId = following?.id ?? null;
  if (following) next.askedQuestionIds = [...next.askedQuestionIds, following.id];
  if (!following) next.completedAt = now;
  return next;
}

export function completeSession(session: DecoderSession, now = Date.now()): DecoderSession {
  return { ...session, currentQuestionId: null, completedAt: now };
}

function confidenceFor(probability: number, evidenceCount: number): ProfileEvent["confidence"] {
  if (probability >= 0.88 && evidenceCount >= 2) return "high";
  if (probability >= 0.25) return "medium";
  return "tentative";
}

function profileSummary(domain: EventDomain, events: ProfileEvent[]) {
  if (events.length === 0) return `${DOMAIN_META[domain].short}尚未形成足够清晰的高置信线索。`;
  const labels = events.slice(0, 3).map((item) => EVENT_BY_ID[item.eventId].label);
  return `这一脉最清楚的旧痕落在${labels.join("、")}；它们共同构成你在${DOMAIN_META[domain].title}上的主要底色。`;
}

export function buildProfile(session: DecoderSession): LifeProfile {
  const all = Object.entries(session.probabilities)
    .map(([eventId, probability]) => ({
      eventId,
      probability,
      evidenceCount: Math.abs(session.evidence[eventId] ?? 0),
      confidence: confidenceFor(probability, Math.abs(session.evidence[eventId] ?? 0))
    }))
    .sort((a, b) => b.probability - a.probability);

  const domains = (Object.keys(DOMAIN_META) as EventDomain[]).map((domain): DomainProfile => {
    const events = all.filter((item) => EVENT_BY_ID[item.eventId].domain === domain && item.probability >= 0.25).slice(0, 4);
    const confidence = events.length === 0 ? 28 : Math.round(events.reduce((sum, item) => sum + item.probability, 0) / events.length * 100);
    return { domain, title: DOMAIN_META[domain].title, summary: profileSummary(domain, events), events, confidence };
  });

  const highConfidence = all.filter((item) => item.confidence === "high").slice(0, 12);
  const rankedForConfidence = all.slice(0, 10);
  const overallConfidence = Math.round(
    rankedForConfidence.reduce((sum, item) => sum + item.probability, 0) / Math.max(1, rankedForConfidence.length) * 100
  );
  const evidenceTrail = session.answers.map((record, index) => {
    const question = QUESTION_BY_ID[record.questionId];
    const labels = question.eventIds.map((id) => EVENT_BY_ID[id].label).join(" / ");
    const answerLabel = record.answer === "yes" ? "是" : record.answer === "no" ? "否" : "未决";
    return `第 ${index + 1} 问 · ${labels} · 回答${answerLabel}`;
  });

  return { generatedAt: Date.now(), overallConfidence, highConfidence, domains, evidenceTrail };
}

export function getProgress(session: DecoderSession) {
  return Math.min(100, Math.round(session.answers.length / MAX_TURNS * 100));
}
