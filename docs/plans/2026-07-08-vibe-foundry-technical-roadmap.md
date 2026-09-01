# VibeFoundry 技术实现方案与排期

> **历史契约说明（2026-09-01）：** 本文保留用于技术路线追溯；其中源项目内资产目录约定已被 central-only 集中资产库契约取代，不代表当前输出位置。

> 使用 superpowers:writing-plans 思路编写：先定义可执行架构，再拆成可验证阶段，避免一开始把 CLI、MCP、插件、SaaS 全部混在一起。

## 1. 技术目标

VibeFoundry 第一阶段要做成一个本地优先的资产炼化工具。它接收一个已有工程项目目录，扫描源码结构、前端组件、后端接口、业务流程、样式和页面模式，生成 `.vibe-foundry/` 资产包。这个资产包既能让人阅读，也能被 Codex、Cursor、Claude Code 等 AI agent 作为上下文使用。

MVP 不追求自动重构源码，不追求在线协作，也不追求多框架全覆盖。第一版重点是把 React / Next.js / TypeScript / Tailwind 项目中的工程资产分析准，同时轻量识别 Node.js / Next.js API routes 中的登录、注册、认证、权限等常见业务能力，并形成能扩展到产品设计资产和文化隐喻资产的输出协议。

## 2. 推荐技术路线

### 2.1 总体形态

采用四层架构：

1. **CLI 核心层**
   - 命令：`vibe-foundry distill .`
   - 职责：项目扫描、工程资产分析、业务流程识别、tokens 提取、报告生成。
   - 这是 MVP 的核心，不依赖 MCP 或 Codex。

2. **资产包协议层**
   - 输出目录：`.vibe-foundry/`
   - 核心文件：`asset-manifest.json`、`tokens.json`、`component-catalog.json`、`service-catalog.json`、`business-patterns.md`、`concept-assets.json`、`agent-rules.md`、`reuse-report.md`
   - 职责：保证输出稳定、可版本化、可被其他工具消费。

3. **Agent 接入层**
   - Codex Skill：描述如何运行炼化流程和解读报告。
   - MCP Server：提供 read-only 查询工具，例如 `list_assets`、`get_component`、`search_tokens`。
   - 职责：让 AI agent 在新项目里能查询和复用资产，而不是反复读取整个旧仓库。

4. **分发层**
   - Codex Plugin：打包 Skill、MCP 配置和使用说明。
   - 后续可扩展到 npm 包、GitHub Action、Web Dashboard。

### 2.2 技术栈

- **运行时**：Node.js 20+
- **语言**：TypeScript
- **CLI 框架**：Commander
- **文件扫描**：fast-glob
- **源码分析**：ts-morph 或 TypeScript Compiler API
- **样式解析**：Tailwind class 解析 + PostCSS 作为后续扩展
- **后端识别**：文件路径、HTTP method、route handler、middleware、service function 的启发式分析
- **Schema 校验**：Zod
- **测试**：Vitest
- **MCP**：零依赖 MCP `2025-06-18` stdio 入口，使用 UTF-8 换行分隔 JSON；是否接入 TypeScript MCP SDK 后续通过 ADR 决定
- **包管理器**：pnpm 或 npm，MVP 可先用 npm 降低门槛

## 3. 核心模块设计

### 3.1 CLI 模块

路径建议：

- `src/cli.ts`
- `src/index.ts`

职责：

- 解析命令参数。
- 调用 `distillProject(projectRoot)`。
- 控制输出目录和日志。
- 返回清晰错误码。

首批命令：

```bash
vibe-foundry distill .
vibe-foundry inspect .
vibe-foundry validate .
```

MVP 只必须实现 `distill`，`inspect` 和 `validate` 可作为第二阶段。

### 3.2 Project Scanner

路径建议：

- `src/scanner/project-scanner.ts`

职责：

