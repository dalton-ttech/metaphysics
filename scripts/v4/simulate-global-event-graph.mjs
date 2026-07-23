import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_JSON = resolve(PROJECT_ROOT, "evaluation/global-event-graph-v1.json");
const DEFAULT_MD = resolve(PROJECT_ROOT, "evaluation/global-event-graph-v1.md");
const SEED = "global-event-graph-v1";
const SAMPLE_COUNT = 20000;

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

function contextKey(context) {
  return `${context.groupId}:${context.allowedFactIds.join(",")}`;
}

function applicabilityStatus(fact, selections) {
  for (const requirement of fact.applicability?.requiredContexts ?? []) {
    const selected = selections[requirement.groupId];
    if (!selected) return "deferred";
    if (!requirement.allowedFactIds.includes(selected)) return "not_applicable";
  }
  for (const exclusion of fact.applicability?.excludedContexts ?? []) {
    const selected = selections[exclusion.groupId];
    if (selected && exclusion.allowedFactIds.includes(selected)) return "not_applicable";
  }
  return "eligible";
}

function buildSelections(constraints, sampleIndex) {
  return Object.fromEntries(constraints.map((constraint) => {
    const selectedIndex = hash32(`${SEED}|${sampleIndex}|${constraint.id}`) % constraint.factIds.length;
    return [constraint.id, constraint.factIds[selectedIndex]];
  }));
}

function hasContradictingContext(fact, selections) {
  const missingRequirement = (fact.applicability?.requiredContexts ?? []).some((context) => {
    const selected = selections[context.groupId];
    return selected && !context.allowedFactIds.includes(selected);
  });
  const matchedExclusion = (fact.applicability?.excludedContexts ?? []).some((context) => {
    const selected = selections[context.groupId];
    return selected && context.allowedFactIds.includes(selected);
  });
  return missingRequirement || matchedExclusion;
}

function expectedRuleFacts(eventRuleData, facts) {
  const expected = new Map();
  for (const rule of eventRuleData.rules) {
    const matches = facts.filter((fact) => rule.eventIds.includes(fact.legacyEventId)
      && (rule.maxLatestAge === null || (fact.timeWindow?.maxAge ?? Number.POSITIVE_INFINITY) <= rule.maxLatestAge));
    expected.set(rule.id, {
      effect: rule.effect,
      context: rule.context,
      expectedFactIds: matches.map((fact) => fact.id)
    });
  }
  for (const rule of eventRuleData.dynamicRules) {
    const matches = facts.filter((fact) => {
      if (!rule.eventIds.includes(fact.legacyEventId)) return false;
      const latestAge = fact.timeWindow?.maxAge ?? Number.POSITIVE_INFINITY;
      return Object.values(rule.earliestAgeByOption).some((earliestAge) => earliestAge > latestAge);
    });
    expected.set(rule.id, {
      effect: rule.effect,
      context: null,
      expectedFactIds: matches.map((fact) => fact.id)
    });
  }
  return expected;
}

function auditRuleMaterialization(eventRuleData, facts) {
  const expected = expectedRuleFacts(eventRuleData, facts);
  const rows = [];
  let missingContexts = 0;
  for (const [ruleId, item] of expected) {
    let materializedFacts = 0;
    for (const factId of item.expectedFactIds) {
      const fact = facts.find((candidate) => candidate.id === factId);
      if (!fact) continue;
      if (item.effect === "excluded_by_window") {
        const latestAge = fact.timeWindow?.maxAge ?? Number.POSITIVE_INFINITY;
        const incompatible = Object.entries(eventRuleData.dynamicRules[0].earliestAgeByOption)
          .filter(([, earliestAge]) => earliestAge > latestAge)
          .map(([key]) => `fact.v4.axis.${eventRuleData.dynamicRules[0].axisId}.${key}`);
        if (!incompatible.length) continue;
        const found = (fact.applicability?.excludedContexts ?? []).some((context) => context.groupId === `mx.${eventRuleData.dynamicRules[0].axisId}`
          && incompatible.every((factId) => context.allowedFactIds.includes(factId)));
        if (found) materializedFacts += 1;
        else missingContexts += 1;
        continue;
      }
      const contexts = item.effect === "required"
        ? fact.applicability?.requiredContexts ?? []
        : fact.applicability?.excludedContexts ?? [];
      const found = contexts.some((context) => contextKey(context) === contextKey(item.context));
      if (found) materializedFacts += 1;
      else missingContexts += 1;
    }
    rows.push({ ruleId, expectedFacts: item.expectedFactIds.length, materializedFacts });
  }
  return { rows, missingContexts };
}

