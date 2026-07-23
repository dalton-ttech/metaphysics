import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { AuditChain, decryptRecord, encryptRecord } from "../oracle/primitives.mjs";
import { buildQuestionBank } from "../oracle/question-bank.mjs";
import { OracleError, SealedOracle } from "../oracle/sealed-oracle.mjs";

function catalog() {
  return Array.from({ length: 48 }, (_, index) => ({
    id: `event_${String(index).padStart(2, "0")}`,
    domain: `domain_${index % 8}`,
    label: `事件${index}`,
    description: `事件${index}的公开定义`,
    cue: `曾经历事件${index}`,
    baseRate: 0.08 + index % 5 * 0.02,
    earliestAge: index % 3 === 0 ? 18 : 0,
    salience: 3,
    sensitivity: index % 7 === 0 ? "intense" : "ordinary",
    related: []
  }));
}

test("AES-GCM envelope hides plaintext, round-trips and detects tampering", () => {
  const key = randomBytes(32);
  const truth = { id: "P-1", secretEvent: "wealth_bankruptcy" };
  const envelope = encryptRecord(key, truth.id, truth, "v1");
  assert.equal(JSON.stringify(envelope).includes("wealth_bankruptcy"), false);
  assert.deepEqual(decryptRecord(key, envelope), truth);
  const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}AA` };
  assert.throws(() => decryptRecord(key, tampered));
});

test("audit chain detects modified history", () => {
  const chain = new AuditChain();
  chain.append("one", { a: 1 });
  chain.append("two", { b: 2 });
  const snapshot = chain.snapshot();
  assert.equal(AuditChain.verify(snapshot), true);
  snapshot.entries[0].action = "altered";
  assert.equal(AuditChain.verify(snapshot), false);
});

test("sealed Oracle enforces role, pool, repeat, budget, submission and reveal boundaries", () => {
  const eventCatalog = catalog();
  const questionBank = buildQuestionBank(eventCatalog);
  const profile = {
    id: "P-1",
    cohort: "validation",
    events: [{ id: "event_00", age: 20 }],
    persona: { comprehension: 0.9, memoryReliability: 0.9 }
  };
  const plan = {
    id: "S-1",
    profileId: profile.id,
    cohort: "validation",
    respondentMode: "agent",
    interviewerPolicy: "adaptive",
    poolSize: 1,
    intake: { birthDate: "1990-01-01", gender: "unspecified" },
    retestOf: null
  };
  const oracle = new SealedOracle({ cohort: { profiles: [profile], sessions: [plan] }, eventCatalog, questionBank });
  const admin = oracle.takeAdminToken();
  assert.throws(() => oracle.revealAfterFinalization(admin), (error) => error instanceof OracleError && error.code === "NOT_FINALIZED");
  const interviewer = oracle.issueInterviewerToken(admin, { batchId: "B-1", sessionIds: [plan.id] });
  assert.throws(() => oracle.listSessions("wrong"), (error) => error.code === "UNAUTHORIZED");
  assert.throws(() => oracle.ask(interviewer, plan.id, questionBank.questions.find((question) => question.poolSize === 2).id), (error) => error.code === "POOL_SIZE_MISMATCH");
  const questions = questionBank.questions.filter((question) => question.poolSize === 1).slice(0, 18);
  oracle.ask(interviewer, plan.id, questions[0].id);
  assert.throws(() => oracle.ask(interviewer, plan.id, questions[0].id), (error) => error.code === "REPEATED_QUESTION");
  for (const question of questions.slice(1)) oracle.ask(interviewer, plan.id, question.id);
  const probabilities = Object.fromEntries(eventCatalog.map((event) => [event.id, event.id === "event_00" ? 0.9 : 0.05]));
  oracle.submit(interviewer, plan.id, probabilities);
  assert.throws(() => oracle.ask(interviewer, plan.id, questions[18]?.id ?? questionBank.questions.filter((question) => question.poolSize === 1)[18].id), (error) => error.code === "SESSION_SUBMITTED");
  const report = oracle.finalizeAndEvaluate(admin);
  assert.equal(report.sessions, 1);
  assert.equal(report.validation.highConfidencePrecision, 1);
  assert.equal(oracle.revealAfterFinalization(admin).length, 1);
  assert.equal(AuditChain.verify(oracle.auditProof(admin)), true);
});

test("a supplied response secret makes respondent answers reproducible", () => {
  const eventCatalog = catalog();
  const questionBank = buildQuestionBank(eventCatalog);
  const profile = {
    id: "P-repeat",
    cohort: "validation",
    events: [{ id: "event_00", age: 20 }],
    persona: { comprehension: 0.72, memoryReliability: 0.76, responseConsistency: 0.81 }
  };
  const plan = {
    id: "S-repeat",
    profileId: profile.id,
    cohort: "validation",
    respondentMode: "agent",
    interviewerPolicy: "fixed",
    poolSize: 2,
    intake: { birthDate: "1990-01-01", gender: "unspecified" },
    retestOf: null
  };
  const responseSecret = Buffer.alloc(32, 7);
  const answers = () => {
    const oracle = new SealedOracle({
      cohort: { profiles: [profile], sessions: [plan] },
      eventCatalog,
      questionBank,
      responseSecret
    });
    const admin = oracle.takeAdminToken();
    const interviewer = oracle.issueInterviewerToken(admin, { batchId: "B-repeat", sessionIds: [plan.id] });
    return questionBank.questions
      .filter((question) => question.poolSize === plan.poolSize)
      .slice(0, 18)
      .map((question) => oracle.ask(interviewer, plan.id, question.id).answer);
  };
  assert.deepEqual(answers(), answers());
});
