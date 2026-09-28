import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

export function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export async function listFiles(projectRoot, directories, extensions) {
  const files = [];
  const visited = new Set();
  const excluded = new Set(["node_modules", ".git", ".vibehub"]);

  async function walk(directory) {
    directory = resolve(directory);
    if (visited.has(directory)) return;
    visited.add(directory);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return;
    }

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name)) await walk(fullPath);
        continue;
      }
      if (entry.isFile() && extensions.includes(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  for (const directory of directories) {
    await walk(join(projectRoot, directory));
  }

  return files.sort().map((fullPath) => ({
    fullPath,
    filePath: normalizePath(relative(projectRoot, fullPath)),
  }));
}

export async function readTextFile(path) {
  return readFile(path, "utf8");
}

export async function listProjectFiles(projectRoot, directories, extensions) {
  return listFiles(projectRoot, directories, extensions);
}
