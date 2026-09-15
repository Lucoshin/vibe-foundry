export const webAppCss = `
:root {
  --paper: #f8f9f7; --content-paper: #fff; --graphite: #252a28;
  --muted: #68716c; --faded-ink: #48665b; --line: #e4e8e4;
  --line-strong: #cdd5cf; --glass: #eff3ef; --danger: #a2433b;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: var(--graphite); background: var(--paper); font-size: 14px;
}
* { box-sizing: border-box; }
html { scrollbar-gutter: stable; }
body { margin: 0; line-height: 1.6; }
[hidden] { display: none !important; }
button, input, select { font: inherit; color: inherit; }
button, .preview-tool { cursor: pointer; border: 1px solid var(--line-strong); border-radius: 6px; padding: 8px 14px; background: var(--content-paper); line-height: 1.4; transition: background 140ms ease, border-color 140ms ease; }
button:hover, .preview-tool:hover { background: var(--glass); border-color: #b8c6bd; }
button:disabled { opacity: .45; cursor: default; }
:focus-visible { outline: 2px solid var(--faded-ink); outline-offset: 3px; }
a { color: var(--faded-ink); }
h1, h2, h3, p { margin-top: 0; }
h1, h2, h3 { line-height: 1.4; font-weight: 600; }
h1 { font-size: 26px; letter-spacing: -.5px; }
h2 { font-size: 19px; }
h3 { font-size: 15px; }
p { color: var(--muted); }
.app { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 100vh; }
.sidebar { position: sticky; top: 0; height: 100vh; padding: 32px 16px; border-right: 1px solid var(--line); background: #f1f4f0; }
.sidebar-top { display: flex; gap: 8px; align-items: center; margin-bottom: 40px; }
.brand-wrap { flex: 1; min-width: 0; }
.brand { display: flex; gap: 9px; align-items: center; font-weight: 650; font-size: 17px; white-space: nowrap; }
.brand-mark { display: grid; place-items: center; border: 1px solid var(--line-strong); border-radius: 7px; height: 28px; width: 28px; font-size: 10px; flex-shrink: 0; }
.brand-text { min-width: 0; }
.brand-subtitle { font-size: 11px; margin: 10px 0 0; }
.sidebar-toggle { padding: 6px; border: 0; background: transparent; color: var(--muted); }
.nav { display: grid; gap: 6px; }
.nav button { display: flex; gap: 12px; align-items: center; width: 100%; padding: 11px 12px; border: 0; background: transparent; color: var(--muted); text-align: left; }
.nav button:hover { background: #e9eee8; }
.nav button.active { background: #e2eae2; color: #304b3c; font-weight: 600; }
.nav-mark { display: inline-flex; flex-shrink: 0; }
.nav-icon { width: 18px; height: 18px; }
.app.sidebar-collapsed { grid-template-columns: 72px minmax(0, 1fr); }
.app.sidebar-collapsed .sidebar { padding-inline: 12px; }
.app.sidebar-collapsed .brand-wrap, .app.sidebar-collapsed .nav-label { display: none; }
.main { padding: 40px clamp(24px, 4vw, 72px) 64px; min-width: 0; width: 100%; max-width: 1560px; margin: 0 auto; }
.toolbar { display: flex; gap: 24px; align-items: center; margin-bottom: 28px; }
.title { flex: 1; min-width: 0; }
.title h1 { margin-bottom: 5px; }
.title p { margin: 0; font-size: 12px; }
.search { width: clamp(180px, 24vw, 320px); height: 38px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--content-paper); }
.metrics { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: 24px; margin-bottom: 32px; }
.metric { display: flex; align-items: baseline; gap: 8px; }
.metric strong { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.metric span { color: var(--muted); font-size: 12px; }
.component-controls { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; margin-bottom: 24px; }
.control-group { display: flex; gap: 10px; align-items: center; }
.control-group > span { white-space: nowrap; color: var(--muted); font-size: 12px; }
.control-select { min-width: 120px; max-width: 230px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--content-paper); }
.component-count { color: var(--muted); font-size: 12px; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; align-items: stretch; }
.asset-grid .asset-card { display: flex; flex-direction: column; }
.asset-grid .asset-meta { margin-top: auto; }
.asset-card { border: 1px solid var(--line); border-radius: 8px; padding: 22px; background: var(--content-paper); cursor: pointer; min-width: 0; transition: border-color 140ms ease, background 140ms ease; }
.asset-card:hover { border-color: #b4c5b8; }
.asset-card.active { border-color: var(--faded-ink); background: #f5f8f4; }
.asset-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.asset-card h2 { font-size: 15px; margin: 0 0 10px; overflow-wrap: anywhere; }
.asset-card p { font-size: 13px; margin: 0 0 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.asset-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 11px; color: var(--muted); }
.asset-source { font-size: 11px; color: var(--muted); margin-top: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-rows { display: grid; gap: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--content-paper); overflow: hidden; }
.asset-rows .asset-card { border: 0; border-radius: 0; border-bottom: 1px solid var(--line); padding: 18px 24px; display: grid; grid-template-columns: minmax(160px, 1fr) minmax(180px, 2fr) auto; gap: 8px 24px; align-items: center; }
.asset-rows .asset-card:last-child { border-bottom: 0; }
.asset-rows .asset-card h2, .asset-rows .asset-card p { margin: 0; }
.asset-rows .asset-source { grid-column: 2; margin: 0; }
.language-badge, .component-label { border-radius: 4px; background: var(--glass); color: var(--muted); padding: 2px 6px; font-size: 11px; white-space: nowrap; }
.component-labels { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.component-thumbnail { position: relative; flex: none; height: 180px; margin-bottom: 20px; overflow: hidden; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.component-thumbnail-frame { display: block; width: 100%; height: 100%; border: 0; pointer-events: none; }
.preview-context-label { position: absolute; left: 8px; top: 8px; padding: 3px 7px; background: #fffffff2; color: #65746e; font-size: 11px; border-radius: 4px; }
.component-thumbnail-open { position: absolute; right: 8px; bottom: 8px; padding: 4px 8px; font-size: 11px; background: #fffffff2; }
.preview-placeholder { width: 100%; height: 100%; min-width: 0; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; background: var(--content-paper); color: var(--muted); font-size: 12px; }
.preview-placeholder strong { color: var(--graphite); font-weight: 500; }
.asset-card-tools { display: flex; gap: 6px; align-items: center; }
.asset-action { padding: 6px; display: inline-flex; }
.asset-action svg { width: 16px; height: 16px; }
.asset-action.danger { color: var(--danger); }
.asset-menu { position: relative; }
.asset-menu summary { padding: 6px 10px; font-size: 12px; }
.asset-menu .asset-card-tools { padding-top: 8px; }
.detail { position: fixed; z-index: 10; top: 0; right: 0; height: 100dvh; width: min(480px, 100vw); background: var(--content-paper); border-left: 1px solid var(--line); box-shadow: -12px 0 40px #293b2910; overflow-y: auto; scrollbar-gutter: stable; overscroll-behavior: contain; }
.detail-card { padding: 32px; }
.detail-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; gap: 12px; }
.detail-title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.detail-title-row h2 { margin-bottom: 0; overflow-wrap: anywhere; }
.detail-description { margin-top: 16px; }
dl { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 12px; font-size: 12px; margin: 24px 0; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
summary { cursor: pointer; font-size: 13px; color: var(--graphite); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--paper); border: 1px solid var(--line); padding: 16px; border-radius: 6px; font-size: 12px; line-height: 1.7; }
.runtime-preview { padding: 20px 0; margin: 20px 0; border-block: 1px solid var(--line); }
.runtime-preview h3 { margin-bottom: 8px; }
.runtime-preview p { font-size: 12px; }
.runtime-preview-button { color: var(--content-paper); background: var(--faded-ink); border-color: var(--faded-ink); }
.runtime-preview-button:hover { background: #365043; }
.app.preview-focused .main { visibility: hidden; }
.app.preview-focused .detail { left: 220px; width: auto; border: 0; box-shadow: none; background: var(--paper); }
.app.preview-focused.sidebar-collapsed .detail { left: 72px; }
.preview-workbench { max-width: 1280px; margin: 0 auto; padding: 32px 40px; }
.preview-workbench-head, .preview-workbench-actions { display: flex; align-items: center; gap: 12px; }
.preview-workbench-head { justify-content: space-between; margin-bottom: 24px; }
.preview-tool { text-decoration: none; font-size: 12px; display: inline-flex; }
.preview-navigation-stage { position: relative; }
.preview-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; width: 36px; height: 52px; padding: 0; border-radius: 8px; background: var(--paper); border: 1px solid var(--line); color: var(--ink); font-size: 30px; line-height: 1; }
.preview-nav-previous { left: -18px; }
.preview-nav-next { right: -18px; }
.preview-nav:disabled { opacity: .3; cursor: default; }
.preview-nav:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.preview-stage { --preview-canvas-height: clamp(360px, 65vh, 680px); display: flex; justify-content: center; height: calc(var(--preview-canvas-height) + 50px); min-height: 410px; padding: 24px; background: #eef1ed; border: 1px solid var(--line); border-radius: 8px; }
.runtime-frame { display: block; border: 1px solid var(--line); border-radius: 6px; background: white; width: 100%; }
.preview-workbench-frame { height: 100%; min-height: 0; }
.preview-mobile-frame { max-width: 390px; }
.preview-context { max-width: 780px; }
.preview-raw { margin-top: 24px; }
.component-prompt { margin: 24px 0; border-top: 1px solid var(--line); padding-top: 20px; }
.component-prompt summary { font-weight: 600; }
.component-effect-text { white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; font-size: 14px; line-height: 1.9; background: transparent; border: 0; padding: 0; }
.component-prompt-help, .component-prompt-evidence, .component-prompt [role="status"] { font-size: 12px; color: var(--muted); line-height: 1.8; }
.component-prompt-evidence { margin-top: 20px; overflow-wrap: anywhere; }
.component-prompt-evidence h4 { margin-bottom: 8px; }
.component-prompt-evidence ul { padding-left: 20px; }
.report-list { display: grid; gap: 24px; }
.report-block { white-space: pre-wrap; background: var(--content-paper); border: 1px solid var(--line); border-radius: 8px; padding: 28px; }
.empty-state { grid-column: 1 / -1; padding: 64px 24px; text-align: center; }
.empty-state h2 { font-size: 20px; }
.empty-state p { max-width: 520px; margin: 12px auto; }
.empty-state details { margin-top: 24px; font-size: 12px; }
.library-empty code { display: block; overflow-wrap: anywhere; }
@media (max-width: 1100px) { .main { padding-inline: 28px; } .toolbar { flex-wrap: wrap; gap: 16px; } .title { flex-basis: 100%; } .search { flex: 1; width: auto; } .asset-rows .asset-card { grid-template-columns: 1fr auto; } .asset-rows .asset-card p, .asset-rows .asset-source { grid-column: 1 / -1; } }
@media (max-width: 640px) {
  .app, .app.sidebar-collapsed { grid-template-columns: minmax(0, 1fr); }
  .sidebar { position: static; height: auto; padding: 16px; border-right: 0; border-bottom: 1px solid var(--line); }
  .sidebar-top { margin-bottom: 16px; } .brand-subtitle { display: none; }
  .nav { display: flex; overflow-x: auto; gap: 4px; scrollbar-width: none; }
  .nav button { width: auto; white-space: nowrap; padding: 8px; font-size: 12px; }
  .nav-mark { display: none; } .app.sidebar-collapsed .brand-wrap { display: block; } .app.sidebar-collapsed .nav { display: none; }
  .main { padding: 24px 16px; } .title h1 { font-size: 23px; } .search { min-width: 0; }
  .metrics { gap: 16px; padding-bottom: 20px; margin-bottom: 24px; } .metric { gap: 5px; }
  .asset-grid { grid-template-columns: 1fr; gap: 12px; } .detail { width: 100%; }
  .app.preview-focused .detail, .app.preview-focused.sidebar-collapsed .detail { left: 0; }
  .preview-workbench, .detail-card { padding: 24px 20px; } .preview-workbench-head { align-items: flex-start; flex-direction: column; }
  .preview-stage { height: calc(var(--preview-canvas-height) + 18px); min-height: 378px; padding: 8px; } .component-controls { gap: 12px; } .control-select { min-width: 90px; max-width: 170px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; scroll-behavior: auto !important; } }
`;
