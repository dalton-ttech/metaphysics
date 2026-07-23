import type { CandidateState, TiebanClause, TiebanSession } from "@/lib/tieban-v3-types";

export const SHICHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
export const KE_ORDINALS = ["初", "二", "三", "四", "五", "六", "七", "八"] as const;

export function shichenLabel(index: number) {
  return `${SHICHEN[((index % 12) + 12) % 12]}时`;
}

export function keLabel(candidate: CandidateState) {
  const ordinal = KE_ORDINALS[candidate.keIndex - 1] ?? String(candidate.keIndex);
  return `${ordinal}刻${candidate.minuteWithinKe === 0 ? "正" : `${candidate.minuteWithinKe}分`}`;
}

export function volumeLabel(volume: number) {
  return `第${toChineseNumber(volume)}卷`;
}

export function articleLabel(article: number) {
  return `第${toChineseNumber(article)}条`;
}

export function toChineseNumber(value: number) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[value];
  if (value < 20) return `十${value % 10 ? digits[value % 10] : ""}`;
  if (value < 100) return `${digits[Math.floor(value / 10)]}十${value % 10 ? digits[value % 10] : ""}`;
  return String(value).split("").map((digit) => digits[Number(digit)]).join("");
}

export function ritualNumberCells(clause: TiebanClause, session: TiebanSession) {
  const source = `${clause.displayCode}${session.answers.length + 1}`.replace(/\D/gu, "");
  const digits = source.padEnd(8, "0").slice(0, 8).split("");
  return digits.map((digit, index) => ({
    stem: SHICHEN[(index + session.intake.birthShichen) % SHICHEN.length],
    digit,
    active: index === session.answers.length % 8
  }));
}

export function ritualStatusCopy(session: TiebanSession) {
  if (session.phase === "initial") return "初数既起，先合乾卷旁条。";
  if (session.phase === "recalculate") return "旁数移位，铁算盘复校。";
  if (session.phase === "narrowing") return "诸数渐合，刻分将明。";
  return "八刻归一，此刻已成。";
}
