import { rankCandidatesV4, stableHashV4 } from "@/lib/tieban-v4-engine";
import type { RitualTrace, TiebanClause, TiebanV4Session } from "@/lib/tieban-v4-types";
import { SHICHEN } from "@/lib/tieban-v3-ritual";

export function buildRitualTraceV4(session: TiebanV4Session, clause: TiebanClause): RitualTrace {
  const ranking = rankCandidatesV4(session);
  const testedCandidateId = session.currentTestedCandidateId ?? ranking[0]?.candidate.id ?? session.candidates[0].id;
  const profile = session.profiles.find((item) => item.id === testedCandidateId) ?? session.profiles[0];
  const birthNumber = String(session.birthSeed.ritualBase).padStart(5, "0");
  const candidateNumber = String(profile.ritualBase).padStart(5, "0");
  const clauseNumber = String(clause.displayCode || 10000 + stableHashV4(clause.id) % 2000).padStart(5, "0");
  return {
    birthNumber,
    candidateNumber,
    clauseNumber,
    volume: clause.volume,
    article: clause.article,
    testedCandidateId
  };
}

export function ritualNumberCellsV4(session: TiebanV4Session, clause: TiebanClause) {
  const trace = buildRitualTraceV4(session, clause);
  const source = `${trace.birthNumber}${trace.candidateNumber}${trace.clauseNumber}`;
  const offset = session.answers.length % source.length;
  return Array.from({ length: 8 }, (_, index) => {
    const digit = source[(index + offset) % source.length];
    return {
      stem: SHICHEN[(index + session.intake.birthShichen) % SHICHEN.length],
      digit,
      active: index === session.answers.length % 8
    };
  });
}

export function ritualStatusCopyV4(session: TiebanV4Session) {
  if (session.phase === "initial") return "亲印未落";
  if (session.phase === "recalculate") return "旧事入数";
  if (session.phase === "narrowing") return "两刻相持";
  if (session.phase === "verification") return "旁证待合";
  if (session.phase === "undetermined") return "诸数未归";
  return "八刻归一";
}
