import { createHash } from "node:crypto";

import { canonicalSerialize } from "../utils/canonical-json.js";

const browserMountValidatorSpec = {
  protocolVersion: 2,
  source: "browser-mount",
  assertions: [
    "served-current-action",
    "component-mounted",
    "visible-component-content",
  ],
};

export const browserMountValidatorDigest = createHash("sha256")
  .update("vibe-preview-validator-v2\0")
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
