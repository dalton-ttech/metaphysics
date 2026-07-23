/**
 * Sealed synthetic cohort generator configuration, version 1.
 *
 * IMPORTANT: every prevalence-like value below is an engineering assumption for
 * simulation coverage. It is not an estimate of any real population rate.
 * Event ids, domains, base weights and earliest ages mirror src/lib/events.ts.
 */

export const EVENT_ROWS = [
  ["fam_early_burden", "早担家责", "family", 0.20, 10, 14, 27],
  ["fam_parental_distance", "父母关系疏离", "family", 0.16, 3, 7, 18],
  ["fam_financial_fall", "家运骤落", "family", 0.18, 5, 10, 25],
  ["fam_elder_loss", "早年失长辈", "family", 0.21, 5, 10, 28],
  ["fam_sibling_duty", "手足牵责", "family", 0.15, 12, 18, 36],
  ["fam_caregiving", "长期照护", "family", 0.14, 16, 25, 55],

  ["edu_school_transfer", "转学换境", "education_mobility", 0.22, 6, 8, 16],
  ["edu_study_interruption", "学业中断", "education_mobility", 0.13, 14, 16, 24],
  ["edu_exam_turn", "考试转折", "education_mobility", 0.30, 14, 16, 23],
  ["move_left_hometown", "离乡发展", "education_mobility", 0.34, 16, 18, 30],
  ["move_repeated", "多次迁居", "education_mobility", 0.18, 8, 20, 42],
  ["move_overseas", "海外经历", "education_mobility", 0.09, 16, 20, 35],

  ["career_early_work", "较早工作", "career", 0.19, 14, 16, 23],
  ["career_switch", "职业转轨", "career", 0.31, 20, 25, 45],
  ["career_leadership", "掌事带人", "career", 0.24, 22, 28, 50],
  ["career_entrepreneurship", "创业自营", "career", 0.16, 20, 27, 48],
  ["career_job_loss", "被动失业", "career", 0.17, 18, 24, 50],
  ["career_major_achievement", "事业跃升", "career", 0.20, 20, 27, 48],

  ["wealth_income_leap", "收入跃升", "wealth", 0.18, 20, 27, 48],
  ["wealth_debt", "债务压力", "wealth", 0.21, 18, 24, 50],
  ["wealth_investment_loss", "投资重损", "wealth", 0.17, 20, 28, 52],
  ["wealth_property", "置业成家", "wealth", 0.26, 21, 27, 52],
  ["wealth_family_support", "长期供养家庭", "wealth", 0.29, 18, 23, 55],
  ["wealth_bankruptcy", "破产或资不抵债", "wealth", 0.06, 20, 29, 53],

  ["rel_formative_love", "早年深情", "relationship", 0.27, 14, 17, 27],
  ["rel_long_single", "长期单身", "relationship", 0.30, 21, 25, 50],
  ["rel_major_breakup", "重大分手", "relationship", 0.29, 16, 20, 40],
  ["rel_marriage", "进入婚姻", "relationship", 0.34, 20, 25, 42],
  ["rel_divorce", "婚姻离合", "relationship", 0.10, 23, 30, 50],
  ["rel_betrayal", "信任破裂", "relationship", 0.14, 16, 21, 45],

  ["health_hospital", "住院或手术", "health", 0.25, 3, 12, 55],
  ["health_chronic", "长期慢性问题", "health", 0.23, 8, 18, 55],
  ["health_accident", "严重意外", "health", 0.15, 5, 14, 45],
  ["health_burnout", "身心耗竭", "health", 0.28, 15, 24, 48],
  ["health_reproductive", "生育关口", "health", 0.20, 18, 25, 42],
  ["health_recovery", "大病后恢复", "health", 0.15, 12, 22, 52],

  ["law_dispute", "诉讼纠纷", "law_social", 0.10, 16, 25, 52],
  ["law_crime_contact", "刑事事件牵连", "law_social", 0.04, 14, 22, 52],
  ["social_reputation_crisis", "名誉风波", "law_social", 0.08, 15, 22, 48],
  ["social_major_conflict", "重大人际冲突", "law_social", 0.22, 14, 21, 48],
  ["social_mentor", "贵人提携", "law_social", 0.31, 12, 18, 42],
  ["social_partnership_break", "合作决裂", "law_social", 0.13, 20, 28, 52],

  ["turn_child_arrival", "子女到来", "turning_point", 0.31, 18, 25, 43],
  ["turn_close_death", "至亲离世", "turning_point", 0.20, 14, 24, 58],
  ["turn_inheritance", "继承与遗产", "turning_point", 0.08, 18, 30, 60],
  ["turn_spiritual", "信念转向", "turning_point", 0.17, 14, 22, 52],
  ["turn_restart", "崩塌后重启", "turning_point", 0.16, 18, 27, 52],
  ["turn_identity_shift", "身份重塑", "turning_point", 0.24, 15, 22, 48]
];

