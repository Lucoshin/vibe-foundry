import { mkdir, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { writeComponentPreviewRuntime } from "../preview/component-preview-runtime.js";
import { openPreviewBuildCache } from "../preview/preview-build-cache.js";
import { slugifyMetaphorSource } from "../schema/metaphor-pack.js";
import { writeComponentPrompts } from "../library/component-prompts.js";
import { buildAgentRulesMarkdown } from "./agent-rules-writer.js";
import { buildReuseReportMarkdown } from "./report-writer.js";

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function markdownList(items) {
  if (items.length === 0) {
    return "- None\n";
  }
  return items.map((item) => `- ${item}\n`).join("");
}

function pagePatternsMarkdown(pagePatterns) {
  const lines = ["# Page Patterns\n\n"];
  for (const pattern of pagePatterns) {
    lines.push(`## ${pattern.name}\n\n`);
    lines.push(`- Type: ${pattern.pageType}\n`);
    lines.push(`- Regions: ${(pattern.regions ?? []).join(", ") || "None"}\n`);
    lines.push("- Sources:\n");
    lines.push(markdownList(pattern.sourceFiles));
    lines.push("\n");
  }
  return lines.join("");
}

function businessPatternsMarkdown(businessPatterns) {
  const lines = ["# Business Patterns\n\n"];
  for (const pattern of businessPatterns) {
    lines.push(`## ${pattern.name}\n\n`);
    lines.push(`- Domain: ${pattern.businessDomain}\n`);
    lines.push(`- Entrypoints: ${pattern.entrypoints.join(", ")}\n`);
    lines.push("- Guidance:\n");
    lines.push(markdownList(pattern.guidance));
    lines.push("- Sources:\n");
    lines.push(markdownList(pattern.sourceFiles));
    lines.push("\n");
  }
  return lines.join("");
}

export async function validateMetaphorOutput(outputDir, metaphorPacks) {
  const metaphorFiles = new Map();
  for (const pack of metaphorPacks) {
    const filename = `${slugifyMetaphorSource(pack.source)}.json`;
    if (metaphorFiles.has(filename)) {
      throw new Error(`Metaphor filename collision for ${filename}: ${metaphorFiles.get(filename).source} and ${pack.source}`);
    }
    metaphorFiles.set(filename, pack);
  }
  try {
    const directory = await realpath(join(outputDir, "metaphor-packs"));
    if (directory !== join(await realpath(outputDir), "metaphor-packs")) {
      throw new Error("Metaphor output directory must stay within its asset package.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return metaphorFiles;
}

export async function writeAssetPackage(projectRoot, assetPackage, options = {}) {
  if (!options.outputDir) {
    throw new Error("writeAssetPackage requires options.outputDir");
  }
  const metaphorFiles = await validateMetaphorOutput(options.outputDir, assetPackage.metaphorPacks);
  const outputDir = options.outputDir;
  await mkdir(outputDir, { recursive: true });
  const metaphorPacksDir = join(outputDir, "metaphor-packs");
  await mkdir(metaphorPacksDir, { recursive: true });
  const resolvedPacksDir = await realpath(metaphorPacksDir);
  if (resolvedPacksDir !== join(await realpath(outputDir), "metaphor-packs")) {
    throw new Error("Metaphor output directory must stay within its asset package.");
  }

  await writeFile(
    join(outputDir, "asset-manifest.json"),
    stableJson({
      schemaVersion: assetPackage.schemaVersion,
      sourceProject: assetPackage.sourceProject,
      projectRoot: assetPackage.projectRoot,
      generatedAt: assetPackage.generatedAt,
      framework: assetPackage.framework,
      language: assetPackage.language,
      packageManager: assetPackage.packageManager,
      hasBackendEntrypoints: assetPackage.hasBackendEntrypoints,
      assetCounts: assetPackage.assetCounts,
    }),
  );

  await writeFile(
    join(outputDir, "component-catalog.json"),
    stableJson({
      schemaVersion: assetPackage.schemaVersion,
      components: assetPackage.components,
    }),
  );

  const componentPreviewRegistry = options.componentPreviewRegistry ?? {
    schemaVersion: assetPackage.schemaVersion,
    runtime: "vite-react",
    generatedAt: assetPackage.generatedAt,
    previews: assetPackage.componentPreviews,
  };
  await writeFile(
    join(outputDir, "component-previews.json"),
    stableJson(componentPreviewRegistry),
  );
  await writeComponentPreviewRuntime(projectRoot, componentPreviewRegistry, {
    previewRoot: join(outputDir, "preview-runtime"),
    sourceIndex: options.sourceIndex,
  });

  await writeFile(
    join(outputDir, "service-catalog.json"),
    stableJson({
      schemaVersion: assetPackage.schemaVersion,
      services: assetPackage.services,
      businessPatterns: assetPackage.businessPatterns,
    }),
  );

  await writeFile(
    join(outputDir, "tokens.json"),
    stableJson({
      schemaVersion: assetPackage.schemaVersion,
      tokens: assetPackage.tokens,
    }),
  );

  await writeFile(
    join(outputDir, "page-patterns.md"),
    pagePatternsMarkdown(assetPackage.pagePatterns),
  );

  await writeFile(
    join(outputDir, "business-patterns.md"),
    businessPatternsMarkdown(assetPackage.businessPatterns),
  );

  await writeFile(
    join(outputDir, "reuse-report.md"),
    buildReuseReportMarkdown(assetPackage),
  );

  await writeFile(
    join(outputDir, "agent-rules.md"),
    buildAgentRulesMarkdown(assetPackage),
  );

  await writeFile(
    join(outputDir, "concept-assets.json"),
    stableJson({
      schemaVersion: assetPackage.schemaVersion,
      conceptAssets: assetPackage.conceptAssets,
      metaphorPacks: assetPackage.metaphorPacks,
    }),
  );

  for (const [filename, pack] of metaphorFiles) {
    await writeFile(
      join(metaphorPacksDir, filename),
      stableJson(pack),
    );
  }

  const actionRefs = componentPreviewRegistry.previews.map((preview) => {
    if (!preview.actionDigest) {
      throw new Error(`Component preview action digest is missing: ${preview.id}`);
    }
    return { componentId: preview.id, actionDigest: preview.actionDigest };
  });
  const generatedAt = Date.parse(componentPreviewRegistry.generatedAt);
  if (!Number.isInteger(generatedAt)) {
    throw new Error(`Invalid component preview generatedAt: ${componentPreviewRegistry.generatedAt}`);
  }
  const previewCache = openPreviewBuildCache(outputDir);
  try {
    previewCache.replaceActionRefs(actionRefs, generatedAt);
  } finally {
    previewCache.close();
  }

  await writeComponentPrompts(outputDir, options.componentPrompts);

  for (const entry of await readdir(resolvedPacksDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json") && !metaphorFiles.has(entry.name)) {
      await unlink(join(resolvedPacksDir, entry.name));
    }
  }

  return { outputDir };
}
