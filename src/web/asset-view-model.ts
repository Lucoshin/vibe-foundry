import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { previewFailureMessage, previewRuntimeIssue } from "../preview/preview-dependencies.js";
import {
  assetPackageDirectoryFor,
  resolveAssetLibraryRoot,
} from "../library/asset-library.js";
import { openPreviewBuildCache } from "../preview/preview-build-cache.js";
import { browserMountValidatorDigest } from "../preview/preview-validation.js";

const missingPackageMessage =
  "Missing central asset package. Run `node dist/cli.js distill <project-root>` first.";

export const assetCategories = [
  { id: "overview", label: "Overview" },
  { id: "components", label: "Components" },
  { id: "services", label: "Services" },
  { id: "business", label: "Business" },
  { id: "tokens", label: "Tokens" },
  { id: "product", label: "Product" },
  { id: "metaphors", label: "Metaphors" },
  { id: "reports", label: "Reports" },
];

async function readText(assetDir, fileName) {
  return readFile(join(assetDir, fileName), "utf8");
}

async function readJson(assetDir, fileName) {
  return JSON.parse(await readText(assetDir, fileName));
}

function sourceOf(asset) {
  return asset.filePath ?? asset.sourceFile ?? asset.sourceFiles?.[0] ?? asset.source ?? "";
}

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

const languageByExtension = {
  ".ts": { language: "ts", languageLabel: "TypeScript" },
  ".tsx": { language: "tsx", languageLabel: "TSX" },
  ".js": { language: "js", languageLabel: "JavaScript" },
  ".jsx": { language: "jsx", languageLabel: "JSX" },
  ".md": { language: "md", languageLabel: "Markdown" },
  ".mdx": { language: "mdx", languageLabel: "MDX" },
  ".json": { language: "json", languageLabel: "JSON" },
  ".css": { language: "css", languageLabel: "CSS" },
  ".vue": { language: "vue", languageLabel: "Vue" },
};

function languageOf(source) {
  const normalizedSource = source.toLowerCase();
  const extension = Object.keys(languageByExtension).find((candidate) =>
    normalizedSource.endsWith(candidate),
  );
  return languageByExtension[extension] ?? {
    language: "unknown",
    languageLabel: "Unknown",
  };
}

function descriptionOf(asset) {
  if (asset.guidance?.[0]) {
    return asset.guidance[0];
  }
  if (asset.limitations?.[0]) {
    return asset.limitations[0];
  }
  if (asset.category) {
    return `${asset.category} token`;
  }
  if (asset.businessDomain) {
    return `${asset.businessDomain} domain`;
  }
  if (asset.coreMetaphors?.[0]?.name) {
    return `${asset.coreMetaphors[0].name} metaphor pack`;
  }
  return "Reusable VibeFoundry asset";
}

function interactionPreviewOf(category, asset) {
  if (category !== "components") {
    return null;
  }
  return {
    title: "组件交互预览",
    visualCue: asset.name ?? "Component",
    hover: "悬停时强调边框，不自动打开预览。",
    focus: "聚焦时显示清晰描边，便于键盘浏览。",
    reuseCue: "适合先作为复用组件候选，再检查 props、状态和业务耦合。",
  };
}

function labelsOf(category, asset, language) {
  if (category !== "components") {
    return [];
  }
  return [
    language.languageLabel,
    asset.exportMode ? `${asset.exportMode} export` : "",
    asset.reusePotential ? `${asset.reusePotential} reuse` : "",
  ].filter(Boolean);
}

function componentPreviewOf(category, asset, previewRegistry, runtimeStates) {
  if (category !== "components") {
    return null;
  }
  const source = normalizePath(sourceOf(asset));
  const preview = (previewRegistry.previews ?? []).find((candidate) =>
    normalizePath(candidate.componentPath) === source,
  );
  if (!preview) {
    return null;
  }
  const previewUrl = preview.browserUrl && preview.browserUrl.startsWith("/component-preview/")
    ? preview.browserUrl
    : `/component-preview/${preview.id}/`;
  const runtimeState = runtimeStates.get(preview.actionDigest || preview.id);
  const status = runtimeState?.status ?? preview.status;
  const buildable = runtimeState?.buildable ?? preview.buildable ?? status === "ready";
  const blockers = runtimeState?.blockers ?? preview.blockers ?? [];
  const limitations = runtimeState?.limitations ?? preview.limitations ?? [];
  const scenario = preview.previewScenario;
  const parent = scenario?.unresolvedProps?.length ? (previewRegistry.previews ?? []).find(candidate =>
    candidate.id !== preview.id && normalizePath(candidate.componentPath) === normalizePath(scenario.sourceFile ?? "")
    && candidate.buildable !== false && candidate.status !== "blocked",
  ) : null;
  return {
    ...(scenario ? { scenario } : {}),
    ...(parent ? { contextPreview: { id: parent.id, name: parent.componentName, previewUrl: `/component-preview/${parent.id}/`, actionDigest: parent.actionDigest } } : {}),
    id: preview.id,
    ...(preview.actionDigest ? { actionDigest: preview.actionDigest } : {}),
    status,
    buildable,
    runtime: preview.runtime ?? previewRegistry.runtime ?? "",
    browserUrl: previewUrl,
    previewUrl,
    interactions: preview.interactions ?? [],
    blockers,
    ...(limitations.length ? { limitations } : {}),
  };
}

