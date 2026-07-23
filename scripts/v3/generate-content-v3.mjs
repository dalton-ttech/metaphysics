import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "data/v3");

const schemaVersion = "3.0.0";
const corpusVersion = "2026.07.21-v4-content.1";

const SOURCE = {
  kind: "modern_fabricated",
  label: "现代拟制·古籍断语体",
  provenance: "依据项目人生事件本体与铁板神数可感知流程进行现代工程创作，非古籍原文，亦不冒称任何传承秘本。",
  sourceRefs: ["src/lib/events.ts", "docs/02-event-ontology.md", "research/20260721-铁板神数真实流程与定度数学调研V3.md"]
};

const DOMAIN = {
  family: { title: "家门六亲", subject: "本人及家门", trait: "重情守责", gain: "守住家门而不失己志", risk: "事事代人受过", past: "家事曾牵动个人道路", future: "先分清责任，后见家运转稳" },
  education_mobility: { title: "学路迁动", subject: "本人", trait: "见变能行", gain: "换境之后另开见识", risk: "心未定而路先频换", past: "学路或居处曾改换章法", future: "择定一处深耕，迁动方能化为上升" },
  career: { title: "事业位势", subject: "本人", trait: "临事敢任", gain: "在主事之位聚成声望", risk: "用力太散而功归他人", past: "事业曾有进退改道", future: "聚焦一门，位势才会再升" },
  wealth: { title: "财脉承载", subject: "本人及家计", trait: "知得失轻重", gain: "以稳健积累成局", risk: "急进、代偿或边界不清", past: "财路曾因一事明显转折", future: "清旧账、守现金，后财方能聚" },
  relationship: { title: "情缘婚姻", subject: "本人及伴侣", trait: "情深而审慎", gain: "以坦诚和边界守住长缘", risk: "把旧伤带进新局", past: "情缘曾改过人生次序", future: "先辨同路之人，再议久长之约" },
  health: { title: "身心关口", subject: "本人", trait: "经关而知节制", gain: "从旧恙中重立生活秩序", risk: "小警不理而积成大耗", past: "身心曾迫使生活停步", future: "及早应对反复信号，关口可转为更新" },
  law_social: { title: "人际是非", subject: "本人及近身关系", trait: "识人渐深", gain: "以清楚规则换来长久助力", risk: "轻信口诺或卷入他人局势", past: "人情是非曾影响名利", future: "契约先行，贵人与是非自会分明" },
  turning_point: { title: "大变重启", subject: "本人及重要关系", trait: "遇变能生", gain: "在旧局终结处重建身份", risk: "留恋旧位而错过新门", past: "一场大变曾重排人生", future: "顺势舍旧，后运反见开阔" }
};

const WINDOWS = {
  family: [[0, 12, "幼年至十二岁"], [13, 18, "十三至十八岁"], [19, 27, "十九至二十七岁"], [28, 39, "二十八至三十九岁"], [40, 55, "四十至五十五岁"]],
  education_mobility: [[6, 9, "六至九岁"], [10, 12, "十至十二岁"], [13, 15, "十三至十五岁"], [16, 18, "十六至十八岁"], [19, 25, "十九至二十五岁"]],
  career: [[15, 19, "十五至十九岁"], [20, 24, "二十至二十四岁"], [25, 30, "二十五至三十岁"], [31, 39, "三十一至三十九岁"], [40, 55, "四十至五十五岁"]],
  wealth: [[16, 20, "十六至二十岁"], [21, 25, "二十一至二十五岁"], [26, 32, "二十六至三十二岁"], [33, 42, "三十三至四十二岁"], [43, 58, "四十三至五十八岁"]],
  relationship: [[14, 18, "十四至十八岁"], [19, 23, "十九至二十三岁"], [24, 29, "二十四至二十九岁"], [30, 39, "三十至三十九岁"], [40, 55, "四十至五十五岁"]],
  health: [[0, 12, "幼年至十二岁"], [13, 19, "十三至十九岁"], [20, 29, "二十至二十九岁"], [30, 39, "三十至三十九岁"], [40, 55, "四十至五十五岁"]],
  law_social: [[14, 19, "十四至十九岁"], [20, 25, "二十至二十五岁"], [26, 32, "二十六至三十二岁"], [33, 42, "三十三至四十二岁"], [43, 58, "四十三至五十八岁"]],
  turning_point: [[0, 14, "幼年至十四岁"], [15, 21, "十五至二十一岁"], [22, 30, "二十二至三十岁"], [31, 40, "三十一至四十岁"], [41, 58, "四十一至五十八岁"]]
};

// 成人身份或生育事实不能机械套用领域的早年窗口。
const WINDOW_OVERRIDES = {
  rel_long_single: [[18, 23, "十八至二十三岁"], [24, 29, "二十四至二十九岁"], [30, 35, "三十至三十五岁"], [36, 44, "三十六至四十四岁"], [45, 58, "四十五至五十八岁"]],
  rel_marriage: [[16, 20, "十六至二十岁"], [21, 25, "二十一至二十五岁"], [26, 30, "二十六至三十岁"], [31, 39, "三十一至三十九岁"], [40, 55, "四十至五十五岁"]],
  rel_divorce: [[18, 22, "十八至二十二岁"], [23, 27, "二十三至二十七岁"], [28, 33, "二十八至三十三岁"], [34, 42, "三十四至四十二岁"], [43, 58, "四十三至五十八岁"]],
  health_reproductive: [[16, 20, "十六至二十岁"], [21, 25, "二十一至二十五岁"], [26, 31, "二十六至三十一岁"], [32, 38, "三十二至三十八岁"], [39, 48, "三十九至四十八岁"]],
  turn_child_arrival: [[16, 20, "十六至二十岁"], [21, 25, "二十一至二十五岁"], [26, 31, "二十六至三十一岁"], [32, 39, "三十二至三十九岁"], [40, 55, "四十至五十五岁"]]
};

