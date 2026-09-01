import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import {
  assetPackageDirectoryFor,
  resolveAssetLibraryRoot,
} from "../library/asset-library.js";
import { buildComponentPreviewStaticBundle } from "../preview/component-preview-runtime.js";
import { openPreviewBuildCache } from "../preview/preview-build-cache.js";
import {
  browserMountValidatorDigest,
  createBrowserMountEvidence,
} from "../preview/preview-validation.js";
import { loadAssetLibraryViewModel, loadAssetViewModel } from "./asset-view-model.js";
import { renderWebAppHtml, webAppCss } from "./frontend.js";

export { renderWebAppHtml, webAppCss };

function send(response, statusCode, contentType, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.end(body);
}

function contentTypeFor(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function isSafeRelativePath(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/");
  return normalized.length > 0 && !normalized.split("/").includes("..");
}

function decodeURIComponentOrNull(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseComponentPreviewPath(pathname) {
  const prefix = "/component-preview/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const rest = decodeURIComponentOrNull(pathname.slice(prefix.length));
  if (rest === null) {
    return null;
  }
  const slashIndex = rest.indexOf("/");
  const component = slashIndex >= 0 ? rest.slice(0, slashIndex) : rest;
  const filePath = slashIndex >= 0 ? rest.slice(slashIndex + 1) : "";
  if (!component || !isSafeRelativePath(component)) {
    return null;
  }
  const assetPath = filePath || "index.html";
  if (!isSafeRelativePath(assetPath)) {
    return null;
  }
  return { component, assetPath };
}

function loadingPreviewHtml(component) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="refresh" content="0.8" />
    <title>正在生成组件预览</title>
    <style>
      html, body { margin: 0; min-height: 100%; background: #fff; color: #1d1d1f; font-family: -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 18px; box-sizing: border-box; }
      section { width: min(320px, 100%); border: 1px solid #d2d2d7; border-radius: 12px; padding: 18px; text-align: center; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08); }
      strong { display: block; margin-bottom: 8px; font-size: 15px; }
      p { margin: 0; color: #6e6e73; font-size: 13px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <strong>正在生成组件预览</strong>
        <p>${component} 首次预览正在后台构建，完成后会自动刷新。</p>
      </section>
    </main>
  </body>
</html>
`;
}

export function createWebRequestHandler(projectRoot, options = {}) {
  const buildStaticBundle = options.buildComponentPreviewStaticBundle ?? buildComponentPreviewStaticBundle;
  const loadProjectModel = options.loadAssetViewModel ?? loadAssetViewModel;
  const loadLibraryModel = options.loadAssetLibraryViewModel ?? loadAssetLibraryViewModel;
  const libraryRoot = resolveAssetLibraryRoot(options.assetLibraryRoot);
  const resolvedProjectRoot = projectRoot ? resolve(projectRoot) : undefined;
  const previewBuilds = new Map();
  const previewMountTokens = new Map();

  function issuePreviewMountToken(response, component) {
    const token = randomUUID();
    previewMountTokens.set(component, token);
    response.setHeader(
      "set-cookie",
      `vibe_preview_mount=${encodeURIComponent(`${component}.${token}`)}; Path=/api/component-preview-validation/${encodeURIComponent(component)}; HttpOnly; SameSite=Strict`,
    );
  }

  function hasPreviewMountToken(request, component) {
    const cookie = String(request.headers?.cookie ?? "")
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("vibe_preview_mount="));
    if (!cookie) return false;
    const value = decodeURIComponentOrNull(cookie.slice("vibe_preview_mount=".length));
    if (value === null) return null;
    const separator = value.indexOf(".");
    if (separator < 0 || value.slice(0, separator) !== component) return false;
    return previewMountTokens.get(component) === value.slice(separator + 1);
  }

  async function previewTargetFor(component) {
    if (resolvedProjectRoot) {
      const assetDir = assetPackageDirectoryFor(libraryRoot, resolvedProjectRoot);
      const registry = JSON.parse(await readFile(join(assetDir, "component-previews.json"), "utf8"));
      const preview = registry.previews.find((candidate) => candidate.id === component);
      if (!preview) {
        throw new Error(`Component preview not found: ${component}`);
      }
      return {
        projectRoot: resolvedProjectRoot,
        assetDir,
        actionDigest: preview.actionDigest ?? "",
      };
    }
    const model = await loadLibraryModel(libraryRoot);
    const asset = model.assets.find((candidate) => candidate.componentPreview?.id === component);
    if (!asset?.projectRoot) {
      throw new Error(`Component preview source project not found: ${component}`);
    }
    return {
      projectRoot: asset.projectRoot,
      assetDir: asset.assetPackageDir,
      actionDigest: asset.componentPreview.actionDigest ?? "",
    };
  }

  async function markPreviewReady(component) {
    const target = await previewTargetFor(component);
    const registryPath = join(target.assetDir, "component-previews.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    const preview = registry.previews.find((candidate) => candidate.id === component);
    if (!preview) return false;
    if (preview.status !== "degraded"
      || preview.buildable === false
      || preview.limitations?.length !== 1
      || preview.limitations[0] !== "runtime-validation-pending") {
      return false;
    }
    if (!target.actionDigest || target.actionDigest !== preview.actionDigest) return false;
    const cache = openPreviewBuildCache(target.assetDir);
    try {
      const lookup = await cache.lookup(target.actionDigest);
      if (lookup.reason !== "HIT") return false;
      await cache.recordValidationEvidence({
        artifactTreeDigest: lookup.artifactTreeDigest,
        validatorDigest: browserMountValidatorDigest,
        state: "ready",
        evidence: createBrowserMountEvidence({
          component,
          actionDigest: target.actionDigest,
        }),
        validatedAt: Date.now(),
      });
      return true;
    } finally {
      cache.close();
    }
  }

  async function cachedPreviewBundle(component, target = undefined) {
    const resolvedTarget = target ?? await previewTargetFor(component);
    if (!resolvedTarget.actionDigest) return null;
    const cache = openPreviewBuildCache(resolvedTarget.assetDir);
    try {
      const lookup = await cache.lookup(resolvedTarget.actionDigest);
      if (lookup.reason !== "HIT") return null;
      return {
        assetDir: resolvedTarget.assetDir,
        actionDigest: resolvedTarget.actionDigest,
        artifactTreeDigest: lookup.artifactTreeDigest,
        previewUrl: `/component-preview/${component}/`,
        component,
      };
    } finally {
      cache.close();
    }
  }

  async function startPreviewBuild(component) {
    const target = await previewTargetFor(component);
    const cached = await cachedPreviewBundle(component, target);
    if (cached) {
      return { bundle: cached, promise: Promise.resolve(cached), error: null };
    }
    const current = previewBuilds.get(component);
    if (current && current.actionDigest !== target.actionDigest) {
      previewBuilds.delete(component);
    }
    if (!previewBuilds.has(component)) {
      const record = {
        actionDigest: target.actionDigest,
        bundle: null,
        promise: null,
        error: null,
      };
      previewBuilds.set(component, record);
      record.promise = Promise.resolve()
        .then(() => buildStaticBundle(target.projectRoot, {
          component,
          assetDir: target.assetDir,
        }))
        .then((bundle) => {
          record.bundle = bundle;
          return bundle;
        })
        .catch((error) => {
          record.error = error;
          return null;
        });
    }
    return previewBuilds.get(component);
  }

  async function previewBundleIfReady(component) {
    const cached = await cachedPreviewBundle(component);
    if (cached) {
      return cached;
    }
    const record = await startPreviewBuild(component);
    if (record.error) {
      previewBuilds.delete(component);
      await startPreviewBuild(component);
      return null;
    }
    return record.bundle;
  }

  async function ensurePreviewBundle(component) {
    const cached = await cachedPreviewBundle(component);
    if (cached) {
      return cached;
    }
    const record = await startPreviewBuild(component);
    const bundle = await record.promise;
    if (record.error) {
      previewBuilds.delete(component);
      throw record.error;
    }
    return bundle;
  }

  async function servePreviewFile(response, bundle, assetPath) {
    if (!bundle.actionDigest || !bundle.assetDir) {
      throw new Error("Component preview bundle must reference the Action Cache.");
    }
    const cache = openPreviewBuildCache(bundle.assetDir);
    try {
      const body = await cache.readFile(bundle.actionDigest, assetPath);
      send(response, 200, contentTypeFor(assetPath), body);
      return true;
    } catch (error) {
      if (String(error?.message).startsWith("MISSING_ARTIFACT:")) {
        return false;
      }
      throw error;
    } finally {
      cache.close();
    }
  }

  return async function handle(request, response) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const cacheDiagnosticPrefix = "/api/component-preview-cache/";
    if (request.method === "GET" && url.pathname.startsWith(cacheDiagnosticPrefix)) {
      const component = decodeURIComponentOrNull(url.pathname.slice(cacheDiagnosticPrefix.length));
      if (!component || !isSafeRelativePath(component)) {
        send(response, 400, "text/plain; charset=utf-8", "Invalid component preview id");
        return;
      }
      try {
        const target = await previewTargetFor(component);
        if (!target.actionDigest) {
          send(response, 409, "application/json; charset=utf-8", JSON.stringify({
            component,
            reason: "MISSING_ACTION_DIGEST",
          }));
          return;
        }
        const cache = openPreviewBuildCache(target.assetDir);
        try {
          const lookup = await cache.lookup(target.actionDigest);
          send(response, 200, "application/json; charset=utf-8", JSON.stringify({
            component,
            actionDigest: target.actionDigest,
            reason: lookup.reason,
            state: lookup.state,
            ...(lookup.artifactTreeDigest
              ? { artifactTreeDigest: lookup.artifactTreeDigest }
              : {}),
          }));
        } finally {
          cache.close();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send(response, 404, "text/plain; charset=utf-8", message);
      }
      return;
    }
    const validationPrefix = "/api/component-preview-validation/";
    if (request.method === "POST" && url.pathname.startsWith(validationPrefix)) {
      const component = decodeURIComponentOrNull(url.pathname.slice(validationPrefix.length));
      if (!component || !isSafeRelativePath(component)) {
        send(response, 400, "text/plain; charset=utf-8", "Invalid component preview id");
        return;
      }
      const mountTokenValid = hasPreviewMountToken(request, component);
      if (mountTokenValid === null) {
        send(response, 400, "text/plain; charset=utf-8", "Invalid preview mount cookie");
        return;
      }
      if (!mountTokenValid) {
        send(response, 409, "text/plain; charset=utf-8", "Preview mount was not served by this process");
        return;
      }
      try {
        const promoted = await markPreviewReady(component);
        if (promoted) previewMountTokens.delete(component);
        send(response, promoted ? 204 : 409, "text/plain; charset=utf-8", "");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send(response, 500, "text/plain; charset=utf-8", message);
      }
      return;
    }
    const previewPath = parseComponentPreviewPath(url.pathname);
    if (url.pathname.startsWith("/component-preview/") && !previewPath) {
      send(response, 400, "text/plain; charset=utf-8", "Invalid component preview path");
      return;
    }
    if (previewPath) {
      try {
        if (previewPath.assetPath === "index.html") {
          const bundle = await previewBundleIfReady(previewPath.component);
          if (!bundle) {
            send(response, 200, "text/html; charset=utf-8", loadingPreviewHtml(previewPath.component));
            return;
          }
          issuePreviewMountToken(response, previewPath.component);
          const served = await servePreviewFile(response, bundle, previewPath.assetPath);
          if (served) {
            return;
          }
          previewBuilds.delete(previewPath.component);
          await startPreviewBuild(previewPath.component);
          send(response, 200, "text/html; charset=utf-8", loadingPreviewHtml(previewPath.component));
          return;
        }
        let bundle = await ensurePreviewBundle(previewPath.component);
        let served = await servePreviewFile(response, bundle, previewPath.assetPath);
        if (!served) {
          previewBuilds.delete(previewPath.component);
          bundle = await ensurePreviewBundle(previewPath.component);
          served = await servePreviewFile(response, bundle, previewPath.assetPath);
        }
        if (!served) {
          send(response, 404, "text/plain; charset=utf-8", "Preview file not found");
        }
      } catch (error) {
        const message = error?.code === "ENOENT"
          ? "Preview file not found"
          : error instanceof Error ? error.message : String(error);
        send(response, error?.code === "ENOENT" ? 404 : 500, "text/plain; charset=utf-8", message);
      }
      return;
    }
    if (url.pathname === "/") {
      send(response, 200, "text/html; charset=utf-8", renderWebAppHtml());
      return;
    }
    if (url.pathname === "/api/assets") {
      const model = resolvedProjectRoot
        ? await loadProjectModel(resolvedProjectRoot, { assetLibraryRoot: libraryRoot })
        : await loadLibraryModel(libraryRoot);
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(model));
      return;
    }
    if (url.pathname === "/api/report/reuse") {
      const model = resolvedProjectRoot
        ? await loadProjectModel(resolvedProjectRoot, { assetLibraryRoot: libraryRoot })
        : await loadLibraryModel(libraryRoot);
      send(response, model.isError ? 404 : 200, "text/markdown; charset=utf-8", model.reports.reuse || model.message);
      return;
    }
    if (url.pathname === "/api/report/rules") {
      const model = resolvedProjectRoot
        ? await loadProjectModel(resolvedProjectRoot, { assetLibraryRoot: libraryRoot })
        : await loadLibraryModel(libraryRoot);
      send(response, model.isError ? 404 : 200, "text/markdown; charset=utf-8", model.reports.rules || model.message);
      return;
    }
    send(response, 404, "text/plain; charset=utf-8", "Not found");
  };
}

export function startWebServer(projectRoot, options = {}) {
  const port = Number(options.port ?? 4317);
  const host = options.host ?? "127.0.0.1";
  const server = createServer(createWebRequestHandler(projectRoot, options));
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolvePromise({
        server,
        url: `http://${host}:${port}/`,
      });
    });
  });
}
