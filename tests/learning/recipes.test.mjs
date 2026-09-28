import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonicalSerialize } from '../../dist/utils/canonical-json.js';
import { getRecipe, listRecipes, saveRecipe } from '../../dist/learning/recipes.js';

const input = () => ({ name: '工程决策复盘', description: '提取有证据的决策及适用条件', sourceKinds: ['text', 'conversation'], focus: ['决策', '失败经验'], prompt: '阅读材料：\n{source}\n关注：{focus}\n仅提取有证据、可复用的知识。', outputInstructions: '每条结论保留原始引文，区分事实与推断。' });
const fixture = () => mkdtemp(join(tmpdir(), 'vibehub-recipes-'));
const digest = recipe => {
  const { builtin, digest: ignored, ...content } = recipe;
  return createHash('sha256').update(canonicalSerialize(content)).digest('hex');
};

test('built-in recipes are usable before a library exists and cannot be overwritten', async () => {
  const library = join(await fixture(), 'new-library');
  const recipes = await listRecipes(library);
  assert.deepEqual(recipes.map(recipe => recipe.id), ['general-knowledge', 'conversation-learning', 'conversation-decisions', 'creator-analysis', 'component-distillation']);
  for (const recipe of recipes) {
    assert.equal(recipe.builtin, true);
    const version = recipe.id === 'component-distillation' ? 4 : 2;
    assert.equal(recipe.version, version);
    assert.equal(recipe.digest, digest(recipe));
    assert.match(recipe.prompt, /\{source\}/);
    assert.match(recipe.prompt, /\{focus\}/);
    assert.deepEqual(await getRecipe(library, recipe.id, version), recipe);
    await assert.rejects(saveRecipe(library, { ...input(), id: recipe.id }), /内置/);
    await assert.rejects(getRecipe(library, recipe.id, version + 1), /版本/);
  }
  recipes[0].focus.push('修改返回值');
  assert.equal((await getRecipe(library, 'general-knowledge')).focus.includes('修改返回值'), false);
});

test('personal recipes save immutable versions and list only their latest revision', async () => {
  const library = await fixture();
  const first = await saveRecipe(library, input());
  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.builtin, false);
  assert.equal(first.version, 1);
  const second = await saveRecipe(library, { ...input(), id: first.id, name: '迭代后的方案' });
  assert.equal(second.version, 2);
  assert.notEqual(first.digest, second.digest);
  assert.equal(second.digest, digest(second));
  assert.deepEqual(await getRecipe(library, first.id, 1), first);
  assert.deepEqual(await getRecipe(library, first.id), second);
  assert.deepEqual((await listRecipes(library)).filter(recipe => !recipe.builtin), [second]);
});

test('concurrent saves publish complete distinct versions without overwriting', async () => {
  const library = await fixture();
  const first = await saveRecipe(library, input());
  const versions = await Promise.all(Array.from({ length: 8 }, (_, index) => saveRecipe(library, { ...input(), id: first.id, name: `并发方案 ${index}` })));
  assert.deepEqual(versions.map(recipe => recipe.version).sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9]);
  for (const recipe of [first, ...versions]) assert.deepEqual(await getRecipe(library, first.id, recipe.version), recipe);
  assert.equal((await readdir(join(library, 'recipes', first.id))).length, 9);
});

for (const [name, change] of [
  ['unknown fields', value => ({ ...value, model: 'guessed' })],
  ['missing required field', value => { delete value.prompt; return value; }],
  ['blank text', value => ({ ...value, name: ' \n ' })],
  ['oversized prompt', value => ({ ...value, prompt: 'x'.repeat(50001) })],
  ['unsupported source', value => ({ ...value, sourceKinds: ['video'] })],
  ['duplicate source', value => ({ ...value, sourceKinds: ['text', 'text'] })],
  ['empty focus', value => ({ ...value, focus: [] })],
  ['blank focus item', value => ({ ...value, focus: [' '] })],
  ['duplicate focus item', value => ({ ...value, focus: ['决策', '决策'] })],
  ['traversal id', value => ({ ...value, id: '../outside' })],
  ['missing personal id', value => ({ ...value, id: 'b8bd8af5-599f-47a6-bb14-b2779a21b3ef' })],
]) test(`rejects ${name} before writing a recipe`, async () => {
  const library = await fixture();
  await assert.rejects(saveRecipe(library, change(input())));
  assert.equal((await listRecipes(library)).length, 5);
});

