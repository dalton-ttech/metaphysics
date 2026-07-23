import { describe, expect, it } from "vitest";

import { V4_ATOMIC_FACTS, V4_CALIBRATION_CLAUSES, V4_CONSTRAINTS, V4_FATE_CLAUSES } from "@/lib/tieban-v4-content";
import { answerTiebanClauseV4, createTiebanSessionV4, getLockedCandidateV4, TIEBAN_V4_MAX_TURNS } from "@/lib/tieban-v4-engine";
import type { TiebanIntake, TiebanV4Session } from "@/lib/tieban-v4-types";

const intake: TiebanIntake = {
  name: "密封样本",
  birthDate: "1990-06-18",
  birthShichen: 0,
  gender: "unspecified",
  birthplace: "北京"
};

const base = createTiebanSessionV4(
  intake,
  V4_CALIBRATION_CLAUSES,
  V4_ATOMIC_FACTS,
  V4_FATE_CLAUSES,
  Date.UTC(2026, 6, 22),
  V4_CONSTRAINTS
);
const factIndexById = new Map(V4_ATOMIC_FACTS.map((fact, index) => [fact.id, index]));

function freshSession(): TiebanV4Session {
  return {
    ...base,
    candidateLogWeights: base.profiles.map((profile) => Math.log(profile.priorProbability)),
    answers: [],
    askedClauseIds: [...base.askedClauseIds],
    domainCoverage: {},
    positiveDomainCoverage: {},
    phase: "initial",
    completedAt: null,
    lockedCandidateId: null,
    lockStrength: null,
    undeterminedReason: null
  };
}

function runTarget(targetIndex: number, flipTurns = new Set<number>()) {
  let session = freshSession();
  const target = base.profiles[targetIndex];
  while (!session.completedAt && session.answers.length < TIEBAN_V4_MAX_TURNS) {
    const clause = V4_CALIBRATION_CLAUSES.find((item) => item.id === session.currentClauseId)!;
    const factIndex = factIndexById.get(clause.primaryFactId)!;
    const expected = target.factProbabilities[factIndex] >= 0.5 ? "resonates" as const : "not_resonates" as const;
    const answer = flipTurns.has(session.answers.length)
      ? expected === "resonates" ? "not_resonates" as const : "resonates" as const
      : expected;
    session = answerTiebanClauseV4(session, answer, V4_CALIBRATION_CLAUSES, V4_ATOMIC_FACTS, Date.UTC(2026, 6, 22) + session.answers.length + 1);
  }
  return session;
}

describe("V5 credibility simulation over the complete 120-minute codebook", () => {
  it("recovers the sealed target and rejects accidental exact-minute claims", { timeout: 120_000 }, () => {
    let exact = 0;
    let fourMinute = 0;
    let locked = 0;
    let totalTurns = 0;
    for (let target = 0; target < 120; target += 1) {
      const session = runTarget(target);
      totalTurns += session.answers.length;
      if (session.phase !== "locked") continue;
      locked += 1;
      const predicted = getLockedCandidateV4(session).index;
      if (predicted === target) exact += 1;
      if (Math.floor(predicted / 4) === Math.floor(target / 4)) fourMinute += 1;
    }
    const metrics = {
      sampleCount: 120,
      lockedRate: locked / 120,
      exactMinuteAccuracy: exact / 120,
      fourMinuteAccuracy: fourMinute / 120,
      averageTurns: totalTurns / 120
    };
    console.info("V5_SIMULATION", JSON.stringify(metrics));
    expect(metrics.lockedRate).toBeGreaterThanOrEqual(0.95);
    expect(metrics.exactMinuteAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(metrics.fourMinuteAccuracy).toBeGreaterThanOrEqual(0.96);
    expect(metrics.averageTurns).toBeGreaterThanOrEqual(14);
    expect(metrics.averageTurns).toBeLessThanOrEqual(24);
  });

  it("retains useful accuracy with one deterministic memory error", { timeout: 120_000 }, () => {
    const targets = Array.from({ length: 30 }, (_, index) => index * 4);
    let exact = 0;
    let fourMinute = 0;
    let locked = 0;
    for (const target of targets) {
      const session = runTarget(target, new Set([6]));
      if (session.phase !== "locked") continue;
      locked += 1;
      const predicted = getLockedCandidateV4(session).index;
      if (predicted === target) exact += 1;
      if (Math.floor(predicted / 4) === Math.floor(target / 4)) fourMinute += 1;
    }
    const metrics = {
      sampleCount: targets.length,
      lockedRate: locked / targets.length,
      exactMinuteAccuracy: exact / targets.length,
      fourMinuteAccuracy: fourMinute / targets.length
    };
    console.info("V5_NOISY_SIMULATION", JSON.stringify(metrics));
    expect(metrics.lockedRate).toBeGreaterThanOrEqual(0.7);
    expect(metrics.fourMinuteAccuracy).toBeGreaterThanOrEqual(0.7);
  });
});
