import { randomBytes } from "node:crypto";

import { generateCohort } from "../../sealed-synthetic-v1/generator/index.mjs";
import {
  decryptRecord,
  encryptRecord,
  keyedUnitInterval,
  sha256,
  stableStringify
} from "../../sealed-synthetic-v1/oracle/primitives.mjs";
import { buildV2QuestionBank } from "../../sealed-synthetic-v2/oracle/question-bank.mjs";
import { V23_POLICY_CONFIG, buildGeneratorConfig } from "../config/experiment-config.mjs";

const clamp = (value, minimum = 0.001, maximum = 0.999) => Math.max(minimum, Math.min(maximum, value));
const divide = (a, b) => (b === 0 ? null : a / b);

function truthIds(profile) {
  return new Set((profile.events ?? []).map((event) => (typeof event === "string" ? event : event.id)));
}

function defaultPersona(profile) {
  const reading = profile.persona?.readingComprehension ?? 0.9;
  const orSkill = profile.persona?.orInterpretationSkill ?? reading;
  return {
    comprehension: clamp(profile.persona?.comprehension ?? (reading + orSkill) / 2),
    memoryReliability: clamp(profile.persona?.memoryReliability ?? profile.memory?.recallFidelity ?? 0.9),
    falseMemoryRate: clamp(profile.persona?.falseMemoryRate ?? profile.memory?.falsePositiveTendency ?? 0.025, 0, 0.4),
    unsureTendency: clamp(profile.persona?.unsureTendency ?? 0.02 + (profile.persona?.responseCaution ?? 0.5) * 0.06, 0, 0.5),
    sensitivityAvoidance: clamp(profile.persona?.sensitivityAvoidance ?? 1 - (profile.persona?.sensitiveDisclosure ?? 0.95), 0, 0.7),
    responseConsistency: clamp(profile.persona?.responseConsistency ?? 1 - (profile.memory?.retestDrift ?? 0.1)),
    acquiescence: clamp(profile.persona?.acquiescence ?? 0.02, 0, 0.3)
  };
}

function answerQuestion({ profile, session, question, eventById, responseSecret }) {
  const truth = truthIds(profile);
  const persona = defaultPersona(profile);
  const sensitivity = clamp(
    Math.max(...question.eventIds.map((id) => ({ ordinary: 0, private: 0.05, intense: 0.11 }[eventById[id]?.sensitivity ?? "ordinary"]))) -
      (question.sensitivityRelief ?? 0),
    0,
    0.2
  );
  const comprehension = clamp(persona.comprehension + (question.clarityBoost ?? 0));
  const idealAny = question.eventIds.some((id) => truth.has(id));
  const stableKey = `${profile.id}:${question.id}`;
  // baseSessionId deliberately excludes K: every arm receives the same answer to the same question.
  const sessionKey = `${session.baseSessionId}:${question.id}`;
  const choose = (label) => {
    const stable = keyedUnitInterval(responseSecret, stableKey, label);
    const variable = keyedUnitInterval(responseSecret, sessionKey, label);
    return persona.responseConsistency * stable + (1 - persona.responseConsistency) * variable;
  };

  if (session.respondentMode === "rule") {
    const unsureRate = clamp(persona.unsureTendency + sensitivity * persona.sensitivityAvoidance + (question.poolSize - 1) * 0.012, 0, 0.6);
    if (choose("unsure") < unsureRate) return { answer: "unsure", comprehension: "clear", expected: idealAny };
    const falseNegative = 0.035 + (1 - persona.memoryReliability) * 0.32 + sensitivity * 0.28;
    const falsePositive = 0.018 + persona.falseMemoryRate + persona.acquiescence;
    const answer = idealAny ? choose("fn") >= falseNegative : choose("fp") < falsePositive;
    return { answer: answer ? "yes" : "no", comprehension: "clear", expected: idealAny };
  }

  const misunderstanding = clamp((1 - comprehension) * (0.65 + question.poolSize * 0.2), 0, 0.7);
  const understood = choose("comprehension") >= misunderstanding;
  const recalled = question.eventIds.map((id, index) => {
    const actual = truth.has(id);
    if (actual) return choose(`remember-${index}`) < persona.memoryReliability - sensitivity * 0.18;
    return choose(`false-memory-${index}`) < persona.falseMemoryRate;
  });
  const interpretedTruth = understood ? recalled.some(Boolean) : recalled.every(Boolean);
  const unsureRate = clamp(persona.unsureTendency + (understood ? 0 : 0.12) + sensitivity * persona.sensitivityAvoidance + (question.poolSize - 1) * 0.02, 0, 0.7);
  if (choose("unsure") < unsureRate) return { answer: "unsure", comprehension: understood ? "clear" : "failed", expected: idealAny };
  const biasedTruth = interpretedTruth || (!interpretedTruth && choose("acquiescence") < persona.acquiescence);
  return { answer: biasedTruth ? "yes" : "no", comprehension: understood ? "clear" : "failed", expected: idealAny };
}

