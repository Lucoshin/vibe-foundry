import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export function resolveAssetLibraryRoot(explicitRoot) {
  if (typeof explicitRoot === "string" && explicitRoot.trim() === "") {
    throw new Error("Asset library root must be a non-empty path.");
  }
  const environmentRoot = process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
  return resolve(
    explicitRoot
      ?? (environmentRoot?.trim() ? environmentRoot : undefined)
      ?? join(homedir(), ".vibe-foundry", "library"),
  );
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function projectIdFor(projectRoot) {
  const resolvedRoot = resolve(projectRoot);
  const name = basename(resolvedRoot).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const identity = process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot;
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 10);
  return `${name.toLowerCase()}-${hash}`;
}

export function assetPackageDirectoryFor(libraryRoot, projectRoot) {
  return join(resolve(libraryRoot), "projects", projectIdFor(projectRoot));
}

async function readIndex(libraryRoot) {
  try {
    return JSON.parse(await readFile(join(libraryRoot, "index.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { schemaVersion: "0.1.0", projects: [] };
    }
    throw error;
  }
}

export async function registerAssetPackage(libraryRoot, project) {
  const resolvedLibraryRoot = resolve(libraryRoot);
  const index = await readIndex(resolvedLibraryRoot);
  const normalizedProjectRoot = resolve(project.projectRoot);
  const entry = {
    id: projectIdFor(normalizedProjectRoot),
    projectRoot: normalizedProjectRoot,
    sourceProject: project.sourceProject,
    assetPackageDir: resolve(project.assetPackageDir),
    generatedAt: project.generatedAt,
  };
  const existingIndex = index.projects.findIndex((candidate) => candidate.id === entry.id);
  if (existingIndex >= 0) {
    index.projects[existingIndex] = entry;
  } else {
    index.projects.push(entry);
  }
  await mkdir(resolvedLibraryRoot, { recursive: true });
  await writeFile(join(resolvedLibraryRoot, "index.json"), stableJson(index));
  return entry;
}