- 识别框架：Next.js、React、Vite。
- 识别语言：TypeScript、JavaScript。
- 识别源码目录：`src/`、`app/`、`pages/`、`components/`。
- 识别后端目录：`api/`、`routes/`、`server/`、`services/`、`lib/auth`。
- 识别样式入口：`tailwind.config.*`、`globals.css`。
- 识别包管理器：npm、pnpm、yarn。

输出示例：

```json
{
  "framework": "next",
  "language": "typescript",
  "componentDirs": ["src/components"],
  "apiDirs": ["src/app/api"],
  "serviceDirs": ["src/server", "src/lib"],
  "pageDirs": ["src/app"],
  "styleSystem": "tailwind"
}
```

### 3.3 Component Analyzer

路径建议：

- `src/analyzers/component-analyzer.ts`

职责：

- 识别导出的 React 组件。
- 区分基础组件、组合组件、页面组件、业务组件。
- 计算复用潜力。
- 记录依赖、props、样式 class、引用次数。

评分维度：

- 是否位于 `components/`。
- 是否被多个文件引用。
- 是否依赖业务 API、数据库、认证、支付等强业务模块。
- props 是否泛化。
- 命名是否通用。
- 是否包含样式和状态变体。

### 3.4 Token Extractor

路径建议：

- `src/analyzers/token-extractor.ts`

职责：

- 从 Tailwind class 中提取颜色、字号、间距、圆角、阴影、边框等 tokens。
- 从 `tailwind.config.*` 中读取主题扩展。
- 保留来源文件和出现次数。

MVP 不需要完整解释 Tailwind 编译结果，只需稳定识别高频 class 和配置扩展。

### 3.5 Service Analyzer

路径建议：

- `src/analyzers/service-analyzer.ts`

职责：

- 识别后端 route handler、service function、middleware 和常见业务模块。
- 识别登录、注册、登出、会话、邮箱验证、权限校验、订阅计费、文件上传等候选业务资产。
- 记录 HTTP method、route path、输入输出线索、依赖、风险和复用建议。

MVP 先采用启发式识别：

- 文件路径包含 `login`、`register`、`auth`、`session`、`permission`。
- 代码中出现 `POST`、`GET`、`NextRequest`、`Request`、`Response`。
- 依赖 `bcrypt`、`jwt`、`next-auth`、`lucia`、`passport`、`stripe` 等库。

### 3.6 Business Pattern Summarizer

路径建议：

- `src/analyzers/business-pattern-summarizer.ts`

职责：

- 从 service analyzer 输出中总结业务流程。
- 例如登录/注册流程、邮箱验证流程、权限校验流程。
- 输出 `business-patterns.md`。

### 3.7 Product and Concept Asset Model

路径建议：

- `src/schema/concept-assets.ts`

职责：

- 定义产品设计资产和文化隐喻资产的预留 schema。
- MVP 可以输出空 `concept-assets.json`，但字段结构要允许后续加入 metaphor pack。

预留字段：

- `productPatterns`
- `namingSystems`
- `metaphors`
- `archetypes`
- `visualMotifs`
- `sourceReferences`

### 3.8 Pattern Summarizer

路径建议：

- `src/analyzers/pattern-summarizer.ts`

职责：

- 识别页面类型：登录页、Dashboard、列表页、详情页、设置页、落地页。
- 总结布局结构：sidebar layout、top nav、card grid、table page、form page。
- 输出 `page-patterns.md`。

MVP 可采用启发式规则，不引入复杂 LLM 依赖。后续再支持可选 LLM 总结。

### 3.9 Report Writer

路径建议：

- `src/writers/asset-writer.ts`
- `src/writers/report-writer.ts`

职责：

- 写入 `.vibe-foundry/`。
- 生成稳定 JSON。
- 生成 Markdown 报告。
- 保证重复运行结果尽量稳定，方便 diff。

### 3.10 MCP Server

路径建议：

- `src/mcp/server.ts`

首批工具：

