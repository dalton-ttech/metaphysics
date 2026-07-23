import { describe, expect, it } from "vitest";

import { buildTiebanBook, TIEBAN_MIN_PAST_NODES } from "@/lib/tieban-v3-book";
import { V3_ATOMIC_FACTS, V3_CALIBRATION_CLAUSES, V3_FATE_CLAUSES } from "@/lib/tieban-v3-content";
import {
  answerTiebanClause,
  candidateClauseSignal,
  createTiebanSession,
  getLockedCandidate,
  TIEBAN_MAX_TURNS,
  TIEBAN_MIN_TURNS
} from "@/lib/tieban-v3-engine";

const intake = {
  name: "密封模拟命主",
  birthDate: "1965-05-18",
  birthShichen: 0,
  gender: "unspecified" as const,
  birthplace: ""
};

function runCandidate(targetIndex: number, forcedErrorAt: number | null = null) {
  let session = createTiebanSession(intake, V3_CALIBRATION_CLAUSES, V3_ATOMIC_FACTS, 1_784_566_800_000);

  while (!session.completedAt && session.currentClauseId && session.answers.length < TIEBAN_MAX_TURNS) {
    const signal = candidateClauseSignal(targetIndex, session.currentClauseId);
    const truth = signal ? "resonates" : "not_resonates";
    const answer = session.answers.length === forcedErrorAt
      ? truth === "resonates" ? "not_resonates" : "resonates"
      : truth;
    session = answerTiebanClause(
      session,
      answer,
      V3_CALIBRATION_CLAUSES,
      V3_ATOMIC_FACTS,
      1_784_566_800_001 + session.answers.length
    );
  }

  const book = buildTiebanBook(session, V3_ATOMIC_FACTS, V3_CALIBRATION_CLAUSES, V3_FATE_CLAUSES);
  return {
    correct: getLockedCandidate(session).index === targetIndex,
    rounds: session.answers.length,
    pastNodes: book.pastNodes.length,
    futureNodes: book.futureNodes.length
  };
}

describe("Tieban V3 production-path simulation", () => {
  for (let batch = 0; batch < 4; batch += 1) {
    it(`recovers production codewords ${batch * 30 + 1}-${batch * 30 + 30} and produces evidence-backed books`, () => {
      const outcomes = Array.from({ length: 30 }, (_, offset) => runCandidate(batch * 30 + offset));
      const correct = outcomes.filter((outcome) => outcome.correct).length;

      expect(correct).toBe(30);
      expect(outcomes.every((outcome) => outcome.rounds >= TIEBAN_MIN_TURNS && outcome.rounds <= TIEBAN_MAX_TURNS)).toBe(true);
      expect(outcomes.every((outcome) => outcome.pastNodes >= TIEBAN_MIN_PAST_NODES)).toBe(true);
      expect(outcomes.every((outcome) => outcome.futureNodes >= 1)).toBe(true);
    }, 60_000);
  }

  it("remains recoverable when one deterministic answer is wrong", () => {
    const sampledCandidateIndexes = Array.from({ length: 40 }, (_, index) => index * 3);
    const outcomes = sampledCandidateIndexes.map((index) => runCandidate(index, 3));
    const correct = outcomes.filter((outcome) => outcome.correct).length;

    expect(correct / outcomes.length).toBeGreaterThanOrEqual(0.9);
    expect(outcomes.every((outcome) => outcome.rounds <= TIEBAN_MAX_TURNS)).toBe(true);
  }, 60_000);
});
