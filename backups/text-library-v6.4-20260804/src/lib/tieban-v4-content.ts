import calibrationData from "../../data/v4/calibration-clauses.json";
import constraintData from "../../data/v4/constraints.json";
import factData from "../../data/v4/facts.json";
import fateData from "../../data/v4/fate-clauses.json";

import { EVENT_BY_ID } from "@/lib/events";
import type { EventDomain } from "@/lib/types";
import type { AtomicFact, TiebanClause, TiebanMutualExclusionConstraint } from "@/lib/tieban-v4-types";

interface RawFact {
  id: string;
  legacyEventId: string | null;
  domain: EventDomain;
  domainTitle: string;
  label: string;
  subject: string;
  predicate: string;
  timeWindow: { minAge: number; maxAge: number | null; label: string };
  applicability: {
    minCurrentAge: number;
    requiredContexts?: NonNullable<AtomicFact["applicability"]>["requiredContexts"];
    excludedContexts?: NonNullable<AtomicFact["applicability"]>["excludedContexts"];
    questionMode?: NonNullable<AtomicFact["applicability"]>["questionMode"];
  };
  evidencePolicy?: AtomicFact["evidencePolicy"];
  sensitivity: "ordinary" | "private" | "intense";
  mutualExclusionGroup: string | null;
  status: string;
}

interface RawClause {
  id: string;
  volumeId: string;
  clauseNumber: number;
  displayNumber: string;
  clauseText: string;
  interpretation: string;
  primaryFactId: string;
  conditionFactIds?: string[];
  category: "六亲考刻" | "定分" | "命局" | "运限";
  periodKind?: "past" | "future" | "lifelong";
  timeScope?: { kind: string; label: string };
  ambiguity: { score: number };
  status: string;
  source: { kind: TiebanClause["sourceKind"]; label: string; provenance: string };
}

interface RawConstraint {
  id: string;
  title: string;
  domain: EventDomain;
  factIds: string[];
}

function subjectFor(raw: RawFact): AtomicFact["subject"] {
  const source = `${raw.subject}|${raw.legacyEventId ?? ""}`;
  if (/父亲|父系/u.test(source)) return "father";
  if (/母亲|母系/u.test(source)) return "mother";
  if (/双亲|父母|parent/u.test(source)) return "parents";
  if (/手足|兄弟|姐妹|sibling/u.test(source)) return "siblings";
  if (/伴侣|配偶|婚|partner/u.test(source)) return "partner";
  if (/子女|子息|child/u.test(source)) return "children";
  if (/本人/u.test(source)) return "self";
  if (/家门|家庭|family/u.test(source)) return "family";
  return "self";
}

function volumeNumber(volumeId: string) {
  const match = /(\d+)$/.exec(volumeId);
  return match ? Number(match[1]) : 1;
}

function quality(ambiguity: number, sensitivity: RawFact["sensitivity"] | undefined) {
  const sensitivityPenalty = sensitivity === "intense" ? 0.04 : sensitivity === "private" ? 0.02 : 0;
  return {
    sensitivity: Math.max(0.78, 0.96 - ambiguity * 0.22 - sensitivityPenalty),
    specificity: Math.max(0.82, 0.975 - ambiguity * 0.18 - sensitivityPenalty / 2)
  };
}

