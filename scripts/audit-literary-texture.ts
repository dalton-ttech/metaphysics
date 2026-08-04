import { V4_ATOMIC_FACTS } from "../src/lib/tieban-v4-content";
import {
  TIEBAN_V4_FUTURE_VERSE_CATALOG,
  TIEBAN_V4_TERMINAL_VERSES
} from "../src/lib/tieban-v4-future";
import { pastLifeCopyV4 } from "../src/lib/tieban-v4-past-copy";

function narrativeKey(fact: (typeof V4_ATOMIC_FACTS)[number]) {
  return fact.id.startsWith("fact.v4.axis.") ? fact.id : fact.semanticFamily ?? fact.id;
}

function inspect(name: string, verses: string[], minimumAsymmetricShare: number) {
  const findings: string[] = [];
  const cadences = verses.map((verse) => {
    if (!/^[^，。！？；]{4,12}，[^，。！？；]{4,12}。$/u.test(verse)) findings.push(`${name}格式不合规：${verse}`);
    const [first = "", second = ""] = verse.slice(0, -1).split("，");
    return `${[...first].length}+${[...second].length}`;
  });
  const patternCounts = new Map<string, number>();
  for (const item of cadences) patternCounts.set(item, (patternCounts.get(item) ?? 0) + 1);
  const asymmetricCount = cadences.filter((item) => {
    const [first, second] = item.split("+").map(Number);
    return first !== second;
  }).length;
  const asymmetricShare = Number((asymmetricCount / verses.length).toFixed(3));
  const largestPatternShare = Number((Math.max(...patternCounts.values()) / verses.length).toFixed(3));
  if (asymmetricShare < minimumAsymmetricShare) findings.push(`${name}错落句长占比 ${asymmetricShare}，低于 ${minimumAsymmetricShare}`);
  if (patternCounts.size < 6) findings.push(`${name}只有 ${patternCounts.size} 种节奏，低于 6 种`);
  if (largestPatternShare > 0.65) findings.push(`${name}最大单一句式占比 ${largestPatternShare}，高于 0.65`);
  return {
    findings,
    metrics: {
      count: verses.length,
      asymmetricShare,
      cadenceTypes: patternCounts.size,
      largestPatternShare,
      distribution: Object.fromEntries([...patternCounts.entries()].sort((left, right) => right[1] - left[1]))
    }
  };
}

const representatives = [...new Map(V4_ATOMIC_FACTS.map((fact) => [narrativeKey(fact), fact])).values()];
const pastVerses = representatives.map((fact) => pastLifeCopyV4(fact).verse);
const futureVerses = [...TIEBAN_V4_FUTURE_VERSE_CATALOG.map((item) => item.verse), ...TIEBAN_V4_TERMINAL_VERSES];
const past = inspect("命路纪", pastVerses, 0.35);
const future = inspect("后程录", futureVerses, 0.35);
const findings = [...past.findings, ...future.findings];
const combined = [...pastVerses, ...futureVerses].join("\n");

if (/暗夜逢灯人指路|一声啼破三更静|灯前多一人|红绳|两姓从兹|一纸婚书|一纸离书|公堂|讼牒|刑名|囹圄|刀针临病榻/u.test(combined)) {
  findings.push("仍有直接点破事件或旧版套语的判词");
}

if (findings.length) {
  console.error(["判词文学质感审核未通过：", ...findings.map((finding) => `- ${finding}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.info(`判词文学质感审核通过：${JSON.stringify({ past: past.metrics, future: future.metrics })}`);
}