test('rejects invalid lookup identities and versions', async () => {
  const library = await fixture();
  for (const id of ['../outside', '', 'general-knowledge/../bad']) await assert.rejects(getRecipe(library, id), /id/);
  for (const version of [0, -1, 1.5, '1', NaN]) await assert.rejects(getRecipe(library, 'general-knowledge', version), /版本/);
});

test('rejects tampered stored recipes rather than trusting their digest', async () => {
  const library = await fixture();
  const recipe = await saveRecipe(library, input());
  const path = join(library, 'recipes', recipe.id, '1.json');
  const raw = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...raw, name: '篡改内容' }));
  await assert.rejects(getRecipe(library, recipe.id), /摘要/);
  await writeFile(path, JSON.stringify({ ...raw, unexpected: true }));
  await assert.rejects(listRecipes(library), /字段/);
});

test('rejects recipes directories redirected outside the selected library', async () => {
  const root = await fixture();
  const library = join(root, 'library');
  const outside = join(root, 'outside');
  await mkdir(library);
  await mkdir(outside);
  await symlink(outside, join(library, 'recipes'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(saveRecipe(library, input()), /路径/);
  await assert.rejects(listRecipes(library), /路径/);
  assert.deepEqual(await readdir(outside), []);
});


test('every accepted text length remains readable after JSON escaping', async () => {
  const library = await fixture();
  const recipe = await saveRecipe(library, {
    ...input(),
    description: '\u0001'.repeat(2000),
    prompt: '\u0001'.repeat(50000),
    outputInstructions: '\u0001'.repeat(20000),
    focus: Array.from({ length: 64 }, (_, index) => `${index}:` + '\u0001'.repeat(230)),
  });
  assert.deepEqual(await getRecipe(library, recipe.id), recipe);
});


test('rejects unsupported prompt variables while preserving ordinary JSON braces', async () => {
  const library = await fixture();
  await assert.rejects(saveRecipe(library, { ...input(), prompt: '材料 {source}，目标人群 {audience}' }), /audience/);
  const recipe = await saveRecipe(library, { ...input(), prompt: '材料 {source}，关注 {focus}，输出 {"assets":[]}。' });
  assert.match(recipe.prompt, /"assets"/);
  const stored = { ...recipe, prompt: '材料 {source}，级别 {detail_level}' };
  stored.digest = digest(stored);
  await writeFile(join(library, 'recipes', recipe.id, '1.json'), JSON.stringify(stored));
  await assert.rejects(getRecipe(library, recipe.id), /detail_level/);
});

test('project recipes preserve editable component rules in immutable personal versions', async t => {
  const library = await fixture();
  t.after(() => rm(library, { recursive: true, force: true }));
  const builtin = await getRecipe(library, 'component-distillation');
  assert.deepEqual(builtin.sourceKinds, ['project']);
  assert.deepEqual(builtin.componentRules, { iconPrimitives: 'exclude', emptyShells: 'exclude', duplicates: 'merge-identical', headlessContainers: 'exclude', viewEntries: 'context-only' });
  const { id, version, digest: ignored, builtin: ignoredBuiltin, ...content } = builtin;
  const first = await saveRecipe(library, { ...content, componentRules: { iconPrimitives: 'include', emptyShells: 'exclude' } });
  assert.equal(first.digest, digest(first));
  assert.notEqual(first.digest, builtin.digest);
  assert.deepEqual(await getRecipe(library, first.id), first);
  const second = await saveRecipe(library, { ...content, id: first.id, componentRules: { iconPrimitives: 'include', emptyShells: 'include' } });
  assert.equal(second.version, 2);
  assert.notEqual(first.digest, second.digest);
  assert.deepEqual(await getRecipe(library, first.id, 1), first);
  assert.deepEqual((await listRecipes(library)).filter(recipe => !recipe.builtin), [second]);
  const path = join(library, 'recipes', first.id, '2.json');
  await writeFile(path, JSON.stringify({ ...second, componentRules: { iconPrimitives: 'exclude', emptyShells: 'include' } }));
  await assert.rejects(getRecipe(library, first.id), /摘要/);
});

test('component rules are mandatory only for project recipes and accept no unknown semantics', async t => {
  const library = await fixture();
  t.after(() => rm(library, { recursive: true, force: true }));
  const rules = { iconPrimitives: 'exclude', emptyShells: 'exclude' };
  for (const change of [
    { sourceKinds: ['project'] },
    { sourceKinds: ['project', 'text'], componentRules: rules },
    { sourceKinds: ['project', 'conversation'], componentRules: rules },
    { sourceKinds: ['text'], componentRules: rules },
    { sourceKinds: ['conversation'], componentRules: rules },
    ...[null, [], {}, { iconPrimitives: 'exclude' }, { ...rules, unknown: true }, { ...rules, iconPrimitives: true }, { ...rules, emptyShells: 'auto' }, { ...rules, duplicates: 'merge-similar' }, { ...rules, duplicates: true }, { ...rules, headlessContainers: 'auto' }, { ...rules, viewEntries: 'exclude' }, { ...rules, viewEntries: null }].map(componentRules => ({ sourceKinds: ['project'], componentRules })),
  ]) await assert.rejects(saveRecipe(library, { ...input(), ...change }), /project|工程|componentRules/);
  assert.equal((await listRecipes(library)).length, 5);
});

test('page inclusion is versioned, optional for historical projects and strictly project-only', async t => {
  const library = await fixture();
  t.after(() => rm(library, { recursive: true, force: true }));
  const previous = await getRecipe(library, 'component-distillation', 1);
  assert.equal(Object.hasOwn(previous, 'includePages'), false);
  assert.equal(previous.digest, digest(previous));
  const latest = await getRecipe(library, 'component-distillation');
  assert.equal(latest.version, 4);
  const pageCatalogVersion = await getRecipe(library, 'component-distillation', 2);
  assert.match(pageCatalogVersion.description, /uni-app src\/pages.json/);
  assert.equal(pageCatalogVersion.digest, digest(pageCatalogVersion));
  assert.match(latest.description, /Vue Router/);
  assert.equal(latest.includePages, true);
  const { id, version, digest: ignored, builtin: ignoredBuiltin, ...content } = previous;
  const legacy = await saveRecipe(library, content);
  assert.equal(Object.hasOwn(await getRecipe(library, legacy.id), 'includePages'), false);
  const enabled = await saveRecipe(library, { ...content, id: legacy.id, includePages: true });
  const disabled = await saveRecipe(library, { ...content, id: legacy.id, includePages: false });
  assert.equal((await getRecipe(library, legacy.id, enabled.version)).includePages, true);
  assert.equal((await getRecipe(library, legacy.id)).includePages, false);
  assert.notEqual(enabled.digest, disabled.digest);
  assert.deepEqual(await getRecipe(library, legacy.id, 1), legacy);
  for (const includePages of [null, undefined, 1, 'true', []]) {
    await assert.rejects(saveRecipe(library, { ...content, includePages }), /includePages/);
  }
  for (const includePages of [true, false]) {
    await assert.rejects(saveRecipe(library, { ...input(), includePages }), /includePages/);
  }
});


test('component v4 keeps historical digests and exposes explicit duplicate and container choices', async t => {
  const library=await fixture();t.after(()=>rm(library,{recursive:true,force:true}));
  const hashes=['c5e4bba0b11c09f081df9d65d435b31ee9db07a8f4b1c0826015dad6c76b9a64','527f7b90d1801cd1644dcd79e2fe86c02a933efc22e3e3fa1a88e556bd726a86','6aa9cd071eb63f8bc8eae0c5f87e1ad9e4d7b01a0ca13a71f6a08f64e5329524'];
  for(let version=1;version<=3;version++) {
    const historical=await getRecipe(library,'component-distillation',version);
    assert.equal(historical.digest,hashes[version-1]);
    assert.equal(Object.hasOwn(historical.componentRules,'duplicates'),false);
    assert.equal(Object.hasOwn(historical.componentRules,'headlessContainers'),false);
    assert.equal(Object.hasOwn(historical.componentRules,'viewEntries'),false);
  }
  const latest=await getRecipe(library,'component-distillation');
  assert.equal(latest.version,4);assert.equal(latest.includePages,true);
  assert.match(latest.prompt,/源码完全相同且依赖一致/);
  assert.match(latest.prompt,/近似变体不得强并/);
  assert.match(latest.prompt,/提炼候选/);
  const {id,version,builtin,digest:ignored,...content}=latest;
  const personal=await saveRecipe(library,{...content,componentRules:{...content.componentRules,duplicates:'keep',headlessContainers:'include',viewEntries:'include'}});
  assert.equal(personal.componentRules.duplicates,'keep');
  assert.equal(personal.componentRules.headlessContainers,'include');
  assert.equal(personal.componentRules.viewEntries,'include');
  assert.deepEqual(await getRecipe(library,personal.id),personal);
});
