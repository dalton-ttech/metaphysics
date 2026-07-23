import type { EventDomain } from "@/lib/types";
import { ageAtV4, factApplicabilityV4, getLockedCandidateV4, getLockedProfileV4, stableHashV4 } from "@/lib/tieban-v4-engine";
import { buildLifetimeForecastV4 } from "@/lib/tieban-v4-future";
import type {
  AtomicFact,
  PastLifeNodeV4,
  TiebanBookV4,
  TiebanClause,
  TiebanV4Session
} from "@/lib/tieban-v4-types";

export const TIEBAN_V4_MAX_PAST_NODES = 10;
export const TIEBAN_V4_MIN_PAST_NODES = 6;

const subjectLabels: Record<AtomicFact["subject"], string> = {
  self: "命主",
  father: "父亲",
  mother: "母亲",
  parents: "双亲",
  siblings: "手足",
  partner: "伴侣",
  children: "子女",
  family: "家门"
};

const domainTitles: Record<EventDomain, string> = {
  family: "家门",
  education_mobility: "学行",
  career: "事业",
  wealth: "财途",
  relationship: "情缘",
  health: "身心",
  law_social: "人事",
  turning_point: "转机"
};

const pastOpeners: Record<EventDomain, string[]> = {
  family: ["家里曾因一件事重新分担责任", "一件家事多年以后仍有影响", "你与家人的亲疏曾有明显变化"],
  education_mobility: ["求学或迁居曾在这里改变方向", "一次换环境，让你接触到不同的人和事", "原定的学校、城市或去处后来改变"],
  career: ["工作内容或职业方向曾有明显改变", "你曾在留任与离开之间作出重要决定", "原来的工作没有一直做下去"],
  wealth: ["收入、资产或负债曾有明显变化", "家里的钱曾重新安排用途", "一次较大的得失改变了你后来用钱的方式"],
  relationship: ["一段重要关系曾在这里有了结果", "一段关系改变了你的生活安排", "一次相聚或分开让关系变得明确"],
  health: ["身体或情绪曾出现一次明显问题", "一次身体问题改变了你的作息", "原来的生活曾被伤病打断"],
  law_social: ["你曾在人情与规则之间作出选择", "一次矛盾让你看清了一段关系", "一场纠纷让你以后更重视约定和证据"],
  turning_point: ["生活重心曾在这里改变", "一段生活结束，另一段生活开始", "这件事前后，你的身份或方向明显不同"]
};

const aftereffects: Record<EventDomain, string[]> = {
  family: ["从那以后，家里由谁负责什么、你和谁更亲近，都与以前不同。", "这件事并没有完全过去；后来遇到家庭选择时，你仍会受它影响。"],
  education_mobility: ["后来选择学校、城市或工作时，你多了一个以前没有考虑过的方向。", "从那以后，你看事情的眼界和生活的地方都发生了变化。"],
  career: ["后来再决定留任还是离开时，你更在意这份工作是否值得长期做。", "这次变化以后，你选择工作有了更明确的标准。"],
  wealth: ["从那以后，你看钱不只看赚多少，也更在意能不能留下来。", "后来安排收入和支出时，你比以前更谨慎。"],
  relationship: ["后来再面对承诺或分开时，你比以前更清楚自己能接受什么。", "这段经历以后，你不再让一段关系长期停在说不清的状态。"],
  health: ["从那以后，你更清楚自己的体力和情绪能承受多少。", "身体留下的影响，一直改变着你的作息和生活安排。"],
  law_social: ["后来与人合作时，你更重视证据、约定和各自的责任。", "事情过去以后，你不再只凭口头承诺判断一个人是否可靠。"],
  turning_point: ["这次改变，也影响了你此后的许多选择。", "从那以后，你不再继续原来的生活安排，新的方向才逐渐明确。"]
};

