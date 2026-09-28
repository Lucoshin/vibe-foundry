import { learningWorkbenchJs, learningWorkbenchCss } from './learning-frontend.js';
import { assetUseJs, assetUseCss } from './asset-use-frontend.js';
import {conversationWorkbenchJs,conversationWorkbenchCss} from './conversation-frontend.js';
import {creatorWorkbenchJs} from './creator-frontend.js';
import {promptWorkbenchJs,promptWorkbenchCss} from './prompt-frontend.js';
import {imageEditJs,imageEditCss} from './image-edit-frontend.js';
import {knowledgeCollectionsJs,knowledgeCollectionsCss} from './knowledge-collections-frontend.js';
import { queryAssets } from '../application/asset-catalog.js';
import { importCss, importHtml, importJs } from './import-frontend.js';

import { webAppCss } from './web-styles.js';
export { webAppCss };

const webAppJs = `
const state = {
  model: null,
  workspace: 'assets',
  kindFilter: '',
  sourceFilter: '',
  languageFilter: '',
  query: '',
  assetPage: 0,
  assetPageFilterKey: '',
  selected: null,
  componentLabelOverrides: {},
  deletedComponentIds: new Set(),
  activePreviewAssetId: null,
  componentPrompts: new Map(),
  componentPromptOpenIds: new Set(),
  detailRenderKey: null,
  returnFocus: null
};
const categoryLabels = {
  components: '组件',
  pages: '完整页面',
  services: '服务',
  business: '业务流程',
  tokens: '设计令牌',
  product: '产品设计',
  metaphors: '文化隐喻',
  knowledge: '知识资产',
  images: '图片知识'
};
const workspaceLabels = {assets:'资产库',sources:'来源库',learning:'学习任务',applications:'应用记录',recipes:'炼化方案',prompts:'提示词',collections:'集合与关系'};
const sharedQueryAssets = ${queryAssets.toString()};
const metricLabels = {
  total: '资产总数',
  components: '组件',
  services: '服务'
};
function byId(id) { return document.getElementById(id); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function renderLanguageBadge(asset) {
  if (!asset.language || asset.language === 'unknown') return '';
  return '<span class="language-badge" data-language="' + escapeHtml(asset.language) + '" aria-label="编程语言">' +
    escapeHtml(asset.languageLabel || asset.language || 'Unknown') + '</span>';
}
const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5 6.2 14l9.9-9.9 3.8 3.8L10 17.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m14.8 5.4 3.8 3.8M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const deleteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8h11M10 8V5.8h4V8M8.2 8l.7 11h6.2l.7-11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 11.5v4M13.5 11.5v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
function componentStorageKey() {
  return 'vibehub:component-view:v2:' + (state.model?.project?.sourceProject || 'unknown-project');
}
function loadComponentState() {
  localStorage.removeItem('vibehub:component-view:' + (state.model?.project?.sourceProject || 'unknown-project'));
  const stored = localStorage.getItem(componentStorageKey());
  if (!stored) return;
  const parsed = JSON.parse(stored);
  state.componentLabelOverrides = parsed.componentLabelOverrides || {};
  state.deletedComponentIds = new Set(parsed.deletedComponentIds || []);
}
function saveComponentState() {
  localStorage.setItem(componentStorageKey(), JSON.stringify({
    componentLabelOverrides: state.componentLabelOverrides,
    deletedComponentIds: Array.from(state.deletedComponentIds)
  }));
}
function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
function componentLabelsFor(asset) {
  if (asset.category !== 'components') return [];
  return state.componentLabelOverrides[asset.id] || asset.labels || [];
}
function parseLabelInput(value) {
  return uniqueValues(String(value).split(/[,，、]/).map((label) => label.trim()));
}
function renderComponentLabelChips(asset) {
  const labels = componentLabelsFor(asset).filter(label => label.toLowerCase() !== String(asset.languageLabel).toLowerCase());
  if (labels.length === 0) return '';
  return '<div class="component-labels">' + labels.map((label) =>
    '<span class="component-label">' + escapeHtml(label) + '</span>'
  ).join('') + '</div>';
}
function renderAssetTools(asset) {
  if (asset.category !== 'components') return '';
  return '<details class="asset-menu"><summary>更多操作</summary><div class="asset-card-tools">' +
    '<button class="asset-action" type="button" data-action="edit-labels" data-component-id="' + escapeHtml(asset.id) + '" aria-label="编辑标签">' + editIcon + '编辑标签</button>' +
    '<button class="asset-action danger" type="button" data-action="delete-component" data-component-id="' + escapeHtml(asset.id) + '" aria-label="从视图移除">' + deleteIcon + '从视图移除</button>' +
    '</div></details>';
}
function componentPreviewIsBuildable(componentPreview) {
  return Boolean(componentPreview && componentPreview.status !== 'blocked' && componentPreview.buildable !== false);
}
function isVisualAsset(asset) {
  return asset.category === 'components' || asset.category === 'pages';
}
function renderPreviewUnavailable() {
  return '<div class="preview-placeholder" role="status"><strong>预览暂不可用</strong><span>查看资产详情中的限制说明，处理后重新炼化。</span></div>';
}
function renderComponentThumbnailContent(asset) {
  const url = previewEmbedUrlFor(asset.componentPreview);
  if (!componentPreviewIsBuildable(asset.componentPreview) || !url) return renderPreviewUnavailable();
  const content = '<iframe class="component-thumbnail-frame" title="' + escapeHtml(asset.name) + ' 缩略预览" src="' + escapeHtml(url) + '" loading="lazy" tabindex="-1" aria-hidden="true" inert></iframe>';
  return content + (asset.componentPreview.contextPreview ? '<span class="preview-context-label">完整场景：' + escapeHtml(asset.componentPreview.contextPreview.name) + '</span>' : '') + '<button type="button" class="component-thumbnail-open" data-action="show-component-preview" data-component-id="' + escapeHtml(asset.id) + '" aria-label="放大 ' + escapeHtml(asset.name) + ' 预览">' + '放大预览' + '</button>';
}
function renderComponentThumbnail(asset) {
  return '<div class="component-thumbnail">' + renderComponentThumbnailContent(asset) + '</div>';
}
function renderComponentPrompt(asset) {
  if (!isVisualAsset(asset)) return '';
  const entry = state.componentPrompts.get(asset.id);
  const ready = entry?.status === 'ready';
  const message = entry?.status === 'error' ? entry.message : entry?.status === 'loading' ? '正在读取提示词…' : '展开后读取此组件的效果描述。';
  return '<details class="component-prompt" data-component-prompt="' + escapeHtml(asset.id) + '"' + (state.componentPromptOpenIds.has(asset.id) ? ' open' : '') + '>' +
    '<summary>效果描述提示词</summary>' +
    '<p class="component-prompt-help">把这个' + (asset.category === 'pages' ? '页面' : '组件') + '的布局、视觉、动效和交互描述成专业需求，复制给 AI 即可使用。</p>' +
    (ready ? '<pre class="component-effect-text" tabindex="0">' + escapeHtml(entry.record.prompt) + '</pre>' : '<p data-prompt-load-status>' + escapeHtml(message) + '</p>') +
    '<button class="preview-tool" type="button" data-action="copy-component-prompt" data-component-id="' + escapeHtml(asset.id) + '"' + (ready ? '' : ' disabled') + '>复制提示词</button>' +
    '<p data-prompt-copy-status role="status" aria-live="polite"></p>' +
    (ready ? '<details class="component-prompt-evidence"><summary>生成依据与待核对项</summary>' +
      '<h4>分析依据文件列表</h4>' + (entry.record.sourceFiles.length ? '<ul>' + entry.record.sourceFiles.map((filePath) => '<li>' + escapeHtml(filePath) + '</li>').join('') + '</ul>' : '<p>没有可用的文本依据文件。</p>') +
      '<h4>待核对项</h4>' + (entry.record.unresolved.length ? '<ul>' + entry.record.unresolved.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>' : '<p>没有记录待核对项。</p>') + '</details>' : '') +
    '</details>';
}
function renderComponentPromptPanel(assetId) {
  const detail = byId('asset-detail');
  const panel = detail.querySelector('[data-component-prompt]');
  if (!panel || panel.dataset.componentPrompt !== assetId) return;
  panel.outerHTML = renderComponentPrompt(componentAssetById(assetId));
  bindComponentPromptActions(detail);
}
function loadComponentPrompt(assetId) {
  const existing = state.componentPrompts.get(assetId);
  if (existing) return existing.promise;
  const entry = { status: 'loading', record: null, message: '', promise: null };
  state.componentPrompts.set(assetId, entry);
  entry.promise = Promise.resolve()
    .then(() => fetch('/api/component-prompt/' + encodeURIComponent(assetId)))
    .then(async (response) => {
      const record = await response.json();
      if (!response.ok) throw new Error(record.message);
      if (typeof record.prompt !== 'string' || !record.prompt) throw new Error('组件提示词内容无效，请重新炼化。');
      entry.status = 'ready';
      entry.record = record;
      return record;
    })
    .catch((error) => {
      entry.status = 'error';
      entry.message = error.message;
      throw error;
    })
    .finally(() => {
      if (state.selected?.id === assetId) renderComponentPromptPanel(assetId);
    });
  return entry.promise;
}
async function copyComponentPrompt(assetId, status) {
  const entry = state.componentPrompts.get(assetId);
  if (entry?.status !== 'ready') return;
  status.textContent = '正在复制…';
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable.');
    await navigator.clipboard.writeText(entry.record.prompt);
    status.textContent = '已复制提示词';
  } catch {
    status.textContent = '复制失败，请手动选择上方文本复制。';
  }
}
function bindComponentPromptActions(scope) {
  scope.querySelectorAll('[data-component-prompt]').forEach((panel) => {
    panel.addEventListener('toggle', () => {
      const assetId = panel.dataset.componentPrompt;
      if (!panel.open) {
        state.componentPromptOpenIds.delete(assetId);
        return;
      }
      state.componentPromptOpenIds.add(assetId);
      const status = panel.querySelector('[data-prompt-load-status]');
      if (!state.componentPrompts.has(assetId) && status) status.textContent = '正在读取提示词…';
      loadComponentPrompt(assetId).catch(() => {});
    });
  });
  scope.querySelectorAll('[data-action="copy-component-prompt"]').forEach((button) => {
    button.addEventListener('click', () => {
      const status = button.closest('[data-component-prompt]').querySelector('[data-prompt-copy-status]');
      copyComponentPrompt(button.dataset.componentId, status);
    });
  });
}
function renderPreviewScenario(preview) {
  if (preview?.contextPreview) return '<p class="preview-scenario">完整调用场景：' + escapeHtml(preview.contextPreview.name) + '（当前组件的入参由父组件提供）</p>';
  if (!preview?.scenario) return '';
  const props = preview.scenario.props || {};
  return '<p class="preview-scenario">源调用场景' + (props.iconOnly === true ? ' · 仅图标模式' : '') + '</p><details><summary>场景入参</summary><p>' + escapeHtml(preview.scenario.sourceFile || '') + '</p><pre>' + escapeHtml(JSON.stringify(props, null, 2)) + '</pre></details>';
}
function renderComponentRuntimePreview(asset) {
  const preview = asset.componentPreview;
  if (!preview) return '';
  const labels = {ready:'预览已验证',pending:'正在准备预览',building:'正在生成预览',validating:'预览已生成',retrying:'等待重试',degraded:'预览尚未验证',blocked:'预览不可用'};
  const content = componentPreviewIsBuildable(preview)
    ? '<button class="runtime-preview-button" type="button" data-action="show-component-preview" data-component-id="' + escapeHtml(asset.id) + '">打开预览</button>'
    : '<p>' + (preview.blockers || []).map(escapeHtml).join('；') + '</p>';
  return '<section class="runtime-preview" aria-label="真实预览"><h3>' + (asset.category === 'pages' ? '页面预览' : '组件预览') + '</h3><p>' + escapeHtml(labels[preview.status] || preview.status) + '</p>' + renderPreviewScenario(preview) + content + '</section>';
}
const previewStageViews = new WeakMap();
let borrowedPreview = null;
function restoreThumbnailPreview() {
  if (!borrowedPreview) return;
  const {frame, container} = borrowedPreview;
  container.moveBefore(frame, container.firstElementChild);
  frame.className = 'component-thumbnail-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.inert = true;
  borrowedPreview = null;
}
function borrowThumbnailPreview(asset) {
  const card = [...byId('asset-list').children].find(card => card.dataset.assetId === asset.id);
  const container = card?.querySelector('.component-thumbnail');
  const frame = container?.querySelector('iframe');
  if (frame?.contentDocument?.querySelector('[data-vibe-preview-canvas]')) borrowedPreview = {assetId:asset.id, frame, container};
}
function mountBorrowedPreview(detail) {
  if (!borrowedPreview) return;
  const stage = detail.querySelector('[data-preview-stage]');
  const frame = borrowedPreview.frame;
  stage.moveBefore(frame, null);
  frame.className = 'runtime-frame preview-workbench-frame';
  frame.setAttribute('loading', 'eager');
  frame.setAttribute('aria-hidden', 'false');
  frame.setAttribute('tabindex', '0');
  frame.setAttribute('data-preview-frame', '');
  frame.inert = false;
}
function previewStageKeyFor(asset) {
  const url = previewEmbedUrlFor(asset.componentPreview);
  return componentPreviewIsBuildable(asset.componentPreview) && url
    ? JSON.stringify([asset.componentPreview.actionDigest, url]) : 'unavailable';
}
function renderPreviewStageContent(asset) {
  if (previewStageKeyFor(asset) === 'unavailable') return renderPreviewUnavailable();
  if (borrowedPreview?.assetId === asset.id) return '';
  const viewportClass = /Mobile$/i.test(asset.name) ? ' preview-mobile-frame' : '';
  return '<iframe class="runtime-frame preview-workbench-frame' + viewportClass + '" data-preview-frame title="' + escapeHtml(asset.name) + ' 预览" src="' + escapeHtml(previewEmbedUrlFor(asset.componentPreview)) + '" loading="eager"></iframe>';
}
function updatePreviewStage(detail, asset) {
  const stage = detail.querySelector('[data-preview-stage]');
  const key = previewStageKeyFor(asset);
  if (previewStageViews.get(stage) === key) return;
  stage.innerHTML = renderPreviewStageContent(asset);
  previewStageViews.set(stage, key);
  detail.querySelectorAll('[data-action="refresh-preview"]').forEach(button => { button.disabled = key === 'unavailable'; });
  detail.querySelectorAll('[data-preview-open]').forEach(link => {
    link.hidden = key === 'unavailable';
    if (!link.hidden) link.href = previewEmbedUrlFor(asset.componentPreview);
  });
}
function previewNeighbors(asset) {
  const items = filteredAssets().filter(item => isVisualAsset(item) && componentPreviewIsBuildable(item.componentPreview));
  const index = items.findIndex(item => item.id === asset.id);
  return {previous:index > 0 ? items[index - 1] : null, next:index >= 0 ? items[index + 1] : null};
}
function renderPreviewNavigation(asset) {
  const neighbors = previewNeighbors(asset);
  return [['previous','上一个','‹'],['next','下一个','›']].map(([direction,label,arrow]) => {
    const target = neighbors[direction];
    return '<button type="button" class="preview-nav preview-nav-' + direction + '" data-preview-neighbor="' + escapeHtml(target?.id || '') + '" aria-label="' + label + '组件" title="' + escapeHtml(target ? label + '：' + target.name : '没有' + label + '资产') + '"' + (target ? '' : ' disabled') + '>' + arrow + '</button>';
  }).join('');
}
function renderPreviewWorkbench(asset) {
  const componentPreview = asset.componentPreview;
  const frameUrl = previewEmbedUrlFor(componentPreview);
  const available = previewStageKeyFor(asset) !== 'unavailable';
  const stage = '<div class="preview-stage" data-preview-stage>' + renderPreviewStageContent(asset) + '</div>';
  const openLink = available
    ? '<a class="preview-tool" data-preview-open href="' + escapeHtml(frameUrl) + '" target="_blank" rel="noreferrer">独立打开</a>'
    : '';
  return '<section class="detail-card preview-workbench" aria-label="资产预览"><div class="detail-toolbar"><button type="button" data-action="close-detail">← 返回资产列表</button><span>预览工作区</span></div>' +
    '<div class="preview-workbench-head">' +
    '<div>' +
    '<div class="detail-title-row"><h2>' + escapeHtml(asset.name) + '</h2>' + renderLanguageBadge(asset) + '</div>' +
    renderComponentLabelChips(asset) +
    '</div>' +
    '<div class="preview-workbench-actions">' +
    '<button class="preview-tool" type="button" data-action="refresh-preview"' + (available ? '' : ' disabled') + '>刷新预览</button>' +
    openLink +
    '</div>' +
    '</div>' +
    renderPreviewScenario(componentPreview) + '<div class="preview-navigation-stage">' + stage + renderPreviewNavigation(asset) + '</div>' +
    '<div class="preview-context">' +
    '<dl>' +
    '<dt>类型</dt><dd>' + escapeHtml(asset.kind) + '</dd>' +
    '<dt>语言</dt><dd>' + escapeHtml(asset.languageLabel) + '</dd>' +
    '<dt>来源</dt><dd>' + escapeHtml(asset.source || '生成的资产包') + '</dd>' +
    '<dt>运行环境</dt><dd>' + escapeHtml(componentPreview?.runtime || 'unknown') + '</dd>' +
    '</dl>' +
    '</div>' +
    renderPageDetails(asset) + renderComponentPrompt(asset) +
    '<details class="preview-raw"><summary>查看原始 JSON</summary><pre>' + escapeHtml(JSON.stringify(asset.raw, null, 2)) + '</pre></details>' +
    '</section>';
}
function previewEmbedUrlFor(componentPreview) {
  const url = componentPreview?.contextPreview?.previewUrl || componentPreview?.previewUrl || componentPreview?.browserUrl || '';
  if (!url) return '';
  return url + (url.includes('?') ? '&' : '?') + 'embed=1';
}
function componentAssetById(componentId) {
  return state.model.assets.find((asset) => asset.id === componentId && isVisualAsset(asset)) || null;
}
function selectAsset(id, origin) {
  restoreThumbnailPreview();
  const asset = state.model.assets.find(candidate => candidate.id === id);
  if (!asset) return;
  state.returnFocus = origin || state.returnFocus;
  state.selected = asset;
  state.activePreviewAssetId = null;
  renderDetail();
  syncSelection();
}
function showComponentPreview(componentId, origin) {
  const asset = componentAssetById(componentId);
  if (!asset || !componentPreviewIsBuildable(asset.componentPreview)) return;
  state.returnFocus = origin || state.returnFocus;
  state.selected = asset;
  restoreThumbnailPreview();
  borrowThumbnailPreview(asset);
  state.activePreviewAssetId = asset.id;
  renderDetail();
  syncSelection();
}
function closeDetail() {
  restoreThumbnailPreview();
  const selectedIndex = filteredAssets().findIndex(asset => asset.id === state.selected?.id);
  if (selectedIndex >= 0 && state.assetPage !== Math.floor(selectedIndex / 24)) {
    state.assetPage = Math.floor(selectedIndex / 24);
    renderList();
  }
  state.selected = null;
  state.activePreviewAssetId = null;
  renderDetail();
  syncSelection();
  state.returnFocus?.focus({ preventScroll: true });
  state.returnFocus = null;
}
function syncSelection() {
  document.querySelectorAll('[data-asset-id]').forEach(card => card.classList.toggle('active', card.dataset.assetId === state.selected?.id));
}
function updateSearch(query) {
  state.query = query;
  renderList();
}
function bindComponentPreviewActions(scope) {
  scope.querySelectorAll('[data-action="show-component-preview"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      showComponentPreview(button.dataset.componentId, button);
    });
  });
}
function bindPreviewWorkbenchActions(scope) {
  scope.querySelectorAll('[data-preview-neighbor]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.previewNeighbor) showComponentPreview(button.dataset.previewNeighbor);
    });
  });
  scope.querySelectorAll('[data-action="refresh-preview"]').forEach((button) => {
    button.addEventListener('click', () => {
      const frame = scope.querySelector('[data-preview-frame]');
      if (frame?.src) {
        frame.src = frame.src;
      }
    });
  });
}
function syncPreviewFocusMode() {
  const app = byId('app');
  const focused = state.selected && state.selected.id === state.activePreviewAssetId;
  app.classList.toggle('preview-focused', Boolean(focused));
  byId('main-content').inert = Boolean(focused);
}
function filteredAssets() {
  const assets = state.model.assets.filter(asset => !state.deletedComponentIds.has(asset.id));
  return sharedQueryAssets(assets, {query:state.query,kind:state.kindFilter,sourceId:state.sourceFilter,language:state.languageFilter});
}
function renderComponentControls() {
  const controls = byId('component-controls');
  controls.hidden = false;
  const assets = state.model.assets;
  const options = (items,selected) => '<option value="">全部</option>' + items.map(([value,label])=>'<option value="'+escapeHtml(value)+'"'+(value===selected?' selected':'')+'>'+escapeHtml(label)+'</option>').join('');
  const kindNames = {'component':'组件','page':'完整页面','service':'服务','business-pattern':'业务流程','design-token':'设计令牌','concept':'概念','metaphor':'隐喻','worldview':'世界观','character':'人物','setting':'设定','decision':'决策','principle':'原则','lesson':'经验','requirement':'需求','constraint':'约束'};
  controls.innerHTML = '<label class="control-group">产物类型<select id="asset-kind-filter" class="control-select">'+options(uniqueValues(assets.map(a=>a.kind)).map(k=>[k,kindNames[k]||k]),state.kindFilter)+'</select></label>' +
    '<label class="control-group">来源<select id="asset-source-filter" class="control-select">'+options((state.model.sources||[]).map(source=>[source.id,source.name]),state.sourceFilter)+'</select></label>' +
    '<label class="control-group">开发语言<select id="asset-language-filter" class="control-select">'+options(uniqueValues(assets.map(a=>a.language).filter(l=>l&&l!=='unknown')).map(l=>[l,l]),state.languageFilter)+'</select></label>' +
    '<span class="component-count">'+filteredAssets().length+' / '+assets.length+' 项资产</span>';
  for(const [id,key] of [['asset-kind-filter','kindFilter'],['asset-source-filter','sourceFilter'],['asset-language-filter','languageFilter']]) {
    byId(id).addEventListener('change',event=>{state[key]=event.target.value;state.selected=null;state.activePreviewAssetId=null;render();});
  }
}
function renderNav() {
  const nav=byId('nav');
  if(!nav.dataset.ready) {
    nav.innerHTML=Object.entries(workspaceLabels).map(([id,label])=>'<button data-workspace="'+id+'"><span class="nav-mark" aria-hidden="true">'+({assets:'◫',sources:'▤',learning:'↗',applications:'↺',recipes:'⚙',prompts:'✎',collections:'▦'}[id])+'</span><span class="nav-label">'+label+'</span></button>').join('');
    nav.dataset.ready='true';
    nav.addEventListener('click',event=>{const button=event.target.closest('[data-workspace]');if(!button)return;state.workspace=button.dataset.workspace;state.selected=null;state.activePreviewAssetId=null;state.returnFocus=null;render();});
  }
  nav.querySelectorAll('[data-workspace]').forEach(button=>{const active=button.dataset.workspace===state.workspace;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
}
function renderMetrics() {
  const metrics = byId('metrics');
  metrics.hidden = false;
  const counts = state.model.summary.assetCounts || {};
  metrics.innerHTML = [
    [metricLabels.total, state.model.summary.totalAssets],
    [metricLabels.components, counts.components || 0],
    ['完整页面', state.model.assets.filter(a=>a.category==='pages').length],
    [metricLabels.services, counts.services || 0],
    ['知识资产', state.model.assets.filter(a=>a.category==='knowledge').length],
  ].map(([label, value]) =>
    '<section class="metric"><strong>' + value + '</strong><span>' + label + '</span></section>'
  ).join('');
}
const assetCardViews = new WeakMap();
function updateAssetCard(card, asset) {
  card.className = 'asset-card' + (state.selected?.id === asset.id ? ' active' : '');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', '查看 ' + asset.name + ' 详情');
  const previous = assetCardViews.get(card);
  const hasThumbnail = isVisualAsset(asset);
  const available = hasThumbnail && componentPreviewIsBuildable(asset.componentPreview) && previewEmbedUrlFor(asset.componentPreview);
  const thumbnailKey = hasThumbnail ? JSON.stringify([available ? 'frame' : 'unavailable', available ? asset.componentPreview.actionDigest : null, available ? previewEmbedUrlFor(asset.componentPreview) : null]) : '';
  if (previous?.thumbnailKey !== thumbnailKey) {
    const existingThumbnail = card.querySelector('.component-thumbnail');
    if (!hasThumbnail) existingThumbnail?.remove();
    else if (existingThumbnail) existingThumbnail.innerHTML = renderComponentThumbnailContent(asset);
    else card.insertAdjacentHTML('afterbegin', renderComponentThumbnail(asset));
  }
  const thumbnail = card.querySelector('.component-thumbnail');
  if (thumbnail) {
    thumbnail.querySelector('iframe')?.setAttribute('title', asset.name + ' 缩略预览');
    thumbnail.querySelector('.component-thumbnail-open')?.setAttribute('aria-label', '放大 ' + asset.name + ' 预览');
  }
  const content = '<div class="asset-card-header"><h2>' + escapeHtml(asset.name) + '</h2></div>' +
    '<p>' + escapeHtml(asset.description === 'Reusable VibeHub asset' ? '查看用途、来源与效果描述' : asset.description) + '</p>' +
    renderPageSummary(asset) +
    '<div class="asset-meta"><span class="tag">' + escapeHtml(categoryLabels[asset.category] || asset.kind) + '</span>' + renderLanguageBadge(asset) + '</div>' +
    '<div class="asset-source" title="' + escapeHtml(asset.source) + '">' + escapeHtml(asset.project || asset.source) + '</div>';
  if (previous?.content !== content) {
    for (const child of [...card.children]) {
      if (!child.matches('.component-thumbnail')) child.remove();
    }
    card.insertAdjacentHTML('beforeend', content);
  }
  assetCardViews.set(card, { thumbnailKey, content });
}
function reconcileAssetCards(list, assets) {
  const wantedIds = new Set(assets.map(asset => asset.id));
  const cards = new Map();
  for (const card of [...list.children]) {
    if (wantedIds.has(card.dataset.assetId)) cards.set(card.dataset.assetId, card);
    else card.remove();
  }
  let nextCard = list.firstElementChild;
  for (const asset of assets) {
    let card = cards.get(asset.id);
    if (card) {
      nextCard = card.nextElementSibling;
    } else {
      card = document.createElement('article');
      card.dataset.assetId = asset.id;
      list.insertBefore(card, nextCard);
    }
    updateAssetCard(card, asset);
  }
}
function changeAssetPage(page) {
  state.assetPage = page;
  renderList();
}
function renderAssetPagination(total) {
  const pager = byId('asset-pagination');
  const pages = Math.ceil(total / 24);
  pager.hidden = state.workspace !== 'assets' || pages <= 1;
  pager.innerHTML = pages <= 1 ? '' : '<button data-asset-page="' + (state.assetPage - 1) + '" ' + (state.assetPage === 0 ? 'disabled' : '') + '>上一页</button><span aria-live="polite">第 ' + (state.assetPage + 1) + ' / ' + pages + ' 页 · ' + total + ' 项</span><button data-asset-page="' + (state.assetPage + 1) + '" ' + (state.assetPage === pages - 1 ? 'disabled' : '') + '>下一页</button>';
  pager.onclick = event => {
    const button = event.target.closest('[data-asset-page]');
    if (button && !button.disabled) changeAssetPage(Number(button.dataset.assetPage));
  };
}
function renderList() {
  const list = byId('asset-list');
  const filterKey = JSON.stringify([state.query, state.kindFilter, state.sourceFilter, state.languageFilter]);
  if (filterKey !== state.assetPageFilterKey) { state.assetPage = 0; state.assetPageFilterKey = filterKey; }
  if (state.model.assets.length === 0) {
    renderAssetPagination(0);
    list.className = 'asset-list asset-grid';
    list.innerHTML = '<section class="empty-state library-empty"><h2>资产库中还没有资产</h2>' +
      '<p>导入已有项目或书籍，也可以进入学习任务，炼化对话与实践中的知识。</p>' +
      '<p>开始使用：点击页面顶部的“导入炼化”，选择本地项目文件夹或文档。</p>' +
      '<details><summary>也可通过命令行炼化</summary>' +
      '<p>在 VibeHub 目录打开终端，运行以下命令，将 &lt;project-root&gt; 替换为你的项目路径。</p>' +
      '<code>node dist/cli.js distill &lt;project-root&gt;</code>' +
      '<p>完成后刷新页面，即可浏览生成的资产。</p></details></section>';
    return;
  }
  list.className = 'asset-list ' + (['design-token', 'service', 'business-pattern'].includes(state.kindFilter) ? 'asset-rows' : 'asset-grid');
  const assets = filteredAssets();
  state.assetPage = Math.max(0, Math.min(state.assetPage, Math.ceil(assets.length / 24) - 1));
  renderAssetPagination(assets.length);
  if (assets.length === 0) {
    list.innerHTML = '<section class="empty-state">当前视图没有匹配的资产。</section>';
    return;
  }
  reconcileAssetCards(list, assets.slice(state.assetPage * 24, (state.assetPage + 1) * 24));
  list.onclick = event => {
    const preview = event.target.closest('[data-action="show-component-preview"]');
    if (preview) { showComponentPreview(preview.dataset.componentId, preview); return; }
    const card = event.target.closest('[data-asset-id]');
    if (card) selectAsset(card.dataset.assetId, card);
  };
  list.onkeydown = event => {
    if (event.target.matches('[data-asset-id]') && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      selectAsset(event.target.dataset.assetId, event.target);
    }
  };
}
function editComponentLabels(componentId) {
  const asset = state.model.assets.find((candidate) => candidate.id === componentId);
  if (!asset || asset.category !== 'components') return;
  const currentLabels = componentLabelsFor(asset);
  const value = window.prompt('编辑标签，用逗号分隔', currentLabels.join(', '));
  if (value === null) return;
  state.componentLabelOverrides[componentId] = parseLabelInput(value);
  saveComponentState();
  state.detailRenderKey = null;
  render();
}
function deleteComponent(componentId) {
  const asset = state.model.assets.find((candidate) => candidate.id === componentId);
  const name = asset?.name || '该组件';
  if (!window.confirm('确认从当前视图删除「' + name + '」组件？')) {
    return;
  }
  state.deletedComponentIds.add(componentId);
  if (state.selected?.id === componentId) {
    state.selected = null;
  }
  if (state.activePreviewAssetId === componentId) {
    state.activePreviewAssetId = null;
  }
  saveComponentState();
  state.detailRenderKey = null;
  render();
}
function bindDetailActions(detail) {
  bindAssetUseActions(detail);
  bindLearningMemoryActions(detail);
  bindImageEditActions(detail);
  detail.querySelectorAll('[data-action="close-detail"]').forEach(button => button.addEventListener('click', closeDetail));
  detail.querySelectorAll('[data-action="edit-labels"]').forEach(button => button.addEventListener('click', () => editComponentLabels(button.dataset.componentId)));
  detail.querySelectorAll('[data-action="delete-component"]').forEach(button => button.addEventListener('click', () => deleteComponent(button.dataset.componentId)));
}
function knowledgeBasisLabel(value) {
  if (value === 'explicit') return '原文明示';
  if (value === 'interpretation') return '分析解读';
  return value;
}
function renderKnowledgeDetails(asset) {
  if(asset.category !== 'knowledge') return '';
  const facets = asset.raw.facets || [];
  const evidence = asset.evidence || [];
  const relations = asset.relations || [];
  const nameFor = id => state.model.assets.find(a=>a.id===id || a.sourceId===asset.sourceId && a.raw?.id===id)?.name || id;
  return '<section class="knowledge-detail"><h3>知识与依据</h3>' +
    (asset.raw.recipeId ? '<p>炼化方案：'+escapeHtml(asset.raw.recipeId)+' · v'+escapeHtml(asset.raw.recipeVersion)+'<br>结果版本：'+escapeHtml(asset.raw.resultId)+'</p>' : '') +
    (asset.raw.basis ? '<p>依据类型：'+escapeHtml(knowledgeBasisLabel(asset.raw.basis))+'</p>':'') +
    facets.map(f=>'<p><strong>'+escapeHtml(f.name)+'</strong> · '+escapeHtml(f.value)+' <small>'+escapeHtml(knowledgeBasisLabel(f.basis))+'</small></p>').join('')+
    evidence.map(e=>'<blockquote>'+escapeHtml(e.quote)+'<footer>'+escapeHtml(e.entryId || e.unitId)+(e.startLine?' · 第 '+e.startLine+' 行':'')+'</footer></blockquote>').join('')+
    (relations.length?'<h3>关联链路</h3>'+relations.map(r=>'<p>'+escapeHtml(nameFor(r.from))+' → '+escapeHtml(r.type)+' → '+escapeHtml(nameFor(r.to))+'<br>'+escapeHtml(r.description)+' · '+escapeHtml(knowledgeBasisLabel(r.basis))+ (r.evidence||[]).map(e=>'<blockquote>'+escapeHtml(e.quote)+'<footer>'+escapeHtml(e.entryId||e.unitId)+(e.startLine?' · 第 '+e.startLine+' 行':'')+'</footer></blockquote>').join('')+'</p>').join(''):'')+
    '<p class="muted">来源引用不等于结论已被验证。</p></section>';
}
function renderPageSummary(asset) {
  if (asset.category !== 'pages') return '';
  const page = asset.raw;
  return '<div class="page-summary"><p><code>' + escapeHtml(page.route) + '</code></p>' +
    '<p>' + page.blocks.length + ' 个组成区块 · ' + page.states.length + ' 个条件状态</p>' +
    '</div>';
}
function renderPageDetails(asset) {
  if (asset.category !== 'pages') return '';
  const page = asset.raw;
  const location = value => '第 ' + escapeHtml(value.line) + ' 行，第 ' + escapeHtml(value.column) + ' 列';
  return '<section class="page-detail"><h3>页面结构与源码</h3>' +
    '<dl><dt>页面路由</dt><dd><code>' + escapeHtml(page.route) + '</code></dd>' +
    '<dt>页面文件</dt><dd><code>' + escapeHtml(page.filePath) + '</code></dd></dl>' +
    '<h3>组成区块</h3><p class="muted">列出页面实际导入并使用的组件；页面内未拆成组件的内容仍保留在页面源码中。</p>' +
    (page.blocks.length ? '<ul>' + page.blocks.map(block => '<li><strong>' + escapeHtml(block.name) + '</strong><br><code>' + escapeHtml(block.filePath) + '</code><br><small>页面调用位置：' + location(block.sourceLocation) + '</small></li>').join('') + '</ul>' : '<p>未识别到已导入的组件区块。</p>') +
    '<h3>模板条件状态</h3><p class="muted">以下为源码中的显示条件，尚未逐一验证运行效果。</p>' +
    (page.states.length ? '<ul>' + page.states.map(item => '<li><code>' + escapeHtml(item.directive) + (item.expression ? ': ' + escapeHtml(item.expression) : '') + '</code><br><small>' + location(item.sourceLocation) + '</small></li>').join('') + '</ul>' : '<p>未识别到模板条件状态。</p>') +
    '<h3>运行限制</h3><ul>' + page.limitations.map(value => '<li>' + escapeHtml(value) + '</li>').join('') + '</ul></section>';
}
function renderDetail() {
  const asset = state.selected;
  const detail = byId('asset-detail');
  syncPreviewFocusMode();
  if (!asset) {
    restoreThumbnailPreview();
    detail.hidden = true;
    detail.innerHTML = '';
    state.detailRenderKey = null;
    return;
  }
  const preview = state.activePreviewAssetId === asset.id;
  const key = asset.id + ':' + (preview ? 'preview' : 'detail');
  detail.hidden = false;
  if (state.detailRenderKey === key) {
    if (preview) { mountBorrowedPreview(detail); updatePreviewStage(detail, asset); }
    return;
  }
  state.detailRenderKey = key;
  detail.scrollTop = 0;
  if (preview) {
    detail.innerHTML = renderPreviewWorkbench(asset);
    mountBorrowedPreview(detail);
    previewStageViews.set(detail.querySelector('[data-preview-stage]'), previewStageKeyFor(asset));
    bindPreviewWorkbenchActions(detail);
  } else {
    detail.innerHTML = '<section class="detail-card">' +
      '<div class="detail-toolbar"><span>资产详情</span><button type="button" data-action="close-detail" aria-label="关闭详情">关闭</button></div>' +
      '<div class="detail-title-row"><h2>' + escapeHtml(asset.name) + '</h2>' + renderLanguageBadge(asset) + '</div>' +
      '<p class="detail-description">' + escapeHtml(asset.description === 'Reusable VibeHub asset' ? '来自已有项目的可复用组件' : asset.description) + '</p>' +
      renderComponentRuntimePreview(asset) + renderComponentPrompt(asset) +
      '<dl><dt>类型</dt><dd>' + escapeHtml(categoryLabels[asset.category] || asset.kind) + '</dd><dt>来源</dt><dd>' + escapeHtml(asset.source) + '</dd><dt>项目</dt><dd>' + escapeHtml(asset.project) + '</dd></dl>' +
      (asset.raw.duplicateSources?.length ? '<section><h3>已合并的相同实现</h3><p>源码与依赖一致，保留以下来源及使用场景。</p><ul>' + asset.raw.duplicateSources.map(item => '<li>' + escapeHtml(item.filePath) + '</li>').join('') + '</ul></section>' : '') +
      renderPageDetails(asset) + renderImageDetails(asset) + renderImageEditButton(asset) + renderCreatorDetails(asset) + renderKnowledgeDetails(asset) + renderLearningMemoryAction(asset) + renderAssetUseButton(asset) + renderComponentLabelChips(asset) + renderAssetTools(asset) +
      '<details class="preview-raw"><summary>查看原始 JSON</summary><pre>' + escapeHtml(JSON.stringify(asset.raw, null, 2)) + '</pre></details></section>';
    bindComponentPreviewActions(detail);
  }
  bindComponentPromptActions(detail);
  bindDetailActions(detail);
}
function toggleSidebar() {
  const app = byId('app');
  const toggle = byId('sidebar-toggle');
  const collapsed = !app.classList.contains('sidebar-collapsed');
  app.classList.toggle('sidebar-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.textContent = collapsed ? '>' : '<';
  toggle.title = collapsed ? '展开侧边栏' : '收起侧边栏';
}
function renderMissing() {
  byId('asset-list').innerHTML = '<section class="empty-state"><h2>资产暂时无法读取</h2><p>' + escapeHtml(state.model?.message || '集中资产库中没有找到对应资产包。') + '</p></section>';
}
function render() {
  learningRenderEpoch += 1;
  promptWorkspaceState.epoch += 1;
  collectionUi.epoch += 1;
  const catalogFailed = Boolean(state.model?.isError);
  if (catalogFailed) { state.selected = null; state.activePreviewAssetId = null; }
  syncPreviewFocusMode();
  renderNav();
  if (catalogFailed) {
    byId('task-context-panel').hidden = true;
    byId('task-context-panel').innerHTML = '';
    byId('project-meta').textContent = '';
  } else renderTaskContextPanel();
  const libraryErrors = catalogFailed ? [{ message: state.model.message }] : state.model.errors || [];
  byId('library-errors').hidden = libraryErrors.length === 0;
  byId('library-errors').innerHTML = libraryErrors.map(error=>'<p>来源读取失败：'+escapeHtml(error.sourceId || error.assetPackageDir || '')+' · '+escapeHtml(error.message)+'</p>').join('');
  const isAssets = state.workspace === 'assets';
  byId('asset-list').hidden = !isAssets;
  byId('asset-pagination').hidden = !isAssets;
  byId('workbench-content').hidden = isAssets;
  byId('search').hidden = !isAssets;
  byId('project-name').textContent = workspaceLabels[state.workspace];
  if (catalogFailed && !['prompts', 'collections', 'recipes'].includes(state.workspace)) {
    byId('metrics').hidden = true;
    byId('component-controls').hidden = true;
    byId('asset-pagination').hidden = true;
    byId('search').hidden = true;
    renderDetail();
    renderMissing();
    if (!isAssets) byId('workbench-content').innerHTML = byId('asset-list').innerHTML;
    return;
  }
  if (!isAssets) {
    byId('metrics').hidden = true;
    byId('component-controls').hidden = true;
    renderDetail();
    if(state.workspace==='prompts') { byId('workbench-content').innerHTML='<section id="prompt-workbench"></section>';renderPromptWorkbench(); }
    else if(state.workspace==='collections') { byId('workbench-content').innerHTML='<section id="collections-workbench"></section>';renderCollectionWorkbench(); }
    else renderLearningWorkbench(state.workspace);
    return;
  }
  renderMetrics();
  renderComponentControls();
  renderList();
  renderDetail();
  byId('project-name').textContent = workspaceLabels[state.workspace];
  byId('project-meta').textContent = state.model.project.sourceProject === 'VibeHub Library'
    ? '从实践中学习，让知识投入下一次实践'
    : state.model.project.sourceProject;
}
${learningWorkbenchJs}
${assetUseJs}
${conversationWorkbenchJs}
${creatorWorkbenchJs}
${promptWorkbenchJs}
${imageEditJs}
${knowledgeCollectionsJs}
function startWebApp() {
document.addEventListener('vibehub:image-revised',async event=>{
  const previousSelection=state.selected;
  try {
    const response=await fetch('/api/assets?scope=library');if(!response.ok)throw new Error('资产列表读取失败');
    state.model=await response.json();
    if(state.workspace==='assets'&&state.selected===previousSelection)state.selected=state.model.assets.find(asset=>asset.id===event.detail.id)||null;
    state.detailRenderKey=null;render();
  }catch(error){byId('library-errors').hidden=false;byId('library-errors').textContent=error.message;}
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.selected && !document.querySelector('dialog[open]')) closeDetail();
});
window.addEventListener('vibe-import-complete', async () => {
  try {
    const response = await fetch('/api/assets?scope=library');
    if (!response.ok) throw new Error('资产列表读取失败');
    state.model = await response.json();
    state.selected = null;
    state.activePreviewAssetId = null;
    state.detailRenderKey = null;
    state.componentPrompts.clear();
    state.componentPromptOpenIds.clear();
    state.query = '';
    state.kindFilter = '';
    state.sourceFilter = '';
    state.languageFilter = '';
    byId('search').value = '';
    render();
  } catch (error) { byId('project-meta').textContent = '炼化已完成，刷新资产列表失败：' + error.message; }
});
byId('sidebar-toggle').addEventListener('click', toggleSidebar);
fetch('/api/assets?scope=library')
  .then((response) => response.json())
  .then((model) => {
    state.model = model;
    loadComponentState();
    byId('search').addEventListener('input', (event) => {
      updateSearch(event.target.value);
    });
    render();
  })
  .catch(error => { byId('project-meta').textContent = '读取资产失败：' + error.message; });
}
startWebApp();
`;

