import { sha256 } from "./primitives.mjs";

const COPRIME_MULTIPLIERS = [1, 5, 7, 11, 13, 17];

function orderedEvents(events, round) {
  const multiplier = COPRIME_MULTIPLIERS[round % COPRIME_MULTIPLIERS.length];
  return Array.from({ length: events.length }, (_, index) => events[(index * multiplier + round * 11) % events.length]);
}

function frame(poolSize, cues) {
  const cleanCues = cues.map((cue) => String(cue).trim().replace(/[？?。！!；;：:]+$/u, ""));
  if (poolSize === 1) return `只校一件旧事：${cleanCues[0]}？若确曾发生，请答“是”。`;
  return `回看旧页：${cleanCues.join("；或")}。所列之事任中一项，请答“是”；全部没有才答“否”。`;
}

export function buildQuestionBank(events, { poolSizes = [1, 2, 3], rounds = 6 } = {}) {
  const questions = [];
  for (const poolSize of poolSizes) {
    for (let round = 0; round < rounds; round += 1) {
      const ordered = orderedEvents(events, round + poolSize);
      for (let start = 0; start + poolSize <= ordered.length; start += poolSize) {
        const members = ordered.slice(start, start + poolSize);
        questions.push({
          id: `p${poolSize}-r${round + 1}-q${Math.floor(start / poolSize) + 1}`,
          poolSize,
          round: round + 1,
          eventIds: members.map((event) => event.id),
          text: frame(poolSize, members.map((event) => event.cue ?? event.description ?? event.label)),
          plainRule: poolSize === 1 ? "这一件明确发生过答是，否则答否。" : `${poolSize}件事中任意一件发生过答是，全部没有才答否。`
        });
      }
    }
  }
  const ids = new Set(questions.map((question) => question.id));
  if (ids.size !== questions.length) throw new Error("Question ids must be unique.");
  return {
    version: "sealed-question-bank-v1.1",
    questions,
    hash: sha256(questions)
  };
}

export function questionsForPool(questionBank, poolSize) {
  return questionBank.questions.filter((question) => question.poolSize === poolSize);
}
