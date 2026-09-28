import { createHash } from "node:crypto";
import { access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { summarizeBusinessPatterns } from "./analyzers/business-pattern-summarizer.js";
import { analyzeComponents } from "./analyzers/component-analyzer.js";
import { deduplicateComponents } from './analyzers/component-deduplication.js';
import { hasDeclaredComponentInterface } from './analyzers/component-selection.js';
import { analyzeProjectPages } from "./analyzers/project-page-analyzer.js";
import { buildFrontendSourceIndex } from "./analyzers/frontend-source-index.js";
import { buildComponentPrompts } from "./analyzers/component-prompt.js";
import { collectUniStaticResources } from './preview/uni-static-resources.js';
import { distillMetaphorPacks } from "./analyzers/metaphor-distiller.js";
import { summarizePagePatterns } from "./analyzers/page-pattern-summarizer.js";
import { analyzeProductPatterns } from "./analyzers/product-pattern-analyzer.js";
import { analyzeServices } from "./analyzers/service-analyzer.js";
import { extractTokens } from "./analyzers/token-extractor.js";
import {
  buildComponentPreviewRegistry,
  discoverPreviewRuntimeContext,
} from "./preview/component-preview-runtime.js";
import { createEmptyAssetPackage } from "./schema/asset-package.js";
import { scanProject } from "./scanner/project-scanner.js";
import { listProjectFiles, readTextFile } from "./utils/files.js";
import { validateMetaphorOutput, writeAssetPackage } from "./writers/asset-writer.js";
import { assetPackageDirectoryFor, registerAssetPackage, resolveAssetLibraryRoot } from "./library/asset-library.js";
import { getRecipe } from "./learning/recipes.js";

export { analyzeBookText, distillBook } from "./analyzers/book-distiller.js";

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isDistillableProjectRoot(projectRoot) {
  if (!(await pathExists(join(projectRoot, "package.json")))) {
    return false;
  }
  const projectSignals = [
    "src/components",
    "components",
    "src/pages",
    "pages",
    "src/app",
    "app",
  ];
  for (const signal of projectSignals) {
    if (await pathExists(join(projectRoot, signal))) {
      return true;
    }
  }
  return false;
}

async function findDistillableProjectRoots(root, depth = 0) {
  if (depth > 5) {
    return [];
  }
  const ignoredDirectories = new Set([
    ".git",
    ".vibehub",
    "dist",
    "build",
    "coverage",
    "node_modules",
    "uni_modules",
  ]);
  if (await isDistillableProjectRoot(root)) {
    return [root];
  }
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) {
      continue;
    }
    candidates.push(...await findDistillableProjectRoots(join(root, entry.name), depth + 1));
  }
  return candidates;
}

async function resolveDistillProjectRoot(projectRoot) {
  const resolvedRoot = resolve(projectRoot);
  if (await pathExists(join(resolvedRoot, "package.json"))) {
    return resolvedRoot;
  }
  const candidates = await findDistillableProjectRoots(resolvedRoot);
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    throw new Error([
      `Multiple VibeHub project candidates found under ${resolvedRoot}.`,
      "Pass one concrete project root:",
      ...candidates.map((candidate) => `- ${candidate}`),
    ].join("\n"));
  }
  throw new Error(`No package.json found for VibeHub distill target: ${resolvedRoot}`);
}

