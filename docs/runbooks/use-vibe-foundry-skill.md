---
project: VibeFoundry
category: runbook
source_path: docs/runbooks/use-vibe-foundry-skill.md
status: active
last_updated: 2026-09-01
---

# 使用 VibeFoundry Skill

本文档说明如何在本地 agent 工作流中使用 VibeFoundry Skill。

## 1. 适用场景

当需要从当前项目中提炼或复查可复用资产时，使用 `.agents/skills/vibe-foundry/SKILL.md`。

典型场景：

- 开始新功能前，先检查已有组件、service 和业务流程是否可复用。
- 完成阶段开发后，刷新集中资产库中的项目资产包。
- 需要向 agent 提供项目资产上下文。
- 需要从报告中整理下一步抽象建议。

## 2. 本地路径

Skill 文件位于：

```text
.agents/skills/vibe-foundry/SKILL.md
```

如果 agent 支持项目内 skills discovery，重新加载当前仓库后应能发现 `vibe-foundry` skill。

## 3. 执行流程

在仓库根目录执行以下流程：

```bash
npm test
node dist/cli.js distill .
```

然后读取：

```text
<asset-package-dir>/reuse-report.md
```

`<asset-package-dir>` 以 `distill` 命令打印的目录为准。集中资产库优先使用 `VIBE_FOUNDRY_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibe-foundry/library`。

输出建议应基于报告内容，不应凭空编造资产。

## 4. 只读边界

VibeFoundry Skill 不自动修改源码。

允许的行为：

- 读取 `docs/README.md`。
- 运行 `npm test`。
- 运行 `node dist/cli.js distill .`。
- 读取 `distill` 输出目录中的 `reuse-report.md`。
- 总结可复用资产和下一步建议。

不允许的行为：

- 未经用户确认直接改业务源码。
- 未经用户确认重构组件或 service。
- 将文化材料的大段版权原文写入资产包或回复。

## 5. 验证标准

完成接入后，至少验证：

```bash
npm test
npm run build
node dist/cli.js distill .
```

检查 `<asset-package-dir>/reuse-report.md` 是否存在，并确认报告包含组件、service、业务流程、tokens 或风险建议中的至少一类内容。

## 6. 故障处理

如果 `npm test` 失败，先修复 VibeFoundry 工具本身，再运行 distill。

如果集中资产包中的 `reuse-report.md` 缺失，重新运行：

```bash
node dist/cli.js distill .
```

如果当前项目没有可识别资产，报告可以为空或只包含限制说明，但不能伪造组件、服务或业务流程。
