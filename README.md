# VibeFoundry

VibeFoundry 是一个本地优先的资产炼化工具。它从代码、业务流程、产品方案和文化材料中提取可复用的组件、服务、模式、设计资产和文化隐喻，并通过 CLI、Web、Skill、MCP 与 Codex Plugin 提供查询入口。

当前仓库发布的是 Apache-2.0 授权的源码，不发布 npm 包。`package.json` 保持 `private: true`；请从源码 clone、安装依赖并构建。

## 支持环境

- Node.js `>=22.18.0 <23`，或 `>=24.11.0`。
- npm `11.6.2`。
- Windows 与 Ubuntu 进入持续集成矩阵。

## 从源码开始

```bash
git clone https://github.com/Lucoshin/vibe-foundry.git
cd vibe-foundry
npm ci
npm run build
```

用公开 fixture 完成第一次炼化并启动本地只读浏览器：

```bash
node dist/cli.js distill examples/fixture-project
node dist/cli.js web --port 4317
```

打开 `http://127.0.0.1:4317/`。完整的 10 分钟流程见 [Quickstart](docs/runbooks/quickstart.md)。

常用命令：

```bash
node dist/cli.js distill <project-root>
node dist/cli.js distill-book <book.pdf>
node dist/cli.js web --port 4317
npm test
```

## 集中资产库

CLI、Web、MCP、书籍炼化和验证脚本共享同一个集中资产库解析规则，优先级为：

1. 程序调用显式传入的 `assetLibraryRoot`。
2. 环境变量 `VIBE_FOUNDRY_LIBRARY_ROOT`。
3. 当前用户主目录下的 `.vibe-foundry/library`。

项目资产写入 `projects/<project-id>`，书籍资产写入 `books`。Web 无项目参数时聚合集中库；`web <project-root>` 用于查看一个已登记项目。当前消费者不读取源项目内的 `.vibe-foundry` 作为兜底。

集中资产库是本地生成数据，其中的索引和 manifest 可能保存源码项目的绝对路径，以便在本机回查。不要提交或直接分享整个资产库；分享前应只导出经过复核和脱敏的必要内容。

## 执行源项目的信任边界

普通 `distill` 不自动启动或执行源项目脚本，当前公开 CLI 也不提供启动源项目脚本的命令。

仓库内的源会话能力只接受调用方显式提供的 `sourceScript` 和 loopback（本机回环）`sourceUrl`：脚本名必须准确存在于 package.json，URL 只允许本机回环地址。任何后续集成若启用这条路径，都必须先取得操作者对该项目和脚本的明确授权。

package script 可以执行任意代码或任意命令；不要对来源不明的项目授权执行。由 VibeFoundry 启动的子进程只接收固定白名单环境和明确设置的覆盖项，不会直接继承宿主任意变量或令牌。这个环境白名单不是操作系统沙箱；脚本仍拥有当前操作系统用户的文件系统和网络权限。

组件预览只应执行可信源码：预览页面与 Web Asset Browser 同源，可访问父窗口及同源的其他 API；`networkPolicy: "block-external"` 只用于确定性地阻断外部网络请求，不是安全沙箱。不要用 Web Asset Browser 预览不可信项目，也不要把服务暴露给不可信网络。

## 能力入口

- `distill`：提炼前端组件、后端服务、业务入口、tokens、页面/业务模式和产品设计资产。
- `distill-book`：从 PDF、TXT 或 Markdown 提取章节、概念簇和关系资产。
- Web Asset Browser：本地只读查看集中资产库。
- MCP、Skill 与 Plugin：为 agent 提供只读资产查询和工作流指引。

## 文档与社区

- [文档索引](docs/README.md)
- [完整实现总文档](docs/plans/2026-07-08-vibe-foundry-master-implementation.md)
- [开源准备设计](docs/plans/2026-09-01-open-source-readiness-design.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [社区行为准则](CODE_OF_CONDUCT.md)
- [开源发布检查清单](docs/reports/open-source-release-checklist.md)

普通缺陷和功能建议请使用 GitHub Issues。安全漏洞请使用 [Private Vulnerability Reporting](https://github.com/Lucoshin/vibe-foundry/security/advisories/new)，不要先公开利用细节。

## 许可证

VibeFoundry 以 [Apache License 2.0](LICENSE) 发布。第三方依赖继续受各自许可证约束，详见 [NOTICE](NOTICE) 与依赖自身的许可证文件。
