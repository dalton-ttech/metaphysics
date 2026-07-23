import { InterviewPolicy } from "./policies.mjs";

export async function runBlindSession({ descriptor, eventCatalog, questionBank, ask, submit, minQuestions = 18, maxQuestions = 24 }) {
  const questions = questionBank.questions.filter((question) => question.poolSize === descriptor.poolSize);
  const policy = new InterviewPolicy({
    name: descriptor.interviewerPolicy,
    eventCatalog,
    questions,
    intake: descriptor.intake,
    minQuestions,
    maxQuestions
  });

  while (!policy.done()) {
    const question = policy.nextQuestion();
    if (!question) throw new Error(`Session ${descriptor.id} exhausted its question bank.`);
    const response = await ask(descriptor.id, question.id);
    policy.observe(question, response.answer);
  }

  const result = await submit(descriptor.id, policy.prediction());
  return { sessionId: descriptor.id, questions: policy.answers.length, predictionHash: result.predictionHash };
}
