import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AuditChain, sha256 } from "../oracle/primitives.mjs";

const [firstDirectory, secondDirectory] = process.argv.slice(2);
if (!firstDirectory || !secondDirectory) {
  console.error("Usage: node reports/verify-replay.mjs <first-run-directory> <second-run-directory>");
  process.exit(2);
}

function readJson(directory, filename) {
  return JSON.parse(readFileSync(resolve(directory, filename), "utf8"));
}

function stableMetrics(metrics) {
  const copy = structuredClone(metrics);
  delete copy.audit;
  delete copy.generatedAt;
  return copy;
}

const firstMetrics = readJson(firstDirectory, "metrics.json");
const secondMetrics = readJson(secondDirectory, "metrics.json");
const firstAudit = readJson(firstDirectory, "audit-chain.json");
const secondAudit = readJson(secondDirectory, "audit-chain.json");
const firstSummary = readJson(firstDirectory, "run-summary.json");
const secondSummary = readJson(secondDirectory, "run-summary.json");
const firstSeed = readFileSync(resolve(firstDirectory, "reveal", "seed.txt"), "utf8").trim();
const secondSeed = readFileSync(resolve(secondDirectory, "reveal", "seed.txt"), "utf8").trim();

const result = {
  schemaVersion: "1.0.0",
  runIds: [firstSummary.runId, secondSummary.runId],
  seedCommitment: sha256(firstSeed),
  sameSeed: firstSeed === secondSeed,
  coreMetricsSha256: [sha256(stableMetrics(firstMetrics)), sha256(stableMetrics(secondMetrics))],
  coreMetricsEqual: sha256(stableMetrics(firstMetrics)) === sha256(stableMetrics(secondMetrics)),
  auditChainsValid: [AuditChain.verify(firstAudit), AuditChain.verify(secondAudit)]
};

console.log(JSON.stringify(result, null, 2));
if (!result.sameSeed || !result.coreMetricsEqual || !result.auditChainsValid.every(Boolean)) process.exitCode = 1;
