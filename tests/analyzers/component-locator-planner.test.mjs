import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planComponentLocatorEvidence } from "../../dist/analyzers/component-locator-planner.js";

describe("planComponentLocatorEvidence", () => {
  it("orders stable source-authored locator evidence without choosing a runtime match", () => {
    const result = planComponentLocatorEvidence({
      name: "PrimaryButton",
      scenarios: [{
        id: "scenario-a",
        sourceFile: "src/pages/Public.tsx",
        sourceLocation: { line: 14, column: 8 },
        props: {
          "data-testid": "primary-button",
          id: "save-button",
          "aria-label": "保存",
          role: "button",
          className: "primary action-button",
        },
        slots: { default: "保存修改" },
      }],
    });

    assert.deepEqual(result, [{
      scenarioId: "scenario-a",
      sourceFile: "src/pages/Public.tsx",
      evidence: [
        { kind: "test-id", value: "primary-button", sourceLocation: { line: 14, column: 8 } },
        { kind: "id", value: "save-button", sourceLocation: { line: 14, column: 8 } },
        { kind: "aria-role", value: "button", sourceLocation: { line: 14, column: 8 } },
        { kind: "aria-label", value: "保存", sourceLocation: { line: 14, column: 8 } },
        { kind: "text", value: "保存修改", sourceLocation: { line: 14, column: 8 } },
        { kind: "class", value: "primary action-button", sourceLocation: { line: 14, column: 8 } },
      ],
    }]);
  });

  it("returns an explicit no-stable-locator result for dynamic-only usage", () => {
    const result = planComponentLocatorEvidence({
      name: "DynamicCard",
      scenarios: [{
        id: "scenario-b",
        sourceFile: "src/pages/Public.tsx",
        sourceLocation: { line: 20, column: 4 },
        props: {},
        unresolvedProps: ["spread:props"],
        slots: {},
      }],
    });

    assert.deepEqual(result, [{
      scenarioId: "scenario-b",
      sourceFile: "src/pages/Public.tsx",
      evidence: [],
      unresolvedReason: "no-stable-locator",
    }]);
  });
});
