import { describe, expect, it } from "vitest";

import {
  answerTiebanClauseV4,
  buildBirthSeed,
  buildCandidateProfiles,
  createTiebanSessionV4,
  getLockedCandidateV4,
  TIEBAN_V4_MAX_TURNS
} from "@/lib/tieban-v4-engine";
import type { AtomicFact, TiebanClause, TiebanIntake } from "@/lib/tieban-v4-types";

const intake: TiebanIntake = {
  name: "试刻者",
  birthDate: "1988-06-18",
  birthShichen: 0,
  gender: "female",
  birthplace: "杭州"
};

const domains = ["family", "education_mobility", "career", "wealth", "relationship", "health", "law_social", "turning_point"] as const;

const facts: AtomicFact[] = Array.from({ length: 160 }, (_, index) => ({
  id: `v4-fact-${String(index + 1).padStart(3, "0")}`,
  domain: domains[index % domains.length],
  label: `旧事${index + 1}`,
  definition: `早岁第${index + 1}项经历有明确转折`,
  subject: index % 8 === 0 ? "parents" : index % 8 === 1 ? "siblings" : "self",
  earliestAge: 2 + index % 25,
  latestAge: 8 + index % 25,
  baseRate: 0.12 + (index % 8) * 0.055,
  salience: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5
}));

const clauses: TiebanClause[] = facts.map((fact, index) => ({
  id: `v4-clause-${String(index + 1).padStart(3, "0")}`,
  volume: Math.floor(index / 20) + 1,
  article: index + 1,
  displayCode: String(10001 + index),
  primaryFactId: fact.id,
  kind: "calibration",
  text: `命籍第${index + 1}条。`,
  interpretation: fact.definition,
  ambiguity: 0.08,
  sensitivity: 0.93,
  specificity: 0.95,
  sourceKind: "modern_composed",
  sourceNote: "V4测试码本"
}));

function runTarget(targetIndex: number, noisyTurns = new Set<number>()) {
  let session = createTiebanSessionV4(intake, clauses, facts, [], Date.UTC(2026, 6, 21));
  const targetProfile = session.profiles[targetIndex];
  while (!session.completedAt && session.answers.length < TIEBAN_V4_MAX_TURNS) {
    const clause = clauses.find((item) => item.id === session.currentClauseId)!;
    const factIndex = facts.findIndex((item) => item.id === clause.primaryFactId);
    const shouldResonate = targetProfile.factProbabilities[factIndex] >= 0.5;
    const intended = shouldResonate ? "resonates" as const : "not_resonates" as const;
    const answer = noisyTurns.has(session.answers.length)
      ? intended === "resonates" ? "not_resonates" as const : "resonates" as const
      : intended;
    session = answerTiebanClauseV4(session, answer, clauses, facts, Date.UTC(2026, 6, 21) + session.answers.length + 1);
  }
  return session;
}

function runPattern(answerAt: (turn: number) => "resonates" | "not_resonates" | "unclear") {
  let session = createTiebanSessionV4(intake, clauses, facts, [], Date.UTC(2026, 6, 21));
  while (!session.completedAt && session.answers.length < TIEBAN_V4_MAX_TURNS) {
    session = answerTiebanClauseV4(session, answerAt(session.answers.length), clauses, facts, Date.UTC(2026, 6, 21) + session.answers.length + 1);
  }
  return session;
}

describe("Tieban V4 birth-seeded candidate profiles", () => {
  it("uses every birth field and remains deterministic", () => {
    const base = buildBirthSeed(intake);
    expect(buildBirthSeed({ ...intake }).digest).toBe(base.digest);
    expect(buildBirthSeed({ ...intake, birthDate: "1988-06-19" }).digest).not.toBe(base.digest);
    expect(buildBirthSeed({ ...intake, birthShichen: 1 }).digest).not.toBe(base.digest);
    expect(buildBirthSeed({ ...intake, gender: "male" }).digest).not.toBe(base.digest);
    expect(buildBirthSeed({ ...intake, birthplace: "宁波" }).digest).not.toBe(base.digest);
  });

  it("pre-generates 120 distinct profiles before any answer", () => {
    const model = buildCandidateProfiles(intake, facts, [], Date.UTC(2026, 6, 21));
    expect(model.profiles).toHaveLength(120);
    expect(new Set(model.profiles.map((profile) => profile.profileCode)).size).toBe(120);
    expect(new Set(model.profiles.map((profile) => profile.factProbabilities.map((p) => p >= 0.5 ? "1" : "0").join(""))).size).toBe(120);
    expect(model.profiles.every((profile) => profile.coreFactIds.length >= 16)).toBe(true);
  });
});

describe("Tieban V4 rectification", () => {
  it("recovers an independently pre-generated target profile", () => {
    for (const target of [7, 37, 81, 113]) {
      const session = runTarget(target);
      expect(session.phase).toBe("locked");
      expect(getLockedCandidateV4(session).index).toBe(target);
      expect(session.answers.length).toBeGreaterThanOrEqual(12);
      expect(session.answers.length).toBeLessThanOrEqual(24);
    }
  });

  it("tolerates one contradictory answer and never creates a fact-answer store", () => {
    const session = runTarget(59, new Set([5]));
    expect(session.phase).toBe("locked");
    expect(getLockedCandidateV4(session).index).toBe(59);
    expect("factProbabilities" in session).toBe(false);
    expect(new Set(session.askedClauseIds).size).toBe(session.askedClauseIds.length);
  });

  it("is fully replayable for the same seed and answers", () => {
    const first = runTarget(25);
    const second = runTarget(25);
    expect(second.birthSeed).toEqual(first.birthSeed);
    expect(second.askedClauseIds).toEqual(first.askedClauseIds);
    expect(second.lockedCandidateId).toBe(first.lockedCandidateId);
  });

  it("never calls straight-line or mechanical alternating answers a valid lock", () => {
    for (const session of [
      runPattern(() => "resonates"),
      runPattern(() => "not_resonates"),
      runPattern(() => "unclear"),
      runPattern((turn) => turn % 2 ? "not_resonates" : "resonates")
    ]) {
      expect(session.phase).toBe("undetermined");
      expect(session.lockStrength).toBeNull();
      expect(session.undeterminedReason).toBe("posterior_not_converged");
    }
  });
});
