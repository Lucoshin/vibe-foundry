import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAgentRulesMarkdown } from "../../dist/writers/agent-rules-writer.js";

describe("buildAgentRulesMarkdown", () => {
  it("emits agent rules for asset lookup, backend constraints, and culture assets", () => {
    const markdown = buildAgentRulesMarkdown();

    assert.match(markdown, /# VibeFoundry Agent Rules/);
    assert.match(markdown, /查本次 `distill` 输出的集中资产包目录/);
    assert.doesNotMatch(markdown, /\.vibe-foundry/);
    assert.match(markdown, /优先复用已有 tokens/);
    assert.match(markdown, /service-catalog\.json/);
    assert.match(markdown, /登录\/注册\/权限/);
    assert.match(markdown, /不保存大段版权原文/);
  });
});
