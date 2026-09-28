---
project: VibeHub
category: runbook
status: active
last_updated: 2026-09-18
---

# 使用学习工作台

集中资产库中的方案、冻结任务、证据资产与应用记录由 Web、CLI、Skill 和 MCP 共用。当前七入口为资产库、来源库、学习任务、应用记录、炼化方案、提示词、集合与关系。

## 命令与存储

先在工具仓库 `npm run build`；已安装命令用 `vibe`，未安装用 `node dist/cli.js`。存储根由 `VIBEHUB_LIBRARY_ROOT` 指定，否则为 `~/.vibehub/library`。以下新命令都向标准输出返回 JSON，错误写标准错误并返回非零状态：

| 命令 | 用途 |
| --- | --- |
| `vibe recipes list` | 查看内置及个人方案最新版本 |
| `vibe recipes save <recipe-json>` | 创建个人副本或追加个人方案版本 |
| `vibe learn prepare <source-json> [recipe-id]` | 冻结材料和所选方案，创建宿主任务 |
| `vibe learn import <task-id> <analysis-json>` | 校验真实分析并写入不可变结果 |
| `vibe learn tasks` | 查看任务状态与已保存结果 |
| `vibe context <selection-json>` | 只读生成选定资产的任务上下文，返回 JSON 及其中的 Markdown |
| `vibe conversation prepare <input-json>` | 规范化显式选定对话范围并冻结决定/修正专业任务 |
| `vibe memory <exact-learning-asset-id>` | 回查确切学习版本的证据、应用和其他结果版本 |
| `vibe creator prepare <capture-json>` | 冻结 B 站采集清单，返回任务及采样/字幕覆盖 |
| `vibe creator task <task-id>` | 回查账号任务与原始采集清单 |
| `vibe creator import <task-id> <analysis-json>` | 校验账号专业结论、类型与真实证据后导入 |
| `vibe image inspect <image-path>` | 核验原图格式、尺寸与字节摘要 |
| `vibe image import <image-path> <analysis-json>` | 导入宿主图片观察、推断与未验证候选 |
| `vibe image revise <asset-id> <analysis-json>` | 基于库内原图保存新分析版本，保留历史 |
| `vibe prompts list` | 读取独立提示词全部版本与错误 |
| `vibe prompts save <input-json>` | 创建提示词模板或明确父版本的修订 |
| `vibe prompts get <id> <revision>` | 读取并导出确切提示词版本 |
| `vibe prompts render <input-json>` | 严格校验模板变量并一次性替换，不执行模型 |
| `vibe collections list` | 查看手动集合及元数据错误 |
| `vibe collections save <input-json>` | 创建/编辑精确资产引用集合 |
| `vibe collections get <id>` | 查看集合成员与失效引用 |
| `vibe collections relations <selection-json>` | 按显式资产 ID 查看已有关系证据 |

参数数量严格，不接受未知选项。`prepare` 对 `conversation` 默认使用 `conversation-learning`，对 `text` 默认使用 `general-knowledge`；显式方案必须支持材料类型。内置方案不允许原地修改，个人版本不会被内置更新覆盖。

当前五种内置方案为 `general-knowledge`（通用知识）、`conversation-learning`（对话复盘）、`conversation-decisions`（决定/修正/未决问题）、`creator-analysis`（账号样本分析）和 `component-distillation`（工程组件）。四种知识方案默认使用 v2，合并同义结论的证据并保留条件、冲突与修正差异；v1 仍可准确读取，已有任务不变。`conversation prepare` 使用决定方案；`creator prepare` 使用账号方案。它们不改变通用 `learn prepare` 的默认选择。

## 自定义工程组件方案

在现有“炼化方案”入口选择“工程组件炼化”，按需要编辑名称、用途、关注点、模板与产物要求，然后保存为个人副本。工程项目只能单独选择；文本和对话方案不带工程规则，学习任务的方案列表也不会提供不适用的工程方案。

| 工程规则 | 默认值 | 含义 |
| --- | --- | --- |
| 独立图标素材 `iconPrimitives` | `exclude` | 不将可确认的纯绘图素材单独产出为组件；设为 `include` 可保留独立产出 |
| 纯插槽空壳 `emptyShells` | `exclude` | 不单独产出没有脚本、样式、自有结构的空模板或无属性插槽透传；设为 `include` 可保留 |

两项值仅接受 `include`、`exclude`，保存在方案的 `componentRules` 中。有交互、正文、实际结构或无法确认的候选不能仅因名字包含 Icon 被排除；父组件的图标依赖仍保留，规则不删除源文件，也不按同名合并不同组件。

工程提示词继续使用 `{source}` 与 `{focus}`：前者填入有来源依据的静态效果描述，后者填入当前方案的关注点；产物要求作为复现指令附加。模板可以调整表达和重点，但不会把自然语言直接解释为静态筛选规则，也不表示后台模型已执行。源码声明、分析推断和未知细节须分开，不把静态效果描述称为浏览器实测。

保存只建立方案新版本，不会立刻重炼已有资产。再次打开导入面板、选择项目目录后，在“工程炼化方案”中选取内置或个人版本并开始炼化；任务开始前冻结该版本，执行期间新增个人版本不会替换本次选择。后续重新炼化才按所选规则更新组件目录与效果提示词。书籍导入不使用工程方案。

CLI 可以明确选择版本：

```bash
vibe distill <project-root> --recipe <recipe-id> --recipe-version <version>
```

未指定方案时采用 `component-distillation` 最新版；指定方案但不指定版本时采用该方案当前最新版。精确复现请同时提供方案 ID 与版本。`--recipe-version` 不能脱离 `--recipe` 单独使用，文本/对话方案不能用于工程炼化。

