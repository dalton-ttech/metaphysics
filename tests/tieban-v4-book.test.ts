import { describe, expect, it } from "vitest";

import {
  buildTiebanBookV4,
  TIEBAN_IDENTITY_FALLBACK_V4,
  TIEBAN_IDENTITY_PATTERNS_V4
} from "@/lib/tieban-v4-book";
import { createTiebanSessionV4 } from "@/lib/tieban-v4-engine";
import type { AtomicFact, TiebanClause, TiebanIntake, TiebanV4Session } from "@/lib/tieban-v4-types";

const intake: TiebanIntake = { name: "命主", birthDate: "1986-03-12", birthShichen: 4, gender: "male", birthplace: "苏州" };
const domains = ["family", "education_mobility", "career", "wealth", "relationship", "health", "law_social", "turning_point"] as const;
const facts: AtomicFact[] = Array.from({ length: 96 }, (_, index) => ({
  id: `book-fact-${index + 1}`,
  domain: domains[index % domains.length],
  label: `人生关节${index + 1}`,
  definition: `在第${index + 1}处关节经历过可核对的变化`,
  subject: index % 9 === 0 ? "parents" : "self",
  earliestAge: 3 + index % 28,
  latestAge: 6 + index % 28,
  baseRate: 0.18 + index % 6 * 0.06,
  salience: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5
}));
const calibration: TiebanClause[] = facts.map((fact, index) => ({
  id: `book-check-${index + 1}`,
  volume: index % 12 + 1,
  article: index + 1,
  displayCode: String(10100 + index),
  primaryFactId: fact.id,
  kind: "calibration",
  text: `原考刻句第${index + 1}条，不得进入命书正文。`,
  interpretation: fact.definition,
  ambiguity: 0.08,
  sensitivity: 0.93,
  specificity: 0.95,
  sourceKind: "modern_composed",
  sourceNote: "测试"
}));
const fate: TiebanClause[] = facts.map((fact, index) => ({
  ...calibration[index],
  id: `book-fate-${index + 1}`,
  kind: "future",
  text: `后程第${index + 1}条，关山移步，旧局更新。`
}));

function locked(candidateIndex: number): TiebanV4Session {
  const session = createTiebanSessionV4(intake, calibration, facts, fate, Date.UTC(2026, 6, 21));
  return {
    ...session,
    phase: "locked",
    completedAt: Date.UTC(2026, 6, 21),
    currentClauseId: null,
    currentTestedCandidateId: null,
    lockedCandidateId: session.candidates[candidateIndex].id,
    lockStrength: "decisive"
  };
}

