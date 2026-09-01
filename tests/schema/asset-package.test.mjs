import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AssetKindSchema,
  AssetPackageSchema,
  createEmptyAssetPackage,
} from "../../dist/schema/asset-package.js";

describe("asset package schema", () => {
  it("accepts the universal asset kinds needed by the roadmap", () => {
    assert.deepEqual(AssetKindSchema.options, [
      "component",
      "service",
      "business-pattern",
      "page-pattern",
      "design-token",
      "concept",
      "metaphor",
    ]);
  });

  it("creates a minimal package with engineering and concept extension points", () => {
    const assetPackage = createEmptyAssetPackage({
      sourceProject: "fixture-app",
      projectRoot: "D:/tmp/fixture-app",
      generatedAt: "2026-07-08T00:00:00.000Z",
      framework: "next",
      language: "typescript",
      packageManager: "npm",
      hasBackendEntrypoints: true,
    });

    const parsed = AssetPackageSchema.parse(assetPackage);

    assert.deepEqual(parsed.assetCounts, {
      components: 0,
      services: 0,
      businessPatterns: 0,
      tokens: 0,
      pagePatterns: 0,
      conceptAssets: 0,
      metaphorPacks: 0,
      componentPreviews: 0,
    });
    assert.deepEqual(parsed.services, []);
    assert.deepEqual(parsed.businessPatterns, []);
    assert.deepEqual(parsed.conceptAssets, []);
    assert.deepEqual(parsed.componentPreviews, []);
  });
});
