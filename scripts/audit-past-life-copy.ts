import { V4_ATOMIC_FACTS } from "../src/lib/tieban-v4-content";
import {
  hasCuratedPastLifeCopyV4,
  PAST_LIFE_COPY_COUNTS_V4,
  PAST_LIFE_VERSE_FORBIDDEN_V4,
  pastLifeCopyV4
} from "../src/lib/tieban-v4-past-copy";

function narrativeKey(fact: (typeof V4_ATOMIC_FACTS)[number]) {
  return fact.id.startsWith("fact.v4.axis.") ? fact.id : fact.semanticFamily ?? fact.id;
}

const representatives = [...new Map(V4_ATOMIC_FACTS.map((fact) => [narrativeKey(fact), fact])).values()];
const findings: string[] = [];
const seenVerses = new Map<string, string>();

for (const fact of V4_ATOMIC_FACTS) {
  if (!hasCuratedPastLifeCopyV4(fact)) findings.push(`${fact.id}：缺少专属文案`);
}

for (const fact of representatives) {
  const { verse, reading } = pastLifeCopyV4(fact);
  if (!/^[^，。！？；]{4,12}，[^，。！？；]{4,12}。$/u.test(verse)) findings.push(`${fact.id}：判词并非合规的上下两句：${verse}`);
  if (PAST_LIFE_VERSE_FORBIDDEN_V4.test(verse)) findings.push(`${fact.id}：判词混入说明语：${verse}`);
  const previous = seenVerses.get(verse);
  if (previous) findings.push(`${fact.id}：与 ${previous} 重复判词：${verse}`);
  else seenVerses.set(verse, fact.id);
  if (!/[。！？]$/u.test(reading)) findings.push(`${fact.id}：今解缺少收束标点：${reading}`);
  if (/本人|所断为|计入的实际手足|全部血缘手足|非血缘家人|去重后|共同生活满五年|累计联系|平均每周至少|至少一半的必要开支|事实 ID|模型|概率|计分/u.test(reading)) {
    findings.push(`${fact.id}：今解暴露内部口径：${reading}`);
  }
}

if (findings.length) {
  console.error(["命路纪语料审核未通过：", ...findings.map((finding) => `- ${finding}`)].join("\n"));
  process.exitCode = 1;
} else {
  const total = PAST_LIFE_COPY_COUNTS_V4.legacyFamilies + PAST_LIFE_COPY_COUNTS_V4.axisOptions;
  const cadences = representatives.map((fact) => {
    const [first, second] = pastLifeCopyV4(fact).verse.slice(0, -1).split("，");
    return `${[...first].length}+${[...second].length}`;
  });
  const asymmetricCount = cadences.filter((item) => {
    const [first, second] = item.split("+").map(Number);
    return first !== second;
  }).length;
  const asymmetricShare = Number((asymmetricCount / cadences.length).toFixed(3));
  const cadenceCount = new Set(cadences).size;
  if (asymmetricShare < 0.35) findings.push(`错落句长占比仅 ${asymmetricShare}，低于 0.35`);
  if (cadenceCount < 6) findings.push(`仅有 ${cadenceCount} 种句长组合，低于 6 种`);
  if (findings.length) {
    console.error(["命路纪文学节奏审核未通过：", ...findings.map((finding) => `- ${finding}`)].join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`命路纪语料审核通过：${total} 组判词与今解覆盖 ${V4_ATOMIC_FACTS.length} 个原子事实；错落句长占比 ${asymmetricShare}，共 ${cadenceCount} 种节奏；无漏配、重复判词、说明腔或内部口径泄露。`);
  }
}
