import { randomBytes } from "node:crypto";

import {
  decryptRecord,
  encryptRecord,
  keyedUnitInterval,
  sha256,
  stableStringify
} from "../../sealed-synthetic-v1/oracle/primitives.mjs";
import { V3_CONFIG, buildSampleConfig } from "../config/experiment-config.mjs";
import { buildPublicCodebooks } from "../codebook/build-codebooks.mjs";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const divide = (left, right) => right === 0 ? null : left / right;

function interpolate([minimum, maximum], unit) {
  return minimum + (maximum - minimum) * unit;
}

function shuffledCandidateAssignments(candidateIds, count, secret, label) {
  const repeated = Array.from({ length: count }, (_, index) => candidateIds[index % candidateIds.length]);
  return repeated.map((candidateId, index) => ({
    candidateId,
    order: sha256({ secret, label, index, candidateId })
  })).sort((left, right) => left.order.localeCompare(right.order)).map((item) => item.candidateId);
}

function sessionId(secret, group, index) {
  return `V3-${group}-${sha256({ secret, group, index }).slice(0, 16)}`;
}

function buildSessionPlans({ seed, candidateIds, samples }) {
  const plans = [];
  const assignments = new Map();
  const addIndependentGroup = (group, count, scenario, forcedWrongAnswers = 0) => {
    const candidateAssignments = shuffledCandidateAssignments(candidateIds, count, seed, group);
    for (let index = 0; index < count; index += 1) {
      const id = sessionId(seed, group, index);
      const subjectKey = sha256({ seed, group, subject: index });
      plans.push({ id, group, scenario, retestOf: null });
      assignments.set(id, { candidateId: candidateAssignments[index], subjectKey, forcedWrongAnswers });
    }
  };

  addIndependentGroup("calibration_default", samples.calibration_default, "default");

  const validationAssignments = shuffledCandidateAssignments(candidateIds, samples.validation_default, seed, "matched-validation");
  const validationBase = [];
  for (let index = 0; index < samples.validation_default; index += 1) {
    const candidateId = validationAssignments[index];
    const subjectKey = sha256({ seed, group: "matched-validation", subject: index });
    const primaryId = sessionId(seed, "validation_default", index);
    validationBase.push({ primaryId, candidateId, subjectKey });
    plans.push({ id: primaryId, group: "validation_default", scenario: "default", retestOf: null });
    assignments.set(primaryId, { candidateId, subjectKey, forcedWrongAnswers: 0 });

    const recovery1Id = sessionId(seed, "recovery_1_wrong", index);
    plans.push({ id: recovery1Id, group: "recovery_1_wrong", scenario: "default", retestOf: null });
    assignments.set(recovery1Id, { candidateId, subjectKey, forcedWrongAnswers: 1 });

    const recovery2Id = sessionId(seed, "recovery_2_wrong", index);
    plans.push({ id: recovery2Id, group: "recovery_2_wrong", scenario: "default", retestOf: null });
    assignments.set(recovery2Id, { candidateId, subjectKey, forcedWrongAnswers: 2 });
  }

  const stressAssignments = shuffledCandidateAssignments(candidateIds, samples.validation_stress, seed, "validation_stress");
  for (let index = 0; index < samples.validation_stress; index += 1) {
    const id = sessionId(seed, "validation_stress", index);
    plans.push({ id, group: "validation_stress", scenario: "stress", retestOf: null });
    assignments.set(id, { candidateId: stressAssignments[index], subjectKey: sha256({ seed, group: "stress", subject: index }), forcedWrongAnswers: 0 });
  }

  const agentAssignments = shuffledCandidateAssignments(candidateIds, samples.validation_agent, seed, "validation_agent");
  for (let index = 0; index < samples.validation_agent; index += 1) {
    const id = sessionId(seed, "validation_agent", index);
    plans.push({ id, group: "validation_agent", scenario: "agent_persona", retestOf: null });
    assignments.set(id, { candidateId: agentAssignments[index], subjectKey: sha256({ seed, group: "agent", subject: index }), forcedWrongAnswers: 0 });
  }

  for (let index = 0; index < samples.retest; index += 1) {
    const original = validationBase[index % validationBase.length];
    const id = sessionId(seed, "retest", index);
    plans.push({ id, group: "retest", scenario: "retest", retestOf: original.primaryId });
    assignments.set(id, { candidateId: original.candidateId, subjectKey: original.subjectKey, forcedWrongAnswers: 0 });
  }
  return { plans, assignments };
}

