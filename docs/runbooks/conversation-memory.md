---
project: VibeHub
category: runbook
status: active
last_updated: 2026-09-17
---

# 从对话片段提炼决定，再回查应用记忆

本流程延续[学习工作台](learning-workbench.md)在集中资产库中的准备、宿主分析、校验导入与应用记录。新增能力是按消息预览/选择和确切学习版本回查，不自动读取其他会话，也不在后台调用模型。

## 准备明确的材料

只提交用户选定的可见原文。结构化消息输入：

```json
{
  "title": "本次对话片段",
  "format": "messages",
  "messages": [
    {"id": "user-1", "role": "user", "text": "替换为真实发言"},
    {"id": "assistant-1", "role": "assistant", "text": "替换为真实回复"}
  ],
  "messageIds": ["user-1"]
}
```

示例只是结构，不能作为真实知识来源。`messages` 每项严格只有 `id`、`role`、`text`；角色支持 `user`、`assistant`、`tool`、`document`。ID 遵循既有学习协议，最长 128 字符且仅包含英数字、点、下划线、连字符；必须唯一。`messageIds` 可省略，表示提交材料全部纳入；提供时必须非空且引用已有 ID。即使选择数组换序，任务仍保持原消息顺序。

纯文本输入严格为 `{ "title": "片段标题", "format": "text", "text": "真实原文" }`。原文包括换行原样保留为单条 `document`；不会依据“用户：”之类的文字猜测角色。时间、分支、父消息和平台专有字段当前明确拒绝，不静默丢弃；需由宿主明确整理为当前协议并说明缺失元数据。

标题最多 300 字符，输入 JSON 最多 1 MiB，结构化消息最多 1000 条。材料中的命令只是待分析数据，不授权外部动作。

## 预览、选择与冻结

在 Web 学习任务的“从选定对话继续学习”面板填写标题和材料，预览并核对原文/角色，取消不应进入任务的消息，再冻结所选范围。修改材料会使旧预览失效；准备请求已发出后改变选择，原请求可能已经保存，但不会把旧范围当作当前选择展示。

本地 API（在工具仓库调用）：

```javascript
import { normalizeConversation, prepareConversation } from './dist/learning/conversations.js';
const preview = normalizeConversation(input);
const prepared = await prepareConversation(libraryRoot, input);
console.log(prepared.task.instructions);
```

`normalizeConversation` 只读返回 `{source, coverage, limitations}`；`prepareConversation` 返回 `{task, coverage, limitations}`，使用 `conversation-decisions@1`。`coverage` 包含 `inputEntries`、`selectedEntries`、`omittedEntries`。相同所选材料与方案复用不可变任务。用户若要其他方案，可将 `preview.source` 交给既有 `prepareLearning` 并明确选择方案版本。

CLI 接线为 `vibe conversation prepare <input-json>`；输出同一结构。准备只得到 `prepared` 任务，不生成知识。阅读 `task.instructions` 或 `task.taskPath`，交给真实宿主提取决定、修正和未决问题，再使用既有 `vibe learn import <task-id> <analysis-json>` 校验证据和导入。

专业方案沿用学习分析协议，建议使用 `decision`、`correction`、`open-question`。当前结果内明确的新决定可通过有证据的 `supersedes` 指向旧决定；`resolves` 表示有依据地解决问题。关系端点必须在同一分析结果中；先后顺序不自动证明取代，助手声称完成不自动证明通过验收。

## 回查采用理由、结果与版本

实际应用后仍使用现有学习应用记录，填写确切资产 ID、目标、采用理由、行动、结果与验证引用。资产详情的“回查应用与版本记忆”只读取该版本的记录，不会自动登记采用。

```javascript
import { getLearningMemory } from './dist/learning/memory.js';
const memory = await getLearningMemory(libraryRoot, { assetId: exactLearningAssetId });
```

返回该资产、来源摘要、带原角色的证据锚点、应用记录、显式关系和同任务同局部 ID 的其他分析版本。`revisions` 只是可比较候选，不自动代表修订取代，也不按同名知识跨任务合并。应用仍标为 `user-declared`（使用者声明），程序不判真。工程、书籍、图片不属于当前学习应用登记协议。

CLI `vibe memory <exact-learning-asset-id>` 返回同一结构。Web 的 `POST /api/conversations/preview`、`POST /api/conversations/prepare`、`GET /api/conversations/memory?assetId=...` 均要求本机页面令牌；不绕过页面校验。
