# V4 Goal 完成证据矩阵

验收范围：不做真人测试；允许确定性 Agent Persona 与封存程序模拟。状态只按当前文件、测试、报告和浏览器实机证据填写。

| Goal 交付物 | 权威证据 | 状态 |
|---|---|---|
| 传统形式与现代工程边界 | `research/`、`docs/V4-现代铁板神数因果架构与验收.md` | 完成 |
| 完整 BirthSeed 使用日期、时辰、性别、出生地 | `tieban-v4-codebook.ts`、integration test | 完成 |
| 回答前生成 120 份候选命籍 | `tieban-v4-engine.ts`、reference-codebook | 完成 |
| 120 候选签名唯一并可重放 | V4 内容测试、parity test | 完成，120/120 |
| JS / TS / 参考码本单一真源 | `content-v4-codebook-parity.test.ts` | 完成，逐字段一致 |
| 540 个原子事实 | `data/v4/facts.json` | 完成 |
| 540 条单命题考刻条 | `data/v4/calibration-clauses.json` | 完成 |
| 960 条命局 / 运限条文 | `data/v4/fate-clauses.json` | 完成 |
| 30 组四选一互斥约束 | `data/v4/constraints.json` | 完成 |
| 回答只更新候选后验 | `answerTiebanClauseV4`、engine tests | 完成 |
| 信息增益自适应选条 | `selectNextClauseV4` | 完成 |
| 12—24 轮、置信停止与待复 | engine constants / stopState / tests | 完成 |
| 应 / 不应 / 未明与撤回确定性重放 | `experience-v4.tsx`、engine tests | 完成 |
| 定数与页面条码一致 | `NumberBoardV4`、UI 截图 | 完成 |
| 十二卷视觉口径一致 | V4 content adapter、UI DOM | 完成 |
| 命书不读取 transcript | `tieban-v4-book.ts`、book isolation test | 完成 |
| 同一锁定 Profile 的命书不随答题文本改变 | `tieban-v4-book.test.ts` | 完成 |
| 不同锁定候选生成不同命书 | book tests | 完成 |
| 命书不完整复制考刻问句 | integration / sealed tests | 完成，直接复用率 0 |
| 前尘 6—10 个年龄 / 人物 / 事件节点 | book compiler、UI 全流程 | 完成 |
| 前尘领域配额、冲突去重、年龄合理性 | book compiler、integration test | 完成 |
| 重大事件与逆境密度上限 | book compiler、integration test | 完成 |
| 后程从当前年龄连续编至寿限 | lifetime compiler、integration test | 完成，年龄空档 0 |
| 后程每 1—3 年一条、寿限单列 | `tieban-v4-future.ts`、1,000 人模拟 | 完成，最大跨度 3 年 |
| 后程判词、征兆、白话三层且无节点标题 | `experience-v4.tsx`、copy tests | 完成 |
| 后程主题连续性与晚年收束 | lifetime simulation | 完成，最长同域连续 2 条 |
| 封存 Oracle 与推理权限隔离 | `experiments/sealed-tieban-v4/` | 完成，8/8 |
| 1,500 个可复用 Persona | `personas/generated/persona-configs.json` | 完成 |
| 正式模拟规模 | `canonical-result.json` | 完成，50,000 会话 |
| 模拟统计闸门 | experiment summary | 完成，30/30 |
| 同输入完整重放 | canonical result | 完成，100% |
| 浅色新中式、无嵌套卡片、3D 应 / 不应 | `globals.css`、三轮截图 | 完成 |
| 统一纸面日期 / 时辰选择器 | IntakeView、UI 截图 | 完成 |
| 不显示题数或百分比进度 | 生产 DOM 与截图 | 完成 |
| 320 / 390 / 1024 响应式 | `design-qa-v4.md`、浏览器实机 | 完成 |
| 三轮 UI 迭代 | `design/qa/v4-iteration-*` | 完成 |
| 类型、应用、内容与封存测试 | npm scripts | 完成 |
| standalone 生产构建与 HTTP 200 | `next-build-v4/standalone/` | 完成 |
| 可复现发布清单 | `release-manifest.json` | 完成 |

## 验收结论

V4 已从“问答后拼画像”改为“出生资料预生成候选命籍—旧事考刻—锁定命籍—独立成书”。它在产品形态和工程因果链上达到本项目定义的现代铁板神数，而不是对历史秘传算法真实性的声明。

## 必须保留的边界

1. 刻分是用于复刻考时定刻流程的工程候选状态，不宣称科学恢复客观出生分钟；
2. 50,000 次结果来自确定性合成 Persona，不是真人准确率；
3. 画像 Precision / Recall 衡量人工定义事实本体内的匹配，不等于完整人生被完全理解；
4. 条文是现代拟制的古籍断语体，不冒称古籍原文或正统传承秘本；
5. 真人现场验证、真实理解率和长期现实效度属于下一阶段，不阻塞本轮 Goal。
