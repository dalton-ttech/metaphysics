import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileGlobalEventContextsV4,
  serializableGlobalEventRulesV4
} from "./global-event-rules-v4.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const V3_DIR = resolve(PROJECT_ROOT, "data/v3");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "data/v4");

const schemaVersion = "4.0.0";
const corpusVersion = "2026.07.22-v4.2.1";
const SOURCE = {
  kind: "modern_fabricated",
  label: "现代拟制·候选命籍码本",
  provenance: "依据V3原子事实、互斥状态轴与候选命籍工程规则创作，非古籍原文，亦不冒称任何传承秘本。",
  sourceRefs: ["data/v3/manifest.json", "docs/v3-content-audit-and-validation.md", "scripts/v4/generate-content-v4.mjs"]
};

const AXES = [
  { id: "siblings_count", category: "六亲考刻", domain: "family", title: "实际手足总数", minCurrentAge: 12, options: [
    ["0", "无实际手足", "截至二十四岁，本人没有血缘手足，也没有十八岁前以兄弟姐妹身份共同生活满五年的非血缘家人", "同枝无伴，独承一门", "手足缘薄，家门之事多由己断。"],
    ["1", "一名实际手足", "截至二十四岁，全部血缘手足与十八岁前以兄弟姐妹身份共同生活满五年的非血缘家人，去重后恰有一人", "同枝二人，手足一名", "手足一人，后程尚有同枝相助。"],
    ["2", "两名实际手足", "截至二十四岁，全部血缘手足与十八岁前以兄弟姐妹身份共同生活满五年的非血缘家人，去重后恰有两人", "同枝三人，手足两名", "同枝三人，家事常在三方之间调和。"],
    ["3p", "三名以上实际手足", "截至二十四岁，全部血缘手足与十八岁前以兄弟姐妹身份共同生活满五年的非血缘家人，去重后至少三人", "同枝四人以上，家门枝繁", "手足众多，后运得力亦多牵挂。"]
  ]},
  { id: "birth_order", category: "六亲考刻", domain: "family", title: "手足排行", minCurrentAge: 12, options: [
    ["only", "独生", "截至二十四岁计入的实际手足为零", "一枝独秀，手足无分", "独生承门，遇大事惯由自己定夺。", { questionMode: "derived", requiredContexts: [{ kind: "resolved_exclusive_group", groupId: "mx.siblings_count", allowedFactIds: ["fact.v4.axis.siblings_count.0"] }] }],
    ["eldest", "居长", "按出生日期排列截至二十四岁计入的实际手足，本人出生最早；同日出生且无法确认先后时答未明", "同枝列序，命居其长", "排行居长，护幼持家之责来得较早。", { requiredContexts: [{ kind: "resolved_exclusive_group", groupId: "mx.siblings_count", allowedFactIds: ["fact.v4.axis.siblings_count.1", "fact.v4.axis.siblings_count.2", "fact.v4.axis.siblings_count.3p"] }] }],
    ["middle", "居中", "本人与截至二十四岁计入的实际手足合计至少三人；按出生日期排列，本人既非最早也非最晚；同日出生且无法确认先后时答未明", "同枝列序，命在其中", "排行居中，善在上下之间周旋。", { requiredContexts: [{ kind: "resolved_exclusive_group", groupId: "mx.siblings_count", allowedFactIds: ["fact.v4.axis.siblings_count.2", "fact.v4.axis.siblings_count.3p"] }] }],
    ["youngest", "居幼", "按出生日期排列截至二十四岁计入的实际手足，本人出生最晚；同日出生且无法确认先后时答未明", "同枝列序，命居其幼", "排行居幼，早受照应，后须自立。", { requiredContexts: [{ kind: "resolved_exclusive_group", groupId: "mx.siblings_count", allowedFactIds: ["fact.v4.axis.siblings_count.1", "fact.v4.axis.siblings_count.2", "fact.v4.axis.siblings_count.3p"] }] }]
  ]},
  { id: "parents_union_18", category: "六亲考刻", domain: "family", title: "十八岁前双亲关系", minCurrentAge: 19, options: [
    ["together", "共同生活", "本人十八岁前父母基本共同生活", "未冠之年，双亲同守一门", "双亲同门，早年家序较为完整。"],
    ["conflict", "长期不和", "本人十八岁前父母共同生活但长期不和", "未冠之年，双亲同门少同声", "双亲不睦，早年多学会察言观色。"],
    ["separated", "分居或离异", "本人十八岁前父母已经分居或离异", "未冠之前，双亲已分两路", "双亲分路，家门责任较早重新分配。"],
    ["absent", "一方长期缺席", "本人十八岁前父母一方长期缺席", "未冠之前，双亲一位久不在侧", "一亲久缺，依附与自立皆受其影响。"]
  ]},
  { id: "primary_caregiver", category: "六亲考刻", domain: "family", title: "主要抚养者", minCurrentAge: 16, options: [
    ["both", "父母共同抚养", "成长阶段主要由父母共同抚养", "幼运承欢，双亲共为抚养", "双亲共养，家中规则多由两方合定。"],
    ["mother", "母亲为主", "成长阶段主要由母亲抚养", "幼运所依，慈亲一人居多", "母亲主养，情感与责任多系一处。"],
    ["father", "父亲为主", "成长阶段主要由父亲抚养", "幼运所依，严亲一人居多", "父亲主养，早年行事多受其尺度影响。"],
    ["relatives", "祖辈或亲属为主", "成长阶段主要由祖辈或其他亲属抚养", "幼运离膝，祖亲代为抚养", "祖亲代养，亲缘层次较常人更为复杂。"]
  ]},
  { id: "father_state_30", category: "六亲考刻", domain: "family", title: "三十岁前父缘状态", minCurrentAge: 31, options: [
    ["present", "健在且往来", "本人三十岁前父亲健在且保持往来", "三旬之前，严亲健在有往", "父缘有续，后程仍可见父系影响。"],
    ["distant", "健在但疏远", "本人三十岁前父亲健在但长期疏远", "三旬之前，严亲在世而缘疏", "父在缘疏，许多决定仍须自己完成。"],
    ["deceased", "已经离世", "本人三十岁前父亲已经离世", "三旬之前，椿庭已谢", "父亲早离，家门次序由此一变。"],
    ["lost_contact", "长期失联", "本人三十岁前与父亲长期失联", "三旬之前，严亲音问久绝", "父缘失联，旧问常留而无处求证。"]
  ]},
  { id: "mother_state_30", category: "六亲考刻", domain: "family", title: "三十岁前母缘状态", minCurrentAge: 31, options: [
    ["present", "健在且往来", "本人三十岁前母亲健在且保持往来", "三旬之前，慈亲健在有往", "母缘有续，家门情感多由此维系。"],
    ["distant", "健在但疏远", "本人三十岁前母亲健在但长期疏远", "三旬之前，慈亲在世而缘疏", "母在缘疏，亲情常隔一层未尽之言。"],
    ["deceased", "已经离世", "本人三十岁前母亲已经离世", "三旬之前，萱堂已谢", "母亲早离，内心安稳需另寻根处。"],
    ["lost_contact", "长期失联", "本人三十岁前与母亲长期失联", "三旬之前，慈亲音问久绝", "母缘失联，家门旧事多留空白。"]
  ]},
  { id: "childhood_finance", category: "六亲考刻", domain: "wealth", title: "成长阶段家境", minCurrentAge: 19, options: [
    ["affluent", "较为宽裕", "本人十八岁前家庭经济长期较为宽裕", "少运家资有余，衣食从宽", "早年家资有余，后须自立而不恃旧福。"],
    ["stable", "基本平稳", "本人十八岁前家庭经济基本平稳", "少运家计平常，衣食有序", "早年家计平稳，做事多知量入为出。"],
    ["decline", "由宽转紧", "本人十八岁前家庭经济由宽裕明显转紧", "少运家财先宽后窄", "家境转落，后来对财务安全尤为敏感。"],
    ["strained", "长期拮据", "本人十八岁前家庭经济长期拮据", "少运家计久窄，所得难余", "少时拮据，后运求财多先求稳。"]
  ]},
  { id: "family_moves_18", category: "六亲考刻", domain: "education_mobility", title: "十八岁前迁居次数", minCurrentAge: 19, options: [
    ["0", "未明显迁居", "本人十八岁前没有明显迁居", "未冠之年，居处未曾大迁", "少运居处安定，根系多在一地。"],
    ["1", "一次迁居", "本人十八岁前发生一次明显迁居", "未冠之年，门庭一迁", "少运一迁，人生曾随住处换章。"],
    ["2", "两次迁居", "本人十八岁前发生两次明显迁居", "未冠之年，门庭两迁", "少运两迁，适应新境已成早年本领。"],
    ["3p", "三次以上迁居", "本人十八岁前发生至少三次明显迁居", "未冠之年，门庭三迁以上", "少运多迁，归属感常比旁人更难安定。"]
  ]},
  { id: "sibling_relation_context", category: "六亲考刻", domain: "family", title: "手足共同生活与往来", minAge: 12, minCurrentAge: 25,
    requiredContexts: [{
      kind: "resolved_exclusive_group",
      groupId: "mx.siblings_count",
      allowedFactIds: ["fact.v4.axis.siblings_count.1", "fact.v4.axis.siblings_count.2", "fact.v4.axis.siblings_count.3p"]
    }],
    options: [
      ["co_resident", "曾长期共同生活", "十二岁至二十四岁，曾与至少一名手足累计共同生活满五年；后来分居、失联或离世，不改变这段共同生活", "少运同檐，同枝共长五载以上", "十二岁至二十四岁，曾与至少一名手足共同生活累计满五年。"],
      ["separate_contact", "分居但保持往来", "十二岁至二十四岁，未与任何手足累计共同生活满五年；至二十四岁时至少一名手足仍可联系，且二十二岁至二十四岁与至少一人累计联系至少二十四次", "同枝异门，音书频仍", "未曾与手足累计同住满五年；至二十四岁时仍有人可以联系，且此前两年与至少一人累计联系至少二十四次。"],
      ["estranged", "可联系但长期疏远", "十二岁至二十四岁，未与任何手足累计共同生活满五年；至二十四岁时至少一名手足仍可联系，但二十二岁至二十四岁与每一名手足的累计联系均少于二十四次", "同枝尚在，音书岁久而疏", "未曾与手足累计同住满五年；至二十四岁时仍有人可以联系，但此前两年与每一人联系都不足二十四次。"],
      ["unavailable", "全部早逝或完全失联", "十二岁至二十四岁，未与任何手足累计共同生活满五年；至二十四岁时，所有实际手足均已离世，或已经完全失联且无法取得联系", "诸枝皆寂，音书无处寻", "未曾与手足累计同住满五年；至二十四岁时，所有实际手足均已离世，或已经完全失联。"]
    ]
  },
  { id: "sibling_care", category: "六亲考刻", domain: "family", title: "手足生活照料", minAge: 12, minCurrentAge: 25,
    requiredContexts: [
      {
        kind: "resolved_exclusive_group",
        groupId: "mx.siblings_count",
        allowedFactIds: ["fact.v4.axis.siblings_count.1", "fact.v4.axis.siblings_count.2", "fact.v4.axis.siblings_count.3p"]
      },
      {
        kind: "resolved_exclusive_group",
        groupId: "mx.sibling_relation_context",
        allowedFactIds: [
          "fact.v4.axis.sibling_relation_context.co_resident",
          "fact.v4.axis.sibling_relation_context.separate_contact",
          "fact.v4.axis.sibling_relation_context.estranged",
          "fact.v4.axis.sibling_relation_context.unavailable"
        ]
      }
    ],
    options: [
      ["no", "未曾持续照料", "十二岁至二十四岁，未曾连续三个月以上、平均每周至少三天照料手足的日常生活或健康", "少岁同枝，未尝久负看顾", "十二岁至二十四岁，未曾连续三个月以上、平均每周至少三天照料手足。", {
        evidencePolicy: {
          resonatesContextGroupId: "mx.sibling_relation_context",
          resonatesWeightByFactId: {
            "fact.v4.axis.sibling_relation_context.co_resident": 1,
            "fact.v4.axis.sibling_relation_context.separate_contact": 0.72,
            "fact.v4.axis.sibling_relation_context.estranged": 0.4,
            "fact.v4.axis.sibling_relation_context.unavailable": 0.28
          },
          notResonatesWeight: 0.9
        }
      }],
      ["yes", "曾持续照料", "十二岁至二十四岁，曾连续三个月以上、平均每周至少三天照料手足的日常生活或健康", "少岁同枝有累，起居久由你看顾", "十二岁至二十四岁，曾连续三个月以上、平均每周至少三天照料手足。"]
    ]
  },
  { id: "sibling_financial_support", category: "六亲考刻", domain: "family", title: "手足经济供养", minAge: 12, minCurrentAge: 25,
    requiredContexts: [
      {
        kind: "resolved_exclusive_group",
        groupId: "mx.siblings_count",
        allowedFactIds: ["fact.v4.axis.siblings_count.1", "fact.v4.axis.siblings_count.2", "fact.v4.axis.siblings_count.3p"]
      },
      {
        kind: "resolved_exclusive_group",
        groupId: "mx.sibling_relation_context",
        allowedFactIds: [
          "fact.v4.axis.sibling_relation_context.co_resident",
          "fact.v4.axis.sibling_relation_context.separate_contact",
          "fact.v4.axis.sibling_relation_context.estranged",
          "fact.v4.axis.sibling_relation_context.unavailable"
        ]
      }
    ],
    options: [
      ["no", "未曾持续供养", "十二岁至二十四岁，未曾连续六个月以上承担手足至少一半的必要生活、教育或医疗开支；礼物与偶尔代付不计", "少岁同枝用度，各有所出", "十二岁至二十四岁，未曾连续六个月以上承担手足至少一半的必要开支。", {
        evidencePolicy: {
          resonatesContextGroupId: "mx.sibling_relation_context",
          resonatesWeightByFactId: {
            "fact.v4.axis.sibling_relation_context.co_resident": 1,
            "fact.v4.axis.sibling_relation_context.separate_contact": 0.72,
            "fact.v4.axis.sibling_relation_context.estranged": 0.4,
            "fact.v4.axis.sibling_relation_context.unavailable": 0.28
          },
          notResonatesWeight: 0.9
        }
      }],
      ["yes", "曾持续供养", "十二岁至二十四岁，曾连续六个月以上承担手足至少一半的必要生活、教育或医疗开支", "少岁同枝所需，半年多出汝囊", "十二岁至二十四岁，曾连续六个月以上承担手足至少一半的必要开支。"]
    ]
  },
  { id: "sibling_guardianship", category: "六亲考刻", domain: "family", title: "手足代亲监护", minAge: 12, minCurrentAge: 25,
    requiredContexts: [
      {
        kind: "resolved_exclusive_group",
        groupId: "mx.siblings_count",
        allowedFactIds: ["fact.v4.axis.siblings_count.1", "fact.v4.axis.siblings_count.2", "fact.v4.axis.siblings_count.3p"]
      },
      {
        kind: "resolved_exclusive_group",
        groupId: "mx.sibling_relation_context",
        allowedFactIds: [
          "fact.v4.axis.sibling_relation_context.co_resident",
          "fact.v4.axis.sibling_relation_context.separate_contact",
          "fact.v4.axis.sibling_relation_context.estranged",
          "fact.v4.axis.sibling_relation_context.unavailable"
        ]
      }
    ],
    options: [
      ["no", "未曾代亲监护", "十二岁至二十四岁，未曾连续六个月以上代替父母，主要决定未成年手足的居住、教育或医疗事项", "少岁家事，未尝代亲主之", "十二岁至二十四岁，未曾连续六个月以上代替父母作出未成年手足的重要生活决定。", {
        evidencePolicy: {
          resonatesContextGroupId: "mx.sibling_relation_context",
          resonatesWeightByFactId: {
            "fact.v4.axis.sibling_relation_context.co_resident": 1,
            "fact.v4.axis.sibling_relation_context.separate_contact": 0.72,
            "fact.v4.axis.sibling_relation_context.estranged": 0.4,
            "fact.v4.axis.sibling_relation_context.unavailable": 0.28
          },
          notResonatesWeight: 0.9
        }
      }],
      ["yes", "曾代亲监护", "十二岁至二十四岁，曾因父母离世、离家、失能或长期无法照料，连续六个月以上主要决定未成年手足的居住、教育或医疗事项；可与照料、供养同时成立", "亲力有缺，同枝未冠，家事久由你断", "十二岁至二十四岁，曾连续六个月以上代替父母作出未成年手足的重要生活决定。"]
    ]
  },
  { id: "parent_work_pattern", category: "六亲考刻", domain: "career", title: "父母职业形态", minCurrentAge: 20, options: [
    ["stable", "至少一方长期稳定", "成长阶段父母至少一方职业长期稳定", "少运家门，一亲职业久定", "亲职稳定，早年对秩序较有依凭。"],
    ["changing", "工作频繁变动", "成长阶段父母工作频繁变动", "少运家门，亲职数度改换", "亲职多变，早年较早学会应变。"],
    ["self_employed", "自营为主", "成长阶段父母主要从事个体经营或生意", "少运家门，亲长自营谋生", "亲长自营，财务起伏与家运相连。"],
    ["interrupted", "长期职业中断", "成长阶段父母一方有长期职业中断", "少运家门，一亲久无定业", "亲职中断，家庭责任曾重新分配。"]
  ]},
  { id: "caregiving_duration", category: "六亲考刻", domain: "family", title: "三十岁前家庭照护时长", minCurrentAge: 31, options: [
    ["none", "无长期照护", "本人三十岁前没有连续三个月以上照护家人", "三旬之前，未负长程侍疾之责", "前运无久护之担，个人道路少受此牵。"],
    ["short", "三至十一月", "本人三十岁前连续照护家人三至十一个月", "三旬之前，侍亲未满一年", "照护一程虽短，生活次序仍曾改动。"],
    ["medium", "一至两年", "本人三十岁前连续照护家人一至两年", "三旬之前，侍亲一二载", "照护经年，耐力与责任由此加深。"],
    ["long", "三年以上", "本人三十岁前连续照护家人至少三年", "三旬之前，侍亲三载以上", "久护家人，后运须防责任侵尽己时。"]
  ]},
  { id: "first_close_loss", category: "六亲考刻", domain: "turning_point", title: "首次重大亲缘离世", minCurrentAge: 30, options: [
    ["none", "三十岁前未经历", "本人三十岁前未经历重要亲缘离世", "三旬之前，至亲席位未见大缺", "前运亲缘尚全，离别之课来得较迟。"],
    ["elder", "祖辈或重要长辈", "本人三十岁前首次重大亲缘离世者为祖辈或重要长辈", "首次大别，所送为祖亲长辈", "先送长辈，家中旧序由此松动。"],
    ["parent", "父亲或母亲", "本人三十岁前首次重大亲缘离世者为父亲或母亲", "首次大别，所送为双亲之一", "先失双亲之一，家责与心性同时改变。"],
    ["peer", "手足、伴侣或挚友", "本人三十岁前首次重大亲缘离世者为手足、伴侣或挚友", "首次大别，所送为同辈至亲", "先失同辈至亲，无常之感尤为深刻。"]
  ]},

  { id: "education_level", category: "定分", domain: "education_mobility", title: "最高完成学历", minCurrentAge: 25, options: [
    ["middle", "初中及以下", "本人最高完成学历为初中及以下", "学籍所止，初中及以下", "学路早收，后成多凭实务与自学。"],
    ["high", "高中或中专", "本人最高完成学历为高中、中专或同等层次", "学籍所止，高中中专之阶", "学至中阶，事业成败更看技能与机缘。"],
    ["college", "大专", "本人最高完成学历为大专", "学籍所止，专科之阶", "专科学成，后运宜以一技深耕。"],
    ["bachelor_plus", "本科及以上", "本人最高完成学历为本科及以上", "学籍所至，本科以上", "学阶较高，后程仍须把知识化为实绩。"]
  ]},
  { id: "first_leave_hometown", category: "定分", domain: "education_mobility", title: "首次长期离乡年龄", minCurrentAge: 30, options: [
    ["never", "三十岁前未长期离乡", "本人三十岁前未曾长期离开成长地", "三旬之前，未曾久离故土", "根在故里，机缘多从熟地渐开。"],
    ["by18", "十八岁以前", "本人首次长期离开成长地发生在十八岁以前", "未冠先离故土，久居他方", "离乡甚早，见识与归属皆因迁动而成。"],
    ["19_24", "十九至二十四岁", "本人首次长期离开成长地发生在十九至二十四岁", "二旬初年，始离故土久居", "青年离乡，学业事业由异地开门。"],
    ["25p", "二十五岁以后", "本人首次长期离开成长地发生在二十五岁以后", "二十五后，方始离乡久居", "较晚离乡，迁动多由事业与家局所催。"]
  ]},
  { id: "adult_moves_count", category: "定分", domain: "education_mobility", title: "成年后跨城迁居次数", minCurrentAge: 35, options: [
    ["0", "零次", "本人三十五岁前成年后没有跨城迁居", "成年以后，未有跨城迁居", "成年居处稳定，事业多在一地累积。"],
    ["1", "一次", "本人三十五岁前成年后跨城迁居一次", "成年以后，跨城一迁", "一迁定局，后程根基多在新地。"],
    ["2", "两次", "本人三十五岁前成年后跨城迁居两次", "成年以后，跨城两迁", "两度换城，人生主线亦曾两次改写。"],
    ["3p", "三次以上", "本人三十五岁前成年后跨城迁居至少三次", "成年以后，跨城三迁以上", "多城辗转，后运须择一地聚势。"]
  ]},
  { id: "overseas_duration", category: "定分", domain: "education_mobility", title: "三十五岁前海外居留", minCurrentAge: 36, options: [
    ["none", "未长期海外居留", "本人三十五岁前没有连续三个月以上海外居留", "三旬有五，未曾海外久居", "未久居海外，远方机缘多以短程而来。"],
    ["short", "三至十一个月", "本人三十五岁前海外连续居留三至十一个月", "三旬有五，海外居留未满一载", "海外短居，见识已改而根基未移。"],
    ["medium", "一至三年", "本人三十五岁前海外连续居留一至三年", "三旬有五，海外居留一至三载", "海外数载，人生尺度曾被重新校准。"],
    ["long", "三年以上", "本人三十五岁前海外连续居留超过三年", "三旬有五，海外久居三载以上", "海外久居，后运常在两地之间取舍。"]
  ]},
  { id: "career_entry_age", category: "定分", domain: "career", title: "首次持续工作年龄", minCurrentAge: 28, options: [
    ["by18", "十八岁以前", "本人十八岁以前已经开始持续工作", "未冠先入职途，早谋生计", "入世甚早，实务经验胜在年长。"],
    ["19_22", "十九至二十二岁", "本人十九至二十二岁开始持续工作", "二旬初年，始入职途", "青年入职，事业节奏与同辈相近。"],
    ["23_26", "二十三至二十六岁", "本人二十三至二十六岁开始持续工作", "二旬中后，始入职途", "稍晚入职，前学后用之象较明。"],
    ["27p", "二十七岁以后", "本人二十七岁以后才开始持续工作", "二十七后，方入职途", "入职较晚，后程须以专长追回时势。"]
  ]},
  { id: "career_switch_count", category: "定分", domain: "career", title: "四十岁前职业转轨次数", minCurrentAge: 41, options: [
    ["0", "未转轨", "本人四十岁前没有跨职业主线转轨", "四旬之前，所业一线未改", "事业一线到底，成败在深而不在多。"],
    ["1", "一次", "本人四十岁前跨职业主线转轨一次", "四旬之前，事业改门一次", "一度转轨，后来主线由此定下。"],
    ["2", "两次", "本人四十岁前跨职业主线转轨两次", "四旬之前，事业两改门径", "两次转轨，所得在广，所戒在散。"],
    ["3p", "三次以上", "本人四十岁前跨职业主线转轨至少三次", "四旬之前，事业三改以上", "职业多变，后程必须聚成一门。"]
  ]},
  { id: "leadership_level", category: "定分", domain: "career", title: "最高管理责任", minCurrentAge: 35, options: [
    ["none", "无正式管理职责", "本人三十五岁前没有正式管理职责", "三旬有五，未居带人之位", "未居管理之位，后势可从专业权威而起。"],
    ["small", "带领小组", "本人三十五岁前最高承担小组负责人职责", "三旬有五，已领一组之事", "带组掌事，后程可由小局见大局。"],
    ["department", "部门负责人", "本人三十五岁前最高承担部门负责人职责", "三旬有五，已掌一部之权", "掌部定策，事业名位已有根基。"],
    ["executive", "机构级决策者", "本人三十五岁前已经承担机构级关键决策职责", "三旬有五，已入机构定策之列", "早居高位，后运所戒在权责过重。"]
  ]},
  { id: "entrepreneurship_count", category: "定分", domain: "career", title: "四十岁前创业次数", minCurrentAge: 41, options: [
    ["0", "未创业", "本人四十岁前没有承担主要盈亏的创业经历", "四旬之前，未曾自立商局", "未开商局，财路多从职业阶梯而来。"],
    ["1", "一次", "本人四十岁前有一次承担主要盈亏的创业经历", "四旬之前，自立商局一次", "创业一局，成败皆化为后程判断。"],
    ["2", "两次", "本人四十岁前有两次承担主要盈亏的创业经历", "四旬之前，自立商局两次", "两开商局，第二局多承第一局之教。"],
    ["3p", "三次以上", "本人四十岁前有至少三次承担主要盈亏的创业经历", "四旬之前，自立商局三次以上", "屡次开局，后运须守可复制之业。"]
  ]},
  { id: "wealth_shock", category: "定分", domain: "wealth", title: "四十岁前最大财务冲击", minCurrentAge: 41, options: [
    ["none", "无重大冲击", "本人四十岁前没有显著改变生活的财务冲击", "四旬之前，财局未逢大破", "财路少大破，宜以长期积累守成。"],
    ["debt", "长期债务", "本人四十岁前最大财务冲击为长期债务", "四旬之前，财关以债务为重", "债务为关，后运先清负担再谈扩张。"],
    ["investment", "投资或合伙损失", "本人四十岁前最大财务冲击为投资或合伙损失", "四旬之前，财关以错投失利为重", "错投为关，后程用财须先明权责。"],
    ["business", "事业失败或破产", "本人四十岁前最大财务冲击为事业失败或破产", "四旬之前，财关以事业大败为重", "商局大败之后，再起须先守现金之根。"]
  ]},
  { id: "property_count", category: "定分", domain: "wealth", title: "四十五岁前重要置业次数", minCurrentAge: 46, options: [
    ["0", "未置业", "本人四十五岁前没有重要置业", "四旬有五，未曾置下屋业", "未置屋业，后程根基仍有重选之机。"],
    ["1", "一次", "本人四十五岁前完成一次重要置业", "四旬有五，屋业一置", "一处屋业，家计与根基由此安定。"],
    ["2", "两次", "本人四十五岁前完成两次重要置业", "四旬有五，屋业两置", "两度置业，资产次序曾重新安排。"],
    ["3p", "三次以上", "本人四十五岁前完成至少三次重要置业", "四旬有五，屋业三置以上", "屋业多置，后运须防资产过重而现金不足。"]
  ]},
  { id: "marriage_count", category: "定分", domain: "relationship", title: "正式婚姻次数", minCurrentAge: 40, options: [
    ["0", "未进入正式婚姻", "本人四十岁前未进入正式或事实婚姻", "四旬之前，婚籍未定", "婚籍未定，后缘贵在清楚而不在仓促。"],
    ["1", "一次", "本人四十岁前进入一次正式或事实婚姻", "四旬之前，婚籍一成", "一婚成局，后程家运看共同责任。"],
    ["2", "两次", "本人四十岁前进入两次正式或事实婚姻", "四旬之前，婚籍两成", "两度成婚，后缘须避旧局重演。"],
    ["3p", "三次以上", "本人四十岁前进入至少三次正式或事实婚姻", "四旬之前，婚籍三成以上", "婚局多变，后运先定自心再定他人。"]
  ]},
  { id: "children_count", category: "定分", domain: "relationship", title: "承担养育责任的子女数", minCurrentAge: 45, options: [
    ["0", "无子女养育责任", "本人四十五岁前没有承担子女养育责任", "四旬有五，膝下未负养育", "膝下无责，后程时间多可归于己志。"],
    ["1", "一名", "本人四十五岁前承担一名子女的养育责任", "四旬有五，膝下一人", "子息一人，家力多聚于一处。"],
    ["2", "两名", "本人四十五岁前承担两名子女的养育责任", "四旬有五，膝下二人", "子息二人，后程须平衡两方所需。"],
    ["3p", "三名以上", "本人四十五岁前承担至少三名子女的养育责任", "四旬有五，膝下三人以上", "子息众多，后运家门兴旺亦责任深。"]
  ]},
  { id: "major_relationship_count", category: "定分", domain: "relationship", title: "四十岁前重要亲密关系数", minCurrentAge: 41, options: [
    ["0", "无长期重要关系", "本人四十岁前没有持续一年以上的重要亲密关系", "四旬之前，未有长缘入局", "长缘未至，情路仍有重新定向之机。"],
    ["1", "一段", "本人四十岁前有一段持续一年以上的重要亲密关系", "四旬之前，长缘一段", "一段长缘，择偶尺度多由此形成。"],
    ["2", "两段", "本人四十岁前有两段持续一年以上的重要亲密关系", "四旬之前，长缘两段", "两段长缘，后程更知合与不合。"],
    ["3p", "三段以上", "本人四十岁前有至少三段持续一年以上的重要亲密关系", "四旬之前，长缘三段以上", "长缘多段，后运须从模式中识得真因。"]
  ]},
  { id: "surgery_count", category: "定分", domain: "health", title: "四十岁前重大手术次数", minCurrentAge: 41, options: [
    ["0", "零次", "本人四十岁前没有接受重大手术", "四旬之前，未过大手术之关", "身关少大创，后程重在日常保养。"],
    ["1", "一次", "本人四十岁前接受一次重大手术", "四旬之前，大手术一次", "一度开刀，生活排序曾因此调整。"],
    ["2", "两次", "本人四十岁前接受两次重大手术", "四旬之前，大手术两次", "两过手术，身体承载不可轻忽。"],
    ["3p", "三次以上", "本人四十岁前接受至少三次重大手术", "四旬之前，大手术三次以上", "手术屡临，后运首重节律与复查。"]
  ]},
  { id: "accident_count", category: "定分", domain: "health", title: "四十岁前严重意外次数", minCurrentAge: 41, options: [
    ["0", "零次", "本人四十岁前没有需要治疗或休养的严重意外", "四旬之前，未逢重伤意外", "行路少险，后程仍须防久劳之损。"],
    ["1", "一次", "本人四十岁前发生一次需要治疗或休养的严重意外", "四旬之前，重伤意外一次", "一场骤险，曾迫使人生暂缓。"],
    ["2", "两次", "本人四十岁前发生两次需要治疗或休养的严重意外", "四旬之前，重伤意外两次", "两逢骤险，后程不宜轻忽出行与劳作。"],
    ["3p", "三次以上", "本人四十岁前发生至少三次需要治疗或休养的严重意外", "四旬之前，重伤意外三次以上", "险关屡现，后运贵在预防而非侥幸。"]
  ]},
  { id: "legal_dispute_count", category: "定分", domain: "law_social", title: "四十五岁前正式法律纠纷数", minCurrentAge: 46, options: [
    ["0", "零次", "本人四十五岁前没有正式诉讼、仲裁或刑事程序", "四旬有五，未入正式讼局", "未入讼局，后程仍以契约防患。"],
    ["1", "一次", "本人四十五岁前卷入一次正式法律程序", "四旬有五，正式讼局一次", "一度入讼，后来做事更重凭据。"],
    ["2", "两次", "本人四十五岁前卷入两次正式法律程序", "四旬有五，正式讼局两次", "两次公门是非，合作边界须更严明。"],
    ["3p", "三次以上", "本人四十五岁前卷入至少三次正式法律程序", "四旬有五，正式讼局三次以上", "讼局多见，后运不可再轻信口约。"]
  ]},
  { id: "job_interruption_count", category: "定分", domain: "career", title: "四十岁前非自愿职业中断数", minCurrentAge: 41, options: [
    ["0", "零次", "本人四十岁前没有非自愿职业中断", "四旬之前，职途未被外力截断", "职途连贯，后程可凭累积上阶。"],
    ["1", "一次", "本人四十岁前发生一次非自愿职业中断", "四旬之前，职途被截一次", "一度失位，后来择业更知留后路。"],
    ["2", "两次", "本人四十岁前发生两次非自愿职业中断", "四旬之前，职途被截两次", "两度失位，事业韧性由此炼成。"],
    ["3p", "三次以上", "本人四十岁前发生至少三次非自愿职业中断", "四旬之前，职途被截三次以上", "职途屡断，后运须建立不依单一职位之能。"]
  ]},
  { id: "restart_count", category: "定分", domain: "turning_point", title: "四十五岁前重大重启次数", minCurrentAge: 46, options: [
    ["0", "零次", "本人四十五岁前没有生活主线近乎归零后的重大重启", "四旬有五，人生未曾近零重启", "前程少大破，后运贵在主动更新。"],
    ["1", "一次", "本人四十五岁前经历一次生活主线近乎归零后的重大重启", "四旬有五，人生近零重启一次", "一度重启，旧败已化为后程根骨。"],
    ["2", "两次", "本人四十五岁前经历两次生活主线近乎归零后的重大重启", "四旬有五，人生近零重启两次", "两度重启，后运更知何物不可再失。"],
    ["3p", "三次以上", "本人四十五岁前经历至少三次生活主线近乎归零后的重大重启", "四旬有五，人生近零重启三次以上", "屡破屡立，后程须把变化沉成方法。"]
  ]}
];

