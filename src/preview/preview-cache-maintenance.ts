import { join, resolve } from "node:path";

import { openPreviewArtifactStore } from "./preview-artifact-store.js";
import { openPreviewBuildCache } from "./preview-build-cache.js";

export async function collectPreviewCacheGarbage(assetDirectory, options) {
  const cutoff = options?.cutoff;
  if (!Number.isInteger(cutoff)) {
    throw new TypeError("Preview cache GC cutoff must be integer milliseconds.");
  }

  const assetDir = resolve(assetDirectory);
  const cache = openPreviewBuildCache(assetDir);
  const artifacts = openPreviewArtifactStore(join(assetDir, "preview-cas"));
  try {
    const retainedTrees = new Set(cache.listRetainedArtifactTreeDigests(cutoff));
    const retainedBlobs = new Set();
    for (const treeDigest of retainedTrees) {
      const tree = await artifacts.readTree(treeDigest);
      for (const entry of tree.entries) retainedBlobs.add(entry.digest);
    }

    const actionsDeleted = cache.deleteUnreferencedActions(cutoff);
    let treesDeleted = 0;
    for (const object of await artifacts.listTrees()) {
      if (object.mtimeMs >= cutoff || retainedTrees.has(object.digest)) continue;
      await artifacts.deleteTree(object.digest);
      treesDeleted += 1;
    }

    let blobsDeleted = 0;
    for (const object of await artifacts.listBlobs()) {
      if (object.mtimeMs >= cutoff || retainedBlobs.has(object.digest)) continue;
      await artifacts.deleteBlob(object.digest);
      blobsDeleted += 1;
    }

    return { actionsDeleted, treesDeleted, blobsDeleted };
  } finally {
    cache.close();
  }
}
