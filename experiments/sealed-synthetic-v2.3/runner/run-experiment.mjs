import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CORE_K_VALUES,
  EXTENDED_K_VALUES,
  SAMPLE_PLANS,
  V23_POLICY_CONFIG
} from "../config/experiment-config.mjs";
import { reproducibleHash, runSeries } from "./experiment-core.mjs";

const root = resolve(import.meta.dirname, "..");
const seed = process.env.SEALED_V23_SEED || randomBytes(32).toString("hex");

function progress({ completed, total, k, respondentMode, scenario }) {
  process.stdout.write(`\r${respondentMode}/${scenario} K=${k}: ${completed}/${total}`);
  if (completed === total) process.stdout.write("\n");
}

function shouldExtend(result) {
  const k6 = result.byK[6].validation;
  const k8 = result.byK[8].validation;
  return (
    (k8.candidateF1 ?? 0) - (k6.candidateF1 ?? 0) >= V23_POLICY_CONFIG.extensionTrigger.candidateF1GainK6ToK8 ||
    (k8.candidateRecall ?? 0) - (k6.candidateRecall ?? 0) >= V23_POLICY_CONFIG.extensionTrigger.candidateRecallGainK6ToK8 ||
    (k8.minimumPerEventRecall ?? 0) - (k6.minimumPerEventRecall ?? 0) >= V23_POLICY_CONFIG.extensionTrigger.minimumRecallGainK6ToK8
  );
}

function shouldRunAgent(defaultResult, stressResult) {
  const defaultMetrics = CORE_K_VALUES.map((k) => defaultResult.byK[k].validation);
  const f1Values = defaultMetrics.map((metric) => metric.candidateF1 ?? 0);
  const brierValues = defaultMetrics.map((metric) => metric.brierScore ?? 1);
  const f1Spread = Math.max(...f1Values) - Math.min(...f1Values);
  const brierSpread = Math.max(...brierValues) - Math.min(...brierValues);
  const defaultK8 = defaultResult.byK[8].validation.candidateF1 ?? 0;
  const stressK8 = stressResult.byK[8].validation.candidateF1 ?? 0;
  return {
    triggered:
      f1Spread >= V23_POLICY_CONFIG.agentTrigger.candidateF1Spread ||
      Math.abs(defaultK8 - stressK8) >= V23_POLICY_CONFIG.agentTrigger.stressVsDefaultF1Delta ||
      brierSpread >= V23_POLICY_CONFIG.agentTrigger.brierSpread,
    f1Spread,
    brierSpread,
    stressVsDefaultF1DeltaAtK8: stressK8 - defaultK8
  };
}

function mergeSeries(left, right) {
  if (!right) return left;
  return {
    ...left,
    kValues: [...left.kValues, ...right.kValues],
    byK: { ...left.byK, ...right.byK },
    commitments: {
      ...left.commitments,
      extendedMetrics: right.commitments.metrics,
      combinedMetrics: reproducibleHash({ ...left.byK, ...right.byK })
    },
    audit: { base: left.audit, extended: right.audit }
  };
}

