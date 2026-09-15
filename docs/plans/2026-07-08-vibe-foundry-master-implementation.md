---
project: VibeFoundry
category: master-implementation-plan
source_path: docs/plans/2026-07-08-vibe-foundry-master-implementation.md
status: active
last_updated: 2026-09-08
---

# VibeFoundry 完整实现总文档

> **全局历史契约说明（2026-09-01）：** 本文在此日期以前的里程碑中出现的源项目 `.vibe-foundry/...` 路径与命令输出均为历史实施记录，已被 central-only 集中资产库契约取代。当前只读写集中资产库（默认 `~/.vibe-foundry/library`），不读写源项目隐藏目录；后文历史记录不构成当前实现要求。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement each milestone task-by-task.

**Goal:** 将 VibeFoundry 从当前 Milestone 1 推进为完整的资产炼化系统，覆盖工程资产、业务资产、产品设计资产和文化隐喻资产，并通过 CLI、Skill、MCP 和 Plugin 逐步交付。

**Architecture:** VibeFoundry 采用本地优先的分层架构。CLI 负责资产炼化和资产包输出，schema 负责稳定协议，analyzer 负责资产识别，writer 负责报告输出，Skill/MCP/Plugin 负责 agent 接入，后续 Dashboard 和知识输入能力在核心协议稳定后再实现。项目资产统一写入集中资产库：显式 `assetLibraryRoot` 优先，其次读取 `VIBE_FOUNDRY_LIBRARY_ROOT`，未设置时使用当前用户主目录下的 `.vibe-foundry/library`；CLI、Web、MCP、书籍炼化和验证脚本共享同一解析规则。

**Tech Stack:** Node.js `>=22.18.0 <23` 或 `>=24.11.0`、原生 ESM、Node test runner、TypeScript 源码风格；依赖变更继续通过计划或 ADR 记录。

---

## 1. 当前状态

2026-09-15：[可见组件预览与源调用场景](2026-09-15-preview-visible-scenarios.md)：滚动按需加载、真实父组件场景与入参说明。

2026-09-15 双版本增量：[Vue 2 / Vue 3 组件预览](2026-09-15-vue-dual-preview.md)。按源项目已安装版本支持 Vue 2.6、2.7、3，使用隔离工具链，不升级源项目。

2026-09-15 预览增量：[组件预览修复与提速](2026-09-15-preview-reliability-and-speed.md)。组件列表首批真实缩略预览、本地固定构建工具和有限并行，替代首次点击才准备工具的流程。

2026-09-15 增量：[Web 本地选择与炼化](2026-09-15-web-local-import.md)。Web 增加用户显式触发的集中库写入，沿用 CLI 分析器；普通浏览保持只读。

### 1.1 已完成

Milestone 1–10 已完成；以下列出起步基础，后文各里程碑保留对应交付与历史验收。书籍、源码分析和预览缓存已有增量实现，实机校准尚未完成全链路。

起步基础：

- Git 仓库初始化。
- 项目骨架建立。
- 最小 CLI：`node dist/cli.js distill <project-root>`。
- 通用资产 schema：
  - `component`
  - `service`
  - `business-pattern`
  - `page-pattern`
  - `design-token`
  - `concept`
  - `metaphor`
- 最小输出写入集中资产包目录，而不是源项目内的 `.vibe-foundry/`：
  - `asset-manifest.json`
  - `service-catalog.json`
  - `concept-assets.json`
- 验证命令：
  - `npm test`
  - `npm run build`

### 1.2 当前限制

- 工程项目、短笔记和书籍已有炼化入口；尚无统一的任意信息输入流程。
- 业务和产品模式主要由关键词与规则生成，尚未还原完整业务调用链、接口输入输出和项目特定设计决策。
- 文化隐喻目前依赖有限规则，不具备任意文化材料的语义理解能力。
- 书籍基础统计仍限定于 9 组词簇；新增宿主 AI 分块阅读、分析导入与五类知识资产/离线关系图。项目直接模型执行及统一 Web/MCP 书籍消费尚未接入，见 §16 当前计划。
- 源项目实机校准只实现协议、路由/定位和源会话管理，计划 Task 4–9 尚未落地。
- 当前复用校验主要检查资产是否存在，尚未验证资产装配到目标任务后的效果。
- 完整 MVP 收口不代表上述增量完成；实际状态以 [2026-09-08 审计](../reports/2026-09-08-project-capability-audit.md) 和对应阶段计划为准。

