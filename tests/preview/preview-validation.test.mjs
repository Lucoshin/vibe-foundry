import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  browserMountValidatorDigest,
  createBrowserMountEvidence,
} from "../../dist/preview/preview-validation.js";

describe("preview validation protocol", () => {
  it("uses a versioned validator digest and immutable browser mount evidence", () => {
    assert.match(browserMountValidatorDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(createBrowserMountEvidence({
      component: "button-ab12cd",
      actionDigest: "a".repeat(64),
    }), {
      protocolVersion: 1,
      source: "browser-mount",
      component: "button-ab12cd",
      actionDigest: "a".repeat(64),
      assertions: [
        "served-current-action",
        "component-mounted",
        "non-empty-preview-canvas",
      ],
    });
  });
});
