---
project: VibeFoundry
category: implementation-plan
source_path: docs/plans/2026-07-08-web-asset-browser-asset-interactions.md
status: active
last_updated: 2026-07-11
---

# Web Asset Browser Asset Interactions

> **历史契约说明（2026-09-01）：** 本文保留用于交互设计追溯；其中源项目内资产目录与开发者本机 fixture 约定已被 central-only 集中资产库契约和通用 fixture 取代，UI 决策仍可参考。

## 1. 背景

VibeFoundry 当前已完成 MCP、Skill、Plugin 和本地 Web Asset Browser，不再只是 MCP 阶段。

本增强项把 Web 端从“只读列表”推进到更像资产库的浏览体验：资产卡片需要显示编程语言标识，组件资产需要有可感知的交互和设计效果，必要时提供动画演示。真实验证项目使用：

```text
<external-react-project-root>
```

## 2. 范围

包含：

- 在资产 view model 中为每张卡片补充 `language` 和 `languageLabel`。
- 语言标识从来源文件扩展名推断，覆盖 TypeScript、TSX、JavaScript、JSX、Markdown、JSON、CSS 和未知文件。
- 组件卡片展示交互预览元数据，包括可视形态、hover、focus、motion 和 reuse cue。
- Web 前端在卡片中展示语言徽标和静态组件交互线索；Inspector 只保留来源、语言、复用建议和 Raw JSON。
- 左侧分类导航支持折叠收起；中间资产区采用多列平铺卡片，不再一行只放一个组件。
- 用外部 React fixture 运行 `distill`，确认真实组件可在 Web API 中带语言标识。
- 第一阶段视觉重构：Web Asset Browser 采用 Dark Matter & Fluid Neon 方向，使用深空背景、Lava Gold、Quantum Cyan、玻璃拟态、金属细边和 Amber Card。
- 第一阶段动画实现保持轻量：使用原生 Canvas 和 CSS 渲染全局暗物质粒子场、卡片磁力浮空和交互线索脉冲，不引入 p5.js、WebGL 或额外前端构建链。
- 第二阶段组件管理增强：
  - 总览统计卡片只在“资产总览”视图显示。
  - 组件视图上方提供按标签和项目分类的筛选控件。
  - 每个组件卡片支持编辑标签和从当前 Web 视图删除，删除前必须二次确认。
  - 标签编辑和删除使用浏览器本地状态保存，不修改 `.vibe-foundry/` 资产包、源码文件或 Web 只读 API。
- Vue / uni-app 前端炼化增强：
  - component analyzer 支持识别 `src/components` 和 `components` 下的 `.vue` 单文件组件。
  - token extractor 支持从 Vue 静态 `class="..."` 属性提取设计 tokens。
  - Web 资产模型支持 `.vue` 来源文件的 Vue 语言徽标。
- 真实组件试玩体验增强：
  - 悬浮预览只承担快速扫视，不作为主要交互入口。
  - 点击可预览组件后，页面进入固定试玩台布局：资产网格收缩为选择轨道，右侧详情区扩大为视觉中心的真实组件 iframe。
  - 固定试玩台提供刷新预览和独立打开入口，用户可以在 iframe 内点击、输入、滚动和验证组件交互。
- 第三阶段视觉重构：从 Dark Matter & Fluid Neon 迁移为“意识流手稿”。
  - 暖灰纸面、骨白描图纸、石墨文字、褪色墨蓝与少量锈红批注。
  - 资产卡片采用编辑手稿式错位节奏、细线连接、页码和边注，不使用玻璃拟态、霓虹光或高饱和能量条。
  - 背景 Canvas 保留为极轻的铅笔尘埃与思绪连线，尊重 `prefers-reduced-motion`。
  - 试玩台保持视觉中心，但改为叠放描图纸与稿纸装订结构。
  - 可读性修订：冷中性阅读底、白色内容纸、正文无衬线、标题衬线；纸纹与 Canvas 降至几乎不可感知，避免长时间浏览疲劳。

不包含：

- 引入 React/Vite 或前端构建链。
- 修改 `.vibe-foundry/` 资产包文件结构。
- 服务端持久化资产编辑、拖拽标注或在线发布。
- 为每个真实组件解析完整 JSX 视觉树。
- 为每张卡片单独运行 p5.js / WebGL 背景；本阶段只做全局轻量动效和局部 CSS 交互。

## 3. 验收标准

- `npm test` 通过。
- `npm run build` 通过。
- Web view model 测试证明组件、服务、tokens、文档资产均有语言标识。
- Web 前端测试证明 HTML/CSS/JS 包含语言徽标、平铺资产卡片、可折叠侧栏和静态组件交互线索。
- Web 前端测试证明意识流手稿主题存在：Paper、Graphite、Faded Ink、Rust Note、描图纸卡片和轻量手稿 Canvas。
- Web 前端测试证明统计卡只在“资产总览”渲染，组件视图包含标签/项目筛选、标签编辑和删除入口。
- Web 前端测试证明点击组件后的 `preview-focused` 布局存在，固定试玩台成为主要视觉区域，并保留刷新和独立打开操作。
- Web view model 测试证明组件资产包含可筛选的初始标签和来源项目字段。
- Component Preview Runtime 测试证明嵌入模式存在 fit-to-window 逻辑：根据容器和组件尺寸计算缩放比例，并通过 CSS 变量应用到真实组件包装层。
- `node dist/cli.js distill <external-react-project-root>` 通过。
- 对外部 React fixture 调用 `/api/assets` 或 `loadAssetViewModel` 后，至少一个组件资产显示为 TSX 或 JSX。

## 4. 废弃代码检查

本增强不迁移 CLI、MCP 或资产包 schema，因此不应保留旧字段兼容层。完成前需要检查：

- 旧卡片模板是否仍有孤立字段。
- 旧 tag 样式是否被新语言徽标替代或继续承担分类标签职责。
- 是否引入未使用 helper。
- 是否保留无调用的演示函数。
- 右侧 Inspector 和卡片模板是否仍残留旧 iframe 预览、hover 预览弹层或旧 `preview-frame` 样式。
- Dark Matter、Lava Gold、Quantum Cyan、Amber Card 和旧 `dark-lab-canvas` 是否已移除，避免新旧视觉语言并存。
