import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { assetUseJs } from '../../dist/web/asset-use-frontend.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

test('image details separate observations, inference and unverified prompts and escape source text', () => {
  const context = vm.createContext({ escapeHtml, encodeURIComponent });
  vm.runInContext(assetUseJs, context);
  context.asset = { category: 'images', name: '<image>', raw: {
    sourceDigest: 'a'.repeat(64), image: { width: 100, height: 80, format: 'png' },
    observations: [{ aspect: 'color', text: '<script>source</script>', evidence: { scope: 'whole-image' } }],
    inferences: [{ text: '界面截图', basedOn: [0], uncertainty: '不能据此确认使用的软件。' }],
    prompts: [{ targetModel: 'generic', prompt: '重现浅色界面', verification: 'unverified' }],
  } };
  const html = vm.runInContext('renderImageDetails(asset)', context);
  assert.match(html, /api\/image-snapshots\/a{64}/);
  assert.match(html, /视觉观察/);
  assert.match(html, /分析推断/);
  assert.match(html, /未验证/);
  assert.match(html, /不能据此确认/);
  assert.match(html, /&lt;script&gt;source&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>source/);
});

test('changing selected assets invalidates the old task context without starting an application', () => {
  const panel = { hidden: true, innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  const context = vm.createContext({ escapeHtml, state: { workspace: 'assets', model: { assets: [{ id: 'one', name: '知识一' }, { id: 'two', name: '知识二' }] } }, byId: () => panel });
  vm.runInContext(assetUseJs, context);
  vm.runInContext("toggleTaskContextAsset('one'); taskContextState.result={markdown:'旧上下文'}; toggleTaskContextAsset('two');", context);
  assert.equal(vm.runInContext('taskContextState.assetIds.size', context), 2);
  assert.equal(vm.runInContext('taskContextState.result', context), null);
  assert.match(panel.innerHTML, /知识一/);
  assert.match(panel.innerHTML, /知识二/);
  assert.match(panel.innerHTML, /任务目标/);
  assert.doesNotMatch(panel.innerHTML, /旧上下文/);
  vm.runInContext("toggleTaskContextAsset('one');", context);
  assert.equal(vm.runInContext('taskContextState.assetIds.has("one")', context), false);
});

test('an earlier context request cannot replace a new asset selection', async () => {
  let finish;
  const panel = { hidden: false, innerHTML: '', querySelectorAll: () => [] };
  const context = vm.createContext({ escapeHtml,
    state: { workspace: 'assets', model: { assets: [{ id: 'one', name: '知识一' }, { id: 'two', name: '知识二' }] } },
    byId: () => panel, document: { querySelector: () => ({ content: 'local-token' }) },
    fetch: async () => new Promise(resolve => { finish = resolve; }),
  });
  vm.runInContext(assetUseJs, context);
  vm.runInContext("toggleTaskContextAsset('one'); taskContextState.goal='任务一';", context);
  const pending = vm.runInContext('generateTaskContext()', context);
  vm.runInContext("toggleTaskContextAsset('two');", context);
  finish({ ok: true, json: async () => ({ markdown: '旧请求结果' }) });
  await pending;
  assert.equal(vm.runInContext('taskContextState.result', context), null);
  assert.equal(vm.runInContext('taskContextState.loading', context), false);
  assert.doesNotMatch(panel.innerHTML, /旧请求结果/);
});

for (const outcome of ['success', 'failure']) {
  for (const transition of ['navigation', 'revision']) {
    test(`context clipboard ${outcome} after ${transition} leaves the new UI untouched`, async () => {
      let resolveCopy, rejectCopy, copiedText;
      const copyButton = {};
      const status = { textContent: '' };
      const panel = {
        hidden: false, innerHTML: '',
        querySelectorAll(selector) { return selector === '[data-context-copy]' ? [copyButton] : []; },
        querySelector() { return this.hidden ? null : status; },
      };
      const context = vm.createContext({ escapeHtml,
        state: { workspace: 'assets', model: { assets: [{ id: 'one', name: '知识一' }] } },
        byId: () => panel,
        navigator: { clipboard: { writeText(value) {
          copiedText = value;
          return new Promise((resolve, reject) => { resolveCopy = resolve; rejectCopy = reject; });
        } } },
      });
      vm.runInContext(assetUseJs, context);
      vm.runInContext("taskContextState.assetIds.add('one'); taskContextState.result={markdown:'确切已生成内容'}; renderTaskContextPanel();", context);
      const pending = copyButton.onclick();
      assert.equal(copiedText, '确切已生成内容');
      if (transition === 'navigation') vm.runInContext("state.workspace='sources'; renderTaskContextPanel();", context);
      else vm.runInContext("taskContextState.goal='新任务'; invalidateTaskContext();", context);
      status.textContent = '新状态';
      if (outcome === 'success') resolveCopy();
      else rejectCopy(new Error('Clipboard denied'));
      await pending;
      assert.equal(status.textContent, '新状态');
    });
  }
}

test('context clipboard reports completion for the unchanged visible context', async () => {
  const copyButton = {};
  const status = { textContent: '' };
  const panel = { hidden: false, innerHTML: '', querySelectorAll: selector => selector === '[data-context-copy]' ? [copyButton] : [], querySelector: () => status };
  const context = vm.createContext({ escapeHtml,
    state: { workspace: 'assets', model: { assets: [{ id: 'one', name: '知识一' }] } }, byId: () => panel,
    navigator: { clipboard: { writeText: async () => {} } },
  });
  vm.runInContext(assetUseJs, context);
  vm.runInContext("taskContextState.assetIds.add('one'); taskContextState.result={markdown:'可复制内容'}; renderTaskContextPanel();", context);
  await copyButton.onclick();
  assert.match(status.textContent, /已复制/);
});
