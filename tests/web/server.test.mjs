import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  createWebRequestHandler,
  renderWebAppHtml,
  startWebServer,
  webAppCss,
} from "../../dist/web/server.js";
import { assetPackageDirectoryFor, registerAssetPackage } from "../../dist/library/asset-library.js";
import { openPreviewBuildCache } from "../../dist/preview/preview-build-cache.js";
import { browserMountValidatorDigest } from "../../dist/preview/preview-validation.js";
import { buildComponentPreviewRegistry } from "../../dist/preview/component-preview-runtime.js";

const roots = [];
const actionDigest = "a".repeat(64);
const updatedActionDigest = "b".repeat(64);
const originalLibraryRoot = process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
let previewBuildNumber = 0;

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function registerTestProject(libraryRoot, { root, assetDir }) {
  await registerAssetPackage(libraryRoot, {
    projectRoot: root,
    sourceProject: "web-server-fixture",
    assetPackageDir: assetDir,
    generatedAt: "2026-07-08T00:00:00.000Z",
  });
}

async function commitPreviewBundle(assetDir, component, files) {
  const registry = JSON.parse(await readFile(join(assetDir, "component-previews.json"), "utf8"));
  const preview = registry.previews.find((candidate) => candidate.id === component);
  assert.ok(preview?.actionDigest, component);
  previewBuildNumber += 1;
  const outputDir = join(assetDir, "test-preview-output", `${component}-${previewBuildNumber}`);
  for (const [relativePath, body] of Object.entries(files)) {
    const filePath = join(outputDir, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }
  await writeJson(join(outputDir, "preview-manifest.json"), { componentId: component, actionDigest: preview.actionDigest });
  const cache = openPreviewBuildCache(assetDir);
  const owner = `test-worker-${previewBuildNumber}`;
  try {
    assert.equal(cache.claim(preview.actionDigest, owner, { now: Date.now(), ttlMs: 1_000 }), true);
    const committed = await cache.commitSuccess({
      actionDigest: preview.actionDigest,
      leaseOwner: owner,
      outputDir,
      completedAt: Date.now(),
    });
    assert.equal(committed.committed, true);
    return {
      assetDir,
      actionDigest: preview.actionDigest,
      artifactTreeDigest: committed.artifactTreeDigest,
      previewUrl: `/component-preview/${component}/`,
      component: preview.componentName,
    };
  } finally {
    cache.close();
  }
}

async function createAssetPackage() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-web-server-"));
  const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-web-server-library-"));
  const assetDir = assetPackageDirectoryFor(libraryRoot, root);
  roots.push(root, libraryRoot);
  process.env.VIBE_FOUNDRY_LIBRARY_ROOT = libraryRoot;
  await mkdir(assetDir, { recursive: true });
  await writeJson(join(assetDir, "asset-manifest.json"), {
    sourceProject: "web-server-fixture",
    projectRoot: root,
    generatedAt: "2026-07-08T00:00:00.000Z",
    assetCounts: { components: 1, services: 0, businessPatterns: 0, tokens: 0, pagePatterns: 0, conceptAssets: 0, metaphorPacks: 0 },
  });
  await writeJson(join(assetDir, "component-catalog.json"), {
    components: [{ kind: "component", name: "Button", filePath: "src/Button.tsx", exportMode: "named" }],
  });
  await writeJson(join(assetDir, "component-previews.json"), {
    schemaVersion: "0.1.0",
    runtime: "vite-react",
    previews: [
      {
        id: "button-ab12cd",
        componentName: "Button",
        componentPath: "src/Button.tsx",
        status: "degraded",
        buildable: true,
        limitations: ["runtime-validation-pending"],
        runtime: "vite-react",
        browserUrl: "/component-preview/button-ab12cd/",
        interactions: ["hover", "click", "focus"],
        blockers: [],
        actionDigest,
      },
    ],
  });
  await writeJson(join(assetDir, "service-catalog.json"), { services: [], businessPatterns: [] });
  await writeJson(join(assetDir, "tokens.json"), { tokens: [] });
  await writeJson(join(assetDir, "concept-assets.json"), { conceptAssets: [], metaphorPacks: [] });
  await writeFile(join(assetDir, "reuse-report.md"), "# Reuse Report\n");
  await writeFile(join(assetDir, "agent-rules.md"), "# Agent Rules\n");
  return { root, libraryRoot, assetDir };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value = "") {
      this.body += value;
    },
  };
}

