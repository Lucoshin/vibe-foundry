---
project: VibeHub
category: runbook
status: active
last_updated: 2026-09-16
---

# 使用 VibeHub Skill

项目内入口是 `.agents/skills/vibehub/SKILL.md`，插件副本是 `plugins/vibehub/skills/vibehub/SKILL.md`。两份入口和引用协议保持一致；Codex 重新加载仓库后可发现 `$vibehub`。

直接向 Codex 说：

```text
$vibehub 帮我炼化 https://glass.zs.uy/，控件需要实际效果。
$vibehub 炼化 <目标项目绝对路径>。
$vibehub 炼化这次已选定的开发对话，关注决策依据和失败经验。
```

## 目标与流程

工具仓库与用户目标分离。开发或修改工具时先读 `docs/USAGE.md` 并运行 `npm test`；已安装 CLI 的正常炼化无需重复全套测试。本地工程执行 `node dist/cli.js distill <target-project-root>`。只有用户明确要炼化当前仓库自身时使用 `node dist/cli.js distill .`。

网站按 `references/website.md` 由宿主观察、采集真实原件、编写逐控件入口及四类效果描述，再执行 `node dist/cli.js distill-website <capture-directory>`。不内置通用爬虫或后台模型；视觉和交互需分别实机验收。

书籍按[书籍手册](distill-book-knowledge.md)准备分块、宿主阅读并严格导入。五类知识现已进入统一 Web/MCP；普通 `distill-book` 的预设词表统计不能称为语义炼化。

文本、对话和开发过程按 `references/learning.md` 与[学习工作台手册](learning-workbench.md)执行：

```bash
vibe recipes list
vibe learn prepare <source-json> [recipe-id]
vibe learn import <task-id> <analysis-json>
vibe learn tasks
```

宿主真实读取用户选定材料，按任务冻结的方案生成有证据分析，再导入；`prepare` 不表示已经执行分析。默认对话方案为 `conversation-learning`，默认文本方案为 `general-knowledge`。个人方案通过 `vibe recipes save <recipe-json>` 保存新副本或版本，不能覆盖内置。图片和账号尚无专业导入流程，不能用通用文本结果冒充图像或全账号分析。

## 资产与验收

产物统一写入集中资产库：显式 `assetLibraryRoot`、`VIBEHUB_LIBRARY_ROOT`、`<user-home>/.vibehub/library`。工程/网站读取命令打印的 `<asset-package-dir>/reuse-report.md`；网站来源在 `website-provenance.json`，项目路径在 `asset-manifest.json`。学习命令返回任务与结果 JSON，保留准确 ID、摘要和版本。

运行 `node dist/cli.js web --port 4317` 查看资产、来源、学习任务、应用记录和炼化方案。跨来源 MCP 使用 `search_library_assets` 与 `get_library_asset`；组件专用工具 `get_component`、`get_component_prompt` 仍绑定实际目标 `projectRoot`。Web 与 MCP 共用 `src/application/asset-catalog.ts`，应核对同一资产 ID、内容、证据和版本。

实际采用学习资产后，记录目标、理由、行动、结果和真实验证引用。当前应用记录仅绑定学习资产确切版本，属于使用者陈述，不能替代实际验收。把后续真实开发过程再次作为材料，形成学习与改进循环。

Skill 不自动修改源码。网站适配副本须保留来源、散列与限制，缺失依赖不能用假数据填充。开发过程只使用实际可见的发言、文件变化和验证结果，不声称拥有不可见的完整会话。结束时报告真实数量、位置、已验证行为与未完成项。

## 验证与愿景

开发验证命令为 `npm test`、`npm run build`；真实目标使用对应 CLI，并检查 Web 及 MCP 消费。网站逐控件核对效果；知识资产核对来源、明示/解读和方案版本。长期希望成为 Codex、Claude Code 等生态可用的知识、经验与记忆层，当前不声称官方内置。
