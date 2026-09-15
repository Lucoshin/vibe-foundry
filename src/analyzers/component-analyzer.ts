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

function createDependencyFingerprinter(indexedFiles, readSource) {
  const fingerprints = new Map();
  const dependencyPaths = new Map();
  function pathsFor(root) {
    if (dependencyPaths.has(root)) return dependencyPaths.get(root);
    const paths = new Set();
    const pending = [root];
    while (pending.length > 0) {
      const filePath = pending.pop();
      if (paths.has(filePath)) continue;
      paths.add(filePath);
      for (const dependency of indexedFiles.get(filePath)?.dependencies ?? []) {
        if (dependency.resolvedFilePath) pending.push(dependency.resolvedFilePath);
      }
    }
    dependencyPaths.set(root, paths);
    return paths;
  }
  return async (roots) => {
    const paths = [...new Set(roots.filter(Boolean).flatMap((root) => [...pathsFor(root)]))]
      .sort((left, right) => left.localeCompare(right));
    const entries = await Promise.all(paths.map(async (filePath) => {
      if (!fingerprints.has(filePath)) {
        const indexed = indexedFiles.get(filePath);
        fingerprints.set(filePath, indexed
          ? Promise.resolve(indexed.sourceFingerprint)
          : readSource(filePath).then(sourceFingerprintFor));
      }
      return { filePath, fingerprint: await fingerprints.get(filePath) };
    }));
    return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  };
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

function buildScenarioIndex(sourceIndex) {
  const scenariosByComponent = new Map();
  for (const usageFile of sourceIndex.files) {
    const importsByName = new Map();
    const localNameFor = usageFile.filePath.endsWith(".vue")
      ? normalizedVueComponentName
      : (name) => name;
    for (const imported of usageFile.imports) {
      if (!imported.resolvedFilePath) continue;
      const name = localNameFor(imported.localName);
      if (!importsByName.has(name)) importsByName.set(name, []);
      importsByName.get(name).push(imported);
    }
    for (const call of usageFile.componentCalls) {
      const matchedPaths = new Set();
      for (const imported of importsByName.get(localNameFor(call.localName)) ?? []) {
        const componentPath = imported.resolvedFilePath;
        if (matchedPaths.has(componentPath)) continue;
        matchedPaths.add(componentPath);
        if (!scenariosByComponent.has(componentPath)) scenariosByComponent.set(componentPath, []);
        scenariosByComponent.get(componentPath).push(scenarioFromCall(componentPath, usageFile, imported, call));
      }
    }
  }
  for (const scenarios of scenariosByComponent.values()) {
    scenarios.sort((left, right) => {
      if (left.evidence.sourceAuthoredStory !== right.evidence.sourceAuthoredStory) {
        return left.evidence.sourceAuthoredStory ? -1 : 1;
      }
      if (left.completeness !== right.completeness) return right.completeness - left.completeness;
      return `${left.sourceFile}:${left.sourceLocation.line}`.localeCompare(
        `${right.sourceFile}:${right.sourceLocation.line}`,
      );
    });
  }
  return scenariosByComponent;
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

export async function analyzeComponents(projectRoot, componentDirs, usageDirs = [], options = {}) {
  const files = await listFiles(projectRoot, componentDirs, [".tsx", ".jsx", ".js", ".vue"]);
  const sourceIndex = options.sourceIndex ?? await buildFrontendSourceIndex(projectRoot, usageDirs);
  const indexedFiles = new Map(sourceIndex.files.map((file) => [file.filePath, file]));
  const sourceTexts = new Map(sourceIndex.files.map((file) => [file.filePath, Promise.resolve(file.sourceText)]));
  const readSource = (filePath) => {
    if (!sourceTexts.has(filePath)) sourceTexts.set(filePath, readTextFile(join(projectRoot, filePath)));
    return sourceTexts.get(filePath);
  };
  const usageIndex = {
    ...sourceIndex,
    files: sourceIndex.files.filter((file) => !/\.(test|spec)\.[jt]sx?$/i.test(file.filePath)),
  };
  const routePlan = await planSourceRoutes(projectRoot, usageDirs, { sourceIndex: usageIndex });
  const scenariosByComponent = buildScenarioIndex(usageIndex);
  const dependencyFingerprintFor = createDependencyFingerprinter(indexedFiles, readSource);
  const components = [];

  for (const file of files) {
    if (!isComponentSourceFile(file.filePath)) {
      continue;
    }
    const sourceText = await readSource(file.filePath);
    const name = componentNameFromPath(file.filePath);
    const exportContract = vueFilePattern.test(file.filePath)
      ? { exportMode: "default", exportName: "default" }
      : exportContractFor(name, sourceText);
    const scenarios = scenariosByComponent.get(file.filePath) ?? [];
    const primaryScenario = scenarios[0] ?? null;
    const previewScenario = previewScenarioFrom(primaryScenario);
    const dependencyFingerprint = await dependencyFingerprintFor([file.filePath, primaryScenario?.sourceFile]);
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
      sourceFingerprint: indexedFiles.get(file.filePath)?.sourceFingerprint ?? sourceFingerprintFor(sourceText),
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
