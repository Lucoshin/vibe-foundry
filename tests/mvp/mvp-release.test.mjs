import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function readText(path) {
  return readFile(path, "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

describe("MVP release artifacts", () => {
  it("documents a 10-minute quickstart with install, distill, MCP, and plugin checks", async () => {
    const quickstart = await readText("docs/runbooks/quickstart.md");

    assert.match(quickstart, /# VibeHub Quickstart/);
    assert.match(quickstart, /npm test/);
    assert.match(quickstart, /npm run build/);
    assert.match(quickstart, /node dist\/cli\.js distill examples\/fixture-project/);
    assert.match(quickstart, /search_concept_assets/);
    assert.match(quickstart, /plugins\/vibehub/);
  });

  it("includes a realistic fixture project covering engineering, product, and metaphor assets", async () => {
    const packageJson = await readJson("examples/fixture-project/package.json");
    const button = await readText("examples/fixture-project/src/components/Button.tsx");
    const route = await readText(
      "examples/fixture-project/src/app/api/auth/register/route.ts",
    );
    const product = await readText("examples/fixture-project/docs/product.md");
    const metaphor = await readText(
      "examples/fixture-project/docs/metaphors/memory-palace.md",
    );

    assert.equal(packageJson.name, "vibehub-fixture");
    assert.match(button, /className/);
    assert.match(route, /POST/);
    assert.match(product, /Onboarding/);
    assert.match(product, /Pricing/);
    assert.match(metaphor, /library/);
    assert.match(metaphor, /compass/);
  });

  it("provides a complete MVP verification script", async () => {
    const script = await readText("scripts/verify-mvp.mjs");

    assert.match(script, /run\("npm",\s*\["test"\]/);
    assert.doesNotMatch(script, /run\("npm",\s*\["run",\s*"build"\]/);
    assert.match(script, /examples\/fixture-project/);
    assert.match(script, /distill/);
    assert.match(script, /search_concept_assets/);
    assert.match(script, /get_component_prompt/);
    assert.match(script, /mkdtemp/);
    assert.match(script, /VIBEHUB_LIBRARY_ROOT/);
    assert.match(script, /assetPackageDirectoryFor/);
    assert.match(script, /finally/);
    assert.doesNotMatch(script, /join\(fixtureRoot,\s*["']\.vibehub["']/);
    assert.doesNotMatch(script, /validate_plugin\.py/);
    assert.doesNotMatch(script, /C:\\\\Users\\/);
  });
});
