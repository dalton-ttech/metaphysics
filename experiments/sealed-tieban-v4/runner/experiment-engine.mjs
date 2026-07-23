import { generateLifeBook, textBigramSet } from "../book/generate-book.mjs";
import { FORMAL_SESSION_COUNT, V4_CONFIG } from "../config/experiment-config.mjs";
import { createBirthCandidatePool } from "../domain/birth-candidate-pool.mjs";
import { CLAUSE_CODEBOOK, FACT_CATALOG } from "../domain/fact-catalog.mjs";
import { jaccard, sha256 } from "../lib/deterministic.mjs";
import { createSealedLifeSession } from "../oracle/sealed-life-session.mjs";
import { buildPersonaConfigs } from "../personas/build-personas.mjs";
import { runInferenceSession } from "./inference-policy.mjs";

function blankAggregate() {
  return {
    sessions: 0,
    minuteCorrect: 0,
    intervalCorrect: 0,
    top3MinuteCorrect: 0,
    rounds: 0,
    minimumRounds: Infinity,
    maximumRounds: 0,
    wrongAnswers: 0,
    unknownAnswers: 0,
    sessionsWithWrongAnswers: 0,
    recoveredWithWrongAnswers: 0,
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    unaskedTruePositive: 0,
    unaskedFalsePositive: 0,
    directReuseCount: 0,
    eightGramReuseCount: 0,
    askedCount: 0,
    truthMatchesAnyCandidate: 0
  };
}

function addEvaluation(aggregate, evaluation) {
  aggregate.sessions += 1;
  aggregate.minuteCorrect += evaluation.lockedMinuteOffset === evaluation.trueMinuteOffset ? 1 : 0;
  aggregate.intervalCorrect += evaluation.lockedFourMinuteInterval === evaluation.trueFourMinuteInterval ? 1 : 0;
  const trueCandidateId = `K4-${String(evaluation.trueMinuteOffset).padStart(3, "0")}`;
  aggregate.top3MinuteCorrect += evaluation.topCandidateIds.includes(trueCandidateId) ? 1 : 0;
  aggregate.rounds += evaluation.rounds;
  aggregate.minimumRounds = Math.min(aggregate.minimumRounds, evaluation.rounds);
  aggregate.maximumRounds = Math.max(aggregate.maximumRounds, evaluation.rounds);
  aggregate.wrongAnswers += evaluation.wrongAnswers;
  aggregate.unknownAnswers += evaluation.unknownAnswers;
  if (evaluation.wrongAnswers > 0) {
    aggregate.sessionsWithWrongAnswers += 1;
    if (evaluation.lockedMinuteOffset === evaluation.trueMinuteOffset) aggregate.recoveredWithWrongAnswers += 1;
  }
  for (const key of ["truePositive", "falsePositive", "falseNegative", "unaskedTruePositive", "unaskedFalsePositive"]) {
    aggregate[key] += evaluation.portraitCounts[key];
  }
  aggregate.directReuseCount += evaluation.directReuseCount;
  aggregate.eightGramReuseCount += evaluation.eightGramReuseCount;
  aggregate.askedCount += evaluation.askedCount;
  aggregate.truthMatchesAnyCandidate += evaluation.truthMatchesAnyCandidate ? 1 : 0;
}

function divide(numerator, denominator, empty = 0) {
  return denominator ? numerator / denominator : empty;
}

