# VibeHub

VibeHub 是本地优先的知识与能力资产工作台：从材料和实践中学习，炼化可追溯、可检索、可复用的知识，再用于系统建设并以验证结果持续迭代。工程、网站、书籍、图片、账号、对话和开发过程都是学习场景。开发 VibeHub 本身就是持续学习与炼化的过程：研究开源设计、核对需求、记录取舍与失败，把经过验证的经验用于下一次改进。

当前仓库发布的是 Apache-2.0 授权的源码，不发布 npm 包。`package.json` 保持 `private: true`；请从源码 clone、安装依赖并构建。

## 支持环境

- Node.js `>=22.18.0 <23`，或 `>=24.11.0`。
- npm `11.6.2`。
- Windows 与 Ubuntu 进入持续集成矩阵。

## 从源码开始

```bash
git clone https://github.com/Lucoshin/vibe-foundry.git vibehub
cd vibehub
npm ci
npm run build
```

用公开 fixture 完成第一次炼化并启动本地资产浏览器：

```bash
node dist/cli.js distill examples/fixture-project
node dist/cli.js web --port 4317
```

打开 `http://127.0.0.1:4317/`。完整的 10 分钟流程见 [Quickstart](docs/runbooks/quickstart.md)。

常用命令：

```bash
node dist/cli.js distill <project-root>
node dist/cli.js distill-book <book.pdf>
node dist/cli.js recipes list
node dist/cli.js learn prepare <source-json>
node dist/cli.js learn import <task-id> <analysis-json>
node dist/cli.js conversation prepare <input-json>
node dist/cli.js creator prepare <capture-json>
node dist/cli.js image import <image-path> <analysis-json>
node dist/cli.js prompts list
node dist/cli.js collections list
node dist/cli.js web --port 4317
npm test
```

## Codex 与命令入口

项目 Skill 为 `$vibehub`，命令名为 `vibe`。构建后可运行 `npm link --ignore-scripts` 安装本地命令：

```bash
vibe distill <project-root>
vibe distill-website <capture-directory>
vibe web --port 4317
```

在 Codex 中直接说 `$vibehub 帮我炼化 https://glass.zs.uy/`。Skill 负责目标路由、宿主阅读/采集与验收；CLI 准备、校验和入库，Web 和 MCP 通过共享应用层消费同一结果。对话和文本用 `vibe learn prepare <source-json> [recipe-id]` 冻结任务，宿主真实分析后再导入，不会自动调用后台模型。网站需要真实依赖和逐控件实机验证，不能将“能挂载”等同于“效果一致”。

## 最新更新

- 七个工作入口：资产库、来源库、学习任务、应用记录、炼化方案、提示词、集合与关系；类型、来源和语言在资产库组合筛选。
- 工程、网站、书籍、图片和学习资产共用 `src/application/asset-catalog.ts`；账号产物复用学习资产并保留账号采集与缺字幕信息。来源是证据上下文，提示词库另有独立查询，不能把它们当成同一份资产列表。
- 内置通用知识、对话复盘、对话决定/修正、账号样本分析四种方案；个人方案与任务结果保留版本。
- 对话支持预览、选择消息范围和冻结；精确学习资产可回查证据、应用记录和其他分析版本，不自动认定新旧决定取代关系。
- 图片观察、推断和候选提示词可在线修订；独立模板支持严格变量、版本、复制和导出，始终标明未验证。
- 手动集合只保存精确资产引用；关系探索展示已有书籍/学习关系及证据，不生成聚类或推测连线。
- 学习资产应用记录绑定确切版本，记录采用理由、行动、结果与验证引用；记录本身是使用者陈述。
- Web 内选择本地项目或文件导入炼化，空资产库也可直接使用。
- 支持 Vue 2.6、Vue 2.7、Vue 3 与 React 组件预览，沿用源项目依赖。
- 组件缩略图按需加载；放大复用已加载实例，左右箭头按筛选顺序切换。
- 预览明确区分源调用场景、缺少上下文和构建失败，不伪造业务数据。
- 组件效果描述提示词与带来源依据的书籍知识资产流程。

具体范围与验证记录见 [文档索引](docs/USAGE.md)。

## 集中资产库

CLI、Web、MCP、书籍炼化和验证脚本共享同一个集中资产库解析规则，优先级为：

1. 程序调用显式传入的 `assetLibraryRoot`。
2. 环境变量 `VIBEHUB_LIBRARY_ROOT`。
3. 当前用户主目录下的 `.vibehub/library`。

项目资产写入 `projects/<project-id>`，书籍写入 `books`，图片写入 `images`，个人方案写入 `recipes`，文本/对话/账号任务与结果和学习应用记录写入 `learning`。提示词版本写入 `prompts`，手动集合引用写入 `collections`。Web 无项目参数时聚合工程、网站、书籍、图片与学习资产；提示词和集合由各自工作入口查询，来源不复制成新资产。`web <project-root>` 用于查看一个已登记项目。当前消费者不读取源项目内的 `.vibehub` 作为兜底。

