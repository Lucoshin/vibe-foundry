import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { buildFrontendSourceIndex } from "../../dist/analyzers/frontend-source-index.js";

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createProject(files) {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-source-index-"));
  roots.push(root);
  await Promise.all(Object.entries(files).map(async ([filePath, source]) => {
    const outputPath = join(root, filePath);
    await mkdir(join(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, source);
  }));
  return root;
}

describe("buildFrontendSourceIndex", () => {
  it("indexes JSX imports, exports, component calls, and source locations", async () => {
    const root = await createProject({
      "src/components/Panel.tsx": `export default function Panel({ title }) { return <section>{title}</section>; }`,
      "src/pages/Home.tsx": `
        import HomePanel from "../components/Panel";
        export function Home() {
          return <HomePanel title="首页" count={3} visible={isVisible}>正文</HomePanel>;
        }
      `,
    });

    const index = await buildFrontendSourceIndex(root, ["src"]);
    const home = index.files.find((file) => file.filePath === "src/pages/Home.tsx");

    assert.deepEqual(home.imports[0], {
      localName: "HomePanel",
      importedName: "default",
      source: "../components/Panel",
      resolvedFilePath: "src/components/Panel.tsx",
    });
    assert.equal(home.componentCalls[0].localName, "HomePanel");
    assert.equal(home.componentCalls[0].sourceLocation.line, 4);
  });

  it("indexes Vue SFC imports and template component calls without parsing event text as props", async () => {
    const root = await createProject({
      "src/components/BasicButton/index.vue": `<template><button><slot /></button></template>`,
      "src/pages/about.vue": `
        <script setup lang="ts">
        import BasicButton from "../components/BasicButton/index.vue";
        </script>
        <template>
          <BasicButton @click="jump('/pages/log/index?id=1&title=log')">登录</BasicButton>
        </template>
      `,
    });

    const index = await buildFrontendSourceIndex(root, ["src"]);
    const page = index.files.find((file) => file.filePath === "src/pages/about.vue");

    assert.equal(page.imports[0].resolvedFilePath, "src/components/BasicButton/index.vue");
    assert.equal(page.componentCalls[0].localName, "BasicButton");
    assert.deepEqual(page.componentCalls[0].attributes, []);
    assert.deepEqual(page.componentCalls[0].events, ["click"]);
    assert.equal(page.componentCalls[0].slots.default, "登录");
  });

  it("accepts non-self-closing platform void elements in Vue templates", async () => {
    const root = await createProject({
      "src/components/FormField.vue": `<template><view><input v-model="value"><image src="/avatar.png"></view></template>`,
    });

    const index = await buildFrontendSourceIndex(root, ["src"]);

    assert.equal(index.files[0].filePath, "src/components/FormField.vue");
  });

  it("shares source text and records side-effect imports and re-export dependencies", async () => {
    const sourceText = `import './theme.css';
import Panel from './Panel';
export { label } from './labels';
export * from './labels';
export default () => <Panel />;`;
    const root = await createProject({
      "src/Widget.tsx": sourceText,
      "src/Panel.tsx": "export default () => <section />;",
      "src/labels.ts": "export const label = '保存';",
      "src/theme.css": ".panel { color: red; }",
    });

    const index = await buildFrontendSourceIndex(root, ["src"]);
    const widget = index.files.find((file) => file.filePath === "src/Widget.tsx");

    assert.equal(widget.sourceText, sourceText);
    assert.deepEqual(widget.dependencies, [
      { source: "./theme.css", resolvedFilePath: "src/theme.css" },
      { source: "./Panel", resolvedFilePath: "src/Panel.tsx" },
      { source: "./labels", resolvedFilePath: "src/labels.ts" },
    ]);
    assert.deepEqual(widget.imports.map((item) => item.localName), ["Panel"]);
  });

  it("reuses content-addressed parse summaries and reparses only changed source", async () => {
    const root = await createProject({
      "src/Panel.tsx": "// source-only secret note\nexport default () => <section />;",
      "src/label.ts": "export const label = '保存';",
      "src/entry.tsx": "import Panel from './Panel'; export default () => <Panel />;",
    });
    const cacheDir = join(root, "analysis-cache");

    const cold = await buildFrontendSourceIndex(root, ["src"], { cacheDir });
    const warm = await buildFrontendSourceIndex(root, ["src"], { cacheDir });
    await writeFile(join(root, "src", "label.ts"), "export const label = '提交';");
    const changed = await buildFrontendSourceIndex(root, ["src"], { cacheDir });

    assert.deepEqual(cold.metrics, { files: 3, parsed: 3, reused: 0 });
    assert.deepEqual(warm.metrics, { files: 3, parsed: 0, reused: 3 });
    assert.deepEqual(changed.metrics, { files: 3, parsed: 1, reused: 2 });
    assert.deepEqual(warm.files, cold.files);
    for (const filename of await readdir(cacheDir)) {
      const content = await readFile(join(cacheDir, filename), "utf8");
      assert.doesNotMatch(content, /source-only secret note|sourceText|resolvedFilePath/);
      assert.equal(content.includes(root), false);
    }
  });

  it("resolves imports again on cache hits when dependency files are added or deleted", async () => {
    const root = await createProject({
      "src/App.tsx": "import Later from './Later'; export default () => <Later />;",
    });
    const cacheDir = join(root, "analysis-cache");
    const missing = await buildFrontendSourceIndex(root, ["src"], { cacheDir });
    await writeFile(join(root, "src", "Later.tsx"), "export default () => <section />;");
    const added = await buildFrontendSourceIndex(root, ["src"], { cacheDir });
    await rm(join(root, "src", "Later.tsx"));
    const removed = await buildFrontendSourceIndex(root, ["src"], { cacheDir });

    assert.equal(missing.files[0].imports[0].resolvedFilePath, "");
    assert.equal(added.files.find((file) => file.filePath === "src/App.tsx").imports[0].resolvedFilePath, "src/Later.tsx");
    assert.equal(removed.files[0].imports[0].resolvedFilePath, "");
    assert.deepEqual(removed.metrics, { files: 1, parsed: 0, reused: 1 });
  });

  it("shares identical parse summaries while resolving each importer separately", async () => {
    const sameSource = "import Item from './Item'; export default () => <Item />;";
    const root = await createProject({
      "src/a/Host.tsx": sameSource,
      "src/a/Item.tsx": "export default () => <section>A</section>;",
      "src/b/Host.tsx": sameSource,
      "src/b/Item.tsx": "export default () => <section>B</section>;",
    });

    const index = await buildFrontendSourceIndex(root, ["src"], { cacheDir: join(root, "analysis-cache") });

    assert.deepEqual(index.metrics, { files: 4, parsed: 3, reused: 1 });
    assert.equal(index.files.find((file) => file.filePath === "src/a/Host.tsx").imports[0].resolvedFilePath, "src/a/Item.tsx");
    assert.equal(index.files.find((file) => file.filePath === "src/b/Host.tsx").imports[0].resolvedFilePath, "src/b/Item.tsx");
  });

  it("reports corrupt parse caches instead of silently reparsing", async () => {
    const root = await createProject({ "src/item.ts": "export const item = 1;" });
    const cacheDir = join(root, "analysis-cache");
    await buildFrontendSourceIndex(root, ["src"], { cacheDir });
    const [filename] = await readdir(cacheDir);
    await writeFile(join(cacheDir, filename), "broken cache");

    await assert.rejects(() => buildFrontendSourceIndex(root, ["src"], { cacheDir }), /cache|JSON/i);
  });

  it("indexes overlapping source directories only once", async () => {
    const root = await createProject({ "src/components/Panel.tsx": "export default () => <section />;" });

    const index = await buildFrontendSourceIndex(root, ["src", "src/components"]);

    assert.equal(index.files.length, 1);
    assert.deepEqual(index.metrics, { files: 1, parsed: 1, reused: 0 });
  });

  it("uses full Vue file locations and retains dependencies from both script sections", async () => {
    const root = await createProject({
      "src/Panel.vue": "<template><section /></template>",
      "src/Page.vue": `<script>import './theme.css'; export default {};</script>
<script setup>import Panel from './Panel.vue';</script>
<template>
  <Panel title="原始位置" />
</template>`,
      "src/theme.css": "section { color: red; }",
    });

    const index = await buildFrontendSourceIndex(root, ["src"]);
    const page = index.files.find((file) => file.filePath === "src/Page.vue");

    assert.deepEqual(page.componentCalls[0].sourceLocation, { line: 4, column: 3 });
    assert.deepEqual(page.dependencies, [
      { source: "./theme.css", resolvedFilePath: "src/theme.css" },
      { source: "./Panel.vue", resolvedFilePath: "src/Panel.vue" },
    ]);
  });
});