// These sentences are the only axis definitions shown in “今解”. Precise
// thresholds remain in the fact predicate for inference, replay and audit.
const VISIBLE_AXIS_INTERPRETATIONS = {
  siblings_count: {
    "0": "你没有兄弟姐妹",
    "1": "你有一名兄弟或姐妹",
    "2": "你有两名兄弟姐妹",
    "3p": "你有三名或更多兄弟姐妹"
  },
  birth_order: {
    only: "你是独生子女",
    eldest: "你在兄弟姐妹中排行最大",
    middle: "你在兄弟姐妹中排行居中",
    youngest: "你在兄弟姐妹中排行最小"
  },
  sibling_relation_context: {
    co_resident: "你曾和兄弟姐妹长期生活在一起",
    separate_contact: "你和兄弟姐妹没有长期同住，但一直保持往来",
    estranged: "你和兄弟姐妹仍能联系，只是彼此很少往来",
    unavailable: "你的兄弟姐妹已经全部离世，或彼此彻底失去联系"
  },
  sibling_care: {
    no: "你年少时没有长期照料过兄弟姐妹",
    yes: "你年少时曾长期照料兄弟姐妹的生活或健康"
  },
  sibling_financial_support: {
    no: "你年少时没有长期负担兄弟姐妹的主要生活开支",
    yes: "你年少时曾长期负担兄弟姐妹的主要生活开支"
  },
  sibling_guardianship: {
    no: "你年少时没有代替父母照管未成年的兄弟姐妹",
    yes: "你年少时曾代替父母照管未成年的兄弟姐妹"
  }
};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function applicability(minCurrentAge, notes = "达到时间门槛后可用于考刻。", requiredContexts = [], excludedContexts = [], questionMode = "ask") {
  return { minCurrentAge, maxCurrentAge: null, requiredContexts, excludedContexts, questionMode, notes };
}

