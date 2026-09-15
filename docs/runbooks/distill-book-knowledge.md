---
project: VibeFoundry
category: runbook
source_path: docs/runbooks/distill-book-knowledge.md
status: active
last_updated: 2026-09-08
---

# 从书籍炼化世界观、角色卡和知识网络

当前实现由 VibeFoundry 准备阅读材料、校验来源、生成资产，语义阅读和跨块实体归并由当前使用的 AI（如 Codex）执行。不需要另配 API；项目独立运行时尚不会自动调用模型。书籍支持 TXT、Markdown 和可提取文字的 PDF；PDF 需要 pdftotext，扫描件 OCR 与 EPUB 未接入。

## 操作

先构建：

```bash
npm run build
node dist/cli.js distill-book <book-path> --prepare <new-work-dir>
```

替换尖括号参数，带空格的路径使用当前 shell 的引号规则。工作目录必须尚不存在，避免覆盖阅读进度。其中包含 `book-task.md`、`document.json` 和 `chunks/*.md`；这些是含原文的本地工作材料，不是最终分享资产。

交给当前 AI 的任务可直接这样描述：

> 阅读指定工作目录中的 book-task.md，按清单逐块阅读，维护统一实体登记表，提取世界观、角色卡、设定、概念和隐喻及其关系。每条结论附短原文依据，区分原文明示与解读。同名人物不直接合并，传言不当世界规则。全部读完后写出 analysis.json，再用 VibeFoundry 导入校验；未完成的块明确保留为未完成。

完成阅读后运行：

```bash
node dist/cli.js distill-book <book-path> --analysis <analysis-json>
```

程序重新读取原书，核对摘要、完整阅读块声明、字段、身份与关系引用、逐字引文。引文有歧义或错误会明确报错，应让分析者回原文修正；不能使用模糊匹配强行通过。只有完整校验通过才写正式资产。语义正确性仍需要阅读审阅，来源锚点不是判真器。

原书内容改变后，旧分析不能直接导入。当前需要重新准备阅读任务并调整分析；尚无自动逐块缓存或增量模型执行。

## 产物与用途

正式资产写到集中资产库 `books/<book-id>`。资产库根依次采用编程调用的显式 `assetLibraryRoot`、`VIBE_FOUNDRY_LIBRARY_ROOT` 或当前用户主目录下的 `.vibe-foundry/library`；编程调用还支持明确的最终 `outputDir`。

| 文件 | 用途 |
| --- | --- |
| `book-assets.json` | 0.2.0 知识资产与定位后的短引文，供 AI 或程序读取 |
| `book-report.md` | 各类数量、关系、待核对项与来源 |
| `worldview.md` | 世界运行规则、社会制度和价值结构 |
| `characters.md` | 人物身份、动机、特点、能力与限制、关系和变化；按实际提取内容展示 |
| `settings.md` | 地点、组织、物品、能力体系等设定 |
| `concepts-and-metaphors.md` | 概念、具体意象与抽象含义映射，保留解读标签 |
| `knowledge-network.json` | 同一完整资产的网络导出，字段与主资产一致 |
| `knowledge-network.html` | 离线打开的有向关系图，类型筛选、点选看详情和依据 |

图中同名不同 ID 保留为不同节点；实线表示分析者标注的明确表达，虚线表示解读，箭头表示方向。类型筛选只画该类别内部的关系，节点详情仍列出其所有关联。

最终资产不存全文，但有短依据和本机来源路径。准备目录含原文，使用结束后自行删除不再需要的本地工作材料。

## 既有入口与边界

不带选项的 `distill-book` 仍是九词簇基础统计，不能提取通用世界观和人物；已有 0.2.0 知识资产时会拒绝用旧统计覆盖，避免报告与卡片混在两个版本。两个新选项必须单独使用，不能同时传入。

当前交付的是独立书籍文件和离线图，尚未加入现有 Web 资产浏览器或 MCP 工具；未提供标准角色扮演卡、SillyTavern 世界书、整本书自动 API 调用或费用/速度承诺。

## 验证

```bash
npm test
node scripts/verify-book-knowledge.mjs
node scripts/verify-book-knowledge.mjs --output output/book-knowledge
```

最后一个命令在指定目录下保留独立的一次验证产物，输出关系图路径。样例来自仓库自创短篇《雾港》，结构化分析是预先阅读结果，用于验证程序契约、引文、卡片和 CLI，不代表整本长书的模型准确率。

数据契约与后续范围见[实施计划](../plans/2026-09-08-book-knowledge-assets.md)，取舍见[开源研究](../research/2026-09-08-book-knowledge-open-source.md)。
