import { V4_ATOMIC_FACTS, V4_CALIBRATION_CLAUSES, V4_CONSTRAINTS, V4_FATE_CLAUSES } from "@/lib/tieban-v4-content";
import { answerTiebanClauseV4, createTiebanSessionV4, TIEBAN_V4_MAX_TURNS } from "@/lib/tieban-v4-engine";

const factIndexById = new Map(V4_ATOMIC_FACTS.map((fact, index) => [fact.id, index]));
let session = createTiebanSessionV4({
  name: "",
  birthDate: "1990-06-18",
  birthShichen: 0,
  gender: "unspecified",
  birthplace: ""
}, V4_CALIBRATION_CLAUSES, V4_ATOMIC_FACTS, V4_FATE_CLAUSES, Date.now(), V4_CONSTRAINTS);
const target = session.profiles[73];
const answers: string[] = [];

while (!session.completedAt && session.answers.length < TIEBAN_V4_MAX_TURNS) {
  const clause = V4_CALIBRATION_CLAUSES.find((item) => item.id === session.currentClauseId)!;
  const factIndex = factIndexById.get(clause.primaryFactId)!;
  const answer = target.factProbabilities[factIndex] >= 0.5 ? "resonates" as const : "not_resonates" as const;
  answers.push(answer === "resonates" ? "应" : "不应");
  session = answerTiebanClauseV4(session, answer, V4_CALIBRATION_CLAUSES, V4_ATOMIC_FACTS);
}

console.info(JSON.stringify({ phase: session.phase, lockedCandidateId: session.lockedCandidateId, answers }, null, 2));
