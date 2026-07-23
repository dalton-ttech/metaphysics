import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function percent(value) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function decimal(value, digits = 3) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(digits);
}

function metricTable(groups) {
  return Object.entries(groups).map(([name, metrics]) => `| ${name} | ${metrics.sessions} | ${percent(metrics.highConfidencePrecision)} | ${percent(metrics.highConfidenceRecall)} | ${percent(metrics.recallTierPrecision)} | ${percent(metrics.majorEventRecall)} | ${percent(metrics.weightedF1)} | ${decimal(metrics.brierScore)} | ${decimal(metrics.averageQuestions, 1)} |`).join("\n");
}

function bestGroupByCandidateF1(groups) {
  return Object.entries(groups).sort(([, a], [, b]) =>
    (b.weightedF1 ?? -1) - (a.weightedF1 ?? -1)
    || (a.brierScore ?? 1) - (b.brierScore ?? 1)
    || (a.averageQuestions ?? 24) - (b.averageQuestions ?? 24)
  )[0];
}

function csvCell(value) {
  const string = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function renderExperimentReport({ report, publicMetadata, runDirectory }) {
  const reportsDirectory = resolve(runDirectory, "reports");
  mkdirSync(reportsDirectory, { recursive: true });
  const [bestPolicy, bestPolicyMetrics] = bestGroupByCandidateF1(report.byCalibrationInterviewerPolicy);
  const [bestPool, bestPoolMetrics] = bestGroupByCandidateF1(report.byCalibrationPoolSize);
  const gates = {
    precision: (report.validation.highConfidencePrecision ?? 0) >= 0.9,
    candidatePrecision: (report.validation.recallTierPrecision ?? 0) >= 0.4,
    recall: (report.validation.majorEventRecall ?? 0) >= 0.7,
    falsePositiveRate: (report.validation.highConfidenceFalsePositiveRate ?? 1) <= 0.05,
    retest: report.testRetest.pairs >= 30 && (report.testRetest.jaccard ?? 0) >= 0.85,
    comprehension: (report.comprehension.clearRate ?? 0) >= 0.85
  };
  const allPassed = Object.values(gates).every(Boolean);
  const weakest = [...report.validation.perEvent]
    .filter((event) => event.support >= 5)
    .sort((a, b) => (a.recall ?? -1) - (b.recall ?? -1) || (a.precision ?? -1) - (b.precision ?? -1))
    .slice(0, 10);

  const markdown = `# 密封合成人生盲测实验报告

生成时间：${report.generatedAt}

## 结论

本次实验完成 ${report.profiles} 个独立合成人生样本、${report.sessions} 次盲测会话。独立验证组中，高置信层（阈值 ${decimal(report.thresholds.highConfidence, 2)}）Precision 为 ${percent(report.validation.highConfidencePrecision)}、真事件覆盖率为 ${percent(report.validation.highConfidenceRecall)}；候选验词层（阈值 ${decimal(report.thresholds.recall, 2)}）Precision 为 ${percent(report.validation.recallTierPrecision)}、Recall 为 ${percent(report.validation.majorEventRecall)}、F1 为 ${percent(report.validation.weightedF1)}。Brier Score 为 ${decimal(report.validation.brierScore)}。六项合成闸门${allPassed ? "全部通过" : "未全部通过"}。

只在 calibration 组内按候选层 F1 排序，提问策略以 **${bestPolicy}** 最高（F1 ${percent(bestPolicyMetrics.weightedF1)}、平均 ${decimal(bestPolicyMetrics.averageQuestions, 1)} 问）；题内事件数以 **${bestPool} 个事件**最高（F1 ${percent(bestPoolMetrics.weightedF1)}、Brier ${decimal(bestPoolMetrics.brierScore)}）。validation 分层只用于核验这种排序是否稳定，不再反向调参。题量选择仍应结合真人理解实验，本结论只对当前生成模型和回答噪声成立。

## 样本与隔离

- 独立样本：${publicMetadata.profiles}
- 问答会话：${publicMetadata.sessions}
- Agent-based respondent：${publicMetadata.respondentCounts.agentProfiles} 人 / ${publicMetadata.respondentCounts.agentSessions} 会话
- Rule respondent：${publicMetadata.respondentCounts.ruleProfiles} 人 / ${publicMetadata.respondentCounts.ruleSessions} 会话
- 题库哈希：\`${publicMetadata.questionBankHash}\`
- 密文档案哈希：\`${publicMetadata.encryptedArchiveHash}\`
- 隐藏种子承诺：\`${publicMetadata.seedHash}\`
- 高置信阈值：${decimal(report.thresholds.highConfidence, 2)}（只由 calibration 组选择）
- 召回阈值：${decimal(report.thresholds.recall, 2)}（只由 calibration 组选择）

实验期间，提问客户端没有获得人生真值、生成种子或管理员令牌；每次只收到当前题目的 yes/no/unsure。整批锁定后才写出真值审计文件。高置信层与候选验词层使用不同阈值，二者指标不得拼接成“同一分类器同时达到的 Precision/Recall”。

## 独立验证指标

| 会话 | 高置信P | 高置信覆盖 | 候选P | 候选R | 候选F1 | 高置信误报率 | Brier | 平均问题数 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ${report.validation.sessions} | ${percent(report.validation.highConfidencePrecision)} | ${percent(report.validation.highConfidenceRecall)} | ${percent(report.validation.recallTierPrecision)} | ${percent(report.validation.majorEventRecall)} | ${percent(report.validation.weightedF1)} | ${percent(report.validation.highConfidenceFalsePositiveRate)} | ${decimal(report.validation.brierScore)} | ${decimal(report.validation.averageQuestions, 1)} |

## 按提问策略（校准组选择）

| 策略 | 会话 | 高置信P | 高置信覆盖 | 候选P | 候选R | 候选F1 | Brier | 平均题数 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${metricTable(report.byCalibrationInterviewerPolicy)}

### 独立验证组核验

| 策略 | 会话 | 高置信P | 高置信覆盖 | 候选P | 候选R | 候选F1 | Brier | 平均题数 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${metricTable(report.byValidationInterviewerPolicy)}

## 按题内事件数（校准组选择）

| 每题事件数 | 会话 | 高置信P | 高置信覆盖 | 候选P | 候选R | 候选F1 | Brier | 平均题数 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${metricTable(report.byCalibrationPoolSize)}

### 独立验证组核验

| 每题事件数 | 会话 | 高置信P | 高置信覆盖 | 候选P | 候选R | 候选F1 | Brier | 平均题数 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${metricTable(report.byValidationPoolSize)}

## 按回答者模型

| 回答者 | 会话 | 高置信P | 高置信覆盖 | 候选P | 候选R | 候选F1 | Brier | 平均题数 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${metricTable(report.byRespondentMode)}

## 理解与复测

- Agent-based逐题逻辑完整理解率：${percent(report.comprehension.clearRate)}（${report.comprehension.observations} 次观察；判定方式：Oracle 隐变量状态，不是另一个评审 Agent）
- 复测一致性：${percent(report.testRetest.jaccard)}（${report.testRetest.pairs} 对）

## 合成闸门

| 闸门 | 标准 | 结果 |
|---|---|---|
| 高置信 Precision | ≥ 90% | ${gates.precision ? "通过" : "未通过"} |
| 候选层 Precision | ≥ 40% | ${gates.candidatePrecision ? "通过" : "未通过"} |
| 候选层重大事件 Recall | ≥ 70% | ${gates.recall ? "通过" : "未通过"} |
| 高置信误报率 | ≤ 5% | ${gates.falsePositiveRate ? "通过" : "未通过"} |
| 30对复测 Jaccard | ≥ 85% | ${gates.retest ? "通过" : "未通过"} |
| 模拟理解率 | ≥ 85% | ${gates.comprehension ? "通过" : "未通过"} |

## 最难识别事件

| 事件ID | 真值样本 | 高置信P | 候选P | 候选R | 候选FP | 候选FN |
|---|---:|---:|---:|---:|---:|---:|
${weakest.map((event) => `| ${event.eventId} | ${event.support} | ${percent(event.precision)} | ${percent(event.recallTierPrecision)} | ${percent(event.recall)} | ${event.fpRecall} | ${event.fnRecall} |`).join("\n")}

## 研究边界

合成样本发生率与行为参数是透明的工程假设，不代表真实人群统计。Agent-based respondent 仍共享同一套代理机制，不能替代真人的记忆、理解和敏感回避。该实验能证明代码闭环、泄漏控制和模型在预注册模拟世界中的性能，不能证明真实用户准确率。

公开锚点参考：[国家统计局2025年统计公报](https://www.stats.gov.cn/sj/zxfb/202602/t20260228_1962662.html)、[国家统计局2024年人口变动抽样调查](https://www.stats.gov.cn/xw/tjxw/tzgg/202410/t20241010_1956861.html)、[国家卫健委2024年居民健康素养监测](https://www.nhc.gov.cn/xcs/c100122/202501/18ecbeb9c42942bea9e0fced7a963299.shtml)、[最高人民法院2024年司法审判数据](https://www.court.gov.cn/zixun/xiangqing/453701.html)。
`;

  writeFileSync(resolve(reportsDirectory, "synthetic-experiment-summary.md"), markdown, "utf8");
  const eventCsv = [
    ["event_id", "support", "tp_high", "fp_high", "fn_high", "tn_high", "tp_recall", "fp_recall", "fn_recall", "precision", "recall"],
    ...report.validation.perEvent.map((event) => [event.eventId, event.support, event.tpHigh, event.fpHigh, event.fnHigh, event.tnHigh, event.tpRecall, event.fpRecall, event.fnRecall, event.precision, event.recall])
  ].map((row) => row.map(csvCell).join(",")).join("\n");
  writeFileSync(resolve(reportsDirectory, "validation-per-event.csv"), `${eventCsv}\n`, "utf8");
  const strataRows = [["dimension", "group", "sessions", "high_confidence_precision", "high_confidence_recall", "candidate_precision", "candidate_recall", "candidate_f1", "false_positive_rate", "brier", "average_questions"]];
  for (const [dimension, groups] of Object.entries({
    interviewerPolicyAll: report.byInterviewerPolicy,
    poolSizeAll: report.byPoolSize,
    interviewerPolicyCalibration: report.byCalibrationInterviewerPolicy,
    poolSizeCalibration: report.byCalibrationPoolSize,
    interviewerPolicyValidation: report.byValidationInterviewerPolicy,
    poolSizeValidation: report.byValidationPoolSize,
    respondentMode: report.byRespondentMode,
    cohort: report.byCohort
  })) {
    for (const [name, metrics] of Object.entries(groups)) strataRows.push([dimension, name, metrics.sessions, metrics.highConfidencePrecision, metrics.highConfidenceRecall, metrics.recallTierPrecision, metrics.majorEventRecall, metrics.weightedF1, metrics.highConfidenceFalsePositiveRate, metrics.brierScore, metrics.averageQuestions]);
  }
  writeFileSync(resolve(reportsDirectory, "strata.csv"), `${strataRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
  writeFileSync(resolve(reportsDirectory, "gates.json"), `${JSON.stringify({ gates, allPassed, rankingBasis: "calibration-only-candidate-tier-f1", bestPolicy, bestPool }, null, 2)}\n`, "utf8");
  return { allPassed, gates, bestPolicy, bestPool, summaryPath: resolve(reportsDirectory, "synthetic-experiment-summary.md") };
}
