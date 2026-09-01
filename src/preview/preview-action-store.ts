import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

const failureClasses = new Set(["deterministic", "transient"]);
const validationStates = new Set(["ready", "invalid"]);
const schemaVersion = 2;

function assertDigest(value, fieldName) {
  if (!/^[a-f0-9]{64}$/.test(String(value))) {
    throw new TypeError(`${fieldName} must be a full SHA-256 digest.`);
  }
}

function actionFromRow(row) {
  if (!row) return null;
  return {
    actionDigest: row.action_digest,
    state: row.state,
    artifactTreeDigest: row.artifact_tree_digest,
    failureClass: row.failure_class,
    failureCode: row.failure_code,
    stdoutDigest: row.stdout_digest,
    stderrDigest: row.stderr_digest,
    attemptCount: row.attempt_count,
    updatedAt: row.updated_at,
  };
}

function validationFromRow(row) {
  if (!row) return null;
  return {
    artifactTreeDigest: row.artifact_tree_digest,
    validatorDigest: row.validator_digest,
    state: row.state,
    evidenceDigest: row.evidence_digest,
    validatedAt: row.validated_at,
  };
}

function leaseFromRow(row) {
  if (!row) return null;
  return {
    actionDigest: row.action_digest,
    owner: row.owner,
    expiresAt: row.expires_at,
    heartbeatAt: row.heartbeat_at,
  };
}

