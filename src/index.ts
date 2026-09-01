import { access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { summarizeBusinessPatterns } from "./analyzers/business-pattern-summarizer.js";
import { analyzeComponents } from "./analyzers/component-analyzer.js";
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
import { writeAssetPackage } from "./writers/asset-writer.js";
import { assetPackageDirectoryFor, registerAssetPackage, resolveAssetLibraryRoot } from "./library/asset-library.js";

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
    ".vibe-foundry",
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
      `Multiple VibeFoundry project candidates found under ${resolvedRoot}.`,
      "Pass one concrete project root:",
      ...candidates.map((candidate) => `- ${candidate}`),
    ].join("\n"));
  }
  throw new Error(`No package.json found for VibeFoundry distill target: ${resolvedRoot}`);
}

export async function distillProject(projectRoot, options = {}) {
  const resolvedRoot = await resolveDistillProjectRoot(projectRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const scan = await scanProject(resolvedRoot);
  const components = await analyzeComponents(
    resolvedRoot,
    scan.componentDirs,
    scan.sourceDirs.length > 0 ? scan.sourceDirs : [...scan.pageDirs, ...scan.componentDirs],
  );
  const runtimeContext = await discoverPreviewRuntimeContext(resolvedRoot);
  const componentPreviewRegistry = buildComponentPreviewRegistry(components, {
    generatedAt,
    previewPort: options.previewPort,
    runtimeContext,
  });
  const services = await analyzeServices(resolvedRoot, scan.apiDirs, scan.serviceDirs);
  const tokens = await extractTokens(resolvedRoot, [
    ...scan.componentDirs,
    ...scan.pageDirs,
  ]);
  const pageFiles = await listProjectFiles(resolvedRoot, scan.pageDirs, [
    ".tsx",
    ".jsx",
    ".ts",
    ".js",
    ".vue",
  ]);
  const pageSources = await Promise.all(pageFiles.map(async (file) => ({
    filePath: file.filePath,
    sourceText: await readTextFile(file.fullPath),
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
      text: await readTextFile(file.fullPath),
    })),
  );
  const conceptAssets = await analyzeProductPatterns(productSources);
  const metaphorSourceFiles = await listProjectFiles(
    resolvedRoot,
    ["docs/metaphors"],
    [".md", ".mdx", ".txt"],
  );
  const metaphorSources = await Promise.all(
    metaphorSourceFiles.map(async (file) => ({
      filePath: file.filePath,
      source: file.filePath.replace(/^.*\//, "").replace(/\.[^.]+$/, ""),
      sourceType: "user-notes",
      text: await readTextFile(file.fullPath),
    })),
  );
  const metaphorPacks = distillMetaphorPacks(metaphorSources);
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
  assetPackage.services = services;
  assetPackage.businessPatterns = businessPatterns;
  assetPackage.tokens = tokens;
  assetPackage.pagePatterns = pagePatterns;
  assetPackage.conceptAssets = conceptAssets;
  assetPackage.metaphorPacks = metaphorPacks;
  assetPackage.componentPreviews = componentPreviewRegistry.previews;
  assetPackage.assetCounts.components = components.length;
  assetPackage.assetCounts.componentPreviews = componentPreviewRegistry.previews.length;
  assetPackage.assetCounts.services = services.length;
  assetPackage.assetCounts.businessPatterns = businessPatterns.length;
  assetPackage.assetCounts.tokens = tokens.length;
  assetPackage.assetCounts.pagePatterns = pagePatterns.length;
  assetPackage.assetCounts.conceptAssets = conceptAssets.length;
  assetPackage.assetCounts.metaphorPacks = metaphorPacks.length;

  const libraryRoot = resolveAssetLibraryRoot(options.assetLibraryRoot);
  const outputDir = assetPackageDirectoryFor(libraryRoot, resolvedRoot);
  const result = await writeAssetPackage(resolvedRoot, assetPackage, { componentPreviewRegistry, outputDir });
  await registerAssetPackage(libraryRoot, {
    projectRoot: resolvedRoot,
    sourceProject: assetPackage.sourceProject,
    assetPackageDir: outputDir,
    generatedAt,
  });
  return result;
}
