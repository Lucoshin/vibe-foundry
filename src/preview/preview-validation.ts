import { createHash } from "node:crypto";

import { canonicalSerialize } from "./preview-action.js";

const browserMountValidatorSpec = {
  protocolVersion: 1,
  source: "browser-mount",
  assertions: [
    "served-current-action",
    "component-mounted",
    "non-empty-preview-canvas",
  ],
};

export const browserMountValidatorDigest = createHash("sha256")
  .update("vibe-preview-validator-v1\0")
  .update(canonicalSerialize(browserMountValidatorSpec))
  .digest("hex");

export function createBrowserMountEvidence(input) {
  return {
    protocolVersion: browserMountValidatorSpec.protocolVersion,
    source: browserMountValidatorSpec.source,
    component: input.component,
    actionDigest: input.actionDigest,
    assertions: [...browserMountValidatorSpec.assertions],
  };
}
