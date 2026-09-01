# Preview Action Cache Implementation Plan

> **当前状态（2026-09-01）：** 已完成。Action Cache/CAS 是唯一预览缓存来源；首发前已删除旧静态目录、marker 与 `cacheKey` 读取兼容，`MISS` 直接构建。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把组件预览升级为可跨重启复用、并发单飞、崩溃一致且可解释的持久化构建系统。

**Architecture:** 静态注册表只描述当前预览 ActionSpec；SQLite 保存动作、租约和验证记录；CAS 按完整 SHA-256 保存不可变产物树。Web 请求先解析动作摘要并查询 Action Cache，未命中时领取 lease、在临时目录构建并原子提交，随后从 CAS 提供内容。

**Tech Stack:** Node.js LTS、TypeScript、原生 ESM、Node test runner、better-sqlite3、Vite、SHA-256。

---

### Task 1：建立规范化动作协议

**Files:**
- Create: `src/preview/preview-action.ts`
- Create: `tests/preview/preview-action.test.mjs`
- Modify: `src/preview/component-preview-runtime.ts:69`
- Modify: `tests/preview/component-preview-runtime.test.mjs:78`

**Steps:**

1. 新增失败测试：对象键顺序不影响摘要；源码、场景、运行上下文、builder、工具链和平台任一变化都会改变摘要；摘要为完整 64 位十六进制 SHA-256。
2. 运行 `npm test -- tests/preview/preview-action.test.mjs`，确认因模块缺失或 API 缺失失败。
3. 在修改 `buildComponentPreviewRegistry` 前运行 GitNexus 上游 impact 并报告风险。
4. 实现递归 canonical serialization、`PreviewActionSpec` 构造和带域分隔的 SHA-256。
5. 让注册表输出 `actionDigest` 和可诊断的动作输入摘要；删除旧 16 位 `cacheKey` 生成逻辑。
6. 运行两个定向测试并确认通过。

### Task 2：建立 SQLite Action Cache

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/preview/preview-action-store.ts`
- Create: `tests/preview/preview-action-store.test.mjs`

**Steps:**

1. 新增失败测试，覆盖 schema 初始化、动作成功/确定性失败/瞬时失败、Validation Result 与过期 lease 回收。
2. 运行定向测试，确认模块缺失失败。
3. 安装并固定 `better-sqlite3`，将最低 Node 版本升级到受支持 LTS。
4. 实现 `actions`、`validations`、`leases` 和 `schema_metadata` 表；开启 WAL、foreign keys、busy timeout 和 defensive 配置。
5. 使用唯一 `action_digest` 和带 owner 的条件更新实现跨进程 lease。
6. 运行定向测试并确认通过。

### Task 3：建立不可变 CAS 与原子提交

**Files:**
- Create: `src/preview/preview-artifact-store.ts`
- Create: `tests/preview/preview-artifact-store.test.mjs`

**Steps:**

1. 新增失败测试，覆盖文件摘要、确定性目录树摘要、路径穿越/符号链接拒绝、重复提交幂等和文件篡改检测。
2. 运行定向测试并确认模块缺失失败。
3. 实现 Blob 与 Artifact Tree 的 SHA-256 内容寻址格式。
4. 使用同分区临时路径、文件同步与原子重命名提交对象；已存在对象必须重新验证而不是覆盖。
5. 实现按树摘要 materialize（物化）到服务目录或直接解析文件。
6. 运行定向测试并确认通过。

### Task 4：集成预览构建与动作结果

**Files:**
- Create: `src/preview/preview-build-cache.ts`
- Create: `tests/preview/preview-build-cache.test.mjs`
- Modify: `src/preview/component-preview-runtime.ts:1559-1695`
- Modify: `tests/preview/component-preview-runtime.test.mjs`
- Modify: `src/writers/asset-writer.ts:47-144`
- Modify: `tests/distill-flow.test.mjs:209`

**Steps:**

1. 新增失败测试：重复 `distill` 保持同一 actionDigest；组合缓存协调层可提交并重开命中；构建成功记录 ActionResult；确定性失败不会因刷新被清除；注册表生成不覆盖验证记录。
2. 对 `prepareComponentPreviewRuntime`、`buildComponentPreviewStaticBundle` 和 `writeAssetPackage` 分别运行上游 impact。
3. 构建到临时目录，成功后提交 CAS，再在事务中提交 ActionResult。
4. 构建失败只写动作失败记录，不修改静态分析注册表。
5. 删除构建时无条件重写 `component-previews.json` 的路径。
6. 运行 preview 与 distill 定向测试。

### Task 5：集成 Web 单飞、状态投影与可解释命中

**Files:**
- Modify: `src/web/server.ts:105-296`
- Modify: `tests/web/server.test.mjs`
- Modify: `src/web/asset-view-model.ts:101-127`
- Modify: `tests/web/asset-view-model.test.mjs`

**Steps:**

1. 新增失败测试：重启 handler 不重建；并发请求只构建一次；过期 lease 可恢复；损坏产物不提供；缓存诊断接口返回原因。
2. 对 `createWebRequestHandler`、当时的缓存查询 helper、`startPreviewBuild` 和 `componentPreviewOf` 运行上游 impact。
3. 以 SQLite lease 作为跨进程事实来源，内存 Promise 只作为进程内优化。
4. 从 ActionResult 与 ValidationResult 投影 `pending/building/validating/ready/blocked/retrying`。
5. 新增只读诊断响应，返回命中原因和 actionDigest，不返回环境变量值或项目秘密。
6. 运行 Web 定向测试。

### Task 6：垃圾回收与旧逻辑清理（legacy 迁移方案已收缩）

**Files:**
- Create: `src/preview/preview-cache-maintenance.ts`
- Create: `tests/preview/preview-cache-maintenance.test.mjs`
- Modify: `src/preview/component-preview-runtime.ts`
- Modify: `src/web/server.ts`

**Steps:**

1. 新增失败测试，覆盖 legacy 目录被忽略、当前引用标记、活跃 lease 保护和宽限期清除。
2. 不实现 legacy import；Action Cache `MISS` 直接构建并提交 CAS。
3. 实现 mark-and-sweep；根包括当前组件动作引用、宽限期内动作和活跃 lease，Validation Result 随已删除 Action 一并清理。
4. 删除 `.vibe-foundry-preview-cache-key`、旧 `cacheKey` 与历史静态包的全部读写路径；清理注册表双写字段、可变运行字段和无调用 helper。
5. 运行全部 preview/web/distill 测试。

### Task 7：文档与最终验证

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/plans/2026-07-08-vibe-foundry-master-implementation.md`
- Modify: `docs/plans/2026-07-14-preview-action-cache.md`
- Modify: `docs/runbooks/use-web-asset-browser.md`

