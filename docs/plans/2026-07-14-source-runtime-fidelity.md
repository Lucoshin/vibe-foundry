# Source Runtime Fidelity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 通过公开源页面的短生命周期实机采集和分层差异比较，让资产工作台能够证明组件预览与源项目实际运行效果的贴合程度。

**Architecture:** `distill` 保持纯静态和低成本；新增显式 `calibrate` 工作流，以用户确认的 package script 或 loopback URL 建立项目级采集会话。Reference、Candidate 和 Fidelity Result 使用独立摘要域并复用 SQLite lease/CAS，工作台只投影证据状态，不反写静态注册表。

**Tech Stack:** Node.js 22+、原生 ESM、Node test runner、SQLite、现有 CAS、Playwright Core、PNGJS、Pixelmatch、React/Vue/uni-app H5。

---

## 执行前约束

- 每个现有函数、类或方法修改前运行 GitNexus `impact <symbol> --direction upstream --repo vibe-foundry --include-tests`。
- HIGH/CRITICAL 必须先向用户报告影响面。
- 按 `superpowers:test-driven-development` 执行每个任务的 RED/GREEN。
- 当前仓库没有 `HEAD/main`，不能建立安全 worktree 或提交检查点；在用户创建首个提交前，不执行计划中的 commit 动作。
- 不修改被采集项目源码；所有输出写入集中资产包或临时目录。

### Task 1：定义采集、比较和状态协议

**Files:**
- Create: `src/fidelity/fidelity-protocol.ts`
- Test: `tests/fidelity/fidelity-protocol.test.mjs`
- Modify: `scripts/build.mjs`（仅当新目录未被现有递归构建自动覆盖时）

**Step 1: Write the failing test**

覆盖：

- `SourceCaptureSpec` 对象键顺序不影响摘要。
- route、viewport、DPR、theme、locator、state、collector/browser/runtime digest 任一变化都会失效。
- 绝对路径、PID、时间戳、Cookie 和环境变量值不允许进入 spec。
- 状态只接受 `calibrated/drifted/static-only/source-unreachable/ambiguous-locator/runtime-blocked`。

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/fidelity/fidelity-protocol.test.mjs`

Expected: FAIL，模块不存在。

**Step 3: Implement minimal protocol**

复用 `canonicalSerialize`，但使用独立域：

```js
sha256("vibe-source-capture-action-v1\0" + canonicalSerialize(spec))
sha256("vibe-preview-candidate-action-v1\0" + canonicalSerialize(spec))
sha256("vibe-fidelity-comparison-v1\0" + canonicalSerialize(spec))
```

协议只保存相对 usage source、公开 route、定位证据类型和值、可复现浏览器参数和摘要，不保存秘密值。

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/fidelity/fidelity-protocol.test.mjs`

Expected: PASS。

### Task 2：从源码索引生成公开路由和唯一定位证据

**Files:**
- Create: `src/analyzers/source-route-planner.ts`
- Create: `src/analyzers/component-locator-planner.ts`
- Test: `tests/analyzers/source-route-planner.test.mjs`
- Test: `tests/analyzers/component-locator-planner.test.mjs`
- Modify: `src/analyzers/frontend-source-index.ts`
- Modify: `src/analyzers/component-analyzer.ts`
- Modify: `src/index.ts`

**Step 1: Run impact analysis**

Targets: `buildFrontendSourceIndex`、`analyzeComponents`、`distillProject`。

**Step 2: Write failing route tests**

Fixtures 覆盖：

- Next `app/**/page.tsx` 到公开 route。
- Vue Router 静态 `{ path, component }`。
- React Router 静态 `<Route path element>`。
- uni-app `pages.json`。
- 动态 path、redirect、guard、鉴权包装保留 unresolved，不猜测公开性。

**Step 3: Write failing locator tests**

优先级必须为：`data-testid/id` > ARIA > 字面量文本/props > 稳定 class。多候选时输出证据列表，不自动 `.first()`。

**Step 4: Run tests to verify RED**

Run: `npm run build && node --test tests/analyzers/source-route-planner.test.mjs tests/analyzers/component-locator-planner.test.mjs`

**Step 5: Implement the minimal planners**

扩展源码索引只保留 AST 可证明的 route 和 locator 字段；组件资产新增 `sourceCaptureCandidates`，不新增猜测字段兼容层。

**Step 6: Run analyzer and distill regression tests**

Run: `npm run build && node --test tests/analyzers/*.test.mjs tests/distill-flow.test.mjs`

Expected: PASS。

### Task 3：建立安全的源项目会话监管器

**Files:**
- Create: `src/fidelity/source-session-supervisor.ts`
- Test: `tests/fidelity/source-session-supervisor.test.mjs`

