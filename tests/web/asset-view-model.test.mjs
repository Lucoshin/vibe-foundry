import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  loadAssetLibraryViewModel,
  loadAssetViewModel,
} from "../../dist/web/asset-view-model.js";
import {
  assetPackageDirectoryFor,
  registerAssetPackage,
} from "../../dist/library/asset-library.js";
import { openPreviewBuildCache } from "../../dist/preview/preview-build-cache.js";
import { browserMountValidatorDigest } from "../../dist/preview/preview-validation.js";

const roots = [];
const buttonActionDigest = "a".repeat(64);
const originalLibraryRoot = process.env.VIBE_FOUNDRY_LIBRARY_ROOT;

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createAssetPackage() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-web-"));
  const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-web-library-"));
  const assetDir = assetPackageDirectoryFor(libraryRoot, root);
  roots.push(root, libraryRoot);
  process.env.VIBE_FOUNDRY_LIBRARY_ROOT = libraryRoot;
  await mkdir(join(assetDir, "metaphor-packs"), { recursive: true });
  await writeJson(join(assetDir, "asset-manifest.json"), {
    sourceProject: "web-fixture",
    projectRoot: root,
    generatedAt: "2026-07-08T00:00:00.000Z",
    assetCounts: {
      components: 2,
      services: 1,
      businessPatterns: 1,
      tokens: 1,
      pagePatterns: 0,
      conceptAssets: 1,
      metaphorPacks: 1,
    },
  });
  await writeJson(join(assetDir, "component-catalog.json"), {
    components: [
      {
        kind: "component",
        name: "Button",
        filePath: "src/Button.tsx",
        exportMode: "named",
        reusePotential: "high",
      },
      {
        kind: "component",
        name: "UserPanel",
        filePath: "src/UserPanel.vue",
        exportMode: "default",
        reusePotential: "high",
      },
    ],
  });
  await writeJson(join(assetDir, "component-previews.json"), {
    schemaVersion: "0.1.0",
    runtime: "vite-react",
    previews: [
      {
        id: "button-ab12cd",
        actionDigest: buttonActionDigest,
        cacheKey: buttonActionDigest,
        componentName: "Button",
        componentPath: "src/Button.tsx",
        status: "degraded",
        buildable: true,
        limitations: ["runtime-validation-pending"],
        runtime: "vite-react",
        browserUrl: "/component-preview/button-ab12cd/",
        interactions: ["hover", "click", "focus"],
        blockers: [],
      },
      {
        id: "user-panel-ef34gh",
        componentName: "UserPanel",
        componentPath: "src/UserPanel.vue",
        status: "degraded",
        buildable: true,
        runtime: "vite-vue",
        browserUrl: "/component-preview/user-panel-ef34gh/",
        interactions: ["hover", "click", "focus"],
        blockers: [],
      },
    ],
  });
  await writeJson(join(assetDir, "service-catalog.json"), {
    services: [{ kind: "service", name: "auth.register", filePath: "api/register.ts" }],
    businessPatterns: [{ kind: "business-pattern", name: "auth flow", sourceFiles: ["api/register.ts"] }],
  });
  await writeJson(join(assetDir, "tokens.json"), {
    tokens: [{ kind: "design-token", name: "bg-white", category: "color", sourceFiles: ["src/Button.tsx"] }],
  });
  await writeJson(join(assetDir, "concept-assets.json"), {
    conceptAssets: [{ kind: "concept", name: "onboarding product pattern", patternType: "onboarding", sourceFiles: ["docs/product.md"] }],
    metaphorPacks: [{ source: "memory-palace", sourceType: "user-notes", coreMetaphors: [{ name: "library" }] }],
  });
  await writeFile(join(assetDir, "reuse-report.md"), "# Reuse Report\n\n- Button\n");
  await writeFile(join(assetDir, "agent-rules.md"), "# Agent Rules\n\n- Check assets first.\n");
  return { root, libraryRoot, assetDir };
}

