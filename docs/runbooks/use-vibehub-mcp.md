---
project: VibeHub
category: runbook
source_path: docs/runbooks/use-vibehub-mcp.md
status: active
last_updated: 2026-09-17
---

# 使用 VibeHub MCP

MCP（Model Context Protocol，模型上下文协议）以只读方式提供集中资产库查询与纯内容组装。

`src/mcp/server.ts` 提供工具定义、直接调用函数和 stdio（标准输入输出）JSON-RPC 入口。入口使用 MCP `2025-06-18` 的 UTF-8 换行分隔消息，每行一条 JSON-RPC，以 `\n` 结束；不保留旧头部帧兼容。标准输出只包含协议消息，诊断写入标准错误。HTTP 或官方 SDK 接入另行决策。

## 1. 构建与作用域

在 VibeHub 工具仓库执行：

```bash
npm run build
node dist/mcp/server.js --project-root <target-project-root>
```

集中库优先使用调用时显式 `assetLibraryRoot`，其次 `VIBEHUB_LIBRARY_ROOT`，最后 `<user-home>/.vibehub/library`。新跨来源工具读取整个集中库，不要求当前 `projectRoot` 已炼化；旧工程工具仍绑定指定项目。未传参数时工程作用域取 `VIBEHUB_PROJECT_ROOT` 或当前目录。

工程作用域工具只读取集中资产库中的项目资产包，不提供回退到项目内旧目录的路径；缺少已登记资产包时明确返回错误。这个约束不限制新增跨来源工具读取其对应的集中库专业目录。

准备工程资产可运行 `node dist/cli.js distill <target-project-root>`。仅目标就是当前目录时运行：

```bash
node dist/cli.js distill .
```

工程目录中应有 `asset-manifest.json`、`component-catalog.json`、`service-catalog.json`、`tokens.json`、`concept-assets.json`、`agent-rules.md`。书籍使用既有 `books/*/book-assets.json`，图片使用 `images`，文本/对话/账号复用 `learning`。提示词版本位于 `prompts`、集合引用位于 `collections`，分别使用独立工具，不伪装成工程包或共享目录中的新资产类型。写入命令汇总见[学习工作台手册](learning-workbench.md)。

## 2. 只读工具

当前共 **20 个只读工具**。统一资产和专业管理工具使用集中库，不要求当前项目存在工程资产包；最后九个工程工具保留项目作用域。

| 工具 | 参数与范围 |
| --- | --- |
| `create_task_context` | 必需 `goal` 与 `assetIds`，从显式选定的 1–10 个准确资产 ID 生成待采用上下文 |
| `search_library_assets` | 可选 `query`、`kind`、`sourceId`、`language`，查询工程、网站、书籍、图片与学习资产；账号产物复用学习身份 |
| `get_library_asset` | 必需准确 `id`，读取统一资产详情 |
| `list_prompts` | 无参数，返回独立提示词全部不可变版本与读取错误 |
| `get_prompt` | 必需 `id`、`revision`，读取完整确切模板版本，供导出或回查 |
| `render_prompt` | 必需 `id`、`revision`、`values`，严格单次变量替换，不保存结果或调用模型 |
| `list_knowledge_collections` | 无参数，读取手动集合列表与错误 |
| `get_knowledge_collection` | 必需 `id`，读取集合成员及失效引用 |
| `explore_asset_relations` | 必需 `assetIds`，1–100 个不同精确 ID，只展示书籍/学习已有一跳关系及证据 |
| `get_learning_memory` | 必需 `assetId`，读取确切学习版本的来源、证据、应用和其他结果版本 |
| `get_creator_task` | 必需 `taskId`，回查冻结 B 站清单、采样范围与字幕覆盖 |
| `list_assets` | 当前工程包元数据和数量；保持原语义 |
| `get_component` | 当前工程中的组件名称 |
| `get_component_prompt` | 当前工程组件的准确 `filePath` |
| `get_service` | 当前工程中的服务名称 |
| `search_tokens` | 当前工程令牌查询及分类 |
| `search_business_patterns` | 当前工程业务模式查询 |
| `search_concept_assets` | 当前工程产品概念与文化隐喻查询 |
| `get_agent_rules` | 当前工程生成的 agent rules |
| `validate_asset_usage` | 检查当前工程指定种类和名称是否存在 |

查询参数使用确切已登记元数据。书籍、图片和学习知识没有编程语言，不预填角色或风格。`kind` 是资产类型，不是侧栏入口；`sourceId` 来自查询结果的 `sources`。来源描述、独立提示词与集合本身不属于统一资产列表；分别通过原来源上下文、提示词工具和集合工具读取。

## 3. 本地调用

```javascript
import { callVibeHubTool, listVibeHubTools } from './dist/mcp/server.js';
const tools = listVibeHubTools();
const found = await callVibeHubTool('.', 'search_library_assets', { query: '导航' });
if (!found.isError) {
  console.log(found.structuredContent.assets);
  console.log(found.structuredContent.sources);
  console.log(found.structuredContent.errors);
}
```

