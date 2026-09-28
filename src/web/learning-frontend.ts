export const learningWorkbenchCss = `
.learning-workbench { width:100%; min-width:0; padding:8px 0 32px; color:var(--graphite); }
.learning-workbench h2 { margin:0 0 10px; font-size:22px; }
.learning-workbench h3 { margin:0 0 12px; font-size:16px; }
.learning-workbench p { line-height:1.7; }
.learning-workbench .learning-intro { color:var(--muted); font-size:13px; margin:0 0 22px; }
.learning-message { min-height:24px; white-space:pre-wrap; color:var(--faded-ink); font-size:13px; margin-bottom:12px; overflow-wrap:anywhere; }
.learning-message[data-error="true"] { color:#a33732; }
.learning-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr)); gap:20px; align-items:start; }
.learning-panel { border:1px solid var(--line); border-radius:8px; padding:22px; margin-bottom:20px; background:var(--content-paper); min-width:0; }
.learning-workbench form { display:grid; gap:14px; }
.learning-workbench label { display:grid; gap:7px; font-size:13px; }
.learning-workbench input:not([type=checkbox]), .learning-workbench textarea, .learning-workbench select { box-sizing:border-box; width:100%; min-width:0; padding:9px 11px; border:1px solid var(--line); border-radius:5px; font:inherit; color:var(--graphite); background:var(--paper); }
.learning-workbench textarea { min-height:90px; resize:vertical; line-height:1.6; }
.learning-workbench textarea.learning-long { min-height:200px; }
.learning-workbench button { border:1px solid var(--line); border-radius:5px; padding:8px 12px; background:var(--paper); color:var(--faded-ink); cursor:pointer; font:inherit; font-size:13px; }
.learning-workbench button:disabled { opacity:.5; cursor:not-allowed; }
.learning-actions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.learning-actions label { display:flex; align-items:center; gap:7px; }
.learning-workbench .learning-primary { color:white; background:var(--faded-ink); }
.learning-workbench pre, .learning-workbench code { white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; }
.learning-workbench pre { max-height:340px; overflow:auto; line-height:1.7; }
.learning-workbench dl { display:grid; grid-template-columns:90px minmax(0,1fr); gap:8px 12px; font-size:13px; line-height:1.6; }
.learning-workbench dt { color:var(--muted); }
.learning-workbench dd { margin:0; overflow-wrap:anywhere; white-space:pre-wrap; }
.learning-workbench summary { cursor:pointer; font-size:13px; padding:8px 0; }
.learning-task-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr)); gap:12px; margin:12px 0 24px; }
.learning-task-card { border:1px solid var(--line); border-radius:6px; padding:15px; min-width:0; }
.learning-task-card p { font-size:12px; margin:6px 0; overflow-wrap:anywhere; }
.learning-task-card button { width:100%; margin-top:8px; }
.learning-muted { color:var(--muted); font-size:12px; }
@media(max-width:640px) { .learning-panel { padding:16px; } .learning-workbench dl { grid-template-columns:1fr; gap:3px; } .learning-workbench dd { margin-bottom:8px; } }
`;

