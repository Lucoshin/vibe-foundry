# Taro 预览与失联恢复

当前服务可访问，但复用浏览器连接错误页会持续展示拒绝连接。只复用已有真实预览画布的 iframe，错误页重新请求。

Taro 被当作普通 React 直接编译，缺少官方 H5 组件/API 入口。按源安装的 Taro H5 适配包配置别名与环境，不伪造小程序 API 或业务参数。验证真实组件运行、必需入参错误及失联 iframe 的恢复。

## 结果

- 修复已失联 iframe 在放大时被继续复用；已加载画布保留原实例。
- Taro H5 使用源项目官方 React 组件适配器、H5 API 入口及编译常量。真实 ImIcon 注册并挂载 taro-image-core；不再出现 global / DEPRECATED_ADAPTER_COMPONENT 错误。
- PackageVisualCard 缺少真实动态入参，显示具体入参名称；SystemAvatar 依赖项目自定义 __API_BASE_URL__，保留明确配置限制，不替换为臆测地址。
- npm run build、414 项全量串行测试与差异检查通过。
- 此次不是所有 Taro 业务组件的完整场景适配；不伪造套餐、价格、用户资料或原生 API。
