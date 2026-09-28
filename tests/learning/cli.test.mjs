import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { afterEach, test } from 'node:test';
import { runCli } from '../../dist/cli.js';

const roots = [];
const previousRoot = process.env.VIBEHUB_LIBRARY_ROOT;
afterEach(async () => {
  if (previousRoot === undefined) delete process.env.VIBEHUB_LIBRARY_ROOT;
  else process.env.VIBEHUB_LIBRARY_ROOT = previousRoot;
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'vibehub-learning-cli-'));
  roots.push(root);
  process.env.VIBEHUB_LIBRARY_ROOT = join(root, 'library');
  return root;
}
async function cli(...args) {
  let output = '';
  let error = '';
  const result = await runCli(['node', 'cli', ...args], {
    stdout: { write: chunk => { output += chunk; } }, stderr: { write: chunk => { error += chunk; } },
  });
  assert.equal(result.exitCode, 0, error);
  return JSON.parse(output);
}
const source = kind => ({ schemaVersion: '0.1.0', kind, title: '导航需求', entries: [
  { id: 'user-1', role: 'user', text: '侧栏按工作入口组织。语言作为筛选。' },
] });
async function writeJson(root, name, value) {
  const path = join(root, name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

test('learning CLI prepares a real frozen task using source-specific default recipes', async () => {
  const root = await setup();
  for (const [kind, recipeId] of [['conversation', 'conversation-learning'], ['text', 'general-knowledge']]) {
    const path = await writeJson(root, `${kind}.json`, source(kind));
    const task = await cli('learn', 'prepare', path);
    assert.equal(task.recipe.id, recipeId);
    assert.equal(task.status, 'prepared');
    assert.deepEqual(task.source, source(kind));
    assert.match(await readFile(task.taskPath, 'utf8'), /sourceDigest/);
    const taskRelativePath = relative(await realpath(process.env.VIBEHUB_LIBRARY_ROOT), await realpath(task.taskPath));
    assert.ok(!isAbsolute(taskRelativePath) && !taskRelativePath.startsWith('..'));
  }
  assert.equal((await cli('learn', 'tasks')).length, 2);
});

test('recipes CLI saves a personal version and uses it for an explicit learning task', async () => {
  const root = await setup();
  const builtin = (await cli('recipes', 'list')).find(recipe => recipe.id === 'conversation-learning');
  const content = Object.fromEntries(['name', 'description', 'sourceKinds', 'focus', 'prompt', 'outputInstructions'].map(field => [field, builtin[field]]));
  content.name = '导航决策';
  content.focus = ['侧栏组织'];
  const path = await writeJson(root, 'recipe.json', content);
  const personal = await cli('recipes', 'save', path);
  assert.equal(personal.version, 1);
  assert.equal(personal.builtin, false);
  const sourcePath = await writeJson(root, 'conversation.json', source('conversation'));
  const task = await cli('learn', 'prepare', sourcePath, personal.id);
  assert.equal(task.recipeDigest, personal.digest);
  assert.deepEqual(task.recipe.focus, content.focus);
  const second = await cli('recipes', 'save', await writeJson(root, 'recipe-next.json', { ...content, id: personal.id, focus: ['语言分面'] }));
  assert.equal(second.version, 2);
  assert.equal((await cli('recipes', 'list')).find(recipe => recipe.id === personal.id).version, 2);
});

test('learning CLI imports actual evidence and reports immutable results and analyzed task state', async () => {
  const root = await setup();
  const task = await cli('learn', 'prepare', await writeJson(root, 'source.json', source('conversation')));
  const analysis = { schemaVersion: '0.1.0', sourceDigest: task.sourceDigest, recipeDigest: task.recipeDigest, assets: [
    { id: 'navigation', type: 'decision', title: '工作入口导航', summary: '将侧栏按工作入口组织。', tags: ['导航'], basis: 'explicit', evidence: [{ entryId: 'user-1', quote: '侧栏按工作入口组织。' }] },
  ], relations: [] };
  const path = await writeJson(root, 'analysis.json', analysis);
  const result = await cli('learn', 'import', task.id, path);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].localId, 'navigation');
  assert.deepEqual(await cli('learn', 'import', task.id, path), result);
  const tasks = await cli('learn', 'tasks');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, 'analyzed');
  analysis.assets[0].evidence[0].quote = '材料没有说的话';
  await writeJson(root, 'analysis.json', analysis);
  await assert.rejects(cli('learn', 'import', task.id, path), /引文|quote|原文/);
});

test('learning CLI rejects unknown subcommands, missing arguments and extra flags', async () => {
  await setup();
  for (const args of [
    ['learn'], ['learn', 'unknown'], ['learn', 'prepare'], ['learn', 'prepare', 'source.json', 'recipe', 'extra'],
    ['learn', 'prepare', '--unknown'], ['learn', 'prepare', 'source.json', '--unknown'],
    ['learn', 'import'], ['learn', 'import', 'task-id'], ['learn', 'import', 'task-id', 'analysis.json', 'extra'],
    ['learn', 'tasks', 'extra'], ['recipes'], ['recipes', 'unknown'], ['recipes', 'list', 'extra'],
    ['recipes', 'save'], ['recipes', 'save', '--unknown'], ['recipes', 'save', 'recipe.json', 'extra'],
  ]) await assert.rejects(runCli(['node', 'cli', ...args]), /参数|命令/);
});
