import { describe, expect, it } from "vitest";

import {
  buildTiebanBook,
  compileTiebanBook,
  TIEBAN_MIN_PAST_NODES
} from "@/lib/tieban-v3-book";
import type {
  AtomicFact,
  CandidateState,
  TiebanClause,
  TiebanSession
} from "@/lib/tieban-v3-types";

const domains = ["family", "education_mobility", "career", "wealth", "relationship", "health", "law_social", "turning_point"] as const;

const facts: AtomicFact[] = Array.from({ length: 9 }, (_, index) => ({
  id: `fact-${index + 1}`,
  domain: domains[index % domains.length],
  label: `旧事${index + 1}`,
  definition: `命主在第${index + 1}个人生节点经历了明确转变`,
  subject: index === 0 ? "family" : index === 1 ? "parents" : "self",
  earliestAge: 8 + index * 3,
  latestAge: 10 + index * 3,
  baseRate: 0.3,
  salience: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5
}));

const clauses: TiebanClause[] = facts.map((fact, index) => ({
  id: `clause-${index + 1}`,
  volume: 1,
  article: index + 1,
  displayCode: String(10520 + index),
  primaryFactId: fact.id,
  kind: "calibration",
  text: `旧痕第${index + 1}条，事有明征。`,
  interpretation: fact.definition,
  ambiguity: 0.08,
  sensitivity: 0.93,
  specificity: 0.95,
  sourceKind: "modern_composed",
  sourceNote: "测试条文"
}));

const candidates: CandidateState[] = [{
  id: "刻-038",
  index: 37,
  minuteOffset: 37,
  clockTime: "23:37",
  keIndex: 3,
  minuteWithinKe: 7
}];

function makeSession(overrides: Partial<TiebanSession> = {}): TiebanSession {
  return {
    version: "3.0.0",
    intake: {
      name: "试刻者",
      birthDate: "1988-06-18",
      birthShichen: 0,
      gender: "female",
      birthplace: "杭州"
    },
    candidates,
    candidateLogWeights: [0],
    factProbabilities: Object.fromEntries(facts.map((fact) => [fact.id, 0.91])),
    factEvidence: Object.fromEntries(facts.map((fact) => [fact.id, 1])),
    domainCoverage: {},
    answers: clauses.map((clause, index) => ({
      clauseId: clause.id,
      answer: "resonates" as const,
      answeredAt: Date.UTC(2026, 6, 1) + index,
      topCandidateBefore: "刻-038",
      topCandidateAfter: "刻-038",
      topProbabilityAfter: 0.93,
      factProbabilityBefore: 0.3,
      factProbabilityAfter: 0.91
    })),
    askedClauseIds: clauses.map((clause) => clause.id),
    currentClauseId: null,
    phase: "locked",
    createdAt: Date.UTC(2026, 6, 1),
    completedAt: Date.UTC(2026, 6, 1),
    lockedCandidateId: "刻-038",
    lockStrength: "decisive",
    ...overrides
  };
}

