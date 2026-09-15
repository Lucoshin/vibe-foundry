import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "node:test";

it("keeps empty-library guidance inside the list and distinguishes filtered results", async () => {
  const { renderWebAppHtml } = await import("../../dist/web/frontend.js");
  const webAppJs = renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1];
  const list = { innerHTML: "", className: "" };
  const context = vm.createContext({ list, document: { querySelectorAll: () => [] }, bindComponentPreviewActions: () => {} });
  vm.runInContext("const state = { category: 'overview', model: { assets: [] }, selected: null }; const byId = () => list; const filteredAssets = () => [];", context);
  const start = webAppJs.indexOf("function renderList() {");
  const end = webAppJs.indexOf("function editComponentLabels(", start);
  vm.runInContext(webAppJs.slice(start, end), context);
  for (const category of ["overview", "components", "reports"]) {
    vm.runInContext(`state.category = '${category}'; renderList();`, context);
    assert.match(list.innerHTML, /还没有资产/);
    assert.match(list.innerHTML, /开始使用/);
    assert.match(list.innerHTML, /distill &lt;project-root&gt;/);
  }
  vm.runInContext("state.category = 'components'; state.model.assets = [{ id: 'existing' }]; renderList();", context);
  assert.match(list.innerHTML, /没有匹配/);
  assert.doesNotMatch(list.innerHTML, /还没有资产/);
});

