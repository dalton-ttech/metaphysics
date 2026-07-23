import { describe, expect, it } from "vitest";

import {
  answerTiebanClause,
  buildCandidateStates,
  candidateClauseSignal,
  createTiebanSession,
  getLockedCandidate,
  rankCandidates,
  TIEBAN_MAX_TURNS
} from "@/lib/tieban-v3-engine";
import type { AtomicFact, TiebanClause, TiebanIntake } from "@/lib/tieban-v3-types";

const intake: TiebanIntake = {
  name: "试刻者",
  birthDate: "1988-06-18",
  birthShichen: 0,
  gender: "female",
  birthplace: "杭州"
};

const domains = ["family", "education_mobility", "career", "wealth", "relationship", "health", "law_social", "turning_point"] as const;

const facts: AtomicFact[] = Array.from({ length: 80 }, (_, index) => ({
  id: `fact-${String(index + 1).padStart(3, "0")}`,
  domain: domains[index % domains.length],
  label: `原子事实${index + 1}`,
  definition: `只判断第${index + 1}项独立人生事实。`,
  subject: "self",
  earliestAge: 3 + index % 18,
  latestAge: null,
  baseRate: 0.18 + (index % 7) * 0.035,
  salience: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5
}));

const clauses: TiebanClause[] = facts.map((fact, index) => ({
  id: `clause-${String(index + 1).padStart(3, "0")}`,
  volume: Math.floor(index / 20) + 1,
  article: index + 1,
  displayCode: String(10001 + index),
  primaryFactId: fact.id,
  kind: "calibration",
  text: `旧事第${index + 1}条，单象而断。`,
  interpretation: fact.definition,
  ambiguity: 0.08 + (index % 3) * 0.04,
  sensitivity: 0.92,
  specificity: 0.95,
  sourceKind: "modern_composed",
  sourceNote: "V3测试拟制条文"
}));

function answerForCandidate(targetIndex: number, clauseId: string) {
  return candidateClauseSignal(targetIndex, clauseId) ? "resonates" as const : "not_resonates" as const;
}

function runTarget(targetIndex: number, flips = new Set<number>()) {
  let session = createTiebanSession(intake, clauses, facts, 1);
  while (!session.completedAt && session.answers.length < TIEBAN_MAX_TURNS) {
    const turn = session.answers.length;
    const intended = answerForCandidate(targetIndex, session.currentClauseId!);
    const answer = flips.has(turn)
      ? intended === "resonates" ? "not_resonates" : "resonates"
      : intended;
    session = answerTiebanClause(session, answer, clauses, facts, turn + 2);
  }
  return session;
}

describe("Tieban V3 candidate space", () => {
  it("builds the full 120-minute shichen without duplicate clock labels", () => {
    const candidates = buildCandidateStates(0);
    expect(candidates).toHaveLength(120);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(120);
    expect(new Set(candidates.map((candidate) => candidate.clockTime)).size).toBe(120);
    expect(candidates[0].keIndex).toBe(1);
    expect(candidates[119].keIndex).toBe(8);
  });

  it("gives every candidate a distinct atomic-clause codeword", () => {
    const signatures = Array.from({ length: 120 }, (_, candidateIndex) =>
      clauses.map((clause) => candidateClauseSignal(candidateIndex, clause.id) ? "1" : "0").join("")
    );
    expect(new Set(signatures).size).toBe(120);
  });
});

describe("Tieban V3 adaptive rectification", () => {
  it("asks one fact per clause, never repeats, and locks within 26 turns", () => {
    const session = runTarget(37);
    expect(session.answers.length).toBeGreaterThanOrEqual(12);
    expect(session.answers.length).toBeLessThanOrEqual(26);
    expect(new Set(session.askedClauseIds).size).toBe(session.askedClauseIds.length);
    expect(getLockedCandidate(session).index).toBe(37);
    expect(session.phase).toBe("locked");
  });

  it("recovers the target after one contradictory answer", () => {
    const session = runTarget(81, new Set([4]));
    expect(getLockedCandidate(session).index).toBe(81);
    expect(rankCandidates(session).slice(0, 3).some((item) => item.candidate.index === 81)).toBe(true);
  });

  it("is deterministic for the same intake and answer path", () => {
    const first = runTarget(19);
    const second = runTarget(19);
    expect(first.askedClauseIds).toEqual(second.askedClauseIds);
    expect(first.answers.map((record) => record.answer)).toEqual(second.answers.map((record) => record.answer));
    expect(first.lockedCandidateId).toBe(second.lockedCandidateId);
  });
});
