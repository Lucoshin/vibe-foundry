import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectionFixture, collectionSnapshot } from './knowledge-collections-fixture.mjs';

test('collection stores exact cross-source references without copying assets; edits preserve identity', async t => {
  const { saveKnowledgeCollection, getKnowledgeCollection, listKnowledgeCollections } = await import('../../dist/application/knowledge-collections.js');
  const { root, model } = await collectionFixture(t);
  const assetIds = [model.assets.find(item => item.sourceId === 'book:book-a').id, model.assets.find(item => item.id.startsWith('learning:')).id];
  const original = await collectionSnapshot(root);
  const saved = await saveKnowledgeCollection(root, { name: '本轮复用', description: '组合材料', assetIds });
  const raw = JSON.parse(await readFile(join(root, 'collections', saved.id + '.json'), 'utf8'));
  assert.deepEqual(Object.keys(raw).sort(), ['schemaVersion', 'id', 'name', 'description', 'assetIds', 'createdAt', 'updatedAt'].sort());
  assert.deepEqual(raw.assetIds, assetIds);
  for (const [path, text] of Object.entries(original)) assert.equal(await readFile(path, 'utf8'), text);
  const edited = await saveKnowledgeCollection(root, { id: saved.id, name: '改名', description: '', assetIds: assetIds.toReversed() });
  assert.equal(edited.id, saved.id);
  assert.equal(edited.createdAt, saved.createdAt);
  const beforeRead = await collectionSnapshot(root);
  const detail = await getKnowledgeCollection(root, saved.id);
  assert.equal(detail.members[0].assetId, assetIds[1]);
  assert.equal(detail.members.every(item => item.status === 'available'), true);
  assert.equal((await listKnowledgeCollections(root)).collections.length, 1);
  assert.deepEqual(await collectionSnapshot(root), beforeRead);
});

test('book relations resolve within each source, preserve evidence and direction, and deduplicate selected endpoints', async t => {
  const { exploreAssetRelations } = await import('../../dist/application/knowledge-collections.js');
  const { root, model } = await collectionFixture(t);
  const ids = model.assets.filter(item => item.sourceKind === 'book').map(item => item.id);
  const before = await collectionSnapshot(root);
  const result = await exploreAssetRelations(root, { assetIds: ids });
  assert.equal(result.relations.length, 2);
  assert.equal(new Set(result.relations.map(item => item.id)).size, 2);
  for (const relation of result.relations) {
    assert.equal(relation.status, 'resolved');
    assert.equal(relation.basis, 'explicit');
    assert.equal(relation.evidence[0].quote, '林岚守护灯塔。');
    assert.equal(model.assets.find(item => item.id === relation.from.assetId).sourceId, relation.sourceId);
    assert.equal(model.assets.find(item => item.id === relation.to.assetId).sourceId, relation.sourceId);
    assert.equal(relation.from.name, '林岚');
    assert.equal(relation.to.name, '灯塔');
  }
  assert.deepEqual(await collectionSnapshot(root), before);
});

test('learning relations preserve global identities and interpretation instead of creating cross-source edges', async t => {
  const { exploreAssetRelations } = await import('../../dist/application/knowledge-collections.js');
  const { root, model } = await collectionFixture(t);
  const learning = model.assets.filter(item => item.id.startsWith('learning:'));
  const result = await exploreAssetRelations(root, { assetIds: [learning[0].id, model.assets[0].id] });
  assert.equal(result.relations.length, 2);
  const edge = result.relations.find(item => item.id.startsWith('learning-relation:'));
  assert.equal(edge.id, learning[0].relations[0].id);
  assert.equal(edge.basis, 'interpretation');
  assert.equal(edge.from.assetId, learning[0].relations[0].from);
  assert.deepEqual(edge.evidence, learning[0].relations[0].evidence);
});

test('a missing or damaged source leaves exact collection references visible and reports read errors', async t => {
  const { saveKnowledgeCollection, getKnowledgeCollection, exploreAssetRelations } = await import('../../dist/application/knowledge-collections.js');
  const { root, model } = await collectionFixture(t);
  const selected = model.assets.find(item => item.sourceId === 'book:book-a');
  const record = await saveKnowledgeCollection(root, { name: '源检查', description: '', assetIds: [selected.id] });
  await writeFile(join(root, 'books/book-a/book-assets.json'), '{broken');
  const detail = await getKnowledgeCollection(root, record.id);
  assert.equal(detail.members[0].status, 'missing');
  assert.equal(detail.members[0].assetId, selected.id);
  assert.equal(detail.members[0].asset, null);
  assert.ok(detail.errors.some(item => item.sourceId === 'book:book-a'));
  const result = await exploreAssetRelations(root, { assetIds: [selected.id] });
  assert.equal(result.selected[0].status, 'missing');
  assert.deepEqual(result.relations, []);
  assert.ok(result.errors.length > 0);
});

test('collection input rejects duplicate, unavailable, unknown-field and unsafe identities without writes', async t => {
  const { saveKnowledgeCollection } = await import('../../dist/application/knowledge-collections.js');
  const { root, model } = await collectionFixture(t);
  const assetIds = [model.assets[0].id];
  const input = { name: '集合', description: '', assetIds };
  const before = await collectionSnapshot(root);
  for (const invalid of [{ ...input, assetIds: [] }, { ...input, assetIds: [assetIds[0], assetIds[0]] }, { ...input, assetIds: ['林岚'] }, { ...input, extra: true }, { ...input, id: '../outside' }]) {
    await assert.rejects(saveKnowledgeCollection(root, invalid));
  }
  assert.deepEqual(await collectionSnapshot(root), before);
});

test('empty reads do not create storage; linked or corrupt managed collection storage is rejected', async t => {
  const { listKnowledgeCollections, getKnowledgeCollection } = await import('../../dist/application/knowledge-collections.js');
  const root = await mkdtemp(join(tmpdir(), 'vibe-collection-empty-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await listKnowledgeCollections(join(root, 'absent')), { collections: [], errors: [] });
  await mkdir(join(root, 'target'));
  await mkdir(join(root, 'library'));
  await symlink(join(root, 'target'), join(root, 'library/collections'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(listKnowledgeCollections(join(root, 'library')), /链接/);
  await assert.rejects(getKnowledgeCollection(root, '../bad'), /标识/);
});

test('corrupt collection metadata is reported without hiding healthy collections or overwriting a prior record', async t => {
  const { saveKnowledgeCollection, listKnowledgeCollections } = await import('../../dist/application/knowledge-collections.js');
  const { root, model } = await collectionFixture(t);
  const input = { name: '完好集合', description: '', assetIds: [model.assets[0].id] };
  const saved = await saveKnowledgeCollection(root, input);
  const before = await readFile(join(root, 'collections', saved.id + '.json'), 'utf8');
  await assert.rejects(saveKnowledgeCollection(root, { ...input, id: saved.id, assetIds: ['unknown'] }));
  assert.equal(await readFile(join(root, 'collections', saved.id + '.json'), 'utf8'), before);
  const badId = 'collection-00000000-0000-4000-8000-000000000000';
  await writeFile(join(root, 'collections', badId + '.json'), JSON.stringify({ ...JSON.parse(before), id: badId, assetCopies: [] }));
  const result = await listKnowledgeCollections(root);
  assert.equal(result.collections.length, 1);
  assert.equal(result.errors[0].id, badId);
  assert.match(result.errors[0].message, /字段/);
});
