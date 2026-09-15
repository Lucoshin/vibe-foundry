import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vibe-book-knowledge-"));
  roots.push(root);
  const bookPath = join(root, "雾港.md");
  await writeFile(bookPath, "第一章 借灯\n林岚是修灯师。\n每盏灯只燃烧主人自愿交出的记忆。\n");
  return { root, bookPath };
}

function analysisFor(document) {
  return {
    schemaVersion: "0.2.0", sourceDigest: document.sourceDigest,
    processedChunkIds: document.chunks.map((chunk) => chunk.id),
    entities: [{ id: "lin", type: "character", name: "林岚", aliases: [], facets: [{
      name: "身份", value: "修灯师", basis: "explicit",
      evidence: [{ unitId: document.units.find((unit) => unit.text === "林岚是修灯师。").id, quote: "林岚是修灯师。" }],
    }] }],
    relations: [], uncertainties: [],
  };
}

describe("book knowledge workflow", () => {
  it("exports the preparation and import workflow", async () => {
    const mod = await import("../../dist/analyzers/book-knowledge-workflow.js");
    assert.equal(typeof mod.prepareBookKnowledge, "function");
    assert.equal(typeof mod.importBookKnowledge, "function");
  });

  it("prepares source units and an actionable AI reading task without creating semantic results", async () => {
    const { prepareBookKnowledge } = await import("../../dist/analyzers/book-knowledge-workflow.js");
    const { root, bookPath } = await fixture();
    const result = await prepareBookKnowledge(bookPath, join(root, "reading"));
    const document = JSON.parse(await readFile(join(result.outputDir, "document.json"), "utf8"));
    assert.equal(document.sourcePath, resolve(bookPath));
    const task = await readFile(join(result.outputDir, "book-task.md"), "utf8");
    for (const term of ["世界观", "角色卡", "隐喻", "processedChunkIds", "interpretation", "sourceDigest", "书外", "同名", "未完成", "240"]) assert.ok(task.includes(term), term);
    assert.match(await readFile(join(result.outputDir, "chunks", "chunk-1.md"), "utf8"), /unit-2[\s\S]*林岚是修灯师/);
    assert.deepEqual((await readdir(result.outputDir)).sort(), ["book-task.md", "chunks", "document.json"]);
    await assert.rejects(() => prepareBookKnowledge(bookPath, result.outputDir), /已存在|exist/);
  });

  it("imports checked facts, renders cards and graph, and retains unrelated user files", async () => {
    const { prepareBookKnowledge, importBookKnowledge } = await import("../../dist/analyzers/book-knowledge-workflow.js");
    const { root, bookPath } = await fixture();
    const { document } = await prepareBookKnowledge(bookPath, join(root, "reading"));
    const analysisPath = join(root, "analysis.json");
    await writeFile(analysisPath, JSON.stringify(analysisFor(document)));
    const outputDir = join(root, "result");
    await mkdir(outputDir);
    await writeFile(join(outputDir, "user-notes.md"), "keep");
    const result = await importBookKnowledge(bookPath, analysisPath, { outputDir });
    assert.equal(result.outputDir, resolve(outputDir));
    assert.equal(result.asset.kind, "book-knowledge");
    assert.equal(result.asset.entities[0].facets[0].evidence[0].startLine, 2);
    const disk = JSON.parse(await readFile(join(outputDir, "book-assets.json"), "utf8"));
    assert.deepEqual(disk, result.asset);
    assert.match(await readFile(join(outputDir, "characters.md"), "utf8"), /林岚/);
    assert.match(await readFile(join(outputDir, "knowledge-network.html"), "utf8"), /html/i);
    assert.equal(await readFile(join(outputDir, "user-notes.md"), "utf8"), "keep");
    assert.equal(Object.hasOwn(disk, "units"), false);
  });

  it("rejects stale source analysis before touching an existing output", async () => {
    const { prepareBookKnowledge, importBookKnowledge } = await import("../../dist/analyzers/book-knowledge-workflow.js");
    const { root, bookPath } = await fixture();
    const { document } = await prepareBookKnowledge(bookPath, join(root, "reading"));
    const analysisPath = join(root, "analysis.json");
    await writeFile(analysisPath, JSON.stringify(analysisFor(document)));
    const outputDir = join(root, "result");
    await mkdir(outputDir);
    await writeFile(join(outputDir, "book-assets.json"), "previous");
    await writeFile(bookPath, "第一章\n林岚不是修灯师。\n");
    await assert.rejects(() => importBookKnowledge(bookPath, analysisPath, { outputDir }), /digest|摘要/i);
    assert.equal(await readFile(join(outputDir, "book-assets.json"), "utf8"), "previous");
    assert.deepEqual(await readdir(outputDir), ["book-assets.json"]);
  });

  it("rejects incomplete analyses and output links before writing any generated file", async () => {
    const { prepareBookKnowledge, importBookKnowledge } = await import("../../dist/analyzers/book-knowledge-workflow.js");
    const { root, bookPath } = await fixture();
    const { document } = await prepareBookKnowledge(bookPath, join(root, "reading"));
    const analysisPath = join(root, "analysis.json");
    const analysis = analysisFor(document);
    await writeFile(analysisPath, JSON.stringify({ ...analysis, processedChunkIds: [] }));
    const outputDir = join(root, "result");
    await assert.rejects(() => importBookKnowledge(bookPath, analysisPath, { outputDir }), /chunk|块|覆盖/i);
    await assert.rejects(() => readdir(outputDir), { code: "ENOENT" });
    await writeFile(analysisPath, JSON.stringify(analysis));
    const outside = join(root, "outside");
    await mkdir(outside);
    await symlink(outside, outputDir, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(() => importBookKnowledge(bookPath, analysisPath, { outputDir }), /链接|link/i);
    assert.deepEqual(await readdir(outside), []);
  });

  it("does not overwrite the source book with a generated card", async () => {
    const { prepareBookKnowledge, importBookKnowledge } = await import("../../dist/analyzers/book-knowledge-workflow.js");
    const { root } = await fixture();
    const bookPath = join(root, "characters.md");
    const text = "林岚是修灯师。";
    await writeFile(bookPath, text);
    const { document } = await prepareBookKnowledge(bookPath, join(root, "reading"));
    const analysisPath = join(root, "analysis.json");
    await writeFile(analysisPath, JSON.stringify(analysisFor(document)));
    await assert.rejects(() => importBookKnowledge(bookPath, analysisPath, { outputDir: root }), /源文件|source|输入/i);
    assert.equal(await readFile(bookPath, "utf8"), text);
  });

  it("rejects hard-linked book and analysis outputs before replacing any file", async () => {
    const { prepareBookKnowledge, importBookKnowledge } = await import("../../dist/analyzers/book-knowledge-workflow.js");
    for (const sourceKind of ["book", "analysis"]) {
      const { root, bookPath } = await fixture();
      const bookText = await readFile(bookPath, "utf8");
      const { document } = await prepareBookKnowledge(bookPath, join(root, "reading"));
      const analysisPath = join(root, "analysis.json");
      const analysisText = JSON.stringify(analysisFor(document));
      await writeFile(analysisPath, analysisText);
      const outputDir = join(root, "result"); await mkdir(outputDir);
      await writeFile(join(outputDir, "book-report.md"), "先前报告");
      const outputName = sourceKind === "book" ? "characters.md" : "book-assets.json";
      await link(sourceKind === "book" ? bookPath : analysisPath, join(outputDir, outputName));
      await assert.rejects(() => importBookKnowledge(bookPath, analysisPath, { outputDir }), /输入|源文件|hard.?link|硬链接/i);
      assert.equal(await readFile(bookPath, "utf8"), bookText);
      assert.equal(await readFile(analysisPath, "utf8"), analysisText);
      assert.equal(await readFile(join(outputDir, "book-report.md"), "utf8"), "先前报告");
      assert.deepEqual((await readdir(outputDir)).sort(), ["book-report.md", outputName].sort());
    }
  });

  it("keeps a parenthesized filename intact from reading preparation through import", async () => {
    const { prepareBookKnowledge, importBookKnowledge } = await import("../../dist/analyzers/book-knowledge-workflow.js");
    const { root } = await fixture();
    const bookPath = join(root, "(修订版)雾港 (作者).md");
    await writeFile(bookPath, "林岚是修灯师。\n");
    const { document } = await prepareBookKnowledge(bookPath, join(root, "reading"));
    assert.equal(document.title, "(修订版)雾港 (作者)");
    const analysisPath = join(root, "analysis.json");
    await writeFile(analysisPath, JSON.stringify(analysisFor(document)));
    const { asset } = await importBookKnowledge(bookPath, analysisPath, { outputDir: join(root, "result") });
    assert.equal(asset.title, "(修订版)雾港 (作者)");
  });
});
