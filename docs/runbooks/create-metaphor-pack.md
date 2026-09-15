---
project: VibeFoundry
category: runbook
source_path: docs/runbooks/create-metaphor-pack.md
status: active
last_updated: 2026-09-08
---

# 创建 metaphor pack

本文档说明如何从用户有权处理的短文本笔记中创建文化隐喻资产。

## 1. 输入目录

将材料放入：

```text
docs/metaphors/
```

支持：

- `.md`
- `.mdx`
- `.txt`

建议每个文件只放一组来源笔记或摘要，例如：

```text
docs/metaphors/memory-palace.md
docs/metaphors/dao-notes.md
docs/metaphors/forge-notes.txt
```

## 2. 来源边界

允许处理：

- 用户自有笔记。
- 用户自己写的摘要。
- 已获授权处理的材料。
- 公版材料的短摘要和结构化分析。

不允许：

- 不保存整本书。
- 不保存大段版权原文。
- 不把未授权材料复制进资产包。
- 不用 metaphor pack 代替人工文化审查。

## 3. 生成方式

在仓库根目录运行：

```bash
node dist/cli.js distill .
```

输出位置：

```text
<asset-package-dir>/concept-assets.json
<asset-package-dir>/metaphor-packs/<source>.json
```

`<asset-package-dir>` 是 `distill` 打印的集中资产包目录；集中资产库优先使用 `VIBE_FOUNDRY_LIBRARY_ROOT`，未设置时使用 `<user-home>/.vibe-foundry/library`。

来源名称保留 Unicode 字母和数字，例如 `山海经.md` 输出 `metaphor-packs/山海经.json`；既有 `memory-palace.json` 命名不变。名称为空、只有标点，或不同来源归一化为同一个文件名时，命令在写入资产包之前报错。出现冲突时请为来源文件设置不同名称后重炼。

重炼成功后，生成目录 `metaphor-packs/` 直属、已不属于本批输出的 JSON 会被清理；其他扩展名、子目录和源材料保留。该目录用于生成产物，自有材料应放在输入目录。

## 4. 输出字段

每个 metaphor pack 包含：

- `source`
- `sourceType`
- `coreMetaphors`
- `archetypes`
- `namingSystem`
- `visualMotifs`
- `interactionIdeas`
- `emotionalTone`
- `productApplications`
- `sourceReferences`
- `copyrightNotes`

当前提取器使用有限的英文关键词规则。未命中时，核心隐喻及其衍生建议为空数组，仍保留来源和版权说明；未识别到情绪词时 `emotionalTone` 也为空。空数组表示现有规则未识别到结果，不表示材料没有价值。命中后的命名、视觉和交互内容是规则建议，使用前应回查材料。

## 5. 验证

运行：

```bash
npm test
npm run build
node dist/cli.js distill .
```

检查：

- `<asset-package-dir>/metaphor-packs/` 是否生成 JSON 文件。
- `sourceReferences` 是否是短引用或来源标记。
- `copyrightNotes` 是否说明不保存长段原文。
- `coreMetaphors`、`visualMotifs`、`interactionIdeas` 是否可用于产品设计参考。

## 6. 使用建议

metaphor pack 只能作为产品命名、交互、视觉和叙事参考。

如果来源涉及具体文化、宗教、历史创伤、民族身份或仍在使用的传统，必须加入人工审查，避免误读、挪用或简化。