describe("Tieban V4 locked-profile book compiler", () => {
  it("can generate a stable core book without copying answer facts", () => {
    const session = locked(31);
    const first = buildTiebanBookV4(session, facts, calibration, fate);
    const second = buildTiebanBookV4({ ...session, answers: [] }, facts, calibration, fate);
    expect(second).toEqual(first);
    expect(first.pastNodes.length).toBeGreaterThanOrEqual(6);
    expect(first.pastNodes.some((node) => !node.askedDirectly && node.inference === "profile_inferred")).toBe(true);
    for (const clause of calibration) expect(JSON.stringify(first)).not.toContain(clause.text);
  });

  it("changes the book materially when the locked candidate changes", () => {
    const first = buildTiebanBookV4(locked(12), facts, calibration, fate);
    const second = buildTiebanBookV4(locked(87), facts, calibration, fate);
    const firstFacts = new Set(first.pastNodes.map((node) => node.factId));
    const overlap = second.pastNodes.filter((node) => firstFacts.has(node.factId)).length;
    expect(second.profileCode).not.toBe(first.profileCode);
    // Profiles may legitimately share broad life domains; require at least three distinct past nodes
    // instead of coupling the test to one corpus version's exact overlap ratio.
    expect(first.pastNodes.length - overlap).toBeGreaterThanOrEqual(3);
    expect(second.futureNodes.map((node) => node.clauseId)).not.toEqual(first.futureNodes.map((node) => node.clauseId));
  });

  it("keeps the locked profile stable while marking transcript-backed evidence", () => {
    const session = locked(44);
    const baseline = buildTiebanBookV4(session, facts, calibration, fate);
    const rejectedFact = baseline.pastNodes[0].factId;
    const clause = calibration.find((item) => item.primaryFactId === rejectedFact)!;
    const constrained: TiebanV4Session = {
      ...session,
      answers: [{
        clauseId: clause.id,
        factId: rejectedFact,
        answer: "not_resonates",
        answeredAt: Date.UTC(2026, 6, 21),
        testedCandidateId: session.lockedCandidateId!,
        topCandidateBefore: session.lockedCandidateId!,
        topCandidateAfter: session.lockedCandidateId!,
        topProbabilityAfter: 0.9,
        fourMinuteProbabilityAfter: 0.96
      }]
    };
    const book = buildTiebanBookV4(constrained, facts, calibration, fate);
    expect(book.profileCode).toBe(baseline.profileCode);
    expect(book.futureNodes).toEqual(baseline.futureNodes);
    expect(book.pastNodes.every((node) => node.factId !== rejectedFact || node.askedDirectly)).toBe(true);
    expect(JSON.stringify(book)).not.toContain(clause.text);
  });

  it("keeps every vernacular book layer concrete and independently readable", () => {
    const book = buildTiebanBookV4(locked(68), facts, calibration, fate);
    const vernacular = [
      book.identity.reading,
      ...book.pastNodes.map((node) => node.aftereffect),
      ...book.storyEdges.map((edge) => edge.text),
      ...book.futureNodes.flatMap((node) => [node.sign, node.reading])
    ].join("\n");
    expect(vernacular).not.toMatch(/前一处|这一处|真实选择|未完的课题|处世习惯|生活主线|职业主线|结构倾向|长期路径|成为位置|转为定向/u);
    for (const edge of book.storyEdges) {
      const from = book.pastNodes.find((node) => node.id === edge.fromNodeId)!;
      const to = book.pastNodes.find((node) => node.id === edge.toNodeId)!;
      expect(edge.text).toContain(from.title.replace(/^.*? · /u, ""));
      expect(edge.text).toContain(to.title.replace(/^.*? · /u, ""));
    }
  });

  it("keeps every identity dictum as one coherent seven-character couplet", () => {
    const identities = [...TIEBAN_IDENTITY_PATTERNS_V4, TIEBAN_IDENTITY_FALLBACK_V4];
    for (const identity of identities) {
      expect(identity.dictum).toMatch(/^[^，。！？；]{7}，[^，。！？；]{7}。$/u);
      expect(identity.dictum).not.toMatch(/后来|以后|之后|因此|所以|从而|导致|意味着|便处处/u);
    }
  });

  it("writes the full later-life volume through the terminal age", () => {
    const book = buildTiebanBookV4(locked(68), facts, calibration, fate);
    expect(book.futureNodes.length).toBeGreaterThanOrEqual(18);
    expect(book.futureNodes[0].ageStart).toBe(book.currentAge + 1);
    expect(book.futureNodes.at(-1)).toMatchObject({ ageStart: book.terminalAge, ageEnd: book.terminalAge, terminal: true });
    expect(book.futureNodes.at(-1)?.reading).toContain(`${book.terminalAge}岁为寿限`);
    for (let index = 1; index < book.futureNodes.length; index += 1) {
      expect(book.futureNodes[index].ageStart).toBe(book.futureNodes[index - 1].ageEnd + 1);
      expect(book.futureNodes[index].ageEnd - book.futureNodes[index].ageStart + 1).toBeLessThanOrEqual(3);
    }
    expect(new Set(book.futureNodes.map((node) => node.verse)).size).toBe(book.futureNodes.length);
  });
});