function inheritedEvidencePolicy(fact) {
  return ["fam_sibling_duty", "fam_sibling_separation"].includes(fact.legacyEventId)
    ? { notResonatesWeight: 0.55 }
    : fact.evidencePolicy;
}

const [{ facts: v3Facts }, { clauses: v3Calibration }, { clauses: v3Fate }] = await Promise.all([
  readJson(resolve(V3_DIR, "facts.json")),
  readJson(resolve(V3_DIR, "calibration-clauses.json")),
  readJson(resolve(V3_DIR, "fate-clauses.json"))
]);

const facts = v3Facts.map((fact) => {
  const globalContexts = compileGlobalEventContextsV4(fact);
  return {
    ...fact,
    schemaVersion,
    inheritedFrom: fact.id,
    mutualExclusionGroup: null,
    applicability: {
      ...fact.applicability,
      ...globalContexts
    },
    evidencePolicy: inheritedEvidencePolicy(fact)
  };
});
const inheritedFactById = new Map(facts.map((fact) => [fact.id, fact]));
const calibrationClauses = v3Calibration.map((clause) => ({
  ...clause,
  schemaVersion,
  inheritedFrom: clause.id,
  category: ["family", "relationship"].includes(clause.domain) ? "六亲考刻" : "定分",
  mutualExclusionGroup: null,
  applicability: inheritedFactById.get(clause.primaryFactId)?.applicability ?? clause.applicability
}));
const constraints = [];
let newFactIndex = 0;

