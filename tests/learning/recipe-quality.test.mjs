import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { getRecipe, listRecipes } from '../../dist/learning/recipes.js';
import { prepareConversation } from '../../dist/learning/conversations.js';
import { prepareLearning, getLearningTask, importLearningAnalysis, listLearningAssets } from '../../dist/learning/workflow.js';

const historicalDigests = {
  'general-knowledge': 'e7cb61618dd68a6cb0f8fb8fab59fa425eb1587cc71564143ed5bd95015975ce',
  'conversation-learning': '9526304b8b5ea4248957bce28eef5b09e04acc17c5c5e793db146f61ac6ecd7c',
  'conversation-decisions': '2f35ef96d0bbe9e3b373535626f2e734c426cbd95ae12e9412e157b108b67daa',
  'creator-analysis': '3f452ca2141dcfb4169a53c13f21286e87807320f5b0ed8c82d690f91d465fd7',
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-recipe-quality-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const source = { schemaVersion: '0.1.0', title: '重复发言与条件变化', kind: 'conversation', entries: [
  { id: 'first', role: 'user', text: '本地预览优先复用已校验资源。' },
  { id: 'repeat', role: 'user', text: '本地预览应复用已经校验的资源。' },
  { id: 'condition', role: 'user', text: '资源内容改变时必须重新校验。' },
] };
const analysis = (task, assets = []) => ({ schemaVersion: '0.1.0', sourceDigest: task.sourceDigest, recipeDigest: task.recipeDigest, assets, relations: [] });

test('all builtin v1 digests stay exact while listings and unversioned lookup select v2', async t => {
  const root = await fixture(t);
  const latest = await listRecipes(root);
  assert.deepEqual(latest.map(recipe => recipe.id), [...Object.keys(historicalDigests), 'component-distillation']);
  for (const [id, digest] of Object.entries(historicalDigests)) {
    const old = await getRecipe(root, id, 1);
    assert.equal(old.version, 1);
    assert.equal(old.digest, digest);
    const current = await getRecipe(root, id);
    assert.equal(current.version, 2);
    assert.notEqual(current.digest, digest);
    assert.deepEqual(await getRecipe(root, id, 2), current);
    assert.deepEqual(latest.find(recipe => recipe.id === id), current);
    assert.equal(current.sourceKinds.join(','), old.sourceKinds.join(','));
    // Template compatibility only; this does not measure host semantic quality.
    assert.ok(current.prompt.startsWith(old.prompt));
    assert.ok(current.outputInstructions.startsWith(old.outputInstructions));
  }
});

test('latest preparation leaves the v1 task snapshot and existing asset version unchanged', async t => {
  const root = await fixture(t);
  const old = await prepareLearning(root, { source, recipeId: 'general-knowledge', recipeVersion: 1 });
  const result = await importLearningAnalysis(root, old.id, analysis(old, [{
    id: 'reuse', type: 'method', title: '复用已校验资源', summary: '本地预览时复用已校验资源。', tags: [], basis: 'explicit', evidence: [{ entryId: 'first', quote: source.entries[0].text }],
  }]));
  const frozen = await getLearningTask(root, old.id);
  const existingAssets = await listLearningAssets(root);
  assert.equal(existingAssets[0].id, result.assets[0].id);
  const current = await prepareLearning(root, { source, recipeId: 'general-knowledge' });
  assert.equal(current.recipe.version, 2);
  assert.equal(current.sourceDigest, old.sourceDigest);
  assert.notEqual(current.id, old.id);
  assert.deepEqual(await getLearningTask(root, old.id), frozen);
  assert.equal(frozen.recipe.digest, historicalDigests['general-knowledge']);
  assert.deepEqual(await listLearningAssets(root), existingAssets);
  const empty = await importLearningAnalysis(root, current.id, analysis(current));
  assert.deepEqual(empty.assets, []);
  assert.deepEqual(await listLearningAssets(root), existingAssets);
});

test('conversation preparation follows the latest decision recipe without a pinned historical version', async t => {
  const root = await fixture(t);
  const { task } = await prepareConversation(root, { title: source.title, format: 'messages', messages: source.entries });
  assert.equal(task.recipe.id, 'conversation-decisions');
  assert.equal(task.recipe.version, 2);
  assert.deepEqual(task.recipe, await getRecipe(root, 'conversation-decisions'));
});
