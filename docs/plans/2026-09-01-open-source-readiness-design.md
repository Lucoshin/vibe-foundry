---
project: VibeFoundry
category: design
source_path: docs/plans/2026-09-01-open-source-readiness-design.md
status: active
last_updated: 2026-09-01
---

# VibeFoundry 开源准备设计

## 1. 目标

把当前本地项目整理成可安全公开的源码仓库，并以 Apache License 2.0 授权。首个公开版本只发布 GitHub 源码，不发布 npm 包。

仓库目标地址为 `Lucoshin/vibe-foundry`。创建远端仓库、切换为公开可见并推送之前，必须再次取得仓库所有者确认。

## 2. 发布边界

公开内容包括：

- TypeScript 源码、测试、示例项目和构建脚本。
- 项目设计、ADR、运行手册和验证报告。
- 三张经过隐私检查、只展示公开 fixture 数据的 Pencil/Web 文档截图；路径由 `.gitignore` 精确白名单约束。
- Codex Skill、Plugin 与 MCP 的项目自有配置。
- Apache-2.0 许可证、贡献指南、安全策略、行为准则和 GitHub 社区模板。

不公开或不纳入首个版本的内容包括：

- 本地测试结果、未审查或临时截图、打包产物、环境变量文件和本地数据库。
- GitNexus 的第三方本地技能副本；其许可证不是 Apache-2.0，公开仓库只保留项目自有内容。
- npm registry 发布流程。`package.json` 必须声明 `private: true`，避免误发布。
- 任何未经确认的私有项目名称、用户名、绝对路径、业务数据或访问凭据。

## 3. 安全与信任边界

### 3.1 子进程环境

VibeFoundry 会启动源项目的构建或预览命令。宿主进程的完整 `process.env` 不得直接传给这些子进程。

采用单一共享的环境构造函数：

- 只复制运行 Node/npm 和操作系统命令所必需的变量，例如 `PATH`、`PATHEXT`、`SYSTEMROOT`、`COMSPEC`、临时目录和用户目录。
- 只允许 VibeFoundry 明确设置的覆盖变量进入子进程。
- 不根据变量名猜测“可能安全”的额外字段；令牌、密钥和任意宿主变量默认不传递。
- 源项目需要额外变量时，由操作者显式写入其项目脚本或传入受控配置，不继承 VibeFoundry 宿主秘密。

### 3.2 构建日志

组件预览构建的原始 stdout/stderr 可能包含源项目路径或秘密，不写入持久化预览缓存。错误仍在当前调用中返回给本地操作者，缓存只记录状态和可复用产物。

### 3.3 资产库

资产包继续写入集中资产库，而不是源项目内的 `.vibe-foundry` 目录：

1. 显式 `VIBE_FOUNDRY_LIBRARY_ROOT`。
2. 未设置时使用用户主目录下的 `.vibe-foundry/library`。

CLI、Web、MCP、书籍炼化和 MVP 验证必须共享同一个解析规则。资产库中的索引和 manifest 可保留绝对项目路径，因为它们用于本机回查，并且整个资产库是本地生成、默认忽略的私有数据；文档必须明确不可直接提交或分享。

## 4. 跨平台契约

- 删除代码和当前文档中的开发者专属绝对默认路径。
- Windows、macOS 和 Linux 均通过 `node:os` 的用户主目录及 `node:path` 生成默认路径。
- MCP 根据项目根目录在集中资产库中定位确定性项目 ID，不保留旧 `.vibe-foundry` 双路径兜底。
- `web <project-root>` 作为已记录的单项目查看入口保留；无参数 `web` 聚合集中资产库。

## 5. 开源仓库体验

- 根 README 说明定位、支持范围、安装、Quickstart、资产库位置、风险边界和贡献入口。
- `CONTRIBUTING.md` 提供本地开发、测试和提交规范。
- `SECURITY.md` 使用 GitHub 私密漏洞报告作为首选渠道，不虚构安全邮箱。
- 自有 `CODE_OF_CONDUCT.md` 给出最小、可执行的社区规则和举报方式。
- GitHub Issue/PR 模板约束复现信息、契约变化、测试和隐私检查。
- CI 采用最小权限、固定到完整提交 SHA 的官方 Actions，在受支持 Node 版本上运行构建和测试。
- Dependabot 只维护 npm 与 GitHub Actions 依赖。

## 6. 许可证与归属

- 许可证：Apache License 2.0 完整文本。
- NOTICE：`VibeFoundry`，`Copyright 2026 Lucoshin`。
- 项目自有源码、文档和配置按 Apache-2.0 发布。
- 第三方依赖继续受各自许可证约束；仓库不重新授权第三方本地技能副本。

## 7. 验收门槛

公开前必须同时满足：

- 新增的发布静态测试、子进程环境测试和集中资产库契约测试通过。
- `npm test`、`npm run build`、`node scripts/verify-mvp.mjs` 通过。
- `npm pack --dry-run --json` 不包含私有/临时截图、测试结果、环境文件或第三方 GitNexus 技能；精确白名单中的三张公开文档截图除外。
- 秘密和绝对私有路径扫描无命中。
- GitNexus `detect_changes` 只显示预期模块和流程变化。
- 待提交列表逐项复核，首个提交不包含未经审查的本地生成数据。
- 仓库所有者明确确认后，才创建公开远端并推送。
