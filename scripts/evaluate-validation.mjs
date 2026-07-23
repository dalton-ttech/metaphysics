import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const datasetPath = resolve(process.cwd(), process.argv[2] ?? "evaluation/validation-dataset.json");
const outputPath = resolve(process.cwd(), process.argv[3] ?? "evaluation/validation-results.json");
const FIXED_THRESHOLDS = { highConfidence: 0.88, recall: 0.25 };

if (!existsSync(datasetPath)) throw new Error(`Validation dataset not found: ${datasetPath}`);
const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
if (!Array.isArray(dataset.records)) throw new Error("Dataset must contain a records array.");
if (dataset.records.length === 0) {
  console.log("Dataset schema is readable, but records is empty. No accuracy claim can be calculated.");
  process.exit(0);
}

function divide(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function ageBand(record) {
  const year = Number(record.intake?.birthDate?.slice(0, 4));
  if (!Number.isFinite(year)) return "unknown";
  const completedYear = Number(String(record.completedAt ? new Date(record.completedAt).getUTCFullYear() : new Date().getUTCFullYear()));
  const age = completedYear - year;
  if (age < 25) return "under-25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55-plus";
}

function validateRecord(record) {
  if (!record.id || !Array.isArray(record.truthEventIds) || !record.probabilities || typeof record.probabilities !== "object") {
    throw new Error("Every record needs id, truthEventIds, and probabilities.");
  }
  const entries = Object.entries(record.probabilities);
  if (!["cognitive", "calibration", "validation", "retest"].includes(record.cohort)) throw new Error(`Record ${record.id} has an invalid cohort.`);
  if (!Array.isArray(record.answerTrace) || !Array.isArray(record.responseTimings) || record.answerTrace.length !== record.responseTimings.length) {
    throw new Error(`Record ${record.id} must have one response timing for every answer.`);
  }
  if (record.cohort === "cognitive") {
    if (!Array.isArray(record.cognitiveAnnotations) || record.cognitiveAnnotations.length !== record.answerTrace.length) throw new Error(`Cognitive record ${record.id} needs one annotation per answer.`);
    if (record.cognitiveAnnotations.some((item) => !["clear", "partial", "failed"].includes(item.comprehension))) throw new Error(`Cognitive record ${record.id} has an invalid comprehension label.`);
  }
  if (entries.length < 40) throw new Error(`Record ${record.id} has incomplete probabilities; expected the full event ontology.`);
  for (const [id, probability] of entries) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error(`Record ${record.id} has invalid probability for ${id}.`);
    }
  }
}

for (const record of dataset.records) validateRecord(record);
if (new Set(dataset.records.map((record) => record.modelVersion)).size !== 1) throw new Error("Evaluation cannot mix model versions.");

