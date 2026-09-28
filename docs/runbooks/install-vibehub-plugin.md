---
project: VibeHub
category: runbook
source_path: docs/runbooks/install-vibehub-plugin.md
status: active
last_updated: 2026-09-01
---

# 安装 VibeHub Plugin

本文档说明如何检查和使用仓库内的 VibeHub Codex Plugin。

## 1. 插件文件

插件 manifest 位于：

```text
plugins/vibehub/.codex-plugin/plugin.json
```

插件包含：

- `plugins/vibehub/skills/vibehub/SKILL.md`
- `plugins/vibehub/.mcp.json`

本地 marketplace 位于：

```text
.agents/plugins/marketplace.json
```

marketplace entry 指向：

```text
./plugins/vibehub
```

## 2. 验证插件结构

运行插件校验脚本：

```bash
python <plugin-creator-skill-root>/scripts/validate_plugin.py plugins/vibehub
```

将 `<plugin-creator-skill-root>` 替换为当前环境中 `plugin-creator` skill 的实际安装目录。

同时运行项目验证：

```bash
npm test
npm run build
```

## 3. 启用方式

当前仓库使用 repo-local marketplace：

```text
.agents/plugins/marketplace.json
```

如果 Codex 环境支持读取当前仓库内 marketplace，可从该 marketplace 安装或加载 `vibehub`。

如果环境只读取个人 marketplace，可以将同样的插件结构放到个人插件目录，并让 marketplace entry 指向 `./plugins/vibehub`。

## 4. 插件能力

插件提供：

- Codex Skill：接收明确目标；本地工程使用 `distill <target-project-root>`，网站由宿主采集后使用 `distill-website <capture-directory>`。在同一 Web/MCP 资产库交付逐控件预览及效果提示词。
- MCP 配置：声明 `vibehub` MCP server，并指向可处理 `tools/list` 和 `tools/call` 的 `dist/mcp/server.js`。
- 本地 marketplace entry：包含安装策略、认证策略和分类。

## 5. 当前边界

M7 负责插件打包和本地 marketplace 接入。

当前 `.mcp.json` 声明到 M6 的 MCP 只读 stdio 入口。HTTP transport 或官方 MCP SDK 接入应在后续独立阶段通过 ADR 决定。

插件不会自动修改用户源码。资产刷新仍由 Skill 工作流显式运行：

```bash
node dist/cli.js distill <target-project-root>
```

资产只写入集中资产库；优先使用 `VIBEHUB_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibehub/library`。

## 6. 故障处理

如果插件不可见：

- 检查 `.agents/plugins/marketplace.json` 是否包含 `vibehub`。
- 检查 `source.path` 是否为 `./plugins/vibehub`。
- 检查 `plugins/vibehub/.codex-plugin/plugin.json` 是否存在。
- 重新运行 `validate_plugin.py`。

如果 Skill 不可见：

- 检查 `plugin.json` 是否包含 `"skills": "./skills/"`。
- 检查 `plugins/vibehub/skills/vibehub/SKILL.md` 是否存在。

如果 MCP 配置不可见：

- 检查 `plugin.json` 是否包含 `"mcpServers": "./.mcp.json"`。
- 检查 `plugins/vibehub/.mcp.json` 是否包含 `mcpServers.vibehub`。
