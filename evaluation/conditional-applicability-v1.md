# 条件考刻模拟报告 V1

- 固定种子：`condition-v1`
- 样本数：10000
- 清晰回答准确率：100.00%
- 含噪样本准确率：100.00%
- 无手足样本误问下游条文：0
- 不适用条文展示率：0.00%
- 重放一致：是

## 分层结果

| 分层 | 样本 | 精确识别 | 平均证据检查数 |
|---|---:|---:|---:|
| no_sibling | 2000 | 100.00% | 3.50 |
| co_resident | 2000 | 100.00% | 17.12 |
| half_sibling_separate | 1500 | 100.00% | 18.00 |
| substitute_parent | 1500 | 100.00% | 17.14 |
| early_loss | 1000 | 100.00% | 17.50 |
| estranged_or_lost_contact | 1000 | 100.00% | 17.14 |
| mixed_with_noise | 1000 | 100.00% | 15.53 |

## 验收

- 通过：noInapplicableQuestions
- 通过：noSiblingCascade
- 通过：clearAccuracyAtLeast90
- 通过：noisyAccuracyAtLeast85
- 通过：deterministicReplay

该实验以密封结构化真值验证条件筛题、无手足级联跳过、排行与三项可并存责任的推断，以及固定种子重放。表中的证据检查数不是产品问答轮数，准确率也不代表真人理解率；中文理解另由独立模拟真人 Agent 审核。
