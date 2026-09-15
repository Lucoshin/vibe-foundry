# 可见组件预览与源调用场景

用户确认修复：去除仅前六项自动预览的限制，沿用浏览器原生 lazy iframe 按滚动加载，保持固定容器与已有 iframe 节点；不一次主动请求所有构建。

缺少入参且源调用文件对应已入库可构建组件时，明确展示完整父组件场景，保留子组件资产身份；不伪造函数或业务数据。其他组件显示源调用文件和已提取入参，包括 iconOnly。

修改 Web 资产投影、前端渲染及相关测试。验证：节点保留回归、超过六项预览、场景元数据与真实 Crontab / ImageUploadOCR 浏览器检查；npm test、npm run build、git diff --check。

## 验证结果

- npm test：410 项通过；构建和 git diff --check 通过。
- 4317 服务已重启，真实 day/hour/min 资产投影均找到 Crontab 来源场景；ImageUploadOCR 自动加载且预览工作区显示“源调用场景 · 仅图标模式”。截图 output/visible-ocr-scenario.png 与 output/visible-day-context.png。
- 清理了前六项上限、thumbnailIds 筛选集合、automatic/showThumbnail 参数以及不可达的手动缩略占位分支；保留原生懒加载、固定画布、稳定 DOM 及明确不可用状态。
- 本次修复预览触发和场景入口，不承诺所有源组件运行成功；业务依赖未满足的其他组件仍会明确失败。既有验证接口对缺场景资产返回 409 的契约未变，不将可见预览虚报为完整验证。