export function openPreviewActionStore(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = FULL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("trusted_schema = OFF");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS actions (
      action_digest TEXT PRIMARY KEY CHECK(length(action_digest) = 64),
      state TEXT NOT NULL CHECK(state IN ('queued', 'building', 'succeeded', 'failed_deterministic', 'failed_transient')),
      artifact_tree_digest TEXT,
      failure_class TEXT CHECK(failure_class IS NULL OR failure_class IN ('deterministic', 'transient')),
      failure_code TEXT,
      stdout_digest TEXT,
      stderr_digest TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS validations (
      artifact_tree_digest TEXT NOT NULL CHECK(length(artifact_tree_digest) = 64),
      validator_digest TEXT NOT NULL CHECK(length(validator_digest) = 64),
      state TEXT NOT NULL CHECK(state IN ('ready', 'invalid')),
      evidence_digest TEXT NOT NULL CHECK(length(evidence_digest) = 64),
      validated_at INTEGER NOT NULL,
      PRIMARY KEY (artifact_tree_digest, validator_digest)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS leases (
      action_digest TEXT PRIMARY KEY CHECK(length(action_digest) = 64),
      owner TEXT NOT NULL CHECK(length(owner) > 0),
      expires_at INTEGER NOT NULL,
      heartbeat_at INTEGER NOT NULL,
      FOREIGN KEY (action_digest) REFERENCES actions(action_digest) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS action_refs (
      component_id TEXT PRIMARY KEY CHECK(length(component_id) > 0),
      action_digest TEXT NOT NULL CHECK(length(action_digest) = 64),
      updated_at INTEGER NOT NULL
    ) STRICT;
  `);
  const storedVersion = database.prepare(
    "SELECT value FROM schema_metadata WHERE key = 'schema_version'",
  ).pluck().get();
  if (storedVersion === undefined) {
    database.prepare(
      "INSERT INTO schema_metadata (key, value) VALUES ('schema_version', ?)",
    ).run(String(schemaVersion));
  } else if (Number(storedVersion) === 1) {
    database.prepare(
      "UPDATE schema_metadata SET value = ? WHERE key = 'schema_version'",
    ).run(String(schemaVersion));
  } else if (Number(storedVersion) !== schemaVersion) {
    database.close();
    throw new Error(`Unsupported preview action store schema: ${storedVersion}`);
  }

  const getActionStatement = database.prepare(
    "SELECT * FROM actions WHERE action_digest = ?",
  );
  const getLeaseStatement = database.prepare(
    "SELECT * FROM leases WHERE action_digest = ?",
  );
  const claimLeaseTransaction = database.transaction((actionDigest, owner, now, ttlMs) => {
    database.prepare(`
      INSERT INTO actions (action_digest, state, updated_at)
      VALUES (?, 'queued', ?)
      ON CONFLICT(action_digest) DO NOTHING
    `).run(actionDigest, now);
    const currentLease = getLeaseStatement.get(actionDigest);
    if (currentLease && currentLease.owner !== owner && currentLease.expires_at > now) {
      return false;
    }
    const startsAttempt = !currentLease || currentLease.owner !== owner || currentLease.expires_at <= now;
    database.prepare(`
      INSERT INTO leases (action_digest, owner, expires_at, heartbeat_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(action_digest) DO UPDATE SET
        owner = excluded.owner,
        expires_at = excluded.expires_at,
        heartbeat_at = excluded.heartbeat_at
    `).run(actionDigest, owner, now + ttlMs, now);
    database.prepare(`
      UPDATE actions
      SET state = 'building',
          artifact_tree_digest = NULL,
          failure_class = NULL,
          failure_code = NULL,
          stdout_digest = NULL,
          stderr_digest = NULL,
          attempt_count = attempt_count + ?,
          updated_at = ?
      WHERE action_digest = ?
    `).run(startsAttempt ? 1 : 0, now, actionDigest);
    return true;
  });
  const renewLeaseStatement = database.prepare(`
    UPDATE leases
    SET expires_at = ?, heartbeat_at = ?
    WHERE action_digest = ? AND owner = ? AND expires_at > ?
  `);
  const recordSuccessTransaction = database.transaction((result) => {
    const lease = getLeaseStatement.get(result.actionDigest);
    if (
      (result.leaseOwner && (!lease || lease.owner !== result.leaseOwner || lease.expires_at <= result.completedAt))
      || (!result.leaseOwner && lease)
    ) {
      return false;
    }
    database.prepare(`
      INSERT INTO actions (
        action_digest, state, artifact_tree_digest, stdout_digest, stderr_digest, attempt_count, updated_at
      ) VALUES (?, 'succeeded', ?, ?, ?, 1, ?)
      ON CONFLICT(action_digest) DO UPDATE SET
        state = 'succeeded',
        artifact_tree_digest = excluded.artifact_tree_digest,
        failure_class = NULL,
        failure_code = NULL,
        stdout_digest = excluded.stdout_digest,
        stderr_digest = excluded.stderr_digest,
        attempt_count = CASE WHEN actions.attempt_count = 0 THEN 1 ELSE actions.attempt_count END,
        updated_at = excluded.updated_at
    `).run(
      result.actionDigest,
      result.artifactTreeDigest,
      result.stdoutDigest ?? null,
      result.stderrDigest ?? null,
      result.completedAt,
    );
    database.prepare("DELETE FROM leases WHERE action_digest = ?").run(result.actionDigest);
    return true;
  });
  const recordFailureTransaction = database.transaction((result) => {
    const lease = getLeaseStatement.get(result.actionDigest);
    if (
      (result.leaseOwner && (!lease || lease.owner !== result.leaseOwner || lease.expires_at <= result.completedAt))
      || (!result.leaseOwner && lease)
    ) {
      return false;
    }
    const state = result.failureClass === "deterministic"
      ? "failed_deterministic"
      : "failed_transient";
    database.prepare(`
      INSERT INTO actions (
        action_digest, state, failure_class, failure_code, stdout_digest, stderr_digest, attempt_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(action_digest) DO UPDATE SET
        state = excluded.state,
        artifact_tree_digest = NULL,
        failure_class = excluded.failure_class,
        failure_code = excluded.failure_code,
        stdout_digest = excluded.stdout_digest,
        stderr_digest = excluded.stderr_digest,
        attempt_count = CASE WHEN actions.attempt_count = 0 THEN 1 ELSE actions.attempt_count END,
        updated_at = excluded.updated_at
    `).run(
      result.actionDigest,
      state,
      result.failureClass,
      result.failureCode,
      result.stdoutDigest ?? null,
      result.stderrDigest ?? null,
      result.completedAt,
    );
    database.prepare("DELETE FROM leases WHERE action_digest = ?").run(result.actionDigest);
    return true;
  });
  const replaceActionRefsTransaction = database.transaction((refs, updatedAt) => {
    database.prepare("DELETE FROM action_refs").run();
    const insert = database.prepare(`
      INSERT INTO action_refs (component_id, action_digest, updated_at)
      VALUES (?, ?, ?)
    `);
    for (const ref of refs) {
      insert.run(ref.componentId, ref.actionDigest, updatedAt);
    }
  });

  return {
    close() {
      if (database.open) database.close();
    },

    getAction(actionDigest) {
      assertDigest(actionDigest, "actionDigest");
      return actionFromRow(getActionStatement.get(actionDigest));
    },

    recordActionSuccess(result) {
      assertDigest(result.actionDigest, "actionDigest");
      assertDigest(result.artifactTreeDigest, "artifactTreeDigest");
      if (result.stdoutDigest !== null && result.stdoutDigest !== undefined) {
        assertDigest(result.stdoutDigest, "stdoutDigest");
      }
      if (result.stderrDigest !== null && result.stderrDigest !== undefined) {
        assertDigest(result.stderrDigest, "stderrDigest");
      }
      return recordSuccessTransaction(result);
    },

    recordActionFailure(result) {
      assertDigest(result.actionDigest, "actionDigest");
      if (!failureClasses.has(result.failureClass)) {
        throw new TypeError(`Unsupported failure class: ${result.failureClass}`);
      }
      if (result.stdoutDigest !== null && result.stdoutDigest !== undefined) {
        assertDigest(result.stdoutDigest, "stdoutDigest");
      }
      if (result.stderrDigest !== null && result.stderrDigest !== undefined) {
        assertDigest(result.stderrDigest, "stderrDigest");
      }
      return recordFailureTransaction(result);
    },

    claimLease(actionDigest, owner, options) {
      assertDigest(actionDigest, "actionDigest");
      if (!owner) throw new TypeError("Lease owner is required.");
      if (!Number.isInteger(options.now) || !Number.isInteger(options.ttlMs) || options.ttlMs <= 0) {
        throw new TypeError("Lease now and ttlMs must be positive integer milliseconds.");
      }
      return claimLeaseTransaction(actionDigest, owner, options.now, options.ttlMs);
    },

    renewLease(actionDigest, owner, options) {
      assertDigest(actionDigest, "actionDigest");
      const result = renewLeaseStatement.run(
        options.now + options.ttlMs,
        options.now,
        actionDigest,
        owner,
        options.now,
      );
      return result.changes === 1;
    },

    releaseLease(actionDigest, owner) {
      assertDigest(actionDigest, "actionDigest");
      return database.prepare(
        "DELETE FROM leases WHERE action_digest = ? AND owner = ?",
      ).run(actionDigest, owner).changes === 1;
    },

    getLease(actionDigest) {
      assertDigest(actionDigest, "actionDigest");
      return leaseFromRow(getLeaseStatement.get(actionDigest));
    },

    recoverExpiredLeases(now) {
      return database.prepare("DELETE FROM leases WHERE expires_at <= ?").run(now).changes;
    },

    recordValidation(result) {
      assertDigest(result.artifactTreeDigest, "artifactTreeDigest");
      assertDigest(result.validatorDigest, "validatorDigest");
      assertDigest(result.evidenceDigest, "evidenceDigest");
      if (!validationStates.has(result.state)) {
        throw new TypeError(`Unsupported validation state: ${result.state}`);
      }
      database.prepare(`
        INSERT INTO validations (
          artifact_tree_digest, validator_digest, state, evidence_digest, validated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(artifact_tree_digest, validator_digest) DO UPDATE SET
          state = excluded.state,
          evidence_digest = excluded.evidence_digest,
          validated_at = excluded.validated_at
      `).run(
        result.artifactTreeDigest,
        result.validatorDigest,
        result.state,
        result.evidenceDigest,
        result.validatedAt,
      );
    },

    getValidation(artifactTreeDigest, validatorDigest) {
      assertDigest(artifactTreeDigest, "artifactTreeDigest");
      assertDigest(validatorDigest, "validatorDigest");
      return validationFromRow(database.prepare(`
        SELECT * FROM validations
        WHERE artifact_tree_digest = ? AND validator_digest = ?
      `).get(artifactTreeDigest, validatorDigest));
    },

    replaceActionRefs(refs, updatedAt) {
      if (!Number.isInteger(updatedAt)) {
        throw new TypeError("Action ref updatedAt must be integer milliseconds.");
      }
      const componentIds = new Set();
      for (const ref of refs) {
        if (!ref.componentId || componentIds.has(ref.componentId)) {
          throw new TypeError(`Action refs require unique component ids: ${ref.componentId}`);
        }
        assertDigest(ref.actionDigest, "actionDigest");
        componentIds.add(ref.componentId);
      }
      replaceActionRefsTransaction(refs, updatedAt);
    },

    getActionRefs() {
      return database.prepare(`
        SELECT component_id, action_digest, updated_at
        FROM action_refs
        ORDER BY component_id
      `).all().map((row) => ({
        componentId: row.component_id,
        actionDigest: row.action_digest,
        updatedAt: row.updated_at,
      }));
    },

    listRetainedArtifactTreeDigests(cutoff) {
      return database.prepare(`
        SELECT DISTINCT actions.artifact_tree_digest
        FROM actions
        LEFT JOIN action_refs ON action_refs.action_digest = actions.action_digest
        LEFT JOIN leases ON leases.action_digest = actions.action_digest
        WHERE actions.artifact_tree_digest IS NOT NULL
          AND (
            action_refs.action_digest IS NOT NULL
            OR actions.updated_at >= ?
            OR leases.expires_at > ?
          )
        ORDER BY actions.artifact_tree_digest
      `).pluck().all(cutoff, cutoff);
    },

    deleteUnreferencedActions(cutoff) {
      const deleted = database.transaction(() => {
        const result = database.prepare(`
          DELETE FROM actions
          WHERE updated_at < ?
            AND NOT EXISTS (
              SELECT 1 FROM action_refs
              WHERE action_refs.action_digest = actions.action_digest
            )
            AND NOT EXISTS (
              SELECT 1 FROM leases
              WHERE leases.action_digest = actions.action_digest
                AND leases.expires_at > ?
            )
        `).run(cutoff, cutoff);
        database.prepare(`
          DELETE FROM validations
          WHERE NOT EXISTS (
            SELECT 1 FROM actions
            WHERE actions.artifact_tree_digest = validations.artifact_tree_digest
          )
        `).run();
        return result.changes;
      })();
      return deleted;
    },
  };
}