function finalizeAggregate(aggregate) {
  const precision = divide(aggregate.truePositive, aggregate.truePositive + aggregate.falsePositive, 1);
  const recall = divide(aggregate.truePositive, aggregate.truePositive + aggregate.falseNegative, 1);
  return {
    sessions: aggregate.sessions,
    minuteAccuracy: divide(aggregate.minuteCorrect, aggregate.sessions),
    fourMinuteIntervalAccuracy: divide(aggregate.intervalCorrect, aggregate.sessions),
    top3MinuteAccuracy: divide(aggregate.top3MinuteCorrect, aggregate.sessions),
    averageRounds: divide(aggregate.rounds, aggregate.sessions),
    minimumRounds: Number.isFinite(aggregate.minimumRounds) ? aggregate.minimumRounds : null,
    maximumRounds: aggregate.maximumRounds || null,
    wrongAnswers: aggregate.wrongAnswers,
    unknownAnswers: aggregate.unknownAnswers,
    sessionsWithWrongAnswers: aggregate.sessionsWithWrongAnswers,
    wrongAnswerRecoveryRate: divide(aggregate.recoveredWithWrongAnswers, aggregate.sessionsWithWrongAnswers, 1),
    portraitPrecision: precision,
    portraitRecall: recall,
    portraitJaccard: divide(aggregate.truePositive, aggregate.truePositive + aggregate.falsePositive + aggregate.falseNegative, 1),
    unaskedEventPrecision: divide(aggregate.unaskedTruePositive, aggregate.unaskedTruePositive + aggregate.unaskedFalsePositive, 1),
    directQuestionReuseRate: divide(aggregate.directReuseCount, aggregate.askedCount),
    questionBookEightGramReuseRate: divide(aggregate.eightGramReuseCount, aggregate.askedCount),
    outsideCandidateRate: 1 - divide(aggregate.truthMatchesAnyCandidate, aggregate.sessions)
  };
}

function fingerprint(evaluation) {
  return sha256({
    lockedCandidateId: evaluation.lockedCandidateId,
    topCandidateIds: evaluation.topCandidateIds,
    rounds: evaluation.rounds,
    transcriptHash: evaluation.transcriptHash,
    lockedProfileHash: evaluation.lockedProfileHash,
    bookHash: evaluation.bookHash,
    causalChainHash: evaluation.causalChainHash
  });
}

function evaluateGates(metrics, determinism, birthCounterfactual, bookSeparation) {
  const sources = { ...metrics, determinism, birthCounterfactual, bookSeparation };
  const output = {};
  for (const [group, gates] of Object.entries(V4_CONFIG.gates)) {
    const values = sources[group];
    output[group] = Object.fromEntries(Object.entries(gates).map(([metric, rule]) => {
      const actual = values[metric];
      const passed = rule.direction === "maximum" ? actual <= rule.threshold : actual >= rule.threshold;
      return [metric, { ...rule, actual, passed }];
    }));
  }
  return output;
}

function bookSeparationAudit(pools) {
  let comparisons = 0;
  let different = 0;
  let jaccardSum = 0;
  for (const pool of pools.values()) {
    for (let pair = 0; pair < 10; pair += 1) {
      const left = pool.candidates[(pair * 11) % pool.candidates.length];
      const right = pool.candidates[(pair * 11 + 37) % pool.candidates.length];
      const leftBook = generateLifeBook(left, pool.birthSeed);
      const rightBook = generateLifeBook(right, pool.birthSeed);
      comparisons += 1;
      if (leftBook.bookHash !== rightBook.bookHash) different += 1;
      jaccardSum += jaccard(textBigramSet(leftBook.text), textBigramSet(rightBook.text));
    }
  }
  return {
    comparisons,
    differentCandidateBookDifferenceRate: divide(different, comparisons),
    meanBookTokenJaccard: divide(jaccardSum, comparisons)
  };
}

