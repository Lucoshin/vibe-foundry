import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

import { distillProject } from "../dist/index.js";
import { assetPackageDirectoryFor } from "../dist/library/asset-library.js";
import { openPreviewBuildCache } from "../dist/preview/preview-build-cache.js";
import { writeAssetPackage } from "../dist/writers/asset-writer.js";

const fixtureRoots = [];

async function createFixtureProject() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-"));
  fixtureRoots.push(root);
  await Promise.all([
    mkdir(join(root, "src", "components"), { recursive: true }),
    mkdir(join(root, "src", "app", "api", "auth", "register"), {
      recursive: true,
    }),
    mkdir(join(root, "src", "app", "dashboard"), { recursive: true }),
    mkdir(join(root, "docs"), { recursive: true }),
    mkdir(join(root, "docs", "metaphors"), { recursive: true }),
  ]);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "fixture-app",
        dependencies: {
          next: "15.0.0",
          react: "19.0.0",
        },
        devDependencies: {
          typescript: "5.0.0",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "src", "components", "Button.tsx"),
    "export function Button() { return <button className=\"bg-white rounded-lg p-6 text-sm\" />; }\n",
  );
  await writeFile(
    join(root, "src", "app", "api", "auth", "register", "route.ts"),
    "export async function POST() { return Response.json({ ok: true }); }\n",
  );
  await writeFile(
    join(root, "src", "app", "dashboard", "page.tsx"),
    "export default function DashboardPage() { return <main>Dashboard</main>; }\n",
  );
  await writeFile(
    join(root, "docs", "product.md"),
    [
      "# Product Notes",
      "Onboarding should help new users invite teammates.",
      "Pricing needs an upgrade prompt and clear plan comparison.",
      "Empty state should guide user activation with one primary action.",
    ].join("\n"),
  );
  await writeFile(
    join(root, "docs", "metaphors", "memory-palace.md"),
    [
      "# Memory Palace Notes",
      "Source type: user-notes",
      "The product can feel like a library and memory palace.",
      "A compass helps users return to the right idea.",
      "The tone should be calm, archival, and curious.",
    ].join("\n"),
  );
  return root;
}

async function createMinimalFrontendProject(root, name) {
  await mkdir(join(root, "src", "components"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name, dependencies: { vite: "5.0.0", vue: "3.0.0" } }, null, 2),
  );
  await writeFile(
    join(root, "src", "components", "Card.vue"),
    "<template><section>Card</section></template>\n<script setup></script>\n",
  );
}

