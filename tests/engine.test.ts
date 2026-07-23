import { describe, expect, it } from "vitest";

import { EVENT_BY_ID, LIFE_EVENTS } from "@/lib/events";
import {
  answerCurrentQuestion,
  ADAPTIVE_VERIFICATION_TURNS,
  BASELINE_TURNS,
  buildProfile,
  createSession,
  getPersonalizedPrior,
  MAX_TURNS
} from "@/lib/engine";
import { buildDestinyBook } from "@/lib/narrative";
import {
  DISCRIMINATION_QUESTIONS,
  getEventSignature,
  QUESTION_BANK,
  QUESTION_BY_ID,
  SCREEN_QUESTIONS,
  TARGETED_VERIFICATION_QUESTIONS,
  VERIFICATION_QUESTIONS
} from "@/lib/questions";
import type { Intake } from "@/lib/types";

const intake: Intake = {
  name: "测试者",
  birthDate: "1988-06-18",
  gender: "female",
  birthplace: "杭州",
  focus: "overall"
};

describe("life-event ontology", () => {
  it("covers eight domains and all referenced relationships", () => {
    expect(LIFE_EVENTS).toHaveLength(48);
    expect(new Set(LIFE_EVENTS.map((event) => event.domain)).size).toBe(8);
    for (const event of LIFE_EVENTS) {
      expect(event.cue.length).toBeGreaterThan(10);
      expect(event.verificationCue.length).toBeGreaterThan(10);
      for (const relatedId of event.related) expect(EVENT_BY_ID[relatedId]).toBeTruthy();
    }
  });

  it("covers every event once before low-rate crosschecks", () => {
    expect(SCREEN_QUESTIONS).toHaveLength(16);
    for (const event of LIFE_EVENTS) {
      expect(SCREEN_QUESTIONS.filter((question) => question.eventIds.includes(event.id))).toHaveLength(1);
      expect(getEventSignature(event.id).length).toBeGreaterThan(0);
    }
    expect(SCREEN_QUESTIONS.every((question) => question.eventIds.length === 3)).toBe(true);
    expect(new Set(SCREEN_QUESTIONS.flatMap((question) => question.eventIds)).size).toBe(48);
  });

  it("keeps every prompt atomic enough to answer and exposes explicit yes/no semantics", () => {
    expect(new Set(QUESTION_BANK.map((question) => question.id)).size).toBe(QUESTION_BANK.length);
    expect(QUESTION_BANK).toHaveLength(24);
    expect(SCREEN_QUESTIONS.every((question) => question.eventIds.length === 3)).toBe(true);
    expect(DISCRIMINATION_QUESTIONS).toHaveLength(4);
    expect(DISCRIMINATION_QUESTIONS.every((question) => [2, 3].includes(question.eventIds.length))).toBe(true);
    expect(new Set(DISCRIMINATION_QUESTIONS.flatMap((question) => question.eventIds)).size).toBe(10);
    expect(VERIFICATION_QUESTIONS).toHaveLength(4);
    expect(VERIFICATION_QUESTIONS.every((question) => question.eventIds.length === 1)).toBe(true);
    expect(TARGETED_VERIFICATION_QUESTIONS).toHaveLength(48);
    expect(TARGETED_VERIFICATION_QUESTIONS.every((question) => question.eventIds.length === 1)).toBe(true);
    for (const question of QUESTION_BANK) {
      expect(question.text.length).toBeLessThanOrEqual(240);
      expect(question.plainRule).toContain("是");
      expect(question.plainRule).toContain("否");
      for (const eventId of question.eventIds) expect(EVENT_BY_ID[eventId]).toBeTruthy();
    }
  });

  it("contains the explicitly permitted high-impact life-event categories", () => {
    for (const eventId of [
      "health_hospital",
      "turn_close_death",
      "law_crime_contact",
      "health_reproductive",
      "rel_divorce",
      "wealth_bankruptcy"
    ]) expect(EVENT_BY_ID[eventId]).toBeTruthy();
  });
});

