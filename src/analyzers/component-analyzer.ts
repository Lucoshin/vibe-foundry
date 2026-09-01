import { createHash } from "node:crypto";
import { basename, extname, join } from "node:path";

import { buildFrontendSourceIndex } from "./frontend-source-index.js";
import { planComponentLocatorEvidence } from "./component-locator-planner.js";
import { planSourceRoutes } from "./source-route-planner.js";
import { listFiles, readTextFile } from "../utils/files.js";

const businessCouplingPattern =
  /\b(auth|billing|invoice|payment|stripe|subscription|permission|role|session)\b/i;
const componentTestFilePattern = /\.(test|spec|stories|story)\.[jt]sx?$/i;
const javascriptFilePattern = /\.js$/i;
const vueFilePattern = /\.vue$/i;
const componentNamePattern = /^[A-Z][A-Za-z0-9]*$/;
const uniH5ComponentNames = new Set([
  "button", "checkbox", "checkbox-group", "image", "input", "label", "navigator",
  "picker", "picker-view", "picker-view-column", "radio", "radio-group", "scroll-view",
  "slider", "swiper", "swiper-item", "switch", "text", "textarea", "view",
]);

function uniH5ComponentsFor(sourceText) {
  return [...sourceText.matchAll(/<([a-z][a-z0-9-]*)\b/g)]
    .map((match) => match[1])
    .filter((name, index, names) => uniH5ComponentNames.has(name) && names.indexOf(name) === index)
    .sort();
}

function componentNameFromPath(filePath) {
  const fileName = basename(filePath, extname(filePath));
  return fileName === "index" ? basename(filePath.split("/").at(-2) ?? fileName) : fileName;
}

function reusePotentialFor(sourceText) {
  return businessCouplingPattern.test(sourceText) ? "medium" : "high";
}

function sourceFingerprintFor(sourceText) {
  return createHash("sha256").update(sourceText).digest("hex");
}

async function dependencyFingerprintFor(projectRoot, roots, sourceIndex, knownSources = new Map()) {
  const indexedFiles = new Map(sourceIndex.files.map((file) => [file.filePath, file]));
  const fingerprints = new Map();
  const pending = [...new Set(roots.filter(Boolean))];
  while (pending.length > 0) {
    const filePath = pending.pop();
    if (fingerprints.has(filePath)) continue;
    const indexed = indexedFiles.get(filePath);
    const sourceText = knownSources.has(filePath)
      ? knownSources.get(filePath)
      : await readTextFile(join(projectRoot, filePath));
    fingerprints.set(
      filePath,
      indexed?.sourceFingerprint ?? sourceFingerprintFor(sourceText),
    );
    for (const imported of indexed?.imports ?? []) {
      if (imported.resolvedFilePath && !fingerprints.has(imported.resolvedFilePath)) {
        pending.push(imported.resolvedFilePath);
      }
    }
  }
  const entries = [...fingerprints.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, fingerprint]) => ({ filePath, fingerprint }));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function isComponentSourceFile(filePath) {
  if (componentTestFilePattern.test(filePath)) {
    return false;
  }
  if (javascriptFilePattern.test(filePath)) {
    return componentNamePattern.test(componentNameFromPath(filePath));
  }
  return true;
}

function exportContractFor(componentName, sourceText) {
  if (/\bexport\s+default\b/.test(sourceText)) {
    return { exportMode: "default", exportName: "default" };
  }

  const escapedName = componentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarationPattern = new RegExp(
    `\\bexport\\s+(?:function|class|const|let|var)\\s+${escapedName}\\b`,
  );
  const namedExportPattern = new RegExp(
    `\\bexport\\s*\\{[^}]*\\b${escapedName}\\b[^}]*\\}`,
  );
  if (declarationPattern.test(sourceText) || namedExportPattern.test(sourceText)) {
    return { exportMode: "named", exportName: componentName };
  }

  return { exportMode: "unknown", exportName: "" };
}

function componentTypeFor(filePath, componentName) {
  if (/(?:^|\/)(?:providers?|context)(?:\/|$)|Provider$|Host$/i.test(`${filePath}/${componentName}`)) {
    return "provider";
  }
  if (/(?:^|\/)layouts?(?:\/|$)|Layout$/i.test(`${filePath}/${componentName}`)) {
    return "layout";
  }
  if (/(?:^|\/)features?(?:\/|$)/i.test(filePath)) {
    return "page-local";
  }
  return "visual";
}

function scenarioIdFor(componentPath, usagePath, call) {
  return createHash("sha256")
    .update(`${componentPath}:${usagePath}:${call.sourceLocation.line}:${call.sourceLocation.column}`)
    .digest("hex")
    .slice(0, 12);
}

function scenarioFromCall(componentPath, usageFile, imported, call) {
  const props = {};
  const unresolvedProps = [];
  for (const attribute of call.attributes) {
    if (attribute.dynamic) {
      unresolvedProps.push(attribute.name);
    } else {
      props[attribute.name] = attribute.value;
    }
  }
  const sourceAuthoredStory = /\.(stories|story)\.[jt]sx?$/i.test(usageFile.filePath);
  return {
    id: scenarioIdFor(componentPath, usageFile.filePath, call),
    source: "usage",
    sourceFile: usageFile.filePath,
    sourceLocation: call.sourceLocation,
    props,
    events: call.events,
    slots: call.slots,
    ...(call.unresolvedSlots?.length > 0 ? { unresolvedSlots: call.unresolvedSlots } : {}),
    ...(unresolvedProps.length > 0 ? { unresolvedProps: [...new Set(unresolvedProps)].sort() } : {}),
    confidence: imported.resolvedFilePath === componentPath ? "high" : "medium",
    completeness: call.attributes.length === 0
      ? 1
      : (call.attributes.length - unresolvedProps.length) / call.attributes.length,
    evidence: {
      importResolved: imported.resolvedFilePath === componentPath,
      importedName: imported.importedName,
      localName: imported.localName,
      source: imported.source,
      sourceAuthoredStory,
    },
  };
}