**Steps:**

1. 运行 `npm test`。
2. 运行 `npm run build`。
3. 对 fixture 和两个真实前端项目重新执行 distill，验证重复执行的 actionDigest 不变。
4. 启动 Web 服务，验证缓存预览在服务重启后零构建命中。
5. 运行 GitNexus `detect_changes --scope compare --base-ref main`；若仓库仍没有基线，再运行 `--scope all` 并记录限制。
6. 更新完成记录，明确清掉什么、保留什么及保留原因。

## 明确不在本阶段范围

- 不实现远程缓存服务。
- 不上传项目源码或构建产物。
- 不连接真实业务后端。
- 不自动兼容未确认的旧字段名。
- 不把绝对项目路径、时间戳、PID 或环境变量值放进动作摘要。

## 实现完成记录（2026-07-14）

- 已完成规范化 ActionSpec、完整 SHA-256 摘要、SQLite schema v2、跨进程 lease、不可变 CAS、浏览器验证证据、状态投影与只读诊断接口。
- `distill` 只写静态注册表和当前 `action_refs`；构建与验证不再反写 `component-previews.json`。
- 构建在 owner 隔离临时目录执行，CAS 提交成功后才事务性提交 Action Result；32 个并发同动作请求的测试只执行一次构建。
- 确定性失败进入负缓存；瞬态失败采用 1 秒起步指数退避和默认 3 次尝试预算。
- GC 按当前动作引用、近期动作与活跃 lease 标记，先删除数据库孤立 Action，再按 mtime 宽限期清扫 Tree/Blob。
- 已删除新注册表的 `cacheKey` 双写、构建时注册表重写、旧 marker 写入和绕过证据 CAS 的原始验证入口。
- 已删除旧 marker 只读导入路径；仅保留进程内 Promise Map 以减少同进程等待开销，SQLite lease 仍是跨进程唯一事实来源。
- 固定 `better-sqlite3` 为 `12.10.0`，项目最低 Node.js 版本为 22。

### 验收证据

- `npm test`：143 个测试全部通过，0 失败。
- `npm run build`：退出码 0。
- `npm audit --audit-level=high`：0 个漏洞。
- fixture 使用不同 `generatedAt` 连续炼化两次：1 个预览的 `actionDigest` 稳定。
- 外部 React fixture 连续炼化两次：49 个预览摘要稳定。
- 外部 Vue / uni-app fixture 连续炼化两次：49 个预览摘要稳定。
- Web 回归覆盖 handler 形态重启后直接命中 CAS，构建计数保持为 1；32 个并发同动作请求构建计数保持为 1。
- GitNexus 索引刷新成功：1,210 nodes、2,337 edges、64 clusters、94 flows。
- `detect-changes --scope compare --base-ref main` 与 `--scope all` 均已执行，但仓库尚无 `main`、`HEAD` 或首个提交，Git 无法产生变更基线；未擅自创建提交。
