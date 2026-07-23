import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { V4_CONFIG } from "../config/experiment-config.mjs";
import { createBirthCandidatePool, QUESTION_ORDER } from "../domain/birth-candidate-pool.mjs";
import { CLAUSE_CODEBOOK } from "../domain/fact-catalog.mjs";
import { sha256 } from "../lib/deterministic.mjs";
import { buildPersonaConfigs } from "../personas/build-personas.mjs";
import { runV4Experiment } from "./experiment-engine.mjs";

const root = resolve(import.meta.dirname, "..");
const report = await runV4Experiment({
  onProgress: ({ executedSessions, plannedSessions, group }) => {
    process.stdout.write(`\rV4 sealed sessions ${executedSessions}/${plannedSessions} [${group}]`);
  }
});
process.stdout.write("\n");

const sourceFiles = [
  "config/experiment-config.mjs",
  "lib/deterministic.mjs",
  "domain/fact-catalog.mjs",
  "domain/birth-candidate-pool.mjs",
  "personas/build-personas.mjs",
  "book/generate-book.mjs",
  "oracle/sealed-life-session.mjs",
  "runner/inference-policy.mjs",
  "runner/experiment-engine.mjs",
  "runner/run-experiment.mjs",
  "tests/v4.test.mjs"
];
report.commitments.aggregateCore = sha256({
  samples: report.samples,
  metrics: report.metrics,
  pairedNoise: report.pairedNoise,
  determinism: report.determinism,
  birthCounterfactual: report.birthCounterfactual,
  bookSeparation: report.bookSeparation,
  gates: report.gates
});
report.reproducibility = {
  deterministicProgramSimulation: true,
  sourceFilesSha256: sha256(sourceFiles.map((file) => ({ file, sha256: sha256(readFileSync(resolve(root, file), "utf8")) }))),
  resultSha256: report.commitments.aggregateCore
};

