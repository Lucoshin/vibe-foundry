import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeProductPatterns,
  supportedProductPatternTypes,
} from "../../dist/analyzers/product-pattern-analyzer.js";
import { createConceptAsset } from "../../dist/schema/concept-assets.js";

describe("analyzeProductPatterns", () => {
  it("extracts reusable product design assets from PRD and page files", async () => {
    const assets = await analyzeProductPatterns([
      {
        filePath: "docs/product.md",
        text: [
          "# Product Notes",
          "Onboarding should guide first-time users to invite teammates.",
          "The pricing page needs an upgrade prompt and clear plan comparison.",
          "Empty state should show one primary action for user activation.",
        ].join("\n"),
      },
      {
        filePath: "src/app/dashboard/page.tsx",
        text: "export default function Dashboard() { return <main>Dashboard overview with recent activity</main>; }",
      },
    ]);

    assert.ok(supportedProductPatternTypes.includes("onboarding"));
    assert.ok(assets.length >= 4);
    assert.ok(assets.some((asset) => asset.patternType === "onboarding"));
    assert.ok(assets.some((asset) => asset.patternType === "pricing"));
    assert.ok(assets.some((asset) => asset.patternType === "empty-state"));
    assert.ok(assets.some((asset) => asset.patternType === "dashboard"));

    const onboarding = assets.find((asset) => asset.patternType === "onboarding");
    assert.equal(onboarding.kind, "concept");
    assert.match(onboarding.name, /onboarding/);
    assert.deepEqual(onboarding.sourceFiles, ["docs/product.md"]);
    assert.ok(onboarding.useCases.includes("new user activation"));
    assert.ok(onboarding.guidance.length > 0);
    assert.ok(onboarding.limitations.length > 0);
  });
});

describe("createConceptAsset", () => {
  it("creates a stable concept asset with required reuse fields", () => {
    const asset = createConceptAsset({
      patternType: "invite",
      sourceFiles: ["docs/product.md"],
    });

    assert.equal(asset.kind, "concept");
    assert.equal(asset.patternType, "invite");
    assert.match(asset.name, /invite/);
    assert.ok(asset.applicableScenarios.length > 0);
    assert.ok(asset.guidance.length > 0);
    assert.ok(asset.limitations.length > 0);
  });
});