function score(records, thresholds) {
  const counts = { truePositiveHigh: 0, predictedHigh: 0, truePositiveRecall: 0, predictedRecall: 0, truth: 0, brier: 0, cells: 0, falseHigh: 0, negatives: 0 };
  const bins = Array.from({ length: 10 }, () => ({ count: 0, probability: 0, observed: 0 }));
  const eventCounts = new Map();

  for (const record of records) {
    const truth = new Set(record.truthEventIds);
    const entries = Object.entries(record.probabilities);
    counts.truth += truth.size;
    for (const [id, probability] of entries) {
      const actual = truth.has(id);
      const high = probability >= thresholds.highConfidence;
      const recalled = probability >= thresholds.recall;
      if (high) counts.predictedHigh += 1;
      if (high && actual) counts.truePositiveHigh += 1;
      if (high && !actual) counts.falseHigh += 1;
      if (!actual) counts.negatives += 1;
      if (recalled) counts.predictedRecall += 1;
      if (recalled && actual) counts.truePositiveRecall += 1;
      counts.brier += (probability - Number(actual)) ** 2;
      counts.cells += 1;

      const bin = bins[Math.min(9, Math.floor(probability * 10))];
      bin.count += 1;
      bin.probability += probability;
      bin.observed += Number(actual);

      const event = eventCounts.get(id) ?? {
        eventId: id,
        tp: 0,
        fp: 0,
        fn: 0,
        tn: 0,
        candidateTp: 0,
        candidateFp: 0,
        candidateFn: 0,
        candidateTn: 0,
        truthSupport: 0
      };
      if (actual) event.truthSupport += 1;
      if (high && actual) event.tp += 1;
      else if (high) event.fp += 1;
      else if (actual) event.fn += 1;
      else event.tn += 1;
      if (recalled && actual) event.candidateTp += 1;
      else if (recalled) event.candidateFp += 1;
      else if (actual) event.candidateFn += 1;
      else event.candidateTn += 1;
      eventCounts.set(id, event);
    }
  }

  const precision = divide(counts.truePositiveHigh, counts.predictedHigh);
  const recall = divide(counts.truePositiveRecall, counts.truth);
  const recallPrecision = divide(counts.truePositiveRecall, counts.predictedRecall);
  const weightedF1 = recall === null || recallPrecision === null || recall + recallPrecision === 0 ? null : (2 * recall * recallPrecision) / (recall + recallPrecision);
  const ece = counts.cells === 0 ? null : bins.reduce((sum, bin) => {
    if (bin.count === 0) return sum;
    return sum + (bin.count / counts.cells) * Math.abs(bin.probability / bin.count - bin.observed / bin.count);
  }, 0);

  return {
    participants: records.length,
    highConfidencePrecision: precision,
    majorEventRecall: recall,
    weightedF1,
    highConfidenceFalsePositiveRate: divide(counts.falseHigh, counts.negatives),
    brierScore: divide(counts.brier, counts.cells),
    expectedCalibrationError: ece,
    predictedHighCount: counts.predictedHigh,
    truthEventCount: counts.truth,
    perEvent: [...eventCounts.values()].map((event) => ({
      ...event,
      highConfidencePrecision: divide(event.tp, event.tp + event.fp),
      highConfidenceRecall: divide(event.tp, event.tp + event.fn),
      candidatePrecision: divide(event.candidateTp, event.candidateTp + event.candidateFp),
      candidateRecall: divide(event.candidateTp, event.candidateTp + event.candidateFn)
    })).sort((a, b) => a.eventId.localeCompare(b.eventId))
  };
}

function calibrate(records) {
  if (records.length === 0) return null;
  const highThresholds = Array.from({ length: 41 }, (_, index) => Number((0.55 + index * 0.01).toFixed(2)));
  const recallThresholds = Array.from({ length: 81 }, (_, index) => Number((0.15 + index * 0.01).toFixed(2)));
  const highCandidates = highThresholds.map((threshold) => ({ threshold, result: score(records, { highConfidence: threshold, recall: threshold }) }));
  const highEligible = highCandidates.filter(({ result }) => result.highConfidencePrecision !== null && result.highConfidencePrecision >= 0.9 && result.predictedHighCount > 0);
  const highChoice = (highEligible.length ? highEligible : highCandidates)
    .sort((a, b) => highEligible.length
      ? (b.result.majorEventRecall ?? -1) - (a.result.majorEventRecall ?? -1) || b.threshold - a.threshold
      : (b.result.highConfidencePrecision ?? -1) - (a.result.highConfidencePrecision ?? -1) || b.threshold - a.threshold)[0];

  const recallCandidates = recallThresholds.map((threshold) => ({ threshold, result: score(records, { highConfidence: threshold, recall: threshold }) }));
  const recallEligible = recallCandidates.filter(({ result }) => result.majorEventRecall !== null && result.majorEventRecall >= 0.7);
  const recallChoice = (recallEligible.length ? recallEligible : recallCandidates)
    .sort((a, b) => recallEligible.length
      ? (b.result.weightedF1 ?? -1) - (a.result.weightedF1 ?? -1) || b.threshold - a.threshold
      : (b.result.majorEventRecall ?? -1) - (a.result.majorEventRecall ?? -1) || (b.result.weightedF1 ?? -1) - (a.result.weightedF1 ?? -1))[0];

  return {
    highConfidence: highChoice.threshold,
    recall: recallChoice.threshold,
    calibrationParticipants: records.length,
    highPrecisionTargetReached: highEligible.length > 0,
    recallTargetReached: recallEligible.length > 0
  };
}

