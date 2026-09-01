import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { resolveAssetLibraryRoot } from "../library/asset-library.js";

const execFileAsync = promisify(execFile);

const conceptDefinitions = [
  { id: "formal-systems", name: "形式系统", terms: ["形式系统", "符号", "公理", "推理规则"] },
  { id: "figure-ground", name: "图形与衬底", terms: ["图形与衬底", "图形", "衬底"] },
  { id: "recursion", name: "递归", terms: ["递归", "嵌套", "叠套"] },
  { id: "meaning", name: "意义与解释", terms: ["意义", "解释器", "编码", "解码"] },
  { id: "self-reference", name: "自指", terms: ["自指", "自我指涉", "自复制"] },
  { id: "strange-loops", name: "怪圈与层次", terms: ["怪圈", "缠结的层次", "层次结构"] },
  { id: "isomorphism", name: "同构", terms: ["同构", "映射"] },
  { id: "incompleteness", name: "不完全性", terms: ["不完全性", "不可判定", "哥德尔"] },
  { id: "intelligence", name: "智能", terms: ["智能", "意识", "心智"] },
];

function chapterHeading(line) {
  const text = line.replace(/\f/g, "").trim();
  if (/[·.…]{3,}.*\d+\s*$/.test(text) || (/[：:]/.test(text) && text.length > 32)) {
    return "";
  }
  if (!/^(?:第[^\s：:章]{1,6}章(?:\s|：|:)|Chapter\s+\d+\b)/i.test(text)) {
    return "";
  }
  return text.replace(/[：:]/, " ").replace(/\s+/g, " ");
}

export function analyzeBookText(text, metadata = {}) {
  const lines = String(text).split(/\r?\n/);
  const seenHeadings = new Set();
  const headings = lines
    .map((line, index) => ({ title: chapterHeading(line), line: index + 1 }))
    .filter((item) => {
      const key = item.title.match(/^(?:第[^\s：:章]{1,6}章|Chapter\s+\d+\b)/i)?.[0].toLowerCase();
      if (!key || seenHeadings.has(key)) {
        return false;
      }
      seenHeadings.add(key);
      return true;
    });
  const chapters = headings.map((heading, index) => ({
    id: `chapter-${index + 1}`,
    title: heading.title,
    startLine: heading.line,
    endLine: (headings[index + 1]?.line ?? lines.length + 1) - 1,
  }));
  const concepts = conceptDefinitions.flatMap((definition) => {
    const sources = [];
    lines.forEach((line, index) => {
      if (definition.terms.some((term) => line.includes(term))) {
        sources.push({ line: index + 1, chapterId: chapters.findLast((chapter) => chapter.startLine <= index + 1)?.id ?? "front-matter" });
      }
    });
    return sources.length > 0 ? [{ ...definition, mentions: sources.length, sources: sources.slice(0, 24) }] : [];
  });
  const relations = [];
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      const sharedChapters = [...new Set(concepts[left].sources.map((source) => source.chapterId))]
        .filter((chapterId) => concepts[right].sources.some((source) => source.chapterId === chapterId));
      if (sharedChapters.length > 0) {
        relations.push({ concepts: [concepts[left].id, concepts[right].id], sharedChapters });
      }
    }
  }
  return {
    schemaVersion: "0.1.0",
    title: metadata.title ?? "Untitled book",
    author: metadata.author ?? "",
    sourcePath: metadata.sourcePath ?? "",
    chapters,
    concepts,
    relations,
    copyrightNotes: "只保存章节定位、概念统计和关系；不保存书籍全文、长段原文或插图。",
  };
}

async function extractBookText(bookPath) {
  const extension = extname(bookPath).toLowerCase();
  if ([".txt", ".md", ".markdown"].includes(extension)) {
    return readFile(bookPath, "utf8");
  }
  if (extension === ".pdf") {
    try {
      const { stdout } = await execFileAsync("pdftotext", ["-layout", bookPath, "-"], { maxBuffer: 128 * 1024 * 1024 });
      return stdout;
    } catch (error) {
      throw new Error(`PDF text extraction failed. Install Poppler pdftotext first: ${error.message}`);
    }
  }
  throw new Error(`Unsupported book format: ${extension || "unknown"}`);
}

function reportFor(asset) {
  return `# ${asset.title}\n\n- Chapters: ${asset.chapters.length}\n- Concepts: ${asset.concepts.length}\n- Relations: ${asset.relations.length}\n\n## Concepts\n\n${asset.concepts.map((concept) => `- ${concept.name}: ${concept.mentions} mentions`).join("\n")}\n\n## Copyright\n\n${asset.copyrightNotes}\n`;
}

export async function distillBook(bookPath, options = {}) {
  const resolvedPath = resolve(bookPath);
  const text = await extractBookText(resolvedPath);
  const title = basename(resolvedPath, extname(resolvedPath)).replace(/\s*\([^)]*\).*$/, "");
  const asset = analyzeBookText(text, { title, sourcePath: resolvedPath });
  const id = `${title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "book"}-${createHash("sha256").update(resolvedPath).digest("hex").slice(0, 10)}`;
  const outputDir = resolve(
    options.outputDir
      ?? join(resolveAssetLibraryRoot(options.assetLibraryRoot), "books", id),
  );
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "book-assets.json"), `${JSON.stringify(asset, null, 2)}\n`);
  await writeFile(join(outputDir, "book-report.md"), reportFor(asset));
  return { outputDir, asset };
}
