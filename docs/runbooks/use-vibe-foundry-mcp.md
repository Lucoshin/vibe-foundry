---
project: VibeFoundry
category: runbook
source_path: docs/runbooks/use-vibe-foundry-mcp.md
status: active
last_updated: 2026-09-08
---

# 使用 VibeFoundry MCP

本文档说明如何使用 VibeFoundry 的 MCP 只读资产服务。

MCP 是 Model Context Protocol，中文可理解为“模型上下文协议”。M6 阶段交付 `src/mcp/server.ts`：它既暴露工具定义和工具调用函数，也能作为最小 stdio JSON-RPC 入口处理 `tools/list` 和 `tools/call`。HTTP transport 和官方 SDK 接入后续通过 ADR 决定。

stdio 入口遵循 MCP `2025-06-18`：客户端和服务端使用 UTF-8 编码、换行分隔的 JSON-RPC 消息，每行恰好一条消息并以 `\n` 结束。该入口只支持这一规范传输，不保留旧头部帧或双协议兼容；进程的 `stdout` 只输出协议消息，诊断信息只能写入 `stderr`。

## 1. 前置条件

先在目标项目生成资产包：

```bash
node dist/cli.js distill .
```

资产包位于集中资产库中：优先使用显式 `assetLibraryRoot`，其次使用 `VIBE_FOUNDRY_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibe-foundry/library`。生成后在 `distill` 打印的 `<asset-package-dir>` 下应存在：

```text
<asset-package-dir>/asset-manifest.json
<asset-package-dir>/component-catalog.json
<asset-package-dir>/service-catalog.json
<asset-package-dir>/tokens.json
<asset-package-dir>/concept-assets.json
<asset-package-dir>/agent-rules.md
```

## 2. 工具入口

MCP 工具核心位于：

```text
src/mcp/server.ts
```

构建后可从以下模块导入：

```js
import {
  callVibeFoundryTool,
  listVibeFoundryTools,
} from "./dist/mcp/server.js";
```

也可以作为 stdio MCP 进程入口启动：

```bash
node dist/mcp/server.js --project-root .
```

## 3. 工具列表

`listVibeFoundryTools()` 返回以下只读工具：

- `list_assets`
- `get_component`
- `get_component_prompt`
- `get_service`
- `search_tokens`
- `search_business_patterns`
- `search_concept_assets`
- `get_agent_rules`
- `validate_asset_usage`

## 4. 调用示例

```js
const tools = listVibeFoundryTools();

const result = await callVibeFoundryTool(".", "get_service", {
  name: "auth.register",
});

console.log(result.structuredContent);
```

按组件真实文件路径取得专业效果描述提示词：

```js
const result = await callVibeFoundryTool(projectRoot, "get_component_prompt", {
  filePath: "src/components/Button.tsx",
});
if (!result.isError) console.log(result.structuredContent.prompt);
```

该工具只读取对应组件的 `component-prompts/<component-path-hash>.json`，同名组件使用不同文件路径准确区分。当前记录版本为 `0.2.0`：`prompt` 是按布局、视觉、动效、交互详细分项的专业中文需求，不包含源码；`sourceFiles` 为分析依据路径，`unresolved` 为待核对项。旧源码版或未生成提示词的包仅该工具要求重新炼化，其他工具仍可使用。没有实机观测时不宣称视觉一致。

返回结构包含：

- `content`：MCP 风格的文本内容数组。
- `structuredContent`：稳定 JSON，供 agent 直接读取。
- `isError`：是否为错误结果。

## 5. 只读边界

MCP 工具只读：

- 只读取集中资产库中的项目资产包。
- 不读取源项目内的旧资产目录，也不提供回退。
- 不修改用户源码。
- 不重新分析源码。
- 不运行 `distill`。
- 不创建、删除或重写项目文件。
- stdio 入口只处理 MCP 请求，不主动刷新资产包。

如果集中资产包缺失，工具会返回错误结果，并提示运行：

```bash
vibe-foundry distill .
```

## 6. 验证

开发或接入后运行：

```bash
npm test
npm run build
```

建议再对一个已经生成集中资产包的 fixture 调用：

```js
await callVibeFoundryTool(projectRoot, "list_assets");
await callVibeFoundryTool(projectRoot, "validate_asset_usage", {
  kind: "component",
  name: "Button",
});
```

## 7. 后续扩展

M7 插件阶段可以在此基础上增加：

- Codex Plugin 配置。
- 本地 marketplace 声明。
- MCP transport 包装。
- 安装和启用文档。

若要引入官方 MCP SDK 或网络 transport，应先写 ADR，说明依赖收益、维护成本和只读边界。
