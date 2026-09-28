export const knowledgeCollectionsCss = `
.knowledge-collections { color:var(--graphite); padding:8px 0 32px; }
.knowledge-collections h2 { margin:0 0 12px; font-size:22px; }
.knowledge-collections h3 { margin:0 0 14px; font-size:16px; }
.knowledge-collections p { line-height:1.7; }
.collection-intro, .collection-meta { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.collection-columns { display:grid; grid-template-columns:230px minmax(0,1fr); gap:24px; align-items:start; }
.collection-panel { padding:20px; border:1px solid var(--line); border-radius:8px; background:var(--content-paper); margin-bottom:18px; min-width:0; }
.knowledge-collections button { padding:8px 11px; border:1px solid var(--line); border-radius:5px; background:var(--paper); color:var(--graphite); cursor:pointer; font:inherit; font-size:13px; }
.knowledge-collections button:disabled { opacity:.5; cursor:default; }
.collection-list { display:grid; gap:8px; margin-top:16px; }
.collection-list button { display:grid; gap:6px; text-align:left; overflow-wrap:anywhere; }
.collection-list button[aria-current=true] { border-color:var(--faded-ink); background:var(--content-paper); }
.collection-list small { color:var(--muted); }
.collection-editor { display:grid; gap:14px; }
.collection-editor > label { display:grid; gap:7px; font-size:13px; }
.collection-editor input:not([type=checkbox]), .collection-editor textarea { box-sizing:border-box; width:100%; padding:9px 10px; border:1px solid var(--line); border-radius:5px; background:var(--paper); color:var(--graphite); font:inherit; }
.collection-editor textarea { min-height:76px; resize:vertical; }
.collection-choices { max-height:300px; overflow:auto; border:1px solid var(--line); border-radius:5px; }
.collection-choice { display:flex; gap:10px; align-items:flex-start; padding:12px; border-bottom:1px solid var(--line); font-size:13px; }
.collection-choice:last-child { border-bottom:0; }
.collection-choice span { display:grid; gap:4px; min-width:0; }
.collection-choice small, .collection-choice code { color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
.collection-choice[hidden] { display:none; }
.collection-evidence { border-left:2px solid var(--line); margin:12px 0; padding-left:14px; }
.collection-evidence blockquote { margin:4px 0; white-space:pre-wrap; font-size:13px; line-height:1.7; }
.collection-relation { padding:18px 0; border-top:1px solid var(--line); }
.collection-relation h4 { margin:0 0 8px; line-height:1.7; font-size:14px; }
.collection-errors { color:#a33732; font-size:13px; overflow-wrap:anywhere; }
.collection-status { min-height:22px; font-size:13px; }
.knowledge-collections code { overflow-wrap:anywhere; font-size:11px; }
@media(max-width:800px) { .collection-columns { grid-template-columns:1fr; gap:12px; } .collection-panel { padding:16px; } }
`;

