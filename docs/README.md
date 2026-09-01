---
project: VibeFoundry
category: docs-index
source_path: docs/README.md
status: active
last_updated: 2026-09-01
---

# VibeFoundry 文档索引

这个仓库采用文档驱动开发。任何实现工作都应从本文档进入，再按任务类型路由到对应文档。

## 1. 总入口

- [完整实现总文档](plans/2026-07-08-vibe-foundry-master-implementation.md)
  - 后续开发的总目标、阶段划分、排期、交付物、实现细节和验收标准。
- [文档驱动开发治理规则](governance/document-driven-development.md)
  - 规定何时更新文档、如何记录决策、如何把文档和验证命令绑定。

## 2. 产品与范围

- [需求文档](requirements/vibe-foundry-prd.md)
  - 产品定位、目标用户、资产类型、MVP 范围和成功标准。
- [扩展资产模型设计](plans/2026-07-08-expanded-asset-model-design.md)
  - 双核心路线：工程资产先行，产品设计资产和文化隐喻资产预留。
- [竞品分析](research/2026-07-08-competitive-analysis.md)
  - Builder.io、Storybook MCP、Magic Patterns、Bit.dev、后端模板生态、知识库/RAG 等相邻方向。

## 3. 技术与执行

- [开源准备设计](plans/2026-09-01-open-source-readiness-design.md)
  - Apache-2.0 发布边界、信任模型、跨平台资产库契约和公开前门槛。
- [开源准备实施计划](plans/2026-09-01-open-source-readiness.md)
  - 安全加固、社区文件、CI、隐私清理、验证和首次公开发布步骤。
- [技术实现方案与排期](plans/2026-07-08-vibe-foundry-technical-roadmap.md)
  - 技术架构、模块设计、测试策略和 6 周排期。
- [实施计划](plans/2026-07-08-vibe-foundry-implementation-plan.md)
  - 面向任务执行的详细计划，适合用 `superpowers:executing-plans` 逐项执行。
- [实现启动决策](plans/2026-07-08-implementation-readiness.md)
  - Milestone 1 的启动范围、验证标准和暂缓事项。
- [VibeFoundry Skill 使用手册](runbooks/use-vibe-foundry-skill.md)
  - Codex Skill 的本地路径、执行流程、只读边界和验证方式。
- [VibeFoundry MCP 使用手册](runbooks/use-vibe-foundry-mcp.md)
  - MCP 只读资产工具、本地调用方式、只读边界和验证方式。
- [VibeFoundry Plugin 安装手册](runbooks/install-vibe-foundry-plugin.md)
  - Codex Plugin、repo-local marketplace、Skill 和 MCP 配置的安装验证方式。
- [Metaphor Pack 创建手册](runbooks/create-metaphor-pack.md)
  - 文化隐喻资产的输入目录、版权边界、输出字段和验证方式。
- [Quickstart](runbooks/quickstart.md)
  - 10 分钟内完成构建、fixture distill、MCP 查询和插件检查。
- [Web Asset Browser 使用手册](runbooks/use-web-asset-browser.md)
  - 本地只读 Web 资产浏览器的启动、界面结构和 API。
- [Web Asset Browser 资产交互增强](plans/2026-07-08-web-asset-browser-asset-interactions.md)
  - 资产卡片语言标识、组件交互预览、动画演示和真实前端项目验证。
- [Component Preview Runtime](plans/2026-07-08-component-preview-runtime.md)
  - 指定组件的 Vite 本地真实预览运行时、资产卡片 hover 弹层展示和交互验证。
- [Source-faithful Component Preview](plans/2026-07-11-source-faithful-component-preview.md)
  - 从真实调用点和源项目 Provider 链生成高保真组件预览场景。
- [Source Analysis Foundation Design](plans/2026-07-14-source-analysis-foundation-design.md)
  - 以 AST 源码索引、导入关系和可信度分级替换正则组件场景分析。
- [Source Analysis Foundation Implementation Plan](plans/2026-07-14-source-analysis-foundation.md)
  - 前端炼化底层算法、严格预览状态、设计 Token 和真实项目验证计划。
- [Preview Action Cache Implementation Plan](plans/2026-07-14-preview-action-cache.md)
  - 组件预览动作摘要、SQLite Action Cache、内容寻址产物和跨重启复用计划。
- [Source Runtime Fidelity Design](plans/2026-07-14-source-runtime-fidelity-design.md)
  - 通过公开源页面的短生命周期实机采集、分层比较和增量缓存校准资产预览。
- [Source Runtime Fidelity Implementation Plan](plans/2026-07-14-source-runtime-fidelity.md)
  - 源页面路由/定位规划、进程监管、浏览器采集、分层比较、缓存和工作台反馈的 TDD 任务。
- [Book Distillation](plans/2026-07-12-book-distillation.md)
  - 从 PDF、TXT、Markdown 提取章节、概念簇、跨章节关系和来源定位。