export const learningWorkbenchJs = String.raw`
let learningRenderEpoch = 0;
const learningSelection = { recipeId: null, taskId: null };

async function learningRequest(path, body) {
  const options = { method: body === undefined ? 'GET' : 'POST', headers: { 'x-vibe-import-token': document.querySelector('meta[name="vibe-import-token"]').content } };
  if (body !== undefined) { options.headers['content-type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch('/api/learning/' + path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.message);
  return value;
}
function learningValue(form, name) { return form.elements.namedItem(name).value; }
function learningSourceInput(form) {
  const kind = learningValue(form, 'kind');
  if (learningValue(form, 'format') === 'json') {
    const source = JSON.parse(learningValue(form, 'material'));
    if (source.kind !== kind) throw new Error('材料 JSON 的 kind 与所选材料类型不一致。');
    return source;
  }
  if (kind !== 'text') throw new Error('对话材料请使用严格 JSON，保留真实的发言角色和条目。');
  return { schemaVersion: '0.1.0', title: learningValue(form, 'title'), kind: 'text', entries: [{ id: 'entry-1', role: 'document', text: learningValue(form, 'material') }] };
}
function learningRecipeInput(form, recipe, copy = false) {
  const project = form.elements.namedItem('sourceProject').checked;
  const content = {
    name: learningValue(form, 'name'), description: learningValue(form, 'description'),
    sourceKinds: project ? ['project'] : ['text', 'conversation'].filter(kind => form.elements.namedItem(kind === 'text' ? 'sourceText' : 'sourceConversation').checked),
    focus: learningValue(form, 'focus').split('\n').map(value => value.trim()).filter(Boolean),
    prompt: learningValue(form, 'prompt'), outputInstructions: learningValue(form, 'outputInstructions'),
    ...(project ? { includePages: form.elements.namedItem('includePages').checked, componentRules: { iconPrimitives: learningValue(form, 'iconPrimitives'), emptyShells: learningValue(form, 'emptyShells'), duplicates: learningValue(form, 'duplicates'), headlessContainers: learningValue(form, 'headlessContainers'), viewEntries: learningValue(form, 'viewEntries') } } : {}),
  };
  return recipe.builtin || copy ? content : { id: recipe.id, ...content };
}
function learningApplicationInput(form) {
  const label = learningValue(form, 'evidenceLabel');
  const uri = learningValue(form, 'evidenceUri');
  if (Boolean(label.trim()) !== Boolean(uri.trim())) throw new Error('验证证据的名称和位置需要同时填写。');
  return { assetIds: [learningValue(form, 'asset')], target: learningValue(form, 'target'), reason: learningValue(form, 'reason'), action: learningValue(form, 'action'), outcome: learningValue(form, 'outcome'), evidence: label.trim() ? [{ label, uri }] : [] };
}
function learningMessage(message, error = false) {
  const element = byId('learning-message');
  element.textContent = message;
  element.dataset.error = String(error);
}
async function learningRun(button, action) {
  if (button) button.disabled = true;
  learningMessage('正在处理…');
  try { await action(); } catch (error) { learningMessage(error.message, true); }
  finally { if (button) button.disabled = false; }
}
function learningField(name, label, value = '', multiline = false) {
  return '<label>' + label + (multiline ? '<textarea name="' + name + '" rows="4">' + escapeHtml(value) + '</textarea>' : '<input name="' + name + '" value="' + escapeHtml(value) + '">') + '</label>';
}
function learningRecipeOptions(recipes) {
  return recipes.map(recipe => '<option value="' + escapeHtml(recipe.id) + '">' + escapeHtml(recipe.name) + ' · v' + recipe.version + (recipe.builtin ? ' · 内置' : ' · 个人') + '</option>').join('');
}
function learningFrame(title, intro, content) {
  return '<section class="learning-workbench"><h2>' + title + '</h2><p class="learning-intro">' + intro + '</p><div id="learning-message" class="learning-message" role="status" aria-live="polite"></div>' + content + '</section>';
}
function learningSourcesHtml(sources) {
  if (!sources.length) return '<div class="learning-panel"><p>尚无来源。导入项目、书籍或准备学习材料后会出现在这里。</p></div>';
  return '<div class="learning-grid">' + sources.map((source, index) => '<article class="learning-panel"><h3>' + escapeHtml(source.name) + '</h3><dl><dt>材料类型</dt><dd>' + escapeHtml(source.kind) + '</dd><dt>来源路径</dt><dd>' + escapeHtml(source.path) + '</dd><dt>状态</dt><dd>' + escapeHtml(source.status) + '</dd><dt>资产数量</dt><dd>' + source.assetCount + '</dd></dl>' +
    (source.uncertainties?.length ? '<details><summary>限制与不确定性</summary><ul>' + source.uncertainties.map(item => '<li><p>' + escapeHtml(item.description) + '</p><pre>' + escapeHtml(JSON.stringify(item.evidence, null, 2)) + '</pre></li>').join('') + '</ul></details>' : '') +
    (source.reports ? ['reuse', 'rules'].filter(key => source.reports[key]).map(key => '<details><summary>' + (key === 'reuse' ? '复用报告' : '使用规则') + '</summary><pre>' + escapeHtml(source.reports[key]) + '</pre></details>').join('') : '') +
    '<button type="button" id="learning-source-' + index + '">查看来源资产</button></article>').join('') + '</div>';
}
function learningRecipeEditor(recipe) {
  const history = '<div class="learning-actions"><label>版本 <input id="learning-recipe-version" type="number" min="1" value="' + recipe.version + '" style="width:90px"></label><button id="learning-recipe-history" type="button">读取历史版本</button></div>';
  const project = recipe.sourceKinds.includes('project');
  const componentRules = '<div id="learning-component-rules"' + (project ? '' : ' hidden') + '><p class="learning-muted">以下规则属于当前工程方案，保存为个人副本后可自行调整。依赖素材仍随父组件保留。</p><label><input type="checkbox" name="includePages"' + (recipe.includePages === true ? ' checked' : '') + '>纳入完整页面（当前支持 uni-app 与 Vue Router 静态注册页）</label>' + ['iconPrimitives', 'emptyShells', 'headlessContainers'].map(key => '<label>' + ({iconPrimitives:'独立图标素材',emptyShells:'无脚本、样式的纯插槽空壳',headlessContainers:'无独立视觉表面的容器'}[key]) + '<select name="' + key + '">' + ['exclude', 'include'].map(value => '<option value="' + value + '"' + ((recipe.componentRules?.[key] ?? (key === 'headlessContainers' ? 'include' : 'exclude')) === value ? ' selected' : '') + '>' + (value === 'exclude' ? '排除独立产出' : '保留独立产出') + '</option>').join('') + '</select></label>').join('') + '<label>重复实现<select name="duplicates">' + [['merge-identical','仅合并源码和依赖完全相同的实现'],['keep','保留所有实现']].map(([value,label]) => '<option value="' + value + '"' + ((recipe.componentRules?.duplicates ?? 'keep') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label><label>未注册的整页视图<select name="viewEntries">' + [['context-only','仅作为来源场景'],['include','也作为组件候选']].map(([value,label]) => '<option value="' + value + '"' + ((recipe.componentRules?.viewEntries ?? 'include') === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label><p class="learning-muted">已注册页面仍按页面范围保留；页面内的组件与实际被其他模板调用的业务区块继续独立提炼。近似变体分别保留；尚未独立拆出的业务区块仅作为提炼候选。</p></div>';
  return '<section class="learning-panel"><h3>' + (recipe.builtin ? '内置模板 · 保存时建立个人副本' : '个人方案 · 保存为不可变新版本') + '</h3><dl><dt>方案 ID</dt><dd><code>' + escapeHtml(recipe.id) + '</code></dd><dt>当前版本</dt><dd>' + recipe.version + '</dd><dt>内容摘要</dt><dd><code>' + escapeHtml(recipe.digest) + '</code></dd></dl>' + history + '<form id="learning-recipe-form">' +
    learningField('name', '方案名称', recipe.name) + learningField('description', '用途说明', recipe.description, true) +
    '<div class="learning-actions"><label><input type="checkbox" name="sourceText"' + (recipe.sourceKinds.includes('text') ? ' checked' : '') + '>文本材料</label><label><input type="checkbox" name="sourceConversation"' + (recipe.sourceKinds.includes('conversation') ? ' checked' : '') + '>对话记录</label><label><input type="checkbox" name="sourceProject"' + (project ? ' checked' : '') + '>工程项目（单独选择）</label></div>' + componentRules +
    learningField('focus', '关注点（每行一项）', recipe.focus.join('\n'), true) + learningField('prompt', '炼化提示词（变量仅支持 {source} 与 {focus}）', recipe.prompt, true) + learningField('outputInstructions', '产物要求', recipe.outputInstructions, true) +
    '<div class="learning-actions"><button id="learning-recipe-save" class="learning-primary" type="submit">' + (recipe.builtin ? '保存为个人副本' : '保存新版本') + '</button>' + (!recipe.builtin ? '<button id="learning-recipe-copy" type="button">另存为个人副本</button>' : '') + '</div></form></section>';
}
function learningBindRecipe(recipe) {
  const form = byId('learning-recipe-form');
  const project = form.elements.namedItem('sourceProject');
  const text = form.elements.namedItem('sourceText');
  const conversation = form.elements.namedItem('sourceConversation');
  project.onchange = () => {
    if (project.checked) { text.checked = false; conversation.checked = false; }
    byId('learning-component-rules').hidden = !project.checked;
  };
  for (const field of [text, conversation]) field.onchange = () => {
    if (field.checked) project.checked = false;
    byId('learning-component-rules').hidden = !project.checked;
  };
  const save = async copy => {
    const saved = await learningRequest('recipes', learningRecipeInput(form, recipe, copy));
    learningSelection.recipeId = saved.id;
    await renderLearningWorkbench('recipes');
    learningMessage('已保存 ' + saved.name + ' · v' + saved.version + '。已有版本保持不变。');
  };
  form.onsubmit = event => { event.preventDefault(); return learningRun(byId('learning-recipe-save'), () => save(false)); };
  if (!recipe.builtin) byId('learning-recipe-copy').onclick = () => learningRun(byId('learning-recipe-copy'), () => save(true));
  byId('learning-recipe-history').onclick = () => learningRun(byId('learning-recipe-history'), async () => {
    const previous = await learningRequest('recipe?' + new URLSearchParams({ id: recipe.id, version: byId('learning-recipe-version').value }));
    byId('learning-recipe-editor').innerHTML = learningRecipeEditor(previous);
    learningBindRecipe(previous);
    learningMessage('正在编辑历史版本 v' + previous.version + '；保存会新增版本。');
  });
}
function learningResultAssets(task, result) {
  const assets = state.model.assets.filter(asset => asset.id.startsWith('learning:') && asset.raw.taskId === task.id && asset.raw.resultId === result.id);
  if (!assets.length) return '<p class="learning-muted">' + (result.assetCount ? '此结果的资产尚未载入当前视图，请刷新资产库后查看。' : '此结果未提取出有据知识。') + '</p>';
  return assets.map(asset => '<details><summary>' + escapeHtml(asset.name) + '</summary><p>' + escapeHtml(asset.description) + '</p><p class="learning-muted">' + (asset.raw.basis === 'explicit' ? '材料明示' : '分析解释') + ' · 方案 v' + asset.raw.recipeVersion + '</p><details><summary>查看原始知识记录</summary><pre>' + escapeHtml(JSON.stringify(asset.raw, null, 2)) + '</pre></details></details>').join('');
}
function learningTaskCards(tasks) {
  if (!tasks.length) return '<p class="learning-muted">尚无学习任务。准备材料后，把冻结任务交给宿主 AI 执行。</p>';
  const groups = new Map();
  tasks.forEach((task, index) => {
    if (!groups.has(task.sourceDigest)) groups.set(task.sourceDigest, []);
    groups.get(task.sourceDigest).push({ task, index });
  });
  return Array.from(groups.values()).map(group => '<section><h3>' + escapeHtml(group[0].task.source.title) + '</h3><p class="learning-muted">同一材料 · 可比较不同方案和各次结果</p><div class="learning-task-grid">' + group.map(({ task, index }) => '<article class="learning-task-card"><strong>' + escapeHtml(task.recipe.name) + '</strong><p>方案 v' + task.recipe.version + ' · ' + (task.status === 'analyzed' ? '已有分析结果' : '等待宿主分析') + '</p>' + (task.results.length ? task.results.map((result, resultIndex) => '<section><p>结果 ' + (resultIndex + 1) + '：' + result.assetCount + ' 项知识资产</p><details><summary>查看本次产物</summary><p class="learning-muted"><code>' + escapeHtml(result.id) + '</code></p>' + learningResultAssets(task, result) + '</details></section>').join('') : '<p>尚无分析结果</p>') + '<button type="button" id="learning-task-' + index + '">查看任务与导入结果</button></article>').join('') + '</div></section>').join('');
}
function learningTaskDetail(task) {
  learningSelection.taskId = task.id;
  byId('learning-active-task').innerHTML = '<section class="learning-panel"><h3>' + escapeHtml(task.source.title) + ' · 冻结任务</h3><dl><dt>方案版本</dt><dd>' + escapeHtml(task.recipe.name) + ' · v' + task.recipe.version + '</dd><dt>任务文件</dt><dd><code>' + escapeHtml(task.taskPath) + '</code></dd><dt>方案摘要</dt><dd><code>' + escapeHtml(task.recipeDigest) + '</code></dd><dt>材料摘要</dt><dd><code>' + escapeHtml(task.sourceDigest) + '</code></dd></dl><label>交给宿主 AI 的完整任务<textarea id="learning-task-instructions" class="learning-long" readonly>' + escapeHtml(task.instructions) + '</textarea></label><p><button id="learning-task-copy" type="button">复制完整任务</button></p><form id="learning-analysis-form"><label>宿主分析结果（严格 JSON）<textarea name="analysis" class="learning-long" required placeholder="粘贴宿主按任务协议输出的 JSON"></textarea></label><button id="learning-analysis-import" class="learning-primary" type="submit">校验证据并导入资产</button></form></section>';
  byId('learning-task-copy').onclick = () => learningRun(byId('learning-task-copy'), async () => { await navigator.clipboard.writeText(task.instructions); learningMessage('完整任务已复制。请在 Codex、Claude Code 等宿主中执行。'); });
  const form = byId('learning-analysis-form');
  form.onsubmit = event => { event.preventDefault(); return learningRun(byId('learning-analysis-import'), async () => {
    const result = await learningRequest('analysis', { taskId: task.id, analysis: JSON.parse(learningValue(form, 'analysis')) });
    await renderLearningWorkbench('learning');
    learningMessage('证据校验通过，已导入 ' + result.assets.length + ' 项知识资产。');
    window.dispatchEvent(new Event('vibe-import-complete'));
  }); };
}
function learningMaterialForm(recipes) {
  recipes = recipes.filter(recipe => recipe.sourceKinds.includes('text'));
  return '<section class="learning-panel"><h3>准备真实材料</h3><form id="learning-material-form">' + learningField('title', '材料标题（纯文本必填）') +
    '<div class="learning-grid"><label>材料类型<select name="kind"><option value="text">文本材料</option><option value="conversation">对话记录</option></select></label><label>输入格式<select name="format"><option value="text">纯文本</option><option value="json">严格来源 JSON</option></select></label></div><label>材料内容<textarea name="material" class="learning-long" required></textarea></label><details><summary>对话 JSON 格式说明</summary><p class="learning-muted">对话使用 JSON 保留真实角色与条目。JSON 中的 title 为材料标题；所选材料类型须与 kind 一致。</p><pre>' + escapeHtml(JSON.stringify({ schemaVersion: '0.1.0', title: '对话标题', kind: 'conversation', entries: [{ id: 'entry-1', role: 'user', text: '真实发言' }] }, null, 2)) + '</pre></details><label>炼化方案<select name="recipe">' + learningRecipeOptions(recipes) + '</select></label><button id="learning-material-prepare" class="learning-primary" type="submit"' + (recipes.length ? '' : ' disabled') + '>冻结材料与方案，准备任务</button></form></section>';
}
function learningApplicationRecords(records) {
  if (!records.length) return '<p class="learning-muted">尚无应用记录。应用知识后，记录具体行动和真实结果。</p>';
  return records.map(record => '<article class="learning-panel"><h3>' + escapeHtml(record.target) + '</h3><p class="learning-muted">使用者声明 · ' + escapeHtml(record.createdAt) + '</p><dl><dt>采用理由</dt><dd>' + escapeHtml(record.reason) + '</dd><dt>具体行动</dt><dd>' + escapeHtml(record.action) + '</dd><dt>结果</dt><dd>' + escapeHtml(record.outcome) + '</dd><dt>资产版本</dt><dd>' + record.assetIds.map(id => '<code>' + escapeHtml(id) + '</code>').join('<br>') + '</dd><dt>验证证据</dt><dd>' + (record.evidence.length ? record.evidence.map(item => escapeHtml(item.label) + ' · <code>' + escapeHtml(item.uri) + '</code>').join('<br>') : '未提供验证证据') + '</dd></dl></article>').join('');
}
async function renderLearningWorkbench(workspace) {
  const epoch = ++learningRenderEpoch;
  const container = byId('workbench-content');
  container.innerHTML = learningFrame('学习工作台', '正在读取本地资产库…', '');
  try {
    if (workspace === 'sources') {
      const sources = state.model.sources;
      container.innerHTML = learningFrame('来源库', '按材料回查出处、产物和限制。不同语言、角色与资产类型继续在资产库中筛选。', learningSourcesHtml(sources));
      sources.forEach((source, index) => { byId('learning-source-' + index).onclick = () => { state.workspace = 'assets'; state.sourceFilter = source.id; render(); }; });
    } else if (workspace === 'recipes') {
      const recipes = await learningRequest('recipes');
      if (epoch !== learningRenderEpoch) return;
      const recipe = recipes.find(item => item.id === learningSelection.recipeId) || recipes[0];
      container.innerHTML = learningFrame('炼化方案', '定义什么值得提取，以及产物应该如何表达。内置模板不会被覆盖；个人方案每次保存产生新版本。选择内置模板即可重新从默认方案开始。', '<section class="learning-panel"><label>选择方案<select id="learning-recipe-select">' + learningRecipeOptions(recipes) + '</select></label></section><div id="learning-recipe-editor">' + (recipe ? learningRecipeEditor(recipe) : '<p>暂无可用方案。</p>') + '</div>');
      if (recipe) { byId('learning-recipe-select').value = recipe.id; learningBindRecipe(recipe); }
      byId('learning-recipe-select').onchange = () => learningRun(null, async () => {
        const selected = await learningRequest('recipe?' + new URLSearchParams({ id: byId('learning-recipe-select').value }));
        learningSelection.recipeId = selected.id;
        byId('learning-recipe-editor').innerHTML = learningRecipeEditor(selected);
        learningBindRecipe(selected);
        learningMessage('');
      });
    } else if (workspace === 'learning') {
      const [recipes, tasks] = await Promise.all([learningRequest('recipes'), learningRequest('tasks')]);
      if (epoch !== learningRenderEpoch) return;
      container.innerHTML = learningFrame('学习任务', '准备材料 → 宿主 AI 分析 → 校验证据并入库。这里不自动调用模型，也不把准备任务视为分析完成。', '<div class="learning-grid">' + learningMaterialForm(recipes) + '<div id="learning-active-task"><section class="learning-panel"><h3>由宿主执行分析</h3><p>准备后复制完整任务，或让宿主读取任务文件。将宿主的分析 JSON 粘贴回来，校验通过后才会生成知识资产。</p></section></div></div><section class="learning-panel"><h3>任务与方案比较</h3>' + learningTaskCards(tasks) + '</section>');
      container.insertAdjacentHTML('beforeend',conversationWorkbenchHtml()+creatorWorkbenchHtml());
      bindConversationWorkbench();
      bindCreatorWorkbench();
      const selected = tasks.find(task => task.id === learningSelection.taskId);
      if (selected) learningTaskDetail(selected);
      tasks.forEach((task, index) => { byId('learning-task-' + index).onclick = () => learningRun(null, async () => { learningTaskDetail(await learningRequest('task?' + new URLSearchParams({ id: task.id }))); learningMessage(''); }); });
      const form = byId('learning-material-form');
      form.elements.namedItem('kind').onchange = () => {
        const available = recipes.filter(recipe => recipe.sourceKinds.includes(learningValue(form, 'kind')));
        const select = form.elements.namedItem('recipe');
        const selected = select.value;
        select.innerHTML = learningRecipeOptions(available);
        if (available.some(recipe => recipe.id === selected)) select.value = selected;
        byId('learning-material-prepare').disabled = !available.length;
      };
      form.onsubmit = event => { event.preventDefault(); return learningRun(byId('learning-material-prepare'), async () => {
        const recipe = recipes.find(item => item.id === learningValue(form, 'recipe'));
        if (!recipe) throw new Error('请选择有效的炼化方案。');
        if (!recipe.sourceKinds.includes(learningValue(form, 'kind'))) throw new Error('炼化方案与材料类型不匹配，请重新选择。');
        const task = await learningRequest('tasks', { source: learningSourceInput(form), recipeId: recipe.id, recipeVersion: recipe.version });
        learningSelection.taskId = task.id;
        await renderLearningWorkbench('learning');
        learningMessage('任务已准备。材料与方案版本已冻结，等待宿主执行。');
        window.dispatchEvent(new Event('vibe-import-complete'));
      }); };
    } else if (workspace === 'applications') {
      const records = await learningRequest('applications');
      if (epoch !== learningRenderEpoch) return;
      const assets = state.model.assets.filter(asset => asset.id.startsWith('learning:'));
      const formHtml = assets.length ? '<section class="learning-panel"><h3>记录知识应用</h3><form id="learning-application-form"><label>采用的确切知识版本<select name="asset">' + assets.map(asset => '<option value="' + escapeHtml(asset.id) + '">' + escapeHtml(asset.name) + ' · ' + escapeHtml(asset.id) + '</option>').join('') + '</select></label>' + learningField('target', '应用目标') + learningField('reason', '采用理由', '', true) + learningField('action', '具体行动', '', true) + learningField('outcome', '实际结果（如未验证，请明确写出）', '', true) + learningField('evidenceLabel', '验证证据名称（选填）') + learningField('evidenceUri', '验证证据位置（链接或文件路径）') + '<button id="learning-application-save" class="learning-primary" type="submit">保存应用记录</button></form></section>' : '<section class="learning-panel"><p>尚无可应用的过程知识。先在学习任务中导入有证据的分析结果。</p></section>';
      container.innerHTML = learningFrame('应用记录', '记录采用知识的原因、行动和结果。以下内容是使用者声明，不自动成为已验证事实。', '<div class="learning-grid">' + formHtml + '<section><h3>已有记录</h3>' + learningApplicationRecords(records) + '</section></div>');
      if (assets.length) {
        const form = byId('learning-application-form');
        form.onsubmit = event => { event.preventDefault(); return learningRun(byId('learning-application-save'), async () => { await learningRequest('applications', learningApplicationInput(form)); await renderLearningWorkbench('applications'); learningMessage('应用记录已保存，绑定的知识版本保持不变。'); }); };
      }
    } else throw new Error('未知学习工作区。');
  } catch (error) { if (epoch === learningRenderEpoch) learningMessage(error.message, true); }
}
`;
