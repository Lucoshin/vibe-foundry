import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";

import {
  buildComponentPreviewStaticBundle,
  buildComponentPreviewRegistry,
  createPreviewBuildProcessSpec,
  discoverPreviewRuntimeContext,
  discoverPreviewStyleImports,
  prepareComponentPreviewRuntime,
  buildPreviewRuntimeFiles,
  resolveComponentPreview,
  writeComponentPreviewRuntime,
} from "../../dist/preview/component-preview-runtime.js";
import { assetPackageDirectoryFor } from "../../dist/library/asset-library.js";
import { openPreviewBuildCache } from "../../dist/preview/preview-build-cache.js";

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createActionBuildFixture() {
  const projectRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-source-"));
  const assetDir = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-assets-"));
  await mkdir(join(projectRoot, "src", "components"), { recursive: true });
  await writeFile(
    join(projectRoot, "src", "components", "BasicButton.jsx"),
    "export default function BasicButton() { return <button>Preview</button>; }\n",
  );
  const registry = buildComponentPreviewRegistry([{
    name: "BasicButton",
    filePath: "src/components/BasicButton.jsx",
    exportMode: "default",
    exportName: "default",
    kind: "component",
    sourceFingerprint: "source-a",
  }], { projectRoot: join(tmpdir(), "preview-runtime-fixture"),
    generatedAt: "2026-07-14T00:00:00.000Z",
    runtimeContext: {
      providers: [],
      globalStyles: [],
      plugins: [],
      networkPolicy: "block-external",
      unresolved: [],
      environmentVariables: [],
      fingerprint: "runtime-a",
    },
  });
  await writeJson(join(assetDir, "component-previews.json"), registry);
  return { projectRoot, assetDir, registry };
}

async function createObservingBuildProcess(root, observationPath) {
  const runnerPath = join(root, "build runner with spaces.mjs");
  await writeFile(
    runnerPath,
    [
      'import { mkdirSync, writeFileSync } from "node:fs";',
      'import { join, resolve } from "node:path";',
      "const args = process.argv.slice(2);",
      'const outDirIndex = args.indexOf("--outDir");',
      'if (outDirIndex < 0 || !args[outDirIndex + 1]) throw new Error("build runner requires --outDir");',
      "const outputDir = resolve(process.cwd(), args[outDirIndex + 1]);",
      `writeFileSync(${JSON.stringify(observationPath)}, JSON.stringify({ args, env: process.env }));`,
      "mkdirSync(outputDir, { recursive: true });",
      'writeFileSync(join(outputDir, "index.html"), JSON.stringify(process.env));',
    ].join("\n"),
  );

  return { command: process.execPath, args: [runnerPath, "--outDir", "dist"] };
}

