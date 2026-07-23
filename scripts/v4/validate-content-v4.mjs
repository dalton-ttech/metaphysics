import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildCandidateCodebook } from "./codebook-core-v4.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const DATA_DIR = resolve(PROJECT_ROOT, "data/v4");
const REPORT_PATH = resolve(PROJECT_ROOT, "docs/v4-content-validation-report.md");
const DOMAINS = ["family", "education_mobility", "career", "wealth", "relationship", "health", "law_social", "turning_point"];

async function readJson(name) {
  return JSON.parse(await readFile(resolve(DATA_DIR, name), "utf8"));
}

function duplicateValues(items, selector) {
  const seen = new Map();
  const duplicates = [];
  for (const item of items) {
    const value = selector(item);
    if (seen.has(value)) duplicates.push([seen.get(value), item.id, value]);
    else seen.set(value, item.id);
  }
  return duplicates;
}

function digest(values) {
  let hash = 2166136261;
  for (const character of values.join("|").split("")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildInputs(manifest, factsFile, calibrationFile, fateFile, constraintsFile, birthSeed) {
  return {
    birthSeed,
    corpusVersion: manifest.corpusVersion,
    facts: factsFile.facts,
    calibrationClauses: calibrationFile.clauses,
    fateClauses: fateFile.clauses,
    constraints: constraintsFile.constraints
  };
}

export async function validateContentV4({ writeReport = true } = {}) {
  const [manifest, factsFile, calibrationFile, fateFile, constraintsFile, reference] = await Promise.all([
    readJson("manifest.json"),
    readJson("facts.json"),
    readJson("calibration-clauses.json"),
    readJson("fate-clauses.json"),
    readJson("constraints.json"),
    readJson("reference-codebook.json")
  ]);
  const facts = factsFile.facts;
  const calibration = calibrationFile.clauses;
  const fate = fateFile.clauses;
  const constraints = constraintsFile.constraints;
  const factIds = new Set(facts.map((item) => item.id));
  const clauseIds = new Set(calibration.map((item) => item.id));
  const fateIds = new Set(fate.map((item) => item.id));
  const errors = [];
  const warnings = [];

  if (calibration.length < 300) errors.push(`考刻条不足300：${calibration.length}`);
  if (fate.length < 600) errors.push(`命局/运限条不足600：${fate.length}`);
  if (constraints.length < 1) errors.push("缺少互斥约束");
  if (!calibration.some((item) => item.category === "六亲考刻")) errors.push("缺少六亲考刻条");
  if (!calibration.some((item) => item.category === "定分")) errors.push("缺少定分条");
  if (!fate.some((item) => item.category === "命局")) errors.push("缺少命局条");
  if (!fate.some((item) => item.category === "运限")) errors.push("缺少运限条");

  for (const [label, items] of [["事实", facts], ["考刻条", calibration], ["命书条", fate]]) {
    for (const [, second, value] of duplicateValues(items, (item) => item.id)) errors.push(`${label}ID重复：${second}/${value}`);
  }
  for (const [, second, value] of duplicateValues([...calibration, ...fate], (item) => item.displayNumber)) errors.push(`显示编号重复：${second}/${value}`);
  for (const [, second, value] of duplicateValues(calibration, (item) => `${item.volumeId}:${item.clauseNumber}`)) errors.push(`考刻卷内编号重复：${second}/${value}`);
  for (const [, second, value] of duplicateValues(fate, (item) => `${item.volumeId}:${item.clauseNumber}`)) errors.push(`命书卷内编号重复：${second}/${value}`);

  for (const item of calibration) {
    if (!factIds.has(item.primaryFactId)) errors.push(`${item.id}引用不存在事实${item.primaryFactId}`);
    if (!/^(六亲考刻|定分)$/.test(item.category)) errors.push(`${item.id}考刻分类不合法`);
    if (item.source?.kind !== "modern_fabricated") errors.push(`${item.id}缺少现代拟制来源标记`);
  }
  for (const item of fate) {
    if (!factIds.has(item.primaryFactId)) errors.push(`${item.id}引用不存在事实${item.primaryFactId}`);
    if (!/^(命局|运限)$/.test(item.category)) errors.push(`${item.id}命书分类不合法`);
    if (item.source?.kind !== "modern_fabricated") errors.push(`${item.id}缺少现代拟制来源标记`);
  }

  const constrainedFactIds = new Set();
  const optionCountByFactId = new Map();
  for (const constraint of constraints) {
    if (constraint.type !== "exactly_one") errors.push(`${constraint.id}不是exactly_one`);
    if (constraint.factIds.length < 2) errors.push(`${constraint.id}少于两个互斥选项`);
    for (const factId of constraint.factIds) {
      optionCountByFactId.set(factId, constraint.factIds.length);
      if (!factIds.has(factId)) errors.push(`${constraint.id}引用不存在事实${factId}`);
      if (constrainedFactIds.has(factId)) errors.push(`${factId}被多个互斥组重复占用`);
      constrainedFactIds.add(factId);
    }
  }

  const regenerated = buildCandidateCodebook(buildInputs(manifest, factsFile, calibrationFile, fateFile, constraintsFile, reference.birthSeed));
  if (JSON.stringify(regenerated) !== JSON.stringify(reference)) errors.push("参考码本不能由同一BirthSeed逐字节重放");
  if (!reference.generatedBeforeAnswers || reference.answerHistoryUsed) errors.push("候选命籍不是在回答前独立生成");
  if (reference.candidateCount !== 120 || reference.candidates.length !== 120) errors.push("候选刻分不是120个");
  if (reference.clauseMappings.length !== calibration.length) errors.push("条文映射未覆盖全部考刻条");
  if (reference.birthSeedFieldsUsed.join("|") !== "birthDate|shichen|gender|birthplace") errors.push("BirthSeed字段没有完整声明");

  const priorSum = reference.candidates.reduce((sum, candidate) => sum + candidate.prior, 0);
  if (Math.abs(priorSum - 1) > 1e-9) errors.push(`候选先验和不为1：${priorSum}`);
  if (new Set(reference.candidates.map((item) => item.signature)).size !== 120) errors.push("候选命籍签名不唯一");

  for (const candidate of reference.candidates) {
    if (Object.keys(candidate.factProbabilities).length !== facts.length) errors.push(`${candidate.id}事实概率未覆盖全部事实`);
    if (!candidate.coreFactIds.length) errors.push(`${candidate.id}核心事实为空`);
    for (const domain of DOMAINS) {
      if (!candidate.coreFactsByDomain[domain]?.length) errors.push(`${candidate.id}核心事实缺少领域${domain}`);
    }
    if (candidate.fateClauseIds.length < 40) errors.push(`${candidate.id}预生成命书条不足40`);
    if (!candidate.fateClauseIds.every((id) => fateIds.has(id))) errors.push(`${candidate.id}预生成命书引用不存在条文`);
    if (!candidate.fateClauseCountByCategory.命局 || !candidate.fateClauseCountByCategory.运限) errors.push(`${candidate.id}命籍未覆盖命局与运限`);
    for (const constraint of constraints) {
      const probabilities = constraint.factIds.map((factId) => candidate.factProbabilities[factId]);
      const sum = probabilities.reduce((total, value) => total + value, 0);
      if (Math.abs(sum - 1) > 1e-8) errors.push(`${candidate.id}/${constraint.id}互斥概率和不为1`);
      const selected = candidate.exclusiveSelections[constraint.id];
      if (!constraint.factIds.includes(selected)) errors.push(`${candidate.id}/${constraint.id}缺少主选项`);
      if (candidate.factProbabilities[selected] !== Math.max(...probabilities)) errors.push(`${candidate.id}/${constraint.id}主选项不是最高概率`);
    }
  }

  for (const mapping of reference.clauseMappings) {
    if (!clauseIds.has(mapping.clauseId)) errors.push(`映射引用不存在考刻条${mapping.clauseId}`);
    if (Object.keys(mapping.candidatePYes).length !== 120) errors.push(`${mapping.clauseId}映射未覆盖120候选`);
    if (mapping.yesCandidateCount + mapping.noCandidateCount !== 120) errors.push(`${mapping.clauseId}分割计数错误`);
    const optionCount = optionCountByFactId.get(mapping.primaryFactId) ?? 2;
    const minimumSplit = optionCount > 4 ? Math.max(0.08, 0.75 / optionCount) : 0.075;
    const minimumEntropy = optionCount > 4 ? 0.55 : 0.35;
    if (mapping.splitRatio < minimumSplit || mapping.splitRatio > 0.8) errors.push(`${mapping.clauseId}分割失衡：${mapping.splitRatio}`);
    if (mapping.binaryEntropy < minimumEntropy) errors.push(`${mapping.clauseId}分割熵过低：${mapping.binaryEntropy}`);
  }

  const seedVariants = [
    { ...reference.birthSeed, birthDate: "1990-01-02" },
    { ...reference.birthSeed, shichen: "丑" },
    { ...reference.birthSeed, gender: "女" },
    { ...reference.birthSeed, birthplace: "上海" }
  ];
  const referencePriorDigest = digest(reference.candidates.map((item) => `${item.id}:${item.prior}`));
  const referenceMappingDigest = digest(reference.clauseMappings.map((item) => item.mappingDigest));
  const seedVariantResults = [];
  for (const birthSeed of seedVariants) {
    const codebook = buildCandidateCodebook(buildInputs(manifest, factsFile, calibrationFile, fateFile, constraintsFile, birthSeed));
    const priorDigest = digest(codebook.candidates.map((item) => `${item.id}:${item.prior}`));
    const mappingDigest = digest(codebook.clauseMappings.map((item) => item.mappingDigest));
    const changed = codebook.seedFingerprint !== reference.seedFingerprint && priorDigest !== referencePriorDigest && mappingDigest !== referenceMappingDigest;
    if (!changed) errors.push(`改变BirthSeed字段未同时改变指纹、先验和映射：${JSON.stringify(birthSeed)}`);
    seedVariantResults.push({ birthSeed, seedFingerprint: codebook.seedFingerprint, priorDigest, mappingDigest, changed });
  }

  const result = {
    ok: errors.length === 0,
    schemaVersion: manifest.schemaVersion,
    corpusVersion: manifest.corpusVersion,
    counts: {
      facts: facts.length,
      calibration: calibration.length,
      fate: fate.length,
      constraints: constraints.length,
      candidates: reference.candidates.length,
      mappings: reference.clauseMappings.length
    },
    categoryCounts: {
      六亲考刻: calibration.filter((item) => item.category === "六亲考刻").length,
      定分: calibration.filter((item) => item.category === "定分").length,
      命局: fate.filter((item) => item.category === "命局").length,
      运限: fate.filter((item) => item.category === "运限").length
    },
    replayKey: reference.replayKey,
    splitBalance: {
      minimum: Math.min(...reference.clauseMappings.map((item) => item.splitRatio)),
      maximum: Math.max(...reference.clauseMappings.map((item) => item.splitRatio)),
      averageEntropy: Number((reference.clauseMappings.reduce((sum, item) => sum + item.binaryEntropy, 0) / reference.clauseMappings.length).toFixed(6))
    },
    candidateIntegrity: {
      uniqueSignatures: new Set(reference.candidates.map((item) => item.signature)).size,
      minimumCoreFacts: Math.min(...reference.candidates.map((item) => item.coreFactIds.length)),
      minimumFateClauses: Math.min(...reference.candidates.map((item) => item.fateClauseIds.length)),
      domainCoverageAllCandidates: errors.every((item) => !item.includes("核心事实缺少领域"))
    },
    seedVariantResults,
    errors,
    warnings
  };

  if (writeReport) {
    const lines = [
      "# V4 候选命籍码本校验报告",
      "",
      `- 结果：**${result.ok ? "通过" : "未通过"}**`,
      `- Replay Key：\`${result.replayKey}\``,
      `- 事实：${facts.length}`, `- 考刻条：${calibration.length}`, `- 命局/运限条：${fate.length}`, `- 互斥组：${constraints.length}`,
      `- 候选刻分：${reference.candidates.length}`, `- 条文映射：${reference.clauseMappings.length}`,
      "",
      "## 类别",
      "",
      `- 六亲考刻：${result.categoryCounts.六亲考刻}`,
      `- 定分：${result.categoryCounts.定分}`,
      `- 命局：${result.categoryCounts.命局}`,
      `- 运限：${result.categoryCounts.运限}`,
      "",
      "## 码本质量",
      "",
      `- 候选签名唯一：${result.candidateIntegrity.uniqueSignatures}/120`,
      `- 单候选最少核心事实：${result.candidateIntegrity.minimumCoreFacts}`,
      `- 单候选最少预生成命书条：${result.candidateIntegrity.minimumFateClauses}`,
      `- 全候选八领域覆盖：${result.candidateIntegrity.domainCoverageAllCandidates ? "通过" : "失败"}`,
      `- 条文分割范围：${result.splitBalance.minimum}—${result.splitBalance.maximum}`,
      `- 平均二元熵：${result.splitBalance.averageEntropy}`,
      "",
      "## BirthSeed敏感性",
      "",
      "| 改动 | 新指纹 | 先验摘要 | 映射摘要 | 通过 |",
      "|---|---|---|---|---|",
      ...seedVariantResults.map((item) => `| ${item.birthSeed.birthDate}/${item.birthSeed.shichen}/${item.birthSeed.gender}/${item.birthSeed.birthplace} | ${item.seedFingerprint} | ${item.priorDigest} | ${item.mappingDigest} | ${item.changed ? "是" : "否"} |`),
      "",
      "## 错误",
      "",
      ...(errors.length ? errors.map((item) => `- ${item}`) : ["- 无"]),
      "",
      "## 边界",
      "",
      "本报告证明的是候选码本的确定性、差异性、分割性与内部约束，不证明候选刻分对应真实钟表分钟，也不证明命书预测真实。",
      ""
    ];
    await writeFile(REPORT_PATH, lines.join("\n"), "utf8");
  }
  return result;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const result = await validateContentV4();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