export async function runV4Experiment({ sampleOverrides = {}, onProgress } = {}) {
  const samples = { ...V4_CONFIG.samples, ...sampleOverrides };
  if (samples.determinism_retest > samples.validation_in_model_default) throw new Error("Determinism retest requires matching default sessions.");
  if (samples.birth_counterfactual > samples.validation_out_model) throw new Error("Birth counterfactual requires matching out-of-model sessions.");
  const plannedSessions = Object.values(samples).reduce((sum, value) => sum + value, 0);
  const personas = buildPersonaConfigs();
  const poolCache = new Map();
  const poolFor = (index) => {
    const normalized = ((index % V4_CONFIG.birthSeedCount) + V4_CONFIG.birthSeedCount) % V4_CONFIG.birthSeedCount;
    if (!poolCache.has(normalized)) poolCache.set(normalized, createBirthCandidatePool(normalized));
    return poolCache.get(normalized);
  };
  const aggregates = Object.fromEntries([
    "calibration_in_model",
    "validation_in_model_default",
    "validation_in_model_noisy",
    "validation_out_model",
    "extreme_conflict"
  ].map((group) => [group, blankAggregate()]));
  const defaultFingerprints = new Map();
  const defaultPairResults = new Map();
  const outModelReferences = new Map();
  let executedSessions = 0;

  const execute = async ({ group, subjectKey, responseKey, pool, truthPool, truthMode, persona, extreme = false }) => {
    const handle = createSealedLifeSession({ group, subjectKey, responseKey, pool, truthPool, truthMode, persona, extreme });
    const evaluation = await runInferenceSession(handle);
    executedSessions += 1;
    if (aggregates[group]) addEvaluation(aggregates[group], evaluation);
    if (onProgress && (executedSessions % 1000 === 0 || executedSessions === plannedSessions)) {
      onProgress({ executedSessions, plannedSessions, group });
    }
    return evaluation;
  };

  for (let index = 0; index < samples.calibration_in_model; index += 1) {
    await execute({
      group: "calibration_in_model",
      subjectKey: `CAL-${index}`,
      pool: poolFor(index),
      truthMode: "in_model",
      persona: personas[index % 500]
    });
  }

  for (let index = 0; index < samples.validation_in_model_default; index += 1) {
    const subjectKey = `PAIR-${index}`;
    const evaluation = await execute({
      group: "validation_in_model_default",
      subjectKey,
      responseKey: subjectKey,
      pool: poolFor(index),
      truthMode: "in_model",
      persona: personas[index % 500]
    });
    defaultPairResults.set(subjectKey, {
      correct: evaluation.lockedMinuteOffset === evaluation.trueMinuteOffset,
      intervalCorrect: evaluation.lockedFourMinuteInterval === evaluation.trueFourMinuteInterval
    });
    if (index < samples.determinism_retest) defaultFingerprints.set(subjectKey, fingerprint(evaluation));
  }

  let noisyRetainedExact = 0;
  let noisyRetainedInterval = 0;
  let noisyDefaultExactDenominator = 0;
  let noisyDefaultIntervalDenominator = 0;
  for (let index = 0; index < samples.validation_in_model_noisy; index += 1) {
    const subjectKey = `PAIR-${index}`;
    const personaIndex = 500 + (index % 1000);
    const evaluation = await execute({
      group: "validation_in_model_noisy",
      subjectKey,
      responseKey: subjectKey,
      pool: poolFor(index),
      truthMode: "in_model",
      persona: personas[personaIndex]
    });
    const baseline = defaultPairResults.get(subjectKey);
    if (baseline?.correct) {
      noisyDefaultExactDenominator += 1;
      if (evaluation.lockedMinuteOffset === evaluation.trueMinuteOffset) noisyRetainedExact += 1;
    }
    if (baseline?.intervalCorrect) {
      noisyDefaultIntervalDenominator += 1;
      if (evaluation.lockedFourMinuteInterval === evaluation.trueFourMinuteInterval) noisyRetainedInterval += 1;
    }
  }

  for (let index = 0; index < samples.validation_out_model; index += 1) {
    const subjectKey = `OUT-${index}`;
    const pool = poolFor(index);
    const persona = personas[index % personas.length];
    const evaluation = await execute({
      group: "validation_out_model",
      subjectKey,
      responseKey: subjectKey,
      pool,
      truthMode: "out_model",
      persona
    });
    if (index < samples.birth_counterfactual) {
      outModelReferences.set(subjectKey, { evaluation, truthPool: pool, persona, poolIndex: index % V4_CONFIG.birthSeedCount });
    }
  }

  for (let index = 0; index < samples.extreme_conflict; index += 1) {
    await execute({
      group: "extreme_conflict",
      subjectKey: `EXT-${index}`,
      pool: poolFor(index + 73),
      truthMode: "out_model",
      persona: personas[1000 + (index % 500)],
      extreme: true
    });
  }

  let replayMatches = 0;
  for (let index = 0; index < samples.determinism_retest; index += 1) {
    const subjectKey = `PAIR-${index}`;
    const evaluation = await execute({
      group: "determinism_retest",
      subjectKey,
      responseKey: subjectKey,
      pool: poolFor(index),
      truthMode: "in_model",
      persona: personas[index % 500]
    });
    if (fingerprint(evaluation) === defaultFingerprints.get(subjectKey)) replayMatches += 1;
  }
  const determinism = {
    replaySessions: samples.determinism_retest,
    exactReplayRate: divide(replayMatches, samples.determinism_retest, 1)
  };

  let counterfactualCandidateChanges = 0;
  let counterfactualBookDifferences = 0;
  let counterfactualProfileJaccard = 0;
  let counterfactualMinuteChanges = 0;
  for (let index = 0; index < samples.birth_counterfactual; index += 1) {
    const subjectKey = `OUT-${index}`;
    const reference = outModelReferences.get(subjectKey);
    const alternativePool = poolFor(reference.poolIndex + 137);
    const evaluation = await execute({
      group: "birth_counterfactual",
      subjectKey,
      responseKey: subjectKey,
      pool: alternativePool,
      truthPool: reference.truthPool,
      truthMode: "out_model",
      persona: reference.persona
    });
    if (evaluation.lockedCandidateId !== reference.evaluation.lockedCandidateId) counterfactualCandidateChanges += 1;
    if (evaluation.lockedMinuteOffset !== reference.evaluation.lockedMinuteOffset) counterfactualMinuteChanges += 1;
    if (evaluation.bookHash !== reference.evaluation.bookHash) counterfactualBookDifferences += 1;
    counterfactualProfileJaccard += jaccard(evaluation.lockedFactIds, reference.evaluation.lockedFactIds);
  }
  const birthCounterfactual = {
    pairs: samples.birth_counterfactual,
    lockedCandidateChangeRate: divide(counterfactualCandidateChanges, samples.birth_counterfactual, 1),
    lockedMinuteChangeRate: divide(counterfactualMinuteChanges, samples.birth_counterfactual, 1),
    bookDifferenceRate: divide(counterfactualBookDifferences, samples.birth_counterfactual, 1),
    meanLockedProfileJaccard: divide(counterfactualProfileJaccard, samples.birth_counterfactual, 0)
  };

  const metrics = Object.fromEntries(Object.entries(aggregates).map(([group, aggregate]) => [group, finalizeAggregate(aggregate)]));
  const pairedNoise = {
    matchedSubjects: Math.min(samples.validation_in_model_default, samples.validation_in_model_noisy),
    exactRetentionGivenDefaultCorrect: divide(noisyRetainedExact, noisyDefaultExactDenominator, 1),
    intervalRetentionGivenDefaultCorrect: divide(noisyRetainedInterval, noisyDefaultIntervalDenominator, 1)
  };
  const bookSeparation = bookSeparationAudit(poolCache);
  const gates = evaluateGates(metrics, determinism, birthCounterfactual, bookSeparation);
  const allGates = Object.values(gates).flatMap((group) => Object.values(group));

  return {
    schemaVersion: "sealed-tieban-v4-result-v1",
    modelVersion: V4_CONFIG.version,
    samples,
    plannedSessions,
    executedSessions,
    formalSessionTarget: FORMAL_SESSION_COUNT,
    architecture: {
      causalChain: [
        "BirthSeed",
        "120 pre-generated candidate Profiles",
        "clauses selected from candidate Profile matrix",
        "answers update candidate posterior only",
        "one candidate Profile locked",
        "book generated from locked Profile only"
      ],
      bookGeneratorInputs: ["lockedProfile", "birthSeed"],
      bookGeneratorAcceptsTranscript: false,
      answerMutatesProfile: false,
      candidateCount: V4_CONFIG.candidateCount,
      factCount: FACT_CATALOG.length,
      clauseCount: CLAUSE_CODEBOOK.length
    },
    codeDiagnostics: poolFor(0).diagnostics,
    personaCohort: {
      count: personas.length,
      strategies: Object.fromEntries(["literal", "cautious", "conflicted"].map((strategy) => [strategy, personas.filter((persona) => persona.strategy === strategy).length])),
      commitment: sha256(personas)
    },
    metrics,
    pairedNoise,
    determinism,
    birthCounterfactual,
    bookSeparation,
    gates,
    gateSummary: {
      passed: allGates.filter((gate) => gate.passed).length,
      failed: allGates.filter((gate) => !gate.passed).length
    },
    commitments: {
      configuration: sha256(V4_CONFIG),
      clauses: sha256(CLAUSE_CODEBOOK),
      aggregateCore: null
    }
  };
}
