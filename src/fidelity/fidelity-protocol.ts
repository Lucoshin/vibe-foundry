import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import { canonicalSerialize } from "../preview/preview-action.js";

const fidelityStatuses = new Set([
  "calibrated",
  "drifted",
  "static-only",
  "source-unreachable",
  "ambiguous-locator",
  "runtime-blocked",
]);
const captureStates = new Set(["default", "hover", "focus"]);
const locatorKinds = new Set(["test-id", "id", "aria-role", "aria-label", "text", "class"]);

function digestFor(domain, value) {
  return createHash("sha256")
    .update(`${domain}\0`)
    .update(canonicalSerialize(value))
    .digest("hex");
}

function assertExactFields(value, allowed, label) {
  for (const field of Object.keys(value ?? {})) {
    if (!allowed.has(field)) throw new TypeError(`Unsupported ${label} field: ${field}`);
  }
}

function assertDigest(value, field) {
  if (!/^[a-f0-9]{64}$/.test(String(value))) {
    throw new TypeError(`${field} must be a full SHA-256 digest.`);
  }
  return value;
}

function relativeProjectPath(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/");
  if (
    !normalized
    || isAbsolute(normalized)
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.split("/").some((segment) => segment === ".." || segment === ".")
  ) {
    throw new TypeError("usageSource must be a relative project path.");
  }
  return normalized;
}

function captureViewport(value) {
  assertExactFields(
    value,
    new Set(["width", "height", "deviceScaleFactor", "colorScheme"]),
    "viewport",
  );
  if (!Number.isInteger(value?.width) || value.width <= 0) {
    throw new TypeError("viewport.width must be a positive integer.");
  }
  if (!Number.isInteger(value?.height) || value.height <= 0) {
    throw new TypeError("viewport.height must be a positive integer.");
  }
  if (typeof value?.deviceScaleFactor !== "number" || value.deviceScaleFactor <= 0) {
    throw new TypeError("viewport.deviceScaleFactor must be positive.");
  }
  if (!new Set(["light", "dark"]).has(value?.colorScheme)) {
    throw new TypeError(`Unsupported color scheme: ${value?.colorScheme}`);
  }
  return {
    width: value.width,
    height: value.height,
    deviceScaleFactor: value.deviceScaleFactor,
    colorScheme: value.colorScheme,
  };
}

function captureStateList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("At least one capture state is required.");
  }
  const states = values.map(String);
  for (const state of states) {
    if (!captureStates.has(state)) throw new TypeError(`Unsupported capture state: ${state}`);
  }
  if (new Set(states).size !== states.length) {
    throw new TypeError("Capture states must be unique.");
  }
  return states;
}

function captureLocatorEvidence(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("Locator evidence is required.");
  }
  return values.map((evidence) => {
    assertExactFields(
      evidence,
      new Set(["kind", "value", "sourceLocation"]),
      "locator evidence",
    );
    if (!locatorKinds.has(evidence.kind) || !String(evidence.value ?? "")) {
      throw new TypeError("Locator evidence kind and value are required.");
    }
    assertExactFields(
      evidence.sourceLocation,
      new Set(["line", "column"]),
      "locator source location",
    );
    if (
      !Number.isInteger(evidence.sourceLocation?.line)
      || !Number.isInteger(evidence.sourceLocation?.column)
    ) {
      throw new TypeError("Locator source location must use integer line and column.");
    }
    return {
      kind: evidence.kind,
      value: String(evidence.value),
      sourceLocation: {
        line: evidence.sourceLocation.line,
        column: evidence.sourceLocation.column,
      },
    };
  });
}

export function createSourceCaptureSpec(input) {
  assertExactFields(input, new Set([
    "componentId",
    "route",
    "usageSource",
    "locatorEvidence",
    "viewport",
    "states",
    "projectRuntimeDigest",
    "collectorDigest",
    "browserDigest",
    "themeDigest",
    "fontDigest",
  ]), "source capture");
  if (!String(input?.componentId ?? "")) throw new TypeError("componentId is required.");
  if (!String(input?.route ?? "").startsWith("/")) {
    throw new TypeError("Source capture route must be project-relative.");
  }
  return {
    schemaVersion: 1,
    componentId: String(input.componentId),
    route: String(input.route),
    usageSource: relativeProjectPath(input.usageSource),
    locatorEvidence: captureLocatorEvidence(input.locatorEvidence),
    viewport: captureViewport(input.viewport),
    states: captureStateList(input.states),
    projectRuntimeDigest: assertDigest(input.projectRuntimeDigest, "projectRuntimeDigest"),
    collectorDigest: assertDigest(input.collectorDigest, "collectorDigest"),
    browserDigest: assertDigest(input.browserDigest, "browserDigest"),
    themeDigest: assertDigest(input.themeDigest, "themeDigest"),
    fontDigest: assertDigest(input.fontDigest, "fontDigest"),
  };
}

export function sourceCaptureDigest(spec) {
  return digestFor("vibe-source-capture-action-v1", spec);
}

export function createCandidateCaptureSpec(input) {
  assertExactFields(input, new Set([
    "componentId",
    "previewActionDigest",
    "artifactTreeDigest",
    "collectorDigest",
    "browserDigest",
    "viewport",
    "states",
  ]), "candidate capture");
  return {
    schemaVersion: 1,
    componentId: String(input.componentId),
    previewActionDigest: assertDigest(input.previewActionDigest, "previewActionDigest"),
    artifactTreeDigest: assertDigest(input.artifactTreeDigest, "artifactTreeDigest"),
    collectorDigest: assertDigest(input.collectorDigest, "collectorDigest"),
    browserDigest: assertDigest(input.browserDigest, "browserDigest"),
    viewport: captureViewport(input.viewport),
    states: captureStateList(input.states),
  };
}

export function candidateCaptureDigest(spec) {
  return digestFor("vibe-preview-candidate-action-v1", spec);
}

export function createFidelityComparisonSpec(input) {
  assertExactFields(input, new Set([
    "referenceTreeDigest",
    "candidateTreeDigest",
    "comparatorDigest",
    "thresholds",
  ]), "fidelity comparison");
  assertExactFields(input?.thresholds, new Set([
    "geometryPx",
    "visualMismatchRatio",
    "structureMismatchCount",
  ]), "fidelity threshold");
  const thresholds = input.thresholds;
  if (
    !Number.isFinite(thresholds?.geometryPx)
    || thresholds.geometryPx < 0
    || !Number.isFinite(thresholds?.visualMismatchRatio)
    || thresholds.visualMismatchRatio < 0
    || thresholds.visualMismatchRatio > 1
    || !Number.isInteger(thresholds?.structureMismatchCount)
    || thresholds.structureMismatchCount < 0
  ) {
    throw new TypeError("Invalid fidelity comparison thresholds.");
  }
  return {
    schemaVersion: 1,
    referenceTreeDigest: assertDigest(input.referenceTreeDigest, "referenceTreeDigest"),
    candidateTreeDigest: assertDigest(input.candidateTreeDigest, "candidateTreeDigest"),
    comparatorDigest: assertDigest(input.comparatorDigest, "comparatorDigest"),
    thresholds: {
      geometryPx: thresholds.geometryPx,
      visualMismatchRatio: thresholds.visualMismatchRatio,
      structureMismatchCount: thresholds.structureMismatchCount,
    },
  };
}

export function fidelityComparisonDigest(spec) {
  return digestFor("vibe-fidelity-comparison-v1", spec);
}

export function validateFidelityStatus(status) {
  if (!fidelityStatuses.has(status)) {
    throw new TypeError(`Unsupported fidelity status: ${status}`);
  }
  return status;
}
