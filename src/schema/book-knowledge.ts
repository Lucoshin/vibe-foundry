export const BOOK_ENTITY_TYPES = Object.freeze(["worldview", "character", "setting", "concept", "metaphor"]);

const analysisFields = ["schemaVersion", "sourceDigest", "processedChunkIds", "entities", "relations", "uncertainties"];
const documentFields = ["schemaVersion", "title", "sourcePath", "sourceDigest", "offsetUnit", "characterCount", "units", "chunks"];
const unitFields = ["id", "text", "startOffset", "endOffset", "startLine", "endLine"];

function record(value, fields, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} 必须为对象。`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new Error(`${path}.${key} 不属于允许字段。`);
  for (const key of fields) if (!Object.hasOwn(value, key)) throw new Error(`${path} 缺少必需字段 ${key}。`);
}

function string(value, path, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new TypeError(`${path} 必须为${allowEmpty ? "" : "非空"}字符串。`);
  return value;
}

function array(value, path, minimum = 0) {
  if (!Array.isArray(value)) throw new TypeError(`${path} 必须为数组。`);
  if (value.length < minimum) throw new Error(`${path} 至少需要 ${minimum} 项。`);
  return value;
}

function integer(value, minimum, path) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${path} 必须为不小于 ${minimum} 的安全整数。`);
}

function uniqueId(value, ids, path) {
  string(value, path);
  if (ids.has(value)) throw new Error(`${path} 包含重复 ID：${value}。`);
  ids.add(value);
  return value;
}

function documentIndexes(document) {
  record(document, documentFields, "document");
  if (document.schemaVersion !== "0.1.0" || document.offsetUnit !== "utf16") throw new Error("document 必须使用 0.1.0 文本协议与 utf16 坐标。");
  string(document.title, "document.title");
  string(document.sourcePath, "document.sourcePath", true);
  if (typeof document.sourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(document.sourceDigest)) throw new Error("document.sourceDigest 必须为 SHA-256 摘要。");
  integer(document.characterCount, 1, "document.characterCount");
  const units = new Map();
  let previousEnd = 0;
  let previousLine = 1;
  for (const [index, unit] of array(document.units, "document.units", 1).entries()) {
    const path = `document.units[${index}]`;
    record(unit, unitFields, path);
    string(unit.id, `${path}.id`);
    string(unit.text, `${path}.text`, true);
    if (units.has(unit.id)) throw new Error(`${path}.id 包含重复单元 ID。`);
    integer(unit.startOffset, 0, `${path}.startOffset`);
    integer(unit.endOffset, 1, `${path}.endOffset`);
    integer(unit.startLine, 1, `${path}.startLine`);
    integer(unit.endLine, 1, `${path}.endLine`);
    if (!unit.text.length || /[\r\n]/.test(unit.text) || unit.endOffset - unit.startOffset !== unit.text.length || unit.endOffset > document.characterCount || unit.startOffset < previousEnd || unit.startLine < previousLine || unit.endLine !== unit.startLine) throw new Error(`${path} 的单元文本与坐标不一致。`);
    units.set(unit.id, unit);
    previousEnd = unit.endOffset;
    previousLine = unit.endLine;
  }
  const chunkIds = new Set();
  const chunkUnitIds = new Set();
  for (const [index, chunk] of array(document.chunks, "document.chunks", 1).entries()) {
    const path = `document.chunks[${index}]`;
    record(chunk, ["id", "unitIds", "characterCount"], path);
    uniqueId(chunk.id, chunkIds, `${path}.id`);
    integer(chunk.characterCount, 1, `${path}.characterCount`);
    let characterCount = 0;
    for (const [unitIndex, unitId] of array(chunk.unitIds, `${path}.unitIds`, 1).entries()) {
      uniqueId(unitId, chunkUnitIds, `${path}.unitIds[${unitIndex}]`);
      if (!units.has(unitId)) throw new Error(`${path} 引用了不存在的单元 ${unitId}。`);
      characterCount += units.get(unitId).text.length;
    }
    if (characterCount !== chunk.characterCount) throw new Error(`${path}.characterCount 与单元文本长度不一致。`);
  }
  if (chunkUnitIds.size !== units.size) throw new Error("document.chunks 必须完整覆盖全部单元。");
  return { units, chunkIds };
}

