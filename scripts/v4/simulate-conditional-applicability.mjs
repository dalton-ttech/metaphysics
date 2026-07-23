import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_JSON = resolve(PROJECT_ROOT, "evaluation/conditional-applicability-v1.json");
const DEFAULT_MD = resolve(PROJECT_ROOT, "evaluation/conditional-applicability-v1.md");
const SEED = "condition-v1";

const COHORTS = [
  ["no_sibling", 2000],
  ["co_resident", 2000],
  ["half_sibling_separate", 1500],
  ["substitute_parent", 1500],
  ["early_loss", 1000],
  ["estranged_or_lost_contact", 1000],
  ["mixed_with_noise", 1000]
];

const COUNT_OPTIONS = ["0", "1", "2", "3p"];
const CONTEXT_OPTIONS = ["co_resident", "separate_contact", "estranged", "unavailable"];
const BIRTH_ORDER_OPTIONS = ["eldest", "middle", "youngest"];
const RESPONSIBILITY_GROUPS = ["care", "financialSupport", "guardianship"];

function sha(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(items, key) {
  return items[hash32(`${SEED}|${key}`) % items.length];
}

function rotate(items, key) {
  const offset = hash32(`${SEED}|order|${key}`) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function birthOrderFor(count, key) {
  return count === "1"
    ? pick(["eldest", "youngest"], `${key}|birthOrder`)
    : pick(BIRTH_ORDER_OPTIONS, `${key}|birthOrder`);
}

function binary(key, probabilityPercent) {
  return hash32(`${SEED}|${key}`) % 100 < probabilityPercent ? "yes" : "no";
}

function completeSiblingTruth(truth, key) {
  return { ...truth, birthOrder: birthOrderFor(truth.count, key) };
}

function buildTruth(cohort, index) {
  const key = `${cohort}|${index}`;
  if (cohort === "no_sibling") return {
    count: "0", birthOrder: null, context: null, care: null, financialSupport: null, guardianship: null, noisy: false
  };
  if (cohort === "co_resident") return completeSiblingTruth({
    count: pick(["1", "2", "3p"], `${key}|count`),
    birthOrder: null,
    context: "co_resident",
    care: binary(`${key}|care`, 45),
    financialSupport: binary(`${key}|financial`, 35),
    guardianship: binary(`${key}|guardian`, 12),
    noisy: false
  }, key);
  if (cohort === "half_sibling_separate") return completeSiblingTruth({
    count: pick(["1", "2"], `${key}|count`),
    birthOrder: null,
    context: pick(["separate_contact", "estranged"], `${key}|context`),
    care: binary(`${key}|care`, 12),
    financialSupport: binary(`${key}|financial`, 14),
    guardianship: binary(`${key}|guardian`, 3),
    noisy: false
  }, key);
  if (cohort === "substitute_parent") return completeSiblingTruth({
    count: pick(["1", "2", "3p"], `${key}|count`),
    birthOrder: null,
    context: "co_resident",
    care: binary(`${key}|care`, 85),
    financialSupport: binary(`${key}|financial`, 65),
    guardianship: "yes",
    noisy: false
  }, key);
  if (cohort === "early_loss") return completeSiblingTruth({
    count: pick(["1", "2"], `${key}|count`),
    birthOrder: null,
    context: "unavailable",
    care: binary(`${key}|care-before-loss`, 20),
    financialSupport: binary(`${key}|financial-before-loss`, 10),
    guardianship: binary(`${key}|guardian-before-loss`, 5),
    noisy: false
  }, key);
  if (cohort === "estranged_or_lost_contact") return completeSiblingTruth({
    count: pick(["1", "2", "3p"], `${key}|count`),
    birthOrder: null,
    context: "estranged",
    care: binary(`${key}|care`, 8),
    financialSupport: binary(`${key}|financial`, 10),
    guardianship: binary(`${key}|guardian`, 2),
    noisy: false
  }, key);
  const hasSibling = hash32(`${key}|has`) % 5 !== 0;
  const truth = {
    count: hasSibling ? pick(["1", "2", "3p"], `${key}|count`) : "0",
    birthOrder: null,
    context: hasSibling ? pick(CONTEXT_OPTIONS, `${key}|context`) : null,
    care: hasSibling ? binary(`${key}|care`, 35) : null,
    financialSupport: hasSibling ? binary(`${key}|financial`, 30) : null,
    guardianship: hasSibling ? binary(`${key}|guardian`, 20) : null,
    noisy: index % 2 === 0
  };
  truth.birthOrder = hasSibling ? birthOrderFor(truth.count, key) : null;
  return truth;
}

class SealedRespondent {
  constructor(truth, personaKey) {
    this.truth = truth;
    this.personaKey = personaKey;
    this.noiseUsed = false;
  }

  answer(group, option, turn) {
    const trueOption = this.truth[group];
    let answer = option === trueOption ? "yes" : "no";
    if (this.truth.noisy && !this.noiseUsed && hash32(`${SEED}|noise-turn|${this.personaKey}`) % 7 === turn % 7) {
      this.noiseUsed = true;
      answer = hash32(`${SEED}|noise-kind|${this.personaKey}`) % 2 === 0
        ? "unclear"
        : answer === "yes" ? "no" : "yes";
    }
    return answer;
  }
}

function resolveGroup(options, respondent, group, personaKey, trace) {
  const ordered = rotate(options, `${personaKey}|${group}`);
  for (let pass = 0; pass < 2; pass += 1) {
    for (const option of ordered) {
      const answer = respondent.answer(group, option, trace.length);
      trace.push({ group, option, answer, crossCheck: pass > 0 });
      if (answer !== "yes") continue;
      const confirmation = respondent.answer(group, option, trace.length);
      trace.push({ group, option, answer: confirmation, crossCheck: true });
      if (confirmation === "yes") return option;
    }
  }
  return null;
}

function inferPersona(truth, personaKey) {
  const respondent = new SealedRespondent(truth, personaKey);
  const trace = [];
  const count = resolveGroup(COUNT_OPTIONS, respondent, "count", personaKey, trace);
  if (count === "0") return {
    count, birthOrder: null, context: null, care: null, financialSupport: null, guardianship: null, trace
  };
  if (!count) return {
    count: null, birthOrder: null, context: null, care: null, financialSupport: null, guardianship: null, trace
  };
  const birthOrderOptions = count === "1" ? ["eldest", "youngest"] : BIRTH_ORDER_OPTIONS;
  const birthOrder = resolveGroup(birthOrderOptions, respondent, "birthOrder", personaKey, trace);
  if (!birthOrder) return {
    count, birthOrder: null, context: null, care: null, financialSupport: null, guardianship: null, trace
  };
  const context = resolveGroup(CONTEXT_OPTIONS, respondent, "context", personaKey, trace);
  if (!context) return {
    count, birthOrder, context: null, care: null, financialSupport: null, guardianship: null, trace
  };
  const responsibilities = Object.fromEntries(RESPONSIBILITY_GROUPS.map((group) => [
    group,
    resolveGroup(["no", "yes"], respondent, group, personaKey, trace)
  ]));
  return { count, birthOrder, context, ...responsibilities, trace };
}

function runSimulation() {
  const rows = [];
  for (const [cohort, size] of COHORTS) {
    for (let index = 0; index < size; index += 1) {
      const personaKey = `${cohort}:${String(index).padStart(5, "0")}`;
      const truth = buildTruth(cohort, index);
      const inferred = inferPersona(truth, personaKey);
      rows.push({ cohort, personaKey, truth, inferred });
    }
  }

  const clear = rows.filter((row) => !row.truth.noisy);
  const noisy = rows.filter((row) => row.truth.noisy);
  const exact = (row) => row.truth.count === row.inferred.count
    && row.truth.birthOrder === row.inferred.birthOrder
    && row.truth.context === row.inferred.context
    && row.truth.care === row.inferred.care
    && row.truth.financialSupport === row.inferred.financialSupport
    && row.truth.guardianship === row.inferred.guardianship;
  const dependentQuestionsForNoSibling = (row) => row.inferred.trace.filter((item) => item.group !== "count").length;
  const cohortMetrics = Object.fromEntries(COHORTS.map(([cohort]) => {
    const group = rows.filter((row) => row.cohort === cohort);
    return [cohort, {
      samples: group.length,
      exactAccuracy: group.filter(exact).length / group.length,
      averageEvidenceChecks: group.reduce((sum, row) => sum + row.inferred.trace.length, 0) / group.length
    }];
  }));
  const compactRows = rows.map((row) => ({
    cohort: row.cohort,
    key: row.personaKey,
    truth: [row.truth.count, row.truth.birthOrder, row.truth.context, row.truth.care, row.truth.financialSupport, row.truth.guardianship],
    inferred: [row.inferred.count, row.inferred.birthOrder, row.inferred.context, row.inferred.care, row.inferred.financialSupport, row.inferred.guardianship],
    evidenceChecks: row.inferred.trace.length
  }));
  const inapplicableQuestionCount = clear
    .filter((row) => row.truth.count === "0")
    .reduce((sum, row) => sum + dependentQuestionsForNoSibling(row), 0);
  const clearQuestionCount = clear.reduce((sum, row) => sum + row.inferred.trace.length, 0);
  const noisyNoSiblingDependentQuestionCount = noisy
    .filter((row) => row.truth.count === "0")
    .reduce((sum, row) => sum + dependentQuestionsForNoSibling(row), 0);
  const metrics = {
    totalSamples: rows.length,
    clearSamples: clear.length,
    noisySamples: noisy.length,
    clearExactAccuracy: clear.filter(exact).length / clear.length,
    noisyExactAccuracy: noisy.filter(exact).length / noisy.length,
    noSiblingDependentQuestionCount: inapplicableQuestionCount,
    noisyNoSiblingDependentQuestionCount,
    inapplicableQuestionRate: clearQuestionCount ? inapplicableQuestionCount / clearQuestionCount : 0,
    replayRate: 1
  };
  return { metrics, cohortMetrics, resultHash: sha(compactRows) };
}

async function sourceHash() {
  const paths = [
    resolve(PROJECT_ROOT, "src/lib/tieban-v4-engine.ts"),
    resolve(PROJECT_ROOT, "scripts/v4/generate-content-v4.mjs"),
    resolve(PROJECT_ROOT, "scripts/v4/simulate-conditional-applicability.mjs")
  ];
  return sha((await Promise.all(paths.map((path) => readFile(path, "utf8")))).join("\n---\n"));
}

async function buildReport() {
  const [codebookText, firstSourceHash] = await Promise.all([
    readFile(resolve(PROJECT_ROOT, "data/v4/reference-codebook.json"), "utf8"),
    sourceHash()
  ]);
  const first = runSimulation();
  const second = runSimulation();
  if (first.resultHash !== second.resultHash) throw new Error("条件模拟不能由同一种子完全重放");
  const report = {
    schemaVersion: "1.0.0",
    generatedAt: "2026-07-22T00:00:00+08:00",
    seed: SEED,
    configHash: sha(COHORTS),
    codebookHash: sha(codebookText),
    sourceHash: firstSourceHash,
    cohorts: Object.fromEntries(COHORTS),
    metrics: first.metrics,
    cohortMetrics: first.cohortMetrics,
    resultHash: first.resultHash,
    acceptance: {
      noInapplicableQuestions: first.metrics.inapplicableQuestionRate === 0,
      noSiblingCascade: first.metrics.noSiblingDependentQuestionCount === 0,
      clearAccuracyAtLeast90: first.metrics.clearExactAccuracy >= 0.9,
      noisyAccuracyAtLeast85: first.metrics.noisyExactAccuracy >= 0.85,
      deterministicReplay: first.resultHash === second.resultHash
    }
  };
  return report;
}

function markdown(report) {
  const percent = (value) => `${(value * 100).toFixed(2)}%`;
  return [
    "# 条件考刻模拟报告 V1",
    "",
    `- 固定种子：\`${report.seed}\``,
    `- 样本数：${report.metrics.totalSamples}`,
    `- 清晰回答准确率：${percent(report.metrics.clearExactAccuracy)}`,
    `- 含噪样本准确率：${percent(report.metrics.noisyExactAccuracy)}`,
    `- 无手足样本误问下游条文：${report.metrics.noSiblingDependentQuestionCount}`,
    `- 不适用条文展示率：${percent(report.metrics.inapplicableQuestionRate)}`,
    `- 重放一致：${report.acceptance.deterministicReplay ? "是" : "否"}`,
    "",
    "## 分层结果",
    "",
    "| 分层 | 样本 | 精确识别 | 平均证据检查数 |",
    "|---|---:|---:|---:|",
    ...Object.entries(report.cohortMetrics).map(([cohort, value]) => `| ${cohort} | ${value.samples} | ${percent(value.exactAccuracy)} | ${value.averageEvidenceChecks.toFixed(2)} |`),
    "",
    "## 验收",
    "",
    ...Object.entries(report.acceptance).map(([key, passed]) => `- ${passed ? "通过" : "失败"}：${key}`),
    "",
    "该实验以密封结构化真值验证条件筛题、无手足级联跳过、排行与三项可并存责任的推断，以及固定种子重放。表中的证据检查数不是产品问答轮数，准确率也不代表真人理解率；中文理解另由独立模拟真人 Agent 审核。",
    ""
  ].join("\n");
}

const report = await buildReport();
const verifyOnly = process.argv.includes("--verify");
if (!verifyOnly) {
  await mkdir(dirname(DEFAULT_JSON), { recursive: true });
  await writeFile(DEFAULT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(DEFAULT_MD, markdown(report), "utf8");
} else {
  const saved = JSON.parse(await readFile(DEFAULT_JSON, "utf8"));
  for (const field of ["configHash", "codebookHash", "sourceHash", "resultHash"]) {
    if (saved[field] !== report[field]) throw new Error(`条件模拟报告已经过期：${field} 与当前工程不一致`);
  }
}
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.acceptance).some((passed) => !passed)) process.exitCode = 1;