### 1.3 当前集中资产库契约

- `projectRoot` 永远表示解析后的源码工程绝对路径。
- `assetPackageDir` 和命令返回的 `outputDir` 永远表示集中库中的生成目录。
- Web、MCP 和 Skill 等当前消费者只读取集中资产库，不再读取源项目 `.vibe-foundry/`，也不保留双路径兜底。
- 集中资产库包含本机绝对路径，仅用于本地回查，不应提交或直接分享。

## 2. 完整产品目标

2026-09-08 用户明确长期愿景：“炼化一切”，将所有信息资产转变为可供 AI 和人使用的“装甲”。追溯、检索与复用是基础，最终价值还在于使用者能借助产物执行任务、运用方法或形成作品。具体能力包协议、装配方式和效果验收尚待后续计划定义，不应把现有资产目录视为已经完成这一愿景。

VibeFoundry 的完整目标是：

> 从代码、业务流程、产品方案和文化材料中炼化可复用资产，让 AI 在后续开发、产品设计和创意构思中调用。

完整产品应支持四类资产：

1. **工程资产**
   - 前端组件、页面模式、后端接口、服务模块、测试模板。

2. **业务资产**
   - 登录/注册、权限、计费、邀请、审核、通知、上传、工作流。

3. **产品设计资产**
   - onboarding、价格页、空状态、转化路径、用户激励、Dashboard 信息架构。

4. **文化隐喻资产**
   - 书籍、文明、神话、历史、哲学、品牌材料中的隐喻、原型、命名体系、视觉母题和世界观结构。

## 3. 总体排期

以下排期从 Milestone 1 完成后开始估算，按 1 名开发者全职节奏规划。每个阶段都必须以文档、测试和可运行验证收口。

| 阶段 | 周期 | 目标 | 状态 |
| --- | --- | --- | --- |
| M1 | 已完成 | CLI 骨架、通用 schema、最小输出 | Done |
| M2 | 第 1-2 周 | 工程资产识别：组件、服务、业务入口 | Done |
| M3 | 第 3 周 | tokens、页面模式、业务模式总结 | Done |
| M4 | 第 4 周 | 报告系统和 agent rules | Done |
| M5 | 第 5 周 | Codex Skill 和本地工作流接入 | Done |
| M6 | 第 6 周 | MCP 只读资产服务 | Done |
| M7 | 第 7 周 | Codex Plugin 打包和本地 marketplace | Done |
| M8 | 第 8-9 周 | 产品设计资产炼化 | Done |
| M9 | 第 10-11 周 | 文化隐喻资产和 metaphor pack | Done |
| M10 | 第 12 周 | 完整 MVP 收口、示例、文档和发布检查 | Done |

## 4. Milestone 2：工程资产识别

### 4.1 目标

让 VibeFoundry 能从真实项目中识别基础工程资产，而不是只输出空结构。

### 4.2 交付物

- `src/analyzers/component-analyzer.ts`
- `src/analyzers/service-analyzer.ts`
- `src/analyzers/business-entrypoint-detector.ts`
- `tests/analyzers/component-analyzer.test.mjs`
- `tests/analyzers/service-analyzer.test.mjs`
- `tests/analyzers/business-entrypoint-detector.test.mjs`
- 更新 `.vibe-foundry/component-catalog.json`
- 更新 `.vibe-foundry/service-catalog.json`

### 4.3 实现细节

组件识别：

- 扫描 `src/components`、`components`。
- 识别 `.tsx`、`.jsx` 文件。
- 从文件名推断组件名。
- 识别基础 UI 组件、组合组件、页面级组件。
- 输出 `component` 资产。

服务识别：

- 扫描 `src/app/api`、`app/api`、`pages/api`、`routes`、`server`、`services`。
- 识别 route handler、service function、middleware。
- 从路径和关键词识别业务域：
  - auth
  - user
  - billing
  - upload
  - notification
  - permission

业务入口识别：

- `login`
- `register`
- `logout`
- `session`
- `password`
- `permission`
- `role`
- `subscription`
- `invite`

### 4.4 验收标准