const vernacularReplacements: Array<[RegExp, string]> = [
  [/未进入正式或事实婚姻/gu, "没有结婚，也没有长期以夫妻身份共同生活"],
  [/进入至少三次正式或事实婚姻/gu, "结过至少三次婚，或有过至少三次长期以夫妻身份共同生活的关系"],
  [/进入两次正式或事实婚姻/gu, "结过两次婚，或有过两次长期以夫妻身份共同生活的关系"],
  [/进入一次正式或事实婚姻/gu, "结过一次婚，或有过一次长期以夫妻身份共同生活的关系"],
  [/没有非自愿职业中断/gu, "没有因裁员、辞退、单位停业或其他外部原因失去工作"],
  [/发生至少三次非自愿职业中断/gu, "有过至少三次因裁员、辞退、单位停业或其他外部原因失去工作"],
  [/发生两次非自愿职业中断/gu, "有过两次因裁员、辞退、单位停业或其他外部原因失去工作"],
  [/发生一次非自愿职业中断/gu, "有过一次因裁员、辞退、单位停业或其他外部原因失去工作"],
  [/没有承担主要盈亏的创业经历/gu, "没有创业，也没有独立经营过需要自负盈亏的生意或项目"],
  [/有至少三次承担主要盈亏的创业经历/gu, "有过至少三次创业经历，每次都是自己经营、自负盈亏"],
  [/有两次承担主要盈亏的创业经历/gu, "有过两次创业经历，每次都是自己经营、自负盈亏"],
  [/有一次承担主要盈亏的创业经历/gu, "有过一次创业经历，并且是自己经营、自负盈亏"],
  [/没有生活主线近乎归零后的重大重启/gu, "没有在原有工作、关系或生活安排大幅中断后重新开始"],
  [/经历至少三次生活主线近乎归零后的重大重启/gu, "有过至少三次原有工作、关系或生活安排大幅中断后重新开始的经历"],
  [/经历两次生活主线近乎归零后的重大重启/gu, "有过两次原有工作、关系或生活安排大幅中断后重新开始的经历"],
  [/经历一次生活主线近乎归零后的重大重启/gu, "有过一次原有工作、关系或生活安排大幅中断后重新开始的经历"],
  [/没有显著改变生活的财务冲击/gu, "没有发生过足以明显改变生活安排的重大财务损失或压力"],
  [/没有重要置业/gu, "没有购买过对家庭生活影响较大的房产"],
  [/完成至少三次重要置业/gu, "购买过至少三处对家庭生活影响较大的房产"],
  [/完成两次重要置业/gu, "购买过两处对家庭生活影响较大的房产"],
  [/完成一次重要置业/gu, "购买过一处对家庭生活影响较大的房产"],
  [/没有承担子女养育责任/gu, "没有主要抚养子女"],
  [/承担至少三名子女的养育责任/gu, "主要抚养过至少三名子女"],
  [/承担两名子女的养育责任/gu, "主要抚养过两名子女"],
  [/承担一名子女的养育责任/gu, "主要抚养过一名子女"],
  [/三十五岁前成年后/gu, "成年后到三十五岁前"],
  [/三十岁前未经历重要亲缘离世/gu, "三十岁前没有重要亲人离世"],
  [/三十岁前首次重大亲缘离世者为/gu, "三十岁前，第一位离世的重要亲人是"],
  [/最高完成学历为/gu, "完成的最高学历是"],
  [/较早承担持续的家庭责任/gu, "较早开始长期承担家庭责任"],
  [/父母长期不和、分开，或你同一方亲缘明显疏远/gu, "父母长期不和或分开，或你与父亲或母亲一方的亲属明显疏远"],
  [/一位重要长辈离世或长期离场/gu, "一位重要长辈离世，或长期不再参与家庭生活"],
  [/因兄弟姐妹长期承担照顾、经济或善后责任/gu, "长期照顾兄弟姐妹，或为他们承担较多经济和善后责任"],
  [/连续数月以上照护/gu, "连续几个月或更久照顾"],
  [/转学或进入差异显著的新教育环境/gu, "转学，或进入与以往很不相同的学校或教育环境"],
  [/跨职业主线转轨至少三次/gu, "有过至少三次明显转行"],
  [/跨职业主线转轨两次/gu, "有过两次明显转行"],
  [/跨职业主线转轨一次/gu, "有过一次明显转行"],
  [/没有跨职业主线转轨/gu, "没有明显转行"],
  [/学业中断、延期或明显偏离原定升学路径/gu, "曾经停学、延迟升学，或没有按原计划继续读书"],
  [/跨行业或职业主线发生明显改变/gu, "从一个行业转到另一个行业，或长期从事的职业发生明显改变"],
  [/由普通学业转入职业技能、证照或实务训练路径/gu, "离开普通学校教育，转而学习职业技能、考取证照或接受实际工作训练"],
  [/生活主线近乎归零后的重大重启/gu, "原有工作、关系或生活安排大幅中断后重新开始"],
  [/事业、关系或生活结构崩塌后重新开始/gu, "原有事业、关系或生活安排大幅中断后重新开始"],
  [/持续数月的失眠、焦虑、抑郁或耗竭明显影响功能/gu, "连续几个月受到失眠、焦虑、抑郁或过度疲惫影响，工作、学习或日常生活明显受阻"],
  [/持续一年以上的负债或偿付压力明显影响生活选择/gu, "连续一年以上受到还债压力，日常生活因此受到明显影响"],
  [/一次考试、落榜或录取显著改变后续道路/gu, "一次考试、落榜或录取，明显改变了后来读书、工作或生活的方向"],
  [/一段较早发生的恋爱长期影响其亲密关系判断/gu, "一段较早发生的恋爱，长期影响了后来选择伴侣和处理感情的方式"],
  [/因迁移、转行、婚育或公开角色变化重塑自我身份/gu, "因迁居、转行、婚育或公开身份变化，明显改变了对自己的认识"],
  [/因照顾老人、病人或子女而长期改变职业与身份安排/gu, "因长期照顾老人、病人或子女，改变了工作和家庭安排"],
  [/比同龄人更早进入持续工作或挣钱状态/gu, "比同龄人更早开始长期工作或稳定挣钱"],
  [/自主经营生意或承担独立项目主要盈亏/gu, "自己经营生意，或主要负责一个项目，并对它的盈利和亏损负责"],
  [/正式承担团队管理、负责人或关键决策职责/gu, "开始管理团队、担任负责人或参与重要决策"],
  [/没有正式管理职责/gu, "没有正式管理过团队"],
  [/最高承担小组负责人职责/gu, "最高担任过小组负责人"],
  [/最高承担部门负责人职责/gu, "最高担任过部门负责人"],
  [/已经承担机构级关键决策职责/gu, "已经参与整个机构的重要决策"],
  [/因晋升、奖项、项目或声望获得明显事业跃升/gu, "因晋升、奖项、重要项目或声望，在事业上有明显提升"],
  [/收入、利润或可支配资产在短期内显著增长/gu, "收入、利润或自己可以使用的资产在短期内明显增加"],
  [/一位重要师长或贵人在关键(?:节点|时刻)提供决定性帮助/gu, "一位重要师长或贵人曾在关键时刻相助，这份帮助直接改变了后来的选择"],
  [/最大财务冲击为/gu, "对生活影响最大的财务问题是"],
  [/收入中长期有较大部分用于供养亲属/gu, "长期将收入中较大的一部分用于供养亲属"],
  [/你、家庭或经营事业经历破产、清算或接近资不抵债/gu, "你个人、你的家庭或你经营的事业曾破产、清算，或接近资不抵债"],
  [/因裁员、辞退或外部原因发生非自愿职业中断/gu, "因裁员、辞退、单位停业或其他外部原因失去工作"],
  [/非自愿职业中断/gu, "因外部原因失去工作"],
  [/承担主要盈亏的创业经历/gu, "自己承担主要盈利和亏损的创业经历"],
  [/显著改变生活的财务冲击/gu, "足以明显改变生活安排的重大财务损失或压力"],
  [/正式或事实婚姻/gu, "登记结婚、举行婚礼或长期以夫妻身份共同生活"],
  [/重要亲密关系/gu, "重要恋爱或伴侣关系"],
  [/正式法律程序/gu, "诉讼、仲裁或刑事程序"],
  [/你或家庭卷入诉讼、仲裁、报警处理或重要法律争议/gu, "你或家人卷入诉讼、仲裁、报警处理或重要法律争议"],
  [/子女出生、收养或承担主要养育责任并改变(?:生活结构|日常生活)/gu, "因子女出生、收养或开始主要抚养子女，日常生活发生明显改变"],
  [/因重大经历显著改变宗教、哲学或人生信念/gu, "一次重大经历明显改变了宗教、哲学或人生信念"],
  [/因再婚、继亲或长期同住关系形成重组家庭/gu, "因再婚、继亲或长期同住，组成了有继父母、继子女或其他长期同住成员的新家庭"],
  [/已具资格或承担职责后仍遭遇明显晋升受阻/gu, "已经具备资格或承担相应职责，却仍未能顺利晋升"],
  [/停业、清盘或重大失败/gu, "停业、清算或遭遇重大失败"],
  [/获得一笔显著进项/gu, "获得一笔数额较大的收入"],
  [/变更国籍户籍/gu, "变更国籍或户籍"],
  [/海外连续居留/gu, "在海外连续生活"],
  [/开始持续工作/gu, "开始长期工作"],
  [/生活结构/gu, "日常生活"],
  [/亲密关系判断/gu, "选择伴侣和处理感情的方式"],
  [/关键节点/gu, "关键时刻"],
  [/原定升学路径/gu, "原来的升学计划"],
  [/实务训练路径/gu, "实际工作训练"],
  [/后续道路/gu, "后来读书、工作或生活的方向"]
];

