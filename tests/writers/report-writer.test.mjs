import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildReuseReportMarkdown } from "../../dist/writers/report-writer.js";

describe("buildReuseReportMarkdown", () => {
  it("summarizes reusable assets, risks, and next extraction suggestions", () => {
    const markdown = buildReuseReportMarkdown({
      components: [
        {
          name: "Button",
          filePath: "src/components/Button.tsx",
          reusePotential: "high",
        },
      ],
      services: [
        {
          name: "auth.register",
          filePath: "src/app/api/auth/register/route.ts",
          reusePotential: "high",
          businessDomain: "auth",
        },
      ],
      businessPatterns: [
        {
          name: "auth flow",
          guidance: ["Preserve credential validation and session handling constraints."],
        },
      ],
      tokens: [
        { name: "bg-white", category: "color", occurrences: 2 },
        { name: "p-6", category: "spacing", occurrences: 1 },
      ],
      pagePatterns: [{ name: "dashboard page", pageType: "dashboard" }],
    });

    assert.match(markdown, /# Reuse Report/);
    assert.match(markdown, /## High Value Component Assets/);
    assert.match(markdown, /Button/);
    assert.match(markdown, /## High Value Service Assets/);
    assert.match(markdown, /auth\.register/);
    assert.match(markdown, /## Business Flow Reuse Guidance/);
    assert.match(markdown, /Preserve credential validation/);
    assert.match(markdown, /## Token Summary/);
    assert.match(markdown, /color: 1/);
    assert.match(markdown, /## Risks And Deferred Work/);
    assert.match(markdown, /## Next Extraction Suggestions/);
  });
});