// 每个词条沿用旧事件 ID 做兼容，但 clauseTexts 中每一项分别绑定一个带年龄窗口的独立事实。
// 文案全部为现代拟制；短句只陈述一个可核验命题。
const ROOTS = [
  ["fam_early_burden", "family", "早担家责", "较早承担持续的家庭责任", "private", ["童岁家担先至，肩责早于同伴", "未及弱冠，家中诸务已多倚你", "初入成年，家责曾压过己愿", "中岁未至，家门重担忽然加身", "四旬以后，家责再临而难旁卸"]],
  ["fam_parental_distance", "family", "双亲疏离", "父母长期不和、分开，或本人同一方亲缘明显疏远", "intense", ["幼岁双亲少同声，家中冷暖早分", "少年见双亲分路，亲缘难得周全", "二旬前后，父母关系有长期隔阂", "三旬之间，双亲一线再见疏离", "中岁家门仍有双亲不合之象"]],
  ["fam_financial_fall", "family", "家运骤落", "家庭经济条件发生明显而持续的下降", "private", ["幼年家计由宽转紧，衣食忽改", "少年家财一落，日用从此收束", "初成年时，家中收入骤减", "三旬前后，家业曾有明显退势", "中岁家计忽窄，旧有余裕不存"]],
  ["fam_elder_loss", "family", "长辈早离", "一位重要长辈离世或长期离场", "intense", ["幼岁庭前少一长灯，长者早离", "少年哭别尊亲，家席从此少一人", "二旬内外，重要长辈忽然离场", "三旬之间，家中曾办长者后事", "中岁再逢尊亲远别，家序随改"]],
  ["fam_sibling_duty", "family", "手足牵责", "因兄弟姐妹长期承担照顾、经济或善后责任", "private", ["幼时同枝有累，常替手足分忧", "少年为手足操心，己事反在其后", "二旬前后，手足之事曾由你收拾", "三旬之间，兄弟姊妹多倚你出力", "中岁仍受手足牵连，责任难轻"]],
  ["fam_caregiving", "family", "长期照护", "连续数月以上照护患病、年迈或陷入困境的家人", "intense", ["幼岁曾守病亲，日常为此改换", "少年为家人侍疾，久劳心力", "二旬前后，有一程专事照护家人", "三旬之间，曾为病亲停下己路", "中岁照护之责重来，时日非短"]],

  ["edu_school_transfer", "education_mobility", "转学换境", "转学或进入差异显著的新教育环境", "ordinary", ["蒙学未稳，书舍先迁", "十岁上下，学堂曾换一处", "少年书路改门，师友尽换", "将近弱冠，所学环境忽然不同", "二旬初年，仍有一次学籍或学境迁转"]],
  ["edu_study_interruption", "education_mobility", "学业中断", "学业中断、延期或明显偏离原定升学路径", "private", ["启蒙之学曾有停顿，非照常序", "小学中途，学路一度断续", "少年课业曾停，进度迟于原期", "十六至十八，升学之路有阻", "二旬前后，学业曾延期或改道"]],
  ["edu_exam_turn", "education_mobility", "考试转折", "一次考试、落榜或录取显著改变后续道路", "ordinary", ["初学一试，曾换后来书路", "十岁上下，一纸名次改了去处", "少年有一场考试，成败皆改前程", "弱冠前后，录取结果另开一门", "二旬初年，一试定下后来方向"]],
  ["move_left_hometown", "education_mobility", "离乡发展", "因求学或工作长期离开成长地生活", "ordinary", ["幼岁离故里，久居别处", "少年离乡求学，归期不定", "未冠先别故土，生活另起", "十六至十八，因学远行久住", "二旬前后，离乡立业成局"]],
  ["move_repeated", "education_mobility", "多次迁居", "在该阶段发生两次以上明显迁居", "ordinary", ["幼岁居处屡迁，门庭不定", "十岁上下，两换住处", "少年三迁，所居未久即换", "弱冠前后，住处接连变更", "二旬初年，跨城迁居不止一次"]],
  ["move_overseas", "education_mobility", "海外久居", "连续半年以上在海外求学、工作或生活", "ordinary", ["幼年随亲远渡，海外久居", "十岁上下，曾在异国长住", "少年越海求学，半年未归", "弱冠前后，海外一程非短", "二旬初年，因学业事业久居异国"]],

  ["career_early_work", "career", "较早谋生", "比同龄人更早进入持续工作或挣钱状态", "ordinary", ["未及成年，已先入世谋生", "二旬未到，已有稳定进项", "二旬初年，工作早于同伴定下", "二旬后段，曾以己力担起生计", "三旬之后，仍有一次被迫早作新业"]],
  ["career_switch", "career", "职业转轨", "跨行业或职业主线发生明显改变", "ordinary", ["初入世途，所业已换门径", "二旬初年，职业曾改一行", "二旬后段，旧业尽舍而转新途", "三旬之间，事业主线重新改定", "四旬以后，仍有跨业另起之象"]],
  ["career_leadership", "career", "掌事带人", "正式承担团队管理、负责人或关键决策职责", "ordinary", ["少年掌事，众人已有所倚", "二旬初年，曾领人做事", "二旬后段，职中已有决断之权", "三旬之间，位至主事而带团队", "四旬以后，仍居定策之位"]],
  ["career_entrepreneurship", "career", "创业自营", "自主经营生意或承担独立项目主要盈亏", "private", ["未冠即试营生，盈亏自担", "二旬初年，曾自己开局做事", "二旬后段，自营事业已有成败", "三旬之间，创业一局由你主掌", "四旬以后，再有自立门户之举"]],
  ["career_job_loss", "career", "被动失业", "因裁员、辞退或外部原因发生非自愿职业中断", "private", ["初入职场，工作曾被外力骤停", "二旬初年，非自愿失去职位", "二旬后段，事业一度被迫断章", "三旬之间，有裁撤辞退之变", "四旬以后，职位仍曾因外因中止"]],
  ["career_major_achievement", "career", "事业跃升", "因晋升、奖项、项目或声望获得明显事业跃升", "ordinary", ["少年已有一事成名于众", "二旬初年，事业忽上一阶", "二旬后段，一役使名位俱升", "三旬之间，有大成果抬高位置", "四旬以后，仍见事业显达一程"]],

  ["wealth_income_leap", "wealth", "收入跃升", "收入、利润或可支配资产在短期内显著增长", "private", ["未及二旬，所得曾骤然增多", "二旬初年，财入越过旧阶", "二旬后段，一两年间收入大增", "三旬之间，财门忽然开阔", "四旬以后，仍有一次进项跃升"]],
  ["wealth_debt", "wealth", "债务压力", "持续一年以上的负债或偿付压力明显影响生活选择", "intense", ["少年已闻债声，家计为之受限", "二旬初年，偿付压力久压日用", "二旬后段，负债曾改人生取舍", "三旬之间，旧债新债一度相逼", "四旬以后，仍有长期偿付之担"]],
  ["wealth_investment_loss", "wealth", "投资重损", "因投资、合伙、借款或投机发生明显财务损失", "private", ["初识财事，便有一笔去而难回", "二旬初年，投资曾见重损", "二旬后段，合伙投机失财明显", "三旬之间，一笔大损伤及家计", "四旬以后，仍有财因错投而去"]],
  ["wealth_property", "wealth", "置业节点", "购买、出售或处置重要房产并改变家庭财务安排", "private", ["未及二旬，家中房产已改居处", "二旬初年，曾因屋业重排家计", "二旬后段，置业成为人生节点", "三旬之间，房产一事定下根基", "四旬以后，再有重要屋业处置"]],
  ["wealth_family_support", "wealth", "供养家门", "收入中长期有较大部分用于供养亲属", "private", ["少年所得，多归家用", "二旬初年，收入常分流家门", "二旬后段，长期供养亲属", "三旬之间，家计多由你承担", "四旬以后，仍为家人负重要开支"]],
  ["wealth_bankruptcy", "wealth", "财局近零", "本人、家庭或经营事业经历破产、清算或接近资不抵债", "intense", ["少年家财几尽，旧业难支", "二旬初年，财局曾近归零", "二旬后段，有清算破产之险", "三旬之间，资债一度难相抵", "四旬以后，仍逢一次财局大败"]],

  ["rel_formative_love", "relationship", "早年深情", "一段较早发生的恋爱长期影响其亲密关系判断", "private", ["少年情门早开，一人久留心上", "二旬初年，有一段深情改了性情", "二旬后段，旧爱仍影响后来择偶", "三旬之间，一段情缘重塑亲密之道", "四旬以后，仍有深情改变后程"]],
  ["rel_long_single", "relationship", "长期独行", "连续三年以上没有稳定亲密关系", "private", ["成人初年，独行三载有余", "二旬后段，情路空窗甚久", "三旬前段，数年未入稳定关系", "三旬后段，仍有长久独处之期", "中岁情缘淡，久无定伴"]],
  ["rel_major_breakup", "relationship", "重大分手", "一段重要关系结束并造成持续影响", "intense", ["少年一缘骤断，余痛久存", "二旬初年，重要情缘曾决然收场", "二旬后段，一次分手改了生活", "三旬之间，关系终结而余波甚长", "四旬以后，仍有一段大缘分路"]],
  ["rel_marriage", "relationship", "婚姻成局", "登记结婚、举行婚礼或进入稳定事实婚姻", "private", ["十八前后，婚缘早定，共立门户", "二旬初年，已有婚姻之实", "二旬后段，结发成家", "三旬之间，婚缘正式落定", "四旬以后，再见婚姻成局"]],
  ["rel_divorce", "relationship", "婚姻离合", "离婚、长期分居或婚姻关系实质破裂", "intense", ["二旬前后，早婚之局旋分", "二旬中段，婚局已有离象", "三旬前后，夫妻曾各走一程", "三旬后段，婚姻实质破裂", "四旬以后，仍有结发分路之关"]],
  ["rel_betrayal", "relationship", "信任破裂", "在重要亲密关系中经历出轨、长期欺骗或严重背叛", "intense", ["少年情中见欺，信任早伤", "二旬初年，亲密之人曾负旧约", "二旬后段，情中暗线终被揭开", "三旬之间，关系因背叛而裂", "四旬以后，仍见一次重信失守"]],

  ["health_hospital", "health", "住院手术", "因疾病或身体问题住院、手术或接受较重治疗", "intense", ["幼岁曾入病室，医治非轻", "少年有住院手术之关", "二旬之间，身体曾受重治", "三旬之间，因病入院一程", "四旬以后，仍过一次医治关口"]],
  ["health_chronic", "health", "慢性旧恙", "持续一年以上的慢性身体问题反复影响生活", "intense", ["幼岁旧恙反复，久未全去", "少年一症经年，时轻时重", "二旬之间，慢性之疾影响日常", "三旬之间，旧症长期相随", "四旬以后，仍有一处病根反复"]],
  ["health_accident", "health", "严重意外", "遭遇需要治疗或长期休养的严重意外伤害", "intense", ["幼岁有骤险，身体曾伤", "少年意外临身，休养非短", "二旬之间，行路或工作曾遇重伤", "三旬之间，一场事故迫使停步", "四旬以后，仍有突发伤损之关"]],
  ["health_burnout", "health", "身心耗竭", "持续数月的失眠、焦虑、抑郁或耗竭明显影响功能", "intense", ["幼岁心神久困，日常亦受影响", "少年数月难安，睡眠情绪俱损", "二旬之间，身心曾耗至难以做事", "三旬之间，压力久积而成耗竭", "四旬以后，仍有一程心力近空"]],
  ["health_reproductive", "health", "生育关口", "本人或伴侣经历怀孕、流产、难孕或生育相关重大治疗", "intense", ["十八前后，子息之门已有喜忧", "二旬初年，怀孕生育一事牵动全家", "二旬后段，子息一关曾经重医", "三旬之间，生育之事久牵心力", "四旬前后，仍有生育治疗之关"]],
  ["health_recovery", "health", "大病后复", "从严重健康或心理低谷经历持续康复并改变生活方式", "intense", ["幼岁病后久养，生活从此有变", "少年自一场重恙中缓缓复原", "二旬之间，大病低谷后重立作息", "三旬之间，曾经长程康复而改性情", "四旬以后，仍有一次病后重整"]],

  ["law_dispute", "law_social", "诉讼纠纷", "本人或家庭卷入诉讼、仲裁、报警处理或重要法律争议", "intense", ["少年家门已有讼纸之扰", "二旬初年，是非曾落到公门", "二旬后段，诉讼仲裁牵身", "三旬之间，法律争议久未能了", "四旬以后，仍见讼事一程"]],
  ["law_crime_contact", "law_social", "刑名牵连", "本人或近亲涉及刑事调查、拘留、服刑或重大犯罪事件", "intense", ["少年近刑名，家中有人被查", "二旬初年，自己或至亲曾涉重案", "二旬后段，刑事调查牵动家门", "三旬之间，有拘留服刑之事近身", "四旬以后，仍有刑名之险相连"]],
  ["social_reputation_crisis", "law_social", "名誉危机", "因公开争议、舆论或流言遭受明显名誉损害", "private", ["少年曾受流言所伤，名声一时不利", "二旬初年，公开是非损及声名", "二旬后段，舆论争议曾压事业", "三旬之间，名誉有一次大考", "四旬以后，仍见口舌传扬之患"]],
  ["social_major_conflict", "law_social", "重大冲突", "与亲友、同事或合作方发生导致长期断联的重大冲突", "private", ["少年与近人反目，久不相通", "二旬初年，一场冲突断了旧交", "二旬后段，与同事亲友长期失和", "三旬之间，重大争执使关系终止", "四旬以后，仍有一人因冲突远去"]],
  ["social_mentor", "law_social", "贵人提携", "一位重要师长或贵人在关键节点提供决定性帮助", "ordinary", ["少年得长者引路，书途因而转明", "二旬初年，有贵人一言开门", "二旬后段，师友提携使事业上阶", "三旬之间，关键人物曾助你定局", "四旬以后，仍有长者贵人扶持"]],
  ["social_partnership_break", "law_social", "合作决裂", "重要商业或工作合作因利益或信任问题破裂", "private", ["少年合事不终，伙伴中途分离", "二旬初年，合作因利而散", "二旬后段，伙伴失信使项目终止", "三旬之间，一次合伙决裂伤财", "四旬以后，仍有合作分局之变"]],

  ["turn_child_arrival", "turning_point", "子女到来", "子女出生、收养或承担主要养育责任并改变生活结构", "private", ["十八前后，养育之责初临", "二旬初年，子女到来重排日常", "二旬后段，家门添子而全局改换", "三旬之间，养育之责正式加身", "四旬以后，再有子女之事改局"]],
  ["turn_close_death", "turning_point", "至亲离世", "父母、伴侣、手足或挚友离世并显著改变人生", "intense", ["幼岁痛失至亲，性情从此不同", "少年送别近人，人生早知无常", "二旬之间，至亲离世重排前路", "三旬之间，一场丧别改变生活", "四旬以后，仍有近人永别之痛"]],
  ["turn_inheritance", "turning_point", "继承处置", "继承、遗产、家业交接或重大财产处置改变家庭关系", "private", ["幼年家中已有遗产之争", "少年因家业交接见亲情冷暖", "二旬之间，继承一事改变家门", "三旬之间，曾处置重要遗产家业", "四旬以后，仍有家产承继之事"]],
  ["turn_spiritual", "turning_point", "信念转向", "因重大经历显著改变宗教、哲学或人生信念", "ordinary", ["幼岁一事，使心中早有敬畏", "少年逢变，信念自此不同", "二旬之间，人生观曾彻底转向", "三旬之间，因大事另立精神尺度", "四旬以后，仍有一次信念重整"]],
  ["turn_restart", "turning_point", "崩塌重启", "事业、关系或生活结构崩塌后重新开始", "intense", ["幼年家局一散，生活重新起头", "少年旧路尽断，被迫另开一程", "二旬之间，人生曾近归零再起", "三旬之间，一场崩塌后重建全局", "四旬以后，仍有舍旧重启之变"]],
  ["turn_identity_shift", "turning_point", "身份重塑", "因迁移、转行、婚育或公开角色变化重塑自我身份", "ordinary", ["幼岁换境，身份归属早有变化", "少年因一事不再是旧日自己", "二旬之间，角色转换重塑人生", "三旬之间，身份与社会位置重定", "四旬以后，仍有一次角色大换"]],

  ["fam_parent_illness", "family", "亲病动家", "父母一方经历重病或长期治疗并改变家庭分工", "intense", ["幼庭药气久留，亲病动其家序", "少年常候病门，双亲一方久治", "初立门户，亲疾使家中分工尽改", "立业之际，父母重病牵住日常", "行至中途，侍亲医治又成重事"]],
  ["fam_reconstituted", "family", "家门重组", "因再婚、继亲或长期同住关系形成重组家庭", "private", ["童庭易主，家中称谓从此有变", "少年入新门，亲疏次序重新排定", "初立门户，原生家局另添一支", "立业之际，家门因再婚重新组合", "行至中途，旧亲新眷同入一门"]],
  ["fam_sibling_separation", "family", "手足分路", "兄弟姐妹因迁居、失和或家庭安排长期分离", "private", ["幼时同枝早分，各居一处", "少年手足离门，往来渐稀", "初立门户，兄弟姊妹各走远路", "立业之际，手足多年少见", "行至中途，同胞一线仍见疏远"]],
  ["fam_property_conflict", "family", "家产起争", "家庭因房产、土地或长辈财物发生持续争执", "intense", ["童岁已闻宅产相争，亲情受损", "少年家中为田宅久有口舌", "初立门户，家产一事使亲族失和", "立业之际，房地分配久争未定", "行至中途，旧产再动亲门是非"]],

  ["edu_academic_honor", "education_mobility", "学名见显", "因成绩、竞赛或录取获得明显学业荣誉", "ordinary", ["启蒙一试，名次先出同侪", "书堂榜上有名，师长皆知", "少年一科见长，曾获明奖", "弱冠前后，录取荣誉使书路上阶", "初入世途，仍以一试取得资阶"]],
  ["edu_exam_repeat", "education_mobility", "再试方成", "重要考试经历复读、重考或第二次尝试才取得结果", "private", ["初学一试未成，来年再取", "书堂曾经重读，次试方进", "少年一榜失手，复考才定去处", "弱冠关前，再试而后入门", "初入世途，资格一证经两度方成"]],
  ["edu_vocational_turn", "education_mobility", "技业换书", "由普通学业转入职业技能、证照或实务训练路径", "ordinary", ["启蒙未循常课，先习一技", "书路中分，转学实用之业", "少年弃旧科目，另取技能", "弱冠前后，以证照改开前路", "初入世途，重学一门可用之技"]],
  ["edu_financial_barrier", "education_mobility", "家计阻学", "因经济压力放弃、推迟或改变原定教育计划", "intense", ["童岁家计收紧，所学因此有缺", "少年因钱粮改换书堂", "求学正盛，费用使原路中止", "弱冠关前，升学因家计另择", "初入世途，原定深造曾为财止"]],

  ["career_public_service", "career", "入公门任", "进入机关、事业单位、军警或规则严密的公共组织工作", "ordinary", ["未冠先入有制之门，行事皆循章", "初入世途，任职公门或大制之中", "立身以后，所业有编有序", "立业之际，职位转入公共体系", "行至中途，仍在法度严明之所掌事"]],
  ["career_promotion_block", "career", "升迁受阻", "已具资格或承担职责后仍遭遇明显晋升受阻", "private", ["初任已担重责，名位却迟", "初入世途，功已成而阶未进", "立身以后，升迁曾被一事压住", "立业之际，职位久停在门前", "行至中途，有实无名之局再现"]],
  ["career_work_relocation", "career", "因职迁城", "因工作调动、派驻或项目连续半年以上迁往异地", "ordinary", ["初事即离旧城，因业远行", "初入世途，奉职迁往别处", "立身以后，一纸调令改了居所", "立业之际，因项目久驻外城", "行至中途，事业又使门庭迁动"]],
  ["career_business_failure", "career", "营局败退", "自主经营或主要负责的项目发生停业、清盘或重大失败", "intense", ["初试营生未终，所谋中止", "初入世途，自营一局旋即收场", "立身以后，主事项目曾大败", "立业之际，经营停闭而人事尽散", "行至中途，旧业一门有清退之变"]],

  ["wealth_fraud", "wealth", "受骗失财", "因诈骗、虚假交易或冒名欺骗遭受明确财务损失", "intense", ["少年信人失财，银钱去而无回", "初入世途，一纸虚言骗去积蓄", "立身以后，交易藏诈而财受损", "立业之际，曾因骗局破费甚多", "行至中途，仍有假局侵财之事"]],
  ["wealth_lending_loss", "wealth", "借贷难收", "借给亲友或合作方的较大款项长期无法收回", "private", ["少年替人垫付，旧款久悬", "初入世途，借出之财迟迟不归", "立身以后，人情一贷成为坏账", "立业之际，大笔外借久催无果", "行至中途，旧债在人不在己"]],
  ["wealth_mortgage", "wealth", "长贷压身", "房贷、经营贷或其他长期贷款持续影响生活安排", "private", ["家门早背长贷，日用因此有度", "初入世途，已有多年偿付之约", "立身以后，置业之债牵住收支", "立业之际，长期贷款重排家计", "行至中途，仍有大额月偿在身"]],
  ["wealth_windfall", "wealth", "横财忽至", "因奖金、分红、赔偿或意外机会获得一笔显著进项", "private", ["少年忽得一财，非寻常月入", "初入世途，一笔奖金骤然到手", "立身以后，分红赔付使财门忽开", "立业之际，有意外进项明显增厚家底", "行至中途，仍见一笔外财入账"]],

  ["rel_remarriage", "relationship", "再结新缘", "离婚或重要关系结束后再次进入婚姻或长期稳定关系", "private", ["早缘既散，新约旋成", "初入世途，一缘尽后又定一缘", "立身以后，再婚或新伴正式入门", "立业之际，旧局收后重立婚盟", "行至中途，再结新缘共成家计"]],
  ["rel_long_distance", "relationship", "两地相守", "重要亲密关系连续一年以上处于异地状态", "private", ["少年情缘隔城，聚少离多", "初入世途，所爱之人久在异地", "立身以后，一段关系两城相望", "立业之际，夫妻伴侣长期分居两处", "行至中途，情缘仍受路远所限"]],
  ["rel_age_gap", "relationship", "配偶差年", "重要伴侣与本人年龄相差五岁以上", "ordinary", ["早缘所遇，年岁相差非少", "初入世途，伴侣长幼差越五载", "立身以后，所定之人年岁悬殊", "立业之际，婚配一方明显年长", "行至中途，身边伴侣年差仍著"]],
  ["rel_wedding_delay", "relationship", "婚期屡移", "已确定的订婚、登记或婚礼计划延期两次以上", "private", ["早定婚盟，佳期却数迁", "初入世途，婚事两度改期", "立身以后，原定礼期屡受阻", "立业之际，成婚之约久延未行", "行至中途，一桩婚事仍迟于原定"]],

  ["health_water_hazard", "health", "水险留痕", "经历溺水、落水或需要他人救助的严重水上险情", "intense", ["幼岁水厄近身，赖人援手", "少年失足入水，惊险方还", "青壮之交，舟水之间曾遇大险", "立业之际，水中一劫几伤性命", "行至中途，仍有水险留医之事"]],
  ["health_fire_burn", "health", "火灼伤身", "经历火灾、爆燃或需要治疗的烧烫伤", "intense", ["幼岁近火受灼，肌肤留痕", "少年火烫伤身，曾经医治", "青壮之交，火电之险伤及身体", "立业之际，爆燃烫灼迫使停工", "行至中途，仍有火厄留疤之应"]],
  ["health_traffic", "health", "车途受创", "交通事故造成受伤、治疗或较长时间休养", "intense", ["幼岁车途有险，伤后久养", "少年行路逢撞，筋骨受损", "青壮之交，车关曾使日常中断", "立业之际，一场交通事故入医", "行至中途，仍有车途重伤之关"]],
  ["health_fracture", "health", "筋骨折损", "上肢或下肢发生骨折、脱位或韧带重伤", "intense", ["幼岁手足折损，石膏久缚", "少年筋骨有伤，行动一时受限", "青壮之交，四肢一处曾经骨折", "立业之际，关节韧带重伤休养", "行至中途，筋骨旧处再受损"]],
  ["health_head_face", "health", "头面留伤", "头部或面部受伤并接受缝合、检查或留下明显疤痕", "intense", ["幼岁头面有伤，针线留痕", "少年额面受创，曾入医门", "青壮之交，头部一险需作检查", "立业之际，面首伤痕为人可见", "行至中途，头面再有重创之事"]],
  ["health_spine_waist", "health", "腰脊成患", "腰背、颈椎或脊柱问题持续影响工作与活动", "intense", ["幼岁脊背有恙，坐行受限", "少年颈腰旧患时作时止", "青壮之交，腰脊疼痛影响工作", "立业之际，颈背一症久治未清", "行至中途，脊腰旧疾成为日常关口"]],
  ["health_emergency", "health", "急症入医", "因突发急症进入急诊并接受紧急处置", "intense", ["幼岁急症夜发，仓促入医", "少年病势忽重，急诊方安", "青壮之交，一次突发需紧急处置", "立业之际，身体骤变送入急诊", "行至中途，仍有急症动医之关"]],
  ["health_sensory", "health", "目齿重治", "眼睛或牙齿问题接受手术、矫治或长期治疗", "private", ["幼岁目齿有病，久经医治", "少年视力牙齿一处曾作重治", "青壮之交，眼口治疗历时非短", "立业之际，目齿手术改变日常", "行至中途，仍有视齿重整之事"]],

  ["social_friend_betrayal", "law_social", "友信见负", "被长期信任的朋友欺骗、利用或造成明显损失", "intense", ["少年旧友负信，往来从此断绝", "初入世途，知交曾借信相欺", "立身以后，朋友利用使名财受损", "立业之际，一位近友背约离场", "行至中途，仍有故交失信之痛"]],
  ["law_contract_breach", "law_social", "契约失守", "合同、租约或书面承诺被违约并造成实际损失", "private", ["少年家中已有契约失守之事", "初入世途，一纸承诺未被履行", "立身以后，合同违约使事业受损", "立业之际，租约合作因毁约成争", "行至中途，仍有书契不兑现之患"]],
  ["social_isolation", "law_social", "群中独处", "连续半年以上与原有社交圈显著疏离或几乎断绝往来", "private", ["少年离群，半年少与旧友往来", "初入世途，曾与原有圈子尽疏", "立身以后，一程独处久不见人", "立业之际，主动断去多数旧交", "行至中途，仍有闭门远众之期"]],
  ["social_public_role", "law_social", "名入众目", "因公开表达、社群角色或作品获得持续关注", "ordinary", ["少年已有作品为众人所知", "初入世途，名声因一事传开", "立身以后，公开角色引来关注", "立业之际，所作所言已有固定受众", "行至中途，仍有名入众目之时"]],

  ["turn_return_home", "turning_point", "离乡复归", "长期在外后返回故乡或父母所在城市定居", "ordinary", ["幼岁远居后复归故里", "少年离乡一程又回旧城", "初立门户，在外多年终返家乡", "立业之际，事业转折使人归里", "行至中途，远行收束而重回故土"]],
  ["turn_public_success", "turning_point", "一举成名", "因作品、比赛、项目或事件在短期内获得广泛认可", "ordinary", ["幼岁一技出众，姓名为人传", "少年一试成名，众目忽然相向", "初立门户，一项作品使声望骤起", "立业之际，关键成果带来广泛认可", "行至中途，仍有一事使名位俱显"]],
  ["turn_care_identity", "turning_point", "照护成职", "因照顾老人、病人或子女而长期改变职业与身份安排", "private", ["幼岁家中照护之事先改日常", "少年因照料近人少走己路", "初立门户，为照护之责改变营生", "立业之际，长期照护使身份转换", "行至中途，照护家人已成生活主轴"]],
  ["turn_name_change", "turning_point", "名籍改换", "正式改名、变更国籍户籍或公开使用全新身份", "ordinary", ["幼岁名籍曾改，称谓从此不同", "少年户籍迁动，身份记录有变", "初立门户，正式更名另用新称", "立业之际，国籍户籍发生大改", "行至中途，公开身份再换一名"]]
];

