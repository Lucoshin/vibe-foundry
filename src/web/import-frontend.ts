export const importCss = `
.import-open { white-space: nowrap; background: var(--faded-ink); color: white; border-color: var(--faded-ink); }
.import-open:hover { background: #365043; }
.import-panel { width: min(740px, calc(100vw - 32px)); max-height: 88dvh; padding: 32px; border: 1px solid var(--line); border-radius: 10px; background: var(--content-paper); color: var(--graphite); box-shadow: 0 24px 80px #25362b24; }
.import-panel::backdrop { background: #25362b38; }
.import-heading, .import-path-row, .import-footer, .import-shortcuts { display: flex; gap: 12px; align-items: center; }
.import-heading { justify-content: space-between; margin-bottom: 24px; }
.import-heading h2 { margin: 0; font-size: 22px; }
.import-heading button { border: 0; background: transparent; color: var(--muted); }
.import-panel p { font-size: 13px; }
.import-path-row { margin: 20px 0 12px; }
.import-path-row input { flex: 1; min-width: 0; font: inherit; padding: 9px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); }
.import-shortcuts { margin: 0 0 16px; flex-wrap: wrap; gap: 4px; }
.import-shortcuts button { padding: 6px 10px; font-size: 12px; border: 0; color: var(--muted); background: transparent; }
.import-shortcuts #import-folder { margin-left: auto; color: var(--faded-ink); }
.import-files { height: 280px; max-height: 34vh; overflow: auto; border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
.import-files button { display: flex; width: 100%; text-align: left; border: 0; justify-content: space-between; gap: 12px; overflow-wrap: anywhere; padding: 9px 12px; font-size: 13px; }
.import-files button[aria-pressed="true"] { background: var(--glass); color: var(--faded-ink); }
.import-files small { color: var(--muted); flex-shrink: 0; }
.import-footer { justify-content: space-between; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
.import-selection { overflow-wrap: anywhere; min-width: 0; font-size: 12px; color: var(--muted); }
.import-panel .import-primary { color: white; background: var(--faded-ink); border-color: var(--faded-ink); flex-shrink: 0; }
#import-kind-help { margin: 16px 0 0; font-size: 12px; }
#import-status { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; margin-top: 16px; font-size: 13px; }
#import-task-name { overflow-wrap: anywhere; }
#import-output { overflow-wrap: anywhere; margin: 20px 0; font-size: 12px; }
#import-results pre { max-height: 35vh; overflow-y: auto; }
#import-last-task { margin-top: 16px; font-size: 12px; border: 0; color: var(--muted); }
@media (max-width: 640px) { .import-panel { padding: 24px 20px; } .import-footer { flex-direction: column; align-items: stretch; } .import-files { height: 220px; } }
`;

export const importHtml = `
<dialog id="import-dialog" class="import-panel" aria-labelledby="import-title">
  <div class="import-heading"><h2 id="import-title">导入炼化</h2><button id="import-close" type="button" aria-label="关闭导入面板">关闭</button></div>
  <section id="import-selection-step">
    <p>选择项目文件夹或文档，提取可复用资产。</p>
    <form id="import-path-form" class="import-path-row"><input id="import-path" aria-label="本地目录路径" placeholder="输入完整目录路径" required><button type="submit">前往</button></form>
    <div class="import-shortcuts"><button id="import-up" type="button">↑ 上一级</button><button id="import-home" type="button">用户目录</button><button id="import-workspace" type="button">工作目录</button><button id="import-folder" type="button">选择当前文件夹</button></div>
    <div id="import-files" class="import-files" aria-label="本地文件和文件夹"></div>
    <p id="import-kind-help"></p>
    <div class="import-footer"><div id="import-selection" class="import-selection">尚未选择</div><button id="import-start" class="import-primary" type="button" disabled>开始炼化</button></div>
    <button id="import-last-task" type="button" hidden>查看上次任务</button>
  </section>
  <section id="import-task-step" hidden>
    <h3 id="import-task-name"></h3>
    <p id="import-task-path"></p>
    <p id="import-output"></p>
    <div id="import-results" hidden><button id="import-report" type="button">查看报告</button> <button id="import-download" type="button">下载资产 JSON</button><pre id="import-report-content" hidden></pre></div>
    <div class="import-footer"><button id="import-new" type="button">继续导入</button><button id="import-view-assets" class="import-primary" type="button" hidden>查看资产</button></div>
  </section>
  <div id="import-status" role="status" aria-live="polite"></div>
</dialog>`;