describe("Tieban V3 book compiler", () => {
  it("compiles 6-10 evidence-backed past nodes with complete traceability", () => {
    const book = buildTiebanBook(makeSession(), facts, clauses);

    expect(book.pastNodes).toHaveLength(9);
    expect(book.pastNodes.length).toBeGreaterThanOrEqual(TIEBAN_MIN_PAST_NODES);
    expect(book.pastNodes.length).toBeLessThanOrEqual(10);
    for (const node of book.pastNodes) {
      expect(node.ageRange).toMatch(/岁/);
      expect(node.subject.length).toBeGreaterThan(0);
      expect(node.summary.length).toBeGreaterThan(0);
      expect(node.aftereffect.length).toBeGreaterThan(0);
      expect(node.evidenceClauseIds.length).toBeGreaterThan(0);
      expect(node.evidenceClauseIds.every((id) => clauses.some((clause) => clause.id === id))).toBe(true);
      expect(clauses.some((clause) => node.summary.includes(clause.text))).toBe(false);
      expect(node.summary).not.toMatch(/据已合|归并|不是泛指|前后生活由此分开|概率|置信|模型/);
    }
    const endings = book.pastNodes.map((node) => node.summary.split("。").filter(Boolean).at(-1));
    expect(new Set(endings).size).toBe(endings.length);
    expect(book.exactTime).toBe("23:37");
    expect(book.keLabel).toBe("第3刻·7分");
  });

  it("never invents a past node when evidence is absent, even at high score", () => {
    const session = makeSession({
      factProbabilities: { ...makeSession().factProbabilities, "fact-1": 0.99 },
      factEvidence: { ...makeSession().factEvidence, "fact-1": 0 },
      answers: makeSession().answers.filter((answer) => answer.clauseId !== "clause-1")
    });
    const book = buildTiebanBook(session, [facts[0]], clauses);

    expect(book.pastNodes).toEqual([]);
    expect(book.futureNodes).toEqual([]);
    expect(book.opening).toContain("尚未成卷");
  });

  it("does not treat a non-resonating clause as supporting evidence", () => {
    const base = makeSession();
    const session = makeSession({
      answers: base.answers.map((answer) => answer.clauseId === "clause-2" ? { ...answer, answer: "not_resonates" } : answer)
    });
    const book = buildTiebanBook(session, facts, clauses);

    expect(book.pastNodes.some((node) => node.factId === "fact-2")).toBe(false);
  });

  it("collapses multiple age windows from the same semantic event family", () => {
    const repeatedFacts: AtomicFact[] = [
      { ...facts[0], id: "fact.v3.same_family.1", earliestAge: 8, latestAge: 10 },
      { ...facts[0], id: "fact.v3.same_family.2", earliestAge: 20, latestAge: 22 }
    ];
    const repeatedClauses: TiebanClause[] = repeatedFacts.map((fact, index) => ({
      ...clauses[0],
      id: `same-family-clause-${index + 1}`,
      primaryFactId: fact.id,
      text: `同族异窗第${index + 1}条。`
    }));
    const session = makeSession({
      factProbabilities: Object.fromEntries(repeatedFacts.map((fact) => [fact.id, 0.95])),
      factEvidence: Object.fromEntries(repeatedFacts.map((fact) => [fact.id, 1])),
      answers: repeatedClauses.map((clause) => ({
        clauseId: clause.id,
        answer: "resonates" as const,
        answeredAt: Date.UTC(2026, 6, 1),
        topCandidateBefore: "刻-038",
        topCandidateAfter: "刻-038",
        topProbabilityAfter: 0.93,
        factProbabilityBefore: 0.3,
        factProbabilityAfter: 0.95
      }))
    });

    const book = buildTiebanBook(session, repeatedFacts, repeatedClauses);
    expect(book.pastNodes).toHaveLength(1);
  });

  it("is deterministic and independent of caller array order", () => {
    const session = makeSession();
    const first = compileTiebanBook(session, facts, clauses);
    const second = compileTiebanBook(session, [...facts].reverse(), [...clauses].reverse());

    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/概率|置信|后验|模型/);
  });

  it("writes explicit future age ranges and only extends facts proven in the past book", () => {
    const fateClauses: TiebanClause[] = [{
      ...clauses[2],
      id: "fate-career-1",
      kind: "future",
      text: "旧业重开，新任可成。"
    }];
    const book = buildTiebanBook(makeSession(), facts, clauses, fateClauses, { maxFutureNodes: 4 });
    const evidencedFacts = new Set(book.pastNodes.map((node) => node.factId));

    expect(book.futureNodes).toHaveLength(4);
    expect(book.futureNodes[0].horizon).toBe("39—41岁");
    for (const node of book.futureNodes) {
      expect(node.horizon).toMatch(/^\d+—\d+岁$/);
      expect(node.title.length).toBeGreaterThan(0);
      expect(node.reading).toContain(node.horizon);
      expect(node.reading).toMatch(/将|会/);
      expect(node.consequence.length).toBeGreaterThan(0);
      expect(node.evidenceFactIds.every((factId) => evidencedFacts.has(factId))).toBe(true);
    }
    expect(book.futureNodes.find((node) => node.evidenceFactIds.includes("fact-3"))?.verse).toBe("旧业重开，新任可成。");
  });

  it("removes explanatory template language from displayed future clauses", () => {
    const fateClauses: TiebanClause[] = [{
      ...clauses[0],
      id: "fate-polish-1",
      kind: "future",
      text: "后运再逢旧事之类，顺势舍旧，后运反见开阔。"
    }];
    const book = buildTiebanBook(makeSession(), facts, clauses, fateClauses, { maxFutureNodes: 1 });

    expect(book.futureNodes[0].verse).toBe("旧事之象再临，顺势舍旧，前路反见开阔。");
    expect(book.futureNodes[0].verse).not.toContain("之类");
  });
});
