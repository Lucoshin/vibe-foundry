import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { openPreviewActionStore } from "../../dist/preview/preview-action-store.js";

const roots = [];

async function createStore() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-action-store-"));
  roots.push(root);
  const databasePath = join(root, "preview-state.db");
  return {
    databasePath,
    store: openPreviewActionStore(databasePath),
  };
}

describe("preview action store", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("persists successful action results across process-shaped reopen", async () => {
    const { databasePath, store } = await createStore();
    store.recordActionSuccess({
      actionDigest: "a".repeat(64),
      artifactTreeDigest: "b".repeat(64),
      stdoutDigest: "c".repeat(64),
      stderrDigest: null,
      completedAt: 100,
    });
    store.close();

    const reopened = openPreviewActionStore(databasePath);
    assert.deepEqual(reopened.getAction("a".repeat(64)), {
      actionDigest: "a".repeat(64),
      state: "succeeded",
      artifactTreeDigest: "b".repeat(64),
      failureClass: null,
      failureCode: null,
      stdoutDigest: "c".repeat(64),
      stderrDigest: null,
      attemptCount: 1,
      updatedAt: 100,
    });
    reopened.close();
  });

  it("grants one live lease and recovers it only after expiry", async () => {
    const { store } = await createStore();
    const actionDigest = "d".repeat(64);

    assert.equal(store.claimLease(actionDigest, "owner-a", { now: 100, ttlMs: 50 }), true);
    assert.equal(store.claimLease(actionDigest, "owner-b", { now: 120, ttlMs: 50 }), false);
    assert.equal(store.renewLease(actionDigest, "owner-a", { now: 130, ttlMs: 50 }), true);
    assert.equal(store.claimLease(actionDigest, "owner-b", { now: 170, ttlMs: 50 }), false);
    assert.equal(store.claimLease(actionDigest, "owner-b", { now: 181, ttlMs: 50 }), true);
    assert.deepEqual(store.getLease(actionDigest), {
      actionDigest,
      owner: "owner-b",
      expiresAt: 231,
      heartbeatAt: 181,
    });
    store.close();
  });

  it("rejects a stale worker result after another owner acquires the lease", async () => {
    const { store } = await createStore();
    const actionDigest = "6".repeat(64);
    assert.equal(store.claimLease(actionDigest, "owner-a", { now: 100, ttlMs: 20 }), true);
    assert.equal(store.claimLease(actionDigest, "owner-b", { now: 121, ttlMs: 20 }), true);

    assert.equal(store.recordActionSuccess({
      actionDigest,
      artifactTreeDigest: "7".repeat(64),
      leaseOwner: "owner-a",
      completedAt: 122,
    }), false);
    assert.equal(store.getAction(actionDigest).state, "building");

    assert.equal(store.recordActionSuccess({
      actionDigest,
      artifactTreeDigest: "8".repeat(64),
      leaseOwner: "owner-b",
      completedAt: 123,
    }), true);
    assert.equal(store.getAction(actionDigest).artifactTreeDigest, "8".repeat(64));
    store.close();
  });

  it("keeps deterministic and transient failures explicit", async () => {
    const { store } = await createStore();
    store.recordActionFailure({
      actionDigest: "e".repeat(64),
      failureClass: "deterministic",
      failureCode: "BUILD_ERROR",
      stderrDigest: "f".repeat(64),
      completedAt: 200,
    });
    store.recordActionFailure({
      actionDigest: "1".repeat(64),
      failureClass: "transient",
      failureCode: "PROCESS_EXIT",
      completedAt: 201,
    });

    assert.equal(store.getAction("e".repeat(64)).state, "failed_deterministic");
    assert.equal(store.getAction("1".repeat(64)).state, "failed_transient");
    store.close();
  });

  it("versions validation independently from the successful artifact", async () => {
    const { store } = await createStore();
    const artifactTreeDigest = "2".repeat(64);
    store.recordValidation({
      artifactTreeDigest,
      validatorDigest: "3".repeat(64),
      state: "ready",
      evidenceDigest: "4".repeat(64),
      validatedAt: 300,
    });

    assert.deepEqual(store.getValidation(artifactTreeDigest, "3".repeat(64)), {
      artifactTreeDigest,
      validatorDigest: "3".repeat(64),
      state: "ready",
      evidenceDigest: "4".repeat(64),
      validatedAt: 300,
    });
    assert.equal(store.getValidation(artifactTreeDigest, "5".repeat(64)), null);
    store.close();
  });

  it("replaces current component action refs without deleting action results", async () => {
    const { store } = await createStore();
    const oldAction = "9".repeat(64);
    const currentAction = "a".repeat(64);
    store.recordActionSuccess({
      actionDigest: oldAction,
      artifactTreeDigest: "b".repeat(64),
      completedAt: 100,
    });
    store.recordActionSuccess({
      actionDigest: currentAction,
      artifactTreeDigest: "c".repeat(64),
      completedAt: 200,
    });

    store.replaceActionRefs([
      { componentId: "button", actionDigest: oldAction },
    ], 100);
    store.replaceActionRefs([
      { componentId: "button", actionDigest: currentAction },
    ], 200);

    assert.deepEqual(store.getActionRefs(), [
      { componentId: "button", actionDigest: currentAction, updatedAt: 200 },
    ]);
    assert.equal(store.getAction(oldAction).state, "succeeded");
    assert.deepEqual(store.listRetainedArtifactTreeDigests(150), ["c".repeat(64)]);
    assert.equal(store.deleteUnreferencedActions(150), 1);
    assert.equal(store.getAction(oldAction), null);
    assert.equal(store.getAction(currentAction).state, "succeeded");
    store.close();
  });
});