function metric(records, eventCatalog, highThreshold, candidateThreshold) {
  let tpHigh = 0;
  let predictedHigh = 0;
  let tpCandidate = 0;
  let predictedCandidate = 0;
  let truthCount = 0;
  let falseHigh = 0;
  let negativeCount = 0;
  let brier = 0;
  let cells = 0;
  const perEvent = Object.fromEntries(
    eventCatalog.map((event) => [event.id, { eventId: event.id, support: 0, tp: 0, fp: 0, fn: 0 }])
  );

  for (const record of records) {
    const truth = truthIds(record.profile);
    truthCount += truth.size;
    for (const event of eventCatalog) {
      const probability = record.probabilities[event.id] ?? 0;
      const actual = truth.has(event.id);
      const high = probability >= highThreshold;
      const candidate = probability >= candidateThreshold;
      if (!actual) negativeCount += 1;
      if (high) predictedHigh += 1;
      if (high && actual) tpHigh += 1;
      if (high && !actual) falseHigh += 1;
      if (candidate) predictedCandidate += 1;
      if (candidate && actual) tpCandidate += 1;
      brier += (probability - Number(actual)) ** 2;
      cells += 1;
      const item = perEvent[event.id];
      if (actual) item.support += 1;
      if (candidate && actual) item.tp += 1;
      else if (candidate) item.fp += 1;
      else if (actual) item.fn += 1;
    }
  }

  const highPrecision = divide(tpHigh, predictedHigh);
  const highRecall = divide(tpHigh, truthCount);
  const candidatePrecision = divide(tpCandidate, predictedCandidate);
  const candidateRecall = divide(tpCandidate, truthCount);
  const candidateF1 = candidatePrecision === null || candidateRecall === null || candidatePrecision + candidateRecall === 0
    ? null
    : (2 * candidatePrecision * candidateRecall) / (candidatePrecision + candidateRecall);
  const perEventRows = Object.values(perEvent).map((item) => ({
    ...item,
    precision: divide(item.tp, item.tp + item.fp),
    recall: divide(item.tp, item.tp + item.fn)
  }));
  const supported = perEventRows.filter((item) => item.support > 0 && item.recall !== null);
  const worst = [...supported].sort((a, b) => a.recall - b.recall || a.eventId.localeCompare(b.eventId))[0] ?? null;
  return {
    sessions: records.length,
    highConfidencePrecision: highPrecision,
    highConfidenceRecall: highRecall,
    highConfidencePredictions: predictedHigh,
    candidatePrecision,
    candidateRecall,
    candidateF1,
    candidatePredictions: predictedCandidate,
    truthEvents: truthCount,
    minimumPerEventRecall: worst?.recall ?? null,
    minimumRecallEvent: worst ? { eventId: worst.eventId, recall: worst.recall, support: worst.support } : null,
    medianPerEventRecall: supported.length
      ? [...supported].sort((a, b) => a.recall - b.recall)[Math.floor(supported.length / 2)].recall
      : null,
    zeroRecallEvents: supported.filter((item) => item.recall === 0).map((item) => item.eventId),
    brierScore: divide(brier, cells),
    highConfidenceFalsePositiveRate: divide(falseHigh, negativeCount),
    averageQuestions: divide(records.reduce((sum, record) => sum + record.answers.length, 0), records.length),
    perEvent: perEventRows
  };
}

