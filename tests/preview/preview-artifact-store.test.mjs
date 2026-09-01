import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { openPreviewArtifactStore } from "../../dist/preview/preview-artifact-store.js";

const roots = [];

async function tempRoot(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

describe("preview artifact store", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("commits a deterministic immutable tree and materializes it", async () => {
    const sourceA = await tempRoot("vibe-foundry-artifact-a-");
    const sourceB = await tempRoot("vibe-foundry-artifact-b-");
    const storeRoot = await tempRoot("vibe-foundry-cas-");
    const output = await tempRoot("vibe-foundry-materialized-");
    await mkdir(join(sourceA, "assets"), { recursive: true });
    await writeFile(join(sourceA, "index.html"), "<title>Preview</title>\n");
    await writeFile(join(sourceA, "assets", "app.js"), "console.log('preview')\n");
    await mkdir(join(sourceB, "assets"), { recursive: true });
    await writeFile(join(sourceB, "assets", "app.js"), "console.log('preview')\n");
    await writeFile(join(sourceB, "index.html"), "<title>Preview</title>\n");
    const store = openPreviewArtifactStore(storeRoot);

    const first = await store.commitDirectory(sourceA);
    const second = await store.commitDirectory(sourceB);

    assert.match(first.treeDigest, /^[a-f0-9]{64}$/);
    assert.equal(first.treeDigest, second.treeDigest);
    assert.deepEqual(await store.verifyTree(first.treeDigest), { ok: true, reason: "HIT" });
    await store.materializeTree(first.treeDigest, output);
    assert.equal(await readFile(join(output, "index.html"), "utf8"), "<title>Preview</title>\n");
    assert.equal(await readFile(join(output, "assets", "app.js"), "utf8"), "console.log('preview')\n");
  });

  it("rejects symbolic links instead of following files outside the build root", async () => {
    const source = await tempRoot("vibe-foundry-artifact-link-");
    const outside = await tempRoot("vibe-foundry-artifact-outside-");
    const storeRoot = await tempRoot("vibe-foundry-cas-");
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(
      process.platform === "win32" ? outside : join(outside, "secret.txt"),
      join(source, process.platform === "win32" ? "linked-outside" : "linked-secret.txt"),
      process.platform === "win32" ? "junction" : undefined,
    );
    const store = openPreviewArtifactStore(storeRoot);

    await assert.rejects(() => store.commitDirectory(source), /symbolic links/i);
  });

  it("detects a mutated CAS blob before serving it", async () => {
    const source = await tempRoot("vibe-foundry-artifact-corrupt-");
    const storeRoot = await tempRoot("vibe-foundry-cas-");
    await writeFile(join(source, "index.html"), "trusted preview");
    const store = openPreviewArtifactStore(storeRoot);
    const result = await store.commitDirectory(source);
    const tree = await store.readTree(result.treeDigest);

    await writeFile(store.blobPath(tree.entries[0].digest), "tampered preview");

    assert.deepEqual(await store.verifyTree(result.treeDigest), {
      ok: false,
      reason: "CORRUPT_ARTIFACT",
    });
    await assert.rejects(
      () => store.readTreeFile(result.treeDigest, "index.html"),
      /CORRUPT_ARTIFACT/,
    );
  });

  it("rejects unsafe relative paths when reading a tree", async () => {
    const storeRoot = await tempRoot("vibe-foundry-cas-");
    const store = openPreviewArtifactStore(storeRoot);

    await assert.rejects(
      () => store.readTreeFile("a".repeat(64), "../secret.txt"),
      /unsafe artifact path/i,
    );
  });
});
