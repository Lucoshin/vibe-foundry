---
project: VibeFoundry
category: design-plan
source_path: docs/plans/2026-07-08-web-asset-browser-design.md
status: implemented
last_updated: 2026-07-08
---

# VibeFoundry Web Asset Browser Design

> **历史契约说明（2026-09-01）：** 本文保留用于 Web 设计追溯；其中源项目内资产目录约定已被 central-only 集中资产库契约取代，界面信息架构仍可参考。

## 1. 目标

Web 端目标是让用户快速查看、浏览和理解已经沉淀的资产。

第一版定位为本地只读资产浏览器：

- 读取 `<project-root>/.vibe-foundry/`。
- 展示组件、服务、业务流程、设计 tokens、产品设计资产和文化隐喻资产。
- 展示 `reuse-report.md` 和 `agent-rules.md`。
- 不修改用户项目文件。
- 不重新炼化资产；资产刷新仍由 `distill` 命令负责。

启动方式：

```bash
node dist/cli.js web <project-root>
```

## 2. 头脑风暴结论

推荐方案：Asset Library / 资产库。

理由：

- 最符合“快速查看浏览积累资产”。
- 能自然容纳工程资产、业务资产、产品资产和文化资产。
- 与当前 `.vibe-foundry/` 资产包结构一致。
- 后续可扩展为搜索、标注、收藏和复用工作流。

不采用纯 Dashboard 作为第一版，因为它适合展示总览，但不适合深度浏览。

不采用 Studio 工作台作为第一版，因为它会引入编辑、执行和状态管理，超出只读浏览器范围。

## 3. Pencil 界面板

`VibeFoundry.pen` 已通过 Pencil MCP 生成四屏 Web 端设计板。设计过程遵循 `get_editor_state(include_schema: true)`、`get_guidelines(category: guide, name: "Web App")`、`batch_design`、`snapshot_layout` 和 `export_nodes` 的顺序。

### Board 结构

画布文件：`VibeFoundry.pen`

屏幕组：

1. `Overview`
   - 用户进入后的第一屏。
   - 显示资产总量、类型分布、最近生成时间、高价值建议。

2. `Asset Library`
   - 主浏览界面。
   - 左侧分类导航。
   - 中间资产列表。
   - 右侧 Inspector 详情。

3. `Reports`
   - 展示 `reuse-report.md` 和 `agent-rules.md`。
   - 复制规则入口。

4. `Missing Package`
   - `.vibe-foundry/` 缺失时的空态。
   - 明确提示运行 `node dist/cli.js distill <project-root>`。

### 关键箭头

- Overview -> Asset Library：点击资产类型或搜索。
- Asset Library -> Reports：点击报告 tab。
- Missing Package -> Quickstart：点击运行指南。

## 4. 视觉语言

设计风格：苹果风、极简、干净线条、简洁说明。

视觉规则：

- 浅灰背景：`#f5f5f7`。
- 主面板白色：`#ffffff`。
- 细线边框：`#d2d2d7`。
- 主文字：`#1d1d1f`。
- 次文字：`#6e6e73`。
- 强调蓝：`#0071e3`。
- 圆角克制：6-10px。
- 无渐变大背景。
- 无装饰性图形。
- 信息密度中等，适合反复浏览。

## 5. 页面信息架构

### 左侧导航

- Overview
- Components
- Services
- Business
- Tokens
- Product
- Metaphors
- Reports

### 顶部工具条

- 当前项目名。
- 搜索框。
- 资产总数。
- 生成时间。

### 中间列表

每个资产显示：

- 名称。
- 类型。
- 来源文件。
- 一句复用说明或限制。

### 右侧详情

详情字段：

- Name
- Kind
- Source
- Reuse Guidance
- Limitations / Risks
- Raw JSON

## 6. 数据流

Web server 读取 `.vibe-foundry/` 下的文件：

- `asset-manifest.json`
- `component-catalog.json`
- `service-catalog.json`
- `tokens.json`
- `concept-assets.json`
- `reuse-report.md`
- `agent-rules.md`

前端请求：

- `GET /api/assets`
- `GET /api/report/reuse`
- `GET /api/report/rules`

## 7. 错误状态

如果缺少 `.vibe-foundry/`：

- Web 页面显示 Missing Package。
- API 返回 `isError: true`。
- 提示用户运行 `node dist/cli.js distill <project-root>`。

## 8. 验收标准

- `node dist/cli.js web examples/fixture-project --port <port>` 可启动本地 Web。
- `/api/assets` 返回稳定 JSON。
- 页面包含 Overview、分类导航、搜索框、资产列表、详情区域和 Reports。
- 缺失 `.vibe-foundry/` 时有明确空态。
- 样式符合苹果风、极简、细线、简洁说明。
- `npm test` 和 `npm run build` 通过。

## 9. 当前落地状态

Web 界面已按本设计落地为可运行本地页面。`VibeFoundry.pen` 已通过 Pencil MCP 标准 JSON-RPC 调用生成四屏设计板；当前 Codex 会话的原生工具发现层仍未热加载 Pencil 工具命名空间，但 Pencil server 和 MCP 工具本身已验证可用。

## 10. Pencil 验证记录

- `batch_design` 创建节点：Overview=`Cgotu`、Asset Library=`AJTN7`、Reports=`FRjeF`、Missing Package=`a0UhR`。
- `snapshot_layout(filePath: "VibeFoundry.pen", maxDepth: 3, problemsOnly: true)` 返回 `No layout problems.`。
- `export_nodes(nodeIds: ["AJTN7"], format: "png", scale: 1)` 输出 `output/pencil-web-design/AJTN7.png`。
- PNG 验证：1280x860，采样 178 种颜色，包含 `#ffffff`、`#f5f5f7`、`#e8f2ff`、深色文本等界面颜色。