function responseParameters(scenario, subjectKey, secret) {
  const config = V3_CONFIG.responseScenarios[scenario];
  if (scenario !== "agent_persona") return config;
  return {
    errorRate: interpolate(config.errorRate, keyedUnitInterval(secret, subjectKey, "agent-error")),
    unknownRate: interpolate(config.unknownRate, keyedUnitInterval(secret, subjectKey, "agent-unknown")),
    stableWeight: interpolate(config.stableWeight, keyedUnitInterval(secret, subjectKey, "agent-stability"))
  };
}

function answerFor({ assignment, plan, clause, trueFacts, responseSecret, turn }) {
  const actual = trueFacts.has(clause.primaryFactId);
  const parameters = responseParameters(plan.scenario, assignment.subjectKey, responseSecret);
  const stableKey = `${assignment.subjectKey}:${clause.id}`;
  const variableKey = `${plan.id}:${clause.id}`;
  const choose = (label) => {
    const stable = keyedUnitInterval(responseSecret, stableKey, label);
    const variable = keyedUnitInterval(responseSecret, variableKey, label);
    return parameters.stableWeight * stable + (1 - parameters.stableWeight) * variable;
  };
  let answer;
  if (choose("unknown") < parameters.unknownRate) answer = "未明";
  else {
    const correct = actual ? "应" : "不应";
    const incorrect = actual ? "不应" : "应";
    answer = choose("error") < parameters.errorRate ? incorrect : correct;
  }
  let forcedWrong = false;
  if (turn <= assignment.forcedWrongAnswers) {
    answer = actual ? "不应" : "应";
    forcedWrong = true;
  }
  return { answer, actual, forcedWrong, parameters };
}

function profileMetric(records, threshold) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let jaccardSum = 0;
  for (const record of records) {
    const truth = record.trueFacts;
    const predicted = new Set(Object.entries(record.prediction.factProbabilities).filter(([, probability]) => probability >= threshold).map(([factId]) => factId));
    const intersection = [...predicted].filter((factId) => truth.has(factId)).length;
    const union = new Set([...predicted, ...truth]).size;
    tp += intersection;
    fp += predicted.size - intersection;
    fn += truth.size - intersection;
    jaccardSum += union ? intersection / union : 1;
  }
  return {
    threshold,
    precision: divide(tp, tp + fp),
    recall: divide(tp, tp + fn),
    jaccard: divide(jaccardSum, records.length),
    truePositiveFacts: tp,
    falsePositiveFacts: fp,
    falseNegativeFacts: fn
  };
}

function calibrateProfileThreshold(records) {
  const config = V3_CONFIG.profileCalibration;
  const count = Math.round((config.thresholdMaximum - config.thresholdMinimum) / config.thresholdStep) + 1;
  const scored = Array.from({ length: count }, (_, index) =>
    profileMetric(records, Number((config.thresholdMinimum + index * config.thresholdStep).toFixed(2)))
  );
  const eligible = scored.filter((item) => (item.precision ?? 0) >= config.precisionTarget);
  const choice = [...(eligible.length ? eligible : scored)].sort((left, right) =>
    (right.recall ?? -1) - (left.recall ?? -1) || (right.precision ?? -1) - (left.precision ?? -1) || left.threshold - right.threshold
  )[0];
  return { ...choice, precisionTargetFound: eligible.length > 0 };
}

function groupMetric(records, profileThreshold) {
  const top1 = records.filter((record) => record.prediction.topCandidateIds[0] === record.candidateId).length;
  const top3 = records.filter((record) => record.prediction.topCandidateIds.includes(record.candidateId)).length;
  const rounds = records.map((record) => record.prediction.rounds).sort((a, b) => a - b);
  const forcedWrongAnswers = records.reduce((sum, record) => sum + record.forcedWrongAnswers, 0);
  return {
    sessions: records.length,
    top1Accuracy: divide(top1, records.length),
    top3Accuracy: divide(top3, records.length),
    averageRounds: divide(rounds.reduce((sum, value) => sum + value, 0), rounds.length),
    minimumRounds: rounds[0] ?? null,
    medianRounds: rounds[Math.floor(rounds.length / 2)] ?? null,
    p90Rounds: rounds[Math.floor(rounds.length * 0.9)] ?? null,
    maximumRounds: rounds.at(-1) ?? null,
    stoppedBeforeMaximumRate: divide(rounds.filter((value) => value < V3_CONFIG.rounds.maximum).length, rounds.length),
    forcedWrongAnswers,
    profile: profileMetric(records, profileThreshold)
  };
}

