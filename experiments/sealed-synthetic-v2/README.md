# 密封合成人生实验 v2.2

v2 保留 v1.1 的 48 个顶层事件和工程先验，避免把论坛热度误当成人群发生率。变化集中在两个部分：

1. 论坛/社媒线索被抽象为事件链和现代汉语回避表达；
2. 每次会话固定 24 轮：前 16 轮每题三个事件，保证 48 个事件各覆盖一次；随后 4 轮二至三事件题交叉复核 10 个低基率事件；最后用两种不同措辞各确认两次“早年深刻关系”和“关键考试转折”，只有一致证据才能形成稳定高后验。固定主路径减少复测时由轻微回答漂移造成的追问分叉。

校准组内同时运行 `adaptive_control` 与 `targeted_verify`；独立验证组预先固定使用 `targeted_verify`。验证组不会反向用于选择阈值或策略。单事件验真题的理解增益与敏感回避缓解是明确的模拟假设，不是真人结论。

高置信层在校准组以 95% Precision 为选择目标，为独立验证的 90% 验收线预留波动余量；候选层仍以 Recall ≥70%、Precision ≥40% 为约束选择 F1 最优阈值。

```powershell
npm test
npm run run
```

同种子复现：

```powershell
node runner/run-experiment.mjs --replay-seed-file artifacts/<run-id>/reveal/seed.txt
node ../sealed-synthetic-v1/reports/verify-replay.mjs artifacts/<run-id> artifacts/<replay-id>
```
