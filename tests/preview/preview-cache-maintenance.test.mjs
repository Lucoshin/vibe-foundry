import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { openPreviewBuildCache } from "../../dist/preview/preview-build-cache.js";
import { collectPreviewCacheGarbage } from "../../dist/preview/preview-cache-maintenance.js";

const roots = [];

describe("preview cache maintenance", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("keeps current action artifacts and sweeps old unreferenced content", async () => {
    const assetDir = await mkdtemp(join(tmpdir(), "vibe-foundry-gc-assets-"));
    const oldOutput = await mkdtemp(join(tmpdir(), "vibe-foundry-gc-old-"));
    const currentOutput = await mkdtemp(join(tmpdir(), "vibe-foundry-gc-current-"));
    roots.push(assetDir, oldOutput, currentOutput);
    await mkdir(oldOutput, { recursive: true });
    await mkdir(currentOutput, { recursive: true });
    await writeFile(join(oldOutput, "index.html"), "old artifact");
    await writeFile(join(currentOutput, "index.html"), "current artifact");
    const oldAction = "a".repeat(64);
    const currentAction = "b".repeat(64);
    const cache = openPreviewBuildCache(assetDir);
    cache.claim(oldAction, "old-worker", { now: 100, ttlMs: 100 });
    await cache.commitSuccess({
      actionDigest: oldAction,
      leaseOwner: "old-worker",
      outputDir: oldOutput,
      completedAt: 101,
    });
    cache.claim(currentAction, "current-worker", { now: 200, ttlMs: 100 });
    await cache.commitSuccess({
      actionDigest: currentAction,
      leaseOwner: "current-worker",
      outputDir: currentOutput,
      completedAt: 201,
    });
    cache.replaceActionRefs([
      { componentId: "button", actionDigest: currentAction },
    ], 201);
    cache.close();

    const report = await collectPreviewCacheGarbage(assetDir, {
      cutoff: Date.now() + 1_000,
    });

    assert.equal(report.actionsDeleted, 1);
    assert.equal(report.treesDeleted, 1);
    assert.equal(report.blobsDeleted, 1);
    const reopened = openPreviewBuildCache(assetDir);
    assert.equal((await reopened.lookup(oldAction)).reason, "MISS_ACTION");
    assert.equal((await reopened.lookup(currentAction)).reason, "HIT");
    reopened.close();
  });
});
