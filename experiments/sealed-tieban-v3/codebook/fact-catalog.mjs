import {
  EVENT_PUBLIC_FIELDS,
  EVENT_ROWS
} from "../../sealed-synthetic-v1/config/generator-config.v1.mjs";

const EVENT_FACTS = EVENT_ROWS.map(([eventId, label, domain, , earliestAge]) => {
  const [description, cue, salience, sensitivity] = EVENT_PUBLIC_FIELDS[eventId];
  return {
    id: `fact:${eventId}`,
    label,
    domain,
    description,
    cue,
    salience,
    sensitivity,
    predicate: { type: "event_exists", eventId },
    earliestAge
  };
});

const TIMING_FACTS = [
  ["fact:career_early_work_before_18", "十八岁前已工作", "career", "在十八岁以前已经开始稳定工作或持续挣钱。", "较同龄人更早入世，只核年龄：十八岁以前是否已持续工作或挣钱？", 4, "ordinary", "career_early_work", 18],
  ["fact:move_left_hometown_before_22", "二十二岁前离乡", "education_mobility", "在二十二岁以前已离开成长地长期发展。", "故土之外另起一程，只核年龄：二十二岁以前是否已长期离乡？", 4, "ordinary", "move_left_hometown", 22],
  ["fact:edu_school_transfer_before_12", "十二岁前转学", "education_mobility", "在十二岁以前有过明显转学或教育环境变化。", "书案早换，只核年龄：十二岁以前是否转学或明显更换教育环境？", 3, "ordinary", "edu_school_transfer", 12],
  ["fact:health_hospital_before_18", "十八岁前住院手术", "health", "在十八岁以前曾住院、手术或接受较重治疗。", "少时身有一关，只核年龄：十八岁以前是否住院、手术或接受较重治疗？", 5, "intense", "health_hospital", 18],
  ["fact:rel_formative_love_before_20", "二十岁前深刻感情", "relationship", "在二十岁以前已有一段长期影响自己的深刻感情。", "情印来得较早，只核年龄：二十岁以前是否已有一段长期影响你的感情？", 4, "private", "rel_formative_love", 20],
  ["fact:rel_marriage_before_28", "二十八岁前成婚", "relationship", "在二十八岁以前已经进入婚姻或事实婚姻。", "家门较早成形，只核年龄：二十八岁以前是否已经进入婚姻？", 5, "private", "rel_marriage", 28],
  ["fact:turn_child_arrival_before_30", "三十岁前育儿", "turning_point", "在三十岁以前已有子女或成为孩子的主要照顾者。", "子息较早入局，只核年龄：三十岁以前是否已有子女或主要照顾孩子？", 5, "private", "turn_child_arrival", 30],
  ["fact:career_switch_before_30", "三十岁前转行", "career", "在三十岁以前已经发生过一次真正的职业转轨。", "业路早改，只核年龄：三十岁以前是否已经真正转过行业或职业主线？", 4, "ordinary", "career_switch", 30],
  ["fact:career_leadership_before_35", "三十五岁前带团队", "career", "在三十五岁以前已正式承担带团队或关键决策责任。", "掌事不算迟，只核年龄：三十五岁以前是否已正式带团队或负责关键结果？", 4, "ordinary", "career_leadership", 35],
  ["fact:wealth_debt_before_30", "三十岁前有长期债务", "wealth", "在三十岁以前已承受持续一年以上的明显债务压力。", "财路早逢逆水，只核年龄：三十岁以前是否已有持续一年以上的明显债务？", 5, "intense", "wealth_debt", 30],
  ["fact:turn_close_death_before_30", "三十岁前经历至亲离世", "turning_point", "在三十岁以前经历过至亲离世并受到长期影响。", "别离来得较早，只核年龄：三十岁以前是否经历至亲离世并长期受其影响？", 5, "intense", "turn_close_death", 30],
  ["fact:turn_restart_before_35", "三十五岁前重大重启", "turning_point", "在三十五岁以前已在重大崩塌后重新建立生活。", "旧局早破又立，只核年龄：三十五岁以前是否已在重大崩塌后重建生活？", 5, "intense", "turn_restart", 35]
].map(([id, label, domain, description, cue, salience, sensitivity, eventId, beforeAge]) => ({
  id,
  label,
  domain,
  description,
  cue,
  salience,
  sensitivity,
  predicate: { type: "event_before", eventId, beforeAge }
}));

export const FACT_CATALOG = [...EVENT_FACTS, ...TIMING_FACTS];

export function buildClauseCodebook() {
  return FACT_CATALOG.map((fact, index) => ({
    id: `TB3-${String(index + 1).padStart(3, "0")}`,
    primaryFactId: fact.id,
    domain: fact.domain,
    label: fact.label,
    proposition: fact.description,
    text: `${fact.cue} 只按这一件事实作答：相应则答“应”，不相应答“不应”，确实记不清答“未明”。`,
    answerOptions: ["应", "不应", "未明"],
    salience: fact.salience,
    sensitivity: fact.sensitivity
  }));
}

export function deriveFactIds(profile) {
  const ages = new Map((profile.events ?? []).map((event) => [event.id, event.age]));
  return FACT_CATALOG.filter((fact) => {
    if (fact.predicate.type === "event_exists") return ages.has(fact.predicate.eventId);
    const age = ages.get(fact.predicate.eventId);
    return age !== undefined && age < fact.predicate.beforeAge;
  }).map((fact) => fact.id);
}

