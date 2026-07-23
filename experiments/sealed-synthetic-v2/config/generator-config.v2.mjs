import { DEFAULT_GENERATOR_CONFIG } from "../../sealed-synthetic-v1/config/generator-config.v1.mjs";

/**
 * v2 deliberately keeps the same 48 top-level truth labels and engineering
 * base weights as v1.1. Forum/social research changes event chains and wording,
 * not population prevalence. This makes the policy comparison interpretable.
 */
export const V2_GENERATOR_CONFIG = structuredClone(DEFAULT_GENERATOR_CONFIG);

V2_GENERATOR_CONFIG.version = "sealed-synthetic-generator-v2.2";
V2_GENERATOR_CONFIG.assumptionNotice =
  "所有发生率与行为参数均为工程模拟假设，不代表真实人群统计；论坛和社媒材料只用于事件模式、事件链与措辞发现。";

V2_GENERATOR_CONFIG.eventModel.conditionalEdges.push(
  { source: "career_job_loss", target: "career_switch", activationBoost: 0.20 },
  { source: "career_job_loss", target: "wealth_debt", activationBoost: 0.18 },
  { source: "wealth_bankruptcy", target: "career_job_loss", activationBoost: 0.18 },
  { source: "turn_inheritance", target: "social_major_conflict", activationBoost: 0.20 },
  { source: "turn_inheritance", target: "wealth_property", activationBoost: 0.18 },
  { source: "rel_betrayal", target: "rel_divorce", activationBoost: 0.22 },
  { source: "rel_divorce", target: "career_switch", activationBoost: 0.12 },
  { source: "move_overseas", target: "turn_identity_shift", activationBoost: 0.20 },
  { source: "edu_school_transfer", target: "turn_identity_shift", activationBoost: 0.12 },
  { source: "fam_caregiving", target: "wealth_family_support", activationBoost: 0.22 }
);

export const LOW_RECALL_PRIORITY = [
  "law_crime_contact",
  "wealth_bankruptcy",
  "turn_inheritance",
  "move_overseas",
  "law_dispute",
  "social_reputation_crisis",
  "rel_divorce",
  "rel_betrayal",
  "edu_study_interruption",
  "turn_spiritual",
  "fam_sibling_duty",
  "health_accident",
  "turn_restart",
  "fam_parental_distance"
];

export const RARE_CROSSCHECK_PAIRS = [
  ["law_crime_contact", "law_dispute"],
  ["wealth_bankruptcy", "turn_inheritance"],
  ["move_overseas", "social_reputation_crisis", "fam_sibling_duty"],
  ["rel_divorce", "rel_betrayal", "turn_spiritual"]
];

export const DIRECT_CUE_VARIANTS = {
  rel_formative_love: [
    "旧情成印，只核影响：你较早经历的一段感情，是否在结束或延续之后仍长期影响你的选择与亲密关系？",
    "不问普通恋爱，只问一段早年的深刻关系：它是否多年以后仍改变你看待承诺、信任或伴侣的方式？"
  ],
  edu_exam_turn: [
    "一纸定途，只核结果：是否有一次关键考试、落榜或录取，实质改变了你后来的学校、城市或职业道路？",
    "回看求学路，是否有一个明确的考试或录取结果，让原本计划的方向从此改道？"
  ],
  law_crime_contact: [
    "尘卷之外，只核一事：你本人或近亲，是否曾因刑事案件被公安、检察或法院正式调查、拘留、审判或执行刑罚？其中任一项真实发生即答“是”。",
    "不论是否愿意称它为‘犯罪经历’，你本人或近亲是否确实被刑事立案调查、限制人身自由或进入审判程序？"
  ],
  wealth_bankruptcy: [
    "财路有枯荣，只核事实：你本人、家庭或所经营事业，是否曾无法正常偿债、进入清算或停业，或资产明显不足以覆盖债务？",
    "你是否经历过资金链断裂、无力按期还款，或公司因财务问题关停，以至生活安排被迫重做？"
  ],
  turn_inheritance: [
    "旧宅与家业只核一事：你是否因继承、放弃继承、分割祖产或承接家业，明显改变财务安排或亲属责任？",
    "亲人离世之后，是否有一笔遗产、房产或家业的取得、让渡或争议，实质改变了你的生活主线？"
  ],
  move_overseas: [
    "山海之外，只核时间：你是否曾在境外连续生活、求学或工作满半年，而非短期旅行？"
  ],
  law_dispute: [
    "公门纸卷只核事实：你本人或家庭是否真正进入过诉讼、仲裁、报警处理或持续较久的法律纠纷？"
  ],
  social_reputation_crisis: [
    "众声起落，只核一事：你是否遭遇过公开指责、网络舆论、单位处分或严重名誉损伤，并持续影响工作或关系？"
  ],
  rel_divorce: [
    "缘分聚散，只核现状：你是否离过婚、连续分居较久，或婚姻事实上已经结束，即使手续尚未办完？",
    "一段婚姻是否曾走到正式离婚或长期实质分开的阶段，并迫使你重排住所、财务或育儿？"
  ],
  rel_betrayal: [
    "旧诺有裂，只核事实：重要伴侣是否曾出轨、长期隐瞒关键事实，或以严重欺骗造成信任破裂？"
  ],
  edu_study_interruption: [
    "书路曾改，只核一事：你的学业是否因家庭、健康、经济或个人选择而休学、退学、延期，或明显偏离原计划？"
  ],
  turn_spiritual: [
    "心路转向，只核持续变化：某次重大经历后，你是否长期转向宗教、玄学、心理疗愈或精神探索，而非短暂好奇？"
  ],
  fam_sibling_duty: [
    "手足之间，只核责任：你是否长期替兄弟姐妹出钱、照料、收拾债务或承担本不属于你的家庭责任？"
  ],
  health_accident: [
    "身有惊关，只核事实：你是否经历过需要治疗、休养，或明显改变生活安排的交通、工作、运动或其他严重意外？"
  ],
  turn_restart: [
    "旧局既破，只核行动：你是否在事业、关系、财务或健康重大崩塌后，重新搭建过工作、住所、关系或日常生活？"
  ],
  fam_parental_distance: [
    "家门远近，只核长期状态：成长中父母是否长期冲突、分居或离异，或你与其中一方长期疏远、很少来往？"
  ],
  edu_school_transfer: [
    "少时换境，只核影响：你是否因转学或教育环境骤变，长期失去原有同伴、归属感或自信？"
  ],
  career_job_loss: [
    "职路曾断，只核事实：你是否被裁员、辞退，或经历一段并非自愿的较长失业？"
  ],
  career_switch: [
    "另起一程，只核方向：你是否在失业、拒绝或项目失败后重新学习，并真正换到另一行业或职业主线？"
  ],
  social_mentor: [
    "一言开路，只核结果：是否有老师、上级、朋友或一次偶然相识，实质带来工作、迁居或重要机会？"
  ],
  fam_caregiving: [
    "灯前守候，只核责任：你是否曾连续数月照护患病或年迈家人，或替他们作过重要医疗与养老决定？"
  ]
};