function slug(index) {
  return String(index).padStart(3, "0");
}

function ambiguityFor(index, sensitivity) {
  const score = Number((0.12 + (index % 4) * 0.06 + (sensitivity === "intense" ? 0.03 : 0)).toFixed(2));
  return { score, level: score <= 0.2 ? "low" : "medium", rationale: "时间窗与事实定义均有明确解释；古意仅承担语气，不改变判定条件。" };
}

function applicabilityFor(window, root) {
  return {
    minCurrentAge: window[1] + 1,
    maxCurrentAge: null,
    requiredContexts: [],
    excludedContexts: [],
    notes: root[4] === "intense" ? "敏感事实；允许回答未明，不以沉默推定为否。" : "达到时间窗口后即可询问。"
  };
}

const STAGE_REWRITES = [
  [/二旬初年/gu, "初入世途"],
  [/二旬前后/gu, "初立门户"],
  [/二旬内外/gu, "初试人事"],
  [/二旬之间/gu, "青壮之交"],
  [/二旬前段/gu, "初试世途"],
  [/二旬中段/gu, "立身未久"],
  [/二旬后段/gu, "立身以后"],
  [/二旬未到/gu, "未及立身"],
  [/未及二旬/gu, "未及立身"],
  [/三旬前后/gu, "门户初定"],
  [/三旬前段/gu, "立业初程"],
  [/三旬之间/gu, "立业之际"],
  [/三旬后段/gu, "人事渐定"],
  [/三旬之后/gu, "立业以后"],
  [/四旬前后/gu, "行至中途"],
  [/四旬以后/gu, "中途再行"],
  [/中岁/gu, "行至中途"]
];