for (const axis of AXES) {
  const factIds = [];
  axis.options.forEach(([key, label, definition, clauseText, , optionPolicy], optionIndex) => {
    newFactIndex += 1;
    const factId = `fact.v4.axis.${axis.id}.${key}`;
    factIds.push(factId);
    facts.push({
      id: factId,
      schemaVersion,
      legacyEventId: null,
      domain: axis.domain,
      domainTitle: axis.title,
      label,
      subject: "本人或命籍所涉家门",
      predicate: definition,
      timeWindow: { kind: "axis_defined", minAge: axis.minAge ?? 0, maxAge: axis.minCurrentAge - 1, label: `截至${axis.minCurrentAge - 1}岁` },
      answerCriterion: `仅当“${definition}”准确成立时答“应”；同组其余选项应答“不应”；无法确认答“未明”。`,
      sensitivity: ["health", "relationship", "law_social"].includes(axis.domain) ? "intense" : "private",
      applicability: applicability(
        axis.minCurrentAge,
        "达到时间门槛且前置事实已经确认后可用于考刻。",
        optionPolicy?.requiredContexts ?? axis.requiredContexts ?? [],
        optionPolicy?.excludedContexts ?? axis.excludedContexts ?? [],
        optionPolicy?.questionMode ?? "ask"
      ),
      evidencePolicy: optionPolicy?.evidencePolicy,
      source: SOURCE,
      status: "active",
      inheritedFrom: null,
      mutualExclusionGroup: `mx.${axis.id}`,
      mutualExclusionOption: key
    });
    const overallIndex = v3Calibration.length + newFactIndex;
    const volumeIndex = Math.ceil(overallIndex / 20);
    calibrationClauses.push({
      id: `kao.v4.axis.${String(newFactIndex).padStart(3, "0")}`,
      schemaVersion,
      inheritedFrom: null,
      volumeId: `KAO-${String(volumeIndex).padStart(2, "0")}`,
      volumeTitle: `考刻第${volumeIndex}卷`,
      clauseNumber: ((overallIndex - 1) % 20) + 1,
      displayNumber: String(10000 + overallIndex),
      clauseText,
      interpretation: VISIBLE_AXIS_INTERPRETATIONS[axis.id]?.[key] ?? definition,
      primaryFactId: factId,
      legacyEventId: null,
      domain: axis.domain,
      category: axis.category,
      phase: optionIndex === 0 ? "initial" : optionIndex === axis.options.length - 1 ? "confirm" : "rectify",
      evidenceAxis: axis.id,
      ambiguity: { score: 0.08, level: "low", rationale: "枚举事实有明确计数或状态边界。" },
      applicability: applicability(
        axis.minCurrentAge,
        "达到时间门槛且前置事实已经确认后可用于考刻。",
        optionPolicy?.requiredContexts ?? axis.requiredContexts ?? [],
        optionPolicy?.excludedContexts ?? axis.excludedContexts ?? [],
        optionPolicy?.questionMode ?? "ask"
      ),
      answerMode: { type: "ternary", options: ["应", "不应", "未明"] },
      source: SOURCE,
      status: "active",
      mutualExclusionGroup: `mx.${axis.id}`
    });
  });
  constraints.push({
    id: `mx.${axis.id}`,
    title: axis.title,
    type: "exactly_one",
    category: axis.category,
    domain: axis.domain,
    factIds,
    probabilityRule: { sum: 1, tolerance: 1e-9 },
    candidateAssignment: `每个候选命籍在回答前即确定一个主选项；${factIds.length}项概率和恒为1。`
  });
}

