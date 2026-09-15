import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, it } from "node:test";

import { assetPackageDirectoryFor } from "../../dist/library/asset-library.js";

const fixtureRoots = [];
const mcpProcesses = new Set();
const originalLibraryRoot = process.env.VIBE_FOUNDRY_LIBRARY_ROOT;

async function loadServer() {
  return import("../../dist/mcp/server.js");
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function stopMcpProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.stdin.end();
  await Promise.race([once(child, "exit"), delay(500)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
    await once(child, "exit");
  }
}

function startMcpProcess(projectRoot, libraryRoot) {
  const child = spawn(
    process.execPath,
    [join(process.cwd(), "dist", "mcp", "server.js"), "--project-root", projectRoot],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VIBE_FOUNDRY_LIBRARY_ROOT: libraryRoot,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  mcpProcesses.add(child);

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();

  return {
    child,
    send(...messages) {
      child.stdin.write(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`);
    },
    async receive() {
      const result = await Promise.race([
        iterator.next(),
        once(child, "exit").then(([code, signal]) => {
          throw new Error(
            `MCP process exited before a JSON response: code=${code} signal=${signal} stderr=${stderr}`,
          );
        }),
        delay(3_000).then(() => {
          throw new Error(`Timed out waiting for MCP stdout JSON. stdout=${stdout} stderr=${stderr}`);
        }),
      ]);
      if (result.done) {
        throw new Error(`MCP stdout ended before a JSON response. stderr=${stderr}`);
      }
      return JSON.parse(result.value);
    },
    output() {
      return { stdout, stderr };
    },
  };
}

async function createAssetPackageFixture() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-mcp-"));
  const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-mcp-library-"));
  const assetDir = assetPackageDirectoryFor(libraryRoot, root);
  fixtureRoots.push(root, libraryRoot);
  process.env.VIBE_FOUNDRY_LIBRARY_ROOT = libraryRoot;
  await mkdir(assetDir, { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "source.ts"), "export const source = true;\n");
  await writeJson(join(assetDir, "asset-manifest.json"), {
    schemaVersion: "0.1.0",
    sourceProject: "fixture-app",
    projectRoot: root,
    generatedAt: "2026-07-08T00:00:00.000Z",
    framework: "next",
    language: "typescript",
    packageManager: "npm",
    hasBackendEntrypoints: true,
    assetCounts: {
      components: 2,
      services: 1,
      businessPatterns: 1,
      tokens: 2,
      pagePatterns: 0,
      conceptAssets: 1,
      metaphorPacks: 0,
    },
  });
  await writeJson(join(assetDir, "component-catalog.json"), {
    schemaVersion: "0.1.0",
    components: [
      {
        kind: "component",
        name: "Button",
        filePath: "src/components/Button.tsx",
        componentType: "base-ui",
        score: 0.8,
      },
      {
        kind: "component",
        name: "确认按钮",
        filePath: "src/components/ConfirmButton.tsx",
        componentType: "base-ui",
        score: 0.8,
      },
    ],
  });
  await writeJson(join(assetDir, "service-catalog.json"), {
    schemaVersion: "0.1.0",
    services: [
      {
        kind: "service",
        name: "auth.register",
        sourceFile: "src/app/api/auth/register/route.ts",
        businessDomain: "auth",
        entrypoints: ["register"],
        score: 0.9,
      },
    ],
    businessPatterns: [
      {
        kind: "business-pattern",
        name: "auth flow",
        businessDomain: "auth",
        entrypoints: ["register"],
        guidance: ["Preserve validation, session, and rate-limit boundaries."],
        sourceFiles: ["src/app/api/auth/register/route.ts"],
      },
    ],
  });
  await writeJson(join(assetDir, "tokens.json"), {
    schemaVersion: "0.1.0",
    tokens: [
      {
        kind: "design-token",
        name: "bg-white",
        category: "color",
        count: 2,
        sourceFiles: ["src/components/Button.tsx"],
      },
      {
        kind: "design-token",
        name: "rounded-lg",
        category: "radius",
        count: 1,
        sourceFiles: ["src/components/Button.tsx"],
      },
    ],
  });
  await writeJson(join(assetDir, "concept-assets.json"), {
    schemaVersion: "0.1.0",
    conceptAssets: [
      {
        kind: "concept",
        name: "activation empty state",
        useCases: ["onboarding"],
        guidance: ["Show one primary next action."],
      },
    ],
    metaphorPacks: [],
  });
  await writeFile(
    join(assetDir, "agent-rules.md"),
    "# VibeFoundry Agent Rules\n\n- 使用资产前先查 `.vibe-foundry/`。\n",
  );
  return { root, libraryRoot, assetDir };
}

describe("VibeFoundry MCP readonly server", () => {
  afterEach(async () => {
    await Promise.all(
      [...mcpProcesses].map(async (child) => {
        await stopMcpProcess(child);
        mcpProcesses.delete(child);
      }),
    );
    await Promise.all(
      fixtureRoots.splice(0).map((root) =>
        rm(root, { recursive: true, force: true }),
      ),
    );
    if (originalLibraryRoot === undefined) {
      delete process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
    } else {
      process.env.VIBE_FOUNDRY_LIBRARY_ROOT = originalLibraryRoot;
    }
  });

  it("lists the readonly asset tools required by Milestone 6", async () => {
    const { listVibeFoundryTools } = await loadServer();

    const tools = listVibeFoundryTools();

    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        "list_assets",
        "get_component",
        "get_component_prompt",
        "get_service",
        "search_tokens",
        "search_business_patterns",
        "search_concept_assets",
        "get_agent_rules",
        "validate_asset_usage",
      ],
    );
    assert.ok(tools.every((tool) => tool.inputSchema?.type === "object"));
    assert.match(tools.find((tool) => tool.name === "get_component_prompt").description, /natural-language.*layout.*visual.*interaction/i);
  });

  it("queries components, services, tokens, patterns, concepts, rules, and usage validation from the central package", async () => {
    const { root } = await createAssetPackageFixture();
    const { callVibeFoundryTool } = await loadServer();

    const assets = await callVibeFoundryTool(root, "list_assets");
    const component = await callVibeFoundryTool(root, "get_component", {
      name: "Button",
    });
    const service = await callVibeFoundryTool(root, "get_service", {
      name: "auth.register",
    });
    const tokens = await callVibeFoundryTool(root, "search_tokens", {
      query: "rounded",
    });
    const businessPatterns = await callVibeFoundryTool(
      root,
      "search_business_patterns",
      { query: "auth" },
    );
    const concepts = await callVibeFoundryTool(root, "search_concept_assets", {
      query: "empty",
    });
    const rules = await callVibeFoundryTool(root, "get_agent_rules");
    const validation = await callVibeFoundryTool(root, "validate_asset_usage", {
      kind: "service",
      name: "auth.register",
    });

    assert.equal(assets.structuredContent.manifest.sourceProject, "fixture-app");
    assert.equal(component.structuredContent.component.name, "Button");
    assert.equal(service.structuredContent.service.businessDomain, "auth");
    assert.equal(tokens.structuredContent.tokens[0].name, "rounded-lg");
    assert.equal(businessPatterns.structuredContent.businessPatterns[0].name, "auth flow");
    assert.equal(concepts.structuredContent.conceptAssets[0].name, "activation empty state");
    assert.match(rules.structuredContent.markdown, /VibeFoundry Agent Rules/);
    assert.equal(validation.structuredContent.exists, true);
    assert.match(validation.structuredContent.guidance[0], /auth\.register/);
  });

  it("reads component prompts by exact filePath even when names are identical", async () => {
    const { root, assetDir } = await createAssetPackageFixture();
    const { writeComponentPrompts } = await import("../../dist/library/component-prompts.js");
    const { callVibeFoundryTool } = await loadServer();
    const components = [{ name: "Button", filePath: "src/components/Button.tsx" }, { name: "Button", filePath: "src/admin/Button.tsx" }];
    await writeJson(join(assetDir, "component-catalog.json"), { components });
    const records = components.map((component, index) => ({ schemaVersion: "0.2.0", componentName: component.name, filePath: component.filePath, sourceDigest: String(index + 1).repeat(64), sourceFiles: [component.filePath], unresolved: [], prompt: index === 0 ? "横向布局，使用细描边。" : "纵向布局，使用圆角。" }));
    await writeComponentPrompts(assetDir, records);
    const result = await callVibeFoundryTool(root, "get_component_prompt", { filePath: "src/admin/Button.tsx" });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, records[1]);
    const normalized = await callVibeFoundryTool(root, "get_component_prompt", { filePath: "src\\admin\\Button.tsx" });
    assert.deepEqual(normalized.structuredContent, records[1]);
  });

  it("does not invent prompts for missing arguments, paths, ambiguous catalogs or old packages", async () => {
    const { root, assetDir } = await createAssetPackageFixture();
    const { callVibeFoundryTool } = await loadServer();
    for (const args of [{}, { filePath: "src/unknown.tsx" }]) {
      const result = await callVibeFoundryTool(root, "get_component_prompt", args);
      assert.equal(result.isError, true);
      assert.match(result.structuredContent.message, /filePath.*required|not found/i);
    }
    const legacy = await callVibeFoundryTool(root, "get_component_prompt", { filePath: "src/components/Button.tsx" });
    assert.equal(legacy.isError, true);
    assert.match(legacy.structuredContent.message, /distill/);
    assert.equal((await callVibeFoundryTool(root, "get_component", { name: "Button" })).isError, false);
    await writeJson(join(assetDir, "component-catalog.json"), { components: [{ name: "A", filePath: "src/Button.tsx" }, { name: "B", filePath: "src/Button.tsx" }] });
    const ambiguous = await callVibeFoundryTool(root, "get_component_prompt", { filePath: "src/Button.tsx" });
    assert.equal(ambiguous.isError, true);
    assert.match(ambiguous.structuredContent.message, /ambiguous/i);
  });

  it("rejects old source prompts while keeping other asset tools available", async () => {
    const { root, assetDir } = await createAssetPackageFixture();
    const { callVibeFoundryTool } = await loadServer();
    const filePath = "src/components/Button.tsx";
    const directory = join(assetDir, "component-prompts");
    await mkdir(directory);
    await writeJson(join(directory, createHash("sha256").update(filePath).digest("hex") + ".json"), {
      schemaVersion: "0.1.0", componentName: "Button", filePath, sourceDigest: "a".repeat(64), sourceFiles: [filePath], unresolved: [], prompt: "export function Button() {}",
    });
    const result = await callVibeFoundryTool(root, "get_component_prompt", { filePath });
    assert.equal(result.isError, true);
    assert.match(result.structuredContent.message, /提示词格式已更新，请重新炼化/);
    assert.doesNotMatch(JSON.stringify(result), /export function/);
    assert.equal((await callVibeFoundryTool(root, "get_component", { name: "Button" })).isError, false);
  });

  it("returns a clear error when the asset package is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-foundry-mcp-missing-"));
    const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-mcp-library-missing-"));
    fixtureRoots.push(root, libraryRoot);
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = libraryRoot;
    const { callVibeFoundryTool } = await loadServer();

    const result = await callVibeFoundryTool(root, "list_assets");

    assert.equal(result.isError, true);
    assert.match(result.structuredContent.message, /centralized asset package/i);
    assert.match(result.structuredContent.message, /vibe-foundry distill \./);
  });

  it("ignores a stale source-local package when a newer central package exists", async () => {
    const { root, assetDir } = await createAssetPackageFixture();
    const staleDir = join(root, ".vibe-foundry");
    await cp(assetDir, staleDir, { recursive: true });
    const staleManifest = JSON.parse(await readFile(join(staleDir, "asset-manifest.json"), "utf8"));
    staleManifest.generatedAt = "2025-01-01T00:00:00.000Z";
    await writeJson(join(staleDir, "asset-manifest.json"), staleManifest);
    const { callVibeFoundryTool } = await loadServer();

    const result = await callVibeFoundryTool(root, "list_assets");

    assert.equal(result.structuredContent.manifest.generatedAt, "2026-07-08T00:00:00.000Z");
  });

  it("prefers an explicit assetLibraryRoot over the environment", async () => {
    const { root, libraryRoot } = await createAssetPackageFixture();
    const wrongLibraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-mcp-wrong-library-"));
    fixtureRoots.push(wrongLibraryRoot);
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = wrongLibraryRoot;
    const { callVibeFoundryTool } = await loadServer();

    const result = await callVibeFoundryTool(
      root,
      "list_assets",
      {},
      { assetLibraryRoot: libraryRoot },
    );

    assert.equal(result.structuredContent.manifest.sourceProject, "fixture-app");
  });

  it("does not modify source files while serving MCP tool calls", async () => {
    const { root } = await createAssetPackageFixture();
    const sourceFile = join(root, "src", "source.ts");
    const beforeContent = await readFile(sourceFile, "utf8");
    const beforeStat = await stat(sourceFile);
    const { callVibeFoundryTool } = await loadServer();

    await callVibeFoundryTool(root, "list_assets");
    await callVibeFoundryTool(root, "validate_asset_usage", {
      kind: "component",
      name: "Button",
    });

    const afterContent = await readFile(sourceFile, "utf8");
    const afterStat = await stat(sourceFile);
    assert.equal(afterContent, beforeContent);
    assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
  });

  it("documents local MCP usage, readonly scope, and verification steps", async () => {
    const runbook = await readFile(
      "docs/runbooks/use-vibe-foundry-mcp.md",
      "utf8",
    );
    const masterPlan = await readFile(
      "docs/plans/2026-07-08-vibe-foundry-master-implementation.md",
      "utf8",
    );

    assert.match(runbook, /# 使用 VibeFoundry MCP/);
    assert.match(runbook, /src\/mcp\/server\.ts/);
    assert.match(runbook, /list_assets/);
    assert.match(runbook, /validate_asset_usage/);
    assert.match(runbook, /只读/);
    assert.match(runbook, /只读取集中资产库中的项目资产包/);
    assert.match(runbook, /不提供回退/);
    assert.doesNotMatch(runbook, /只读取 `\.vibe-foundry/);
    assert.match(runbook, /npm test/);
    assert.match(runbook, /npm run build/);
    assert.match(runbook, /2025-06-18/);
    assert.match(runbook, /换行分隔/);
    assert.doesNotMatch(runbook, /Content-Length/);
    assert.match(masterPlan, /2025-06-18/);
    assert.match(masterPlan, /换行分隔/);
  });

  it("handles MCP JSON-RPC tools/list and tools/call requests", async () => {
    const { root } = await createAssetPackageFixture();
    const { handleMcpRequest } = await loadServer();

    const toolsResponse = await handleMcpRequest(root, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const callResponse = await handleMcpRequest(root, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_component",
        arguments: { name: "Button" },
      },
    });

    assert.equal(toolsResponse.jsonrpc, "2.0");
    assert.equal(toolsResponse.result.tools.length, 9);
    assert.equal(callResponse.result.structuredContent.component.name, "Button");
  });

  it("serves the MCP 2025-06-18 lifecycle and tools over newline-delimited stdio", async () => {
    const { root, libraryRoot } = await createAssetPackageFixture();
    const server = startMcpProcess(root, libraryRoot);

    try {
      server.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "vibe-foundry-test", version: "1.0.0" },
        },
      });
      const initialized = await server.receive();
      assert.equal(initialized.id, 1);
      assert.equal(initialized.result.protocolVersion, "2025-06-18");

      server.send(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      );
      const tools = await server.receive();
      assert.equal(tools.id, 2, "notifications/initialized must not produce a response");
      assert.equal(tools.result.tools.length, 9);

      server.send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_component",
          arguments: { name: "确认按钮" },
        },
      });
      const called = await server.receive();
      assert.equal(called.id, 3);
      assert.equal(called.result.structuredContent.component.name, "确认按钮");

      await stopMcpProcess(server.child);
      mcpProcesses.delete(server.child);
      const { stdout } = server.output();
      const messages = stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        messages.map((message) => message.id),
        [1, 2, 3],
      );
      assert.doesNotMatch(stdout, /Content-Length/i);
    } finally {
      await stopMcpProcess(server.child);
      mcpProcesses.delete(server.child);
    }
  });
});
