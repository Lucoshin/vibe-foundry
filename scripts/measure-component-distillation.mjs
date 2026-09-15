import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { distillProject } from "../dist/index.js";
import { readComponentPrompt } from "../dist/library/component-prompts.js";

const componentCount = 20;
const temporaryPrefix = "vibe-foundry-component-benchmark-";

function parseOutput(argv) {
  if (argv.length === 0) return null;
  if (argv.length === 2 && argv[0] === "--output" && argv[1].trim() && !argv[1].startsWith("--")) {
    return resolve(argv[1]);
  }
  throw new Error("Usage: node scripts/measure-component-distillation.mjs [--output <directory>]");
}

function componentName(index) {
  return `Component${String(index).padStart(2, "0")}`;
}

function componentSource(framework, name, index) {
  if (framework === "react") {
    return [
      'import "../shared.css";',
      `export function ${name}({ label }) {`,
      '  return <button type="button" className="benchmark-button">',
      '    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10" /></svg>',
      `    <span>{label}</span><small>原始证据 ${index}</small>`,
      '  </button>;',
      '}',
      '',
    ].join("\n");
  }
  return [
    '<script setup>',
    'import "../shared.css";',
    'defineProps({ label: String });',
    '</script>',
    '<template>',
    '  <button type="button" class="benchmark-button">',
    '    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10" /></svg>',
    `    <span>{{ label }}</span><small>原始证据 ${index}</small>`,
    '  </button>',
    '</template>',
    '',
  ].join("\n");
}

function pageSource(framework, name, index, extension) {
  if (framework === "react") {
    return [
      `import { ${name} } from "../components/${name}.${extension}";`,
      `export default function Page${index}() {`,
      `  return <main><${name} label="按钮 ${index}" /></main>;`,
      '}',
      '',
    ].join("\n");
  }
  return [
    '<script setup>',
    `import ${name} from "../components/${name}.${extension}";`,
    '</script>',
    `<template><main><${name} label="按钮 ${index}" /></main></template>`,
    '',
  ].join("\n");
}

async function createProject(temporaryRoot, framework) {
  const projectRoot = join(temporaryRoot, framework);
  const extension = framework === "react" ? "tsx" : "vue";
  await mkdir(join(projectRoot, "src", "components"), { recursive: true });
  await mkdir(join(projectRoot, "src", "pages"), { recursive: true });
  await writeFile(join(projectRoot, "package.json"), JSON.stringify({
    name: `component-benchmark-${framework}`,
    type: "module",
    dependencies: framework === "react" ? { react: "19.0.0" } : { vue: "3.5.0" },
  }, null, 2));
  await writeFile(join(projectRoot, "src", "shared.css"), [
    ':root { --benchmark-ink: #243746; --benchmark-paper: #f4f0e8; }',
    '.benchmark-button { display: inline-flex; align-items: center; gap: 12px; padding: 10px 16px; border: 1px solid currentColor; border-radius: 8px; color: var(--benchmark-ink); background: var(--benchmark-paper); transition: transform 220ms ease-out, background-color 220ms ease-out; }',
    '.benchmark-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; }',
    '.benchmark-button:hover { background: white; transform: translateY(-4px); }',
    '.benchmark-button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }',
    '',
  ].join("\n"));
  for (let index = 1; index <= componentCount; index += 1) {
    const name = componentName(index);
    await writeFile(join(projectRoot, "src", "components", `${name}.${extension}`), componentSource(framework, name, index));
    await writeFile(join(projectRoot, "src", "pages", `Page${index}.${extension}`), pageSource(framework, name, index, extension));
  }
  return { projectRoot, targetPath: `src/components/Component01.${extension}`, controlPath: `src/components/Component02.${extension}` };
}

