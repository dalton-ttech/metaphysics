import { DOMAIN_META, EVENT_BY_ID, getAge } from "@/lib/events";
import { buildProfile } from "@/lib/engine";
import type { DecoderSession, DestinyBook, DestinyChapter, EventDomain, ProfileEvent } from "@/lib/types";

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

function topForDomains(events: ProfileEvent[], domains: EventDomain[], limit = 4) {
  return events.filter((item) => domains.includes(EVENT_BY_ID[item.eventId].domain)).slice(0, limit);
}

function labels(events: ProfileEvent[]) {
  return events.map((item) => EVENT_BY_ID[item.eventId].label);
}

function evidenceText(events: ProfileEvent[]) {
  const names = labels(events);
  return names.length > 0 ? names.join("、") : "本轮确认与排除所得的边界";
}

function averageConfidence(events: ProfileEvent[], fallback = 58) {
  if (events.length === 0) return fallback;
  return Math.round(events.reduce((sum, event) => sum + event.probability, 0) / events.length * 100);
}

function careerChapter(events: ProfileEvent[], age: number): DestinyChapter {
  const names = evidenceText(events);
  const expansion = events.filter((item) => EVENT_BY_ID[item.eventId].futureSignal === "expansion").length;
  const risk = events.filter((item) => EVENT_BY_ID[item.eventId].futureSignal === "risk").length;
  const isExpansion = expansion >= risk;
  return {
    id: "career-wealth",
    title: "事业财脉",
    horizon: `${age + 1}—${age + 5} 岁`,
    verse: isExpansion ? "旧路已知深浅，新局要在一处聚光。财随主事来，不随杂念走。" : "财路先过窄门，去旧耗、清旧账，才有下一次真正起势。",
    interpretation: events.length === 0
      ? "本轮确认旧事没有提供事业或财务方面的直接证据。本章不反推任何过去节点，只保留三个未来观察条件；后续若补充了可核实的职业与资产经历，再提高这一章的个性化程度。"
      : isExpansion
      ? `由${names}这几条旧线看，你后面的事业不是靠频繁换局，而是把已经验证过的能力集中到一个更有主导权的位置。未来五年会有一次位置或收入台阶，关键在于敢不敢舍掉次要方向。`
      : `由${names}可见，未来数年的第一课不是扩张，而是修复现金流、合作边界与身体承载。只要先把旧耗口收住，后续仍会出现一次重启；若继续同时承担过多责任，财运会被反复分流。`,
    triggers: isExpansion ? ["主导一个可量化结果", "只保留一条主事业线", "贵人或旧合作关系重新出现"] : ["停止无效负债或投入", "重签合作边界", "先恢复稳定现金流"],
    confidence: averageConfidence(events),
    evidenceEventIds: events.map((event) => event.eventId)
  };
}

function relationshipChapter(events: ProfileEvent[], age: number): DestinyChapter {
  const names = evidenceText(events);
  const rupture = events.some((item) => ["rel_major_breakup", "rel_divorce", "rel_betrayal", "fam_parental_distance"].includes(item.eventId));
  return {
    id: "relationship-family",
    title: "情缘家门",
    horizon: `${age}—${age + 8} 岁`,
    verse: rupture ? "旧缘教你识人，新缘要你识己。门可再开，但钥匙不能交得太早。" : "情缘贵在同路，不贵在喧响；家门越稳，彼此越能见真心。",
    interpretation: events.length === 0
      ? "本轮确认旧事没有提供关系或家庭方面的直接证据。本章不把婚恋、子女或家门变化写成你的过去，只保留责任分工、共同财务与长期承诺这三类未来观察条件。"
      : rupture
      ? `${names}说明你对关系的判断已经被旧事重塑。后面的情缘会少一些冲动，多一些筛选；真正能留下的人，必须在责任、金钱和困难时仍保持一致。若已有伴侣，未来的关口不在感情浓淡，而在家庭分工和共同财务。`
      : `${names}构成较强的稳定关系倾向。往后家运会因为一次共同决定而重新排布，可能是婚姻、子女、置业或照护责任。你越能提前说清边界，关系越能成为助力而非牵制。`,
    triggers: rupture ? ["关系从模糊转为明确", "共同财务被摆上桌面", "旧人或旧模式再次出现"] : ["共同置业或迁居", "子女与照护安排", "两人形成长期共同目标"],
    confidence: averageConfidence(events),
    evidenceEventIds: events.map((event) => event.eventId)
  };
}

function healthChapter(events: ProfileEvent[], age: number): DestinyChapter {
  const names = evidenceText(events);
  const hasMajorHistory = events.some((item) => EVENT_BY_ID[item.eventId].salience >= 5);
  return {
    id: "health-risk",
    title: "身心关口",
    horizon: `${age + 2}—${age + 12} 岁`,
    verse: hasMajorHistory ? "旧疾未必重来，旧因却会换形。劳心若久，身体自会替你鸣钟。" : "身心如弦，不怕一时用力，只怕多年不曾松手。",
    interpretation: events.length === 0
      ? "本轮确认旧事没有提供身心健康方面的直接证据。本章不反推病史，也不把某种症状当成既成事实；只保留睡眠、持续压力与照护责任这三类未来观察条件。"
      : `从${names}来看，你后半程的健康不是单看某一病名，而是看压力、睡眠、照护责任和旧伤如何叠加。未来会有一个阶段迫使你重新安排作息或治疗；越早处理持续信号，越能把这道关口变成生活结构的更新。`,
    triggers: ["长期睡眠或情绪信号", "旧症反复或需要复查", "家庭照护责任突然增加"],
    confidence: averageConfidence(events, 54),
    evidenceEventIds: events.map((event) => event.eventId)
  };
}