function calibrate(records, eventCatalog) {
  const candidates = Array.from({ length: 85 }, (_, index) => Number((0.15 + index * 0.01).toFixed(2)));
  const scored = candidates.map((threshold) => {
    const score = metric(records, eventCatalog, threshold, threshold);
    return {
      threshold,
      highPrecision: score.highConfidencePrecision,
      recall: score.candidateRecall,
      precision: score.candidatePrecision,
      f1: score.candidateF1,
      predicted: score.candidatePredictions
    };
  });
  const highEligible = scored.filter(
    (item) => item.predicted > 0 && (item.highPrecision ?? 0) >= V23_POLICY_CONFIG.calibration.highPrecisionTarget
  );
  const high = highEligible.length
    ? [...highEligible].sort(
        (a, b) => (b.recall ?? -1) - (a.recall ?? -1) || (b.highPrecision ?? -1) - (a.highPrecision ?? -1) || a.threshold - b.threshold
      )[0]
    : [...scored.filter((item) => item.predicted > 0)].sort(
        (a, b) => (b.highPrecision ?? -1) - (a.highPrecision ?? -1) || (b.recall ?? -1) - (a.recall ?? -1) || b.threshold - a.threshold
      )[0];
  const candidateEligible = scored.filter(
    (item) =>
      (item.recall ?? 0) >= V23_POLICY_CONFIG.calibration.candidateRecallFloor &&
      (item.precision ?? 0) >= V23_POLICY_CONFIG.calibration.candidatePrecisionFloor
  );
  const candidate = [...(candidateEligible.length ? candidateEligible : scored)].sort(
    (a, b) => (b.f1 ?? -1) - (a.f1 ?? -1) || (b.precision ?? -1) - (a.precision ?? -1) || b.threshold - a.threshold
  )[0];
  return {
    highConfidence: high.threshold,
    candidate: candidate.threshold,
    highPrecisionTargetFound: highEligible.length > 0,
    candidateTargetFound: candidateEligible.length > 0,
    calibrationHigh: high,
    calibrationCandidate: candidate
  };
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  return [...left].filter((id) => right.has(id)).length / union.size;
}

function summarizeSelections(records) {
  const selections = records.flatMap((record) => record.diagnostics?.selections ?? []);
  const byEvent = {};
  for (const item of selections) byEvent[item.eventId] = (byEvent[item.eventId] ?? 0) + 1;
  return {
    questions: selections.length,
    preferredRangeRate: divide(selections.filter((item) => item.preferredRange).length, selections.length),
    meanPosteriorBefore: divide(selections.reduce((sum, item) => sum + item.posteriorBefore, 0), selections.length),
    meanExpectedInformationGain: divide(selections.reduce((sum, item) => sum + item.expectedInformationGain, 0), selections.length),
    topEvents: Object.entries(byEvent)
      .map(([eventId, asked]) => ({ eventId, asked }))
      .sort((a, b) => b.asked - a.asked || a.eventId.localeCompare(b.eventId))
      .slice(0, 10)
  };
}