async function waitForPreviewResponse(handler, url, pattern) {
  let response = createMockResponse();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    response = createMockResponse();
    await handler({ url, method: "GET" }, response);
    if (pattern.test(response.body)) {
      return response;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  assert.match(response.body, pattern);
  return response;
}

describe("web server frontend", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    if (originalLibraryRoot === undefined) {
      delete process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
    } else {
      process.env.VIBE_FOUNDRY_LIBRARY_ROOT = originalLibraryRoot;
    }
  });

  it("renders the Chinese asset browser shell", () => {
    const html = renderWebAppHtml();

    assert.match(html, /VibeFoundry/);
    assert.match(html, /资产总览/);
    assert.match(html, /搜索资产、来源或复用建议/);
    assert.match(html, /asset-detail/);
    assert.match(html, /复用报告/);
    assert.match(html, /lang="zh-CN"/);
    assert.doesNotMatch(html, /manuscript-canvas/);
    assert.match(webAppCss, /--paper/);
    assert.match(webAppCss, /--graphite/);
    assert.match(webAppCss, /1px solid/);
    assert.match(webAppCss, /--glass/);
  });

  it("routes same-name previews to their own project in library mode", async () => {
    const first = await createAssetPackage();
    const second = await createAssetPackage();
    const assets = [];
    for (const project of [first, second]) {
      const registry = buildComponentPreviewRegistry([{ name: "Button", filePath: "src/Button.tsx", exportMode: "named" }], { projectRoot: project.root });
      await writeJson(join(project.assetDir, "component-previews.json"), registry);
      const preview = registry.previews[0];
      await commitPreviewBundle(project.assetDir, preview.id, { "index.html": `<p>${project.root}</p>` });
      await registerTestProject(first.libraryRoot, project);
      assets.push({ projectRoot: project.root, assetPackageDir: project.assetDir, componentPreview: preview });
    }
    const handler = createWebRequestHandler(undefined, {
      assetLibraryRoot: first.libraryRoot,
      loadAssetLibraryViewModel: async () => assert.fail("Preview requests must not load the full library view model"),
      buildComponentPreviewStaticBundle: async () => assert.fail("Cached previews must not rebuild"),
    });
    for (const asset of assets) {
      const response = createMockResponse();
      await handler({ method: "GET", url: asset.componentPreview.browserUrl }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body, `<p>${asset.projectRoot}</p>`);
    }
  });

  it("rejects colliding ids in cache diagnostics and browser validation", async () => {
    const first = await createAssetPackage();
    const second = await createAssetPackage();
    await commitPreviewBundle(first.assetDir, "button-ab12cd", { "index.html": "<p>First</p>" });
    await registerTestProject(first.libraryRoot, first);
    const handler = createWebRequestHandler(undefined, { assetLibraryRoot: first.libraryRoot });
    const served = createMockResponse();
    await handler({ method: "GET", url: "/component-preview/button-ab12cd/" }, served);
    assert.equal(served.statusCode, 200);
    await registerTestProject(first.libraryRoot, second);

    const diagnostic = createMockResponse();
    await handler({ method: "GET", url: "/api/component-preview-cache/button-ab12cd" }, diagnostic);
    assert.equal(diagnostic.statusCode, 404);
    assert.match(diagnostic.body, /collision.*distill/i);
    const validation = createMockResponse();
    await handler({ method: "POST", url: `/api/component-preview-validation/button-ab12cd?actionDigest=${actionDigest}`, headers: { cookie: served.headers["set-cookie"].split(";")[0] } }, validation);
    assert.equal(validation.statusCode, 500);
    assert.match(validation.body, /collision.*distill/i);
  });

  it("rejects ambiguous legacy preview routes before starting a build", async () => {
    const first = await createAssetPackage();
    const second = await createAssetPackage();
    await registerTestProject(first.libraryRoot, first);
    await registerTestProject(first.libraryRoot, second);
    let builds = 0;
    const handler = createWebRequestHandler(undefined, {
      assetLibraryRoot: first.libraryRoot,
      buildComponentPreviewStaticBundle: async () => { builds += 1; throw new Error("Unexpected build"); },
    });
    const response = createMockResponse();
    await handler({ method: "GET", url: "/component-preview/button-ab12cd/" }, response);
    assert.equal(response.statusCode, 500);
    assert.match(response.body, /preview.*(?:collision|ambiguous|duplicate)|预览.*冲突/i);
    assert.match(response.body, /distill/);
    assert.equal(builds, 0);
  });

  it("loads only the exact component prompt requested from the asset library", async () => {
    const { writeComponentPrompts } = await import("../../dist/library/component-prompts.js");
    const first = await createAssetPackage();
    const second = await createAssetPackage();
    const assets = [];
    for (const [index, project] of [first, second].entries()) {
      const filePath = "src/Button.tsx";
      const record = { schemaVersion: "0.2.0", componentName: "Button", filePath, sourceDigest: String(index + 1).repeat(64), sourceFiles: [filePath], unresolved: [], prompt: index === 0 ? "横向布局，按钮内容居中。" : "纵向布局，使用圆角卡片。" };
      await writeComponentPrompts(project.assetDir, [record]);
      assets.push({ id: "components:project-" + index, category: "components", name: "Button", projectRoot: project.root, assetPackageDir: project.assetDir, raw: { filePath }, expected: record });
    }
    const handler = createWebRequestHandler(undefined, {
      loadAssetLibraryViewModel: async () => ({ assets: assets.map(({expected, ...asset}) => asset) }),
      buildComponentPreviewStaticBundle: async () => assert.fail("Prompt reads must not build previews"),
    });
    for (const asset of assets) {
      const response = createMockResponse();
      await handler({ url: "/api/component-prompt/" + encodeURIComponent(asset.id), method: "GET" }, response);
      assert.equal(response.statusCode, 200);
      assert.deepEqual(JSON.parse(response.body), asset.expected);
    }
    const listResponse = createMockResponse();
    await handler({ url: "/api/assets", method: "GET" }, listResponse);
    assert.doesNotMatch(listResponse.body, /横向布局，按钮内容居中|纵向布局，使用圆角卡片/);
  });

  it("uses the actual project view model to read a component prompt on demand", async () => {
    const { writeComponentPrompts } = await import("../../dist/library/component-prompts.js");
    const { root, assetDir } = await createAssetPackage();
    const record = { schemaVersion: "0.2.0", componentName: "Button", filePath: "src/Button.tsx", sourceDigest: "a".repeat(64), sourceFiles: ["src/Button.tsx"], unresolved: [], prompt: "采用细描边，悬停时显示浅色背景" };
    await writeComponentPrompts(assetDir, [record]);
    const handler = createWebRequestHandler(root);
    const assetsResponse = createMockResponse();
    await handler({ url: "/api/assets", method: "GET" }, assetsResponse);
    assert.equal(assetsResponse.statusCode, 200);
    assert.doesNotMatch(assetsResponse.body, /采用细描边，悬停时显示浅色背景/);
    const component = JSON.parse(assetsResponse.body).assets.find((asset) => asset.category === "components");
    const promptResponse = createMockResponse();
    await handler({ url: "/api/component-prompt/" + encodeURIComponent(component.id), method: "GET" }, promptResponse);
    assert.equal(promptResponse.statusCode, 200);
    assert.deepEqual(JSON.parse(promptResponse.body), record);
  });

  it("reports missing, ambiguous, and legacy component prompts without breaking assets", async () => {
    const { root, assetDir } = await createAssetPackage();
    const asset = { id: "components:legacy", category: "components", projectRoot: root, assetPackageDir: assetDir, raw: { filePath: "src/Button.tsx" } };
    const assets = [asset];
    const handler = createWebRequestHandler(undefined, { loadAssetLibraryViewModel: async () => ({ assets }) });
    const old = createMockResponse();
    await handler({ url: "/api/component-prompt/components%3Alegacy", method: "GET" }, old);
    assert.equal(old.statusCode, 404);
    assert.match(JSON.parse(old.body).message, /distill/);
    const missing = createMockResponse();
    await handler({ url: "/api/component-prompt/unknown", method: "GET" }, missing);
    assert.equal(missing.statusCode, 404);
    assert.match(JSON.parse(missing.body).message, /not found/i);
    assets.push({...asset});
    const ambiguous = createMockResponse();
    await handler({ url: "/api/component-prompt/components%3Alegacy", method: "GET" }, ambiguous);
    assert.equal(ambiguous.statusCode, 409);
    assert.match(JSON.parse(ambiguous.body).message, /ambiguous/i);
    const list = createMockResponse();
    await handler({ url: "/api/assets", method: "GET" }, list);
    assert.equal(list.statusCode, 200);
  });

  it("rejects a source prompt from schema 0.1 without breaking component browsing", async () => {
    const { root, assetDir } = await createAssetPackage();
    const filePath = "src/Button.tsx";
    const directory = join(assetDir, "component-prompts");
    await mkdir(directory);
    const legacy = { schemaVersion: "0.1.0", componentName: "Button", filePath, sourceDigest: "a".repeat(64), sourceFiles: [filePath], unresolved: [], prompt: "export function Button() {}" };
    await writeJson(join(directory, createHash("sha256").update(filePath).digest("hex") + ".json"), legacy);
    const handler = createWebRequestHandler(root);
    const list = createMockResponse();
    await handler({ url: "/api/assets", method: "GET" }, list);
    assert.equal(list.statusCode, 200);
    const asset = JSON.parse(list.body).assets.find((entry) => entry.category === "components");
    const response = createMockResponse();
    await handler({ url: "/api/component-prompt/" + encodeURIComponent(asset.id), method: "GET" }, response);
    assert.equal(response.statusCode, 409);
    assert.match(JSON.parse(response.body).message, /提示词格式已更新，请重新炼化/);
    assert.doesNotMatch(response.body, /export function/);
  });

  it("serves HTML, assets API, and reports", async () => {
    const { root } = await createAssetPackage();
    const handler = createWebRequestHandler(root, { previewWarmup: false });

    const htmlResponse = createMockResponse();
    await handler({ url: "/", method: "GET" }, htmlResponse);

    const assetsResponse = createMockResponse();
    await handler({ url: "/api/assets", method: "GET" }, assetsResponse);

    const reportResponse = createMockResponse();
    await handler({ url: "/api/report/reuse", method: "GET" }, reportResponse);

    assert.match(htmlResponse.body, /VibeFoundry/);
    assert.equal(JSON.parse(assetsResponse.body).project.sourceProject, "web-server-fixture");
    assert.match(reportResponse.body, /Reuse Report/);
  });

  it("forwards handler options when starting the web server", async () => {
    const { root } = await createAssetPackage();
    const started = await startWebServer(root, {
      port: 0,
      loadAssetViewModel: async () => ({
        isError: false,
        project: { sourceProject: "injected-model" },
        reports: { reuse: "", rules: "" },
      }),
    });
    try {
      const address = started.server.address();
      const response = await fetch(`http://127.0.0.1:${address.port}/api/assets`);
      const model = await response.json();
      assert.equal(model.project.sourceProject, "injected-model");
    } finally {
      await new Promise((resolvePromise, reject) => started.server.close((error) => error ? reject(error) : resolvePromise()));
    }
  });

  it("returns 400 for malformed percent encoding without breaking later requests", async () => {
    const { root } = await createAssetPackage();
    const handler = createWebRequestHandler(root);
    const requests = [
      { url: "/api/component-prompt/%", method: "GET", headers: {} },
      { url: "/component-preview/%", method: "GET", headers: {} },
      { url: "/api/component-preview-cache/%", method: "GET", headers: {} },
      { url: "/api/component-preview-validation/%", method: "POST", headers: {} },
      {
        url: `/api/component-preview-validation/button-ab12cd?actionDigest=${actionDigest}`,
        method: "POST",
        headers: { cookie: "vibe_preview_mount=%" },
      },
    ];

    for (const request of requests) {
      const response = createMockResponse();
      await handler(request, response);
      assert.equal(response.statusCode, 400, request.url);
    }

    const healthyResponse = createMockResponse();
    await handler({ url: "/", method: "GET", headers: {} }, healthyResponse);
    assert.equal(healthyResponse.statusCode, 200);
    assert.match(healthyResponse.body, /VibeFoundry/);
  });

  it("promotes only a browser-mounted complete preview to ready", async () => {
    const { root, assetDir } = await createAssetPackage();
    const handler = createWebRequestHandler(root);
    const outputDir = join(root, "mounted-preview-output");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "index.html"), "<!doctype html><title>Mounted Preview</title>");
    const seedCache = openPreviewBuildCache(assetDir);
    seedCache.claim(actionDigest, "seed-worker", { now: 100, ttlMs: 100 });
    await seedCache.commitSuccess({
      actionDigest,
      leaseOwner: "seed-worker",
      outputDir,
      completedAt: 101,
    });
    seedCache.close();
    const registryBeforeValidation = await readFile(
      join(assetDir, "component-previews.json"),
      "utf8",
    );

    const rejected = createMockResponse();
    await handler({
      url: `/api/component-preview-validation/button-ab12cd?actionDigest=${actionDigest}`,
      method: "POST",
      headers: {},
    }, rejected);
    assert.equal(rejected.statusCode, 409);

    const previewResponse = createMockResponse();
    await handler({
      url: "/component-preview/button-ab12cd/",
      method: "GET",
      headers: {},
    }, previewResponse);
    assert.match(previewResponse.body, /Mounted Preview/);
    assert.match(previewResponse.headers["set-cookie"], /vibe_preview_mount=/);

    const response = createMockResponse();

    await handler({
      url: `/api/component-preview-validation/button-ab12cd?actionDigest=${actionDigest}`,
      method: "POST",
      headers: { cookie: previewResponse.headers["set-cookie"] },
    }, response);

    assert.equal(response.statusCode, 204);
    assert.equal(
      await readFile(join(assetDir, "component-previews.json"), "utf8"),
      registryBeforeValidation,
    );
    const cache = openPreviewBuildCache(assetDir);
    const lookup = await cache.lookup(actionDigest);
    const validation = cache.getValidation(
      lookup.artifactTreeDigest,
      browserMountValidatorDigest,
    );
    assert.equal(validation.state, "ready");
    assert.match(validation.evidenceDigest, /^[a-f0-9]{64}$/);
    cache.close();
  });

  it("serves a CAS action hit after a handler-shaped service restart", async () => {
    const { root, assetDir } = await createAssetPackage();
    const outputDir = join(root, "seed-preview-output");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "index.html"), "<!doctype html><title>CAS Preview</title>");
    const cache = openPreviewBuildCache(assetDir);
    cache.claim(actionDigest, "seed-worker", { now: 100, ttlMs: 100 });
    await cache.commitSuccess({
      actionDigest,
      leaseOwner: "seed-worker",
      outputDir,
      completedAt: 101,
    });
    cache.close();
    let buildCount = 0;
    const createHandler = () => createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async () => {
        buildCount += 1;
        throw new Error("should not rebuild a persisted action");
      },
    });

    const firstResponse = createMockResponse();
    await createHandler()({ url: "/component-preview/button-ab12cd/", method: "GET" }, firstResponse);
    const restartedResponse = createMockResponse();
    await createHandler()({ url: "/component-preview/button-ab12cd/", method: "GET" }, restartedResponse);

    assert.match(firstResponse.body, /CAS Preview/);
    assert.match(restartedResponse.body, /CAS Preview/);
    assert.equal(buildCount, 0);
  });

  it("explains the persisted cache decision without exposing build inputs", async () => {
    const { root, assetDir } = await createAssetPackage();
    const outputDir = join(root, "seed-preview-output");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "index.html"), "<!doctype html><title>CAS Preview</title>");
    const cache = openPreviewBuildCache(assetDir);
    cache.claim(actionDigest, "seed-worker", { now: 100, ttlMs: 100 });
    await cache.commitSuccess({
      actionDigest,
      leaseOwner: "seed-worker",
      outputDir,
      completedAt: 101,
    });
    cache.close();
    const handler = createWebRequestHandler(root);

    const response = createMockResponse();
    await handler({
      url: "/api/component-preview-cache/button-ab12cd",
      method: "GET",
    }, response);
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(payload.reason, "HIT");
    assert.equal(payload.actionDigest, actionDigest);
    assert.deepEqual(Object.keys(payload).sort(), [
      "actionDigest",
      "artifactTreeDigest",
      "component",
      "reason",
      "state",
    ]);
  });

  it("does not build every component preview while serving the assets API", async () => {
    const { root } = await createAssetPackage();
    const buildCalls = [];
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async (projectRoot, options) => {
        buildCalls.push({ projectRoot, options });
        throw new Error("assets API must not start a preview build");
      },
    });

    const response = createMockResponse();
    await handler({ url: "/api/assets", method: "GET" }, response);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));

    assert.equal(response.statusCode, 200);
    assert.equal(buildCalls.length, 0);
  });

  it("serves component previews from the asset browser origin", async () => {
    const { root, assetDir } = await createAssetPackage();
    const buildCalls = [];
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async (projectRoot, options) => {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
        buildCalls.push({ projectRoot, options });
        return commitPreviewBundle(options.assetDir, options.component, {
          "index.html": "<!doctype html><title>Button Preview</title>",
          "assets/app.js": "console.log('preview');",
        });
      },
    });

    const htmlResponse = createMockResponse();
    await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, htmlResponse);

    const readyHtmlResponse = await waitForPreviewResponse(
      handler,
      "/component-preview/button-ab12cd/",
      /Button Preview/,
    );

    const assetResponse = createMockResponse();
    await handler({ url: "/component-preview/button-ab12cd/assets/app.js", method: "GET" }, assetResponse);

    assert.equal(htmlResponse.statusCode, 200);
    assert.equal(htmlResponse.headers["content-type"], "text/html; charset=utf-8");
    assert.match(htmlResponse.body, /正在生成组件预览/);
    assert.doesNotMatch(htmlResponse.body, /http-equiv="refresh"/);
    assert.equal(htmlResponse.headers["x-vibe-preview-state"], "building");
    assert.equal(readyHtmlResponse.statusCode, 200);
    assert.match(readyHtmlResponse.body, /Button Preview/);
    assert.equal(assetResponse.statusCode, 200);
    assert.equal(assetResponse.headers["content-type"], "text/javascript; charset=utf-8");
    assert.match(assetResponse.body, /preview/);
    assert.deepEqual(buildCalls, [
      {
        projectRoot: root,
        options: { component: "button-ab12cd", assetDir },
      },
    ]);
  });

  it("ignores a legacy static preview directory and builds on an Action Cache miss", async () => {
    const { root, assetDir } = await createAssetPackage();
    const legacyDir = join(assetDir, "component-preview-static", "button-ab12cd");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, "index.html"), "<!doctype html><title>Legacy Preview</title>");
    await writeFile(join(legacyDir, ".vibe-foundry-preview-cache-key"), `${actionDigest}\n`);
    let buildCount = 0;
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async (_projectRoot, options) => {
        buildCount += 1;
        return commitPreviewBundle(options.assetDir, options.component, {
          "index.html": "<!doctype html><title>Fresh Preview</title>",
        });
      },
    });

    const initial = createMockResponse();
    await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, initial);
    const ready = await waitForPreviewResponse(handler, "/component-preview/button-ab12cd/", /Fresh Preview/);

    assert.equal(initial.statusCode, 200);
    assert.match(initial.body, /正在生成组件预览/);
    assert.match(ready.body, /Fresh Preview/);
    assert.doesNotMatch(ready.body, /Legacy Preview/);
    assert.equal(buildCount, 1);
  });

  it("does not reuse an in-memory preview record after its action digest changes", async () => {
    const { root, assetDir } = await createAssetPackage();
    let buildCount = 0;
    const builtDigests = [];
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async (_projectRoot, options) => {
        buildCount += 1;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
        const bundle = await commitPreviewBundle(options.assetDir, options.component, {
          "index.html": `<!doctype html><title>Build ${buildCount}</title>`,
        });
        builtDigests.push(bundle.actionDigest);
        return bundle;
      },
    });

    const firstResponse = createMockResponse();
    await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, firstResponse);

    const readyFirstResponse = await waitForPreviewResponse(
      handler,
      "/component-preview/button-ab12cd/",
      /Build 1/,
    );

    const registryPath = join(assetDir, "component-previews.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.previews[0].actionDigest = updatedActionDigest;
    await writeJson(registryPath, registry);

    const secondResponse = createMockResponse();
    await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, secondResponse);

    const readySecondResponse = await waitForPreviewResponse(
      handler,
      "/component-preview/button-ab12cd/",
      /Build 2/,
    );

    assert.equal(firstResponse.statusCode, 200);
    assert.match(firstResponse.body, /正在生成组件预览/);
    assert.match(readyFirstResponse.body, /Build 1/);
    assert.equal(secondResponse.statusCode, 200);
    assert.match(secondResponse.body, /正在生成组件预览/);
    assert.match(readySecondResponse.body, /Build 2/);
    assert.equal(buildCount, 2);
    assert.deepEqual(builtDigests, [actionDigest, updatedActionDigest]);
  });

  it("keeps the loading document stable while probing and navigates once when the build ends", async () => {
    const { root, assetDir } = await createAssetPackage();
    let completeBuild;
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async () => {
        await new Promise(resolvePromise => { completeBuild = resolvePromise; });
        return commitPreviewBundle(assetDir, "button-ab12cd", { "index.html": "ready" });
      },
    });
    const loading = createMockResponse();
    await handler({ method: "GET", url: "/component-preview/button-ab12cd/" }, loading);
    assert.doesNotMatch(loading.body, /http-equiv="refresh"/);
    const script = loading.body.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    const timers = [];
    let reloads = 0;
    let state = "building";
    const run = new Function("window", "document", "fetch", "setTimeout", script);
    run(
      { location: { href: "http://localhost/component-preview/button-ab12cd/", reload: () => { reloads += 1; } } },
      { getElementById: () => ({ textContent: "" }) },
      async () => ({ ok: true, headers: { get: () => state } }),
      callback => timers.push(callback),
    );
    await timers.shift()();
    assert.equal(reloads, 0);
    assert.equal(timers.length, 1);
    state = "ready";
    await timers.shift()();
    assert.equal(reloads, 1);
    assert.equal(timers.length, 0);
    let failurePage = "";
    run(
      { location: { href: "http://localhost/component-preview/button-ab12cd/", reload: () => { reloads += 1; } } },
      { open() {}, write(html) { failurePage = html; }, close() {} },
      async () => ({ ok: false, headers: { get: () => null }, text: async () => "<p>组件预览暂不可用</p>" }),
      callback => timers.push(callback),
    );
    await timers.shift()();
    assert.equal(reloads, 1);
    assert.equal(timers.length, 0);
    assert.match(failurePage, /组件预览暂不可用/);
    completeBuild();
    await waitForPreviewResponse(handler, "/component-preview/button-ab12cd/", /ready/);
  });

  it("returns a calm Chinese HTML failure for a missing Vue 2.6 compiler without scheduling a build", async () => {
    const { root, assetDir } = await createAssetPackage();
    const vueDir = join(root, "node_modules", "vue");
    await mkdir(vueDir, { recursive: true });
    await writeJson(join(vueDir, "package.json"), { name: "vue", version: "2.6.12" });
    const registryPath = join(assetDir, "component-previews.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.previews[0].runtime = "vite-vue";
    await writeJson(registryPath, registry);
    const cache = openPreviewBuildCache(assetDir);
    cache.claim(actionDigest, "old-builder", { now: 100, ttlMs: 100 });
    await cache.commitFailure({ actionDigest, leaseOwner: "old-builder", failureClass: "deterministic", failureCode: "BUILD_ERROR", completedAt: 101 });
    cache.close();
    let builds = 0;
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async () => { builds += 1; throw new Error("Unexpected build"); },
    });
    const response = createMockResponse();
    await handler({ method: "GET", url: "/component-preview/button-ab12cd/" }, response);
    assert.equal(response.statusCode, 500);
    assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
    assert.match(response.body, /vue-template-compiler/);
    assert.match(response.body, /color-scheme: light/);
    assert.doesNotMatch(response.body, /Cached component preview|BUILD_ERROR|http-equiv="refresh"|<script>/);
    assert.equal(builds, 0);
  });

  it("serves assets from the HTML's action version after re-distillation and a service restart", async () => {
    const { root, assetDir } = await createAssetPackage();
    const component = "button-ab12cd";
    const oldVersionUrl = `/component-preview/${component}/${actionDigest}/`;
    await commitPreviewBundle(assetDir, component, {
      "index.html": `<script type="module" src="${oldVersionUrl}assets/old-hash.js"></script>`,
      "assets/old-hash.js": "window.preview = 'version A';",
    });
    const handler = createWebRequestHandler(root);
    const html = createMockResponse();
    await handler({ method: "GET", url: `/component-preview/${component}/` }, html);
    assert.equal(html.statusCode, 200);
    assert.match(html.body, /old-hash\.js/);
    const registryPath = join(assetDir, "component-previews.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.previews[0].actionDigest = updatedActionDigest;
    await writeJson(registryPath, registry);
    await commitPreviewBundle(assetDir, component, {
      "index.html": "<title>version B</title>",
      "assets/new-hash.js": "window.preview = 'version B';",
    });
    for (const serve of [handler, createWebRequestHandler(root)]) {
      const oldAsset = createMockResponse();
      await serve({ method: "GET", url: `${oldVersionUrl}assets/old-hash.js` }, oldAsset);
      assert.equal(oldAsset.statusCode, 200);
      assert.match(oldAsset.body, /version A/);
      const latestHtml = createMockResponse();
      await serve({ method: "GET", url: `/component-preview/${component}/` }, latestHtml);
      assert.match(latestHtml.body, /version B/);
    }
    const staleValidation = createMockResponse();
    await handler({
      method: "POST", url: `/api/component-preview-validation/${component}?actionDigest=${actionDigest}`,
      headers: { cookie: html.headers["set-cookie"].split(";")[0] },
    }, staleValidation);
    assert.equal(staleValidation.statusCode, 409);
  });

  it("does not serve another component's cached action through a versioned URL", async () => {
    const { root, assetDir } = await createAssetPackage();
    const registryPath = join(assetDir, "component-previews.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.previews.push({ ...registry.previews[0], id: "another-component", actionDigest: updatedActionDigest });
    await writeJson(registryPath, registry);
    await commitPreviewBundle(assetDir, "another-component", { "index.html": "other component", "assets/private.js": "other source" });
    const response = createMockResponse();
    await createWebRequestHandler(root)({
      method: "GET", url: `/component-preview/button-ab12cd/${updatedActionDigest}/assets/private.js`,
    }, response);
    assert.equal(response.statusCode, 404);
    assert.doesNotMatch(response.body, /other source/);
  });

  it("does not validate a new action using an old HTML mount token", async () => {
    const { root, assetDir } = await createAssetPackage();
    await commitPreviewBundle(assetDir, "button-ab12cd", { "index.html": "version A" });
    const handler = createWebRequestHandler(root);
    const html = createMockResponse();
    await handler({ method: "GET", url: "/component-preview/button-ab12cd/" }, html);
    const registryPath = join(assetDir, "component-previews.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.previews[0].actionDigest = updatedActionDigest;
    await writeJson(registryPath, registry);
    await commitPreviewBundle(assetDir, "button-ab12cd", { "index.html": "version B" });
    const response = createMockResponse();
    await handler({
      method: "POST", url: `/api/component-preview-validation/button-ab12cd?actionDigest=${actionDigest}`,
      headers: { cookie: html.headers["set-cookie"].split(";")[0] },
    }, response);
    assert.equal(response.statusCode, 409);
  });

  it("rejects an old iframe's mount report even when the browser sends the new iframe's shared cookie", async () => {
    const { root, assetDir } = await createAssetPackage();
    await commitPreviewBundle(assetDir, "button-ab12cd", { "index.html": "version A" });
    const handler = createWebRequestHandler(root);
    await handler({ method: "GET", url: "/component-preview/button-ab12cd/" }, createMockResponse());
    const registryPath = join(assetDir, "component-previews.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.previews[0].actionDigest = updatedActionDigest;
    await writeJson(registryPath, registry);
    await commitPreviewBundle(assetDir, "button-ab12cd", { "index.html": "version B" });
    const currentHtml = createMockResponse();
    await handler({ method: "GET", url: "/component-preview/button-ab12cd/" }, currentHtml);
    const sharedCookie = currentHtml.headers["set-cookie"].split(";")[0];
    const staleReport = createMockResponse();
    await handler({
      method: "POST", url: `/api/component-preview-validation/button-ab12cd?actionDigest=${actionDigest}`,
      headers: { cookie: sharedCookie },
    }, staleReport);
    assert.equal(staleReport.statusCode, 409);
    const currentReport = createMockResponse();
    await handler({
      method: "POST", url: `/api/component-preview-validation/button-ab12cd?actionDigest=${updatedActionDigest}`,
      headers: { cookie: sharedCookie },
    }, currentReport);
    assert.equal(currentReport.statusCode, 204);
  });

  it("reports a failed background preview without refresh loops and retries only a changed action", async () => {
    const { root, assetDir } = await createAssetPackage();
    let buildCount = 0;
    const unhandled = [];
    const onUnhandled = (error) => unhandled.push(error);
    process.on("unhandledRejection", onUnhandled);
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async (projectRoot, options) => {
        buildCount += 1;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
        const registry = JSON.parse(await readFile(join(assetDir, "component-previews.json"), "utf8"));
        if (registry.previews[0].actionDigest === actionDigest) {
          const cache = openPreviewBuildCache(assetDir);
          try {
            if (!cache.getAction(actionDigest)) {
              const owner = "failed-preview-worker";
              assert.equal(cache.claim(actionDigest, owner, { now: Date.now(), ttlMs: 1_000 }), true);
              await cache.commitFailure({ actionDigest, leaseOwner: owner, failureClass: "deterministic", failureCode: "BUILD_ERROR", completedAt: Date.now() });
            }
          } finally {
            cache.close();
          }
          throw new Error("Cached component preview build failure: BUILD_ERROR");
        }
        return commitPreviewBundle(options.assetDir, options.component, {
          "index.html": "<!doctype html><title>Recovered Preview</title>",
        });
      },
    });

    try {
      const firstResponse = createMockResponse();
      await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, firstResponse);

      await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const failedResponse = createMockResponse();
        await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, failedResponse);
        assert.equal(failedResponse.statusCode, 500);
        assert.equal(failedResponse.headers["content-type"], "text/html; charset=utf-8");
        assert.match(failedResponse.body, /组件预览暂不可用/);
        assert.match(failedResponse.body, /BUILD_ERROR/);
        assert.doesNotMatch(failedResponse.body, /refresh|正在生成组件预览/);
      }
      assert.equal(buildCount, 1);
      const failedCache = openPreviewBuildCache(assetDir);
      try {
        assert.equal((await failedCache.lookup(actionDigest)).reason, "NEGATIVE_CACHE_HIT");
      } finally {
        failedCache.close();
      }
      const restartedHandler = createWebRequestHandler(root, {
        buildComponentPreviewStaticBundle: async () => {
          buildCount += 1;
          throw new Error("Negative cached actions must not restart the builder");
        },
      });
      const persistedFailure = createMockResponse();
      await restartedHandler({ url: "/component-preview/button-ab12cd/", method: "GET" }, persistedFailure);
      assert.equal(persistedFailure.statusCode, 500);
      assert.match(persistedFailure.body, /BUILD_ERROR/);
      assert.doesNotMatch(persistedFailure.body, /refresh|正在生成组件预览/);
      assert.equal(buildCount, 1);

      const registryPath = join(assetDir, "component-previews.json");
      const registry = JSON.parse(await readFile(registryPath, "utf8"));
      registry.previews[0].actionDigest = updatedActionDigest;
      await writeJson(registryPath, registry);

      const readyResponse = await waitForPreviewResponse(
        handler,
        "/component-preview/button-ab12cd/",
        /Recovered Preview/,
      );

      assert.equal(firstResponse.statusCode, 200);
      assert.match(firstResponse.body, /正在生成组件预览/);
      assert.equal(readyResponse.statusCode, 200);
      assert.equal(buildCount, 2);
      assert.deepEqual(unhandled, []);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("limits six concurrent preview requests to two builds and continues after a failure", async () => {
    const { root, assetDir } = await createAssetPackage();
    const registryPath = join(assetDir, "component-previews.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    const [original] = registry.previews;
    registry.previews = Array.from({ length: 6 }, (_, index) => ({
      ...original,
      id: `component-${index}`,
      actionDigest: String(index + 1).repeat(64),
    }));
    await writeJson(registryPath, registry);
    let active = 0;
    let maximumActive = 0;
    let finished = 0;
    const buildCalls = [];
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async (_projectRoot, options) => {
        buildCalls.push(options.component);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          await new Promise(resolvePromise => setTimeout(resolvePromise, 40));
          if (options.component === "component-0") throw new Error("First component failed");
          return await commitPreviewBundle(options.assetDir, options.component, {
            "index.html": `<title>Ready ${options.component}</title>`,
          });
        } finally {
          active -= 1;
          finished += 1;
        }
      },
    });
    const previews = [...registry.previews, registry.previews[0]];
    await Promise.all(previews.map(preview => handler({
      url: `/component-preview/${preview.id}/`, method: "GET",
    }, createMockResponse())));
    for (let attempt = 0; finished < 6 && attempt < 100; attempt += 1) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
    assert.equal(finished, 6);
    assert.equal(maximumActive, 2);
    assert.deepEqual([...buildCalls].sort(), registry.previews.map(preview => preview.id).sort());
    for (const preview of registry.previews) {
      const response = createMockResponse();
      await handler({ url: `/component-preview/${preview.id}/`, method: "GET" }, response);
      assert.equal(response.statusCode, preview.id === "component-0" ? 500 : 200);
      assert.match(response.body, preview.id === "component-0" ? /First component failed/ : new RegExp(`Ready ${preview.id}`));
    }
    assert.equal(buildCalls.length, 6);
  });

  it("allows a transient failed action to retry after reporting its error", async () => {
    const { root, assetDir } = await createAssetPackage();
    let buildCount = 0;
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async (_projectRoot, options) => {
        buildCount += 1;
        await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
        if (buildCount === 1) {
          const cache = openPreviewBuildCache(assetDir);
          try {
            const owner = "transient-preview-worker";
            assert.equal(cache.claim(actionDigest, owner, { now: 100, ttlMs: 1_000 }), true);
            await cache.commitFailure({ actionDigest, leaseOwner: owner, failureClass: "transient", failureCode: "EBUSY", completedAt: 101 });
          } finally {
            cache.close();
          }
          throw new Error("Transient preview build failure: EBUSY");
        }
        return commitPreviewBundle(options.assetDir, options.component, {
          "index.html": "<title>Recovered transient preview</title>",
        });
      },
    });
    await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, createMockResponse());
    const failedResponse = await waitForPreviewResponse(handler, "/component-preview/button-ab12cd/", /EBUSY/);
    assert.equal(failedResponse.statusCode, 500);
    assert.doesNotMatch(failedResponse.body, /refresh/);
    assert.equal(buildCount, 1);
    const readyResponse = await waitForPreviewResponse(handler, "/component-preview/button-ab12cd/", /Recovered transient preview/);
    assert.equal(readyResponse.statusCode, 200);
    assert.equal(buildCount, 2);
  });

  it("passes the centralized asset package directory into component preview builds", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-web-source-"));
    const assetPackageDir = await mkdtemp(join(tmpdir(), "vibe-foundry-web-library-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-web-index-"));
    roots.push(sourceRoot, assetPackageDir, libraryRoot);
    await writeJson(join(assetPackageDir, "component-previews.json"), {
      previews: [{ id: "button-ab12cd", componentName: "Button", actionDigest }],
    });
    await registerTestProject(libraryRoot, { root: sourceRoot, assetDir: assetPackageDir });
    const handler = createWebRequestHandler(undefined, {
      assetLibraryRoot: libraryRoot,
      buildComponentPreviewStaticBundle: async (projectRoot, options) => {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
        assert.equal(projectRoot, sourceRoot);
        assert.equal(options.assetDir, assetPackageDir);
        return commitPreviewBundle(options.assetDir, options.component, {
          "index.html": "<!doctype html><title>Central Preview</title>",
        });
      },
    });

    const response = createMockResponse();
    await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, response);

    const readyResponse = await waitForPreviewResponse(
      handler,
      "/component-preview/button-ab12cd/",
      /Central Preview/,
    );

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /正在生成组件预览/);
    assert.match(readyResponse.body, /Central Preview/);
  });

  it("uses updated library preview digests without reading reports or asset catalogs", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-web-preview-source-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-web-preview-library-"));
    const assetDir = assetPackageDirectoryFor(libraryRoot, sourceRoot);
    roots.push(sourceRoot, libraryRoot);
    await mkdir(assetDir, { recursive: true });
    await registerTestProject(libraryRoot, { root: sourceRoot, assetDir });
    const handler = createWebRequestHandler(undefined, {
      assetLibraryRoot: libraryRoot,
      buildComponentPreviewStaticBundle: async () => assert.fail("Persisted previews must not rebuild"),
    });
    for (const digest of [actionDigest, updatedActionDigest]) {
      await writeJson(join(assetDir, "component-previews.json"), {
        previews: [{ id: "button-ab12cd", componentName: "Button", actionDigest: digest }],
      });
      await commitPreviewBundle(assetDir, "button-ab12cd", { "index.html": `<p>${digest}</p>`, "assets/app.js": digest });
      for (const path of ["", "assets/app.js"]) {
        const response = createMockResponse();
        await handler({ url: `/component-preview/button-ab12cd/${path}`, method: "GET" }, response);
        assert.equal(response.statusCode, 200);
        assert.match(response.body, new RegExp(digest));
      }
      const diagnostic = createMockResponse();
      await handler({ url: "/api/component-preview-cache/button-ab12cd", method: "GET" }, diagnostic);
      assert.equal(diagnostic.statusCode, 200);
      assert.equal(JSON.parse(diagnostic.body).actionDigest, digest);
    }
  });
});
