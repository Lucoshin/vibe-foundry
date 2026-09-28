import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { openPreviewActionStore, openPreviewActionReader } from '../../dist/preview/preview-action-store.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-preview-reader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, path: join(root, 'preview-state.db') };
}

test('preview reader observes committed live actions and validations without exposing writes', async t => {
  const { path } = await fixture(t);
  const writer = openPreviewActionStore(path);
  writer.recordActionSuccess({ actionDigest: 'a'.repeat(64), artifactTreeDigest: 'b'.repeat(64), completedAt: 100 });
  writer.recordValidation({ artifactTreeDigest: 'b'.repeat(64), validatorDigest: 'c'.repeat(64), state: 'ready', evidenceDigest: 'd'.repeat(64), validatedAt: 200 });
  const reader = openPreviewActionReader(path);
  try {
  assert.deepEqual(Object.keys(reader).sort(), ['close', 'getAction', 'getValidation']);
  assert.equal(reader.getAction('a'.repeat(64)).state, 'succeeded');
  assert.equal(reader.getValidation('b'.repeat(64), 'c'.repeat(64)).state, 'ready');
  writer.recordActionFailure({ actionDigest: 'e'.repeat(64), failureClass: 'transient', failureCode: 'TIMEOUT', completedAt: 300 });
  assert.equal(reader.getAction('e'.repeat(64)).state, 'failed_transient');
  } finally { reader.close(); writer.close(); }
});

test('reading a v1 action store does not migrate its schema or rewrite database bytes', async t => {
  const { path } = await fixture(t);
  const writer = openPreviewActionStore(path);
  writer.recordActionSuccess({ actionDigest: 'a'.repeat(64), artifactTreeDigest: 'b'.repeat(64), completedAt: 100 });
  writer.close();
  const legacy = new Database(path);
  legacy.prepare("UPDATE schema_metadata SET value = '1' WHERE key = 'schema_version'").run();
  legacy.close();
  const before = await readFile(path);
  const reader = openPreviewActionReader(path);
  assert.equal(reader.getAction('a'.repeat(64)).state, 'succeeded');
  reader.close();
  assert.deepEqual(await readFile(path), before);
  const inspect = new Database(path, { readonly: true, fileMustExist: true });
  assert.equal(inspect.prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'").pluck().get(), '1');
  inspect.close();
});

test('preview reader does not create missing storage and explicitly rejects unknown schemas', async t => {
  const { root, path } = await fixture(t);
  assert.throws(() => openPreviewActionReader(join(root, 'absent', 'state.db')));
  assert.deepEqual(await readdir(root), []);
  openPreviewActionStore(path).close();
  const writer = new Database(path);
  writer.prepare("UPDATE schema_metadata SET value = '999' WHERE key = 'schema_version'").run();
  writer.close();
  const before = await readFile(path);
  assert.throws(() => openPreviewActionReader(path), /Unsupported.*999/);
  assert.deepEqual(await readFile(path), before);
});