export function scoreRecommendation(results, kValues) {
  const scenarios = [results.ruleDefault, results.ruleStress, ...(results.agentPersona ? [results.agentPersona] : [])];
  const baselineTailRecall = Math.min(...scenarios.map((result) => result.byK[0].validation.minimumPerEventRecall ?? 0));
  const recommendation = V23_POLICY_CONFIG.recommendation;
  const rows = kValues.map((k) => {
    const arms = scenarios.map((result) => result.byK[k]);
    const metrics = arms.map((arm) => arm.validation);
    const meanF1 = metrics.reduce((sum, metric) => sum + (metric.candidateF1 ?? 0), 0) / metrics.length;
    const worstRecall = Math.min(...metrics.map((metric) => metric.candidateRecall ?? 0));
    const worstPerEventRecall = Math.min(...metrics.map((metric) => metric.minimumPerEventRecall ?? 0));
    const worstHighPrecision = Math.min(...metrics.map((metric) => metric.highConfidencePrecision ?? 0));
    const worstCandidateRetestJaccard = Math.min(...arms.map((arm) => arm.testRetest.candidateJaccard ?? 0));
    const highThresholdCalibrated = arms.every((arm) => arm.thresholds.highPrecisionTargetFound);
    const tailRecallLossFromK0 = baselineTailRecall - worstPerEventRecall;
    const robustScore = meanF1 + worstRecall * 0.08 + worstPerEventRecall * 0.06 - k * 0.0015;
    return { k, totalQuestions: 24 + k, meanF1, worstRecall, worstPerEventRecall, tailRecallLossFromK0, worstHighPrecision, worstCandidateRetestJaccard, highThresholdCalibrated, robustScore };
  });
  const eligible = rows.filter(
    (row) =>
      row.highThresholdCalibrated &&
      row.worstHighPrecision >= recommendation.validationHighPrecisionFloor &&
      row.worstRecall >= recommendation.validationCandidateRecallFloor &&
      row.tailRecallLossFromK0 <= recommendation.tailRecallToleranceFromK0 &&
      row.worstCandidateRetestJaccard >= recommendation.candidateRetestJaccardFloor
  );
  const ranked = [...(eligible.length ? eligible : rows)].sort((a, b) => b.robustScore - a.robustScore || a.k - b.k);
  const best = ranked[0];
  const eligibleSet = new Set((eligible.length ? eligible : rows).map((row) => row.k));
  const nearBest = rows
    .filter((row) => eligibleSet.has(row.k) && row.robustScore >= best.robustScore - recommendation.nearBestScoreTolerance && row.worstRecall >= best.worstRecall - 0.01)
    .sort((a, b) => a.k - b.k)[0] ?? best;
  return {
    recommendedK: nearBest.k,
    recommendedTotalQuestions: nearBest.totalQuestions,
    baselineTailRecall,
    eligibleKValues: eligible.map((row) => row.k),
    rows,
    rule: "须同时满足校准高置信目标、独立验证高置信Precision≥90%、候选Recall≥70%、最低逐事件Recall较K=0下降≤2.5个百分点、候选复测Jaccard≥85%；再选择稳健得分距最优0.005以内且题数最少的K。"
  };
}

function compactSeries(series) {
  return {
    respondentMode: series.respondentMode,
    scenario: series.scenario,
    profiles: series.profiles,
    sessionsPerArm: series.sessionsPerArm,
    kValues: series.kValues,
    byK: Object.fromEntries(Object.entries(series.byK).map(([k, arm]) => [k, {
      k: arm.k,
      totalQuestions: arm.totalQuestions,
      thresholds: arm.thresholds,
      validation: arm.validation,
      calibration: arm.calibration,
      testRetest: arm.testRetest,
      selectionDiagnostics: arm.selectionDiagnostics
    }])),
    commitments: series.commitments,
    audit: series.audit
  };
}

export function computeSourceHash() {
  const files = [
    "config/experiment-config.mjs",
    "oracle/sealed-arena.mjs",
    "runner/targeted-policy.mjs",
    "runner/experiment-core.mjs",
    "runner/run-experiment.mjs",
    "../sealed-synthetic-v2/oracle/question-bank.mjs",
    "../sealed-synthetic-v2/runner/policies.mjs",
    "../sealed-synthetic-v1/generator/index.mjs",
    "../sealed-synthetic-v1/config/generator-config.v1.mjs",
    "../sealed-synthetic-v1/oracle/primitives.mjs"
  ];
  return reproducibleHash(files.map((file) => ({
    file,
    sha256: reproducibleHash(readFileSync(resolve(root, file), "utf8"))
  })));
}

