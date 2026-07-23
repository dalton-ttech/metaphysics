import calibrationData from "../../data/v3/calibration-clauses.json";
import factData from "../../data/v3/facts.json";
import fateData from "../../data/v3/fate-clauses.json";

import { EVENT_BY_ID } from "@/lib/events";
import type { EventDomain } from "@/lib/types";
import type { AtomicFact, TiebanClause } from "@/lib/tieban-v3-types";

interface RawFact {
  id: string;
  legacyEventId: string;
  domain: EventDomain;
  label: string;
  subject: string;
  predicate: string;
  timeWindow: { minAge: number; maxAge: number | null; label: string };
  sensitivity: "ordinary" | "private" | "intense";
  status: string;
}

interface RawCalibrationClause {
  id: string;
  volumeId: string;
  clauseNumber: number;
  displayNumber: string;
  clauseText: string;
  interpretation: string;
  primaryFactId: string;
  ambiguity: { score: number };
  status: string;
  source: { label: string; provenance: string };
}

interface RawFateClause extends RawCalibrationClause {
  category: "命局" | "前运" | "后运";
}

function subjectFor(raw: RawFact): AtomicFact["subject"] {
  if (raw.subject.includes("伴侣")) return "partner";
  if (raw.subject.includes("家")) return "family";
  if (raw.legacyEventId.includes("sibling")) return "siblings";
  if (raw.legacyEventId.includes("parent")) return "parents";
  if (raw.legacyEventId.includes("child")) return "children";
  return "self";
}

function volumeNumber(volumeId: string) {
  const match = /(\d+)$/.exec(volumeId);
  return match ? Number(match[1]) : 1;
}

function responseQuality(ambiguity: number, sensitivity: RawFact["sensitivity"] | undefined) {
  const sensitivityPenalty = sensitivity === "intense" ? 0.04 : sensitivity === "private" ? 0.02 : 0;
  return {
    sensitivity: Math.max(0.78, 0.96 - ambiguity * 0.22 - sensitivityPenalty),
    specificity: Math.max(0.82, 0.975 - ambiguity * 0.18 - sensitivityPenalty / 2)
  };
}

const rawFacts = (factData.facts as RawFact[]).filter((fact) => fact.status === "active");
const rawFactById = Object.fromEntries(rawFacts.map((fact) => [fact.id, fact]));

export const V3_ATOMIC_FACTS: AtomicFact[] = rawFacts.map((fact) => {
  const legacy = EVENT_BY_ID[fact.legacyEventId];
  return {
    id: fact.id,
    domain: fact.domain,
    label: fact.label,
    definition: `${fact.timeWindow.label}，${fact.predicate}。`,
    subject: subjectFor(fact),
    earliestAge: fact.timeWindow.minAge,
    latestAge: fact.timeWindow.maxAge,
    baseRate: legacy?.baseRate ?? 0.18,
    salience: legacy?.salience ?? 3
  };
});

export const V3_CALIBRATION_CLAUSES: TiebanClause[] = (calibrationData.clauses as RawCalibrationClause[])
  .filter((clause) => clause.status === "active" && rawFactById[clause.primaryFactId])
  .map((clause) => {
    const rawFact = rawFactById[clause.primaryFactId];
    const quality = responseQuality(clause.ambiguity.score, rawFact?.sensitivity);
    return {
      id: clause.id,
      volume: volumeNumber(clause.volumeId),
      article: clause.clauseNumber,
      displayCode: clause.displayNumber,
      primaryFactId: clause.primaryFactId,
      kind: "calibration",
      text: `${clause.clauseText.replace(/[。；，]$/u, "")}。`,
      interpretation: clause.interpretation,
      ambiguity: clause.ambiguity.score,
      sensitivity: quality.sensitivity,
      specificity: quality.specificity,
      sourceKind: "modern_fabricated",
      sourceNote: `${clause.source.label}；${clause.source.provenance}`
    };
  });

export const V3_FATE_CLAUSES: TiebanClause[] = (fateData.clauses as RawFateClause[])
  .filter((clause) => clause.status === "active" && rawFactById[clause.primaryFactId])
  .map((clause) => {
    const rawFact = rawFactById[clause.primaryFactId];
    const quality = responseQuality(clause.ambiguity.score, rawFact?.sensitivity);
    return {
      id: clause.id,
      volume: volumeNumber(clause.volumeId),
      article: clause.clauseNumber,
      displayCode: clause.displayNumber,
      primaryFactId: clause.primaryFactId,
      kind: clause.category === "后运" ? "future" : clause.category === "前运" ? "past" : "present",
      text: `${clause.clauseText.replace(/[。；，]$/u, "")}。`,
      interpretation: clause.interpretation,
      ambiguity: clause.ambiguity.score,
      sensitivity: quality.sensitivity,
      specificity: quality.specificity,
      sourceKind: "modern_fabricated",
      sourceNote: `${clause.source.label}；${clause.source.provenance}`
    };
  });
