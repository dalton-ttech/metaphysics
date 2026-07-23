import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const inputDirectory = resolve(process.cwd(), process.argv[2] ?? "evaluation/records");
const outputPath = resolve(process.cwd(), process.argv[3] ?? "evaluation/validation-dataset.json");

if (!existsSync(inputDirectory) || !statSync(inputDirectory).isDirectory()) {
  throw new Error(`Record directory not found: ${inputDirectory}`);
}

const files = readdirSync(inputDirectory)
  .filter((file) => /^tieban-validation-.*\.json$/i.test(file))
  .sort();

if (files.length === 0) {
  throw new Error(`No tieban-validation-*.json records found in ${inputDirectory}`);
}

const records = [];
const keys = new Set();
const modelVersions = new Set();
const allowedCohorts = new Set(["cognitive", "calibration", "validation", "retest"]);

for (const file of files) {
  const source = resolve(inputDirectory, file);
  const record = JSON.parse(readFileSync(source, "utf8"));
  if (!record.id || !record.cohort || !Array.isArray(record.truthEventIds) || typeof record.probabilities !== "object") {
    throw new Error(`${basename(source)} is missing id, cohort, truthEventIds, or probabilities.`);
  }
  if (!allowedCohorts.has(record.cohort)) throw new Error(`${basename(source)} has an unsupported cohort: ${record.cohort}`);
  if (!Array.isArray(record.answerTrace) || !Array.isArray(record.responseTimings) || record.answerTrace.length !== record.responseTimings.length) {
    throw new Error(`${basename(source)} must have one response timing for every answer.`);
  }
  if (record.responseTimings.some((item) => !Number.isFinite(item.durationMs) || item.durationMs < 0 || ![1, 2].includes(item.poolSize))) {
    throw new Error(`${basename(source)} has an invalid response timing or question pool size.`);
  }
  if (record.cohort === "cognitive" && (!Array.isArray(record.cognitiveAnnotations) || record.cognitiveAnnotations.length !== record.answerTrace.length)) {
    throw new Error(`${basename(source)} is a cognitive record and needs one comprehension annotation per answer.`);
  }
  if (new Set(record.truthEventIds).size !== record.truthEventIds.length) throw new Error(`${basename(source)} contains duplicate truth labels.`);
  if (Object.keys(record.probabilities).length < 40) {
    throw new Error(`${basename(source)} has an incomplete event probability vector.`);
  }
  const key = `${record.id}::${record.cohort}`;
  if (keys.has(key)) throw new Error(`Duplicate participant/cohort record: ${key}`);
  keys.add(key);
  modelVersions.add(record.modelVersion ?? "unknown");
  records.push(record);
}

if (modelVersions.size !== 1) {
  throw new Error(`Mixed model versions are not allowed: ${[...modelVersions].join(", ")}`);
}

const dataset = {
  version: "1.1.0",
  modelVersion: [...modelVersions][0],
  generatedAt: new Date().toISOString(),
  sourceDirectory: inputDirectory,
  records
};

writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
console.log(`Merged ${records.length} records into ${outputPath}`);
