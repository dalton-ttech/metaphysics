import { V2InterviewPolicy } from "./policies.mjs";

export async function runBlindSessionV2({ descriptor, eventCatalog, questionBank, ask, submit, minQuestions = 18, maxQuestions = 24 }) {
  const questions = questionBank.questions.filter((question) => (question.armPoolSize ?? question.poolSize) === descriptor.poolSize);
  const policy = new V2InterviewPolicy({
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
  return {
    sessionId: descriptor.id,
    questions: policy.answers.length,
    broadQuestions: policy.answers.filter((item) => item.question.kind === "broad").length,
    verificationQuestions: policy.answers.filter((item) => item.question.verification).length,
    predictionHash: result.predictionHash
  };
}
