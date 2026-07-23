import { V4_CONFIG } from "../config/experiment-config.mjs";
import { FACT_CATALOG } from "./fact-catalog.mjs";
import { createDeterministicRandom, fnv1a32, parity, sha256 } from "../lib/deterministic.mjs";

const INTERVAL_MASKS = Object.freeze([
  1, 2, 4, 8, 16, 3, 5, 9, 17, 6, 10, 18, 12, 20, 24, 7, 11, 19,
  13, 21, 25, 14, 22, 26, 28, 15, 23, 27, 29, 30, 31, 1, 2, 4, 8, 16
]);
const MINUTE_MASKS = Object.freeze([
  1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15,
  17, 18, 19, 21, 22, 23, 33, 34, 35, 65, 66, 67
]);

function baseCodeBit(minuteOffset, factIndex) {
  if (factIndex < INTERVAL_MASKS.length) {
    return parity(Math.floor(minuteOffset / 4) & INTERVAL_MASKS[factIndex]);
  }
  return parity(minuteOffset & MINUTE_MASKS[factIndex - INTERVAL_MASKS.length]);
}

function compareHistograms(left, right) {
  for (let distance = 0; distance < left.length; distance += 1) {
    if (left[distance] !== right[distance]) return right[distance] - left[distance];
  }
  return 0;
}

function buildQuestionOrder() {
  const pairs = [];
  for (let left = 0; left < V4_CONFIG.candidateCount; left += 1) {
    for (let right = left + 1; right < V4_CONFIG.candidateCount; right += 1) {
      pairs.push({
        left,
        right,
        sameInterval: Math.floor(left / 4) === Math.floor(right / 4),
        distance: 0
      });
    }
  }
  const remaining = new Set(FACT_CATALOG.map((fact) => fact.index));
  const order = [];
  while (remaining.size) {
    let best = null;
    for (const factIndex of remaining) {
      const histogram = Array(order.length + 2).fill(0);
      const sameIntervalHistogram = Array(order.length + 2).fill(0);
      for (const pair of pairs) {
        const increment = baseCodeBit(pair.left, factIndex) !== baseCodeBit(pair.right, factIndex) ? 1 : 0;
        const distance = pair.distance + increment;
        histogram[distance] += 1;
        if (pair.sameInterval) sameIntervalHistogram[distance] += 1;
      }
      if (!best) {
        best = { factIndex, histogram, sameIntervalHistogram };
        continue;
      }
      const overall = compareHistograms(histogram, best.histogram);
      const within = compareHistograms(sameIntervalHistogram, best.sameIntervalHistogram);
      if (overall > 0 || (overall === 0 && within > 0) ||
        (overall === 0 && within === 0 && factIndex < best.factIndex)) {
        best = { factIndex, histogram, sameIntervalHistogram };
      }
    }
    order.push(best.factIndex);
    remaining.delete(best.factIndex);
    for (const pair of pairs) {
      if (baseCodeBit(pair.left, best.factIndex) !== baseCodeBit(pair.right, best.factIndex)) pair.distance += 1;
    }
  }
  return order;
}

export const QUESTION_ORDER = Object.freeze(buildQuestionOrder());

export function buildBirthSeed(index) {
  if (!Number.isInteger(index) || index < 0 || index >= V4_CONFIG.birthSeedCount) {
    throw new Error(`Birth seed index out of range: ${index}`);
  }
  const random = createDeterministicRandom(`sealed-tieban-v4/birth/${index}`);
  const year = 1960 + Math.floor(random() * 45);
  const month = 1 + Math.floor(random() * 12);
  const day = 1 + Math.floor(random() * 28);
  const hour = Math.floor(random() * 23);
  return Object.freeze({
    id: `BS4-${String(index).padStart(3, "0")}`,
    index,
    windowStart: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`,
    regionBand: Math.floor(random() * 8),
    transformSeed: fnv1a32(`birth-transform/${index}/${year}/${month}/${day}/${hour}`)
  });
}

function buildBirthMask(birthSeed) {
  const random = createDeterministicRandom(`sealed-tieban-v4/mask/${birthSeed.transformSeed}`);
  return Uint8Array.from(FACT_CATALOG, () => random() < 0.36 ? 1 : 0);
}

function buildCandidate(birthSeed, birthMask, minuteOffset) {
  const factBits = Uint8Array.from(FACT_CATALOG, (_, factIndex) =>
    baseCodeBit(minuteOffset, factIndex) ^ birthMask[factIndex]
  );
  const factIds = FACT_CATALOG.flatMap((fact, factIndex) => factBits[factIndex] ? [fact.id] : []);
  const id = `K4-${String(minuteOffset).padStart(3, "0")}`;
  return {
    id,
    minuteOffset,
    fourMinuteInterval: Math.floor(minuteOffset / 4),
    factBits,
    factIds,
    profileHash: sha256({ birthSeedId: birthSeed.id, id, factIds })
  };
}

function hamming(left, right, prefixLength = FACT_CATALOG.length) {
  let distance = 0;
  for (let orderIndex = 0; orderIndex < prefixLength; orderIndex += 1) {
    const factIndex = QUESTION_ORDER[orderIndex];
    if (left.factBits[factIndex] !== right.factBits[factIndex]) distance += 1;
  }
  return distance;
}

function minimumDistance(candidates, prefixLength, sameIntervalOnly = false) {
  let minimum = Infinity;
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (sameIntervalOnly && candidates[left].fourMinuteInterval !== candidates[right].fourMinuteInterval) continue;
      minimum = Math.min(minimum, hamming(candidates[left], candidates[right], prefixLength));
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
}

let sharedDistanceDiagnostics = null;

export function createBirthCandidatePool(birthSeedOrIndex) {
  const birthSeed = typeof birthSeedOrIndex === "number" ? buildBirthSeed(birthSeedOrIndex) : birthSeedOrIndex;
  const birthMask = buildBirthMask(birthSeed);
  const candidates = Array.from({ length: V4_CONFIG.candidateCount }, (_, minuteOffset) =>
    buildCandidate(birthSeed, birthMask, minuteOffset)
  );
  if (!sharedDistanceDiagnostics) {
    sharedDistanceDiagnostics = Object.freeze({
      minimumHammingDistanceAt16: minimumDistance(candidates, 16),
      minimumHammingDistanceAt26: minimumDistance(candidates, 26),
      sameIntervalMinimumDistanceAt26: minimumDistance(candidates, 26, true),
      fullMinimumHammingDistance: minimumDistance(candidates, 60)
    });
  }
  return {
    birthSeed,
    candidates,
    questionOrder: QUESTION_ORDER,
    diagnostics: {
      ...sharedDistanceDiagnostics,
      profileHash: sha256(candidates.map((candidate) => candidate.profileHash))
    }
  };
}

export function candidateBitForMinute(birthSeed, minuteOffset, factIndex) {
  const birthMask = buildBirthMask(birthSeed);
  return baseCodeBit(minuteOffset, factIndex) ^ birthMask[factIndex];
}
