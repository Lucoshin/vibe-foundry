import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { openPreviewBuildCache } from "../../dist/preview/preview-build-cache.js";

const roots = [];

async function createFixture() {
  const assetDir = await mkdtemp(join(tmpdir(), "vibe-foundry-build-cache-"));
  const outputDir = await mkdtemp(join(tmpdir(), "vibe-foundry-build-output-"));
  roots.push(assetDir, outputDir);
  await mkdir(join(outputDir, "assets"), { recursive: true });
  await writeFile(join(outputDir, "index.html"), "<title>Cached Preview</title>");
  await writeFile(join(outputDir, "assets", "app.js"), "console.log('cached')\n");
  return { assetDir, outputDir };
}

async function assertLogBlobAbsent(assetDir, content) {
  const digest = createHash("sha256").update(content).digest("hex");
  await assert.rejects(
    readFile(join(assetDir, "preview-cas", "blobs", "sha256", digest.slice(0, 2), digest)),
    (error) => error?.code === "ENOENT",
  );
}

describe("preview build cache", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("commits a leased build and hits it after reopening", async () => {
    const { assetDir, outputDir } = await createFixture();
    const actionDigest = "a".repeat(64);
    const cache = openPreviewBuildCache(assetDir);
    assert.equal(cache.claim(actionDigest, "worker-a", { now: 100, ttlMs: 100 }), true);

    const committed = await cache.commitSuccess({
      actionDigest,
      leaseOwner: "worker-a",
      outputDir,
      stdout: "built",
      stderr: "",
      completedAt: 101,
    });
    assert.equal(committed.committed, true);
    assert.match(committed.artifactTreeDigest, /^[a-f0-9]{64}$/);
    cache.close();

    const reopened = openPreviewBuildCache(assetDir);
    const lookup = await reopened.lookup(actionDigest);
    assert.equal(lookup.reason, "HIT");
    assert.equal(lookup.artifactTreeDigest, committed.artifactTreeDigest);
    assert.equal(
      (await reopened.readFile(actionDigest, "index.html")).toString("utf8"),
      "<title>Cached Preview</title>",
    );
    const validation = await reopened.recordValidationEvidence({
      artifactTreeDigest: committed.artifactTreeDigest,
      validatorDigest: "d".repeat(64),
      state: "ready",
      evidence: { source: "browser-mount", consoleErrors: [] },
      validatedAt: 102,
    });
    assert.match(validation.evidenceDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(
      reopened.getValidation(committed.artifactTreeDigest, "d".repeat(64)),
      validation,
    );
    reopened.close();
  });

  it("does not persist raw logs for a successful build", async () => {
    const { assetDir, outputDir } = await createFixture();
    const actionDigest = "d".repeat(64);
    const stdout = "successful-stdout-sensitive-sentinel";
    const stderr = "successful-stderr-sensitive-sentinel";
    const cache = openPreviewBuildCache(assetDir);
    assert.equal(cache.claim(actionDigest, "worker-a", { now: 110, ttlMs: 100 }), true);

    await cache.commitSuccess({
      actionDigest,
      leaseOwner: "worker-a",
      outputDir,
      stdout,
      stderr,
      completedAt: 111,
    });

    const action = cache.getAction(actionDigest);
    assert.equal(action.stdoutDigest, null);
    assert.equal(action.stderrDigest, null);
    await assertLogBlobAbsent(assetDir, stdout);
    await assertLogBlobAbsent(assetDir, stderr);
    cache.close();
  });

  it("returns a negative cache hit for a deterministic failure", async () => {
    const { assetDir } = await createFixture();
    const actionDigest = "b".repeat(64);
    const cache = openPreviewBuildCache(assetDir);
    assert.equal(cache.claim(actionDigest, "worker-a", { now: 200, ttlMs: 100 }), true);
    assert.equal(await cache.commitFailure({
      actionDigest,
      leaseOwner: "worker-a",
      failureClass: "deterministic",
      failureCode: "BUILD_ERROR",
      stderr: "compile failed",
      completedAt: 201,
    }), true);

    assert.deepEqual(await cache.lookup(actionDigest), {
      reason: "NEGATIVE_CACHE_HIT",
      state: "failed_deterministic",
      failureCode: "BUILD_ERROR",
    });
    cache.close();
  });

  it("does not persist raw logs for a failed build", async () => {
    const { assetDir } = await createFixture();
    const actionDigest = "e".repeat(64);
    const stdout = "failed-stdout-sensitive-sentinel";
    const stderr = "failed-stderr-sensitive-sentinel";
    const cache = openPreviewBuildCache(assetDir);
    assert.equal(cache.claim(actionDigest, "worker-a", { now: 210, ttlMs: 100 }), true);

    await cache.commitFailure({
      actionDigest,
      leaseOwner: "worker-a",
      failureClass: "deterministic",
      failureCode: "BUILD_ERROR",
      stdout,
      stderr,
      completedAt: 211,
    });

    const action = cache.getAction(actionDigest);
    assert.equal(action.stdoutDigest, null);
    assert.equal(action.stderrDigest, null);
    await assertLogBlobAbsent(assetDir, stdout);
    await assertLogBlobAbsent(assetDir, stderr);
    cache.close();
  });

  it("reports a missing artifact instead of trusting stale metadata", async () => {
    const { assetDir, outputDir } = await createFixture();
    const actionDigest = "c".repeat(64);
    const cache = openPreviewBuildCache(assetDir);
    cache.claim(actionDigest, "worker-a", { now: 300, ttlMs: 100 });
    await cache.commitSuccess({
      actionDigest,
      leaseOwner: "worker-a",
      outputDir,
      completedAt: 301,
    });
    await rm(join(assetDir, "preview-cas"), { recursive: true, force: true });

    assert.equal((await cache.lookup(actionDigest)).reason, "MISSING_ARTIFACT");
    cache.close();
  });
});
