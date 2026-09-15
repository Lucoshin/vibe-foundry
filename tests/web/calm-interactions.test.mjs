import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { renderWebAppHtml } from '../../dist/web/frontend.js';

function element(tagName = 'div', markup = '') {
  const node = {
    tagName, markup, children: [], parentElement: null, dataset: {}, attributes: {},
    className: '', hidden: false, insertions: 0,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    matches(selector) {
      if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
      if (selector === '[data-asset-id]') return Boolean(this.dataset.assetId);
      if (selector === '[data-preview-stage]') return this.dataset.previewStage !== undefined;
      if (selector.startsWith('[data-action=')) return this.dataset.action === selector.slice(14, -2);
      return this.tagName === selector;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    },
    remove() {
      if (!this.parentElement) return;
      const siblings = this.parentElement.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    },
    insertBefore(child, before) {
      child.remove();
      const index = before ? this.children.indexOf(before) : this.children.length;
      assert.ok(index >= 0, 'insertion reference must remain attached');
      this.children.splice(index, 0, child);
      child.parentElement = this;
      child.insertions += 1;
      return child;
    },
    moveBefore(child, before) { return this.insertBefore(child, before); },
    insertAdjacentHTML(position, html) {
      const child = rawElement(html);
      this.insertBefore(child, position === 'afterbegin' ? this.children[0] : null);
    },
  };
  node.classList = { toggle(name, active) {
    const classes = new Set(node.className.split(/\s+/).filter(Boolean));
    if (active) classes.add(name); else classes.delete(name);
    node.className = [...classes].join(' ');
  } };
  Object.defineProperties(node, {
    firstElementChild: { get() { return this.children[0] || null; } },
    nextElementSibling: { get() {
      const siblings = this.parentElement?.children || [];
      return siblings[siblings.indexOf(this) + 1] || null;
    } },
    innerHTML: {
      get() { return this.children.map(child => child.outerHTML).join(''); },
      set(html) {
        for (const child of [...this.children]) child.remove();
        this.markup = '';
        for (const part of html.match(/<article\b[\s\S]*?<\/article>/g) || (html ? [html] : [])) {
          this.insertBefore(rawElement(part), null);
        }
      },
    },
    outerHTML: { get() {
      if (this.markup) return this.markup;
      const attributes = Object.entries({ ...this.attributes, class: this.className,
        ...Object.fromEntries(Object.entries(this.dataset).map(([key, value]) => ['data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value])),
      }).map(([name, value]) => ` ${name}="${value}"`).join('');
      return `<${this.tagName}${attributes}>${this.innerHTML}</${this.tagName}>`;
    } },
  });
  return node;
}

function rawElement(html) {
  const node = element(html.match(/^<([\w-]+)/)?.[1] || 'span', html);
  node.className = html.match(/^<[^>]+class="([^"]*)"/)?.[1] || '';
  const assetId = html.match(/^<[^>]+data-asset-id="([^"]*)"/)?.[1];
  if (assetId) node.dataset.assetId = assetId;
  if (/^<[^>]+data-preview-stage/.test(html)) node.dataset.previewStage = '';
  const action = html.match(/^<[^>]+data-action="([^"]*)"/)?.[1];
  if (action) node.dataset.action = action;
  const stage = html.match(/<div class="preview-stage"(?: data-preview-stage)?>[\s\S]*?<\/div>/)?.[0];
  if (stage && !node.matches('.preview-stage')) node.insertBefore(rawElement(stage), null);
  const thumbnail = html.match(/<div class="component-thumbnail">[\s\S]*?<\/div>/)?.[0];
  if (thumbnail && !node.matches('.component-thumbnail')) node.insertBefore(rawElement(thumbnail), null);
  else if (node.tagName !== 'iframe' && (!stage || node.matches('.preview-stage'))) {
    const frame = html.match(/<iframe\b[^>]*><\/iframe>/)?.[0];
    if (frame) node.insertBefore(element('iframe', frame), null);
  }
  if (node.matches('.component-thumbnail')) {
    const button = element('button');
    button.className = 'component-thumbnail-open';
    node.insertBefore(button, null);
  }
  return node;
}

function harness() {
  const script = renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1];
  const elements = new Map();
  function get(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }
  const context = vm.createContext({ document: { getElementById: get, querySelectorAll: () => [], createElement: element }, window: {} });
  const marker = script.indexOf('\nfunction startWebApp()');
  assert.ok(marker > 0, 'initialization must be separate from view functions');
  vm.runInContext(script.slice(0, marker), context);
  vm.runInContext(`state.model = { assets: [{id:'one', name:'Button', category:'components', language:'tsx', languageLabel:'TSX', source:'src/Button.tsx', project:'demo', raw:{}, labels:[], componentPreview:{status:'pending',buildable:true,browserUrl:'/component-preview/one/'}}], reports:{reuse:'',rules:''}, categories:[],summary:{totalAssets:1,assetCounts:{components:1}} };`, context);
  return { context, get };
}

