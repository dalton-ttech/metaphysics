import type { EventDomain } from "@/lib/types";
import type {
  AtomicFact,
  FutureFateNode,
  PastLifeNode,
  TiebanBook,
  TiebanClause,
  TiebanSession
} from "@/lib/tieban-v3-types";

export const TIEBAN_HIGH_CONFIDENCE = 0.9;
export const TIEBAN_MIN_PAST_NODES = 6;
export const TIEBAN_MAX_PAST_NODES = 10;

export interface TiebanBookCompilerOptions {
  highConfidenceThreshold?: number;
  maxPastNodes?: number;
  maxFutureNodes?: number;
}

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

const consequenceByDomain: Record<EventDomain, string> = {
  family: "此事改变了家中往后的分工与亲疏，也成为后来行事取舍的一层底色。",
  education_mobility: "自此见识与生活半径渐开，后来所走的道路亦由此转向。",
  career: "此后事业的节奏与选择发生改变，也重新划定了进退轻重。",
  wealth: "此事使收支与资源安排重定，往后的财务取舍更见分寸。",
  relationship: "此后看待亲密与承诺的方式有所改变，也影响往后的聚散选择。",
  health: "此事使生活节律与精力分配重新调整，往后更重视张弛之度。",
  law_social: "此后待人接物更辨边界，名声、人情与规则之间亦更谨慎。",
  turning_point: "这一节点承前启后，使旧路渐止，新局由此展开。"
};

const episodeOpeners: Record<EventDomain, string[]> = {
  family: ["家门的次序在这里改过一回", "这一程先动的是家中人事", "旧宅之内曾有一事牵动全局"],
  education_mobility: ["求学与行路在这里分了方向", "原定的书路曾在此处转弯", "一次换境，把后来的道路推向别处"],
  career: ["事业的进退曾在这里落下重笔", "这一阶段，职位与所业不再照旧", "原有的营生格局在此处发生实变"],
  wealth: ["财帛的来去在这里形成关口", "一笔重要得失曾改动家计", "这一阶段，钱财与责任同时压到眼前"],
  relationship: ["情缘的聚散在这里留下实痕", "一段重要关系曾改动生活次序", "这一程的去留，不只停在情分之上"],
  health: ["身体曾在这里发出明确警讯", "这一程因伤病而改变日常", "身心的旧序曾被一次关口打断"],
  law_social: ["人情与规则在这里有过正面碰撞", "一场是非曾迫使命主重划边界", "近身关系在此处显出真假"],
  turning_point: ["旧局在这里收束，新局由此起头", "人生的主线曾在此处重新排定", "这一程前后，命主已不再走原来的路"]
};

