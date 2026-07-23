import { V4_CALIBRATION_CLAUSES } from "../src/lib/tieban-v4-content";

const vagueOrTechnical = /职业主线|生活主线|升学路径|训练路径|后续道路|亲密关系判断|影响功能|生活结构|重塑自我身份|身份安排|非自愿职业中断|主要盈亏|财务冲击|正式或事实婚姻|正式法律程序|关键节点|决定性帮助/u;
const incompleteReference = /前一处|这一处|此处|上述|真实选择|未完的课题|留下的尺度/u;
const unidiomatic = /本人|进入(?:一次|两次|至少三次)登记结婚|发生(?:一次|两次|至少三次)因外部原因|经历(?:一次|两次|至少三次)原有|有(?:一次|两次|至少三次)自己承担主要|三十五岁前成年后|完成(?:一次|两次|至少三次)重要置业|显著进项|重组家庭|长期离场/u;
const exposedScoringCriteria = /截至二十四岁|计入的实际手足|全部血缘手足|非血缘家人|去重后|共同生活满五年|累计联系|二十四次|平均每周至少|至少一半的必要开支|礼物与偶尔代付不计|可与照料、供养同时成立/u;

const visibleInterpretations = [...new Set(V4_CALIBRATION_CLAUSES.map((clause) => clause.interpretation))];
const findings = visibleInterpretations.filter((text) => vagueOrTechnical.test(text)
  || incompleteReference.test(text)
  || unidiomatic.test(text)
  || exposedScoringCriteria.test(text));

if (findings.length) {
  console.error(["发现不适合直接展示的白话文：", ...findings.map((text) => `- ${text}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`白话文审核通过：${visibleInterpretations.length} 条“今解”未发现抽象指代、内部建模用语或暴露的计分口径。`);
}
