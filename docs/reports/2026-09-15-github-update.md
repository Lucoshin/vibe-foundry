# 2026-09-15 更新验收

## 更新范围

- 本地项目/文件导入、空库正常布局、统一资产工作区。
- Vue 2.6/2.7/3 与 React 预览，源依赖解析、固定等待画布及缓存。
- 滚动按需加载、源调用场景提示、预览实例复用和左右切换。
- 组件效果提示词、书籍知识资产及对应 CLI/MCP 接口。

## 验证

- npm run build：通过。
- node --test --test-concurrency=1 "tests/**/*.test.mjs"：412 项通过。
- node scripts/verify-mvp.mjs：单独重跑通过，包含 npm test、隔离集中库炼化、MCP 与 Plugin 契约验证。首次与全量验证同时运行时，一项并发测试等待超时；重跑全部成功。
- git diff --cached --check：通过。
- Editor 放大、返回：同一 iframe 和文档，新增资源请求为 0。

## 清理与范围限制

清理旧空库阻断、Vue 2 一律拒绝、全依赖顶层别名、等待整页刷新、前六项预览限制与重复 iframe 创建路径。保留显式刷新、缺依赖错误及场景限制，避免伪造业务结果。

源项目资产库、截图、日志、依赖目录均未纳入提交。Python 后端和原生移动端完整浏览器运行环境尚不覆盖；有业务上下文限制的组件不保证独立预览成功。

## 合并前 CI 修复

- Windows 临时目录可能使用 8.3 短路径；导入测试按 realpath 规范路径验证，去掉仅转小写的比较与重复动态导入。
- 预览异步测试保留最终内容断言，将固定 25 次轮询改为最长 10 秒的有界等待，避免 CI 负载导致误报。
- 本轮 node scripts/verify-mvp.mjs 通过：包含构建、414 项测试、隔离资产库炼化和 MCP/Plugin 验证；git diff --check 通过。
- 保留全部产品实现与原有测试断言范围，本轮仅修复测试的平台假设和等待期限。

## 剩余依赖分支合并

- 合并 Babel parser 8.0.5、Vue compiler-dom/compiler-sfc 3.5.42、better-sqlite3 13.0.3 四项更新。
- 解决旧 Vue 分支与现有预览依赖的冲突；保留 Vue 2 隔离工具链、Vite 和样式编译依赖。
- npm 统一锁文件，移除旧 SQLite 驱动的 prebuild-install 等失效依赖，保留新版所需 node-addon-api 及安装脚本标记。
- node scripts/verify-mvp.mjs 通过：414 项测试全部通过，构建、隔离炼化、MCP/Plugin 验收通过。git diff --check 通过。
