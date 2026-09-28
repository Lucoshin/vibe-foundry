import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createBookDocument } from "../../dist/analyzers/book-document.js";
import { analyzeBookText } from "../../dist/analyzers/book-distiller.js";
import { validateBookKnowledge } from "../../dist/schema/book-knowledge.js";

const roots = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function library() {
  const root = await mkdtemp(join(tmpdir(), "vibehub-book-library-"));
  roots.push(root);
  return root;
}
async function writePackage(root, name, value) {
  const directory = join(root, "books", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "book-assets.json"), typeof value === "string" ? value : JSON.stringify(value));
  return directory;
}
function knowledge() {
  const document = createBookDocument("林岚守护灯塔。\n灯塔立在海岬。", { title: "雾港", sourcePath: "D:/books/雾港.txt" });
  const evidence = [{ unitId: document.units[0].id, quote: "林岚守护灯塔。" }];
  return validateBookKnowledge(document, {
    schemaVersion: "0.2.0", sourceDigest: document.sourceDigest,
    processedChunkIds: document.chunks.map(chunk => chunk.id),
    entities: [
      { id: "lin", type: "character", name: "林岚", aliases: ["守灯人"], facets: [{ name: "职责", value: "守护灯塔", basis: "explicit", evidence }] },
      { id: "tower", type: "setting", name: "灯塔", aliases: [], facets: [{ name: "位置", value: "海岬", basis: "explicit", evidence: [{ unitId: document.units[1].id, quote: "灯塔立在海岬。" }] }] },
    ],
    relations: [{ id: "guard", from: "lin", to: "tower", type: "守护", description: "林岚守护灯塔。", basis: "explicit", evidence }],
    uncertainties: [{ description: "守护原因尚不明确。", evidence: [] }],
  });
}

describe("book library assets", () => {
  it("loads a missing books directory as an empty collection", async () => {
    const { loadBookLibraryAssets } = await import("../../dist/library/book-assets.js");
    assert.deepEqual(await loadBookLibraryAssets(await library()), { assets: [], sources: [], errors: [] });
  });

  it("exposes checked entities, evidence and directed relations without rewriting the book package", async () => {
    const { loadBookLibraryAssets } = await import("../../dist/library/book-assets.js");
    const root = await library();
    const book = knowledge();
    const directory = await writePackage(root, "fog-123", book);
    const before = await readFile(join(directory, "book-assets.json"), "utf8");
    const result = await loadBookLibraryAssets(root);
    assert.equal(result.errors.length, 0);
    assert.equal(result.assets.length, 2);
    const character = result.assets.find(asset => asset.kind === "character");
    assert.equal(character.category, "knowledge");
    assert.equal(character.name, "林岚");
    assert.equal(character.source, book.sourcePath);
    assert.equal(character.project, book.title);
    assert.equal(character.sourceKind, "book");
    assert.equal(character.language, null);
    assert.deepEqual(character.labels, []);
    assert.deepEqual(character.raw, book.entities[0]);
    assert.deepEqual(character.evidence, book.entities[0].facets[0].evidence);
    assert.deepEqual(character.relations, book.relations);
    assert.equal(character.sourceId, result.sources[0].id);
    assert.equal(result.sources[0].name, book.title);
    assert.equal(result.sources[0].status, "knowledge");
    assert.equal(result.sources[0].assetCount, 2);
    assert.equal(result.sources[0].sourceDigest, book.sourceDigest);
    assert.deepEqual(result.sources[0].uncertainties, book.uncertainties);
    assert.match(character.revision, /^[a-f0-9]{64}$/);
    assert.equal(await readFile(join(directory, "book-assets.json"), "utf8"), before);
  });

  it("keeps identity stable when content changes and separates same-name entities from different books", async () => {
    const { loadBookLibraryAssets } = await import("../../dist/library/book-assets.js");
    const root = await library();
    const book = knowledge();
    await writePackage(root, "a", book);
    const first = (await loadBookLibraryAssets(root)).assets[0];
    book.entities[0].name = "林岚的新名称";
    await writePackage(root, "a", book);
    await writePackage(root, "b", book);
    const result = await loadBookLibraryAssets(root);
    const updated = result.assets.find(asset => asset.id === first.id);
    assert.equal(updated.name, "林岚的新名称");
    assert.notEqual(updated.revision, first.revision);
    assert.equal(new Set(result.assets.map(asset => asset.id)).size, 4);
    assert.deepEqual(await loadBookLibraryAssets(root), result);
  });

  it("shows historical 0.1 statistics as a source without claiming semantic knowledge", async () => {
    const { loadBookLibraryAssets } = await import("../../dist/library/book-assets.js");
    const root = await library();
    await writePackage(root, "statistics", analyzeBookText("第一章 概念\n递归与形式系统", { title: "概念", sourcePath: "D:/books/概念.txt" }));
    const result = await loadBookLibraryAssets(root);
    assert.deepEqual(result.assets, []);
    assert.deepEqual(result.errors, []);
    assert.equal(result.sources[0].status, "statistics");
    assert.equal(result.sources[0].sourceDigest, null);
    assert.equal(result.sources[0].assetCount, 0);
  });

  it("reports unreadable and malformed packages while retaining valid books", async () => {
    const { loadBookLibraryAssets } = await import("../../dist/library/book-assets.js");
    const root = await library();
    await writePackage(root, "valid", knowledge());
    await writePackage(root, "broken-json", "{");
    await mkdir(join(root, "books", "missing"));
    const invalid = knowledge();
    invalid.relations[0].to = "missing-entity";
    await writePackage(root, "broken-reference", invalid);
    const invalidEvidence = knowledge();
    invalidEvidence.entities[0].facets[0].evidence[0].startLine = 0;
    await writePackage(root, "broken-evidence", invalidEvidence);
    const result = await loadBookLibraryAssets(root);
    assert.equal(result.assets.length, 2);
    assert.equal(result.sources.length, 1);
    assert.equal(result.errors.length, 4);
    for (const error of result.errors) {
      assert.match(error.sourceId, /^book:/);
      assert.equal(typeof error.assetPackageDir, "string");
      assert.ok(error.message.length > 0);
    }
    assert.match(result.errors.find(error => error.assetPackageDir.endsWith("broken-reference")).message, /关系|实体/);
    assert.match(result.errors.find(error => error.assetPackageDir.endsWith("broken-evidence")).message, /证据|行/);
  });
});