function toAsset(category, asset, kind, project, previewRegistry, runtimeStates, projectRoot, assetPackageDir) {
  const source = sourceOf(asset);
  const language = languageOf(source);
  const projectIdentity = process.platform === "win32" ? projectRoot.toLowerCase() : projectRoot;
  const identity = createHash("sha256")
    .update(JSON.stringify([projectIdentity, category, normalizePath(source), asset.name ?? asset.source]))
    .digest("hex");
  return {
    id: `${category}:${identity}`,
    category,
    kind,
    name: asset.name ?? asset.source,
    source,
    project,
    projectRoot,
    assetPackageDir,
    ...language,
    labels: labelsOf(category, asset, language),
    description: descriptionOf(asset),
    interactionPreview: interactionPreviewOf(category, asset),
    componentPreview: componentPreviewOf(category, asset, previewRegistry, runtimeStates),
    raw: asset,
  };
}

async function previewRuntimeStates(assetDir, previewRegistry, projectRoot) {
  const states = new Map();
  const issuesByRuntime = new Map();
  for (const preview of previewRegistry.previews ?? []) {
    const runtime = preview.runtime ?? previewRegistry.runtime;
    if (!issuesByRuntime.has(runtime)) issuesByRuntime.set(runtime, previewRuntimeIssue(projectRoot, runtime));
    const issue = issuesByRuntime.get(runtime);
    if (issue) states.set(preview.actionDigest || preview.id, {
      status: "blocked", buildable: false, blockers: [issue.message], limitations: [],
    });
  }
  try {
    await access(join(assetDir, "preview-state.db"));
  } catch (error) {
    if (error?.code === "ENOENT") return states;
    throw error;
  }
  const cache = openPreviewBuildCache(assetDir);
  try {
    for (const preview of previewRegistry.previews ?? []) {
      if (!preview.actionDigest || states.has(preview.actionDigest)) continue;
      const action = cache.getAction(preview.actionDigest);
      if (!action) continue;
      if (action.state === "succeeded") {
        const validation = cache.getValidation(
          action.artifactTreeDigest,
          browserMountValidatorDigest,
        );
        states.set(preview.actionDigest, validation?.state === "ready"
          ? { status: "ready", buildable: true, blockers: [], limitations: [] }
          : {
              status: "validating",
              buildable: true,
              blockers: [],
              limitations: ["runtime-validation-pending"],
            });
        continue;
      }
      if (action.state === "failed_deterministic") {
        states.set(preview.actionDigest, {
          status: "blocked",
          buildable: false,
          blockers: [previewFailureMessage(action.failureCode)],
          limitations: [],
        });
        continue;
      }
      if (action.state === "failed_transient") {
        states.set(preview.actionDigest, {
          status: "retrying",
          buildable: true,
          blockers: [],
          limitations: [`Transient preview build failure: ${action.failureCode}`],
        });
        continue;
      }
      states.set(preview.actionDigest, {
        status: action.state === "building" ? "building" : "pending",
        buildable: true,
        blockers: [],
        limitations: preview.limitations ?? [],
      });
    }
  } finally {
    cache.close();
  }
  return states;
}

function summarize(manifest, assets) {
  return {
    totalAssets: assets.length,
    generatedAt: manifest.generatedAt ?? "",
    assetCounts: manifest.assetCounts ?? {},
  };
}

