---
project: VibeFoundry
category: adr
source_path: docs/adr/001-component-preview-runtime.md
status: accepted
last_updated: 2026-07-09
---

# ADR-001：使用 Vite 生成本地组件预览运行时

> **历史契约说明（2026-09-01）：** 本 ADR 的 Vite 选型仍有效；其中源项目内资产目录与平台专属绝对路径约定已被 central-only 集中资产库契约取代，不代表当前存储位置。

## 背景

VibeFoundry 需要在项目炼化后指定某个前端组件，并在浏览器中运行真实演示场景。现有 Web Asset Browser 只能显示资产卡片、语言标识和通用动画，不能证明组件源码真的可渲染、可交互。

真实组件预览需要一个 bundler，中文可理解为“打包/转译运行器”，负责处理 JSX、CSS、图片、第三方依赖和模块路径。

## 选项

### Storybook adapter

- 优点：stories、args、play function、iframe 和交互测试能力成熟。
- 缺点：需要引入并配置 Storybook，第一版成本较高，也会改变目标项目的开发工具链。

### 直接复用 react-scripts

- 优点：对 CRA 项目天然匹配。
- 缺点：CRA 限制不能从应用 `src/` 外部 import 源码；`.vibe-foundry/` 运行时无法直接引用目标组件。

### Vite 同源静态预览

- 优点：可在 `.vibe-foundry/preview-runtime` 中生成临时应用，由资产浏览器按需执行 Vite 静态构建，再通过同源 `/component-preview/<id>/` 路由返回；不修改目标项目 `src/`，也不暴露额外端口。
- 缺点：首次打开组件预览需要等待一次 Vite 构建；复杂 Provider、API、store 仍需要 mock。

## 决策

第一版采用 Vite 同源静态预览。

VibeFoundry 在 `distill` 时生成：

- `.vibe-foundry/component-previews.json`
- `.vibe-foundry/preview-runtime/`

资产库主入口是 Web Asset Browser。用户通过：

```bash
node dist/cli.js web <project-root> --port 4317
```

打开资产库。`web` 命令只启动这一个资产浏览器服务。组件卡片点击或悬浮时，浏览器请求同源 `/component-preview/<id>/` 路由；服务端按需构建该组件的静态预览包，并把生成物从 `.vibe-foundry/component-preview-static/<id>/` 返回给内嵌 iframe。

## 后果

- 目标项目源码不被修改，只写 `.vibe-foundry/` 输出。
- React、Vue SFC、JSX、CSS 和图片可以由 Vite 构建后在本地浏览器中运行。
- Web Asset Browser 保持单服务，同源 iframe 只加载当前资产浏览器返回的静态预览页面。
- 对缺 Provider、缺 props 或依赖真实 API 的组件，需要在 preview registry 中暴露状态和后续 mock 边界。
- 后续可以在此基础上增加 Storybook-compatible adapter，而不推翻现有资产协议。

## 验证方式

- 单元测试覆盖 preview registry 和 runtime 文件生成。
- CLI 测试确认只暴露 `distill` 和 `web` 命令。
- Web 测试覆盖组件点击预览、悬浮预览、同源 iframe 和 `/component-preview/<id>/` 静态资源路由。
- 真实项目验证使用一个外部 Vue / uni-app fixture。
