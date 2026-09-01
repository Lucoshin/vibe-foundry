# Source Analysis Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用 AST 驱动的源码索引替换正则场景解析，建立可信组件发现、多场景契约、严格预览状态与结构化设计资产提取。

**Architecture:** React/JSX 由 `@babel/parser` 生成语法树，Vue SFC 由 `@vue/compiler-sfc` 和 `@vue/compiler-dom` 解析；分析结果统一为文件索引、组件候选和调用场景。`component-catalog.json` 保存静态事实，`component-previews.json` 保存运行状态，Web 与 MCP 只消费统一契约。

**Tech Stack:** Node.js 20+、TypeScript、原生 ESM、Babel parser、Vue compiler、Node test runner、Vite。

---

### Task 1: 建立 AST 解析依赖与源码索引

**Files:**
- Modify: `package.json`
- Create: `src/analyzers/frontend-source-index.ts`
- Create: `tests/analyzers/frontend-source-index.test.mjs`

**Steps:**

1. 添加失败测试，覆盖 JSX/TSX 导入导出、Vue SFC 区块和来源位置。
2. 运行 `npm test -- tests/analyzers/frontend-source-index.test.mjs`，确认因模块缺失失败。
3. 安装 `@babel/parser`、`@vue/compiler-sfc`、`@vue/compiler-dom`。
4. 实现最小源码索引和规范化路径输出。
5. 运行定向测试并确认通过。

### Task 2: 用 AST 提取真实组件调用场景

**Files:**
- Modify: `src/analyzers/component-analyzer.ts`
- Modify: `tests/analyzers/component-analyzer.test.mjs`

**Steps:**

1. 添加失败测试：React 动态 props、嵌套 children、别名导入；Vue 事件 URL、指令、动态绑定、插槽和 kebab-case 标签。
2. 运行定向测试，确认现有正则产生错误属性或漏掉场景。
3. 在修改 `analyzeComponents` 前运行 GitNexus `impact --direction upstream` 并报告影响范围。
4. 实现基于导入解析的 JSX/Vue 场景提取；静态值进入 `props`，动态值进入 `unresolvedProps`。
5. 输出 `scenarios`、`primaryScenarioId`、`analysisEvidence`，并从主场景派生临时 `previewScenario`。
6. 删除旧正则解析 helper，运行定向测试。

### Task 3: 扩展组件发现并分类

**Files:**
- Modify: `src/scanner/project-scanner.ts`
- Modify: `src/index.ts`
- Modify: `tests/distill-flow.test.mjs`
- Create: `tests/scanner/project-scanner.test.mjs`

**Steps:**

1. 添加失败测试，覆盖 `features`、`layouts`、页面局部组件和 uni-app 分包。
2. 分别对 `scanProject`、`distillProject` 运行 GitNexus 上游影响分析。
3. 让扫描器输出源码根和页面根，由源码索引识别候选，不扫描依赖、构建产物和测试文件。
4. 根据路径、导出与调用证据生成 `componentType`。
5. 运行 scanner、analyzer 和 distill-flow 测试。

### Task 4: 收紧预览状态并删除假数据

**Files:**
- Modify: `src/preview/component-preview-runtime.ts`
- Modify: `src/web/asset-view-model.ts`
- Modify: `tests/preview/component-preview-runtime.test.mjs`
- Modify: `tests/web/asset-view-model.test.mjs`

**Steps:**

1. 添加失败测试，证明无场景、存在未解析必需项和缺少上下文时不能为 `ready`。
2. 添加失败测试，断言生成运行时不包含任何组件名专用业务数据。
3. 对 `buildComponentPreviewRegistry`、`propsCodeFor`、`componentPreviewOf` 运行上游影响分析。
4. 删除组件名 fallback；只使用主场景的静态 props、事件与插槽。
5. 实现 `ready/degraded/blocked` 单一状态语义并同步 Web 展示。
6. 清理旧状态分支、旧 helper 和失效测试。

### Task 5: 增强运行环境需求分析

**Files:**
- Modify: `src/preview/component-preview-runtime.ts`
- Modify: `tests/preview/component-preview-runtime.test.mjs`

**Steps:**

1. 添加失败测试，覆盖真实入口 Provider、样式链、别名和未解析环境变量。
2. 对 `discoverPreviewRuntimeContext` 运行上游影响分析。
3. 静态提取可证明的 Provider 与样式导入；不能构造的上下文写入 `unresolved`。
4. 保持网络阻断，禁止读取环境变量值。
5. 运行预览运行时测试。

### Task 6: 扩展设计 Token 与页面结构

**Files:**
- Modify: `src/analyzers/token-extractor.ts`
- Modify: `src/analyzers/page-pattern-summarizer.ts`
- Modify: `tests/analyzers/token-extractor.test.mjs`
- Modify: `tests/analyzers/page-pattern-summarizer.test.mjs`

**Steps:**

1. 添加 CSS 变量、Sass/Less 变量、作用域与页面结构失败测试。
2. 对两个 analyzer 的导出函数运行上游影响分析。
3. 实现最小结构化提取，保留来源和值，不合并冲突作用域。
4. 删除只按文件名生成 generic page 的冗余路径。
5. 运行定向测试。