describe("distillProject", () => {
  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((root) =>
        rm(root, { recursive: true, force: true }),
      ),
    );
  });

  it("distills Vue components with mutually exclusive platform declarations and explicit analysis limits", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-platform-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(root, libraryRoot);
    await createMinimalFrontendProject(root, "platform-fixture");
    await writeFile(join(root, "src/components/Card.vue"), `<template><button>确认</button></template>
      <script>export default { methods: { open() {
        // #ifdef APP-PLUS
        const initDelay = 900;
        // #endif
        // #ifndef APP-PLUS
        const initDelay = 420;
        // #endif
      } } };</script>`);
    const result = await distillProject(root, { assetLibraryRoot: libraryRoot });
    const manifest = JSON.parse(await readFile(join(result.outputDir, "asset-manifest.json"), "utf8"));
    assert.equal(manifest.assetCounts.components, 1);
    const prompts = await readdir(join(result.outputDir, "component-prompts"));
    const texts = await Promise.all(prompts.filter((file) => file.endsWith(".json")).map((file) => readFile(join(result.outputDir, "component-prompts", file), "utf8")));
    assert.ok(texts.some((text) => text.includes("脚本解析")));
    await assert.rejects(() => access(join(root, ".vibe-foundry")), { code: "ENOENT" });
  });

  it("writes the minimal asset package files for a project", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(libraryRoot);

    const result = await distillProject(root, {
      generatedAt: "2026-07-08T00:00:00.000Z",
      assetLibraryRoot: libraryRoot,
    });

    assert.equal(result.outputDir, assetPackageDirectoryFor(libraryRoot, root));
    await assert.rejects(() => access(join(root, ".vibe-foundry")), { code: "ENOENT" });
    const assetDir = result.outputDir;

    const manifest = JSON.parse(
      await readFile(join(assetDir, "asset-manifest.json"), "utf8"),
    );
    const serviceCatalog = JSON.parse(
      await readFile(join(assetDir, "service-catalog.json"), "utf8"),
    );
    const componentCatalog = JSON.parse(
      await readFile(join(assetDir, "component-catalog.json"), "utf8"),
    );
    const componentPreviews = JSON.parse(
      await readFile(join(assetDir, "component-previews.json"), "utf8"),
    );
    const previewCache = openPreviewBuildCache(assetDir);
    const actionRefs = previewCache.getActionRefs();
    previewCache.close();
    const previewApp = await readFile(
      join(assetDir, "preview-runtime", "src", "App.jsx"),
      "utf8",
    );
    assert.deepEqual(actionRefs, componentPreviews.previews.map((preview) => ({
      componentId: preview.id,
      actionDigest: preview.actionDigest,
      updatedAt: Date.parse("2026-07-08T00:00:00.000Z"),
    })));
    const tokens = JSON.parse(
      await readFile(join(assetDir, "tokens.json"), "utf8"),
    );
    const pagePatterns = await readFile(
      join(assetDir, "page-patterns.md"),
      "utf8",
    );
    const businessPatterns = await readFile(
      join(assetDir, "business-patterns.md"),
      "utf8",
    );
    const reuseReport = await readFile(
      join(assetDir, "reuse-report.md"),
      "utf8",
    );
    const agentRules = await readFile(
      join(assetDir, "agent-rules.md"),
      "utf8",
    );
    const conceptAssets = JSON.parse(
      await readFile(join(assetDir, "concept-assets.json"), "utf8"),
    );
    const metaphorPack = JSON.parse(
      await readFile(
        join(assetDir, "metaphor-packs", "memory-palace.json"),
        "utf8",
      ),
    );
    const index = JSON.parse(await readFile(join(libraryRoot, "index.json"), "utf8"));

    assert.equal(manifest.sourceProject, "fixture-app");
    assert.equal(manifest.projectRoot, resolve(root));
    assert.equal(manifest.generatedAt, "2026-07-08T00:00:00.000Z");
    assert.equal(index.projects[0].projectRoot, manifest.projectRoot);
    assert.equal(index.projects[0].sourceProject, manifest.sourceProject);
    assert.equal(index.projects[0].assetPackageDir, result.outputDir);
    assert.equal(index.projects[0].generatedAt, manifest.generatedAt);
    assert.equal(manifest.framework, "next");
    assert.equal(manifest.assetCounts.components, 1);
    assert.equal(manifest.assetCounts.componentPreviews, 1);
    assert.equal(manifest.assetCounts.services, 1);
    assert.equal(componentCatalog.components[0].name, "Button");
    assert.equal(componentCatalog.components[0].exportMode, "named");
    assert.equal(componentPreviews.previews[0].componentName, "Button");
    assert.equal(componentPreviews.previews[0].status, "degraded");
    assert.deepEqual(componentPreviews.previews[0].limitations, ["missing-source-scenario"]);
    assert.match(componentPreviews.previews[0].browserUrl, /^\/component-preview\//);
    assert.equal("startCommand" in componentPreviews.previews[0], false);
    assert.match(previewApp, /previewModules/);
    assert.equal(serviceCatalog.services[0].name, "auth.register");
    assert.equal(tokens.tokens.length, 4);
    assert.match(pagePatterns, /dashboard page/);
    assert.match(businessPatterns, /auth flow/);
    assert.match(reuseReport, /# Reuse Report/);
    assert.match(reuseReport, /Button/);
    assert.match(reuseReport, /auth\.register/);
    assert.match(agentRules, /# VibeFoundry Agent Rules/);
    assert.match(agentRules, /service-catalog\.json/);
    assert.ok(conceptAssets.conceptAssets.length >= 3);
    assert.ok(
      conceptAssets.conceptAssets.some(
        (asset) => asset.patternType === "onboarding",
      ),
    );
    assert.equal(conceptAssets.metaphorPacks[0].source, "memory-palace");
    assert.equal(metaphorPack.source, "memory-palace");
    assert.ok(metaphorPack.coreMetaphors.length > 0);
    assert.match(metaphorPack.copyrightNotes, /不保存长段原文/);

  });

  it("requires an explicit generated asset directory from the orchestrator", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-writer-"));
    fixtureRoots.push(root);

    await assert.rejects(
      () => writeAssetPackage(root, {}),
      /writeAssetPackage requires options\.outputDir/,
    );
  });

  it("reuses unchanged source parsing and updates component prompts when source or styles change", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-prompt-library-"));
    fixtureRoots.push(libraryRoot);
    const componentPath = join(root, "src", "components", "Button.tsx");
    const componentSource = 'import "./Button.css"; export function Button() { return <button className="button">保存</button>; }\n';
    await writeFile(componentPath, componentSource);
    await writeFile(join(root, "src", "components", "Button.css"), ".button { color: #123456; padding: 12px; }\n");
    const cold = await distillProject(root, { assetLibraryRoot: libraryRoot });
    assert.deepEqual(cold.analysis, { files: 3, parsed: 3, reused: 0 });
    const [promptName] = await readdir(join(cold.outputDir, "component-prompts"));
    const promptPath = join(cold.outputDir, "component-prompts", promptName);
    const coldPrompt = JSON.parse(await readFile(promptPath, "utf8"));
    assert.equal(coldPrompt.filePath, "src/components/Button.tsx");
    assert.equal(coldPrompt.schemaVersion, "0.2.0");
    assert.match(coldPrompt.prompt, /布局/);
    assert.match(coldPrompt.prompt, /视觉/);
    assert.match(coldPrompt.prompt, /动效/);
    assert.match(coldPrompt.prompt, /交互/);
    assert.match(coldPrompt.prompt, /保存/);
    assert.doesNotMatch(coldPrompt.prompt, /export function|import |```|<button/);
    assert.match(coldPrompt.prompt, /#123456/);
    const coldPreview = JSON.parse(await readFile(join(cold.outputDir, "component-previews.json"), "utf8"));

    const warm = await distillProject(root, { assetLibraryRoot: libraryRoot });
    assert.deepEqual(warm.analysis, { files: 3, parsed: 0, reused: 3 });
    assert.deepEqual(JSON.parse(await readFile(promptPath, "utf8")), coldPrompt);
    await writeFile(join(root, "src", "components", "Button.css"), ".button { color: #654321; padding: 12px; }\n");
    const restyled = await distillProject(root, { assetLibraryRoot: libraryRoot });
    assert.deepEqual(restyled.analysis, { files: 3, parsed: 0, reused: 3 });
    const styledPrompt = JSON.parse(await readFile(promptPath, "utf8"));
    assert.notEqual(styledPrompt.sourceDigest, coldPrompt.sourceDigest);
    assert.match(styledPrompt.prompt, /#654321/);
    const styledPreview = JSON.parse(await readFile(join(cold.outputDir, "component-previews.json"), "utf8"));
    assert.notEqual(styledPreview.previews[0].actionDigest, coldPreview.previews[0].actionDigest);

    await writeFile(componentPath, componentSource.replace("保存", "提交"));
    const changed = await distillProject(root, { assetLibraryRoot: libraryRoot });
    assert.deepEqual(changed.analysis, { files: 3, parsed: 1, reused: 2 });
    assert.match(JSON.parse(await readFile(promptPath, "utf8")).prompt, /提交/);
  });

  it("invalidates preview actions for nested styles and binary material bytes", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-material-library-"));
    fixtureRoots.push(libraryRoot);
    await writeFile(join(root, "src/components/Button.tsx"), 'import "./Button.css"; export function Button() { return <button>保存</button>; }\n');
    await writeFile(join(root, "src/components/Button.css"), '@import "./theme.css";\n');
    await writeFile(join(root, "src/components/theme.css"), 'button { color: red; background-image: url("./background.png"); }\n');
    await writeFile(join(root, "src/components/background.png"), Buffer.from([0x80]));
    async function capture() {
      const result = await distillProject(root, { assetLibraryRoot: libraryRoot });
      const [filename] = await readdir(join(result.outputDir, "component-prompts"));
      return {
        analysis: result.analysis,
        prompt: JSON.parse(await readFile(join(result.outputDir, "component-prompts", filename), "utf8")).sourceDigest,
        action: JSON.parse(await readFile(join(result.outputDir, "component-previews.json"), "utf8")).previews[0].actionDigest,
      };
    }
    const cold = await capture();
    const warm = await capture();
    assert.equal(warm.prompt, cold.prompt);
    assert.equal(warm.action, cold.action);
    await writeFile(join(root, "src/components/theme.css"), 'button { color: blue; background-image: url("./background.png"); }\n');
    const styled = await capture();
    assert.deepEqual(styled.analysis, { files: 3, parsed: 0, reused: 3 });
    assert.notEqual(styled.prompt, warm.prompt);
    assert.notEqual(styled.action, warm.action);
    // Both byte sequences decode to the same UTF-8 replacement character.
    await writeFile(join(root, "src/components/background.png"), Buffer.from([0x81]));
    const replaced = await capture();
    assert.notEqual(replaced.prompt, styled.prompt);
    assert.notEqual(replaced.action, styled.action);
  });

  it("writes separate Unicode metaphor files matching the combined catalog", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(libraryRoot);
    await writeFile(join(root, "docs", "metaphors", "山海经.md"), "精卫填海，夸父逐日。\n");
    await writeFile(join(root, "docs", "metaphors", "道德经.md"), "道法自然。\n");

    const { outputDir } = await distillProject(root, { assetLibraryRoot: libraryRoot });
    const catalog = JSON.parse(await readFile(join(outputDir, "concept-assets.json"), "utf8"));

    for (const source of ["山海经", "道德经"]) {
      const pack = JSON.parse(await readFile(join(outputDir, "metaphor-packs", `${source}.json`), "utf8"));
      assert.deepEqual(pack, catalog.metaphorPacks.find((item) => item.source === source));
      assert.deepEqual(pack.coreMetaphors, []);
    }
  });

  it("rejects colliding metaphor filenames before changing any asset package files", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(libraryRoot);
    const { outputDir } = await distillProject(root, { assetLibraryRoot: libraryRoot });
    const manifestBefore = await readFile(join(outputDir, "asset-manifest.json"), "utf8");
    const catalogBefore = await readFile(join(outputDir, "concept-assets.json"), "utf8");
    const indexBefore = await readFile(join(libraryRoot, "index.json"), "utf8");
    await writeFile(join(root, "docs", "metaphors", "memory palace.md"), "A forge transforms materials.\n");

    await assert.rejects(
      () => distillProject(root, { assetLibraryRoot: libraryRoot }),
      /Metaphor filename collision.*memory-palace\.json.*memory palace.*memory-palace/,
    );
    assert.equal(await readFile(join(outputDir, "asset-manifest.json"), "utf8"), manifestBefore);
    assert.equal(await readFile(join(outputDir, "concept-assets.json"), "utf8"), catalogBefore);
    assert.equal(await readFile(join(libraryRoot, "index.json"), "utf8"), indexBefore);
    assert.deepEqual(await readdir(join(outputDir, "metaphor-packs")), ["memory-palace.json"]);
  });

  it("rejects duplicate source names before creating a new asset package", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(libraryRoot);
    await mkdir(join(root, "docs", "metaphors", "nested"));
    await writeFile(join(root, "docs", "metaphors", "nested", "memory-palace.md"), "A forge transforms materials.\n");

    await assert.rejects(
      () => distillProject(root, { assetLibraryRoot: libraryRoot }),
      /Metaphor filename collision.*memory-palace\.json/,
    );
    assert.deepEqual(await readdir(libraryRoot), []);
  });

  it("removes obsolete generated metaphor JSON after redistillation without touching other files", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(libraryRoot);
    const { outputDir } = await distillProject(root, { assetLibraryRoot: libraryRoot });
    const packsDir = join(outputDir, "metaphor-packs");
    await writeFile(join(packsDir, "metaphor-pack.json"), "obsolete Chinese filename");
    await writeFile(join(packsDir, "README.md"), "preserved note");
    await mkdir(join(packsDir, "nested"));
    await writeFile(join(packsDir, "nested", "history.json"), "preserved nested file");
    await writeFile(join(outputDir, "unrelated.json"), "preserved sibling");
    await rm(join(root, "docs", "metaphors", "memory-palace.md"));
    await writeFile(join(root, "docs", "metaphors", "山海经.md"), "精卫填海，夸父逐日。\n");

    await distillProject(root, { assetLibraryRoot: libraryRoot });

    assert.deepEqual((await readdir(packsDir)).sort(), ["README.md", "nested", "山海经.json"]);
    assert.equal(await readFile(join(packsDir, "README.md"), "utf8"), "preserved note");
    assert.equal(await readFile(join(packsDir, "nested", "history.json"), "utf8"), "preserved nested file");
    assert.equal(await readFile(join(outputDir, "unrelated.json"), "utf8"), "preserved sibling");
    assert.equal(await readFile(join(root, "docs", "metaphors", "山海经.md"), "utf8"), "精卫填海，夸父逐日。\n");
  });

  it("rejects a metaphor output directory redirected outside its asset package", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    const externalRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-external-"));
    fixtureRoots.push(libraryRoot, externalRoot);
    const outputDir = assetPackageDirectoryFor(libraryRoot, root);
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(externalRoot, "unrelated.json"), "external data");
    await symlink(externalRoot, join(outputDir, "metaphor-packs"), process.platform === "win32" ? "junction" : "dir");

    await assert.rejects(
      () => distillProject(root, { assetLibraryRoot: libraryRoot }),
      /Metaphor output directory must stay within its asset package/,
    );
    assert.deepEqual(await readdir(outputDir), ["metaphor-packs"]);
    assert.deepEqual(await readdir(externalRoot), ["unrelated.json"]);
    assert.equal(await readFile(join(externalRoot, "unrelated.json"), "utf8"), "external data");
  });

  it("includes Vue page files in structural page analysis", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-vue-pages-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(root, libraryRoot);
    await createMinimalFrontendProject(root, "vue-pages-fixture");
    await mkdir(join(root, "src", "pages"), { recursive: true });
    await writeFile(
      join(root, "src", "pages", "Jobs.vue"),
      "<template><nav /><SearchBar /><JobList /><BottomActionBar /></template>\n",
    );

    const result = await distillProject(root, { assetLibraryRoot: libraryRoot });
    const pagePatterns = await readFile(join(result.outputDir, "page-patterns.md"), "utf8");

    assert.match(pagePatterns, /src\/pages\/Jobs\.vue/);
    assert.match(pagePatterns, /navigation/);
    assert.match(pagePatterns, /search/);
    assert.match(pagePatterns, /list/);
    assert.match(pagePatterns, /bottom-action/);
  });

  it("preserves static component previews when distilling again", async () => {
    const root = await createFixtureProject();
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(libraryRoot);
    const first = await distillProject(root, { assetLibraryRoot: libraryRoot });
    const firstRegistry = JSON.parse(
      await readFile(join(first.outputDir, "component-previews.json"), "utf8"),
    );
    const staleFile = join(first.outputDir, "component-preview-static", "button-old", "index.html");
    await mkdir(join(first.outputDir, "component-preview-static", "button-old"), { recursive: true });
    await writeFile(staleFile, "stale preview");

    await distillProject(root, { assetLibraryRoot: libraryRoot });
    const secondRegistry = JSON.parse(
      await readFile(join(first.outputDir, "component-previews.json"), "utf8"),
    );

    assert.equal(await readFile(staleFile, "utf8"), "stale preview");
    assert.deepEqual(
      secondRegistry.previews.map((preview) => preview.actionDigest),
      firstRegistry.previews.map((preview) => preview.actionDigest),
    );
  });

  it("resolves an outer folder with one frontend package to the real project root", async () => {
    const outerRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-outer-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(outerRoot, libraryRoot);
    const appRoot = join(outerRoot, "apps", "uni-app");
    await createMinimalFrontendProject(appRoot, "uni-app");

    const result = await distillProject(outerRoot, {
      generatedAt: "2026-07-08T00:00:00.000Z",
      assetLibraryRoot: libraryRoot,
    });

    const manifest = JSON.parse(
      await readFile(join(result.outputDir, "asset-manifest.json"), "utf8"),
    );
    const index = JSON.parse(await readFile(join(libraryRoot, "index.json"), "utf8"));

    assert.equal(manifest.projectRoot, appRoot);
    assert.equal(index.projects[0].projectRoot, appRoot);
  });

  it("rejects an outer folder with multiple frontend package candidates", async () => {
    const outerRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-outer-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
    fixtureRoots.push(outerRoot, libraryRoot);
    await createMinimalFrontendProject(join(outerRoot, "apps", "first"), "first-app");
    await createMinimalFrontendProject(join(outerRoot, "apps", "second"), "second-app");

    await assert.rejects(
      () => distillProject(outerRoot, {
        generatedAt: "2026-07-08T00:00:00.000Z",
        assetLibraryRoot: libraryRoot,
      }),
      /Multiple VibeFoundry project candidates/,
    );
  });
});
