import { describe, expect, it } from "vitest";

import { V4_ATOMIC_FACTS, V4_CALIBRATION_CLAUSES, V4_CONSTRAINTS, V4_FATE_CLAUSES } from "@/lib/tieban-v4-content";
import {
  answerTiebanClauseV4,
  createTiebanSessionV4,
  evidenceWeightV4,
  factApplicabilityV4,
  rankCandidatesV4,
  resolvedExclusiveGroupV4
} from "@/lib/tieban-v4-engine";
import type { TiebanIntake, TiebanV4AnswerRecord, TiebanV4Session } from "@/lib/tieban-v4-types";

const intake: TiebanIntake = {
  name: "条件验局者",
  birthDate: "1990-01-01",
  birthShichen: 0,
  gender: "unspecified",
  birthplace: "北京"
};

const now = Date.UTC(2026, 6, 22);

function baseSession() {
  return createTiebanSessionV4(
    intake,
    V4_CALIBRATION_CLAUSES,
    V4_ATOMIC_FACTS,
    V4_FATE_CLAUSES,
    now,
    V4_CONSTRAINTS
  );
}

function answerRecord(factId: string, answer: TiebanV4AnswerRecord["answer"] = "resonates"): TiebanV4AnswerRecord {
  return {
    clauseId: `test:${factId}`,
    factId,
    answer,
    answeredAt: now,
    testedCandidateId: "C001",
    topCandidateBefore: "C001",
    topCandidateAfter: "C001",
    topProbabilityAfter: 0,
    fourMinuteProbabilityAfter: 0,
    evidenceWeight: answer === "unclear" ? 0 : 1
  };
}

function withAnswers(...answers: TiebanV4AnswerRecord[]): TiebanV4Session {
  return { ...baseSession(), answers };
}

function fact(id: string) {
  const found = V4_ATOMIC_FACTS.find((item) => item.id === id);
  if (!found) throw new Error(`missing test fact ${id}`);
  return found;
}

