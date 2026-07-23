import { randomBytes } from "node:crypto";

import {
  AuditChain,
  decryptRecord,
  encryptRecord,
  keyedUnitInterval,
  secureToken,
  sha256,
  tokenDigest
} from "../../sealed-synthetic-v1/oracle/primitives.mjs";

export class OracleError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "OracleError";
    this.code = code;
    this.status = status;
  }
}

function clamp(value, minimum = 0.001, maximum = 0.999) {
  return Math.max(minimum, Math.min(maximum, value));
}

function eventIds(profile) {
  return new Set((profile.events ?? []).map((event) => typeof event === "string" ? event : event.id));
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

function metric(records, eventCatalog, highThreshold = 0.78, recallThreshold = 0.64) {
  let truePositiveHigh = 0;
  let predictedHigh = 0;
  let truePositiveRecall = 0;
  let predictedRecall = 0;
  let truthCount = 0;
  let falseHigh = 0;
  let negativeCount = 0;
  let brierSum = 0;
  let cells = 0;
  const perEvent = Object.fromEntries(eventCatalog.map((event) => [event.id, {
    eventId: event.id,
    tpHigh: 0,
    fpHigh: 0,
    fnHigh: 0,
    tnHigh: 0,
    tpRecall: 0,
    fpRecall: 0,
    fnRecall: 0,
    support: 0
  }]));

  for (const record of records) {
    const truth = eventIds(record.profile);
    truthCount += truth.size;
    for (const event of eventCatalog) {
      const probability = record.probabilities[event.id] ?? 0;
      const actual = truth.has(event.id);
      const high = probability >= highThreshold;
      const recalled = probability >= recallThreshold;
      if (high) predictedHigh += 1;
      if (high && actual) truePositiveHigh += 1;
      if (high && !actual) falseHigh += 1;
      if (!actual) negativeCount += 1;
      if (recalled) predictedRecall += 1;
      if (recalled && actual) truePositiveRecall += 1;
      brierSum += (probability - Number(actual)) ** 2;
      cells += 1;
      const cell = perEvent[event.id];
      if (actual) cell.support += 1;
      if (high && actual) cell.tpHigh += 1;
      else if (high) cell.fpHigh += 1;
      else if (actual) cell.fnHigh += 1;
      else cell.tnHigh += 1;
      if (recalled && actual) cell.tpRecall += 1;
      else if (recalled) cell.fpRecall += 1;
      else if (actual) cell.fnRecall += 1;
    }
  }

  const divide = (a, b) => b === 0 ? null : a / b;
  const precision = divide(truePositiveHigh, predictedHigh);
  const highRecall = divide(truePositiveHigh, truthCount);
  const recall = divide(truePositiveRecall, truthCount);
  const recallPrecision = divide(truePositiveRecall, predictedRecall);
  const f1 = recall === null || recallPrecision === null || recall + recallPrecision === 0 ? null : 2 * recall * recallPrecision / (recall + recallPrecision);
  return {
    sessions: records.length,
    highConfidencePrecision: precision,
    highConfidenceRecall: highRecall,
    highConfidencePredictions: predictedHigh,
    recallTierPrecision: recallPrecision,
    recallTierPredictions: predictedRecall,
    truthEvents: truthCount,
    majorEventRecall: recall,
    weightedF1: f1,
    highConfidenceFalsePositiveRate: divide(falseHigh, negativeCount),
    brierScore: divide(brierSum, cells),
    averageQuestions: divide(records.reduce((sum, record) => sum + record.answers.length, 0), records.length),
    perEvent: Object.values(perEvent).map((cell) => ({
      ...cell,
      precision: divide(cell.tpHigh, cell.tpHigh + cell.fpHigh),
      highConfidenceRecall: divide(cell.tpHigh, cell.tpHigh + cell.fnHigh),
      recallTierPrecision: divide(cell.tpRecall, cell.tpRecall + cell.fpRecall),
      recall: divide(cell.tpRecall, cell.tpRecall + cell.fnRecall)
    }))
  };
}

function calibrateThresholds(records, eventCatalog, { highPrecisionTarget = 0.9 } = {}) {
  if (records.length === 0) return {
    highConfidence: 0.78,
    recall: 0.64,
    highPrecisionTargetFound: false,
    recallTargetFound: false,
    calibrationHigh: null,
    calibrationRecall: null
  };
  const candidates = Array.from({ length: 81 }, (_, index) => Number((0.15 + index * 0.01).toFixed(2)));
  const scored = candidates.map((threshold) => {
    const result = metric(records, eventCatalog, threshold, threshold);
    return { threshold, precision: result.highConfidencePrecision, recall: result.majorEventRecall, f1: result.weightedF1, predicted: result.perEvent.reduce((sum, event) => sum + event.tpHigh + event.fpHigh, 0) };
  });
  const highEligible = scored.filter((item) => item.predicted > 0 && (item.precision ?? 0) >= highPrecisionTarget);
  const highChoice = highEligible.length
    ? [...highEligible].sort((a, b) => (b.recall ?? -1) - (a.recall ?? -1) || (b.precision ?? -1) - (a.precision ?? -1) || a.threshold - b.threshold)[0]
    : [...scored].filter((item) => item.predicted > 0).sort((a, b) => (b.precision ?? -1) - (a.precision ?? -1) || b.predicted - a.predicted || b.threshold - a.threshold)[0];
  const recallEligible = scored.filter((item) => (item.recall ?? 0) >= 0.7 && (item.precision ?? 0) >= 0.4);
  const recallChoice = [...(recallEligible.length ? recallEligible : scored)].sort((a, b) => (b.f1 ?? -1) - (a.f1 ?? -1) || (b.precision ?? -1) - (a.precision ?? -1) || b.threshold - a.threshold)[0];
  return {
    highConfidence: highChoice.threshold,
    recall: recallChoice.threshold,
    highPrecisionTarget,
    highPrecisionTargetFound: highEligible.length > 0,
    recallTargetFound: recallEligible.length > 0,
    calibrationHigh: highChoice,
    calibrationRecall: recallChoice
  };
}

export class SealedOracle {
  #masterKey = randomBytes(32);
  #responseSecret;
  #adminToken = secureToken();
  #adminDigest = null;
  #interviewerTokens = new Map();
  #profiles = new Map();
  #sessions = new Map();
  #questions = new Map();
  #eventCatalog;
  #eventById;
  #audit = new AuditChain();
  #finalized = false;

  constructor({ cohort, eventCatalog, questionBank, responseSecret = randomBytes(32), modelVersion = "sealed-synthetic-v1.1", minQuestions = 18, maxQuestions = 24, highPrecisionTarget = 0.9 }) {
    if (!cohort?.profiles?.length || !cohort?.sessions?.length) throw new Error("Cohort needs profiles and sessions.");
    this.modelVersion = modelVersion;
    this.minQuestions = minQuestions;
    this.maxQuestions = maxQuestions;
    this.highPrecisionTarget = highPrecisionTarget;
    this.#eventCatalog = eventCatalog;
    this.#eventById = Object.fromEntries(eventCatalog.map((event) => [event.id, event]));
    this.#responseSecret = Buffer.from(responseSecret);
    for (const question of questionBank.questions) this.#questions.set(question.id, question);
    this.questionBankHash = questionBank.hash;
    this.#adminDigest = tokenDigest(this.#adminToken);

    for (const profile of cohort.profiles) {
      if (this.#profiles.has(profile.id)) throw new Error(`Duplicate profile id: ${profile.id}`);
      this.#profiles.set(profile.id, encryptRecord(this.#masterKey, profile.id, profile, modelVersion));
    }
    for (const plan of cohort.sessions) {
      if (!this.#profiles.has(plan.profileId)) throw new Error(`Session ${plan.id} references unknown profile ${plan.profileId}.`);
      if (this.#sessions.has(plan.id)) throw new Error(`Duplicate session id: ${plan.id}`);
      this.#sessions.set(plan.id, {
        ...plan,
        asked: [],
        answerMetadata: [],
        probabilities: null,
        submittedAt: null
      });
    }
    this.#audit.append("oracle_initialized", { modelVersion, profiles: this.#profiles.size, sessions: this.#sessions.size, questionBankHash: this.questionBankHash });
  }

  takeAdminToken() {
    if (!this.#adminToken) throw new OracleError("ADMIN_TOKEN_ALREADY_TAKEN", "Admin token was already retrieved.", 409);
    const token = this.#adminToken;
    this.#adminToken = null;
    return token;
  }

  #requireAdmin(token) {
    if (tokenDigest(token ?? "") !== this.#adminDigest) throw new OracleError("UNAUTHORIZED", "Invalid admin credential.", 401);
  }

  #requireInterviewer(token, sessionId) {
    const grant = this.#interviewerTokens.get(tokenDigest(token ?? ""));
    if (!grant || !grant.sessionIds.has(sessionId)) throw new OracleError("FORBIDDEN", "The credential cannot access this session.", 403);
    return grant;
  }

  issueInterviewerToken(adminToken, { batchId, sessionIds }) {
    this.#requireAdmin(adminToken);
    if (this.#finalized) throw new OracleError("FINALIZED", "The experiment is finalized.", 409);
    const unknown = sessionIds.filter((id) => !this.#sessions.has(id));
    if (unknown.length) throw new OracleError("UNKNOWN_SESSION", `Unknown sessions: ${unknown.slice(0, 3).join(", ")}`);
    const token = secureToken();
    this.#interviewerTokens.set(tokenDigest(token), { batchId, sessionIds: new Set(sessionIds) });
    this.#audit.append("interviewer_token_issued", { batchId, sessionIds });
    return token;
  }

  listSessions(interviewerToken) {
    const grant = this.#interviewerTokens.get(tokenDigest(interviewerToken ?? ""));
    if (!grant) throw new OracleError("UNAUTHORIZED", "Invalid interviewer credential.", 401);
    return [...grant.sessionIds].map((id) => {
      const session = this.#sessions.get(id);
      return {
        id,
        cohort: session.cohort,
        respondentMode: session.respondentMode,
        interviewerPolicy: session.interviewerPolicy,
        poolSize: session.poolSize,
        retestOf: session.retestOf ?? null,
        intake: session.intake,
        answered: session.asked.length,
        submitted: Boolean(session.submittedAt)
      };
    });
  }

  #profile(profileId) {
    return decryptRecord(this.#masterKey, this.#profiles.get(profileId));
  }

  #answer(profile, session, question) {
    const truth = eventIds(profile);
    const persona = defaultPersona(profile);
    const sensitivity = clamp(
      Math.max(...question.eventIds.map((id) => ({ ordinary: 0, private: 0.05, intense: 0.11 }[this.#eventById[id]?.sensitivity ?? "ordinary"])))
        - (question.sensitivityRelief ?? 0),
      0,
      0.2
    );
    const comprehension = clamp(persona.comprehension + (question.clarityBoost ?? 0));
    const idealAny = question.eventIds.some((id) => truth.has(id));
    const idealAll = question.eventIds.every((id) => truth.has(id));
    const stableKey = `${profile.id}:${question.id}`;
    const sessionKey = `${session.id}:${question.id}`;
    const choose = (label) => {
      const stable = keyedUnitInterval(this.#responseSecret, stableKey, label);
      const variable = keyedUnitInterval(this.#responseSecret, sessionKey, label);
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
    return { answer: biasedTruth ? "yes" : "no", comprehension: understood ? "clear" : "failed", expected: idealAny || idealAll };
  }

  ask(interviewerToken, sessionId, questionId) {
    this.#requireInterviewer(interviewerToken, sessionId);
    if (this.#finalized) throw new OracleError("FINALIZED", "The experiment is finalized.", 409);
    const session = this.#sessions.get(sessionId);
    if (session.submittedAt) throw new OracleError("SESSION_SUBMITTED", "This session is already submitted.", 409);
    if (session.asked.length >= this.maxQuestions) throw new OracleError("QUESTION_BUDGET_EXCEEDED", `A session may ask at most ${this.maxQuestions} questions.`, 429);
    if (session.asked.some((item) => item.questionId === questionId)) throw new OracleError("REPEATED_QUESTION", "A question cannot be repeated.", 409);
    const question = this.#questions.get(questionId);
    if (!question) throw new OracleError("UNKNOWN_QUESTION", "Question is not in the frozen bank.", 404);
    if ((question.armPoolSize ?? question.poolSize) !== session.poolSize) throw new OracleError("POOL_SIZE_MISMATCH", "Question pool size is outside this randomized arm.", 403);
    const result = this.#answer(this.#profile(session.profileId), session, question);
    const answerRecord = { questionId, answer: result.answer, answeredAt: Date.now() };
    session.asked.push(answerRecord);
    session.answerMetadata.push({ questionId, comprehension: result.comprehension, expectedAnswer: result.expected ? "yes" : "no" });
    this.#audit.append("question_answered", { sessionId, questionId, answer: result.answer, turn: session.asked.length });
    return { answer: result.answer, answered: session.asked.length, remaining: this.maxQuestions - session.asked.length };
  }

  submit(interviewerToken, sessionId, probabilities) {
    this.#requireInterviewer(interviewerToken, sessionId);
    const session = this.#sessions.get(sessionId);
    if (session.submittedAt) throw new OracleError("SESSION_SUBMITTED", "This session is already submitted.", 409);
    if (session.asked.length < this.minQuestions) throw new OracleError("TOO_FEW_QUESTIONS", `At least ${this.minQuestions} questions are required.`, 409);
    const eventIdsExpected = this.#eventCatalog.map((event) => event.id);
    if (!probabilities || eventIdsExpected.some((id) => !Number.isFinite(probabilities[id]) || probabilities[id] < 0 || probabilities[id] > 1)) {
      throw new OracleError("INVALID_PREDICTION", "Prediction must contain one probability in [0,1] for every event.");
    }
    session.probabilities = Object.fromEntries(eventIdsExpected.map((id) => [id, probabilities[id]]));
    session.submittedAt = Date.now();
    this.#audit.append("session_submitted", { sessionId, predictionHash: sha256(session.probabilities), questions: session.asked.length });
    return { accepted: true, sessionId, predictionHash: sha256(session.probabilities) };
  }

  encryptedArchive(adminToken) {
    this.#requireAdmin(adminToken);
    return {
      schemaVersion: "1.0.0",
      modelVersion: this.modelVersion,
      questionBankHash: this.questionBankHash,
      records: [...this.#profiles.values()].map((record) => ({ ...record }))
    };
  }

  auditProof(adminToken) {
    this.#requireAdmin(adminToken);
    return this.#audit.snapshot();
  }

  finalizeAndEvaluate(adminToken) {
    this.#requireAdmin(adminToken);
    const missing = [...this.#sessions.values()].filter((session) => !session.submittedAt);
    if (missing.length) throw new OracleError("INCOMPLETE_EXPERIMENT", `${missing.length} sessions do not have locked predictions.`, 409);
    this.#finalized = true;
    this.#interviewerTokens.clear();

    const records = [...this.#sessions.values()].map((session) => ({
      ...session,
      profile: this.#profile(session.profileId),
      answers: session.asked
    }));
    const calibrationRecords = records.filter((record) => record.cohort === "calibration" && !record.retestOf);
    const thresholds = calibrateThresholds(calibrationRecords, this.#eventCatalog, { highPrecisionTarget: this.highPrecisionTarget });
    const groupBy = (items, key) => Object.fromEntries([...new Set(items.map((record) => String(record[key])))].sort().map((value) => [value, metric(items.filter((record) => String(record[key]) === value), this.#eventCatalog, thresholds.highConfidence, thresholds.recall)]));
    const primary = records.filter((record) => !record.retestOf);
    const validationRecords = records.filter((record) => record.cohort === "validation" && !record.retestOf);
    const retestRecords = records.filter((record) => record.retestOf);
    const repeatScores = retestRecords.map((repeat) => {
      const original = records.find((record) => record.id === repeat.retestOf);
      if (!original) return null;
      const a = new Set(Object.entries(original.probabilities).filter(([, probability]) => probability >= thresholds.highConfidence).map(([id]) => id));
      const b = new Set(Object.entries(repeat.probabilities).filter(([, probability]) => probability >= thresholds.highConfidence).map(([id]) => id));
      const union = new Set([...a, ...b]);
      return union.size === 0 ? 1 : [...a].filter((id) => b.has(id)).length / union.size;
    }).filter((value) => value !== null);
    const comprehension = records.flatMap((record) => record.answerMetadata).map((item) => item.comprehension);
    const questionUsage = {};
    const verificationByEvent = Object.fromEntries(this.#eventCatalog.map((event) => [event.id, {
      eventId: event.id,
      asked: 0,
      yes: 0,
      no: 0,
      unsure: 0,
      truthPresent: 0,
      trueYes: 0,
      falseYes: 0
    }]));
    for (const record of records) {
      const truth = eventIds(record.profile);
      for (const asked of record.asked) {
        const question = this.#questions.get(asked.questionId);
        if (!question) continue;
        const usageKey = question.kind ?? `pool_${question.poolSize}`;
        questionUsage[usageKey] = (questionUsage[usageKey] ?? 0) + 1;
        if (!question.verification || question.eventIds.length !== 1) continue;
        const eventId = question.eventIds[0];
        const diagnostic = verificationByEvent[eventId];
        diagnostic.asked += 1;
        diagnostic[asked.answer] += 1;
        if (truth.has(eventId)) diagnostic.truthPresent += 1;
        if (asked.answer === "yes" && truth.has(eventId)) diagnostic.trueYes += 1;
        if (asked.answer === "yes" && !truth.has(eventId)) diagnostic.falseYes += 1;
      }
    }
    const report = {
      schemaVersion: "1.0.0",
      modelVersion: this.modelVersion,
      questionBankHash: this.questionBankHash,
      profiles: this.#profiles.size,
      sessions: records.length,
      thresholds: { ...thresholds, source: "calibration-cohort-only" },
      calibration: metric(calibrationRecords, this.#eventCatalog, thresholds.highConfidence, thresholds.recall),
      primary: metric(primary, this.#eventCatalog, thresholds.highConfidence, thresholds.recall),
      validation: metric(validationRecords, this.#eventCatalog, thresholds.highConfidence, thresholds.recall),
      byCohort: groupBy(records, "cohort"),
      byRespondentMode: groupBy(records, "respondentMode"),
      byInterviewerPolicy: groupBy(records, "interviewerPolicy"),
      byPoolSize: groupBy(records, "poolSize"),
      byCalibrationInterviewerPolicy: groupBy(calibrationRecords, "interviewerPolicy"),
      byCalibrationPoolSize: groupBy(calibrationRecords, "poolSize"),
      byValidationInterviewerPolicy: groupBy(validationRecords, "interviewerPolicy"),
      byValidationPoolSize: groupBy(validationRecords, "poolSize"),
      comprehension: {
        observations: comprehension.length,
        clearRate: comprehension.length ? comprehension.filter((value) => value === "clear").length / comprehension.length : null,
        method: "oracle-latent-state"
      },
      questionDiagnostics: {
        usageByKind: questionUsage,
        verificationByEvent: Object.values(verificationByEvent).filter((item) => item.asked > 0)
      },
      testRetest: {
        pairs: repeatScores.length,
        jaccard: repeatScores.length ? repeatScores.reduce((sum, value) => sum + value, 0) / repeatScores.length : null
      },
      audit: this.#audit.snapshot(),
      generatedAt: new Date().toISOString()
    };
    this.#audit.append("experiment_finalized", { reportHash: sha256(report) });
    return report;
  }

  revealAfterFinalization(adminToken) {
    this.#requireAdmin(adminToken);
    if (!this.#finalized) throw new OracleError("NOT_FINALIZED", "Truth cannot be revealed before finalization.", 409);
    return [...this.#profiles.keys()].map((id) => this.#profile(id));
  }
}
