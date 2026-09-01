---
project: VibeFoundry
category: governance
source_path: docs/governance/document-driven-development.md
status: active
last_updated: 2026-07-08
---

# 文档驱动开发治理规则

## 1. 原则

VibeFoundry 采用文档驱动开发。文档不是事后记录，而是开发路由、范围控制、验收依据和知识沉淀系统。

每次开发必须遵循：

```text
需求/决策 -> 计划文档 -> 失败测试 -> 实现 -> 验证 -> 文档更新 -> 阶段验收
```

## 2. 文档层级

### 2.1 总入口

- `docs/README.md`
  - 所有开发和调研的索引入口。

### 2.2 产品层

- `docs/requirements/`
  - 记录产品定位、用户、范围、成功标准。

### 2.3 研究层

- `docs/research/`
  - 记录竞品、市场、技术生态和外部参考。

### 2.4 计划层

- `docs/plans/`
  - 记录实现计划、阶段排期、模块设计和执行 checklist。

### 2.5 治理层

- `docs/governance/`
  - 记录文档更新规则、验证桥接、决策触发器和工作流约束。

### 2.6 未来层

后续可按需新增：

- `docs/adr/`：架构决策记录，ADR 是 Architecture Decision Record，中文可理解为“架构决策记录”。
- `docs/troubleshooting/`：问题排查记录。
- `docs/reports/`：周报、里程碑报告和发布总结。
- `docs/runbooks/`：常用操作手册。

## 3. 更新触发器

以下情况必须更新或新增文档：

- 产品范围变化：更新 PRD 和总实现文档。
- 阶段目标变化：更新总实现文档和对应阶段计划。
- 技术架构变化：更新技术路线，必要时新增 ADR。
- 新增资产类型：更新扩展资产模型设计和 schema 说明。
- 新增 CLI 命令：更新总实现文档、README 和相关测试说明。
- 新增 MCP/Skill/Plugin 能力：更新总实现文档和接入文档。
- 发现竞品或生态重大变化：更新竞品分析。
- 遇到重复问题或排障经验：新增 troubleshooting，并判断是否升级为治理规则。

## 4. 验证桥接

每个阶段计划必须声明：

- 要修改的文件或目录。
- 要新增的测试。
- 必须运行的验证命令。
- 验证输出应该证明什么。
- 哪些能力明确不在本阶段范围内。

当前基础验证命令：

```bash
npm test
npm run build
```

新增 CLI 行为时，必须补充端到端验证：

```bash
node dist/cli.js distill <fixture-project>
```

新增 schema 行为时，必须补充 schema 测试。

新增 analyzer，中文可理解为“分析器”时，必须补充 fixture 和单元测试。

新增 MCP 工具时，必须补充工具输入输出测试和只读约束测试。

## 5. 决策记录规则

以下决策需要 ADR：

- 引入外部依赖或放弃零依赖策略。
- 改变资产包文件结构。
- 改变 MCP/Skill/Plugin 分层。
- 引入 LLM API 作为核心流程依赖。
- 开始支持完整书籍/文化材料炼化。
- 引入数据库、向量库或 SaaS 后端。

ADR 模板：

```markdown
# ADR-编号：决策标题

## 背景

## 选项

## 决策

## 后果

## 验证方式
```

## 6. 阶段完成规则

阶段完成必须同时满足：

- 计划中的交付物已落地。
- 对应测试已新增或更新。
- 阶段验证命令通过。
- 文档已同步更新。
- 明确未完成事项和下阶段入口。

不能仅凭“代码看起来完成”关闭阶段。

## 7. 源头优先级

当文档之间冲突时，按以下顺序判断：

1. 当前用户明确指令。
2. `AGENTS.md`。
3. `docs/plans/2026-07-08-vibe-foundry-master-implementation.md`。
4. `docs/requirements/vibe-foundry-prd.md`。
5. 具体阶段计划。
6. 旧的调研或临时计划。

冲突必须先更新文档，再执行实现。