export function naturalizeVernacularV4(value: string) {
  let text = value
    .replace(/^所断为[：:]\s*/u, "")
    .replace(/本人/gu, "你")
    .trim();
  for (const [pattern, replacement] of vernacularReplacements) text = text.replace(pattern, replacement);
  return text;
}

const rawFacts = (factData.facts as RawFact[]).filter((fact) => fact.status === "active");
const rawFactById = new Map(rawFacts.map((fact) => [fact.id, fact]));

export const V4_ATOMIC_FACTS: AtomicFact[] = rawFacts.map((fact) => {
  const legacy = fact.legacyEventId ? EVENT_BY_ID[fact.legacyEventId] : undefined;
  return {
    id: fact.id,
    domain: fact.domain,
    domainTitle: fact.domainTitle,
    label: fact.label,
    definition: `${fact.timeWindow.label}，${fact.predicate}。`,
    timeLabel: fact.timeWindow.label,
    semanticFamily: fact.mutualExclusionGroup ?? fact.legacyEventId ?? fact.id.replace(/\.\d+$/u, ""),
    subject: subjectFor(fact),
    earliestAge: fact.timeWindow.minAge,
    latestAge: fact.timeWindow.maxAge,
    minCurrentAge: fact.applicability.minCurrentAge,
    baseRate: fact.mutualExclusionGroup ? 0.25 : legacy?.baseRate ?? 0.22,
    salience: legacy?.salience ?? (fact.mutualExclusionGroup ? 4 : 3),
    mutualExclusionGroup: fact.mutualExclusionGroup,
    applicability: {
      requiredContexts: fact.applicability.requiredContexts ?? [],
      excludedContexts: fact.applicability.excludedContexts ?? [],
      questionMode: fact.applicability.questionMode ?? "ask"
    },
    evidencePolicy: fact.evidencePolicy
  };
});