- `list_assets`：列出资产。
- `get_component`：读取单个组件资产详情。
- `get_service`：读取单个后端服务或业务能力详情。
- `search_tokens`：查询设计 tokens。
- `search_business_patterns`：查询业务流程资产。
- `search_concept_assets`：查询产品设计和隐喻资产。
- `get_agent_rules`：返回 agent 规则。
- `validate_asset_usage`：检查当前项目是否偏离资产规则。

MCP 第一版只读，不写项目文件。

## 4. 数据流

完整流程：

```text
用户项目
  -> Project Scanner
  -> Component Analyzer
  -> Service Analyzer
  -> Token Extractor
  -> Business Pattern Summarizer
  -> Pattern Summarizer
  -> Asset Package Builder
  -> Report Writer
  -> .vibe-foundry/
  -> Skill / MCP / Plugin 消费
```

关键原则：

- 每个资产都必须保留 `sourceFiles`。
- 文化隐喻资产必须保留来源引用，但不能保存大段版权原文。
- 每个评分都要标记为 heuristic，中文可理解为“启发式判断”。
- JSON 面向机器，Markdown 面向用户。
- MCP 不重新分析源码，只读取 `.vibe-foundry/`。

## 5. 输出协议

`.vibe-foundry/` 建议结构：

```text
.vibe-foundry/
  asset-manifest.json
  component-catalog.json
  service-catalog.json
  tokens.json
  page-patterns.md
  business-patterns.md
  concept-assets.json
  metaphor-packs/
  agent-rules.md
  reuse-report.md
```

`asset-manifest.json` 负责总览和版本：

```json
{
  "schemaVersion": "0.1.0",
  "sourceProject": "example-app",
  "generatedAt": "2026-07-08T00:00:00.000Z",
  "framework": "next",
  "assetCounts": {
    "components": 12,
    "services": 4,
    "businessPatterns": 2,
    "tokens": 48,
    "pagePatterns": 5,
    "conceptAssets": 0
  }
}
```

## 6. 测试策略

### 6.1 单元测试

覆盖：

- project scanner
- component analyzer
- service analyzer
- business pattern summarizer
- token extractor
- schema validation
- report writer

### 6.2 集成测试

用临时目录构造一个 Next.js-like fixture，运行：

```bash
vibe-foundry distill <fixture>
```

断言生成 `.vibe-foundry/`，并检查 JSON 可解析。

### 6.3 手动验证

至少找 2 个真实项目验证：

- 一个小型 landing page 或 SaaS 原型。
- 一个 Dashboard / 管理后台。
- 一个包含登录/注册或权限接口的全栈项目。

验证重点：

- 是否识别出真正可复用组件和业务能力。
- tokens 是否覆盖主视觉语言。
- 业务流程输出是否保留安全约束和复用边界。
- agent-rules.md 是否能指导下一次生成。

## 7. 排期

以下排期按 1 名开发者估算，从 2026-07-08 开始。

### 第 1 周：2026-07-08 至 2026-07-14

目标：完成项目骨架和输出协议。

交付物：

- 初始化 Node.js / TypeScript CLI。
- 建立测试框架。
- 定义 `.vibe-foundry/` schema。
- 完成 `asset-manifest.json`、`tokens.json`、`component-catalog.json` 的数据结构。
- 预留 `service-catalog.json`、`business-patterns.md`、`concept-assets.json` 的数据结构。
- 完成最小 `distill .` 命令，但允许输出空资产包。

验收标准：

- `npm test` 通过。
- `npm run build` 通过。
- 空 fixture 项目可以生成 `.vibe-foundry/asset-manifest.json`。

### 第 2 周：2026-07-15 至 2026-07-21

目标：完成项目扫描、组件识别和后端接口轻量识别。

交付物：

- Project Scanner。
- Component Analyzer 第一版。
- Service Analyzer 第一版。
- 复用评分 heuristic 第一版。
- `component-catalog.json` 输出。
- `service-catalog.json` 输出。

验收标准：