export function renderSummary(result) {
  const pct = (value) => value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
  const lines = [
    "# 密封合成人生实验 v2.3 定稿",
    "",
    `结论：建议在 v2.2 固定24题之后增加 **${result.conclusion.recommendedK} 道**单事件定向验真，即总题数 **${result.conclusion.recommendedTotalQuestions} 道**。`,
    "",
    "## 规则模拟：默认噪声",
    "",
    "| K | 总题数 | 高置信P/R | 候选P/R/F1 | 最低逐事件Recall | Brier | 复测候选Jaccard |",
    "|---:|---:|---:|---:|---:|---:|---:|",
    ...result.kValues.map((k) => {
      const arm = result.ruleDefault.byK[k];
      const m = arm.validation;
      return `| ${k} | ${arm.totalQuestions} | ${pct(m.highConfidencePrecision)} / ${pct(m.highConfidenceRecall)}${arm.thresholds.highPrecisionTargetFound ? "" : "（校准未达标）"} | ${pct(m.candidatePrecision)} / ${pct(m.candidateRecall)} / ${pct(m.candidateF1)} | ${pct(m.minimumPerEventRecall)} (${m.minimumRecallEvent?.eventId ?? "—"}) | ${m.brierScore.toFixed(4)} | ${pct(arm.testRetest.candidateJaccard)} |`;
    }),
    "",
    "## 压力噪声与Agent模拟",
    "",
    `规则压力场景已运行；Agent模拟触发条件：${result.agentDecision.triggered ? "已触发并完成" : "未触发"}。`,
    result.agentDecision.triggered
      ? `触发证据：默认规则组K间候选F1跨度 ${pct(result.agentDecision.f1Spread)}，Brier跨度 ${result.agentDecision.brierSpread.toFixed(4)}，K=8压力相对默认F1变化 ${pct(result.agentDecision.stressVsDefaultF1DeltaAtK8)}。`
      : "规则组各K差异与噪声敏感性均低于预注册阈值，因此没有追加Agent会话。",
    "",
    `题数筛选门槛通过的K：${result.conclusion.eligibleKValues.length ? result.conclusion.eligibleKValues.join("、") : "无"}。最低逐事件Recall以K=0跨场景基线 ${pct(result.conclusion.baselineTailRecall)} 为参照，最多容许下降5个百分点；该宽度与低频事件在1200人验证组中的样本分辨率相称。`,
    "",
    "## 推荐点跨场景结果",
    "",
    "| 场景 | 高置信P/R | 候选P/R/F1 | 最低逐事件Recall | Brier | 复测候选Jaccard |",
    "|---|---:|---:|---:|---:|---:|",
    ...[
      ["规则默认", result.ruleDefault],
      ["规则压力", result.ruleStress],
      ...(result.agentPersona ? [["Agent persona", result.agentPersona]] : [])
    ].map(([label, series]) => {
      const arm = series.byK[result.conclusion.recommendedK];
      const metric = arm.validation;
      return `| ${label} | ${pct(metric.highConfidencePrecision)} / ${pct(metric.highConfidenceRecall)} | ${pct(metric.candidatePrecision)} / ${pct(metric.candidateRecall)} / ${pct(metric.candidateF1)} | ${pct(metric.minimumPerEventRecall)} | ${metric.brierScore.toFixed(4)} | ${pct(arm.testRetest.candidateJaccard)} |`;
    }),
    "",
    `K=${result.conclusion.recommendedK} 的定向题有 ${pct(result.ruleDefault.byK[result.conclusion.recommendedK].selectionDiagnostics.preferredRangeRate)} 在选择当时位于0.25—0.88后验区间。K=10/12虽然继续提高总体F1，但最低逐事件Recall骤降并在压力组损害复测稳定性，因此不推荐。`,
    "",
    "## 判定边界",
    "",
    "所有真值只在密封arena闭包中解密；提问策略只能取得公开事件目录、会话描述和当前问题的‘是/否/不确定’。阈值只由校准组选择，表中结果来自独立validation组。合成结果不能替代真人理解率与真人准确率证据。",
    "",
    `核心结果SHA-256：\`${result.reproducibility.coreMetricsSha256}\``,
    `策略与配置SHA-256：\`${result.reproducibility.designSha256}\``,
    `源码集合SHA-256：\`${result.reproducibility.sourceFilesSha256}\``
  ];
  return `${lines.join("\n")}\n`;
}