### Task 7: 真实项目验证与文档收口

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/plans/2026-07-08-vibe-foundry-master-implementation.md`
- Modify: `docs/plans/2026-07-14-source-analysis-foundation.md`

**Steps:**

1. 运行 `npm test` 和 `npm run build`。
2. 重新炼化 React 与 uni-app 真实项目，记录组件、场景、未解析项和状态分布。
3. 对代表性 React/Vue 组件执行静态预览构建与浏览器挂载检查。
4. 运行 `node .gitnexus/run.cjs detect-changes -r vibe-foundry --scope compare --base-ref main`。
5. 更新计划中的验证结果、清理项、保留项和已知限制。

## 完成记录（2026-07-14）

### 实现结果

- 已用 Babel AST 与 Vue SFC/template AST 建立统一源码索引，组件场景只接受可追溯的导入与调用证据。
- 已输出多场景、主场景 ID、来源位置、置信度、完整度、静态 props、事件、插槽及未解析项。
- 已扩展 `features`、`layouts`、`providers` 和 uni-app 分包组件发现，并增加 `componentType`。
- 已统一预览状态：缺少导出或路径为 `blocked`；静态分析产生的可构建候选一律为 `degraded`；只有后续浏览器挂载验证通过才允许提升为 `ready`。
- 已从 CSS、Vue SFC style、Sass、Less 与 Tailwind 静态类中提取带真实值、语法、作用域和来源的设计 Token。
- 已从 React/Vue 页面 AST 提取导航、搜索、筛选、列表、空态、表单、遮罩和底部操作区。

### 真实项目结果

| 项目 | 组件 | 调用场景 | 无场景组件 | 含未解析项组件 | ready | degraded | blocked | Token | 页面模式 / 有结构区域 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 外部 React fixture | 49 | 97 | 22 | 24 | 0 | 49 | 0 | 530 | 216 / 54 |
| uni-app/Vue `uniapp-vue3-vite-ts-template-master` | 49 | 78 | 18 | 24 | 0 | 49 | 0 | 323 | 178 / 79 |

- React `ProtectedRoute` 的嵌套组件 children 被记录为 `unresolvedSlots: ["default"]`，状态为 `degraded`，不再误报 `ready`。
- uni-app `BasicButton` 的真实调用场景得到 `events: ["click"]` 与 `slots.default: "log"`；静态阶段状态为 `degraded`，限制为 `runtime-validation-pending`。
- Vue kebab-case 标签现在会与 PascalCase 导入关联，真实 uni-app 场景数由 72 增至 78。
- `QueryProvider` 被识别为 `componentType: "provider"`，其动态 children 同样保持未解析证据。

### 验证结果

- `npm test`：118 个测试、31 个套件全部通过，0 失败。
- `npm run build`：通过。
- 两个真实项目执行 `node dist/cli.js distill <project-root>`：均成功生成集中资产包。
- `PageLoadingState`（React）和 `BasicButton`（uni-app/Vue）执行静态预览构建：均成功。
- Playwright 浏览器挂载：React 加载态正常显示；Vue 按钮正常显示来源插槽文本 `log`；两者均由 `degraded/runtime-validation-pending` 持久化提升为 `ready/browser-mount`。
- 浏览器确认使用由 Web 服务在成功提供当前 cache key 静态入口后签发的一次性、组件绑定、HttpOnly/SameSite 凭证；未加载预览的直接 POST 返回 409。
- `HotSearchTags` 因目标项目缺少 `@ant-design/icons` 构建失败，注册表已持久化为 `blocked`，未保留虚假可构建状态；上表保留重新炼化后的静态分析分布，便于与分析阶段口径对比。
- `npm audit`：0 个漏洞。
- GitNexus `detect-changes --scope compare --base-ref main` 与 `--scope all` 均已执行，但仓库尚无 `main`、`HEAD` 或首个提交，无法建立 Git diff 基线；错误分别为 `unknown revision main` 和 `unknown revision HEAD`。

### 清理与保留

已清理：

- 删除正则驱动的组件调用场景解析路径。
- 删除所有按组件名注入的职位、公司、薪资、弹窗、分享码等伪业务 props。
- 删除“只要存在导出就 ready”的旧状态口径。
- 删除“静态场景完整即可 ready”的残余判定；静态候选统一等待运行验证。
- 删除仅凭依赖声明注入 Router、Pinia、Redux、i18n 的猜测路径。
- 删除只按文件名生成通用页面模式的旧提取方式。

仍保留：

- `previewScenario` 作为从主场景派生的临时兼容字段，避免当前 Web、MCP 与预览运行时同时发生无关迁移；真实数据源仍是 `scenarios`。
- 事件处理器使用确定性的空函数，作用仅是让组件可挂载，不制造业务结果。
- 外部网络阻断和隔离运行时继续保留，用于防止预览触发真实请求。
- 无真实调用场景的组件仍允许以 `degraded` 构建空 props 预览；状态与限制会明确暴露，不伪装为完整还原。

### 已知限制

- 缺少目标项目真实依赖时，静态预览会明确构建失败。例如 `HotSearchTags` 所需的 `@ant-design/icons` 在目标项目环境不可解析；炼化器不会用假图标替代。
- 动态表达式、运行期状态、嵌套组件插槽和无法静态构造的 Provider 仍标记为未解析，不猜测其运行值。
