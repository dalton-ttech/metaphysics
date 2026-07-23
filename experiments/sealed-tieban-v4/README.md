# sealed-tieban-v4

V4 是独立于现有产品代码的封存程序模拟，验证以下不可逆因果链：

`BirthSeed → 120候选Profile预生成 → 从候选矩阵取条 → 回答仅更新候选后验 → 锁定Profile → Profile生成命书`

命书模块的公开函数只有 `generateLifeBook(lockedProfile, birthSeed)`，没有 transcript、answer 或直接事实回填入口。

## 正式样本

- 模型内校准：5,000
- 模型内默认：12,000
- 模型内带噪：12,000（与默认组同一批隐藏人生）
- 模型外独立人生：19,500
- 极端/冲突：500
- 同输入确定性复测：500
- BirthSeed反事实：500
- 总计：50,000次程序会话

Persona配置共1,500个，直答型、谨慎型、冲突型各500个。它们是确定性算法模拟，不是外部LLM或真人。

## 运行

```powershell
cd E:\工作文件\code\metaphysics\20260720\experiments\sealed-tieban-v4
npm test
npm run run
```

## 输出

- `reports/canonical-result.json`：聚合结果，不含单人真值或明文映射
- `reports/experiment-summary.md`：中文结论与证据边界
- `personas/generated/persona-configs.json`：1,500个可复用Persona
- `artifacts/clause-codebook.json`：60条单命题问句
- `artifacts/candidate-design.json`：候选编码、选条顺序、预设门槛

## 解释边界

候选Profile使用人工冗余码构造。模型外人生由潜在出生分钟条件下的独立概率过程生成，并强制不等于候选Profile。该实验测量工程识别、纠错、映射和生成隔离，不证明现实出生时间与人生事件之间存在因果关系，也不验证未来预言。
