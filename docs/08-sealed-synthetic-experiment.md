# sealed-tieban-v3 密封模拟实验

## 目的

验证 V3 的五个工程问题：

1. 120 个候选刻分能否在 12—26 轮单命题问答中区分；
2. 自适应信息增益是否优于盲目追加问题；
3. 一次或两次错答后是否仍可恢复；
4. 同一模拟人在复测时是否保持稳定；
5. 推断端能否在完全看不到人生真值的情况下完成解码。

## 目录

experiments/sealed-tieban-v3/

- codebook/：120 候选与 60 条实验条文的工程码本；
- oracle/：密封真值持有端；
- runner/：推断策略和正式实验；
- config/：样本、噪声、轮数与预设门槛；
- tests/：隔离、复现、错答和报告一致性；
- reports/canonical-result.json：机器可读定稿；
- reports/experiment-summary.md：中文摘要。

## 隔离

assignment 使用 AES-GCM 密封。推断端只获得：

- 公开候选列表；
- 公开单命题条文；
- 匿名会话标识；
- 当前一题的“应 / 不应 / 未明”。

推断端无法获得：

- 真值事实数组；
- 候选正确答案；
- 密钥；
- 明文随机种子；
- 解密或 reveal 方法。

正式报告只包含聚合指标、承诺哈希和审计链，不包含单人的明文真值。

## 样本

| 数据集 | 数量 |
|---|---:|
| calibration_default | 2,400 |
| validation_default | 1,200 |
| validation_stress | 1,200 |
| validation_agent | 600 |
| recovery_1_wrong | 1,200 |
| recovery_2_wrong | 1,200 |
| retest | 240 |
| 合计 | 8,040 |

Agent persona 模拟理解、记忆、敏感披露和稳定性差异；它不查看解码结果后迎合评分。

## 结果

- 25/25 预设门槛通过；
- 7/7 自动测试通过；
- 默认 Top1 / Top3：100% / 100%；
- 压力 Top1 / Top3：98.42% / 99.17%；
- Agent Top1 / Top3：97.17% / 98.33%；
- 一次错答 Top1 / Top3：99.42% / 99.75%；
- 两次错答 Top1 / Top3：96.67% / 98.42%；
- 复测 Top1 一致率：100%；
- 复测画像 Jaccard：100%；
- 默认平均轮数：12.05；
- 两次错答平均轮数：15.79。

核心结果 SHA-256：

4e49c908e54f99a7fe6d6ade95343a3a37d09c335ff3a4ca48b75c97d77ba207

## 复现

在 20260720 根目录：

~~~powershell
npm run synthetic:v3:test
npm run synthetic:v3:run
~~~

仅校验已锁定报告、隔离与复现约束：

~~~powershell
npm run synthetic:test
~~~

## 与生产引擎的关系

密封实验用于验证隔离框架、轮数和纠错上界。生产页面另有 tests/tieban-v3-production-simulation.test.ts，直接加载正式 240 条内容和正式 TS 引擎，防止实验通过但产品没有接入。

二者共同构成证据：

- sealed-tieban-v3：大样本、密封、压力与复测；
- production simulation：正式题库、正式引擎、正式命书编纂器的契约测试。

## 边界

候选码本经过最小汉明距离优化，属于工程纠错上界。高分证明人工构造码字可以稳定解码，不证明真实人生经历与客观出生分钟存在同样的自然对应关系，也不替代真人理解率或现实命理效度。