function questionDiagnostics(records) {
  const timings = records.flatMap((record) => Array.isArray(record.responseTimings) ? record.responseTimings : []);
  const durations = timings.map((item) => item.durationMs).filter((value) => Number.isFinite(value) && value >= 0);
  const answers = records.flatMap((record) => Array.isArray(record.answerTrace) ? record.answerTrace : []);
  const unsure = answers.filter((answer) => answer.answer === "unsure").length;
  const byPoolSize = Object.fromEntries([...new Set(timings.map((item) => item.poolSize))].sort().map((poolSize) => {
    const group = timings.filter((item) => item.poolSize === poolSize);
    const groupDurations = group.map((item) => item.durationMs).filter(Number.isFinite);
    return [String(poolSize), {
      responses: group.length,
      unsureRate: divide(group.filter((item) => item.answer === "unsure").length, group.length),
      medianResponseMs: quantile(groupDurations, 0.5),
      p90ResponseMs: quantile(groupDurations, 0.9)
    }];
  }));
  return {
    responses: answers.length,
    timedResponses: durations.length,
    unsureRate: divide(unsure, answers.length),
    medianResponseMs: quantile(durations, 0.5),
    p90ResponseMs: quantile(durations, 0.9),
    byPoolSize
  };
}

function comprehensionDiagnostics(records) {
  const cognitiveRecords = records.filter((record) => record.cohort === "cognitive");
  const annotations = cognitiveRecords.flatMap((record) => Array.isArray(record.cognitiveAnnotations) ? record.cognitiveAnnotations : []);
  const issueCounts = {};
  const byQuestion = new Map();
  for (const annotation of annotations) {
    issueCounts[annotation.issue ?? "unknown"] = (issueCounts[annotation.issue ?? "unknown"] ?? 0) + 1;
    const item = byQuestion.get(annotation.questionId) ?? { questionId: annotation.questionId, observations: 0, clear: 0, partial: 0, failed: 0, issues: {} };
    item.observations += 1;
    item[annotation.comprehension] = (item[annotation.comprehension] ?? 0) + 1;
    item.issues[annotation.issue ?? "unknown"] = (item.issues[annotation.issue ?? "unknown"] ?? 0) + 1;
    byQuestion.set(annotation.questionId, item);
  }
  const clear = annotations.filter((annotation) => annotation.comprehension === "clear").length;
  const partial = annotations.filter((annotation) => annotation.comprehension === "partial").length;
  const failed = annotations.filter((annotation) => annotation.comprehension === "failed").length;
  const questions = [...byQuestion.values()].map((item) => ({
    ...item,
    clearRate: divide(item.clear, item.observations),
    weightedUnderstandingRate: divide(item.clear + item.partial * 0.5, item.observations)
  })).sort((a, b) => (a.weightedUnderstandingRate ?? 1) - (b.weightedUnderstandingRate ?? 1) || b.observations - a.observations || a.questionId.localeCompare(b.questionId));
  return {
    participants: cognitiveRecords.length,
    annotations: annotations.length,
    clearRate: divide(clear, annotations.length),
    partialRate: divide(partial, annotations.length),
    failedRate: divide(failed, annotations.length),
    weightedUnderstandingRate: divide(clear + partial * 0.5, annotations.length),
    issueCounts,
    questionsNeedingRevision: questions.filter((item) => item.observations >= 5 && (item.weightedUnderstandingRate ?? 1) < 0.8),
    byQuestion: questions
  };
}

function testRetestJaccard(records, threshold) {
  const firstRuns = new Map();
  for (const record of records.filter((item) => item.cohort !== "retest")) firstRuns.set(record.id, record);
  const pairs = [];
  for (const record of records.filter((item) => item.cohort === "retest")) {
    const original = firstRuns.get(record.id);
    if (!original) continue;
    const a = new Set(Object.entries(original.probabilities).filter(([, value]) => value >= threshold).map(([id]) => id));
    const b = new Set(Object.entries(record.probabilities).filter(([, value]) => value >= threshold).map(([id]) => id));
    const union = new Set([...a, ...b]);
    const intersection = [...a].filter((id) => b.has(id)).length;
    pairs.push(union.size === 0 ? 1 : intersection / union.size);
  }
  for (const record of records.filter((item) => item.repeatProbabilities)) {
    const a = new Set(Object.entries(record.probabilities).filter(([, value]) => value >= threshold).map(([id]) => id));
    const b = new Set(Object.entries(record.repeatProbabilities).filter(([, value]) => value >= threshold).map(([id]) => id));
    const union = new Set([...a, ...b]);
    const intersection = [...a].filter((id) => b.has(id)).length;
    pairs.push(union.size === 0 ? 1 : intersection / union.size);
  }
  return { pairs: pairs.length, jaccard: pairs.length ? pairs.reduce((sum, value) => sum + value, 0) / pairs.length : null };
}