const identityPatterns: Array<{ domains: EventDomain[]; title: string; dictum: string; reading: string }> = [
  { domains: ["family", "career"], title: "负梁成局", dictum: "早担一分，后来便处处求稳。", reading: "你不太习惯冒险。承担家庭责任以后，你做事更看重稳妥和可控；这种习惯也会影响你选择工作和维持关系的方式。" },
  { domains: ["education_mobility", "turning_point"], title: "移岸开程", dictum: "命路不守一岸，换境之后方见真章。", reading: "你的几次重要变化，往往先从换学校、换城市或换环境开始。离开熟悉的地方以后，你更容易发现自己真正擅长什么。" },
  { domains: ["relationship", "family"], title: "情深有界", dictum: "重情不等于无界，聚散皆由分寸而定。", reading: "你会认真对待亲密关系，也很在意承诺能否落实在日常相处、家庭责任和长期安排上。过去的经历让你更清楚哪些关系值得继续。" },
  { domains: ["health", "career"], title: "缓弦持衡", dictum: "能任重事，也须留一线还身。", reading: "你常常先把事情做完，之后才意识到自己已经很累。对你来说，真正重要的改变不是再硬撑一次，而是给工作和休息留下明确界限。" },
  { domains: ["wealth", "law_social"], title: "守界聚流", dictum: "财从界清处聚，局在人明处稳。", reading: "你判断钱是否安全，往往也取决于合作的人是否可靠、责任是否说清楚。人和规则越清楚，收入与事业越稳定。" }
];

function ageRange(fact: AtomicFact) {
  if (fact.timeLabel) return fact.timeLabel;
  if (fact.latestAge === null) return `${fact.earliestAge}岁以后`;
  return fact.latestAge === fact.earliestAge ? `${fact.earliestAge}岁` : `${fact.earliestAge}—${fact.latestAge}岁`;
}

function narrativeAge(fact: AtomicFact) {
  if (fact.timeLabel?.startsWith("截至")) return fact.latestAge ?? fact.earliestAge;
  return fact.earliestAge;
}

function predicateOnly(definition: string) {
  return definition.replace(/^.*?，/u, "").replace(/[。！？]+$/u, "");
}

function semanticFamily(fact: AtomicFact) {
  const text = `${fact.semanticFamily ?? ""}|${fact.domainTitle ?? ""}|${fact.label}|${fact.definition}`;
  if (/离开成长地|跨城迁居|离乡/u.test(text)) return "mobility-away-from-home";
  if (/亲生兄弟姐妹|亲生手足/u.test(text)) return "biological-sibling-count";
  if (/首次重大亲缘离世/u.test(text)) return "first-major-bereavement";
  if (/离世|去世|死亡|长期离场/u.test(text)) return "bereavement-or-absence";
  if (/主要由.+抚养/u.test(text)) return "primary-caregiver";
  return fact.mutualExclusionGroup ?? fact.semanticFamily ?? fact.id.replace(/\.\d+$/u, "").replace(/\.window\.\d+$/u, "");
}

function isNegativeFact(fact: AtomicFact) {
  return /没有|未曾|从未|无一|零次/u.test(fact.definition);
}

function isIntenseFact(fact: AtomicFact) {
  return /重病|严重|意外|离世|去世|死亡|诉讼|仲裁|报警|犯罪|监禁|破产|资不抵债|流产|离婚|失业|火灾|落水|灾祸/u.test(fact.definition);
}

function isAdverseFact(fact: AtomicFact) {
  return /中断|失业|住院|手术|损失|危机|压力|崩塌|分手|离世|去世|死亡|诉讼|仲裁|报警|犯罪|监禁|破产|资不抵债|流产|离婚|意外|重病|严重|负债|纠纷|冲突|受伤|灾祸|失败|破裂|落水|火灾|裁员|辞退|困境|下降|骤落|下滑|受损|损害|低谷|慢性|旧恙|疏离|不和|欺诈|失守|背叛/u.test(fact.definition);
}

function bookVerse(text: string) {
  return text.replace(/^(?:此象若应|若应此象)[，,]/u, "");
}

function hasPlausibleAgeWindow(fact: AtomicFact) {
  const latest = fact.latestAge ?? Number.POSITIVE_INFINITY;
  if (/创业|经营生意|婚姻|离婚|怀孕|生育|管理职责|投资|房产|持续工作|失业|事业/u.test(fact.definition) && latest < 16) return false;
  if (/退休|养老/u.test(fact.definition) && latest < 35) return false;
  return true;
}