function normalizedVueComponentName(name) {
  return String(name ?? "").replace(/-([a-z0-9])/g, (_match, character) => character.toUpperCase()).toLowerCase();
}

function scenariosForComponent(componentPath, sourceIndex) {
  const scenarios = [];
  for (const usageFile of sourceIndex.files) {
    for (const call of usageFile.componentCalls) {
      const imported = usageFile.imports.find((item) =>
        (usageFile.filePath.endsWith(".vue")
          ? normalizedVueComponentName(item.localName) === normalizedVueComponentName(call.localName)
          : item.localName === call.localName)
        && item.resolvedFilePath === componentPath,
      );
      if (imported) scenarios.push(scenarioFromCall(componentPath, usageFile, imported, call));
    }
  }
  return scenarios.sort((left, right) => {
    if (left.evidence.sourceAuthoredStory !== right.evidence.sourceAuthoredStory) {
      return left.evidence.sourceAuthoredStory ? -1 : 1;
    }
    if (left.completeness !== right.completeness) return right.completeness - left.completeness;
    return `${left.sourceFile}:${left.sourceLocation.line}`.localeCompare(
      `${right.sourceFile}:${right.sourceLocation.line}`,
    );
  });
}

function previewScenarioFrom(scenario) {
  if (!scenario) return null;
  return {
    source: scenario.source,
    sourceFile: scenario.sourceFile,
    props: scenario.props,
    events: scenario.events,
    ...(Object.keys(scenario.slots ?? {}).length > 0 ? { slots: scenario.slots } : {}),
    ...(scenario.unresolvedProps ? { unresolvedProps: scenario.unresolvedProps } : {}),
    ...(scenario.unresolvedSlots ? { unresolvedSlots: scenario.unresolvedSlots } : {}),
  };
}

function sourceCaptureCandidatesFor(component, routePlan) {
  const locatorPlans = planComponentLocatorEvidence(component);
  return locatorPlans.flatMap((locatorPlan) => {
    if (locatorPlan.evidence.length === 0) return [];
    return routePlan.routes
      .filter((route) => route.sourceFile === locatorPlan.sourceFile)
      .map((route) => ({
        scenarioId: locatorPlan.scenarioId,
        route: route.route,
        usageSource: locatorPlan.sourceFile,
        routeEvidence: route.evidence,
        locatorEvidence: locatorPlan.evidence,
      }));
  }).sort((left, right) =>
    left.route.localeCompare(right.route) || left.scenarioId.localeCompare(right.scenarioId),
  );
}

export async function analyzeComponents(projectRoot, componentDirs, usageDirs = []) {
  const files = await listFiles(projectRoot, componentDirs, [".tsx", ".jsx", ".js", ".vue"]);
  const sourceIndex = await buildFrontendSourceIndex(projectRoot, usageDirs);
  sourceIndex.files = sourceIndex.files.filter((file) => !/\.(test|spec)\.[jt]sx?$/i.test(file.filePath));
  const routePlan = await planSourceRoutes(projectRoot, usageDirs, { sourceIndex });
  const components = [];

  for (const file of files) {
    if (!isComponentSourceFile(file.filePath)) {
      continue;
    }
    const sourceText = await readTextFile(file.fullPath);
    const name = componentNameFromPath(file.filePath);
    const exportContract = vueFilePattern.test(file.filePath)
      ? { exportMode: "default", exportName: "default" }
      : exportContractFor(name, sourceText);
    const scenarios = scenariosForComponent(file.filePath, sourceIndex);
    const primaryScenario = scenarios[0] ?? null;
    const previewScenario = previewScenarioFrom(primaryScenario);
    const dependencyFingerprint = await dependencyFingerprintFor(
      projectRoot,
      [file.filePath, primaryScenario?.sourceFile],
      sourceIndex,
      new Map([[file.filePath, sourceText]]),
    );
    const platformComponents = vueFilePattern.test(file.filePath)
      ? uniH5ComponentsFor(sourceText)
      : [];
    const component = {
      name,
      filePath: file.filePath,
      kind: "component",
      componentType: componentTypeFor(file.filePath, name),
      ...exportContract,
      reusePotential: reusePotentialFor(sourceText),
      sourceFingerprint: sourceFingerprintFor(sourceText),
      dependencyFingerprint,
      ...(platformComponents.length > 0 ? {
        platformRuntime: "uni-h5",
        platformComponents,
      } : {}),
      scenarios,
      ...(primaryScenario ? { primaryScenarioId: primaryScenario.id } : {}),
      analysisEvidence: {
        scenarioCount: scenarios.length,
        source: "ast-import-graph",
      },
      ...(previewScenario ? { previewScenario } : {}),
    };
    const sourceCaptureCandidates = sourceCaptureCandidatesFor(component, routePlan);
    components.push({
      ...component,
      ...(sourceCaptureCandidates.length > 0 ? { sourceCaptureCandidates } : {}),
    });
  }

  return components.sort((left, right) => left.filePath.localeCompare(right.filePath));
}
