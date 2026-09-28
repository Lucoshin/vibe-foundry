# 网站炼化：宿主采集，项目入库

输入是用户给定的 URL。宿主 Codex 使用当前可用浏览器/网络读取工具完成采集和语义分析；VibeHub CLI 不内置通用爬虫或模型调用。执行原站脚本只在浏览器，不能在 Node/PowerShell 中求值下载的 JS。

## 采集与效果

1. 打开原站，列出真实可见控件、交互和必要上下文；检查公开页面、样式、脚本和可验证的源码链接。已有可获得源码时，优先按本地项目炼化，并验证预览。
2. 仅有部署产物时，创建本次采集目录。保存 HTML、CSS、JS、图片、字体等实际依赖。跟踪 CSS URL、脚本动态引用和浏览器请求；不能以占位图替代背景。记录最终来源 URL 和 SHA-256。登录/后端/缺失源码导致无法重现时写入限制。
3. 为每个控件制作独立 HTML 入口，保留原站样式、脚本、SVG 定义、背景和初始化依赖。可以在适配副本中增加聚焦布局、隐藏无关部分、修正本地相对资源路径；不得改原件或捏造业务行为。保留必要场景时写明是“原站场景内控件”，不是已拆出的独立框架组件。
4. 在浏览器对照原站和本地入口；实际操作每个控件。观察默认/选中/悬停/拖动状态后编写四类效果描述。不确定的动效和兼容性写入 `limitations`。

## 输入协议

在采集目录写 `website-capture.json`：

```json
{
  "schemaVersion": "0.1.0",
  "url": "https://example.com/studio",
  "name": "Example Studio",
  "capturedAt": "2026-09-16T00:00:00.000Z",
  "files": [
    {"path": "index.html", "sha256": "实际64位散列", "kind": "source", "url": "https://example.com/studio"},
    {"path": "button.html", "sha256": "实际64位散列", "kind": "adaptation", "url": null}
  ],
  "controls": [{
    "id": "button",
    "name": "按钮",
    "entry": "button.html",
    "selector": "#demo-button",
    "sourceFiles": ["index.html"],
    "description": {
      "layout": "根据原站观察描述布局、尺寸和内容层级。",
      "visual": "根据源码和实机描述材质、背景、色彩和轮廓。",
      "motion": "描述实际存在的运动、状态过渡；没有则明确没有。",
      "interaction": "描述真实触发方式和操作后的状态变化。"
    },
    "limitations": []
  }]
}
```

所有资源必须逐项列入 `files`，路径使用安全相对路径，仅 ASCII 字母、数字、下划线、短横线、点和斜杠；原站不符合时保存为安全名称并在适配副本修改引用。每个控件有不同 HTML 入口、唯一小写短横线 ID 和真实可见元素选择器。`sourceFiles` 必须包含原件证据。散列用文件字节计算，不对文本重编码后计算。`kind=adaptation` 的 `url` 必须是 null，不能冒充原站文件。

## 导入与验证

运行 `node dist/cli.js distill-website <capture-directory>`。CLI 校验协议及散列，将不可变快照与组件、提示词登记到同一集中库。从输出目录的 `asset-manifest.json` 读取目标 `projectRoot`，从 `website-provenance.json` 读取网站来源与快照信息。

打开项目 Web，逐控件验证预览。网站在仅允许脚本的隔离 iframe 中运行，不带原站登录态、网络 API、表单提交或顶层导航权限；依赖这些能力的控件不能宣称完整重现。预览中出错应先修复采集材料再重炼，不得改成截图或远程网站 iframe。

通过 `get_component`、`get_component_prompt` 验证 MCP 与 Web 读取同一结果。无 MCP 连接时可通过工具仓库导出的 `callVibeHubTool` 本地调用，明确这是本地协议验证。交付真实数量、浏览器验证记录、原站出处和已知限制。

本地协议验证示例（在工具仓库，将已读取的路径作为参数传入）：

```js
import { callVibeHubTool } from "./dist/mcp/server.js";
const result = await callVibeHubTool(projectRoot, "get_component_prompt", { filePath });
```
