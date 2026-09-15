import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import {
  assetPackageDirectoryFor,
  resolveAssetLibraryRoot,
} from "../library/asset-library.js";
import { buildComponentPreviewStaticBundle, componentPreviewVersionUrl } from "../preview/component-preview-runtime.js";
import { openPreviewBuildCache } from "../preview/preview-build-cache.js";
import {
  browserMountValidatorDigest,
  createBrowserMountEvidence,
} from "../preview/preview-validation.js";
import { loadAssetLibraryViewModel, loadAssetViewModel } from "./asset-view-model.js";
import { renderWebAppHtml, webAppCss } from "./frontend.js";
import { readComponentPrompt } from "../library/component-prompts.js";
import { createImportRequestHandler } from "./local-import.js";
import { previewFailureMessage, previewRuntimeIssue } from "../preview/preview-dependencies.js";

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
  const versionedPath = filePath.match(/^([a-f0-9]{64})\/(.*)$/);
  const assetPath = (versionedPath ? versionedPath[2] : filePath) || "index.html";
  if (!isSafeRelativePath(assetPath)) {
    return null;
  }
  return { component, assetPath, actionDigest: versionedPath?.[1] };
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function previewStatusHtml(title, message, { loading = false, technicalDetail = "" } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      html, body { margin: 0; min-height: 100%; background: #f8f9f7; color: #252a28; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
      section { width: min(360px, 100%); }
      strong { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; }
      p { margin: 0; color: #68716c; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
      details { margin-top: 16px; color: #68716c; font-size: 12px; }
      summary { cursor: pointer; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <strong>${escapeHtml(title)}</strong>
        <p id="preview-status-message">${escapeHtml(message)}</p>
        ${technicalDetail ? `<details><summary>技术信息</summary><pre>${escapeHtml(technicalDetail)}</pre></details>` : ""}
      </section>
    </main>
    ${loading ? `<script>
async function checkPreview() {
  try {
    const response = await fetch(window.location.href, { cache: "no-store" });
    if (response.headers.get("x-vibe-preview-state") === "building") {
      setTimeout(checkPreview, 800);
      return;
    }
    if (!response.ok) {
      const failurePage = await response.text();
      document.open();
      document.write(failurePage);
      document.close();
      return;
    }
    window.location.reload();
  } catch {
    document.getElementById("preview-status-message").textContent = "无法连接预览服务，请刷新页面重试。";
  }
}
setTimeout(checkPreview, 800);
</script>` : ""}
  </body>
</html>
`;
}

function sendLoadingPreview(response) {
  response.setHeader("x-vibe-preview-state", "building");
  send(response, 200, "text/html; charset=utf-8", previewStatusHtml(
    "正在生成组件预览", "首次构建正在后台进行，完成后将在这里显示。", { loading: true },
  ));
}

export function createWebRequestHandler(projectRoot, options = {}) {
  const buildStaticBundle = options.buildComponentPreviewStaticBundle ?? buildComponentPreviewStaticBundle;
  const loadProjectModel = options.loadAssetViewModel ?? loadAssetViewModel;
  const loadLibraryModel = options.loadAssetLibraryViewModel ?? loadAssetLibraryViewModel;
  const libraryRoot = resolveAssetLibraryRoot(options.assetLibraryRoot);
  const importToken = randomUUID();
  const handleImport = createImportRequestHandler({ libraryRoot, token: importToken });
  const resolvedProjectRoot = projectRoot ? resolve(projectRoot) : undefined;
  const previewBuilds = new Map();
  const previewMountTokens = new Map();
  const previewBuildQueue = [];
  let activePreviewBuilds = 0;

  function runQueuedPreviewBuilds() {
    while (activePreviewBuilds < 2 && previewBuildQueue.length > 0) {
      const { build, resolvePromise, reject } = previewBuildQueue.shift();
      activePreviewBuilds += 1;
      Promise.resolve().then(build).then(resolvePromise, reject).finally(() => {
        activePreviewBuilds -= 1;
        runQueuedPreviewBuilds();
      });
    }
  }

  function queuePreviewBuild(build) {
    return new Promise((resolvePromise, reject) => {
      previewBuildQueue.push({ build, resolvePromise, reject });
      runQueuedPreviewBuilds();
    });
  }

  function issuePreviewMountToken(response, component, actionDigest) {
    const token = randomUUID();
    previewMountTokens.set(component, { token, actionDigest });
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
    return previewMountTokens.get(component)?.token === value.slice(separator + 1);
  }

  async function previewTargetFor(component) {
    if (resolvedProjectRoot) {
      const assetDir = assetPackageDirectoryFor(libraryRoot, resolvedProjectRoot);
      const registry = JSON.parse(await readFile(join(assetDir, "component-previews.json"), "utf8"));
      const matches = registry.previews.filter((candidate) => candidate.id === component);
      if (matches.length > 1) {
        throw new Error(`Component preview ID collision: ${component}. Run node dist/cli.js distill <project-root> again.`);
      }
      const [preview] = matches;
      if (!preview) {
        throw new Error(`Component preview not found: ${component}`);
      }
      return {
        projectRoot: resolvedProjectRoot,
        assetDir,
        actionDigest: preview.actionDigest ?? "",
        runtime: preview.runtime ?? registry.runtime,
      };
    }
    let index;
    try {
      index = JSON.parse(await readFile(join(libraryRoot, "index.json"), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`Component preview source project not found: ${component}`);
      throw error;
    }
    const matches = (await Promise.all(index.projects.map(async (project) => {
      let registry;
      try {
        registry = JSON.parse(await readFile(join(project.assetPackageDir, "component-previews.json"), "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
      }
      return registry.previews.filter((preview) => preview.id === component).map((preview) => ({
        projectRoot: project.projectRoot,
        assetDir: project.assetPackageDir,
        actionDigest: preview.actionDigest ?? "",
        runtime: preview.runtime ?? registry.runtime,
      }));
    }))).flat();
    if (matches.length > 1) {
      throw new Error(`Component preview ID collision: ${component}. Run node dist/cli.js distill <project-root> again for the affected projects.`);
    }
    const [target] = matches;
    if (!target) {
      throw new Error(`Component preview source project not found: ${component}`);
    }
    return target;
  }

  async function markPreviewReady(component, mountedActionDigest) {
    const target = await previewTargetFor(component);
    if (target.actionDigest !== mountedActionDigest) return false;
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
    const issue = previewRuntimeIssue(resolvedTarget.projectRoot, resolvedTarget.runtime);
    if (issue) {
      const error = new Error(issue.message);
      error.code = issue.code;
      throw error;
    }
    if (!resolvedTarget.actionDigest) return null;
    const cache = openPreviewBuildCache(resolvedTarget.assetDir);
    try {
      const lookup = await cache.lookup(resolvedTarget.actionDigest);
      if (lookup.reason === "NEGATIVE_CACHE_HIT") {
        throw new Error(`Cached component preview build failure: ${lookup.failureCode}`);
      }
      if (lookup.reason !== "HIT") return null;
      return {
        assetDir: resolvedTarget.assetDir,
        actionDigest: resolvedTarget.actionDigest,
        artifactTreeDigest: lookup.artifactTreeDigest,
        previewUrl: componentPreviewVersionUrl(component, resolvedTarget.actionDigest),
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
      record.promise = queuePreviewBuild(() => buildStaticBundle(target.projectRoot, {
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
      throw record.error;
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

  async function versionedPreviewBundle(component, actionDigest) {
    const target = await previewTargetFor(component);
    if (target.actionDigest === actionDigest) return cachedPreviewBundle(component, target);
    const cache = openPreviewBuildCache(target.assetDir);
    try {
      const action = cache.getAction(actionDigest);
      if (action?.state !== "succeeded") return null;
      const manifest = JSON.parse((await cache.readFile(actionDigest, "preview-manifest.json")).toString("utf8"));
      if (manifest.componentId !== component || manifest.actionDigest !== actionDigest) return null;
      return { assetDir: target.assetDir, actionDigest, artifactTreeDigest: action.artifactTreeDigest };
    } catch (error) {
      if (String(error?.message).startsWith("MISSING_ARTIFACT:")) return null;
      throw error;
    } finally {
      cache.close();
    }
  }

  return async function handle(request, response) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (await handleImport(request, response, url)) return;
    const componentPromptPrefix = "/api/component-prompt/";
    if (request.method === "GET" && url.pathname.startsWith(componentPromptPrefix)) {
      const assetId = decodeURIComponentOrNull(url.pathname.slice(componentPromptPrefix.length));
      if (!assetId) {
        send(response, 400, "application/json; charset=utf-8", JSON.stringify({ message: "Invalid component asset id" }));
        return;
      }
      try {
        const model = resolvedProjectRoot
          ? await loadProjectModel(resolvedProjectRoot, { assetLibraryRoot: libraryRoot })
          : await loadLibraryModel(libraryRoot);
        if (model.isError) {
          send(response, 409, "application/json; charset=utf-8", JSON.stringify({ message: model.message }));
          return;
        }
        const matches = model.assets.filter((asset) => asset.id === assetId && asset.category === "components");
        if (matches.length !== 1) {
          send(response, matches.length ? 409 : 404, "application/json; charset=utf-8", JSON.stringify({
            message: matches.length ? `Ambiguous component asset id: ${assetId}` : `Component asset not found: ${assetId}`,
          }));
          return;
        }
        const [asset] = matches;
        const record = await readComponentPrompt(asset.assetPackageDir, asset.raw.filePath);
        send(response, 200, "application/json; charset=utf-8", JSON.stringify(record));
      } catch (error) {
        const statusCode = error?.code === "COMPONENT_PROMPT_MISSING" ? 404 : error?.code === "COMPONENT_PROMPT_OUTDATED" ? 409 : 500;
        send(response, statusCode, "application/json; charset=utf-8", JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
        }));
      }
      return;
    }
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
      const mountedActionDigest = url.searchParams.get("actionDigest");
      if (!/^[a-f0-9]{64}$/.test(mountedActionDigest ?? "")) {
        send(response, 400, "text/plain; charset=utf-8", "Invalid preview action digest");
        return;
      }
      if (previewMountTokens.get(component).actionDigest !== mountedActionDigest) {
        send(response, 409, "text/plain; charset=utf-8", "Preview action does not match the served mount");
        return;
      }
      try {
        const promoted = await markPreviewReady(component, mountedActionDigest);
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
        if (previewPath.actionDigest) {
          const bundle = await versionedPreviewBundle(previewPath.component, previewPath.actionDigest);
          if (!bundle) {
            send(response, 404, "text/plain; charset=utf-8", "Preview version not found");
            return;
          }
          if (previewPath.assetPath === "index.html") {
            issuePreviewMountToken(response, previewPath.component, bundle.actionDigest);
          }
          if (!await servePreviewFile(response, bundle, previewPath.assetPath)) {
            send(response, 404, "text/plain; charset=utf-8", "Preview file not found");
          }
          return;
        }
        if (previewPath.assetPath === "index.html") {
          const bundle = await previewBundleIfReady(previewPath.component);
          if (!bundle) {
            sendLoadingPreview(response);
            return;
          }
          issuePreviewMountToken(response, previewPath.component, bundle.actionDigest);
          const served = await servePreviewFile(response, bundle, previewPath.assetPath);
          if (served) {
            return;
          }
          previewBuilds.delete(previewPath.component);
          await startPreviewBuild(previewPath.component);
          sendLoadingPreview(response);
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
        const statusCode = error?.code === "ENOENT" ? 404 : 500;
        if (previewPath.assetPath === "index.html") {
          send(response, statusCode, "text/html; charset=utf-8", previewStatusHtml(
            "组件预览暂不可用",
            statusCode === 404 ? "没有找到这个组件的预览，请重新打开组件列表。" : previewFailureMessage(error?.code),
            { technicalDetail: error?.code === "PREVIEW_RUNTIME_UNSUPPORTED" ? "" : message },
          ));
        } else {
          send(response, statusCode, "text/plain; charset=utf-8", message);
        }
      }
      return;
    }
    if (url.pathname === "/") {
      send(response, 200, "text/html; charset=utf-8", renderWebAppHtml({ importToken }));
      return;
    }
    if (url.pathname === "/api/assets") {
      const model = resolvedProjectRoot && url.searchParams.get('scope') !== 'library'
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
