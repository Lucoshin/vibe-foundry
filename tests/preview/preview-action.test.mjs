import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalSerialize,
  createPreviewActionSpec,
  previewActionDigest,
} from "../../dist/preview/preview-action.js";

describe("preview action protocol", () => {
  it("canonicalizes nested object keys without reordering arrays", () => {
    const first = {
      runtime: { providers: ["router", "store"], network: "blocked" },
      source: { path: "src/Button.tsx", digest: "source-a" },
    };
    const second = {
      source: { digest: "source-a", path: "src/Button.tsx" },
      runtime: { network: "blocked", providers: ["router", "store"] },
    };

    assert.equal(canonicalSerialize(first), canonicalSerialize(second));
    assert.notEqual(
      canonicalSerialize(first),
      canonicalSerialize({
        ...second,
        runtime: { ...second.runtime, providers: ["store", "router"] },
      }),
    );
  });

  it("produces a full stable SHA-256 action digest", () => {
    const action = createPreviewActionSpec({
      component: {
        name: "Button",
        filePath: "src/Button.tsx",
        sourceFingerprint: "source-a",
        dependencyFingerprint: "dependencies-a",
        previewScenario: { source: "usage", props: { tone: "primary" } },
      },
      runtimeContext: { fingerprint: "runtime-a" },
      builderDigest: "builder-a",
      toolchain: { node: "24.12.0", vite: "5.4.21", plugins: [] },
      platform: { os: "win32", arch: "x64" },
      buildOptions: { networkPolicy: "block-external" },
      declaredEnvironmentDigest: "env-contract-a",
    });

    const digest = previewActionDigest(action);

    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(digest, previewActionDigest(action));
  });

  it("invalidates the digest for every execution-relevant input class", () => {
    const baseInput = {
      component: {
        name: "Button",
        filePath: "src/Button.tsx",
        sourceFingerprint: "source-a",
        dependencyFingerprint: "dependencies-a",
        previewScenario: { source: "usage", props: { tone: "primary" } },
        platformRuntime: "",
        platformComponents: [],
      },
      runtimeContext: { fingerprint: "runtime-a" },
      builderDigest: "builder-a",
      toolchain: { node: "24.12.0", vite: "5.4.21", plugins: [] },
      platform: { os: "win32", arch: "x64" },
      buildOptions: { networkPolicy: "block-external" },
      declaredEnvironmentDigest: "env-contract-a",
    };
    const baseDigest = previewActionDigest(createPreviewActionSpec(baseInput));
    const variants = [
      { component: { ...baseInput.component, sourceFingerprint: "source-b" } },
      { component: { ...baseInput.component, dependencyFingerprint: "dependencies-b" } },
      { component: { ...baseInput.component, previewScenario: { source: "usage", props: { tone: "danger" } } } },
      { runtimeContext: { fingerprint: "runtime-b" } },
      { builderDigest: "builder-b" },
      { toolchain: { ...baseInput.toolchain, vite: "6.0.0" } },
      { platform: { os: "linux", arch: "x64" } },
      { buildOptions: { networkPolicy: "allow-external" } },
      { declaredEnvironmentDigest: "env-contract-b" },
    ];

    for (const variant of variants) {
      const input = {
        ...baseInput,
        ...variant,
      };
      assert.notEqual(previewActionDigest(createPreviewActionSpec(input)), baseDigest);
    }
  });
});
