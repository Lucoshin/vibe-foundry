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
  const root = await mkdtemp(join(tmpdir(), "vibehub-project-scan-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify(packageJson));
  await Promise.all(directories.map((directory) => mkdir(join(root, directory), { recursive: true })));
  return root;
}

describe("scanProject", () => {
  it('includes admin view candidates and singular layout directory', async () => {
    const root = await createProject({name:'admin',dependencies:{vue:'2.6.14'}}, ['src/views','src/layout']);
    const scan = await scanProject(root);
    assert.deepEqual(scan.componentDirs, ['src/layout','src/views']);
    assert.ok(scan.pageDirs.includes('src/views'));
  });
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

it("finds app components and common UI/widget roots", async () => {
  const directories = ["app/components", "app/layouts", "src/widgets", "src/ui", "ui"];
  const root = await createProject({ name: "frontend", dependencies: { react: "latest" } }, directories);
  const scan = await scanProject(root);
  assert.deepEqual([...scan.componentDirs].sort(), directories.sort());
  for (const directory of directories) await writeFile(join(root, directory, 'Button.jsx'), 'export default function Button() { return <button>真实组件</button>; }');
  const { buildFrontendSourceIndex } = await import('../../dist/analyzers/frontend-source-index.js');
  const { analyzeComponents } = await import('../../dist/analyzers/component-analyzer.js');
  const sourceIndex = await buildFrontendSourceIndex(root, scan.componentDirs);
  const components = await analyzeComponents(root, scan.componentDirs, scan.componentDirs, { sourceIndex });
  assert.deepEqual(components.map(component => component.filePath).sort(), directories.map(directory => directory + '/Button.jsx').sort());
});