function runSimulation({ facts, constraints, codebook, eventRuleData }) {
  const conditionalFacts = facts.filter((fact) => (fact.applicability?.requiredContexts?.length ?? 0)
    + (fact.applicability?.excludedContexts?.length ?? 0) > 0);
  let contradictoryEligibleCount = 0;
  let checkedConditionalFacts = 0;
  const statusCounts = { eligible: 0, deferred: 0, not_applicable: 0 };
  const compactRows = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
    const selections = buildSelections(constraints, sampleIndex);
    let sampleContradictions = 0;
    for (const fact of conditionalFacts) {
      const status = applicabilityStatus(fact, selections);
      statusCounts[status] += 1;
      checkedConditionalFacts += 1;
      if (hasContradictingContext(fact, selections) && status === "eligible") {
        contradictoryEligibleCount += 1;
        sampleContradictions += 1;
      }
    }
    compactRows.push([sampleIndex, sha(selections).slice(0, 12), sampleContradictions]);
  }

  let unresolvedExclusionOverSuppressionCount = 0;
  let unresolvedRequirementNotDeferredCount = 0;
  for (const fact of conditionalFacts) {
    const hasRequired = (fact.applicability?.requiredContexts?.length ?? 0) > 0;
    const hasExcluded = (fact.applicability?.excludedContexts?.length ?? 0) > 0;
    const status = applicabilityStatus(fact, {});
    if (!hasRequired && hasExcluded && status !== "eligible") unresolvedExclusionOverSuppressionCount += 1;
    if (hasRequired && status !== "deferred") unresolvedRequirementNotDeferredCount += 1;
  }

  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  let candidateCoreContradictions = 0;
  let candidateCoreFactsChecked = 0;
  for (const candidate of codebook.candidates) {
    for (const factId of candidate.coreFactIds) {
      const fact = factById.get(factId);
      if (!fact) continue;
      candidateCoreFactsChecked += 1;
      if (applicabilityStatus(fact, candidate.exclusiveSelections) !== "eligible") candidateCoreContradictions += 1;
    }
  }

  const materialization = auditRuleMaterialization(eventRuleData, facts);
  return {
    metrics: {
      totalSamples: SAMPLE_COUNT,
      conditionalFacts: conditionalFacts.length,
      checkedConditionalFacts,
      contradictoryEligibleCount,
      unresolvedExclusionOverSuppressionCount,
      unresolvedRequirementNotDeferredCount,
      candidateCoreFactsChecked,
      candidateCoreContradictions,
      ruleMaterializationMissingCount: materialization.missingContexts,
      statusCounts
    },
    ruleCoverage: materialization.rows,
    resultHash: sha(compactRows)
  };
}

async function sourceHash() {
  const paths = [
    resolve(PROJECT_ROOT, "src/lib/tieban-v4-engine.ts"),
    resolve(PROJECT_ROOT, "scripts/v4/global-event-rules-v4.mjs"),
    resolve(PROJECT_ROOT, "scripts/v4/generate-content-v4.mjs"),
    resolve(PROJECT_ROOT, "scripts/v4/simulate-global-event-graph.mjs")
  ];
  return sha((await Promise.all(paths.map((path) => readFile(path, "utf8")))).join("\n---\n"));
}

