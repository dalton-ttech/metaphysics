import { describe, expect, it } from "vitest";

import referenceCodebook from "../data/v4/reference-codebook.json";
import { buildTiebanBookV4 } from "@/lib/tieban-v4-book";
import { V4_ATOMIC_FACTS, V4_CALIBRATION_CLAUSES, V4_CONSTRAINTS, V4_FATE_CLAUSES } from "@/lib/tieban-v4-content";
import { answerTiebanClauseV4, createTiebanSessionV4, getLockedCandidateV4, TIEBAN_V4_MAX_TURNS } from "@/lib/tieban-v4-engine";
import type { TiebanIntake } from "@/lib/tieban-v4-types";

const intake: TiebanIntake = {
  name: "验局者",
  birthDate: "1990-01-01",
  birthShichen: 0,
  gender: "unspecified",
  birthplace: "北京"
};

function run(targetIndex: number) {
  let session = createTiebanSessionV4(
    intake,
    V4_CALIBRATION_CLAUSES,
    V4_ATOMIC_FACTS,
    V4_FATE_CLAUSES,
    Date.UTC(2026, 6, 21),
    V4_CONSTRAINTS
  );
  const target = session.profiles[targetIndex];
  const factIndexById = new Map(V4_ATOMIC_FACTS.map((fact, index) => [fact.id, index]));
  while (!session.completedAt && session.answers.length < TIEBAN_V4_MAX_TURNS) {
    const clause = V4_CALIBRATION_CLAUSES.find((item) => item.id === session.currentClauseId)!;
    const factIndex = factIndexById.get(clause.primaryFactId)!;
    const answer = target.factProbabilities[factIndex] >= 0.5 ? "resonates" as const : "not_resonates" as const;
    session = answerTiebanClauseV4(session, answer, V4_CALIBRATION_CLAUSES, V4_ATOMIC_FACTS, Date.UTC(2026, 6, 21) + session.answers.length + 1);
  }
  return session;
}

describe("Tieban V4 production corpus integration", () => {
  it("locks the real 540-clause codebook and opens a profile-derived book", () => {
    const session = run(73);
    expect(session.phase).toBe("locked");
    expect(getLockedCandidateV4(session).index).toBe(73);
    const book = buildTiebanBookV4(session, V4_ATOMIC_FACTS, V4_CALIBRATION_CLAUSES, V4_FATE_CLAUSES);
    expect(book.pastNodes.length).toBeGreaterThanOrEqual(6);
    expect(book.futureNodes.length).toBeGreaterThanOrEqual(18);
    expect(book.pastNodes.some((node) => !node.askedDirectly)).toBe(true);
    expect(book.pastNodes.every((node) => node.clauseNumber.length === 5)).toBe(true);
    expect(book.pastNodes.every((node) => !node.summary.includes("落到实处"))).toBe(true);
    const intensePattern = /重病|严重|意外|离世|去世|死亡|诉讼|仲裁|报警|犯罪|监禁|破产|资不抵债|流产|离婚|失业|火灾|落水|灾祸/u;
    expect(book.pastNodes.filter((node) => intensePattern.test(node.aftereffect)).length).toBeLessThanOrEqual(2);
    const adversePattern = /中断|失业|住院|手术|损失|危机|压力|崩塌|分手|离世|去世|死亡|诉讼|仲裁|报警|犯罪|监禁|破产|资不抵债|流产|离婚|意外|重病|严重|负债|纠纷|冲突|受伤|灾祸|失败|破裂|落水|火灾|裁员|辞退|困境|下降|骤落|下滑|受损|损害|低谷|慢性|旧恙|疏离|不和|欺诈|失守|背叛/u;
    expect(book.pastNodes.filter((node) => adversePattern.test(node.aftereffect)).length).toBeLessThanOrEqual(4);
    expect(new Set(book.futureNodes.map((node) => node.eventKey)).size).toBe(book.futureNodes.length);
    expect(book.futureNodes.at(-1)?.terminal).toBe(true);
    const questionTexts = new Set(V4_CALIBRATION_CLAUSES.map((clause) => clause.text));
    expect(book.pastNodes.every((node) => !questionTexts.has(node.summary))).toBe(true);
  });

  it("changes candidate profiles when any BirthSeed field changes", () => {
    const baseline = createTiebanSessionV4(intake, V4_CALIBRATION_CLAUSES, V4_ATOMIC_FACTS, V4_FATE_CLAUSES, 1, V4_CONSTRAINTS);
    expect(baseline.birthSeed.replayKey).toBe(referenceCodebook.replayKey);
    expect(baseline.profiles[0].signature).toBe(referenceCodebook.candidates[0].signature);
    expect(baseline.profiles[0].priorProbability).toBe(referenceCodebook.candidates[0].prior);
    const variants = [
      { ...intake, birthDate: "1990-01-02" },
      { ...intake, birthShichen: 1 },
      { ...intake, gender: "female" as const },
      { ...intake, birthplace: "上海" }
    ];
    for (const variant of variants) {
      const changed = createTiebanSessionV4(variant, V4_CALIBRATION_CLAUSES, V4_ATOMIC_FACTS, V4_FATE_CLAUSES, 1, V4_CONSTRAINTS);
      expect(changed.birthSeed.digest).not.toBe(baseline.birthSeed.digest);
      expect(changed.profiles[0].factProbabilities).not.toEqual(baseline.profiles[0].factProbabilities);
    }
  });
});
