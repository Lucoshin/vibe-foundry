import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { analyzeServices } from "../../dist/analyzers/service-analyzer.js";

const fixtureRoots = [];

async function createServiceFixture() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-services-"));
  fixtureRoots.push(root);
  await mkdir(join(root, "src", "app", "api", "auth", "register"), {
    recursive: true,
  });
  await writeFile(
    join(root, "src", "app", "api", "auth", "register", "route.ts"),
    "export async function POST(request) { const body = await request.json(); return Response.json({ ok: true }); }\n",
  );
  return root;
}

describe("analyzeServices", () => {
  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((root) =>
        rm(root, { recursive: true, force: true }),
      ),
    );
  });

  it("extracts service assets from API directories", async () => {
    const root = await createServiceFixture();

    const services = await analyzeServices(root, ["src/app/api"], []);

    assert.deepEqual(services, [
      {
        name: "auth.register",
        filePath: "src/app/api/auth/register/route.ts",
        kind: "service",
        businessDomain: "auth",
        entrypoints: ["register"],
        routePath: "/auth/register",
        methods: ["POST"],
        reusePotential: "high",
      },
    ]);
  });
});
