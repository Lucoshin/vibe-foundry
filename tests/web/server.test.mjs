import assert from "node:assert/strict";
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
import { assetPackageDirectoryFor } from "../../dist/library/asset-library.js";
import { openPreviewBuildCache } from "../../dist/preview/preview-build-cache.js";
import { browserMountValidatorDigest } from "../../dist/preview/preview-validation.js";

const roots = [];
const actionDigest = "a".repeat(64);
const updatedActionDigest = "b".repeat(64);
const originalLibraryRoot = process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
let previewBuildNumber = 0;

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
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

  it("renders a Chinese manuscript asset browser shell", () => {
    const html = renderWebAppHtml();

    assert.match(html, /VibeFoundry/);
    assert.match(html, /资产总览/);
    assert.match(html, /搜索资产、来源或复用建议/);
    assert.match(html, /asset-detail/);
    assert.match(html, /复用报告/);
    assert.match(html, /lang="zh-CN"/);
    assert.match(html, /manuscript-canvas/);
    assert.match(webAppCss, /--paper/);
    assert.match(webAppCss, /--graphite/);
    assert.match(webAppCss, /1px solid/);
    assert.match(webAppCss, /--glass/);
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
      { url: "/component-preview/%", method: "GET", headers: {} },
      { url: "/api/component-preview-cache/%", method: "GET", headers: {} },
      { url: "/api/component-preview-validation/%", method: "POST", headers: {} },
      {
        url: "/api/component-preview-validation/button-ab12cd",
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
      url: "/api/component-preview-validation/button-ab12cd",
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
      url: "/api/component-preview-validation/button-ab12cd",
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
    assert.match(htmlResponse.body, /refresh/);
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

  it("retries a failed background preview build instead of pinning a stale failure", async () => {
    const { root } = await createAssetPackage();
    let buildCount = 0;
    const unhandled = [];
    const onUnhandled = (error) => unhandled.push(error);
    process.on("unhandledRejection", onUnhandled);
    const handler = createWebRequestHandler(root, {
      buildComponentPreviewStaticBundle: async (projectRoot, options) => {
        buildCount += 1;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
        if (buildCount === 1) {
          throw new Error("temporary preview failure");
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

      const retryResponse = createMockResponse();
      await handler({ url: "/component-preview/button-ab12cd/", method: "GET" }, retryResponse);

      const readyResponse = await waitForPreviewResponse(
        handler,
        "/component-preview/button-ab12cd/",
        /Recovered Preview/,
      );

      assert.equal(firstResponse.statusCode, 200);
      assert.match(firstResponse.body, /正在生成组件预览/);
      assert.equal(retryResponse.statusCode, 200);
      assert.match(retryResponse.body, /正在生成组件预览/);
      assert.equal(readyResponse.statusCode, 200);
      assert.equal(buildCount, 2);
      assert.deepEqual(unhandled, []);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("passes the centralized asset package directory into component preview builds", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-web-source-"));
    const assetPackageDir = await mkdtemp(join(tmpdir(), "vibe-foundry-web-library-"));
    roots.push(sourceRoot, assetPackageDir);
    await writeJson(join(assetPackageDir, "component-previews.json"), {
      previews: [{ id: "button-ab12cd", componentName: "Button", actionDigest }],
    });
    const handler = createWebRequestHandler(undefined, {
      loadAssetLibraryViewModel: async () => ({
        isError: false,
        assets: [
          {
            name: "Button",
            projectRoot: sourceRoot,
            assetPackageDir,
            componentPreview: { id: "button-ab12cd", actionDigest },
          },
        ],
      }),
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
});
