import type { EventDomain, LifeEvent } from "@/lib/types";

export const DOMAIN_META: Record<EventDomain, { title: string; short: string }> = {
  family: { title: "家门与根系", short: "亲缘、责任与早年家运" },
  education_mobility: { title: "学路与迁动", short: "求学、离乡与环境更替" },
  career: { title: "事业与位势", short: "工作路径、主导权与成就" },
  wealth: { title: "财脉与承载", short: "收入、资产、债务与家计" },
  relationship: { title: "情缘与契合", short: "亲密关系、婚姻与分合" },
  health: { title: "身心与关口", short: "身体事件、消耗与恢复" },
  law_social: { title: "人际与是非", short: "贵人、冲突、法律与名誉" },
  turning_point: { title: "大变与重启", short: "生死消息、身份改变与再出发" }
};

export const LIFE_EVENTS: LifeEvent[] = [
  {
    id: "fam_early_burden", domain: "family", label: "早担家责", description: "少年或青年阶段较早承担家庭责任。",
    cue: "年未长成，肩上却先有了家中分量", verificationCue: "你是否比同龄人更早替家里扛事、做决定或照顾他人？",
    baseRate: 0.2, earliestAge: 10, salience: 4, sensitivity: "private", related: ["fam_sibling_duty", "fam_caregiving", "wealth_family_support"], futureSignal: "stability"
  },
  {
    id: "fam_parental_distance", domain: "family", label: "父母关系疏离", description: "父母长期冲突、分居、离异，或与一方关系明显疏远。",
    cue: "双亲之缘并非一路同声，家中曾有长久冷暖", verificationCue: "你的成长中，父母是否长期不和、分开，或你与其中一方明显疏远？",
    baseRate: 0.16, earliestAge: 3, salience: 5, sensitivity: "intense", related: ["rel_long_single", "rel_betrayal", "turn_identity_shift"], futureSignal: "relationship"
  },
  {
    id: "fam_financial_fall", domain: "family", label: "家运骤落", description: "家庭经济状况在成长阶段出现明显下降。",
    cue: "家计曾由宽转紧，日子忽然换了算法", verificationCue: "你的家庭是否曾经历收入骤降、负债或生活条件明显收紧？",
    baseRate: 0.18, earliestAge: 5, salience: 5, sensitivity: "private", related: ["wealth_debt", "wealth_bankruptcy", "career_early_work"], futureSignal: "risk"
  },
  {
    id: "fam_elder_loss", domain: "family", label: "早年失长辈", description: "较早经历重要长辈离世或长期缺席。",
    cue: "庭前曾少一盏长明之灯，离别来得比预想早", verificationCue: "你是否较早失去一位对你很重要的长辈，或经历其长期离场？",
    baseRate: 0.21, earliestAge: 5, salience: 5, sensitivity: "intense", related: ["turn_close_death", "turn_spiritual", "fam_early_burden"], futureSignal: "reinvention"
  },
  {
    id: "fam_sibling_duty", domain: "family", label: "手足牵责", description: "长期照应兄弟姐妹，或因手足关系承担额外责任。",
    cue: "同枝之间，不只相伴，也有一段责任落在你身上", verificationCue: "你是否长期替兄弟姐妹操心、出力或承担他们带来的责任？",
    baseRate: 0.15, earliestAge: 12, salience: 3, sensitivity: "private", related: ["fam_early_burden", "wealth_family_support", "social_major_conflict"], futureSignal: "stability"
  },
  {
    id: "fam_caregiving", domain: "family", label: "长期照护", description: "曾持续照顾患病、年迈或处于困境中的家人。",
    cue: "有一程你把自己的步子放慢，只为守住家中一人", verificationCue: "你是否有过一段持续数月以上、以照护家人为中心的生活？",
    baseRate: 0.14, earliestAge: 16, salience: 5, sensitivity: "intense", related: ["health_chronic", "fam_early_burden", "wealth_family_support"], futureSignal: "recovery"
  },

  {
    id: "edu_school_transfer", domain: "education_mobility", label: "转学换境", description: "成长阶段有过明显转学或教育环境变化。",
    cue: "书案未定，窗外风景先换过一回", verificationCue: "你是否在中小学阶段转过学，或进入过差异很大的教育环境？",
    baseRate: 0.22, earliestAge: 6, salience: 3, sensitivity: "ordinary", related: ["move_repeated", "move_left_hometown", "turn_identity_shift"], futureSignal: "reinvention"
  },
  {
    id: "edu_study_interruption", domain: "education_mobility", label: "学业中断", description: "升学路径曾中断、延期或明显偏离原计划。",
    cue: "学路曾断一截，并非照着最初的册页走完", verificationCue: "你的学业是否曾因家庭、健康、经济或个人选择而中断、延期或改道？",
    baseRate: 0.13, earliestAge: 14, salience: 5, sensitivity: "private", related: ["career_early_work", "fam_financial_fall", "turn_restart"], futureSignal: "reinvention"
  },
  {
    id: "edu_exam_turn", domain: "education_mobility", label: "考试转折", description: "一场重要考试或录取结果显著改变人生路径。",
    cue: "一纸名次曾把前路推向另一道门", verificationCue: "是否有一场关键考试、落榜或录取，明显改变了你之后的道路？",
    baseRate: 0.3, earliestAge: 14, salience: 4, sensitivity: "ordinary", related: ["career_major_achievement", "move_left_hometown", "turn_identity_shift"], futureSignal: "expansion"
  },
  {
    id: "move_left_hometown", domain: "education_mobility", label: "离乡发展", description: "为了求学或工作离开成长地，并长期生活在外。",
    cue: "后来一程，不在故土起势，而在异地开局", verificationCue: "你是否因求学或工作长期离开成长地，并在异地建立生活？",
    baseRate: 0.34, earliestAge: 16, salience: 4, sensitivity: "ordinary", related: ["move_overseas", "career_switch", "edu_exam_turn"], futureSignal: "expansion"
  },
  {
    id: "move_repeated", domain: "education_mobility", label: "多次迁居", description: "人生中多次跨城市或大范围迁居。",
    cue: "居处不止一换，每逢换地，人生也跟着换章", verificationCue: "你是否有过三次以上明显迁居，且其中至少一次改变了生活主线？",
    baseRate: 0.18, earliestAge: 8, salience: 4, sensitivity: "ordinary", related: ["edu_school_transfer", "move_left_hometown", "move_overseas"], futureSignal: "reinvention"
  },
  {
    id: "move_overseas", domain: "education_mobility", label: "海外经历", description: "曾长期出国学习、工作或定居。",
    cue: "足迹曾越重洋，旧有尺度在异域被重新校准", verificationCue: "你是否曾在海外连续生活、求学或工作半年以上？",
    baseRate: 0.09, earliestAge: 16, salience: 5, sensitivity: "ordinary", related: ["move_left_hometown", "turn_identity_shift", "career_major_achievement"], futureSignal: "expansion"
  },

  {
    id: "career_early_work", domain: "career", label: "较早工作", description: "比同龄人更早进入工作或挣钱状态。",
    cue: "别人尚在试路时，你已先入局谋生", verificationCue: "你是否比多数同龄人更早开始稳定工作、兼职养活自己或补贴家庭？",
    baseRate: 0.19, earliestAge: 14, salience: 4, sensitivity: "ordinary", related: ["edu_study_interruption", "fam_financial_fall", "wealth_family_support"], futureSignal: "stability"
  },
  {
    id: "career_switch", domain: "career", label: "职业转轨", description: "至少一次跨行业或职业方向的明显转变。",
    cue: "事业并非一线到底，中途曾换过门径", verificationCue: "你是否有过一次真正意义上的转行，而不只是换公司或岗位？",
    baseRate: 0.31, earliestAge: 20, salience: 4, sensitivity: "ordinary", related: ["turn_restart", "move_left_hometown", "career_job_loss"], futureSignal: "reinvention"
  },
  {
    id: "career_leadership", domain: "career", label: "掌事带人", description: "曾担任管理者、负责人或关键决策角色。",
    cue: "局中曾由你掌灯，众人等你定下方向", verificationCue: "你是否正式承担过带团队、定目标或为关键结果负责的角色？",
    baseRate: 0.24, earliestAge: 22, salience: 4, sensitivity: "ordinary", related: ["career_major_achievement", "career_entrepreneurship", "social_partnership_break"], futureSignal: "expansion"
  },
  {
    id: "career_entrepreneurship", domain: "career", label: "创业自营", description: "曾创业、经营生意或以自己为主承担商业结果。",
    cue: "曾不借旧舟，自己起局、自己担风浪", verificationCue: "你是否真正创业、经营生意或以独立项目承担过主要盈亏？",
    baseRate: 0.16, earliestAge: 20, salience: 5, sensitivity: "private", related: ["career_leadership", "wealth_debt", "social_partnership_break"], futureSignal: "expansion"
  },
  {
    id: "career_job_loss", domain: "career", label: "被动失业", description: "曾经历裁员、被辞退或非自愿的职业中断。",
    cue: "事业一度非由你收笔，却被外力骤然断章", verificationCue: "你是否经历过裁员、被辞退，或一段非自愿的较长失业？",
    baseRate: 0.17, earliestAge: 18, salience: 5, sensitivity: "private", related: ["wealth_debt", "career_switch", "turn_restart"], futureSignal: "recovery"
  },
  {
    id: "career_major_achievement", domain: "career", label: "事业跃升", description: "曾有一次明显晋升、成名或成果突破。",
    cue: "曾有一役让位置忽然抬高，名字被更多人看见", verificationCue: "你是否有过一次明显晋升、重要奖项、项目成功或事业影响力跃升？",
    baseRate: 0.2, earliestAge: 20, salience: 5, sensitivity: "ordinary", related: ["career_leadership", "wealth_income_leap", "social_reputation_crisis"], futureSignal: "expansion"
  },

  {
    id: "wealth_income_leap", domain: "wealth", label: "收入跃升", description: "收入或资产曾在短期内显著增加。",
    cue: "财门曾忽然开阔，所得越过旧日尺度", verificationCue: "你是否曾在一两年内出现收入、利润或资产的明显跃升？",
    baseRate: 0.18, earliestAge: 20, salience: 4, sensitivity: "private", related: ["career_major_achievement", "wealth_property", "career_entrepreneurship"], futureSignal: "expansion"
  },
  {
    id: "wealth_debt", domain: "wealth", label: "债务压力", description: "曾承受显著负债或长期还款压力。",
    cue: "财路有过逆水，所得未到，偿付先来", verificationCue: "你是否有过持续一年以上、明显影响生活选择的债务或还款压力？",
    baseRate: 0.21, earliestAge: 18, salience: 5, sensitivity: "intense", related: ["wealth_bankruptcy", "career_job_loss", "wealth_investment_loss"], futureSignal: "risk"
  },
  {
    id: "wealth_investment_loss", domain: "wealth", label: "投资重损", description: "投资、合伙或投机曾造成明显损失。",
    cue: "曾有一笔财去得急，教训比账面更深", verificationCue: "你是否因投资、合伙、借款或投机经历过一次明显财务损失？",
    baseRate: 0.17, earliestAge: 20, salience: 5, sensitivity: "private", related: ["social_partnership_break", "wealth_debt", "rel_betrayal"], futureSignal: "risk"
  },
  {
    id: "wealth_property", domain: "wealth", label: "置业成家", description: "曾购置重要房产，或房产成为人生关键节点。",
    cue: "曾以一处屋宇定下阶段根基", verificationCue: "你是否购买过重要房产，或因房产交易明显改变家庭与财务安排？",
    baseRate: 0.26, earliestAge: 21, salience: 4, sensitivity: "private", related: ["rel_marriage", "turn_child_arrival", "wealth_income_leap"], futureSignal: "stability"
  },
  {
    id: "wealth_family_support", domain: "wealth", label: "长期供养家庭", description: "长期承担父母、子女或亲属的重要经济支出。",
    cue: "财来之后，并未只归自己，常要分流于家门", verificationCue: "你的收入是否长期有较大部分用于供养父母、子女或其他亲属？",
    baseRate: 0.29, earliestAge: 18, salience: 4, sensitivity: "private", related: ["fam_early_burden", "fam_caregiving", "turn_child_arrival"], futureSignal: "stability"
  },
  {
    id: "wealth_bankruptcy", domain: "wealth", label: "破产或资不抵债", description: "本人、家庭或所经营事业曾接近或进入破产状态。",
    cue: "财局曾几近归零，旧账逼人重立门户", verificationCue: "你本人、家庭或经营的事业，是否经历过破产、清算或接近资不抵债？",
    baseRate: 0.06, earliestAge: 20, salience: 5, sensitivity: "intense", related: ["wealth_debt", "career_entrepreneurship", "turn_restart"], futureSignal: "risk"
  },

  {
    id: "rel_formative_love", domain: "relationship", label: "早年深情", description: "较早经历一段影响深远的恋爱或情感牵引。",
    cue: "情门开得不算迟，有一人曾改过你看待亲密的方式", verificationCue: "你是否较早经历过一段很深、并长期影响你的感情？",
    baseRate: 0.27, earliestAge: 14, salience: 4, sensitivity: "private", related: ["rel_major_breakup", "rel_betrayal", "turn_identity_shift"], futureSignal: "relationship"
  },
  {
    id: "rel_long_single", domain: "relationship", label: "长期单身", description: "成年后有过较长的主动或被动单身期。",
    cue: "情缘并非没有，只是有一段长路宁愿独行", verificationCue: "成年后你是否有过连续三年以上、几乎没有稳定关系的时期？",
    baseRate: 0.3, earliestAge: 21, salience: 3, sensitivity: "private", related: ["rel_major_breakup", "fam_parental_distance", "health_burnout"], futureSignal: "relationship"
  },
  {
    id: "rel_major_breakup", domain: "relationship", label: "重大分手", description: "一段重要关系的结束造成长期影响。",
    cue: "曾有一段缘分收场之后，余波走了很久", verificationCue: "你是否经历过一次对生活、性格或之后关系影响很大的分手？",
    baseRate: 0.29, earliestAge: 16, salience: 5, sensitivity: "intense", related: ["rel_formative_love", "rel_long_single", "turn_identity_shift"], futureSignal: "relationship"
  },
  {
    id: "rel_marriage", domain: "relationship", label: "进入婚姻", description: "曾登记结婚、举办婚礼或进入事实婚姻。",
    cue: "情缘曾落为家门，两人共立一处日常", verificationCue: "你是否已经进入或曾经进入婚姻、长期事实婚姻？",
    baseRate: 0.34, earliestAge: 20, salience: 5, sensitivity: "private", related: ["wealth_property", "turn_child_arrival", "rel_divorce"], futureSignal: "stability"
  },
  {
    id: "rel_divorce", domain: "relationship", label: "婚姻离合", description: "曾离婚、长期分居或经历婚姻实质破裂。",
    cue: "结发之局后来有变，曾到各自分路的关口", verificationCue: "你是否经历过离婚、长期分居，或婚姻关系实质性破裂？",
    baseRate: 0.1, earliestAge: 23, salience: 5, sensitivity: "intense", related: ["rel_marriage", "rel_betrayal", "turn_restart"], futureSignal: "reinvention"
  },
  {
    id: "rel_betrayal", domain: "relationship", label: "信任破裂", description: "亲密关系中曾经历出轨、欺骗或严重背叛。",
    cue: "情中曾有暗线，信任一度断在真相之前", verificationCue: "你是否在重要关系中经历过出轨、长期欺骗或严重信任破裂？",
    baseRate: 0.14, earliestAge: 16, salience: 5, sensitivity: "intense", related: ["rel_major_breakup", "social_partnership_break", "fam_parental_distance"], futureSignal: "risk"
  },

  {
    id: "health_hospital", domain: "health", label: "住院或手术", description: "本人曾因疾病或身体问题住院、手术。",
    cue: "身体曾过一道门槛，灯影药气相伴过一程", verificationCue: "你是否因疾病或身体问题住院、手术，或接受过较重治疗？",
    baseRate: 0.25, earliestAge: 3, salience: 5, sensitivity: "intense", related: ["health_recovery", "fam_caregiving", "health_chronic"], futureSignal: "recovery"
  },
  {
    id: "health_chronic", domain: "health", label: "长期慢性问题", description: "存在持续较久、反复影响生活的身体问题。",
    cue: "身上有一处旧信号，时轻时重，却未真正离场", verificationCue: "你是否有持续一年以上、反复影响生活或工作的慢性身体问题？",
    baseRate: 0.23, earliestAge: 8, salience: 4, sensitivity: "intense", related: ["health_hospital", "health_burnout", "health_recovery"], futureSignal: "risk"
  },
  {
    id: "health_accident", domain: "health", label: "严重意外", description: "经历过交通、运动、工作或其他较严重意外伤害。",
    cue: "行路曾遇骤险，身体或生活被迫停下一回", verificationCue: "你是否经历过需要治疗、休养或明显改变生活的严重意外伤害？",
    baseRate: 0.15, earliestAge: 5, salience: 5, sensitivity: "intense", related: ["health_hospital", "turn_restart", "law_dispute"], futureSignal: "risk"
  },
  {
    id: "health_burnout", domain: "health", label: "身心耗竭", description: "曾因长期压力出现明显失眠、焦虑、抑郁或耗竭。",
    cue: "心火曾久燃不息，后来连日常也变得沉重", verificationCue: "你是否经历过一段持续数月、明显影响睡眠、情绪或工作能力的身心耗竭？",
    baseRate: 0.28, earliestAge: 15, salience: 4, sensitivity: "intense", related: ["career_job_loss", "rel_long_single", "health_recovery"], futureSignal: "recovery"
  },
  {
    id: "health_reproductive", domain: "health", label: "生育关口", description: "本人或伴侣经历怀孕、流产、难孕或生育相关重大事件。",
    cue: "子息之门曾有消息，喜忧都曾牵动全家", verificationCue: "你本人或伴侣是否经历过怀孕、生育、流产、难孕或相关的重要治疗？",
    baseRate: 0.2, earliestAge: 18, salience: 5, sensitivity: "intense", related: ["turn_child_arrival", "rel_marriage", "health_hospital"], futureSignal: "relationship"
  },
  {
    id: "health_recovery", domain: "health", label: "大病后恢复", description: "曾从严重健康、心理或身体低谷中逐步恢复。",
    cue: "身心曾沉到谷底，后来靠自己一点点回到岸上", verificationCue: "你是否经历过一次较长的康复期，并因此改变生活习惯或人生排序？",
    baseRate: 0.15, earliestAge: 12, salience: 5, sensitivity: "intense", related: ["health_hospital", "health_burnout", "turn_restart"], futureSignal: "recovery"
  },

  {
    id: "law_dispute", domain: "law_social", label: "诉讼纠纷", description: "本人或家庭曾卷入重要诉讼、仲裁或法律争议。",
    cue: "是非曾落到纸面，不只凭口舌便能了结", verificationCue: "你本人或家庭是否经历过诉讼、仲裁、报警处理或重要法律纠纷？",
    baseRate: 0.1, earliestAge: 16, salience: 5, sensitivity: "intense", related: ["social_major_conflict", "wealth_investment_loss", "health_accident"], futureSignal: "risk"
  },
  {
    id: "law_crime_contact", domain: "law_social", label: "刑事事件牵连", description: "本人或近亲曾涉及刑事调查、拘留、服刑或重大犯罪事件。",
    cue: "命途曾近刑名之地，自己或至亲被卷入重案", verificationCue: "你本人或近亲是否曾涉及刑事调查、拘留、服刑或重大犯罪事件？",
    baseRate: 0.04, earliestAge: 14, salience: 5, sensitivity: "intense", related: ["law_dispute", "social_reputation_crisis", "turn_close_death"], futureSignal: "risk"
  },
  {
    id: "social_reputation_crisis", domain: "law_social", label: "名誉风波", description: "曾遭遇公开指责、舆论危机或严重名誉损伤。",
    cue: "名声曾被推到风口，外人的目光一时过重", verificationCue: "你是否遭遇过公开指责、网络舆论、单位处分或严重名誉危机？",
    baseRate: 0.08, earliestAge: 15, salience: 5, sensitivity: "intense", related: ["social_major_conflict", "career_major_achievement", "law_crime_contact"], futureSignal: "risk"
  },
  {
    id: "social_major_conflict", domain: "law_social", label: "重大人际冲突", description: "与亲友、同事或合作方有过长期且重大的冲突。",
    cue: "人与人之间曾有一场硬碰，余波久未散尽", verificationCue: "你是否与亲友、同事或合作方经历过持续较久、影响很大的冲突？",
    baseRate: 0.22, earliestAge: 14, salience: 4, sensitivity: "private", related: ["social_partnership_break", "law_dispute", "fam_sibling_duty"], futureSignal: "risk"
  },
  {
    id: "social_mentor", domain: "law_social", label: "贵人提携", description: "关键阶段曾得到一位重要人物的明显帮助与提携。",
    cue: "关口曾有人递来一灯，使你少走多年暗路", verificationCue: "你是否在关键阶段得到一位老师、上级、长辈或合作伙伴的实质性提携？",
    baseRate: 0.31, earliestAge: 12, salience: 4, sensitivity: "ordinary", related: ["career_major_achievement", "edu_exam_turn", "turn_identity_shift"], futureSignal: "expansion"
  },
  {
    id: "social_partnership_break", domain: "law_social", label: "合作决裂", description: "商业或事业合作因利益、信任而重大破裂。",
    cue: "共事之舟曾在利益关口分开，各自另行", verificationCue: "你是否与重要合伙人或事业伙伴因利益、控制权或信任而决裂？",
    baseRate: 0.13, earliestAge: 20, salience: 5, sensitivity: "intense", related: ["career_entrepreneurship", "wealth_investment_loss", "rel_betrayal"], futureSignal: "risk"
  },

  {
    id: "turn_child_arrival", domain: "turning_point", label: "子女到来", description: "子女出生或成为主要照顾者，显著改变人生结构。",
    cue: "后来家中添了一道新命，往后的选择不再只为自己", verificationCue: "子女的出生或长期照顾孩子，是否明显改变了你的人生排序？",
    baseRate: 0.31, earliestAge: 18, salience: 5, sensitivity: "private", related: ["health_reproductive", "rel_marriage", "wealth_family_support"], futureSignal: "stability"
  },
  {
    id: "turn_close_death", domain: "turning_point", label: "至亲离世", description: "成年后经历父母、伴侣、子女或极亲近之人离世。",
    cue: "生命里曾有一场大别离，前后的你已不是同一人", verificationCue: "你是否经历过父母、伴侣、子女或极亲近之人的离世，并因此长期改变？",
    baseRate: 0.2, earliestAge: 14, salience: 5, sensitivity: "intense", related: ["fam_elder_loss", "turn_spiritual", "health_burnout"], futureSignal: "reinvention"
  },
  {
    id: "turn_inheritance", domain: "turning_point", label: "继承与遗产", description: "遗产、家业或重大资产承接影响了人生方向。",
    cue: "旧人留下的不只念想，也有一份家业或财责落到你手上", verificationCue: "你是否因遗产、家业或重大资产承接，明显改变财务与家庭责任？",
    baseRate: 0.08, earliestAge: 18, salience: 4, sensitivity: "private", related: ["wealth_property", "fam_sibling_duty", "turn_close_death"], futureSignal: "stability"
  },
  {
    id: "turn_spiritual", domain: "turning_point", label: "信念转向", description: "因经历重大事件而转向宗教、玄学、心理或精神探索。",
    cue: "一场经历之后，你开始向命理、信念或内心深处问路", verificationCue: "你是否因某次重大经历，持续转向宗教、玄学、心理或精神探索？",
    baseRate: 0.17, earliestAge: 14, salience: 4, sensitivity: "ordinary", related: ["turn_close_death", "health_recovery", "turn_identity_shift"], futureSignal: "reinvention"
  },
  {
    id: "turn_restart", domain: "turning_point", label: "崩塌后重启", description: "在事业、关系、财富或健康重大崩塌后重新开始。",
    cue: "旧局曾近全散，你却从残章里另起一生", verificationCue: "你是否在事业、关系、财务或健康重大崩塌后，真正重新建立过生活？",
    baseRate: 0.16, earliestAge: 18, salience: 5, sensitivity: "intense", related: ["career_job_loss", "wealth_bankruptcy", "rel_divorce"], futureSignal: "reinvention"
  },
  {
    id: "turn_identity_shift", domain: "turning_point", label: "身份重塑", description: "某次经历后价值观、身份认同或生活方式发生根本改变。",
    cue: "有一道关口过去后，你连看待自己的方式都换了", verificationCue: "你是否经历过一次让价值观、身份认同或生活方式根本改变的事件？",
    baseRate: 0.24, earliestAge: 15, salience: 4, sensitivity: "private", related: ["career_switch", "move_overseas", "rel_major_breakup"], futureSignal: "reinvention"
  }
];

export const EVENT_BY_ID = Object.fromEntries(LIFE_EVENTS.map((event) => [event.id, event])) as Record<string, LifeEvent>;

export function getAge(birthDate: string, now = new Date()) {
  if (!birthDate) return 30;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return 30;
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(16, Math.min(90, age));
}
