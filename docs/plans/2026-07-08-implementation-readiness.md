# VibeFoundry 实现启动决策

> **历史契约说明（2026-09-01）：** 本文保留用于启动决策追溯；其中源项目内资产目录约定已被 central-only 集中资产库契约取代，不代表当前输出位置。

## 1. 决策

建议现在开始实现，但范围必须收窄到 **MVP CLI 阶段**。

不建议现在同时做 MCP、Codex Plugin、Web Dashboard、完整书籍炼化或自动重构能力。当前最需要验证的是：VibeFoundry 能否从一个真实 React / Next.js / Node.js 项目中产出有价值的 `.vibe-foundry/` 资产包，并且这个资产包的 schema 能容纳后端业务资产、产品设计资产和文化隐喻资产。

## 2. 启动条件

当前已经满足：

- 需求文档已完成。
- 技术路线已完成。
- 竞品分析已完成。
- MVP 范围明确为 React / Next.js / TypeScript / Tailwind，并轻量识别 Node.js / Next.js API routes 中的登录、注册、认证、权限等业务能力。
- 产品设计资产和文化隐喻资产采用 schema 预留，不在 Milestone 1 做完整解析。
- 输出协议已有初步定义。

开始实现前还需要完成一个轻量准备步骤：

- 初始化 Git 仓库。
- 初始化 Node.js / TypeScript 项目。
- 确认包管理器，建议 MVP 先使用 npm。

## 3. 第一阶段实现目标

阶段名称：MVP CLI 骨架。

目标日期：2026-07-14。

必须交付：

- `package.json`
- `tsconfig.json`
- `src/cli.ts`
- `src/index.ts`
- `tests/cli.test.ts`
- `vibe-foundry distill .` 命令
- `.vibe-foundry/asset-manifest.json` 最小输出
- `.vibe-foundry/service-catalog.json` 空结构
- `.vibe-foundry/concept-assets.json` 空结构

验收标准：

- `npm test` 通过。
- `npm run build` 通过。
- 在一个临时 fixture 项目上运行 `vibe-foundry distill .` 后能生成 `.vibe-foundry/asset-manifest.json`。
- 输出 schema 不只绑定前端组件，能表达 `component`、`service`、`business-pattern`、`concept`、`metaphor` 等资产类型。

## 4. 接下来 3 个工作块

### 工作块 1：项目初始化

预计耗时：0.5 天。

内容：

- `git init`
- 创建 Node.js / TypeScript 项目。
- 安装 Commander、fast-glob、Zod、Vitest。
- 配置 build 和 test scripts。

完成标准：

- 空测试能运行。
- TypeScript 能编译。

### 工作块 2：输出协议

预计耗时：1 天。

内容：

- 定义 `AssetPackage` schema。
- 定义 `ComponentAsset`、`ServiceAsset`、`BusinessPattern`、`DesignToken`、`PagePattern`、`ConceptAsset` 类型。
- 写入 `.vibe-foundry/asset-manifest.json`。
- 写入 `.vibe-foundry/service-catalog.json` 和 `.vibe-foundry/concept-assets.json` 的空结构。

完成标准：

- 最小 asset package 可通过 schema 校验。
- JSON 输出稳定、可重复解析。
- schema 支持后续加入后端业务资产和文化隐喻资产，无需推翻文件结构。

### 工作块 3：最小 distill 流程

预计耗时：1.5 天。

内容：

- 实现 `distillProject(projectRoot)`。
- 扫描 `package.json`。
- 识别项目名、框架、语言、生成时间。
- 识别是否存在 `app/api`、`pages/api`、`routes`、`server`、`services` 等后端目录。
- 创建 `.vibe-foundry/` 输出目录。

完成标准：

- CLI 命令能跑通。
- 集成测试覆盖临时 fixture。

## 5. 不应现在做的事

暂缓：

- MCP server。
- Codex Skill。
- Codex Plugin。
- Web Dashboard。
- Figma 集成。
- Storybook 自动生成。
- 完整书籍和文化材料自动炼化。
- metaphor pack 自动生成。
- 自动修改用户源码。
- 多框架支持。

原因：

- 当前核心假设还没验证。
- 先做接入层会让产品变成“空壳 MCP”。
- CLI 输出协议稳定后，再做 MCP 和 Skill 成本更低。

## 6. 建议实现顺序

```text
Git 初始化
  -> TypeScript CLI 骨架
  -> Asset schema
  -> 最小 distill 输出
  -> Project scanner
  -> Component analyzer
  -> Service analyzer
  -> Token extractor
  -> Business pattern summarizer
  -> Report writer
  -> Codex Skill
  -> MCP server
  -> Plugin packaging
```

## 7. 是否开始实现

建议：**开始实现**。

但这次开始只做：

> Milestone 1：CLI 可用，能生成最小 `.vibe-foundry/` 资产包。

实现完成后再进入第二阶段：

> 组件识别、后端接口识别、业务流程总结、tokens 提取、页面模式总结。

## 8. 下一次执行指令建议

如果要进入实现，可以直接使用这个指令：

```text
按 docs/plans/2026-07-08-implementation-readiness.md 开始实现 Milestone 1，只做 CLI 骨架、通用资产 schema 和最小 distill 输出。schema 要预留后端业务资产、产品设计资产和文化隐喻资产，但不要实现完整书籍炼化。
```