const fateClauses = v3Fate.map((clause, index) => ({
  ...clause,
  id: `ming.v4.${String(index + 1).padStart(3, "0")}`,
  schemaVersion,
  inheritedFrom: clause.id,
  category: clause.category === "命局" ? "命局" : "运限",
  periodKind: clause.category === "前运" ? "past" : clause.category === "后运" ? "future" : "lifelong",
  source: { ...clause.source, provenance: `${clause.source.provenance}；V4仅重编为命局/运限检索层。` }
}));

let extraFateIndex = 0;
const baseFateVolumeCount = Math.max(...v3Fate.map((clause) => Number.parseInt(String(clause.volumeId).replace(/\D/g, ""), 10) || 0));
for (const axis of AXES) {
  axis.options.forEach(([key, label, definition, , fateText], optionIndex) => {
    extraFateIndex += 1;
    const overallIndex = v3Fate.length + extraFateIndex;
    const category = extraFateIndex % 3 === 1 ? "命局" : "运限";
    const volumeIndex = baseFateVolumeCount + Math.ceil(extraFateIndex / 20);
    const factId = `fact.v4.axis.${axis.id}.${key}`;
    fateClauses.push({
      id: `ming.v4.${String(overallIndex).padStart(3, "0")}`,
      schemaVersion,
      inheritedFrom: null,
      volumeId: `MING-${String(volumeIndex).padStart(2, "0")}`,
      volumeTitle: `${category}补编第${Math.ceil(extraFateIndex / 20)}卷`,
      clauseNumber: ((extraFateIndex - 1) % 20) + 1,
      displayNumber: String(20000 + overallIndex),
      clauseText: fateText,
      interpretation: definition,
      category,
      periodKind: category === "命局" ? "lifelong" : optionIndex % 2 ? "future" : "past",
      domain: axis.domain,
      primaryFactId: factId,
      conditionFactIds: [factId],
      timeScope: { kind: category === "命局" ? "lifelong_pattern" : optionIndex % 2 ? "future_conditional" : "past_summary", label: category === "命局" ? "命局" : optionIndex % 2 ? "后运" : "前运" },
      ambiguity: { score: 0.18, level: "low", rationale: "由枚举事实触发，只保留一个判断方向。" },
      applicability: applicability(axis.minCurrentAge, "仅在对应互斥事实为候选命籍主选项且证据充分时调用。"),
      source: SOURCE,
      status: "active",
      mutualExclusionGroup: `mx.${axis.id}`
    });
  });
}

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "候选命籍码本内容 V4",
  schemaVersion,
  invariants: [
    "BirthSeed由日期、时辰、性别、出生地四字段共同组成。",
    "120个候选命籍必须在读取用户回答前生成。",
    "每个候选包含事实概率、核心事实、候选先验与预生成命书条目。",
    "互斥组在每个候选中的事实概率和必须为1。",
    "相同BirthSeed与内容版本必须逐字节可重放。"
  ],
  birthSeedRequired: ["birthDate", "shichen", "gender", "birthplace"],
  clauseCategories: ["六亲考刻", "定分", "命局", "运限"],
  codebookRequired: ["schemaVersion", "corpusVersion", "seedFingerprint", "replayKey", "generatedBeforeAnswers", "candidates", "clauseMappings"]
};

