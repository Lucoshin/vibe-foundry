import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { renderWebAppHtml } from '../../dist/web/frontend.js';

function context() {
  const js = renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1];
  const ctx = vm.createContext({});
  vm.runInContext(js.slice(0, js.indexOf('\nfunction startWebApp()')), ctx);
  ctx.asset = { id: 'page:publish', kind: 'page', category: 'pages', name: '发布岗位', raw: {
    route: '/pages/publish/index', filePath: 'src/pages/publish/index.vue',
    sourceFiles: ['src/pages/publish/index.vue', 'src/components/JobForm.vue'],
    blocks: [{ name: 'JobForm', filePath: 'src/components/JobForm.vue', sourceLocation: { line: 12, column: 3 } }],
    states: [{ directive: 'v-if', expression: 'mode === "detail" && count < 2', sourceLocation: { line: 11, column: 4 } }],
    limitations: ['页面运行环境尚未验证：依赖路由、登录状态。'],
  } };
  return ctx;
}

test('page card reports route and source structure without creating a component preview', () => {
  const ctx = context();
  const html = vm.runInContext('renderPageSummary(asset)', ctx);
  assert.match(html, /\/pages\/publish\/index/);
  assert.match(html, /1 个组成区块/);
  assert.match(html, /1 个条件状态/);
  assert.doesNotMatch(html, /iframe|放大预览/);
  assert.equal(vm.runInContext("renderPageSummary({category:'components'})", ctx), '');
});

test('page detail exposes source evidence and limitations without claiming a runnable screen', () => {
  const ctx = context();
  const html = vm.runInContext('renderPageDetails(asset)', ctx);
  assert.match(html, /src\/pages\/publish\/index.vue/);
  assert.match(html, /JobForm/);
  assert.match(html, /src\/components\/JobForm.vue/);
  assert.match(html, /第 12 行/);
  assert.match(html, /v-if/);
  assert.match(html, /mode === &quot;detail&quot; &amp;&amp; count &lt; 2/);
  assert.match(html, /页面运行环境尚未验证/);
  assert.doesNotMatch(html, /iframe|打开预览/);
});

test('page detail distinguishes an empty source structure from missing runtime validation', () => {
  const ctx = context();
  ctx.asset.raw.blocks = [];
  ctx.asset.raw.states = [];
  const html = vm.runInContext('renderPageDetails(asset)', ctx);
  assert.match(html, /未识别到已导入的组件区块/);
  assert.match(html, /未识别到模板条件状态/);
  assert.match(html, /页面运行环境尚未验证/);
});

test('page asset card integrates the source summary and the page filter uses a Chinese label', () => {
  const ctx = context();
  let cardHtml = '';
  ctx.card = {
    children: [], setAttribute() {}, querySelector() { return null; },
    insertAdjacentHTML(_position, html) { cardHtml += html; },
  };
  const nodes = new Map();
  ctx.node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', addEventListener() {} });
    return nodes.get(id);
  };
  vm.runInContext('updateAssetCard(card, asset); byId=node; state.model={assets:[asset],sources:[]}; renderComponentControls();', ctx);
  assert.match(cardHtml, /完整页面/);
  assert.match(cardHtml, /\/pages\/publish\/index/);
  assert.match(cardHtml, /1 个组成区块/);
  assert.doesNotMatch(cardHtml, /iframe|组件预览暂不可用/);
  assert.match(nodes.get('component-controls').innerHTML, /value="page">完整页面/);
});

test('registered pages reuse the real preview workbench while retaining source structure and prompts', () => {
  const ctx = context();
  ctx.asset.componentPreview = { id: 'publish-preview', status: 'pending', buildable: true, runtime: 'vue3', previewUrl: '/component-preview/publish-preview/' };
  vm.runInContext('state.model={assets:[asset]};', ctx);
  assert.equal(vm.runInContext('componentAssetById(asset.id) === asset', ctx), true);
  const thumbnail = vm.runInContext('renderComponentThumbnailContent(asset)', ctx);
  assert.match(thumbnail, /<iframe/);
  assert.match(thumbnail, /src="\/component-preview\/publish-preview\/\?embed=1"/);
  const workbench = vm.runInContext('renderPreviewWorkbench(asset)', ctx);
  assert.match(workbench, /data-preview-frame/);
  assert.match(workbench, /\/pages\/publish\/index/);
  assert.match(workbench, /JobForm/);
  assert.match(workbench, /mode === &quot;detail&quot;/);
  assert.match(workbench, /data-component-prompt="page:publish"/);
  assert.match(vm.runInContext('renderComponentRuntimePreview(asset)', ctx), /页面预览/);
});