**Step 1: Write failing tests with injected process/HTTP adapters**

覆盖：

- `--source-script dev` 只解析 package.json 中准确存在的 script，且必须同时提供预期 loopback `sourceUrl`。
- npm/pnpm/yarn 使用 executable + args，禁止拼接 shell 字符串。
- `--source-url` 只接受 `http://127.0.0.1`、`http://localhost` 或 `http://[::1]`。
- 健康检查成功后才 ready。
- 启动超时、页面失败和取消时关闭完整进程树。
- stdout/stderr 只保存限长安全摘要。

**Step 2: Run RED**

Run: `npm run build && node --test tests/fidelity/source-session-supervisor.test.mjs`

**Step 3: Implement minimal supervisor**

公开 API：

```js
openSourceSession(projectRoot, {
  sourceScript,
  sourceUrl,
  port,
  startupTimeoutMs,
  processAdapter,
  httpAdapter,
})
```

`sourceUrl` 必填；`sourceScript` 可选。只提供 URL 时连接已有服务，同时提供 script 与 URL 时启动后等待该 URL。不要依次尝试 `dev/start/serve`，也不要向脚本猜测性追加框架端口参数。

**Step 4: Run GREEN and process-leak regression**

Run: `npm run build && node --test tests/fidelity/source-session-supervisor.test.mjs`

Expected: PASS，测试断言所有模拟子进程均被回收。

### Task 4：实现单浏览器、按路由批量 Reference 采集

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/fidelity/browser-capture-driver.ts`
- Create: `src/fidelity/reference-collector.ts`
- Test: `tests/fidelity/browser-capture-driver.test.mjs`
- Test: `tests/fidelity/reference-collector.test.mjs`
- Create fixture: `tests/fixtures/fidelity-public-react/`

**Step 1: Verify dependency contract**

使用官方文档确认当前 Node 22 兼容版本，精确锁定 `playwright-core`。默认连接本机已安装的 Chrome/Edge；缺失浏览器时返回明确安装说明，不静默下载大型浏览器。

**Step 2: Write RED tests**

覆盖：

- 一个项目只启动一个 browser/context。
- 同一路由多个组件只导航一次。
- `document.fonts.ready`、两帧 requestAnimationFrame 和动画冻结后再采集。
- locator 必须唯一；0/2+ 匹配分别返回 `locator-missing/ambiguous-locator`。
- 登录跳转、外站跳转、console error、资源失败产生结构化诊断。
- Reference Artifact 不包含 Cookie、Token、请求/响应正文。

**Step 3: Implement collector**

采集 PNG、DOM 摘要、关键 bbox、允许列表 Computed Style、可见文本与 ARIA 摘要。禁止完整 HTML dump。

**Step 4: Run browser fixture tests**

Run: `npm run build && node --test tests/fidelity/browser-capture-driver.test.mjs tests/fidelity/reference-collector.test.mjs`

Expected: PASS；测试结束无浏览器进程残留。

### Task 5：实现 Candidate 采集与分层比较器

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/fidelity/candidate-collector.ts`
- Create: `src/fidelity/fidelity-comparator.ts`
- Test: `tests/fidelity/candidate-collector.test.mjs`
- Test: `tests/fidelity/fidelity-comparator.test.mjs`

**Step 1: Add exact image dependencies**

精确锁定 `pngjs` 与 `pixelmatch`；不得引入第二套浏览器或图像处理运行时。

**Step 2: Write RED tests**

固定 PNG fixtures 覆盖：

- 完全一致。
- 仅抗锯齿噪声。
- 宽度偏移、子节点缺失、字体 fallback、颜色漂移。
- 运行层失败不得被高视觉分掩盖。
- 输出差异 PNG 和结构化原因。

**Step 3: Implement comparator**

输出独立维度：`runtime`、`geometry`、`visual`、`structure`。`calibrated` 必须先通过运行、几何和结构门槛；不计算会隐藏硬失败的单一总分。

**Step 4: Run GREEN**

Run: `npm run build && node --test tests/fidelity/candidate-collector.test.mjs tests/fidelity/fidelity-comparator.test.mjs`

### Task 6：扩展 SQLite/CAS 保存采集结果和引用

**Files:**
- Modify: `src/preview/preview-action-store.ts`
- Modify: `src/preview/preview-build-cache.ts`
- Modify: `src/preview/preview-cache-maintenance.ts`
- Create: `src/fidelity/fidelity-store.ts`
- Test: `tests/fidelity/fidelity-store.test.mjs`
- Modify: `tests/preview/preview-action-store.test.mjs`
- Modify: `tests/preview/preview-cache-maintenance.test.mjs`

