---
project: VibeFoundry
category: implementation-plan
source_path: docs/plans/2026-09-08-book-knowledge-assets.md
status: completed
last_updated: 2026-09-08
---

# 书籍世界观、角色卡与概念网络实现计划

## 目标

用户要求从书籍至少炼化世界观、人物角色卡、设定、隐喻与概念网络，并明确要求学习开源项目后自行开发、取长补短。本批自行实现分块、证据校验、资产协议和使用出口，不复制或集成整套开源应用，不把九词簇统计称为语义分析。

交付实际闭环：准备分块任务 → 宿主 AI 阅读并统一整理 → 本项目校验来源与关联 → 输出人读卡片、AI 资产与可浏览关系图。独立 API / 本地模型自动执行尚待接入选择；文件准备不等于自动理解整本书。

本批宿主 AI 首版已完成，验证结果见[验收报告](../reports/2026-09-08-book-knowledge-validation.md)。完成状态仅覆盖本计划中的准备、严格导入、五类资产与离线关系图；文末“本批之外”的自动化与接入能力仍未完成。

## 单一数据契约

`src/schema/book-knowledge.ts` 负责校验严格的分析 JSON：

```text
schemaVersion: "0.2.0"
sourceDigest: 规范化提取全文 SHA-256
processedChunkIds: 实际阅读完的全部块 ID 数组
entities: [{id, type, name, aliases, facets}]
  type: worldview | character | setting | concept | metaphor
  facets: [{name, value, basis, evidence}]
    basis: explicit | interpretation
    evidence: [{unitId, quote}]
relations: [{id, from, to, type, description, basis, evidence}]
uncertainties: [{description, evidence}]
```

- 只接受这套字段。ID 为书内稳定字符串，不以中文名称推断身份。同名不同人保留不同 ID；宿主 AI 分批维护实体登记表并明确归并别名，程序不凭同名自动合并。别名依据保存在相应 facet 中。
- 每个实体至少一条 facet，每条 facet / 关系至少一条证据；某类内容缺失则空集合，不编造年龄、性格或世界规则。
- `explicit` 为分析者认定的原文明确表达，`interpretation` 为解读；两者不是程序判真的等级。人物话语需注明陈述者，不能自动升级为世界定律。前后变化保留多条事实和依据，不最后一次覆盖。
- 证据采用 unitId + 不超过 240 个 Unicode 码点的短引文；要求单元内唯一逐字匹配。程序解析行号/偏移，拒绝错误、歧义、缺失或过期来源。锚点准确只证明引文存在，不证明结论正确。
- 关系有方向、自然语言类型，不由同章共现补边；`uncertainties` 表达未解共指、冲突和解读限制。
- processedChunkIds 必须完整且无重复/陌生 ID；只是提交者声明的阅读覆盖，不是模型准确率。
- 校验输出在分析结构上增加 `kind:"book-knowledge"`、`title`、`sourcePath`、`documentStats:{unitCount,chunkCount,characterCount}`；证据变为 `{unitId,quote,startOffset,endOffset,startLine,endLine}`。旧 0.1 词表统计不自动升为 0.2。

## 文本契约

`createBookDocument(text, metadata)` 位于新 `src/analyzers/book-document.ts`。CRLF / CR 规范化为 LF，其余正文不改；摘要针对规范化全文。偏移为 JavaScript UTF-16 代码单元、零起点、右端不含，行号从 1 起。

```text
document: {schemaVersion:"0.1.0",title,sourcePath,sourceDigest,
           offsetUnit:"utf16",characterCount,units,chunks}
unit: {id,text,startOffset,endOffset,startLine,endLine}
chunk: {id,unitIds,characterCount}
```

逐非空行建立单元；长行拆成最多 2000 个 UTF-16 单元且不拆代理对的片段。空行保留坐标但不成为证据单元。连续单元按 12000 字符上限分块（不是 token 数）。单元 ID 按顺序定位，文档版本由摘要隔离。空正文明确报错。原文只在本地阅读工作材料中出现，最终资产不保存全文。

证据不依赖目前存在目录歧义的章节解析器；本批保留可核验行号，不猜章节/页码。PDF 复用现有 pdftotext，无 OCR。

## 实施步骤

各步骤先写失败测试并运行，再实现；由根代理统一构建，避免并行清空 dist。

1. **文本任务。** 新增 `src/analyzers/book-document.ts`、`tests/analyzers/book-document.test.mjs`；覆盖空文本、中文/表情、换行坐标、长行分割、分块无漏字、摘要失效。导出已有 `extractBookText`，不重复 PDF 实现。
2. **结构校验。** 新增 `src/schema/book-knowledge.ts`、`tests/schema/book-knowledge.test.mjs`。`validateBookKnowledge(document, analysis)` 不修改输入，返回定位后的资产。拒绝多余字段、重复 ID、悬空边、错误摘要、不完整覆盖、无依据事实和错误/歧义引文；空实体集有效。同名分人、别名登记、跨章变化与事实/解读均保留。
3. **使用产物。** 新增 `src/writers/book-knowledge-writer.ts`、`tests/writers/book-knowledge-writer.test.mjs`。纯函数 `renderBookKnowledgeFiles(asset)` 返回文件名→正文：`book-report.md`、`worldview.md`、`characters.md`、`settings.md`、`concepts-and-metaphors.md`、`knowledge-network.json`、`knowledge-network.html`。五类卡片展示真实 facets、有向关系与证据。HTML 可离线打开，按类型过滤、选择节点查看依据；必须转义模型/书籍文本，禁止执行插入脚本。图与卡片均来自同一资产。
4. **CLI 闭环。** 新增 `src/analyzers/book-knowledge-workflow.ts` 与对应 tests，修改 `src/cli.ts` 和 CLI tests。`distill-book <book> --prepare <work-dir>` 在必须新建的工作目录写 `book-task.md`、`document.json`、`chunks/<id>.md`。总任务说明逐块阅读、统一 ID、证据、事实/解读、缺项和不得书外补全。`distill-book <book> --analysis <analysis-json>` 重新读取原书，完整校验后才写中央 books 包，失败不得先覆盖原资产。沿用显式 outputDir。两个选项互斥且严格解析；无选项旧入口保留，并说明只是词表统计。
5. **实际验收。** 用自创中文多章节材料和宿主 AI 分析生成五类资产及关系图，跑准备/导入真实 CLI。fixture 只验证协议与产物，不能冒充真实模型准确率。运行 `npm test`（含构建）、实际 CLI 和 `git diff --check`；可用时浏览 HTML 验证点选。
6. **文档与清理。** 补研究、ADR、手册，更新索引、PRD、总计划与旧书籍计划。保留基础统计的明确用途，不自动兼容为语义结果；不复制 PDF 逻辑，不增加臆测模型配置，不遗留失效参数。

## 本批之外

项目直接 API / 本地模型自动执行、限流和费用预算、逐块恢复与增量语义重炼、自动别名候选审阅、统一 Web/MCP 书籍入口、EPUB/OCR、故事时间专用模型、标准世界书/角色扮演卡格式导出。宿主 AI 可以逐块处理长书，但不等同于这些自动化能力。