export function validateBookKnowledge(document, analysis) {
  const { units, chunkIds } = documentIndexes(document);
  record(analysis, analysisFields, "analysis");
  if (analysis.schemaVersion !== "0.2.0") throw new Error("analysis.schemaVersion 必须为 0.2.0，旧词表统计不能作为知识资产导入。");
  if (analysis.sourceDigest !== document.sourceDigest) throw new Error("analysis.sourceDigest 与当前原书摘要不符，分析来源已过期或不匹配。");
  const processedIds = new Set();
  const processedChunkIds = Array.from(array(analysis.processedChunkIds, "analysis.processedChunkIds"), (id, index) => {
    uniqueId(id, processedIds, `analysis.processedChunkIds[${index}]`);
    if (!chunkIds.has(id)) throw new Error(`analysis.processedChunkIds 引用了陌生块 ${id}。`);
    return id;
  });
  if (processedIds.size !== chunkIds.size) throw new Error("analysis.processedChunkIds 必须完整覆盖当前文档的全部块。");

  function basis(value, path) {
    if (value !== "explicit" && value !== "interpretation") throw new Error(`${path} 只允许 explicit 或 interpretation。`);
    return value;
  }

  function evidenceList(value, path, minimum = 1) {
    return Array.from(array(value, path, minimum), (evidence, index) => {
      const itemPath = `${path}[${index}]`;
      record(evidence, ["unitId", "quote"], itemPath);
      const unitId = string(evidence.unitId, `${itemPath}.unitId`);
      const quote = string(evidence.quote, `${itemPath}.quote`);
      if (!quote.isWellFormed()) throw new Error(`${itemPath}.quote 必须为完整 Unicode 引文。`);
      if ([...quote].length > 240) throw new Error(`${itemPath}.quote 不得超过 240 个 Unicode 码点。`);
      const unit = units.get(unitId);
      if (!unit) throw new Error(`${itemPath}.unitId 引用了不存在的证据单元。`);
      const offset = unit.text.indexOf(quote);
      if (offset === -1) throw new Error(`${itemPath}.quote 未在指定单元中逐字出现。`);
      if (unit.text.indexOf(quote, offset + 1) !== -1) throw new Error(`${itemPath}.quote 存在歧义，必须在单元内唯一出现一次。`);
      return { unitId, quote, startOffset: unit.startOffset + offset, endOffset: unit.startOffset + offset + quote.length, startLine: unit.startLine, endLine: unit.endLine };
    });
  }

  const ids = new Set();
  const entityIds = new Set();
  const entities = Array.from(array(analysis.entities, "analysis.entities"), (entity, index) => {
    const path = `analysis.entities[${index}]`;
    record(entity, ["id", "type", "name", "aliases", "facets"], path);
    const id = uniqueId(entity.id, ids, `${path}.id`);
    entityIds.add(id);
    if (!BOOK_ENTITY_TYPES.includes(entity.type)) throw new Error(`${path}.type 必须为约定的五类实体类型之一。`);
    return {
      id, type: entity.type, name: string(entity.name, `${path}.name`),
      aliases: Array.from(array(entity.aliases, `${path}.aliases`), (alias, aliasIndex) => string(alias, `${path}.aliases[${aliasIndex}]`)),
      facets: Array.from(array(entity.facets, `${path}.facets`, 1), (facet, facetIndex) => {
        const facetPath = `${path}.facets[${facetIndex}]`;
        record(facet, ["name", "value", "basis", "evidence"], facetPath);
        return { name: string(facet.name, `${facetPath}.name`), value: string(facet.value, `${facetPath}.value`), basis: basis(facet.basis, `${facetPath}.basis`), evidence: evidenceList(facet.evidence, `${facetPath}.evidence`) };
      }),
    };
  });
  const relations = Array.from(array(analysis.relations, "analysis.relations"), (relation, index) => {
    const path = `analysis.relations[${index}]`;
    record(relation, ["id", "from", "to", "type", "description", "basis", "evidence"], path);
    const id = uniqueId(relation.id, ids, `${path}.id`);
    for (const endpoint of ["from", "to"]) {
      string(relation[endpoint], `${path}.${endpoint}`);
      if (!entityIds.has(relation[endpoint])) throw new Error(`${path}.${endpoint} 必须引用存在的实体 ID。`);
    }
    return { id, from: relation.from, to: relation.to, type: string(relation.type, `${path}.type`), description: string(relation.description, `${path}.description`), basis: basis(relation.basis, `${path}.basis`), evidence: evidenceList(relation.evidence, `${path}.evidence`) };
  });
  const uncertainties = Array.from(array(analysis.uncertainties, "analysis.uncertainties"), (uncertainty, index) => {
    const path = `analysis.uncertainties[${index}]`;
    record(uncertainty, ["description", "evidence"], path);
    return { description: string(uncertainty.description, `${path}.description`), evidence: evidenceList(uncertainty.evidence, `${path}.evidence`, 0) };
  });
  return {
    schemaVersion: "0.2.0", sourceDigest: analysis.sourceDigest, processedChunkIds, entities, relations, uncertainties,
    kind: "book-knowledge", title: document.title, sourcePath: document.sourcePath,
    documentStats: { unitCount: document.units.length, chunkCount: document.chunks.length, characterCount: document.characterCount },
  };
}