function ritualizeClauseText(text) {
  return STAGE_REWRITES.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text)
    .replace(/[？?]/gu, "")
    .replace(/[。！]+$/u, "");
}

function interpreterText(window, definition) {
  return `所断为：${window[2]}，${definition}。`;
}

const facts = [];
const calibrationClauses = [];
let calibrationIndex = 0;

for (const root of ROOTS) {
  const [legacyEventId, domain, label, definition, sensitivity, clauseTexts] = root;
  const windows = WINDOW_OVERRIDES[legacyEventId] ?? WINDOWS[domain];
  clauseTexts.forEach((clauseText, variantIndex) => {
    calibrationIndex += 1;
    const window = windows[variantIndex];
    const factId = `fact.v3.${legacyEventId}.${variantIndex + 1}`;
    const fact = {
      id: factId,
      legacyEventId,
      domain,
      domainTitle: DOMAIN[domain].title,
      label,
      subject: DOMAIN[domain].subject,
      predicate: definition,
      timeWindow: { kind: "age_range", minAge: window[0], maxAge: window[1], label: window[2] },
      answerCriterion: `仅当${window[2]}确有“${definition}”这一事实时回答“应”；明确没有答“不应”；无法确认答“未明”。`,
      sensitivity,
      applicability: applicabilityFor(window, root),
      source: SOURCE,
      status: "active"
    };
    facts.push(fact);

    const volumeIndex = Math.ceil(calibrationIndex / 20);
    calibrationClauses.push({
      id: `kao.v3.${slug(calibrationIndex)}`,
      volumeId: `KAO-${String(volumeIndex).padStart(2, "0")}`,
      volumeTitle: `考刻第${volumeIndex}卷`,
      clauseNumber: ((calibrationIndex - 1) % 20) + 1,
      displayNumber: String(10000 + calibrationIndex),
      clauseText: ritualizeClauseText(clauseText),
      interpretation: interpreterText(window, definition),
      primaryFactId: factId,
      legacyEventId,
      domain,
      phase: variantIndex === 0 ? "initial" : variantIndex === 4 ? "confirm" : "rectify",
      evidenceAxis: `age_band_${variantIndex + 1}`,
      ambiguity: ambiguityFor(calibrationIndex, sensitivity),
      applicability: applicabilityFor(window, root),
      answerMode: { type: "ternary", options: ["应", "不应", "未明"] },
      source: SOURCE,
      status: "active"
    });
  });
}

