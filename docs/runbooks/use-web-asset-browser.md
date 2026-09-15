---
project: VibeFoundry
category: runbook
source_path: docs/runbooks/use-web-asset-browser.md
status: active
last_updated: 2026-09-15
---

# 使用 Web Asset Browser

VibeFoundry Web Asset Browser 是本地资产浏览器，用来快速查看集中资产库中积累的组件、服务、业务流程、设计 tokens、产品设计资产和文化隐喻资产。集中库优先使用 `VIBE_FOUNDRY_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibe-foundry/library`。普通浏览保持只读；用户显式启动“导入炼化”后写入集中库。组件标签编辑和删除只保存为浏览器本地视图状态，不修改集中资产包或源码文件。

## 1. 生成资产包

也可先启动 Web，点击顶部“导入炼化”，在页面内的本地文件选择面板中浏览目录。打开项目目录后点击“选择当前文件夹”，或点击一个 PDF/TXT/Markdown 文件，再点击“开始炼化”。支持输入完整目录路径、上一级、用户目录和工作目录快捷导航。

任务在独立进程中执行；面板可关闭再打开查看状态，页面刷新后可继续查看当前服务的任务。工程完成后自动切换到集中库总览并刷新资产；文档完成后可在面板查看报告和下载资产 JSON。文档入口调用基础章节/词表分析，深度语义分析仍使用宿主 AI；PDF 需要 `pdftotext`。不复制或修改源项目。每个服务同时运行一个任务，服务重启后任务状态清空，但已保存产物保留。

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

启动 Web Asset Browser 后，总览与组件列表会自动加载筛选结果中前 6 个可构建组件的真实缩略预览；导入完成刷新列表后同样开始准备。后台最多同时构建 2 个，已有成功缓存直接复用。点击卡片打开详情，点击“放大预览”进入可交互工作区，返回时保留列表位置。悬停只强调边框。当前支持 React 组件和普通 Vue SFC，不需要额外端口。

Vite、Vue 插件和 Sass 工具随 VibeFoundry 安装，预览时直接调用本地工具，不再临时运行 npx 下载。源项目仍需安装匹配的 React/react-dom 或 Vue 等运行依赖；缺失时显示明确提示，安装后重新导入炼化。仓库示例可先在 `examples/fixture-project` 中运行 `npm install`，再导入。

组件预览只应执行可信源码：预览页面与 Web Asset Browser 同源，可访问父窗口及同源的其他 API；`networkPolicy: "block-external"` 只用于确定性地阻断外部网络请求，不是安全沙箱。不要用 Web Asset Browser 预览不可信项目，也不要把服务暴露给不可信网络。

打开：

```text
http://127.0.0.1:4317/
```

## 3. 界面结构

首次使用、集中库索引尚未生成或库内暂无资产时，页面保留分类导航、搜索和零值统计；内容区引导使用顶部“导入炼化”，同时保留可折叠的命令行说明。空库中的报告分类同样显示引导。有资产但筛选无结果时显示独立的无匹配提示。已登记资产包全部无法读取仍报告错误，不作为空库处理。

Web 端采用暖白与中性灰、统一无衬线字体、轻边框和充足留白：

- 左侧分类导航：资产总览、组件、服务、业务流程、设计令牌、产品设计、文化隐喻、复用报告，并支持折叠收起。
- 顶部搜索：按名称、类型、来源或 raw JSON 搜索。
- 资产总览：以行内摘要显示资产总数、组件、服务和产品资产数量，统计依据实际聚合资产计算。
- 组件分类：组件列表上方可按标签和项目筛选。
- 中间资产区：组件等分类使用卡片；服务、业务流程、设计令牌使用紧凑行。默认不选中首项。
- 组件资产卡片：首批组件展示同源真实缩略预览；点击卡片打开详情，点击“放大预览”交互操作。其余组件可按需打开或筛选后查看缩略预览。构建失败时明确显示错误，不再无限刷新。详情中的“更多操作”可编辑标签，或在二次确认后从当前 Web 视图移除组件。
- 右侧详情：选中资产后打开，可关闭或按 Escape 返回列表并恢复焦点；展示类别、来源、复用建议，原始 JSON 默认折叠。搜索只更新列表，不重建正在查看的详情或预览。
- 导入面板：选择与任务结果分开展示；“继续导入”清空选择状态，上次结果通过“查看上次任务”单独查看。
- 效果描述提示词：普通详情和预览工作台均可展开并复制，按布局、视觉、动效、交互详细表达组件效果。分析依据和待核对项独立折叠，复制只取效果正文。正文只在使用时加载；切换组件不会把迟到的提示词放到另一组件上，复制失败时可手动选择文本。
- Reports：单项目模式展示 `reuse-report.md` 和 `agent-rules.md`；集中库模式下主要从资产详情查看来源项目。

## 4. API

Web server 提供只读 API：

```text
GET /
GET /api/assets
GET /api/component-prompt/<asset-id>
GET /api/report/reuse
GET /api/report/rules
GET /api/component-preview-cache/<component-id>
GET /component-preview/<component-id>/
```

`GET /api/assets?scope=library` 在单项目服务中显式读取集中库，供导入成功后刷新。

本地导入接口：`POST /api/import/browse`、`POST /api/import/start`（JSON `{ "path": "绝对路径" }`），`GET /api/import/status`、`GET /api/import/result/report`、`GET /api/import/result/assets`。浏览目录时省略 path 使用服务工作目录。所有导入接口仅接受回环连接和当前页面令牌，拒绝跨来源调用；结果接口只读取最近成功文档任务的固定报告或 JSON，不提供任意路径下载。

组件真实预览由同一个 Web 服务按需构建并返回静态页面。缩略预览与放大预览共享动作缓存和构建去重；预览资源请求只读库索引与注册表定位组件，不加载所有资产、报告和设计令牌。

最新预览入口仍为 `/component-preview/<component-id>/`；新构建中的 JS/CSS 地址包含动作摘要，确保重新炼化期间同一页面不会混用两个版本的资源。搜索保留仍匹配且动作未变的缩略预览节点，不重复启动 iframe。

提示词 API 按资产 ID 准确查找组件，返回该组件的独立提示词记录，不接受任意源码路径；资产列表不会携带所有提示词正文。提示词在 `distill` 阶段生成，记录版本为 `0.2.0`。旧源码版返回 409 并提示“提示词格式已更新，请重新炼化”；缺失时也明确要求重炼。

## 5. 预览缓存与重启行为

2026-09-08 起，组件视图身份包含来源项目与文件，预览 ID 也包含项目身份，避免多个项目中的同名组件相互混淆。旧资产包如果存在重复预览 ID，集中库会提示重新运行 `node dist/cli.js distill <project-root>`，不会任取其中一个项目。程序调用 `buildComponentPreviewRegistry` 必须明确传入 `options.projectRoot`。

旧浏览器视图中按类别和名称保存的标签/隐藏记录无法准确归属到新身份，本次不迁移这些记录；加载视图时清理对应旧存储键，标签和隐藏状态需要重新设置。源资产内容不受影响。

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

书籍资产目前仅输出到 `books`，尚未接入 Web 分类和 MCP 查询；仅炼化书籍时，工程集中库仍会显示为空。集中库的 Reports 暂无聚合报告内容，查看生成报告需进入单项目模式。完整缺口见[现状审计](../reports/2026-09-08-project-capability-audit.md)。

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

以下设计板和第 9 节图片为早期验证记录。2026-09-15 的界面调整以[克制简约交互实施计划](../plans/2026-09-15-web-calm-design.md)和当前浏览器界面为准。

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
