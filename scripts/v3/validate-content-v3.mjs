import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const DATA_DIR = resolve(PROJECT_ROOT, "data/v3");
const DEFAULT_REPORT = resolve(PROJECT_ROOT, "docs/v3-content-validation-report.md");

function normalizedText(text) {
  return String(text).replace(/[\s，。；：、！？“”‘’《》]/g, "").toLowerCase();
}

function bigrams(text) {
  const normalized = normalizedText(text);
  const result = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) result.add(normalized.slice(index, index + 2));
  return result;
}

function jaccard(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function duplicateValues(items, selector) {
  const seen = new Map();
  const duplicates = [];
  for (const item of items) {
    const value = selector(item);
    if (seen.has(value)) duplicates.push({ value, first: seen.get(value), second: item.id });
    else seen.set(value, item.id);
  }
  return duplicates;
}

function missingFields(items, fields) {
  const missing = [];
  for (const item of items) {
    for (const field of fields) {
      if (!(field in item) || item[field] === null || item[field] === "" || (Array.isArray(item[field]) && item[field].length === 0)) {
        missing.push(`${item.id ?? "<no-id>"}.${field}`);
      }
    }
  }
  return missing;
}

function nearDuplicates(items, threshold = 0.86) {
  const pairs = [];
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const a = items[left];
      const b = items[right];
      if (Math.abs(a.clauseText.length - b.clauseText.length) > 6) continue;
      const score = jaccard(a.clauseText, b.clauseText);
      if (score >= threshold) pairs.push({ first: a.id, second: b.id, score: Number(score.toFixed(3)) });
    }
  }
  return pairs;
}

function getNested(item, path) {
  return path.split(".").reduce((value, key) => value?.[key], item);
}

function hasNonEmptyNested(items, paths) {
  const missing = [];
  for (const item of items) {
    for (const path of paths) {
      const value = getNested(item, path);
      if (value === undefined || value === null || value === "") missing.push(`${item.id}.${path}`);
    }
  }
  return missing;
}

async function readJson(name) {
  return JSON.parse(await readFile(resolve(DATA_DIR, name), "utf8"));
}

