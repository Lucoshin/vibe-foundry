---
project: VibeFoundry
category: implementation-plan
source_path: docs/plans/2026-07-11-central-asset-library.md
status: approved
last_updated: 2026-07-11
---

# 集中资产库实施计划

> **历史契约说明（2026-09-01）：** 本文的稳定项目标识与集中索引设计仍有效；硬编码 Windows 集中库路径及源项目旧目录操作已被 central-only 跨平台集中资产库契约取代。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将炼化结果写入集中资产库，并让默认 Web 浏览器聚合展示所有已炼化项目的资产。

**Architecture:** 新增集中库模块，负责生成稳定项目标识、维护索引并为每个源项目分配独立资产包目录。炼化 writer 接收输出目录，Web view model 从集中索引逐包读取并合并资产；显式传入项目目录的旧 Web 用法保留为单项目查看。

**Tech Stack:** Node.js 20+、原生 ESM、Node test runner、TypeScript。

---

### Task 1: 集中库协议

**Files:**
- Create: `src/library/asset-library.ts`
- Test: `tests/library/asset-library.test.mjs`

**Step 1: Write the failing test**

测试两个不同源路径会生成不同项目目录，且重复注册同一路径仅更新该项目的索引条目。

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/library/asset-library.test.mjs`
Expected: FAIL because the library module does not exist.

**Step 3: Write minimal implementation**

实现集中库根路径常量、项目标识生成、索引读取与更新，以及按项目标识返回资产包目录。

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/library/asset-library.test.mjs`
Expected: PASS.

### Task 2: 集中写入

**Files:**
- Modify: `src/index.ts`
- Modify: `src/writers/asset-writer.ts`
- Modify: `tests/distill-flow.test.mjs`

**Step 1: Write the failing test**

断言炼化结果写入临时集中库中的项目目录，索引记录源路径，且不在源项目创建 `.vibe-foundry/`。

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/distill-flow.test.mjs`
Expected: FAIL because the writer still uses the source项目目录。

**Step 3: Write minimal implementation**

让 `distillProject` 解析或接收集中库根目录，将 writer 输出切换到集中库的项目目录，并更新索引。

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/distill-flow.test.mjs`
Expected: PASS.

### Task 3: 集中浏览

**Files:**
- Modify: `src/web/asset-view-model.ts`
- Modify: `src/web/server.ts`
- Modify: `src/cli.ts`
- Modify: `tests/web/asset-view-model.test.mjs`
- Modify: `tests/web/cli-web.test.mjs`

**Step 1: Write the failing test**

断言集中库读取会合并两个项目的资产并保留来源项目；`web` 无目标参数时使用集中库。

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/web/asset-view-model.test.mjs tests/web/cli-web.test.mjs`
Expected: FAIL because Web 仅支持单个源项目目录。

**Step 3: Write minimal implementation**

新增集中库 view model，保留显式项目目录的单项目模式；`web` 的默认目标改为集中库。

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/web/asset-view-model.test.mjs tests/web/cli-web.test.mjs`
Expected: PASS.

### Task 4: 文档、历史产物与验证

**Files:**
- Modify: `README.md`
- Modify: `docs/runbooks/use-web-asset-browser.md`
- Modify: `docs/README.md`
- Historical cleanup target: `<external-vue-project-root>/.vibe-foundry/`
- Historical cleanup target: `<external-react-project-root>/.vibe-foundry/`

**Step 1: 更新说明**

记录集中库默认路径、炼化命令、默认浏览器命令以及显式单项目查看命令。

**Step 2: 清理历史源项目产物**

确认两个绝对目录后删除其 `.vibe-foundry/`，不删除任何源代码。

**Step 3: 验证**

Run: `npm test`, `npm run build`, and two real-project `distill` commands.
Expected: 集中库有两个项目条目，默认 Web API 返回两个项目的资产。

### Task 5: 中心库组件预览修复

**Files:**
- Modify: `src/preview/component-preview-runtime.ts`
- Modify: `src/web/asset-view-model.ts`
- Modify: `src/web/server.ts`
- Modify: `tests/preview/component-preview-runtime.test.mjs`
- Modify: `tests/web/server.test.mjs`

**Step 1: 修复资产包路径传递**

组件预览构建从中心库资产包目录读取 `component-catalog.json`，并把 `preview-runtime-static` 与 `component-preview-static` 写入同一个中心库项目目录。

**Step 2: 修复依赖解析**

生成的 Vite 配置从源项目 `package.json` 派生应用依赖 alias，但排除 `vite` 和 `@vitejs/plugin-vue` 这类预览构建工具链依赖；Vue 预览构建临时提供 `sass-embedded` 以支持 `<style lang="scss">`。

**Step 3: 真实项目验证**

验证两个外部 fixture 组件的 `/component-preview/<id>/` 均返回 200；删除历史源项目资产目录后，集中库预览仍可重新构建并返回 200。

### Task 6: 外层目录炼化一致性

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/distill-flow.test.mjs`

**Step 1: 修复外层目录解析**

当用户传入的目录没有 `package.json` 时，`distillProject` 会在该目录下查找可炼化的前端项目根。若只找到一个候选，则使用该候选的真实路径写入中心库索引，避免用户传外层目录和真实项目目录时生成两套资产。

**Step 2: 拒绝歧义目录**

若外层目录下存在多个可炼化前端项目，命令必须报错并列出候选路径，要求用户传入具体项目根，不得猜测选择其中一个。

**Step 3: 验证**

Run: `node --test tests/distill-flow.test.mjs`.
Expected: 唯一候选自动解析，多候选目录明确拒绝。
