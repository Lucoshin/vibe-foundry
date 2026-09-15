# Book Distillation Implementation Plan

> 当前语义能力入口（2026-09-08）：世界观、角色卡、设定、概念与隐喻网络按[书籍知识资产计划](2026-09-08-book-knowledge-assets.md)自行实现，见 [ADR-006](../adr/006-book-knowledge-assets.md)。下方保留 0.1.0 基础词表统计的历史范围，不能作为新语义资产的能力说明。

## 目标

为完整书籍建立独立、可追溯、无外部模型依赖的炼化流程。

## 交付物

- `src/analyzers/book-distiller.ts`
- `vibe-foundry distill-book <book-path>`
- `book-assets.json` 与 `book-report.md`
- 章节、概念簇、跨概念关系、来源行号和版权边界测试

## 验证

```bash
npm test
npm run build
node dist/cli.js distill-book <book.pdf>
```

## 不包含

- 不保存书籍全文或插图。
- 不调用外部 LLM。
- 不生成冒充原作者观点的内容。

## 2026-09-08 修复与现有限制

- Markdown ATX 章节标题（如 `# 第一章 形式系统`）参与章节分析，来源行号保持原始文件位置。
- 共现关系基于所有命中计算；每个概念导出的来源列表仍最多 24 条，导出限制不再截断关系分析。
- 当前概念识别仅包含 9 组预设中文词簇，不是任意主题的语义分析器；关系只表示章节共现。
- 书籍输出尚未接入 Web/MCP，通用提炼及方法/能力交付按[现状审计](../reports/2026-09-08-project-capability-audit.md)作为后续工作。