function reinventionChapter(events: ProfileEvent[], age: number): DestinyChapter {
  const names = evidenceText(events);
  return {
    id: "reinvention",
    title: "迁动变局",
    horizon: `${age + 3}—${age + 15} 岁`,
    verse: "命不是一条直线。真正的转运，常先以离开旧位置的样子出现。",
    interpretation: events.length === 0
      ? "本轮确认旧事没有提供迁居、转行或身份重组方面的直接证据。本章不替你补写过去，只把跨城市机会、旧身份松动与责任重排列为未来观察条件。"
      : `${names}显示你的人生本就带有“换境而生”的结构。未来还会有一次较大的身份或居住变化：可能是迁居、转行、事业重组，也可能是从长期责任中抽身。它不是偶然插曲，而是后半生重新分配时间与权力的节点。`,
    triggers: ["旧身份已无法容纳新能力", "跨城市或跨领域机会", "一次失去迫使你重新排序"],
    confidence: averageConfidence(events, 57),
    evidenceEventIds: events.map((event) => event.eventId)
  };
}

function laterLifeChapter(events: ProfileEvent[], age: number): DestinyChapter {
  const names = evidenceText(events);
  return {
    id: "later-life",
    title: "后运归处",
    horizon: `${Math.max(age + 10, 50)} 岁以后`,
    verse: "前程争的是位置，后程守的是心安。你最终留下的，不只是财，也是能替人定局的经验。",
    interpretation: events.length === 0
      ? "本轮没有足够的已确认旧事支撑后运归处的个性化判断。因此这一章不描述你的既往，只保留角色转变、资产安排与经验传承三个长期观察方向。"
      : `由${names}回看，你的后运不会完全退到安静处，更像从亲自冲锋转为掌舵、传承或照应家门。早年的责任与转折，会在晚些时候变成判断力。若能在中年前后完成财务与关系的边界重整，后程会比前程稳定。`,
    triggers: ["从执行者转为决策或传承者", "资产与家业重新安排", "把个人经验沉淀成长期作品或方法"],
    confidence: averageConfidence(events, 55),
    evidenceEventIds: events.map((event) => event.eventId)
  };
}

export function buildDestinyBook(session: DecoderSession, confirmedEventIds: string[] = []): DestinyBook {
  const profile = buildProfile(session);
  const ranked = profile.domains.flatMap((domain) => domain.events).sort((a, b) => b.probability - a.probability);
  const unique = Array.from(new Map(ranked.map((item) => [item.eventId, item])).values());
  const confirmed = confirmedEventIds
    .map((eventId) => unique.find((item) => item.eventId === eventId) ?? {
      eventId,
      probability: 0.99,
      confidence: "high" as const,
      evidenceCount: 3
    })
    .filter((item) => EVENT_BY_ID[item.eventId]);
  const evidence = confirmed;
  const age = getAge(session.intake.birthDate);
  const career = topForDomains(evidence, ["career", "wealth", "law_social"], 5);
  const relationship = topForDomains(evidence, ["relationship", "family", "turning_point"], 5);
  const health = topForDomains(evidence, ["health", "family"], 4);
  const reinvention = evidence.filter((item) => ["reinvention", "recovery", "expansion"].includes(EVENT_BY_ID[item.eventId].futureSignal)).slice(0, 5);
  const later = evidence.slice(0, 6);
  const sealSeed = `${session.intake.birthDate}|${session.intake.birthplace}|${session.answers.map((answer) => answer.answer).join("")}`;
  const rootLabels = evidence.slice(0, 4).map((item) => EVENT_BY_ID[item.eventId].label).join("、");
  const displayName = session.intake.name.trim() || "无名氏";

  return {
    title: `${displayName} · 后运命书`,
    seal: `命籍 ${stableHash(sealSeed)}`,
    opening: confirmed.length
      ? `此书以你亲自确认的${rootLabels}为根，不从空处起断。前尘已经落印，后运则从这些选择与惯性继续展开。`
      : "本轮八项验真没有留下肯定旧迹。此书只沿用你明确排除的边界与整套答卷，不把候选事件写成既成事实。",
    chapters: [
      careerChapter(career, age),
      relationshipChapter(relationship, age),
      healthChapter(health, age),
      reinventionChapter(reinvention, age),
      laterLifeChapter(later, age)
    ],
    closing: `命有旧势，人有新择。真正需要记住的不是某一句吉凶，而是哪些条件一旦出现，你便知道自己正走到哪一道门前。`
  };
}

export function getProfileLine(eventId: string) {
  const event = EVENT_BY_ID[eventId];
  return `${DOMAIN_META[event.domain].title} · ${event.label}：${event.description}`;
}
