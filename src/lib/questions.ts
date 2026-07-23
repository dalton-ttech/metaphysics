import { EVENT_BY_ID, LIFE_EVENTS } from "@/lib/events";
import type { LifeEvent, Question } from "@/lib/types";

const RARE_CROSSCHECK_GROUPS = [
  ["law_crime_contact", "law_dispute"],
  ["wealth_bankruptcy", "turn_inheritance"],
  ["move_overseas", "social_reputation_crisis", "fam_sibling_duty"],
  ["rel_divorce", "rel_betrayal", "turn_spiritual"]
];

const REPEATED_VERIFICATION_CUES: Record<string, string[]> = {
  rel_formative_love: [
    "旧情成印，只核影响：你较早经历的一段感情，是否在结束或延续之后仍长期影响你的选择与亲密关系？",
    "不问普通恋爱，只问一段早年的深刻关系：它是否多年以后仍改变你看待承诺、信任或伴侣的方式？"
  ],
  edu_exam_turn: [
    "一纸定途，只核结果：是否有一次关键考试、落榜或录取，实质改变了你后来的学校、城市或职业道路？",
    "回看求学路，是否有一个明确的考试或录取结果，让原本计划的方向从此改道？"
  ]
};

function eventOrder(round: number, multiplier: number) {
  const count = LIFE_EVENTS.length;
  return Array.from({ length: count }, (_, index) => LIFE_EVENTS[(index * multiplier + round * 11) % count]);
}

function countWord(count: number) {
  if (count === 1) return "一件";
  if (count === 2) return "两件";
  if (count === 3) return "三件";
  return `${count}件`;
}

function groupedText(events: LifeEvent[], opening: string) {
  return `${opening}：${events.map((event) => event.cue.replace(/[。？]$/u, "")).join("；或")}。${countWord(events.length)}事中任一项明确发生过，请答“是”；全部没有才答“否”。`;
}

function buildCoverageQuestions(): Question[] {
  const ordered = eventOrder(19, 5);
  const questions: Question[] = [];
  for (let start = 0; start < ordered.length; start += 3) {
    const events = ordered.slice(start, start + 3);
    questions.push({
      id: `coverage-${Math.floor(start / 3) + 1}`,
      phase: "screen",
      eventIds: events.map((event) => event.id),
      text: groupedText(events, "旧页交叠，请按事实作答"),
      plainRule: "三件事中至少一件真实发生过答“是”；全部没有答“否”。",
      styleVariant: Math.floor(start / 3) % 4
    });
  }
  return questions;
}

function buildRareCrosschecks(): Question[] {
  return RARE_CROSSCHECK_GROUPS.map((eventIds, index) => {
    const events = eventIds.map((eventId) => EVENT_BY_ID[eventId]);
    return {
      id: `rare-crosscheck-${index + 1}`,
      phase: "discriminate" as const,
      eventIds,
      text: groupedText(events, "再辨一层，只核几处容易藏在旧事后的关口"),
      plainRule: `${countWord(events.length)}低频事件中至少一件真实发生过答“是”；全部没有答“否”。`,
      styleVariant: index
    };
  });
}

function buildRepeatedVerifications(): Question[] {
  const sequence = ["rel_formative_love", "edu_exam_turn", "rel_formative_love", "edu_exam_turn"];
  const seen: Record<string, number> = {};
  return sequence.map((eventId, index) => {
    const variant = seen[eventId] ?? 0;
    seen[eventId] = variant + 1;
    return {
      id: `verify-${eventId}-${variant + 1}`,
      phase: "verify" as const,
      eventIds: [eventId],
      text: REPEATED_VERIFICATION_CUES[eventId][variant],
      plainRule: "只判断这一件事。明确发生过答“是”，没有发生答“否”；记不清可选“暂难判断”。",
      styleVariant: index
    };
  });
}

function buildTargetedVerifications(): Question[] {
  return LIFE_EVENTS.map((event, index) => ({
    id: `targeted-${event.id}`,
    phase: "verify" as const,
    eventIds: [event.id],
    text: event.verificationCue,
    plainRule: "只判断这一件事。明确发生过答“是”，没有发生答“否”；记不清可选“暂难判断”。",
    styleVariant: index % 4
  }));
}

export const SCREEN_QUESTIONS = buildCoverageQuestions();
export const DISCRIMINATION_QUESTIONS = buildRareCrosschecks();
export const VERIFICATION_QUESTIONS = buildRepeatedVerifications();
export const TARGETED_VERIFICATION_QUESTIONS = buildTargetedVerifications();

export const QUESTION_BANK: Question[] = [
  ...SCREEN_QUESTIONS,
  ...DISCRIMINATION_QUESTIONS,
  ...VERIFICATION_QUESTIONS
];

export const QUESTION_BY_ID = Object.fromEntries(
  [...QUESTION_BANK, ...TARGETED_VERIFICATION_QUESTIONS].map((question) => [question.id, question])
) as Record<string, Question>;

export function getQuestionEvents(question: Question) {
  return question.eventIds.map((id) => EVENT_BY_ID[id]).filter(Boolean);
}

export function getEventSignature(eventId: string) {
  return [...QUESTION_BANK, ...TARGETED_VERIFICATION_QUESTIONS].filter((question) => question.eventIds.includes(eventId))
    .map((question) => question.id)
    .sort()
    .join("|");
}
