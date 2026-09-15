import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bookOutputDirectoryFor } from "../dist/analyzers/book-distiller.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output" || !args[1].trim() || args[1].startsWith("--"))) {
  throw new Error("Usage: node scripts/verify-book-knowledge.mjs [--output <directory>]");
}
const keepOutput = args.length === 2;
const outputParent = keepOutput ? resolve(args[1]) : tmpdir();
if (keepOutput) await mkdir(outputParent, { recursive: true });
const temporaryPrefix = "vibe-foundry-book-verification-";
const root = await mkdtemp(join(outputParent, temporaryPrefix));
const libraryRoot = join(root, "library");
const environment = { ...process.env, VIBE_FOUNDRY_LIBRARY_ROOT: libraryRoot };
const bookPath = join(repositoryRoot, "examples", "fixture-book", "雾港.md");
const analysisPath = join(repositoryRoot, "examples", "fixture-book", "analysis.json");

function run(arguments_, expectedStatus = 0) {
  const result = spawnSync(process.execPath, ["dist/cli.js", ...arguments_], {
    cwd: repositoryRoot, env: environment, encoding: "utf8", timeout: 120000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

try {
  const workDir = join(root, "reading");
  const prepared = run(["distill-book", bookPath, "--prepare", workDir]);
  assert.match(prepared.stdout, /语义分析尚未完成/);
  const document = JSON.parse(await readFile(join(workDir, "document.json"), "utf8"));
  const analysis = JSON.parse(await readFile(analysisPath, "utf8"));
  assert.equal(document.sourceDigest, analysis.sourceDigest, "fixture changed: review its expected analysis");
  run(["distill-book", bookPath, "--analysis", analysisPath]);
  const assetDir = bookOutputDirectoryFor(bookPath, { assetLibraryRoot: libraryRoot });
  const assetText = await readFile(join(assetDir, "book-assets.json"), "utf8");
  const asset = JSON.parse(assetText);
  assert.equal(asset.schemaVersion, "0.2.0");
  assert.equal(asset.kind, "book-knowledge");
  assert.deepEqual(new Set(asset.entities.map((entity) => entity.type)), new Set(["worldview", "character", "setting", "concept", "metaphor"]));
  assert.deepEqual(asset.entities.filter((entity) => entity.name === "顾舟").map((entity) => entity.id).sort(), ["character-gu-merchant", "character-gu-watchman"]);
  assert.deepEqual(asset.entities.find((entity) => entity.name === "林岚").aliases, ["阿岚"]);
  assert.equal(asset.entities.find((entity) => entity.type === "metaphor").facets.every((facet) => facet.basis === "interpretation"), true);
  const text = (await readFile(bookPath, "utf8")).replace(/\r\n?/g, "\n");
  const evidence = [...asset.entities.flatMap((entity) => entity.facets.flatMap((facet) => facet.evidence)), ...asset.relations.flatMap((relation) => relation.evidence), ...asset.uncertainties.flatMap((item) => item.evidence)];
  for (const source of evidence) assert.equal(text.slice(source.startOffset, source.endOffset), source.quote);
  assert.deepEqual(JSON.parse(await readFile(join(assetDir, "knowledge-network.json"), "utf8")), asset);
  for (const filename of ["book-report.md", "worldview.md", "characters.md", "settings.md", "concepts-and-metaphors.md", "knowledge-network.html"]) {
    assert.ok((await readFile(join(assetDir, filename), "utf8")).length > 0, filename);
  }
  const downgraded = run(["distill-book", bookPath], 1);
  assert.match(downgraded.stderr, /知识资产/);
  assert.equal(await readFile(join(assetDir, "book-assets.json"), "utf8"), assetText);
  const invalidPath = join(root, "invalid-analysis.json");
  await writeFile(invalidPath, JSON.stringify({ ...analysis, sourceDigest: "0".repeat(64) }));
  run(["distill-book", bookPath, "--analysis", invalidPath], 1);
  assert.equal(await readFile(join(assetDir, "book-assets.json"), "utf8"), assetText);
  const result = {
    verification: "passed", fixture: "原创短篇及预先阅读分析；不衡量模型抽取准确率",
    entities: asset.entities.length, relations: asset.relations.length, checkedEvidence: evidence.length,
    sourceDigest: asset.sourceDigest, assetDir, graph: join(assetDir, "knowledge-network.html"),
  };
  if (keepOutput) await writeFile(join(root, "verification.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (!keepOutput) {
    const resolvedRoot = resolve(root);
    if (dirname(resolvedRoot) !== resolve(outputParent) || !basename(resolvedRoot).startsWith(temporaryPrefix)) throw new Error("Refusing cleanup outside this verification's temporary directory.");
    await rm(resolvedRoot, { recursive: true, force: true });
  }
}
