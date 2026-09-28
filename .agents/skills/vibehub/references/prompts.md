# 独立提示词库与严格变量渲染

用户需要保存、修订、查找、复制或渲染提示词时使用本参考。提示词用于“如何复用或生成”，与“如何炼化材料”的方案分开。Web、CLI、MCP 共用集中资产库；`VIBEHUB_LIBRARY_ROOT` 可指定库根，默认 `~/.vibehub/library`。不要自动执行提示词或调用模型。

## 创建与修订

```bash
vibe prompts list
vibe prompts save <input-json>
vibe prompts get <id> <revision>
```

未安装命令时，在构建后的工具仓库将 `vibe` 替换为 `node dist/cli.js`。保存输入严格包含：

```json
{
  "title": "主体与配色练习",
  "description": "用于明确主体和配色的通用视觉候选模板。",
  "targetModel": "generic",
  "template": "为 {{subject}} 设计 {{palette}} 配色的画面。",
  "variables": [
    {"name": "subject", "description": "画面主体"},
    {"name": "palette", "description": "配色要求"}
  ],
  "sourceAssetIds": []
}
```

以上是练习模板，不冒充真实材料结论。标题/描述/目标/模板和变量说明非空。源引用可以为空；有来源时填写 1–10 个不同的精确统一资产 ID，保存会核验存在，不能使用标题或自行猜测 ID。

修订在同样内容字段之外成对增加 `id` 和 `baseRevision`，原样引用实际读取的版本。输出为完整不可变记录，含 `schemaVersion,id,revision,parentRevision,createdAt,verification` 及六个内容字段。初版相同输入去重，修订不改变内容则返回原版；改变内容会保留父版本并产生新版本。没有自动覆盖或“最新”指针，列表显示全部历史。

完整 JSON 导出用于回查；不能把输出记录直接作为 `save` 输入，必须只提交六个内容字段，修订再加 `id/baseRevision`。不要编辑库内文件来改版本。损坏记录会返回读取错误，不替换或掩盖。

## 变量契约

仅使用 `{{name}}`。名称由英文字母或下划线开头，仅含英文字母、数字、下划线，最长 64 字符；不接受表达式或占位符内空格。声明须与占位符集合一一对应，同名占位符可重复引用。最多 64 个变量，不能有缺失、多余或重复声明。

字面双括号写 `\{{`、`\}}`；保存为 JSON 字符串时，反斜杠使用 JSON 的 `\\` 转义。普通单花括号按字面保留。用户值不会二次插值，更不能作为代码或指令执行。

```bash
vibe prompts render <render-json>
```

渲染文件严格为 `{id,revision,values}`，前两项使用真实版本，`values` 对象必须提供所有且仅提供已声明变量。值为非空文本；不补默认值、不忽略多余值。示意：`values:{subject:"一棵树",palette:"蓝绿色"}`。

标题最多 160 字符，描述 4000，目标模型 160，模板 64000，单个变量值 64000；渲染文本最多 256 KiB UTF-8，超限显式报错。返回 `text` 及模板身份、目标模型、来源引用，始终 `verification:"unverified"`。即便渲染成功，也不能声称模型语法已适配或效果通过；本批无种子、负向提示词及供应商参数字段。

## Web 与只读 MCP

Web 提示词库支持新建、选择明确历史版本、修订、声明变量、填值渲染、复制已存模板或渲染文本、导出版本 JSON。保存期间表单锁定；未保存的模板修改不能渲染旧版冒充新结果。来源、版本和未验证状态随记录保留。

MCP 工具是 `list_prompts({})`、`get_prompt({id,revision})`、`render_prompt({id,revision,values})`，都只读。列表返回 `{prompts,errors}`；检查错误，不把坏库当空库。不通过 MCP 直接创建或修订，写入用 CLI 或本地 Web。

图片候选可在详情“收入提示词库”，保留精确图片资产来源。已有双括号先转义为字面内容，不把来源里的文字自动当成变量；随后由用户明确编辑模板和声明。图片在线编辑与候选范围见 [图片参考](images.md)。

提示词当前独立查询，不混入统一资产目录，也不会因为复制或渲染就创建应用记录。应用前核对源资产、适用条件和当前任务授权；实际行动与验证结果可整理为后续学习材料。完整命令和限制见工具仓库 `docs/runbooks/prompt-library.md`。
