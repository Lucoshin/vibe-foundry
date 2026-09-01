---
project: VibeFoundry
category: runbook
source_path: docs/runbooks/install-vibe-foundry-plugin.md
status: active
last_updated: 2026-09-01
---

# 安装 VibeFoundry Plugin

本文档说明如何检查和使用仓库内的 VibeFoundry Codex Plugin。

## 1. 插件文件

插件 manifest 位于：

```text
plugins/vibe-foundry/.codex-plugin/plugin.json
```

插件包含：

- `plugins/vibe-foundry/skills/vibe-foundry/SKILL.md`
- `plugins/vibe-foundry/.mcp.json`

本地 marketplace 位于：

```text
.agents/plugins/marketplace.json
```

marketplace entry 指向：

```text
./plugins/vibe-foundry
```

## 2. 验证插件结构

运行插件校验脚本：

```bash
python <plugin-creator-skill-root>/scripts/validate_plugin.py plugins/vibe-foundry
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

如果 Codex 环境支持读取当前仓库内 marketplace，可从该 marketplace 安装或加载 `vibe-foundry`。

如果环境只读取个人 marketplace，可以将同样的插件结构放到个人插件目录，并让 marketplace entry 指向 `./plugins/vibe-foundry`。

## 4. 插件能力

插件提供：

- Codex Skill：指导 agent 先读文档、运行测试、执行 `node dist/cli.js distill .`，再从命令打印的集中资产包目录读取 `reuse-report.md`。
- MCP 配置：声明 `vibe-foundry` MCP server，并指向可处理 `tools/list` 和 `tools/call` 的 `dist/mcp/server.js`。
- 本地 marketplace entry：包含安装策略、认证策略和分类。

## 5. 当前边界

M7 负责插件打包和本地 marketplace 接入。

当前 `.mcp.json` 声明到 M6 的 MCP 只读 stdio 入口。HTTP transport 或官方 MCP SDK 接入应在后续独立阶段通过 ADR 决定。

插件不会自动修改用户源码。资产刷新仍由 Skill 工作流显式运行：

```bash
node dist/cli.js distill .
```

资产只写入集中资产库；优先使用 `VIBE_FOUNDRY_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibe-foundry/library`。

## 6. 故障处理

如果插件不可见：

- 检查 `.agents/plugins/marketplace.json` 是否包含 `vibe-foundry`。
- 检查 `source.path` 是否为 `./plugins/vibe-foundry`。
- 检查 `plugins/vibe-foundry/.codex-plugin/plugin.json` 是否存在。
- 重新运行 `validate_plugin.py`。

如果 Skill 不可见：

- 检查 `plugin.json` 是否包含 `"skills": "./skills/"`。
- 检查 `plugins/vibe-foundry/skills/vibe-foundry/SKILL.md` 是否存在。

如果 MCP 配置不可见：

- 检查 `plugin.json` 是否包含 `"mcpServers": "./.mcp.json"`。
- 检查 `plugins/vibe-foundry/.mcp.json` 是否包含 `mcpServers.vibe-foundry`。
