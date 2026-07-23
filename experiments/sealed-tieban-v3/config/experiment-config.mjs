export const V3_CONFIG = {
  version: "sealed-tieban-v3.0",
  candidateCount: 120,
  candidatePoolSize: 6000,
  factCount: 60,
  answers: ["应", "不应", "未明"],
  rounds: {
    minimum: 12,
    maximum: 26,
    stopTop1Posterior: 0.82,
    stopTop3Posterior: 0.96,
    stopNormalizedEntropy: 0.24
  },
  inferenceLikelihood: {
    factTrue: { "应": 0.88, "不应": 0.07, "未明": 0.05 },
    factFalse: { "应": 0.05, "不应": 0.90, "未明": 0.05 }
  },
  responseScenarios: {
    default: { errorRate: 0.04, unknownRate: 0.035, stableWeight: 0.94 },
    stress: { errorRate: 0.12, unknownRate: 0.10, stableWeight: 0.82 },
    agent_persona: {
      errorRate: [0.045, 0.16],
      unknownRate: [0.04, 0.15],
      stableWeight: [0.76, 0.95]
    },
    retest: { errorRate: 0.04, unknownRate: 0.035, stableWeight: 0.88 }
  },
  samples: {
    calibration_default: 2400,
    validation_default: 1200,
    validation_stress: 1200,
    validation_agent: 600,
    recovery_1_wrong: 1200,
    recovery_2_wrong: 1200,
    retest: 240
  },
  profileCalibration: {
    precisionTarget: 0.85,
    thresholdMinimum: 0.30,
    thresholdMaximum: 0.90,
    thresholdStep: 0.01
  },
  gates: {
    validation_default: {
      top1Accuracy: 0.85,
      top3Accuracy: 0.95,
      averageRoundsMaximum: 22,
      profilePrecision: 0.85,
      profileRecall: 0.75,
      profileJaccard: 0.68
    },
    validation_stress: {
      top1Accuracy: 0.65,
      top3Accuracy: 0.82,
      averageRoundsMaximum: 25,
      profilePrecision: 0.75,
      profileRecall: 0.62,
      profileJaccard: 0.52
    },
    validation_agent: {
      top1Accuracy: 0.65,
      top3Accuracy: 0.82,
      averageRoundsMaximum: 25,
      profilePrecision: 0.75,
      profileRecall: 0.62,
      profileJaccard: 0.52
    },
    recovery_1_wrong: { top1Accuracy: 0.75, top3Accuracy: 0.90 },
    recovery_2_wrong: { top1Accuracy: 0.60, top3Accuracy: 0.80 },
    retest: { top1Agreement: 0.85, top3Jaccard: 0.82, profileJaccard: 0.80 }
  }
};

export function buildSampleConfig(overrides = {}) {
  return { ...V3_CONFIG.samples, ...overrides };
}

