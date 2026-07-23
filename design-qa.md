# V3 UI 三轮设计验收

目标：现代简约与新中式东方神秘感；浅色矿物纸底；拒绝卡片套卡片；“应 / 不应”为实体 3D 按键；流程像考时定刻而非问卷。

视觉来源：

- C:\Users\ACER\AppData\Local\Temp\codex-clipboard-a2c868c8-5c3f-4ef4-87d8-ed241dfddb69.png
- C:\Users\ACER\AppData\Local\Temp\codex-clipboard-523a0937-9cab-4452-a416-5fac3ab7d297.png
- C:\Users\ACER\AppData\Local\Temp\codex-clipboard-1991b4f4-1a61-468d-8a30-5ed79059040f.png
- public/assets/mineral-paper.webp

## Iteration 1：V3 结构重建

完成：

- 从旧 24+8 多事件问卷切换为起例—单条考刻—定分—命书；
- 加入 120 刻分、古籍格盘、纵排条文和卷号 / 条号；
- 3D“应 / 不应”按键进入主操作区；
- 命书封面、前尘时间线、后程节点全流程可交互；
- 17 次全“应”样本成功锁定 09:07，生成 10 条前尘和 4 条后程。

首轮发现：

- 原生 date 控件在自动化浏览器中不能稳定录入；
- 状态文案“先验家门旧迹”暴露了系统正在询问的领域；
- 事实 label 混入年龄，导致标题、年龄和后程承接重复；
- 定刻页显示“初刻7分”，命书封面却显示“第1刻·8分”。

证据：

- design/qa/v3-iteration-1/landing-390x844.png
- design/qa/v3-iteration-1/intake-390x844.png
- design/qa/v3-iteration-1/question-01-fixed-390x844.png
- design/qa/v3-iteration-1/locked-390x844.png
- design/qa/v3-iteration-1/book-past-390x844.png

## Iteration 2：信息层级与障眼法收束

修正：

- 生辰改为明确 YYYY-MM-DD 文本输入和严格日期校验；
- 页面说明“生辰只存本机”改为仪式文本“一命一卷”；
- 考刻状态改为“先合乾卷旁条 / 旁数移位 / 诸数渐合”，不点破事件领域；
- 事实标题移除年龄后缀；
- 前尘节点拆成“年龄 · 人物 / 事件标题 / 原条 / 白话事件与后果”四层；
- 后程从“承接某年龄”改为“承接某个已确认事件”。

结果：

- 单条问题保持一个 primaryFactId；
- 前尘节点不再重复年龄；
- 后程的证据来源在文案和数据结构中都可读；
- 390×844 无横向溢出，3D 按键位于拇指操作区。

证据：

- design/qa/v3-iteration-2/question-01-390x844.png
- design/qa/v3-iteration-2/book-past-390x844.png
- design/qa/v3-iteration-2/book-future-390x844.png

## Iteration 3：命书语气、刻分一致性与响应式定稿

修正：

- 去除后程条文中的“之类、所得之经验、可用于”等解释性模板词；
- 改为“某象再临 / 某势再动 / 前路反见”的预言语气；
- 定刻页与命书封面的刻内分钟统一为 09:07、初刻7分 / 第1刻·7分；
- 前尘与后程正文提升到 14px、1.95 行高；
- 320×568 首页、390×844 考刻 / 定刻 / 命书、1024×768 桌面命书完成实机复核；
- 传统局盘与最终考刻页、传统纵排条文与最终条文页均在同一比较输入中并排检查。

最终证据：

- design/qa/v3-iteration-3/landing-320x568.png
- design/qa/v3-iteration-3/question-01-390x844.png
- design/qa/v3-iteration-3/locked-390x844.png
- design/qa/v3-iteration-3/book-top-390x844.png
- design/qa/v3-iteration-3/book-future-390x844.png
- design/qa/v3-iteration-3/book-top-1024x768.png

## 最终检查

- 无问卷题数、百分比或常规进度条；
- 无 Tinder / 滑卡；
- 无卡片套卡片；
- 无暴露算法的消费者说明；
- 核心按钮和输入可操作；
- 撤回、未明、撤局、重新起局可达；
- 前半生命书包含年龄、人物、事件、后果与原条；
- 后程包含年龄段、条文、白话变化与明确结果；
- 字体自托管，支持焦点态、44px 触控区和 reduced-motion；
- 最终生产页浏览器 error / warning 日志为 0；
- 生产构建 HTTP 200。

final result: passed
