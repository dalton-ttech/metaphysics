import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { generateLifeBook } from "../book/generate-book.mjs";
import { V4_CONFIG } from "../config/experiment-config.mjs";
import { createBirthCandidatePool, QUESTION_ORDER } from "../domain/birth-candidate-pool.mjs";
import { CLAUSE_CODEBOOK, FACT_CATALOG } from "../domain/fact-catalog.mjs";
import { sha256 } from "../lib/deterministic.mjs";
import { createSealedLifeSession } from "../oracle/sealed-life-session.mjs";
import { buildPersonaConfigs } from "../personas/build-personas.mjs";
import { runV4Experiment } from "../runner/experiment-engine.mjs";
import { runInferenceSession } from "../runner/inference-policy.mjs";

const personas = buildPersonaConfigs();

test("60 atomic clauses and 1500 reusable personas are structurally fixed", () => {
  assert.equal(FACT_CATALOG.length, 60);
  assert.equal(CLAUSE_CODEBOOK.length, 60);
  assert.equal(new Set(CLAUSE_CODEBOOK.map((clause) => clause.primaryFactId)).size, 60);
  assert.ok(CLAUSE_CODEBOOK.every((clause) => clause.answerOptions.join("/") === "应/不应/未明"));
  assert.equal(personas.length, 1500);
  assert.deepEqual(
    Object.fromEntries(["literal", "cautious", "conflicted"].map((strategy) => [strategy, personas.filter((persona) => persona.strategy === strategy).length])),
    { literal: 500, cautious: 500, conflicted: 500 }
  );
});

test("BirthSeed pre-generates 120 unique minute Profiles before questioning", () => {
  const pool = createBirthCandidatePool(0);
  assert.equal(pool.candidates.length, 120);
  assert.equal(new Set(pool.candidates.map((candidate) => candidate.minuteOffset)).size, 120);
  assert.equal(new Set(pool.candidates.map((candidate) => Array.from(candidate.factBits).join(""))).size, 120);
  assert.equal(QUESTION_ORDER.length, 60);
  assert.equal(new Set(QUESTION_ORDER).size, 60);
  assert.ok(pool.diagnostics.minimumHammingDistanceAt26 >= 9);
  assert.ok(pool.diagnostics.sameIntervalMinimumDistanceAt26 >= 10);
});

test("sealed inference context cannot read truth and asking does not mutate candidate Profiles", async () => {
  const pool = createBirthCandidatePool(1);
  const before = pool.diagnostics.profileHash;
  const handle = createSealedLifeSession({
    group: "test",
    subjectKey: "SEALED-1",
    pool,
    truthMode: "in_model",
    persona: personas[0]
  });
  assert.equal("truthBits" in handle.context, false);
  assert.equal("trueMinuteOffset" in handle.context, false);
  assert.equal("reveal" in handle, false);
  const answer = await handle.ask(CLAUSE_CODEBOOK[QUESTION_ORDER[0]].id);
  assert.ok(V4_CONFIG.answers.includes(answer.answer));
  assert.equal(pool.diagnostics.profileHash, before);
});

test("model-in locks a candidate; model-out truth is not a candidate Profile", async () => {
  const pool = createBirthCandidatePool(2);
  const inModel = await runInferenceSession(createSealedLifeSession({
    group: "test_in",
    subjectKey: "MODEL-IN-1",
    pool,
    truthMode: "in_model",
    persona: personas[0]
  }));
  const outModel = await runInferenceSession(createSealedLifeSession({
    group: "test_out",
    subjectKey: "MODEL-OUT-1",
    pool,
    truthMode: "out_model",
    persona: personas[0]
  }));
  assert.equal(inModel.truthMatchesAnyCandidate, true);
  assert.equal(outModel.truthMatchesAnyCandidate, false);
  assert.ok(pool.candidates.some((candidate) => candidate.id === inModel.lockedCandidateId));
  assert.ok(pool.candidates.some((candidate) => candidate.id === outModel.lockedCandidateId));
});

test("book generator accepts only locked Profile plus BirthSeed and does not reuse a question", () => {
  const pool = createBirthCandidatePool(3);
  const left = generateLifeBook(pool.candidates[0], pool.birthSeed);
  const replay = generateLifeBook(pool.candidates[0], pool.birthSeed);
  const right = generateLifeBook(pool.candidates[1], pool.birthSeed);
  assert.deepEqual(left, replay);
  assert.notEqual(left.bookHash, right.bookHash);
  assert.ok(CLAUSE_CODEBOOK.every((clause) => !left.text.includes(clause.text)));
  const source = readFileSync(resolve(import.meta.dirname, "..", "book", "generate-book.mjs"), "utf8");
  assert.equal(source.includes("transcript"), false);
  assert.equal(source.includes("answers"), false);
});