const eventRules = serializableGlobalEventRulesV4(corpusVersion);

const manifest = {
  schemaVersion,
  corpusVersion,
  generatedAt: "2026-07-22T00:00:00+08:00",
  counts: {
    facts: facts.length,
    mutualExclusionGroups: constraints.length,
    globalEventRules: eventRules.rules.length + eventRules.dynamicRules.length,
    calibrationClauses: calibrationClauses.length,
    fateClauses: fateClauses.length,
    calibrationByCategory: Object.fromEntries(["六亲考刻", "定分"].map((category) => [category, calibrationClauses.filter((item) => item.category === category).length])),
    fateByCategory: Object.fromEntries(["命局", "运限"].map((category) => [category, fateClauses.filter((item) => item.category === category).length]))
  },
  files: ["content-schema.json", "facts.json", "calibration-clauses.json", "fate-clauses.json", "constraints.json", "event-rules.json", "reference-codebook.json"]
};

async function writeJson(name, value) {
  await writeFile(resolve(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeJson("content-schema.json", schema);
await writeJson("facts.json", { schemaVersion, corpusVersion, sourcePolicy: SOURCE, facts });
await writeJson("calibration-clauses.json", { schemaVersion, corpusVersion, sourcePolicy: SOURCE, clauses: calibrationClauses });
await writeJson("fate-clauses.json", { schemaVersion, corpusVersion, sourcePolicy: SOURCE, clauses: fateClauses });
await writeJson("constraints.json", { schemaVersion, corpusVersion, constraints });
await writeJson("event-rules.json", eventRules);
await writeJson("manifest.json", manifest);

console.log(JSON.stringify(manifest, null, 2));
