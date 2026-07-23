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
  const sensitivity = 0.88 - Math.max(0, question.poolSize - 1) * 0.025;
  const specificity = 0.94 - Math.max(0, question.poolSize - 1) * 0.018;
  const pYes = clamp(sensitivity * anyPrior + (1 - specificity) * (1 - anyPrior));

  for (const eventId of question.eventIds) {
    const prior = probabilities[eventId] ?? 0.1;
    if (answer === "yes") {
      const numerator = sensitivity * prior;
      next[eventId] = clamp(numerator / pYes);
    } else {
      const numerator = (1 - sensitivity) * prior;
      next[eventId] = clamp(numerator / (1 - pYes));
    }
  }
  return next;
}

function expectedInformation(probabilities, question) {
  const any = probabilityAny(probabilities, question.eventIds);
  const uncertainty = entropy(any);
  const memberEntropy = question.eventIds.reduce((sum, id) => sum + entropy(probabilities[id] ?? 0.1), 0) / question.eventIds.length;
  return uncertainty * 0.62 + memberEntropy * 0.38;
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

export class InterviewPolicy {
  constructor({ name, eventCatalog, questions, intake, minQuestions = 18, maxQuestions = 24 }) {
    this.name = name;
    this.eventCatalog = eventCatalog;
    this.questions = questions;
    this.minQuestions = minQuestions;
    this.maxQuestions = maxQuestions;
    this.probabilities = initialProbabilities(eventCatalog, intake);
    this.answers = [];
    this.asked = new Set();
  }

  nextQuestion() {
    const candidates = this.questions.filter((question) => !this.asked.has(question.id));
    if (!candidates.length) return null;
    if (this.name === "fixed") return candidates[0];

    const evidenceCounts = Object.fromEntries(this.eventCatalog.map((event) => [event.id, 0]));
    for (const answer of this.answers) {
      for (const eventId of answer.question.eventIds) evidenceCounts[eventId] += 1;
    }
    const ranked = candidates.map((question) => {
      const information = expectedInformation(this.probabilities, question);
      const coverage = question.eventIds.reduce((sum, id) => sum + 1 / (1 + evidenceCounts[id]), 0) / question.eventIds.length;
      const highCandidate = Math.max(...question.eventIds.map((id) => this.probabilities[id] ?? 0));
      const contradiction = question.eventIds.reduce((sum, id) => sum + Math.abs((this.probabilities[id] ?? 0) - 0.5), 0) / question.eventIds.length;
      const utility = this.name === "reasoning"
        ? information * 0.48 + coverage * 0.22 + highCandidate * 0.23 - contradiction * 0.07
        : information * 0.76 + coverage * 0.24;
      return { question, utility };
    }).sort((a, b) => b.utility - a.utility || a.question.id.localeCompare(b.question.id));
    return ranked[0].question;
  }

  observe(question, answer) {
    this.asked.add(question.id);
    this.answers.push({ question, answer });
    this.probabilities = updateProbabilities(this.probabilities, question, answer);
  }

  done() {
    return shouldStop(this.probabilities, this.answers, this.minQuestions, this.maxQuestions);
  }

  prediction() {
    return { ...this.probabilities };
  }
}
