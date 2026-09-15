import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { importJs } from '../../dist/web/import-frontend.js';
import { renderWebAppHtml } from '../../dist/web/frontend.js';

function element() {
  return {
    listeners: {}, children: [], dataset: {}, textContent: '', value: '', disabled: false, hidden: false,
    addEventListener(name, action) { this.listeners[name] = action; },
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    setAttribute() {},
    querySelector() { return this.submit ??= element(); },
    querySelectorAll() { return this.children.filter(child => child.dataset.filePath); },
    showModal() { this.open = true; }, close() { this.open = false; },
  };
}

test('generated page script parses and local picker uses selected source, reports failures and delivers completion', async () => {
  new vm.Script(renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1]);
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const open = element();
  const requests = [];
  const events = [];
  let job = null;
  let failBrowse = false;
  let timer;
  const context = vm.createContext({
    document: { getElementById: get, querySelector: () => ({ content: 'token' }), querySelectorAll: () => [open], createElement: element },
    window: { dispatchEvent: event => events.push(event.type) }, CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => { timer = null; },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (url.endsWith('/browse')) {
        if (failBrowse) return { ok: false, json: async () => ({ message: '目录不可读取' }) };
        return { ok: true, json: async () => ({ path: 'D:/项目', parent: 'D:/', home: 'D:/用户目录', initialDirectory: 'D:/项目', entries: [{ name: '资料.md', path: 'D:/项目/资料.md', kind: 'document' }] }) };
      }
      if (url.endsWith('/start')) job = { id: 'job-1', state: 'running', kind: 'project', name: '项目', message: '正在分析' };
      return { ok: true, json: async () => job, text: async () => '# 真实文档报告' };
    },
  });
  vm.runInContext(importJs, context);
  await new Promise(resolve => setImmediate(resolve));
  await open.listeners.click();
  assert.equal(get('import-dialog').open, true);
  assert.equal(get('import-task-step').hidden, true);
  assert.equal(get('import-start').disabled, true);
  get('import-folder').listeners.click();
  assert.equal(get('import-start').disabled, false);
  await get('import-start').listeners.click();
  assert.equal(get('import-selection-step').hidden, true);
  assert.equal(get('import-task-step').hidden, false);
  assert.equal(get('import-start').disabled, true);
  assert.equal(JSON.parse(requests.find(request => request.url.endsWith('/start')).body).path, 'D:/项目');
  job = { ...job, state: 'succeeded', outputDir: 'D:/library/project', message: '已完成' };
  await timer();
  assert.deepEqual(events, ['vibe-import-complete']);
  assert.equal(get('import-start').disabled, false);
  await get('import-new').listeners.click();
  assert.equal(get('import-task-step').hidden, true);
  assert.equal(get('import-status').textContent, '');
  get('import-files').children[0].listeners.click();
  assert.match(get('import-kind-help').textContent, /基础章节/);
  job = { ...job, id: 'job-2', kind: 'document' };
  await open.listeners.click();
  get('import-last-task').listeners.click();
  assert.equal(get('import-results').hidden, false);
  await get('import-report').listeners.click();
  assert.equal(get('import-report-content').textContent, '# 真实文档报告');
  failBrowse = true;
  get('import-path-form').listeners.submit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(get('import-status').textContent, /目录不可读取/);
  assert.equal(get('import-path-form').querySelector().disabled, false);
});