export const knowledgeCollectionsJs = String.raw`
const collectionUi = { selectedId: null, epoch: 0 };
async function collectionRequest(path, body) {
  const options = { method: body === undefined ? 'GET' : 'POST', headers: { 'x-vibe-import-token': document.querySelector('meta[name="vibe-import-token"]').content } };
  if (body !== undefined) { options.headers['content-type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch('/api/knowledge-collections' + path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.message);
  return value;
}
function collectionErrorsHtml(errors) {
  return errors.length ? '<div class="collection-errors" role="alert">' + errors.map(error => '<p>' + escapeHtml(error.sourceId || error.id || '') + ' ' + escapeHtml(error.message) + '</p>').join('') + '</div>' : '';
}
function collectionEditorHtml(record, assets) {
  const selected = new Set(record ? record.assetIds : []);
  const unavailable = record ? record.assetIds.filter(id => !assets.some(asset => asset.id === id)) : [];
  const choices = assets.map(asset => '<label class="collection-choice" data-collection-choice data-search="' + escapeHtml([asset.name, asset.sourceName, asset.kind, asset.id].join(' ').toLowerCase()) + '"><input type="checkbox" name="assetId" value="' + escapeHtml(asset.id) + '"' + (selected.has(asset.id) ? ' checked' : '') + '><span>' + escapeHtml(asset.name) + '<small>' + escapeHtml(asset.sourceName) + ' · ' + escapeHtml(asset.kind) + '</small><code>' + escapeHtml(asset.id) + '</code></span></label>').join('');
  const missing = unavailable.map(id => '<label class="collection-choice" data-collection-choice data-search="' + escapeHtml(id.toLowerCase()) + '"><input type="checkbox" name="assetId" value="' + escapeHtml(id) + '" checked><span>当前无法读取；取消勾选可移出集合<code>' + escapeHtml(id) + '</code></span></label>').join('');
  return '<section class="collection-panel"><h3>' + (record ? '编辑集合' : '新建集合') + '</h3><form class="collection-editor" data-collection-form><label>名称<input name="name" required maxlength="160" value="' + escapeHtml(record?.name || '') + '"></label><label>说明<textarea name="description" maxlength="4000">' + escapeHtml(record?.description || '') + '</textarea></label><label>筛选资产<input type="search" data-collection-filter placeholder="名称、来源或精确 ID"></label><div class="collection-choices">' + choices + missing + (!assets.length && !missing ? '<p>资产库暂无可选资产，请先导入材料。</p>' : '') + '</div><p class="collection-meta">选择 1–100 项。相同名称按来源和精确 ID 区分；这里只保存引用，原资产更新会在下次查看时呈现。</p><button type="submit"' + (!assets.length && !missing ? ' disabled' : '') + '>保存集合</button><div class="collection-status" data-collection-status role="status"></div></form></section>';
}
function collectionRelationsHtml(result) {
  const label = endpoint => endpoint.status === 'available' ? endpoint.name : '端点无法读取：' + endpoint.reference;
  return '<section class="collection-panel"><h3>已有关系与证据</h3>' + collectionErrorsHtml(result.errors) + result.selected.filter(item => item.status !== 'available').map(item => '<p class="collection-errors">成员当前无法读取：<code>' + escapeHtml(item.assetId) + '</code></p>').join('') +
    (result.relations.length ? result.relations.map(edge => '<article class="collection-relation"><h4>' + escapeHtml(label(edge.from)) + ' → ' + escapeHtml(label(edge.to)) + '</h4><p>' + escapeHtml(edge.type) + ' · ' + (edge.basis === 'explicit' ? '材料明示' : '分析解释') + (edge.status === 'broken' ? ' · 断链' : '') + '</p><p>' + escapeHtml(edge.description) + '</p><p class="collection-meta">' + escapeHtml(edge.sourceName) + ' · <code>' + escapeHtml(edge.sourceId) + '</code><br>版本：<code>' + escapeHtml(edge.revision) + '</code></p>' + edge.evidence.map(item => '<div class="collection-evidence"><blockquote>' + escapeHtml(item.quote) + '</blockquote><small class="collection-meta">' + escapeHtml(JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'quote')))) + '</small></div>').join('') + '<details><summary>精确关系与端点身份</summary><p><code>' + escapeHtml(edge.id) + '</code></p><p><code>' + escapeHtml(edge.from.assetId || edge.from.reference) + '</code> → <code>' + escapeHtml(edge.to.assetId || edge.to.reference) + '</code></p></details></article>').join('') : '<p>尚无可读取的已有关系。集合成员不会自动产生关系。</p>') + result.limitations.map(value => '<p class="collection-meta">' + escapeHtml(value) + '</p>').join('') + '</section>';
}
function bindCollectionWorkbench(container, record, epoch) {
  const active = () => epoch === collectionUi.epoch && state.workspace === 'collections';
  container.querySelectorAll('[data-collection-open]').forEach(button => { button.onclick = () => renderCollectionWorkbench(button.dataset.collectionOpen); });
  container.querySelectorAll('[data-collection-new]').forEach(button => { button.onclick = () => renderCollectionWorkbench(null); });
  container.querySelectorAll('[data-collection-form]').forEach(form => {
    form.querySelector('[data-collection-filter]').oninput = event => {
      const query = event.target.value.trim().toLowerCase();
      form.querySelectorAll('[data-collection-choice]').forEach(row => { row.hidden = !row.dataset.search.includes(query); });
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('button[type=submit]');
      const status = form.querySelector('[data-collection-status]');
      const assetIds = [...form.querySelectorAll('input[name=assetId]:checked')].map(input => input.value);
      if (assetIds.length < 1 || assetIds.length > 100) { status.textContent = '请选择 1–100 项资产。'; return; }
      button.disabled = true;
      status.textContent = '正在保存…';
      const input = { ...(record ? { id: record.id } : {}), name: form.elements.namedItem('name').value, description: form.elements.namedItem('description').value, assetIds };
      try {
        const saved = await collectionRequest('', input);
        if (active()) await renderCollectionWorkbench(saved.id);
      } catch (error) { if (active()) { status.textContent = error.message; button.disabled = false; } }
    };
  });
}
async function renderCollectionWorkbench(id = collectionUi.selectedId) {
  if (state.workspace !== 'collections') return;
  collectionUi.selectedId = id;
  const epoch = ++collectionUi.epoch;
  const active = () => epoch === collectionUi.epoch && state.workspace === 'collections';
  const container = byId('collections-workbench');
  container.innerHTML = '<section class="knowledge-collections"><h2>集合</h2><p role="status">正在读取集合与资产引用…</p></section>';
  try {
    const [list, catalog] = await Promise.all([collectionRequest(''), collectionRequest('/assets')]);
    if (!active()) return;
    const record = id ? await collectionRequest('/item?id=' + encodeURIComponent(id)) : null;
    if (!active()) return;
    const relations = record ? await collectionRequest('/relations', { assetIds: record.assetIds }) : null;
    if (!active()) return;
    const items = list.collections.map(item => '<button type="button" data-collection-open="' + escapeHtml(item.id) + '" aria-current="' + (item.id === id) + '">' + escapeHtml(item.name) + '<small>' + item.assetIds.length + ' 项资产</small></button>').join('');
    container.innerHTML = '<section class="knowledge-collections"><h2>集合</h2><p class="collection-intro">把不同来源的知识放在一起。保留各自身份，从已有关系回查证据。</p>' + collectionErrorsHtml([...list.errors, ...catalog.errors]) + '<div class="collection-columns"><aside><button type="button" data-collection-new>新建集合</button><nav class="collection-list" aria-label="知识集合">' + (items || '<p class="collection-meta">尚无集合。选择资产，保存第一个主题。</p>') + '</nav></aside><div>' + collectionEditorHtml(record, catalog.assets) + (relations ? collectionRelationsHtml(relations) : '') + '</div></div></section>';
    bindCollectionWorkbench(container, record, epoch);
  } catch (error) {
    if (!active()) return;
    container.innerHTML = '<section class="knowledge-collections"><h2>集合暂时无法读取</h2><p class="collection-errors" role="alert">' + escapeHtml(error.message) + '</p><button type="button" data-collection-new>返回集合</button></section>';
    bindCollectionWorkbench(container, null, epoch);
  }
}
`;
