import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  candidateCaptureDigest,
  createCandidateCaptureSpec,
  createFidelityComparisonSpec,
  createSourceCaptureSpec,
  fidelityComparisonDigest,
  sourceCaptureDigest,
  validateFidelityStatus,
} from "../../dist/fidelity/fidelity-protocol.js";

const digest = (character) => character.repeat(64);

function sourceInput(overrides = {}) {
  return {
    componentId: "button-primary",
    route: "/public/components",
    usageSource: "src/pages/PublicComponents.tsx",
    locatorEvidence: [{
      kind: "test-id",
      value: "primary-button",
      sourceLocation: { line: 12, column: 7 },
    }],
    viewport: {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      colorScheme: "light",
    },
    states: ["default", "hover", "focus"],
    projectRuntimeDigest: digest("a"),
    collectorDigest: digest("b"),
    browserDigest: digest("c"),
    themeDigest: digest("d"),
    fontDigest: digest("e"),
    ...overrides,
  };
}

describe("fidelity protocol", () => {
  it("canonicalizes source capture actions and uses a full domain-separated digest", () => {
    const first = createSourceCaptureSpec(sourceInput());
    const second = createSourceCaptureSpec({
      browserDigest: digest("c"),
      collectorDigest: digest("b"),
      componentId: "button-primary",
      fontDigest: digest("e"),
      locatorEvidence: [{
        sourceLocation: { column: 7, line: 12 },
        value: "primary-button",
        kind: "test-id",
      }],
      projectRuntimeDigest: digest("a"),
      route: "/public/components",
      states: ["default", "hover", "focus"],
      themeDigest: digest("d"),
      usageSource: "src/pages/PublicComponents.tsx",
      viewport: {
        colorScheme: "light",
        deviceScaleFactor: 1,
        height: 844,
        width: 390,
      },
    });

    assert.deepEqual(first, second);
    assert.match(sourceCaptureDigest(first), /^[a-f0-9]{64}$/);
    assert.equal(sourceCaptureDigest(first), sourceCaptureDigest(second));
  });

  it("invalidates source capture for every execution-relevant input class", () => {
    const base = sourceCaptureDigest(createSourceCaptureSpec(sourceInput()));
    const variants = [
      { route: "/another-public-route" },
      { viewport: { ...sourceInput().viewport, width: 1280 } },
      { states: ["default"] },
      { locatorEvidence: [{ kind: "id", value: "other", sourceLocation: { line: 1, column: 1 } }] },
      { projectRuntimeDigest: digest("f") },
      { collectorDigest: digest("1") },
      { browserDigest: digest("2") },
      { themeDigest: digest("3") },
      { fontDigest: digest("4") },
    ];

    for (const variant of variants) {
      assert.notEqual(
        sourceCaptureDigest(createSourceCaptureSpec(sourceInput(variant))),
        base,
      );
    }
  });

  it("rejects unstable or secret-bearing capture inputs", () => {
    for (const invalid of [
      { usageSource: "D:/private/project/src/Page.tsx" },
      { pid: 1234 },
      { generatedAt: "2026-07-14T00:00:00.000Z" },
      { cookie: "session=secret" },
      { environmentValues: { API_TOKEN: "secret" } },
    ]) {
      assert.throws(
        () => createSourceCaptureSpec(sourceInput(invalid)),
        /Unsupported source capture field|relative project path/,
      );
    }
  });

  it("keeps candidate and comparison actions in independent digest domains", () => {
    const candidate = createCandidateCaptureSpec({
      componentId: "button-primary",
      previewActionDigest: digest("5"),
      artifactTreeDigest: digest("6"),
      collectorDigest: digest("b"),
      browserDigest: digest("c"),
      viewport: sourceInput().viewport,
      states: ["default", "hover", "focus"],
    });
    const comparison = createFidelityComparisonSpec({
      referenceTreeDigest: digest("7"),
      candidateTreeDigest: digest("8"),
      comparatorDigest: digest("9"),
      thresholds: {
        geometryPx: 2,
        visualMismatchRatio: 0.01,
        structureMismatchCount: 0,
      },
    });

    assert.match(candidateCaptureDigest(candidate), /^[a-f0-9]{64}$/);
    assert.match(fidelityComparisonDigest(comparison), /^[a-f0-9]{64}$/);
    assert.notEqual(candidateCaptureDigest(candidate), fidelityComparisonDigest(comparison));
  });

  it("accepts only the explicit fidelity result states", () => {
    const states = [
      "calibrated",
      "drifted",
      "static-only",
      "source-unreachable",
      "ambiguous-locator",
      "runtime-blocked",
    ];
    for (const state of states) assert.equal(validateFidelityStatus(state), state);
    assert.throws(() => validateFidelityStatus("ready"), /Unsupported fidelity status/);
  });
});