const episodeClosers: Record<EventDomain, string[]> = {
  family: [
    "家中后来如何分责、如何亲疏，都受此事牵动。",
    "此后家门的轻重次序，便与从前不同。",
    "往后许多个人取舍，都绕不开这一段家事。",
    "这件事没有停在当时，余波仍落在家中人事之间。",
    "从此家中各人的位置与责任，渐渐重新排定。"
  ],
  education_mobility: [
    "此后所见的人与路，已与从前不同。",
    "后来每一次求学与迁动，都带着这一程留下的方向。",
    "自此眼界与去处一同改换，原定之路不再照旧。",
    "这一步虽在早年，却把后来的生活半径推向了别处。",
    "往后的选择由此多了一条此前未见的路。"
  ],
  career: [
    "往后的进退与取舍，因而另有章法。",
    "此后事业再逢关口，命主已不再照旧路应对。",
    "这一事改了工作的节奏，也改了命主对位置的判断。",
    "后来所择之业、所任之责，都留有这一程的痕迹。",
    "自此事业不只论得失，更论何处值得久留。"
  ],
  wealth: [
    "此后的收支与取舍，都带着这笔得失留下的分寸。",
    "从此论财，不只看进项，也更看能否守住。",
    "往后的家计安排，便比从前多了一重谨慎。",
    "这一次财事虽已过去，留下的尺度却沿用至今。",
    "自此每逢大额进退，命主心中已有自己的轻重。"
  ],
  relationship: [
    "后来再谈去留与承诺，心中已有新的尺度。",
    "此后所求之缘，不再只是相遇，也更在意能否同行。",
    "这段关系留下的，不止聚散，还有往后识人的分寸。",
    "自此亲密之中何为可守、何为当止，渐渐分明。",
    "往后每逢情缘定夺，这一程仍在心中留有回声。"
  ],
  health: [
    "自此作息、精力与生活安排，都不得不重新调整。",
    "身体留下的提醒，后来一直影响着日常节律。",
    "这一关过去以后，命主对劳逸与承受已有新的界线。",
    "此后再遇耗损之时，身体往往先于心意作出回应。",
    "这段休养并未白过，往后的生活次序由此重整。"
  ],
  law_social: [
    "往后待人、合作与边界，因而更见分明。",
    "这件事使人情不再只凭口诺，也更看重凭据与分寸。",
    "此后再入众人之局，命主已懂得先辨远近。",
    "一场人事过去，留下的是更清楚的规则与界线。",
    "往后的交往取舍，便少了一分轻信，多了一分审度。"
  ],
  turning_point: [
    "旧路到这里渐收，另一程才真正展开。",
    "自此身份与生活重心同时转向，旧局难再复原。",
    "这一变没有留下回头路，却也腾出了新的位置。",
    "往后的许多选择，都从这一处转折生出。",
    "回看前程，这里正是旧局止、新局起的分界。"
  ]
};

const episodeBridges = [
  (predicate: string) => `其间确有${predicate}之事。`,
  (predicate: string) => `这段年岁所应之事，是${predicate}。`,
  (predicate: string) => `落到实处，便是${predicate}。`,
  (predicate: string) => `当时并非小变，而有${predicate}之实。`,
  (predicate: string) => `其事可直断为${predicate}。`
];

const futureThemes: Record<EventDomain, { title: string; verse: string; change: string; result: string }> = {
  family: {
    title: "家门再定",
    verse: "旧枝各有向，新序复成林。",
    change: "家中责任将再次分配，一项长期悬而未决的安排会逐步落定",
    result: "家门关系由牵扯转为有序，命主也能收回一部分心力"
  },
  education_mobility: {
    title: "行路开新",
    verse: "渡口潮初定，前山别有程。",
    change: "学习、迁居或远行之中会出现一次明确选择，生活半径随之改变",
    result: "新环境带来新的合作关系，并形成一条可持续的成长路径"
  },
  career: {
    title: "事业换轨",
    verse: "旧局收残子，新盘落要津。",
    change: "事业职责或所处平台将有一次实质调整，原有积累被重新调用",
    result: "命主取得更清楚的主导权，工作成果也更容易沉淀为长期位置"
  },
  wealth: {
    title: "财途归整",
    verse: "散处当收束，涓流可入川。",
    change: "收入结构与重要支出将重新排布，零散资源开始向核心事项集中",
    result: "财务波动逐渐收窄，并形成一项更稳固的积累"
  },
  relationship: {
    title: "情缘定向",
    verse: "旧语终须解，同舟各问心。",
    change: "一段重要关系将进入明确阶段，含混已久的去留或承诺需要作出决定",
    result: "关系由试探转为定向；若不能同行，也会完成清楚的分界"
  },
  health: {
    title: "身心调序",
    verse: "缓弦方致远，静水自回澜。",
    change: "生活节律会因一项持续性的调整而改变，精力开始从消耗转向修复",
    result: "日常状态趋于稳定，能够承担更长周期的计划"
  },
  law_social: {
    title: "人事分明",
    verse: "尺素明边界，清名自可持。",
    change: "合作、规则或人情往来中会出现一次边界重订，旧有牵连逐步厘清",
    result: "命主保住应得之位，也避开后续无谓的消耗"
  },
  turning_point: {
    title: "新局始开",
    verse: "旧门随岁掩，一径向明开。",
    change: "一项延续已久的旧局将结束，新的生活重心随之确立",
    result: "前路不再两面牵制，命主可以集中力量完成下一阶段的积累"
  }
};

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value!)));
}