// [plain description, readable verification cue, salience, sensitivity, related ids]
// Kept beside the numeric model so the sealed server needs no import from the main app.
export const EVENT_PUBLIC_FIELDS = {
  fam_early_burden: ["少年或青年阶段较早承担家庭责任。", "你是否比同龄人更早替家里扛事、做决定或照顾他人？", 4, "private", ["fam_sibling_duty", "fam_caregiving", "wealth_family_support"]],
  fam_parental_distance: ["父母长期冲突、分居、离异，或与一方关系明显疏远。", "你的成长中，父母是否长期不和、分开，或你与其中一方明显疏远？", 5, "intense", ["rel_long_single", "rel_betrayal", "turn_identity_shift"]],
  fam_financial_fall: ["家庭经济状况在成长阶段出现明显下降。", "你的家庭是否曾经历收入骤降、负债或生活条件明显收紧？", 5, "private", ["wealth_debt", "wealth_bankruptcy", "career_early_work"]],
  fam_elder_loss: ["较早经历重要长辈离世或长期缺席。", "你是否较早失去一位对你很重要的长辈，或经历其长期离场？", 5, "intense", ["turn_close_death", "turn_spiritual", "fam_early_burden"]],
  fam_sibling_duty: ["长期照应兄弟姐妹，或因手足关系承担额外责任。", "你是否长期替兄弟姐妹操心、出力或承担他们带来的责任？", 3, "private", ["fam_early_burden", "wealth_family_support", "social_major_conflict"]],
  fam_caregiving: ["曾持续照顾患病、年迈或处于困境中的家人。", "你是否有过一段持续数月以上、以照护家人为中心的生活？", 5, "intense", ["health_chronic", "fam_early_burden", "wealth_family_support"]],
  edu_school_transfer: ["成长阶段有过明显转学或教育环境变化。", "你是否在中小学阶段转过学，或进入过差异很大的教育环境？", 3, "ordinary", ["move_repeated", "move_left_hometown", "turn_identity_shift"]],
  edu_study_interruption: ["升学路径曾中断、延期或明显偏离原计划。", "你的学业是否曾因家庭、健康、经济或个人选择而中断、延期或改道？", 5, "private", ["career_early_work", "fam_financial_fall", "turn_restart"]],
  edu_exam_turn: ["一场重要考试或录取结果显著改变人生路径。", "是否有一场关键考试、落榜或录取，明显改变了你之后的道路？", 4, "ordinary", ["career_major_achievement", "move_left_hometown", "turn_identity_shift"]],
  move_left_hometown: ["为了求学或工作离开成长地，并长期生活在外。", "你是否因求学或工作长期离开成长地，并在异地建立生活？", 4, "ordinary", ["move_overseas", "career_switch", "edu_exam_turn"]],
  move_repeated: ["人生中多次跨城市或大范围迁居。", "你是否有过三次以上明显迁居，且其中至少一次改变了生活主线？", 4, "ordinary", ["edu_school_transfer", "move_left_hometown", "move_overseas"]],
  move_overseas: ["曾长期出国学习、工作或定居。", "你是否曾在海外连续生活、求学或工作半年以上？", 5, "ordinary", ["move_left_hometown", "turn_identity_shift", "career_major_achievement"]],
  career_early_work: ["比同龄人更早进入工作或挣钱状态。", "你是否比多数同龄人更早开始稳定工作、兼职养活自己或补贴家庭？", 4, "ordinary", ["edu_study_interruption", "fam_financial_fall", "wealth_family_support"]],
  career_switch: ["至少一次跨行业或职业方向的明显转变。", "你是否有过一次真正意义上的转行，而不只是换公司或岗位？", 4, "ordinary", ["turn_restart", "move_left_hometown", "career_job_loss"]],
  career_leadership: ["曾担任管理者、负责人或关键决策角色。", "你是否正式承担过带团队、定目标或为关键结果负责的角色？", 4, "ordinary", ["career_major_achievement", "career_entrepreneurship", "social_partnership_break"]],
  career_entrepreneurship: ["曾创业、经营生意或以自己为主承担商业结果。", "你是否真正创业、经营生意或以独立项目承担过主要盈亏？", 5, "private", ["career_leadership", "wealth_debt", "social_partnership_break"]],
  career_job_loss: ["曾经历裁员、被辞退或非自愿的职业中断。", "你是否经历过裁员、被辞退，或一段非自愿的较长失业？", 5, "private", ["wealth_debt", "career_switch", "turn_restart"]],
  career_major_achievement: ["曾有一次明显晋升、成名或成果突破。", "你是否有过一次明显晋升、重要奖项、项目成功或事业影响力跃升？", 5, "ordinary", ["career_leadership", "wealth_income_leap", "social_reputation_crisis"]],
  wealth_income_leap: ["收入或资产曾在短期内显著增加。", "你是否曾在一两年内出现收入、利润或资产的明显跃升？", 4, "private", ["career_major_achievement", "wealth_property", "career_entrepreneurship"]],
  wealth_debt: ["曾承受显著负债或长期还款压力。", "你是否有过持续一年以上、明显影响生活选择的债务或还款压力？", 5, "intense", ["wealth_bankruptcy", "career_job_loss", "wealth_investment_loss"]],
  wealth_investment_loss: ["投资、合伙或投机曾造成明显损失。", "你是否因投资、合伙、借款或投机经历过一次明显财务损失？", 5, "private", ["social_partnership_break", "wealth_debt", "rel_betrayal"]],
  wealth_property: ["曾购置重要房产，或房产成为人生关键节点。", "你是否购买过重要房产，或因房产交易明显改变家庭与财务安排？", 4, "private", ["rel_marriage", "turn_child_arrival", "wealth_income_leap"]],
  wealth_family_support: ["长期承担父母、子女或亲属的重要经济支出。", "你的收入是否长期有较大部分用于供养父母、子女或其他亲属？", 4, "private", ["fam_early_burden", "fam_caregiving", "turn_child_arrival"]],
  wealth_bankruptcy: ["本人、家庭或所经营事业曾接近或进入破产状态。", "你本人、家庭或经营的事业，是否经历过破产、清算或接近资不抵债？", 5, "intense", ["wealth_debt", "career_entrepreneurship", "turn_restart"]],
  rel_formative_love: ["较早经历一段影响深远的恋爱或情感牵引。", "你是否较早经历过一段很深、并长期影响你的感情？", 4, "private", ["rel_major_breakup", "rel_betrayal", "turn_identity_shift"]],
  rel_long_single: ["成年后有过较长的主动或被动单身期。", "成年后你是否有过连续三年以上、几乎没有稳定关系的时期？", 3, "private", ["rel_major_breakup", "fam_parental_distance", "health_burnout"]],
  rel_major_breakup: ["一段重要关系的结束造成长期影响。", "你是否经历过一次对生活、性格或之后关系影响很大的分手？", 5, "intense", ["rel_formative_love", "rel_long_single", "turn_identity_shift"]],
  rel_marriage: ["曾登记结婚、举办婚礼或进入事实婚姻。", "你是否已经进入或曾经进入婚姻、长期事实婚姻？", 5, "private", ["wealth_property", "turn_child_arrival", "rel_divorce"]],
  rel_divorce: ["曾离婚、长期分居或经历婚姻实质破裂。", "你是否经历过离婚、长期分居，或婚姻关系实质性破裂？", 5, "intense", ["rel_marriage", "rel_betrayal", "turn_restart"]],
  rel_betrayal: ["亲密关系中曾经历出轨、欺骗或严重背叛。", "你是否在重要关系中经历过出轨、长期欺骗或严重信任破裂？", 5, "intense", ["rel_major_breakup", "social_partnership_break", "fam_parental_distance"]],
  health_hospital: ["本人曾因疾病或身体问题住院、手术。", "你是否因疾病或身体问题住院、手术，或接受过较重治疗？", 5, "intense", ["health_recovery", "fam_caregiving", "health_chronic"]],
  health_chronic: ["存在持续较久、反复影响生活的身体问题。", "你是否有持续一年以上、反复影响生活或工作的慢性身体问题？", 4, "intense", ["health_hospital", "health_burnout", "health_recovery"]],
  health_accident: ["经历过交通、运动、工作或其他较严重意外伤害。", "你是否经历过需要治疗、休养或明显改变生活的严重意外伤害？", 5, "intense", ["health_hospital", "turn_restart", "law_dispute"]],
  health_burnout: ["曾因长期压力出现明显失眠、焦虑、抑郁或耗竭。", "你是否经历过一段持续数月、明显影响睡眠、情绪或工作能力的身心耗竭？", 4, "intense", ["career_job_loss", "rel_long_single", "health_recovery"]],
  health_reproductive: ["本人或伴侣经历怀孕、流产、难孕或生育相关重大事件。", "你本人或伴侣是否经历过怀孕、生育、流产、难孕或相关的重要治疗？", 5, "intense", ["turn_child_arrival", "rel_marriage", "health_hospital"]],
  health_recovery: ["曾从严重健康、心理或身体低谷中逐步恢复。", "你是否经历过一次较长的康复期，并因此改变生活习惯或人生排序？", 5, "intense", ["health_hospital", "health_burnout", "turn_restart"]],
  law_dispute: ["本人或家庭曾卷入重要诉讼、仲裁或法律争议。", "你本人或家庭是否经历过诉讼、仲裁、报警处理或重要法律纠纷？", 5, "intense", ["social_major_conflict", "wealth_investment_loss", "health_accident"]],
  law_crime_contact: ["本人或近亲曾涉及刑事调查、拘留、服刑或重大犯罪事件。", "你本人或近亲是否曾涉及刑事调查、拘留、服刑或重大犯罪事件？", 5, "intense", ["law_dispute", "social_reputation_crisis", "turn_close_death"]],
  social_reputation_crisis: ["曾遭遇公开指责、舆论危机或严重名誉损伤。", "你是否遭遇过公开指责、网络舆论、单位处分或严重名誉危机？", 5, "intense", ["social_major_conflict", "career_major_achievement", "law_crime_contact"]],
  social_major_conflict: ["与亲友、同事或合作方有过长期且重大的冲突。", "你是否与亲友、同事或合作方经历过持续较久、影响很大的冲突？", 4, "private", ["social_partnership_break", "law_dispute", "fam_sibling_duty"]],
  social_mentor: ["关键阶段曾得到一位重要人物的明显帮助与提携。", "你是否在关键阶段得到一位老师、上级、长辈或合作伙伴的实质性提携？", 4, "ordinary", ["career_major_achievement", "edu_exam_turn", "turn_identity_shift"]],
  social_partnership_break: ["商业或事业合作因利益、信任而重大破裂。", "你是否与重要合伙人或事业伙伴因利益、控制权或信任而决裂？", 5, "intense", ["career_entrepreneurship", "wealth_investment_loss", "rel_betrayal"]],
  turn_child_arrival: ["子女出生或成为主要照顾者，显著改变人生结构。", "子女的出生或长期照顾孩子，是否明显改变了你的人生排序？", 5, "private", ["health_reproductive", "rel_marriage", "wealth_family_support"]],
  turn_close_death: ["成年后经历父母、伴侣、子女或极亲近之人离世。", "你是否经历过父母、伴侣、子女或极亲近之人的离世，并因此长期改变？", 5, "intense", ["fam_elder_loss", "turn_spiritual", "health_burnout"]],
  turn_inheritance: ["遗产、家业或重大资产承接影响了人生方向。", "你是否因遗产、家业或重大资产承接，明显改变财务与家庭责任？", 4, "private", ["wealth_property", "fam_sibling_duty", "turn_close_death"]],
  turn_spiritual: ["因经历重大事件而转向宗教、玄学、心理或精神探索。", "你是否因某次重大经历，持续转向宗教、玄学、心理或精神探索？", 4, "ordinary", ["turn_close_death", "health_recovery", "turn_identity_shift"]],
  turn_restart: ["在事业、关系、财富或健康重大崩塌后重新开始。", "你是否在事业、关系、财务或健康重大崩塌后，真正重新建立过生活？", 5, "intense", ["career_job_loss", "wealth_bankruptcy", "rel_divorce"]],
  turn_identity_shift: ["某次经历后价值观、身份认同或生活方式发生根本改变。", "你是否经历过一次让价值观、身份认同或生活方式根本改变的事件？", 4, "private", ["career_switch", "move_overseas", "rel_major_breakup"]]
};