export function renderWebAppHtml({ importToken = '' } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="vibe-import-token" content="${importToken}">
  <title>VibeHub 资产浏览器</title>
  <style>${webAppCss}${importCss}${learningWorkbenchCss}${assetUseCss}${conversationWorkbenchCss}${promptWorkbenchCss}${imageEditCss}${knowledgeCollectionsCss}</style>
</head>
<body>
  <div id="app" class="app">
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="brand-wrap">
          <div class="brand"><span class="brand-mark" aria-hidden="true">VH</span><span class="brand-text">VibeHub</span></div>
          <p class="brand-subtitle">让经验成为可复用资产</p>
        </div>
        <button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-expanded="true" aria-controls="nav" title="收起侧边栏">&lt;</button>
      </div>
      <nav id="nav" class="nav" aria-label="工作区"><button class="active">资产库</button></nav>
    </aside>
    <main id="main-content" class="main">
      <header class="toolbar">
        <div class="title">
          <h1 id="project-name">VibeHub</h1>
          <p id="project-meta">本地资产库</p>
        </div>
        <input id="search" class="search" type="search" placeholder="搜索资产、来源或复用建议">
        <button class="import-open" type="button" data-open-import>导入炼化</button>
      </header>
      <section id="library-errors" role="status" hidden></section>
      <section id="metrics" class="metrics"></section>
      <section id="component-controls" class="component-controls" hidden></section>
      <section id="task-context-panel" class="task-context-panel" aria-label="任务上下文" hidden></section>
      <nav id="asset-pagination" class="asset-pagination" aria-label="资产分页" hidden></nav>
      <section id="asset-list" class="asset-list asset-grid"></section>
      <section id="workbench-content" hidden></section>
    </main>
    <aside id="asset-detail" class="detail" aria-label="资产详情" hidden></aside>
  </div>
  ${importHtml}
  <script>${webAppJs}\n${importJs}</script>
</body>
</html>`;
}
