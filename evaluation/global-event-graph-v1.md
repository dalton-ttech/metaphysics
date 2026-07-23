# 全域事件图谱模拟报告 V1

- 内容版本：`2026.07.22-v4.2.1`
- 固定种子：`global-event-graph-v1`
- 随机结构化人生样本：20000
- 参与条件审核的事实：116
- 条件事实检查：2320000
- 矛盾事实仍被判可用：0
- 上游未知时误跳过：0
- 候选命籍核心事实检查：27196
- 候选命籍核心矛盾：0

## 规则覆盖

| 规则 | 应作用事实 | 已写入事实 |
|---|---:|---:|
| family.sibling-existence | 10 | 10 |
| family.no-long-caregiving-before-30 | 5 | 5 |
| family.no-close-loss-before-30 | 5 | 5 |
| relationship.no-marriage-before-40 | 7 | 7 |
| relationship.no-second-long-relationship-before-40 | 4 | 4 |
| relationship.no-year-long-relationship-before-40 | 4 | 4 |
| relationship.no-child-rearing-before-45 | 4 | 4 |
| career.no-switch-before-40 | 4 | 4 |
| career.no-leadership-before-35 | 3 | 3 |
| career.no-entrepreneurship-before-40 | 4 | 4 |
| career.no-involuntary-interruption-before-40 | 4 | 4 |
| wealth.no-life-changing-shock-before-40 | 6 | 6 |
| health.no-treatment-level-accident-before-40 | 16 | 16 |
| mobility.never-left-before-30 | 7 | 7 |
| mobility.no-overseas-stay-before-35 | 5 | 5 |
| mobility.no-childhood-moves | 4 | 4 |
| career.entry-before-event-window | 18 | 18 |

## 验收

- 通过：noContradictoryEligibleFacts
- 通过：unresolvedExclusionsRemainEligible
- 通过：unresolvedRequirementsDefer
- 通过：noContradictoryCandidateCoreFacts
- 通过：allRulesMaterialized
- 通过：deterministicReplay

该实验验证的是条件门控、时间范围、候选命籍内部一致性与固定种子重放，不把结构模拟结果冒充真人识别准确率。未建立严格蕴含关系的相似事件会保留为可询问事实，以避免过度推断。