function setJaccard(left, right) {
  const union = new Set([...left, ...right]);
  return union.size ? [...left].filter((value) => right.has(value)).length / union.size : 1;
}

function evaluateGates(metrics, retest) {
  const output = {};
  for (const [group, gates] of Object.entries(V3_CONFIG.gates)) {
    const values = group === "retest" ? retest : metrics[group];
    output[group] = Object.fromEntries(Object.entries(gates).map(([key, threshold]) => {
      const profileField = { profilePrecision: "precision", profileRecall: "recall", profileJaccard: "jaccard" }[key];
      const metricKey = key === "averageRoundsMaximum" ? "averageRounds" : key;
      const actual = profileField && values.profile ? values.profile[profileField] : values[metricKey];
      const maximum = key.endsWith("Maximum");
      return [key, { threshold, actual, passed: maximum ? actual <= threshold : actual >= threshold }];
    }));
  }
  return output;
}

export function createSealedTiebanArena({ seed, sampleOverrides = {}, candidateSeed } = {}) {
  if (!seed) throw new Error("A hidden experiment seed is required.");
  const { clauseCodebook, candidateCodebook } = buildPublicCodebooks({ seed: candidateSeed });
  const candidates = candidateCodebook.candidates;
  const clauses = clauseCodebook.clauses;
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const samples = buildSampleConfig(sampleOverrides);
  const { plans, assignments } = buildSessionPlans({ seed, candidateIds: candidates.map((candidate) => candidate.id), samples });
  const assignmentCommitment = sha256([...assignments]);
  const masterKey = randomBytes(32);
  const responseSecret = Buffer.from(sha256({ seed, purpose: "tieban-v3-responses" }), "hex");
  const encryptedAssignments = new Map(
    [...assignments].map(([id, assignment]) => [id, encryptRecord(masterKey, id, assignment, V3_CONFIG.version)])
  );
  assignments.clear();
  const clauseById = new Map(clauses.map((clause) => [clause.id, clause]));
  const state = new Map(plans.map((plan) => [plan.id, { asked: [], prediction: null, diagnostics: null }]));
  let finalized = false;
  let auditHead = "0".repeat(64);
  let auditEntries = 0;
  const audit = (type, payload) => {
    auditHead = sha256({ previous: auditHead, sequence: ++auditEntries, type, payload });
  };
  audit("initialized", { sessions: plans.length, candidates: candidates.length, clauses: clauses.length });

  const assignmentFor = (id) => decryptRecord(masterKey, encryptedAssignments.get(id));
  const planFor = (id) => {
    const plan = plans.find((item) => item.id === id);
    if (!plan) throw new Error(`Unknown session: ${id}`);
    return plan;
  };

  return {
    context: {
      modelVersion: V3_CONFIG.version,
      candidates,
      clauses,
      sessions: plans.map((plan) => ({ ...plan })),
      candidateCodebookHash: candidateCodebook.hash,
      clauseCodebookHash: clauseCodebook.hash,
      seedCommitment: sha256({ seed, purpose: "seed-commitment" }),
      publicContextHash: sha256(stableStringify({ candidates, clauses, samples, rounds: V3_CONFIG.rounds })),
      candidateDiagnostics: candidateCodebook.diagnostics
    },
    ask(sessionId, clauseId) {
      if (finalized) throw new Error("Experiment already finalized.");
      const plan = planFor(sessionId);
      const sessionState = state.get(sessionId);
      if (sessionState.prediction) throw new Error("Session already submitted.");
      if (sessionState.asked.length >= V3_CONFIG.rounds.maximum) throw new Error("Round budget exceeded.");
      if (sessionState.asked.some((item) => item.clauseId === clauseId)) throw new Error("Clause repeated.");
      const clause = clauseById.get(clauseId);
      if (!clause) throw new Error(`Unknown clause: ${clauseId}`);
      const assignment = assignmentFor(sessionId);
      const candidate = candidateById.get(assignment.candidateId);
      const result = answerFor({
        assignment,
        plan,
        clause,
        trueFacts: new Set(candidate.factIds),
        responseSecret,
        turn: sessionState.asked.length + 1
      });
      sessionState.asked.push({ clauseId, answer: result.answer, forcedWrong: result.forcedWrong });
      audit("answer", { sessionId, clauseId, answer: result.answer, turn: sessionState.asked.length });
      return { answer: result.answer, answered: sessionState.asked.length, remaining: V3_CONFIG.rounds.maximum - sessionState.asked.length };
    },
    submit(sessionId, prediction, diagnostics) {
      if (finalized) throw new Error("Experiment already finalized.");
      const sessionState = state.get(sessionId);
      if (!sessionState) throw new Error(`Unknown session: ${sessionId}`);
      if (sessionState.asked.length < V3_CONFIG.rounds.minimum || sessionState.asked.length > V3_CONFIG.rounds.maximum) throw new Error("Prediction outside round bounds.");
      if (candidates.some((candidate) => !Number.isFinite(prediction.candidateProbabilities[candidate.id]))) throw new Error("Candidate posterior incomplete.");
      if (clauses.some((clause) => !Number.isFinite(prediction.factProbabilities[clause.primaryFactId]))) throw new Error("Fact posterior incomplete.");
      sessionState.prediction = structuredClone(prediction);
      sessionState.diagnostics = structuredClone(diagnostics);
      const predictionHash = sha256(prediction);
      audit("submit", { sessionId, predictionHash, rounds: sessionState.asked.length });
      return { accepted: true, predictionHash };
    },
    finalize() {
      if (finalized) throw new Error("Experiment already finalized.");
      const missing = [...state.values()].filter((item) => !item.prediction).length;
      if (missing) throw new Error(`${missing} sessions are incomplete.`);
      const records = plans.map((plan) => {
        const assignment = assignmentFor(plan.id);
        const sessionState = state.get(plan.id);
        return {
          ...plan,
          candidateId: assignment.candidateId,
          trueFacts: new Set(candidateById.get(assignment.candidateId).factIds),
          prediction: sessionState.prediction,
          forcedWrongAnswers: sessionState.asked.filter((item) => item.forcedWrong).length
        };
      });
      const calibrationRecords = records.filter((record) => record.group === "calibration_default");
      const profileCalibration = calibrateProfileThreshold(calibrationRecords);
      const metrics = Object.fromEntries(
        Object.keys(samples).filter((group) => group !== "retest").map((group) => [
          group,
          groupMetric(records.filter((record) => record.group === group), profileCalibration.threshold)
        ])
      );
      const retestRecords = records.filter((record) => record.group === "retest");
      const retestPairs = retestRecords.map((repeat) => {
        const original = records.find((record) => record.id === repeat.retestOf);
        const threshold = profileCalibration.threshold;
        const profileA = new Set(Object.entries(original.prediction.factProbabilities).filter(([, p]) => p >= threshold).map(([id]) => id));
        const profileB = new Set(Object.entries(repeat.prediction.factProbabilities).filter(([, p]) => p >= threshold).map(([id]) => id));
        return {
          top1Agreement: Number(original.prediction.topCandidateIds[0] === repeat.prediction.topCandidateIds[0]),
          top3Jaccard: setJaccard(new Set(original.prediction.topCandidateIds), new Set(repeat.prediction.topCandidateIds)),
          profileJaccard: setJaccard(profileA, profileB)
        };
      });
      const retest = {
        pairs: retestPairs.length,
        top1Agreement: divide(retestPairs.reduce((sum, item) => sum + item.top1Agreement, 0), retestPairs.length),
        top3Jaccard: divide(retestPairs.reduce((sum, item) => sum + item.top3Jaccard, 0), retestPairs.length),
        profileJaccard: divide(retestPairs.reduce((sum, item) => sum + item.profileJaccard, 0), retestPairs.length)
      };
      const gates = evaluateGates(metrics, retest);
      const reportCore = { profileCalibration, metrics, retest, gates };
      finalized = true;
      audit("finalize", { coreHash: sha256(reportCore) });
      return {
        schemaVersion: "sealed-tieban-v3-result-v1",
        modelVersion: V3_CONFIG.version,
        samples,
        codebooks: {
          candidateCount: candidates.length,
          clauseCount: clauses.length,
          candidateHash: candidateCodebook.hash,
          clauseHash: clauseCodebook.hash,
          diagnostics: candidateCodebook.diagnostics
        },
        rounds: V3_CONFIG.rounds,
        profileCalibration,
        metrics,
        retest,
        gates,
        gateSummary: {
          passed: Object.values(gates).flatMap(Object.values).filter((gate) => gate.passed).length,
          failed: Object.values(gates).flatMap(Object.values).filter((gate) => !gate.passed).length
        },
        commitments: {
          seed: sha256({ seed, purpose: "seed-commitment" }),
          assignments: assignmentCommitment,
          publicContext: sha256(stableStringify({ candidates, clauses, samples, rounds: V3_CONFIG.rounds })),
          coreMetrics: sha256(reportCore)
        },
        audit: { valid: true, entries: auditEntries, head: auditHead }
      };
    }
  };
}
