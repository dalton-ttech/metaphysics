import type { EventDomain, Gender } from "@/lib/types";
import { stableHashV4 } from "@/lib/tieban-v4-engine";
import type { FutureFateNodeV4 } from "@/lib/tieban-v4-types";

export interface LifetimeForecastInputV4 {
  currentAge: number;
  birthYear: number;
  gender: Gender;
  birthplace: string;
  profileId: string;
  profileCode: string;
  profileSignature: string;
  seedDigest: string;
  anchorDomains: EventDomain[];
}

interface AgeBandV4 {
  start: number;
  end: number;
  terminal: boolean;
}

interface FutureTemplateV4 {
  key: string;
  domain: EventDomain;
  minAge: number;
  maxAge: number;
  verse: string;
  sign: string;
  reading: string;
}

interface ClassicVerseV4 {
  text: string;
  reference: string;
}

const DOMAINS: EventDomain[] = [
  "family",
  "education_mobility",
  "career",
  "wealth",
  "relationship",
  "health",
  "law_social",
  "turning_point"
];

const RESERVED_TAIL_KEYS = new Set(["turning.legacy", "family.late-support", "health.strength-decline"]);

const CLASSIC_VERSES: Record<EventDomain, ClassicVerseV4> = {
  family: { text: "露从今夜白，月是故乡明。", reference: "杜甫《月夜忆舍弟》" },
  education_mobility: { text: "山重水复疑无路，柳暗花明又一村。", reference: "陆游《游山西村》" },
  career: { text: "会当凌绝顶，一览众山小。", reference: "杜甫《望岳》" },
  wealth: { text: "长风破浪会有时，直挂云帆济沧海。", reference: "李白《行路难》" },
  relationship: { text: "海内存知己，天涯若比邻。", reference: "王勃《送杜少府之任蜀州》" },
  health: { text: "谁道人生无再少？门前流水尚能西。", reference: "苏轼《浣溪沙》" },
  law_social: { text: "莫愁前路无知己，天下谁人不识君。", reference: "高适《别董大》" },
  turning_point: { text: "沉舟侧畔千帆过，病树前头万木春。", reference: "刘禹锡《酬乐天扬州初逢席上见赠》" }
};

const CLASSIC_ELIGIBLE_KEYS = new Set([
  "family.reunion",
  "mobility.journey",
  "mobility.relocation",
  "career.rise",
  "wealth.income",
  "wealth.recovery",
  "relationship.old-friend",
  "health.recovery",
  "law.helper",
  "law.reputation",
  "turning.restart",
  "turning.crisis"
]);