- fixture 中的 `Button.tsx` 被识别为 component。
- fixture 中的 `src/app/api/auth/register/route.ts` 被识别为 service。
- `asset-manifest.json` 中 `components` 和 `services` 数量正确。
- `component-catalog.json` 和 `service-catalog.json` 输出稳定 JSON。

### 4.5 验证命令

```bash
npm test
npm run build
node dist/cli.js distill <fixture-project>
```

### 4.6 完成记录

完成日期：2026-07-08。

完成内容：

- 新增 component analyzer，识别 `src/components`、`components` 下的 `.tsx` / `.jsx` 组件候选。
- 新增 business entrypoint detector，识别登录、注册、会话、权限、角色、订阅等业务入口。
- 新增 service analyzer，识别 API routes 和 service 目录中的服务资产。
- `distill` 输出新增 `.vibe-foundry/component-catalog.json`。
- `asset-manifest.json` 正确统计 components 和 services。

验证结果：

- `npm test`：8 个测试全部通过。
- `npm run build`：通过。
- CLI fixture：成功输出 `Button` component 和 `auth.register` service。

## 5. Milestone 3：tokens、页面模式和业务模式

### 5.1 目标

从工程项目中提炼设计语言和业务流程，使资产包不只是文件索引，而能解释复用价值。

### 5.2 交付物

- `src/analyzers/token-extractor.ts`
- `src/analyzers/page-pattern-summarizer.ts`
- `src/analyzers/business-pattern-summarizer.ts`
- `tests/analyzers/token-extractor.test.mjs`
- `tests/analyzers/page-pattern-summarizer.test.mjs`
- `tests/analyzers/business-pattern-summarizer.test.mjs`
- `.vibe-foundry/tokens.json`
- `.vibe-foundry/page-patterns.md`
- `.vibe-foundry/business-patterns.md`

### 5.3 实现细节

tokens 提取：

- 从 `className` 字符串中提取 Tailwind class。
- 统计颜色、字号、间距、圆角、阴影。
- 保留来源文件和出现次数。

页面模式：

- 从 `app`、`pages`、`routes` 推断页面类型。
- 支持登录页、Dashboard、表格页、详情页、设置页。

业务模式：

- 从 service assets 汇总登录/注册/权限/计费等流程。
- 输出流程步骤、依赖、风险、安全约束和复用边界。

### 5.4 验收标准

- tokens 可覆盖 fixture 中的颜色、间距和圆角。
- 页面 fixture 能输出 `page-patterns.md`。
- auth fixture 能输出 `business-patterns.md`。

### 5.5 完成记录

完成日期：2026-07-08。

完成内容：

- 新增 token extractor，从 `className` 提取颜色、间距、圆角、阴影和字号 tokens。
- 新增 page pattern summarizer，从页面路径总结 login、dashboard、table、detail、settings 等页面模式。
- 新增 business pattern summarizer，从 service assets 汇总 auth、billing、permission 等业务流程。
- `distill` 输出新增：
  - `.vibe-foundry/tokens.json`
  - `.vibe-foundry/page-patterns.md`
  - `.vibe-foundry/business-patterns.md`
- `asset-manifest.json` 正确统计 tokens、pagePatterns 和 businessPatterns。

验证结果：

- `npm test`：11 个测试全部通过。
- `npm run build`：通过。
- CLI fixture：成功输出 4 个 tokens、2 个 page patterns 和 1 个 auth business pattern。

## 6. Milestone 4：报告系统和 agent rules

### 6.1 目标

让资产包可被人读，也可被 agent 用。

### 6.2 交付物

- `src/writers/report-writer.ts`
- `src/writers/agent-rules-writer.ts`
- `.vibe-foundry/reuse-report.md`
- `.vibe-foundry/agent-rules.md`

### 6.3 报告内容

`reuse-report.md` 必须包含：

- 高价值组件资产。
- 高价值服务资产。
- 业务流程复用建议。
- tokens 摘要。
- 风险和暂缓项。
- 下一步抽象建议。

`agent-rules.md` 必须包含：

- 使用资产前先查 `.vibe-foundry/`。
- 新增组件优先复用已有 tokens。
- 新增后端能力优先检查 service catalog。
- 登录/注册/权限相关实现必须保留安全约束。
- 文化隐喻资产只能作为设计参考，不保存大段版权原文。