export async function validateContentV3({ writeReport = true, reportPath = DEFAULT_REPORT } = {}) {
  const [schemaFile, factsFile, calibrationFile, fateFile] = await Promise.all([
    readJson("content-schema.json"),
    readJson("facts.json"),
    readJson("calibration-clauses.json"),
    readJson("fate-clauses.json")
  ]);
  const facts = factsFile.facts;
  const calibration = calibrationFile.clauses;
  const fate = fateFile.clauses;
  const allClauses = [...calibration, ...fate];
  const factIds = new Set(facts.map((item) => item.id));
  const errors = [];
  const warnings = [];

  if (facts.length < 200) errors.push(`原子事实少于200：${facts.length}`);
  if (calibration.length < 200) errors.push(`考刻条少于200：${calibration.length}`);
  if (fate.length < 400) errors.push(`命书条少于400：${fate.length}`);

  const required = schemaFile.definitions;
  for (const item of missingFields(facts, required.factRequired)) errors.push(`事实字段缺失：${item}`);
  for (const item of missingFields(calibration, required.calibrationRequired)) errors.push(`考刻字段缺失：${item}`);
  for (const item of missingFields(fate, required.fateRequired)) errors.push(`命书字段缺失：${item}`);

  for (const item of hasNonEmptyNested(facts, ["timeWindow.kind", "timeWindow.label", "applicability.minCurrentAge", "source.kind", "source.provenance"])) errors.push(`事实嵌套字段缺失：${item}`);
  for (const item of hasNonEmptyNested(allClauses, ["ambiguity.score", "ambiguity.level", "applicability.minCurrentAge", "source.kind", "source.provenance"])) errors.push(`条文嵌套字段缺失：${item}`);

  for (const duplicate of duplicateValues(facts, (item) => item.id)) errors.push(`事实ID重复：${duplicate.value}`);
  for (const duplicate of duplicateValues(allClauses, (item) => item.id)) errors.push(`条文ID重复：${duplicate.value}`);
  for (const duplicate of duplicateValues(allClauses, (item) => item.displayNumber)) errors.push(`显示编号重复：${duplicate.value}`);
  for (const duplicate of duplicateValues(allClauses, (item) => `${item.volumeId}:${item.clauseNumber}`)) errors.push(`卷内编号重复：${duplicate.value}`);
  for (const duplicate of duplicateValues(allClauses, (item) => normalizedText(item.clauseText))) errors.push(`条文文本重复：${duplicate.first}/${duplicate.second}`);

  for (const item of calibration) {
    if (typeof item.primaryFactId !== "string" || !item.primaryFactId) errors.push(`${item.id} 未唯一绑定 primaryFactId`);
    if (!factIds.has(item.primaryFactId)) errors.push(`${item.id} 引用不存在事实 ${item.primaryFactId}`);
    const fact = facts.find((candidate) => candidate.id === item.primaryFactId);
    if (fact && fact.domain !== item.domain) errors.push(`${item.id} 领域与事实不一致`);
    if (fact && fact.legacyEventId !== item.legacyEventId) errors.push(`${item.id} 兼容事件ID与事实不一致`);
    if (/[；;]|任中其一|所列之事|至少一件|一象/.test(item.clauseText)) errors.push(`${item.id} 疑似多命题或旧式OR规则：${item.clauseText}`);
    if (/[？?]|是否|有没有|可曾|曾否|何曾/.test(item.interpretation)) errors.push(`${item.id} 司刻解必须为陈述句：${item.interpretation}`);
    if (!/^所断为：/.test(item.interpretation)) errors.push(`${item.id} 司刻解缺少统一陈述式引导`);
    if ((item.clauseText.match(/[。！？]/g) ?? []).length > 1) errors.push(`${item.id} 包含多个句末，疑似多命题`);
    if (normalizedText(item.clauseText).length > 34) warnings.push(`${item.id} 条文偏长（${normalizedText(item.clauseText).length}字）`);
    if (item.answerMode?.type !== "ternary" || item.answerMode?.options?.join("|") !== "应|不应|未明") errors.push(`${item.id} 回答模式不合规`);
  }

  const temporalFloors = { rel_long_single: 18, rel_marriage: 16, rel_divorce: 18, health_reproductive: 16, turn_child_arrival: 16 };
  for (const fact of facts) {
    const floor = temporalFloors[fact.legacyEventId];
    if (floor !== undefined && fact.timeWindow.minAge < floor) errors.push(`${fact.id} 的年龄窗口早于语义下限 ${floor}`);
  }

  for (const item of fate) {
    if (!factIds.has(item.primaryFactId)) errors.push(`${item.id} 引用不存在事实 ${item.primaryFactId}`);
    if (!item.conditionFactIds.every((id) => factIds.has(id))) errors.push(`${item.id} conditionFactIds 含不存在事实`);
    if (/[；;]/.test(item.clauseText)) errors.push(`${item.id} 命书条含分号，疑似混合多个判断`);
    if ((item.clauseText.match(/[。！？]/g) ?? []).length !== 1) errors.push(`${item.id} 命书条应恰有一个句末`);
  }

  for (const item of allClauses) {
    if (!/^\d{5}$/.test(item.displayNumber)) errors.push(`${item.id} 显示编号不是稳定五位数字`);
    if (item.source?.kind !== "modern_fabricated") errors.push(`${item.id} 未标注 modern_fabricated`);
    if (item.source?.provenance?.includes("古籍原文" ) && !item.source.provenance.includes("非古籍原文")) errors.push(`${item.id} 来源声明可能冒称古籍原文`);
  }

  const calibrationNearDuplicates = nearDuplicates(calibration);
  const fateNearDuplicates = nearDuplicates(fate);
  if (calibrationNearDuplicates.length) errors.push(`考刻条存在${calibrationNearDuplicates.length}组高相似文本（阈值0.86）`);
  if (fateNearDuplicates.length) errors.push(`命书条存在${fateNearDuplicates.length}组高相似文本（阈值0.86）`);

  const factUsage = new Map(facts.map((item) => [item.id, 0]));
  for (const clause of calibration) factUsage.set(clause.primaryFactId, (factUsage.get(clause.primaryFactId) ?? 0) + 1);
  const unusedFacts = [...factUsage.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  const multiplyBoundFacts = [...factUsage.entries()].filter(([, count]) => count !== 1).map(([id, count]) => ({ id, count }));
  if (unusedFacts.length) errors.push(`${unusedFacts.length}个事实没有考刻条`);
  if (multiplyBoundFacts.length) errors.push(`${multiplyBoundFacts.length}个事实没有保持一事实一主考刻条`);

  const categoryCounts = Object.fromEntries(["命局", "前运", "后运"].map((category) => [category, fate.filter((item) => item.category === category).length]));
  const domainCounts = Object.fromEntries(schemaFile.enums.domains.map((domain) => [domain, calibration.filter((item) => item.domain === domain).length]));
  const semanticFamilies = new Set(facts.map((fact) => fact.legacyEventId)).size;
  if (semanticFamilies < 48) errors.push(`独立事件族不足48：${semanticFamilies}`);
  const result = {
    ok: errors.length === 0,
    schemaVersion: schemaFile.schemaVersion,
    counts: { facts: facts.length, semanticFamilies, calibration: calibration.length, fate: fate.length, allClauses: allClauses.length },
    categoryCounts,
    domainCounts,
    checks: {
      requiredFields: errors.every((item) => !item.includes("字段缺失")),
      uniqueIdsAndNumbers: errors.every((item) => !item.includes("重复")),
      primaryFactIntegrity: errors.every((item) => !item.includes("primaryFactId") && !item.includes("引用不存在") && !item.includes("一事实一主考刻条")),
      singlePropositionHeuristics: errors.every((item) => !item.includes("多命题") && !item.includes("旧式OR") && !item.includes("多个判断")),
      provenance: errors.every((item) => !item.includes("modern_fabricated") && !item.includes("冒称")),
      nearDuplicateThreshold: { threshold: 0.86, calibrationPairs: calibrationNearDuplicates.length, fatePairs: fateNearDuplicates.length }
    },
    errors,
    warnings,
    samples: {
      calibration: calibration.slice(0, 3).map(({ displayNumber, clauseText, primaryFactId }) => ({ displayNumber, clauseText, primaryFactId })),
      fate: fate.slice(0, 3).map(({ displayNumber, clauseText, category }) => ({ displayNumber, clauseText, category }))
    }
  };

  if (writeReport) {
    const status = result.ok ? "通过" : "未通过";
    const lines = [
      "# V3 内容层自动校验报告",
      "",
      `- 结果：**${status}**`,
      `- Schema：${result.schemaVersion}`,
      `- 原子事实：${facts.length}`,
      `- 考刻条：${calibration.length}`,
      `- 命书条：${fate.length}（命局 ${categoryCounts.命局}／前运 ${categoryCounts.前运}／后运 ${categoryCounts.后运}）`,
      `- 全部条文：${allClauses.length}`,
      "- 来源策略：全部为现代拟制，不冒称古籍原文",
      "",
      "## 硬校验",
      "",
      `- 字段完整：${result.checks.requiredFields ? "通过" : "失败"}`,
      `- ID、显示编号、卷内编号唯一：${result.checks.uniqueIdsAndNumbers ? "通过" : "失败"}`,
      `- 考刻条唯一 primaryFactId：${result.checks.primaryFactIntegrity ? "通过" : "失败"}`,
      `- 单命题启发式：${result.checks.singlePropositionHeuristics ? "通过" : "失败"}`,
      `- 高相似去重（Jaccard ≥ 0.86）：考刻 ${calibrationNearDuplicates.length} 组，命书 ${fateNearDuplicates.length} 组`,
      `- 现代拟制来源标注：${result.checks.provenance ? "通过" : "失败"}`,
      "",
      "## 领域分布",
      "",
      "| 领域 | 考刻条数 |",
      "|---|---:|",
      ...Object.entries(domainCounts).map(([domain, count]) => `| ${domain} | ${count} |`),
      "",
      "## 错误",
      "",
      ...(errors.length ? errors.map((item) => `- ${item}`) : ["- 无"]),
      "",
      "## 警告",
      "",
      ...(warnings.length ? warnings.map((item) => `- ${item}`) : ["- 无"]),
      "",
      "## 说明",
      "",
      "自动校验可以证明结构、编号、来源标注与文本表面单命题约束；它不能代替真实用户对古意文案的理解测试，也不能证明任何命理结论真实。",
      ""
    ];
    await writeFile(reportPath, lines.join("\n"), "utf8");
  }

  return result;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const result = await validateContentV3();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