const FUTURE_TEMPLATES: FutureTemplateV4[] = [
  {
    key: "family.duty",
    domain: "family",
    minAge: 18,
    maxAge: 58,
    verse: "一肩风雨一肩灯，家事临门自有承。",
    sign: "家里原由别人料理的事，开始交到你手中。",
    reading: "家庭分工会重新安排，你将承担一件持续多年的责任。"
  },
  {
    key: "family.elder-care",
    domain: "family",
    minAge: 35,
    maxAge: 76,
    verse: "庭前老树添新绿，堂上春晖入晚晴。",
    sign: "长辈的起居、住所或就医，需要家中重新商量。",
    reading: "你会为一位长辈多费心力，家人之间也会重新分担照料之责。"
  },
  {
    key: "family.home-shift",
    domain: "family",
    minAge: 24,
    maxAge: 72,
    verse: "燕子衔泥寻旧垒，一庭灯火换新门。",
    sign: "家中先添置大件，随后有人提出搬迁或同住。",
    reading: "住所会有一次明显变化，搬家、置业或家庭成员同住至少应一项。"
  },
  {
    key: "family.new-branch",
    domain: "family",
    minAge: 27,
    maxAge: 62,
    verse: "阶前新竹初抽笋，满院春风自此长。",
    sign: "亲属间频繁谈起婚育、添丁或孩子的去处。",
    reading: "家中会添一位重要的新成员，此后数年的生活重心随之改变。"
  },
  {
    key: "family.old-account",
    domain: "family",
    minAge: 42,
    maxAge: 86,
    verse: "旧匣多年今再启，家中名分一朝明。",
    sign: "一份旧证件、房契或长久未谈的家事重新摆上桌面。",
    reading: "一件积压多年的家事会得到处理，财物归属与各自责任随之明确。"
  },
  {
    key: "family.reunion",
    domain: "family",
    minAge: 40,
    maxAge: 88,
    verse: "雁字分飞终有信，长亭归客又登门。",
    sign: "久未往来的亲人忽然来信，或因一场家事重新见面。",
    reading: "疏远已久的亲缘会重新接上，旧日隔阂虽未尽消，相处已比从前和缓。"
  },
  {
    key: "family.late-support",
    domain: "family",
    minAge: 60,
    maxAge: 110,
    verse: "灯火不随人事改，晚来常有问安声。",
    sign: "晚辈探望渐勤，家中开始固定陪伴与照料的日子。",
    reading: "晚年起居多由亲近之人照应，家门虽各有去处，重要时刻仍有人在侧。"
  },
  {
    key: "mobility.study",
    domain: "education_mobility",
    minAge: 18,
    maxAge: 54,
    verse: "案头一卷添新墨，门外千山次第开。",
    sign: "一门课程、证照或新的专业要求反复出现。",
    reading: "你会重新系统学习一项本领，并在工作或生活中真正用上。"
  },
  {
    key: "mobility.journey",
    domain: "education_mobility",
    minAge: 20,
    maxAge: 66,
    verse: "江上潮来催去棹，云开驿路见青山。",
    sign: "异地邀请、出差或远行安排在短期内接连出现。",
    reading: "一次远行会带来新的关系或机会，原先犹豫的去处会逐渐明朗。"
  },
  {
    key: "mobility.relocation",
    domain: "education_mobility",
    minAge: 24,
    maxAge: 70,
    verse: "此岸灯收辞旧渡，他乡月上照新居。",
    sign: "通勤、住房或家人的去处同时发生变化。",
    reading: "生活地点会跨过一段不短的距离，新的城市或社区将住上数年。"
  },
  {
    key: "mobility.return",
    domain: "education_mobility",
    minAge: 38,
    maxAge: 82,
    verse: "行遍远山知路阔，归来仍认旧柴门。",
    sign: "故乡旧人频繁联络，原来离开的地方重新有事相召。",
    reading: "你会回到熟悉之地处理一件要事，也可能由此恢复一段旧联系。"
  },
  {
    key: "mobility.quiet-study",
    domain: "education_mobility",
    minAge: 48,
    maxAge: 86,
    verse: "半窗松影翻书页，一盏清茶坐到深。",
    sign: "闲下来的时间增多，你开始固定阅读、练字或学习。",
    reading: "一项年轻时未能深入的兴趣会重新拾起，并成为往后稳定的日常。"
  },
  {
    key: "mobility.settle",
    domain: "education_mobility",
    minAge: 62,
    maxAge: 100,
    verse: "看尽千帆收晚棹，门前一树便为乡。",
    sign: "远行次数渐少，住处开始按长久生活重新布置。",
    reading: "奔波会明显减少，你将选定一处更适合久住的地方，往后少有大迁。"
  },
  {
    key: "career.rise",
    domain: "career",
    minAge: 21,
    maxAge: 56,
    verse: "石阶踏稳层层上，回首群山已在低。",
    sign: "上级把更难的任务交给你，旁人也开始先来问你的意见。",
    reading: "工作中的分量会加重，职责、影响力与收入有一项明显上移。"
  },
  {
    key: "career.change",
    domain: "career",
    minAge: 24,
    maxAge: 62,
    verse: "旧舟泊罢潮声远，另借东风过一湾。",
    sign: "原岗位的去留迟迟不定，另一处却连续递来消息。",
    reading: "你会离开原来的岗位或做法，转入更适合长期积累的工作。"
  },
  {
    key: "career.independent",
    domain: "career",
    minAge: 27,
    maxAge: 64,
    verse: "不借高枝栖一羽，自开庭院种梧桐。",
    sign: "有人愿意付费请你独立完成一件过去附属于本职的事。",
    reading: "个人名义下的事业或副业会逐渐成形，并带来一项稳定收入。"
  },
  {
    key: "career.partnership",
    domain: "career",
    minAge: 28,
    maxAge: 66,
    verse: "两桨同催舟自疾，分清水路到长堤。",
    sign: "一位熟人带着资源而来，同时要求明确分工与收益。",
    reading: "你会进入一次重要合作；先定权责，合作才会持续并见到成果。"
  },
  {
    key: "career.reputation",
    domain: "career",
    minAge: 34,
    maxAge: 72,
    verse: "十年磨得匣中剑，一日霜锋众所知。",
    sign: "旧成果被重新提起，陌生人也因口碑前来相求。",
    reading: "过往积累会换来一次公开认可，你在熟悉领域中的名声随之提高。"
  },
  {
    key: "career.mentor",
    domain: "career",
    minAge: 44,
    maxAge: 78,
    verse: "手中灯火分人照，身后新枝已成林。",
    sign: "年轻同事或晚辈开始固定来请教，并沿用你的做法。",
    reading: "你会从亲自做事转向带人、授业或把经验整理成可以传下去的方法。"
  },
  {
    key: "career.retire",
    domain: "career",
    minAge: 58,
    maxAge: 88,
    verse: "印绶轻收归旧箧，闲看庭树过春秋。",
    sign: "日常工作开始交给后辈，固定事务逐项减少。",
    reading: "职业责任会正式减轻，你将退出一线，但仍会因经验受到倚重。"
  },
  {
    key: "wealth.income",
    domain: "wealth",
    minAge: 20,
    maxAge: 64,
    verse: "细水初从石罅出，数渠相汇渐成川。",
    sign: "本职之外的新收入先小后稳，连续数月没有中断。",
    reading: "收入来源会增加一项，起初数额不大，后来足以分担日常开支。"
  },
  {
    key: "wealth.expense",
    domain: "wealth",
    minAge: 24,
    maxAge: 76,
    verse: "千金散处皆有用，一屋灯明胜满囊。",
    sign: "一笔长期支出与一项新收入在同一阶段出现。",
    reading: "钱财会重新分配，主要用于住房、家人或一件必须长期投入的事。"
  },
  {
    key: "wealth.property",
    domain: "wealth",
    minAge: 28,
    maxAge: 72,
    verse: "寸土量来安岁月，一砖一瓦定家门。",
    sign: "看房、修缮、产权或长期租住的问题反复商量。",
    reading: "不动产会有一次重要决定，买卖、修缮或产权调整至少应一项。"
  },
  {
    key: "wealth.tight",
    domain: "wealth",
    minAge: 24,
    maxAge: 72,
    verse: "潮退方知礁石在，收帆且待顺风来。",
    sign: "回款变慢，大额支出却比原定时间更早到来。",
    reading: "手头会有一段偏紧的时期；守住现金，不替人担保，数月后可缓。"
  },
  {
    key: "wealth.recovery",
    domain: "wealth",
    minAge: 28,
    maxAge: 78,
    verse: "霜后园中仍有实，春来旧树又生枝。",
    sign: "一项停滞的款项、资产或生意重新有人接手。",
    reading: "先前受阻的钱财会追回一部分，新的进项也从旧经验中生出。"
  },
  {
    key: "wealth.allocate",
    domain: "wealth",
    minAge: 42,
    maxAge: 86,
    verse: "满仓未必皆为谷，留取三分度岁寒。",
    sign: "你开始集中清点账户、保单、产权与长期费用。",
    reading: "资产会从分散转为稳守，风险较高的一项逐渐退出，长期保障随之增加。"
  },
  {
    key: "wealth.late-simple",
    domain: "wealth",
    minAge: 62,
    maxAge: 100,
    verse: "囊中有度心常静，不向浮华问重轻。",
    sign: "大额消费明显减少，钱更多花在健康、家人和日常舒适上。",
    reading: "晚年财用以稳为主，收入未必再增，日常所需却能从容支应。"
  },
  {
    key: "relationship.meeting",
    domain: "relationship",
    minAge: 18,
    maxAge: 52,
    verse: "花径偶逢同路客，一程风雨共扶持。",
    sign: "同一人因工作、朋友或一次外出而反复出现。",
    reading: "一段重要关系会从频繁往来开始，后来进入共同生活或长期承诺。"
  },
  {
    key: "relationship.test",
    domain: "relationship",
    minAge: 22,
    maxAge: 68,
    verse: "并舟最怕中流急，话到深时莫避心。",
    sign: "双方围绕钱、住处或家人连续争执，旧问题无法再绕开。",
    reading: "一段关系会经历严峻考验；把实际安排谈清，才能决定继续还是分开。"
  },
  {
    key: "relationship.reconcile",
    domain: "relationship",
    minAge: 24,
    maxAge: 76,
    verse: "雨过疏帘灯又暖，旧时眉眼渐分明。",
    sign: "冷淡已久的人重新来信，并主动提起当年的分歧。",
    reading: "一段旧关系有机会和解；未必回到从前，但彼此心结会解开。"
  },
  {
    key: "relationship.companion",
    domain: "relationship",
    minAge: 30,
    maxAge: 86,
    verse: "粗茶淡饭同灯坐，胜却春风十里花。",
    sign: "两个人开始一起安排看病、旅行或家中长期支出。",
    reading: "关系会从情绪上的亲近转为生活上的相守，日常照应比言语更重要。"
  },
  {
    key: "relationship.distance",
    domain: "relationship",
    minAge: 24,
    maxAge: 74,
    verse: "雁去衡阳书未断，月明两地照同心。",
    sign: "工作或家事使两人聚少离多，见面需要提前安排。",
    reading: "一段亲密关系会经历异地或长期分居，能否守住全在联系是否稳定。"
  },
  {
    key: "relationship.old-friend",
    domain: "relationship",
    minAge: 38,
    maxAge: 90,
    verse: "旧友敲门茶未冷，半生风雨一言知。",
    sign: "多年未见的朋友因共同旧事重新联系。",
    reading: "一位旧友会再度走近，并在你需要帮助时给出实际支持。"
  },
  {
    key: "relationship.late-company",
    domain: "relationship",
    minAge: 60,
    maxAge: 100,
    verse: "暮色满庭人未散，相看无语亦心安。",
    sign: "日常往来逐渐固定，只留下少数最亲近的人。",
    reading: "晚年交游虽少，仍有一两位知心人常相往来，孤单之时有人可说话。"
  },
  {
    key: "health.fatigue",
    domain: "health",
    minAge: 20,
    maxAge: 62,
    verse: "弓满久张弦易损，且收三分养余力。",
    sign: "睡眠变浅、醒后仍累，忙碌数日便难恢复。",
    reading: "身体会因长期劳累发出警讯，减少熬夜与连续透支后方能回稳。"
  },
  {
    key: "health.injury",
    domain: "health",
    minAge: 18,
    maxAge: 72,
    verse: "行舟莫趁风头急，石滑桥危缓一步。",
    sign: "出行、运动或搬动重物前，手脚先有酸痛不适。",
    reading: "这一阶段须防跌碰、扭伤或旧伤复发，伤处多在四肢与腰背。"
  },
  {
    key: "health.treatment",
    domain: "health",
    minAge: 28,
    maxAge: 84,
    verse: "病树经霜根未损，春风到处又抽芽。",
    sign: "反复不适终于查明原因，医生提出较完整的治疗安排。",
    reading: "一项拖延已久的身体问题会接受治疗，恢复虽慢，结果比预想平稳。"
  },
  {
    key: "health.sleep",
    domain: "health",
    minAge: 28,
    maxAge: 82,
    verse: "夜深莫逐千般事，留得清风入梦来。",
    sign: "夜里易醒、梦多或作息前后颠倒，白天精神随之下降。",
    reading: "睡眠会成为这一阶段的主要问题，调整作息后，情绪与体力会一并改善。"
  },
  {
    key: "health.senses",
    domain: "health",
    minAge: 45,
    maxAge: 92,
    verse: "灯下字疏添镜看，齿间旧痛莫等闲。",
    sign: "阅读更依赖光线，牙齿、听力或视物至少一处反复不适。",
    reading: "眼、耳或牙齿需要一次较认真的检查与处理，及时处置便不妨日常。"
  },
  {
    key: "health.chronic",
    domain: "health",
    minAge: 48,
    maxAge: 94,
    verse: "细雨连绵非骤急，添衣按候便无惊。",
    sign: "指标反复在临界处波动，饮食与用药开始需要长期记录。",
    reading: "慢性旧恙会成为长期相伴之事，按时复查、规律用药即可维持稳定。"
  },
  {
    key: "health.recovery",
    domain: "health",
    minAge: 36,
    maxAge: 88,
    verse: "雨歇云开山色净，扶筇又过小桥东。",
    sign: "一次休养之后，食欲、步力和睡眠先后好转。",
    reading: "身体会从一段低潮中恢复，活动范围逐渐扩大，生活重新能够自理。"
  },
  {
    key: "health.strength-decline",
    domain: "health",
    minAge: 65,
    maxAge: 110,
    verse: "秋深木叶随风缓，行路从今惜寸阴。",
    sign: "步子变慢，白日休息增多，外出开始需要有人陪同。",
    reading: "体力会明显衰减，旧恙发作更频，起居与出行渐由家人照应。"
  },
  {
    key: "law.contract",
    domain: "law_social",
    minAge: 20,
    maxAge: 72,
    verse: "白纸落成千字约，先分彼此后同舟。",
    sign: "原来的口头约定开始需要写进合同或正式文件。",
    reading: "一次合作能否顺利，全在权责是否写清；先立字据，后来少生争端。"
  },
  {
    key: "law.dispute",
    domain: "law_social",
    minAge: 22,
    maxAge: 78,
    verse: "堂前莫竞三分气，案上须留一纸凭。",
    sign: "对方说法前后不同，聊天记录、票据或合同开始变得重要。",
    reading: "你会卷入一场纠纷，宜依证据处理；事情虽烦，最终能划清责任。"
  },
  {
    key: "law.helper",
    domain: "law_social",
    minAge: 20,
    maxAge: 76,
    verse: "雪夜有人提灯至，半程相送过寒关。",
    sign: "一位平日来往不多的人，主动替你引见或作证。",
    reading: "困难之时会有一位关键人物出手相助，使原本僵住的事出现转机。"
  },
  {
    key: "law.reputation",
    domain: "law_social",
    minAge: 30,
    maxAge: 82,
    verse: "清名不在高声处，久看人心自有公。",
    sign: "旁人开始把需要信任与公断的事交由你处理。",
    reading: "你在熟人圈中的声望会提高，也会因此承担调解或作主的责任。"
  },
  {
    key: "law.documents",
    domain: "law_social",
    minAge: 42,
    maxAge: 92,
    verse: "旧契重开朱印正，前因后果一朝清。",
    sign: "遗留多年的证件、产权或账户需要补签与核对。",
    reading: "一批重要文件会集中整理，过去含混的归属因此得到正式确认。"
  },
  {
    key: "law.community",
    domain: "law_social",
    minAge: 48,
    maxAge: 94,
    verse: "门前邻里常相问，闲把公心量短长。",
    sign: "邻里、同业或社群中的公共事务频繁来找你商量。",
    reading: "你会在一个团体中成为可信赖的协调者，虽费精神，也能积下人望。"
  },
  {
    key: "turning.restart",
    domain: "turning_point",
    minAge: 18,
    maxAge: 68,
    verse: "旧页翻过风声定，提笔从头写此章。",
    sign: "原本稳定的安排连续两次变化，旧办法已难再维持。",
    reading: "生活会在工作、住处或关系上出现一次转折，此后数年走法与从前不同。"
  },
  {
    key: "turning.crisis",
    domain: "turning_point",
    minAge: 22,
    maxAge: 76,
    verse: "惊涛拍岸舟犹在，雨过长天见远峰。",
    sign: "几件麻烦在短期内相继发生，迫使你放下原来的优先次序。",
    reading: "这一阶段先难后缓；一场危机过后，你会舍去不再值得维持的人与事。"
  },
  {
    key: "turning.new-role",
    domain: "turning_point",
    minAge: 26,
    maxAge: 72,
    verse: "门内忽添新座次，肩头从此有轻重。",
    sign: "家人与同事开始用新的身份称呼你，并把决定留给你。",
    reading: "你会取得一个新的家庭或事业身份，责任增加，能调动的资源也更多。"
  },
  {
    key: "turning.old-wish",
    domain: "turning_point",
    minAge: 38,
    maxAge: 82,
    verse: "旧梦不曾随岁远，春风又到少年心。",
    sign: "年轻时放下的愿望连续被旧人和旧物提起。",
    reading: "一件搁置多年的心愿会重新开始，这次不求声势，只求真正做成。"
  },
  {
    key: "turning.simplify",
    domain: "turning_point",
    minAge: 48,
    maxAge: 90,
    verse: "删去繁枝留一树，庭前风月自分明。",
    sign: "你主动结束一项耗时却少有所得的长期事务。",
    reading: "生活会做一次明显减法，事务与往来减少，时间重新回到自己手中。"
  },
  {
    key: "turning.retirement-life",
    domain: "turning_point",
    minAge: 58,
    maxAge: 92,
    verse: "朝衣换作寻常服，闲日仍将旧艺温。",
    sign: "固定工作渐少，你开始认真安排每天如何度过。",
    reading: "离开主要职业之后，你会以兴趣、照料家人或传授经验填满新的日常。"
  },
  {
    key: "turning.legacy",
    domain: "turning_point",
    minAge: 62,
    maxAge: 110,
    verse: "半生所得分人看，一卷留成后辈灯。",
    sign: "旧照片、文字、手艺或重要物件开始有次序地整理。",
    reading: "你会把一生最看重的经验与物件交给后辈，晚年的心事也因此安定。"
  }
];

