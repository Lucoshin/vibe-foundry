export const assetUseCss = `
.task-context-panel { margin:0 0 24px; padding:20px; border:1px solid var(--line); border-radius:8px; background:var(--content-paper); }
.task-context-panel h2 { margin:0 0 8px; font-size:16px; }
.task-context-panel p { font-size:13px; color:var(--muted); line-height:1.6; }
.task-context-panel label { display:grid; gap:8px; font-size:13px; margin:16px 0; }
.task-context-panel textarea { box-sizing:border-box; width:100%; min-height:76px; padding:10px; border:1px solid var(--line); border-radius:4px; background:var(--paper); color:var(--graphite); font:inherit; resize:vertical; }
.task-context-selection { display:flex; flex-wrap:wrap; gap:8px; }
.task-context-panel button, .asset-use-button, .image-knowledge button { padding:7px 10px; border:1px solid var(--line); border-radius:5px; background:var(--paper); color:var(--graphite); cursor:pointer; font:inherit; font-size:12px; }
.task-context-panel button:disabled { opacity:.5; cursor:default; }
.task-context-panel pre { max-height:320px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; line-height:1.7; }
.asset-use-button { margin:14px 0; }
.image-knowledge img { display:block; width:100%; max-height:420px; object-fit:contain; border:1px solid var(--line); border-radius:5px; background:var(--paper); }
.image-knowledge p, .image-knowledge li { font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
.image-knowledge pre { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.7; }
.image-knowledge small { color:var(--muted); }
.image-knowledge h3 { margin-top:24px; }
`;

