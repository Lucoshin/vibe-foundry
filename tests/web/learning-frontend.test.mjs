import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { learningWorkbenchJs, learningWorkbenchCss } from '../../dist/web/learning-frontend.js';
import { getRecipe, listRecipes, saveRecipe } from '../../dist/learning/recipes.js';

function harness(responses = {}) {
  const nodes = new Map();
  const calls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '', disabled: false, checked: false, dataset: {}, elements: { namedItem: name => node(id + ':' + name) }, insertAdjacentHTML(position,html) { this.innerHTML+=html; } });
    return nodes.get(id);
  };
  const state = { workspace: 'learning', model: { sources: [], assets: [] } };
  const context = vm.createContext({
    state, byId: node, escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    render() {}, URLSearchParams, Event,
    conversationWorkbenchHtml:()=>'',creatorWorkbenchHtml:()=>'',bindConversationWorkbench(){},bindCreatorWorkbench(){},
    document: { querySelector: () => ({ content: 'local-token' }) },
    window: { dispatchEvent() {} }, navigator: { clipboard: { writeText: async () => {} } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const configured = responses[url];
      const response = (typeof configured === 'function' ? await configured(options) : configured) ?? { ok: true, body: [] };
      return { ok: response.ok, status: response.ok ? 200 : 400, json: async () => response.body };
    },
  });
  vm.runInContext(learningWorkbenchJs + '\nglobalThis.api = { learningRequest, learningSourceInput, learningRecipeInput, learningApplicationInput, renderLearningWorkbench };', context);
  return { api: context.api, state, node, calls, context };
}
const form = values => ({ elements: { namedItem: name => typeof values[name] === 'boolean' ? { checked: values[name] } : { value: values[name] ?? '' } } });
const plain = value => JSON.parse(JSON.stringify(value));

test('learning API sends the local token on reads and JSON writes and exposes errors', async () => {
  const { api, calls } = harness({ '/api/learning/analysis': { ok: false, body: { message: '引文不匹配' } } });
  await api.learningRequest('recipes');
  await assert.rejects(api.learningRequest('analysis', { taskId: 'task-x', analysis: {} }), /引文不匹配/);
  assert.equal(calls[0].options.headers['x-vibe-import-token'], 'local-token');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[1].options.body), { taskId: 'task-x', analysis: {} });
});

test('plain material becomes a traceable source and conversation JSON preserves actual entries', () => {
  const { api } = harness();
  assert.deepEqual(plain(api.learningSourceInput(form({ format: 'text', title: '复盘', kind: 'text', material: '真实材料' }))), { schemaVersion: '0.1.0', title: '复盘', kind: 'text', entries: [{ id: 'entry-1', role: 'document', text: '真实材料' }] });
  assert.throws(() => api.learningSourceInput(form({ format: 'text', title: '对话', kind: 'conversation', material: '真实材料' })), /JSON/);
  const source = { schemaVersion: '0.1.0', title: '对话', kind: 'conversation', entries: [{ id: 'u1', role: 'user', text: '需要保留出处。' }] };
  assert.deepEqual(plain(api.learningSourceInput(form({ format: 'json', kind: 'conversation', material: JSON.stringify(source) }))), source);
});

test('saving a built-in creates a personal copy and personal updates retain only the stable id', () => {
  const { api } = harness();
  const values = form({ name: '方案', description: '说明', sourceText: true, sourceConversation: false, focus: '决策\n证据', prompt: '{source}', outputInstructions: '输出要求' });
  const content = { name: '方案', description: '说明', sourceKinds: ['text'], focus: ['决策', '证据'], prompt: '{source}', outputInstructions: '输出要求' };
  assert.deepEqual(plain(api.learningRecipeInput(values, { builtin: true, id: 'general-knowledge' })), content);
  assert.deepEqual(plain(api.learningRecipeInput(values, { builtin: false, id: 'personal-id' })), { id: 'personal-id', ...content });
  assert.deepEqual(plain(api.learningRecipeInput(values, { builtin: false, id: 'personal-id' }, true)), content);
});

test('application forms retain exact knowledge identities and explicit evidence', () => {
  const { api } = harness();
  assert.deepEqual(plain(api.learningApplicationInput(form({ asset: 'learning:task:digest:decision', target: '侧栏', reason: '分类重叠', action: '统一入口', outcome: '通过验收', evidenceLabel: '测试报告', evidenceUri: 'docs/report.md' }))), { assetIds: ['learning:task:digest:decision'], target: '侧栏', reason: '分类重叠', action: '统一入口', outcome: '通过验收', evidence: [{ label: '测试报告', uri: 'docs/report.md' }] });
});

