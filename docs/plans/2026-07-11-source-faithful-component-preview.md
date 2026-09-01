# Source-faithful Component Preview Implementation Plan

> **历史契约说明（2026-09-01）：** 文中涉及源项目内资产目录的约定已被 central-only 集中资产库契约取代。当前仅使用 Action Cache/CAS，不再读取或写入旧 `.vibe-foundry-preview-cache-key`、`component-preview-static` 或 `cacheKey`；下方第 7 节是已被取代的历史方案。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让组件炼化优先复用源项目中的真实用法与运行环境，使预览的外观、初始状态和交互尽量贴近源码。

**Architecture:** `component-catalog.json` 是预览契约的单一真相来源。组件分析器按“真实调用点 > 源码默认值 > 受控通用 fallback”生成 `previewScenario`，预览运行时根据项目依赖和入口代码注入可确定创建的 Router/Store Provider；无法确认的上下文显式列为 blocker，不连接真实后端。Web 端取消全库启动后的无界预热，只在用户发起预览时按需构建并复用磁盘缓存。

**Tech Stack:** Node.js 20+、原生 ESM、Vite、React/Vue、Node test runner。

---

## 1. 调研结论

- Storybook 以 story args、decorators、loaders 和 play function 作为组件场景真相，不靠组件名猜数据。
- Playwright Component Testing 通过浏览器 facade 页面挂载组件，并用 beforeMount 注入 Router/Provider；网络在浏览器边界拦截。
- Vitest Browser Mode 强调真实 DOM、CSS、浏览器 API 和事件传播，外部依赖应隔离。
- 本项目保持零核心依赖，不引入 Storybook/MSW；先实现可静态证明的调用点与 Provider 注入，不能证明的上下文显式报告。

## 2. 契约

`previewScenario`：

- `source`: `usage`、`defaults` 或 `fallback`。
- `sourceFile`: 场景来源文件；无真实来源时为空。
- `props`: 仅包含从源码读取的字符串、数字、布尔值、数组和对象字面量。
- `events`: 源组件声明的事件/回调名，运行时注入本地空函数。
- `unresolvedProps`: 真实调用点中的动态表达式字段名；保留缺失信息但不把表达式文本伪装成业务值。

`runtimeContext`：

- `providers`: 可确定创建的 Router/Pinia 等 Provider。
- `globalStyles`: 项目入口导入的全局样式。
- `plugins`: 入口虚拟样式所需、且可安全独立构造的 Vite 插件，当前支持 UnoCSS。
- `networkPolicy`: 固定为 `block-external`。
- `unresolved`: 检测到但无法安全构造的 store/API/i18n 上下文。

旧资产没有这些字段时继续使用现有 fallback，不猜测兼容字段。

## 3. TDD 任务

1. 在组件分析器测试中新增 JSX/Vue 真实调用点、默认 props 和事件提取用例，先观察失败。
2. 实现最小 `previewScenario` 分析并传播到 component catalog。
3. 在预览运行时测试中新增真实 props 优先于组件名 fallback、React MemoryRouter、Vue Pinia/Memory Router 和外部网络隔离用例，先观察失败。
4. 实现确定性 runtime context 发现与 wrapper 生成；无法构造的上下文写入 `unresolved`。
5. 在 Web server 测试中把全库预热改为显式单组件 warmup/按需构建，验证 `/api/assets` 不触发构建。
6. 运行 `npm test`、`npm run build`、fixture distill、真实浏览器预览和 `detect_changes`。

## 4. 明确不做

- 不调用真实业务后端，不伪造登录、金额、权限等业务结果。
- 不执行任意 story loader 或项目测试代码。
- 不自动创建无法确认 reducer、API client、i18n messages 的 Provider。
- 不修改被炼化项目源码。

## 5. 验收

- 有真实调用点时预览 props 与源码字面量一致，并记录来源文件。
- React Router、Vue Router、Pinia 等可确定上下文自动安装。
- 未解析上下文可见且可追踪，不静默生成假数据。
- 资产 API 不再触发数百组件后台构建。
- 全量测试、构建和真实预览通过。

## 6. uni-app H5 宿主运行时

- Vue 组件源码包含 uni-app 内置标签时，炼化结果记录 `platformRuntime: "uni-h5"`，不再按普通 Vue DOM 语义预览。
- 隔离预览从源项目的 `@dcloudio/uni-h5` 注册官方 H5 组件，并加载 `@dcloudio/uni-components` 官方样式；缺少依赖时显式阻断预览。
- 组件样式中的 `rpx` 按 uni-app 的 750 基准、960px 最大适配宽度和 375px 宽屏基准转换，避免桌面预览放大失真。
- 不复用完整应用级 `@dcloudio/vite-plugin-uni`：隔离组件没有完整 `pages.json`、`manifest.json` 和应用入口，强接应用编译链会降低隔离性和构建速度。

## 7. 历史方案：组件级预览缓存（已被 Action Cache 取代）

- 历史实现曾生成 `cacheKey`、marker 与可变静态目录；这些读写兼容已在首次公开发布前删除。
- 当前仅在 Action Cache `HIT` 时复用 CAS 产物；`MISS` 直接构建并提交 CAS，legacy 目录一律忽略。