test("same sealed input deterministically reproduces transcript, lock, and book", async () => {
  const pool = createBirthCandidatePool(4);
  const create = () => createSealedLifeSession({
    group: "replay",
    subjectKey: "REPLAY-1",
    responseKey: "REPLAY-1",
    pool,
    truthMode: "out_model",
    persona: personas[777]
  });
  const first = await runInferenceSession(create());
  const second = await runInferenceSession(create());
  assert.equal(first.transcriptHash, second.transcriptHash);
  assert.equal(first.lockedProfileHash, second.lockedProfileHash);
  assert.equal(first.bookHash, second.bookHash);
});

test("small end-to-end cohort counts every program session and preserves causal gates", async () => {
  const samples = {
    calibration_in_model: 20,
    validation_in_model_default: 40,
    validation_in_model_noisy: 40,
    validation_out_model: 40,
    extreme_conflict: 20,
    determinism_retest: 10,
    birth_counterfactual: 10
  };
  const report = await runV4Experiment({ sampleOverrides: samples });
  assert.equal(report.executedSessions, Object.values(samples).reduce((sum, value) => sum + value, 0));
  assert.equal(report.architecture.bookGeneratorAcceptsTranscript, false);
  assert.equal(report.architecture.answerMutatesProfile, false);
  assert.equal(report.determinism.exactReplayRate, 1);
  assert.equal(report.metrics.validation_out_model.outsideCandidateRate, 1);
  assert.equal(report.metrics.validation_in_model_default.directQuestionReuseRate, 0);
});

test("formal 50000-session report is aggregate-only and hash consistent", () => {
  const root = resolve(import.meta.dirname, "..");
  const reportText = readFileSync(resolve(root, "reports", "canonical-result.json"), "utf8");
  const report = JSON.parse(reportText);
  assert.equal(report.executedSessions, 50000);
  assert.equal(report.plannedSessions, 50000);
  assert.equal(report.personaCohort.count, 1500);
  assert.equal(report.samples.extreme_conflict, 500);
  assert.equal(report.gateSummary.passed, 30);
  assert.equal(report.gateSummary.failed, 0);
  assert.ok(Object.values(report.gates).flatMap((group) => Object.values(group)).every((gate) => gate.passed));
  assert.equal(report.architecture.bookGeneratorAcceptsTranscript, false);
  assert.equal(report.architecture.answerMutatesProfile, false);
  assert.equal(reportText.includes('"truthBits"'), false);
  assert.equal(reportText.includes('"trueMinuteOffset"'), false);
  assert.equal(reportText.includes('"subjectKey"'), false);
  assert.equal(reportText.includes('"bookText"'), false);

  const core = {
    samples: report.samples,
    metrics: report.metrics,
    pairedNoise: report.pairedNoise,
    determinism: report.determinism,
    birthCounterfactual: report.birthCounterfactual,
    bookSeparation: report.bookSeparation,
    gates: report.gates
  };
  assert.equal(sha256(core), report.commitments.aggregateCore);
  assert.equal(sha256(core), report.reproducibility.resultSha256);

  const sourceFiles = [
    "config/experiment-config.mjs",
    "lib/deterministic.mjs",
    "domain/fact-catalog.mjs",
    "domain/birth-candidate-pool.mjs",
    "personas/build-personas.mjs",
    "book/generate-book.mjs",
    "oracle/sealed-life-session.mjs",
    "runner/inference-policy.mjs",
    "runner/experiment-engine.mjs",
    "runner/run-experiment.mjs",
    "tests/v4.test.mjs"
  ];
  assert.equal(
    sha256(sourceFiles.map((file) => ({ file, sha256: sha256(readFileSync(resolve(root, file), "utf8")) }))),
    report.reproducibility.sourceFilesSha256
  );

  const savedPersonas = JSON.parse(readFileSync(resolve(root, "personas", "generated", "persona-configs.json"), "utf8"));
  assert.equal(savedPersonas.length, 1500);
  const savedClauses = JSON.parse(readFileSync(resolve(root, "artifacts", "clause-codebook.json"), "utf8"));
  assert.equal(savedClauses.length, 60);
  assert.equal(new Set(savedClauses.map((clause) => clause.primaryFactId)).size, 60);
});
