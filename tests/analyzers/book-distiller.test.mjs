import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

import { analyzeBookText, distillBook } from "../../dist/analyzers/book-distiller.js";

const roots = [];
const originalLibraryRoot = process.env.VIBE_FOUNDRY_LIBRARY_ROOT;

describe("analyzeBookText", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    if (originalLibraryRoot === undefined) {
      delete process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
    } else {
      process.env.VIBE_FOUNDRY_LIBRARY_ROOT = originalLibraryRoot;
    }
  });

  it("extracts chapters, concept clusters, relations, and source locations", () => {
    const result = analyzeBookText(`
第一章 形式系统
形式系统包含符号、规则和系统内外的区别。解释赋予符号意义。
第二章 递归与自指
递归结构产生自指，自指形成怪圈和层次之间的反馈。
第三章 意义
意义依赖消息、编码、解释器和接收者。
`, { title: "测试书" });

    assert.equal(result.title, "测试书");
    assert.equal(result.chapters.length, 3);
    assert.ok(result.concepts.some((concept) => concept.id === "formal-systems"));
    assert.ok(result.concepts.some((concept) => concept.id === "recursion"));
    assert.ok(result.concepts.some((concept) => concept.id === "self-reference"));
    assert.ok(result.relations.some((relation) => relation.concepts.includes("recursion") && relation.concepts.includes("self-reference")));
    assert.ok(result.concepts.every((concept) => concept.sources.every((source) => source.line > 0)));
    assert.match(result.copyrightNotes, /不保存书籍全文/);
  });

  it("ignores table-of-contents entries and repeated chapter references", () => {
    const result = analyzeBookText(`目录
第一章 形式系统 ·················· 12
第一章：形式系统 本章介绍符号、公理和推理规则，并说明后续各章的组织方式。
\f第一章    形式系统
正文中的形式系统和符号。
第二章 递归 ···················· 38
\f第二章    递归
正文中的递归。
附录再次提到：
第一章    形式系统①
`);

    assert.deepEqual(result.chapters.map((chapter) => chapter.title), [
      "第一章 形式系统",
      "第二章 递归",
    ]);
    assert.ok(result.chapters[0].endLine - result.chapters[0].startLine >= 2);
  });

  it("accepts OCR compatibility characters in Chinese chapter numbers", () => {
    const result = analyzeBookText("\f第⼀章 形式系统\n正文\n\f第⼗⼆章 心智和思维\n正文");

    assert.equal(result.chapters.length, 2);
  });

  it("writes books below the shared environment library root", async () => {
    const source = await readFile("src/analyzers/book-distiller.ts", "utf8");
    assert.doesNotMatch(source, /D:\\\\VibeFoundry/);
    const inputRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-book-source-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-book-library-"));
    roots.push(inputRoot, libraryRoot);
    const bookPath = join(inputRoot, "测试书.md");
    await writeFile(bookPath, "第一章 形式系统\n形式系统包含符号和规则。\n");
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = libraryRoot;

    const result = await distillBook(bookPath);

    assert.equal(result.asset.sourcePath, resolve(bookPath));
    assert.equal(result.outputDir.startsWith(join(resolve(libraryRoot), "books")), true);
    assert.equal(
      JSON.parse(await readFile(join(result.outputDir, "book-assets.json"), "utf8")).sourcePath,
      resolve(bookPath),
    );
    assert.match(await readFile(join(result.outputDir, "book-report.md"), "utf8"), /测试书/);
  });

  it("keeps outputDir as the exact final book directory override", async () => {
    const inputRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-book-source-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-book-library-"));
    const outputDir = join(inputRoot, "exact-book-output");
    roots.push(inputRoot, libraryRoot);
    const bookPath = join(inputRoot, "book.md");
    await writeFile(bookPath, "Chapter 1 Meaning\nMeaning depends on interpretation.\n");
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = libraryRoot;

    const result = await distillBook(bookPath, { outputDir });

    assert.equal(result.outputDir, resolve(outputDir));
  });
});