describe("personalized priors", () => {
  it("does not assign impossible-age events normal adult priors", () => {
    const teen = getPersonalizedPrior({ ...intake, birthDate: "2009-01-01" });
    expect(teen.rel_marriage).toBeLessThan(0.1);
    expect(teen.wealth_property).toBeLessThan(0.1);
  });

  it("adjusts reproductive priors by supplied user context without zeroing either path", () => {
    const female = getPersonalizedPrior({ ...intake, gender: "female" });
    const male = getPersonalizedPrior({ ...intake, gender: "male" });
    expect(female.health_reproductive).toBeGreaterThan(male.health_reproductive);
    expect(male.health_reproductive).toBeGreaterThan(0);
  });

  it("changes priors when age and stated focus change", () => {
    const younger = getPersonalizedPrior({ ...intake, birthDate: "2002-01-01", focus: "relationship" });
    const older = getPersonalizedPrior({ ...intake, birthDate: "1975-01-01", focus: "career_wealth" });
    expect(younger.rel_formative_love).not.toBe(older.rel_formative_love);
    expect(younger.wealth_property).not.toBe(older.wealth_property);
  });
});

describe("adaptive decoder", () => {
  it("updates included event posteriors and never repeats a question", () => {
    let session = createSession(intake, 1);
    const firstId = session.currentQuestionId!;
    const question = QUESTION_BY_ID[firstId];
    const before = question.eventIds.map((id) => session.probabilities[id]);
    session = answerCurrentQuestion(session, "yes", 2);
    const after = question.eventIds.map((id) => session.probabilities[id]);
    expect(after.some((value, index) => value > before[index])).toBe(true);

    for (let turn = 0; turn < MAX_TURNS - 1 && !session.completedAt; turn += 1) {
      session = answerCurrentQuestion(session, turn % 3 === 0 ? "no" : "yes", turn + 3);
    }
    expect(new Set(session.askedQuestionIds).size).toBe(session.askedQuestionIds.length);
    expect(session.answers.length).toBeLessThanOrEqual(MAX_TURNS);
    expect(MAX_TURNS).toBe(BASELINE_TURNS + ADAPTIVE_VERIFICATION_TURNS);
    expect(session.answers.slice(BASELINE_TURNS)).toHaveLength(ADAPTIVE_VERIFICATION_TURNS);
    expect(session.answers.slice(BASELINE_TURNS).every((record) => record.questionId.startsWith("targeted-"))).toBe(true);
  });

  it("preserves probabilities when the user skips a question", () => {
    const session = createSession(intake, 1);
    const question = QUESTION_BY_ID[session.currentQuestionId!];
    const before = question.eventIds.map((id) => session.probabilities[id]);
    const next = answerCurrentQuestion(session, "unsure", 2);
    expect(question.eventIds.map((id) => next.probabilities[id])).toEqual(before);
  });
});

describe("profile and destiny book", () => {
  it("builds a traceable profile and five-chapter book", () => {
    let session = createSession(intake, 1);
    for (let turn = 0; turn < MAX_TURNS && !session.completedAt; turn += 1) {
      session = answerCurrentQuestion(session, turn % 4 === 0 ? "no" : "yes", turn + 2);
    }
    const profile = buildProfile(session);
    const confirmed = profile.domains.flatMap((domain) => domain.events).slice(0, 6).map((item) => item.eventId);
    const book = buildDestinyBook(session, confirmed);
    expect(profile.domains).toHaveLength(8);
    expect(profile.evidenceTrail).toHaveLength(session.answers.length);
    expect(book.chapters).toHaveLength(5);
    expect(book.chapters.every((chapter) => chapter.interpretation.length > 60)).toBe(true);
    expect(book.chapters.every((chapter) => chapter.evidenceEventIds.every((id) => EVENT_BY_ID[id]))).toBe(true);
  });

  it("never promotes unconfirmed candidates into the destiny-book evidence chain", () => {
    let session = createSession(intake, 1);
    for (let turn = 0; turn < MAX_TURNS && !session.completedAt; turn += 1) {
      session = answerCurrentQuestion(session, "no", turn + 2);
    }
    const book = buildDestinyBook(session, []);
    expect(book.opening).toContain("没有留下肯定旧迹");
    expect(book.chapters.every((chapter) => chapter.evidenceEventIds.length === 0)).toBe(true);
    expect(book.chapters.every((chapter) => chapter.interpretation.includes("不反推") || chapter.interpretation.includes("不把") || chapter.interpretation.includes("不替") || chapter.interpretation.includes("不描述"))).toBe(true);
  });
});
