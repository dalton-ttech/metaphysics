const ROWS = [
  ["fam_early_burden", "少年承担家计", "family", "少年时是否较早承担家计或照顾家人？", 5, "intense"],
  ["fam_parental_distance", "亲子关系长期疏离", "family", "与父母一方是否有过多年疏离或难以沟通？", 4, "private"],
  ["fam_financial_fall", "原生家庭财势骤变", "family", "成长阶段家中经济是否经历过明显下坠？", 5, "intense"],
  ["fam_elder_loss", "早年失去重要长辈", "family", "较年轻时是否失去过深刻影响你的长辈？", 5, "intense"],
  ["fam_sibling_duty", "长期替手足担责", "family", "是否长期替兄弟姐妹承担责任或收拾局面？", 4, "private"],
  ["fam_caregiving", "长期照护家人", "family", "是否有过持续照护病弱或年长家人的阶段？", 5, "intense"],

  ["edu_school_transfer", "求学环境明显更换", "education_mobility", "求学阶段是否有过转学或教育环境的大幅更换？", 3, "ordinary"],
  ["edu_study_interruption", "学业中断后续接", "education_mobility", "学业是否曾中断，后来又以别的方式续上？", 4, "ordinary"],
  ["edu_exam_turn", "一次考试改变路径", "education_mobility", "是否有一次重要考试明显改变了后来道路？", 4, "ordinary"],
  ["move_left_hometown", "离开故乡长期发展", "education_mobility", "是否离开成长地，并在外地长期生活发展？", 4, "ordinary"],
  ["move_repeated", "多次迁居转换城市", "education_mobility", "成年后是否多次迁居或转换主要生活城市？", 4, "ordinary"],
  ["move_overseas", "长期海外生活", "education_mobility", "是否有过较长期的海外学习、工作或生活？", 4, "ordinary"],

  ["career_early_work", "较早进入工作", "career", "是否比同龄人更早开始持续工作或挣钱？", 3, "ordinary"],
  ["career_switch", "职业主线转轨", "career", "是否有过一次真正改变主线的转行？", 4, "ordinary"],
  ["career_leadership", "承担团队决策", "career", "是否正式带过团队或承担关键决策结果？", 4, "ordinary"],
  ["career_entrepreneurship", "独立创业经营", "career", "是否亲自创办或独立经营过一项事业？", 5, "ordinary"],
  ["career_job_loss", "非自愿失去工作", "career", "是否经历过裁撤、解雇或其他非自愿失业？", 5, "intense"],
  ["career_major_achievement", "事业阶段性跃升", "career", "是否有过一次被外界明确认可的事业跃升？", 4, "ordinary"],

  ["wealth_income_leap", "收入出现明显跃升", "wealth", "收入是否曾在较短阶段出现明显跃升？", 4, "ordinary"],
  ["wealth_debt", "长期债务压力", "wealth", "是否承受过持续一年以上的明显债务压力？", 5, "intense"],
  ["wealth_investment_loss", "投资遭遇重大损失", "wealth", "是否因投资或经营判断承受过重大损失？", 5, "intense"],
  ["wealth_property", "取得重要不动产", "wealth", "是否已取得对生活意义重大的房产或不动产？", 4, "ordinary"],
  ["wealth_family_support", "长期资助家庭", "wealth", "是否长期以收入或资产支持原生家庭？", 4, "private"],
  ["wealth_bankruptcy", "资不抵债后重整", "wealth", "是否经历过资不抵债、停业或近似破产的重整？", 5, "intense"],

  ["rel_formative_love", "一段感情影响多年", "relationship", "是否有一段感情在结束或变化后仍影响你多年？", 4, "private"],
  ["rel_long_single", "较长时间主动独身", "relationship", "成年后是否有过较长时间主动保持单身？", 3, "private"],
  ["rel_major_breakup", "重大分手改变生活", "relationship", "是否有一次分手明显改变了生活方向？", 5, "private"],
  ["rel_marriage", "进入婚姻关系", "relationship", "是否已经进入过婚姻或事实婚姻？", 5, "private"],
  ["rel_divorce", "婚姻正式破裂", "relationship", "是否经历过离婚或事实婚姻的正式破裂？", 5, "intense"],
  ["rel_betrayal", "亲密关系遭遇背叛", "relationship", "亲密关系中是否经历过足以改变信任的背叛？", 5, "intense"],

  ["health_hospital", "住院手术或重治疗", "health", "是否有过住院、手术或较重治疗的经历？", 5, "intense"],
  ["health_chronic", "长期慢性健康困扰", "health", "是否有持续多年、需要管理的慢性健康困扰？", 5, "intense"],
  ["health_accident", "意外伤害留下影响", "health", "是否有一次意外伤害留下较长影响？", 5, "intense"],
  ["health_burnout", "身心耗竭被迫停步", "health", "是否因身心耗竭而被迫停工、休学或长期调整？", 5, "intense"],
  ["health_reproductive", "生育相关重大经历", "health", "是否经历过对你影响明显的怀孕、生育或生殖健康事件？", 5, "private"],
  ["health_recovery", "重病低谷后恢复", "health", "是否从一次较重健康低谷中逐步恢复？", 5, "intense"],

  ["law_dispute", "卷入正式法律纠纷", "legal_social", "是否卷入过诉讼、仲裁或正式法律纠纷？", 5, "intense"],
  ["law_crime_contact", "接触刑事调查程序", "legal_social", "是否本人或至近之人接触过刑事调查程序？", 5, "intense"],
  ["social_reputation_crisis", "名誉遭遇公开危机", "legal_social", "是否经历过公开误解、舆论或名誉危机？", 5, "intense"],
  ["social_major_conflict", "重要关系严重冲突", "legal_social", "是否与重要亲友或同事发生过长期严重冲突？", 4, "private"],
  ["social_mentor", "贵人改变关键路径", "legal_social", "是否有一位前辈或贵人在关键时刻改变你的路径？", 4, "ordinary"],
  ["social_partnership_break", "合作关系决裂", "legal_social", "是否有过一次重要合作关系的彻底决裂？", 5, "intense"],

  ["turn_child_arrival", "子女到来改变重心", "turning_point", "是否因子女到来或承担育儿责任而改变生活重心？", 5, "private"],
  ["turn_close_death", "至亲离世改变人生", "turning_point", "是否有至亲离世长期改变了你的选择？", 5, "intense"],
  ["turn_inheritance", "继承或家产处置", "turning_point", "是否经历过继承、家产分配或重大遗产处置？", 5, "private"],
  ["turn_spiritual", "信念体系明显转变", "turning_point", "是否有过一次宗教、哲学或人生信念的明显转变？", 4, "private"],
  ["turn_restart", "重大崩塌后重启", "turning_point", "是否在一次重大崩塌后重新建立生活？", 5, "intense"],
  ["turn_identity_shift", "社会身份根本改变", "turning_point", "是否经历过职业、家庭或社会身份的根本改变？", 5, "ordinary"],

  ["career_early_work_before_18", "十八岁前持续工作", "timing", "十八岁以前是否已持续工作或挣钱？", 4, "ordinary"],
  ["move_left_hometown_before_22", "二十二岁前长期离乡", "timing", "二十二岁以前是否已长期离开成长地？", 4, "ordinary"],
  ["health_hospital_before_18", "十八岁前住院重治疗", "timing", "十八岁以前是否住院、手术或接受较重治疗？", 5, "intense"],
  ["rel_formative_love_before_20", "二十岁前深刻恋情", "timing", "二十岁以前是否已有长期影响你的感情？", 4, "private"],
  ["rel_marriage_before_28", "二十八岁前进入婚姻", "timing", "二十八岁以前是否已经进入婚姻？", 5, "private"],
  ["turn_child_arrival_before_30", "三十岁前承担育儿", "timing", "三十岁以前是否已有子女或主要照顾孩子？", 5, "private"],
  ["career_switch_before_30", "三十岁前职业转轨", "timing", "三十岁以前是否已经真正转过职业主线？", 4, "ordinary"],
  ["career_leadership_before_35", "三十五岁前带团队", "timing", "三十五岁以前是否已正式带团队或负责关键结果？", 4, "ordinary"],
  ["wealth_debt_before_30", "三十岁前长期负债", "timing", "三十岁以前是否已有持续一年以上的明显债务？", 5, "intense"],
  ["turn_close_death_before_30", "三十岁前经历至亲离世", "timing", "三十岁以前是否经历至亲离世并长期受其影响？", 5, "intense"],
  ["turn_restart_before_35", "三十五岁前重大重启", "timing", "三十五岁以前是否已在重大崩塌后重建生活？", 5, "intense"],
  ["move_repeated_before_30", "三十岁前多次迁居", "timing", "三十岁以前是否已经多次迁居或转换城市？", 4, "ordinary"]
];

export const FACT_CATALOG = Object.freeze(ROWS.map(([shortId, label, domain, question, salience, sensitivity], index) => Object.freeze({
  index,
  id: `fact:${shortId}`,
  label,
  domain,
  salience,
  sensitivity,
  proposition: label,
  question: `旧事只取一证：${question}相应答“应”，不相应答“不应”，确实记不清答“未明”。`
})));

export const CLAUSE_CODEBOOK = Object.freeze(FACT_CATALOG.map((fact, index) => Object.freeze({
  id: `TB4-${String(index + 1).padStart(3, "0")}`,
  primaryFactId: fact.id,
  factIndex: fact.index,
  domain: fact.domain,
  proposition: fact.proposition,
  text: fact.question,
  answerOptions: ["应", "不应", "未明"]
})));

export const DOMAIN_LABELS = Object.freeze({
  family: "家门",
  education_mobility: "行旅与求学",
  career: "事业",
  wealth: "财帛",
  relationship: "情缘",
  health: "身心",
  legal_social: "人际与是非",
  turning_point: "转折",
  timing: "岁限"
});
