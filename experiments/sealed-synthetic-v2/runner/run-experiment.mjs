import { randomBytes } from "node:crypto";
import { fork } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderExperimentReport } from "../../sealed-synthetic-v1/reports/render-report.mjs";

const experimentRoot = resolve(import.meta.dirname, "..");
const seedFileIndex = process.argv.indexOf("--replay-seed-file");
const experimentSeed = seedFileIndex >= 0
  ? readFileSync(resolve(process.argv[seedFileIndex + 1]), "utf8").trim()
  : randomBytes(32).toString("hex");
const runId = `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${randomBytes(4).toString("hex")}`;
const runDirectory = resolve(experimentRoot, "artifacts", runId);
mkdirSync(runDirectory, { recursive: true });

function waitForMessage(child, predicate, timeoutMs = 30_000) {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for child process.")), timeoutMs);
    const onMessage = (message) => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      child.off("message", onMessage);
      resolveMessage(message);
    };
    child.on("message", onMessage);
    child.once("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Child process exited with code ${code}.`));
      }
    });
  });
}

async function api(baseUrl, token, path, body = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${payload.error ?? response.status}: ${payload.message ?? "request failed"}`);
  return payload;
}

const oracle = fork(resolve(experimentRoot, "oracle", "server.mjs"), [], {
  cwd: experimentRoot,
  env: { ...process.env, SEALED_RUN_DIRECTORY: runDirectory, SEALED_EXPERIMENT_SEED: experimentSeed },
  stdio: ["ignore", "pipe", "pipe", "ipc"]
});
let oracleError = "";
oracle.stderr.on("data", (chunk) => { oracleError += chunk.toString(); });

try {
  const ready = await waitForMessage(oracle, (message) => message.type === "ready");
  const baseUrl = `http://127.0.0.1:${ready.port}`;
  const issued = await api(baseUrl, ready.adminToken, "/admin/issue", { batchId: runId, sessionIds: ready.sessionIds });
  const interviewer = fork(resolve(experimentRoot, "runner", "client-process.mjs"), [], {
    cwd: experimentRoot,
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  let interviewerError = "";
  interviewer.stderr.on("data", (chunk) => { interviewerError += chunk.toString(); });
  interviewer.on("message", (message) => {
    if (message.type === "progress") process.stdout.write(`\rBlind sessions: ${message.completed}/${message.total}`);
  });
  interviewer.send({ type: "run", baseUrl, interviewerToken: issued.token });
  const completed = await waitForMessage(interviewer, (message) => message.type === "complete" || message.type === "failed", 300_000);
  if (completed.type === "failed") throw new Error(`Interviewer failed: ${completed.message}\n${interviewerError}`);
  await new Promise((resolveExit) => interviewer.once("exit", resolveExit));
  process.stdout.write("\n");

  const finalized = await api(baseUrl, ready.adminToken, "/admin/finalize");
  const revealed = await api(baseUrl, ready.adminToken, "/admin/reveal");
  writeFileSync(resolve(runDirectory, "reveal", "seed.txt"), `${experimentSeed}\n`, "utf8");
  const auditResponse = await fetch(`${baseUrl}/admin/audit`, { headers: { authorization: `Bearer ${ready.adminToken}` } });
  const audit = await auditResponse.json();
  writeFileSync(resolve(runDirectory, "audit-chain.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  writeFileSync(resolve(runDirectory, "run-summary.json"), `${JSON.stringify({
    runId,
    reportHash: finalized.reportHash,
    truthHash: revealed.truthHash,
    sessions: completed.sessions,
    broadQuestions: completed.broadQuestions,
    verificationQuestions: completed.verificationQuestions,
    publicMetadata: ready.publicMetadata
  }, null, 2)}\n`, "utf8");
  const rendered = renderExperimentReport({ report: finalized.report, publicMetadata: ready.publicMetadata, runDirectory });
  await api(baseUrl, ready.adminToken, "/admin/shutdown");
  console.log(JSON.stringify({
    runId,
    runDirectory,
    reportHash: finalized.reportHash,
    sessions: completed.sessions,
    policyDesign: ready.publicMetadata.policyDesign,
    validation: {
      sessions: finalized.report.validation.sessions,
      highConfidencePrecision: finalized.report.validation.highConfidencePrecision,
      majorEventRecall: finalized.report.validation.majorEventRecall,
      candidatePrecision: finalized.report.validation.recallTierPrecision,
      candidateF1: finalized.report.validation.weightedF1,
      highConfidenceFalsePositiveRate: finalized.report.validation.highConfidenceFalsePositiveRate,
      brierScore: finalized.report.validation.brierScore,
      averageQuestions: finalized.report.validation.averageQuestions
    },
    rendered
  }, null, 2));
} catch (error) {
  oracle.kill("SIGTERM");
  throw new Error(`${error.message}${oracleError ? `\nOracle stderr:\n${oracleError}` : ""}`);
}
