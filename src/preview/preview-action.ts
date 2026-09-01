import { createHash } from "node:crypto";

export const previewActionSchemaVersion = 2;

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function canonicalValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Preview action values must use finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalValue(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Preview action values must use plain objects.");
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`Unsupported preview action value: ${typeof value}`);
}

export function canonicalSerialize(value) {
  return canonicalValue(value);
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
