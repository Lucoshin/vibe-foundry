---
project: VibeHub
category: runbook
status: active
last_updated: 2026-09-17
---

# B 站知识账号采集与炼化

本流程使用当前集中资产库（`VIBEHUB_LIBRARY_ROOT` 或默认 `~/.vibehub/library`）。宿主实际采集公开主页与明确选取的作品，项目负责严格校验、冻结、证据导入及统一消费；不在后台自动调用模型或读取浏览器凭据。

## 采集与覆盖

先按可用平台工具采集账号及作品，并记录采集时间、样本发布时间范围、抽样方法和缺失项。最新作品、高表现作品与搜索相关性样本是不同抽样方法，不可互相冒充。首批只接 B 站；来源必须是同一明确账号的真实作品。

根字段严格为 `schemaVersion/platform/account/collectedAt/sampling/works`。作品包含确切 BV 号、URL、标题、发布时间、简介及字幕状态；无字幕时写 `unavailable` 与真实原因，不能补造空字幕或把简介复制成字幕。可用字幕逐条为 `{startSeconds,endSeconds,text}`，秒数与文字必须来自实际取得的时间轴。材料不超过 2 MiB，样本 1–20 项。

## 准备与分析

在工具仓库运行 `npm run build` 后：

```bash
vibe creator prepare <capture-json>
vibe creator task <task-id>
vibe creator import <task-id> <analysis-json>
```

未安装 `vibe` 时换为 `node dist/cli.js`。`prepare` 返回冻结任务、覆盖数量和限制；宿主读取完整任务后按其学习分析协议输出 JSON，再用 `import` 严格校验。

专业类型是 `creator-profile`（主页声明）、`creator-topic`（样本选题）、`creator-audience`（受众假设）、`creator-template`（候选模板）、`creator-transcript`（字幕内容）和 `creator-conversion`（公开转化入口）。受众与模板只能标 `interpretation`；主页类型只能引主页；字幕类型至少有一条真实字幕正文引文。其余事实与解释分别标明，不能用账号受欢迎程度证明方法有效。

证据引用具体主页、作品元数据或字幕条目。完整采集清单用于回查，不能作为替代内容证据。引文必须在对应条目唯一逐字匹配；字幕不能只引系统附加的 URL 或时间码。通用学习导入也保留专业类型校验。

## Web、MCP 与应用

Web 的“学习任务 → B 站账号样本炼化”可提交采集清单、查看覆盖与缺失、复制宿主任务、导入分析。产物进入统一资产库；详情显示账号、采集时间、样本数、字幕覆盖和原证据。

MCP `get_creator_task({taskId})` 只读回查清单，`search_library_assets` / `get_library_asset` 查产物，`create_task_context` 输出带来源限制的上下文。账号产物复用学习资产确切身份，可由用户显式登记应用；记录仍是使用者声明，不自动表示方法有效。

## 当前真实样本

已取得 [3Blue1Brown 主页](https://space.bilibili.com/88461692)与三项作品的真实标题/简介，采集快照在上述示例。字幕读取返回缺少登录凭据，因此只完成主页及元数据层的知识提炼，没有声称看完视频、分析视频论证结构或完成全账号统计。此限制随产物进入任务上下文。

自动化回归：`node --test tests/learning/creators.test.mjs tests/web/creator-api.test.mjs`。真实跨入口验收：`node scripts/verify-knowledge-directions.mjs`，使用工作区隔离验收库且保留真实来源。该脚本还使用仓库本地历史图片，缺少图片时应先准备真实图片，不制造替代证据。
