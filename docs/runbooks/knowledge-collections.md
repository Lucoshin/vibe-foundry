---
project: VibeHub
category: runbook
status: active
last_updated: 2026-09-17
---

# 手动集合与关系证据

集合保存集中资产库中的精确资产 ID，不复制资产内容，也不表示成员之间存在语义关系。当前支持创建、编辑和查看集合，以及书籍/学习资产已有关系的一跳查看；不做聚类、同名实体合并或新关系创作。

## Web 操作

1. 打开 VibeHub 的“集合”入口，选择“新建集合”。填写名称与可选说明。
2. 按名称、来源或精确 ID 筛选资产，勾选 1–100 项。相同名称旁会保留不同来源与 ID。
3. 保存后在左侧选择集合。集合只持有引用；原资产若有稳定 ID，其内容更新会在下次查看时呈现。需要冻结版本用于开发时，应另行生成任务上下文并核对原资产版本。
4. 在“已有关系与证据”查看方向、关系类型、材料明示/分析解释、来源版本与逐条引文。展开身份详情可核对精确关系与端点 ID。没有已有关系时显示空态，不依据共同集合创造连线。
5. 若成员失效，页面显示“当前无法读取”；不会寻找同名替代。恢复原来源，或取消勾选后保存。坏资产包和坏集合元数据分别报告，不能把读取失败理解成真实空库。

只读查看不会生成应用记录；保存集合也不表示已经采用或验证知识。

## 严格写入契约

新建输入严格为：

```json
{"name":"主题名称","description":"组织这些资产的目的","assetIds":["从共享目录取得的完整资产 ID"]}
```

这是结构示例，示例 ID 不能入库。更新时增加已有集合的精确 `id`；不能提交返回对象中的 schemaVersion、createdAt、updatedAt、members 或资产 raw 内容。资产 ID 不允许重复、名称代替、首尾空白或失效引用。名称最多 160 字符，说明最多 4000 字符。

存储位于 `collections/collection-<UUID>.json`，受所选 `VIBEHUB_LIBRARY_ROOT`/默认集中资产库管理。原资产包不会被集合写入改动。当前没有集合历史版本或删除入口。

## 关系身份与限制

书籍原关系保留书内 ID；查看时只在同一 sourceId 内映射到共享全局资产 ID。学习关系使用已有含任务与结果摘要的全局 ID。关系显示保留 sourceId、revision、basis、evidence，无法解析端点时显示断链。

首批只读取已发布的书籍和学习关系，图片/工程资产可加入集合，但不会凭名称、标签或共现推断关系。相同名称跨来源保持独立。关系为原分析产物，其证据和 interpretation 标记不是额外自动验证。

## 应用与 HTTP 接入

应用模块 `src/application/knowledge-collections.ts` 导出 saveKnowledgeCollection、listKnowledgeCollections、getKnowledgeCollection、listCollectionAssets、exploreAssetRelations；所有消费者共用这一实现。

本机 HTTP 请求须通过页面令牌与本机来源校验：

- `GET /api/knowledge-collections`：集合列表和坏集合错误。
- `POST /api/knowledge-collections`：严格 JSON 新建/更新。
- `GET /api/knowledge-collections/item?id=<集合ID>`：成员状态与当前资产摘要。
- `GET /api/knowledge-collections/assets`：可选的全库资产摘要，不读取实时预览缓存。
- `POST /api/knowledge-collections/relations`，正文 `{assetIds:[...]}`：只读关系查看，大选集放正文，避免超长 URL。
- `GET /api/knowledge-collections/relations?assetId=<ID>`：单项/少量探索，可重复 assetId 参数。

主页面路由接线与整体验收以当批主线报告为准，HTTP/单元测试不能代替真实浏览器验收。

## CLI 与 MCP

CLI 与 Web 共用上述应用能力：

```bash
vibe collections list
vibe collections save <input-json>
vibe collections get <collection-id>
vibe collections relations <selection-json>
```

`input-json` 使用前文严格创建/更新契约；`selection-json` 严格为 `{ "assetIds": ["完整资产 ID"] }`。指定其他库时用 `VIBEHUB_LIBRARY_ROOT`，不要将测试资产写入默认用户库。

MCP 只读工具为 `list_knowledge_collections`、`get_knowledge_collection`（精确 id）和 `explore_asset_relations`（assetIds）。MCP 不提供集合写入；写入由用户授权后的 Web/CLI 完成。
