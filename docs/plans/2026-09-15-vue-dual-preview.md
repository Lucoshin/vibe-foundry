# Vue 2 / Vue 3 双版本组件预览

## 已确认需求与方案

用户要求同时支持零点后台 Vue 2.6.12 与移动端 Vue 3。预览使用源项目已安装的 Vue，不升级或修改源项目；继续固定画布、后台等待与独立缓存。

- Vue 3 保留现有 @vitejs/plugin-vue。
- Vue 2.7 使用官方 @vitejs/plugin-vue2（官方明确只支持 2.7）。
- Vue 2.6 使用小型静态 SFC 构建插件，调用 Vue 官方 @vue/component-compiler-utils 和源项目同版本 vue-template-compiler；覆盖模板、脚本、scoped 样式、资源路径与预处理样式，不实现热更新。避免引入只声明兼容 Vite 2–4 的旧插件或改源项目版本。
- Vue 2 使用 new Vue 挂载、Vue 2 虚拟节点事件/属性协议和 beforeDestroy；Vue 3 继续 createApp。按证据接入后台使用的 Element UI 与 Vue Router 3，业务 store 和接口数据不伪造。
- 版本与编译器进入构建身份，旧失败缓存通过重炼化更新；缺编译器/版本不匹配明确报错。

## 执行与验证

1. 先写失败回归：Vue 2.6、2.7、3 选择，模板编译器匹配和真实 SFC 构建。
2. 实现独立 Vue 2.6 编译插件与版本选择，适配挂载和源项目 UI 插件。
3. 清理旧 Vue 2 一律拦截、旧测试和文档，保留必要的不支持版本/缺依赖错误。
4. 运行定向测试、全量 npm test、构建、git diff --check；重炼化两端并浏览器实际验证后台与移动端。

## 范围

目标为源组件及已识别运行依赖的真实隔离预览，不承诺业务登录状态、后端接口、任意全局 mixin 或完整页面场景自动复原。

## 实现结果与验收（2026-09-15）

- 新增 src/preview/vue26-preview-plugin.ts；依赖预检、运行时生成和缓存身份按源 Vue 版本选择；Vue 2.7 工具使用独立 packages/vue2-preview-toolchain 避免 Vue 3 peer 冲突。
- 清理全依赖顶层别名及失效 helper/断言，保留源依赖嵌套解析；解决 Element UI 的 core-js 2 被顶层 core-js 3 替换问题。支持旧式 ~ 样式导入。删除 Vue 2 一律拒绝的逻辑，保留缺编译器、版本不匹配等明确错误。
- npm test：409 / 409 通过（含真实 Vue 2.6.14、2.7.16、3.5.42 模板、scoped SCSS、资源、源插槽及嵌套依赖构建）；npm run build 与 git diff --check 通过。
- 已重启 4317 并重新炼化零点双端。真实 Vue 2.6.12 Hamburger 构建通过，含 Element UI 和后台全局样式；冷构建约 32.7 秒，仍受原项目依赖体积影响。Vue 2 day 与 Vue 3 AppEmptyState 的已缓存 HTML 请求实测约 59 / 19 毫秒，此数据不代表冷构建或浏览器首屏耗时。
- 浏览器真实 Vue 2 Crontab 展示成功，点击周期选项后表达式更新为 2-3 * * * * ?，运行时间随之更新；Vue 3 AppEmptyState 显示源组件“暂无数据”。截图在 output/vue2-crontab-preview.png 与 output/vue3-empty-state-preview.png。
- 保留真实预览边界：day 单独预览缺少父组件传入 check 函数，完整 Crontab 可运行；未伪造函数或业务数据。现有验证接口对于 unresolved-props / missing-source-scenario 返回 409，不将可见但缺场景的预览自动提升为完整验证；本轮未改变此契约。
- 稳定画布和后台探测继续沿用，无等待期间整页刷新。Vue 2.6 的 script setup、自定义 SFC 区块和 CSS Modules 尚未适配，显式报错。