**Step 1: Run impact analysis**

Targets: `openPreviewActionStore`、`openPreviewBuildCache`、`collectPreviewCacheGarbage`。

**Step 2: Write schema v3 migration RED tests**

新增 `capture_actions`、`fidelity_results`、`capture_refs`，覆盖 v2→v3、lease 单飞、Reference/Candidate/Report CAS 引用和 GC roots。

**Step 3: Implement migration and store**

构建 Action 与 Capture Action 保持独立表和摘要域；不要复用单一 `action_refs` 字段表达两种语义。

**Step 4: Run persistence regression**

Run: `npm run build && node --test tests/fidelity/fidelity-store.test.mjs tests/preview/*.test.mjs`

Expected: PASS。

### Task 7：新增显式 calibrate CLI 与增量编排

**Files:**
- Create: `src/fidelity/calibrate-project.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- Test: `tests/fidelity/calibrate-project.test.mjs`
- Modify: `tests/cli.test.mjs`
- Modify: `docs/runbooks/use-web-asset-browser.md`

**Step 1: Run impact analysis**

Targets: `runCli`、`distillProject`。

**Step 2: Write CLI RED tests**

契约：

```text
vibe-foundry calibrate <project-root> --source-script dev --source-url http://127.0.0.1:5173
vibe-foundry calibrate <project-root> --source-url http://127.0.0.1:5173
```

URL 必填、script 可选；`distill` 不自动启动源项目。未变化 Reference Action 应显示 `HIT`，且 process/browser adapter 启动计数为 0。

**Step 3: Implement orchestrator**

流程：读取资产包 → 规划变更 capture actions → 若全命中直接退出 → 建立一次 source session → 路由分组采集 → 构建/读取 Candidate → 比较 → 提交 Fidelity Result。

**Step 4: Run CLI and cache tests**

Run: `npm run build && node --test tests/fidelity/calibrate-project.test.mjs tests/cli.test.mjs tests/distill-flow.test.mjs`

### Task 8：在资产工作台展示保真度证据

**Files:**
- Modify: `src/web/asset-view-model.ts`
- Modify: `src/web/server.ts`
- Modify: `src/web/frontend.ts`
- Modify: `tests/web/asset-view-model.test.mjs`
- Modify: `tests/web/server.test.mjs`
- Modify: `tests/web/frontend.test.mjs`

**Step 1: Run impact analysis**

Targets: `loadAssetViewModel`、`createWebRequestHandler`、相关 preview render 函数。

**Step 2: Write RED tests**

覆盖：

- 卡片显示六种 fidelity 状态。
- Inspector 展示 Reference/Candidate/Diff 三图和四层诊断。
- CAS 图片 API 校验 digest 与 MIME，不接受任意文件路径。
- `static-only` 和失败状态显示原因，不展示伪相似度。

**Step 3: Implement minimal UI projection**

只增加一个保真度面板，不重做现有工作台布局。图像按需加载，资产列表 API 不触发采集或构建。

**Step 4: Run Web tests**

Run: `npm run build && node --test tests/web/*.test.mjs`

### Task 9：真实项目性能基线、清理和最终验收

**Files:**
- Create: `docs/reports/2026-07-14-source-runtime-fidelity-baseline.md`
- Modify: `docs/plans/2026-07-14-source-runtime-fidelity.md`
- Modify: `docs/runbooks/use-web-asset-browser.md`

**Step 1: Verify fixture behavior**

对 React、Vue、uni-app H5 公开 fixture 执行首次校准与二次校准，记录：

- sourceStartupMs、routeNavigationMs、captureMs。
- browser/source peak RSS。
- Reference/Candidate cache hit rate。
- 进程退出后遗留 PID 数量。

**Step 2: Verify the two real projects**

只选择无需登录的公开路由。无法唯一定位的组件记录状态，不手工改成通过。

**Step 3: Clean obsolete paths**

检查并报告：旧 locator helper、旧视觉状态字段、失效参数、重复截图路径、未调用比较 helper。保留项必须说明理由。

**Step 4: Full verification**

Run:

```text
npm test
npm run build
npm audit --audit-level=high
node .gitnexus/run.cjs analyze
node .gitnexus/run.cjs detect-changes --scope compare --base-ref main --repo vibe-foundry
```

若仓库仍无 `HEAD/main`，再执行 `--scope all` 并在报告中记录基线限制。

## 明确不在本阶段范围

- 登录脚本、测试账号、Storage State 和登录后页面。
- 真实业务写操作、真实后端响应快照。
- 自动修复预览代码以提高分数。
- 长驻浏览器 daemon。
- 远程采集和远程缓存。
