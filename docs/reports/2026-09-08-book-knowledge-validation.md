---
project: VibeFoundry
category: validation-report
source_path: docs/reports/2026-09-08-book-knowledge-validation.md
status: completed
last_updated: 2026-09-08
---

# 书籍知识资产验收：宿主 AI 首版

已完成[本批计划](../plans/2026-09-08-book-knowledge-assets.md)定义的首版闭环：准备本地阅读材料，由宿主 AI 阅读和整理，再由 VibeFoundry 校验并生成五类知识资产。完成范围不包含项目独立调用模型自动理解整本书。操作见[使用手册](../runbooks/distill-book-knowledge.md)，设计依据见[开源取舍研究](../research/2026-09-08-book-knowledge-open-source.md)。

## 当前交付

- `--prepare` 在新工作目录生成阅读任务、文档和分块材料；保留中文、表情与原文坐标，空正文明确报错。
- `--analysis` 重新读取原书，校验摘要、完整块声明、严格字段、实体 ID、关系引用及单元内唯一逐字引文，校验完成后才写正式资产。
- 世界观、人物、设定、概念和隐喻使用同一资产协议；属性与有向关系均保留依据，区分原文明示与解读，并列出未解决问题。
- 生成主资产 JSON、分类 Markdown 卡片、同一资产的网络 JSON，以及可独立使用的 HTML 关系图。图支持类型筛选、点选实体查看属性、关系和来源。
- 旧九词簇统计入口保留其明确用途；已有 0.2.0 知识资产时拒绝被旧 0.1.0 统计覆盖。

## 自动化验证

| 命令 | 实际结果 |
| --- | --- |
| `node scripts/verify-mvp.mjs` | 构建通过；375 个测试、56 个套件、0 失败；既有工程资产 CLI 与 MCP 验证通过 |
| `node scripts/verify-book-knowledge.mjs` | 书籍准备、分析导入、产物一致性、证据定位及失败保护验证通过 |
| `node scripts/verify-book-knowledge.mjs --output output/book-knowledge` | 保留本次书籍示例及验证结果：10 个实体、7 条有向关系、28 条逐字证据 |

文档加入后的发布准备与信息清理回归通过：`tests/release/open-source-readiness.test.mjs`、`tests/release/open-source-sanitization.test.mjs` 共 20 个测试通过。`git diff --check` 无空白错误，仅提示既有文件的 CRLF 换行转换。

书籍样例为仓库自创短篇《雾港》及预先阅读整理的分析。验证确认五类实体齐全，两位名为“顾舟”的人物保留不同 ID，林岚的别名“阿岚”保留，隐喻属性标记为解读。全部 28 条证据均能按输出偏移从规范化原文截取到相同引文；网络 JSON 与主资产一致。

实际 CLI 还验证了拒绝降级覆盖和拒绝过期摘要：失败后已有主资产内容保持不变。测试覆盖的是文本、协议、校验、产物与操作流程，不是模型对完整长书的理解准确率。MCP 验证覆盖既有工程资产链路，不能据此声称书籍已接入 MCP。

本次保留的[验证结果 JSON](../../output/book-knowledge/vibe-foundry-book-verification-BTXAqJ/verification.json)和[关系图 HTML](../../output/book-knowledge/vibe-foundry-book-verification-BTXAqJ/library/books/雾港-1d5405d624/knowledge-network.html)位于本地生成目录。重新运行会使用新的独立验证目录，不要求复用这次目录名。

## 真实浏览器检查

自动化工具不允许访问 `file://`，因此使用只提供该 HTML 的 localhost HTTP 服务检查生成页面，无需外网。没有将本地文件协议的直接打开方式计为已经验证。

| 检查 | 实际结果 |
| --- | --- |
| 全量关系图 | 显示 10 个节点、7 条边 |
| 点选林岚 | 显示别名“阿岚”、第 8 行来源依据及解读标记 |
| 人物类型筛选 | 显示 4 个节点、2 条人物内部关系 |
| 最终页面控制台 | 0 个错误、0 个警告 |
| 390 × 844 视口 | 人物筛选状态仍为 4 个节点、2 条边；页面宽度 375 不超过视口宽度 390，无整页横向溢出；关系图使用自身横向滚动 |

首版直线关系边穿过无关节点的问题已修复，改为绕行后重新检查并截图：[全量图](../../output/playwright/book-knowledge-overview.png)、[人物详情图](../../output/playwright/book-knowledge-character.png)。人物筛选结果通过实际页面状态检查确认，未另存筛选截图。移动端仅检查上述布局和筛选状态，没有覆盖所有移动操作或设备。

## 清理与保留

将重复的书籍输出目标预检收敛到共享 `book-output` 模块，清理旧的直线裁剪实现，并移除依据括号猜测、裁剪书名的逻辑。书名保留来源文件去除扩展名后的实际名称。

保留九词簇基础统计，是为了兼顾既有明确用途；保留共享 PDF 文本提取，避免复制另一套 PDF 处理逻辑。新知识资产与旧统计保持独立版本，禁止以旧统计降级覆盖知识资产。未修改用户原有发布清单改动。

本批没有新增外部依赖或复制第三方源码，项目未直接调用模型 API。研究仅用于设计取舍，分块、证据校验和产物生成均在本项目自行实现。

## 未完成范围

项目直接 API / 本地模型自动执行、完整长书自动处理、限流和费用预算、逐块恢复、增量语义重炼、自动别名候选审阅、统一 Web/MCP 书籍入口、EPUB/OCR、故事时间专用模型，以及标准世界书和角色扮演卡格式导出仍未完成。

宿主 AI 需要实际阅读、维护人物身份并整理分析。完整块声明只能证明提交者声明覆盖全部块；逐字来源正确只能证明引文存在。语义判断、人物话语是否可靠和隐喻解释是否成立，仍需阅读审阅。