function ageAt(birthDate: string, timestamp: number) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const asOf = new Date(timestamp);
  if (!parts || Number.isNaN(asOf.getTime())) return 30;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  let age = asOf.getUTCFullYear() - year;
  if (asOf.getUTCMonth() + 1 < month || (asOf.getUTCMonth() + 1 === month && asOf.getUTCDate() < day)) age -= 1;
  return Math.max(0, age);
}

function ageRange(fact: AtomicFact) {
  if (fact.latestAge === null) return `${fact.earliestAge}岁以后`;
  if (fact.latestAge === fact.earliestAge) return `${fact.earliestAge}岁`;
  return `${fact.earliestAge}—${fact.latestAge}岁`;
}

function factSort(left: AtomicFact, right: AtomicFact) {
  return left.earliestAge - right.earliestAge ||
    (left.latestAge ?? Number.MAX_SAFE_INTEGER) - (right.latestAge ?? Number.MAX_SAFE_INTEGER) ||
    right.salience - left.salience ||
    left.id.localeCompare(right.id);
}

function evidenceForFact(session: TiebanSession, factId: string, clauseById: Map<string, TiebanClause>) {
  return session.answers
    .filter((record) => record.answer === "resonates" && clauseById.get(record.clauseId)?.primaryFactId === factId)
    .map((record) => record.clauseId)
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort((left, right) => left.localeCompare(right));
}

function predicateOnly(definition: string) {
  return definition.replace(/^.*?，/u, "").replace(/[。！？]+$/u, "");
}

function episodeSummary(fact: AtomicFact, domainOrdinal: number) {
  const openers = episodeOpeners[fact.domain];
  const opener = openers[domainOrdinal % openers.length];
  const predicate = predicateOnly(fact.definition);
  const bridge = episodeBridges[domainOrdinal % episodeBridges.length](predicate);
  const closers = episodeClosers[fact.domain];
  const closer = closers[domainOrdinal % closers.length];
  return `${opener}。${bridge}${closer}`;
}

function compilePastNodes(
  session: TiebanSession,
  facts: AtomicFact[],
  clauses: TiebanClause[],
  threshold: number,
  limit: number
) {
  const clauseById = new Map(clauses.map((clause) => [clause.id, clause]));
  const strongestByFamily = new Map<string, { fact: AtomicFact; probability: number; evidenceClauseIds: string[] }>();

  for (const fact of facts) {
      const probability = session.factProbabilities[fact.id] ?? 0;
      const evidenceClauseIds = evidenceForFact(session, fact.id, clauseById);
      if (probability < threshold || evidenceClauseIds.length === 0 || (session.factEvidence[fact.id] ?? 0) < 1) continue;
      const familyId = fact.id.replace(/\.\d+$/u, "");
      const current = strongestByFamily.get(familyId);
      if (!current ||
        probability > current.probability ||
        (probability === current.probability && evidenceClauseIds.length > current.evidenceClauseIds.length) ||
        (probability === current.probability && evidenceClauseIds.length === current.evidenceClauseIds.length && fact.salience > current.fact.salience)) {
        strongestByFamily.set(familyId, { fact, probability, evidenceClauseIds });
      }
  }

  const domainOrdinals = new Map<EventDomain, number>();
  return [...strongestByFamily.values()]
    .sort((left, right) => factSort(left.fact, right.fact))
    .slice(0, limit)
    .map(({ fact, probability, evidenceClauseIds }): PastLifeNode => {
      const domainOrdinal = domainOrdinals.get(fact.domain) ?? 0;
      domainOrdinals.set(fact.domain, domainOrdinal + 1);
      return {
        id: `past-${fact.id}`,
        factId: fact.id,
        domain: fact.domain,
        title: `${domainTitles[fact.domain]}·${fact.label}`,
        ageRange: ageRange(fact),
        subject: subjectLabels[fact.subject],
        summary: episodeSummary(fact, domainOrdinal),
        aftereffect: consequenceByDomain[fact.domain],
        probability,
        evidenceClauseIds
      };
    });
}

