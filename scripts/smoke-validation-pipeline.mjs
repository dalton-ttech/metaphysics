import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const temporaryDirectory = mkdtempSync(resolve(process.cwd(), ".validation-smoke-"));
const datasetPath = resolve(temporaryDirectory, "dataset.json");
const reportPath = resolve(temporaryDirectory, "report.json");

function probabilities(truthIndex) {
  return Object.fromEntries(Array.from({ length: 48 }, (_, index) => [`event_${index}`, index === truthIndex ? 0.92 : 0.08]));
}

function record(id, cohort, truthIndex, cognitiveAnnotations = []) {
  return {
    id,
    cohort,
    intake: { birthDate: "1990-01-01", gender: "unspecified" },
    truthEventIds: [`event_${truthIndex}`],
    probabilities: probabilities(truthIndex),
    answerTrace: [{ questionId: "q-1", answer: "yes" }],
    responseTimings: [{ questionId: "q-1", answer: "yes", durationMs: 1200, poolSize: 2, phase: "screen" }],
    cognitiveAnnotations,
    completedAt: Date.now(),
    modelVersion: "smoke-v1"
  };
}

function run(script, args) {
  const result = spawnSync(process.execPath, [resolve(process.cwd(), script), ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${script} failed:\n${result.stderr || result.stdout}`);
}

function expectFailure(script, args, expectedMessage) {
  const result = spawnSync(process.execPath, [resolve(process.cwd(), script), ...args], { encoding: "utf8" });
  if (result.status === 0 || !`${result.stderr}${result.stdout}`.includes(expectedMessage)) {
    throw new Error(`${script} did not reject invalid data with: ${expectedMessage}`);
  }
}

try {
  writeFileSync(resolve(temporaryDirectory, "tieban-validation-P-1.json"), JSON.stringify(record("P-1", "calibration", 0)));
  writeFileSync(resolve(temporaryDirectory, "tieban-validation-P-2.json"), JSON.stringify(record("P-2", "validation", 1)));
  writeFileSync(resolve(temporaryDirectory, "tieban-validation-P-2-retest.json"), JSON.stringify(record("P-2", "retest", 1)));
  writeFileSync(resolve(temporaryDirectory, "tieban-validation-P-3-cognitive.json"), JSON.stringify(record("P-3", "cognitive", 2, [{ questionId: "q-1", comprehension: "clear", issue: "none", note: "" }])));

  run("scripts/merge-validation-records.mjs", [temporaryDirectory, datasetPath]);
  run("scripts/evaluate-validation.mjs", [datasetPath, reportPath]);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (report.cohortCounts.calibration !== 1 || report.cohortCounts.validation !== 1 || report.cohortCounts.retest !== 1) throw new Error("Cohort counts are incorrect.");
  if (report.thresholdPolicy.source !== "calibration-cohort-only") throw new Error("Calibration threshold isolation failed.");
  if (report.questionDiagnostics.timedResponses !== 4) throw new Error("Response timing aggregation failed.");
  if (report.comprehensionDiagnostics.annotations !== 1 || report.comprehensionDiagnostics.clearRate !== 1) throw new Error("Comprehension aggregation failed.");
  if (report.testRetest.pairs !== 1 || report.testRetest.jaccard !== 1) throw new Error("Retest pairing failed.");
  if (report.productGates.independentValidationSamplePassed !== false) throw new Error("Small-sample guard failed.");

  const invalidDirectory = resolve(temporaryDirectory, "invalid-cognitive");
  mkdirSync(invalidDirectory);
  writeFileSync(resolve(invalidDirectory, "tieban-validation-invalid.json"), JSON.stringify(record("P-X", "cognitive", 3)));
  expectFailure("scripts/merge-validation-records.mjs", [invalidDirectory, resolve(invalidDirectory, "dataset.json")], "needs one comprehension annotation per answer");

  const mixedDirectory = resolve(temporaryDirectory, "mixed-versions");
  mkdirSync(mixedDirectory);
  writeFileSync(resolve(mixedDirectory, "tieban-validation-a.json"), JSON.stringify(record("P-A", "calibration", 4)));
  writeFileSync(resolve(mixedDirectory, "tieban-validation-b.json"), JSON.stringify({ ...record("P-B", "validation", 5), modelVersion: "smoke-v2" }));
  expectFailure("scripts/merge-validation-records.mjs", [mixedDirectory, resolve(mixedDirectory, "dataset.json")], "Mixed model versions are not allowed");
  console.log("Validation pipeline smoke test passed.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