describe("loadAssetViewModel", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    if (originalLibraryRoot === undefined) {
      delete process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
    } else {
      process.env.VIBE_FOUNDRY_LIBRARY_ROOT = originalLibraryRoot;
    }
  });

  it("builds categorized asset browser data from the centralized package", async () => {
    const { root } = await createAssetPackage();

    const model = await loadAssetViewModel(root);

    assert.equal(model.isError, false);
    assert.equal(model.project.sourceProject, "web-fixture");
    assert.equal(model.summary.totalAssets, 7);
    assert.deepEqual(
      model.categories.map((category) => category.id),
      ["overview", "components", "services", "business", "tokens", "product", "metaphors", "reports"],
    );
    assert.ok(model.assets.some((asset) => asset.name === "Button" && asset.category === "components"));
    assert.ok(model.assets.some((asset) => asset.name === "auth.register" && asset.category === "services"));
    assert.ok(model.assets.some((asset) => asset.name === "onboarding product pattern" && asset.category === "product"));
    assert.ok(model.assets.some((asset) => asset.name === "memory-palace" && asset.category === "metaphors"));
    assert.match(model.reports.reuse, /Reuse Report/);
    assert.match(model.reports.rules, /Agent Rules/);
  });

  it("adds language badges, interaction metadata, and same-origin preview metadata", async () => {
    const { root } = await createAssetPackage();

    const model = await loadAssetViewModel(root);
    const button = model.assets.find((asset) => asset.name === "Button");
    const service = model.assets.find((asset) => asset.name === "auth.register");
    const token = model.assets.find((asset) => asset.name === "bg-white");
    const product = model.assets.find((asset) => asset.name === "onboarding product pattern");

    assert.equal(button.language, "tsx");
    assert.equal(button.languageLabel, "TSX");
    assert.equal(service.language, "ts");
    assert.equal(service.languageLabel, "TypeScript");
    assert.equal(token.language, "tsx");
    assert.equal(product.language, "md");
    assert.equal(
      model.assets.find((asset) => asset.source === "src/UserPanel.vue")?.languageLabel,
      "Vue",
    );
    assert.deepEqual(button.interactionPreview, {
      title: "组件交互预览",
      visualCue: "Button",
      hover: "悬停时抬升卡片并强调边框。",
      focus: "聚焦时显示清晰描边，便于键盘浏览。",
      motion: "预览光标会循环触发一次轻量点击动效。",
      reuseCue: "适合先作为复用组件候选，再检查 props、状态和业务耦合。",
    });
    assert.deepEqual(button.componentPreview, {
      id: "button-ab12cd",
      actionDigest: buttonActionDigest,
      status: "degraded",
      buildable: true,
      runtime: "vite-react",
      browserUrl: "/component-preview/button-ab12cd/",
      previewUrl: "/component-preview/button-ab12cd/",
      interactions: ["hover", "click", "focus"],
      blockers: [],
      limitations: ["runtime-validation-pending"],
    });
    assert.deepEqual(model.assets.find((asset) => asset.name === "UserPanel").componentPreview, {
      id: "user-panel-ef34gh",
      status: "degraded",
      buildable: true,
      runtime: "vite-vue",
      browserUrl: "/component-preview/user-panel-ef34gh/",
      previewUrl: "/component-preview/user-panel-ef34gh/",
      interactions: ["hover", "click", "focus"],
      blockers: [],
    });
  });

  it("projects a persisted matching validation as ready without changing the registry", async () => {
    const { root, assetDir } = await createAssetPackage();
    const outputDir = join(root, "preview-output");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "index.html"), "<title>Validated</title>");
    const cache = openPreviewBuildCache(assetDir);
    cache.claim(buttonActionDigest, "worker", { now: 100, ttlMs: 100 });
    const result = await cache.commitSuccess({
      actionDigest: buttonActionDigest,
      leaseOwner: "worker",
      outputDir,
      completedAt: 101,
    });
    await cache.recordValidationEvidence({
      artifactTreeDigest: result.artifactTreeDigest,
      validatorDigest: browserMountValidatorDigest,
      state: "ready",
      evidence: { source: "browser-mount" },
      validatedAt: 102,
    });
    cache.close();

    const model = await loadAssetViewModel(root);
    const button = model.assets.find((asset) => asset.name === "Button");

    assert.equal(button.componentPreview.status, "ready");
    assert.deepEqual(button.componentPreview.limitations, undefined);
    assert.equal(button.componentPreview.actionDigest, buttonActionDigest);
  });

  it("adds component labels and source project metadata for component filtering", async () => {
    const { root } = await createAssetPackage();

    const model = await loadAssetViewModel(root);
    const button = model.assets.find((asset) => asset.name === "Button");
    const service = model.assets.find((asset) => asset.name === "auth.register");

    assert.equal(button.project, "web-fixture");
    assert.deepEqual(button.labels, ["TSX", "named export", "high reuse"]);
    assert.deepEqual(service.labels, []);
  });

  it("aggregates registered packages without changing project path semantics", async () => {
    const { root, libraryRoot, assetDir } = await createAssetPackage();
    await registerAssetPackage(libraryRoot, {
      projectRoot: root,
      sourceProject: "web-fixture",
      assetPackageDir: assetDir,
      generatedAt: "2026-07-08T00:00:00.000Z",
    });

    const model = await loadAssetLibraryViewModel(libraryRoot);
    const button = model.assets.find((asset) => asset.name === "Button");

    assert.equal(model.isError, false);
    assert.equal(button.projectRoot, root);
    assert.equal(button.assetPackageDir, assetDir);
  });

  it("returns a clear missing central package model", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-web-missing-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-web-library-missing-"));
    roots.push(root, libraryRoot);
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = libraryRoot;

    const model = await loadAssetViewModel(root);

    assert.equal(model.isError, true);
    assert.match(model.message, /central asset package/i);
    assert.match(model.message, /distill/);
  });
});
