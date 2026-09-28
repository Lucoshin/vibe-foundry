export const conversationWorkbenchCss = `
.conversation-messages { max-height:340px; overflow:auto; margin:12px 0; }
.conversation-messages label { display:block; border-bottom:1px solid var(--line); padding:10px 0; }
.conversation-messages pre, .conversation-memory pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:260px; overflow:auto; }
.conversation-memory { margin:16px 0; font-size:13px; line-height:1.7; }
.conversation-memory code { overflow-wrap:anywhere; }
`;

export const conversationWorkbenchJs = String.raw`
async function conversationRequest(path, body) {
  const options = { method: body === undefined ? 'GET' : 'POST', headers: { 'x-vibe-import-token': document.querySelector('meta[name="vibe-import-token"]').content } };
  if (body !== undefined) { options.headers['content-type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch('/api/conversations/' + path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.message);
  return result;
}
function conversationWorkbenchHtml() {
  return '<section class="learning-panel" id="conversation-workbench"><h3>从选定对话继续学习</h3><p>预览并选择原始消息，再冻结决定、修正与未决问题的专业任务。语义提炼仍需宿主执行。</p><form data-conversation-form><label>片段标题<input name="title" required maxlength="300"></label><label>材料格式<select name="format"><option value="messages">结构化消息数组（保留角色）</option><option value="text">原始文本（不推测角色）</option></select></label><label>选定材料<textarea name="material" rows="6" required placeholder="结构化消息仅接受 id、role、text；纯文本原样保留"></textarea></label><details><summary>结构化消息格式</summary><pre>[{&quot;id&quot;:&quot;user-1&quot;,&quot;role&quot;:&quot;user&quot;,&quot;text&quot;:&quot;替换为真实发言&quot;}]</pre><p>支持 user、assistant、tool、document。时间、分支及父消息字段当前会被拒绝，不会静默丢失。</p></details><button type="submit">预览并选择消息</button></form><p data-conversation-status role="status"></p><div data-conversation-preview></div><button type="button" data-conversation-prepare disabled>冻结所选材料，等待宿主分析</button></section>';
}
function conversationPreviewHtml(preview) {
  return '<p>提交 ' + preview.coverage.inputEntries + ' 条，当前 ' + preview.coverage.selectedEntries + ' 条。可取消不需要的消息；冻结保留原始顺序。</p><ul>' + preview.limitations.map(value => '<li>' + escapeHtml(value) + '</li>').join('') + '</ul><div class="conversation-messages">' + preview.source.entries.map(entry => '<label><input type="checkbox" data-conversation-message value="' + escapeHtml(entry.id) + '" checked> ' + escapeHtml(entry.id) + ' · ' + escapeHtml(entry.role) + '<pre>' + escapeHtml(entry.text) + '</pre></label>').join('') + '</div>';
}
function bindConversationWorkbench() {
  const panel = byId('conversation-workbench');
  const form = panel.querySelector('[data-conversation-form]');
  const output = panel.querySelector('[data-conversation-preview]');
  const status = panel.querySelector('[data-conversation-status]');
  const prepare = panel.querySelector('[data-conversation-prepare]');
  const previewButton = form.querySelector('button');
  let draft = null, epoch = 0;
  const current = version => version === epoch && byId('conversation-workbench') === panel;
  form.oninput = () => { epoch += 1; draft = null; output.innerHTML = ''; status.textContent = ''; prepare.disabled = true; previewButton.disabled = false; };
  output.onchange = () => { epoch += 1; prepare.disabled = false; status.textContent = '选择已改变，请按当前范围重新冻结；此前已提交的任务保持原范围。'; };
  form.onsubmit = async event => {
    event.preventDefault();
    const version = ++epoch;
    draft = null; output.innerHTML = ''; prepare.disabled = true; previewButton.disabled = true;
    status.textContent = '正在核对材料…';
    try {
      const format = form.elements.namedItem('format').value;
      const material = form.elements.namedItem('material').value;
      const input = { title: form.elements.namedItem('title').value, format, ...(format === 'messages' ? { messages: JSON.parse(material) } : { text: material }) };
      const preview = await conversationRequest('preview', input);
      if (!current(version)) return;
      draft = input; output.innerHTML = conversationPreviewHtml(preview); prepare.disabled = false;
      status.textContent = '仅预览，尚未保存任务。请核对角色、原文与选择范围。';
    } catch (error) { if (current(version)) status.textContent = error.message; }
    finally { if (current(version)) previewButton.disabled = false; }
  };
  prepare.onclick = async () => {
    const version = epoch;
    const messageIds = [...output.querySelectorAll('[data-conversation-message]:checked')].map(input => input.value);
    if (!messageIds.length) { status.textContent = '请至少选择一条材料。'; return; }
    const input = draft.format === 'messages' ? { ...draft, messageIds } : draft;
    prepare.disabled = true; status.textContent = '正在冻结选中材料…';
    try {
      const result = await conversationRequest('prepare', input);
      if (!current(version)) return;
      learningTaskDetail(result.task);
      status.textContent = '已冻结 ' + result.coverage.selectedEntries + ' 条材料，排除 ' + result.coverage.omittedEntries + ' 条。任务已准备，等待宿主分析；尚未生成知识。';
      window.dispatchEvent(new Event('vibe-import-complete'));
    } catch (error) { if (current(version)) status.textContent = error.message; }
    finally { if (current(version)) prepare.disabled = false; }
  };
}
function renderLearningMemoryAction(asset) {
  if (!asset.id.startsWith('learning:')) return '';
  return '<section class="conversation-memory"><button type="button" data-learning-memory="' + escapeHtml(asset.id) + '">回查应用与版本记忆</button><div data-learning-memory-result></div></section>';
}
function conversationApplicationsHtml(records) {
  return records.length ? records.map(record => '<article><h4>' + escapeHtml(record.target) + '</h4><p>使用者声明</p><dl><dt>采用理由与适用条件</dt><dd>' + escapeHtml(record.reason) + '</dd><dt>实际行动</dt><dd>' + escapeHtml(record.action) + '</dd><dt>记录结果</dt><dd>' + escapeHtml(record.outcome) + '</dd><dt>验证引用</dt><dd>' + (record.evidence.length ? record.evidence.map(item => escapeHtml(item.label) + ' · <code>' + escapeHtml(item.uri) + '</code>').join('<br>') : '未提供验证引用') + '</dd></dl></article>').join('') : '<p>该版本暂无应用记录。</p>';
}
function conversationMemoryHtml(memory) {
  return '<h3>' + escapeHtml(memory.asset.title) + '</h3><p><code>' + escapeHtml(memory.asset.id) + '</code></p><ul>' + memory.limitations.map(value => '<li>' + escapeHtml(value) + '</li>').join('') + '</ul><h4>来源发言证据</h4>' + memory.evidence.map(item => '<p>' + escapeHtml(item.entryId) + ' · ' + escapeHtml(item.role) + '</p><pre>' + escapeHtml(item.quote) + '</pre>').join('') + '<h4>该确切版本的应用</h4>' + conversationApplicationsHtml(memory.applications) + '<h4>显式分析关系</h4>' + (memory.relations.length ? '<pre>' + escapeHtml(JSON.stringify(memory.relations, null, 2)) + '</pre>' : '<p>未提供关系。</p>') + '<h4>同任务其他分析版本（不自动取代）</h4>' + (memory.revisions.length ? memory.revisions.map(item => '<details><summary>' + escapeHtml(item.summary) + '</summary><p><code>' + escapeHtml(item.assetId) + '</code></p>' + conversationApplicationsHtml(item.applications) + '</details>').join('') : '<p>暂无其他版本。</p>');
}
function bindLearningMemoryActions(scope) {
  scope.querySelectorAll('[data-learning-memory]').forEach(button => { button.onclick = async () => {
    const output = button.parentElement.querySelector('[data-learning-memory-result]');
    button.disabled = true; output.textContent = '正在回查确切版本…';
    try {
      const memory = await conversationRequest('memory?' + new URLSearchParams({ assetId: button.dataset.learningMemory }));
      if (button.isConnected) output.innerHTML = conversationMemoryHtml(memory);
    } catch (error) { if (button.isConnected) output.textContent = error.message; }
    finally { if (button.isConnected) button.disabled = false; }
  }; });
}
`;