### 6.4 验收标准

- 报告内容稳定。
- agent rules 能直接被复制到 `AGENTS.md` 或 IDE rules。
- `npm test` 覆盖 Markdown 输出关键段落。

### 6.5 完成记录

完成日期：2026-07-08。

完成内容：

- 新增 `report-writer`，生成 `.vibe-foundry/reuse-report.md`。
- 新增 `agent-rules-writer`，生成 `.vibe-foundry/agent-rules.md`。
- `reuse-report.md` 覆盖高价值组件、高价值服务、业务流程复用建议、tokens 摘要、风险和下一步抽象建议。
- `agent-rules.md` 覆盖资产查找、tokens 复用、service catalog 检查、登录/注册/权限约束和文化隐喻版权边界。

验证结果：

- `npm test`：13 个测试全部通过。
- `npm run build`：通过。
- CLI fixture：成功输出 `reuse-report.md` 和 `agent-rules.md`，报告包含 `Button` 和 `auth.register`，规则包含 `service-catalog.json` 和“不保存大段版权原文”。

## 7. Milestone 5：Codex Skill

### 7.1 目标

让 Codex 知道何时使用 VibeFoundry，以及如何执行资产炼化流程。

### 7.2 交付物

- `.agents/skills/vibe-foundry/SKILL.md`
- `docs/runbooks/use-vibe-foundry-skill.md`

### 7.3 Skill 行为

Skill 应指导 agent：

1. 阅读 `docs/README.md`。
2. 运行 `npm test` 确认工具状态。
3. 运行 `node dist/cli.js distill .`。
4. 读取 `.vibe-foundry/reuse-report.md`。
5. 给出下一步资产复用建议。

### 7.4 验收标准

- Codex 能发现并加载 skill。
- Skill 不会自动修改源码。
- Skill 会先读文档，再执行命令。

### 7.5 完成记录

完成日期：2026-07-08。

完成内容：

- 新增 `.agents/skills/vibe-foundry/SKILL.md`，定义 Codex Skill 的触发场景、固定执行流程、源码只读边界和输出建议格式。
- 新增 `docs/runbooks/use-vibe-foundry-skill.md`，说明本地路径、执行流程、验证标准和故障处理。
- 新增 `tests/skills/vibe-foundry-skill.test.mjs`，用静态测试覆盖 skill metadata、固定命令、报告读取和只读约束。

验证结果：

- RED：新增测试先因 `.agents/skills/vibe-foundry/SKILL.md` 和 `docs/runbooks/use-vibe-foundry-skill.md` 缺失失败。
- GREEN：`npm test` 通过，16 个测试全部通过。
- `npm run build`：通过。
- `node dist/cli.js distill .`：成功刷新 `.vibe-foundry/`，并生成 `.vibe-foundry/reuse-report.md`。

## 8. Milestone 6：MCP 只读资产服务

### 8.1 目标

让 AI agent 在新项目中通过 MCP 查询 VibeFoundry 资产。

MCP 是 Model Context Protocol，中文可理解为“模型上下文协议”。

### 8.2 交付物

- `src/mcp/server.ts`
- `tests/mcp/server.test.mjs`
- `docs/runbooks/use-vibe-foundry-mcp.md`

### 8.3 工具列表

- `list_assets`
- `get_component`
- `get_service`
- `search_tokens`
- `search_business_patterns`
- `search_concept_assets`
- `get_agent_rules`
- `validate_asset_usage`

### 8.4 约束

- 第一版 MCP 只读。
- 不修改用户项目文件。
- 以下两项是 2026-07-08 的历史实现约束，已被 2026-09-01 的 central-only 契约取代，不再作为当前行为依据：
  - 历史约束：不重新分析源码，只读取源项目 `.vibe-foundry/`。
  - 历史约束：源项目 `.vibe-foundry/` 缺失时返回明确错误。
- 当前 MCP 只从集中资产库读取项目资产包；不读取源项目 `.vibe-foundry/`，集中资产包缺失时返回明确错误，且不回退到源项目目录。

### 8.5 验收标准

- MCP 工具对 fixture 资产包返回稳定 JSON。
- 只读约束有测试。
- 错误信息可指导用户运行 `vibe-foundry distill .`。

