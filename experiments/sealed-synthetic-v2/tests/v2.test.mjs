import assert from "node:assert/strict";
import test from "node:test";

import { generateCohort } from "../../sealed-synthetic-v1/generator/index.mjs";
import { V2_GENERATOR_CONFIG } from "../config/generator-config.v2.mjs";
import { buildV2QuestionBank } from "../oracle/question-bank.mjs";
import { V2InterviewPolicy } from "../runner/policies.mjs";

const cohort = generateCohort({ seed: "v2-test-seed", config: V2_GENERATOR_CONFIG });
const catalog = cohort.metadata.eventCatalog;

test("v2 preserves 48 top-level truth labels and freezes a mixed bank", () => {
  assert.equal(catalog.length, 48);
  const bank = buildV2QuestionBank(catalog);
  assert.equal(bank.questions.filter((question) => question.kind === "coverage").length, 16);
  assert.equal(new Set(bank.questions.filter((question) => question.kind === "coverage").flatMap((question) => question.eventIds)).size, 48);
  assert.equal(bank.questions.filter((question) => question.kind === "rare_crosscheck").length, 4);
  assert.equal(new Set(bank.questions.filter((question) => question.kind === "rare_crosscheck").flatMap((question) => question.eventIds)).size, 10);
  assert.ok(bank.questions.some((question) => question.kind === "broad" && question.poolSize === 2));
  assert.ok(bank.questions.some((question) => question.verification && question.poolSize === 1 && question.armPoolSize === 2));
  assert.equal(new Set(bank.questions.map((question) => question.id)).size, bank.questions.length);
  assert.match(bank.questions.find((question) => question.id.startsWith("v2-d1-wealth_bankruptcy")).text, /资金|偿债|财务|破产/);
});

test("targeted policy covers all events, crosschecks rare events and ends with repeated confirmations", () => {
  const bank = buildV2QuestionBank(catalog);
  const policy = new V2InterviewPolicy({
    name: "targeted_verify",
    eventCatalog: catalog,
    questions: bank.questions,
    intake: { birthDate: "1986-07-01" },
    minQuestions: 18,
    maxQuestions: 24
  });
  while (!policy.done()) {
    const question = policy.nextQuestion();
    assert.ok(question);
    policy.observe(question, question.kind === "broad" && policy.answers.length % 3 === 0 ? "yes" : "no");
  }
  assert.equal(policy.answers.length, 24);
  assert.equal(policy.answers.filter((item) => item.question.kind === "coverage").length, 16);
  assert.equal(policy.answers.filter((item) => item.question.kind === "broad").length, 0);
  assert.equal(policy.answers.filter((item) => item.question.kind === "rare_crosscheck").length, 4);
  const verified = policy.answers.filter((item) => item.question.verification).map((item) => item.question.eventIds[0]);
  assert.deepEqual(verified, ["rel_formative_love", "edu_exam_turn", "rel_formative_love", "edu_exam_turn"]);
});

test("same v2 seed reproduces the same cohort", () => {
  const repeated = generateCohort({ seed: "v2-test-seed", config: V2_GENERATOR_CONFIG });
  assert.deepEqual(repeated.profiles, cohort.profiles);
  assert.deepEqual(repeated.sessions, cohort.sessions);
});