function groupScores(records, thresholds, keyForRecord) {
  const groups = new Map();
  for (const record of records) {
    const key = keyForRecord(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => {
    const result = score(group, thresholds);
    return [key, {
      participants: result.participants,
      highConfidencePrecision: result.highConfidencePrecision,
      majorEventRecall: result.majorEventRecall,
      brierScore: result.brierScore
    }];
  }));
}

const calibrationRecords = dataset.records.filter((record) => record.cohort === "calibration");
const validationRecords = dataset.records.filter((record) => record.cohort === "validation");
const calibrated = calibrate(calibrationRecords);
const thresholds = calibrated ? { highConfidence: calibrated.highConfidence, recall: calibrated.recall } : FIXED_THRESHOLDS;
const validationMetrics = score(validationRecords, thresholds);
const descriptiveMetrics = score(dataset.records.filter((record) => record.cohort !== "retest"), thresholds);
const repeat = testRetestJaccard(dataset.records, thresholds.highConfidence);
const comprehension = comprehensionDiagnostics(dataset.records);
const enoughIndependentValidation = validationRecords.length >= 300;
const productGates = {
  cognitiveInterviewSamplePassed: comprehension.participants >= 30,
  comprehensionPassed: comprehension.participants >= 30 && comprehension.clearRate !== null && comprehension.clearRate >= 0.85 && comprehension.failedRate !== null && comprehension.failedRate <= 0.05,
  independentValidationSamplePassed: enoughIndependentValidation,
  precisionPassed: enoughIndependentValidation && validationMetrics.highConfidencePrecision !== null && validationMetrics.highConfidencePrecision >= 0.9,
  recallPassed: enoughIndependentValidation && validationMetrics.majorEventRecall !== null && validationMetrics.majorEventRecall >= 0.7,
  falsePositiveRatePassed: enoughIndependentValidation && validationMetrics.highConfidenceFalsePositiveRate !== null && validationMetrics.highConfidenceFalsePositiveRate <= 0.05,
  repeatPassed: repeat.pairs >= 30 && repeat.jaccard !== null && repeat.jaccard >= 0.85
};

const report = {
  generatedAt: new Date().toISOString(),
  dataset: datasetPath,
  modelVersion: dataset.modelVersion ?? [...new Set(dataset.records.map((record) => record.modelVersion))].join(","),
  cohortCounts: Object.fromEntries([...new Set(dataset.records.map((record) => record.cohort ?? "unspecified"))].sort().map((cohort) => [cohort, dataset.records.filter((record) => (record.cohort ?? "unspecified") === cohort).length])),
  thresholdPolicy: {
    source: calibrated ? "calibration-cohort-only" : "preregistered-fixed-fallback",
    applied: thresholds,
    calibration: calibrated,
    warning: calibrated ? null : "No calibration cohort was supplied; fixed preregistered thresholds were used."
  },
  descriptiveAllNonRetest: descriptiveMetrics,
  independentValidation: validationMetrics,
  questionDiagnostics: questionDiagnostics(dataset.records),
  comprehensionDiagnostics: comprehension,
  testRetest: repeat,
  demographicBreakdown: {
    ageBand: groupScores(validationRecords, thresholds, ageBand),
    gender: groupScores(validationRecords, thresholds, (record) => record.intake?.gender ?? "unknown")
  },
  productGates: {
    ...productGates,
    allPassed: Object.values(productGates).every(Boolean),
    note: enoughIndependentValidation ? "Gates are calculated only on the untouched validation cohort." : "Fewer than 300 independent validation records: no product accuracy claim is eligible."
  }
};

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
