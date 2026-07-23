import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { generateCohort } from "../generator/index.mjs";
import { sha256, stableStringify } from "./primitives.mjs";
import { buildQuestionBank } from "./question-bank.mjs";
import { OracleError, SealedOracle } from "./sealed-oracle.mjs";

if (!process.send) throw new Error("The sealed Oracle must be launched as an IPC child process.");

const runDirectory = resolve(process.env.SEALED_RUN_DIRECTORY ?? "artifacts/unassigned");
mkdirSync(runDirectory, { recursive: true });
const hiddenSeed = process.env.SEALED_EXPERIMENT_SEED || randomBytes(32).toString("hex");
const cohort = generateCohort({ seed: hiddenSeed });
const responseSecret = Buffer.from(sha256({ hiddenSeed, purpose: "respondent-noise-v1" }), "hex");
const eventCatalog = cohort.metadata?.eventCatalog;
if (!Array.isArray(eventCatalog) || eventCatalog.length !== 48) throw new Error("Generator must expose all 48 public event definitions as metadata.eventCatalog.");
const profileById = new Map(cohort.profiles.map((profile) => [profile.id, profile]));
const primaryAssignments = new Map();
const policies = ["fixed", "adaptive", "reasoning"];
const poolSizes = [1, 2, 3];
const primaryGroups = new Map();
for (const session of cohort.sessions.filter((item) => !item.retestOf)) {
  const key = `${session.cohort}:${session.respondentMode}`;
  primaryGroups.set(key, [...(primaryGroups.get(key) ?? []), session]);
}
for (const sessions of primaryGroups.values()) {
  sessions.sort((a, b) => sha256(`${hiddenSeed}:${a.id}`).localeCompare(sha256(`${hiddenSeed}:${b.id}`)));
  sessions.forEach((session, index) => {
    primaryAssignments.set(session.id, {
      interviewerPolicy: policies[index % policies.length],
      poolSize: poolSizes[Math.floor(index / policies.length) % poolSizes.length]
    });
  });
}
cohort.sessions = cohort.sessions.map((session) => {
  const profile = profileById.get(session.profileId);
  const assignment = session.retestOf ? primaryAssignments.get(session.retestOf) : primaryAssignments.get(session.id);
  return {
    ...session,
    cohort: session.retestOf ? "retest" : session.cohort,
    ...assignment,
    intake: {
      birthDate: `${2026 - profile.demographics.currentAge}-07-01`,
      gender: profile.demographics.gender === "male" || profile.demographics.gender === "female" ? profile.demographics.gender : "unspecified",
      birthplace: profile.demographics.region,
      focus: "overall"
    }
  };
});
const questionBank = buildQuestionBank(eventCatalog);
const oracle = new SealedOracle({ cohort, eventCatalog, questionBank, responseSecret });
const adminToken = oracle.takeAdminToken();

const archive = oracle.encryptedArchive(adminToken);
writeFileSync(resolve(runDirectory, "encrypted-profiles.json"), `${JSON.stringify(archive)}\n`, "utf8");
const publicMetadata = {
  schemaVersion: "1.0.0",
  modelVersion: archive.modelVersion,
  profiles: cohort.profiles.length,
  sessions: cohort.sessions.length,
  cohortCounts: cohort.metadata?.counts?.byCohort,
  respondentCounts: {
    agentProfiles: cohort.metadata?.counts?.agentProfiles,
    ruleProfiles: cohort.metadata?.counts?.ruleProfiles,
    agentSessions: cohort.metadata?.counts?.agentSessions,
    ruleSessions: cohort.metadata?.counts?.ruleSessions
  },
  seedHash: sha256(hiddenSeed),
  questionBankHash: questionBank.hash,
  encryptedArchiveHash: sha256(archive),
  generatorMetadataHash: sha256(cohort.metadata)
};
writeFileSync(resolve(runDirectory, "public-manifest.json"), `${JSON.stringify(publicMetadata, null, 2)}\n`, "utf8");

function bearer(request) {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

async function jsonBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_000_000) throw new OracleError("BODY_TOO_LARGE", "Request body exceeds 1MB.", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new OracleError("INVALID_JSON", "Request body must be valid JSON.");
  }
}

function respond(response, status, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  response.end(body);
}

let finalizedReport = null;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/health") return respond(response, 200, { ok: true, modelVersion: archive.modelVersion });

    if (request.method === "POST" && url.pathname === "/admin/issue") {
      const body = await jsonBody(request);
      const token = oracle.issueInterviewerToken(bearer(request), body);
      return respond(response, 200, { token });
    }
    if (request.method === "GET" && url.pathname === "/v1/context") {
      const sessions = oracle.listSessions(bearer(request));
      return respond(response, 200, { eventCatalog, questionBank, sessionCount: sessions.length });
    }
    if (request.method === "GET" && url.pathname === "/v1/sessions") return respond(response, 200, { sessions: oracle.listSessions(bearer(request)) });
    if (request.method === "POST" && url.pathname === "/v1/ask") {
      const body = await jsonBody(request);
      return respond(response, 200, oracle.ask(bearer(request), body.sessionId, body.questionId));
    }
    if (request.method === "POST" && url.pathname === "/v1/submit") {
      const body = await jsonBody(request);
      return respond(response, 200, oracle.submit(bearer(request), body.sessionId, body.probabilities));
    }
    if (request.method === "POST" && url.pathname === "/admin/finalize") {
      finalizedReport = oracle.finalizeAndEvaluate(bearer(request));
      writeFileSync(resolve(runDirectory, "metrics.json"), `${JSON.stringify(finalizedReport, null, 2)}\n`, "utf8");
      return respond(response, 200, { report: finalizedReport, reportHash: sha256(finalizedReport) });
    }
    if (request.method === "POST" && url.pathname === "/admin/reveal") {
      const truth = oracle.revealAfterFinalization(bearer(request));
      const revealDirectory = resolve(runDirectory, "reveal");
      mkdirSync(revealDirectory, { recursive: true });
      const revealPath = resolve(revealDirectory, "ground-truth.json");
      writeFileSync(revealPath, `${JSON.stringify({ modelVersion: archive.modelVersion, profiles: truth }, null, 2)}\n`, "utf8");
      return respond(response, 200, { written: true, profiles: truth.length, truthHash: sha256(truth) });
    }
    if (request.method === "GET" && url.pathname === "/admin/audit") return respond(response, 200, oracle.auditProof(bearer(request)));
    if (request.method === "POST" && url.pathname === "/admin/shutdown") {
      oracle.auditProof(bearer(request));
      respond(response, 200, { stopping: true, finalized: Boolean(finalizedReport) });
      return server.close(() => process.exit(0));
    }
    return respond(response, 404, { error: "NOT_FOUND" });
  } catch (error) {
    const status = error instanceof OracleError ? error.status : 500;
    return respond(response, status, { error: error.code ?? "INTERNAL_ERROR", message: status === 500 ? "Internal Oracle error." : error.message });
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.send({
    type: "ready",
    port: address.port,
    adminToken,
    sessionIds: cohort.sessions.map((session) => session.id),
    publicMetadata,
    publicContextHash: sha256(stableStringify({ eventCatalog, questionBank }))
  });
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
