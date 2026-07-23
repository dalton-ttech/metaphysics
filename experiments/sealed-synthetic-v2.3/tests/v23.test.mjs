import assert from "node:assert/strict";
import test from "node:test";

import { buildV2QuestionBank } from "../../sealed-synthetic-v2/oracle/question-bank.mjs";
import { createSealedArena } from "../oracle/sealed-arena.mjs";
import { reproducibleHash, runSeries } from "../runner/experiment-core.mjs";
import { expectedSingleEventInformation, runV23Session, selectTargetedVerification } from "../runner/targeted-policy.mjs";

const tinyPlan = { calibration: 80, validation: 60, retest: 10 };

test("single-event information gain peaks away from posterior extremes", () => {
  assert.ok(expectedSingleEventInformation(0.5) > expectedSingleEventInformation(0.02));
  assert.ok(expectedSingleEventInformation(0.5) > expectedSingleEventInformation(0.98));
});

test("candidate selector favors the preferred posterior interval and skips sufficient evidence", () => {
  const eventCatalog = [
    { id: "a", salience: 5 },
    { id: "b", salience: 3 },
    { id: "c", salience: 5 }
  ];
  const questions = eventCatalog.map((event) => ({ id: `q-${event.id}`, verification: true, eventIds: [event.id] }));
  const answers = [
    { question: questions[0], answer: "yes" },
    { question: { ...questions[0], id: "q-a-2" }, answer: "yes" }
  ];
  const selected = selectTargetedVerification({
    probabilities: { a: 0.5, b: 0.52, c: 0.95 },
    answers,
    eventCatalog,
    questions,
    askedQuestionIds: new Set(),
    selectedEventIds: new Set()
  });
  assert.equal(selected.eventId, "b");
  assert.equal(selected.preferred, true);
});

test("v2.3 keeps exact v2.2 baseline and adds K unique single-event checks", async () => {
  const arena = createSealedArena({
    seed: "v23-structure-test",
    respondentMode: "rule",
    scenario: "default",
    kValues: [0, 4],
    samplePlan: { calibration: 2, validation: 2, retest: 1 }
  });
  const descriptor = arena.context.sessions[0];
  const run = async (k) => runV23Session({
    descriptor,
    k,
    eventCatalog: arena.context.eventCatalog,
    questionBank: arena.context.questionBank,
    ask: (sessionId, questionId) => arena.ask(k, sessionId, questionId),
    submit: (sessionId, probabilities, diagnostics) => arena.submit(k, sessionId, probabilities, diagnostics)
  });
  const baseline = await run(0);
  const extended = await run(4);
  assert.equal(baseline.questions, 24);
  assert.equal(extended.questions, 28);
  assert.equal(extended.targetedQuestions, 4);
  assert.equal("profiles" in arena, false, "sealed arena must not expose truth profiles");
  assert.equal("reveal" in arena, false, "sealed arena must not expose a reveal method");
});

test("question bank inherited by v2.3 still has the frozen v2.2 hash and 16 coverage questions", () => {
  const arena = createSealedArena({
    seed: "v23-bank-test",
    respondentMode: "rule",
    scenario: "default",
    kValues: [0],
    samplePlan: { calibration: 2, validation: 2, retest: 1 }
  });
  const rebuilt = buildV2QuestionBank(arena.context.eventCatalog);
  assert.equal(arena.context.questionBank.hash, rebuilt.hash);
  assert.equal(rebuilt.questions.filter((question) => question.kind === "coverage").length, 16);
});

test("matched K arms receive the same response to the same baseline question and expose no profile link", () => {
  const arena = createSealedArena({
    seed: "v23-matched-noise-test",
    respondentMode: "rule",
    scenario: "default",
    kValues: [0, 8],
    samplePlan: { calibration: 2, validation: 2, retest: 1 }
  });
  const descriptor = arena.context.sessions[0];
  const question = arena.context.questionBank.questions.find((item) => item.kind === "coverage");
  const left = arena.ask(0, descriptor.id, question.id);
  const right = arena.ask(8, descriptor.id, question.id);
  assert.equal(left.answer, right.answer);
  assert.equal(Object.hasOwn(descriptor, "profileId"), false);
  assert.equal(Array.isArray(arena.context.profiles), false);
});

test("small sealed series is reproducible and keeps calibration/validation isolated", async () => {
  const options = {
    seed: "v23-reproducibility-test",
    respondentMode: "rule",
    scenario: "default",
    kValues: [0, 2],
    samplePlan: tinyPlan
  };
  const first = await runSeries(options);
  const second = await runSeries(options);
  assert.equal(reproducibleHash(first.byK), reproducibleHash(second.byK));
  assert.equal(first.profiles, 140);
  assert.equal(first.sessionsPerArm, 150);
  assert.equal(first.byK[0].validation.sessions, 60);
  assert.equal(first.byK[2].validation.averageQuestions, 26);
  assert.equal(first.byK[2].testRetest.pairs, 10);
  assert.equal(first.byK[2].selectionDiagnostics.questions, (80 + 60) * 2);
});