### 8.6 完成记录

完成日期：2026-07-08。

完成内容：

- 新增 `src/mcp/server.ts`，实现零依赖 MCP 只读工具核心层和最小 stdio JSON-RPC 入口。
- stdio 入口遵循 MCP `2025-06-18`，只接收和输出 UTF-8 换行分隔 JSON；`stdout` 仅承载协议消息，不保留旧头部帧兼容。
- 支持 8 个工具：
  - `list_assets`
  - `get_component`
  - `get_service`
  - `search_tokens`
  - `search_business_patterns`
  - `search_concept_assets`
  - `get_agent_rules`
  - `validate_asset_usage`
- 新增 `tests/mcp/server.test.mjs`，覆盖工具发现、资产查询、缺失 `.vibe-foundry/` 错误提示和只读约束。
- 新增 `docs/runbooks/use-vibe-foundry-mcp.md`，说明本地调用、只读边界、验证命令和后续 transport 扩展方式。

验证结果：

- RED：MCP 测试先因 `dist/mcp/server.js` 缺失失败；runbook 测试先因 `docs/runbooks/use-vibe-foundry-mcp.md` 缺失失败。
- GREEN：`npm test` 通过，21 个测试全部通过。
- `npm run build`：通过。
- `node dist/cli.js distill .`：成功刷新 `.vibe-foundry/`。
- MCP 手动验证：`listVibeFoundryTools()` 返回 8 个工具，`callVibeFoundryTool(".", "list_assets")` 返回 `sourceProject: "vibe-foundry"` 且 `isError: false`。
- JSON-RPC 验证：`handleMcpRequest()` 可处理 `tools/list` 和 `tools/call`。
- 真实子进程验证：覆盖 `initialize`、无响应的 `notifications/initialized`、`tools/list` 和中文参数 `tools/call`，并校验每一行 `stdout` 都是 JSON-RPC 消息。

## 9. Milestone 7：Codex Plugin

### 9.1 目标

把 CLI、Skill、MCP 配置和使用说明打包成 Codex 可安装工作流。

### 9.2 交付物

- `plugins/vibe-foundry/.codex-plugin/plugin.json`
- `plugins/vibe-foundry/skills/vibe-foundry/SKILL.md`
- `.agents/plugins/marketplace.json`
- `docs/runbooks/install-vibe-foundry-plugin.md`

### 9.3 验收标准

- 本地 marketplace 能发现插件。
- 插件包含 Skill。
- 插件能声明 MCP 配置。
- 文档说明如何安装、启用和验证。

### 9.4 完成记录

完成日期：2026-07-08。

完成内容：

- 使用 `plugin-creator` scaffold 创建 `plugins/vibe-foundry/.codex-plugin/plugin.json`。
- 新增 `plugins/vibe-foundry/skills/vibe-foundry/SKILL.md`，打包 VibeFoundry Skill。
- 新增 `plugins/vibe-foundry/.mcp.json`，声明 `vibe-foundry` MCP server 配置并指向 `dist/mcp/server.js`。
- 新增 `.agents/plugins/marketplace.json`，提供 repo-local marketplace entry。
- 新增 `docs/runbooks/install-vibe-foundry-plugin.md`，说明安装、启用、验证和当前边界。
- 新增 `tests/plugins/vibe-foundry-plugin.test.mjs`，覆盖 manifest、skill、MCP 配置、marketplace 和安装文档。

验证结果：

- RED：插件测试先因 manifest、插件 skill、`.mcp.json`、marketplace 和安装文档缺失失败。
- GREEN：`npm test` 通过，26 个测试全部通过。
- `npm run build`：通过。
- `python <plugin-creator-skill-root>/scripts/validate_plugin.py plugins/vibe-foundry`：通过。

## 10. Milestone 8：产品设计资产炼化

### 10.1 目标

让 VibeFoundry 能从项目和文档中提炼产品设计模式。

### 10.2 交付物

- `src/analyzers/product-pattern-analyzer.ts`
- `src/schema/concept-assets.ts`
- `tests/analyzers/product-pattern-analyzer.test.mjs`
- `.vibe-foundry/concept-assets.json` 非空输出

### 10.3 支持的产品模式

- onboarding
- pricing
- dashboard
- settings
- invite
- content creation
- empty state
- upgrade prompt
- user activation

