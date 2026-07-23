import { sha256 } from "../../sealed-synthetic-v1/oracle/primitives.mjs";
import { DIRECT_CUE_VARIANTS, RARE_CROSSCHECK_PAIRS } from "../config/generator-config.v2.mjs";

const COPRIME_MULTIPLIERS = [1, 5, 7, 11, 13, 17];

function orderedEvents(events, round) {
  const multiplier = COPRIME_MULTIPLIERS[round % COPRIME_MULTIPLIERS.length];
  return Array.from({ length: events.length }, (_, index) => events[(index * multiplier + round * 11) % events.length]);
}

function trimCue(cue) {
  return String(cue).trim().replace(/[，。！？；：,.!?;:]+$/u, "");
}

function broadFrame(cues) {
  const count = cues.length === 2 ? "两件" : cues.length === 3 ? "三件" : `${cues.length}件`;
  return `旧页交叠，请按事实作答：${cues.map(trimCue).join("；或")}。${count}事中任一项明确发生过，请答“是”；全部没有才答“否”。`;
}

function directFrame(cue) {
  const text = String(cue).trim();
  return `${text}${/[？?]$/u.test(text) ? "" : "？"}明确发生答“是”，没有发生答“否”；记不清可答“不确定”。`;
}

export function buildV2QuestionBank(events, { broadRounds = 6 } = {}) {
  const questions = [];
  const coverageOrder = orderedEvents(events, 19);
  for (let start = 0; start + 3 <= coverageOrder.length; start += 3) {
    const members = coverageOrder.slice(start, start + 3);
    questions.push({
      id: `v2-c3-q${Math.floor(start / 3) + 1}`,
      kind: "coverage",
      poolSize: 3,
      armPoolSize: 2,
      round: 0,
      eventIds: members.map((event) => event.id),
      text: broadFrame(members.map((event) => event.cue ?? event.description ?? event.label)),
      plainRule: "三件事中任意一件明确发生过答是，全部没有答否。",
      clarityBoost: 0.01,
      sensitivityRelief: 0
    });
  }
  for (let round = 0; round < broadRounds; round += 1) {
    const ordered = orderedEvents(events, round + 2);
    for (let start = 0; start + 2 <= ordered.length; start += 2) {
      const members = ordered.slice(start, start + 2);
      questions.push({
        id: `v2-b2-r${round + 1}-q${Math.floor(start / 2) + 1}`,
        kind: "broad",
        poolSize: 2,
        armPoolSize: 2,
        round: round + 1,
        eventIds: members.map((event) => event.id),
        text: broadFrame(members.map((event) => event.cue ?? event.description ?? event.label)),
        plainRule: "两件事中任意一件明确发生过答是，全部没有答否。",
        clarityBoost: 0.015,
        sensitivityRelief: 0
      });
    }
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  RARE_CROSSCHECK_PAIRS.forEach((eventIds, index) => {
    const members = eventIds.map((eventId) => eventById.get(eventId));
    if (members.some((event) => !event)) throw new Error(`Unknown rare crosscheck event in pair ${index + 1}.`);
    questions.push({
      id: `v2-x2-rare-${index + 1}`,
      kind: "rare_crosscheck",
      poolSize: 2,
      armPoolSize: 2,
      round: 0,
      eventIds,
      text: broadFrame(members.map((event) => event.cue ?? event.description ?? event.label)),
      plainRule: `${eventIds.length}件低频事件中任意一件明确发生过答是，全部没有答否。`,
      clarityBoost: 0.035,
      sensitivityRelief: 0.02,
      socialLanguageDerived: true
    });
  });

  for (const event of events) {
    const variants = DIRECT_CUE_VARIANTS[event.id] ?? [event.cue ?? event.description ?? event.label];
    variants.forEach((cue, index) => {
      questions.push({
        id: `v2-d1-${event.id}-${index + 1}`,
        kind: "verification",
        verification: true,
        poolSize: 1,
        armPoolSize: 2,
        round: index + 1,
        eventIds: [event.id],
        text: directFrame(cue),
        plainRule: "只核验一个有可观察边界的事件；明确发生答是，没有答否。",
        clarityBoost: 0.08,
        sensitivityRelief: 0.035,
        socialLanguageDerived: Object.hasOwn(DIRECT_CUE_VARIANTS, event.id)
      });
    });
  }

  const ids = new Set(questions.map((question) => question.id));
  if (ids.size !== questions.length) throw new Error("Question ids must be unique.");
  return {
    version: "sealed-question-bank-v2.2",
    screeningEventsPerQuestion: 2,
    coverageEventsPerQuestion: 3,
    rareCrosscheckEventsPerQuestion: [2, 3],
    verificationEventsPerQuestion: 1,
    questions,
    hash: sha256(questions)
  };
}
