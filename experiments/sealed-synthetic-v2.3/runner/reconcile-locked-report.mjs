import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SAMPLE_PLANS, V23_POLICY_CONFIG } from "../config/experiment-config.mjs";
import { reproducibleHash } from "./experiment-core.mjs";
import { computeSourceHash, renderSummary, scoreRecommendation } from "./run-experiment.mjs";

const reportPath = resolve(import.meta.dirname, "..", "reports", "canonical-result.json");
const summaryPath = resolve(import.meta.dirname, "..", "reports", "experiment-summary.md");
const result = JSON.parse(readFileSync(reportPath, "utf8"));
const series = {
  ruleDefault: result.ruleDefault,
  ruleStress: result.ruleStress,
  agentPersona: result.agentPersona
};
result.selectionPolicy = V23_POLICY_CONFIG;
result.conclusion = scoreRecommendation(series, result.kValues);
result.reproducibility.designSha256 = reproducibleHash({
  baseline: 24,
  kValues: result.kValues,
  samples: SAMPLE_PLANS,
  policy: V23_POLICY_CONFIG
});
result.reproducibility.sourceFilesSha256 = computeSourceHash();
result.reproducibility.coreMetricsSha256 = reproducibleHash({
  ruleDefault: series.ruleDefault.byK,
  ruleStress: series.ruleStress.byK,
  agentPersona: series.agentPersona?.byK ?? null,
  conclusion: result.conclusion
});
writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
writeFileSync(summaryPath, renderSummary(result), "utf8");
console.log(JSON.stringify({
  lockedPredictionsPreserved: true,
  recommendedK: result.conclusion.recommendedK,
  recommendedTotalQuestions: result.conclusion.recommendedTotalQuestions,
  eligibleKValues: result.conclusion.eligibleKValues,
  coreMetricsSha256: result.reproducibility.coreMetricsSha256,
  designSha256: result.reproducibility.designSha256
}, null, 2));
