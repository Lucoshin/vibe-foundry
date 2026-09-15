import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, link, symlink } from "node:fs/promises";
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

  it("recognizes Markdown ATX chapters without changing source line numbers", () => {
    const result = analyzeBookText([
      "# 测试书",
      "",
      "# 第一章 形式系统",
      "形式系统包含符号。",
      "",
      "## 第二章 递归 ##",
      "递归形成嵌套结构。",
      "###### Chapter 3 Meaning ###",
      "意义需要解释器。",
    ].join("\n"));

    assert.deepEqual(result.chapters, [
      { id: "chapter-1", title: "第一章 形式系统", startLine: 3, endLine: 5 },
      { id: "chapter-2", title: "第二章 递归", startLine: 6, endLine: 7 },
      { id: "chapter-3", title: "Chapter 3 Meaning", startLine: 8, endLine: 9 },
    ]);
    assert.deepEqual(result.concepts.find((concept) => concept.id === "meaning").sources, [
      { line: 9, chapterId: "chapter-3" },
    ]);
  });

  it("calculates later chapter relations from all mentions while limiting exported sources", () => {
    const result = analyzeBookText([
      "第一章 起始篇",
      ...Array(30).fill("递归产生嵌套结构。"),
      "第二章 中间篇",
      ...Array(30).fill("自指指向自身。"),
      "第三章 综合篇",
      "递归与自指出现在同一章节。",
    ].join("\n"));

    assert.deepEqual(result.relations, [
      { concepts: ["recursion", "self-reference"], sharedChapters: ["chapter-3"] },
    ]);
    for (const concept of result.concepts) {
      assert.equal(concept.mentions, 31);
      assert.equal(concept.sources.length, 24);
      assert.ok(concept.sources.every((source) => source.chapterId !== "chapter-3"));
    }
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

  it("does not downgrade knowledge assets and leave stale semantic cards behind", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-book-mode-"));
    roots.push(root);
    const bookPath = join(root, "book.md");
    await writeFile(bookPath, "第一章 形式系统\n形式系统。\n");
    const previous = JSON.stringify({ schemaVersion: "0.2.0", kind: "book-knowledge" });
    await writeFile(join(root, "book-assets.json"), previous);
    await writeFile(join(root, "characters.md"), "既有人物卡");
    await assert.rejects(() => distillBook(bookPath, { outputDir: root }), /知识资产|语义/);
    assert.equal(await readFile(join(root, "book-assets.json"), "utf8"), previous);
    assert.equal(await readFile(join(root, "characters.md"), "utf8"), "既有人物卡");
  });

  it("rejects a source book that would be overwritten by the legacy report", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-book-source-collision-")); roots.push(root);
    const bookPath = join(root, "book-report.md"); const text = "第一章 形式系统\n形式系统包含符号。\n";
    await writeFile(bookPath, text);
    await assert.rejects(() => distillBook(bookPath, { outputDir: root }), /输入|源文件/i);
    assert.equal(await readFile(bookPath, "utf8"), text);
    assert.deepEqual(await readdir(root), ["book-report.md"]);
  });

  it("checks both legacy output files for source hard links before writing", async () => {
    for (const outputName of ["book-assets.json", "book-report.md"]) {
      const root = await mkdtemp(join(tmpdir(), "vibe-book-source-hardlink-")); roots.push(root);
      const bookPath = join(root, "book.md"); const text = "第一章 形式系统\n形式系统包含符号。\n";
      await writeFile(bookPath, text);
      const outputDir = join(root, "result"); await mkdir(outputDir);
      await link(bookPath, join(outputDir, outputName));
      const otherName = outputName === "book-assets.json" ? "book-report.md" : "book-assets.json";
      const previous = outputName === "book-assets.json" ? "先前报告" : JSON.stringify({ schemaVersion: "0.1.0" });
      await writeFile(join(outputDir, otherName), previous);
      await assert.rejects(() => distillBook(bookPath, { outputDir }), /输入|源文件|hard.?link|硬链接/i);
      assert.equal(await readFile(bookPath, "utf8"), text);
      assert.equal(await readFile(join(outputDir, otherName), "utf8"), previous);
    }
  });

  it("rejects linked legacy output directories without touching their targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-book-output-link-")); roots.push(root);
    const bookPath = join(root, "book.md"); await writeFile(bookPath, "第一章 形式系统\n形式系统。\n");
    const outside = join(root, "outside"); await mkdir(outside);
    const outputDir = join(root, "linked-output"); await symlink(outside, outputDir, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(() => distillBook(bookPath, { outputDir }), /链接|link/i);
    assert.deepEqual(await readdir(outside), []);
  });
});
