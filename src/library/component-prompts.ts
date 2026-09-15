import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { join, posix, win32 } from "node:path";

function normalizeComponentPath(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("Component prompt requires a relative project file path.");
  }
  const path = filePath.replaceAll("\\", "/");
  if (posix.isAbsolute(path) || win32.isAbsolute(path) || path.split("/").includes("..")) {
    throw new Error("Component prompt requires a relative project file path.");
  }
  const normalized = posix.normalize(path);
  if (normalized === "." || normalized.endsWith("/")) {
    throw new Error("Component prompt requires a relative project file path.");
  }
  return normalized;
}

function filenameFor(filePath) {
  return `${createHash("sha256").update(filePath).digest("hex")}.json`;
}

function validateRecord(record) {
  if (record?.schemaVersion === "0.1.0") {
    const outdated = new Error("提示词格式已更新，请重新炼化。Run node dist/cli.js distill <project-root> again.");
    outdated.code = "COMPONENT_PROMPT_OUTDATED";
    throw outdated;
  }
  const fields = ["schemaVersion", "componentName", "filePath", "sourceDigest", "sourceFiles", "unresolved", "prompt"];
  if (!record || Object.keys(record).length !== fields.length || !fields.every((field) => Object.hasOwn(record, field))
    || record.schemaVersion !== "0.2.0" || typeof record.componentName !== "string"
    || typeof record.prompt !== "string" || !/^[a-f0-9]{64}$/.test(record.sourceDigest)
    || !Array.isArray(record.sourceFiles) || !record.sourceFiles.every((item) => typeof item === "string")
    || !Array.isArray(record.unresolved) || !record.unresolved.every((item) => typeof item === "string")) {
    throw new Error("Invalid component prompt record.");
  }
  return { ...record, filePath: normalizeComponentPath(record.filePath) };
}

async function promptDirectory(assetDir, create) {
  const directory = join(assetDir, "component-prompts");
  if (create) await mkdir(directory, { recursive: true });
  const resolvedDirectory = await realpath(directory);
  if (resolvedDirectory !== join(await realpath(assetDir), "component-prompts")) {
    throw new Error("Component prompt directory must stay within its asset package.");
  }
  return resolvedDirectory;
}

async function readRegularFile(path) {
  if (!(await lstat(path)).isFile()) throw new Error("Component prompt must be a regular file.");
  return readFile(path, "utf8");
}

export async function writeComponentPrompts(assetDir, records) {
  const files = new Map();
  for (const input of records) {
    const record = validateRecord(input);
    const filename = filenameFor(record.filePath);
    if (files.has(filename)) throw new Error(`Duplicate component prompt source: ${record.filePath}`);
    files.set(filename, `${JSON.stringify(record, null, 2)}\n`);
  }
  const directory = await promptDirectory(assetDir, true);
  for (const [filename, content] of files) {
    const path = join(directory, filename);
    let previous;
    try {
      previous = await readRegularFile(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (previous !== content) await writeFile(path, content);
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json") && !files.has(entry.name)) {
      await unlink(join(directory, entry.name));
    }
  }
}

export async function readComponentPrompt(assetDir, filePath) {
  const normalizedPath = normalizeComponentPath(filePath);
  try {
    const directory = await promptDirectory(assetDir, false);
    const record = validateRecord(JSON.parse(await readRegularFile(join(directory, filenameFor(normalizedPath)))));
    if (record.filePath !== normalizedPath) throw new Error(`Component prompt identity mismatch: ${normalizedPath}`);
    return record;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const missing = new Error(`Component prompt missing for ${normalizedPath}. Run node dist/cli.js distill <project-root> again.`);
    missing.code = "COMPONENT_PROMPT_MISSING";
    throw missing;
  }
}