async function buildReport() {
  const [factText, constraintText, codebookText, eventRuleText, currentSourceHash] = await Promise.all([
    readFile(resolve(PROJECT_ROOT, "data/v4/facts.json"), "utf8"),
    readFile(resolve(PROJECT_ROOT, "data/v4/constraints.json"), "utf8"),
    readFile(resolve(PROJECT_ROOT, "data/v4/reference-codebook.json"), "utf8"),
    readFile(resolve(PROJECT_ROOT, "data/v4/event-rules.json"), "utf8"),
    sourceHash()
  ]);
  const facts = JSON.parse(factText).facts;
  const constraints = JSON.parse(constraintText).constraints;
  const codebook = JSON.parse(codebookText);
  const eventRuleData = JSON.parse(eventRuleText);
  const first = runSimulation({ facts, constraints, codebook, eventRuleData });
  const second = runSimulation({ facts, constraints, codebook, eventRuleData });
  const deterministicReplay = first.resultHash === second.resultHash;
  return {
    schemaVersion: "1.0.0",
    corpusVersion: codebook.corpusVersion,
    generatedAt: "2026-07-22T00:00:00+08:00",
    seed: SEED,
    configHash: sha({ sampleCount: SAMPLE_COUNT, seed: SEED }),
    dataHash: sha(`${factText}\n${constraintText}\n${eventRuleText}`),
    codebookHash: sha(codebookText),
    sourceHash: currentSourceHash,
    metrics: first.metrics,
    ruleCoverage: first.ruleCoverage,
    resultHash: first.resultHash,
    acceptance: {
      noContradictoryEligibleFacts: first.metrics.contradictoryEligibleCount === 0,
      unresolvedExclusionsRemainEligible: first.metrics.unresolvedExclusionOverSuppressionCount === 0,
      unresolvedRequirementsDefer: first.metrics.unresolvedRequirementNotDeferredCount === 0,
      noContradictoryCandidateCoreFacts: first.metrics.candidateCoreContradictions === 0,
      allRulesMaterialized: first.metrics.ruleMaterializationMissingCount === 0,
      deterministicReplay
    }
  };
}

function markdown(report) {
  return [
    "# 全域事件图谱模拟报告 V1",
    "",
    `- 内容版本：\`${report.corpusVersion}\``,
    `- 固定种子：\`${report.seed}\``,
    `- 随机结构化人生样本：${report.metrics.totalSamples}`,
    `- 参与条件审核的事实：${report.metrics.conditionalFacts}`,
    `- 条件事实检查：${report.metrics.checkedConditionalFacts}`,
    `- 矛盾事实仍被判可用：${report.metrics.contradictoryEligibleCount}`,
    `- 上游未知时误跳过：${report.metrics.unresolvedExclusionOverSuppressionCount}`,
    `- 候选命籍核心事实检查：${report.metrics.candidateCoreFactsChecked}`,
    `- 候选命籍核心矛盾：${report.metrics.candidateCoreContradictions}`,
    "",
    "## 规则覆盖",
    "",
    "| 规则 | 应作用事实 | 已写入事实 |",
    "|---|---:|---:|",
    ...report.ruleCoverage.map((item) => `| ${item.ruleId} | ${item.expectedFacts} | ${item.materializedFacts} |`),
    "",
    "## 验收",
    "",
    ...Object.entries(report.acceptance).map(([key, passed]) => `- ${passed ? "通过" : "失败"}：${key}`),
    "",
    "该实验验证的是条件门控、时间范围、候选命籍内部一致性与固定种子重放，不把结构模拟结果冒充真人识别准确率。未建立严格蕴含关系的相似事件会保留为可询问事实，以避免过度推断。",
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
  for (const field of ["configHash", "dataHash", "codebookHash", "sourceHash", "resultHash"]) {
    if (saved[field] !== report[field]) throw new Error(`全域事件图谱报告已经过期：${field} 与当前工程不一致`);
  }
}
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.acceptance).some((passed) => !passed)) process.exitCode = 1;