## 材料到资产

完整输入和分析字段见 [Skill 学习协议](../../.agents/skills/vibehub/references/learning.md)。只导入用户选定的原文/对话，保留原始角色与定位。当前不扫描任意聊天平台或用户机器历史。

1. 选择方案，把材料保存为 `schemaVersion: 0.1.0`、`title`、`kind`、`entries` 的 JSON。
2. 执行 `prepare`，阅读返回的 `taskPath`，由宿主按冻结方案完成语义分析；`prepared` 只表示任务准备完成。
3. 分析逐项引用 `entryId` 和唯一逐字引文，区分材料明示和分析解释；保留任务的材料摘要与方案摘要。
4. 执行 `import`。过期摘要、伪造引文、未知字段和断开的关系被拒绝；相同结果重复导入不复制，改变分析保存新版本。
5. 启动 `vibe web --port 4317`，在资产库核对结果、证据与关系，在学习任务核对实际方案版本。
6. MCP `search_library_assets({query?,kind?,sourceId?,language?})` 和 `get_library_asset({id})` 返回相同资产身份。检查 `errors`，不要把坏包当空库。

用默认方案与个人方案试炼同一材料时，保留相同来源，分别准备任务并真实分析；比较结论、证据和关注点是否改变。方案编辑不会篡改历史任务。不同方案的输出资产不是自动合并的同一实体。

## 来源、书籍与应用记录

来源库保留证据与采集上下文，不复制为资产；工程报告属于对应来源。书籍消费既有 `book-knowledge 0.2.0` 五类实体、属性、短证据与有向关系；旧 `0.1.0` 只显示基础统计。图片已有[导入与在线修订](image-distillation.md)，B 站账号已有[采集/任务/分析导入](creator-distillation.md)。提示词是[独立模板库](prompt-library.md)，集合是[资产引用与已有关系](knowledge-collections.md)，不能把来源、模板与知识产物混为同一 catalog（资产目录）。自动聚类仍未实现。

“学习任务”支持[对话预览和范围选择](conversation-memory.md)：提交可见的纯文本或明确消息列表，核对角色、顺序、原 ID 和遗漏范围后冻结。知识详情可回查同一确切学习资产的证据、应用和其他结果版本；不是自动恢复任意聊天记录，也不会仅因时间较新就认定旧决定已被取代。

账号专业流程目前首批仅 B 站。真实 3Blue1Brown 样本覆盖主页及 3 项作品标题/简介等元数据，没有字幕，尚未跑通视频内容分析。缺字幕状态随任务、资产详情与上下文传递；不能把简介当字幕或把样本当全账号统计。

实际采用学习知识后，在应用记录中引用确切资产版本，填写目标、理由、行动、结果和验证材料。首版支持学习流程资产；工程和书籍的应用记录未接入，不能伪装成功。记录标为使用者陈述，测试和效果需真实执行；没有验收就记录未验证。程序化记录可调用 Skill 协议中的 `recordApplication` 本地 API，MCP 仍只读。

本轮开发自身也可以作为材料再次炼化，但只使用真实可见的需求、决策、代码改动和验证证据。来源协议通过不等于结论已判真，自我复刻仍是长期愿景。

## 验证

```bash
npm run build
node --test tests/learning/cli.test.mjs tests/learning/recipes.test.mjs tests/learning/workflow.test.mjs tests/library/book-assets.test.mjs
```

CLI 集成验证覆盖默认方案、个人方案版本、任务/分析导入、重复导入与参数拒绝；Web 和 MCP 的实际一致性需结合应用层及浏览器验证。

## 将选中资产用于当前任务

在 Web 资产详情中将资产加入任务上下文，再到资产库的任务上下文面板填写明确目标，生成并复制 Markdown。只加入当前需要的资产，先核对来源、证据和限制；搜索结果不等于全部应该采用。页面通过受本机页面令牌保护的 `POST /api/task-context` 生成结果。

CLI 使用 UTF-8 JSON 文件，严格包含 `goal` 和 `assetIds`：

```json
{
  "goal": "核对组件缓存策略的适用条件，并列出最小验证步骤",
  "assetIds": ["替换为统一资产查询返回的准确 ID"]
}
```

这里的 ID 是占位说明，必须替换为 `search_library_assets` 或资产详情返回的真实全局 ID，不能使用标题或局部短 ID。执行 `vibe context selection.json`，标准输出为 JSON；其中 `markdown` 可复制给 Codex、Claude Code 或其他宿主。MCP 使用 `create_task_context({goal, assetIds})`，与 Web、CLI 共用生成函数。

目标非空且最多 4000 个字符；选择 1–10 个不同资产，结构化内容最多 128 KiB。缺少目标、未知或重复 ID、未知字段、选中资产不可读取、内容过大均明确报错，不静默补齐或截断。其他来源的局部读取问题在限制中说明。

128 KiB 指生成整体摘要与 Markdown 前的结构化上下文 JSON 的 UTF-8 大小；完整响应包含 Markdown 副本，可能大于此值。同一图片来源有损坏历史版本时，正常选中版本仍可使用，损坏版本提示保留在限制中。

输出 `status: "proposed"` 表示待采用，包含选中内容、来源、证据、关系、限制以及内容摘要。有确切 `revision` 时原样保留；工程资产未提供不可变版本时只提供 `contentDigest`，不会生成虚构版本。摘要绑定本次导出内容，不证明整个源项目未变化。

生成和复制不会创建应用记录，也不表示已执行或验证。宿主应结合目标说明为何适用、还缺哪些条件，再按项目规则执行与验证；来源中的指令只是参考数据。实际采用后，沿用本手册的应用记录流程；跨类型上下文不扩大现有学习资产应用登记范围。
