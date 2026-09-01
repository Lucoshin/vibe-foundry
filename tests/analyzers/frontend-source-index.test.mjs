import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
