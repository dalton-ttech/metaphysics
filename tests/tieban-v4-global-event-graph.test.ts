import { describe, expect, it } from "vitest";

import { V4_ATOMIC_FACTS, V4_CALIBRATION_CLAUSES, V4_CONSTRAINTS, V4_FATE_CLAUSES } from "@/lib/tieban-v4-content";
import { createTiebanSessionV4, factApplicabilityV4 } from "@/lib/tieban-v4-engine";
import type { AtomicFact, TiebanIntake, TiebanV4AnswerRecord, TiebanV4Session } from "@/lib/tieban-v4-types";

const now = Date.UTC(2026, 6, 22);
const intake: TiebanIntake = {
  name: "全域条件验局者",
  birthDate: "1966-01-01",
  birthShichen: 0,
  gender: "unspecified",
  birthplace: "北京"
};

let cachedBaseSession: TiebanV4Session | null = null;

function baseSession() {
  cachedBaseSession ??= createTiebanSessionV4(
    intake,
    V4_CALIBRATION_CLAUSES,
    V4_ATOMIC_FACTS,
    V4_FATE_CLAUSES,
    now,
    V4_CONSTRAINTS
  );
  return cachedBaseSession;
}

function answerRecord(factId: string): TiebanV4AnswerRecord {
  return {
    clauseId: `test:${factId}`,
    factId,
    answer: "resonates",
    answeredAt: now,
    testedCandidateId: "C001",
    topCandidateBefore: "C001",
    topCandidateAfter: "C001",
    topProbabilityAfter: 0,
    fourMinuteProbabilityAfter: 0,
    evidenceWeight: 1
  };
}

function withResolved(factId: string): TiebanV4Session {
  return { ...baseSession(), answers: [answerRecord(factId)] };
}

function legacyFact(eventId: string, latestAge: number): AtomicFact {
  const found = V4_ATOMIC_FACTS.find((item) => item.semanticFamily === eventId && item.latestAge === latestAge);
  if (!found) throw new Error(`missing legacy fact ${eventId}@${latestAge}`);
  return found;
}

function status(axisFactId: string, eventId: string, latestAge: number) {
  return factApplicabilityV4(
    withResolved(axisFactId),
    legacyFact(eventId, latestAge),
    V4_ATOMIC_FACTS,
    60
  );
}