function futureHorizon(currentAge: number, index: number) {
  const start = currentAge + 1 + index * 3;
  return `${start}—${start + 2}岁`;
}

function polishFutureClause(text: string) {
  return text
    .replace(/^后运再逢(.+?)之类，/u, "$1之象再临，")
    .replace(/^中岁以后，(.+?)所得之经验，可用于/u, "中岁以后，$1旧势再动；旧鉴在前，可")
    .replace(/后运反见/gu, "前路反见")
    .replace(/之类/gu, "之象");
}

function compileFutureNodes(
  session: TiebanSession,
  pastNodes: PastLifeNode[],
  fateClauses: TiebanClause[],
  limit: number
) {
  const currentAge = ageAt(session.intake.birthDate, session.completedAt ?? session.createdAt);
  const selected = pastNodes
    .filter((node, index, all) => all.findIndex((item) => item.domain === node.domain) === index)
    .slice(0, limit);
  const futureByFact = new Map<string, TiebanClause>();
  [...fateClauses]
    .filter((clause) => clause.kind === "future")
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((clause) => {
      if (!futureByFact.has(clause.primaryFactId)) futureByFact.set(clause.primaryFactId, clause);
    });

  return selected.map((pastNode, index): FutureFateNode => {
    const theme = futureThemes[pastNode.domain];
    const fateClause = futureByFact.get(pastNode.factId);
    const horizon = futureHorizon(currentAge, index);
    return {
      id: `future-${pastNode.factId}`,
      title: theme.title,
      horizon,
      verse: fateClause ? polishFutureClause(fateClause.text) : theme.verse,
      reading: `${horizon}，承接早年“${pastNode.title.split("·").at(-1)}”所成的经验，${theme.change}。`,
      consequence: `${theme.result}。`,
      evidenceFactIds: [pastNode.factId]
    };
  });
}

/**
 * 编纂命书只使用已经由“应验”条文支持的高置信事实。
 * 证据不足时 pastNodes 可以少于六条，调用方应继续考刻，而不是补写旧事。
 */
export function buildTiebanBook(
  session: TiebanSession,
  facts: AtomicFact[],
  clauses: TiebanClause[],
  fateClauses: TiebanClause[] = [],
  options: TiebanBookCompilerOptions = {}
): TiebanBook {
  const threshold = Math.min(0.99, Math.max(0.5, options.highConfidenceThreshold ?? TIEBAN_HIGH_CONFIDENCE));
  const maxPastNodes = clampInteger(options.maxPastNodes, TIEBAN_MAX_PAST_NODES, 1, TIEBAN_MAX_PAST_NODES);
  const maxFutureNodes = clampInteger(options.maxFutureNodes, 4, 0, 6);
  const pastNodes = compilePastNodes(session, facts, clauses, threshold, maxPastNodes);
  const futureNodes = compileFutureNodes(session, pastNodes, fateClauses, maxFutureNodes);
  const candidate = session.candidates.find((item) => item.id === session.lockedCandidateId) ?? session.candidates[0];
  const exactTime = candidate?.clockTime ?? "时刻未定";
  const keLabel = candidate
    ? `第${candidate.keIndex}刻·${candidate.minuteWithinKe === 0 ? "正" : `${candidate.minuteWithinKe}分`}`
    : "尚待复算";
  const displayName = session.intake.name.trim() || "命主";

  return {
    title: `${displayName}·铁板定刻命书`,
    seal: candidate ? `定刻 ${candidate.id}` : "刻未成",
    exactTime,
    keLabel,
    opening: pastNodes.length >= TIEBAN_MIN_PAST_NODES
      ? "刻既定，旧事依卷而录；前因既明，后程循迹而书。"
      : "旧事所应尚未成卷，已验者据实而录，其余留待复算。",
    pastNodes,
    futureNodes,
    closing: futureNodes.length > 0
      ? "旧迹为根，后程为势；数有转圜，行止仍在人心。"
      : "旧迹未足成篇，暂收此卷，俟复算后再续后程。"
  };
}

export const compileTiebanBook = buildTiebanBook;
