import { createHash } from "node:crypto";

const unitCharacterLimit = 2000;
const chunkCharacterLimit = 12000;

export function createBookDocument(text, metadata = {}) {
  if (typeof text !== "string") throw new TypeError("书籍正文必须为字符串。");
  const normalizedText = text.replace(/\r\n?/g, "\n");
  if (!normalizedText.trim()) throw new Error("书籍正文为空，无法准备阅读任务。");

  const units = [];
  const chunks = [];
  let lineOffset = 0;
  for (const [lineIndex, line] of normalizedText.split("\n").entries()) {
    if (line.trim()) {
      for (let start = 0; start < line.length;) {
        let end = Math.min(start + unitCharacterLimit, line.length);
        const previous = line.charCodeAt(end - 1);
        const next = line.charCodeAt(end);
        if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end -= 1;

        const unit = {
          id: `unit-${units.length + 1}`,
          text: line.slice(start, end),
          startOffset: lineOffset + start,
          endOffset: lineOffset + end,
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
        };
        units.push(unit);
        let chunk = chunks.at(-1);
        if (!chunk || chunk.characterCount + unit.text.length > chunkCharacterLimit) {
          chunk = { id: `chunk-${chunks.length + 1}`, unitIds: [], characterCount: 0 };
          chunks.push(chunk);
        }
        chunk.unitIds.push(unit.id);
        chunk.characterCount += unit.text.length;
        start = end;
      }
    }
    lineOffset += line.length + 1;
  }

  return {
    schemaVersion: "0.1.0",
    title: metadata.title ?? "Untitled book",
    sourcePath: metadata.sourcePath ?? "",
    sourceDigest: createHash("sha256").update(normalizedText).digest("hex"),
    offsetUnit: "utf16",
    characterCount: normalizedText.length,
    units,
    chunks,
  };
}
