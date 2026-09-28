import { canonicalSerialize } from "../utils/canonical-json.js";
import { createHash } from "node:crypto";

export const previewActionSchemaVersion = 2;

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

export function createPreviewActionSpec(input) {
  const component = input.component;
  return {
    schemaVersion: previewActionSchemaVersion,
    component: {
      name: String(component.name ?? ""),
      sourcePath: normalizePath(component.filePath),
      sourceDigest: String(component.sourceFingerprint ?? ""),
      dependencyTreeDigest: String(component.dependencyFingerprint ?? ""),
      scenario: component.previewScenario ?? null,
      platformRuntime: String(component.platformRuntime ?? ""),
      platformComponents: [...(component.platformComponents ?? [])],
      kind: String(component.kind ?? 'component'),
      route: component.route ?? null,
      uniPage: component.uniPage ?? null,
      staticResources: component.staticResources ?? [],
    },
    runtimeContextDigest: String(input.runtimeContext?.fingerprint ?? ""),
    builderDigest: String(input.builderDigest),
    toolchain: input.toolchain,
    platform: input.platform,
    buildOptions: input.buildOptions,
    declaredEnvironmentDigest: String(input.declaredEnvironmentDigest),
  };
}

export function previewActionDigest(actionSpec) {
  return createHash("sha256")
    .update("vibe-preview-action-v2\0")
    .update(canonicalSerialize(actionSpec))
    .digest("hex");
}
