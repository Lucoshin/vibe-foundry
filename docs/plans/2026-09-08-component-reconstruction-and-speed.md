---
project: VibeFoundry
category: implementation-plan
source_path: docs/plans/2026-09-08-component-reconstruction-and-speed.md
status: completed
last_updated: 2026-09-08
---

# 组件还原提示词与炼化提速

## 目标

落实用户三个要求：尽量保留组件原始视觉/交互依据、减少重复分析耗时、产出其他 AI 可直接使用的组件还原提示词。依据总计划前端源码分析增量及 ADR-005，不引入新的外部模型或浏览器依赖。

## 1. 源码分析与缓存

文件：`src/analyzers/frontend-source-index.ts`、`component-analyzer.ts`、`source-route-planner.ts` 及对应测试。

1. 为源码索引增加本轮共享的 `sourceText` 和 `metrics: {files, parsed, reused}`。`buildFrontendSourceIndex` 第三个参数接受显式 `cacheDir`，缓存解析摘要，不缓存已解析绝对路径或原始源码。
2. 缓存键包含源码、语言、解析器版本和分析器实现摘要；依赖路径每轮重解。命中结果必须保持与冷解析等价。
3. 补齐无绑定样式导入、再导出等明确依赖，并修正 Vue 调用行号为源文件位置。普通 imports 契约继续服务场景绑定，依赖边另保留在 `dependencies: [{source, resolvedFilePath}]`。
4. `analyzeComponents` 第四参数接受 `{sourceIndex}`，共享源码与已计算指纹，不修改传入索引。依赖读取去重，场景反向索引只建立一次。
5. 路由规划使用共享文本，并避免解析明确不含路由导入的文件。

## 2. 组件提示词生成与文件协议

文件：新增 `src/analyzers/component-prompt.ts`、`src/library/component-prompts.ts`，新增对应 analyzer/library 测试。

1. `buildComponentPrompts(projectRoot, components, {sourceIndex, runtimeContext, tokens})` 返回 ADR-005 记录数组。所有提示词本地确定性生成，无网络或源项目执行。
2. 从组件及真实调用点收集文本证据，沿明确本地依赖保留子组件/工具/样式；保留内联 SVG。公共依赖材料在本轮只读取一次。
3. 样式导入和明确图片/字体引用要么带入原始文本，要么记录附件需求；未知/动态路径明确未解析。不把任意业务结果或预览固定 hover/click/focus 声明为组件事实。
4. 提示词包含还原任务、框架/依赖证据、源码材料、样式与设计 Token、真实样例、未解析项以及输出/验收要求。缺少实机证据时明确不保证像素一致。
5. `writeComponentPrompts(assetDir, records)` 写入上述独立 JSON，内容未变化不重写，清理本工具目录中的失效 JSON；`readComponentPrompt(assetDir,filePath)` 精确读取并校验身份，缺失明确提示重新炼化。

## 3. 主链路与运行上下文

文件：`src/index.ts`、`src/writers/asset-writer.ts`、`src/analyzers/token-extractor.ts`、`src/preview/component-preview-runtime.ts`、`src/cli.ts`、`tests/distill-flow.test.mjs`。

1. `distillProject` 明确集中输出目录，先完成既有隐喻输出预检，再创建一次源码索引，传给组件、Token、页面、运行上下文和提示词生成器。
2. 运行上下文复用已读源码，样式只依据真实导入。避免因为声明 antd 依赖就注入未经查证的样式。
3. 写资产包时同步提示词；返回 `analysis: {files,parsed,reused}`，CLI 显示解析/复用数量，普通炼化不构建所有预览。
4. 根目录之外或无法解析的来源不伪装为已携带证据；保留当前动态状态、Provider 和素材限制。
5. `runtimeContext.sourceFiles` 只列实际含 Provider、store 或 i18n 等初始化证据的源文件；提示词携带本文件并要求核对其初始化依赖。先生成提示词，再将其材料摘要与组件源码依赖摘要合并为最终 `dependencyFingerprint`，使间接 CSS 和二进制变化同步使预览缓存失效。

## 4. Web / MCP 使用入口

文件：`src/web/server.ts`、`frontend.ts`、`src/mcp/server.ts` 与对应测试。

1. 新增 `GET /api/component-prompt/<asset-id>`，由真实资产 ID 确定项目与组件 filePath；只按需加载单个提示词文件。
2. 普通组件详情与预览工作台均可展开提示词并复制。按资产 ID 缓存本次会话请求；复制成功后才显示成功，失败提供手动选择文本。
3. 新增 `get_component_prompt({filePath})`，查无/歧义/旧包缺失明确报错；现有工具不读取全部提示词。
4. 同步 MCP 工具列表、手册、插件技能和相关 fixture 的真实 filePath 契约，不加 sourceFile 双字段兜底。

## 验收

每个行为先写失败回归，再实现，再运行定向测试。最终统一执行：

```bash
npm test
npm run build
node scripts/verify-mvp.mjs
```

另用临时多组件 React/Vue fixture 验证三轮炼化：冷解析、未变化重炼、单文件变更。记录索引解析/复用数量和耗时；验证提示词包含真实组件/样式/场景、变化材料更新摘要、无关材料不污染组件，以及 Web/MCP 返回与磁盘一致。

## 验证脚本

- `scripts/verify-mvp.mjs` 只运行一次 `npm test`（已含构建），随后实际炼化示例项目、查询 `get_component_prompt({filePath: "src/components/Button.tsx"})`，核对 MCP 返回与磁盘记录一致并包含原组件源码；删除重复的独立构建。
- 新增 `scripts/measure-component-distillation.mjs`：在自身 `mkdtemp` 临时目录构建 React、Vue 各 20 个组件，每组件有独立真实调用页，并使用共享 CSS。依次冷炼化、未变化重炼、修改一个组件再炼化，记录各轮总耗时及源码索引的 `files/parsed/reused`，验证提示词摘要稳定/变化及无关组件不变。解析计数仅指源码索引，不等于整个流程所有 AST 调用次数。
- 基准默认只向标准输出打印 JSON；显式 `--output <directory>` 时额外保存 `component-distillation-benchmark.json` 和 `component-reconstruction-prompt.md`。退出时只清理本脚本创建并核对路径的临时目录，不清理用户指定输出目录。

```bash
node scripts/verify-mvp.mjs
node scripts/measure-component-distillation.mjs
node scripts/measure-component-distillation.mjs --output output/component-distillation
```

## 边界

本批交付静态源码保真和跨 AI 提示词，不宣称完成实机校准 Task 4–9，也不自动启动真实源项目。二进制原图和无法解析的动态上下文必须明确补充，不能生成替代素材冒充原件。完成时列出代码清理、实际验证和剩余限制。

## 完成记录（2026-09-08）

- 源码共享与解析摘要缓存、提示词生成与存储、主链路材料失效、Web/MCP 入口均已完成。
- 交叉审查修复了调用页递归携带无关组件、Vue 空元素解析、XML 声明 SVG、`srcSet` 附件遗漏，以及间接 CSS/二进制变化未使预览缓存失效的问题；相关行为先观察失败再修复。
- 最终 `node scripts/verify-mvp.mjs` 通过：内含构建、269 个测试（49 个套件、0 失败）、实际 CLI 炼化及 MCP 提示词与磁盘/源码一致性验证。独立构建、插件 Skill 验证和差异检查也通过。
- 多组件基准及已清理/保留内容见[验收记录](../reports/2026-09-08-component-reconstruction-validation.md)。本批完成不改变实机校准尚未完成的状态。