export async function loadAssetViewModel(projectRoot, options = {}) {
  const resolvedProjectRoot = resolve(projectRoot);
  const assetDir = resolve(
    options.assetDir
      ?? assetPackageDirectoryFor(
        resolveAssetLibraryRoot(options.assetLibraryRoot),
        resolvedProjectRoot,
      ),
  );
  try {
    const [
      manifest,
      componentCatalog,
      componentPreviews,
      serviceCatalog,
      tokenCatalog,
      conceptCatalog,
      reuseReport,
      agentRules,
    ] = await Promise.all([
      readJson(assetDir, "asset-manifest.json"),
      readJson(assetDir, "component-catalog.json"),
      readJson(assetDir, "component-previews.json"),
      readJson(assetDir, "service-catalog.json"),
      readJson(assetDir, "tokens.json"),
      readJson(assetDir, "concept-assets.json"),
      readText(assetDir, "reuse-report.md"),
      readText(assetDir, "agent-rules.md"),
    ]);
    const runtimeStates = await previewRuntimeStates(assetDir, componentPreviews, resolvedProjectRoot);
    const sourceProject = manifest.sourceProject ?? "unknown-project";
    const assets = [
      ...(componentCatalog.components ?? []).map((asset) =>
        toAsset("components", asset, "component", sourceProject, componentPreviews, runtimeStates, resolvedProjectRoot, assetDir),
      ),
      ...(serviceCatalog.services ?? []).map((asset) =>
        toAsset("services", asset, "service", sourceProject, componentPreviews, runtimeStates, resolvedProjectRoot, assetDir),
      ),
      ...(serviceCatalog.businessPatterns ?? []).map((asset) =>
        toAsset("business", asset, "business-pattern", sourceProject, componentPreviews, runtimeStates, resolvedProjectRoot, assetDir),
      ),
      ...(tokenCatalog.tokens ?? []).map((asset) =>
        toAsset("tokens", asset, "design-token", sourceProject, componentPreviews, runtimeStates, resolvedProjectRoot, assetDir),
      ),
      ...(conceptCatalog.conceptAssets ?? []).map((asset) =>
        toAsset("product", asset, "concept", sourceProject, componentPreviews, runtimeStates, resolvedProjectRoot, assetDir),
      ),
      ...(conceptCatalog.metaphorPacks ?? []).map((asset) =>
        toAsset("metaphors", asset, "metaphor", sourceProject, componentPreviews, runtimeStates, resolvedProjectRoot, assetDir),
      ),
    ];
    return {
      isError: false,
      project: {
        sourceProject,
        generatedAt: manifest.generatedAt ?? "",
        framework: manifest.framework ?? "unknown",
      },
      summary: summarize(manifest, assets),
      categories: assetCategories,
      assets,
      reports: {
        reuse: reuseReport,
        rules: agentRules,
      },
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        isError: true,
        message: missingPackageMessage,
        project: null,
        summary: { totalAssets: 0, generatedAt: "", assetCounts: {} },
        categories: assetCategories,
        assets: [],
        reports: { reuse: "", rules: "" },
      };
    }
    throw error;
  }
}

export async function loadAssetLibraryViewModel(libraryRoot) {
  const resolvedLibraryRoot = resolveAssetLibraryRoot(libraryRoot);
  let index;
  try {
    index = JSON.parse(await readFile(join(resolvedLibraryRoot, "index.json"), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    index = { projects: [] };
  }
  const models = await Promise.all(index.projects.map((project) => loadAssetViewModel(project.projectRoot, { assetDir: project.assetPackageDir })));
  const available = models.filter((model) => !model.isError);
  const assets = available.flatMap((model) => model.assets);
  const previewIds = new Set();
  const collision = assets.find((asset) => {
    const id = asset.componentPreview?.id;
    if (!id) return false;
    if (previewIds.has(id)) return true;
    previewIds.add(id);
    return false;
  });
  const message = collision
    ? `Component preview ID collision: ${collision.componentPreview.id}. Run node dist/cli.js distill <project-root> again for the affected projects.`
      : models.length > 0 && available.length === 0 ? "已登记的资产包无法读取。请检查资产目录，或重新炼化对应项目。" : "";
  const visibleAssets = collision ? [] : assets;
  const assetCounts = Object.fromEntries(Object.entries({
    components: 'components', services: 'services', businessPatterns: 'business',
    tokens: 'tokens', conceptAssets: 'product', metaphorPacks: 'metaphors',
  }).map(([key, category]) => [key, visibleAssets.filter(asset => asset.category === category).length]));
  return {
    isError: Boolean(message),
    message,
    project: { sourceProject: "VibeFoundry Library", generatedAt: "", framework: "multiple" },
    summary: { totalAssets: visibleAssets.length, generatedAt: "", assetCounts },
    categories: assetCategories,
    assets: visibleAssets,
    reports: { reuse: "", rules: "" },
  };
}