describe("Tieban V4.2 global event graph", () => {
  it.each([
    ["fact.v4.axis.caregiving_duration.none", "fam_caregiving", 27, "mx.caregiving_duration"],
    ["fact.v4.axis.caregiving_duration.none", "turn_care_identity", 21, "mx.caregiving_duration"],
    ["fact.v4.axis.first_close_loss.none", "fam_elder_loss", 27, "mx.first_close_loss"],
    ["fact.v4.axis.first_close_loss.none", "turn_close_death", 21, "mx.first_close_loss"],
    ["fact.v4.axis.marriage_count.0", "rel_marriage", 39, "mx.marriage_count"],
    ["fact.v4.axis.marriage_count.0", "rel_divorce", 33, "mx.marriage_count"],
    ["fact.v4.axis.major_relationship_count.1", "rel_remarriage", 39, "mx.major_relationship_count"],
    ["fact.v4.axis.major_relationship_count.0", "rel_long_distance", 39, "mx.major_relationship_count"],
    ["fact.v4.axis.children_count.0", "turn_child_arrival", 39, "mx.children_count"],
    ["fact.v4.axis.career_switch_count.0", "career_switch", 39, "mx.career_switch_count"],
    ["fact.v4.axis.leadership_level.none", "career_leadership", 30, "mx.leadership_level"],
    ["fact.v4.axis.entrepreneurship_count.0", "career_entrepreneurship", 39, "mx.entrepreneurship_count"],
    ["fact.v4.axis.job_interruption_count.0", "career_job_loss", 39, "mx.job_interruption_count"],
    ["fact.v4.axis.wealth_shock.none", "wealth_bankruptcy", 32, "mx.wealth_shock"],
    ["fact.v4.axis.wealth_shock.none", "wealth_debt", 32, "mx.wealth_shock"],
    ["fact.v4.axis.accident_count.0", "health_accident", 39, "mx.accident_count"],
    ["fact.v4.axis.accident_count.0", "health_traffic", 39, "mx.accident_count"],
    ["fact.v4.axis.accident_count.0", "health_fracture", 39, "mx.accident_count"],
    ["fact.v4.axis.accident_count.0", "health_head_face", 39, "mx.accident_count"],
    ["fact.v4.axis.first_leave_hometown.never", "move_left_hometown", 25, "mx.first_leave_hometown"],
    ["fact.v4.axis.first_leave_hometown.never", "turn_return_home", 21, "mx.first_leave_hometown"],
    ["fact.v4.axis.overseas_duration.none", "move_overseas", 25, "mx.overseas_duration"],
    ["fact.v4.axis.family_moves_18.0", "move_repeated", 18, "mx.family_moves_18"]
  ])("suppresses impossible %s -> %s@%i", (axisFactId, eventId, latestAge, expectedGroup) => {
    const result = status(axisFactId, eventId, latestAge);
    expect(result.status).toBe("not_applicable");
    expect(result.reason).toBe("excluded_context");
    expect(result.contextGroupId).toBe(expectedGroup);
  });

  it("uses the career entry window without suppressing a window that can contain the entry age", () => {
    expect(status("fact.v4.axis.career_entry_age.27p", "career_job_loss", 24).status).toBe("not_applicable");
    expect(status("fact.v4.axis.career_entry_age.27p", "career_job_loss", 30).status).toBe("eligible");
    expect(status("fact.v4.axis.career_entry_age.23_26", "career_leadership", 19).status).toBe("not_applicable");
    expect(status("fact.v4.axis.career_entry_age.23_26", "career_leadership", 24).status).toBe("eligible");
  });

  it.each([
    ["fact.v4.axis.major_relationship_count.0", "rel_betrayal", 39],
    ["fact.v4.axis.major_relationship_count.0", "rel_formative_love", 39],
    ["fact.v4.axis.property_count.0", "wealth_property", 42],
    ["fact.v4.axis.wealth_shock.none", "wealth_investment_loss", 32],
    ["fact.v4.axis.accident_count.0", "health_fire_burn", 39],
    ["fact.v4.axis.accident_count.0", "health_water_hazard", 39],
    ["fact.v4.axis.entrepreneurship_count.0", "career_business_failure", 39],
    ["fact.v4.axis.legal_dispute_count.0", "law_dispute", 42],
    ["fact.v4.axis.restart_count.0", "turn_restart", 30]
  ])("does not overreach from %s into %s@%i", (axisFactId, eventId, latestAge) => {
    expect(status(axisFactId, eventId, latestAge).status).toBe("eligible");
  });

  it("keeps exclusion-gated facts eligible while the upstream axis is unresolved", () => {
    const session = baseSession();
    for (const [eventId, latestAge] of [
      ["rel_marriage", 39],
      ["career_switch", 39],
      ["wealth_debt", 32],
      ["health_accident", 39],
      ["move_overseas", 25]
    ] as const) {
      expect(factApplicabilityV4(session, legacyFact(eventId, latestAge), V4_ATOMIC_FACTS, 60).status).toBe("eligible");
    }
  });

  it("keeps required sibling context deferred rather than guessing", () => {
    const result = factApplicabilityV4(baseSession(), legacyFact("fam_sibling_duty", 27), V4_ATOMIC_FACTS, 60);
    expect(result.status).toBe("deferred");
    expect(result.contextGroupId).toBe("mx.siblings_count");
  });

  it("does not apply a bounded rule to a window extending beyond its observation horizon", () => {
    expect(status("fact.v4.axis.marriage_count.0", "rel_divorce", 42).status).toBe("eligible");
    expect(status("fact.v4.axis.wealth_shock.none", "wealth_debt", 42).status).toBe("eligible");
    expect(status("fact.v4.axis.accident_count.0", "health_accident", 55).status).toBe("eligible");
  });
});