export const importJs = `
(() => {
  const get = id => document.getElementById(id);
  const dialog = get('import-dialog');
  const token = document.querySelector('meta[name="vibe-import-token"]').content;
  let listing = null;
  let selection = null;
  let running = false;
  let browsing = false;
  let pollTimer = null;
  let lastCompleted = null;
  let lastJob = null;
  let taskView = false;
  async function request(route, body) {
    const response = await fetch('/api/import/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-vibe-import-token': token, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) { const error = await response.json(); throw new Error(error.message); }
    return response;
  }
  function message(text) { get('import-status').textContent = text; }
  function showSelection() {
    taskView = false;
    get('import-title').textContent = '导入炼化';
    get('import-selection-step').hidden = false;
    get('import-task-step').hidden = true;
    get('import-last-task').hidden = !lastJob;
    message('');
  }
  function showTask(job) {
    taskView = true;
    get('import-selection-step').hidden = true;
    get('import-task-step').hidden = false;
    get('import-title').textContent = job.state === 'running' ? '正在炼化' : job.state === 'succeeded' ? '炼化完成' : '炼化未完成';
    get('import-task-name').textContent = job.name;
    get('import-task-path').textContent = job.sourcePath || '';
    get('import-output').textContent = job.state === 'succeeded' ? '已保存至：' + job.outputDir : '';
    get('import-new').disabled = job.state === 'running';
    get('import-new').textContent = job.state === 'failed' ? '重新选择' : '继续导入';
    get('import-view-assets').hidden = job.state !== 'succeeded' || job.kind !== 'project';
    get('import-results').hidden = job.state !== 'succeeded' || job.kind !== 'document';
    message(job.message);
  }
  function updateControls() {
    get('import-start').disabled = running || browsing || !selection;
    get('import-folder').disabled = running || browsing || !listing;
    get('import-up').disabled = browsing || !listing || listing.parent === listing.path;
    get('import-home').disabled = browsing || !listing;
    get('import-workspace').disabled = browsing || !listing;
    get('import-path-form').querySelector('button').disabled = browsing;
    document.querySelectorAll('[data-open-import]').forEach(button => { button.textContent = running ? '查看炼化进度' : '导入炼化'; });
  }
  function select(entry) {
    if (running) return;
    selection = entry;
    get('import-selection').textContent = '已选择：' + entry.path;
    get('import-kind-help').textContent = entry.kind === 'directory'
      ? '项目文件夹需包含 package.json。炼化完成后可浏览组件、样式与业务资产。'
      : '文档采用基础章节和词表分析；深度语义分析需由宿主 AI 执行。PDF 读取需要本机已安装 pdftotext。';
    get('import-files').querySelectorAll('[data-file-path]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filePath === entry.path)));
    updateControls();
  }
  async function browse(path) {
    if (browsing) return;
    browsing = true;
    updateControls();
    try {
      const next = await request('browse', path === undefined ? {} : { path }).then(response => response.json());
      listing = next;
      selection = null;
      get('import-selection').textContent = '选择一个文档，或点击“选择当前文件夹”。';
      get('import-kind-help').textContent = '';
      get('import-path').value = next.path;
      get('import-files').replaceChildren();
      if (next.entries.length === 0) get('import-files').textContent = '此目录没有子文件夹或支持的文档。';
      for (const entry of next.entries) {
        const button = document.createElement('button');
        button.type = 'button';
        const name = document.createElement('span'); name.textContent = entry.name;
        const kind = document.createElement('small'); kind.textContent = entry.kind === 'directory' ? '文件夹 ›' : '文档';
        button.append(name, kind);
        if (entry.kind === 'document') { button.dataset.filePath = entry.path; button.setAttribute('aria-pressed', 'false'); }
        button.addEventListener('click', () => entry.kind === 'directory' ? browse(entry.path) : select(entry));
        get('import-files').append(button);
      }
      if (!running) message('');
    } catch (error) { message('无法打开目录：' + error.message); }
    finally { browsing = false; updateControls(); }
  }
  async function poll(initial = false) {
    clearTimeout(pollTimer);
    try {
      const job = await request('status').then(response => response.json());
      running = job?.state === 'running';
      updateControls();
      if (!job) return;
      if (lastJob?.id !== job.id) get('import-report-content').hidden = true;
      lastJob = job;
      get('import-last-task').hidden = false;
      if (initial) lastCompleted = job.state === 'succeeded' ? job.id : null;
      if (taskView) showTask(job);
      if (job.state === 'succeeded' && lastCompleted !== job.id) {
        lastCompleted = job.id;
        if (job.kind === 'project') window.dispatchEvent(new CustomEvent('vibe-import-complete'));
      }
      if (running) pollTimer = setTimeout(poll, 700);
    } catch (error) { message('无法读取任务状态：' + error.message + '。可重新打开面板查看。'); }
  }
  document.querySelectorAll('[data-open-import]').forEach(button => button.addEventListener('click', async () => {
    showSelection();
    dialog.showModal();
    if (!listing) await browse();
    await poll();
    if (running && lastJob) showTask(lastJob);
  }));
  get('import-last-task').addEventListener('click', () => { if (lastJob) showTask(lastJob); });
  get('import-new').addEventListener('click', () => {
    selection = null;
    get('import-selection').textContent = '选择一个文档，或点击“选择当前文件夹”。';
    get('import-kind-help').textContent = '';
    get('import-files').querySelectorAll('[data-file-path]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    showSelection(); updateControls();
  });
  get('import-view-assets').addEventListener('click', () => dialog.close());
  get('import-close').addEventListener('click', () => dialog.close());
  get('import-path-form').addEventListener('submit', event => { event.preventDefault(); browse(get('import-path').value); });
  get('import-up').addEventListener('click', () => browse(listing.parent));
  get('import-home').addEventListener('click', () => browse(listing.home));
  get('import-workspace').addEventListener('click', () => browse(listing.initialDirectory));
  get('import-folder').addEventListener('click', () => select({ path: listing.path, kind: 'directory' }));
  get('import-start').addEventListener('click', async () => {
    if (running || !selection) return;
    running = true; updateControls();
    get('import-results').hidden = true;
    get('import-report-content').hidden = true;
    message('正在启动炼化…');
    try { const job = await request('start', { path: selection.path }).then(response => response.json()); lastJob = job; showTask(job); await poll(); }
    catch (error) { running = false; updateControls(); message('启动失败：' + error.message); }
  });
  get('import-report').addEventListener('click', async () => {
    try { const text = await request('result/report').then(response => response.text()); get('import-report-content').textContent = text; get('import-report-content').hidden = false; }
    catch (error) { message('读取报告失败：' + error.message); }
  });
  get('import-download').addEventListener('click', async () => {
    try {
      const blob = await request('result/assets').then(response => response.blob());
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'book-assets.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { message('下载失败：' + error.message); }
  });
  showSelection();
  updateControls();
  poll(true);
})();
`;
