import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("create metaphor pack runbook", () => {
  it("documents source ownership, copyright boundaries, and verification", async () => {
    const runbook = await readFile(
      "docs/runbooks/create-metaphor-pack.md",
      "utf8",
    );

    assert.match(runbook, /# 创建 metaphor pack/);
    assert.match(runbook, /docs\/metaphors/);
    assert.match(runbook, /不保存整本书/);
    assert.match(runbook, /不保存大段版权原文/);
    assert.match(runbook, /node dist\/cli\.js distill \./);
    assert.match(runbook, /集中资产包目录/);
    assert.match(runbook, /<asset-package-dir>\/metaphor-packs/);
    assert.doesNotMatch(runbook, /\.vibe-foundry\/metaphor-packs/);
    assert.match(runbook, /npm test/);
  });
});
