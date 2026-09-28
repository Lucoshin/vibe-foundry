import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

test('collection editor keeps same-name identities distinct and lets users remove unavailable references', async () => {
  const { knowledgeCollectionsJs } = await import('../../dist/web/knowledge-collections-frontend.js');
  const context = vm.createContext({ escapeHtml });
  vm.runInContext(knowledgeCollectionsJs, context);
  context.record = { id: 'collection-one', name: '<主题>', description: '说明', assetIds: ['one', 'missing'], members: [{ assetId: 'missing', status: 'missing', asset: null }] };
  context.assets = [{ id: 'one', name: '林岚', sourceName: '书一', kind: 'character' }, { id: 'two', name: '林岚', sourceName: '书二', kind: 'character' }];
  const html = vm.runInContext('collectionEditorHtml(record, assets)', context);
  assert.match(html, /value="one" checked/);
  assert.match(html, /value="two"/);
  assert.match(html, /value="missing" checked/);
  assert.match(html, /当前无法读取/);
  assert.match(html, /&lt;主题&gt;/);
  assert.match(html, /书一/);
  assert.match(html, /书二/);
});

test('relation cards show direction, provenance, original evidence and explicit broken or empty states', async () => {
  const { knowledgeCollectionsJs } = await import('../../dist/web/knowledge-collections-frontend.js');
  const context = vm.createContext({ escapeHtml });
  vm.runInContext(knowledgeCollectionsJs, context);
  context.result = { relations: [{ id: 'edge', sourceId: 'book:one', sourceName: '书一', revision: 'rev', type: '守护', description: '<script>关系</script>', basis: 'interpretation', evidence: [{ unitId: 'unit-1', quote: '真实引文' }], from: { name: '林岚', assetId: 'one', reference: 'lin', status: 'available' }, to: { name: null, assetId: null, reference: 'tower', status: 'missing' }, status: 'broken' }], selected: [], errors: [], limitations: [] };
  const html = vm.runInContext('collectionRelationsHtml(result)', context);
  assert.match(html, /林岚.*→/s);
  assert.match(html, /断链/);
  assert.match(html, /分析解释/);
  assert.match(html, /真实引文/);
  assert.match(html, /book:one/);
  assert.match(html, /unit-1/);
  assert.doesNotMatch(html, /<script>/);
  context.result = { relations: [], selected: [{ assetId: 'missing', status: 'missing' }], errors: [{ message: '书籍损坏' }], limitations: [] };
  assert.match(vm.runInContext('collectionRelationsHtml(result)', context), /书籍损坏/);
  assert.match(vm.runInContext('collectionRelationsHtml(result)', context), /尚无可读取的已有关系/);
});

test('leaving collection workspace prevents a late request from rendering another page', async () => {
  const { knowledgeCollectionsJs } = await import('../../dist/web/knowledge-collections-frontend.js');
  const finishes = [];
  const panel = { innerHTML: '', querySelectorAll: () => [] };
  const state = { workspace: 'collections' };
  const context = vm.createContext({ escapeHtml, state, byId: () => panel, document: { querySelector: () => ({ content: 'token' }) },
    fetch: () => new Promise(resolve => finishes.push(resolve)) });
  vm.runInContext(knowledgeCollectionsJs, context);
  const pending = vm.runInContext('renderCollectionWorkbench()', context);
  state.workspace = 'assets';
  panel.innerHTML = '资产库';
  finishes[0]({ ok: true, json: async () => ({ collections: [], errors: [] }) });
  finishes[1]({ ok: true, json: async () => ({ assets: [], errors: [] }) });
  await pending;
  assert.equal(panel.innerHTML, '资产库');
});
