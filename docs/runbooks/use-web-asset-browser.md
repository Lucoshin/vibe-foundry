---
project: VibeHub
category: runbook
source_path: docs/runbooks/use-web-asset-browser.md
status: active
last_updated: 2026-09-16
---

# 使用 Web Asset Browser

VibeHub Web Asset Browser 是本地学习与资产工作台，统一查看工程、网站、书籍及文本/对话知识。集中库优先使用 `VIBEHUB_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibehub/library`。普通浏览保持只读；用户显式执行导入、保存方案、准备任务、导入分析和登记应用时写入集中库。组件标签编辑和删除只保存为浏览器本地视图状态，不修改集中资产包或源码文件。

## 1. 生成资产包

也可先启动 Web，点击顶部“导入炼化”，在页面内的本地文件选择面板中浏览目录。打开项目目录后点击“选择当前文件夹”，或点击一个 PDF/TXT/Markdown 文件，再点击“开始炼化”。支持输入完整目录路径、上一级、用户目录和工作目录快捷导航。

任务在独立进程中执行；面板可关闭再打开查看状态，页面刷新后可继续查看当前服务的任务。工程完成后自动切换到集中资产库并刷新资产；文档完成后可在面板查看报告和下载资产 JSON。文档入口调用基础章节/词表分析，深度语义分析仍使用宿主 AI；PDF 需要 `pdftotext`。不复制或修改源项目。每个服务同时运行一个任务，服务重启后任务状态清空，但已保存产物保留。

```bash
node dist/cli.js distill examples/fixture-project
```

真实项目中替换为：

```bash
node dist/cli.js distill <project-root>
```

`distill` 输出完整资产目录、证据、提示词和预览注册表；运行文件在请求预览时按需生成，不再提前生成全组件运行目录。显式准备运行时的 API 保留。

`distill` 把结果写入 `<asset-library-root>/projects/<project-id>`，不会在源项目目录创建资产包。

## 2. 启动 Web

```bash
node dist/cli.js web --port 4317
```

默认启动会聚合展示集中库中的工程/网站项目、书籍知识和学习资产。需要单项目排查时仍可显式运行：

```bash
node dist/cli.js web <project-root> --port 4317
```

启动 Web Asset Browser 后，每页显示 24 项资产，仅当前页创建缩略预览，由浏览器在接近可见区域时加载；关键词和筛选始终针对全库，切换筛选回第一页。预览中的前后切换可跨页，返回列表会定位到当前资产所在页。同页已加载预览保留实例；翻页移除的实例不保证保留交互状态。后台最多同时构建 2 个，已有成功缓存直接复用。点击卡片打开详情，点击“放大预览”进入可交互工作区，返回时保留列表位置。悬停只强调边框。当前支持 React 组件和普通 Vue SFC，不需要额外端口。

Vite、Vue 插件和 Sass 工具随 VibeHub 安装，预览时直接调用本地工具，不再临时运行 npx 下载。源项目仍需安装匹配的 React/react-dom 或 Vue 等运行依赖；缺失时显示明确提示，安装后重新导入炼化。仓库示例可先在 `examples/fixture-project` 中运行 `npm install`，再导入。

组件预览只应执行可信源码：预览页面与 Web Asset Browser 同源，可访问父窗口及同源的其他 API；`networkPolicy: "block-external"` 只用于确定性地阻断外部网络请求，不是安全沙箱。不要用 Web Asset Browser 预览不可信项目，也不要把服务暴露给不可信网络。

打开：

```text
http://127.0.0.1:4317/
```

## 3. 界面结构

界面沿用暖白与中性灰、无衬线字体和轻边框，保持已有预览工作区的视觉风格。

当前导航按工作组织，不再把资产种类当作顶层菜单：

| 入口 | 实际用途 |
| --- | --- |
| 资产库 | 工程/网站/书籍/学习资产统一列表、搜索、类型/来源/语言组合筛选及专业详情 |
| 来源库 | 来源身份、路径、状态与数量；工程复用报告和 agent rules 位于来源上下文 |
| 学习任务 | 准备文本/对话任务、选择冻结方案、查看宿主指令并导入分析 JSON |
| 应用记录 | 为学习资产的确切版本登记目标、采用理由、行动、结果与验证引用 |
| 炼化方案 | 查看内置方案、创建个人副本并保存不可变版本，编辑关注点和提示词 |

关键词与筛选由共享应用层 `src/application/asset-catalog.ts` 定义，Web 与 MCP 使用相同规则。语言只筛选有真实语言信息的资产；不为书籍/对话填充语言、角色或风格。当前是明确字段、证据和书籍属性的关键词匹配，尚非全文索引或语义检索。

