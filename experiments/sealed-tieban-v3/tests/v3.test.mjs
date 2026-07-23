import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { sha256 } from "../../sealed-synthetic-v1/oracle/primitives.mjs";
import { V3_CONFIG } from "../config/experiment-config.mjs";
import { buildPublicCodebooks } from "../codebook/build-codebooks.mjs";
import { createSealedTiebanArena } from "../oracle/sealed-arena.mjs";
import { TiebanInferencePolicy, expectedInformationGain, runInferenceSession } from "../runner/inference-policy.mjs";

const publicCodebooks = buildPublicCodebooks();

test("engineering codebooks contain 120 unique candidates and 60 atomic clauses", () => {
  const candidates = publicCodebooks.candidateCodebook.candidates;
  const clauses = publicCodebooks.clauseCodebook.clauses;
  assert.equal(candidates.length, 120);
  assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, 120);
  assert.equal(new Set(candidates.map((candidate) => candidate.factIds.join("|"))).size, 120);
  assert.equal(clauses.length, 60);
  assert.equal(new Set(clauses.map((clause) => clause.primaryFactId)).size, clauses.length);
  assert.ok(clauses.every((clause) => clause.answerOptions.join("/") === "应/不应/未明"));
  assert.deepEqual(publicCodebooks.candidateCodebook.diagnostics.uncoveredFacts, []);
  assert.ok(publicCodebooks.candidateCodebook.diagnostics.minimumHammingDistance >= 2);
});

test("information gain prefers a balanced split", () => {
  const posterior = [0.25, 0.25, 0.25, 0.25];
  const balanced = expectedInformationGain({ posterior, candidateHasFact: [true, true, false, false] });
  const skewed = expectedInformationGain({ posterior, candidateHasFact: [true, false, false, false] });
  assert.ok(balanced > skewed);
});

test("sealed context exposes no truth assignment or reveal method", () => {
  const arena = createSealedTiebanArena({
    seed: "sealed-v3-isolation-test",
    sampleOverrides: {
      calibration_default: 120,
      validation_default: 120,
      validation_stress: 0,
      validation_agent: 0,
      recovery_1_wrong: 120,
      recovery_2_wrong: 120,
      retest: 0
    }
  });
  assert.equal("assignments" in arena.context, false);
  assert.equal("truth" in arena.context, false);
  assert.equal("reveal" in arena, false);
  assert.ok(arena.context.sessions.every((session) => !Object.hasOwn(session, "candidateId")));
});

async function runTiny(seed) {
  const arena = createSealedTiebanArena({
    seed,
    sampleOverrides: {
      calibration_default: 24,
      validation_default: 24,
      validation_stress: 24,
      validation_agent: 24,
      recovery_1_wrong: 24,
      recovery_2_wrong: 24,
      retest: 24
    }
  });
  for (const descriptor of arena.context.sessions) {
    await runInferenceSession({
      descriptor,
      candidates: arena.context.candidates,
      clauses: arena.context.clauses,
      ask: (sessionId, clauseId) => arena.ask(sessionId, clauseId),
      submit: (sessionId, prediction, diagnostics) => arena.submit(sessionId, prediction, diagnostics)
    });
  }
  return arena.finalize();
}

test("all sessions stop within 12-26 rounds and forced errors are exact", async () => {
  const result = await runTiny("sealed-v3-round-test");
  for (const metric of Object.values(result.metrics)) {
    assert.ok(metric.minimumRounds === undefined || metric.minimumRounds >= V3_CONFIG.rounds.minimum);
    assert.ok(metric.maximumRounds <= V3_CONFIG.rounds.maximum);
  }
  assert.equal(result.metrics.recovery_1_wrong.forcedWrongAnswers, 24);
  assert.equal(result.metrics.recovery_2_wrong.forcedWrongAnswers, 48);
  assert.equal(
    result.gates.validation_default.averageRoundsMaximum.actual,
    result.metrics.validation_default.averageRounds
  );
  assert.equal(result.gates.validation_default.averageRoundsMaximum.passed, true);
});

test("same seed reproduces aggregate metrics and different seed changes commitments", async () => {
  const first = await runTiny("sealed-v3-repro-test");
  const second = await runTiny("sealed-v3-repro-test");
  const other = createSealedTiebanArena({
    seed: "sealed-v3-other-seed",
    sampleOverrides: {
      calibration_default: 120,
      validation_default: 120,
      validation_stress: 0,
      validation_agent: 0,
      recovery_1_wrong: 120,
      recovery_2_wrong: 120,
      retest: 0
    }
  });
  assert.deepEqual(first.metrics, second.metrics);
  assert.deepEqual(first.retest, second.retest);
  assert.notEqual(first.commitments.seed, other.context.seedCommitment);
});

test("policy never repeats a clause", () => {
  const policy = new TiebanInferencePolicy({
    candidates: publicCodebooks.candidateCodebook.candidates,
    clauses: publicCodebooks.clauseCodebook.clauses
  });
  for (let turn = 0; turn < 20; turn += 1) {
    const selection = policy.nextClause();
    policy.observe(selection, turn % 5 === 0 ? "未明" : turn % 2 ? "应" : "不应");
  }
  assert.equal(new Set(policy.answers.map((answer) => answer.clauseId)).size, policy.answers.length);
});

test("locked formal report is internally consistent and contains only aggregate truth evidence", () => {
  const root = resolve(import.meta.dirname, "..");
  const report = JSON.parse(readFileSync(resolve(root, "reports", "canonical-result.json"), "utf8"));
  const allGates = Object.values(report.gates).flatMap((group) => Object.values(group));
  assert.equal(report.gateSummary.passed, 25);
  assert.equal(report.gateSummary.failed, 0);
  assert.ok(allGates.every((gate) => gate.passed));
  assert.equal(report.gates.validation_default.averageRoundsMaximum.actual, report.metrics.validation_default.averageRounds);
  assert.equal(report.audit.valid, true);
  assert.equal(Object.hasOwn(report, "sessions"), false);
  assert.equal(Object.hasOwn(report, "assignments"), false);
  assert.equal(typeof report.commitments.assignments, "string");

  const core = {
    profileCalibration: report.profileCalibration,
    metrics: report.metrics,
    retest: report.retest,
    gates: report.gates
  };
  assert.equal(sha256(core), report.commitments.coreMetrics);
  assert.equal(sha256(core), report.reproducibility.resultSha256);

  const sourceFiles = [
    "config/experiment-config.mjs",
    "codebook/fact-catalog.mjs",
    "codebook/build-codebooks.mjs",
    "oracle/sealed-arena.mjs",
    "runner/inference-policy.mjs",
    "runner/run-experiment.mjs",
    "runner/reconcile-locked-report.mjs"
  ];
  const sourceHash = sha256(sourceFiles.map((file) => ({
    file,
    hash: sha256(readFileSync(resolve(root, file), "utf8"))
  })));
  assert.equal(sourceHash, report.reproducibility.sourceFilesSha256);
});
