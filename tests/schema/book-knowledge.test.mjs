import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { BOOK_ENTITY_TYPES, validateBookKnowledge } from "../../dist/schema/book-knowledge.js";
import { createBookDocument } from "../../dist/analyzers/book-document.js";

function fixture() {
  const text = "序😀\n\n阿澜守护海灯。\n海灯照亮星城。\n";
  const document = {
    schemaVersion: "0.1.0", title: "星城", sourcePath: "D:/books/星城.md",
    sourceDigest: createHash("sha256").update(text).digest("hex"), offsetUnit: "utf16", characterCount: text.length,
    units: [
      { id: "unit-1", text: "序😀", startOffset: 0, endOffset: 3, startLine: 1, endLine: 1 },
      { id: "unit-2", text: "阿澜守护海灯。", startOffset: 5, endOffset: 12, startLine: 3, endLine: 3 },
      { id: "unit-3", text: "海灯照亮星城。", startOffset: 13, endOffset: 20, startLine: 4, endLine: 4 },
    ],
    chunks: [
      { id: "chunk-1", unitIds: ["unit-1", "unit-2"], characterCount: 10 },
      { id: "chunk-2", unitIds: ["unit-3"], characterCount: 7 },
    ],
  };
  const analysis = {
    schemaVersion: "0.2.0", sourceDigest: document.sourceDigest, processedChunkIds: ["chunk-1", "chunk-2"],
    entities: [
      { id: "person-alan", type: "character", name: "阿澜", aliases: [], facets: [{ name: "行动", value: "守护海灯", basis: "explicit", evidence: [{ unitId: "unit-2", quote: "阿澜守护海灯" }] }] },
      { id: "setting-lamp", type: "setting", name: "海灯", aliases: [], facets: [{ name: "效果", value: "照亮星城", basis: "explicit", evidence: [{ unitId: "unit-3", quote: "海灯照亮星城" }] }] },
    ],
    relations: [{ id: "relation-protects", from: "person-alan", to: "setting-lamp", type: "守护", description: "阿澜守护海灯", basis: "explicit", evidence: [{ unitId: "unit-2", quote: "守护海灯" }] }],
    uncertainties: [{ description: "海灯的来历尚未说明", evidence: [] }],
  };
  return { document, analysis };
}

function oneUnit(text) {
  const { document, analysis } = fixture();
  document.sourceDigest = createHash("sha256").update(text).digest("hex");
  document.characterCount = text.length;
  document.units = [{ id: "unit-1", text, startOffset: 0, endOffset: text.length, startLine: 1, endLine: 1 }];
  document.chunks = [{ id: "chunk-1", unitIds: ["unit-1"], characterCount: text.length }];
  analysis.sourceDigest = document.sourceDigest;
  analysis.processedChunkIds = ["chunk-1"];
  analysis.entities = [{ id: "concept-1", type: "concept", name: "测试概念", aliases: [], facets: [{ name: "定义", value: "保留原文", basis: "explicit", evidence: [{ unitId: "unit-1", quote: text }] }] }];
  analysis.relations = [];
  return { document, analysis };
}

function firstEvidence(analysis) { return analysis.entities[0].facets[0].evidence[0]; }
function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

