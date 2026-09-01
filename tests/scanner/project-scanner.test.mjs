import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { scanProject } from "../../dist/scanner/project-scanner.js";

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createProject(packageJson, directories) {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-project-scan-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify(packageJson));
  await Promise.all(directories.map((directory) => mkdir(join(root, directory), { recursive: true })));
  return root;
}

describe("scanProject", () => {
  it("includes feature, layout, provider, and uni-app package roots", async () => {
    const root = await createProject(
      { name: "frontend", dependencies: { react: "latest" } },
      ["src/components", "src/features", "src/layouts", "src/providers", "src/pages", "src/pagesA", "src/pagesB"],
    );

    const scan = await scanProject(root);

    assert.deepEqual(scan.sourceDirs, ["src"]);
    assert.deepEqual(scan.componentDirs, [
      "src/components",
      "src/features",
      "src/layouts",
      "src/providers",
    ]);
    assert.deepEqual(scan.pageDirs, ["src/pages", "src/pagesA", "src/pagesB"]);
  });

  it("identifies uni-app before generic Vite", async () => {
    const root = await createProject(
      {
        name: "uni-project",
        dependencies: { vue: "latest", "@dcloudio/uni-app": "latest" },
        devDependencies: { vite: "latest", "@dcloudio/vite-plugin-uni": "latest", typescript: "latest" },
      },
      ["src/components", "src/pages"],
    );

    const scan = await scanProject(root);

    assert.equal(scan.framework, "uni-app");
    assert.equal(scan.language, "typescript");
  });
});
