# 手动集合与已有关系

集合用于按任务或主题组织集中资产库中的资产。只保存精确全局 ID，不复制内容，不自动建立语义关系，也不按相同名称合并人物或知识。

1. 先使用共享资产目录或 `search_library_assets` / `get_library_asset` 取得用户明确选中的真实 ID，核对来源和原资产版本。不要把标题、文件名或书内 local ID 当作全局身份。
2. 在 Web“集合”入口新建或编辑：输入名称、说明，勾选 1–100 项，保存。名称最多 160 字符；说明最多 4000 字符；ID 不重复。
3. 保存输入只接受 `{name,description,assetIds}`；更新额外传现有 `id`。不要回传完整读取对象，不写入 raw/evidence 副本。只能按用户授权写其所选集中资产库；验证使用的隔离库不能冒充用户默认库。
4. 查看已有关系时保留方向、来源、版本、basis 和逐条引文。书籍 local ID 仅在该 sourceId 内解析；学习关系已经使用全局 ID。材料明示与分析解释分开，不把 interpretation 或用户集合说明当作事实证明。
5. 成员失效时保留并报告原 ID；要求恢复来源或明确移除引用，不找同名替代。断链、坏来源、坏集合元数据和真实无关系空态应区分。
6. 集合不是快照：工程/书籍稳定身份的内容变化可在下次读取时呈现；学习/图片确切版本遵循原资产全局 ID。实际采用前再次读取来源和版本。创建集合或查看关系均不表示已应用、已执行或已验证。

本批仅查看已发布书籍/学习关系的一跳，不创建跨来源映射、不做自动聚类、语义合并或完整隐喻链编辑。图片和工程资产可放入集合，不能据此补造它们之间的关系。

具体应用和 HTTP 契约见工具仓库 `docs/runbooks/knowledge-collections.md`。MCP 保持只读；不要通过只读工具执行集合写入。UI 或 HTTP 成功不替代浏览器视觉验收。

CLI：`vibe collections list`、`vibe collections save <input-json>`、`vibe collections get <id>`、`vibe collections relations <selection-json>`。关系选集 JSON 严格为 `{assetIds:[...]}`。MCP 只读工具：`list_knowledge_collections`、`get_knowledge_collection({id})`、`explore_asset_relations({assetIds})`；写入仍用用户授权的 CLI/Web。
