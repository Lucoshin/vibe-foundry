# Contributing to VibeFoundry

感谢你愿意改进 VibeFoundry。这里接受问题修复、测试、文档和经过讨论的功能贡献。

## 开始之前

- 使用 Node.js `>=22.18.0 <23`，或 `>=24.11.0`，并使用 npm `11.6.2`。
- 先阅读 [文档索引](docs/README.md) 和与改动相关的计划或 ADR（架构决策记录）。
- 大型功能、公开契约变化或新的资产类型应先创建 Issue 讨论范围。
- 不要提交环境文件、本地生成的集中资产库、数据库、测试结果、截图、访问凭据或包含个人绝对路径的内容。

## 本地开发

```bash
git clone https://github.com/Lucoshin/vibe-foundry.git
cd vibe-foundry
npm ci
npm test
```

实现改动时先补充失败测试，再写最小实现。提交 Pull Request 前运行：

```bash
npm test
npm run build
node scripts/verify-mvp.mjs
```

如果改动影响产品范围、公开契约、验收方式或架构决策，请同步更新对应文档。

## 提交 Pull Request

Pull Request 应说明：

- 要解决的问题和明确不包含的范围。
- 对 CLI、schema、资产库或文档契约的影响。
- 已运行的验证命令及结果。
- 隐私检查结果，特别是秘密、用户名、绝对路径和本地生成数据。

请保持改动聚焦，不把无关重构混入同一 Pull Request。提交信息使用简短的祈使句并说明实际变化。

## 许可证

除非你明确另行说明，提交给本项目并被接纳的贡献按 [Apache-2.0](LICENSE) 授权，具体规则以许可证正文为准。

参与社区也表示你同意遵守 [行为准则](CODE_OF_CONDUCT.md)。安全问题请按 [安全策略](SECURITY.md) 私下报告。