- [ADR-002：独立书籍炼化链路](adr/002-book-distillation.md)
  - 记录书籍资产契约、确定性分析与无外部模型决策。
- [ADR-003：组件预览 Action Cache](adr/003-preview-action-cache.md)
  - 记录 SQLite、内容寻址存储、租约和运行状态分离决策。
- [ADR-004：源项目实机校准](adr/004-source-runtime-fidelity-calibration.md)
  - 记录允许启动源项目后的信任边界、双通道模式和保真度证明方式。
- [ADR-001：使用 Vite 生成本地组件预览运行时](adr/001-component-preview-runtime.md)
  - 记录 Vite、Storybook adapter 和 react-scripts 之间的取舍。
- [MVP Release Checklist](reports/mvp-release-checklist.md)
  - MVP 发布前验证命令、交付物、已知限制和发布判断。
- [Open Source Release Checklist](reports/open-source-release-checklist.md)
  - 首次公开 GitHub 源码仓库前的许可证、社区、CI、隐私和所有者确认清单。

## 4. 社区与发布

- [贡献指南](../CONTRIBUTING.md)
  - 本地开发、测试、文档同步、Pull Request 和隐私检查要求。
- [安全策略](../SECURITY.md)
  - 使用 GitHub Private Vulnerability Reporting 私下报告漏洞。
- [社区行为准则](../CODE_OF_CONDUCT.md)
  - 仓库协作空间中的行为和处理规则。
- [Apache-2.0 许可证](../LICENSE)
  - 项目源码、文档和自有配置的授权条款。

## 5. 当前实现状态

当前已完成 Milestone 1 至 Milestone 10：

- 初始化项目工程。
- 建立最小 CLI。
- 定义通用资产 schema。
- 实现 `distill` 最小输出，集中资产库根目录依次采用显式 `assetLibraryRoot`、`VIBE_FOUNDRY_LIBRARY_ROOT` 或当前用户主目录下的 `.vibe-foundry/library`，项目输出写入 `projects/<project-id>`：
  - `asset-manifest.json`
  - `component-catalog.json`
  - `service-catalog.json`
  - `tokens.json`
  - `page-patterns.md`
  - `business-patterns.md`
  - `reuse-report.md`
  - `agent-rules.md`
  - `concept-assets.json`
- 识别基础工程资产：
  - 前端组件。
  - 后端 service。
  - 登录、注册、会话、权限等业务入口。
- 提炼基础模式：
  - Tailwind tokens。
  - 页面模式。
  - 业务流程。
- 生成可读报告和 agent rules。
- 接入 Codex Skill 本地工作流：
  - `.agents/skills/vibe-foundry/SKILL.md`
  - `docs/runbooks/use-vibe-foundry-skill.md`
- 接入 MCP 只读资产服务：
  - `src/mcp/server.ts`
  - `docs/runbooks/use-vibe-foundry-mcp.md`
- 打包 Codex Plugin：
  - `plugins/vibe-foundry/.codex-plugin/plugin.json`
  - `plugins/vibe-foundry/skills/vibe-foundry/SKILL.md`
  - `plugins/vibe-foundry/.mcp.json`
  - `.agents/plugins/marketplace.json`
- 提炼产品设计资产：
  - `src/analyzers/product-pattern-analyzer.ts`
  - `src/schema/concept-assets.ts`
  - `concept-assets.json`
- 提炼文化隐喻资产：
  - `src/analyzers/metaphor-distiller.ts`
  - `src/schema/metaphor-pack.ts`
  - `metaphor-packs/<source>.json`
- 完整 MVP 收口：
  - `examples/fixture-project`
  - `docs/runbooks/quickstart.md`
  - `docs/reports/mvp-release-checklist.md`
  - `scripts/verify-mvp.mjs`
- Web 资产浏览器：
  - `src/web/asset-view-model.ts`
  - `src/web/frontend.ts`
  - `src/web/server.ts`
  - `node dist/cli.js web --port 4317`
  - 默认聚合集中资产库，显式传入 `<project-root>` 时保留单项目查看。
  - `VibeFoundry.pen` 四屏 Pencil 设计板
  - `output/pencil-web-design/AJTN7.png` Pencil 导出验证图
- 书籍炼化 CLI：`node dist/cli.js distill-book <book-path>`，输出到集中资产库的 `books` 目录。
- GitHub 源码开源发布面：Apache-2.0、社区文件、Issue/PR 模板、Dependabot 和最小权限 CI。

集中资产库中的索引和 manifest 可能包含源码项目的绝对路径，只用于本机回查，不应提交或直接分享。

当前验证命令：

```bash
npm test
npm run build
```

## 6. 后续工作入口

MVP 已按总实现文档收口。后续新增能力应先新增计划文档或 ADR。