describe("book knowledge schema", () => {
  it("exports exactly the five agreed entity types", () => {
    assert.deepEqual(BOOK_ENTITY_TYPES, ["worldview", "character", "setting", "concept", "metaphor"]);
  });
  it("returns the exact asset metadata and located directed relation", () => {
    const { document, analysis } = fixture();
    const asset = validateBookKnowledge(document, analysis);
    assert.deepEqual(Object.keys(asset).sort(), ["schemaVersion", "sourceDigest", "processedChunkIds", "entities", "relations", "uncertainties", "kind", "title", "sourcePath", "documentStats"].sort());
    assert.equal(asset.kind, "book-knowledge"); assert.equal(asset.title, "星城"); assert.equal(asset.sourcePath, document.sourcePath);
    assert.deepEqual(asset.documentStats, { unitCount: 3, chunkCount: 2, characterCount: 21 });
    assert.deepEqual(asset.relations[0], { ...analysis.relations[0], evidence: [{ unitId: "unit-2", quote: "守护海灯", startOffset: 7, endOffset: 11, startLine: 3, endLine: 3 }] });
    assert.equal(JSON.stringify(asset).includes(document.units[2].text), false);
  });
  it("does not mutate or share nested arrays with its input", () => {
    const { document, analysis } = fixture(); const snapshot = structuredClone(analysis);
    const asset = validateBookKnowledge(freeze(document), freeze(analysis));
    assert.deepEqual(analysis, snapshot);
    assert.notEqual(asset.entities, analysis.entities); assert.notEqual(asset.entities[0].aliases, analysis.entities[0].aliases);
    asset.entities[0].facets[0].evidence[0].quote = "外部修改";
    asset.processedChunkIds.pop();
    assert.deepEqual(analysis, snapshot);
  });
  it("accepts an empty entity and relation collection without inventing categories", () => {
    const { document, analysis } = fixture(); analysis.entities = []; analysis.relations = []; analysis.uncertainties = [];
    const asset = validateBookKnowledge(document, analysis);
    assert.deepEqual(asset.entities, []); assert.deepEqual(asset.relations, []); assert.deepEqual(asset.uncertainties, []);
  });
  it("preserves all five types and explicit versus interpretation without claiming truth", () => {
    const { document, analysis } = fixture();
    analysis.entities = BOOK_ENTITY_TYPES.map((type, index) => ({ ...structuredClone(analysis.entities[0]), id: `entity-${index}`, type, facets: [{ name: "阅读判断", value: "待读者复核的结论", basis: index % 2 ? "interpretation" : "explicit", evidence: [{ unitId: "unit-2", quote: "阿澜" }] }] }));
    analysis.relations = [];
    const asset = validateBookKnowledge(document, analysis);
    assert.deepEqual(asset.entities.map(entity => entity.type), BOOK_ENTITY_TYPES);
    assert.equal(asset.entities[1].facets[0].basis, "interpretation"); assert.equal(asset.entities[0].facets[0].value, "待读者复核的结论");
  });
  it("preserves same-name identities, aliases and repeated facets as submitted", () => {
    const { document, analysis } = fixture();
    analysis.entities[0].aliases = ["守灯人"];
    analysis.entities[0].facets.push({ name: "行动", value: "后续说明仍需保留", basis: "interpretation", evidence: [{ unitId: "unit-3", quote: "海灯" }] });
    analysis.entities.push({ ...structuredClone(analysis.entities[0]), id: "another-alan" });
    const asset = validateBookKnowledge(document, analysis);
    assert.equal(asset.entities.length, 3); assert.equal(asset.entities[0].name, asset.entities[2].name);
    assert.deepEqual(asset.entities[0].aliases, ["守灯人"]); assert.equal(asset.entities[0].facets.length, 2);
  });
  it("calculates UTF-16 positions without treating emoji as one offset unit", () => {
    const { document, analysis } = fixture(); firstEvidence(analysis).unitId = "unit-1"; firstEvidence(analysis).quote = "😀";
    assert.deepEqual(validateBookKnowledge(document, analysis).entities[0].facets[0].evidence[0], { unitId: "unit-1", quote: "😀", startOffset: 1, endOffset: 3, startLine: 1, endLine: 1 });
  });
  it("keeps unit start offsets after blank lines and within a long original line", () => {
    const document = createBookDocument("\r\n\r\n" + "甲".repeat(2000) + "海灯");
    const { analysis } = fixture(); analysis.sourceDigest = document.sourceDigest; analysis.processedChunkIds = document.chunks.map(chunk => chunk.id);
    analysis.entities = [analysis.entities[0]]; analysis.relations = []; firstEvidence(analysis).unitId = "unit-2"; firstEvidence(analysis).quote = "海灯";
    assert.deepEqual(validateBookKnowledge(document, analysis).entities[0].facets[0].evidence[0], { unitId: "unit-2", quote: "海灯", startOffset: 2002, endOffset: 2004, startLine: 3, endLine: 3 });
  });
  it("accepts 240 Unicode code points even when they use 480 UTF-16 units", () => {
    const { document, analysis } = oneUnit("😀".repeat(240));
    assert.equal(validateBookKnowledge(document, analysis).entities[0].facets[0].evidence[0].endOffset, 480);
  });
  it("rejects quotes over 240 Unicode code points and malformed surrogate halves", () => {
    const long = oneUnit("字".repeat(241)); assert.throws(() => validateBookKnowledge(long.document, long.analysis), /240/);
    const emoji = oneUnit("序😀"); firstEvidence(emoji.analysis).quote = "\ud83d";
    assert.throws(() => validateBookKnowledge(emoji.document, emoji.analysis), /Unicode|引文|quote/);
  });
  it("requires the quote to exist literally without trimming or Unicode normalization", () => {
    const { document, analysis } = fixture(); firstEvidence(analysis).quote = "阿澜 守护海灯";
    assert.throws(() => validateBookKnowledge(document, analysis), /逐字|quote|引文/);
    const composed = oneUnit("café"); firstEvidence(composed.analysis).quote = "cafe\u0301";
    assert.throws(() => validateBookKnowledge(composed.document, composed.analysis), /逐字|quote|引文/);
  });
  it("rejects repeated and overlapping matches in the same unit", () => {
    const { document, analysis } = oneUnit("abababa"); firstEvidence(analysis).quote = "aba";
    assert.throws(() => validateBookKnowledge(document, analysis), /唯一|歧义|一次/);
  });
  it("allows the same quote in different explicitly identified units", () => {
    const { document, analysis } = fixture(); firstEvidence(analysis).quote = "海灯";
    analysis.entities[0].facets[0].evidence.push({ unitId: "unit-3", quote: "海灯" });
    assert.deepEqual(validateBookKnowledge(document, analysis).entities[0].facets[0].evidence.map(evidence => evidence.startOffset), [9, 13]);
  });
  it("rejects unknown evidence units and stale source digests", () => {
    const first = fixture(); firstEvidence(first.analysis).unitId = "unit-missing";
    assert.throws(() => validateBookKnowledge(first.document, first.analysis), /unit|单元/);
    const second = fixture(); second.analysis.sourceDigest = "0".repeat(64);
    assert.throws(() => validateBookKnowledge(second.document, second.analysis), /sourceDigest|摘要/);
  });
  it("requires complete chunk coverage regardless of submitted order", () => {
    const { document, analysis } = fixture(); analysis.processedChunkIds.reverse();
    assert.deepEqual(validateBookKnowledge(document, analysis).processedChunkIds, ["chunk-2", "chunk-1"]);
    analysis.processedChunkIds.pop(); assert.throws(() => validateBookKnowledge(document, analysis), /完整|覆盖|processedChunkIds/);
  });
  it("rejects repeated, unknown and non-string processed chunk IDs", () => {
    for (const ids of [["chunk-1", "chunk-1"], ["chunk-1", "chunk-missing"], ["chunk-1", 2]]) {
      const { document, analysis } = fixture(); analysis.processedChunkIds = ids;
      assert.throws(() => validateBookKnowledge(document, analysis), /chunk|Chunk|重复|字符串/);
    }
  });
  it("rejects duplicate entity IDs, relation IDs and shared entity-relation IDs", () => {
    for (const change of [analysis => { analysis.entities[1].id = analysis.entities[0].id; }, analysis => { analysis.relations.push(structuredClone(analysis.relations[0])); }, analysis => { analysis.relations[0].id = analysis.entities[0].id; }]) {
      const { document, analysis } = fixture(); change(analysis);
      assert.throws(() => validateBookKnowledge(document, analysis), /重复|ID|id/);
    }
  });
  it("rejects dangling relation endpoints while retaining natural-language relation types", () => {
    const { document, analysis } = fixture(); analysis.relations[0].to = "unknown";
    assert.throws(() => validateBookKnowledge(document, analysis), /实体|to|引用/);
    analysis.relations[0].to = analysis.relations[0].from; analysis.relations[0].type = "自我反思";
    assert.equal(validateBookKnowledge(document, analysis).relations[0].type, "自我反思");
  });
  it("requires a facet on every entity and evidence on every facet and relation", () => {
    for (const change of [analysis => { analysis.entities[0].facets = []; }, analysis => { analysis.entities[0].facets[0].evidence = []; }, analysis => { analysis.relations[0].evidence = []; }]) {
      const { document, analysis } = fixture(); change(analysis);
      assert.throws(() => validateBookKnowledge(document, analysis), /facet|evidence|至少|证据/);
    }
  });
  it("allows unresolved questions without evidence and locates any evidence provided", () => {
    const { document, analysis } = fixture(); analysis.uncertainties.push({ description: "守护动机仍不明确", evidence: [{ unitId: "unit-2", quote: "守护" }] });
    const asset = validateBookKnowledge(document, analysis);
    assert.deepEqual(asset.uncertainties[0].evidence, []); assert.equal(asset.uncertainties[1].evidence[0].startOffset, 7);
    analysis.uncertainties[1].evidence[0].quote = "没有出现";
    assert.throws(() => validateBookKnowledge(document, analysis), /逐字|引文|quote/);
  });
  it("rejects unrecognized analysis, entity, facet, relation, uncertainty and evidence fields", () => {
    const targets = [analysis => analysis, analysis => analysis.entities[0], analysis => analysis.entities[0].facets[0], analysis => analysis.relations[0], analysis => analysis.uncertainties[0], firstEvidence];
    for (const target of targets) {
      const { document, analysis } = fixture(); target(analysis).confidence = 1;
      assert.throws(() => validateBookKnowledge(document, analysis), /confidence|字段/);
    }
  });
  it("rejects missing required fields instead of supplying defaults", () => {
    for (const remove of [analysis => { delete analysis.uncertainties; }, analysis => { delete analysis.entities[0].aliases; }, analysis => { delete analysis.entities[0].facets[0].basis; }, analysis => { delete analysis.relations[0].description; }, analysis => { delete analysis.uncertainties[0].evidence; }, analysis => { delete firstEvidence(analysis).quote; }]) {
      const { document, analysis } = fixture(); remove(analysis);
      assert.throws(() => validateBookKnowledge(document, analysis), /字段|缺少|必须/);
    }
  });
  it("rejects unknown entity types and unsupported basis values", () => {
    for (const change of [analysis => { analysis.entities[0].type = "person"; }, analysis => { analysis.entities[0].facets[0].basis = "verified"; }, analysis => { analysis.relations[0].basis = "inferred"; }]) {
      const { document, analysis } = fixture(); change(analysis);
      assert.throws(() => validateBookKnowledge(document, analysis), /type|basis|类型/);
    }
  });
  it("rejects old analysis versions, non-record inputs and wrong collection shapes", () => {
    const { document } = fixture();
    for (const analysis of [null, [], "text", { ...fixture().analysis, schemaVersion: "0.1.0" }, { ...fixture().analysis, entities: {} }, { ...fixture().analysis, relations: null }]) assert.throws(() => validateBookKnowledge(document, analysis));
  });
  it("requires non-empty strings for IDs, names, facet values, descriptions and quotes", () => {
    for (const change of [analysis => { analysis.entities[0].id = " "; }, analysis => { analysis.entities[0].name = ""; }, analysis => { analysis.entities[0].aliases = [2]; }, analysis => { analysis.entities[0].facets[0].value = {}; }, analysis => { analysis.relations[0].description = "\n"; }, analysis => { analysis.uncertainties[0].description = false; }, analysis => { firstEvidence(analysis).quote = " "; }]) {
      const { document, analysis } = fixture(); change(analysis);
      assert.throws(() => validateBookKnowledge(document, analysis), /字符串|非空|必须/);
    }
  });
  it("rejects unsupported document coordinates instead of fabricating locations", () => {
    for (const change of [document => { document.offsetUnit = "codepoints"; }, document => { document.units[1].startOffset = -1; }, document => { document.units[1].endOffset = 13; }, document => { document.units[1].startLine = 0; }, document => { document.units[1].id = "unit-1"; }]) {
      const { document, analysis } = fixture(); change(document);
      assert.throws(() => validateBookKnowledge(document, analysis), /document|单元|坐标|offset|Offset|重复|Line/);
    }
  });
});