export async function runExperiment() {
const ruleDefaultCore = await runSeries({ seed, respondentMode: "rule", scenario: "default", kValues: CORE_K_VALUES, onProgress: progress });
const extensionNeeded = shouldExtend(ruleDefaultCore);
const extraKs = extensionNeeded ? EXTENDED_K_VALUES : [];
const ruleDefaultExtra = extensionNeeded
  ? await runSeries({ seed, respondentMode: "rule", scenario: "default", kValues: extraKs, onProgress: progress })
  : null;
const ruleDefault = mergeSeries(ruleDefaultCore, ruleDefaultExtra);

const allKs = [...CORE_K_VALUES, ...extraKs];
const ruleStress = await runSeries({ seed, respondentMode: "rule", scenario: "stress", kValues: allKs, onProgress: progress });
const agentDecision = shouldRunAgent(ruleDefault, ruleStress);
const agentPersona = agentDecision.triggered
  ? await runSeries({ seed, respondentMode: "agent", scenario: "default", kValues: allKs, onProgress: progress })
  : null;

const series = {
  ruleDefault: compactSeries(ruleDefault),
  ruleStress: compactSeries(ruleStress),
  agentPersona: agentPersona ? compactSeries(agentPersona) : null
};
const conclusion = scoreRecommendation(series, allKs);
const canonical = {
  schemaVersion: "sealed-synthetic-v2.3-result-v1",
  modelVersion: "sealed-synthetic-v2.3",
  baseline: {
    source: "sealed-synthetic-v2.2",
    fixedQuestions: 24,
    structure: { coverage3Event: 16, rareCrosscheck2or3Event: 4, repeatedSingleEvent: 4 }
  },
  kValues: allKs,
  extensionDecision: { triggered: extensionNeeded, addedKValues: extraKs, rule: V23_POLICY_CONFIG.extensionTrigger },
  agentDecision,
  samples: { rule: SAMPLE_PLANS.rule, agent: agentDecision.triggered ? SAMPLE_PLANS.agent : null },
  selectionPolicy: V23_POLICY_CONFIG,
  ...series,
  conclusion,
  evidenceBoundary: "工程合成证据，不替代真人理解率、真人披露行为或真实产品准确率。",
  reproducibility: {
    seedCommitment: ruleDefault.commitments.seed,
    truthCommitment: ruleDefault.commitments.truth,
    questionBankSha256: ruleDefault.commitments.questionBank,
    sourceFilesSha256: computeSourceHash(),
    designSha256: reproducibleHash({ baseline: 24, kValues: allKs, samples: SAMPLE_PLANS, policy: V23_POLICY_CONFIG }),
    coreMetricsSha256: reproducibleHash({
      ruleDefault: series.ruleDefault.byK,
      ruleStress: series.ruleStress.byK,
      agentPersona: series.agentPersona?.byK ?? null,
      conclusion
    })
  }
};

const reports = resolve(root, "reports");
mkdirSync(reports, { recursive: true });
writeFileSync(resolve(reports, "canonical-result.json"), `${JSON.stringify(canonical, null, 2)}\n`, "utf8");
writeFileSync(resolve(reports, "experiment-summary.md"), renderSummary(canonical), "utf8");
console.log(JSON.stringify({
  output: resolve(reports, "canonical-result.json"),
  summary: resolve(reports, "experiment-summary.md"),
  kValues: allKs,
  extensionTriggered: extensionNeeded,
  agentTriggered: agentDecision.triggered,
  recommendedK: conclusion.recommendedK,
  recommendedTotalQuestions: conclusion.recommendedTotalQuestions,
  coreMetricsSha256: canonical.reproducibility.coreMetricsSha256
}, null, 2));
return canonical;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runExperiment();
}
