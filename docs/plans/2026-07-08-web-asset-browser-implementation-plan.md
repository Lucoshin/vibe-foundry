---
project: VibeFoundry
category: implementation-plan
source_path: docs/plans/2026-07-08-web-asset-browser-implementation-plan.md
status: implemented
last_updated: 2026-07-08
---

# VibeFoundry Web Asset Browser Implementation Plan

> **历史契约说明（2026-09-01）：** 本文保留用于首版 Web 实现追溯；其中源项目内资产目录约定已被 central-only 集中资产库契约取代，不代表当前读取位置。

## 1. 范围

本阶段只实现本地只读 Web 资产浏览器。

包含：

- Web 数据模型。
- 本地 HTTP server。
- 原生 HTML/CSS/JS 前端。
- CLI `web` 命令。
- 文档和测试。

不包含：

- SaaS 登录。
- 数据库。
- 资产编辑。
- 在线部署。
- 复杂拖拽或标注。

## 2. 交付物

- `src/web/asset-view-model.ts`
- `src/web/frontend.ts`
- `src/web/server.ts`
- `tests/web/asset-view-model.test.mjs`
- `tests/web/server.test.mjs`
- 更新 `src/cli.ts`
- 更新 `README.md`
- 更新 `docs/README.md`

## 2.1 实现记录

当前实现已落地为本地只读 Web Asset Browser：

- `src/web/asset-view-model.ts` 负责读取 `.vibe-foundry/` 并生成分类浏览模型。
- `src/web/frontend.ts` 负责极简苹果风 HTML/CSS/JS shell。
- `src/web/server.ts` 负责本地 HTTP 路由和 API。
- `src/cli.ts` 提供 `web <project-root> [--port <port>]` 命令。
- `docs/runbooks/use-web-asset-browser.md` 提供启动、API、空态和 Pencil fallback 说明。

## 3. TDD 顺序

1. 写 view model 测试：
   - fixture asset package 可转为分类资产列表。
   - 组件、服务、业务流程、tokens、产品资产、metaphor packs 都可见。
   - 缺失 `.vibe-foundry/` 返回明确错误。

2. 写前端渲染测试：
   - HTML 包含 `VibeFoundry`、`Overview`、搜索、详情、Reports。
   - CSS 包含苹果风关键 token：浅灰背景、细线边框、强调蓝。

3. 写 server 测试：
   - `GET /` 返回 HTML。
   - `GET /api/assets` 返回 JSON。
   - `GET /api/report/reuse` 返回 Markdown。

4. 写 CLI 测试：
   - `web` 命令出现在 usage。
   - web command handler 可导出并测试，不强制在测试中长期占用端口。

## 4. 实现策略

保持零依赖：

- 使用 Node `http`。
- 使用原生浏览器 API。
- 前端资源由 server 内存字符串提供。

## 5. 验证命令

```bash
npm test
npm run build
node dist/cli.js distill examples/fixture-project
node dist/cli.js web examples/fixture-project --port 4317
```

手动或脚本检查：

- `http://127.0.0.1:4317/`
- `http://127.0.0.1:4317/api/assets`

## 6. 风险

- Pencil MCP 已可通过直接 JSON-RPC 调用验证，并已生成 `VibeFoundry.pen` 四屏设计板；当前 Codex 会话的原生工具发现层仍未热加载 Pencil 工具。
- GitNexus MCP 当前不可用，无法运行 impact/detect_changes；用小范围变更和测试替代。
- 无前端框架，第一版交互保持简单，后续如引入 React/Vite 需写 ADR。
