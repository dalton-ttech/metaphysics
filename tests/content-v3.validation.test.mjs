import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateContentV3 } from "../scripts/v3/validate-content-v3.mjs";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");

async function readJson(name) {
  return JSON.parse(await readFile(resolve(PROJECT_ROOT, "data/v3", name), "utf8"));
}

test("扩展内容层满足规模、单命题、编号与来源硬约束", async () => {
  const result = await validateContentV3({ writeReport: false });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(result.counts.facts >= 400);
  assert.equal(result.counts.calibration, result.counts.facts);
  assert.ok(result.counts.semanticFamilies >= 80);
  assert.ok(result.counts.fate >= 800);
  assert.equal(result.checks.requiredFields, true);
  assert.equal(result.checks.uniqueIdsAndNumbers, true);
  assert.equal(result.checks.primaryFactIntegrity, true);
  assert.equal(result.checks.singlePropositionHeuristics, true);
  assert.equal(result.checks.provenance, true);
  assert.equal(result.checks.nearDuplicateThreshold.calibrationPairs, 0);
  assert.equal(result.checks.nearDuplicateThreshold.fatePairs, 0);
});

test("司刻解全部使用陈述句，不向用户反问", async () => {
  const { clauses } = await readJson("calibration-clauses.json");
  for (const clause of clauses) {
    assert.match(clause.interpretation, /^所断为：/u, clause.id);
    assert.doesNotMatch(clause.interpretation, /[？?]|是否|有没有|可曾|曾否|何曾/u, clause.id);
  }
});

test("每条考刻条只映射一个存在的原子事实", async () => {
  const [{ facts }, { clauses }] = await Promise.all([readJson("facts.json"), readJson("calibration-clauses.json")]);
  const factIds = new Set(facts.map((item) => item.id));
  const usage = new Map(facts.map((item) => [item.id, 0]));

  for (const clause of clauses) {
    assert.equal(typeof clause.primaryFactId, "string");
    assert.equal(factIds.has(clause.primaryFactId), true, clause.id);
    assert.equal(Object.hasOwn(clause, "eventIds"), false, `${clause.id} 不应保留多事件 eventIds`);
    usage.set(clause.primaryFactId, usage.get(clause.primaryFactId) + 1);
  }

  assert.deepEqual(new Set(usage.values()), new Set([1]));
});

test("全部条文明确标为现代拟制且显示编号全局唯一", async () => {
  const [{ clauses: calibration }, { clauses: fate }] = await Promise.all([
    readJson("calibration-clauses.json"),
    readJson("fate-clauses.json")
  ]);
  const clauses = [...calibration, ...fate];
  const displayNumbers = clauses.map((item) => item.displayNumber);

  assert.equal(new Set(displayNumbers).size, clauses.length);
  for (const clause of clauses) {
    assert.equal(clause.source.kind, "modern_fabricated");
    assert.match(clause.source.provenance, /非古籍原文/);
  }
});