function compilePastNodes(session: TiebanV4Session, facts: AtomicFact[], fateClauses: TiebanClause[], limit: number): PastLifeNodeV4[] {
  const profile = getLockedProfileV4(session);
  const currentAge = ageAtV4(session.intake.birthDate, session.completedAt ?? session.createdAt);
  const factIndexById = new Map(facts.map((fact, index) => [fact.id, index]));
  const answeredByFact = new Map<string, string[]>();
  for (const answer of session.answers) {
    if (answer.answer !== "resonates") continue;
    answeredByFact.set(answer.factId, [...(answeredByFact.get(answer.factId) ?? []), answer.clauseId]);
  }
  const candidateFactIds = [...new Set([
    ...profile.coreFactIds,
    ...session.answers.filter((answer) => answer.answer === "resonates").map((answer) => answer.factId)
  ])];
  const candidates = candidateFactIds
    .map((factId) => {
      const factIndex = factIndexById.get(factId);
      if (factIndex === undefined) return null;
      const fact = facts[factIndex];
      const profileProbability = profile.factProbabilities[factIndex] ?? 0;
      return {
        fact,
        probability: profileProbability,
        evidenceClauseIds: answeredByFact.get(fact.id) ?? [],
        askedDirectly: session.answers.some((answer) => answer.factId === fact.id)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => item.probability >= (item.askedDirectly ? 0.55 : 0.72)
      && factIsPastEligible(item.fact, currentAge)
      && factApplicabilityV4(session, item.fact, facts, currentAge, false).status === "eligible"
      && hasPlausibleAgeWindow(item.fact));

  const unique = new Map<string, (typeof candidates)[number]>();
  for (const item of candidates) {
    const family = semanticFamily(item.fact);
    const current = unique.get(family);
    const itemScore = item.probability + item.fact.salience * 0.025 - Number(isNegativeFact(item.fact)) * 0.08 - Number(item.askedDirectly) * 0.06;
    const currentScore = current ? current.probability + current.fact.salience * 0.025 - Number(isNegativeFact(current.fact)) * 0.08 - Number(current.askedDirectly) * 0.06 : -Infinity;
    if (!current || itemScore > currentScore) unique.set(family, item);
  }
  const ranked = [...unique.values()].sort((left, right) =>
    Number(right.askedDirectly) - Number(left.askedDirectly)
    || Number(isIntenseFact(left.fact)) - Number(isIntenseFact(right.fact))
    || Number(isAdverseFact(left.fact)) - Number(isAdverseFact(right.fact))
    || Number(isNegativeFact(left.fact)) - Number(isNegativeFact(right.fact))
    || right.fact.salience - left.fact.salience
    || right.probability - left.probability
    || left.fact.id.localeCompare(right.fact.id)
  );
  const selected: typeof ranked = [];
  const domainCounts = new Map<EventDomain, number>();
  const orderedDomains = Object.keys(domainTitles) as EventDomain[];
  let intenseCount = 0;
  let adverseCount = 0;
  for (const domain of orderedDomains) {
    const choice = ranked.find((item) =>
      item.fact.domain === domain
      && !selected.includes(item)
      && (!isIntenseFact(item.fact) || intenseCount < 2)
      && (!isAdverseFact(item.fact) || adverseCount < 4)
    );
    if (!choice || selected.length >= limit) continue;
    selected.push(choice);
    domainCounts.set(domain, 1);
    if (isIntenseFact(choice.fact)) intenseCount += 1;
    if (isAdverseFact(choice.fact)) adverseCount += 1;
  }
  for (const item of ranked) {
    if (selected.length >= limit) break;
    if (selected.includes(item)
      || (domainCounts.get(item.fact.domain) ?? 0) >= 2
      || (isIntenseFact(item.fact) && intenseCount >= 2)
      || (isAdverseFact(item.fact) && adverseCount >= 4)) continue;
    selected.push(item);
    domainCounts.set(item.fact.domain, (domainCounts.get(item.fact.domain) ?? 0) + 1);
    if (isIntenseFact(item.fact)) intenseCount += 1;
    if (isAdverseFact(item.fact)) adverseCount += 1;
  }
  selected.sort((left, right) => narrativeAge(left.fact) - narrativeAge(right.fact) || left.fact.id.localeCompare(right.fact.id));
  const usedVerseIds = new Set<string>();
  return selected.map((item): PastLifeNodeV4 => {
    const matchingVerses = fateClauses
      .filter((clause) => clause.category === "命局" && (clause.primaryFactId === item.fact.id || clause.conditionFactIds?.includes(item.fact.id)))
      .sort((left, right) => {
        const leftInProfile = profile.fateClauseIds.includes(left.id) ? 0 : 1;
        const rightInProfile = profile.fateClauseIds.includes(right.id) ? 0 : 1;
        return leftInProfile - rightInProfile
          || stableHashV4(`${profile.profileCode}:${item.fact.id}:${left.id}`) - stableHashV4(`${profile.profileCode}:${item.fact.id}:${right.id}`)
          || left.id.localeCompare(right.id);
      });
    const chosenVerse = matchingVerses.find((clause) => !usedVerseIds.has(clause.id));
    if (chosenVerse) usedVerseIds.add(chosenVerse.id);
    const fallbackIndex = stableHashV4(`${profile.profileCode}:${item.fact.id}:past`) % pastOpeners[item.fact.domain].length;
    return {
      id: `past-${profile.id}-${item.fact.id}`,
      factId: item.fact.id,
      clauseNumber: chosenVerse?.displayCode ?? String(20000 + stableHashV4(`${profile.profileCode}:${item.fact.id}`) % 9000),
      domain: item.fact.domain,
      title: `${item.fact.domainTitle ?? domainTitles[item.fact.domain]} · ${item.fact.label}`,
      ageRange: ageRange(item.fact),
      subject: subjectLabels[item.fact.subject],
      summary: chosenVerse ? bookVerse(chosenVerse.text) : `${pastOpeners[item.fact.domain][fallbackIndex]}。`,
      aftereffect: aftereffects[item.fact.domain][stableHashV4(`${profile.profileCode}:${item.fact.id}:effect`) % aftereffects[item.fact.domain].length],
      probability: item.probability,
      evidenceClauseIds: item.evidenceClauseIds,
      inference: item.evidenceClauseIds.length ? "profile_confirmed" : "profile_inferred",
      askedDirectly: item.askedDirectly
    };
  });
}

function factIsPastEligible(fact: AtomicFact, currentAge: number) {
  return currentAge >= (fact.minCurrentAge ?? fact.earliestAge);
}

function compileFutureNodes(session: TiebanV4Session, pastNodes: PastLifeNodeV4[]) {
  const profile = getLockedProfileV4(session);
  const currentAge = ageAtV4(session.intake.birthDate, session.completedAt ?? session.createdAt);
  return buildLifetimeForecastV4({
    currentAge,
    birthYear: Number(session.intake.birthDate.slice(0, 4)) || 1990,
    gender: session.intake.gender,
    birthplace: session.intake.birthplace,
    profileId: profile.id,
    profileCode: profile.profileCode,
    profileSignature: profile.signature,
    seedDigest: session.birthSeed.digest,
    anchorDomains: pastNodes.map((node) => node.domain)
  });
}

function buildIdentity(pastNodes: PastLifeNodeV4[]) {
  const domains = new Set(pastNodes.slice(0, 6).map((node) => node.domain));
  return identityPatterns.find((pattern) => pattern.domains.every((domain) => domains.has(domain))) ?? {
    title: "转枢成命",
    dictum: "旧局几经移位，后来所守皆由亲历而成。",
    reading: "你的生活经历过几次明显变化。每次变化以后，你都会调整自己的做法；久而久之，你更清楚什么值得坚持，什么必须放下。"
  };
}

const storyImpact: Record<EventDomain, string> = {
  family: "你开始更在意家里的责任由谁承担、是否公平",
  education_mobility: "你对读书、迁居和外出发展的看法发生了改变",
  career: "你重新判断什么样的工作值得长期投入",
  wealth: "你开始更看重收入是否稳定、支出是否可控",
  relationship: "你对承诺、距离和相处方式有了更明确的要求",
  health: "你开始留意作息、体力和身体发出的信号",
  law_social: "你以后与人合作时，更重视约定、证据和各自的责任",
  turning_point: "你不再把原来的生活安排看作唯一选择"
};

const storyFollowUp: Record<EventDomain, (nextTitle: string) => string> = {
  family: (nextTitle) => `后来经历“${nextTitle}”时，你也会先考虑这件事会不会增加家里的负担。`,
  education_mobility: (nextTitle) => `后来经历“${nextTitle}”时，你更愿意比较不同选择，而不是只按原计划走。`,
  career: (nextTitle) => `后来经历“${nextTitle}”时，你会先判断投入和回报是否值得。`,
  wealth: (nextTitle) => `后来经历“${nextTitle}”时，你会先算清长期成本和风险。`,
  relationship: (nextTitle) => `后来经历“${nextTitle}”时，你会更直接地确认双方的责任和承诺。`,
  health: (nextTitle) => `后来经历“${nextTitle}”时，你会更注意这件事是否超出自己的承受范围。`,
  law_social: (nextTitle) => `后来经历“${nextTitle}”时，你会先确认责任、证据和退出方式。`,
  turning_point: (nextTitle) => `后来经历“${nextTitle}”时，你更愿意重新选择，而不是勉强维持原来的安排。`
};

function plainNodeTitle(node: PastLifeNodeV4) {
  return node.title.replace(/^.*? · /u, "");
}

function buildStoryEdges(pastNodes: PastLifeNodeV4[]) {
  return pastNodes.slice(0, -1).slice(0, 5).map((node, index) => {
    const next = pastNodes[index + 1];
    const text = `“${plainNodeTitle(node)}”发生后，${storyImpact[node.domain]}。${storyFollowUp[node.domain](plainNodeTitle(next))}`;
    return { id: `edge-${index + 1}`, fromNodeId: node.id, toNodeId: next.id, text };
  });
}

export function buildTiebanBookV4(
  session: TiebanV4Session,
  facts: AtomicFact[],
  calibrationClauses: TiebanClause[],
  fateClauses: TiebanClause[] = [],
  options: { maxPastNodes?: number } = {}
): TiebanBookV4 {
  if (session.phase !== "locked" || !session.lockedCandidateId) throw new Error("只有完成定刻后才能启命书");
  const candidate = getLockedCandidateV4(session);
  const profile = getLockedProfileV4(session);
  const maxPast = Math.min(TIEBAN_V4_MAX_PAST_NODES, Math.max(1, Math.trunc(options.maxPastNodes ?? TIEBAN_V4_MAX_PAST_NODES)));
  const pastNodes = compilePastNodes(session, facts, fateClauses, maxPast);
  const currentAge = ageAtV4(session.intake.birthDate, session.completedAt ?? session.createdAt);
  const forecast = compileFutureNodes(session, pastNodes);
  const confirmedEvidence = pastNodes.filter((node) => node.askedDirectly && node.evidenceClauseIds.length).slice(0, 3);
  const ironEvidence = confirmedEvidence.length >= 3 ? confirmedEvidence : pastNodes.slice(0, 3);
  const evidenceIds = new Set(ironEvidence.map((node) => node.id));
  const unaskedInsight = pastNodes.find((node) => !node.askedDirectly && !evidenceIds.has(node.id))
    ?? pastNodes.find((node) => !evidenceIds.has(node.id))
    ?? null;
  const identity = buildIdentity(pastNodes);
  const displayName = session.intake.name.trim() || "命主";
  return {
    title: displayName === "命主" ? "铁板定刻命书" : `${displayName}·铁板定刻命书`,
    seal: `定刻 刻-${String(candidate.index + 1).padStart(3, "0")}`,
    exactTime: candidate.clockTime,
    keLabel: `第${candidate.keIndex}刻·${candidate.minuteWithinKe === 0 ? "正" : `${candidate.minuteWithinKe}分`}`,
    profileCode: profile.profileCode,
    currentAge,
    terminalAge: forecast.terminalAge,
    opening: pastNodes.length >= TIEBAN_V4_MIN_PAST_NODES
      ? "刻分既定，按数启卷；旧迹列于前，运限录于后。"
      : "刻位虽定，旧迹尚未足卷；此卷只录其所能断。",
    identity,
    ironEvidence,
    pastNodes,
    storyEdges: buildStoryEdges(pastNodes),
    unaskedInsight,
    futureNodes: forecast.nodes,
    closing: "数尽于此，卷合灯明。"
  };
}
