---
project: VibeFoundry
category: design
source_path: docs/plans/2026-07-14-source-analysis-foundation-design.md
status: approved
last_updated: 2026-07-14
---

# Source Analysis Foundation Design

## 1. 目标

从算法底层修复前端项目炼化的漏检、误检和低保真问题，让组件、真实调用场景、运行环境需求与设计资产都来自可追踪的源码证据。

本阶段不追求执行任意源项目配置，也不连接真实业务后端。不能静态证明的数据保持未解析或阻断，不生成会被误认为真实业务结果的内容。

## 2. 已确认问题

- 组件发现依赖固定目录，遗漏 `features`、`layouts`、页面局部组件和分包目录。
- JSX/Vue 调用点由正则解析，事件表达式、嵌套标签和动态属性会被误判。
- 预览只要存在导出契约就标为 `ready`，未反映场景和运行上下文完整度。
- 运行时只按依赖名创建空 Router/Store，未提取真实应用入口的 Provider 与样式链。
- 组件名 fallback 包含项目专用和通用弹窗假数据。
- Token 仅来自静态 class，页面模式仅按文件名分类。

## 3. 架构

### 3.1 源码索引

新增统一前端源码索引，扫描项目内可解析的 JavaScript、TypeScript、JSX、TSX 和 Vue SFC。索引记录文件、导入、导出、组件声明、组件调用、样式依赖和来源位置。

React/JSX 使用 `@babel/parser`。Vue 使用 `@vue/compiler-sfc` 拆分 SFC，并使用 `@vue/compiler-dom` 解析模板。组件候选由导出形态、组件语法和被引用证据共同确定，不再只依赖目录。

### 3.2 场景模型

组件可拥有多个 `scenarios`。每个场景包含：

- 稳定 ID；
- 来源文件与位置；
- 已证明的静态 props；
- 事件；
- 插槽摘要；
- 未解析动态属性；
- 导入解析证据；
- 可信度与完整度。

主场景按“导入已解析、静态属性完整、未解析项少、调用频率高”的确定性规则选择。动态表达式不转换成布尔值或业务文本。

### 3.3 组件分类

`componentType` 支持：

- `visual`：可独立展示的视觉组件；
- `layout`：布局或应用壳；
- `provider`：上下文或状态宿主；
- `page-local`：页面内部或功能模块局部组件；
- `unknown`：证据不足，需要人工确认。

### 3.4 预览状态

`component-previews.json` 是预览执行结果的单一真相来源：

- `ready`：场景和上下文完整，且浏览器挂载验证通过；
- `degraded`：可以展示，但存在明确的动态属性或上下文缺口；
- `blocked`：缺少必需输入、构建失败、挂载失败或运行环境不可安全构造。

静态分析阶段最多产生 `degraded` 候选；只有运行验证才能提升为 `ready`。Web 展示和 MCP 查询必须使用相同状态语义。

### 3.5 运行环境需求

从应用入口、依赖和静态配置中提取别名、全局样式、Provider、路由、Store、主题、国际化、uni-app 宿主与环境变量名称。只自动构造有确定创建方式的上下文；其余写入 `requirements.unresolved`。

外部网络保持阻断。环境变量只记录名称和是否必需，不读取、不回填敏感值。

### 3.6 设计资产

Token 来源扩展到 CSS 自定义属性、Sass/Less 变量、Tailwind/UnoCSS 配置与静态 class。每条 Token 保留值、类别、作用域、来源文件和使用位置。

页面模式由模板结构提取导航、筛选、列表、空态、弹层和底部操作区等区块，不再只依赖文件名。

## 4. 兼容与清理

- `component-catalog.json` 保留现有 `previewScenario` 作为当前主场景的派生字段，待 Web/MCP 全部迁移到 `scenarios` 后删除；不增加其他臆测兼容字段。
- 删除所有按组件名生成业务 props 的 fallback。
- 删除“存在导出即 ready”的旧状态判定。
- 删除正则 JSX/Vue 属性解析 helper 及其失效测试。
- 保留确定性的事件空函数和网络阻断，它们是隔离运行边界，不是业务数据。

## 5. 验收

- URL 或事件表达式中的词不会再被识别为 props。
- 动态 JSX/Vue 属性进入 `unresolvedProps`，静态字面量保持真实类型。
- 组件调用必须能追溯到导入或同文件声明证据。
- 无场景或有必需未解析项的组件不再标记为 `ready`。
- 两个真实项目完成重新炼化，并输出组件发现差异和状态分布。
- `npm test`、`npm run build`、真实项目 distill 和 `detect_changes` 全部完成。
