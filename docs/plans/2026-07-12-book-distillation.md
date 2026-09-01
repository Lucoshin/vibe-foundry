# Book Distillation Implementation Plan

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
