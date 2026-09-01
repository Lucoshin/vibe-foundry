import { basename, dirname, extname, relative } from "node:path";

import {
  detectBusinessDomain,
  detectBusinessEntrypoints,
} from "./business-entrypoint-detector.js";
import { listFiles, normalizePath, readTextFile } from "../utils/files.js";

const methodPattern = /\b(?:export\s+)?(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

function detectMethods(sourceText) {
  const methods = [];
  for (const match of sourceText.matchAll(methodPattern)) {
    methods.push(match[1]);
  }
  return [...new Set(methods)];
}

function routePathFor(filePath, apiDirs) {
  const matchingApiDir = apiDirs.find((apiDir) => {
    return filePath === apiDir || filePath.startsWith(`${apiDir}/`);
  });
  if (!matchingApiDir) {
    return null;
  }

  const withoutBase = normalizePath(relative(matchingApiDir, filePath));
  const withoutFile = basename(withoutBase).startsWith("route.")
    ? dirname(withoutBase)
    : withoutBase.replace(new RegExp(`${extname(withoutBase)}$`), "");
  return `/${withoutFile.replace(/\/?index$/, "").replaceAll("\\", "/")}`;
}

function serviceNameFor(domain, entrypoints, filePath) {
  const leafName = basename(filePath, extname(filePath));
  const entrypoint = entrypoints[0] ?? (leafName === "route" ? domain : leafName);
  return `${domain}.${entrypoint}`;
}

function reusePotentialFor(entrypoints) {
  return entrypoints.length > 0 ? "high" : "medium";
}

export async function analyzeServices(projectRoot, apiDirs, serviceDirs) {
  const files = await listFiles(projectRoot, [...apiDirs, ...serviceDirs], [
    ".ts",
    ".js",
  ]);
  const services = [];

  for (const file of files) {
    const sourceText = await readTextFile(file.fullPath);
    const entrypoints = detectBusinessEntrypoints(file.filePath, sourceText);
    const businessDomain = detectBusinessDomain(file.filePath, entrypoints);
    const routePath = routePathFor(file.filePath, apiDirs);

    services.push({
      name: serviceNameFor(businessDomain, entrypoints, file.filePath),
      filePath: file.filePath,
      kind: "service",
      businessDomain,
      entrypoints,
      routePath,
      methods: detectMethods(sourceText),
      reusePotential: reusePotentialFor(entrypoints),
    });
  }

  return services.sort((left, right) => left.filePath.localeCompare(right.filePath));
}
