import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateContentV4 } from "../scripts/v4/validate-content-v4.mjs";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");

async function readJson(name) {
  return JSON.parse(await readFile(resolve(PROJECT_ROOT, "data/v4", name), "utf8"));
}

test("V4候选命籍通过完整结构、平衡、互斥与BirthSeed校验", async () => {
  const result = await validateContentV4({ writeReport: false });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.counts.candidates, 120);
  assert.ok(result.counts.calibration >= 300);
  assert.ok(result.counts.fate >= 600);
  assert.equal(result.candidateIntegrity.uniqueSignatures, 120);
  assert.equal(result.candidateIntegrity.domainCoverageAllCandidates, true);
  assert.ok(result.splitBalance.minimum >= 0.075);
  assert.ok(result.splitBalance.maximum <= 0.8);
  assert.equal(result.seedVariantResults.every((item) => item.changed), true);
});

test("参考码本在回答前已经拥有独立事实概率与命书", async () => {
  const [reference, factsFile, calibrationFile] = await Promise.all([
    readJson("reference-codebook.json"),
    readJson("facts.json"),
    readJson("calibration-clauses.json")
  ]);
  assert.equal(reference.generatedBeforeAnswers, true);
  assert.equal(reference.answerHistoryUsed, false);
  assert.deepEqual(reference.birthSeedFieldsUsed, ["birthDate", "shichen", "gender", "birthplace"]);
  assert.equal(reference.candidates.length, 120);
  assert.equal(reference.clauseMappings.length, calibrationFile.clauses.length);
  for (const candidate of reference.candidates) {
    assert.equal(Object.keys(candidate.factProbabilities).length, factsFile.facts.length);
    assert.ok(candidate.coreFactIds.length > 0);
    assert.ok(candidate.fateClauseIds.length >= 40);
  }
});

test("每个候选严格满足枚举轴互斥概率约束", async () => {
  const [reference, constraintsFile] = await Promise.all([
    readJson("reference-codebook.json"),
    readJson("constraints.json")
  ]);
  for (const candidate of reference.candidates) {
    for (const constraint of constraintsFile.constraints) {
      const sum = constraint.factIds.reduce((total, factId) => total + candidate.factProbabilities[factId], 0);
      assert.ok(Math.abs(sum - 1) <= 1e-8, `${candidate.id}/${constraint.id}=${sum}`);
      assert.ok(constraint.factIds.includes(candidate.exclusiveSelections[constraint.id]));
    }
  }
});

test("候选命籍不会把依赖人物不存在的事实编入核心画像", async () => {
  const [reference, factsFile] = await Promise.all([
    readJson("reference-codebook.json"),
    readJson("facts.json")
  ]);
  const factById = new Map(factsFile.facts.map((fact) => [fact.id, fact]));
  for (const candidate of reference.candidates) {
    for (const factId of candidate.coreFactIds) {
      const fact = factById.get(factId);
      assert.ok(fact, `${candidate.id}核心事实不存在：${factId}`);
      for (const requirement of fact.applicability?.requiredContexts ?? []) {
        const selected = candidate.exclusiveSelections[requirement.groupId];
        assert.ok(requirement.allowedFactIds.includes(selected), `${candidate.id}/${factId}缺少前置事实：${requirement.groupId}/${selected}`);
      }
      for (const exclusion of fact.applicability?.excludedContexts ?? []) {
        const selected = candidate.exclusiveSelections[exclusion.groupId];
        assert.ok(!exclusion.allowedFactIds.includes(selected), `${candidate.id}/${factId}命中排除事实：${exclusion.groupId}/${selected}`);
      }
    }
  }

  for (const candidate of reference.candidates) {
    const count = candidate.exclusiveSelections["mx.siblings_count"];
    const order = candidate.exclusiveSelections["mx.birth_order"];
    if (count === "fact.v4.axis.siblings_count.0") assert.equal(order, "fact.v4.axis.birth_order.only");
    if (count === "fact.v4.axis.siblings_count.1") assert.ok([
      "fact.v4.axis.birth_order.eldest",
      "fact.v4.axis.birth_order.youngest"
    ].includes(order));
    if (["fact.v4.axis.siblings_count.2", "fact.v4.axis.siblings_count.3p"].includes(count)) {
      assert.ok([
        "fact.v4.axis.birth_order.eldest",
        "fact.v4.axis.birth_order.middle",
        "fact.v4.axis.birth_order.youngest"
      ].includes(order));
    }
  }
});
