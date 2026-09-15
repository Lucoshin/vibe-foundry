import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { createBookDocument } from "../../dist/analyzers/book-document.js";

describe("createBookDocument", () => {
  it("normalizes line endings and preserves exact UTF-16 source positions", () => {
    const original = "第一章 雨城\r\n\r\n  阿青😀 \r她守着城门。\n";
    const normalized = "第一章 雨城\n\n  阿青😀 \n她守着城门。\n";
    const document = createBookDocument(original, { title: "雨城", sourcePath: "雨城.txt" });

    assert.deepEqual(document, {
      schemaVersion: "0.1.0",
      title: "雨城",
      sourcePath: "雨城.txt",
      sourceDigest: createHash("sha256").update(normalized).digest("hex"),
      offsetUnit: "utf16",
      characterCount: 23,
      units: [
        { id: "unit-1", text: "第一章 雨城", startOffset: 0, endOffset: 6, startLine: 1, endLine: 1 },
        { id: "unit-2", text: "  阿青😀 ", startOffset: 8, endOffset: 15, startLine: 3, endLine: 3 },
        { id: "unit-3", text: "她守着城门。", startOffset: 16, endOffset: 22, startLine: 4, endLine: 4 },
      ],
      chunks: [{ id: "chunk-1", unitIds: ["unit-1", "unit-2", "unit-3"], characterCount: 19 }],
    });
    for (const unit of document.units) {
      assert.equal(normalized.slice(unit.startOffset, unit.endOffset), unit.text);
    }
  });

  it("rejects missing or whitespace-only text instead of creating an empty reading task", () => {
    for (const text of ["", "\r\n\t \f\n", "　 \n"]) {
      assert.throws(() => createBookDocument(text), /正文.*为空/);
    }
    for (const text of [undefined, null, {}, 0]) {
      assert.throws(() => createBookDocument(text), /正文.*字符串/);
    }
  });

  it("uses the agreed metadata defaults without adding chapter or page guesses", () => {
    const document = createBookDocument("第一章\n第 32 页\n正文");
    assert.equal(document.title, "Untitled book");
    assert.equal(document.sourcePath, "");
    assert.deepEqual(Object.keys(document), ["schemaVersion", "title", "sourcePath", "sourceDigest", "offsetUnit", "characterCount", "units", "chunks"]);
    assert.equal(createBookDocument("正文", { title: "" }).title, "");
  });

  it("hashes normalized text independently from metadata and preserves other Unicode content", () => {
    const first = createBookDocument("Ａ e\u0301\r\n尾行", { title: "甲", sourcePath: "a.txt" });
    const second = createBookDocument("Ａ e\u0301\n尾行", { title: "乙", sourcePath: "b.txt" });
    assert.equal(first.sourceDigest, second.sourceDigest);
    assert.deepEqual(first.units, second.units);
    assert.equal(first.units[0].text, "Ａ e\u0301");
    assert.notEqual(first.sourceDigest, createBookDocument("Ａ é\n尾行").sourceDigest);
    assert.notEqual(first.sourceDigest, createBookDocument("Ａ e\u0301\n\n尾行").sourceDigest);
    assert.notEqual(first.sourceDigest, createBookDocument("Ａ e\u0301\n尾行。").sourceDigest);
  });

  it("keeps whitespace-only lines out of units without moving later source positions", () => {
    const document = createBookDocument("\n  \n\t\n  名字  \n\n");
    assert.deepEqual(document.units, [
      { id: "unit-1", text: "  名字  ", startOffset: 6, endOffset: 12, startLine: 4, endLine: 4 },
    ]);
    assert.equal(document.characterCount, 14);
    assert.equal(document.chunks[0].characterCount, 6);
  });

  it("splits long lines at 2000 code units without separating a surrogate pair", () => {
    const text = `${"甲".repeat(1999)}😀${"乙".repeat(2001)}`;
    const document = createBookDocument(text);
    assert.deepEqual(document.units.map((unit) => unit.text.length), [1999, 2000, 3]);
    assert.equal(document.units.map((unit) => unit.text).join(""), text);
    assert.equal(document.characterCount, 4002);
    for (const unit of document.units) {
      assert.equal(unit.text.isWellFormed(), true);
      assert.equal(text.slice(unit.startOffset, unit.endOffset), unit.text);
      assert.equal(unit.startLine, 1);
      assert.equal(unit.endLine, 1);
    }
  });

  it("fills a 12000-character chunk exactly and puts the remaining units in the next chunk", () => {
    const text = [...Array(6).fill("甲".repeat(2000)), "尾😀"].join("\n");
    const document = createBookDocument(text);
    assert.deepEqual(document.chunks, [
      { id: "chunk-1", unitIds: ["unit-1", "unit-2", "unit-3", "unit-4", "unit-5", "unit-6"], characterCount: 12000 },
      { id: "chunk-2", unitIds: ["unit-7"], characterCount: 3 },
    ]);
    assert.equal(document.characterCount, 12009);
    assert.deepEqual(document.chunks.flatMap((chunk) => chunk.unitIds), document.units.map((unit) => unit.id));
  });

  it("covers a long unbroken line once with ordered units and bounded chunks", () => {
    const text = "字".repeat(25001);
    const document = createBookDocument(text);
    assert.deepEqual(document.chunks.map((chunk) => chunk.characterCount), [12000, 12000, 1001]);
    assert.deepEqual(document.chunks.flatMap((chunk) => chunk.unitIds), document.units.map((unit) => unit.id));
    assert.equal(document.units.map((unit) => unit.text).join(""), text);
    assert.deepEqual(document, createBookDocument(text));
    assert.deepEqual(document.units.map((unit) => unit.id), Array.from({ length: 13 }, (_, index) => `unit-${index + 1}`));
  });
});