const percent = (value) => `${(value * 100).toFixed(2)}%`;
const row = (label, metric) => `| ${label} | ${percent(metric.minuteAccuracy)} | ${percent(metric.fourMinuteIntervalAccuracy)} | ${percent(metric.top3MinuteAccuracy)} | ${percent(metric.portraitPrecision)} | ${percent(metric.portraitRecall)} | ${percent(metric.portraitJaccard)} | ${percent(metric.unaskedEventPrecision)} | ${metric.averageRounds.toFixed(2)} |`;
const failedGates = Object.entries(report.gates).flatMap(([group, gates]) =>
  Object.entries(gates).filter(([, gate]) => !gate.passed).map(([metric, gate]) => ({ group, metric, ...gate }))
);
const summary = `# sealed-tieban-v4 封存模拟报告

## 结论

本次实际执行 ${report.executedSessions.toLocaleString("en-US")} 次程序会话，包含 ${report.personaCohort.count} 个可复用带噪 Persona 和 ${report.samples.extreme_conflict} 个极端/冲突样本。预先固定的30项门槛通过 ${report.gateSummary.passed} 项，失败 ${report.gateSummary.failed} 项；运行后没有降低标准。

## 因果链封存

\`BirthSeed → 预生成120候选Profile → 从候选Profile矩阵取条 → 回答只更新候选后验 → 锁定一个Profile → 仅由locked Profile生成命书\`

- 命书生成器输入只有 \`lockedProfile\` 与 \`birthSeed\`，不接收问答记录。
- 提交前的推断端没有真分钟、真画像、解密或 reveal 接口。
- 回答不会增删候选画像事实；锁定后由候选画像原样进入命书生成器。

## 核心指标

| 场景 | 分钟找回 | 4分钟区间 | Top3分钟 | Portrait P | Portrait R | Portrait J | 未直接问事件P | 平均轮数 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${row("模型内默认", report.metrics.validation_in_model_default)}
${row("模型内带噪", report.metrics.validation_in_model_noisy)}
${row("模型外独立人生", report.metrics.validation_out_model)}
${row("极端/冲突", report.metrics.extreme_conflict)}

模型外独立人生画像不等于候选画像的比例为 ${percent(report.metrics.validation_out_model.outsideCandidateRate)}。带噪会话中，至少发生一次明确错答后仍找回真分钟的比例为 ${percent(report.metrics.validation_in_model_noisy.wrongAnswerRecoveryRate)}；与默认组配对后，默认正确样本的分钟保持率为 ${percent(report.pairedNoise.exactRetentionGivenDefaultCorrect)}。

## 反事实、确定性与命书差异

- 同输入完整复测一致率：${percent(report.determinism.exactReplayRate)}（${report.determinism.replaySessions}次重放）。
- 更换 BirthSeed 后 locked candidate 改变率：${percent(report.birthCounterfactual.lockedCandidateChangeRate)}。
- 更换 BirthSeed 后命书差异率：${percent(report.birthCounterfactual.bookDifferenceRate)}。
- 反事实 locked Profile 平均Jaccard：${report.birthCounterfactual.meanLockedProfileJaccard.toFixed(4)}。
- 不同 locked candidate 命书哈希差异率：${percent(report.bookSeparation.differentCandidateBookDifferenceRate)}。
- 不同命书二字片段平均Jaccard：${report.bookSeparation.meanBookTokenJaccard.toFixed(4)}。
- 直接复用完整问句率：模型内默认 ${percent(report.metrics.validation_in_model_default.directQuestionReuseRate)}，模型外 ${percent(report.metrics.validation_out_model.directQuestionReuseRate)}。
- 问句与命书八字片段复用率：模型内默认 ${percent(report.metrics.validation_in_model_default.questionBookEightGramReuseRate)}，模型外 ${percent(report.metrics.validation_out_model.questionBookEightGramReuseRate)}。

## Persona设计

- 直答型：${report.personaCohort.strategies.literal}。
- 谨慎型：${report.personaCohort.strategies.cautious}。
- 冲突型：${report.personaCohort.strategies.conflicted}。

这些 Persona 是确定性的程序模拟，具有不同理解、回忆、未明、误答、敏感问题回避及领域稳定偏差；没有调用外部LLM，不能把结果称为真人理解率。

## 未通过门槛

${failedGates.length ? failedGates.map((item) => `- ${item.group}.${item.metric}：实际 ${item.actual.toFixed(6)}，要求${item.direction === "maximum" ? "不高于" : "不低于"} ${item.threshold}。`).join("\n") : "- 无。"}

## 证据边界

模型内组验证的是“真画像确在120候选中”时的找回能力。模型外组由同一潜在出生分钟条件下的独立概率过程生成，并以10%事实扰动保证不等于任何候选；它比直接抽中候选更严格，但仍是工程合成分布。极端组使用30%画像扰动和冲突型回答策略。候选码采用人工设计的冗余编码，结果说明该工程架构的识别与纠错性质，不代表真实出生分钟能够因果决定人生，也不验证现实命理或未来预言准确性。

核心结果SHA-256：\`${report.reproducibility.resultSha256}\`

源码集合SHA-256：\`${report.reproducibility.sourceFilesSha256}\`
`;

const reportDirectory = resolve(root, "reports");
const artifactDirectory = resolve(root, "artifacts");
const personaDirectory = resolve(root, "personas", "generated");
mkdirSync(reportDirectory, { recursive: true });
mkdirSync(artifactDirectory, { recursive: true });
mkdirSync(personaDirectory, { recursive: true });
writeFileSync(resolve(reportDirectory, "canonical-result.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(resolve(reportDirectory, "experiment-summary.md"), summary, "utf8");
writeFileSync(resolve(personaDirectory, "persona-configs.json"), `${JSON.stringify(buildPersonaConfigs(), null, 2)}\n`, "utf8");
writeFileSync(resolve(artifactDirectory, "clause-codebook.json"), `${JSON.stringify(CLAUSE_CODEBOOK, null, 2)}\n`, "utf8");
writeFileSync(resolve(artifactDirectory, "candidate-design.json"), `${JSON.stringify({
  candidateCount: V4_CONFIG.candidateCount,
  factCount: V4_CONFIG.factCount,
  questionOrder: QUESTION_ORDER,
  diagnostics: createBirthCandidatePool(0).diagnostics,
  gates: V4_CONFIG.gates
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  executedSessions: report.executedSessions,
  personaCount: report.personaCohort.count,
  extremeConflictSamples: report.samples.extreme_conflict,
  passedGates: report.gateSummary.passed,
  failedGates: report.gateSummary.failed,
  resultSha256: report.reproducibility.resultSha256,
  reportDirectory
}, null, 2));
