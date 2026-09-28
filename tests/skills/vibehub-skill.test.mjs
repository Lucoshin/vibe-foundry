import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const skillPath = ".agents/skills/vibehub/SKILL.md";
const runbookPath = "docs/runbooks/use-vibehub-skill.md";

async function readText(path) {
  return readFile(path, "utf8");
}

describe("VibeHub Codex Skill", () => {
  it("defines discoverable metadata and the required local distillation workflow", async () => {
    const skill = await readText(skillPath);

    assert.match(skill, /^---\r?\n[\s\S]*name:\s*vibehub/m);
    assert.match(skill, /^description:\s*.+/m);
    assert.match(skill, /docs\/USAGE\.md/);
    assert.match(skill, /npm test/);
    assert.match(skill, /node dist\/cli\.js distill \./);
    assert.match(skill, /central(?:ized)? asset library/i);
    assert.match(skill, /reuse-report\.md/);
    assert.doesNotMatch(skill, /\.vibehub\/reuse-report\.md/);
  });

  it("states that the skill is read-only toward user source code", async () => {
    const skill = await readText(skillPath);

    assert.match(skill, /不自动修改源码/);
    assert.match(skill, /只读取|读取/);
  });

  it("documents installation and verification steps in the runbook", async () => {
    const runbook = await readText(runbookPath);

    assert.match(runbook, /# 使用 VibeHub Skill/);
    assert.match(runbook, /\.agents\/skills\/vibehub\/SKILL\.md/);
    assert.match(runbook, /npm test/);
    assert.match(runbook, /node dist\/cli\.js distill \./);
    assert.match(runbook, /集中资产库/);
    assert.match(runbook, /<asset-package-dir>\/reuse-report\.md/);
    assert.doesNotMatch(runbook, /\.vibehub\/reuse-report\.md/);
  });
});

it("routes user targets and requires website interaction evidence in both distributed skills", async () => {
  const local = await readText(skillPath);
  const plugin = await readText("plugins/vibehub/skills/vibehub/SKILL.md");
  assert.equal(local, plugin);
  assert.match(local, /distill <target-project-root>/);
  assert.match(local, /distill-website/);
  assert.match(local, /references\/website.md/);
  assert.match(local, /逐控件/);
  assert.match(local, /get_component_prompt/);
});
