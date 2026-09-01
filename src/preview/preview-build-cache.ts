import { join, resolve } from "node:path";

import { openPreviewActionStore } from "./preview-action-store.js";
import { openPreviewArtifactStore } from "./preview-artifact-store.js";
import { canonicalSerialize } from "./preview-action.js";

export function openPreviewBuildCache(assetDirectory) {
  const assetDir = resolve(assetDirectory);
  const actions = openPreviewActionStore(join(assetDir, "preview-state.db"));
  const artifacts = openPreviewArtifactStore(join(assetDir, "preview-cas"));

  return {
    close() {
      actions.close();
    },

    claim(actionDigest, owner, options) {
      return actions.claimLease(actionDigest, owner, options);
    },

    renew(actionDigest, owner, options) {
      return actions.renewLease(actionDigest, owner, options);
    },

    release(actionDigest, owner) {
      return actions.releaseLease(actionDigest, owner);
    },

    getAction(actionDigest) {
      return actions.getAction(actionDigest);
    },

    async lookup(actionDigest) {
      const action = actions.getAction(actionDigest);
      if (!action) {
        return { reason: "MISS_ACTION", state: "absent" };
      }
      if (action.state === "succeeded") {
        const verification = await artifacts.verifyTree(action.artifactTreeDigest);
        if (!verification.ok) {
          return {
            reason: verification.reason,
            state: action.state,
            artifactTreeDigest: action.artifactTreeDigest,
          };
        }
        return {
          reason: "HIT",
          state: action.state,
          artifactTreeDigest: action.artifactTreeDigest,
        };
      }
      if (action.state === "failed_deterministic") {
        return {
          reason: "NEGATIVE_CACHE_HIT",
          state: action.state,
          failureCode: action.failureCode,
        };
      }
      if (action.state === "failed_transient") {
        return {
          reason: "TRANSIENT_FAILURE",
          state: action.state,
          failureCode: action.failureCode,
          attemptCount: action.attemptCount,
          updatedAt: action.updatedAt,
        };
      }
      return {
        reason: action.state === "building" ? "BUILDING" : "MISS_ACTION",
        state: action.state,
      };
    },

    async commitSuccess(result) {
      const artifact = await artifacts.commitDirectory(result.outputDir);
      const committed = actions.recordActionSuccess({
        actionDigest: result.actionDigest,
        artifactTreeDigest: artifact.treeDigest,
        stdoutDigest: null,
        stderrDigest: null,
        leaseOwner: result.leaseOwner,
        completedAt: result.completedAt,
      });
      return {
        committed,
        artifactTreeDigest: artifact.treeDigest,
      };
    },

    async commitFailure(result) {
      return actions.recordActionFailure({
        actionDigest: result.actionDigest,
        failureClass: result.failureClass,
        failureCode: result.failureCode,
        stdoutDigest: null,
        stderrDigest: null,
        leaseOwner: result.leaseOwner,
        completedAt: result.completedAt,
      });
    },

    async readFile(actionDigest, relativePath) {
      const lookup = await this.lookup(actionDigest);
      if (lookup.reason !== "HIT") {
        throw new Error(`${lookup.reason}: preview action ${actionDigest}`);
      }
      return artifacts.readTreeFile(lookup.artifactTreeDigest, relativePath);
    },

    async recordValidationEvidence(result) {
      const evidenceDigest = await artifacts.commitBlob(
        Buffer.from(canonicalSerialize(result.evidence)),
      );
      const validation = {
        artifactTreeDigest: result.artifactTreeDigest,
        validatorDigest: result.validatorDigest,
        state: result.state,
        evidenceDigest,
        validatedAt: result.validatedAt,
      };
      actions.recordValidation(validation);
      return validation;
    },

    getValidation(artifactTreeDigest, validatorDigest) {
      return actions.getValidation(artifactTreeDigest, validatorDigest);
    },

    replaceActionRefs(refs, updatedAt) {
      actions.replaceActionRefs(refs, updatedAt);
    },

    getActionRefs() {
      return actions.getActionRefs();
    },

    listRetainedArtifactTreeDigests(cutoff) {
      return actions.listRetainedArtifactTreeDigests(cutoff);
    },

    deleteUnreferencedActions(cutoff) {
      return actions.deleteUnreferencedActions(cutoff);
    },
  };
}