const TEMPLATES_BY_DOMAIN = new Map<EventDomain, FutureTemplateV4[]>(
  DOMAINS.map((domain) => [domain, FUTURE_TEMPLATES.filter((template) => template.domain === domain)])
);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculateTerminalAgeV4(input: LifetimeForecastInputV4) {
  const genderAdjustment = input.gender === "female" ? 3 : input.gender === "male" ? 0 : 2;
  const cohortAdjustment = input.birthYear >= 2000 ? 3 : input.birthYear >= 1980 ? 2 : input.birthYear >= 1960 ? 1 : 0;
  const placeAdjustment = stableHashV4(`place:${input.birthplace || "未录"}`) % 3 - 1;
  const profileAdjustment = stableHashV4(`life:${input.profileSignature}:${input.seedDigest}`) % 9 - 4;
  const estimated = 80 + genderAdjustment + cohortAdjustment + placeAdjustment + profileAdjustment;
  return clamp(estimated, Math.max(72, input.currentAge + 8), 96);
}

export function buildLifetimeAgeBandsV4(currentAge: number, terminalAge: number): AgeBandV4[] {
  const bands: AgeBandV4[] = [];
  const lastLivingAge = terminalAge - 1;
  let cursor = currentAge + 1;
  while (cursor <= lastLivingAge) {
    const distance = cursor - (currentAge + 1);
    const width = distance < 9 ? 1 : distance < 24 ? 2 : 3;
    const decadeEnd = Math.floor(cursor / 10) * 10 + 9;
    const end = Math.min(lastLivingAge, decadeEnd, cursor + width - 1);
    bands.push({ start: cursor, end, terminal: false });
    cursor = end + 1;
  }
  bands.push({ start: terminalAge, end: terminalAge, terminal: true });
  return bands;
}

