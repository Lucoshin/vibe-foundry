import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const fixtureRoot = resolve("examples/fixture-project");
const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function run(command, args, environment) {
  const useWindowsNpmCli = command === "npm" && process.platform === "win32";
  const executable = useWindowsNpmCli ? process.execPath : command;
  const commandArgs = useWindowsNpmCli ? [npmCli, ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const reason = result.error ? ` (${result.error.message})` : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${reason}`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const libraryRoot = await mkdtemp(join(tmpdir(), "vibe-foundry-mvp-library-"));
const originalLibraryRoot = process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
try {
  process.env.VIBE_FOUNDRY_LIBRARY_ROOT = libraryRoot;
  const environment = {
    ...process.env,
    VIBE_FOUNDRY_LIBRARY_ROOT: libraryRoot,
  };

  run("npm", ["test"], environment);
  run("node", ["dist/cli.js", "distill", fixtureRoot], environment);

  const { assetPackageDirectoryFor } = await import("../dist/library/asset-library.js");
  const assetDir = assetPackageDirectoryFor(libraryRoot, fixtureRoot);
  const manifest = await readJson(join(assetDir, "asset-manifest.json"));
  const concepts = await readJson(join(assetDir, "concept-assets.json"));
  const metaphorPack = await readJson(
    join(assetDir, "metaphor-packs", "memory-palace.json"),
  );
  const index = await readJson(join(libraryRoot, "index.json"));
  const projectEntry = index.projects.find((project) => project.projectRoot === manifest.projectRoot);
  const { callVibeFoundryTool } = await import("../dist/mcp/server.js");
  const conceptSearch = await callVibeFoundryTool(fixtureRoot, "search_concept_assets", {
    query: "library",
  });

  assert(manifest.projectRoot === fixtureRoot, "manifest projectRoot should remain the source project root");
  assert(projectEntry?.assetPackageDir === assetDir, "index should record the generated asset package directory");
  assert(projectEntry?.generatedAt === manifest.generatedAt, "index and manifest timestamps should match");
  assert(manifest.assetCounts.components >= 1, "fixture should produce component assets");
  assert(manifest.assetCounts.services >= 1, "fixture should produce service assets");
  assert(concepts.conceptAssets.length > 0, "fixture should produce concept assets");
  assert(concepts.metaphorPacks.length > 0, "fixture should produce metaphor packs");
  assert(metaphorPack.copyrightNotes.includes("不保存长段原文"), "metaphor pack must include copyright notes");
  assert(
    conceptSearch.structuredContent.metaphorPacks.length > 0,
    "MCP search_concept_assets should find metaphor packs",
  );

  const componentPath = "src/components/Button.tsx";
  const { readComponentPrompt } = await import("../dist/library/component-prompts.js");
  const componentPrompt = await callVibeFoundryTool(fixtureRoot, "get_component_prompt", { filePath: componentPath });
  const storedPrompt = await readComponentPrompt(assetDir, componentPath);
  assert(!componentPrompt.isError, "MCP get_component_prompt should return the fixture component prompt");
  assert(JSON.stringify(componentPrompt.structuredContent) === JSON.stringify(storedPrompt), "MCP component prompt should match its persisted record exactly");
  assert(storedPrompt.schemaVersion === "0.2.0", "component prompt should use the effect-description contract");
  assert(["布局", "视觉", "动效", "交互", "Continue"].every((text) => storedPrompt.prompt.includes(text)), "component prompt should describe the four design dimensions and actual visible label");
  assert(!/export function|import |```|<button/.test(storedPrompt.prompt), "component prompt must not include source code");

  const plugin = await readJson("plugins/vibe-foundry/.codex-plugin/plugin.json");
  assert(plugin.name === "vibe-foundry", "plugin manifest name should be vibe-foundry");
  assert(plugin.skills === "./skills/", "plugin manifest should declare skills");
  assert(plugin.mcpServers === "./.mcp.json", "plugin manifest should declare MCP config");

  console.log("MVP verification passed.");
} finally {
  if (originalLibraryRoot === undefined) {
    delete process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
  } else {
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = originalLibraryRoot;
  }
  await rm(libraryRoot, { recursive: true, force: true });
}
