---
project: VibeFoundry
category: design
source_path: docs/plans/2026-07-14-source-runtime-fidelity-design.md
status: accepted
last_updated: 2026-07-14
---

# 源项目实机校准与预览保真度设计

## 1. 目标

让资产工作台的组件预览能够用源项目实际运行结果进行校准，并回答三个问题：

1. 当前预览是否来自可证明的真实场景？
2. 它与源页面中的组件实例具体差在哪里？
3. 未达到高保真的原因属于场景、运行环境、样式、定位还是业务依赖？

成功标准不是“所有组件都有截图”，而是高保真状态有证据、无法证明时不伪造。

## 2. 双通道模型

### 静态快速通道

现有 AST 索引继续负责组件依赖闭包、真实调用点、字面量 props、插槽、全局样式、Provider 和插件发现。该通道不启动源项目，始终作为低成本基础结果。

### 实机校准通道

仅处理公开且无需登录的候选路由。Capture Planner 根据路由定义、页面依赖关系和组件真实调用点生成 `SourceCaptureSpec`。相同 spec 已有成功结果时直接命中 CAS。

## 3. 项目级采集会话

`SourceSessionSupervisor` 负责一次完整采集会话：

1. 解析 package manager、lockfile 和已有 scripts。
2. 只接受确认过的启动命令，不猜测多个命令并依次尝试。
3. 启动模式要求用户同时给出预期 loopback URL；不向不同框架脚本猜测性追加端口参数。
4. 通过 HTTP 健康检查和页面可用性判断 ready，不使用固定 sleep。
5. 启动一个 Chromium 实例和一个 Browser Context。
6. 按路由分组、串行采集所有变更组件。
7. 正常或异常结束时关闭浏览器、终止源进程树并验证没有遗留子进程。

资源预算由会话级配置控制：并发固定为 1，关闭视频和完整 trace，不重复启动浏览器，不为每个组件建立新 Context。首次耗时单独记录为 `sourceStartupMs`，组件采集记录 `captureMs`，不能把源项目冷启动归因于组件算法。

## 4. 组件定位证据

定位器按以下优先级生成：

1. 源码已有 `data-testid`、稳定 `id`。
2. ARIA role、label、name 和可访问名称。
3. 调用点的字面量子文本与稳定 props。
4. 稳定 class 组合与父级页面区域。

每个定位候选保存来源位置、证据类型和匹配数量。必须唯一匹配才能自动采集；零匹配为 `locator-missing`，多匹配为 `ambiguous-locator`。不得用 `.first()` 隐藏歧义，不得向源 DOM 添加改变布局的 wrapper。

## 5. 采集协议

`SourceCaptureSpec` 至少包含：

- schemaVersion、collectorDigest、projectRuntimeDigest。
- route、viewport、deviceScaleFactor、colorScheme。
- componentId、usageSource、locatorEvidence。
- states：default、hover、focus 或安全本地交互。
- font、theme、globalStyle 和 Provider 摘要。

Reference Artifact 保存：

- 组件裁剪 PNG。
- 归一化 DOM 结构摘要。
- 根节点与关键子节点边界框。
- 允许列表内的 Computed Style。
- 可见文本、ARIA 与交互元素摘要。
- 页面控制台错误、资源加载失败的安全摘要。

Cookie、Token、环境变量值、请求正文、业务响应正文和绝对路径不得进入产物。

## 6. 候选采集与比较

资产预览使用相同视口、DPR、颜色方案、字体等待条件和动画冻结策略生成 Candidate Artifact。

比较分四层：

- 运行层：挂载、异常、资源完整性。
- 几何层：边界框、间距、滚动尺寸和关键子节点位置。
- 视觉层：像素、颜色、字体、边框、圆角、阴影和背景。
- 结构层：DOM、文本、ARIA 与交互元素。

第一阶段运行、几何和结构为硬门槛。视觉层使用容差并单独展示，不用一个综合分数掩盖硬失败。报告输出基准图、候选图、差异图与结构化原因。

## 7. 状态模型

- `calibrated`：实机基准存在并通过硬门槛。
- `drifted`：完成比较但存在明确差异。
- `static-only`：只有静态推导结果。
- `source-unreachable`：源服务或公开路由不可达。
- `ambiguous-locator`：无法唯一定位组件。
- `runtime-blocked`：运行环境缺失或源页面异常。

这些是独立的 Fidelity Result，不反写静态组件注册表，也不覆盖现有 Build/Validation Result。

## 8. 缓存与失效

实机采集复用现有 SQLite lease 和 CAS，但使用独立动作类型与摘要域。以下任一变化必须使 Reference Action 失效：组件依赖闭包、真实调用点、路由、定位证据、全局样式、主题、字体、Provider、源启动契约、浏览器或采集器版本。

Candidate Action 还覆盖预览构建产物树和比较器版本。未变化组件不启动源项目；一个路由中多个组件共享一次页面导航与字体预热。

## 9. 错误处理

- 启动命令或预期 URL 缺失：显式要求配置，不猜测。
- 超时：记录具体阶段并终止进程树。
- 登录跳转：标记 `auth-required`，第一阶段停止。
- 外站跳转：阻断并标记 `external-navigation`。
- 控制台异常或资源失败：进入运行层诊断。
- 组件多实例：标记歧义，不选择第一个。
- 比较器失败：保留 Reference/Candidate，不宣称 calibrated。

## 10. 验收与性能基线

- React、Vue、uni-app H5 各有至少一个公开页面 fixture。
- 32 个相同 Reference Action 并发请求只建立一个采集 lease。
- 重复炼化和服务重启不重新启动未变化源项目。
- 同一路由多个组件只导航一次；同一项目只启动一个浏览器实例。
- 源服务失败、超时和正常退出均无遗留子进程。
- 字体、主题、全局样式或组件依赖变化会使对应摘要失效。
- 性能报告记录冷启动、每路由和每组件耗时、峰值 RSS 与缓存命中率；先测量真实项目基线，再设置发布阈值。

## 11. 明确不做

- 自动登录、测试账号管理和登录后路由。
- 真实业务写操作和真实后端数据采集。
- 修改源项目文件或持久注入测试标记。
- 用组件名生成业务 props。
- 为无法定位的组件伪造基准截图。