### 10.4 验收标准

- fixture 中的页面或 Markdown PRD 可生成 product pattern。
- `concept-assets.json` 可被 MCP 查询。
- 输出包含适用场景、来源、设计建议和限制。

### 10.5 完成记录

完成日期：2026-07-08。

完成内容：

- 新增 `src/schema/concept-assets.ts`，定义产品设计资产的稳定结构和支持的 product pattern 类型。
- 新增 `src/analyzers/product-pattern-analyzer.ts`，从页面文件和 Markdown 文档中识别产品设计模式。
- `distillProject` 接入产品设计资产炼化，读取页面和 `docs/` 文档后写入 `.vibe-foundry/concept-assets.json`。
- 支持的产品模式包括 onboarding、pricing、dashboard、settings、invite、content creation、empty state、upgrade prompt 和 user activation。
- MCP `search_concept_assets` 可查询生成后的 concept assets，并优先返回名称或 patternType 精确命中的结果。

验证结果：

- RED：新增测试先因 `dist/analyzers/product-pattern-analyzer.js` 缺失失败，distill-flow 先因 `conceptAssets` 为空失败。
- GREEN：`npm test` 通过，29 个测试全部通过。
- `npm run build`：通过。
- `node dist/cli.js distill .`：成功刷新 `.vibe-foundry/`。
- 当前仓库运行验证：`.vibe-foundry/concept-assets.json` 生成 9 个 concept assets，MCP `search_concept_assets` 可查询 dashboard 相关资产。

## 11. Milestone 9：文化隐喻资产和 metaphor pack

### 11.1 目标

支持从用户提供的自有笔记、摘要或允许处理的材料中提炼隐喻资产。

### 11.2 版权边界

- 不保存整本书。
- 不保存大段版权原文。
- 只保存结构化洞察、短引用、来源引用、用户自有笔记和设计建议。

### 11.3 交付物

- `src/analyzers/metaphor-distiller.ts`
- `src/schema/metaphor-pack.ts`
- `tests/analyzers/metaphor-distiller.test.mjs`
- `.vibe-foundry/metaphor-packs/<source>.json`
- `docs/runbooks/create-metaphor-pack.md`

### 11.4 metaphor pack 字段

- `source`
- `sourceType`
- `coreMetaphors`
- `archetypes`
- `namingSystem`
- `visualMotifs`
- `interactionIdeas`
- `emotionalTone`
- `productApplications`
- `sourceReferences`
- `copyrightNotes`

### 11.5 验收标准

- 可从短文本 fixture 生成 metaphor pack。
- 输出不包含长段原文。
- agent 能根据 metaphor pack 生成产品命名、交互和视觉参考建议。

### 11.6 完成记录

完成日期：2026-07-08。

完成内容：

- 新增 `src/schema/metaphor-pack.ts`，定义 metaphor pack 字段和来源 slug 工具。
- 新增 `src/analyzers/metaphor-distiller.ts`，从用户短笔记中提炼核心隐喻、原型、命名体系、视觉母题、交互建议、情绪基调和产品应用。
- `distillProject` 接入 `docs/metaphors/` 输入目录，支持 `.md`、`.mdx` 和 `.txt`。
- `writeAssetPackage` 输出 `.vibe-foundry/metaphor-packs/<source>.json`，并在 `.vibe-foundry/concept-assets.json` 汇总 `metaphorPacks`。
- 新增 `docs/runbooks/create-metaphor-pack.md`，说明输入目录、来源边界、版权约束、输出字段和验证方式。

验证结果：

- RED：新增测试先因 `dist/analyzers/metaphor-distiller.js` 缺失失败，distill-flow 先因 `.vibe-foundry/metaphor-packs/memory-palace.json` 缺失失败，runbook 测试先因 `docs/runbooks/create-metaphor-pack.md` 缺失失败。
- GREEN：`npm test` 通过，33 个测试全部通过。
- `npm run build`：通过。
- 短文本 fixture 验证：成功输出 `.vibe-foundry/metaphor-packs/memory-palace.json`，包含 2 个 core metaphors，版权说明包含“不保存整本书，不保存长段原文”，MCP `search_concept_assets` 可查询 metaphor pack。

## 12. Milestone 10：完整 MVP 收口