describe("calm asset browser shell", () => {
  it("uses one quiet stylesheet without decorative or automatic preview behavior", async () => {
    const { renderWebAppHtml, webAppCss } = await import("../../dist/web/frontend.js");
    const html = renderWebAppHtml();
    assert.match(html, /lang="zh-CN"/);
    assert.match(html, /搜索资产、来源或复用建议/);
    assert.match(html, /data-open-import/);
    assert.doesNotMatch(html, /manuscript-canvas|initManuscriptField|energy-bar|showPreviewPopover|previewHoverTimer|field note/);
    assert.doesNotMatch(webAppCss, /rotate\(|radial-gradient|backdrop-filter/);
    assert.match(webAppCss, /prefers-reduced-motion/);
  });
  it("keeps explicit previews, accessible detail dismissal and compact data rows", async () => {
    const { renderWebAppHtml, webAppCss } = await import("../../dist/web/frontend.js");
    const html = renderWebAppHtml();
    assert.match(html, /aria-label="资产详情" hidden/);
    assert.match(html, /返回资产列表/);
    assert.match(html, /data-action="close-detail"/);
    assert.match(html, /data-action="refresh-preview"/);
    assert.match(html, /查看原始 JSON/);
    assert.match(html, /复制提示词/);
    assert.match(webAppCss, /\.asset-rows/);
    assert.match(webAppCss, /@media \(max-width: 640px\)/);
    assert.match(webAppCss, /\.app\.preview-focused \.detail/);
  });
  it("reserves preview dimensions and scrollbar space before asynchronous content arrives", async () => {
    const { webAppCss } = await import("../../dist/web/frontend.js");
    const rule = selector => webAppCss.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}'))?.[1] || '';
    assert.match(rule('.component-thumbnail'), /height:\s*180px/);
    assert.match(rule('.component-thumbnail'), /flex:\s*none/);
    assert.match(rule('.component-thumbnail-frame'), /display:\s*block/);
    assert.match(rule('.preview-stage'), /height:\s*calc\(var\(--preview-canvas-height\)/);
    assert.match(rule('.preview-stage'), /min-height:\s*410px/);
    assert.match(rule('html'), /scrollbar-gutter:\s*stable/);
    assert.match(rule('.detail'), /scrollbar-gutter:\s*stable/);
  });
});

describe("component view state", () => {
  it("discards ambiguous legacy state and changes only the addressed component", async () => {
    const { renderWebAppHtml } = await import("../../dist/web/frontend.js");
    const script = renderWebAppHtml().match(/<script>([\s\S]*?)<\/script>/)[1];
    const first = { id: "project-a:components:button", category: "components", name: "Button", labels: ["A"] };
    const second = { id: "project-b:components:button", category: "components", name: "Button", labels: ["B"] };
    const oldKey = "vibe-foundry:component-view:VibeFoundry Library";
    const storage = new Map([[oldKey, JSON.stringify({ deletedComponentIds: ["components:Button"], componentLabelOverrides: { "components:Button": ["Legacy"] } })]]);
    const context = vm.createContext({
      model: { project: { sourceProject: "VibeFoundry Library" }, assets: [first, second] },
      localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
      window: { prompt: () => "B-only", confirm: () => true },
    });
    vm.runInContext(script.slice(0, script.indexOf("\nfunction startWebApp()")), context);
    vm.runInContext("state.model = model; render = () => {}; loadComponentState();", context);
    assert.equal(storage.has(oldKey), false);
    assert.equal(vm.runInContext("visibleComponents().length", context), 2);
    vm.runInContext("editComponentLabels(model.assets[1].id)", context);
    assert.equal(vm.runInContext("componentLabelsFor(model.assets[0]).join(',')", context), "A");
    assert.equal(vm.runInContext("componentLabelsFor(model.assets[1]).join(',')", context), "B-only");
    vm.runInContext("deleteComponent(model.assets[1].id)", context);
    assert.equal(vm.runInContext("visibleComponents()[0].id", context), first.id);
    assert.equal(vm.runInContext("visibleComponents().length", context), 1);
    assert.notEqual(vm.runInContext("componentStorageKey()", context), oldKey);
  });
});


const effectPromptRecord = (prompt, filePath = "src/Button.tsx") => ({
  schemaVersion: "0.2.0", componentName: "Button", filePath,
  sourceDigest: "a".repeat(64), sourceFiles: [filePath], unresolved: [], prompt,
});

async function promptFrontendContext(options = {}) {
  const { renderWebAppHtml } = await import("../../dist/web/frontend.js");
  const script = renderWebAppHtml().match(/<script>([\s\S]*?)<\/script>/)[1];
  const stage = { innerHTML: "" };
  const detail = { innerHTML: "", querySelectorAll: () => [], querySelector: selector => selector === '[data-preview-stage]' ? stage : null };
  const context = vm.createContext({
    fetch: options.fetch,
    navigator: { clipboard: options.clipboard },
    document: { getElementById: (id) => id === "asset-detail" ? detail : { classList: { toggle() {} } } },
    assets: [
      { id: "components:project-a", name: "Button", category: "components", raw: {}, labels: [], language: "tsx", languageLabel: "TSX", source: "src/Button.tsx" },
      { id: "components:project-b", name: "Button", category: "components", raw: {}, labels: [], language: "tsx", languageLabel: "TSX", source: "src/admin/Button.tsx" },
    ],
    rendered: [],
    status: { textContent: "" },
  });
  vm.runInContext(script.slice(0, script.indexOf("\nfunction startWebApp()")), context);
  vm.runInContext("state.model = { assets }; state.selected = assets[0];", context);
  return { context, detail };
}

describe("component effect prompt UI", () => {
  it("offers prompts in both component detail modes without fetching their text", async () => {
    let requests = 0;
    const { context, detail } = await promptFrontendContext({ fetch: async () => { requests += 1; } });
    vm.runInContext("renderDetail()", context);
    assert.match(detail.innerHTML, /效果描述提示词/);
    assert.match(detail.innerHTML, /data-action="copy-component-prompt"/);
    vm.runInContext("state.selected.componentPreview = { id: 'preview-a', buildable: true, previewUrl: '/component-preview/preview-a/' }; state.activePreviewAssetId = state.selected.id; renderDetail();", context);
    assert.match(detail.innerHTML, /效果描述提示词/);
    assert.equal(requests, 0);
  });

  it("shows evidence in a separate collapsed disclosure and copies only the effect description", async () => {
    const record = { ...effectPromptRecord("设计一个横向弹性布局的按钮，内容居中，使用 8px 圆角。"), sourceFiles: ["src/Button.tsx", "src/styles/button.css"], unresolved: ["动态投影需要实机核对。"] };
    let copied;
    const { context } = await promptFrontendContext({
      fetch: async () => ({ ok: true, json: async () => record }),
      clipboard: { writeText: async (text) => { copied = text; } },
    });
    vm.runInContext("renderComponentPromptPanel = () => {};", context);
    await vm.runInContext("loadComponentPrompt(assets[0].id)", context);
    const html = vm.runInContext("renderComponentPrompt(assets[0])", context);
    assert.match(html, /把这个组件的布局、视觉、动效和交互描述成专业需求，复制给 AI 即可使用。/);
    assert.match(html, /<pre class="component-effect-text"[^>]*>设计一个横向弹性布局的按钮，内容居中，使用 8px 圆角。<\/pre>/);
    assert.match(html, /<details class="component-prompt-evidence"><summary>生成依据与待核对项<\/summary>/);
    assert.match(html, /分析依据文件列表/);
    assert.match(html, /src\/styles\/button.css/);
    assert.match(html, /待核对项/);
    assert.match(html, /动态投影需要实机核对。/);
    await vm.runInContext("copyComponentPrompt(assets[0].id, status)", context);
    assert.equal(copied, record.prompt);
    assert.doesNotMatch(copied, /src\/|动态投影|schemaVersion|sourceDigest/);
    const { webAppCss } = await import("../../dist/web/frontend.js");
    assert.match(webAppCss, /\.component-effect-text\s*\{[^}]*font-family: inherit;[^}]*line-height: 1\.9;/);
  });

  it("shares one request per asset and keeps late responses away from another component", async () => {
    const pending = [];
    const { context } = await promptFrontendContext({ fetch: (url) => new Promise((resolve) => pending.push({ url, resolve })) });
    vm.runInContext("renderComponentPromptPanel = (id) => rendered.push(id);", context);
    const first = vm.runInContext("loadComponentPrompt(assets[0].id)", context);
    const duplicate = vm.runInContext("loadComponentPrompt(assets[0].id)", context);
    assert.equal(first, duplicate);
    await Promise.resolve();
    assert.equal(pending.length, 1);
    assert.match(pending[0].url, /components%3Aproject-a$/);
    vm.runInContext("state.selected = assets[1]", context);
    pending[0].resolve({ ok: true, json: async () => effectPromptRecord("横向弹性布局", "src/Button.tsx") });
    await first;
    assert.equal(context.rendered.length, 0);
    const second = vm.runInContext("loadComponentPrompt(assets[1].id)", context);
    await Promise.resolve();
    pending[1].resolve({ ok: true, json: async () => effectPromptRecord("纵向排列布局", "src/admin/Button.tsx") });
    await second;
    assert.equal(context.rendered.join(), "components:project-b");
    assert.match(vm.runInContext("renderComponentPrompt(assets[0])", context), /横向弹性布局/);
    assert.doesNotMatch(vm.runInContext("renderComponentPrompt(assets[0])", context), /纵向排列布局/);
    assert.equal(vm.runInContext("loadComponentPrompt(assets[0].id)", context), first);
    assert.equal(pending.length, 2);
  });

  it("loads from the disclosure event and updates only the prompt panel before copying", async () => {
    let requests = 0;
    let copied = "";
    const { context, detail } = await promptFrontendContext({
      fetch: async () => { requests += 1; return { ok: true, json: async () => effectPromptRecord("内容居中的圆角按钮") }; },
      clipboard: { writeText: async (text) => { copied = text; } },
    });
    const loadStatus = { textContent: "" };
    const copyStatus = { textContent: "" };
    const panel = {
      dataset: { componentPrompt: "components:project-a" }, open: false, outerHTML: "", listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      querySelector(selector) { return selector === "[data-prompt-load-status]" ? loadStatus : copyStatus; },
    };
    const button = {
      dataset: { componentId: "components:project-a" }, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      closest: () => panel,
    };
    detail.innerHTML = "<iframe>preserved running preview</iframe>";
    detail.querySelector = () => panel;
    context.scope = { querySelectorAll: (selector) => selector === "[data-component-prompt]" ? [panel] : [button] };
    vm.runInContext("bindComponentPromptActions(scope)", context);
    assert.equal(requests, 0);
    panel.open = true;
    panel.listeners.toggle();
    assert.match(loadStatus.textContent, /正在读取/);
    await vm.runInContext("state.componentPrompts.get(assets[0].id).promise", context);
    assert.equal(detail.innerHTML, "<iframe>preserved running preview</iframe>");
    assert.match(panel.outerHTML, /内容居中的圆角按钮/);
    panel.listeners.toggle();
    assert.equal(requests, 1);
    button.listeners.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(copied, "内容居中的圆角按钮");
    assert.match(copyStatus.textContent, /已复制/);
  });

  it("shows an explicit old-package error instead of a generated placeholder prompt", async () => {
    const { context } = await promptFrontendContext({ fetch: async () => ({ ok: false, json: async () => ({ message: "Prompt missing. Run node dist/cli.js distill <project-root> again." }) }) });
    vm.runInContext("renderComponentPromptPanel = () => {};", context);
    await assert.rejects(vm.runInContext("loadComponentPrompt(assets[0].id)", context), /distill/);
    const html = vm.runInContext("renderComponentPrompt(assets[0])", context);
    assert.match(html, /distill &lt;project-root&gt;/);
    assert.match(html, /disabled/);
  });

  it("copies the addressed prompt and only reports success after clipboard completion", async () => {
    let copied = "";
    let finish;
    const { context } = await promptFrontendContext({
      fetch: async () => ({ ok: true, json: async () => effectPromptRecord("悬停时向上位移 2px") }),
      clipboard: { writeText: (text) => { copied = text; return new Promise((resolve) => { finish = resolve; }); } },
    });
    vm.runInContext("renderComponentPromptPanel = () => {};", context);
    await vm.runInContext("loadComponentPrompt(assets[0].id)", context);
    const copying = vm.runInContext("copyComponentPrompt(assets[0].id, status)", context);
    assert.equal(copied, "悬停时向上位移 2px");
    assert.doesNotMatch(context.status.textContent, /已复制/);
    finish();
    await copying;
    assert.match(context.status.textContent, /已复制/);
  });

  it("reports clipboard denial or absence and keeps the original prompt available", async () => {
    for (const clipboard of [undefined, { writeText: async () => { throw new Error("Permission denied"); } }]) {
      const { context } = await promptFrontendContext({ clipboard, fetch: async () => ({ ok: true, json: async () => effectPromptRecord("带细描边的卡片") }) });
      vm.runInContext("renderComponentPromptPanel = () => {};", context);
      await vm.runInContext("loadComponentPrompt(assets[0].id)", context);
      await vm.runInContext("copyComponentPrompt(assets[0].id, status)", context);
      assert.match(context.status.textContent, /复制失败.*手动/);
      assert.match(vm.runInContext("renderComponentPrompt(assets[0])", context), /带细描边的卡片/);
    }
  });
});
