import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const skillPath = ".agents/skills/vibe-foundry/SKILL.md";
const runbookPath = "docs/runbooks/use-vibe-foundry-skill.md";

async function readText(path) {
  return readFile(path, "utf8");
}

describe("VibeFoundry Codex Skill", () => {
  it("defines discoverable metadata and the required local distillation workflow", async () => {
    const skill = await readText(skillPath);

    assert.match(skill, /^---\n[\s\S]*name:\s*vibe-foundry/m);
    assert.match(skill, /^description:\s*.+/m);
    assert.match(skill, /docs\/README\.md/);
    assert.match(skill, /npm test/);
    assert.match(skill, /node dist\/cli\.js distill \./);
    assert.match(skill, /central(?:ized)? asset library/i);
    assert.match(skill, /reuse-report\.md/);
    assert.doesNotMatch(skill, /\.vibe-foundry\/reuse-report\.md/);
  });

  it("states that the skill is read-only toward user source code", async () => {
    const skill = await readText(skillPath);

    assert.match(skill, /不自动修改源码/);
    assert.match(skill, /只读取|读取/);
  });

  it("documents installation and verification steps in the runbook", async () => {
    const runbook = await readText(runbookPath);

    assert.match(runbook, /# 使用 VibeFoundry Skill/);
    assert.match(runbook, /\.agents\/skills\/vibe-foundry\/SKILL\.md/);
    assert.match(runbook, /npm test/);
    assert.match(runbook, /node dist\/cli\.js distill \./);
    assert.match(runbook, /集中资产库/);
    assert.match(runbook, /<asset-package-dir>\/reuse-report\.md/);
    assert.doesNotMatch(runbook, /\.vibe-foundry\/reuse-report\.md/);
  });
});