test('list shows a real thumbnail without selecting an asset, and selection retains the list', () => {
  const { context, get } = harness();
  vm.runInContext('renderList()', context);
  assert.equal(vm.runInContext('state.selected', context), null);
  assert.match(get('asset-list').innerHTML, /<iframe[^>]+class="component-thumbnail-frame"/);
  assert.match(get('asset-list').innerHTML, /loading="lazy"/);
  const list = get('asset-list').innerHTML;
  vm.runInContext("selectAsset('one')", context);
  assert.equal(get('asset-list').innerHTML, list);
  assert.doesNotMatch(get('asset-detail').innerHTML, /<iframe/);
  vm.runInContext("showComponentPreview('one')", context);
  assert.ok(get('asset-detail').querySelector('iframe'));
  const detail = get('asset-detail').innerHTML;
  vm.runInContext('renderDetail()', context);
  assert.equal(get('asset-detail').innerHTML, detail);
  vm.runInContext('closeDetail()', context);
  assert.equal(get('asset-detail').hidden, true);
  assert.equal(get('asset-list').innerHTML, list);
});

test('every buildable card has a native lazy preview, including cards after the sixth', () => {
  const { context, get } = harness();
  vm.runInContext(`const component = state.model.assets[0]; state.model.assets = Array.from({length:10},(_,i)=>({...component,id:'asset'+i})); renderList();`, context);
  assert.equal((get('asset-list').innerHTML.match(/<iframe/g) || []).length, 10);
  vm.runInContext(`state.model.assets[0].componentPreview = {status:'blocked',buildable:false}; renderList();`, context);
  assert.equal((get('asset-list').innerHTML.match(/<iframe/g) || []).length, 9);
  assert.match(get('asset-list').innerHTML, /预览暂不可用/);
});

test('search updates only the list and leaves an open preview untouched', () => {
  const { context, get } = harness();
  vm.runInContext("showComponentPreview('one')", context);
  get('asset-detail').innerHTML = 'retained frame';
  vm.runInContext("updateSearch('missing')", context);
  assert.match(get('asset-list').innerHTML, /没有匹配/);
  assert.equal(get('asset-detail').innerHTML, 'retained frame');
});

test('search retains matching cards and their live thumbnails without detaching them', () => {
  const { context, get } = harness();
  vm.runInContext(`
    const original = state.model.assets[0];
    state.model.assets = ['甲号组件', '乙号组件', '丙号组件'].map((name, index) => ({...original, id:String(index), name,
      componentPreview:{...original.componentPreview, actionDigest:'a'.repeat(64)}}));
    renderList();
  `, context);
  const list = get('asset-list');
  const beta = list.children[1];
  const frame = beta.querySelector('iframe');
  const insertions = beta.insertions;
  for (const query of ['乙', '乙号', '乙号组', '乙号组件']) {
    vm.runInContext(`updateSearch('${query}')`, context);
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0], beta);
    assert.equal(beta.querySelector('iframe'), frame);
    assert.equal(beta.insertions, insertions, 'retained card must never be reinserted');
    assert.equal(beta.parentElement, list);
  }
  vm.runInContext("updateSearch('')", context);
  assert.deepEqual(list.children.map(card => card.dataset.assetId), ['0', '1', '2']);
  assert.equal(list.children[1], beta);
  assert.equal(beta.querySelector('iframe'), frame);
  assert.equal(beta.insertions, insertions);
});

test('card metadata updates preserve its thumbnail while an action change replaces the frame', () => {
  const { context, get } = harness();
  vm.runInContext("state.model.assets[0].componentPreview.actionDigest = 'a'.repeat(64); renderList()", context);
  const card = get('asset-list').children[0];
  const frame = card.querySelector('iframe');
  vm.runInContext("state.model.assets[0].description = '新描述'; renderList()", context);
  assert.equal(get('asset-list').children[0], card);
  assert.equal(card.querySelector('iframe'), frame);
  assert.match(card.innerHTML, /新描述/);
  vm.runInContext("state.model.assets[0].componentPreview.actionDigest = 'b'.repeat(64); renderList()", context);
  assert.equal(get('asset-list').children[0], card);
  assert.notEqual(card.querySelector('iframe'), frame);
});

test('all component preview states retain the same thumbnail region', () => {
  const { context, get } = harness();
  vm.runInContext("state.model.assets[0].componentPreview.actionDigest = 'a'.repeat(64); renderList()", context);
  const card = get('asset-list').children[0];
  const thumbnail = card.querySelector('.component-thumbnail');
  const frame = thumbnail.querySelector('iframe');
  for (const status of ['building', 'validating', 'ready', 'retrying']) {
    vm.runInContext(`state.model.assets[0].componentPreview.status = '${status}'; renderList()`, context);
    assert.equal(card.querySelector('.component-thumbnail'), thumbnail);
    assert.equal(thumbnail.querySelector('iframe'), frame);
  }
  vm.runInContext("state.model.assets[0].componentPreview = {status:'blocked',buildable:false,blockers:['Cached component preview build failure: BUILD_ERROR']}; renderList()", context);
  assert.equal(card.querySelector('.component-thumbnail'), thumbnail);
  assert.equal(thumbnail.querySelector('iframe'), null);
  assert.match(thumbnail.innerHTML, /预览暂不可用/);
  assert.doesNotMatch(thumbnail.innerHTML, /Cached|BUILD_ERROR/);
  vm.runInContext("state.model.assets[0].componentPreview = null; renderList()", context);
  assert.equal(card.querySelector('.component-thumbnail'), thumbnail);
  assert.equal(thumbnail.querySelector('iframe'), null);
});

