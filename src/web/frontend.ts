import { importCss, importHtml, importJs } from './import-frontend.js';

import { webAppCss } from './web-styles.js';
export { webAppCss };

const webAppJs = `
const state = {
  model: null,
  category: 'overview',
  query: '',
  selected: null,
  componentLabelFilter: 'all',
  componentProjectFilter: 'all',
  componentLabelOverrides: {},
  deletedComponentIds: new Set(),
  activePreviewAssetId: null,
  componentPrompts: new Map(),
  componentPromptOpenIds: new Set(),
  detailRenderKey: null,
  returnFocus: null
};
const categoryLabels = {
  overview: '资产总览',
  components: '组件',
  services: '服务',
  business: '业务流程',
  tokens: '设计令牌',
  product: '产品设计',
  metaphors: '文化隐喻',
  reports: '复用报告'
};
const categoryIcons = {
  overview: '<svg class="nav-icon" data-icon="overview" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".72"/><circle cx="7" cy="8" r="1.45" fill="currentColor"/><circle cx="16.5" cy="9.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="16" r="1.1" fill="currentColor"/></svg>',
  components: '<svg class="nav-icon" data-icon="components" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h5v5H6zM13 6h5v5h-5zM6 13h5v5H6zM13 13h5v5h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 8.5h2M8.5 11v2M15.5 11v2M11 15.5h2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></svg>',
  services: '<svg class="nav-icon" data-icon="services" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h5c2.8 0 3.3 3 6 3M7 16h4c3.5 0 3.5-4 7-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="5" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="5" cy="16" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="19" cy="12" r="2.3" fill="currentColor"/></svg>',
  business: '<svg class="nav-icon" data-icon="business" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v4.5M12 14.5V19M8 12H5.5M16 12h2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 3.5 15.5 7 12 10.5 8.5 7zM12 13.5 15.5 17 12 20.5 8.5 17z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="4.8" cy="12" r="1.8" fill="currentColor"/><circle cx="19.2" cy="12" r="1.8" fill="currentColor"/></svg>',
  tokens: '<svg class="nav-icon" data-icon="tokens" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 5.5h5v5h-5zM13.5 5.5h5v5h-5zM5.5 13.5h5v5h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 16h5M14 19h3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><circle cx="16" cy="8" r="1.1" fill="currentColor"/><circle cx="8" cy="16" r="1.1" fill="currentColor"/></svg>',
  product: '<svg class="nav-icon" data-icon="product" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9h8M8 12h5M8 15h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="m15 16 3-3 1 1-3 3h-1z" fill="currentColor"/></svg>',
  metaphors: '<svg class="nav-icon" data-icon="metaphors" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8.5c1.8-2.1 10.2-2.1 12 0v4.1c0 3.7-2.7 6.4-6 7.1-3.3-.7-6-3.4-6-7.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.7 12.1c1.1-.8 2.3-.8 3.1 0M12.2 12.1c.8-.8 2-.8 3.1 0M9.2 16c1.6 1.1 4 1.1 5.6 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M12 5.5v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".74"/></svg>',
  reports: '<svg class="nav-icon" data-icon="reports" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h7l3 3v12H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 4.5v3h3M9.5 16.5h5M9.5 13h6M9.5 9.5h2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 18.5h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></svg>'
};
const metricLabels = {
  total: '资产总数',
  components: '组件',
  services: '服务',
  concepts: '产品资产'
};
function byId(id) { return document.getElementById(id); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function renderLanguageBadge(asset) {
  if (asset.language === 'unknown') return '';
  return '<span class="language-badge" data-language="' + escapeHtml(asset.language) + '" aria-label="编程语言">' +
    escapeHtml(asset.languageLabel || asset.language || 'Unknown') + '</span>';
}
const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5 6.2 14l9.9-9.9 3.8 3.8L10 17.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m14.8 5.4 3.8 3.8M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const deleteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8h11M10 8V5.8h4V8M8.2 8l.7 11h6.2l.7-11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 11.5v4M13.5 11.5v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
function componentStorageKey() {
  return 'vibe-foundry:component-view:v2:' + (state.model?.project?.sourceProject || 'unknown-project');
}
function loadComponentState() {
  localStorage.removeItem('vibe-foundry:component-view:' + (state.model?.project?.sourceProject || 'unknown-project'));
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
function renderPreviewUnavailable() {
  return '<div class="preview-placeholder" role="status"><strong>预览暂不可用</strong><span>查看组件详情中的限制说明，处理后重新炼化。</span></div>';
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
  if (asset.category !== 'components') return '';
  const entry = state.componentPrompts.get(asset.id);
  const ready = entry?.status === 'ready';
  const message = entry?.status === 'error' ? entry.message : entry?.status === 'loading' ? '正在读取提示词…' : '展开后读取此组件的效果描述。';
  return '<details class="component-prompt" data-component-prompt="' + escapeHtml(asset.id) + '"' + (state.componentPromptOpenIds.has(asset.id) ? ' open' : '') + '>' +
    '<summary>效果描述提示词</summary>' +
    '<p class="component-prompt-help">把这个组件的布局、视觉、动效和交互描述成专业需求，复制给 AI 即可使用。</p>' +
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
  return '<section class="runtime-preview" aria-label="真实组件预览"><h3>组件预览</h3><p>' + escapeHtml(labels[preview.status] || preview.status) + '</p>' + renderPreviewScenario(preview) + content + '</section>';
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
  return '<iframe class="runtime-frame preview-workbench-frame' + viewportClass + '" data-preview-frame title="' + escapeHtml(asset.name) + ' 组件预览" src="' + escapeHtml(previewEmbedUrlFor(asset.componentPreview)) + '" loading="eager"></iframe>';
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
  const items = filteredAssets().filter(item => item.category === 'components' && componentPreviewIsBuildable(item.componentPreview));
  const index = items.findIndex(item => item.id === asset.id);
  return {previous:index > 0 ? items[index - 1] : null, next:index >= 0 ? items[index + 1] : null};
}
function renderPreviewNavigation(asset) {
  const neighbors = previewNeighbors(asset);
  return [['previous','上一个','‹'],['next','下一个','›']].map(([direction,label,arrow]) => {
    const target = neighbors[direction];
    return '<button type="button" class="preview-nav preview-nav-' + direction + '" data-preview-neighbor="' + escapeHtml(target?.id || '') + '" aria-label="' + label + '组件" title="' + escapeHtml(target ? label + '：' + target.name : '没有' + label + '组件') + '"' + (target ? '' : ' disabled') + '>' + arrow + '</button>';
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
  return '<section class="detail-card preview-workbench" aria-label="组件预览"><div class="detail-toolbar"><button type="button" data-action="close-detail">← 返回资产列表</button><span>预览工作区</span></div>' +
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
    renderComponentPrompt(asset) +
    '<details class="preview-raw"><summary>查看原始 JSON</summary><pre>' + escapeHtml(JSON.stringify(asset.raw, null, 2)) + '</pre></details>' +
    '</section>';
}
function previewEmbedUrlFor(componentPreview) {
  const url = componentPreview?.contextPreview?.previewUrl || componentPreview?.previewUrl || componentPreview?.browserUrl || '';
  if (!url) return '';
  return url + (url.includes('?') ? '&' : '?') + 'embed=1';
}
function componentAssetById(componentId) {
  return state.model.assets.find((asset) => asset.id === componentId && asset.category === 'components') || null;
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
function visibleComponents() {
  return state.model.assets.filter((asset) =>
    asset.category === 'components' && !state.deletedComponentIds.has(asset.id)
  );
}
function componentFilterMatches(asset) {
  if (asset.category !== 'components') return true;
  if (state.deletedComponentIds.has(asset.id)) return false;
  const labels = componentLabelsFor(asset);
  const labelMatch = state.componentLabelFilter === 'all' || labels.includes(state.componentLabelFilter);
  const projectMatch = state.componentProjectFilter === 'all' || asset.project === state.componentProjectFilter;
  return labelMatch && projectMatch;
}
function filteredAssets() {
  const q = state.query.toLowerCase();
  return state.model.assets.filter((asset) => {
    const categoryMatch = state.category === 'overview' || state.category === 'reports' || asset.category === state.category;
    const searchable = JSON.stringify(asset).toLowerCase() + ' ' + componentLabelsFor(asset).join(' ').toLowerCase();
    const queryMatch = !q || searchable.includes(q);
    return categoryMatch && componentFilterMatches(asset) && queryMatch;
  });
}
function renderFilterOptions(values, selected) {
  return '<option value="all">全部</option>' + values.map((value) =>
    '<option value="' + escapeHtml(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHtml(value) + '</option>'
  ).join('');
}
function renderComponentControls() {
  const controls = byId('component-controls');
  if (state.category !== 'components') {
    controls.hidden = true;
    controls.innerHTML = '';
    return;
  }
  const components = visibleComponents();
  const labels = uniqueValues(components.flatMap((asset) => componentLabelsFor(asset)));
  const projects = uniqueValues(components.map((asset) => asset.project));
  if (state.componentLabelFilter !== 'all' && !labels.includes(state.componentLabelFilter)) {
    state.componentLabelFilter = 'all';
  }
  if (state.componentProjectFilter !== 'all' && !projects.includes(state.componentProjectFilter)) {
    state.componentProjectFilter = 'all';
  }
  controls.hidden = false;
  controls.innerHTML =
    '<label class="control-group"><span>标签</span><select id="component-label-filter" class="control-select" aria-label="按标签分类">' +
    renderFilterOptions(labels, state.componentLabelFilter) +
    '</select></label>' +
    '<label class="control-group"><span>项目</span><select id="component-project-filter" class="control-select" aria-label="按项目分类">' +
    renderFilterOptions(projects, state.componentProjectFilter) +
    '</select></label>' +
    '<span class="component-count">' + components.length + ' 个组件</span>';
  byId('component-label-filter').addEventListener('change', (event) => {
    state.componentLabelFilter = event.target.value;
    state.selected = null;
    state.activePreviewAssetId = null;
    render();
  });
  byId('component-project-filter').addEventListener('change', (event) => {
    state.componentProjectFilter = event.target.value;
    state.selected = null;
    state.activePreviewAssetId = null;
    render();
  });
}
function renderNav() {
  const nav = byId('nav');
  if (!nav.dataset.ready) {
    nav.innerHTML = state.model.categories.map(category => '<button data-category="' + category.id + '"><span class="nav-mark" aria-hidden="true">' + (categoryIcons[category.id] || '') + '</span><span class="nav-label">' + escapeHtml(categoryLabels[category.id] || category.label) + '</span></button>').join('');
    nav.dataset.ready = 'true';
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.dataset.category;
      state.selected = null;
      state.activePreviewAssetId = null;
      state.returnFocus = null;
      render();
    });
  }
  nav.querySelectorAll('[data-category]').forEach(button => {
    const active = state.category === button.dataset.category;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
}
function renderMetrics() {
  const metrics = byId('metrics');
  if (state.category !== 'overview') {
    metrics.hidden = true;
    metrics.innerHTML = '';
    return;
  }
  metrics.hidden = false;
  const counts = state.model.summary.assetCounts || {};
  metrics.innerHTML = [
    [metricLabels.total, state.model.summary.totalAssets],
    [metricLabels.components, counts.components || 0],
    [metricLabels.services, counts.services || 0],
    [metricLabels.concepts, counts.conceptAssets || 0],
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
  const hasThumbnail = asset.category === 'components';
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
    '<p>' + escapeHtml(asset.description === 'Reusable VibeFoundry asset' ? '查看用途、来源与效果描述' : asset.description) + '</p>' +
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
function renderList() {
  const list = byId('asset-list');
  if (state.model.assets.length === 0) {
    list.className = 'asset-list asset-grid';
    list.innerHTML = '<section class="empty-state library-empty"><h2>资产库中还没有资产</h2>' +
      '<p>从一个已有项目开始，提取组件、设计样式和业务模式，积累可复用的资产。</p>' +
      '<p>开始使用：点击页面顶部的“导入炼化”，选择本地项目文件夹或文档。</p>' +
      '<details><summary>也可通过命令行炼化</summary>' +
      '<p>在 VibeFoundry 目录打开终端，运行以下命令，将 &lt;project-root&gt; 替换为你的项目路径。</p>' +
      '<code>node dist/cli.js distill &lt;project-root&gt;</code>' +
      '<p>完成后刷新页面，即可浏览生成的资产。</p></details></section>';
    return;
  }
  if (state.category === 'reports') {
    list.className = 'asset-list report-list';
    list.innerHTML =
      '<section class="report-block"><strong>复用报告</strong>\\n\\n' + escapeHtml(state.model.reports.reuse) + '</section>' +
      '<section class="report-block"><strong>Agent 规则</strong>\\n\\n' + escapeHtml(state.model.reports.rules) + '</section>';
    return;
  }
  list.className = 'asset-list ' + (['tokens', 'services', 'business'].includes(state.category) ? 'asset-rows' : 'asset-grid');
  const assets = filteredAssets();
  if (assets.length === 0) {
    list.innerHTML = '<section class="empty-state">当前视图没有匹配的资产。</section>';
    return;
  }
  reconcileAssetCards(list, assets);
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
  detail.querySelectorAll('[data-action="close-detail"]').forEach(button => button.addEventListener('click', closeDetail));
  detail.querySelectorAll('[data-action="edit-labels"]').forEach(button => button.addEventListener('click', () => editComponentLabels(button.dataset.componentId)));
  detail.querySelectorAll('[data-action="delete-component"]').forEach(button => button.addEventListener('click', () => deleteComponent(button.dataset.componentId)));
}
function renderDetail() {
  const asset = state.selected;
  const detail = byId('asset-detail');
  syncPreviewFocusMode();
  if (!asset) {
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
      '<p class="detail-description">' + escapeHtml(asset.description === 'Reusable VibeFoundry asset' ? '来自已有项目的可复用组件' : asset.description) + '</p>' +
      renderComponentRuntimePreview(asset) + renderComponentPrompt(asset) +
      '<dl><dt>类型</dt><dd>' + escapeHtml(categoryLabels[asset.category] || asset.kind) + '</dd><dt>来源</dt><dd>' + escapeHtml(asset.source) + '</dd><dt>项目</dt><dd>' + escapeHtml(asset.project) + '</dd></dl>' +
      renderComponentLabelChips(asset) + renderAssetTools(asset) +
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
  if (state.model?.isError) { state.selected = null; renderDetail(); renderMissing(); return; }
  syncPreviewFocusMode();
  renderNav();
  renderMetrics();
  renderComponentControls();
  renderList();
  renderDetail();
  byId('project-name').textContent = categoryLabels[state.category];
  byId('project-meta').textContent = state.model.project.sourceProject === 'VibeFoundry Library'
    ? '本地资产库 · 让项目经验持续复用'
    : state.model.project.sourceProject;
}
function startWebApp() {
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
    state.category = 'overview';
    state.query = '';
    state.componentLabelFilter = 'all';
    state.componentProjectFilter = 'all';
    byId('search').value = '';
    render();
  } catch (error) { byId('project-meta').textContent = '炼化已完成，刷新资产列表失败：' + error.message; }
});
byId('sidebar-toggle').addEventListener('click', toggleSidebar);
fetch('/api/assets')
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
  <title>VibeFoundry 资产浏览器</title>
  <style>${webAppCss}${importCss}</style>
</head>
<body>
  <div id="app" class="app">
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="brand-wrap">
          <div class="brand"><span class="brand-mark" aria-hidden="true">VF</span><span class="brand-text">VibeFoundry</span></div>
          <p class="brand-subtitle">让经验成为可复用资产</p>
        </div>
        <button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-expanded="true" aria-controls="nav" title="收起侧边栏">&lt;</button>
      </div>
      <nav id="nav" class="nav" aria-label="资产分类">
        <button class="active"><span class="nav-mark" aria-hidden="true"><svg class="nav-icon" data-icon="overview" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".72"/><circle cx="7" cy="8" r="1.45" fill="currentColor"/><circle cx="16.5" cy="9.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="16" r="1.1" fill="currentColor"/></svg></span><span class="nav-label">资产总览</span></button>
        <button><span class="nav-mark" aria-hidden="true"><svg class="nav-icon" data-icon="reports" viewBox="0 0 24 24"><path d="M7 4.5h7l3 3v12H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 4.5v3h3M9.5 16.5h5M9.5 13h6M9.5 9.5h2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 18.5h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></svg></span><span class="nav-label">复用报告</span></button>
      </nav>
    </aside>
    <main id="main-content" class="main">
      <header class="toolbar">
        <div class="title">
          <h1 id="project-name">VibeFoundry</h1>
          <p id="project-meta">本地资产库</p>
        </div>
        <input id="search" class="search" type="search" placeholder="搜索资产、来源或复用建议">
        <button class="import-open" type="button" data-open-import>导入炼化</button>
      </header>
      <section id="metrics" class="metrics"></section>
      <section id="component-controls" class="component-controls" hidden></section>
      <section id="asset-list" class="asset-list asset-grid"></section>
    </main>
    <aside id="asset-detail" class="detail" aria-label="资产详情" hidden></aside>
  </div>
  ${importHtml}
  <script>${webAppJs}\n${importJs}</script>
</body>
</html>`;
}
