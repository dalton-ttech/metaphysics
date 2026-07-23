# V3 部署说明

## 目录

20260720 是独立部署根目录。部署平台的 Root Directory 必须指向该目录，而不是 E:\工作文件\code\metaphysics 根目录。

## 环境

- Node.js 20 或更高；
- npm 10 或兼容版本；
- 不需要数据库；
- 不需要 API Key；
- 当前会话只保存在浏览器 localStorage；
- Windows、Linux 容器和常规 Node 主机均可运行 standalone 产物。

## 完整发布闸门

~~~powershell
npm ci
npm run release
~~~

release 按顺序执行：

1. Vitest 应用与生产路径模拟；
2. V3 内容约束测试；
3. sealed-tieban-v3 隔离与复现测试；
4. TypeScript 类型检查；
5. Next.js 生产构建；
6. standalone 静态资源整理；
7. release-manifest.json 生成。

## 生产启动

~~~powershell
$env:PORT = "3051"
npm start
~~~

等价的直接命令：

~~~powershell
$env:PORT = "3051"
node next-build-v3/standalone/server.js
~~~

健康检查：

~~~powershell
(Invoke-WebRequest -Uri "http://127.0.0.1:3051/" -UseBasicParsing -TimeoutSec 10).StatusCode
~~~

应返回 200。

## 构建产物

Next.js 使用：

- output: standalone
- distDir: next-build-v3

可部署目录为 next-build-v3/standalone/。scripts/prepare-standalone.mjs 会复制：

- next-build-v3/static；
- public/mineral-paper.webp；
- public/og.png；
- 其他 public 静态资源。

不要只复制 server.js，否则字体、纸纹理和前端 chunk 会缺失。

## 发布清单

release-manifest.json 记录 V3 源码、数据、文档、测试、UI 证据和 sealed-tieban-v3 的文件哈希及 sourceTreeSha256。它不收录 next-build-v3 构建缓存，也不把旧 v1/v2/v2.3 实验列为 V3 权威证据。

任何会改变以下内容的发布都必须重新生成清单：

- 题库或事实本体；
- 候选码字与停止条件；
- 命书编纂逻辑；
- UI 消费者流程；
- 依赖锁文件；
- 实验或验收门槛。

## 隐私与外部 Agent

当前版本无服务端人生数据存储。若以后接入 Agent：

- 模型密钥只放服务端；
- 输入只传结构化已确认事实、证据 ID 与风格参数；
- 不把候选真值、实验密钥或原始密封 assignment 传给模型；
- 模型输出必须通过 schema 校验；
- Agent 不得新增、删除或替换 evidenceFactIds；
- 规则编纂器继续作为无 Agent 时的确定性回退。

## 历史工具

/lab、validation 脚本和旧 sealed-synthetic-v1/v2/v2.3 仍保留用于历史回溯或未来真人阶段，不进入本轮 V3 消费者发布闸门。
