# VibeFoundry 扩展资产模型设计

> **历史契约说明（2026-09-01）：** 本文保留用于模型决策追溯；其中源项目内资产目录约定已被 central-only 集中资产库契约取代，资产分类设计仍然有效。

## 1. 决策

VibeFoundry 采用 **C：双核心路线**。

MVP 仍然从工程资产开始实现，因为工程资产最容易验证，也最容易通过本地 CLI 做出稳定输出。但产品定义和技术架构从第一天起就预留产品设计资产与文化隐喻资产，避免项目被限制成“前端组件炼化器”。

## 2. 新定位

VibeFoundry 的新定位是：

> 从代码、业务流程、产品方案和文化材料中炼化可复用资产，让 AI 在后续开发、产品设计和创意构思中调用。

它不是普通知识库，也不是简单 RAG 系统。RAG 主要解决“查到原文并生成回答”，VibeFoundry 解决的是“把材料提炼成可迁移、可组合、可复用的资产”。

## 3. 资产类型

### 3.1 工程资产

工程资产来自真实项目代码。

包括：

- 前端组件
- 页面模式
- 设计 tokens
- 后端接口
- 业务服务
- 数据模型
- 中间件
- 测试模板
- 错误处理和日志模式

例子：

- `auth.register`
- `auth.login`
- `rbac.permission-check`
- `billing.subscription`
- `upload.file`
- `notification.email`

### 3.2 业务资产

业务资产来自项目中的业务流程、产品规则和用户路径。

包括：

- 登录/注册流程
- 邮箱验证流程
- 找回密码流程
- 邀请返利流程
- 会员订阅流程
- 内容审核流程
- 积分体系
- 工作流审批

业务资产不只是接口代码，还包括触发条件、状态流转、失败场景、安全约束和复用边界。

### 3.3 产品设计资产

产品设计资产来自真实产品、PRD、交互流程和页面结构。

包括：

- onboarding，新手引导
- 空状态
- 升级转化
- 价格页
- 设置页
- Dashboard 信息架构
- 搜索和筛选模式
- 用户激励设计
- 权限分层体验

这类资产服务于下一次产品构思和页面设计。

### 3.4 文化隐喻资产

文化隐喻资产来自书籍、文明、神话、历史、哲学、品牌材料和个人笔记。

包括：

- 核心隐喻
- 角色原型
- 世界观结构
- 仪式感设计
- 命名体系
- 符号系统
- 情绪基调
- 视觉母题
- 产品交互可借鉴的叙事结构

例子：

- 从《道德经》提炼“无为、柔弱胜刚强、返璞归真”的产品原则。
- 从希腊神话提炼“职能分工、英雄旅程、命运机制”的社区或游戏隐喻。
- 从《沙丘》提炼“资源稀缺、预言、宗教政治、生态系统”的世界观资产。

## 4. 资产包结构

`.vibe-foundry/` 后续应支持以下结构：

```text
.vibe-foundry/
  asset-manifest.json
  component-catalog.json
  service-catalog.json
  tokens.json
  page-patterns.md
  business-patterns.md
  concept-assets.json
  metaphor-packs/
    <source-name>.json
  agent-rules.md
  reuse-report.md
```

MVP 必须实现：

- `asset-manifest.json`
- `component-catalog.json`
- `tokens.json`
- `agent-rules.md`
- `reuse-report.md`

MVP 应预留但可以为空：

- `service-catalog.json`
- `business-patterns.md`
- `concept-assets.json`

后续阶段实现：

- `metaphor-packs/`

## 5. 炼化器模块

### 5.1 Code Distiller

职责：

- 扫描前端组件、后端接口、服务模块和工具函数。
- 提取依赖、输入输出、复用评分和风险。

### 5.2 Business Distiller

职责：

- 识别登录/注册、权限、计费、邀请、审核等业务流程。
- 提取流程步骤、状态变化、安全约束和复用边界。

### 5.3 Product Distiller

职责：

- 识别页面结构、用户路径、转化设计和信息架构。
- 输出可用于下一次产品设计的模式库。

### 5.4 Metaphor Distiller

职责：

- 从书籍、笔记和文化材料中提取隐喻资产。
- 输出命名、视觉、交互、叙事和世界观参考。

MVP 不实现完整 Metaphor Distiller，但 schema 必须预留。

### 5.5 Asset Registry

职责：

- 统一保存所有资产。
- 提供搜索、过滤、评分、引用和版本信息。
- 后续通过 MCP 暴露给 agent。

## 6. 实施原则

1. **工程先行，创意预留**
   - 第一阶段仍然做 CLI 和工程资产。
   - 但 schema 不应只允许前端组件。

2. **资产不是原文**
   - 文化材料只能保存结构化洞察、摘要、引用位置和用户自有笔记。
   - 不保存整本书或大段版权文本。

3. **复用必须带上下文**
   - 每个资产都要有适用场景、限制、来源和风险。

4. **启发式评分必须透明**
   - 所有评分都标记为 heuristic，中文可理解为“启发式判断”。

5. **MCP 是查询层，不是核心**
   - 核心是资产炼化和资产协议。
   - MCP 只负责让 agent 查询和使用资产。

## 7. 调整后的实现顺序

1. CLI 骨架。
2. 通用资产 schema。
3. 最小 `.vibe-foundry/` 输出。
4. 前端组件识别。
5. 后端接口和业务流程轻量识别。
6. tokens 提取。
7. 产品模式总结。
8. agent rules。
9. Codex Skill。
10. MCP server。
11. 文化隐喻资产输入与 metaphor pack。

## 8. 当前结论

现在不需要推翻原计划，但要修正范围表述：

- 不再说 VibeFoundry 只是前端设计系统工具。
- MVP 仍先做工程资产。
- 工程资产不只包含前端，也包含后端接口和通用业务流程。
- 产品设计和文化隐喻资产作为第二阶段能力，在第一阶段 schema 中预留。
