import { describe, expect, it } from "vitest";

import type { EventDomain, Gender } from "@/lib/types";
import {
  buildLifetimeAgeBandsV4,
  buildLifetimeForecastV4,
  calculateTerminalAgeV4,
  TIEBAN_V4_FUTURE_TEMPLATE_COUNT,
  type LifetimeForecastInputV4
} from "@/lib/tieban-v4-future";

const domains: EventDomain[] = [
  "family",
  "education_mobility",
  "career",
  "wealth",
  "relationship",
  "health",
  "law_social",
  "turning_point"
];
const genders: Gender[] = ["male", "female", "unspecified"];
const places = ["北京", "上海", "广州", "成都", "西安", "苏州", "昆明", "哈尔滨", "厦门", "乌鲁木齐"];
const classicEligibleKeys = new Set([
  "family.reunion", "mobility.journey", "mobility.relocation", "career.rise",
  "wealth.income", "wealth.recovery", "relationship.old-friend", "health.recovery",
  "law.helper", "law.reputation", "turning.restart", "turning.crisis"
]);

function sample(index: number): LifetimeForecastInputV4 {
  const currentAge = 18 + index % 61;
  return {
    currentAge,
    birthYear: 2026 - currentAge,
    gender: genders[index % genders.length],
    birthplace: places[index % places.length],
    profileId: `simulation-profile-${index}`,
    profileCode: `命-${String(10000 + index)}`,
    profileSignature: `signature-${index * 7919}-${index % 37}`,
    seedDigest: `seed-${index * 104729}-${index % 53}`,
    anchorDomains: Array.from({ length: 8 }, (_, offset) => domains[(index * 3 + offset * 5) % domains.length])
  };
}

describe("V6.3 lifetime forecast simulation", () => {
  it("covers 1,000 synthetic lives continuously through a deterministic terminal age", () => {
    const sampleCount = 1_000;
    const sequenceFingerprints = new Set<string>();
    const terminalAges = new Set<number>();
    const seenEventKeys = new Set<string>();
    let nodeTotal = 0;
    let classicTotal = 0;
    let maximumGap = 0;
    let maximumSpan = 0;
    let longestDomainRun = 0;
    const bannedCopy = /新局|路径|结构倾向|长期结构|课题|能量|沉淀|赋能|重启|开启|归整|调序|定向|换轨|前一处|这一处|真实选择/u;

    expect(TIEBAN_V4_FUTURE_TEMPLATE_COUNT).toBeGreaterThanOrEqual(50);
    for (let index = 0; index < sampleCount; index += 1) {
      const input = sample(index);
      const forecast = buildLifetimeForecastV4(input);
      const replay = buildLifetimeForecastV4(input);
      expect(replay).toEqual(forecast);
      expect(forecast.terminalAge).toBe(calculateTerminalAgeV4(input));
      expect(forecast.terminalAge).toBeGreaterThanOrEqual(Math.max(72, input.currentAge + 8));
      expect(forecast.terminalAge).toBeLessThanOrEqual(96);
      expect(forecast.nodes[0].ageStart).toBe(input.currentAge + 1);
      expect(forecast.nodes.at(-1)).toMatchObject({
        ageStart: forecast.terminalAge,
        ageEnd: forecast.terminalAge,
        eventKey: "lifetime.terminal",
        terminal: true
      });
      expect(forecast.nodes.at(-1)?.reading).toContain(`${forecast.terminalAge}岁为寿限`);
      expect(forecast.nodes.slice(-4).map((node) => node.eventKey)).toEqual([
        "turning.legacy",
        "family.late-support",
        "health.strength-decline",
        "lifetime.terminal"
      ]);

      const eventKeys = new Set(forecast.nodes.map((node) => node.eventKey));
      const verses = new Set(forecast.nodes.map((node) => node.verse));
      expect(eventKeys.size).toBe(forecast.nodes.length);
      expect(verses.size).toBe(forecast.nodes.length);
      expect(forecast.nodes.filter((node) => node.sourceType === "classic").length / forecast.nodes.length).toBeLessThanOrEqual(0.15);

      let run = 0;
      let lastDomain: EventDomain | null = null;
      for (let nodeIndex = 0; nodeIndex < forecast.nodes.length; nodeIndex += 1) {
        const node = forecast.nodes[nodeIndex];
        expect(node.sign.startsWith("征兆：")).toBe(true);
        const completeCopy = `${node.verse}\n${node.sign}\n${node.reading}`;
        expect(completeCopy).not.toMatch(bannedCopy);
        expect(completeCopy).not.toMatch(/的的|前前后|。。|，，|；；/u);
        if (node.sourceType === "classic") expect(classicEligibleKeys.has(node.eventKey)).toBe(true);
        if (nodeIndex > 0) {
          const previous = forecast.nodes[nodeIndex - 1];
          const gap = node.ageStart - previous.ageEnd - 1;
          maximumGap = Math.max(maximumGap, gap);
          expect(gap).toBe(0);
        }
        const span = node.ageEnd - node.ageStart + 1;
        maximumSpan = Math.max(maximumSpan, span);
        expect(span).toBeGreaterThanOrEqual(1);
        expect(span).toBeLessThanOrEqual(3);
        if (node.domain === lastDomain) run += 1;
        else run = 1;
        lastDomain = node.domain;
        longestDomainRun = Math.max(longestDomainRun, run);
        expect(run).toBeLessThanOrEqual(2);
        seenEventKeys.add(node.eventKey);
      }

      const expectedBands = buildLifetimeAgeBandsV4(input.currentAge, forecast.terminalAge);
      expect(forecast.nodes.map((node) => [node.ageStart, node.ageEnd, node.terminal])).toEqual(
        expectedBands.map((band) => [band.start, band.end, band.terminal])
      );
      terminalAges.add(forecast.terminalAge);
      sequenceFingerprints.add(forecast.nodes.map((node) => node.eventKey).join("|"));
      nodeTotal += forecast.nodes.length;
      classicTotal += forecast.nodes.filter((node) => node.sourceType === "classic").length;
    }

    const metrics = {
      sampleCount,
      averageNodes: Number((nodeTotal / sampleCount).toFixed(2)),
      distinctTerminalAges: terminalAges.size,
      distinctSequences: sequenceFingerprints.size,
      classicShare: Number((classicTotal / nodeTotal).toFixed(4)),
      maximumGap,
      maximumSpan,
      longestDomainRun
    };
    console.info("V6_LIFETIME_SIMULATION", JSON.stringify(metrics));
    expect(metrics.distinctTerminalAges).toBeGreaterThanOrEqual(15);
    expect(metrics.distinctSequences).toBeGreaterThanOrEqual(900);
    expect(seenEventKeys.size).toBe(TIEBAN_V4_FUTURE_TEMPLATE_COUNT + 1);
    expect(metrics.averageNodes).toBeGreaterThanOrEqual(16);
    expect(metrics.maximumGap).toBe(0);
    expect(metrics.maximumSpan).toBe(3);
    expect(metrics.longestDomainRun).toBeLessThanOrEqual(2);
  }, 120_000);
});