function ageLabel(start: number, end: number) {
  return start === end ? `${start}岁` : `${start}—${end}岁`;
}

function decadeLabel(age: number) {
  const start = Math.floor(age / 10) * 10;
  return `${start}—${start + 9}岁`;
}

function ageWeight(domain: EventDomain, age: number) {
  if (domain === "health") return age >= 70 ? 42 : age >= 55 ? 24 : 4;
  if (domain === "career") return age <= 55 ? 30 : age <= 68 ? 10 : -38;
  if (domain === "education_mobility") return age <= 58 ? 18 : age <= 76 ? 2 : -28;
  if (domain === "family") return age >= 28 && age <= 72 ? 22 : 10;
  if (domain === "wealth") return age >= 35 && age <= 75 ? 18 : 8;
  if (domain === "relationship") return age <= 72 ? 12 : 6;
  if (domain === "law_social") return age >= 30 && age <= 78 ? 10 : 2;
  return 12;
}

function chooseTemplate(
  input: LifetimeForecastInputV4,
  band: AgeBandV4,
  index: number,
  usedKeys: Set<string>,
  domainCounts: Map<EventDomain, number>,
  recentDomains: EventDomain[]
) {
  const age = Math.floor((band.start + band.end) / 2);
  const anchorCounts = new Map<EventDomain, number>();
  for (const domain of input.anchorDomains) anchorCounts.set(domain, (anchorCounts.get(domain) ?? 0) + 1);
  const blockedDomain = recentDomains.length >= 2 && recentDomains.at(-1) === recentDomains.at(-2) ? recentDomains.at(-1) : null;
  const candidates = DOMAINS
    .filter((domain) => domain !== blockedDomain)
    .flatMap((domain) => {
      const templates = (TEMPLATES_BY_DOMAIN.get(domain) ?? []).filter((template) =>
        !RESERVED_TAIL_KEYS.has(template.key)
        && !usedKeys.has(template.key)
        && age >= template.minAge
        && age <= template.maxAge
      );
      return templates.map((template) => {
        const recentPenalty = recentDomains.at(-1) === domain ? 54 : recentDomains.at(-2) === domain ? 16 : 0;
        const score = stableHashV4(`${input.profileCode}:${input.profileSignature}:${band.start}:${template.key}`) % 41
          + (anchorCounts.get(domain) ?? 0) * 9
          + ageWeight(domain, age)
          - (domainCounts.get(domain) ?? 0) * 13
          - recentPenalty;
        return { template, score };
      });
    })
    .sort((left, right) => right.score - left.score || left.template.key.localeCompare(right.template.key));

  if (candidates[0]) return candidates[0].template;
  const fallback = FUTURE_TEMPLATES
    .filter((template) => !RESERVED_TAIL_KEYS.has(template.key) && !usedKeys.has(template.key))
    .sort((left, right) =>
      stableHashV4(`${input.profileCode}:fallback:${index}:${left.key}`)
      - stableHashV4(`${input.profileCode}:fallback:${index}:${right.key}`)
    );
  return fallback[0] ?? FUTURE_TEMPLATES[index % FUTURE_TEMPLATES.length];
}

