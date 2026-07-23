import { V2InterviewPolicy, updateProbabilities } from "../../sealed-synthetic-v2/runner/policies.mjs";
import { V23_POLICY_CONFIG } from "../config/experiment-config.mjs";

const clamp = (value, minimum = 0.001, maximum = 0.999) => Math.max(minimum, Math.min(maximum, value));

function entropy(probability) {
  const p = clamp(probability);
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

export function expectedSingleEventInformation(
  probability,
  sensitivity = V23_POLICY_CONFIG.directSensitivity,
  specificity = V23_POLICY_CONFIG.directSpecificity
) {
  const prior = clamp(probability);
  const pYes = clamp(sensitivity * prior + (1 - specificity) * (1 - prior));
  const posteriorYes = clamp((sensitivity * prior) / pYes);
  const posteriorNo = clamp(((1 - sensitivity) * prior) / (1 - pYes));
  return entropy(prior) - pYes * entropy(posteriorYes) - (1 - pYes) * entropy(posteriorNo);
}

function directEvidence(answers, eventId) {
  return answers
    .filter((item) => item.question.verification && item.question.eventIds.length === 1 && item.question.eventIds[0] === eventId)
    .map((item) => item.answer);
}

export function hasSufficientConsistentEvidence(answers, eventId, config = V23_POLICY_CONFIG) {
  const evidence = directEvidence(answers, eventId).filter((answer) => answer !== "unsure");
  return evidence.length >= config.sufficientConsistentDirectAnswers && new Set(evidence).size === 1;
}

export function selectTargetedVerification({
  probabilities,
  answers,
  eventCatalog,
  questions,
  askedQuestionIds,
  selectedEventIds,
  config = V23_POLICY_CONFIG
}) {
  const eventById = new Map(eventCatalog.map((event) => [event.id, event]));
  const [lower, upper] = config.preferredPosteriorRange;
  const candidates = questions
    .filter((question) => question.verification && question.eventIds.length === 1)
    .filter((question) => !askedQuestionIds.has(question.id))
    .filter((question) => !selectedEventIds.has(question.eventIds[0]))
    .filter((question) => !hasSufficientConsistentEvidence(answers, question.eventIds[0], config))
    .map((question) => {
      const eventId = question.eventIds[0];
      const event = eventById.get(eventId);
      const probability = probabilities[eventId] ?? 0.1;
      const preferred = probability >= lower && probability <= upper;
      const informationGain = expectedSingleEventInformation(probability, config.directSensitivity, config.directSpecificity);
      const salience = (event?.salience ?? 3) / 5;
      const utility =
        informationGain * config.informationWeight +
        salience * config.salienceWeight +
        (preferred ? config.preferredRangeBonus : 0);
      return { question, eventId, probability, preferred, informationGain, salience, utility };
    });

  if (!candidates.length) return null;
  const preferred = candidates.filter((candidate) => candidate.preferred);
  return [...(preferred.length ? preferred : candidates)].sort(
    (a, b) => b.utility - a.utility || b.informationGain - a.informationGain || a.question.id.localeCompare(b.question.id)
  )[0];
}

export async function runV23Session({ descriptor, k, eventCatalog, questionBank, ask, submit }) {
  const questions = questionBank.questions.filter(
    (question) => (question.armPoolSize ?? question.poolSize) === descriptor.poolSize
  );
  const baseline = new V2InterviewPolicy({
    name: "targeted_verify",
    eventCatalog,
    questions,
    intake: descriptor.intake,
    minQuestions: V23_POLICY_CONFIG.baselineQuestions,
    maxQuestions: V23_POLICY_CONFIG.baselineQuestions
  });

  while (!baseline.done()) {
    const question = baseline.nextQuestion();
    if (!question) throw new Error(`Session ${descriptor.id} exhausted the v2.2 baseline bank.`);
    const response = await ask(descriptor.id, question.id);
    baseline.observe(question, response.answer);
  }

  let probabilities = baseline.prediction();
  const answers = [...baseline.answers];
  const askedQuestionIds = new Set(answers.map((item) => item.question.id));
  const selectedEventIds = new Set();
  const selections = [];

  for (let step = 0; step < k; step += 1) {
    const candidate = selectTargetedVerification({
      probabilities,
      answers,
      eventCatalog,
      questions,
      askedQuestionIds,
      selectedEventIds
    });
    if (!candidate) throw new Error(`Session ${descriptor.id} has no eligible targeted question at step ${step + 1}/${k}.`);
    const response = await ask(descriptor.id, candidate.question.id);
    answers.push({ question: candidate.question, answer: response.answer });
    askedQuestionIds.add(candidate.question.id);
    selectedEventIds.add(candidate.eventId);
    selections.push({
      step: step + 1,
      questionId: candidate.question.id,
      eventId: candidate.eventId,
      posteriorBefore: candidate.probability,
      preferredRange: candidate.preferred,
      expectedInformationGain: candidate.informationGain,
      salience: candidate.salience,
      utility: candidate.utility,
      answer: response.answer
    });
    probabilities = updateProbabilities(probabilities, candidate.question, response.answer);
  }

  const submission = await submit(descriptor.id, probabilities, {
    baselineQuestions: baseline.answers.length,
    targetedQuestions: selections.length,
    baselineKinds: {
      coverage: baseline.answers.filter((item) => item.question.kind === "coverage").length,
      rareCrosscheck: baseline.answers.filter((item) => item.question.kind === "rare_crosscheck").length,
      verification: baseline.answers.filter((item) => item.question.verification).length
    },
    selections
  });
  return {
    sessionId: descriptor.id,
    questions: answers.length,
    targetedQuestions: selections.length,
    predictionHash: submission.predictionHash
  };
}

