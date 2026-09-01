---
project: VibeFoundry
category: release-checklist
source_path: docs/reports/open-source-release-checklist.md
status: active
last_updated: 2026-09-01
---

# VibeFoundry 开源发布检查清单

本清单用于首次公开 `Lucoshin/vibe-foundry` 前的最终复核。首个版本只发布 GitHub 源码，不发布 npm 包。未完成全部检查、或仓库所有者尚未再次确认时，不得创建公开远端或推送。

## 1. 发布内容

- [ ] `LICENSE` 与 Apache 官方 Apache License 2.0 文本一致。
- [ ] `NOTICE` 包含 `VibeFoundry` 与 `Copyright 2026 Lucoshin`。
- [ ] README、贡献指南、安全策略、行为准则和 GitHub 模板可从仓库首页找到。
- [ ] `package.json` 保持 `private: true`，并声明 `Apache-2.0` 与公开仓库地址。
- [ ] 第三方依赖保持各自许可证；GitNexus 本地技能副本不进入公开提交。

## 2. 自动验证

```bash
node --test tests/release/open-source-readiness.test.mjs
npm test
npm run build
node scripts/verify-mvp.mjs
npm pack --dry-run --json
```

- [ ] 所有命令退出码为 0。
- [ ] `npm pack --dry-run --json` 不包含环境文件、测试结果、临时截图、本地数据库或第三方 GitNexus 技能。
- [ ] GitHub Actions 在 Windows 与 Ubuntu、Node.js `22.18.0` 与 `24.11.0` 上通过。

## 3. 隐私与安全

- [ ] 搜索 secret、token、Cookie、私有项目名、用户名和绝对个人路径，无未解释命中。
- [ ] 集中资产库、生成索引和 manifest 未加入提交；这些文件可能包含源码项目的绝对路径，不得直接分享。
- [ ] 环境文件、测试报告、未审查/临时截图、压缩包和 SQLite 数据库未加入提交；仅保留 `.gitignore` 精确白名单中的三张已审查公开 fixture 文档图。
- [ ] 子进程只接收受控环境；预览缓存不持久化原始 stdout/stderr。
- [ ] GitHub Private Vulnerability Reporting 已在仓库设置中启用。

## 4. 仓库设置

- [ ] 默认分支为 `main`，分支保护要求 CI 通过。
- [ ] Actions 默认权限保持只读，不允许未经审查的发布或部署权限。
- [ ] Issue、Pull Request、Dependabot 和安全报告入口可用。
- [ ] 仓库描述、主页和主题与 README 一致，不宣称 npm 包已发布。

## 5. 首次公开

- [ ] 使用 `git status` 和暂存区逐文件复核最终内容。
- [ ] 运行 GitNexus `detect_changes`，只显示预期模块和流程变化。
- [ ] 创建首个本地提交后再次执行核心验证。
- [ ] 向仓库所有者展示最终 diff、验证结果和待推送提交。
- [ ] 仓库所有者明确确认后，才创建公开仓库并推送 `main`。

当前状态：本地验证已完成，仓库所有者已于 2026-09-01 明确授权公开；待同步并复核最终暂存快照、创建首个本地提交、配置 GitHub 远端仓库后推送。