### 12.1 目标

让新用户能在 10 分钟内理解、安装、运行和验证 VibeFoundry。

### 12.2 交付物

- `README.md`
- `docs/runbooks/quickstart.md`
- `docs/reports/mvp-release-checklist.md`
- 示例 fixture 项目。
- 完整验证脚本。

### 12.3 验收标准

- `npm test` 通过。
- `npm run build` 通过。
- `node dist/cli.js distill <fixture>` 通过。
- Skill 文档可用。
- MCP 文档可用。
- Plugin 文档可用。
- 已知限制写清楚。

### 12.4 完成记录

完成日期：2026-07-08。

完成内容：

- 新增 `examples/fixture-project`，覆盖组件、后端注册接口、Dashboard 页面、产品设计文档和 metaphor 短笔记。
- 新增 `docs/runbooks/quickstart.md`，提供 10 分钟内完成构建、fixture distill、MCP 查询和插件检查的路径。
- 新增 `docs/reports/mvp-release-checklist.md`，记录验证命令、必需交付物、MVP 覆盖范围和已知限制。
- 新增 `scripts/verify-mvp.mjs`，串联 `npm test`、`npm run build`、fixture distill、插件校验、MCP 查询和关键产物检查。
- 更新 `README.md` 和 `docs/README.md`，将 Quickstart、release checklist 和验证脚本作为 MVP 入口。

验证结果：

- RED：MVP 测试先因 quickstart、release checklist、example fixture 和 verify script 缺失失败。
- GREEN：`npm test` 通过，37 个测试全部通过。
- `npm run build`：通过。
- `node dist/cli.js distill examples/fixture-project`：通过。
- `python <plugin-creator-skill-root>/scripts/validate_plugin.py plugins/vibe-foundry`：通过。
- `node scripts/verify-mvp.mjs`：通过，输出 `MVP verification passed.`。

## 13. 文档驱动开发流程

每个 Milestone 开始前：

1. 阅读 `docs/README.md`。
2. 阅读本文档对应 Milestone。
3. 如果阶段目标变化，先更新本文档。
4. 写失败测试。
5. 实现最小代码。
6. 运行验证。
7. 更新文档和阶段状态。

每个 Milestone 完成前：

1. 对照交付物检查文件。
2. 对照验收标准检查行为。
3. 运行验证命令。
4. 记录剩余风险。
5. 给出下一阶段入口。

## 14. 风险控制

### 14.1 范围膨胀

风险：同时做 CLI、MCP、Plugin、SaaS、书籍炼化会拖垮 MVP。

控制：

- 按 Milestone 顺序推进。
- 不跳过 CLI 资产协议。
- 每个阶段只交付一个主能力。

### 14.2 资产误判

风险：把一次性代码或一次性产品想法误判为通用资产。

控制：

- 评分标记为 heuristic，中文可理解为“启发式判断”。
- 每个资产保留来源文件、适用场景和限制。
- 报告中明确风险。

### 14.3 版权和文化误读

风险：文化隐喻资产可能误读来源材料或保存不该保存的文本。

控制：

- 只处理用户提供且有权使用的材料。
- 不保存长段原文。
- 输出设计洞察和来源引用。
- 重要文化材料应加入人工审查。

### 14.4 依赖复杂度

风险：过早引入 AST、LLM、向量库、数据库导致项目复杂化。

控制：

- 零依赖优先。
- 需要依赖时先写 ADR。
- 每个依赖必须服务明确 Milestone。

## 15. 下一步执行建议

当前状态：

> Milestone 10 已完成，VibeFoundry MVP 已按本文档收口；后续增量的真实完成度见 §1.2 和 2026-09-08 审计。

后续建议：

```text
优先接通已有材料的消费与任务使用流程，再扩展输入种类；实机校准按现有 Task 4–9 继续。涉及新输入、能力包协议或模型依赖时先新增计划或 ADR。
```

## 16. 后续增量：书籍炼化

2026-07-12 按 ADR-002 新增确定性本地书籍炼化器。`distill-book` 支持 PDF、TXT、Markdown，生成章节、概念簇、跨章节关系与来源定位；不保存全文，不依赖外部 LLM。

