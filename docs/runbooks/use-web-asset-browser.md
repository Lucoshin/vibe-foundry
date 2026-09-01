---
project: VibeFoundry
category: runbook
source_path: docs/runbooks/use-web-asset-browser.md
status: active
last_updated: 2026-09-01
---

# 使用 Web Asset Browser

VibeFoundry Web Asset Browser 是本地资产浏览器，用来快速查看集中资产库中积累的组件、服务、业务流程、设计 tokens、产品设计资产和文化隐喻资产。集中库优先使用 `VIBE_FOUNDRY_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibe-foundry/library`。Web API 保持只读；组件标签编辑和删除只保存为浏览器本地视图状态，不修改集中资产包或源码文件。

## 1. 生成资产包

```bash
node dist/cli.js distill examples/fixture-project
```

真实项目中替换为：

```bash
node dist/cli.js distill <project-root>
```

`distill` 把结果写入 `<asset-library-root>/projects/<project-id>`，不会在源项目目录创建资产包。

## 2. 启动 Web

```bash
node dist/cli.js web --port 4317
```

默认启动会聚合展示集中库中的所有项目。需要单项目排查时仍可显式运行：

```bash
node dist/cli.js web <project-root> --port 4317
```

启动 Web Asset Browser 只会启动资产浏览器服务。组件资产卡片展示静态交互线索；点击组件卡片或预览按钮时，右侧详情会在同一个 Web 服务中加载真实组件预览；悬浮停留时显示预览浮层。当前支持 React 组件和普通 Vue SFC，不需要额外端口或额外命令。

组件预览只应执行可信源码：预览页面与 Web Asset Browser 同源，可访问父窗口及同源的其他 API；`networkPolicy: "block-external"` 只用于确定性地阻断外部网络请求，不是安全沙箱。不要用 Web Asset Browser 预览不可信项目，也不要把服务暴露给不可信网络。

打开：

```text
http://127.0.0.1:4317/
```

## 3. 界面结构

Web 端采用苹果风、极简、干净线条和简洁说明：

- 左侧分类导航：Overview、Components、Services、Business、Tokens、Product、Metaphors、Reports，并支持折叠收起。
- 顶部搜索：按名称、类型、来源或 raw JSON 搜索。
- 资产总览：显示资产总数、组件、服务和产品资产统计卡片；其他分类视图不显示统计卡片。
- 组件分类：组件列表上方可按标签和项目筛选。
- 中间资产区：多列平铺卡片，展示资产名称、编程语言标识、类型和一句复用说明。
- 组件资产卡片：展示静态交互线索，并保留边框强调和抬升反馈；点击或悬浮可查看同源真实组件预览；卡片上可编辑标签，也可在二次确认后从当前 Web 视图删除组件。
- 右侧 Inspector：展示 Kind、Language、Source、Guidance、Raw JSON；组件存在 ready preview 时展示同源真实预览 iframe。
- Reports：单项目模式展示 `reuse-report.md` 和 `agent-rules.md`；集中库模式下主要从资产详情查看来源项目。

## 4. API

Web server 提供只读 API：

```text
GET /
GET /api/assets
GET /api/report/reuse
GET /api/report/rules
GET /api/component-preview-cache/<component-id>
GET /component-preview/<component-id>/
```

组件真实预览由同一个 Web 服务按需构建并返回静态页面。

## 5. 预览缓存与重启行为

组件预览使用持久化 Action Cache（动作缓存），不再把进程内 Map 或生成目录当作事实来源：

- `component-previews.json` 保存不可变分析契约与完整 `actionDigest`。
- `preview-state.db` 保存 Action Result（动作结果）、Validation Result（浏览器验证结果）和跨进程 lease（租约）。
- `preview-cas/` 按 SHA-256 保存不可变 Blob 与 Artifact Tree（产物树）。

服务重启后，若动作摘要和 CAS 完整性均未变化，请求会直接返回 `HIT`，不会重新执行 Vite。只有动作输入变化、产物缺失/损坏或瞬态失败进入可重试窗口时才会构建。

排查单个组件时请求：

```text
GET /api/component-preview-cache/<component-id>
```

响应中的 `reason` 用于解释决策，常见值包括 `HIT`、`MISS_ACTION`、`BUILDING`、`NEGATIVE_CACHE_HIT`、`TRANSIENT_FAILURE`、`MISSING_ARTIFACT` 和 `CORRUPT_ARTIFACT`。接口不会返回源码、环境变量值或绝对项目路径。

确定性失败会按 `actionDigest` 负缓存，修改相关输入并重新 `distill` 后自然生成新动作；瞬态失败采用指数退避并限制尝试次数，页面刷新不会绕过该约束。

## 6. 空态

如果集中库为空，页面会提示先运行：

```bash
node dist/cli.js distill <project-root>
```

## 7. 验证

```bash
npm test
npm run build
node dist/cli.js distill examples/fixture-project
node dist/cli.js web --port 4317
```

也可以直接验证 API：

```bash
node --input-type=module -e "import { startWebServer } from './dist/web/server.js'; const { server, url } = await startWebServer('examples/fixture-project', { port: 4587 }); const data = await fetch(url + 'api/assets').then((r) => r.json()); console.log(data.summary); server.close();"
```

## 8. 设计说明

当前仓库包含 `VibeFoundry.pen`，已通过 Pencil MCP 生成 Web 端设计板。设计板包含 Overview、Asset Library、Reports 和 Missing Package 四个 1280x860 画板，对应本地浏览器的总览、资产库、报告和缺失资产包空态。

Pencil MCP 验证记录：

```text
get_editor_state(include_schema: true)
batch_design(filePath: "VibeFoundry.pen", input: "Overview / Asset Library / Reports / Missing Package")
snapshot_layout(filePath: "VibeFoundry.pen", maxDepth: 3, problemsOnly: true) -> No layout problems.
export_nodes(nodeIds: ["AJTN7"], format: "png", scale: 1)
```

Pencil 导出产物：

```text
output/pencil-web-design/AJTN7.png
```

导出 PNG 尺寸为 1280x860，像素采样包含白色面板、浅灰背景、蓝色选中态和深色文本，说明设计板不是空白导出。


## 9. 浏览器截图验证

本地 Web 页面已用 Playwright CLI 在两个视口截图验证：

```text
output/playwright/web-asset-browser-desktop.png
output/playwright/web-asset-browser-mobile.png
```

截图产物验证：桌面图 1440x960、移动图 390x844，两个 PNG 均为非空文件并包含多种界面颜色采样。
