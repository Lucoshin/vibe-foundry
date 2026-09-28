import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveAssetLibraryRoot } from "./asset-library.js";
import { BOOK_ENTITY_TYPES } from "../schema/book-knowledge.js";

const digest = value => createHash("sha256").update(value).digest("hex");
const requiredString = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`书籍资产 ${field} 必须为非空文本。`);
};
const requiredArray = (value, field) => {
  if (!Array.isArray(value)) throw new Error(`书籍资产 ${field} 必须为数组。`);
};
const requiredObject = (value, field) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`书籍资产 ${field} 必须为对象。`);
};
function validateBasis(value) {
  if (value !== "explicit" && value !== "interpretation") throw new Error("书籍资产依据必须为 explicit 或 interpretation。");
}
function validateEvidence(evidence, characterCount, minimum = 1) {
  requiredArray(evidence, "evidence");
  if (evidence.length < minimum) throw new Error("书籍资产条目缺少证据。");
  for (const item of evidence) {
    requiredObject(item, "evidence[]");
    requiredString(item.unitId, "evidence.unitId");
    requiredString(item.quote, "evidence.quote");
    if (!item.quote.isWellFormed() || [...item.quote].length > 240) throw new Error("书籍资产证据引文必须为完整 Unicode 且不超过 240 个码点。");
    if (!Number.isSafeInteger(item.startOffset) || !Number.isSafeInteger(item.endOffset)
      || item.startOffset < 0 || item.endOffset - item.startOffset !== item.quote.length || item.endOffset > characterCount
      || !Number.isSafeInteger(item.startLine) || !Number.isSafeInteger(item.endLine)
      || item.startLine < 1 || item.endLine !== item.startLine) throw new Error("书籍资产证据的坐标或行号无效。");
  }
}

// 这里只核对既有产物结构与引用；原文逐字核验在 importBookKnowledge 中完成。
function validateKnowledge(book) {
  if (book.kind !== "book-knowledge") throw new Error("书籍 0.2.0 资产必须声明 kind=book-knowledge。");
  if (typeof book.sourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(book.sourceDigest)) throw new Error("书籍资产 sourceDigest 必须为 SHA-256 摘要。");
  requiredObject(book.documentStats, "documentStats");
  for (const field of ["unitCount", "chunkCount", "characterCount"]) {
    if (!Number.isSafeInteger(book.documentStats[field]) || book.documentStats[field] < 1) throw new Error(`书籍资产 documentStats.${field} 无效。`);
  }
  requiredArray(book.processedChunkIds, "processedChunkIds");
  for (const id of book.processedChunkIds) requiredString(id, "processedChunkIds[]");
  if (new Set(book.processedChunkIds).size !== book.documentStats.chunkCount || book.processedChunkIds.length !== book.documentStats.chunkCount) throw new Error("书籍资产阅读块数量或身份无效。");
  for (const field of ["entities", "relations", "uncertainties"]) requiredArray(book[field], field);
  const ids = new Set();
  const entityIds = new Set();
  const uniqueId = id => {
    requiredString(id, "id");
    if (ids.has(id)) throw new Error("书籍实体或关系 ID 重复。");
    ids.add(id);
  };
  for (const entity of book.entities) {
    requiredObject(entity, "entities[]");
    uniqueId(entity.id);
    entityIds.add(entity.id);
    if (!BOOK_ENTITY_TYPES.includes(entity.type)) throw new Error("书籍实体类型不属于现行五类协议。");
    requiredString(entity.name, "entity.name");
    requiredArray(entity.aliases, "entity.aliases");
    for (const alias of entity.aliases) requiredString(alias, "entity.aliases[]");
    requiredArray(entity.facets, "entity.facets");
    if (!entity.facets.length) throw new Error("书籍实体缺少属性和证据。");
    for (const facet of entity.facets) {
      requiredObject(facet, "facet");
      requiredString(facet.name, "facet.name");
      requiredString(facet.value, "facet.value");
      validateBasis(facet.basis);
      validateEvidence(facet.evidence, book.documentStats.characterCount);
    }
  }
  for (const relation of book.relations) {
    requiredObject(relation, "relations[]");
    uniqueId(relation.id);
    if (!entityIds.has(relation.from) || !entityIds.has(relation.to)) throw new Error("书籍关系引用了不存在的实体。");
    requiredString(relation.type, "relation.type");
    requiredString(relation.description, "relation.description");
    validateBasis(relation.basis);
    validateEvidence(relation.evidence, book.documentStats.characterCount);
  }
  for (const uncertainty of book.uncertainties) {
    requiredObject(uncertainty, "uncertainties[]");
    requiredString(uncertainty.description, "uncertainty.description");
    validateEvidence(uncertainty.evidence, book.documentStats.characterCount, 0);
  }
}

export async function loadBookLibraryAssets(libraryRoot) {
  const booksDirectory = join(resolveAssetLibraryRoot(libraryRoot), "books");
  let directories;
  try {
    directories = await readdir(booksDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { assets: [], sources: [], errors: [] };
    throw error;
  }
  const result = { assets: [], sources: [], errors: [] };
  for (const directory of directories.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!directory.isDirectory() && !directory.isSymbolicLink()) continue;
    const assetPackageDir = join(booksDirectory, directory.name);
    const sourceId = `book:${directory.name}`;
    try {
      if (directory.isSymbolicLink()) throw new Error("书籍资产包必须为普通目录，不能为链接。");
      const filePath = join(assetPackageDir, "book-assets.json");
      const file = await lstat(filePath);
      if (!file.isFile() || file.isSymbolicLink()) throw new Error("书籍资产 JSON 必须为普通文件。");
      const serialized = await readFile(filePath, "utf8");
      const book = JSON.parse(serialized);
      requiredObject(book, "book-assets");
      requiredString(book.title, "title");
      requiredString(book.sourcePath, "sourcePath");
      const revision = digest(serialized);
      const isKnowledge = book.schemaVersion === "0.2.0";
      if (isKnowledge) {
        validateKnowledge(book);
      } else if (book.schemaVersion === "0.1.0" && !Object.hasOwn(book, "kind")) {
        for (const field of ["chapters", "concepts", "relations"]) requiredArray(book[field], field);
      } else {
        throw new Error("不支持的书籍资产协议；仅接受 0.2.0 知识或 0.1.0 基础统计。");
      }
      result.sources.push({
        id: sourceId, kind: "book", name: book.title, path: book.sourcePath, assetPackageDir,
        status: isKnowledge ? "knowledge" : "statistics", assetCount: isKnowledge ? book.entities.length : 0,
        sourceDigest: isKnowledge ? book.sourceDigest : null, revision,
        uncertainties: isKnowledge ? book.uncertainties : [],
      });
      if (!isKnowledge) continue;
      for (const entity of book.entities) result.assets.push({
        id: `knowledge:${digest(JSON.stringify([sourceId, entity.id]))}`,
        category: "knowledge", kind: entity.type, name: entity.name,
        source: book.sourcePath, project: book.title, assetPackageDir,
        language: null, languageLabel: "", labels: [],
        description: entity.facets.map(facet => `${facet.name}：${facet.value}`).join("；"),
        raw: entity, evidence: entity.facets.flatMap(facet => facet.evidence),
        relations: book.relations.filter(relation => relation.from === entity.id || relation.to === entity.id),
        sourceId, sourceKind: "book", revision,
      });
    } catch (error) {
      result.errors.push({ sourceId, assetPackageDir, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