describe("Tieban V4 conditional applicability", () => {
  it("cascades no-sibling evidence into internal not-applicable state", () => {
    const session = withAnswers(answerRecord("fact.v4.axis.siblings_count.0"));
    const dependentFacts = [
      "fact.v4.axis.sibling_relation_context.co_resident",
      "fact.v4.axis.sibling_care.no",
      "fact.v4.axis.sibling_financial_support.no",
      "fact.v4.axis.sibling_guardianship.no",
      "fact.v3.fam_sibling_duty.3",
      "fact.v3.fam_sibling_separation.3"
    ];
    for (const factId of dependentFacts) {
      const result = factApplicabilityV4(session, fact(factId), V4_ATOMIC_FACTS, 36);
      expect(result.status, factId).toBe("not_applicable");
      expect(result.reason, factId).toBe("required_context_mismatch");
    }
  });

  it("defers responsibility until both sibling existence and contact context are resolved", () => {
    const duty = fact("fact.v4.axis.sibling_care.no");
    const unresolved = factApplicabilityV4(baseSession(), duty, V4_ATOMIC_FACTS, 36);
    expect(unresolved.status).toBe("deferred");
    expect(unresolved.contextGroupId).toBe("mx.siblings_count");

    const countResolved = withAnswers(answerRecord("fact.v4.axis.siblings_count.1"));
    const waitingForContext = factApplicabilityV4(countResolved, duty, V4_ATOMIC_FACTS, 36);
    expect(waitingForContext.status).toBe("deferred");
    expect(waitingForContext.contextGroupId).toBe("mx.sibling_relation_context");

    const ready = withAnswers(
      answerRecord("fact.v4.axis.siblings_count.1"),
      answerRecord("fact.v4.axis.sibling_relation_context.co_resident")
    );
    expect(factApplicabilityV4(ready, duty, V4_ATOMIC_FACTS, 36).status).toBe("eligible");
  });

  it("downweights broad no-duty evidence when real contact opportunity was weak", () => {
    const duty = fact("fact.v4.axis.sibling_care.no");
    const coResident = withAnswers(
      answerRecord("fact.v4.axis.siblings_count.1"),
      answerRecord("fact.v4.axis.sibling_relation_context.co_resident")
    );
    const estranged = withAnswers(
      answerRecord("fact.v4.axis.siblings_count.1"),
      answerRecord("fact.v4.axis.sibling_relation_context.estranged")
    );
    const unavailable = withAnswers(
      answerRecord("fact.v4.axis.siblings_count.1"),
      answerRecord("fact.v4.axis.sibling_relation_context.unavailable")
    );
    expect(evidenceWeightV4(coResident, duty, "resonates", V4_ATOMIC_FACTS)).toBe(1);
    expect(evidenceWeightV4(estranged, duty, "resonates", V4_ATOMIC_FACTS)).toBe(0.4);
    expect(evidenceWeightV4(unavailable, duty, "resonates", V4_ATOMIC_FACTS)).toBe(0.28);
  });

  it("models care, financial support, and substitute-parent guardianship as three coexisting dimensions", () => {
    for (const groupId of ["mx.sibling_care", "mx.sibling_financial_support", "mx.sibling_guardianship"]) {
      const group = V4_ATOMIC_FACTS.filter((item) => item.mutualExclusionGroup === groupId);
      expect(group).toHaveLength(2);
      expect(group.map((item) => item.id)).toEqual([
        `fact.v4.axis.${groupId.slice(3)}.no`,
        `fact.v4.axis.${groupId.slice(3)}.yes`
      ]);
    }

    const session = withAnswers(
      answerRecord("fact.v4.axis.sibling_care.yes"),
      answerRecord("fact.v4.axis.sibling_financial_support.yes"),
      answerRecord("fact.v4.axis.sibling_guardianship.yes")
    );
    expect(resolvedExclusiveGroupV4(session, V4_ATOMIC_FACTS, "mx.sibling_care")).toBe("fact.v4.axis.sibling_care.yes");
    expect(resolvedExclusiveGroupV4(session, V4_ATOMIC_FACTS, "mx.sibling_financial_support")).toBe("fact.v4.axis.sibling_financial_support.yes");
    expect(resolvedExclusiveGroupV4(session, V4_ATOMIC_FACTS, "mx.sibling_guardianship")).toBe("fact.v4.axis.sibling_guardianship.yes");
  });

  it("keeps the redundant only-child rank as a derived book fact instead of another question", () => {
    const session = withAnswers(answerRecord("fact.v4.axis.siblings_count.0"));
    const result = factApplicabilityV4(session, fact("fact.v4.axis.birth_order.only"), V4_ATOMIC_FACTS, 36);
    expect(result).toEqual({ status: "not_applicable", reason: "derived_fact" });
  });

  it("resolves an exclusive group after one affirmative answer or all-but-one rejection", () => {
    const affirmative = withAnswers(answerRecord("fact.v4.axis.siblings_count.2"));
    expect(resolvedExclusiveGroupV4(affirmative, V4_ATOMIC_FACTS, "mx.siblings_count"))
      .toBe("fact.v4.axis.siblings_count.2");

    const inferred = withAnswers(
      answerRecord("fact.v4.axis.siblings_count.0", "not_resonates"),
      answerRecord("fact.v4.axis.siblings_count.1", "not_resonates"),
      answerRecord("fact.v4.axis.siblings_count.2", "not_resonates")
    );
    expect(resolvedExclusiveGroupV4(inferred, V4_ATOMIC_FACTS, "mx.siblings_count"))
      .toBe("fact.v4.axis.siblings_count.3p");
  });
});

describe("Tieban V4 unknown evidence", () => {
  it("records unclear without changing posterior, ranking, or coverage", () => {
    const before = baseSession();
    const beforeWeights = [...before.candidateLogWeights];
    const beforeRanking = rankCandidatesV4(before).map((item) => [item.candidate.id, item.probability]);
    const after = answerTiebanClauseV4(before, "unclear", V4_CALIBRATION_CLAUSES, V4_ATOMIC_FACTS, now + 1);
    expect(after.candidateLogWeights).toEqual(beforeWeights);
    expect(rankCandidatesV4(after).map((item) => [item.candidate.id, item.probability])).toEqual(beforeRanking);
    expect(after.domainCoverage).toEqual(before.domainCoverage);
    expect(after.positiveDomainCoverage).toEqual(before.positiveDomainCoverage);
    expect(after.answers.at(-1)?.evidenceWeight).toBe(0);
  });
});
