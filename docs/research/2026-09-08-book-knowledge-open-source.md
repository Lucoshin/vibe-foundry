---
project: VibeFoundry
category: research
source_path: docs/research/2026-09-08-book-knowledge-open-source.md
status: active
last_updated: 2026-09-08
---

# 书籍知识资产：开源参考与自行实现取舍

## 研究目标与核验范围

用户希望从书籍炼化世界观、人物角色卡、设定、隐喻与概念网络，并明确要求自行开发、学习开源项目的长处。本研究为[本批实现计划](../plans/2026-09-08-book-knowledge-assets.md)和[ADR-006](../adr/006-book-knowledge-assets.md)提供依据，不把外部项目的能力计入 VibeFoundry 的完成度。

核验日期为 2026-09-08。资料来自实际联网读取的官方仓库、官方文档与相关源码；LangExtract 和 BookNLP 使用 GitHub CLI 读取，其他资料及后续源码通过官方网页核对。下文区分外部已核验行为与本项目的设计决定。本次未运行这些项目的模型、整书基准或中文准确率评测，不据示例结果比较性能；没有复制第三方源码、示例书或权重。

## 已核验的参考设计

### LangExtract：分块提取与来源对齐

LangExtract 将长文分成较小文本块，结合示例约束结构化提取，并支持并行与多轮处理。多轮是对同一任务独立重跑、合并补漏；当前合并实现对重叠区间优先保留较早轮次结果。它还有默认关闭的 `context_window_chars`，可向当前块提供前一块尾部，辅助边界处的共指。以上机制不等于逐章积累整书世界观，也不能直接解决远距离角色身份。[官方长文示例](https://github.com/google/langextract/blob/main/docs/examples/longer_text_example.md)、[分块源码](https://github.com/google/langextract/blob/main/langextract/chunking.py)、[多轮与上下文源码](https://github.com/google/langextract/blob/main/langextract/annotation.py)

提取记录将文本、属性和来源范围分开，提供 `char_interval` 与 `alignment_status`。范围为空表示未找到对应来源；非空也可能是部分或模糊匹配。模型生成的解释性属性不会因为存在一个原文范围就自动成立。中文有 `UnicodeTokenizer` 可选，但默认分词方式不同；应分别验证中文提取与坐标准确性，不能把 Unicode 支持当作语义质量证明。[数据结构](https://github.com/google/langextract/blob/main/langextract/core/data.py)、[对齐源码](https://github.com/google/langextract/blob/main/langextract/resolver.py)、[分词源码](https://github.com/google/langextract/blob/main/langextract/core/tokenizer.py)

本项目借鉴“分析结果必须回到具体来源”的设计，自行采用 `unitId + 短引文`，要求单元内唯一逐字匹配，再由程序计算偏移与行号。原文明示与解读分开保存；同一引文可以支撑不同类型的分析，不照搬跨类型重叠就丢弃的合并策略。

### BookNLP：角色身份与文本提及分离

BookNLP 将人物名字聚类、代词共指、发言者归属和实体提及关联起来。名字、称谓和代词可指向统一实体 ID，词元记录原文位置；角色资料还组织人物行为中的施事、受事、拥有物及修饰语。这比“某词出现多少行”更接近可使用的角色资料。[官方功能与输出说明](https://github.com/booknlp/booknlp#readme)

其当前语言入口仅支持英文。官方说明整书共指仍可能把不同人物错误归并，因此默认对普通名词与专名之间的共指有所限制。不能直接将英文名字、称谓及代词处理作为中文小说人物解析器。[语言入口源码](https://github.com/booknlp/booknlp/blob/main/booknlp/booknlp.py)、[共指边界说明](https://github.com/booknlp/booknlp#character-name-clustering-and-coreference)

本项目借鉴稳定人物 ID 与多次提及分离的原则。宿主 AI 维护实体登记表，同名不同人保留不同 ID；别名需要在相应属性中列出依据，程序不按同名自动合并。自动提出别名候选及人工消歧界面留待后续。

### GraphRAG：实体、关系与来源块的分层

GraphRAG 的流程将文档、文本块、实体、关系、声明和社区摘要分层处理。实体与关系输出保留 `text_unit_ids`，可沿来源链回到原始文本块。默认图提取将同名同类型实体合并，将相同起终点关系的描述汇总，再生成摘要。[官方流程](https://microsoft.github.io/graphrag/index/default_dataflow/)、[输出协议](https://microsoft.github.io/graphrag/index/outputs/)

这适合参考来源链和分阶段处理，但同名合并不足以区分小说中的同名人物，单一摘要也不能代替前后变化的独立证据。其增量索引源码中的文档差异判断使用文档标题；不能据此宣称同名书籍正文改变后一定自动重算全部语义资产。[增量索引源码](https://github.com/microsoft/graphrag/blob/main/packages/graphrag/graphrag/index/update/incremental_index.py)

本项目保留实体与关系到证据的独立关联，文档版本由规范化全文摘要隔离。关系由分析者明确提交，不从同章共现补边。本批不引入社区摘要、向量检索或 GraphRAG 服务，也不声称已经具备增量语义重炼。

### LightRAG：提取缓存与来源保留的取舍

LightRAG 提供实体提取结果的模型调用缓存；其处理代码还将完整来源索引与用于实体、关系汇总的来源视图区分。部分限额策略会限制新描述参与汇总的范围，保留来源索引并不等于所有后续内容都已经进入当前摘要。默认关系提取提示词按无向关系组织，也不是本项目所需有向关系的直接契约。[缓存配置源码](https://github.com/HKUDS/LightRAG/blob/main/lightrag/lightrag.py)、[合并与来源处理源码](https://github.com/HKUDS/LightRAG/blob/main/lightrag/operate.py)、[关系提取提示词](https://github.com/HKUDS/LightRAG/blob/main/lightrag/prompt.py)

本项目借鉴提取、归并、展示分别管理的思路。未来实现自动缓存时，需要明确原文、提取任务和模型配置变化如何失效，并检查全书后半段的人物发展是否被摘要限额遗漏。本批只有文档摘要校验和完整块 ID 声明校验，没有模型缓存、自动续跑或增量归并能力。

### Graphiti：保留事实沿革，不混淆叙事时间

Graphiti 围绕输入片段建立来源关联，并以有效时间、失效时间组织事实历史。其边提取提示词区分当前输入与用于理解的前文，输出事实描述及来源片段索引；事实描述是整理后的表述，不等于已做唯一逐字匹配的引文。完整运行还需要模型、嵌入与图存储。[官方仓库](https://github.com/getzep/graphiti)、[关系提取源码](https://github.com/getzep/graphiti/blob/main/graphiti_core/prompts/extract_edges.py)

本项目借鉴保留变化与来源的原则。小说的叙述顺序、故事发生时间、人物得知事情的时间并不相同，不能按章节顺序套用现实时间戳并让旧事实自动失效。本批用多条属性及证据保存变化，用 `uncertainties` 记录冲突；人物说法不能直接升级为世界定律。故事时间专用模型不在本批范围。

### BookWorld：世界观与角色资料共同驱动使用

BookWorld 面向小说中的多角色互动与故事创作，组织人物、地点、世界背景，以及角色记忆和状态。官方提供自动提取人物、地点、设定的入口，也支持手工准备资料。这说明角色资料需要与其世界和环境关联，才能进一步用于交互。[官方仓库与功能说明](https://github.com/alienet1109/BookWorld)

同一官方 README 明确说明自动提取代码目前不稳定，结果可能不可靠，并建议人工录入人物资料。不能只引用其自动提取入口而省略这个边界。已核对的提取代码按人物或人物对汇总文本块、按章节组织设定来源，其定位粒度也不能替代本项目的短引文校验。[自动提取说明](https://github.com/alienet1109/BookWorld#extract-role-location-and-setting-data-automatically)、[人物提取源码](https://github.com/alienet1109/BookWorld/blob/main/extract_data/extract_data.py)、[设定提取源码](https://github.com/alienet1109/BookWorld/blob/main/extract_data/extract_settings.py)

本项目借鉴世界观、人物与设定共同组织的使用方向，自行实现五类资产及有向关系。当前先交付可读卡片、结构化资产和离线关系图，不引入角色仿真，也不把创作补全当成从书中提取的事实。

### SillyTavern：未来消费格式，不承担提取与判真

SillyTavern 的 World Info（世界书）用于动态向对话加入背景内容，支持关键词等激活策略；关键词和标题本身不会替代条目正文进入上下文。条目递归激活是上下文组织机制，不能当作概念关系推理。角色卡中的开场白和对话场景用于影响对话体验，也不能自动成为书中事实。[世界书官方文档](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)、[角色设计官方文档](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)

标准角色卡与客户端原生世界书存在不同字段组织，导出需要明确格式和版本。可参考 [Character Card V2 规范](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)、[Character Card V3 规范](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)及 [SillyTavern 的转换实现](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/world-info.js)，不能只给文件改名就承诺兼容。

本项目只借鉴协议与消费方式，不搬运 SillyTavern 源码。以后可在带证据的内部资产上添加格式适配器，并明确创作字段与来源事实的区别；本批没有标准角色卡或世界书导出器。

## 本批采用的共同设计

具体字段以[本批计划的单一数据契约](../plans/2026-09-08-book-knowledge-assets.md#单一数据契约)为准，本文不另立一套兼容协议。

| 需求 | 本项目决定 |
| --- | --- |
| 长书阅读 | `--prepare` 生成本地单元、块与任务，由宿主 AI 逐块阅读并维护统一实体登记表 |
| 五类资产 | 世界观、人物、设定、概念、隐喻共用实体及属性结构；没有依据的类别允许为空 |
| 来源追溯 | 规范化全文摘要绑定文档版本；短引文在指定单元内唯一匹配，程序生成 UTF-16 偏移与行号 |
| 事实与解读 | 属性和关系都保留 `basis` 与证据；明确表达、分析解读及未解决问题分别呈现 |
| 人物与关系 | 书内稳定 ID；同名不自动合并；有向关系显式提交，不从共现推断关系 |
| 人与 AI 使用 | `--analysis` 导入前完整校验；从同一资产生成分类卡片、JSON 与可离线浏览的关系图 |

当前文本层只规范化 CRLF / CR 为 LF，其余正文不变。单元最多 2000 个 UTF-16 代码单元，分割不拆代理对；连续单元按 12000 字符上限分块。原始空白保留坐标，不猜章节或 PDF 页码。证据引文最多 240 个 Unicode 码点，偏移单位与引文长度单位分别定义，不能混用。

`processedChunkIds` 完整只证明提交者声明覆盖了全部阅读块；逐字锚点正确只证明引文存在。两者都不是程序对阅读质量或语义结论的判真。全文只出现在显式准备的本地阅读工作材料中，最终知识资产不保存全文。

## 留待后续的能力与验收边界

本批之外包括：项目直接调用 API 或本地模型、限流和费用预算、断点恢复、增量语义重炼、自动别名候选审阅、统一 Web/MCP 书籍入口、EPUB/OCR、故事时间专用模型，以及标准世界书和角色卡导出。

本批验收应检验真实 CLI 准备与导入、五类资料和有向关系、错误来源拒绝、同名分人、前后变化保留及离线图交互。自创 fixture 用于验证协议和产物；不得将其结果包装成中文整书理解准确率。完整交付与验证状态由实现计划及相应验收记录维护，不由本研究文档替代。
