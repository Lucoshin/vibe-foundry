---
project: VibeFoundry
category: runbook
source_path: docs/runbooks/quickstart.md
status: active
last_updated: 2026-09-08
---

# VibeFoundry Quickstart

目标：10 分钟内完成构建、验证、资产炼化、MCP 查询和插件检查。

资产包统一写入集中资产库：优先使用 `VIBE_FOUNDRY_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibe-foundry/library`。`distill` 会打印本次生成的准确资产包目录。

## 1. 验证工具状态

```bash
npm test
npm run build
```

## 2. 炼化示例项目

```bash
node dist/cli.js distill examples/fixture-project
```

输出目录：

```text
<asset-library-root>/projects/<project-id>/
```

重点检查：

- `asset-manifest.json`
- `component-catalog.json`
- `component-prompts/`：组件效果提示词；源码索引另在 `analysis-cache/` 复用解析结果。
- `service-catalog.json`
- `tokens.json`
- `concept-assets.json`
- `metaphor-packs/memory-palace.json`
- `reuse-report.md`
- `agent-rules.md`

## 3. 查询 MCP 资产

```bash
node --input-type=module -e "import { callVibeFoundryTool } from './dist/mcp/server.js'; const result = await callVibeFoundryTool('examples/fixture-project', 'search_concept_assets', { query: 'library' }); console.log(JSON.stringify(result.structuredContent, null, 2));"
```

也可以查询：

- `list_assets`
- `get_component`
- `get_component_prompt`：传 `filePath: "src/components/Button.tsx"`，取结果中的 `prompt` 交给其他 AI。
- `get_service`
- `search_tokens`
- `search_business_patterns`
- `search_concept_assets`
- `get_agent_rules`
- `validate_asset_usage`

## 4. 检查 Plugin

插件目录：

```text
plugins/vibe-foundry
```

本地 marketplace：

```text
.agents/plugins/marketplace.json
```

插件包含：

- Codex Skill。
- MCP 配置。
- repo-local marketplace entry。

## 5. 一键验证

```bash
node scripts/verify-mvp.mjs
```

该脚本会运行测试、构建、fixture distill、MCP 查询和插件 manifest 检查。

## 6. 继续使用

在真实项目中运行：

```bash
node dist/cli.js distill <project-root>
```

然后优先阅读：

```text
<asset-package-dir>/reuse-report.md
<asset-package-dir>/agent-rules.md
```

若想把组件效果描述给其他 AI，运行 `node dist/cli.js web --port 4317`，在组件详情或预览工作台展开“效果描述提示词”并复制。正文按布局、视觉、动效、交互详细分项，分析依据和待核对项另行折叠展示。旧源码版提示词会要求重炼。重复炼化时 CLI 会显示源码索引解析/复用数量；仅未变文件的解析摘要复用，文件内容仍会读取并校验。