const FATE_FRAMES = {
  命局: [
    (root, meta) => `${root[2]}，其人${meta.trait}。`,
    (root, meta) => `${root[2]}入局，所得在${meta.gain}。`,
    (root, meta) => `${root[2]}既深，所戒在${meta.risk}。`,
    (root, meta) => `此象若应，逢${root[2]}之事，${meta.future.replace(/，.*/, "")}。`
  ],
  前运: [
    (root, meta) => `${root[2]}见于前运，${meta.past}。`,
    (root, meta) => `旧程既有${root[2]}，后来取舍多受其牵。`,
    (root) => `${root[2]}之后，人生次序曾重新排定。`
  ],
  后运: [
    (root, meta) => `后运再逢${root[2]}之类，${meta.future}。`,
    (root, meta) => `中岁以后，${root[2]}所得之经验，可用于${meta.gain}。`,
    (root, meta) => `过${root[2]}一关，须防${meta.risk}，方得后局清明。`
  ]
};

const TIME_SCOPE = {
  命局: ["终身格局", "性情成因", "得势条件", "失势边界"],
  前运: ["已发生阶段", "前半生惯性", "当前以前"],
  后运: ["未来同类关口", "中岁以后", "后程转势"]
};

const fateClauses = [];
let fateIndex = 0;
const fateCategoryCounter = { 命局: 0, 前运: 0, 后运: 0 };
// 各类独占卷号区间，避免事件库扩容后卷内条号相撞。
const fateCategoryVolumeOffset = { 命局: 0, 前运: 20, 后运: 40 };
for (const root of ROOTS) {
  const [legacyEventId, domain] = root;
  const meta = DOMAIN[domain];
  const rootFactIds = facts.filter((fact) => fact.legacyEventId === legacyEventId).map((fact) => fact.id);
  for (const category of ["命局", "前运", "后运"]) {
    FATE_FRAMES[category].forEach((frame, frameIndex) => {
      fateIndex += 1;
      fateCategoryCounter[category] += 1;
      const categoryLocalVolume = Math.ceil(fateCategoryCounter[category] / 20);
      const volumeIndex = fateCategoryVolumeOffset[category] + categoryLocalVolume;
      const primaryFactId = rootFactIds[Math.min(frameIndex, rootFactIds.length - 1)];
      fateClauses.push({
        id: `ming.v3.${slug(fateIndex)}`,
        volumeId: `MING-${String(volumeIndex).padStart(2, "0")}`,
        volumeTitle: `${category}第${categoryLocalVolume}卷`,
        clauseNumber: ((fateCategoryCounter[category] - 1) % 20) + 1,
        displayNumber: String(20000 + fateIndex),
        clauseText: frame(root, meta),
        interpretation: `${category}条：由已确认的“${root[2]}”事实引出一项${category === "后运" ? "条件式未来判断" : category === "前运" ? "既往影响判断" : "结构倾向判断"}。`,
        category,
        domain,
        primaryFactId,
        conditionFactIds: rootFactIds,
        timeScope: { kind: category === "后运" ? "future_conditional" : category === "前运" ? "past_summary" : "lifelong_pattern", label: TIME_SCOPE[category][frameIndex] },
        ambiguity: { score: category === "命局" ? 0.3 : 0.24, level: "medium", rationale: "命书条保留解释空间，但只承载一个判断方向。" },
        applicability: { minCurrentAge: category === "后运" ? 18 : 1, maxCurrentAge: null, requiredContexts: [], excludedContexts: [], notes: "仅在 conditionFactIds 中至少一项有充分证据时调用。" },
        source: SOURCE,
        status: "active"
      });
    });
  }
}

const contentSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://local.metaphysics.example/schemas/tieban-content-v3.json",
  title: "铁板神数现代拟制内容层 V3",
  schemaVersion,
  contentPolicy: {
    calibrationInvariant: "每条考刻条必须且只能绑定一个 primaryFactId；人物、事件、时间是同一命题的限定，不得混入无关事实。",
    provenanceInvariant: "所有生成条文必须标注 modern_fabricated，不得伪称古籍原文。",
    numberingInvariant: "id、displayNumber 及 volumeId+clauseNumber 在各语料文件内唯一，displayNumber 在全部条文中全局唯一。"
  },
  definitions: {
    factRequired: ["id", "legacyEventId", "domain", "subject", "predicate", "timeWindow", "answerCriterion", "sensitivity", "applicability", "source", "status"],
    calibrationRequired: ["id", "volumeId", "clauseNumber", "displayNumber", "clauseText", "interpretation", "primaryFactId", "legacyEventId", "domain", "phase", "evidenceAxis", "ambiguity", "applicability", "answerMode", "source", "status"],
    fateRequired: ["id", "volumeId", "clauseNumber", "displayNumber", "clauseText", "interpretation", "category", "domain", "primaryFactId", "conditionFactIds", "timeScope", "ambiguity", "applicability", "source", "status"]
  },
  enums: {
    domains: Object.keys(DOMAIN),
    sensitivity: ["ordinary", "private", "intense"],
    calibrationPhase: ["initial", "rectify", "confirm"],
    fateCategory: ["命局", "前运", "后运"],
    sourceKind: ["modern_fabricated"],
    status: ["active", "draft", "retired"]
  }
};

const manifest = {
  schemaVersion,
  corpusVersion,
  generatedAt: "2026-07-21T00:00:00+08:00",
  contentPolicy: "modern_fabricated_only",
  counts: { facts: facts.length, semanticFamilies: ROOTS.length, calibrationClauses: calibrationClauses.length, fateClauses: fateClauses.length },
  fateCategoryCounts: Object.fromEntries(["命局", "前运", "后运"].map((category) => [category, fateClauses.filter((item) => item.category === category).length])),
  files: ["content-schema.json", "facts.json", "calibration-clauses.json", "fate-clauses.json"]
};

async function writeJson(name, value) {
  await writeFile(resolve(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeJson("content-schema.json", contentSchema);
await writeJson("facts.json", { schemaVersion, corpusVersion, sourcePolicy: SOURCE, facts });
await writeJson("calibration-clauses.json", { schemaVersion, corpusVersion, sourcePolicy: SOURCE, clauses: calibrationClauses });
await writeJson("fate-clauses.json", { schemaVersion, corpusVersion, sourcePolicy: SOURCE, clauses: fateClauses });
await writeJson("manifest.json", manifest);

console.log(JSON.stringify(manifest, null, 2));
