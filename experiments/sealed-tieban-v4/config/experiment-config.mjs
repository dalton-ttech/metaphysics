export const V4_CONFIG = Object.freeze({
  version: "sealed-tieban-v4.0",
  candidateCount: 120,
  factCount: 60,
  birthSeedCount: 500,
  personaCount: 1500,
  answers: ["应", "不应", "未明"],
  rounds: {
    minimum: 16,
    maximum: 32,
    stopTop1Posterior: 0.975,
    stopTop3Posterior: 0.997,
    stopNormalizedEntropy: 0.13
  },
  inferenceLikelihood: {
    factTrue: { "应": 0.89, "不应": 0.055, "未明": 0.055 },
    factFalse: { "应": 0.055, "不应": 0.89, "未明": 0.055 }
  },
  samples: {
    calibration_in_model: 5000,
    validation_in_model_default: 12000,
    validation_in_model_noisy: 12000,
    validation_out_model: 19500,
    extreme_conflict: 500,
    determinism_retest: 500,
    birth_counterfactual: 500
  },
  outModel: {
    ordinaryFlipRate: 0.10,
    extremeFlipRate: 0.30
  },
  gates: {
    validation_in_model_default: {
      minuteAccuracy: { direction: "minimum", threshold: 0.90 },
      fourMinuteIntervalAccuracy: { direction: "minimum", threshold: 0.96 },
      portraitPrecision: { direction: "minimum", threshold: 0.88 },
      portraitRecall: { direction: "minimum", threshold: 0.88 },
      unaskedEventPrecision: { direction: "minimum", threshold: 0.85 },
      averageRounds: { direction: "maximum", threshold: 24 },
      directQuestionReuseRate: { direction: "maximum", threshold: 0 },
      questionBookEightGramReuseRate: { direction: "maximum", threshold: 0.01 }
    },
    validation_in_model_noisy: {
      minuteAccuracy: { direction: "minimum", threshold: 0.70 },
      fourMinuteIntervalAccuracy: { direction: "minimum", threshold: 0.82 },
      portraitPrecision: { direction: "minimum", threshold: 0.75 },
      portraitRecall: { direction: "minimum", threshold: 0.75 },
      unaskedEventPrecision: { direction: "minimum", threshold: 0.72 },
      wrongAnswerRecoveryRate: { direction: "minimum", threshold: 0.65 },
      directQuestionReuseRate: { direction: "maximum", threshold: 0 }
    },
    validation_out_model: {
      minuteAccuracy: { direction: "minimum", threshold: 0.55 },
      fourMinuteIntervalAccuracy: { direction: "minimum", threshold: 0.70 },
      portraitPrecision: { direction: "minimum", threshold: 0.72 },
      portraitRecall: { direction: "minimum", threshold: 0.72 },
      unaskedEventPrecision: { direction: "minimum", threshold: 0.70 },
      directQuestionReuseRate: { direction: "maximum", threshold: 0 }
    },
    extreme_conflict: {
      fourMinuteIntervalAccuracy: { direction: "minimum", threshold: 0.12 },
      portraitPrecision: { direction: "minimum", threshold: 0.45 },
      unaskedEventPrecision: { direction: "minimum", threshold: 0.40 }
    },
    determinism: {
      exactReplayRate: { direction: "minimum", threshold: 1 }
    },
    birthCounterfactual: {
      lockedCandidateChangeRate: { direction: "minimum", threshold: 0.80 },
      bookDifferenceRate: { direction: "minimum", threshold: 0.90 },
      meanLockedProfileJaccard: { direction: "maximum", threshold: 0.75 }
    },
    bookSeparation: {
      differentCandidateBookDifferenceRate: { direction: "minimum", threshold: 0.99 },
      meanBookTokenJaccard: { direction: "maximum", threshold: 0.80 }
    }
  }
});

export const FORMAL_SESSION_COUNT = Object.values(V4_CONFIG.samples).reduce((sum, value) => sum + value, 0);