function mapClause(raw: RawClause): TiebanClause {
  const fact = rawFactById.get(raw.primaryFactId);
  const response = quality(raw.ambiguity.score, fact?.sensitivity);
  const interpretation = naturalizeVernacularV4(raw.interpretation).replace(/[。！？]+$/u, "");
  return {
    id: raw.id,
    volume: (volumeNumber(raw.volumeId) - 1) % 12 + 1,
    article: raw.clauseNumber,
    displayCode: raw.displayNumber,
    primaryFactId: raw.primaryFactId,
    kind: raw.periodKind === "future"
      ? "future"
      : raw.periodKind === "past"
        ? "past"
        : raw.category === "命局"
          ? "present"
          : "calibration",
    text: `${raw.clauseText.replace(/在在/gu, "在").replace(/[。；，]$/u, "")}。`,
    interpretation: `${interpretation}。`,
    ambiguity: raw.ambiguity.score,
    sensitivity: response.sensitivity,
    specificity: response.specificity,
    sourceKind: raw.source.kind,
    sourceNote: `${raw.source.label}；${raw.source.provenance}`,
    category: raw.category,
    conditionFactIds: raw.conditionFactIds
  };
}

export const V4_CALIBRATION_CLAUSES: TiebanClause[] = (calibrationData.clauses as RawClause[])
  .filter((clause) => clause.status === "active" && rawFactById.has(clause.primaryFactId))
  .map(mapClause);

export const V4_FATE_CLAUSES: TiebanClause[] = (fateData.clauses as RawClause[])
  .filter((clause) => clause.status === "active" && rawFactById.has(clause.primaryFactId))
  .map(mapClause);

export const V4_CONSTRAINTS: TiebanMutualExclusionConstraint[] = (constraintData.constraints as RawConstraint[])
  .filter((constraint) => constraint.factIds.length >= 2 && constraint.factIds.every((factId) => rawFactById.has(factId)))
  .map((constraint) => ({ id: constraint.id, title: constraint.title, domain: constraint.domain, factIds: [...constraint.factIds] }));
