# VibeHub 开发过程材料

vibehub-development.json 是 2026-09-16 当前用户对话中明确发言的节选，只保留本轮产品和架构方向。entry ID 是本示例的本地定位标识，不冒充聊天平台消息 ID；没有编造时间、工具执行或用户身份。

通过 `vibe learn prepare examples/learning/vibehub-development.json` 生成任务，宿主按选定方案阅读分析，再执行 learn import。默认与个人方案可以关注不同内容；引文和分析必须分别保留。此示例不宣称包含完整聊天历史。

## P0 修复与验收快照

p0-development-evidence.json 保存本次开发验收时的真实源码片段与测试输出。每项条目含仓库根目录相对文件路径、行号与原文件字节摘要；源码使用 document，实际测试输出使用 tool，不伪装成聊天发言。材料中的路径、行号与 SHA-256 对应该次快照，后续代码或日志变动不自动改变已冻结材料。

来源包括 tests/web/server.test.mjs 的受控并发构建测试、src/preview/preview-action-store.ts 的只读与可写入口、src/mcp/server.ts 的注册表快照查询，以及 output/p0-final-tests.log 的实际 509 项通过摘要。日志本身是本地验证产物；摘要原文已经保存在材料中。该记录不证明未来环境或全部使用场景均会通过。

调用 node dist/cli.js learn prepare examples/learning/p0-development-evidence.json，由当前宿主阅读生成的 task.md 并分析，再使用 learn import 导入。此材料是两项经验的来源证据，不包含完整开发历史。
