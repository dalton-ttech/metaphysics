import { describe, expect, it } from "vitest";

import { buildCandidateStates, createTiebanSession } from "@/lib/tieban-v3-engine";
import { articleLabel, keLabel, ritualNumberCells, shichenLabel, volumeLabel } from "@/lib/tieban-v3-ritual";
import type { AtomicFact, TiebanClause, TiebanIntake } from "@/lib/tieban-v3-types";

const fact: AtomicFact = {
  id: "family-sibling-count-three",
  domain: "family",
  label: "手足三人",
  definition: "亲生兄弟姐妹总数为三人。",
  subject: "siblings",
  earliestAge: 4,
  latestAge: null,
  baseRate: 0.18,
  salience: 5
};

const clause: TiebanClause = {
  id: "v01-a0001",
  volume: 1,
  article: 1,
  displayCode: "10527",
  primaryFactId: fact.id,
  kind: "calibration",
  text: "兄弟三人，数注前定。",
  interpretation: fact.definition,
  ambiguity: 0.05,
  sensitivity: 0.94,
  specificity: 0.97,
  sourceKind: "modern_composed",
  sourceNote: "现代拟制"
};

const intake: TiebanIntake = {
  name: "",
  birthDate: "1990-01-01",
  birthShichen: 0,
  gender: "unspecified",
  birthplace: ""
};

describe("Tieban V3 ritual projection", () => {
  it("maps a shichen to eight ke and readable exact time", () => {
    const candidates = buildCandidateStates(0);
    expect(candidates[0].clockTime).toBe("23:00");
    expect(candidates[119].clockTime).toBe("00:59");
    expect(keLabel(candidates[0])).toBe("初刻正");
    expect(keLabel(candidates[119])).toBe("八刻14分");
    expect(shichenLabel(0)).toBe("子时");
  });

  it("keeps traditional display labels deterministic", () => {
    const session = createTiebanSession(intake, [clause], [fact], 1);
    expect(volumeLabel(clause.volume)).toBe("第一卷");
    expect(articleLabel(clause.article)).toBe("第一条");
    expect(ritualNumberCells(clause, session)).toEqual(ritualNumberCells(clause, session));
    expect(ritualNumberCells(clause, session)).toHaveLength(8);
  });
});
