# V4 候选命籍码本

## 工程事实

V4不再把“候选刻分”当成回答后的空标签。系统收到 BirthSeed 后、展示第一条考刻条以前，就会生成120份完整候选命籍：每份命籍已有候选先验、全部事实概率、互斥状态、八领域核心事实和预生成命书条目。

用户回答只更新120候选的后验权重，不生成、补写或修改候选命籍。

## 内容规模

V4在当前V3语料上增加30个四选一状态轴：

| 内容 | 数量 |
|---|---:|
| 原子事实 | 540 |
| 四选一互斥组 | 30 |
| 六亲考刻条 | 148 |
| 定分条 | 392 |
| 考刻条合计 | 540 |
| 命局条 | 376 |
| 运限条 | 584 |
| 命局/运限合计 | 960 |
| 候选刻分 | 120 |
| 每个参考候选预生成命书条 | 48 |

全部新增内容继续标记为 `modern_fabricated`，不冒称古籍原文。

## 文件

### 可直接导入的静态JSON

- `data/v4/facts.json`
- `data/v4/calibration-clauses.json`
- `data/v4/fate-clauses.json`
- `data/v4/constraints.json`
- `data/v4/manifest.json`
- `data/v4/reference-codebook.json`

Next或其他打包器可直接把前五项作为JSON基础数据导入。`reference-codebook.json`为可重放样例和验收固定件，约8MB，不建议作为每个客户端会话的生产载荷。

### 浏览器兼容的纯函数核心

`scripts/v4/codebook-core-v4.mjs`只使用普通JavaScript：

- 不导入 `node:crypto`；
- 不读取文件；
- 不读取系统时间；
- 不调用 `Math.random()`；
- 不依赖TypeScript运行时。

它导出：

```js
normalizeBirthSeed(input)
stableHash32(value, basis?)
birthSeedFingerprint(input)
buildCandidateCodebook({
  birthSeed,
  corpusVersion,
  facts,
  calibrationClauses,
  fateClauses,
  constraints
})
```

`build-reference-codebook.mjs`才是Node专用的文件读写包装层。若客户端需要动态生成，可直接复刻或移动纯函数核心，不需要复刻Node接口。

## BirthSeed

四个字段全部必填并共同进入规范化种子：

```json
{
  "birthDate": "1990-01-01",
  "shichen": "子",
  "gender": "未说明",
  "birthplace": "北京"
}
```

规范化规则：

1. 日期必须为 `YYYY-MM-DD`；
2. 所有字段去除首尾空白；
3. 时辰、性别、出生地转小写；
4. 出生地内部连续空白合并；
5. 规范串为 `birthDate|shichen|gender|birthplace`；
6. 使用四路稳定32位哈希组成32字符 `seedFingerprint`。

改变任一字段都会改变候选先验与条文映射；相同规范化种子和语料版本得到逐字节相同的码本。

## `reference-codebook.json` 精确结构

### 顶层

```text
schemaVersion                 "4.0.0"
corpusVersion                 内容版本
birthSeed                     规范化后的四字段
birthSeedFieldsUsed           固定四字段名
seedFingerprint               32字符种子指纹
contentDigest                 事实/条文/约束摘要
replayKey                     corpusVersion:fingerprint:contentDigest
generatedBeforeAnswers        true
answerHistoryUsed             false
candidateCount                120
factCount                     事实总数
calibrationClauseCount        考刻条总数
fateClauseCount               命局/运限条总数
mutualExclusionGroupCount     互斥组数
candidates[]                  120份候选命籍
clauseMappings[]              每条考刻条的120候选似然
```

### `candidates[]`

```text
id                            C001—C120
minuteOffset                  0—119
prior                         回答前候选先验，120项之和为1
factProbabilities             { factId: probability }，覆盖全部事实
exclusiveSelections           { constraintId: selectedFactId }
coreFactIds                   概率不低于0.72的核心事实
coreFactsByDomain             八领域核心事实索引
fateClauseIds                 回答前预生成的命局/运限条
fateClauseCountByCategory     { 命局, 运限 }
signature                     候选命籍唯一摘要
```

### `clauseMappings[]`

```text
clauseId                      考刻条ID
displayNumber                 稳定显示编号
primaryFactId                 唯一主事实
category                      六亲考刻或定分
candidatePYes                 { C001: pYes, ... C120: pYes }
yesCandidateCount             pYes >= 0.5 的候选数
noCandidateCount              其余候选数
splitRatio                    yesCandidateCount / 120
binaryEntropy                 本次二分的理论熵
mappingDigest                 本条映射的重放摘要
```

## 候选生成规则

### 普通人生事实

对每个普通事实，用 BirthSeed、内容版本、事实ID和候选ID计算稳定排序。120候选中恰有60个进入高概率侧，其余60个进入低概率侧，因此对应考刻条保持1:1分割。

### 四选一事实轴

30个状态轴覆盖手足人数、排行、父母关系、学历、迁移次数、婚姻次数、子女数、手术次数、诉讼次数等可枚举事实。每个候选在每组预先选定一个主选项：

- 四项概率和恒为1；
- 主选项概率为0.84—0.95；
- 每个选项在120候选中恰为30份命籍的主选项；
- 对应条文形成30:90分割。

这些约束不把可能反复发生的普通事件错误地互斥。

### 命书预生成

候选事实概率达到0.72后才可支持候选命书条。每个候选分别选择24条命局和24条运限，生成过程不读取用户回答。

## 编号与重放

- 考刻显示编号全局唯一；
- 命局/运限显示编号全局唯一；
- 卷号与卷内条号唯一；
- `replayKey`同时锁定内容版本、BirthSeed和内容摘要；
- `reference-codebook.json`可由参考BirthSeed逐字节重建。

## 验证

```powershell
node scripts/v4/generate-content-v4.mjs
node scripts/v4/build-reference-codebook.mjs
node scripts/v4/validate-content-v4.mjs
node --test tests/content-v4-codebook.test.mjs
```

当前自动验证证明：

- 120候选签名全部不同；
- 每个候选核心事实非空且覆盖八领域；
- 每条考刻条分割比例介于0.25与0.50；
- 同种子完整重放；
- 分别改变日期、时辰、性别或出生地，种子指纹、候选先验、条文映射都会改变；
- 30个互斥组在全部120候选中均满足概率和为1。

## 边界与缺口

1. 码本证明的是工程内部可区分、可重放，不证明出生资料能科学决定真实人生。
2. 普通事实列采用人为平衡的60:60编码，互斥轴采用30:90编码；它们是信息工程码字，不是人口发生率。
3. 当前候选的“分钟偏移”是内部刻分索引；没有真实出生分钟标注时，不应宣称它等于钟表真值。
4. BirthSeed影响先验和映射是产品确定性规则，不是已验证的命理因果关系。
5. 参考码本体积较大，生产客户端应在服务端生成或仅传输当前会话需要的候选权重与单条映射。