集中资产库是本地生成数据，其中的索引和 manifest 可能保存源码项目的绝对路径，以便在本机回查。不要提交或直接分享整个资产库；分享前应只导出经过复核和脱敏的必要内容。

## 执行源项目的信任边界

普通 `distill` 不自动启动或执行源项目脚本，当前公开 CLI 也不提供启动源项目脚本的命令。

仓库内的源会话能力只接受调用方显式提供的 `sourceScript` 和 loopback（本机回环）`sourceUrl`：脚本名必须准确存在于 package.json，URL 只允许本机回环地址。任何后续集成若启用这条路径，都必须先取得操作者对该项目和脚本的明确授权。

package script 可以执行任意代码或任意命令；不要对来源不明的项目授权执行。由 VibeHub 启动的子进程只接收固定白名单环境和明确设置的覆盖项，不会直接继承宿主任意变量或令牌。这个环境白名单不是操作系统沙箱；脚本仍拥有当前操作系统用户的文件系统和网络权限。

组件预览只应执行可信源码：预览页面与 Web Asset Browser 同源，可访问父窗口及同源的其他 API；`networkPolicy: "block-external"` 只用于确定性地阻断外部网络请求，不是安全沙箱。不要用 Web Asset Browser 预览不可信项目，也不要把服务暴露给不可信网络。

## 能力入口

- `distill`：提炼前端组件、后端服务、业务入口、tokens、页面/业务模式和产品设计资产。
- 组件效果提示词：把组件效果转成产品可使用的专业中文需求，按布局、视觉、动效、交互详细描述；随 `distill` 生成，在 Web 组件详情复制，或用 MCP `get_component_prompt({filePath})` 查询。分析依据和待核对项单独展示，复制正文不携带源码。
- `distill-book`：普通命令提取章节和预设词表基础统计；`--prepare` / `--analysis` 由宿主分析并导入五类书籍知识及来源证据。旧统计不会作为语义资产展示。
- `recipes` / `learn`：个人炼化方案、冻结的文本/对话任务、带证据分析导入及版本保留，见[学习工作台手册](docs/runbooks/learning-workbench.md)。
- `conversation` / `memory`：选定对话预览冻结、决定与修正提炼、证据和应用回查，见[对话与记忆手册](docs/runbooks/conversation-memory.md)。
- `creator prepare` / `task` / `import`：B 站账号采集清单、专业宿主任务和证据导入，见[账号手册](docs/runbooks/creator-distillation.md)。真实 3Blue1Brown 样本仅覆盖主页及 3 项作品元数据，缺少字幕，尚未跑通视频内容分析。
- `image` / `prompts`：真实图片导入、在线或 CLI 修订，以及独立模板保存、变量渲染和导出，见[图片手册](docs/runbooks/image-distillation.md)与[提示词手册](docs/runbooks/prompt-library.md)。
- `collections`：按精确资产 ID 组织手动集合，查看已有关系和失效引用，见[集合手册](docs/runbooks/knowledge-collections.md)。
- Web Asset Browser：浏览集中资产库，并通过“导入炼化”选择本地项目文件夹或 PDF/TXT/Markdown 文档；用户主动启动后将产物写入集中库。
- MCP、Skill 与 Plugin：为 agent 提供工作流指引和 20 个只读工具，覆盖资产、任务上下文、账号任务、提示词、集合关系与学习记忆，详见[MCP 手册](docs/runbooks/use-vibehub-mcp.md)。

源码索引按内容缓存解析结果，重复炼化会显示解析/复用数量；普通炼化不逐组件启动浏览器或调用模型。当前还原依据是静态源码，实机视觉校准仍在后续计划中。

## 文档与社区

- [文档索引](docs/USAGE.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [社区行为准则](CODE_OF_CONDUCT.md)

普通缺陷和功能建议请使用 GitHub Issues。安全漏洞请使用 [Private Vulnerability Reporting](https://github.com/Lucoshin/vibe-foundry/security/advisories/new)，不要先公开利用细节。

## 书籍世界观、角色卡与关系网络

`distill-book <book-path> --prepare <new-work-dir>` 准备分块任务；让当前 AI 阅读 `book-task.md` 并生成分析，再用 `distill-book <book-path> --analysis <analysis-json>` 校验并输出五类知识资产及离线关系图。当前语义阅读由宿主 AI 执行，未接独立模型 API；来源核验不等于结论判真。完整步骤见[书籍炼化手册](docs/runbooks/distill-book-knowledge.md)。

## 长期方向

VibeHub 希望成为人和 AI 共用的知识、经验与记忆层，让炼化所得持续支撑开发与决策，并逐步获得 Codex、Claude Code 等生态的使用和采纳。当前提供的是项目自身的 CLI、Skill、Plugin 与 MCP 接口，不代表已被任何官方产品内置。仅凭炼化资产复刻自身仍是远期愿景。

## 许可证

VibeHub 以 [Apache License 2.0](LICENSE) 发布。第三方依赖继续受各自许可证约束，详见 [NOTICE](NOTICE) 与依赖自身的许可证文件。