async function measureFramework(temporaryRoot, framework) {
  const fixture = await createProject(temporaryRoot, framework);
  const assetLibraryRoot = join(temporaryRoot, "library");
  const runs = [];
  async function measure(stage, expectedAnalysis) {
    const started = performance.now();
    const result = await distillProject(fixture.projectRoot, { assetLibraryRoot });
    const durationMs = Number((performance.now() - started).toFixed(3));
    assert.deepEqual(result.analysis, expectedAnalysis, `${framework} ${stage} source-index counts`);
    const prompt = await readComponentPrompt(result.outputDir, fixture.targetPath);
    const control = await readComponentPrompt(result.outputDir, fixture.controlPath);
    const catalog = JSON.parse(await readFile(join(result.outputDir, "component-catalog.json"), "utf8"));
    assert.equal(catalog.components.length, componentCount);
    runs.push({ stage, durationMs, analysis: result.analysis, sourceDigest: prompt.sourceDigest });
    return { prompt, control };
  }
  const files = componentCount * 2;
  const cold = await measure("cold", { files, parsed: files, reused: 0 });
  assert.ok(cold.prompt.sourceFiles.includes("src/shared.css"));
  assert.ok(cold.prompt.sourceFiles.some((path) => path.startsWith("src/pages/")));
  assert.match(cold.prompt.prompt, /原始证据 1/);
  assert.match(cold.prompt.prompt, /#243746/);
  assert.match(cold.prompt.prompt, /220ms/);
  assert.match(cold.prompt.prompt, /悬停/);
  assert.match(cold.prompt.prompt, /上移 4px/);
  assert.equal(cold.prompt.schemaVersion, "0.2.0");
  assert.doesNotMatch(cold.prompt.prompt, /export function|import |```|<button/);
  const warm = await measure("warm", { files, parsed: 0, reused: files });
  assert.equal(warm.prompt.sourceDigest, cold.prompt.sourceDigest, `${framework} unchanged prompt must be stable`);
  const componentPath = join(fixture.projectRoot, fixture.targetPath);
  const source = await readFile(componentPath, "utf8");
  assert.ok(source.includes("原始证据 1"));
  await writeFile(componentPath, source.replace("原始证据 1", "更新证据 1"));
  const changed = await measure("one-component-changed", { files, parsed: 1, reused: files - 1 });
  assert.notEqual(changed.prompt.sourceDigest, warm.prompt.sourceDigest, `${framework} edited component prompt must change`);
  assert.match(changed.prompt.prompt, /更新证据 1/);
  assert.equal(changed.control.sourceDigest, warm.control.sourceDigest, `${framework} unrelated component prompt must remain stable`);
  return {
    result: {
      framework,
      components: componentCount,
      usagePages: componentCount,
      runs,
      totalDistillMs: Number(runs.reduce((sum, run) => sum + run.durationMs, 0).toFixed(3)),
      checks: { unchangedPromptStable: true, editedPromptChanged: true, unrelatedPromptStable: true },
    },
    samplePrompt: changed.prompt.prompt,
  };
}

const outputDir = parseOutput(process.argv.slice(2));
const temporaryRoot = await mkdtemp(join(tmpdir(), temporaryPrefix));
const started = performance.now();
try {
  const measurements = [];
  for (const framework of ["react", "vue"]) measurements.push(await measureFramework(temporaryRoot, framework));
  const result = {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    measuredAt: new Date().toISOString(),
    elapsedMs: Number((performance.now() - started).toFixed(3)),
    metricScope: "analysis counts source-index parsing only; durationMs measures each complete distillProject call without preview builds",
    frameworks: measurements.map((measurement) => measurement.result),
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "component-distillation-benchmark.json"), json);
    await writeFile(join(outputDir, "component-effect-prompt.md"), `${measurements[0].samplePrompt}\n`);
  }
  process.stdout.write(json);
} finally {
  const cleanupRoot = resolve(temporaryRoot);
  if (dirname(cleanupRoot) !== resolve(tmpdir()) || !basename(cleanupRoot).startsWith(temporaryPrefix)) {
    throw new Error("Refusing to clean a directory outside this benchmark's temporary workspace.");
  }
  await rm(cleanupRoot, { recursive: true, force: true });
}
