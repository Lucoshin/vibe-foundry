import { lstat, realpath, stat } from "node:fs/promises";
import { basename, join } from "node:path";

async function optionalStat(path) {
  try { return await lstat(path, { bigint: true }); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function pathIdentity(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

export async function assertBookOutputTargets(outputDir, fileNames, inputPaths) {
  const directoryStat = await optionalStat(outputDir);
  if (directoryStat && (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())) {
    throw new Error("书籍资产输出目录必须是普通目录，不能是链接。");
  }
  const inputs = await Promise.all(inputPaths.map(async (path) => {
    const resolvedPath = await realpath(path);
    return { path: pathIdentity(resolvedPath), identity: await stat(resolvedPath, { bigint: true }) };
  }));
  for (const name of fileNames) {
    if (!name || name === "." || name === ".." || basename(name) !== name) throw new Error("书籍产物必须直接位于资产目录。");
    const target = join(outputDir, name);
    const targetStat = await optionalStat(target);
    if (!targetStat) continue;
    if (!targetStat.isFile()) throw new Error("书籍产物必须是普通文件，不能是链接。");
    const targetPath = pathIdentity(await realpath(target));
    if (inputs.some((input) => input.path === targetPath || input.identity.dev === targetStat.dev && input.identity.ino === targetStat.ino)) {
      throw new Error("书籍产物不能覆盖输入源文件或它的硬链接。");
    }
  }
}
