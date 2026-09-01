---
project: VibeFoundry
category: implementation-plan
source_path: docs/plans/2026-07-08-component-preview-runtime.md
status: active
last_updated: 2026-07-11
---

# Component Preview Runtime

> **历史契约说明（2026-09-01）：** 本文保留用于决策追溯；其中源项目内资产目录与平台专属绝对路径约定已被 central-only 集中资产库契约取代，其余组件预览交互决策仍可参考。

## 1. 目标

在项目完成 `distill` 后，VibeFoundry 可以在 Web Asset Browser 同一个 Web 服务中查看真实组件预览。组件点击或悬浮预览时按需构建单组件静态预览包，预览页面通过同源 `/component-preview/<id>/` 路由加载。

## 2. 第一版范围

包含：

- 为 component catalog 生成 `component-previews.json`。
- 在 `.vibe-foundry/preview-runtime` 生成 Vite React 预览应用。
- 为 `.vue` 单文件组件生成 Vite Vue 预览入口，使 Vue SFC 可以通过同源组件预览路由打开真实组件预览。
- `web <project-root>` 只启动 Web Asset Browser 一个 HTTP 服务。
- Web Asset Browser 作为唯一主界面：组件卡片展示静态交互线索；点击卡片或预览按钮时，右侧详情用同源 iframe 打开真实组件预览；悬浮停留时显示同源预览浮层。
- 真实组件预览通过 `/component-preview/<id>/` 路由返回静态构建产物。
- 为常见组件名生成基础 mock props：
  - `ShareJobPanel`
  - `ReferralSharePosterPreview`
  - Dialog / Modal / Confirm 类组件默认打开并填充标题、正文和确认/取消按钮文本。
  - 通用组件空 props。

不包含：

- 自动推导所有业务 Provider、store、API mock。
- 修改目标项目 `src/`。
- 默认安装 Storybook。
- 云端运行或在线发布。
- 完整模拟 uni-app 平台 API、登录态、全局 store 或条件编译环境；复杂组件仍可能在运行时显示依赖缺失错误。

## 3. 数据流

```text
component-catalog.json
  -> component-previews.json
  -> preview-runtime/src/previews/*.jsx / *.vue
  -> Vite static build for one selected component
  -> Web Asset Browser /component-preview/<id>/

asset-manifest.json / component-catalog.json
  -> node dist/cli.js web <project-root>
  -> Web Asset Browser static asset cards
```

## 4. 验收标准

### 2026-07-11 预览交互与响应速度修正

- 嵌入预览只在内容横向溢出时缩放，不因长页面高度把组件压缩成不可操作的缩略图；纵向内容在预览画布内滚动。
- 组件详情不再展示通用“交互线索”说明卡和固定试玩台解释文案，只保留真实预览、必要元数据和操作按钮。
- Web 资产 API 返回后，以有限并发在后台预热 ready 组件；请求本身不得等待预览构建。
- 保留现有 `/component-preview/<id>/` 契约和磁盘静态缓存。后续若预热仍不足，再升级为按项目与框架共享 Vite 模块图的常驻预览服务。

- `npm test` 通过。
- `npm run build` 通过。
- `node dist/cli.js distill examples/fixture-project` 生成 `component-previews.json`。
- `component-previews.json` 中每个 ready preview 包含稳定 id、组件路径和同源 `/component-preview/<id>/` URL，不包含额外服务入口字段。
- `.vue` 组件的 ready preview 使用 `vite-vue` runtime，生成 Vue `createApp` 入口和 `.vue` wrapper。
- `node dist/cli.js web examples/fixture-project --port 4317` 只启动资产浏览器服务。
- Web Asset Browser 中组件卡片点击或悬浮可在同一个 Web 服务内查看真实组件预览。
- `/component-preview/<id>/` 可返回 React 组件和普通 Vue SFC 的静态预览页。
- `/component-preview/<id>/` 首次未命中缓存时必须立即返回可见加载页，并在后台构建完成后自动刷新，不阻塞 iframe 首屏响应。
- 后台预览构建失败不得产生未处理 Promise rejection，不得让失败状态永久粘在内存中；后续请求必须能重新触发构建。
- 服务重启后若中心资产库或项目 `.vibe-foundry/component-preview-static/<id>/index.html` 已存在，必须直接读取磁盘缓存，不重新构建。
- 一个外部 Vue / uni-app fixture 中至少能在资产浏览器同源预览一个 Vue SFC，并用浏览器截图验证非空。
- 嵌入式预览会根据 iframe 可用宽高自适应：组件只缩小不放大，SVG、图片、canvas 和 video 不得溢出预览窗口。
- Dialog / Modal / Confirm 类 Vue 组件在无业务状态注入时也应生成可见 mock props，避免构建成功但默认关闭导致空白预览。

## 5. 风险

- 组件依赖复杂 Provider 或真实 API 时，第一版只能显示失败原因或需要 mock。
- 目标项目缺少 React 依赖或 JSX 不是 React 组件时，preview 标记为 blocked。
- 目标项目缺少 Vue 依赖或 Vue plugin 无法解析项目级别别名时，Vue preview 会在运行时显示错误。
- Vite build 通过 `npx` 获取，不写入 VibeFoundry 依赖树。