test('sources escape untrusted material and expose asset navigation', async () => {
  const { api, state, node } = harness();
  state.workspace = 'sources';
  state.model.sources = [{ id: 'source-1', name: '<img onerror=1>', kind: 'text', path: '/tmp/book', status: 'ready', assetCount: 2, uncertainties: [{ description: '<script>bad</script>', evidence: [{ unitId: 'chapter-1', quote: '真实引文' }] }], reports: { reuse: '复用报告', rules: '真实规则' } }];
  await api.renderLearningWorkbench('sources');
  const html = node('workbench-content').innerHTML;
  assert.match(html, /&lt;img onerror=1&gt;/);
  assert.doesNotMatch(html, /<script>bad/);
  assert.match(html, /真实引文/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /\[object Object\]/);
  node('learning-source-0').onclick();
  assert.equal(state.workspace, 'assets');
  assert.equal(state.sourceFilter, 'source-1');
});

test('learning workspace explains host execution and renders API failures visibly', async () => {
  const { api, node } = harness({ '/api/learning/recipes': { ok: false, body: { message: '损坏的方案文件' } } });
  await api.renderLearningWorkbench('learning');
  assert.match(node('learning-message').textContent, /损坏的方案文件/);
  const good = harness();
  await good.api.renderLearningWorkbench('learning');
  assert.match(good.node('workbench-content').innerHTML, /宿主/);
  assert.match(good.node('workbench-content').innerHTML, /尚无学习任务/);
  assert.match(learningWorkbenchCss, /learning-workbench/);
});

test('applications show a true empty state without inventing knowledge options', async () => {
  const { api, state, node } = harness();
  state.workspace = 'applications';
  await api.renderLearningWorkbench('applications');
  assert.match(node('workbench-content').innerHTML, /尚无可应用的过程知识/);
  assert.match(node('workbench-content').innerHTML, /使用者声明/);
});


const builtin = { id: 'general-knowledge', version: 1, name: '知识方案', description: '提取可复用知识', sourceKinds: ['text', 'conversation'], focus: ['事实'], prompt: '{source}\n{focus}', outputInstructions: '保留证据', builtin: true, digest: 'a'.repeat(64) };
const taskFixture = recipe => ({ id: 'task-' + 'b'.repeat(64), sourceDigest: 'c'.repeat(64), recipeDigest: recipe.digest, recipe, source: { title: '同一材料' }, taskPath: 'library/task.md', instructions: '真实任务</textarea><img onerror=1>', status: 'prepared', results: [] });

test('material submit freezes the selected recipe version in the real request handler', async () => {
  const task = taskFixture(builtin);
  const { api, node, calls } = harness({
    '/api/learning/recipes': { ok: true, body: [builtin] },
    '/api/learning/tasks': options => ({ ok: true, body: options.method === 'POST' ? task : [] }),
  });
  await api.renderLearningWorkbench('learning');
  const materialForm = node('learning-material-form');
  materialForm.elements = form({ format: 'text', kind: 'text', title: '真实标题', material: '用户要求保留来源。', recipe: builtin.id }).elements;
  await materialForm.onsubmit({ preventDefault() {} });
  const posted = calls.find(call => call.url === '/api/learning/tasks' && call.options.method === 'POST');
  const body = JSON.parse(posted.options.body);
  assert.equal(body.recipeId, builtin.id);
  assert.equal(body.recipeVersion, 1);
  assert.equal(body.source.entries[0].text, '用户要求保留来源。');
  assert.match(node('learning-message').textContent, /等待宿主/);
});

test('recipe submit sends editable fields without built-in identity or digest', async () => {
  const saved = { ...builtin, id: 'personal-example', builtin: false };
  const { api, node, calls } = harness({ '/api/learning/recipes': options => ({ ok: true, body: options.method === 'POST' ? saved : [builtin, saved] }) });
  await api.renderLearningWorkbench('recipes');
  const editor = node('learning-recipe-form');
  editor.elements = form({ name: '我的方案', description: '说明', sourceText: true, sourceConversation: true, focus: '用户确认', prompt: '{source} {focus}', outputInstructions: '逐字引用' }).elements;
  await editor.onsubmit({ preventDefault() {} });
  const posted = calls.find(call => call.options.method === 'POST');
  const body = JSON.parse(posted.options.body);
  assert.equal(body.name, '我的方案');
  assert.equal(Object.hasOwn(body, 'id'), false);
  assert.equal(Object.hasOwn(body, 'digest'), false);
  assert.equal(Object.hasOwn(body, 'version'), false);
  assert.match(node('learning-message').textContent, /已保存/);
});