- 能识别 Next.js / React 项目结构。
- 能列出 `components/` 下导出的组件。
- 能列出 `api/`、`routes/`、`server/`、`services/` 下的接口和服务候选。
- 能区分基础组件和页面组件。
- 能根据业务依赖降低复用评分。
- 能识别登录/注册/认证/权限相关的候选业务资产。

### 第 3 周：2026-07-22 至 2026-07-28

目标：完成设计 tokens、页面模式和业务模式提取。

交付物：

- Tailwind class token extractor。
- Tailwind config 读取。
- Pattern Summarizer 第一版。
- Business Pattern Summarizer 第一版。
- `tokens.json` 和 `page-patterns.md`。
- `business-patterns.md`。

验收标准：

- 能提取颜色、间距、圆角、阴影、字号。
- 能统计 token 来源和出现次数。
- 能识别常见页面模式，如 Dashboard、表格页、表单页、登录页。
- 能总结登录、注册、权限校验等基础业务流程。

### 第 4 周：2026-07-29 至 2026-08-04

目标：完成报告生成和真实项目验证。

交付物：

- `reuse-report.md`。
- `agent-rules.md`。
- `concept-assets.json` 空结构。
- 稳定 JSON 输出。
- 两个真实项目的试跑结果。

验收标准：

- 报告能列出高价值资产候选和风险。
- 报告能同时覆盖组件、接口、业务流程和产品模式。
- agent-rules.md 可直接复制到 `AGENTS.md` 或 IDE 规则中。
- 重复运行输出稳定，非时间字段 diff 较小。

### 第 5 周：2026-08-05 至 2026-08-11

目标：完成 Codex Skill 和 MCP 只读服务。

交付物：

- `.agents/skills/vibe-foundry/SKILL.md`。
- MCP server 第一版。
- 工具：`list_assets`、`get_component`、`get_service`、`search_tokens`、`search_business_patterns`、`get_agent_rules`。

验收标准：

- Codex 能通过 Skill 执行资产炼化流程。
- MCP 能读取 `.vibe-foundry/` 并返回结构化资产。
- MCP 不修改用户项目文件。

### 第 6 周：2026-08-12 至 2026-08-18

目标：完成插件化、文档和 MVP 收口。

交付物：

- Codex Plugin 本地打包。
- README。
- 使用教程。
- 示例项目或 fixture。
- MVP release checklist。

验收标准：

- 新用户能按 README 在 10 分钟内跑通。
- `vibe-foundry distill .` 能在真实项目上稳定运行。
- 插件可在本地 Codex marketplace 中发现。
- 已知限制清晰写入文档。

## 8. 里程碑

### M1：CLI 可用

日期：2026-07-14

标准：能生成空资产包和基础 manifest。

### M2：资产识别可用

日期：2026-07-28

标准：能识别组件、后端接口、业务流程、tokens、页面模式。

### M3：报告可用

日期：2026-08-04

标准：报告能指导用户决定哪些资产值得沉淀。

### M4：Agent 可用

日期：2026-08-11

标准：Skill 和 MCP 能让 Codex 查询资产包。

### M5：MVP 可发布

日期：2026-08-18

标准：文档、示例、测试、插件包装完成。

## 9. 暂缓事项

以下内容建议 MVP 后再做：

- 自动抽组件和修改源码。
- Figma 同步。
- SaaS Dashboard。
- 多仓库资产库。
- 视觉截图比对。
- GitHub Action 自动资产审查。
- npm 包自动发布。
- 面向 Vue、Svelte、React Native 的适配。
- 完整书籍解析和 metaphor pack 自动生成。
- 文化隐喻资产的可视化工作台。

## 10. 当前建议

下一步不要先写 MCP，也不要先做 Web 页面。先实现 CLI 和输出协议，因为它们决定后续所有接入形态是否稳定。

推荐开发顺序：

1. CLI 骨架。
2. 输出 schema。
3. 项目扫描。
4. 组件分析。
5. 后端接口和业务流程轻量识别。
6. tokens 提取。
7. 产品模式和业务模式总结。
8. 报告生成。
9. Skill。
10. MCP。
11. Plugin。
