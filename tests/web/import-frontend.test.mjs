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
      if(url==='/api/learning/recipes') return {ok:true,json:async()=>[
        {id:'general-knowledge',version:2,name:'通用方案',sourceKinds:['text']},
        {id:'component-distillation',version:1,name:'组件默认方案',sourceKinds:['project']},
        {id:'personal',version:3,name:'我的组件要求',sourceKinds:['project']}
      ]};
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
  assert.equal(get('import-recipe-field').hidden,false);
  assert.equal(get('import-recipe').children.some(option=>option.value==='general-knowledge'),false);
  assert.match(get('import-recipe').children.find(option=>option.value==='personal').textContent,/我的组件要求.*3/);
  get('import-recipe').value='personal';get('import-recipe').listeners.change();
  assert.equal(get('import-start').disabled, false);
  await get('import-start').listeners.click();
  assert.equal(get('import-selection-step').hidden, true);
  assert.equal(get('import-task-step').hidden, false);
  assert.equal(get('import-start').disabled, true);
  assert.equal(JSON.parse(requests.find(request => request.url.endsWith('/start')).body).path, 'D:/项目');
  assert.deepEqual(JSON.parse(requests.find(request=>request.url.endsWith('/start')).body),{path:'D:/项目',recipeId:'personal',recipeVersion:3});
  job = { ...job, state: 'succeeded', outputDir: 'D:/library/project', message: '已完成' };
  await timer();
  assert.deepEqual(events, ['vibe-import-complete']);
  assert.equal(get('import-start').disabled, false);
  await get('import-new').listeners.click();
  assert.equal(get('import-task-step').hidden, true);
  assert.equal(get('import-status').textContent, '');
  get('import-files').children[0].listeners.click();
  assert.equal(get('import-recipe-field').hidden,true);
  assert.match(get('import-kind-help').textContent, /基础章节/);
  await get('import-start').listeners.click();
  assert.deepEqual(JSON.parse(requests.filter(request=>request.url.endsWith('/start')).at(-1).body),{path:'D:/项目/资料.md'});
  job = { ...job, id: 'job-2', kind: 'document', state:'succeeded' };
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

test('recipe fetch failure blocks project start but leaves document import available, and reopening discards stale recipe results',async()=>{
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const open=element(),pending=[],starts=[];
  const context=vm.createContext({
    document:{getElementById:get,querySelector:()=>({content:'token'}),querySelectorAll:()=>[open],createElement:element},
    window:{dispatchEvent(){}},CustomEvent:class{},setTimeout(){},clearTimeout(){},
    fetch:async(url,options)=>{
      if(url==='/api/learning/recipes')return new Promise(resolve=>pending.push(resolve));
      if(url.endsWith('/browse'))return {ok:true,json:async()=>({path:'D:/project',parent:'D:/',entries:[{name:'book.md',path:'D:/project/book.md',kind:'document'}]})};
      if(url.endsWith('/start'))starts.push(JSON.parse(options.body));
      return {ok:true,json:async()=>null};
    }
  });
  vm.runInContext(importJs,context);await new Promise(resolve=>setImmediate(resolve));
  const firstOpen=open.listeners.click();await new Promise(resolve=>setImmediate(resolve));
  get('import-folder').listeners.click();assert.equal(get('import-start').disabled,true);
  await get('import-start').listeners.click();assert.equal(starts.length,0);
  pending[0]({ok:false,json:async()=>({message:'方案文件损坏'})});await firstOpen;
  assert.match(get('import-recipe-help').textContent,/方案文件损坏/);
  assert.equal(get('import-start').disabled,true);
  get('import-files').children[0].listeners.click();assert.equal(get('import-start').disabled,false);
  assert.equal(get('import-recipe-field').hidden,true);
  const oldOpen=open.listeners.click();await new Promise(resolve=>setImmediate(resolve));
  const newOpen=open.listeners.click();await new Promise(resolve=>setImmediate(resolve));
  const recipe={id:'component-distillation',version:2,name:'新版方案',sourceKinds:['project']};
  pending[2]({ok:true,json:async()=>[recipe]});await newOpen;
  pending[1]({ok:true,json:async()=>[{...recipe,version:1,name:'过期方案'}]});await oldOpen;
  assert.match(get('import-recipe').children[1].textContent,/新版方案.*2/);
  assert.equal(get('import-recipe-field').hidden,true);
  get('import-folder').listeners.click();assert.equal(get('import-start').disabled,false);
});