test('same-source tasks expose comparable recipe results and escaped complete instructions', async () => {
  const first = taskFixture(builtin);
  first.status = 'analyzed';
  first.results = [{ id: 'result-first', assetCount: 3 }];
  const second = { ...taskFixture({ ...builtin, id: 'personal-example', name: '个人方案', version: 2 }), id: 'task-' + 'd'.repeat(64), results: [{ id: 'result-second', assetCount: 5 }], status: 'analyzed' };
  const { api, node, state } = harness({
    '/api/learning/recipes': { ok: true, body: [builtin] },
    '/api/learning/tasks': { ok: true, body: [first, second] },
    ['/api/learning/task?id=' + first.id]: { ok: true, body: first },
  });
  state.model.assets = [{ id: 'learning:first', name: '默认知识', description: '默认方案的产物摘要', raw: { taskId: first.id, resultId: 'result-first', basis: 'explicit', recipeVersion: 1 } }, { id: 'learning:second', name: '个人知识', description: '个人方案的产物摘要', raw: { taskId: second.id, resultId: 'result-second', basis: 'interpretation', recipeVersion: 2 } }];
  await api.renderLearningWorkbench('learning');
  assert.match(node('workbench-content').innerHTML, /个人方案/);
  assert.match(node('workbench-content').innerHTML, /默认方案的产物摘要/);
  assert.match(node('workbench-content').innerHTML, /个人方案的产物摘要/);
  assert.match(node('workbench-content').innerHTML, /材料明示/);
  assert.match(node('workbench-content').innerHTML, /分析解释/);
  assert.match(node('workbench-content').innerHTML, /查看原始知识记录/);
  assert.match(node('workbench-content').innerHTML, /3 项知识资产/);
  assert.match(node('workbench-content').innerHTML, /5 项知识资产/);
  await node('learning-task-0').onclick();
  assert.match(node('learning-active-task').innerHTML, /&lt;\/textarea&gt;&lt;img onerror=1&gt;/);
  assert.doesNotMatch(node('learning-active-task').innerHTML, /<img onerror=1>/);
});

test('project rule controls save through the existing recipe editor and read back a personal version', async t => {
  const library = await mkdtemp(join(tmpdir(), 'vibe-project-recipe-ui-'));
  t.after(() => rm(library, { recursive: true, force: true }));
  const project = await getRecipe(library, 'component-distillation');
  const { api, node, calls } = harness({ '/api/learning/recipes': async options => ({ ok: true, body: options.method === 'POST' ? await saveRecipe(library, JSON.parse(options.body)) : [project, ...(await listRecipes(library)).filter(recipe => !recipe.builtin)] }) });
  await api.renderLearningWorkbench('recipes');
  assert.match(node('workbench-content').innerHTML, /name="sourceProject" checked/);
  assert.match(node('workbench-content').innerHTML, /name="iconPrimitives"/);
  assert.match(node('workbench-content').innerHTML, /name="emptyShells"/);
  assert.match(node('workbench-content').innerHTML, /name="duplicates"[^]*?<option value="merge-identical" selected/);
  assert.match(node('workbench-content').innerHTML, /name="headlessContainers"[^]*?<option value="exclude" selected/);
  assert.match(node('workbench-content').innerHTML, /name="viewEntries"[^]*?<option value="context-only" selected/);
  assert.match(node('workbench-content').innerHTML, /name="includePages" checked/);
  const editor = node('learning-recipe-form');
  editor.elements = form({ name: '保留图标的工程方案', description: '我的组件方案', sourceProject: true, sourceText: false, sourceConversation: false, includePages: false, iconPrimitives: 'include', emptyShells: 'exclude', duplicates: 'keep', headlessContainers: 'include', viewEntries: 'include', focus: '布局\n交互', prompt: '材料 {source}，关注 {focus}', outputInstructions: '标明未知' }).elements;
  await editor.onsubmit({ preventDefault() {} });
  const body = JSON.parse(calls.find(call => call.options.method === 'POST').options.body);
  assert.deepEqual(body.sourceKinds, ['project']);
  assert.deepEqual(body.componentRules, { iconPrimitives: 'include', emptyShells: 'exclude', duplicates: 'keep', headlessContainers: 'include', viewEntries: 'include' });
  assert.equal(body.includePages, false);
  const saved = (await listRecipes(library)).find(recipe => !recipe.builtin);
  assert.deepEqual(saved.componentRules, body.componentRules);
  assert.equal(saved.includePages, false);
  assert.doesNotMatch(node('workbench-content').innerHTML, /name="includePages" checked/);
  assert.match(node('workbench-content').innerHTML, /保留图标的工程方案/);
  assert.match(node('workbench-content').innerHTML, /name="iconPrimitives"[^]*?<option value="include" selected/);
  assert.match(node('learning-message').textContent, /已保存/);
});