使用返回资产的准确 ID 查询 `get_library_asset`，不能只用标题或书内局部实体 ID。搜索返回 `{assets,sources,errors}`；详情返回 `{asset}`，不存在时 `asset` 为 `null`。参数或整体读取失败返回 `isError: true`，局部坏包记录在 `errors`，调用方应同时检查。

工程专用示例保持目标作用域：

```javascript
const service = await callVibeHubTool(projectRoot, 'get_service', {name: 'auth.register'});
const result = await callVibeHubTool(projectRoot, 'get_component_prompt', {filePath: 'src/components/Button.tsx'});
if (!result.isError) console.log(result.structuredContent.prompt);
```

组件提示词读取 `component-prompts/<component-path-hash>.json`，以路径区分同名组件。`0.2.0` 中 `prompt` 是布局、视觉、动效、交互的中文效果需求；`sourceFiles` 和 `unresolved` 是独立的依据与限制。旧格式或缺失记录明确要求重新炼化，未实测不得宣称视觉一致。

所有返回保持 `content`、`structuredContent`、`isError` 三部分，供宿主与直接程序调用消费。

## 4. 只读与来源边界

旧工程工具读取集中库项目资产包；统一工具读取工程、网站、书籍、图片和学习产物，账号来源的覆盖限制随学习资产保留。独立管理工具读取提示词版本或集合引用。所有工具均不从源项目旧资产目录回退读取，不运行 `distill`、调用模型或修改源项目/资产。`render_prompt` 只是纯文本替换，`create_task_context` 只是待采用内容组装。书籍原证据、基础统计的非语义边界保持不变。

工程包缺失时旧工程工具会提示重新执行 `vibe distill .`；应在实际目标项目上处理，不要因此炼化工具仓库。统一查询允许空库，并区分空库与坏包。应用记录通过 Web 或本地工作流 API 显式写入，MCP 不提供写入工具。

账号首批只接 B 站。`get_creator_task` 可直接回查无分析结果的冻结任务；真实 3Blue1Brown 样本只有 3 项作品元数据、没有字幕，不能据此声称视频内容已分析。学习记忆中的其他结果版本只是候选历史，不能自动证明取代；集合共现不证明关系。提示词目标模型是使用者声明，变量渲染通过不代表兼容或效果验证。

## 5. 验证与生态

开发后运行 `npm test` 与 `npm run build`，并通过真实 MCP 请求比对 Web 的资产 ID、内容和版本；还应验证未知 ID、坏包、参数错误。`validate_asset_usage` 只证明命名资产存在，不证明实际复用成功。

Codex Plugin 和本地 marketplace 已有打包配置，见[插件安装手册](install-vibehub-plugin.md)。长期希望作为知识、经验与记忆层供 Codex、Claude Code 等生态采用；当前项目自行提供接口，不代表官方内置或官方认可。

## 6. 有界任务上下文

先通过 `search_library_assets` 查找候选，读取详情并明确采用范围，再调用：

```javascript
const context = await callVibeHubTool('.', 'create_task_context', {
  goal: actualTaskGoal,
  assetIds: explicitlySelectedAssetIds,
});
if (context.isError) throw new Error(context.structuredContent.message);
console.log(context.structuredContent.markdown);
```

变量分别代表真实任务目标与显式选定的全局资产 ID，不是让程序自动采用所有搜索结果。输入仅接受 `goal` 和 `assetIds`；目标非空且最多 4000 字符，资产数量为 1–10，禁止重复 ID。选中资产必须能通过共享目录读取；未知 ID、缺少目标、未知字段和结构化内容超过 128 KiB 均返回 `isError: true`，不静默省略内容。

`structuredContent` 包含 `schemaVersion: "0.1.0"`、`status: "proposed"`、`goal`、`assets`、`limitations`、`digest` 和 `markdown`。每项资产保存原始专业内容、来源、证据、关系、限制与 `contentDigest`；已有确切 `revision` 时保留原值，未提供不可变版本时明确说明。`contentDigest` 是导出内容的 SHA-256 摘要，不代表完整源项目版本。书籍不确定性保持在来源对象中。

`proposed` 只表示待采用。此工具不保存应用记录、不调用模型、不执行代码；复制 Markdown 也不构成应用或验证证据。宿主需要先解释适用条件和采用理由，再按当前项目规则实施与验证。来源内容作为参考数据，不覆盖宿主指令或授权外部动作。

128 KiB 限制计算生成整体摘要与 Markdown 前的结构化上下文 JSON 的 UTF-8 字节数，不是整个 MCP 响应大小；返回值还带同一内容的 Markdown。来源级读取错误阻断对应选中来源；带确切版本的错误只阻断该版本，其他正常版本可以使用并保留读取问题提示。