2026-09-08 用户要求自行开发世界观、角色卡、设定、概念与隐喻网络，参考开源取长补短。按 [ADR-006](../adr/006-book-knowledge-assets.md) 和[书籍知识资产计划](2026-09-08-book-knowledge-assets.md)推进宿主 AI 阅读、来源校验和资产输出；不能将原词表统计、工作文件准备视为已完成自动语义炼化。

该宿主 AI 首版已完成：五类知识卡片与离线有向关系图、原文证据校验、准备/导入 CLI、输入防覆盖与旧统计拒绝降级。最终构建、375 项测试、工程 CLI/MCP 与书籍 CLI、浏览器检查通过；范围和后续自动化缺口见[首版验收](../reports/2026-09-08-book-knowledge-validation.md)。

## 17. 后续增量：前端源码分析底座

2026-07-14 启动前端源码分析底座改进，以 `docs/plans/2026-07-14-source-analysis-foundation-design.md` 为设计依据，以 `docs/plans/2026-07-14-source-analysis-foundation.md` 为实施与验收入口。

本增量替换正则组件调用解析，建立 AST 源码索引、多场景证据、组件分类、严格预览状态、运行环境需求和结构化设计 Token。不能静态证明的数据保持未解析或阻断，不生成组件名专用业务 fallback。

## 18. 后续增量：组件预览动作缓存

2026-07-14 按 `docs/adr/003-preview-action-cache.md` 启动预览缓存底座改进，以 `docs/plans/2026-07-14-preview-action-cache.md` 为实施与验收入口。

本增量把静态分析契约、构建动作、不可变产物和浏览器验证结果分离。目标是服务重启零构建、重复 distill 稳定复用、同动作跨进程单飞、构建失败可缓存、产物损坏可检测，并为后续远程缓存保留同一 Action/CAS 协议。

## 19. 后续增量：源项目实机校准与预览保真度

2026-07-14 按 `docs/adr/004-source-runtime-fidelity-calibration.md` 启动预览保真度改进，以 `docs/plans/2026-07-14-source-runtime-fidelity-design.md` 为设计依据。

本增量采用静态快速通道与实机校准通道。第一阶段只处理无需登录的公开页面，以项目级短生命周期源服务和单浏览器会话批量采集真实组件实例；通过运行、几何、视觉和结构四层比较给出可解释的 `calibrated/drifted/static-only` 状态。不能唯一定位、需要鉴权或依赖业务数据的场景显式阻断，不生成假基准。

## 20. 后续增量：资产真实性与“装甲”愿景审计

2026-09-08 按 [资产真实性修复计划](2026-09-08-asset-integrity-and-capability-audit.md) 修复文化材料默认虚构、输出覆盖、组件身份混淆和书籍漏识别，并同步当前状态。该批次不新增通用模型、统一输入或装甲协议；这些能力按[现状审计](../reports/2026-09-08-project-capability-audit.md)列为后续缺口。

## 21. 后续增量：组件还原提示词与炼化提速

当前用户纠正：提示词应帮助产品人员把组件效果表达为专业设计需求。源码打包式正文已不是目标；以[效果提示词计划](2026-09-08-component-effect-prompts.md)为当前实施入口，保留下方上一轮实现和验证记录。

该纠正已完成：默认按布局、视觉、动效、交互详细分项，提示词记录升级为 `0.2.0`；319 项测试与 CLI/MCP 完整验证通过，见[当前验收记录](../reports/2026-09-08-component-effect-prompt-validation.md)。

用户进一步要求前端组件尽量还原、炼化快，并生成可供其他 AI 生成组件的提示词。按 [ADR-005](../adr/005-component-reconstruction-prompts.md) 与[实施计划](2026-09-08-component-reconstruction-and-speed.md)，共享源码分析和内容缓存，输出独立 `component-prompts/<component-path-hash>.json`，通过 Web 按需查看/复制以及 MCP `get_component_prompt({filePath})` 交付。

提示词携带真实源码、样式、场景和缺失材料清单；静态分析不保证像素一致，图片/字体等附件和动态上下文仍可能需要补充。该增量不替代实机校准 Task 4–9。

2026-09-08 本批已完成，MCP 当前共 9 个工具；构建、269 个测试及 CLI/MCP 验证通过。多组件基准、清理范围和剩余限制见[验收记录](../reports/2026-09-08-component-reconstruction-validation.md)。
