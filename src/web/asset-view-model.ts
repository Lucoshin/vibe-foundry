import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
    hover: "悬停时抬升卡片并强调边框。",
    focus: "聚焦时显示清晰描边，便于键盘浏览。",
    motion: "预览光标会循环触发一次轻量点击动效。",
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
    normalizePath(candidate.componentPath) === source || candidate.componentName === asset.name,
  );
  if (!preview) {
    return null;
  }
  const previewUrl = preview.browserUrl && preview.browserUrl.startsWith("/component-preview/")
    ? preview.browserUrl
    : `/component-preview/${preview.id}/`;
  const runtimeState = runtimeStates.get(preview.actionDigest);
  const status = runtimeState?.status ?? preview.status;
  const buildable = runtimeState?.buildable ?? preview.buildable ?? status === "ready";
  const blockers = runtimeState?.blockers ?? preview.blockers ?? [];
  const limitations = runtimeState?.limitations ?? preview.limitations ?? [];
  return {
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
  return {
    id: `${category}:${asset.name ?? asset.source}`,
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

async function previewRuntimeStates(assetDir, previewRegistry) {
  try {
    await access(join(assetDir, "preview-state.db"));
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
  const states = new Map();
  const cache = openPreviewBuildCache(assetDir);
  try {
    for (const preview of previewRegistry.previews ?? []) {
      if (!preview.actionDigest) continue;
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
          blockers: [`Cached preview build failure: ${action.failureCode}`],
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
    const runtimeStates = await previewRuntimeStates(assetDir, componentPreviews);
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
  try {
    const index = JSON.parse(await readFile(join(resolvedLibraryRoot, "index.json"), "utf8"));
    const models = await Promise.all(index.projects.map((project) => loadAssetViewModel(project.projectRoot, { assetDir: project.assetPackageDir })));
    const available = models.filter((model) => !model.isError);
    return {
      isError: available.length === 0,
      message: available.length === 0 ? "集中资产库为空。请先运行 node dist/cli.js distill <project-root>。" : "",
      project: { sourceProject: "VibeFoundry Library", generatedAt: "", framework: "multiple" },
      summary: { totalAssets: available.reduce((sum, model) => sum + model.summary.totalAssets, 0), generatedAt: "", assetCounts: {} },
      categories: assetCategories,
      assets: available.flatMap((model) => model.assets),
      reports: { reuse: "", rules: "" },
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { isError: true, message: "集中资产库为空。请先运行 node dist/cli.js distill <project-root>。", project: null, summary: { totalAssets: 0, generatedAt: "", assetCounts: {} }, categories: assetCategories, assets: [], reports: { reuse: "", rules: "" } };
    throw error;
  }
}
