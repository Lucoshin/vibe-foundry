---
project: VibeFoundry
category: validation-report
source_path: docs/reports/2026-09-08-component-reconstruction-validation.md
status: completed
last_updated: 2026-09-08
---

# 组件还原提示词与炼化提速验收

本文记录上一轮源码版提示词的历史验证。用户随后纠正目标为产品可用的专业效果描述，当前实施和验收入口为[组件效果提示词计划](../plans/2026-09-08-component-effect-prompts.md)；下文旧正文协议和样例已不代表当前输出要求。

按[实施计划](../plans/2026-09-08-component-reconstruction-and-speed.md)和 [ADR-005](../adr/005-component-reconstruction-prompts.md)，本批交付源码保真材料、快速重复分析以及其他 AI 可用的提示词。没有引入模型调用或逐组件预览构建作为炼化前置步骤。

## 使用方式

重新执行 `node dist/cli.js distill <project-root>` 后，在 Web 组件详情或预览工作台展开“组件还原提示词”，复制全文。MCP 使用 `get_component_prompt({filePath})` 按组件的项目相对路径获取。

提示词包含组件源码、本地依赖、真实调用原文、样式、SVG 和已识别资源信息。二进制附件列出路径、字节数、内容摘要；未解析路径和动态条件列入缺项。调用页中的无关兄弟模块不递归展开。旧包没有提示词时明确要求重炼，不影响现有资产查询。

## 实测

Windows x64、Node.js v24.12.0。React、Vue 分别为 20 个组件、20 个独立调用页及共享 CSS；每组在同一进程依次运行三轮完整 `distillProject`，不构建组件预览、不安装源项目依赖。

| 项目 | 首次炼化 | 未变化重炼 | 修改一个组件 |
| --- | ---: | ---: | ---: |
| React | 251.285 ms | 151.964 ms | 178.566 ms |
| Vue | 209.863 ms | 124.534 ms | 126.111 ms |
| 每组源码索引解析/复用数 | 40 / 0 | 0 / 40 | 1 / 39 |

这是合成项目的单次观测，不能推算为所有真实项目的性能保证。计时包括提示词和资产写入；解析计数只指源码索引摘要，提示词资源识别和路由分析仍可能另做语法解析。文件内容仍读取并校验，导入路径每轮重新解析。

两组均断言：未变化提示词摘要稳定、修改组件后目标提示词更新、无关组件提示词保持不变。新增回归另验证直接/间接 CSS、二进制原始字节变化能同步使预览动作失效。

复现命令：

```bash
npm run build
node scripts/measure-component-distillation.mjs --output output/component-distillation
```

本次原始结果和提示词样例位于 `output/component-distillation/component-distillation-benchmark.json`、`component-reconstruction-prompt.md`；该生成目录被 Git 忽略。基准脚本只清理自身创建且已核对范围的临时目录。

## 验证结果

- `npm run build`：通过。
- `node scripts/verify-mvp.mjs`：通过；内含 `npm test` 的构建和 269 个测试、49 个套件，0 失败；随后实际 CLI 炼化公开 fixture，并验证 MCP 返回的提示词与磁盘记录完全一致、包含原组件源码。
- `node scripts/measure-component-distillation.mjs --output output/component-distillation`：通过，结果如上。
- 插件 Skill 的 `quick_validate.py`：以 Python UTF-8 模式运行通过。
- `git diff --check`：通过。

Web 验证包含实际 HTTP 路由及页面脚本事件测试：按资产 ID 读取、两种详情入口、并发请求合并、迟到响应隔离、只更新提示词面板、复制成功/失败反馈。没有在真实源页面执行本批视觉对比，也没有验证外部 AI 生成后的像素一致性。

## 清理与保留

已清理组件分析的重复读盘、每组件重建 Map、重复场景扫描、仅凭 antd 依赖注入样式的逻辑、调用页无关模块递归展开，以及 MVP 验证脚本的重复构建。写入时清理直属废弃提示词 JSON，未变化提示词不重写。

保留源码内容读取和每轮导入路径解析，因为缓存必须识别真实变化；保留现有预览缓存协议，因为材料摘要已纳入其依赖摘要；保留明确未解析条件和二进制附件要求，因为当前没有足够证据自动还原它们。旧的模糊组件字段未新增兼容分支。用户原有发布检查清单改动未修改。

## 剩余范围

实机截图采集、与原页面视觉比较、复杂 Provider/store/鉴权状态复现仍按实机校准 Task 4–9 推进。本批提供静态材料依据，不保证像素一致。其他 AI 无法访问源项目时，需要按清单同时提供原图、字体及缺失初始化材料。
