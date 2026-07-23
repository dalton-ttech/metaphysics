# 合成人生样本生成器

该目录只负责生成 `sealed-synthetic-v1` 的内存真值，不负责把真值写入磁盘，也不负责回答问题或评分。主入口是 `index.mjs`：

```js
import { generateCohort } from "./generator/index.mjs";

const batch = generateCohort({ seed: process.env.EXPERIMENT_SEED });
// batch = { profiles, sessions, metadata }
// 调用方应立即交给加密 sink 或仅驻内存的 Oracle。
```

未传 `seed` 时使用 Node `crypto.randomBytes(32)`；传入隐藏种子时，HMAC-SHA256 计数器随机流保证相同配置可复现。返回结果只有种子承诺值，不包含种子本身。本模块故意不提供 JSON/JSONL 明文文件写入器。

## 默认规模

- `language_stress`：50人，全部为 Agent respondent；
- `calibration`：500人，其中100名 Agent、400名规则 respondent；
- `validation`：300人，其中100名 Agent、200名规则 respondent；
- 从 validation 的 Agent 人群中选择30人进行一次7—14天复测；
- 合计850个独立人生、880次会话、250名独立 Agent 模拟人、280次 Agent 会话、600名规则模拟人。

## 生成假设

48个事件的ID、领域、基础权重和最早年龄与 `src/lib/events.ts` 对齐。事件并非独立抽签：共同的逆境、家庭稳定、迁动、事业能动性、财富波动、关系稳定、健康负担、社会风险和恢复力会同时影响多个事件；显式条件边进一步生成同向关联；离婚、破产、康复和人生重启具有可审核的前置事件及时间顺序。

`persona` 描述阅读、隐私披露、谨慎、析取规则理解、疲劳、迎合与响应速度；`memory` 描述回忆忠实度、时间精度、事件边界、虚假肯定倾向与复测漂移。这些都是可调整的工程参数，集中在 `../config/generator-config.v1.mjs`。

## 自检

在项目根目录运行：

```powershell
node experiments/sealed-synthetic-v1/generator/self-check.mjs
```

自检覆盖：48事件本体同步、850/880计数、Agent/规则分配、年龄可行性、前置事件顺序、ID唯一性、三组隔离、同种子可复现、换种子发生变化、种子不回显，以及五条预注册关联方向。

## 证据边界

配置中的发生率、关联强度、人物与记忆噪声都是显式的工程假设，不是对真实人群发生率的估计。合成实验只能检验代码、协议、推理上限与压力场景，不能证明真人理解率、真人披露行为、真实准确率或命书的现实效度。

