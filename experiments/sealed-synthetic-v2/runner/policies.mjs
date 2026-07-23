import { LOW_RECALL_PRIORITY } from "../config/generator-config.v2.mjs";

function clamp(value, minimum = 0.001, maximum = 0.999) {
  return Math.max(minimum, Math.min(maximum, value));
}

function entropy(probability) {
  const p = clamp(probability);
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

function probabilityAny(probabilities, eventIds) {
  return 1 - eventIds.reduce((product, id) => product * (1 - (probabilities[id] ?? 0.1)), 1);
}

function eventAge(intake) {
  const year = Number(intake?.birthDate?.slice(0, 4));
  return Number.isFinite(year) ? 2026 - year : 35;
}

export function initialProbabilities(eventCatalog, intake = {}) {
  const age = eventAge(intake);
  return Object.fromEntries(eventCatalog.map((event) => {
    const base = event.decoderPrior ?? event.baseRate ?? 0.12;
    const ageFactor = age < (event.earliestAge ?? 0) ? 0.08 : age < (event.earliestAge ?? 0) + 5 ? 0.55 : 1;
    return [event.id, clamp(base * ageFactor, 0.005, 0.75)];
  }));
}

export function updateProbabilities(probabilities, question, answer) {
  if (answer === "unsure") return { ...probabilities };
  const next = { ...probabilities };
  const anyPrior = probabilityAny(probabilities, question.eventIds);
  const sensitivity = question.verification ? 0.90 : question.poolSize === 3 ? 0.83 : 0.855;
  const specificity = question.verification ? 0.95 : question.poolSize === 3 ? 0.904 : 0.922;
  const pYes = clamp(sensitivity * anyPrior + (1 - specificity) * (1 - anyPrior));

  for (const eventId of question.eventIds) {
    const prior = probabilities[eventId] ?? 0.1;
    if (answer === "yes") {
      next[eventId] = clamp((sensitivity * prior) / pYes);
    } else {
      next[eventId] = clamp(((1 - sensitivity) * prior) / (1 - pYes));
    }
  }
  return next;
}

function expectedInformation(probabilities, question) {
  const any = probabilityAny(probabilities, question.eventIds);
  const memberEntropy = question.eventIds.reduce((sum, id) => sum + entropy(probabilities[id] ?? 0.1), 0) / question.eventIds.length;
  return entropy(any) * 0.62 + memberEntropy * 0.38;
}

function shouldStop(probabilities, answers, minQuestions, maxQuestions) {
  if (answers.length < minQuestions) return false;
  if (answers.length >= maxQuestions) return true;
  const values = Object.values(probabilities);
  const decisive = values.filter((probability) => probability <= 0.16 || probability >= 0.76).length / values.length;
  const top = [...values].sort((a, b) => b - a).slice(0, 10);
  const topEntropy = top.reduce((sum, probability) => sum + entropy(probability), 0) / top.length;
  return decisive >= 0.72 && topEntropy <= 0.72;
}

export class V2InterviewPolicy {
  constructor({ name, eventCatalog, questions, intake, minQuestions = 18, maxQuestions = 24, coverageBudget = 16, pairBudget = 0, rareCrosscheckBudget = 4 }) {
    this.name = name;
    this.eventCatalog = eventCatalog;
    this.questions = questions;
    this.minQuestions = minQuestions;
    this.maxQuestions = maxQuestions;
    this.coverageBudget = coverageBudget;
    this.pairBudget = pairBudget;
    this.rareCrosscheckBudget = rareCrosscheckBudget;
    this.probabilities = initialProbabilities(eventCatalog, intake);
    this.answers = [];
    this.asked = new Set();
    this.verifiedEvents = new Set();
  }

  #evidenceCounts() {
    const counts = Object.fromEntries(this.eventCatalog.map((event) => [event.id, 0]));
    for (const answer of this.answers) {
      for (const eventId of answer.question.eventIds) counts[eventId] += 1;
    }
    return counts;
  }

  #rankBroad(candidates) {
    const evidenceCounts = this.#evidenceCounts();
    return candidates.map((question) => {
      const information = expectedInformation(this.probabilities, question);
      const coverage = question.eventIds.reduce((sum, id) => sum + 1 / (1 + evidenceCounts[id]), 0) / question.eventIds.length;
      return { question, utility: information * 0.74 + coverage * 0.26 };
    }).sort((a, b) => b.utility - a.utility || a.question.id.localeCompare(b.question.id))[0]?.question ?? null;
  }

  #rankVerification(candidates) {
    const verificationStep = this.answers.filter((answer) => answer.question.verification).length;
    const mandatory = ["rel_formative_love", "edu_exam_turn", "rel_formative_love", "edu_exam_turn"];
    if (verificationStep < mandatory.length) {
      const eventId = mandatory[verificationStep];
      return candidates.find((question) => question.eventIds[0] === eventId) ?? null;
    }
    return candidates.map((question) => {
      const eventId = question.eventIds[0];
      const probability = this.probabilities[eventId] ?? 0.1;
      const priorityIndex = LOW_RECALL_PRIORITY.indexOf(eventId);
      const priorityTieBreak = priorityIndex < 0 ? 0 : (LOW_RECALL_PRIORITY.length - priorityIndex) / LOW_RECALL_PRIORITY.length;
      const utility = probability * 3.2
        + entropy(probability) * 0.35
        + priorityTieBreak * 0.12
        + (question.socialLanguageDerived ? 0.08 : 0);
      return { question, utility };
    }).sort((a, b) => b.utility - a.utility || a.question.id.localeCompare(b.question.id))[0]?.question ?? null;
  }

  nextQuestion() {
    const available = this.questions.filter((question) => !this.asked.has(question.id));
    if (!available.length) return null;
    const broad = available.filter((question) => question.kind === "broad");
    if (this.name !== "targeted_verify") return this.#rankBroad(broad);

    const coverageAsked = this.answers.filter((answer) => answer.question.kind === "coverage").length;
    if (coverageAsked < this.coverageBudget) {
      return available.filter((question) => question.kind === "coverage").sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))[0] ?? null;
    }
    const pairAsked = this.answers.filter((answer) => answer.question.kind === "broad").length;
    if (pairAsked < this.pairBudget) return this.#rankBroad(broad);
    const rareCrosscheckAsked = this.answers.filter((answer) => answer.question.kind === "rare_crosscheck").length;
    if (rareCrosscheckAsked < this.rareCrosscheckBudget) {
      return available.filter((question) => question.kind === "rare_crosscheck").sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))[0] ?? null;
    }
    const verification = available.filter((question) => question.verification);
    return this.#rankVerification(verification) ?? this.#rankBroad(broad);
  }

  observe(question, answer) {
    this.asked.add(question.id);
    if (question.verification) this.verifiedEvents.add(question.eventIds[0]);
    this.answers.push({ question, answer });
    this.probabilities = updateProbabilities(this.probabilities, question, answer);
  }

  done() {
    if (this.name === "targeted_verify") return this.answers.length >= this.maxQuestions;
    return shouldStop(this.probabilities, this.answers, this.minQuestions, this.maxQuestions);
  }

  prediction() {
    return { ...this.probabilities };
  }
}
