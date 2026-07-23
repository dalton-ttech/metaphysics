import { V2_GENERATOR_CONFIG } from "../../sealed-synthetic-v2/config/generator-config.v2.mjs";

export const CORE_K_VALUES = [0, 2, 4, 6, 8];
export const EXTENDED_K_VALUES = [10, 12];

export const SAMPLE_PLANS = {
  rule: {
    calibration: 2000,
    validation: 1200,
    retest: 200
  },
  agent: {
    calibration: 500,
    validation: 300,
    retest: 30
  }
};

export const V23_POLICY_CONFIG = {
  baselineQuestions: 24,
  preferredPosteriorRange: [0.25, 0.88],
  directSensitivity: 0.90,
  directSpecificity: 0.95,
  informationWeight: 0.72,
  salienceWeight: 0.20,
  preferredRangeBonus: 0.08,
  sufficientConsistentDirectAnswers: 2,
  calibration: {
    highPrecisionTarget: 0.95,
    candidateRecallFloor: 0.70,
    candidatePrecisionFloor: 0.40
  },
  extensionTrigger: {
    candidateF1GainK6ToK8: 0.005,
    candidateRecallGainK6ToK8: 0.01,
    minimumRecallGainK6ToK8: 0.015
  },
  agentTrigger: {
    candidateF1Spread: 0.01,
    stressVsDefaultF1Delta: 0.01,
    brierSpread: 0.003
  },
  recommendation: {
    validationHighPrecisionFloor: 0.90,
    validationCandidateRecallFloor: 0.70,
    tailRecallToleranceFromK0: 0.05,
    candidateRetestJaccardFloor: 0.85,
    nearBestScoreTolerance: 0.005
  }
};

export function buildGeneratorConfig({ respondentMode, scenario = "default", samplePlan } = {}) {
  if (!['rule', 'agent'].includes(respondentMode)) throw new Error(`Unsupported respondent mode: ${respondentMode}`);
  const plan = samplePlan ?? SAMPLE_PLANS[respondentMode];
  const config = structuredClone(V2_GENERATOR_CONFIG);
  config.version = `sealed-synthetic-generator-v2.3-${respondentMode}-${scenario}`;
  const agentCalibration = respondentMode === "agent" ? plan.calibration : 0;
  const agentValidation = respondentMode === "agent" ? plan.validation : 0;
  config.cohorts = [
    { id: "calibration", profiles: plan.calibration, agentProfiles: agentCalibration },
    { id: "validation", profiles: plan.validation, agentProfiles: agentValidation }
  ];
  config.retest = {
    cohort: "validation",
    respondentMode,
    sessions: plan.retest,
    intervalDays: [7, 14]
  };

  if (scenario === "stress") {
    config.memory.recallFidelity = { mean: 0.76, sd: 0.12, min: 0.35, max: 0.97 };
    config.memory.falsePositiveTendency = { mean: 0.065, sd: 0.04, min: 0.005, max: 0.22 };
    config.memory.retestDrift = { mean: 0.09, sd: 0.035, min: 0.015, max: 0.20 };
    config.persona.sensitiveDisclosure = { mean: 0.66, sd: 0.18, min: 0.15, max: 0.96 };
    config.persona.responseCaution = { mean: 0.61, sd: 0.18, min: 0.08, max: 0.98 };
  } else if (scenario !== "default") {
    throw new Error(`Unsupported scenario: ${scenario}`);
  }
  return config;
}
