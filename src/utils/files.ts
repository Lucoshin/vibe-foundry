import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

export function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export async function listFiles(projectRoot, directories, extensions) {
  const files = [];

  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
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