export async function distillProject(projectRoot, options = {}) {
  const resolvedRoot = await resolveDistillProjectRoot(projectRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const scan = await scanProject(resolvedRoot);
  const libraryRoot = resolveAssetLibraryRoot(options.assetLibraryRoot);
  const recipe = await getRecipe(libraryRoot, options.recipeId ?? 'component-distillation', options.recipeVersion);
  if (!recipe.sourceKinds.includes('project')) throw new Error('工程炼化必须选择适用于 project 的工程方案。');
  const outputDir = assetPackageDirectoryFor(libraryRoot, resolvedRoot);
  const metaphorSourceFiles = await listProjectFiles(resolvedRoot, ["docs/metaphors"], [".md", ".mdx", ".txt"]);
  const metaphorSources = await Promise.all(metaphorSourceFiles.map(async (file) => ({
    filePath: file.filePath,
    source: file.filePath.replace(/^.*\//, "").replace(/\.[^.]+$/, ""),
    sourceType: "user-notes",
    text: await readTextFile(file.fullPath),
  })));
  const metaphorPacks = distillMetaphorPacks(metaphorSources);
  await validateMetaphorOutput(outputDir, metaphorPacks);
  const sourceDirs = [...new Set([...scan.sourceDirs, ...scan.componentDirs, ...scan.pageDirs])]
    .filter((directory, _index, directories) => !directories.some((parent) => parent !== directory && directory.startsWith(`${parent}/`)));
  const sourceIndex = await buildFrontendSourceIndex(resolvedRoot, sourceDirs, { cacheDir: join(outputDir, "analysis-cache") });
  const discoveredPages = await analyzeProjectPages(resolvedRoot, { sourceIndex });
  const registeredPages = recipe.includePages === true ? discoveredPages : [];
  const sourceTexts = new Map(sourceIndex.files.map((file) => [file.filePath, file.sourceText]));
  const readSource = (file) => {
    if (!sourceTexts.has(file.filePath)) sourceTexts.set(file.filePath, readTextFile(file.fullPath));
    return sourceTexts.get(file.filePath);
  };
  const unregisteredPageFiles = recipe.includePages === true && scan.framework === 'uni-app'
    ? sourceIndex.files.filter(file => /^src\/pages[^/]*\/.*\.vue$/.test(file.filePath)
      && !registeredPages.some(page => page.filePath === file.filePath)).map(file => file.filePath) : [];
  const pageCandidateDirs = [...new Set(unregisteredPageFiles.map(filePath => filePath.split('/').slice(0, 2).join('/')))];
  const componentSelection = [];
  const componentCandidates = await analyzeComponents(
    resolvedRoot,
    [...scan.componentDirs, ...pageCandidateDirs],
    scan.sourceDirs.length > 0 ? scan.sourceDirs : [...scan.pageDirs, ...scan.componentDirs],
    { sourceIndex, componentRules: recipe.componentRules, selectionDecisions: componentSelection },
  );
  const registeredPagePaths = new Set(discoveredPages.map(page => page.filePath));
  const unregisteredPagePaths = new Set(unregisteredPageFiles);
  const selectedComponents = [...new Map(componentCandidates.filter(component => !registeredPagePaths.has(component.filePath)
    && (!/^src\/(views|layout)\//.test(component.filePath) || component.filePath.endsWith('.vue'))
    && (!pageCandidateDirs.some(directory => component.filePath.startsWith(`${directory}/`)) || unregisteredPagePaths.has(component.filePath)))
    .map(component => [component.filePath, unregisteredPagePaths.has(component.filePath) ? {
      ...component, limitations: ['此 Vue 位于页面源码目录但未注册，按组件候选提炼；不存在已证明的页面访问路由。'],
    } : component.filePath.startsWith('src/views/') ? {
      ...component, limitations: ['此视图未识别到静态页面路由，按组件候选提炼；后台菜单注册与完整页面访问条件尚未验证。'],
    } : component])).values()];
  const focusedComponents = selectedComponents.filter(component => {
    const viewEntry = unregisteredPagePaths.has(component.filePath) || component.filePath.startsWith('src/views/');
    const componentDirectory = /(?:^|\/)components?\//.test(component.filePath);
    if (recipe.componentRules.viewEntries === 'context-only' && viewEntry && !componentDirectory && component.scenarios.length === 0
      && !hasDeclaredComponentInterface(component.filePath, sourceTexts.get(component.filePath))) {
      componentSelection.push({filePath:component.filePath,name:component.name,decision:'context-only',rule:'viewEntries'});
      return false;
    }
    return true;
  });
  const components = deduplicateComponents(focusedComponents, sourceIndex, recipe.componentRules.duplicates);
  for (const component of components) for (const duplicate of component.duplicateSources ?? []) {
    componentSelection.push({filePath:duplicate.filePath,name:duplicate.name,decision:'merge',rule:'duplicates',canonicalFilePath:component.filePath});
  }
  const pageSourcesForPreview = await analyzeComponents(resolvedRoot, [], sourceDirs, {
    sourceIndex, filePaths: registeredPages.map(page => page.filePath),
  });
  const pageRuntimeByPath = new Map(pageSourcesForPreview.map(page => [page.filePath, page]));
  const pages = registeredPages.map(page => ({ ...pageRuntimeByPath.get(page.filePath), ...page }));
  const previewSources = [...components, ...pages];
  for (const component of previewSources) {
    if (component.platformRuntime !== 'uni-h5') continue;
    const collected = await collectUniStaticResources(resolvedRoot, component, sourceIndex);
    component.staticResources = collected.resources;
    component.staticResourceLimitations = collected.limitations;
  }
  const runtimeContext = await discoverPreviewRuntimeContext(resolvedRoot, { sourceIndex });
  const services = await analyzeServices(resolvedRoot, scan.apiDirs, scan.serviceDirs);
  const tokens = await extractTokens(resolvedRoot, [
    ...scan.componentDirs,
    ...scan.pageDirs,
  ], { sourceIndex });
  const componentPrompts = await buildComponentPrompts(resolvedRoot, previewSources, { sourceIndex, runtimeContext, tokens, recipe });
  const promptByPath = new Map(componentPrompts.map((record) => [record.filePath, record]));
  for (const component of previewSources) {
    component.dependencyFingerprint = createHash("sha256").update(JSON.stringify({
      sourceDependencies: component.dependencyFingerprint,
      sourceMaterials: promptByPath.get(component.filePath).sourceDigest,
    })).digest("hex");
  }
  const componentPreviewRegistry = buildComponentPreviewRegistry(previewSources, {
    projectRoot: resolvedRoot,
    generatedAt,
    runtimeContext,
  });
  const pageFiles = await listProjectFiles(resolvedRoot, scan.pageDirs, [
    ".tsx",
    ".jsx",
    ".ts",
    ".js",
    ".vue",
  ]);
  const pageSources = await Promise.all(pageFiles.map(async (file) => ({
    filePath: file.filePath,
    sourceText: await readSource(file),
  })));
  const pagePatterns = summarizePagePatterns(pageSources);
  const productSourceFiles = await listProjectFiles(
    resolvedRoot,
    [...scan.pageDirs, "docs"],
    [".tsx", ".jsx", ".ts", ".js", ".md", ".mdx"],
  );
  const productSources = await Promise.all(
    productSourceFiles.map(async (file) => ({
      filePath: file.filePath,
      text: await readSource(file),
    })),
  );
  const conceptAssets = await analyzeProductPatterns(productSources);
  const businessPatterns = summarizeBusinessPatterns(services);
  const assetPackage = createEmptyAssetPackage({
    sourceProject: scan.sourceProject,
    projectRoot: resolvedRoot,
    generatedAt,
    framework: scan.framework,
    language: scan.language,
    packageManager: scan.packageManager,
    hasBackendEntrypoints: scan.hasBackendEntrypoints,
  });
  assetPackage.components = components;
  assetPackage.componentSelection = componentSelection;
  assetPackage.pages = pages;
  assetPackage.services = services;
  assetPackage.businessPatterns = businessPatterns;
  assetPackage.tokens = tokens;
  assetPackage.pagePatterns = pagePatterns;
  assetPackage.conceptAssets = conceptAssets;
  assetPackage.metaphorPacks = metaphorPacks;
  assetPackage.componentPreviews = componentPreviewRegistry.previews;
  assetPackage.assetCounts.components = components.length;
  assetPackage.assetCounts.pages = pages.length;
  assetPackage.assetCounts.componentPreviews = componentPreviewRegistry.previews.length;
  assetPackage.assetCounts.services = services.length;
  assetPackage.assetCounts.businessPatterns = businessPatterns.length;
  assetPackage.assetCounts.tokens = tokens.length;
  assetPackage.assetCounts.pagePatterns = pagePatterns.length;
  assetPackage.assetCounts.conceptAssets = conceptAssets.length;
  assetPackage.assetCounts.metaphorPacks = metaphorPacks.length;

  const result = await writeAssetPackage(assetPackage, { componentPreviewRegistry, componentPrompts, outputDir, componentRecipe: recipe });
  await registerAssetPackage(libraryRoot, {
    projectRoot: resolvedRoot,
    sourceProject: assetPackage.sourceProject,
    assetPackageDir: outputDir,
    generatedAt,
  });
  return { ...result, analysis: sourceIndex.metrics, recipe: { id: recipe.id, version: recipe.version, name: recipe.name, digest: recipe.digest } };
}
