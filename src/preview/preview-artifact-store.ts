import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { canonicalSerialize } from "./preview-action.js";

const artifactTreeSchemaVersion = 1;

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function treeDigestFor(tree) {
  return createHash("sha256")
    .update("vibe-preview-artifact-tree-v1\0")
    .update(canonicalSerialize(tree))
    .digest("hex");
}

function assertDigest(value, fieldName) {
  if (!/^[a-f0-9]{64}$/.test(String(value))) {
    throw new TypeError(`${fieldName} must be a full SHA-256 digest.`);
  }
}

function normalizeRelativePath(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    !normalized
    || isAbsolute(normalized)
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new TypeError(`Unsafe artifact path: ${value}`);
  }
  return normalized;
}

async function fileOrNull(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function listDigestObjects(root) {
  let prefixes;
  try {
    prefixes = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const objects = [];
  for (const prefix of prefixes) {
    if (!prefix.isDirectory() || !/^[a-f0-9]{2}$/.test(prefix.name)) continue;
    const prefixRoot = join(root, prefix.name);
    const entries = await readdir(prefixRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
      const metadata = await stat(join(prefixRoot, entry.name));
      objects.push({ digest: entry.name, mtimeMs: metadata.mtimeMs });
    }
  }
  return objects.sort((left, right) => left.digest.localeCompare(right.digest));
}

async function syncDirectory(path) {
  if (process.platform === "win32") return;
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicWrite(path, content, verifyExisting) {
  await mkdir(dirname(path), { recursive: true });
  const existing = await fileOrNull(path);
  if (existing) {
    verifyExisting(existing);
    return;
  }
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    const raced = await fileOrNull(path);
    if (!raced) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    verifyExisting(raced);
    await rm(temporaryPath, { force: true });
  }
  await syncDirectory(dirname(path));
}

function normalizedMode(stat) {
  return stat.mode & 0o111 ? 0o755 : 0o644;
}

export function openPreviewArtifactStore(storeRoot) {
  const root = resolve(storeRoot);
  const blobsRoot = join(root, "blobs", "sha256");
  const treesRoot = join(root, "trees", "sha256");

  function blobPath(digest) {
    assertDigest(digest, "blobDigest");
    return join(blobsRoot, digest.slice(0, 2), digest);
  }

  function treePath(digest) {
    assertDigest(digest, "treeDigest");
    return join(treesRoot, digest.slice(0, 2), digest);
  }

  async function commitBlob(content) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const digest = sha256(bytes);
    await atomicWrite(blobPath(digest), bytes, (existing) => {
      if (sha256(existing) !== digest) {
        throw new Error(`CORRUPT_ARTIFACT: blob ${digest}`);
      }
    });
    return digest;
  }

  async function readTree(treeDigest) {
    assertDigest(treeDigest, "treeDigest");
    const content = await fileOrNull(treePath(treeDigest));
    if (!content) {
      throw new Error(`MISSING_ARTIFACT: tree ${treeDigest}`);
    }
    let tree;
    try {
      tree = JSON.parse(content.toString("utf8"));
    } catch {
      throw new Error(`CORRUPT_ARTIFACT: tree ${treeDigest}`);
    }
    if (
      tree?.schemaVersion !== artifactTreeSchemaVersion
      || !Array.isArray(tree.entries)
      || treeDigestFor(tree) !== treeDigest
    ) {
      throw new Error(`CORRUPT_ARTIFACT: tree ${treeDigest}`);
    }
    for (const entry of tree.entries) {
      normalizeRelativePath(entry.path);
      assertDigest(entry.digest, "entry.digest");
      if (entry.type !== "file" || !Number.isInteger(entry.mode) || !Number.isInteger(entry.size)) {
        throw new Error(`CORRUPT_ARTIFACT: tree ${treeDigest}`);
      }
    }
    return tree;
  }

  async function readVerifiedBlob(digest) {
    const content = await fileOrNull(blobPath(digest));
    if (!content) {
      throw new Error(`MISSING_ARTIFACT: blob ${digest}`);
    }
    if (sha256(content) !== digest) {
      throw new Error(`CORRUPT_ARTIFACT: blob ${digest}`);
    }
    return content;
  }

  async function verifyTree(treeDigest) {
    try {
      const tree = await readTree(treeDigest);
      for (const entry of tree.entries) {
        await readVerifiedBlob(entry.digest);
      }
      return { ok: true, reason: "HIT" };
    } catch (error) {
      if (String(error?.message).startsWith("MISSING_ARTIFACT:")) {
        return { ok: false, reason: "MISSING_ARTIFACT" };
      }
      return { ok: false, reason: "CORRUPT_ARTIFACT" };
    }
  }

  return {
    blobPath,
    treePath,
    commitBlob,
    readTree,
    verifyTree,

    listBlobs() {
      return listDigestObjects(blobsRoot);
    },

    listTrees() {
      return listDigestObjects(treesRoot);
    },

    deleteBlob(digest) {
      return rm(blobPath(digest), { force: true });
    },

    deleteTree(digest) {
      return rm(treePath(digest), { force: true });
    },

    async commitDirectory(sourceRoot) {
      const source = resolve(sourceRoot);
      const entries = [];

      async function walk(directory) {
        const children = await readdir(directory, { withFileTypes: true });
        children.sort((left, right) => left.name.localeCompare(right.name));
        for (const child of children) {
          const fullPath = join(directory, child.name);
          const stat = await lstat(fullPath);
          if (stat.isSymbolicLink()) {
            throw new Error(`Artifact trees do not allow symbolic links: ${fullPath}`);
          }
          if (stat.isDirectory()) {
            await walk(fullPath);
            continue;
          }
          if (!stat.isFile()) {
            throw new Error(`Artifact trees only allow regular files: ${fullPath}`);
          }
          const content = await readFile(fullPath);
          const digest = await commitBlob(content);
          entries.push({
            path: normalizeRelativePath(relative(source, fullPath)),
            type: "file",
            mode: normalizedMode(stat),
            size: content.length,
            digest,
          });
        }
      }

      await walk(source);
      entries.sort((left, right) => left.path.localeCompare(right.path));
      const tree = { schemaVersion: artifactTreeSchemaVersion, entries };
      const treeDigest = treeDigestFor(tree);
      const treeContent = Buffer.from(`${canonicalSerialize(tree)}\n`);
      await atomicWrite(treePath(treeDigest), treeContent, (existing) => {
        let existingTree;
        try {
          existingTree = JSON.parse(existing.toString("utf8"));
        } catch {
          throw new Error(`CORRUPT_ARTIFACT: tree ${treeDigest}`);
        }
        if (treeDigestFor(existingTree) !== treeDigest) {
          throw new Error(`CORRUPT_ARTIFACT: tree ${treeDigest}`);
        }
      });
      return { treeDigest, entries };
    },

    async readTreeFile(treeDigest, relativePath) {
      const safePath = normalizeRelativePath(relativePath);
      const tree = await readTree(treeDigest);
      const entry = tree.entries.find((candidate) => candidate.path === safePath);
      if (!entry) {
        throw new Error(`MISSING_ARTIFACT: ${safePath}`);
      }
      return readVerifiedBlob(entry.digest);
    },

    async materializeTree(treeDigest, targetRoot) {
      const verification = await verifyTree(treeDigest);
      if (!verification.ok) {
        throw new Error(`${verification.reason}: tree ${treeDigest}`);
      }
      const tree = await readTree(treeDigest);
      const target = resolve(targetRoot);
      for (const entry of tree.entries) {
        const outputPath = join(target, ...entry.path.split("/"));
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, await readVerifiedBlob(entry.digest));
        await chmod(outputPath, entry.mode);
      }
      return { targetRoot: target };
    },
  };
}
