# ADR-008：Vue 双版本预览

按源项目已安装 Vue 选择编译和挂载，不做源码升级。Vue 2.7 引入 @vitejs/plugin-vue2；Vue 2.6 引入官方 @vue/component-compiler-utils 并加载源项目同版本模板编译器。静态预览无需开发热更新，2.6 适配器只承载 SFC 编译，沿用 Vite 5 的资源和样式流水线。

依据：官方 @vitejs/plugin-vue2 只支持 Vue ^2.7.0；旧 vite-plugin-vue2 2.0.3 的 peerDependencies 仅声明 Vite 2/3/4。因此不强行忽略 peer 冲突。

验证包含真实 Vue 2.6、2.7、3 构建及零点双端浏览器展示。计划见 ../plans/2026-09-15-vue-dual-preview.md。

Vue 2.7 编译工具放入独立本地 package，隔离与 Vue 3 插件的 peer 依赖，不使用强制安装。仅生成入口的包导入从源项目解析，源依赖保留原层级，避免 core-js 2 被顶层 core-js 3 替换。保留源 Vue 单实例别名；Webpack 风格 ~ 样式路径映射到源项目 node_modules。
