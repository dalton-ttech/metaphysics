import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { sha256 } from "../../sealed-synthetic-v1/oracle/primitives.mjs";
import { V3_CONFIG } from "../config/experiment-config.mjs";

const root = resolve(import.meta.dirname, "..");
const resultPath = resolve(root, "reports", "canonical-result.json");
const summaryPath = resolve(root, "reports", "experiment-summary.md");
const report = JSON.parse(readFileSync(resultPath, "utf8"));

function evaluateGates(metrics, retest) {
  const output = {};
  for (const [group, gates] of Object.entries(V3_CONFIG.gates)) {
    const values = group === "retest" ? retest : metrics[group];
    output[group] = Object.fromEntries(Object.entries(gates).map(([key, threshold]) => {
      const profileField = { profilePrecision: "precision", profileRecall: "recall", profileJaccard: "jaccard" }[key];
      const metricKey = key === "averageRoundsMaximum" ? "averageRounds" : key;
      const actual = profileField && values.profile ? values.profile[profileField] : values[metricKey];
      const maximum = key.endsWith("Maximum");
      return [key, { threshold, actual, passed: maximum ? actual <= threshold : actual >= threshold }];
    }));
  }
  return output;
}

report.gates = evaluateGates(report.metrics, report.retest);
const gates = Object.values(report.gates).flatMap((group) => Object.values(group));
report.gateSummary = {
  passed: gates.filter((gate) => gate.passed).length,
  failed: gates.filter((gate) => !gate.passed).length
};
const core = {
  profileCalibration: report.profileCalibration,
  metrics: report.metrics,
  retest: report.retest,
  gates: report.gates
};
const resultSha256 = sha256(core);
report.commitments.coreMetrics = resultSha256;
const sourceFiles = [
  "config/experiment-config.mjs",
  "codebook/fact-catalog.mjs",
  "codebook/build-codebooks.mjs",
  "oracle/sealed-arena.mjs",
  "runner/inference-policy.mjs",
  "runner/run-experiment.mjs",
  "runner/reconcile-locked-report.mjs"
];
report.reproducibility = {
  sourceFilesSha256: sha256(sourceFiles.map((file) => ({ file, hash: sha256(readFileSync(resolve(root, file), "utf8")) }))),
  resultSha256
};

const pct = (value) => value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
const row = (label, metric) =>
  `| ${label} | ${pct(metric.top1Accuracy)} | ${pct(metric.top3Accuracy)} | ${metric.averageRounds.toFixed(1)} | ${pct(metric.profile.precision)} | ${pct(metric.profile.recall)} | ${pct(metric.profile.jaccard)} |`;
const failedGates = Object.entries(report.gates).flatMap(([group, groupGates]) =>
  Object.entries(groupGates).filter(([, gate]) => !gate.passed).map(([gate, value]) => ({ group, gate, ...value }))
);
const summary = `# sealed-tieban-v3 实验定稿

## 结论

120候选刻分、60条单命题条文的密封实验完成。预设闸门通过 ${report.gateSummary.passed} 项，失败 ${report.gateSummary.failed} 项；门槛未在运行后调整。该汇总由已锁定预测重算评估字段，未重新抽样或改写会话结果。

## 候选与画像结果

| 场景 | Top1 | Top3 | 平均轮数 | 画像Precision | 画像Recall | 画像Jaccard |
|---|---:|---:|---:|---:|---:|---:|
${row("默认独立验证", report.metrics.validation_default)}
${row("压力回答", report.metrics.validation_stress)}
${row("Agent persona", report.metrics.validation_agent)}
${row("强制1次错答", report.metrics.recovery_1_wrong)}
${row("强制2次错答", report.metrics.recovery_2_wrong)}

画像阈值仅由默认校准组选择：${report.profileCalibration.threshold.toFixed(2)}；校准Precision目标是否找到：${report.profileCalibration.precisionTargetFound ? "是" : "否"}。

## 复测

- Top1一致率：${pct(report.retest.top1Agreement)}
- Top3集合Jaccard：${pct(report.retest.top3Jaccard)}
- 画像Jaccard：${pct(report.retest.profileJaccard)}

## 错答恢复

- 强制1次错误回答：Top1 ${pct(report.metrics.recovery_1_wrong.top1Accuracy)}，Top3 ${pct(report.metrics.recovery_1_wrong.top3Accuracy)}，实际强制错答 ${report.metrics.recovery_1_wrong.forcedWrongAnswers} 次。
- 强制2次错误回答：Top1 ${pct(report.metrics.recovery_2_wrong.top1Accuracy)}，Top3 ${pct(report.metrics.recovery_2_wrong.top3Accuracy)}，实际强制错答 ${report.metrics.recovery_2_wrong.forcedWrongAnswers} 次。

## 未通过门槛

${failedGates.length ? failedGates.map((item) => `- ${item.group}.${item.gate}：实际 ${typeof item.actual === "number" ? item.actual.toFixed(4) : item.actual}，门槛 ${item.threshold}。`).join("\n") : "- 无。"}

## 码本与隔离

- 候选刻分：${report.codebooks.candidateCount}；最小汉明距离：${report.codebooks.diagnostics.minimumHammingDistance}。
- 单命题条文：${report.codebooks.clauseCount}；每条具有唯一primaryFactId。
- 推断端只能读取公开候选、条文、匿名会话和逐题“应/不应/未明”；无真值、assignment、解密或reveal接口。
- 同种子复现由测试覆盖；正式报告不包含明文种子或单人真值。

## 证据边界

本结果是工程合成证据。候选码本经最小汉明距离优化，是一个刻意拉开相邻候选的纠错上界；接近满分说明此工程码本可被问答系统可靠区分，并不等于真实120刻分天然具有同等可分性。Agent persona为带理解、记忆和稳定性差异的算法模拟，不是真人或外部LLM裁判；结果不能代替真人理解率、真实披露行为或现实命理效度。

核心结果SHA-256：\`${report.reproducibility.resultSha256}\`

源码集合SHA-256：\`${report.reproducibility.sourceFilesSha256}\`
`;

writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(summaryPath, summary, "utf8");

console.log(JSON.stringify({
  lockedPredictionsPreserved: true,
  passedGates: report.gateSummary.passed,
  failedGates: report.gateSummary.failed,
  resultSha256: report.reproducibility.resultSha256,
  sourceFilesSha256: report.reproducibility.sourceFilesSha256
}, null, 2));
