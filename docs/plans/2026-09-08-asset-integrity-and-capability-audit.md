---
project: VibeFoundry
category: implementation-plan
source_path: docs/plans/2026-09-08-asset-integrity-and-capability-audit.md
status: completed
last_updated: 2026-09-08
---

# 资产真实性修复与能力现状审计

## 目标与依据

用户明确的方向是“炼化一切”：不仅把信息整理为可追溯、可检索、可复用的资产，还要将所有信息资产转变为可供 AI 和人使用的“装甲”。本轮先核对真实完成度，并修复已经复现、无需猜测新业务契约的问题。装甲的具体交付形式和任务验收另起后续计划。

依据总实现文档 M2、M9、书籍炼化增量，以及集中资产库、组件预览和书籍炼化现有计划。不引入新依赖、不改变集中库根目录规则。

## 已复现的问题与本轮实现

1. **隐喻资产真实性与文件一致性**
   - 中文来源被统一转成 `metaphor-pack`，独立 JSON 被覆盖，和 `concept-assets.json` 不一致。
   - 文件名保留 Unicode 字母、数字；无有效名称显式报错。批次文件名冲突在写入任何资产包文件前报错。
   - 未命中规则不再生成 `lens`、默认 `guide`、默认 `contextual`。保留真实来源和空数组；明确命中的规则建议和情绪保留。
   - 重新生成时清理本工具拥有的 `metaphor-packs/*.json` 中已不属于本批输出的文件；不触碰源码和其他目录。
   - 修改 `src/analyzers/metaphor-distiller.ts`、`src/schema/metaphor-pack.ts`、`src/writers/asset-writer.ts` 与对应测试。
2. **组件身份与预览来源隔离**
   - Web 资产 ID 只包含类别和名称，两个项目的 Button 共用标签、隐藏状态和选择目标。
   - 资产身份包含项目、类别、来源和名称；组件预览严格按来源路径关联，删除名称兜底。
   - 预览登记 ID 纳入明确的项目根路径，使相同相对路径的跨项目组件有不同路由。登记构建函数要求调用方提供项目根路径，生产入口与测试同步。
   - 已生成的旧包如出现预览 ID 冲突应显式报错并提示重新炼化，不得继续选第一个项目。旧的模糊浏览器状态不迁移到新身份。
   - 修改 `src/web/asset-view-model.ts`、必要的前端状态/服务器逻辑、`src/preview/component-preview-runtime.ts`、`src/index.ts` 与对应测试。
3. **书籍已承诺能力的漏识别**
   - Markdown ATX 章节（例如 `# 第一章 形式系统`）应识别并保留原始行号。
   - 概念关系用全部命中位置计算，输出来源仍限制为 24 条，避免长书后续章节关系丢失。
   - 修改 `src/analyzers/book-distiller.ts` 与对应测试，不改变现有概念词典和书籍输出协议。
4. **验证和文档失配**
   - 基线 `npm test`：205 项，204 通过、1 失败；失败来自测试强制开源清单处于“待首次提交/远端”历史状态。
   - 保留用户已有开源清单修改，将测试改为验证持久的发布边界和记录要求。
   - 修正总计划的陈旧“尚无组件/service/tokens”等描述，增加实际未完成清单和愿景说明。

## 验收与验证

每项行为修复先写回归测试并观察失败，再实现最小改动。回归覆盖中文文件/冲突/旧产物、未知材料空态、跨项目与同项目同名组件、Markdown 章节以及第 24 个命中之后的关系。

```bash
npm run build
node --test tests/analyzers/metaphor-distiller.test.mjs tests/distill-flow.test.mjs
node --test tests/analyzers/book-distiller.test.mjs
node --test tests/web/*.test.mjs tests/preview/component-preview-runtime.test.mjs
node --test tests/release/open-source-readiness.test.mjs
npm test
node scripts/verify-mvp.mjs
```

使用临时 fixture 和临时集中库验证，不重新炼化用户的真实材料。完成时记录实际测试结果与旧代码清理情况。

## 完成记录

- 隐喻与炼化流程回归：新增 10 项先失败，修复后定向 19/19 通过。
- 书籍回归：新增 2 项先失败，修复后定向 7/7 通过；真实 `distill-book` 子进程验证 Markdown 章节、行号和后续章节关系通过。
- Web 与预览回归：首轮 8 项新回归先失败，补充诊断/挂载冲突及显式构建选项验证后，定向 77/77 通过。
- 发布配置定向 9/9 通过，用户已有发布清单改动保持不变。
- `node scripts/verify-mvp.mjs` 通过：内部 `npm test` 226/226 通过，`npm run build` 通过，临时 fixture 炼化、MCP 查询、Plugin 声明与集中库产物验证通过。
- `git diff --check` 通过；交叉代码审查未发现本轮阻断问题。

清理了无来源隐喻兜底、旧的短预览哈希、按名称关联预览的兜底、`previewPort` 失效传参、分析阶段提前截断来源，以及发布状态的历史断言。生成时清理直属废弃隐喻 JSON，浏览器加载时清理对应旧视图存储键。保留现有概念词典、已命中规则建议、有效旧资产包和预览缓存协议，因为它们仍是当前范围内的有效行为；有歧义的旧预览包要求重炼。

## 不在本轮范围

通用主题书籍提炼、书籍 Web/MCP 消费、统一多模态输入、任务级装甲协议与装配、业务调用链和接口契约提取、实机校准 Task 4–9，均记录真实缺口，后续独立实施。不开启源项目脚本，不对外发布或推送。