function terminalVerse(input: LifetimeForecastInputV4) {
  const verses = [
    "一灯照尽平生事，帘外松风送晚钟。",
    "旧卷至此朱砂定，庭前风静月初沉。",
    "来时一叶随春水，归去千山入暮云。",
    "一生行至云归处，灯火犹温月正明。"
  ];
  return verses[stableHashV4(`terminal-verse:${input.profileSignature}`) % verses.length];
}

function terminalSeason(input: LifetimeForecastInputV4) {
  return ["春末", "夏初", "秋后", "岁末"][stableHashV4(`terminal-season:${input.seedDigest}`) % 4];
}

export function buildLifetimeForecastV4(input: LifetimeForecastInputV4) {
  const terminalAge = calculateTerminalAgeV4(input);
  const bands = buildLifetimeAgeBandsV4(input.currentAge, terminalAge);
  const usedKeys = new Set<string>();
  const usedClassicDomains = new Set<EventDomain>();
  const domainCounts = new Map<EventDomain, number>();
  const recentDomains: EventDomain[] = [];
  const nonTerminalCount = bands.length - 1;
  const classicOffset = stableHashV4(`classic:${input.profileCode}`) % 7;
  const nodes: FutureFateNodeV4[] = [];

  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const horizon = ageLabel(band.start, band.end);
    if (band.terminal) {
      const season = terminalSeason(input);
      nodes.push({
        id: `future-${input.profileId}-terminal-${terminalAge}`,
        clauseId: `lifetime.terminal.${terminalAge}`,
        ageStart: terminalAge,
        ageEnd: terminalAge,
        horizon,
        decadeLabel: "寿限",
        domain: "health",
        eventKey: "lifetime.terminal",
        verse: terminalVerse(input),
        sign: "征兆：起居渐少，睡卧渐多，家中开始交代久未料理的事。",
        reading: `${terminalAge}岁为寿限。此年气力渐衰，家中事务陆续交代，约在${season}安然谢世。`,
        sourceType: "original",
        sourceReference: "终身流年判词库",
        sourceProfileId: input.profileId,
        terminal: true
      });
      continue;
    }

    const tailIndex = index - (nonTerminalCount - 3);
    const forcedTailKey = tailIndex === 0
      ? "turning.legacy"
      : tailIndex === 1
        ? "family.late-support"
        : tailIndex === 2
          ? "health.strength-decline"
          : null;
    const template = forcedTailKey
      ? FUTURE_TEMPLATES.find((item) => item.key === forcedTailKey)!
      : chooseTemplate(input, band, index, usedKeys, domainCounts, recentDomains);
    usedKeys.add(template.key);
    domainCounts.set(template.domain, (domainCounts.get(template.domain) ?? 0) + 1);
    recentDomains.push(template.domain);
    if (recentDomains.length > 2) recentDomains.shift();

    const useClassic = index >= 3
      && (index + classicOffset) % 9 === 0
      && CLASSIC_ELIGIBLE_KEYS.has(template.key)
      && !usedClassicDomains.has(template.domain)
      && nodes.filter((node) => node.sourceType === "classic").length < Math.floor(nonTerminalCount * 0.15);
    const classic = CLASSIC_VERSES[template.domain];
    if (useClassic) usedClassicDomains.add(template.domain);

    nodes.push({
      id: `future-${input.profileId}-${band.start}-${template.key}`,
      clauseId: `lifetime.${template.key}`,
      ageStart: band.start,
      ageEnd: band.end,
      horizon,
      decadeLabel: decadeLabel(band.start),
      domain: template.domain,
      eventKey: template.key,
      verse: useClassic ? classic.text : template.verse,
      sign: `征兆：${template.sign}`,
      reading: `${horizon}，${template.reading}`,
      sourceType: useClassic ? "classic" : "original",
      sourceReference: useClassic ? classic.reference : "终身流年判词库",
      sourceProfileId: input.profileId,
      terminal: false
    });
  }

  return { terminalAge, nodes };
}

export const TIEBAN_V4_FUTURE_TEMPLATE_COUNT = FUTURE_TEMPLATES.length;