test('historical component recipe leaves full-page selection off until explicitly enabled', async () => {
  const project = await getRecipe('unused', 'component-distillation', 1);
  const { api, node } = harness({ '/api/learning/recipes': { ok: true, body: [project] } });
  await api.renderLearningWorkbench('recipes');
  assert.match(node('workbench-content').innerHTML, /name="includePages"/);
  assert.doesNotMatch(node('workbench-content').innerHTML, /name="includePages" checked/);
  assert.match(node('workbench-content').innerHTML, /name="duplicates"[^]*?<option value="keep" selected/);
  assert.match(node('workbench-content').innerHTML, /name="headlessContainers"[^]*?<option value="include" selected/);
  assert.match(node('workbench-content').innerHTML, /name="viewEntries"[^]*?<option value="include" selected/);
  const values = form({ name: project.name, description: project.description, sourceProject: true, includePages: true, iconPrimitives: 'exclude', emptyShells: 'exclude', duplicates: 'keep', headlessContainers: 'include', viewEntries: 'include', focus: '页面', prompt: '{source}', outputInstructions: '真实来源' });
  assert.equal(api.learningRecipeInput(values, project).includePages, true);
});

test('project kind is mutually exclusive with text and conversation inside the existing editor', async () => {
  const { api, node } = harness({ '/api/learning/recipes': { ok: true, body: [builtin] } });
  await api.renderLearningWorkbench('recipes');
  const fields = node('learning-recipe-form').elements;
  const project = fields.namedItem('sourceProject');
  const text = fields.namedItem('sourceText');
  const conversation = fields.namedItem('sourceConversation');
  text.checked = true;
  conversation.checked = true;
  project.checked = true;
  project.onchange();
  assert.equal(text.checked, false);
  assert.equal(conversation.checked, false);
  assert.equal(node('learning-component-rules').hidden, false);
  text.checked = true;
  text.onchange();
  assert.equal(project.checked, false);
  assert.equal(node('learning-component-rules').hidden, true);
});

test('learning material options follow source kind and never offer project recipes', async () => {
  const project = { ...builtin, id: 'component-distillation', name: '工程方案', sourceKinds: ['project'] };
  const text = { ...builtin, id: 'text-only', name: '仅文本方案', sourceKinds: ['text'] };
  const conversation = { ...builtin, id: 'conversation-only', name: '仅对话方案', sourceKinds: ['conversation'] };
  const { api, node, calls } = harness({ '/api/learning/recipes': { ok: true, body: [project, text, conversation] } });
  await api.renderLearningWorkbench('learning');
  const html = node('workbench-content').innerHTML;
  assert.match(html, /仅文本方案/);
  assert.doesNotMatch(html, /工程方案|仅对话方案/);
  const material = node('learning-material-form');
  material.elements.namedItem('kind').value = 'conversation';
  material.elements.namedItem('kind').onchange();
  const options = material.elements.namedItem('recipe').innerHTML;
  assert.match(options, /仅对话方案/);
  assert.doesNotMatch(options, /工程方案|仅文本方案/);
  // A stale or manually changed selection must be rejected before preparing a task.
  material.elements.namedItem('recipe').value = project.id;
  await material.onsubmit({ preventDefault() {} });
  assert.equal(calls.some(call => call.url === '/api/learning/tasks' && call.options.method === 'POST'), false);
  assert.match(node('learning-message').textContent, /材料类型|匹配/);
});