test('later cards retain fixed thumbnail containers and use lazy loading', () => {
  const { context, get } = harness();
  vm.runInContext("const component = state.model.assets[0]; state.model.assets = Array.from({length:10},(_,i)=>({...component,id:'asset'+i})); renderList()", context);
  const cards = get('asset-list').children;
  assert.equal(cards.filter(card => card.querySelector('.component-thumbnail')).length, 10);
  assert.equal(cards.filter(card => card.querySelector('iframe')).length, 10);
  assert.match(cards[9].innerHTML, /loading="lazy"/);
});

test('a blocked preview keeps its workbench and scroll position while replacing only the canvas content', () => {
  const { context, get } = harness();
  vm.runInContext("showComponentPreview('one')", context);
  const detail = get('asset-detail');
  const workbench = detail.children[0];
  const stage = detail.querySelector('.preview-stage');
  assert.ok(stage);
  const frame = stage.querySelector('iframe');
  detail.scrollTop = 47;
  for (const status of ['building', 'validating', 'ready']) {
    vm.runInContext(`state.selected.componentPreview.status = '${status}'; renderDetail()`, context);
    assert.equal(detail.children[0], workbench);
    assert.equal(stage.querySelector('iframe'), frame);
    assert.equal(detail.scrollTop, 47);
  }
  vm.runInContext("state.selected.componentPreview = {status:'blocked',buildable:false,blockers:['BUILD_ERROR']}; renderDetail()", context);
  assert.match(get('app').className, /preview-focused/);
  assert.equal(detail.children[0], workbench);
  assert.equal(detail.querySelector('.preview-stage'), stage);
  assert.equal(stage.querySelector('iframe'), null);
  assert.match(stage.innerHTML, /预览暂不可用/);
  assert.equal(detail.scrollTop, 47);
});

test('context preview uses its real parent URL and labels the substituted scene',()=>{
 const {context,get}=harness();
 vm.runInContext("state.model.assets[0].componentPreview.contextPreview={name:'Crontab',previewUrl:'/component-preview/parent/'}; renderList(); showComponentPreview('one');",context);
 assert.match(get('asset-list').innerHTML,/完整场景：Crontab/);
 assert.ok(get('asset-list').innerHTML.includes('src="/component-preview/parent/?embed=1"'));
 assert.ok(get('asset-detail').innerHTML.includes('/component-preview/parent/'));
});

test('enlarging a loaded thumbnail retains the exact iframe and returns it to its card',()=>{
 const {context,get}=harness(); vm.runInContext('renderList()',context);
 const thumbnail=get('asset-list').children[0].querySelector('.component-thumbnail');
 const frame=thumbnail.querySelector('iframe'); frame.previewState={edited:'保留编辑'};
 vm.runInContext("showComponentPreview('one')",context);
 assert.equal(get('asset-detail').querySelector('iframe'),frame);
 assert.equal(thumbnail.querySelector('iframe'),null);
 assert.equal(frame.previewState.edited,'保留编辑');
 vm.runInContext('closeDetail()',context);
 assert.equal(thumbnail.querySelector('iframe'),frame);
});

test('preview navigation follows filtered order, skips blocked assets and stops at boundaries',()=>{
 const {context,get}=harness();
 vm.runInContext("const base=state.model.assets[0]; state.model.assets=[{...base,id:'a',name:'目标 A'},{...base,id:'blocked',name:'目标 blocked',componentPreview:{status:'blocked',buildable:false}},{...base,id:'other',name:'其他'},{...base,id:'b',name:'目标 B'}]; state.query='目标'; renderList(); showComponentPreview('a');",context);
 assert.equal(vm.runInContext('previewNeighbors(state.selected).previous',context),null);
 assert.equal(vm.runInContext('previewNeighbors(state.selected).next.id',context),'b');
 const firstFrame=get('asset-detail').querySelector('iframe');
 vm.runInContext("showComponentPreview(previewNeighbors(state.selected).next.id)",context);
 assert.equal(vm.runInContext('state.selected.id',context),'b');
 assert.equal(vm.runInContext('previewNeighbors(state.selected).next',context),undefined);
 assert.equal(get('asset-list').children[0].querySelector('iframe'),firstFrame);
 assert.match(get('asset-detail').innerHTML,/下一个组件[^>]*disabled/);
});
