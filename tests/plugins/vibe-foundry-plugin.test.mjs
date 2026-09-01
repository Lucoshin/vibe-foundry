import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("VibeFoundry Codex Plugin", () => {
  it("defines a valid plugin manifest with skills and MCP config", async () => {
    const manifest = await readJson(
      "plugins/vibe-foundry/.codex-plugin/plugin.json",
    );

    assert.equal(manifest.name, "vibe-foundry");
    assert.match(manifest.version, /^\d+\.\d+\.\d+/);
    assert.match(manifest.description, /asset/i);
    assert.equal(manifest.author.name, "Lucoshin");
    assert.equal(manifest.author.url, "https://github.com/Lucoshin");
    assert.equal(manifest.license, "Apache-2.0");
    assert.equal(manifest.repository, "https://github.com/Lucoshin/vibe-foundry");
    assert.equal(manifest.interface.developerName, "Lucoshin");
    assert.equal(manifest.skills, "./skills/");
    assert.equal(manifest.mcpServers, "./.mcp.json");
    assert.equal(manifest.interface.displayName, "VibeFoundry");
    assert.equal(manifest.interface.category, "Productivity");
    assert.ok(manifest.interface.defaultPrompt.length <= 3);
    assert.doesNotMatch(JSON.stringify(manifest), /\[TODO:/);
  });

  it("packages the VibeFoundry skill for plugin installation", async () => {
    const skill = await readFile(
      "plugins/vibe-foundry/skills/vibe-foundry/SKILL.md",
      "utf8",
    );

    assert.match(skill, /^---\n[\s\S]*name:\s*vibe-foundry/m);
    assert.match(skill, /docs\/README\.md/);
    assert.match(skill, /node dist\/cli\.js distill \./);
    assert.match(skill, /central asset library/i);
    assert.match(skill, /centralized asset package directory printed by `distill`/i);
    assert.match(skill, /reuse-report\.md/);
    assert.doesNotMatch(skill, /\.vibe-foundry\/reuse-report\.md/);
    assert.match(skill, /不自动修改源码/);
  });

  it("declares an MCP server companion file", async () => {
    const mcp = await readJson("plugins/vibe-foundry/.mcp.json");

    assert.equal(mcp.mcpServers["vibe-foundry"].type, "stdio");
    assert.equal(mcp.mcpServers["vibe-foundry"].command, "node");
    assert.ok(
      mcp.mcpServers["vibe-foundry"].args.some((arg) =>
        arg.includes("dist/mcp/server.js"),
      ),
    );
  });

  it("adds a repo-local marketplace entry with install and auth policy", async () => {
    const marketplace = await readJson(".agents/plugins/marketplace.json");
    const entry = marketplace.plugins.find((plugin) => plugin.name === "vibe-foundry");

    assert.equal(marketplace.name, "vibe-foundry");
    assert.equal(marketplace.interface.displayName, "VibeFoundry");
    assert.equal(entry.source.source, "local");
    assert.equal(entry.source.path, "./plugins/vibe-foundry");
    assert.equal(entry.policy.installation, "AVAILABLE");
    assert.equal(entry.policy.authentication, "ON_INSTALL");
    assert.equal(entry.category, "Productivity");
  });

  it("documents installation, enablement, and verification", async () => {
    const runbook = await readFile(
      "docs/runbooks/install-vibe-foundry-plugin.md",
      "utf8",
    );

    assert.match(runbook, /# 安装 VibeFoundry Plugin/);
    assert.match(runbook, /plugins\/vibe-foundry\/.codex-plugin\/plugin\.json/);
    assert.match(runbook, /.agents\/plugins\/marketplace\.json/);
    assert.match(runbook, /npm test/);
    assert.match(runbook, /npm run build/);
    assert.match(runbook, /validate_plugin\.py/);
  });
});
