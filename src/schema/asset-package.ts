export const AssetKindSchema = {
  options: [
    "component",
    "service",
    "business-pattern",
    "page-pattern",
    "design-token",
    "concept",
    "metaphor",
  ],
  parse(value) {
    if (!this.options.includes(value)) {
      throw new Error(`Unknown asset kind: ${value}`);
    }
    return value;
  },
};

const emptyCounts = {
  components: 0,
  services: 0,
  businessPatterns: 0,
  tokens: 0,
  pagePatterns: 0,
  conceptAssets: 0,
  metaphorPacks: 0,
  componentPreviews: 0,
};

export const AssetPackageSchema = {
  parse(value) {
    if (!value || typeof value !== "object") {
      throw new Error("Asset package must be an object");
    }
    const required = [
      "schemaVersion",
      "sourceProject",
      "projectRoot",
      "generatedAt",
      "framework",
      "language",
      "packageManager",
      "assetCounts",
      "components",
      "services",
      "businessPatterns",
      "tokens",
      "pagePatterns",
      "conceptAssets",
      "metaphorPacks",
      "componentPreviews",
    ];
    for (const key of required) {
      if (!(key in value)) {
        throw new Error(`Asset package missing required key: ${key}`);
      }
    }
    return value;
  },
};

export function createEmptyAssetPackage(options) {
  return {
    schemaVersion: "0.1.0",
    sourceProject: options.sourceProject,
    projectRoot: options.projectRoot,
    generatedAt: options.generatedAt,
    framework: options.framework,
    language: options.language,
    packageManager: options.packageManager,
    hasBackendEntrypoints: Boolean(options.hasBackendEntrypoints),
    assetCounts: { ...emptyCounts },
    components: [],
    services: [],
    businessPatterns: [],
    tokens: [],
    pagePatterns: [],
    conceptAssets: [],
    metaphorPacks: [],
    componentPreviews: [],
  };
}
