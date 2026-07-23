import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EVENT_COUNT = 48;
const QUESTION_LIMIT = 24;
const TRIALS = 300;
const BASE_PRIOR = 0.135;
const POOL_SIZES = [1, 2, 3, 4, 5, 6];

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function clamp(value, min = 0.001, max = 0.999) {
  return Math.min(max, Math.max(min, value));
}

function binaryEntropy(probability) {
  const p = clamp(probability);
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

function noiseFor(poolSize) {
  const extra = Math.max(0, poolSize - 1);
  return {
    falsePositive: 0.035 + extra * 0.024,
    falseNegative: 0.03 + extra * 0.021
  };
}

function responseProbability(pool, probabilities) {
  const any = 1 - pool.reduce((product, id) => product * (1 - probabilities[id]), 1);
  const noise = noiseFor(pool.length);
  return clamp(noise.falsePositive + (1 - noise.falsePositive - noise.falseNegative) * any);
}

function posteriorFor(probabilities, pool, eventId, answer) {
  const prior = probabilities[eventId];
  const others = pool.filter((id) => id !== eventId);
  const anyOther = 1 - others.reduce((product, id) => product * (1 - probabilities[id]), 1);
  const noise = noiseFor(pool.length);
  const yesGivenTrue = 1 - noise.falseNegative;
  const yesGivenFalse = noise.falsePositive + (1 - noise.falsePositive - noise.falseNegative) * anyOther;
  const likelihoodTrue = answer ? yesGivenTrue : 1 - yesGivenTrue;
  const likelihoodFalse = answer ? yesGivenFalse : 1 - yesGivenFalse;
  return clamp(prior * likelihoodTrue / (prior * likelihoodTrue + (1 - prior) * likelihoodFalse));
}

function update(probabilities, pool, answer) {
  const next = [...probabilities];
  for (const eventId of pool) next[eventId] = posteriorFor(probabilities, pool, eventId, answer);
  return next;
}

function buildCandidatePools(poolSize, random) {
  const pools = [];
  const seen = new Set();
  const targetSize = poolSize === 1 ? EVENT_COUNT : 160;
  while (pools.length < targetSize) {
    const pool = [];
    while (pool.length < poolSize) {
      const candidate = Math.floor(random() * EVENT_COUNT);
      if (!pool.includes(candidate)) pool.push(candidate);
    }
    pool.sort((a, b) => a - b);
    const key = pool.join("-");
    if (!seen.has(key)) {
      seen.add(key);
      pools.push(pool);
    }
  }
  return pools;
}

function choosePool(candidates, used, probabilities, coverage) {
  let best = null;
  let bestScore = -Infinity;
  for (let index = 0; index < candidates.length; index += 1) {
    if (used.has(index)) continue;
    const pool = candidates[index];
    const pYes = responseProbability(pool, probabilities);
    const balance = binaryEntropy(pYes);
    const uncertainty = pool.reduce((sum, id) => sum + binaryEntropy(probabilities[id]), 0) / pool.length;
    const underCovered = pool.reduce((sum, id) => sum + Math.max(0, 2 - coverage[id]), 0) / pool.length;
    const score = balance * 0.5 + uncertainty * 0.38 + underCovered * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = { index, pool };
    }
  }
  return best;
}

function sampleTruth(random) {
  const truth = Array.from({ length: EVENT_COUNT }, () => random() < BASE_PRIOR);
  if (!truth.some(Boolean)) truth[Math.floor(random() * EVENT_COUNT)] = true;
  return truth;
}

function runTrial(poolSize, seed) {
  const random = mulberry32(seed);
  const truth = sampleTruth(random);
  let probabilities = Array.from({ length: EVENT_COUNT }, () => BASE_PRIOR);
  const candidates = buildCandidatePools(poolSize, random);
  const used = new Set();
  const coverage = Array.from({ length: EVENT_COUNT }, () => 0);

  for (let turn = 0; turn < QUESTION_LIMIT; turn += 1) {
    const selected = choosePool(candidates, used, probabilities, coverage);
    if (!selected) break;
    used.add(selected.index);
    selected.pool.forEach((id) => { coverage[id] += 1; });
    const trueAny = selected.pool.some((id) => truth[id]);
    const noise = noiseFor(poolSize);
    const observed = trueAny ? random() >= noise.falseNegative : random() < noise.falsePositive;
    probabilities = update(probabilities, selected.pool, observed);
  }

  const activeCount = truth.filter(Boolean).length;
  const predictedIds = probabilities
    .map((probability, id) => ({ probability, id }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, activeCount)
    .map((item) => item.id);
  const predicted = new Set(predictedIds);
  let truePositive = 0;
  for (let id = 0; id < EVENT_COUNT; id += 1) if (truth[id] && predicted.has(id)) truePositive += 1;
  const precision = truePositive / Math.max(1, predicted.size);
  const recall = truePositive / activeCount;
  const f1 = precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);
  const brier = probabilities.reduce((sum, probability, id) => sum + (probability - Number(truth[id])) ** 2, 0) / EVENT_COUNT;
  return { precision, recall, f1, brier };
}

const results = POOL_SIZES.map((poolSize) => {
  const totals = { precision: 0, recall: 0, f1: 0, brier: 0 };
  for (let trial = 0; trial < TRIALS; trial += 1) {
    const result = runTrial(poolSize, 20260720 + poolSize * 100000 + trial);
    for (const key of Object.keys(totals)) totals[key] += result[key];
  }
  const mean = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number((value / TRIALS).toFixed(4))]));
  const cognitiveCost = Number((1 + Math.max(0, poolSize - 1) * 0.12).toFixed(2));
  const utility = Number((mean.f1 / cognitiveCost).toFixed(4));
  return { poolSize, ...mean, cognitiveCost, utility };
});

const recommended = [...results].sort((a, b) => b.utility - a.utility)[0];
const payload = {
  generatedAt: new Date().toISOString(),
  type: "synthetic_engineering_simulation",
  assumptions: {
    eventCount: EVENT_COUNT,
    meanActiveEvents: EVENT_COUNT * BASE_PRIOR,
    questionLimit: QUESTION_LIMIT,
    trialsPerPoolSize: TRIALS,
    answerNoise: "false-positive=0.035+0.024*(poolSize-1), false-negative=0.03+0.021*(poolSize-1)",
    selection: "adaptive entropy, posterior uncertainty, and coverage score",
    caveat: "This compares mathematical designs under explicit assumptions; it does not replace human comprehension testing."
  },
  results,
  recommendation: {
    defaultScreeningPoolSize: recommended.poolSize,
    reason: "Highest F1-to-cognitive-cost utility under the declared synthetic noise model.",
    productionPolicy: "Use the winning size for broad screening, then reduce to pairs and single-event verification as posterior uncertainty falls."
  }
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDir, "..", "evaluation", "pool-size-simulation.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.table(results);
console.log(`Recommended screening pool size: ${recommended.poolSize}`);
console.log(`Saved: ${outputPath}`);
