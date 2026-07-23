# Sealed Synthetic Blind Experiment v1

本实验用于在不向提问方泄露合成人生真值的前提下，压力测试多轮是/否问答、事件画像恢复和前半生命书的事实锚定能力。

## 预注册规模

- 850 个独立人生样本；
- 50 个 `language_stress`、500 个 `calibration`、300 个 `validation`；
- 从 Agent 模拟者中抽取 30 人建立 `retest` 会话；
- 共 880 次会话；
- 250 个独立 Agent-based respondent，280 次 Agent 会话；
- 600 个 rule respondent，600 次会话；
- 每次 18—24 问。

## 信任边界

明文人生经历只允许存在于生成器返回值和密封 Oracle 进程内存中。磁盘只保存 AES-256-GCM 密文、公开配置、审计链及聚合报告。提问客户端只取得人口学输入、会话令牌以及逐题 `yes / no / unsure`。

## 目录

- `config/`：集中管理的可审计假设与公开题目规范；
- `generator/`：相关人生轨迹与会话计划生成器；
- `oracle/`：加密、权限、问答预算、提交锁定和评估；
- `runner/`：固定、自适应与 reasoning policy；
- `tests/`：安全、计数、统计与端到端自检；
- `artifacts/`：运行时密文和审计日志；
- `reports/`：机器结果与中文总结。

## 科学边界

这是合成实验，能够验证实现、数学恢复能力、噪声鲁棒性和信息隔离；不能替代真人理解率或真人画像准确率。Agent-based respondent 是带认知、记忆和回答策略的代理模型，不等同于独立真人。

## 执行与复现

```powershell
npm test
npm run run
npm run run -- --replay-seed-file <首轮目录>\reveal\seed.txt
npm run replay:verify -- <首轮目录> <重放目录>
```

`reveal/` 只在全部预测锁定后生成，且 `artifacts/` 已被 Git 忽略。当前权威结论、指标与双跑哈希见 [定稿报告](reports/experiment-summary.md) 和 [机器结果](reports/canonical-result.json)。
