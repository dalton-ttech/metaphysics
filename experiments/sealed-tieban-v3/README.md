# sealed-tieban-v3

该实验把铁板神术问答建模为120个候选刻分之间的带噪声识别问题。每个刻分对应一组原子人生事实；60条工程条文各自只检验一个唯一 `primaryFactId`，回答严格限定为“应 / 不应 / 未明”。

## 推断流程

1. 候选刻分先验均等；
2. 每轮计算所有未问条文的期望信息增益；
3. 选择信息增益最高的单命题条文；
4. 依据“应 / 不应 / 未明”更新120候选后验；
5. 最少12轮；Top1、Top3累计后验和归一化熵同时达标时停止；最多26轮；
6. 候选后验同时投影为60项前半生事实概率画像。

## 场景与不可降低门槛

正式实验包括默认、压力、Agent persona、强制1次错答、强制2次错答和复测。Top1、Top3、轮数、画像Precision/Recall/Jaccard及复测门槛写在 `config/experiment-config.mjs`。实验失败时报告失败项，不在运行中调低门槛。

## 隔离

候选码本与条文码本公开；会话实际对应的刻分使用AES-GCM逐条加密，并只在arena私有闭包内解密。推断端看不到候选真值、赋值表、密钥或reveal接口，只能读取匿名会话和当前条文答复。

## 运行

```powershell
cd experiments/sealed-tieban-v3
npm test
npm run run
```

输出：

- `codebook/generated/clause-codebook.json`
- `codebook/generated/candidate-codebook.json`
- `reports/canonical-result.json`
- `reports/experiment-summary.md`

候选刻分与噪声均是工程合成假设，不代表真实人口统计、真人理解能力或现实命理效度。