- 资产列表默认不选中首项。组件卡片显示真实缩略预览；点击卡片查看详情，点击“放大预览”操作，返回保持位置与已加载实例。构建失败明确显示原因。
- 组件详情中的“更多操作”保留标签编辑和从当前 Web 视图移除；这些是浏览器本地状态，不修改集中包。旧组件专属标签/项目筛选已被统一筛选替代。
- 右侧详情可关闭或按 Escape 返回列表并恢复焦点。搜索只更新列表，不重建正在查看的详情或预览；原始 JSON 默认折叠。
- 书籍显示原实体属性、明示/解读依据、短引文与行号以及有方向关系；旧 `0.1.0` 基础统计仅为来源，不作为语义知识实体。
- 学习知识显示原始发言证据、方案和结果版本；`prepared` 表示等待宿主分析，不能当成已完成知识提取。对话导入使用严格 JSON 保留角色和条目；纯文本可由页面包装成 document 条目。
- 效果描述提示词在普通详情和预览工作台均可按需展开与复制，按布局、视觉、动效、交互描述。分析依据和限制独立展示，复制仅取效果正文。
- 方案/任务和应用记录的操作步骤见[学习工作台手册](learning-workbench.md)。应用记录当前仅支持学习流程资产，标记为使用者陈述，不自动验证改动或运行模型。

空库仍显示五入口，用户可以导入工程、准备文本/对话任务或编辑方案。筛选无结果与空库区分；坏资产包在错误通道明确显示，不把无法读取默认为没有知识。合法空分析仍是已经处理的来源与任务，不伪造可用资产。

## 4. API

Web server 的普通读取与预览入口：

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

学习工作台接口：

```text
GET /api/learning/recipes
GET /api/learning/recipe?id=<recipe-id>[&version=<version>]
GET /api/learning/tasks
GET /api/learning/task?id=<task-id>
GET /api/learning/applications
POST /api/learning/recipes
POST /api/learning/tasks
POST /api/learning/analysis
POST /api/learning/applications
```

学习接口读取与写入均需当前页面的本机请求校验和令牌。`POST /tasks` 使用 `{source,recipeId,recipeVersion?}`，`POST /analysis` 使用 `{taskId,analysis}`；方案、材料、分析和应用字段见学习手册及实际校验器。不要把任意来源 JSON 或图片数据直接传给这些接口。旧 `/api/report/reuse`、`/api/report/rules` 保留单项目读取用途，页面报告入口已归来源上下文。


本地导入接口：`POST /api/import/browse`、`POST /api/import/start`（JSON `{ "path": "绝对路径" }`），`GET /api/import/status`、`GET /api/import/result/report`、`GET /api/import/result/assets`。浏览目录时省略 path 使用服务工作目录。所有导入接口仅接受回环连接和当前页面令牌，拒绝跨来源调用；结果接口只读取最近成功文档任务的固定报告或 JSON，不提供任意路径下载。

组件真实预览由同一个 Web 服务按需构建并返回静态页面。缩略预览与放大预览共享动作缓存和构建去重；预览资源请求只读库索引与注册表定位组件，不加载所有资产、报告和设计令牌。

最新预览入口仍为 `/component-preview/<component-id>/`；新构建中的 JS/CSS 地址包含动作摘要，确保重新炼化期间同一页面不会混用两个版本的资源。搜索保留仍匹配且动作未变的缩略预览节点，不重复启动 iframe。

首次构建的等待页通过同一路径 `?wait=1` 等待结果：最长等待 1 秒，未完成返回空 202 并继续等待，完成返回空 204 后刷新一次；错误返回中文错误页面。版本化非 HTML 资源由浏览器私有长期缓存，HTML 与等待/错误响应不缓存。资源请求仅校验产物树和所请求文件；构建复用及缓存诊断仍校验整包。修改后重启 Web 服务即可使用新加载链路。

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

## 6. 能力边界

书籍 `book-knowledge 0.2.0` 已进入统一 Web/MCP，只有书籍的库也能显示知识资产；普通词频统计只显示为来源。来源缺失或坏包不会被伪装成有效知识。

图片/账号专业流程、自动聚类、通用提示词库、跨来源关系编辑仍待实现。应用记录暂不接受工程或书籍资产；学习分析需要当前宿主真实执行，页面不会自动启动 Codex 或后台模型。开发过程中产生的需求、设计取舍、失败与验证可作为新材料继续炼化。

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
