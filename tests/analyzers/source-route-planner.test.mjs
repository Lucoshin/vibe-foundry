import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { planSourceRoutes } from "../../dist/analyzers/source-route-planner.js";
import { buildFrontendSourceIndex } from "../../dist/analyzers/frontend-source-index.js";

const roots = [];

async function createProject(files) {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-source-routes-"));
  roots.push(root);
  for (const [filePath, source] of Object.entries(files)) {
    const outputPath = join(root, filePath);
    await mkdir(join(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, source);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("planSourceRoutes", () => {
  it("finds statically proven Next, React Router, Vue Router, and uni-app routes", async () => {
    const root = await createProject({
      "src/app/page.tsx": "export default function Home() { return <main>Home</main>; }",
      "src/app/about/page.tsx": "export default function About() { return <main>About</main>; }",
      "src/react-routes.tsx": `
        import { Route } from "react-router-dom";
        import Jobs from "./pages/Jobs";
        export const routes = <Route path="/jobs" element={<Jobs />} />;
      `,
      "src/vue-router.ts": `
        import { createRouter } from "vue-router";
        import Jobs from "./pages/Jobs.vue";
        export const routes = [{ path: "/vue-jobs", component: Jobs }];
      `,
      "src/pages/Jobs.tsx": "export default function Jobs() { return <main>Jobs</main>; }",
      "src/pages/Jobs.vue": "<template><main>Jobs</main></template>",
      "pages.json": JSON.stringify({ pages: [{ path: "pages/public/index" }] }),
    });

    const plan = await planSourceRoutes(root, ["src"]);

    assert.deepEqual(plan.routes.map((route) => [route.route, route.sourceFile, route.evidence]), [
      ["/", "src/app/page.tsx", "next-app-page"],
      ["/about", "src/app/about/page.tsx", "next-app-page"],
      ["/jobs", "src/react-routes.tsx", "react-router-static-path"],
      ["/pages/public/index", "pages.json", "uni-pages-json"],
      ["/vue-jobs", "src/vue-router.ts", "vue-router-static-path"],
    ]);
  });

  it("keeps dynamic and guarded routes unresolved instead of declaring them public", async () => {
    const root = await createProject({
      "src/routes.tsx": `
        import { Route } from "react-router-dom";
        export function Routes({ path }) {
          return <ProtectedRoute><Route path={path} element={<main />} /></ProtectedRoute>;
        }
      `,
    });

    const plan = await planSourceRoutes(root, ["src"]);

    assert.deepEqual(plan.routes, []);
    assert.deepEqual(plan.unresolved, [{
      sourceFile: "src/routes.tsx",
      reason: "dynamic-or-guarded-route",
    }]);
  });

  it("ignores custom Route components and ordinary routes-shaped data", async () => {
    const root = await createProject({
      "src/custom.tsx": `
        function Route() { return null; }
        const routes = [{ path: "/not-a-router", component: "metadata" }];
        export default () => <Route path="/also-not-a-router" />;
      `,
    });

    const plan = await planSourceRoutes(root, ["src"]);

    assert.deepEqual(plan, { routes: [], unresolved: [] });
  });

  it("plans router routes from the shared source snapshot", async () => {
    const root = await createProject({
      "src/routes.tsx": "import { Route } from 'react-router-dom'; export const route = <Route path='/original' />;",
    });
    const sourceIndex = await buildFrontendSourceIndex(root, ["src"]);
    await writeFile(join(root, "src", "routes.tsx"), "import { Route } from 'react-router-dom'; export const route = <Route path='/changed' />;");

    const plan = await planSourceRoutes(root, ["src"], { sourceIndex });

    assert.deepEqual(plan.routes.map((route) => route.route), ["/original"]);
  });

  it("does not read or parse files without router imports", async () => {
    const root = await createProject({});
    const sourceIndex = {
      files: [{ filePath: "src/not-a-router.ts", sourceText: "not parsed @", imports: [], dependencies: [] }],
    };

    const plan = await planSourceRoutes(root, ["src"], { sourceIndex });

    assert.deepEqual(plan, { routes: [], unresolved: [] });
  });

  it("retains Vue router evidence from a side-effect import", async () => {
    const root = await createProject({
      "src/routes.ts": "import 'vue-router'; const Page = {}; export const routes = [{ path: '/public', component: Page }];",
    });

    const plan = await planSourceRoutes(root, ["src"]);

    assert.deepEqual(plan.routes.map((route) => route.route), ["/public"]);
  });
});
