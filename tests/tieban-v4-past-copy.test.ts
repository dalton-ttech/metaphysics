import { describe, expect, it } from "vitest";

import { V4_ATOMIC_FACTS } from "@/lib/tieban-v4-content";
import {
  hasCuratedPastLifeCopyV4,
  PAST_LIFE_COPY_COUNTS_V4,
  PAST_LIFE_VERSE_FORBIDDEN_V4,
  pastLifeCopyV4
} from "@/lib/tieban-v4-past-copy";

function narrativeKey(fact: (typeof V4_ATOMIC_FACTS)[number]) {
  return fact.id.startsWith("fact.v4.axis.") ? fact.id : fact.semanticFamily ?? fact.id;
}

function cadence(verse: string) {
  const [first, second] = verse.slice(0, -1).split("，");
  return `${[...first].length}+${[...second].length}`;
}

describe("V6.5 命路纪全量判词", () => {
  it("为产品语料中的每个原子事实提供专属事件族文案", () => {
    expect(V4_ATOMIC_FACTS).toHaveLength(546);
    expect(PAST_LIFE_COPY_COUNTS_V4).toEqual({ legacyFamilies: 84, axisOptions: 126 });
    for (const fact of V4_ATOMIC_FACTS) expect(hasCuratedPastLifeCopyV4(fact), fact.id).toBe(true);
  });

  it("固定为连贯的两句判词，不把解释句混进诗中", () => {
    const representatives = [...new Map(V4_ATOMIC_FACTS.map((fact) => [narrativeKey(fact), fact])).values()];
    expect(representatives).toHaveLength(210);
    const verses = representatives.map((fact) => pastLifeCopyV4(fact).verse);
    expect(new Set(verses).size).toBe(verses.length);

    for (const fact of representatives) {
      const { verse } = pastLifeCopyV4(fact);
      expect(verse, fact.id).toMatch(/^[^，。！？；]{4,12}，[^，。！？；]{4,12}。$/u);
      expect(verse, fact.id).not.toMatch(PAST_LIFE_VERSE_FORBIDDEN_V4);
      expect(verse, fact.id).not.toMatch(/家中有事|一件家事|生活改变|方向改变|有所变化/u);
    }
  });

  it("保留整齐对句，同时让至少三成判词采用错落句长", () => {
    const representatives = [...new Map(V4_ATOMIC_FACTS.map((fact) => [narrativeKey(fact), fact])).values()];
    const verses = representatives.map((fact) => pastLifeCopyV4(fact).verse);
    const cadences = verses.map(cadence);
    const asymmetric = cadences.filter((item) => {
      const [first, second] = item.split("+").map(Number);
      return first !== second;
    });
    const largestPattern = Math.max(...[...new Set(cadences)].map((item) => cadences.filter((candidate) => candidate === item).length));

    expect(asymmetric.length / verses.length).toBeGreaterThanOrEqual(0.35);
    expect(new Set(cadences).size).toBeGreaterThanOrEqual(6);
    expect(largestPattern / verses.length).toBeLessThanOrEqual(0.65);
    expect(verses.join("\n")).not.toMatch(/暗夜逢灯人指路|一声啼破三更静|红绳已系同灯火|两姓从兹作一家|一纸离书|公堂数往|刀针临病榻/u);
  });

  it("今解使用可直接阅读的现代中文，同时隐藏内部判定口径", () => {
    const representatives = [...new Map(V4_ATOMIC_FACTS.map((fact) => [narrativeKey(fact), fact])).values()];
    for (const fact of representatives) {
      const { reading } = pastLifeCopyV4(fact);
      expect(reading, fact.id).toMatch(/[。！？]$/u);
      expect(reading, fact.id).not.toMatch(/本人|所断为|计入的实际手足|全部血缘手足|非血缘家人|去重后|共同生活满五年|累计联系|平均每周至少|至少一半的必要开支|礼物与偶尔代付不计|可与照料、供养同时成立/u);
      expect(reading, fact.id).not.toMatch(/生活主线|职业主线|结构倾向|模型|概率|事实 ID|计分/u);
    }
  });
});