describe("component preview runtime", () => {
  it("requires an explicit project root when registering previews", () => {
    assert.throws(() => buildComponentPreviewRegistry([]), /projectRoot.*required/i);
    assert.throws(() => buildComponentPreviewRegistry([], { projectRoot: " " }), /projectRoot.*required/i);
  });

  it("isolates same-path previews across projects and keeps their routes stable", () => {
    const component = { name: "Button", filePath: "src/Button.tsx", exportMode: "named" };
    const projectRoot = join(tmpdir(), "preview-project-a");
    const first = buildComponentPreviewRegistry([component], { projectRoot }).previews[0];
    const repeat = buildComponentPreviewRegistry([component], { projectRoot }).previews[0];
    const second = buildComponentPreviewRegistry([component], { projectRoot: join(tmpdir(), "preview-project-b") }).previews[0];
    const otherPath = buildComponentPreviewRegistry([{ ...component, filePath: "src/admin/Button.tsx" }], { projectRoot }).previews[0];
    assert.equal(first.id, repeat.id);
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.browserUrl, second.browserUrl);
    assert.notEqual(first.id, otherPath.id);
    assert.notEqual(first.actionDigest, second.actionDigest);
    const customFirst = buildComponentPreviewRegistry([component], { projectRoot, buildOptions: { minify: false } }).previews[0];
    const customSecond = buildComponentPreviewRegistry([component], { projectRoot: join(tmpdir(), "preview-project-b"), buildOptions: { minify: false } }).previews[0];
    assert.notEqual(customFirst.actionDigest, customSecond.actionDigest);
  });

  it("marks unverified or unresolved previews as degraded instead of ready", () => {
    const registry = buildComponentPreviewRegistry([
      {
        name: "NoScenarioCard",
        filePath: "src/NoScenarioCard.jsx",
        exportMode: "default",
      },
      {
        name: "DynamicCard",
        filePath: "src/DynamicCard.jsx",
        exportMode: "default",
        previewScenario: {
          source: "usage",
          sourceFile: "src/Page.jsx",
          props: { title: "标题" },
          events: [],
          unresolvedProps: ["items"],
        },
      },
      {
        name: "StaticCard",
        filePath: "src/StaticCard.jsx",
        exportMode: "default",
        previewScenario: {
          source: "usage",
          sourceFile: "src/Page.jsx",
          props: { title: "标题" },
          events: [],
        },
      },
    ], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });

    assert.equal(registry.previews[0].status, "degraded");
    assert.equal(registry.previews[0].buildable, true);
    assert.deepEqual(registry.previews[0].limitations, ["missing-source-scenario"]);
    assert.equal(registry.previews[1].status, "degraded");
    assert.deepEqual(registry.previews[1].limitations, ["unresolved-props:items"]);
    assert.equal(registry.previews[2].status, "degraded");
    assert.deepEqual(registry.previews[2].limitations, ["runtime-validation-pending"]);
  });

  it("never generates component-name-specific business props", () => {
    const registry = buildComponentPreviewRegistry([{
      name: "ShareJobPanel",
      filePath: "src/ShareJobPanel.jsx",
      exportMode: "default",
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });

    const files = buildPreviewRuntimeFiles(registry);
    const source = files[`src/previews/${registry.previews[0].id}.jsx`];

    assert.match(source, /const props = \{\};/);
    assert.doesNotMatch(source, /仓库分拣员|深蓝科技|preview-job-42|referralCode/);
  });

  it("builds a complete preview action digest from source and execution inputs", () => {
    const component = {
      name: "Button",
      filePath: "src/Button.vue",
      exportMode: "default",
      sourceFingerprint: "1111111111111111",
    };
    const first = buildComponentPreviewRegistry([component], { projectRoot: join(tmpdir(), "preview-runtime-fixture"),
      runtimeContext: { fingerprint: "runtime-a" },
      builderDigest: "builder-a",
      toolchain: { node: "24.12.0", vite: "5.4.21", plugins: [] },
      platform: { os: "win32", arch: "x64" },
    });
    const second = buildComponentPreviewRegistry([{
      ...component,
      sourceFingerprint: "2222222222222222",
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture"),
      runtimeContext: { fingerprint: "runtime-a" },
      builderDigest: "builder-a",
      toolchain: { node: "24.12.0", vite: "5.4.21", plugins: [] },
      platform: { os: "win32", arch: "x64" },
    });
    const builderChanged = buildComponentPreviewRegistry([component], { projectRoot: join(tmpdir(), "preview-runtime-fixture"),
      runtimeContext: { fingerprint: "runtime-a" },
      builderDigest: "builder-b",
      toolchain: { node: "24.12.0", vite: "5.4.21", plugins: [] },
      platform: { os: "win32", arch: "x64" },
    });

    assert.match(first.previews[0].actionDigest, /^[a-f0-9]{64}$/);
    assert.equal("cacheKey" in first.previews[0], false);
    assert.notEqual(first.previews[0].actionDigest, second.previews[0].actionDigest);
    assert.notEqual(first.previews[0].actionDigest, builderChanged.previews[0].actionDigest);
  });

  it("injects the official uni-app H5 host for platform components", () => {
    const registry = buildComponentPreviewRegistry([{
      name: "TimeRangePicker",
      filePath: "src/components/TimeRangePicker.vue",
      exportMode: "default",
      exportName: "default",
      kind: "component",
      platformRuntime: "uni-h5",
      platformComponents: ["picker-view", "picker-view-column", "view"],
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });
    const files = buildPreviewRuntimeFiles(registry, { runtime: "vite-vue" });

    assert.equal(registry.previews[0].platformRuntime, "uni-h5");
    assert.match(files["src/App.js"], /from "@dcloudio\/uni-h5"/);
    assert.match(files["src/App.js"], /previewApp\.component\("picker-view", PickerView\)/);
    assert.match(files["src/App.js"], /@dcloudio\/uni-components\/style\/picker-view\.css/);
    assert.match(files["vite.config.js"], /vibe-foundry-uni-rpx/);
    assert.match(files["vite.config.js"], /generateBundle\(_options, bundle\)/);
    assert.match(files["vite.config.js"], /rpxCalcMaxDeviceWidth/);
    assert.match(files["vite.config.js"], /@dcloudio\/uni-h5-vue/);
    assert.match(files["vite.config.js"], /"__UNI_FEATURE_WXS__": true/);
    assert.match(files["vite.config.js"], /normalizeUniComponentTags/);
  });

  it("builds degraded but runnable preview entries when React scenarios are missing", () => {
    const registry = buildComponentPreviewRegistry(
      [
        {
          name: "ShareJobPanel",
          filePath: "src/components/shared/ShareJobPanel.jsx",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
        {
          name: "Button",
          filePath: "src/components/Button.tsx",
          exportMode: "named",
          exportName: "Button",
          kind: "component",
        },
      ],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );

    assert.equal(registry.schemaVersion, "0.1.0");
    assert.equal(registry.runtime, "vite-react");
    assert.equal(registry.previews.length, 2);
    assert.match(registry.previews[0].id, /^share-job-panel-/);
    assert.equal(registry.previews[0].status, "degraded");
    assert.equal(registry.previews[0].buildable, true);
    assert.equal(registry.previews[0].browserUrl, "/component-preview/" + registry.previews[0].id + "/");
    assert.equal("startCommand" in registry.previews[0], false);
    assert.deepEqual(registry.previews[0].interactions, ["hover", "click", "focus"]);
  });

  it("marks components without an export contract as blocked", () => {
    const registry = buildComponentPreviewRegistry(
      [{ name: "UnknownCard", filePath: "src/components/UnknownCard.jsx", kind: "component" }],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );

    assert.equal(registry.previews[0].status, "blocked");
    assert.match(registry.previews[0].blockers[0], /export/);
  });

  it("builds degraded but runnable preview entries when Vue scenarios are missing", () => {
    const registry = buildComponentPreviewRegistry(
      [
        {
          name: "UserPanel",
          filePath: "src/components/UserPanel.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
      ],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );

    assert.equal(registry.runtime, "vite-vue");
    assert.equal(registry.previews[0].status, "degraded");
    assert.equal(registry.previews[0].runtime, "vite-vue");
    assert.equal(registry.previews[0].browserUrl, "/component-preview/" + registry.previews[0].id + "/");
    assert.deepEqual(registry.previews[0].interactions, ["hover", "click", "focus"]);
    assert.deepEqual(registry.previews[0].blockers, []);
  });

  it("generates a Vite app that imports preview cases and project source files", () => {
    const registry = buildComponentPreviewRegistry(
      [
        {
          name: "ShareJobPanel",
          filePath: "src/components/shared/ShareJobPanel.jsx",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
      ],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );

    const files = buildPreviewRuntimeFiles(registry, {
      projectRoot: "D:/work/app",
      globalStyleImports: ["antd/dist/antd.css", "src/index.css"],
    });
    const preview = registry.previews[0];

    assert.ok(files["package.json"].includes("\"build\": \"vite build\""));
    assert.match(files["vite.config.js"], /transformWithEsbuild/);
    assert.match(files["vite.config.js"], /createRequire/);
    assert.match(files["vite.config.js"], /pathToFileURL/);
    assert.match(files["vite.config.js"], /requireFromPreviewToolchain/);
    assert.doesNotMatch(files["vite.config.js"], /process\.argv\[1\]/);
    assert.match(files["vite.config.js"], /VIBE_FOUNDRY_PREVIEW_BASE/);
    assert.match(files["vite.config.js"], /resolve:\s*\{/);
    assert.ok(files["vite.config.js"].includes('{ find: /^@\\//, replacement: resolve(projectRoot, "src") + "/" }'));
    assert.match(files["vite.config.js"], /replacement: resolve\(projectRoot, "src"\) \+ "\/"/);
    assert.match(files["vite.config.js"], /vibe-preview-project-dependencies/);
    assert.match(files["vite.config.js"], /dist\/node\/index\.js/);
    assert.doesNotMatch(files["vite.config.js"], /from "vite"/);
    assert.match(files["vite.config.js"], /name: "vibe-foundry-jsx-in-js-loader"/);
    assert.match(files["vite.config.js"], /loader: "jsx"/);
    assert.match(files["vite.config.js"], /name: "vibe-foundry-ts-source-loader"/);
    assert.match(files["vite.config.js"], /projectTsSourcePattern/);
    assert.match(files["vite.config.js"], /loader: "ts"/);
    assert.match(files["vite.config.js"], /server:\s*\{\s*fs:\s*\{\s*allow:/s);
    assert.match(files["vite.config.js"], /loader:\s*\{\s*"\.js": "jsx"\s*\}/);
    assert.match(files["src/App.jsx"], /previewModules/);
    assert.doesNotMatch(files["src/App.jsx"], /import Preview0/);
    assert.match(files["src/App.jsx"], /\(\) => import\("\.\/previews\//);
    assert.match(files["src/App.jsx"], /isEmbeddedPreview/);
    assert.match(files["src/App.jsx"], /embed/);
    assert.match(files["src/App.jsx"], /vibe-preview-shell embedded/);
    assert.match(files["src/App.jsx"], /useFitPreview/);
    assert.match(files["src/App.jsx"], /class PreviewErrorBoundary/);
    assert.match(files["src/App.jsx"], /getDerivedStateFromError/);
    assert.match(files["src/App.jsx"], /ResizeObserver/);
    assert.match(files["src/App.jsx"], /--vibe-preview-scale/);
    assert.match(files["src/App.jsx"], /--vibe-preview-available-width/);
    assert.doesNotMatch(files["src/App.jsx"], /--vibe-preview-available-height/);
    assert.match(files["src/App.jsx"], /availableWidth \/ contentWidth/);
    assert.doesNotMatch(files["src/App.jsx"], /availableHeight \/ contentHeight/);
    assert.match(files["src/App.jsx"], /Math\.min\(1,/);
    assert.match(files["src/App.jsx"], /vibe-preview-fit-stage/);
    assert.match(files["src/App.jsx"], /vibe-preview-fit-target/);
    assert.match(files["src/App.jsx"], /import "antd\/dist\/antd\.css"/);
    assert.match(files["src/App.jsx"], /import "\.\.\/\.\.\/\.\.\/src\/index\.css"/);
    assert.match(files["src/App.jsx"], /\[role="dialog"\] button/);
    assert.match(files["src/App.jsx"], /\.ant-modal button/);
    assert.match(files["src/vibe-preview.css"], /\.vibe-preview-shell\.embedded/);
    assert.match(files["src/vibe-preview.css"], /\.vibe-preview-shell\.embedded \.vibe-preview-canvas/);
    assert.match(files["src/vibe-preview.css"], /place-items: center/);
    assert.match(files["src/vibe-preview.css"], /overflow-y: auto/);
    assert.match(files["src/vibe-preview.css"], /transform: scale\(var\(--vibe-preview-scale\)\)/);
    assert.match(files["src/vibe-preview.css"], /--vibe-preview-available-width/);
    assert.match(files["src/vibe-preview.css"], /\.vibe-preview-fit-target :is\(svg, img, canvas, video\)/);
    assert.match(files["src/vibe-preview.css"], /min-width: var\(--vibe-preview-available-width\)/);
    assert.match(files["src/vibe-preview.css"], /object-fit: contain/);
    assert.match(files[`src/previews/${preview.id}.jsx`], /import Component from "\.\.\/\.\.\/\.\.\/\.\.\/src\/components\/shared\/ShareJobPanel\.jsx"/);
    assert.match(files[`src/previews/${preview.id}.jsx`], /const props = \{\};/);
    assert.doesNotMatch(files[`src/previews/${preview.id}.jsx`], /仓库分拣员|preview-job-42/);
  });

  it("does not invent open state for drawer-style component previews", () => {
    const registry = buildComponentPreviewRegistry(
      [
        {
          name: "AddToHomeScreenDrawer",
          filePath: "src/components/common/AddToHomeScreenDrawer.js",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
      ],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );

    const files = buildPreviewRuntimeFiles(registry);
    const preview = registry.previews[0];
    const previewSource = files[`src/previews/${preview.id}.jsx`];

    assert.match(previewSource, /const props = \{\};/);
    assert.doesNotMatch(previewSource, /open: true|isMobileView|job-seeker/);
  });

  it("prefers source-derived preview scenarios over component-name fallbacks", () => {
    const registry = buildComponentPreviewRegistry([{
      name: "ShareJobPanel",
      filePath: "src/ShareJobPanel.jsx",
      exportMode: "default",
      previewScenario: {
        source: "usage",
        sourceFile: "src/pages/Job.jsx",
        props: { visible: false, jobTitle: "真实调用标题" },
        events: ["onClose"],
      },
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });

    const files = buildPreviewRuntimeFiles(registry);
    const source = files[`src/previews/${registry.previews[0].id}.jsx`];

    assert.match(source, /jobTitle: "真实调用标题"/);
    assert.match(source, /visible: false/);
    assert.match(source, /onClose: \(\) => \{\}/);
    assert.doesNotMatch(source, /仓库分拣员/);
  });

  it("passes source-derived default slot text into React and Vue previews", () => {
    const reactRegistry = buildComponentPreviewRegistry([{
      name: "TextButton",
      filePath: "src/TextButton.jsx",
      exportMode: "default",
      previewScenario: {
        source: "usage",
        sourceFile: "src/Page.jsx",
        props: {},
        events: [],
        slots: { default: "保存" },
      },
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });
    const vueRegistry = buildComponentPreviewRegistry([{
      name: "BasicButton",
      filePath: "src/BasicButton.vue",
      exportMode: "default",
      previewScenario: {
        source: "usage",
        sourceFile: "src/Page.vue",
        props: {},
        events: [],
        slots: { default: "登录" },
      },
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });

    const reactSource = buildPreviewRuntimeFiles(reactRegistry)[`src/previews/${reactRegistry.previews[0].id}.jsx`];
    const vueSource = buildPreviewRuntimeFiles(vueRegistry, { runtime: "vite-vue" })[`src/previews/${vueRegistry.previews[0].id}.vue`];

    assert.match(reactSource, /children: "保存"/);
    assert.match(vueSource, />\s*登录\s*<\/Component>/);
    assert.doesNotMatch(vueSource, /children: "登录"/);
  });

  it("quotes non-identifier prop keys in generated preview source", () => {
    const registry = buildComponentPreviewRegistry([{
      name: "AccessibleButton",
      filePath: "src/AccessibleButton.jsx",
      exportMode: "default",
      previewScenario: {
        source: "usage",
        sourceFile: "src/Page.jsx",
        props: {
          "aria-label": "保存",
          config: { "data-key": "primary" },
        },
        events: [],
      },
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });

    const source = buildPreviewRuntimeFiles(registry)[`src/previews/${registry.previews[0].id}.jsx`];

    assert.match(source, /"aria-label": "保存"/);
    assert.match(source, /config: \{ "data-key": "primary" \}/);
  });

  it("does not override component fallback slots when a real usage scenario exists", () => {
    const registry = buildComponentPreviewRegistry([{
      name: "AppNavBar",
      filePath: "src/AppNavBar.vue",
      exportMode: "default",
      previewScenario: {
        source: "usage",
        sourceFile: "src/pages/Drafts.vue",
        props: { title: "岗位草稿" },
        events: [],
      },
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });
    const preview = registry.previews[0];
    const files = buildPreviewRuntimeFiles(registry, {
      runtime: "vite-vue",
    });
    const source = files[`src/previews/${preview.id}.vue`];

    assert.match(source, /title: "岗位草稿"/);
    assert.doesNotMatch(source, /template #right/);
    assert.doesNotMatch(source, /候选人：王小明/);
  });

  it("discovers deterministic providers and unresolved runtime context", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-context-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await writeJson(join(root, "package.json"), {
        dependencies: {
          react: "latest",
          "react-router-dom": "latest",
          pinia: "latest",
          "vue-router": "latest",
          "@reduxjs/toolkit": "latest",
        },
      });
      await writeFile(
        join(root, "src", "main.tsx"),
        "import './theme.css'; import { BrowserRouter } from 'react-router-dom'; const api = import.meta.env.VITE_API_URL;",
      );

      const context = await discoverPreviewRuntimeContext(root);

      assert.deepEqual(context.providers, ["react-router-memory"]);
      assert.deepEqual(context.globalStyles, ["src/theme.css"]);
      assert.deepEqual(context.unresolved, []);
      assert.deepEqual(context.environmentVariables, ["VITE_API_URL"]);
      assert.equal(context.networkPolicy, "block-external");

      await writeFile(
        join(root, "src", "main.tsx"),
        "import './theme.css'; const api = import.meta.env.VITE_API_URL;",
      );
      const contextWithoutRouter = await discoverPreviewRuntimeContext(root);
      assert.deepEqual(contextWithoutRouter.providers, []);
      assert.notEqual(contextWithoutRouter.fingerprint, context.fingerprint);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("discovers preprocessor styles from TypeScript app entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-styles-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await writeJson(join(root, "package.json"), { devDependencies: { unocss: "latest" } });
      await writeFile(join(root, "src", "main.ts"), "import './theme.scss';\nimport './tokens.less';\nimport 'uno.css';\n");

      const context = await discoverPreviewRuntimeContext(root);

      assert.deepEqual(context.globalStyles, ["src/theme.scss", "src/tokens.less", "uno.css"]);
      assert.deepEqual(context.plugins, ["unocss"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the shared source snapshot for runtime providers and entry styles", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-runtime-snapshot-"));
    try {
      await mkdir(join(root, "src"));
      await writeJson(join(root, "package.json"), { dependencies: { "react-router-dom": "6.0.0", antd: "5.0.0" } });
      await writeFile(join(root, "src", "theme.css"), ":root { --primary: #123456; }");
      const sourceIndex = { files: [{ filePath: "src/main.tsx", sourceText: "import './theme.css'; import { BrowserRouter } from 'react-router-dom';" }] };
      const context = await discoverPreviewRuntimeContext(root, { sourceIndex });
      assert.deepEqual(context.providers, ["react-router-memory"]);
      assert.deepEqual(context.globalStyles, ["src/theme.css"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not inject antd styles without an authored import and includes Next layout styles", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-runtime-layout-"));
    try {
      await mkdir(join(root, "app"));
      await writeJson(join(root, "package.json"), { dependencies: { antd: "5.0.0", next: "15.0.0" } });
      const empty = await discoverPreviewRuntimeContext(root);
      assert.deepEqual(empty.globalStyles, []);
      await writeFile(join(root, "app", "layout.tsx"), "import './globals.css'; export default function Layout() { return null; }");
      await writeFile(join(root, "app", "globals.css"), ":root { --primary: #123456; }");
      const first = await discoverPreviewRuntimeContext(root);
      assert.deepEqual(first.globalStyles, ["app/globals.css"]);
      await writeFile(join(root, "app", "globals.css"), ":root { --primary: #654321; }");
      const changed = await discoverPreviewRuntimeContext(root);
      assert.notEqual(changed.fingerprint, first.fingerprint);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("discovers styles imported by the real component usage source", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-usage-styles-"));
    try {
      await mkdir(join(root, "src", "components"), { recursive: true });
      await mkdir(join(root, "src", "pages"), { recursive: true });
      await writeFile(join(root, "src", "components", "Hero.js"), "export default () => null;\n");
      await writeFile(join(root, "src", "pages", "Home.js"), "import './Hero.css'; import '../styles/mobile.scss';\n");

      const imports = await discoverPreviewStyleImports(root, [{
        componentPath: "src/components/Hero.js",
        previewScenario: { sourceFile: "src/pages/Home.js" },
      }]);

      assert.deepEqual(imports, ["src/pages/Hero.css", "src/styles/mobile.scss"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists runtime context in the component preview registry", () => {
    const runtimeContext = {
      providers: ["react-router-memory"],
      globalStyles: ["src/theme.css"],
      networkPolicy: "block-external",
      unresolved: ["redux-store"],
    };
    const registry = buildComponentPreviewRegistry([], { projectRoot: join(tmpdir(), "preview-runtime-fixture"), runtimeContext });

    assert.deepEqual(registry.runtimeContext, runtimeContext);
  });

  it("installs deterministic providers and blocks external preview requests", () => {
    const reactRegistry = buildComponentPreviewRegistry([{
      name: "AccountLink",
      filePath: "src/AccountLink.jsx",
      exportMode: "default",
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });
    const reactFiles = buildPreviewRuntimeFiles(reactRegistry, {
      runtimeContext: {
        providers: ["react-router-memory"],
        networkPolicy: "block-external",
      },
    });
    const reactPreview = reactFiles[`src/previews/${reactRegistry.previews[0].id}.jsx`];

    assert.match(reactPreview, /MemoryRouter/);
    assert.match(reactPreview, /<MemoryRouter><Component/);
    assert.match(reactFiles["src/App.jsx"], /installPreviewNetworkGuard/);
    assert.match(reactFiles["src/App.jsx"], /api\/component-preview-validation/);
    assert.match(reactFiles["src/App.jsx"], /vibe-preview-empty/);

    const vueRegistry = buildComponentPreviewRegistry([{
      name: "AccountPanel",
      filePath: "src/AccountPanel.vue",
      exportMode: "default",
    }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });
    const vueFiles = buildPreviewRuntimeFiles(vueRegistry, {
      runtimeContext: {
        providers: ["vue-pinia", "vue-router-memory"],
        plugins: ["unocss"],
        networkPolicy: "block-external",
      },
    });

    assert.match(vueFiles["src/App.js"], /createPinia/);
    assert.match(vueFiles["src/App.js"], /createMemoryHistory/);
    assert.match(vueFiles["src/App.js"], /previewApp\.use\(previewRouter\)/);
    assert.match(vueFiles["src/App.js"], /installPreviewNetworkGuard/);
    assert.match(vueFiles["src/App.js"], /api\/component-preview-validation/);
    assert.match(vueFiles["vite.config.js"], /unocss\/vite/);
    assert.match(vueFiles["vite.config.js"], /UnoCSS\(\)/);
  });

  it("generates a Vue preview app for ready Vue SFC previews", () => {
    const registry = buildComponentPreviewRegistry(
      [
        {
          name: "UserPanel",
          filePath: "src/components/UserPanel.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
      ],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );

    const files = buildPreviewRuntimeFiles(registry, {
      globalStyleImports: ["src/index.css"],
    });
    const preview = registry.previews[0];

    assert.match(files["index.html"], /src\/App\.js/);
    assert.match(files["vite.config.js"], /@vitejs\/plugin-vue/);
    assert.match(files["vite.config.js"], /vue\(\)/);
    assert.match(files["vite.config.js"], /vibe-foundry-uni-conditional-loader/);
    assert.match(files["vite.config.js"], /stripUniConditionals/);
    assert.match(files["vite.config.js"], /injectVueAutoImports/);
    assert.match(files["vite.config.js"], /vueAutoImportNames = \["computed", "ref"\]/);
    assert.ok(files["vite.config.js"].includes('new RegExp("\\\\b" + name + "\\\\s*\\\\(");'));
    assert.ok(files["vite.config.js"].includes('code.replace(/<script\\s+setup'));
    assert.match(files["vite.config.js"], /APP-PLUS/);
    assert.match(files["vite.config.js"], /vibe-foundry-vue-ts-script-loader/);
    assert.match(files["vite.config.js"], /lang\.ts/);
    assert.match(files["vite.config.js"], /loader: "ts"/);
    assert.match(files["src/App.js"], /createApp/);
    assert.match(files["src/App.js"], /installUniPreviewMock/);
    assert.match(files["src/App.js"], /fitPreview/);
    assert.match(files["src/App.js"], /errorCaptured/);
    assert.match(files["src/App.js"], /ResizeObserver/);
    assert.match(files["src/App.js"], /--vibe-preview-available-width/);
    assert.match(files["src/App.js"], /createCanvasContext/);
    assert.match(files["src/App.js"], /getSystemInfoSync/);
    assert.match(files["src/App.js"], /markRaw/);
    assert.match(files["src/App.js"], /previewModules/);
    assert.match(files["src/App.js"], /\(\) => import\("\.\/previews\//);
    assert.match(files["src/App.js"], /import "\.\.\/\.\.\/\.\.\/src\/index\.css"/);
    assert.match(files[`src/previews/${preview.id}.vue`], /<template>/);
    assert.match(files[`src/previews/${preview.id}.vue`], /<Component v-bind="props" \/>/);
    assert.match(files[`src/previews/${preview.id}.vue`], /import Component from "\.\.\/\.\.\/\.\.\/\.\.\/src\/components\/UserPanel\.vue"/);
    assert.equal(files[`src/previews/${preview.id}.jsx`], undefined);
  });

  it("sends the compiled action digest in React and Vue mount reports", () => {
    for (const extension of ["tsx", "vue"]) {
      const registry = buildComponentPreviewRegistry([{
        name: "Button", filePath: `src/Button.${extension}`, exportMode: "default",
      }], { projectRoot: join(tmpdir(), "preview-runtime-fixture") });
      const files = buildPreviewRuntimeFiles(registry);
      const source = files[extension === "vue" ? "src/App.js" : "src/App.jsx"];
      const start = source.indexOf("function reportPreviewMounted(");
      const reporterSource = source.slice(start, source.indexOf("\n}\n", start) + 2);
      const frames = [];
      const requests = [];
      const report = new Function("window", "document", "fetch", `${reporterSource}; return reportPreviewMounted;`)(
        { requestAnimationFrame: (callback) => frames.push(callback) },
        { querySelector: () => ({ querySelector: () => null }) },
        (url) => { requests.push(url); return Promise.resolve(); },
      );
      const preview = registry.previews[0];
      report(preview.id, preview.actionDigest);
      while (frames.length) frames.shift()();
      assert.deepEqual(requests, [`/api/component-preview-validation/${preview.id}?actionDigest=${preview.actionDigest}`]);
      assert.match(source, /reportPreviewMounted\(activePreview\??\.id, activePreview\??\.actionDigest\)/);
    }
  });

  it("generates syntactically valid Vue Vite config", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-config-"));
    try {
      const registry = buildComponentPreviewRegistry(
        [
          {
            name: "SignaturePopup",
            filePath: "src/components/SignaturePopup.vue",
            exportMode: "default",
            exportName: "default",
            kind: "component",
          },
        ],
        { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
      );
      const files = buildPreviewRuntimeFiles(registry);
      const configPath = join(projectRoot, "vite.config.mjs");
      await writeFile(configPath, files["vite.config.js"]);

      const result = spawnSync(process.execPath, ["--check", configPath], {
        encoding: "utf8",
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not invent mock props for selected uni-app Vue components", () => {
    const registry = buildComponentPreviewRegistry(
      [
        {
          name: "AppImageUploader",
          filePath: "src/components/common/AppImageUploader.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
        {
          name: "AppRatingDisplay",
          filePath: "src/components/common/AppRatingDisplay.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
        {
          name: "SkillTagEditor",
          filePath: "src/components/common/SkillTagEditor.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },        {
          name: "SignaturePopup",
          filePath: "src/components/SignaturePopup.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
        {
          name: "GlobalToast",
          filePath: "src/components/global/GlobalToast.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
        {
          name: "GlobalDialog",
          filePath: "src/components/global/GlobalDialog.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
        {
          name: "ld-confirm",
          filePath: "src/components/ld-confirm/ld-confirm.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
      ],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );

    const files = buildPreviewRuntimeFiles(registry, { runtime: "vite-vue" });
    const sourceText = Object.entries(files)
      .filter(([filePath]) => filePath.startsWith("src/previews/"))
      .map(([, content]) => content)
      .join("\n");

    assert.match(sourceText, /const props = \{\};/);
    assert.doesNotMatch(sourceText, /上传现场照片|沟通|签名确认|操作成功|VibeFoundry 生成的确认弹窗预览/);
  });
  it("can generate a single selected Vue preview without importing every ready SFC", () => {
    const registry = buildComponentPreviewRegistry(
      [
        {
          name: "AppEmptyState",
          filePath: "src/components/common/AppEmptyState.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
        {
          name: "SkillTagEditor",
          filePath: "src/components/common/SkillTagEditor.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },        {
          name: "SignaturePopup",
          filePath: "src/components/SignaturePopup.vue",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
      ],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );
    const selected = registry.previews.find((preview) => preview.componentName === "AppEmptyState");

    const files = buildPreviewRuntimeFiles(registry, {
      runtime: "vite-vue",
      previewId: selected.id,
    });

    assert.match(files["src/App.js"], /app-empty-state-/);
    assert.doesNotMatch(files["src/App.js"], /signature-popup-/);
    assert.ok(files[`src/previews/${selected.id}.vue`]);
    assert.equal(
      files[`src/previews/${registry.previews.find((preview) => preview.componentName === "SignaturePopup").id}.vue`],
      undefined,
    );
  });

  it("can write a selected static preview runtime into an isolated root", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-library-"));
    try {
      const registry = buildComponentPreviewRegistry(
        [
          {
            name: "BasicButton",
            filePath: "src/components/BasicButton/index.vue",
            exportMode: "default",
            exportName: "default",
            kind: "component",
          },
          {
            name: "AppEmptyState",
            filePath: "src/components/common/AppEmptyState.vue",
            exportMode: "default",
            exportName: "default",
            kind: "component",
          },
        ],
        { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
      );
      const selected = registry.previews.find((preview) => preview.componentName === "AppEmptyState");
      const previewRoot = join(
        assetPackageDirectoryFor(libraryRoot, projectRoot),
        "preview-runtime-static",
        selected.id,
      );

      const result = await writeComponentPreviewRuntime(projectRoot, registry, {
        runtime: "vite-vue",
        previewId: selected.id,
        previewRoot,
      });
      const previewData = await readFile(join(previewRoot, "src", "preview-data.js"), "utf8");
      const previewSource = await readFile(
        join(previewRoot, "src", "previews", `${selected.id}.vue`),
        "utf8",
      );
      const viteConfig = await readFile(join(previewRoot, "vite.config.js"), "utf8");

      assert.equal(result.previewRoot, previewRoot);
      assert.match(previewData, /app-empty-state-/);
      assert.doesNotMatch(previewData, /basic-button-/);
      assert.ok(
        previewSource.includes(
          `import Component from "${relative(join(previewRoot, "src", "previews"), projectRoot).replaceAll("\\", "/")}/src/components/common/AppEmptyState.vue"`,
        ),
      );
      assert.ok(
        viteConfig.includes(
          `const projectRoot = resolve(previewRoot, ${JSON.stringify(relative(previewRoot, projectRoot).replaceAll("\\", "/"))});`,
        ),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(libraryRoot, { recursive: true, force: true });
    }
  });

  it("defaults every preview API to the centralized package without using source-local assets", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-source-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-library-"));
    const assetDir = assetPackageDirectoryFor(libraryRoot, projectRoot);
    const sourceLocalDir = join(projectRoot, ".vibe-foundry");
    try {
      await mkdir(join(projectRoot, "src", "components"), { recursive: true });
      await mkdir(assetDir, { recursive: true });
      await writeFile(
        join(projectRoot, "src", "components", "BasicButton.jsx"),
        "export default function BasicButton() { return <button>Preview</button>; }\n",
      );
      const registry = buildComponentPreviewRegistry([{
        name: "BasicButton",
        filePath: "src/components/BasicButton.jsx",
        exportMode: "default",
        exportName: "default",
        kind: "component",
        sourceFingerprint: "source-central",
      }], { projectRoot: join(tmpdir(), "preview-runtime-fixture"),
        generatedAt: "2026-09-01T00:00:00.000Z",
        runtimeContext: {
          providers: [],
          globalStyles: [],
          plugins: [],
          networkPolicy: "block-external",
          unresolved: [],
          environmentVariables: [],
          fingerprint: "runtime-central",
        },
      });
      await writeJson(join(assetDir, "component-previews.json"), registry);

      const written = await writeComponentPreviewRuntime(projectRoot, registry, {
        assetLibraryRoot: libraryRoot,
      });
      assert.equal(written.previewRoot, join(assetDir, "preview-runtime"));
      await assert.rejects(access(sourceLocalDir), { code: "ENOENT" });

      await mkdir(sourceLocalDir, { recursive: true });
      const staleRegistry = `${JSON.stringify({ previews: [{ componentName: "StaleSourceLocal" }] })}\n`;
      await writeFile(join(sourceLocalDir, "component-previews.json"), staleRegistry);

      const prepared = await prepareComponentPreviewRuntime(projectRoot, {
        assetLibraryRoot: libraryRoot,
        component: "BasicButton",
      });
      let buildCount = 0;
      const built = await buildComponentPreviewStaticBundle(projectRoot, {
        assetLibraryRoot: libraryRoot,
        component: registry.previews[0].id,
        async executeBuild({ outputDir }) {
          buildCount += 1;
          await mkdir(outputDir, { recursive: true });
          await writeFile(join(outputDir, "index.html"), "central preview artifact");
        },
      });

      assert.equal(prepared.selectedPreview.componentName, "BasicButton");
      assert.equal(prepared.previewRoot, join(assetDir, "preview-runtime"));
      assert.equal(built.assetDir, assetDir);
      assert.equal(buildCount, 1);
      assert.equal(await readFile(join(sourceLocalDir, "component-previews.json"), "utf8"), staleRegistry);
      await assert.rejects(access(join(sourceLocalDir, "preview-runtime")), { code: "ENOENT" });
      await assert.rejects(access(join(sourceLocalDir, "preview-runtime-static")), { code: "ENOENT" });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(libraryRoot, { recursive: true, force: true });
    }
  });

  it("can prepare preview runtime from a centralized asset package directory", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-source-"));
    const assetDir = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-assets-"));
    try {
      await mkdir(join(projectRoot, "src", "components"), { recursive: true });
      await writeFile(
        join(projectRoot, "src", "components", "BasicButton.jsx"),
        "export default function BasicButton() { return <button>Preview</button>; }\n",
      );
      await writeJson(join(assetDir, "component-catalog.json"), {
        components: [
          {
            name: "BasicButton",
            filePath: "src/components/BasicButton.jsx",
            exportMode: "default",
            exportName: "default",
            kind: "component",
          },
        ],
      });
      const registry = buildComponentPreviewRegistry([
        {
          name: "BasicButton",
          filePath: "src/components/BasicButton.jsx",
          exportMode: "default",
          exportName: "default",
          kind: "component",
          sourceFingerprint: "source-a",
        },
      ], { projectRoot: join(tmpdir(), "preview-runtime-fixture"),
        generatedAt: "2026-07-14T00:00:00.000Z",
        runtimeContext: {
          providers: [],
          globalStyles: [],
          plugins: [],
          networkPolicy: "block-external",
          unresolved: [],
          environmentVariables: [],
          fingerprint: "runtime-a",
        },
      });
      registry.previews[0].status = "ready";
      registry.previews[0].limitations = [];
      registry.previews[0].runtimeValidation = {
        source: "browser-mount",
        validatedAt: "2026-07-14T00:01:00.000Z",
      };
      await writeJson(join(assetDir, "component-previews.json"), registry);
      const registryBeforePrepare = await readFile(
        join(assetDir, "component-previews.json"),
        "utf8",
      );

      const result = await prepareComponentPreviewRuntime(projectRoot, {
        assetDir,
        component: "BasicButton",
        previewRootFor: (preview) => join(assetDir, "preview-runtime-static", preview.id),
      });
      const registryText = await readFile(join(assetDir, "component-previews.json"), "utf8");

      assert.equal(result.selectedPreview.componentName, "BasicButton");
      assert.match(result.previewRoot, /preview-runtime-static/);
      assert.equal(registryText, registryBeforePrepare);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(assetDir, { recursive: true, force: true });
    }
  });

  it("commits one static build to the persistent action cache and reuses it", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-source-"));
    const assetDir = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-assets-"));
    try {
      await mkdir(join(projectRoot, "src", "components"), { recursive: true });
      await writeFile(
        join(projectRoot, "src", "components", "BasicButton.jsx"),
        "export default function BasicButton() { return <button>Preview</button>; }\n",
      );
      const registry = buildComponentPreviewRegistry([{
        name: "BasicButton",
        filePath: "src/components/BasicButton.jsx",
        exportMode: "default",
        exportName: "default",
        kind: "component",
        sourceFingerprint: "source-a",
      }], { projectRoot: join(tmpdir(), "preview-runtime-fixture"),
        generatedAt: "2026-07-14T00:00:00.000Z",
        runtimeContext: {
          providers: [],
          globalStyles: [],
          plugins: [],
          networkPolicy: "block-external",
          unresolved: [],
          environmentVariables: [],
          fingerprint: "runtime-a",
        },
      });
      await writeJson(join(assetDir, "component-previews.json"), registry);
      const registryBeforeBuild = await readFile(join(assetDir, "component-previews.json"), "utf8");
      let buildCount = 0;
      const executeBuild = async ({ outputDir }) => {
        buildCount += 1;
        await mkdir(join(outputDir, "assets"), { recursive: true });
        await writeFile(join(outputDir, "index.html"), "<title>Action Cached Preview</title>");
        await writeFile(join(outputDir, "assets", "app.js"), "console.log('preview')\n");
        return { stdout: "built", stderr: "" };
      };

      const first = await buildComponentPreviewStaticBundle(projectRoot, {
        assetDir,
        component: registry.previews[0].id,
        executeBuild,
      });
      const second = await buildComponentPreviewStaticBundle(projectRoot, {
        assetDir,
        component: registry.previews[0].id,
        executeBuild,
      });

      assert.equal(buildCount, 1);
      assert.equal(first.actionDigest, registry.previews[0].actionDigest);
      assert.equal(first.artifactTreeDigest, second.artifactTreeDigest);
      assert.match(first.artifactTreeDigest, /^[a-f0-9]{64}$/);
      assert.equal(
        await readFile(join(assetDir, "component-previews.json"), "utf8"),
        registryBeforeBuild,
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(assetDir, { recursive: true, force: true });
    }
  });

  it("passes only a safe environment to the preview build executor", async () => {
    const fixture = await createActionBuildFixture();
    try {
      let receivedEnvironment;
      await buildComponentPreviewStaticBundle(fixture.projectRoot, {
        assetDir: fixture.assetDir,
        component: fixture.registry.previews[0].id,
        hostEnvironment: {
          Path: "C:\\Tools",
          SystemRoot: "C:\\Windows",
          TEMP: "C:\\Temp",
          CUSTOM_PROJECT_SETTING: "must-not-leak",
          VITE_PRIVATE_TOKEN: "vite-secret",
          NPM_TOKEN: "npm-secret",
          AWS_SECRET_ACCESS_KEY: "aws-secret",
        },
        async executeBuild({ env, outputDir }) {
          receivedEnvironment = env;
          await mkdir(outputDir, { recursive: true });
          await writeFile(join(outputDir, "index.html"), "safe environment artifact");
          return { stdout: "built", stderr: "" };
        },
      });

      assert.deepEqual(receivedEnvironment, {
        PATH: "C:\\Tools",
        SYSTEMROOT: "C:\\Windows",
        TEMP: "C:\\Temp",
        BROWSER: "none",
        VIBE_FOUNDRY_PREVIEW_BASE: `${fixture.registry.previews[0].browserUrl}${fixture.registry.previews[0].actionDigest}/`,
      });
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
      await rm(fixture.assetDir, { recursive: true, force: true });
    }
  });

  it("spawns a Node build process with an argument path containing spaces and a sanitized environment", async () => {
    const fixture = await createActionBuildFixture();
    try {
      const observationPath = join(fixture.assetDir, "observed-preview-environment.json");
      const buildProcessSpec = await createObservingBuildProcess(fixture.assetDir, observationPath);
      const testPath = join(fixture.assetDir, "no tools on PATH");
      const forbiddenEnvironment = {
        CUSTOM_PROJECT_SETTING: "custom-setting-sentinel",
        VITE_PRIVATE_TOKEN: "vite-secret-sentinel",
        NPM_TOKEN: "npm-token-sentinel",
      };

      const result = await buildComponentPreviewStaticBundle(fixture.projectRoot, {
        assetDir: fixture.assetDir,
        component: fixture.registry.previews[0].id,
        buildProcessSpec,
        hostEnvironment: {
          PATH: testPath,
          SYSTEMROOT: process.env.SYSTEMROOT,
          WINDIR: process.env.WINDIR,
          COMSPEC: process.env.COMSPEC,
          TEMP: fixture.assetDir,
          TMP: fixture.assetDir,
          ...forbiddenEnvironment,
        },
      });

      const observed = JSON.parse(await readFile(observationPath, "utf8"));
      for (const name of Object.keys(forbiddenEnvironment)) {
        assert.equal(observed.env[name], undefined);
      }
      assert.equal(observed.env.BROWSER, "none");
      assert.equal(observed.env.VIBE_FOUNDRY_PREVIEW_BASE, `${fixture.registry.previews[0].browserUrl}${fixture.registry.previews[0].actionDigest}/`);
      assert.equal(observed.env.PATH, testPath);
      assert.ok(observed.args.includes("--outDir"));

      const cache = openPreviewBuildCache(fixture.assetDir);
      try {
        const artifact = (await cache.readFile(result.actionDigest, "index.html")).toString("utf8");
        for (const value of Object.values(forbiddenEnvironment)) {
          assert.equal(artifact.includes(value), false);
        }
        assert.match(artifact, /VIBE_FOUNDRY_PREVIEW_BASE/);
        const manifest = JSON.parse((await cache.readFile(result.actionDigest, "preview-manifest.json")).toString("utf8"));
        assert.deepEqual(manifest, { componentId: fixture.registry.previews[0].id, actionDigest: result.actionDigest });
      } finally {
        cache.close();
      }
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
      await rm(fixture.assetDir, { recursive: true, force: true });
    }
  });

  it("does not persist preview build executor logs in the action cache", async () => {
    const fixture = await createActionBuildFixture();
    try {
      await buildComponentPreviewStaticBundle(fixture.projectRoot, {
        assetDir: fixture.assetDir,
        component: fixture.registry.previews[0].id,
        async executeBuild({ outputDir }) {
          await mkdir(outputDir, { recursive: true });
          await writeFile(join(outputDir, "index.html"), "log-free action artifact");
          return {
            stdout: "stdout-sensitive-sentinel",
            stderr: "stderr-sensitive-sentinel",
          };
        },
      });

      const cache = openPreviewBuildCache(fixture.assetDir);
      try {
        const action = cache.getAction(fixture.registry.previews[0].actionDigest);
        assert.equal(action.stdoutDigest, null);
        assert.equal(action.stderrDigest, null);
      } finally {
        cache.close();
      }
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
      await rm(fixture.assetDir, { recursive: true, force: true });
    }
  });

  it("grants one builder for concurrent requests of the same action", async () => {
    const fixture = await createActionBuildFixture();
    try {
      let buildCount = 0;
      const executeBuild = async ({ outputDir }) => {
        buildCount += 1;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 60));
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, "index.html"), "concurrent artifact");
        return { stdout: "built", stderr: "" };
      };
      const options = {
        assetDir: fixture.assetDir,
        component: fixture.registry.previews[0].id,
        executeBuild,
        leasePollMs: 5,
      };

      const results = await Promise.all(Array.from(
        { length: 32 },
        () => buildComponentPreviewStaticBundle(fixture.projectRoot, options),
      ));

      assert.equal(buildCount, 1);
      assert.equal(new Set(results.map((result) => result.artifactTreeDigest)).size, 1);
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
      await rm(fixture.assetDir, { recursive: true, force: true });
    }
  });

  it("negative-caches deterministic failures but retries transient failures", async () => {
    const deterministic = await createActionBuildFixture();
    try {
      let deterministicBuilds = 0;
      const options = {
        assetDir: deterministic.assetDir,
        component: deterministic.registry.previews[0].id,
        executeBuild: async () => {
          deterministicBuilds += 1;
          const error = new Error("invalid preview source");
          error.code = "SYNTAX_ERROR";
          throw error;
        },
      };
      await assert.rejects(
        buildComponentPreviewStaticBundle(deterministic.projectRoot, options),
        /invalid preview source/,
      );
      await assert.rejects(
        buildComponentPreviewStaticBundle(deterministic.projectRoot, options),
        /Cached component preview build failure: SYNTAX_ERROR/,
      );
      assert.equal(deterministicBuilds, 1);
    } finally {
      await rm(deterministic.projectRoot, { recursive: true, force: true });
      await rm(deterministic.assetDir, { recursive: true, force: true });
    }

    const transient = await createActionBuildFixture();
    try {
      let transientBuilds = 0;
      const options = {
        assetDir: transient.assetDir,
        component: transient.registry.previews[0].id,
        executeBuild: async ({ outputDir }) => {
          transientBuilds += 1;
          if (transientBuilds === 1) {
            const error = new Error("temporary resource pressure");
            error.code = "EAGAIN";
            throw error;
          }
          await mkdir(outputDir, { recursive: true });
          await writeFile(join(outputDir, "index.html"), "retried artifact");
          return { stdout: "built", stderr: "" };
        },
      };
      await assert.rejects(
        buildComponentPreviewStaticBundle(transient.projectRoot, options),
        /temporary resource pressure/,
      );
      await assert.rejects(
        buildComponentPreviewStaticBundle(transient.projectRoot, options),
        /Transient component preview failure is cooling down/,
      );
      assert.equal(transientBuilds, 1);
      await assert.rejects(
        buildComponentPreviewStaticBundle(transient.projectRoot, {
          ...options,
          transientRetryBaseMs: 0,
          maxTransientAttempts: 1,
        }),
        /Transient component preview retry budget exhausted/,
      );
      assert.equal(transientBuilds, 1);
      const result = await buildComponentPreviewStaticBundle(transient.projectRoot, {
        ...options,
        transientRetryBaseMs: 0,
      });
      assert.match(result.artifactTreeDigest, /^[a-f0-9]{64}$/);
      assert.equal(transientBuilds, 2);
    } finally {
      await rm(transient.projectRoot, { recursive: true, force: true });
      await rm(transient.assetDir, { recursive: true, force: true });
    }
  });

  it("preserves source fallback slots without inventing preview content when no usage scenario exists", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-slots-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-preview-library-"));
    try {
      await mkdir(join(projectRoot, "src", "components", "common"), { recursive: true });
      await writeFile(
        join(projectRoot, "src", "components", "common", "AppListCard.vue"),
        `<script setup lang="ts">
const props = defineProps<{ clickable?: boolean }>();
</script>

<template>
  <view class="app-list-card">
    <view v-if="$slots.header" class="app-list-card__header">
      <slot name="header" />
    </view>
    <view class="app-list-card__body">
      <slot>源组件默认内容</slot>
    </view>
    <view v-if="$slots.footer" class="app-list-card__footer">
      <slot name="footer" />
    </view>
  </view>
</template>
`,
      );
      const registry = buildComponentPreviewRegistry(
        [
          {
            name: "AppListCard",
            filePath: "src/components/common/AppListCard.vue",
            exportMode: "default",
            exportName: "default",
            kind: "component",
          },
        ],
        { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
      );
      const selected = registry.previews[0];
      const previewRoot = join(
        assetPackageDirectoryFor(libraryRoot, projectRoot),
        "preview-runtime-static",
        selected.id,
      );

      await writeComponentPreviewRuntime(projectRoot, registry, {
        runtime: "vite-vue",
        previewId: selected.id,
        previewRoot,
      });
      const previewSource = await readFile(
        join(previewRoot, "src", "previews", `${selected.id}.vue`),
        "utf8",
      );

      assert.match(previewSource, /<Component v-bind="props" \/>/);
      assert.doesNotMatch(previewSource, /<template #|预览卡片|候选人：王小明|更新时间|vibe-preview-slot/);
      const componentSource = await readFile(join(projectRoot, "src", "components", "common", "AppListCard.vue"), "utf8");
      assert.match(componentSource, /<slot>源组件默认内容<\/slot>/);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(libraryRoot, { recursive: true, force: true });
    }
  });

  it("resolves a preview by id, component name, or source path", () => {
    const registry = buildComponentPreviewRegistry(
      [
        {
          name: "ShareJobPanel",
          filePath: "src/components/shared/ShareJobPanel.jsx",
          exportMode: "default",
          exportName: "default",
          kind: "component",
        },
      ],
      { projectRoot: join(tmpdir(), "preview-runtime-fixture"), generatedAt: "2026-07-08T00:00:00.000Z" },
    );
    const preview = registry.previews[0];

    assert.equal(resolveComponentPreview(registry, preview.id).id, preview.id);
    assert.equal(resolveComponentPreview(registry, "ShareJobPanel").id, preview.id);
    assert.equal(resolveComponentPreview(registry, "src/components/shared/ShareJobPanel.jsx").id, preview.id);
  });

  it("writes only the selected Vue preview without reading unselected components", async () => {
    const fixture = await createActionBuildFixture();
    try {
      await writeFile(join(fixture.projectRoot, "src", "Selected.vue"), "<template><slot /></template>");
      await mkdir(join(fixture.projectRoot, "src", "Unselected.vue"));
      const registry = buildComponentPreviewRegistry([
        { name: "Selected", filePath: "src/Selected.vue", exportMode: "default" },
        { name: "Unselected", filePath: "src/Unselected.vue", exportMode: "default" },
      ], { projectRoot: fixture.projectRoot, runtimeContext: fixture.registry.runtimeContext });
      await writeComponentPreviewRuntime(fixture.projectRoot, registry, {
        previewId: registry.previews[0].id,
        previewRoot: join(fixture.assetDir, "selected runtime"),
      });
      await access(join(fixture.assetDir, "selected runtime", "src", "previews", `${registry.previews[0].id}.vue`));
      await assert.rejects(access(join(fixture.assetDir, "selected runtime", "src", "previews", `${registry.previews[1].id}.vue`)), { code: "ENOENT" });
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
      await rm(fixture.assetDir, { recursive: true, force: true });
    }
  });

  it("uses the installed Vite CLI through Node without a shell or package download", () => {
    const require = createRequire(import.meta.url);
    const viteCliPath = join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
    const outDir = "..\\component preview static\\button ab12cd";
    assert.deepEqual(createPreviewBuildProcessSpec(outDir), {
      command: process.execPath,
      args: [viteCliPath, "build", "--outDir", outDir, "--emptyOutDir"],
    });
  });

  it("builds a static page with the local toolchain and generated Vue config in a separate runtime directory", async () => {
    const outputRoot = join(process.cwd(), "output");
    await mkdir(outputRoot, { recursive: true });
    const root = await mkdtemp(join(outputRoot, "vibe preview local tools "));
    try {
      await writeJson(join(root, "package.json"), { type: "module" });
      const registry = buildComponentPreviewRegistry([], { projectRoot: root });
      const files = buildPreviewRuntimeFiles(registry, { runtime: "vite-vue", projectRootRelativePath: "." });
      await writeFile(join(root, "vite.config.js"), files["vite.config.js"]);
      await writeFile(join(root, "index.html"), '<script type="module" src="./entry.js"></script>');
      await writeFile(join(root, "entry.js"), 'document.body.textContent = "Local toolchain preview";');
      const spec = createPreviewBuildProcessSpec("output with spaces");
      const result = spawnSync(spec.command, spec.args, { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const html = await readFile(join(root, "output with spaces", "index.html"), "utf8");
      assert.match(html, /assets\/index-/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("transpiles React TSX with the automatic runtime even when the source project preserves JSX", async () => {
    const outputRoot = join(process.cwd(), "output");
    await mkdir(outputRoot, { recursive: true });
    const root = await mkdtemp(join(outputRoot, "vibe preview tsx "));
    try {
      await mkdir(join(root, "src"));
      await writeJson(join(root, "package.json"), { type: "module" });
      await writeJson(join(root, "tsconfig.json"), { compilerOptions: { jsx: "preserve" } });
      const registry = buildComponentPreviewRegistry([], { projectRoot: root });
      const files = buildPreviewRuntimeFiles(registry, { projectRootRelativePath: "." });
      await writeFile(join(root, "vite.runtime.config.js"), files["vite.config.js"]);
      await writeFile(join(root, "vite.config.js"), [
        'import config from "./vite.runtime.config.js";',
        // This test verifies source transformation; the parent application supplies React at runtime.
        'export default { ...config, build: { rollupOptions: { external: ["react/jsx-runtime"] } } };',
      ].join("\n"));
      await writeFile(join(root, "index.html"), '<script type="module" src="./src/entry.tsx"></script>');
      await writeFile(join(root, "src", "entry.tsx"), 'const label: string = "Continue"; window.preview = <button>{label}</button>;');
      const spec = createPreviewBuildProcessSpec("dist");
      const result = spawnSync(spec.command, spec.args, { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const html = await readFile(join(root, "dist", "index.html"), "utf8");
      const scriptPath = html.match(/src="\/([^\"]+\.js)"/)[1];
      const script = await readFile(join(root, "dist", scriptPath), "utf8");
      assert.match(script, /react\/jsx-runtime/);
      assert.doesNotMatch(script, /React\.createElement|<button>/);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});

it('selects official Taro H5 component and API adapters without affecting ordinary React',()=>{
 const registry=buildComponentPreviewRegistry([{name:'Card',filePath:'src/Card.tsx',exportMode:'default'}],{projectRoot:process.cwd()});
 const taro=buildPreviewRuntimeFiles(registry,{runtimeContext:{plugins:['taro-h5'],providers:[],globalStyles:[]}});
 assert.ok(taro['vite.config.js'].includes('@tarojs/components/lib/react/index.js'));
 assert.ok(taro['vite.config.js'].includes('@tarojs/plugin-platform-h5/dist/runtime/apis/index.js'));
 assert.ok(taro['vite.config.js'].includes('DEPRECATED_ADAPTER_COMPONENT'));
 const ordinary=buildPreviewRuntimeFiles(registry,{runtimeContext:{plugins:[],providers:[],globalStyles:[]}});
 assert.ok(!ordinary['vite.config.js'].includes('@tarojs/components/lib/react/index.js'));
});
