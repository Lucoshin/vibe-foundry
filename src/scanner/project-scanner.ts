import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(projectRoot) {
  const packagePath = join(projectRoot, "package.json");
  const raw = await readFile(packagePath, "utf8");
  return JSON.parse(raw);
}

function detectFramework(packageJson) {
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  if ("@dcloudio/uni-app" in dependencies || "@dcloudio/vite-plugin-uni" in dependencies) {
    return "uni-app";
  }
  if ("next" in dependencies) {
    return "next";
  }
  if ("nuxt" in dependencies) {
    return "nuxt";
  }
  if ("vite" in dependencies) {
    return "vite";
  }
  if ("vue" in dependencies) {
    return "vue";
  }
  if ("react" in dependencies) {
    return "react";
  }
  return "unknown";
}

function detectLanguage(packageJson) {
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  return "typescript" in dependencies ? "typescript" : "javascript";
}

async function collectExisting(projectRoot, candidates) {
  const matches = [];
  for (const candidate of candidates) {
    if (await exists(join(projectRoot, candidate))) {
      matches.push(candidate);
    }
  }
  return matches;
}

export async function scanProject(projectRoot) {
  const packageJson = await readPackageJson(projectRoot);
  const apiDirs = await collectExisting(projectRoot, [
    "src/app/api",
    "app/api",
    "src/pages/api",
    "pages/api",
    "src/routes",
    "routes",
  ]);
  const serviceDirs = await collectExisting(projectRoot, [
    "src/server",
    "server",
    "src/services",
    "services",
    "src/lib",
  ]);

  return {
    sourceProject: packageJson.name ?? "unknown-project",
    framework: detectFramework(packageJson),
    language: detectLanguage(packageJson),
    packageManager: "npm",
    sourceDirs: await collectExisting(projectRoot, ["src"]),
    componentDirs: await collectExisting(projectRoot, [
      "src/components",
      "components",
      "src/features",
      "src/layouts",
      "src/providers",
    ]),
    pageDirs: await collectExisting(projectRoot, [
      "src/app",
      "app",
      "src/pages",
      "pages",
      "src/pagesA",
      "src/pagesB",
      "src/pagesC",
    ]),
    apiDirs,
    serviceDirs,
    hasBackendEntrypoints: apiDirs.length > 0 || serviceDirs.length > 0,
  };
}