export function createSealedArena({ seed, respondentMode, scenario = "default", kValues, samplePlan }) {
  const generatorConfig = buildGeneratorConfig({ respondentMode, scenario, samplePlan });
  const cohort = generateCohort({ seed, config: generatorConfig });
  const eventCatalog = cohort.metadata.eventCatalog;
  const eventById = Object.fromEntries(eventCatalog.map((event) => [event.id, event]));
  const questionBank = buildV2QuestionBank(eventCatalog);
  const masterKey = randomBytes(32);
  const responseSecret = Buffer.from(sha256({ seed, respondentMode, scenario, purpose: "v2.3-matched-response-noise" }), "hex");
  const encryptedProfiles = new Map(
    cohort.profiles.map((profile) => [profile.id, encryptRecord(masterKey, profile.id, profile, `sealed-synthetic-v2.3-${respondentMode}-${scenario}`)])
  );
  const profileLookup = new Map(cohort.profiles.map((profile) => [profile.id, profile]));
  const descriptors = cohort.sessions.map((session) => {
    const profile = profileLookup.get(session.profileId);
    return {
      id: session.id,
      baseSessionId: session.id,
      profileId: session.profileId,
      cohort: session.retestOf ? "retest" : session.cohort,
      respondentMode: session.respondentMode,
      retestOf: session.retestOf ?? null,
      poolSize: 2,
      intake: {
        birthDate: `${2026 - profile.demographics.currentAge}-07-01`,
        gender: ["male", "female"].includes(profile.demographics.gender) ? profile.demographics.gender : "unspecified",
        birthplace: profile.demographics.region,
        focus: "overall"
      }
    };
  });
  profileLookup.clear();

  const questionById = new Map(questionBank.questions.map((question) => [question.id, question]));
  const armStates = new Map(
    kValues.map((k) => [
      k,
      new Map(descriptors.map((descriptor) => [descriptor.id, { asked: [], probabilities: null, diagnostics: null }]))
    ])
  );
  let finalized = false;
  let auditHead = "0".repeat(64);
  let auditEntries = 0;
  const audit = (type, payload) => {
    auditHead = sha256({ previous: auditHead, sequence: ++auditEntries, type, payload });
  };
  audit("initialized", {
    respondentMode,
    scenario,
    profiles: encryptedProfiles.size,
    sessions: descriptors.length,
    kValues,
    questionBankHash: questionBank.hash
  });

  const profileFor = (descriptor) => decryptRecord(masterKey, encryptedProfiles.get(descriptor.profileId));
  const stateFor = (k, sessionId) => {
    const states = armStates.get(k);
    if (!states) throw new Error(`Unknown K arm: ${k}`);
    const state = states.get(sessionId);
    if (!state) throw new Error(`Unknown session: ${sessionId}`);
    return state;
  };
  const descriptorFor = (sessionId) => {
    const descriptor = descriptors.find((item) => item.id === sessionId);
    if (!descriptor) throw new Error(`Unknown session: ${sessionId}`);
    return descriptor;
  };

  return {
    context: {
      modelVersion: `sealed-synthetic-v2.3-${respondentMode}-${scenario}`,
      eventCatalog,
      questionBank,
      sessions: descriptors.map(({ profileId, baseSessionId, ...descriptor }) => ({ ...descriptor })),
      counts: cohort.metadata.counts,
      seedCommitment: cohort.metadata.seedCommitment,
      truthCommitment: sha256(cohort.profiles),
      publicContextHash: sha256(stableStringify({ eventCatalog, questionBank, kValues, respondentMode, scenario }))
    },
    ask(k, sessionId, questionId) {
      if (finalized) throw new Error("Arena already finalized.");
      const state = stateFor(k, sessionId);
      if (state.probabilities) throw new Error("Session already submitted.");
      if (state.asked.length >= V23_POLICY_CONFIG.baselineQuestions + k) throw new Error("Question budget exceeded.");
      if (state.asked.some((item) => item.questionId === questionId)) throw new Error("Repeated question.");
      const question = questionById.get(questionId);
      if (!question) throw new Error(`Unknown question: ${questionId}`);
      const descriptor = descriptorFor(sessionId);
      const result = answerQuestion({ profile: profileFor(descriptor), session: descriptor, question, eventById, responseSecret });
      state.asked.push({ questionId, answer: result.answer, comprehension: result.comprehension });
      audit("answer", { k, sessionId, questionId, answer: result.answer, turn: state.asked.length });
      return { answer: result.answer, answered: state.asked.length, remaining: V23_POLICY_CONFIG.baselineQuestions + k - state.asked.length };
    },
    submit(k, sessionId, probabilities, diagnostics) {
      if (finalized) throw new Error("Arena already finalized.");
      const state = stateFor(k, sessionId);
      if (state.asked.length !== V23_POLICY_CONFIG.baselineQuestions + k) throw new Error("Prediction submitted at wrong question count.");
      if (eventCatalog.some((event) => !Number.isFinite(probabilities[event.id]) || probabilities[event.id] < 0 || probabilities[event.id] > 1)) {
        throw new Error("Prediction must contain a probability in [0,1] for every event.");
      }
      state.probabilities = Object.fromEntries(eventCatalog.map((event) => [event.id, probabilities[event.id]]));
      state.diagnostics = structuredClone(diagnostics);
      const predictionHash = sha256(state.probabilities);
      audit("submit", { k, sessionId, predictionHash, questions: state.asked.length });
      return { accepted: true, predictionHash };
    },
    finalize() {
      if (finalized) throw new Error("Arena already finalized.");
      const byK = {};
      for (const k of kValues) {
        const states = armStates.get(k);
        const missing = [...states.values()].filter((state) => !state.probabilities).length;
        if (missing) throw new Error(`K=${k} has ${missing} unsubmitted sessions.`);
        const records = descriptors.map((descriptor) => {
          const state = states.get(descriptor.id);
          return { ...descriptor, ...state, answers: state.asked, profile: profileFor(descriptor) };
        });
        const calibration = records.filter((record) => record.cohort === "calibration" && !record.retestOf);
        const validation = records.filter((record) => record.cohort === "validation" && !record.retestOf);
        const retest = records.filter((record) => record.retestOf);
        const thresholds = calibrate(calibration, eventCatalog);
        const calibrationMetric = metric(calibration, eventCatalog, thresholds.highConfidence, thresholds.candidate);
        const validationMetric = metric(validation, eventCatalog, thresholds.highConfidence, thresholds.candidate);
        const retestPairs = retest.map((repeat) => {
          const original = records.find((record) => record.id === repeat.retestOf);
          const highA = new Set(Object.entries(original.probabilities).filter(([, p]) => p >= thresholds.highConfidence).map(([id]) => id));
          const highB = new Set(Object.entries(repeat.probabilities).filter(([, p]) => p >= thresholds.highConfidence).map(([id]) => id));
          const candidateA = new Set(Object.entries(original.probabilities).filter(([, p]) => p >= thresholds.candidate).map(([id]) => id));
          const candidateB = new Set(Object.entries(repeat.probabilities).filter(([, p]) => p >= thresholds.candidate).map(([id]) => id));
          return { high: jaccard(highA, highB), candidate: jaccard(candidateA, candidateB) };
        });
        byK[k] = {
          k,
          totalQuestions: V23_POLICY_CONFIG.baselineQuestions + k,
          thresholds,
          calibration: calibrationMetric,
          validation: validationMetric,
          testRetest: {
            pairs: retestPairs.length,
            highConfidenceJaccard: divide(retestPairs.reduce((sum, item) => sum + item.high, 0), retestPairs.length),
            candidateJaccard: divide(retestPairs.reduce((sum, item) => sum + item.candidate, 0), retestPairs.length)
          },
          selectionDiagnostics: summarizeSelections(records.filter((record) => !record.retestOf))
        };
      }
      finalized = true;
      audit("finalize", { kValues, resultHash: sha256(byK) });
      return {
        respondentMode,
        scenario,
        profiles: encryptedProfiles.size,
        sessionsPerArm: descriptors.length,
        kValues,
        byK,
        commitments: {
          seed: cohort.metadata.seedCommitment,
          truth: sha256(cohort.profiles),
          questionBank: questionBank.hash,
          publicContext: sha256(stableStringify({ eventCatalog, questionBank, kValues, respondentMode, scenario })),
          metrics: sha256(byK)
        },
        audit: { valid: true, entries: auditEntries, head: auditHead }
      };
    }
  };
}
