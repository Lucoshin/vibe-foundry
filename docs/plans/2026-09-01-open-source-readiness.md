---
project: VibeFoundry
category: implementation-plan
source_path: docs/plans/2026-09-01-open-source-readiness.md
status: active
last_updated: 2026-09-01
---

# VibeFoundry Open Source Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 VibeFoundry 整理为可安全公开的 Apache-2.0 GitHub 源码仓库，并在发布前完成安全、跨平台、文档和自动化验证。

**Architecture:** 保留现有 CLI、Web、MCP 和集中资产库架构；新增共享的受控子进程环境构造器，统一集中资产库根目录解析，并让验证脚本使用隔离的临时资产库。发布面通过许可证、社区文件、最小权限 CI、精确忽略规则和静态发布测试约束。

**Tech Stack:** TypeScript、Node.js ESM、Node test runner、GitHub Actions、Apache License 2.0。

---

## Task 1：建立可执行的开源发布契约

**Files:**

- Create: `tests/release/open-source-readiness.test.mjs`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`

**Steps:**

1. 先写失败测试，检查 `private: true`、Node 支持范围和敏感文件忽略规则；临时 `uni-h5` 截图只允许按仓库根目录规则忽略，不能误伤嵌套的公开资产；许可证、社区文件与 CI 断言在 Task 4 扩展，避免目标测试跨任务长期保持失败。
2. 运行 `node --test tests/release/open-source-readiness.test.mjs`，确认因缺少发布面而失败。
3. 只增加让契约成立的最小配置。
4. 通过 npm 的 lockfile 命令同步 `package-lock.json`，不手工制造锁文件差异。
5. 重跑目标测试。

## Task 2：阻止宿主秘密进入源项目子进程和缓存

**Files:**

- Create: `src/utils/process-environment.ts`
- Create: `tests/utils/process-environment.test.mjs`
- Modify: `src/fidelity/source-session-supervisor.ts`
- Modify: `tests/fidelity/source-session-supervisor.test.mjs`
- Modify: `src/preview/component-preview-runtime.ts`
- Modify: `tests/preview/component-preview-runtime.test.mjs`

**Steps:**

1. 写测试证明运行必需变量保留、任意变量与令牌被剔除、显式 VibeFoundry 覆盖项可传入。
2. 写集成测试捕获源会话和预览构建实际收到的环境，并断言秘密不存在。
3. 写缓存断言，证明成功和失败记录均不持久化原始 stdout/stderr。
4. 运行目标测试并确认先失败。
5. 实现单一共享环境构造器，两个进程入口共同使用。
6. 删除预览缓存中的原始构建日志写入。
7. 重跑相关测试。

## Task 3：统一跨平台集中资产库契约

**Files:**

- Modify: `docs/plans/2026-07-08-vibe-foundry-master-implementation.md`
- Modify: `docs/requirements/vibe-foundry-prd.md`
- Modify: `src/library/asset-library.ts`
- Modify: `tests/library/asset-library.test.mjs`
- Modify: `src/index.ts`
- Modify: `tests/distill-flow.test.mjs`
- Modify: `src/analyzers/book-distiller.ts`
- Modify: `tests/analyzers/book-distiller.test.mjs`
- Modify: `src/web/asset-view-model.ts`
- Modify: `tests/web/asset-view-model.test.mjs`
- Modify: `src/preview/component-preview-runtime.ts`
- Modify: `tests/preview/component-preview-runtime.test.mjs`
- Modify: `src/mcp/server.ts`
- Modify: `tests/mcp/server.test.mjs`
- Modify: `scripts/verify-mvp.mjs`

**Steps:**

1. 先同步总实现文档和 PRD：集中资产库采用环境覆盖或用户主目录默认值，当前消费者不再读取源项目 `.vibe-foundry`。
2. 写失败测试：显式环境根目录优先；默认根目录位于当前用户主目录；MCP 从集中资产库读取刚提炼的项目。
3. 将硬编码 Windows 路径替换为共享根目录解析器。
4. 让 CLI、书籍炼化、Web、MCP 和导出的组件预览 API 统一调用该解析器，不增加旧目录兜底；空的显式根目录不得退化为当前工作目录。
5. 重写 MVP 验证：创建临时资产库，提炼后从同一位置验证 MCP；只在仓库内检查 plugin JSON。
6. 在 `finally` 中清理临时验证目录。
7. 重跑相关测试和 `node scripts/verify-mvp.mjs`。

## Task 4：建立许可证、社区和 CI 发布面

**Files:**

- Create: `LICENSE`
- Create: `NOTICE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `docs/reports/open-source-release-checklist.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `tests/release/open-source-readiness.test.mjs`
- Modify: plugin/marketplace metadata files

**Steps:**

1. 加入 Apache License 2.0 与 NOTICE。
2. 写面向源码贡献者的 README、贡献指南、安全策略和行为准则。
3. 加入 Issue/PR 模板、Dependabot 和最小权限 CI；官方 Actions 固定到完整提交 SHA。
4. 更新 Codex plugin/marketplace 作者与项目元数据。
5. 扩展发布静态测试，检查许可证声明、必备社区文件、工作流最小权限和固定 SHA，再运行测试。

## Task 5：清理私有痕迹和失效契约

**Files:**

- Create: `tests/release/open-source-sanitization.test.mjs`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `.gitignore`
- Modify: `src/writers/agent-rules-writer.ts`
- Modify: `src/web/frontend.ts`
- Modify: current docs/runbooks/skills containing local paths or `.vibe-foundry`
- Untrack/ignore only: `.claude/skills/gitnexus*/**` and `.agents/skills/gitnexus*/**`; keep `.agents/skills/vibe-foundry/**` as the project-owned skill.

**Steps:**

1. 删除 `.claude/skills/gitnexus*/**` 与 `.agents/skills/gitnexus*/**` 第三方本地技能副本在公开索引中的条目，通过 `.gitignore` 保留本机副本并忽略本地 `*.db`、`*.sqlite`、`*.sqlite3`；项目自有 `.agents/skills/vibe-foundry/**` 保持公开。
2. 从项目规则文件中移除对应生成块，保留项目自有语言、实现约束和文档驱动规则。
3. 将个人用户名、私有项目名和绝对路径改成可复制的通用占位符。
4. 将当前使用说明统一到集中资产库；历史计划如保留，明确标注已被新契约取代。
5. 扫描旧路由、旧字段、旧 helper、旧参数和无调用符号，记录清理与保留理由。

## Task 6：发布前验证和首个提交

**Steps:**

1. 运行目标测试、`npm test`、`npm run build` 和 `node scripts/verify-mvp.mjs`。
2. 运行 `npm pack --dry-run --json`，核对包内容；项目仍保持不可发布。
3. 扫描秘密、个人路径、私有项目名和被忽略产物。
4. 运行 GitNexus `detect_changes` 并核对预期流程。
5. 检查 `git diff`、暂存区和未跟踪文件；仅加入确认公开的内容。
6. 创建 Apache-2.0 源码仓库的首个本地提交。
7. 再次向仓库所有者确认；得到确认后才创建 `Lucoshin/vibe-foundry` 公开仓库并推送 `main`。