export const assetUseJs = String.raw`
const taskContextState = { assetIds: new Set(), goal: '', result: null, message: '', loading: false, revision: 0 };
function invalidateTaskContext() {
  taskContextState.revision += 1;
  taskContextState.result = null;
  taskContextState.loading = false;
  taskContextState.message = '';
}
function toggleTaskContextAsset(id) {
  if (taskContextState.assetIds.has(id)) taskContextState.assetIds.delete(id);
  else if (taskContextState.assetIds.size < 10) taskContextState.assetIds.add(id);
  else { taskContextState.message = '每个上下文包最多选择 10 项资产。'; renderTaskContextPanel(); return; }
  invalidateTaskContext();
  renderTaskContextPanel();
}
function renderAssetUseButton(asset) {
  return '<button type="button" class="asset-use-button" data-task-context-asset="' + escapeHtml(asset.id) + '">' + (taskContextState.assetIds.has(asset.id) ? '从任务上下文移除' : '加入任务上下文') + '</button>';
}
async function generateTaskContext() {
  const revision = taskContextState.revision;
  const input = { goal: taskContextState.goal, assetIds: [...taskContextState.assetIds] };
  taskContextState.loading = true;
  taskContextState.message = '';
  taskContextState.result = null;
  renderTaskContextPanel();
  try {
    const response = await fetch('/api/task-context', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vibe-import-token': document.querySelector('meta[name="vibe-import-token"]').content }, body: JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    if (revision === taskContextState.revision) taskContextState.result = result;
  } catch (error) {
    if (revision === taskContextState.revision) taskContextState.message = error.message;
  } finally {
    if (revision === taskContextState.revision) { taskContextState.loading = false; renderTaskContextPanel(); }
  }
}
function renderTaskContextPanel() {
  const panel = byId('task-context-panel');
  panel.hidden = state.workspace !== 'assets' || taskContextState.assetIds.size === 0;
  if (panel.hidden) { panel.innerHTML = ''; return; }
  const names = [...taskContextState.assetIds].map(id => {
    const asset = state.model.assets.find(item => item.id === id);
    return '<button type="button" data-context-remove="' + escapeHtml(id) + '" aria-label="移除 ' + escapeHtml(asset?.name || id) + '">' + escapeHtml(asset?.name || id) + ' ×</button>';
  }).join('');
  panel.innerHTML = '<h2>用于下一次任务 · ' + taskContextState.assetIds.size + '/10</h2><p>选中知识、写明目标，生成带来源、版本与限制的上下文。生成不会登记为已应用。</p><div class="task-context-selection">' + names + '</div><form data-context-form><label>任务目标<textarea name="goal" required maxlength="4000" placeholder="例如：优化预览加载，保留缓存正确性">' + escapeHtml(taskContextState.goal) + '</textarea></label><button type="submit"' + (taskContextState.loading ? ' disabled' : '') + '>' + (taskContextState.loading ? '正在整理…' : '生成任务上下文') + '</button></form><p role="status" data-context-status>' + escapeHtml(taskContextState.message) + '</p><div data-context-result>' + (taskContextState.result ? '<button type="button" data-context-copy>复制上下文</button><pre>' + escapeHtml(taskContextState.result.markdown) + '</pre>' : '') + '</div>';
  panel.querySelectorAll('[data-context-remove]').forEach(button => { button.onclick = () => { toggleTaskContextAsset(button.dataset.contextRemove); syncAssetUseButtons(); }; });
  panel.querySelectorAll('[data-context-form]').forEach(form => {
    form.onsubmit = event => { event.preventDefault(); taskContextState.goal = form.elements.namedItem('goal').value; generateTaskContext(); };
    form.elements.namedItem('goal').oninput = event => {
      taskContextState.goal = event.target.value;
      invalidateTaskContext();
      panel.querySelector('[data-context-result]').innerHTML = '';
      panel.querySelector('[data-context-status]').textContent = '';
      form.querySelector('button').disabled = false;
      form.querySelector('button').textContent = '生成任务上下文';
    };
  });
  panel.querySelectorAll('[data-context-copy]').forEach(button => { button.onclick = async () => {
    const revision = taskContextState.revision;
    const status = panel.querySelector('[data-context-status]');
    let message;
    try { await navigator.clipboard.writeText(taskContextState.result.markdown); message = '已复制，可交给你的开发代理使用。'; }
    catch { message = '剪贴板不可用，请选择下方内容手动复制。'; }
    if (revision === taskContextState.revision && !panel.hidden && panel.querySelector('[data-context-status]') === status) status.textContent = message;
  }; });
}
function syncAssetUseButtons() {
  document.querySelectorAll('[data-task-context-asset]').forEach(button => { button.textContent = taskContextState.assetIds.has(button.dataset.taskContextAsset) ? '从任务上下文移除' : '加入任务上下文'; });
}
function bindAssetUseActions(scope) {
  scope.querySelectorAll('[data-task-context-asset]').forEach(button => { button.onclick = () => { toggleTaskContextAsset(button.dataset.taskContextAsset); syncAssetUseButtons(); }; });
  scope.querySelectorAll('[data-image-prompt]').forEach(button => { button.onclick = async () => {
    const asset = state.model.assets.find(item => item.id === button.dataset.imageAsset);
    try { await navigator.clipboard.writeText(asset.raw.prompts[Number(button.dataset.imagePrompt)].prompt); button.textContent = '已复制'; }
    catch { button.textContent = '请手动选择下方提示词复制'; }
  }; });
}
function renderImageDetails(asset) {
  if (asset.category !== 'images') return '';
  const raw = asset.raw;
  const aspects = { subject:'主体', composition:'构图', color:'色彩', lighting:'光照', material:'材质', style:'风格特征', medium:'媒介', mood:'氛围', purpose:'用途线索' };
  const evidence = value => value.scope === 'whole-image' ? '全图' : '区域：' + [value.x, value.y, value.width, value.height].join(' / ') + ' 像素（左、上、宽、高）';
  return '<section class="image-knowledge"><img src="/api/image-snapshots/' + encodeURIComponent(raw.sourceDigest) + '" alt="' + escapeHtml(asset.name) + ' 原图" loading="lazy"><p>' + raw.image.width + ' × ' + raw.image.height + ' · ' + escapeHtml(raw.image.format.toUpperCase()) + '</p><h3>视觉观察</h3><ol>' + raw.observations.map(item => '<li><strong>' + escapeHtml(aspects[item.aspect]) + '</strong>：' + escapeHtml(item.text) + '<br><small>' + escapeHtml(evidence(item.evidence)) + '</small></li>').join('') + '</ol><h3>分析推断</h3>' + (raw.inferences.length ? raw.inferences.map(item => '<p>' + escapeHtml(item.text) + '<br><small>依据观察 ' + item.basedOn.map(index => index + 1).join('、') + ' · ' + escapeHtml(item.uncertainty) + '</small></p>').join('') : '<p>未提供推断。</p>') + '<h3>候选提示词 · 未验证</h3><p>视觉重建建议；未执行生图，不代表原始提示词或已还原效果。</p>' + raw.prompts.map((item, index) => '<details open><summary>' + escapeHtml(item.targetModel === 'generic' ? '通用视觉描述' : item.targetModel) + '</summary><button type="button" data-image-prompt="' + index + '" data-image-asset="' + escapeHtml(asset.id) + '">复制候选提示词</button><pre>' + escapeHtml(item.prompt) + '</pre></details>').join('') + '</section>';
}
`;