export const DEFAULT_GENERATOR_CONFIG = {
  version: "sealed-synthetic-generator-v1",
  assumptionNotice: "所有发生率与行为参数均为工程模拟假设，不代表真实人群统计。",
  cohorts: [
    { id: "language_stress", profiles: 50, agentProfiles: 50 },
    { id: "calibration", profiles: 500, agentProfiles: 100 },
    { id: "validation", profiles: 300, agentProfiles: 100 }
  ],
  retest: {
    cohort: "validation",
    respondentMode: "agent",
    sessions: 30,
    intervalDays: [7, 14]
  },
  demographics: {
    ageBands: [
      { min: 18, max: 24, weight: 0.15 },
      { min: 25, max: 34, weight: 0.30 },
      { min: 35, max: 44, weight: 0.25 },
      { min: 45, max: 59, weight: 0.20 },
      { min: 60, max: 75, weight: 0.10 }
    ],
    gender: [
      { value: "female", weight: 0.49 },
      { value: "male", weight: 0.49 },
      { value: "nonbinary_or_undisclosed", weight: 0.02 }
    ],
    region: [
      { value: "tier_1", weight: 0.18 },
      { value: "tier_2", weight: 0.22 },
      { value: "tier_3_4", weight: 0.36 },
      { value: "county_or_rural", weight: 0.24 }
    ],
    educationExposure: [
      { value: "basic", weight: 0.20 },
      { value: "secondary", weight: 0.38 },
      { value: "higher", weight: 0.42 }
    ]
  },
  latent: {
    names: [
      "adversity",
      "familyInstability",
      "mobility",
      "careerAgency",
      "financialVolatility",
      "relationshipInstability",
      "healthBurden",
      "socialRisk",
      "resilience"
    ],
    sharedAdversityLoading: 0.55,
    independentLoading: 0.84,
    clamp: [-2.5, 2.5]
  },
  eventModel: {
    rows: EVENT_ROWS,
    publicFields: EVENT_PUBLIC_FIELDS,
    probabilityClamp: [0.008, 0.88],
    ageExposureYears: 10,
    domainLatentWeights: {
      family: { familyInstability: 0.62, adversity: 0.22, resilience: -0.08 },
      education_mobility: { mobility: 0.67, careerAgency: 0.12 },
      career: { careerAgency: 0.52, adversity: 0.12, resilience: 0.12 },
      wealth: { financialVolatility: 0.55, adversity: 0.17 },
      relationship: { relationshipInstability: 0.58, adversity: 0.12 },
      health: { healthBurden: 0.65, adversity: 0.13, resilience: -0.08 },
      law_social: { socialRisk: 0.62, adversity: 0.12 },
      turning_point: { adversity: 0.32, resilience: 0.28 }
    },
    eventLatentOverrides: {
      career_job_loss: { careerAgency: -0.14, financialVolatility: 0.30, adversity: 0.34 },
      career_major_achievement: { careerAgency: 0.72, resilience: 0.18, adversity: -0.08 },
      career_leadership: { careerAgency: 0.68 },
      career_entrepreneurship: { careerAgency: 0.62, financialVolatility: 0.24 },
      wealth_income_leap: { careerAgency: 0.55, financialVolatility: 0.22 },
      wealth_property: { careerAgency: 0.28, financialVolatility: -0.18 },
      wealth_family_support: { familyInstability: 0.28, careerAgency: 0.18 },
      wealth_bankruptcy: { financialVolatility: 0.82, adversity: 0.34 },
      rel_marriage: { relationshipInstability: -0.32, resilience: 0.18 },
      rel_divorce: { relationshipInstability: 0.78, adversity: 0.22 },
      social_mentor: { careerAgency: 0.42, socialRisk: -0.10 },
      turn_child_arrival: { relationshipInstability: -0.18, resilience: 0.18 },
      turn_restart: { adversity: 0.55, resilience: 0.58 },
      turn_spiritual: { adversity: 0.30, resilience: 0.30 }
    },
    conditionalEdges: [
      { source: "fam_financial_fall", target: "wealth_debt", activationBoost: 0.30 },
      { source: "fam_early_burden", target: "wealth_family_support", activationBoost: 0.20 },
      { source: "move_left_hometown", target: "move_repeated", activationBoost: 0.18 },
      { source: "career_entrepreneurship", target: "social_partnership_break", activationBoost: 0.18 },
      { source: "career_entrepreneurship", target: "wealth_investment_loss", activationBoost: 0.15 },
      { source: "career_major_achievement", target: "wealth_income_leap", activationBoost: 0.22 },
      { source: "rel_major_breakup", target: "rel_long_single", activationBoost: 0.24 },
      { source: "health_hospital", target: "health_recovery", activationBoost: 0.24 },
      { source: "health_burnout", target: "health_recovery", activationBoost: 0.18 },
      { source: "career_job_loss", target: "turn_restart", activationBoost: 0.25 },
      { source: "rel_divorce", target: "turn_restart", activationBoost: 0.25 },
      { source: "wealth_bankruptcy", target: "turn_restart", activationBoost: 0.32 }
    ],
    prerequisites: [
      { event: "rel_divorce", oneOf: ["rel_marriage"], minGapYears: 1 },
      { event: "wealth_bankruptcy", oneOf: ["wealth_debt", "wealth_investment_loss"], minGapYears: 1 },
      { event: "health_recovery", oneOf: ["health_hospital", "health_chronic", "health_accident", "health_burnout"], minGapYears: 1 },
      { event: "turn_restart", oneOf: ["career_job_loss", "wealth_bankruptcy", "rel_divorce", "rel_major_breakup", "health_hospital", "health_burnout"], minGapYears: 1 }
    ]
  },
  persona: {
    readingComprehension: { mean: 0.84, sd: 0.11, min: 0.40, max: 0.99 },
    sensitiveDisclosure: { mean: 0.78, sd: 0.15, min: 0.25, max: 0.99 },
    responseCaution: { mean: 0.50, sd: 0.18, min: 0.05, max: 0.95 },
    orInterpretationSkill: { mean: 0.86, sd: 0.10, min: 0.45, max: 0.99 },
    fatigueSusceptibility: { mean: 0.32, sd: 0.14, min: 0.03, max: 0.85 },
    acquiescence: { mean: 0.05, sd: 0.05, min: -0.08, max: 0.20 },
    averageLatencyMs: { mean: 6900, sd: 1800, min: 2200, max: 16000 }
  },
  memory: {
    recallFidelity: { mean: 0.88, sd: 0.09, min: 0.50, max: 0.99 },
    datePrecision: { mean: 0.74, sd: 0.15, min: 0.25, max: 0.98 },
    eventBoundaryClarity: { mean: 0.81, sd: 0.12, min: 0.30, max: 0.99 },
    falsePositiveTendency: { mean: 0.035, sd: 0.025, min: 0.002, max: 0.15 },
    salienceRecallBoost: 0.08,
    sensitiveRecallPenalty: 0.05,
    retestDrift: { mean: 0.045, sd: 0.02, min: 0.005, max: 0.12 }
  },
  narrative: {
    introductions: [
      "此人回望至今，经历并非一线直行，若干节点改变了之后的选择。",
      "这是一份截至当前年龄的生活回忆，既有清楚的转折，也有边界略显模糊的片段。",
      "此人的前半生由家庭、迁动、事业、关系与身心数条线交织而成。"
    ],
    eventSentenceTemplates: [
      "约在{age}岁，经历了{label}，此事被记作一个较明确的人生节点。",
      "{age}岁前后，生活中出现{label}，后来回想仍认为它影响了之后的安排。",
      "大约{age}岁时，发生过{label}；具体月份已经模糊，但事件本身仍可确认。"
    ]
  }
};
