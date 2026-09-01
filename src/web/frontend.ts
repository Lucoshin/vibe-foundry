export const webAppCss = `
:root {
  --paper: #d8d3c8;
  --panel: rgba(10, 14, 23, 0.72);
  --glass: rgba(14, 20, 32, 0.66);
  --line: rgba(170, 230, 238, 0.2);
  --line-strong: rgba(255, 184, 77, 0.4);
  --graphite: #292d2f;
  --muted: #77746d;
  --rust-note: #a65f46;
  --rust-dark: #7f4636;
  --faded-ink: #496b78;
  --faded-ink-soft: rgba(42, 245, 255, 0.14);
  --accent: var(--faded-ink);
  --accent-soft: rgba(42, 245, 255, 0.1);
  --soft: rgba(7, 11, 20, 0.74);
  --shadow: 0 24px 90px rgba(0, 0, 0, 0.46), 0 0 36px rgba(42, 245, 255, 0.08);
  --code-line: rgba(42, 245, 255, 0.26);
  --code-bg: rgba(42, 245, 255, 0.08);
  --code-text: #36545f;
}
* { box-sizing: border-box; }
html {
  min-height: 100%;
  background: var(--paper);
}
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(ellipse at 24% -16%, rgba(42, 245, 255, 0.16), transparent 48%),
    radial-gradient(ellipse at 84% 0%, rgba(255, 184, 77, 0.13), transparent 44%),
    linear-gradient(135deg, #d8d3c8 0%, #e7e2d8 45%, #cdc7bb 100%);
  color: var(--graphite);
  font-family: "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 0;
  overflow-x: hidden;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.78), transparent 82%);
}
.manuscript-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.62;
}
button,
input,
select {
  font: inherit;
}
.app {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 228px minmax(520px, 1fr) 320px;
  transition: grid-template-columns 180ms ease;
  isolation: isolate;
}
.app.sidebar-collapsed {
  grid-template-columns: 68px minmax(520px, 1fr) 320px;
}
.app.preview-focused {
  grid-template-columns: 228px minmax(260px, 340px) minmax(760px, 1fr);
}
.app.preview-focused.sidebar-collapsed {
  grid-template-columns: 68px minmax(260px, 340px) minmax(760px, 1fr);
}
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 24px 16px;
  border-right: 1px solid var(--line);
  background:
    linear-gradient(180deg, rgba(12, 18, 30, 0.9), rgba(7, 11, 20, 0.74)),
    var(--glass);
  backdrop-filter: blur(24px) saturate(150%);
  overflow: hidden;
  box-shadow: inset -1px 0 0 rgba(255, 184, 77, 0.08);
}
.sidebar-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 26px;
}
.brand-wrap {
  min-width: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 20px;
  font-weight: 720;
  margin-bottom: 6px;
  color: var(--graphite);
  text-shadow: 0 0 22px rgba(42, 245, 255, 0.22);
}
.brand-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(42, 245, 255, 0.44);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(42, 245, 255, 0.16), rgba(255, 184, 77, 0.12)),
    rgba(7, 11, 20, 0.8);
  color: var(--faded-ink);
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 0 22px rgba(42, 245, 255, 0.22), inset 0 0 18px rgba(255, 184, 77, 0.08);
}
.brand-subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.sidebar-toggle {
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(12, 18, 30, 0.82);
  color: var(--muted);
  cursor: pointer;
  box-shadow: inset 0 0 14px rgba(42, 245, 255, 0.05);
}
.sidebar-toggle:hover {
  border-color: var(--rust-note);
  color: var(--rust-note);
  box-shadow: 0 0 18px rgba(255, 184, 77, 0.18);
}
.app.sidebar-collapsed .sidebar {
  padding-inline: 12px;
}
.app.sidebar-collapsed .brand-text,
.app.sidebar-collapsed .brand-subtitle,
.app.sidebar-collapsed .nav-label {
  display: none;
}
.app.sidebar-collapsed .sidebar-top {
  flex-direction: column;
  align-items: center;
}
.app.sidebar-collapsed .sidebar-toggle {
  width: 34px;
}
.nav {
  display: grid;
  gap: 3px;
  scrollbar-width: none;
}
.nav::-webkit-scrollbar {
  display: none;
}
.nav button {
  width: 100%;
  min-height: 38px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 9px;
  text-align: left;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.nav button.active,
.nav button:hover {
  border-color: rgba(42, 245, 255, 0.22);
  background: linear-gradient(90deg, rgba(42, 245, 255, 0.13), rgba(255, 184, 77, 0.06));
  color: var(--graphite);
  box-shadow: inset 0 0 22px rgba(42, 245, 255, 0.06);
}
.nav-mark {
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255, 184, 77, 0.22);
  background:
    radial-gradient(circle at 35% 22%, rgba(42, 245, 255, 0.18), transparent 44%),
    rgba(255, 184, 77, 0.08);
  color: var(--rust-note);
  box-shadow: inset 0 0 14px rgba(255, 184, 77, 0.07);
}
.nav button.active .nav-mark,
.nav button:hover .nav-mark {
  border-color: rgba(42, 245, 255, 0.42);
  color: var(--faded-ink);
  box-shadow: 0 0 18px rgba(42, 245, 255, 0.16), inset 0 0 16px rgba(255, 184, 77, 0.08);
}
.nav-icon {
  display: block;
  width: 18px;
  height: 18px;
}
.nav-icon * {
  vector-effect: non-scaling-stroke;
}
.nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.main {
  padding: 30px;
  min-width: 0;
}
.app.preview-focused .main {
  padding: 22px 14px;
  border-right: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(7, 11, 20, 0.5), rgba(7, 11, 20, 0.18));
}
.app.preview-focused .toolbar {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.app.preview-focused .title h1 {
  font-size: 22px;
}
.app.preview-focused .search {
  width: 100%;
}
.app.preview-focused .metrics {
  display: none;
}
.app.preview-focused .component-controls {
  padding: 8px;
}
.app.preview-focused .control-group {
  flex: 1 1 100%;
}
.app.preview-focused .control-select {
  width: 100%;
}
.app.preview-focused .component-count {
  margin-left: 0;
}
.toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.title h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.15;
  font-weight: 760;
  color: var(--graphite);
  text-shadow: 0 0 34px rgba(42, 245, 255, 0.18);
}
.title p {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.search {
  width: min(390px, 42vw);
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0 13px;
  background: rgba(8, 13, 23, 0.78);
  color: var(--graphite);
  outline: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02), 0 10px 30px rgba(0, 0, 0, 0.18);
}
.search:focus {
  border-color: var(--faded-ink);
  box-shadow: 0 0 0 3px rgba(42, 245, 255, 0.12), 0 0 28px rgba(42, 245, 255, 0.12);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.metrics[hidden],
.component-controls[hidden] {
  display: none;
}
.component-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin: -4px 0 18px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(8, 13, 23, 0.56);
  box-shadow: inset 0 0 22px rgba(42, 245, 255, 0.04);
}
.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.control-group span,
.component-count {
  color: var(--muted);
  font-size: 12px;
}
.control-select {
  height: 32px;
  min-width: 132px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 0 28px 0 10px;
  background: rgba(7, 11, 20, 0.92);
  color: var(--graphite);
  outline: none;
}
.control-select:focus {
  border-color: var(--faded-ink);
  box-shadow: 0 0 0 3px rgba(42, 245, 255, 0.1);
}
.component-count {
  margin-left: auto;
}
.metric,
.asset-card,
.report-block,
.empty-state,
.detail-card {
  background:
    linear-gradient(145deg, rgba(18, 25, 40, 0.74), rgba(8, 12, 22, 0.72)),
    var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(20px) saturate(145%);
}
.metric {
  padding: 15px;
  position: relative;
  overflow: hidden;
}
.metric::after {
  content: "";
  position: absolute;
  inset: auto 14px 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 184, 77, 0.5), transparent);
}
.metric strong {
  display: block;
  font-size: 23px;
  font-weight: 760;
  color: var(--rust-note);
  text-shadow: 0 0 18px rgba(255, 184, 77, 0.22);
}
.metric span {
  color: var(--muted);
  font-size: 12px;
}
.asset-list {
  min-width: 0;
}
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
  align-items: start;
}
.app.preview-focused .asset-grid {
  grid-template-columns: 1fr;
}
.app.preview-focused .asset-card {
  min-height: 148px;
  padding: 14px;
  gap: 9px;
}
.app.preview-focused .asset-card p {
  -webkit-line-clamp: 2;
}
.report-list {
  display: grid;
  gap: 12px;
}
.asset-card {
  --tilt-x: 0deg;
  --tilt-y: 0deg;
  --glow-x: 50%;
  --glow-y: 50%;
  min-height: 204px;
  padding: 16px;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y)) translateY(0);
  transform-style: preserve-3d;
  transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.tracing-card {
  background:
    radial-gradient(circle at var(--glow-x) var(--glow-y), rgba(42, 245, 255, 0.15), transparent 34%),
    linear-gradient(145deg, rgba(25, 32, 47, 0.68), rgba(9, 13, 22, 0.82)),
    var(--glass);
  border-color: rgba(255, 184, 77, 0.18);
}
.tracing-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(120deg, transparent 0%, rgba(255, 184, 77, 0.08) 28%, transparent 45%),
    repeating-linear-gradient(90deg, rgba(42, 245, 255, 0.025) 0 1px, transparent 1px 12px);
  opacity: 0.76;
}
.tracing-card::after {
  content: "";
  position: absolute;
  inset: 1px;
  pointer-events: none;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.045);
  box-shadow: inset 0 0 28px rgba(42, 245, 255, 0.05);
}
.asset-card.active,
.asset-card:hover,
.asset-card:focus {
  border-color: rgba(42, 245, 255, 0.58);
  box-shadow: var(--shadow);
  transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y)) translateY(-5px);
  outline: none;
}
.asset-card > * {
  position: relative;
  z-index: 1;
}
.asset-card-header,
.detail-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.asset-card-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.asset-action {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(42, 245, 255, 0.22);
  border-radius: 7px;
  background: rgba(7, 11, 20, 0.72);
  color: var(--code-text);
  cursor: pointer;
}
.asset-action:hover,
.asset-action:focus {
  border-color: var(--faded-ink);
  color: var(--faded-ink);
  outline: none;
  box-shadow: 0 0 16px rgba(42, 245, 255, 0.16);
}
.asset-action.danger {
  border-color: rgba(255, 107, 44, 0.28);
  color: #ffb08d;
}
.asset-action.danger:hover,
.asset-action.danger:focus {
  border-color: rgba(255, 107, 44, 0.56);
  color: #ff8a5c;
  box-shadow: 0 0 16px rgba(255, 107, 44, 0.18);
}
.asset-action svg {
  width: 15px;
  height: 15px;
  pointer-events: none;
}
.asset-card h2 {
  margin: 0;
  min-width: 0;
  font-size: 14px;
  line-height: 1.28;
  font-weight: 720;
  color: var(--graphite);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.asset-card p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.asset-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: auto;
}
.tag {
  display: inline-flex;
  color: var(--rust-note);
  font-size: 12px;
}
.component-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.component-label {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid rgba(255, 184, 77, 0.26);
  border-radius: 999px;
  background: rgba(255, 184, 77, 0.08);
  color: #ffd48a;
  font-size: 11px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.runtime-preview {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid rgba(42, 245, 255, 0.2);
  border-radius: 8px;
  background: rgba(42, 245, 255, 0.06);
}
.runtime-preview h3 {
  margin: 0 0 8px;
  font-size: 13px;
}
.runtime-preview p {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 12px;
}
.runtime-frame,
.preview-popover-frame {
  display: block;
  width: 100%;
  height: var(--preview-frame-height, 260px);
  border: 1px solid rgba(255, 184, 77, 0.34);
  border-radius: 7px;
  background: #ffffff;
}
.runtime-preview-button {
  width: 100%;
  min-height: 34px;
  border: 1px solid rgba(255, 184, 77, 0.34);
  border-radius: 7px;
  background: rgba(255, 184, 77, 0.1);
  color: var(--rust-note);
  cursor: pointer;
}
.runtime-preview-button:hover,
.runtime-preview-button:focus {
  border-color: var(--faded-ink);
  color: var(--faded-ink);
  outline: none;
}
.language-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 44px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--code-line);
  border-radius: 6px;
  background: var(--code-bg);
  color: var(--code-text);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}
.language-badge[data-language="ts"],
.language-badge[data-language="tsx"] {
  background: rgba(42, 245, 255, 0.11);
  border-color: rgba(42, 245, 255, 0.36);
  color: #36545f;
}
.language-badge[data-language="js"],
.language-badge[data-language="jsx"] {
  background: rgba(255, 184, 77, 0.12);
  border-color: rgba(255, 184, 77, 0.38);
  color: #ffd48a;
}
.language-badge[data-language="md"],
.language-badge[data-language="mdx"] {
  background: rgba(125, 255, 197, 0.1);
  border-color: rgba(125, 255, 197, 0.28);
  color: #b6ffd9;
}
.language-badge[data-language="vue"] {
  background: rgba(65, 184, 131, 0.11);
  border-color: rgba(65, 184, 131, 0.36);
  color: #79f2b8;
}
.energy-bar {
  position: relative;
  flex: 0 0 48px;
  width: 48px;
  height: 8px;
  border: 1px solid rgba(255, 184, 77, 0.34);
  border-radius: 999px;
  background: rgba(255, 184, 77, 0.08);
  overflow: hidden;
  box-shadow: 0 0 14px rgba(255, 184, 77, 0.12);
}
.energy-bar-fill {
  display: block;
  width: var(--reuse-score);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--rust-dark), var(--rust-note), var(--faded-ink));
  box-shadow: 0 0 16px rgba(255, 184, 77, 0.44);
}
.energy-bar[data-reuse-score="unscored"] {
  border-color: rgba(141, 155, 172, 0.28);
  background: rgba(141, 155, 172, 0.08);
}
.component-cue {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--faded-ink);
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
  text-align: left;
}
.component-cue::before {
  content: "";
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--rust-note);
  box-shadow: 0 0 14px rgba(255, 184, 77, 0.68);
  animation: previewPulse 2200ms ease-in-out infinite;
}
.preview-popover {
  position: fixed;
  z-index: 20;
  width: min(380px, calc(100vw - 28px));
  padding: 10px;
  border: 1px solid rgba(42, 245, 255, 0.24);
  border-radius: 8px;
  background: rgba(7, 11, 20, 0.92);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42), 0 0 30px rgba(42, 245, 255, 0.12);
  backdrop-filter: blur(18px) saturate(150%);
}
.preview-popover[hidden] {
  display: none;
}
.preview-popover-title {
  margin: 0 0 8px;
  color: var(--graphite);
  font-size: 12px;
  font-weight: 720;
}
.preview-popover-frame {
  --preview-frame-height: 240px;
}
.detail {
  padding: 30px 20px;
  border-left: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(7, 11, 20, 0.82), rgba(10, 14, 23, 0.74));
  min-width: 0;
  backdrop-filter: blur(24px);
}
.app.preview-focused .detail {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 22px 24px;
  overflow: auto;
  border-left: 0;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(42, 245, 255, 0.12), transparent 52%),
    linear-gradient(180deg, rgba(7, 11, 20, 0.92), rgba(10, 14, 23, 0.78));
}
.detail-card {
  padding: 18px;
  box-shadow: var(--shadow);
}
.preview-workbench {
  min-height: calc(100vh - 44px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-color: rgba(42, 245, 255, 0.34);
}
.preview-workbench-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.preview-kicker {
  margin: 0 0 7px;
  color: var(--rust-note);
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0.08em;
}
.preview-workbench-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.preview-tool {
  min-height: 32px;
  border: 1px solid rgba(42, 245, 255, 0.26);
  border-radius: 7px;
  padding: 0 11px;
  background: rgba(42, 245, 255, 0.08);
  color: var(--code-text);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.preview-tool:hover,
.preview-tool:focus {
  border-color: var(--faded-ink);
  color: var(--faded-ink);
  outline: none;
  box-shadow: 0 0 18px rgba(42, 245, 255, 0.14);
}
.preview-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 520px;
  padding: 14px;
  border: 1px solid rgba(255, 184, 77, 0.28);
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(255, 184, 77, 0.08), transparent 36%),
    rgba(1, 5, 12, 0.58);
}
.preview-workbench-frame {
  --preview-frame-height: clamp(520px, 68vh, 820px);
  height: var(--preview-frame-height);
  border-color: rgba(255, 184, 77, 0.5);
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
}
.preview-mobile-frame {
  width: min(390px, 100%);
  display: block;
  margin-inline: auto;
}
.preview-context {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(240px, 1.2fr);
  gap: 12px;
}
.preview-context dl {
  margin: 0;
}
.preview-raw summary {
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
}
.detail-card h2 {
  margin: 0 0 8px;
  font-size: 20px;
  line-height: 1.2;
  overflow-wrap: anywhere;
  color: var(--graphite);
}
.detail-card p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}
.detail-card dl {
  margin: 16px 0;
}
.detail-card dt {
  color: var(--muted);
  font-size: 12px;
  margin-top: 13px;
}
.detail-card dd {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
pre {
  margin: 12px 0 0;
  padding: 12px;
  border-radius: 8px;
  background: rgba(1, 5, 12, 0.7);
  border: 1px solid rgba(42, 245, 255, 0.12);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.45;
  color: #36545f;
}
@keyframes previewPulse {
  0%, 70%, 100% { transform: scale(1); opacity: 1; }
  82% { transform: scale(1.45); opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  .component-cue::before {
    animation: none;
  }
  .app,
  .asset-card {
    transition: none;
  }
}
.report-block {
  padding: 18px;
  white-space: pre-wrap;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.58;
}
.report-block strong {
  color: var(--graphite);
  font-size: 16px;
}
.empty-state {
  padding: 28px;
}

/* Stream-of-consciousness manuscript */
:root {
  --reading-surface: #f1f2ef;
  --content-paper: #fbfbf9;
  --paper: var(--reading-surface);
  --paper-light: #f7f7f4;
  --tracing-paper: rgba(251, 251, 249, 0.96);
  --graphite: #25292b;
  --muted: #666b6c;
  --faded-ink: #496b78;
  --faded-ink-soft: rgba(73, 107, 120, 0.12);
  --rust-note: #a65f46;
  --rust-dark: #7f4636;
  --line: rgba(61, 61, 57, 0.18);
  --line-strong: rgba(61, 61, 57, 0.34);
  --panel: var(--tracing-paper);
  --glass: rgba(239, 235, 225, 0.88);
  --soft: rgba(231, 226, 216, 0.78);
  --shadow: 0 1px 0 rgba(255, 255, 255, 0.7), 0 18px 45px rgba(67, 62, 53, 0.09);
  --code-line: rgba(73, 107, 120, 0.26);
  --code-bg: rgba(73, 107, 120, 0.08);
  --code-text: #36545f;
}
html { background: var(--paper); }
body {
  background: linear-gradient(135deg, #f4f5f2, var(--reading-surface));
  color: var(--graphite);
  font-family: "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  line-height: 1.55;
}
body::before {
  background-image: radial-gradient(rgba(51, 49, 44, 0.1) 0.55px, transparent 0.7px);
  background-size: 8px 8px;
  opacity: 0.035;
  mask-image: none;
}
.manuscript-canvas { mix-blend-mode: multiply; opacity: 0.055; }
.app { grid-template-columns: 236px minmax(520px, 1fr) 334px; }
.sidebar {
  padding: 30px 18px;
  border-right: 1px solid var(--line-strong);
  background: rgba(226, 221, 210, 0.74);
  backdrop-filter: blur(12px);
  box-shadow: 8px 0 28px rgba(67, 62, 53, 0.035);
}
.brand { color: var(--graphite); font-weight: 600; letter-spacing: 0.035em; text-shadow: none; }
.brand-mark {
  border: 1px solid var(--graphite);
  border-radius: 50%;
  background: transparent;
  color: var(--graphite);
  box-shadow: none;
  transform: rotate(-5deg);
}
.brand-subtitle { font-style: italic; }
.sidebar-toggle,
.asset-tool,
.preview-action,
.preview-workbench-actions button {
  border-radius: 2px;
  background: transparent;
  box-shadow: none;
}
.sidebar-toggle:hover { border-color: var(--rust-note); color: var(--rust-note); box-shadow: none; }
.nav { gap: 7px; }
.nav button { border-radius: 0; padding-inline: 7px; }
.nav button.active,
.nav button:hover {
  border-color: transparent;
  border-bottom-color: var(--line-strong);
  background: linear-gradient(90deg, var(--faded-ink-soft), transparent 72%);
  color: var(--graphite);
  box-shadow: none;
}
.nav-mark {
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--faded-ink);
  box-shadow: none;
}
.nav button.active .nav-mark,
.nav button:hover .nav-mark { color: var(--rust-note); box-shadow: none; }
.main { padding: 38px 34px; }
.toolbar { margin-bottom: 32px; align-items: flex-end; }
.title h1 {
  color: var(--graphite);
  font-family: "Noto Serif SC", "Songti SC", Georgia, serif;
  font-size: 34px;
  font-weight: 560;
  letter-spacing: 0.025em;
  text-shadow: none;
}
.title p { font-style: italic; }
.search,
.control-select {
  border: 0;
  border-bottom: 1px solid var(--line-strong);
  border-radius: 0;
  background: transparent;
  color: var(--graphite);
  box-shadow: none;
}
.search:focus,
.control-select:focus { border-color: var(--faded-ink); box-shadow: 0 2px 0 var(--faded-ink-soft); }
.component-controls { border-radius: 2px; background: rgba(238, 234, 225, 0.56); box-shadow: none; }
.metric,
.asset-card,
.report-block,
.empty-state,
.detail-card {
  border: 1px solid var(--line);
  border-radius: 2px;
  background: var(--content-paper);
  box-shadow: var(--shadow);
  backdrop-filter: blur(6px);
}
.metrics { gap: 18px; }
.metric { min-height: 104px; padding: 20px 18px; }
.metric:nth-child(2n) { transform: translateY(7px) rotate(0.25deg); }
.metric::after { inset: auto 18px 11px; background: var(--rust-note); opacity: 0.38; }
.metric strong { color: var(--graphite); font-weight: 520; text-shadow: none; }
.asset-grid { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 22px 18px; }
.asset-card {
  min-height: 218px;
  padding: 20px 18px 17px;
  transform: translateY(var(--drift-y, 0)) rotate(var(--drift-r, 0deg));
  transition: transform 220ms ease, border-color 220ms ease, background 220ms ease;
}
.asset-card:nth-child(3n + 1) { --drift-y: 5px; --drift-r: -0.28deg; }
.asset-card:nth-child(3n + 2) { --drift-y: -3px; --drift-r: 0.22deg; }
.asset-card::before {
  background:
    linear-gradient(90deg, var(--rust-note) 0 28px, transparent 28px) 15px 13px / 58px 1px no-repeat,
    linear-gradient(var(--line), var(--line)) 15px 13px / 1px 22px no-repeat;
  opacity: 0.7;
}
.asset-card::after {
  content: attr(data-index);
  position: absolute;
  right: 12px;
  bottom: 8px;
  color: var(--muted);
  font: italic 10px/1 Georgia, serif;
  background: none;
  opacity: 0.6;
}
.asset-card.active,
.asset-card:hover,
.asset-card:focus {
  border-color: var(--faded-ink);
  background: rgba(249, 247, 241, 0.94);
  box-shadow: 0 20px 48px rgba(67, 62, 53, 0.12);
  transform: translateY(-5px) rotate(0deg);
}
.asset-card h2 { color: var(--graphite); font-weight: 600; }
.language-badge,
.tag { border-radius: 999px; background: transparent; color: var(--faded-ink); border-color: rgba(73, 107, 120, 0.28); }
.language-badge[data-language="js"],
.language-badge[data-language="jsx"],
.language-badge[data-language="ts"],
.language-badge[data-language="tsx"],
.language-badge[data-language="md"],
.language-badge[data-language="mdx"],
.language-badge[data-language="vue"] {
  background: rgba(73, 107, 120, 0.08);
  border-color: rgba(73, 107, 120, 0.24);
  color: #4f6871;
}
.component-label {
  border-color: rgba(90, 96, 97, 0.2);
  background: rgba(90, 96, 97, 0.045);
  color: var(--muted);
}
.asset-action {
  border-color: rgba(73, 107, 120, 0.34);
  border-radius: 50%;
  background: rgba(73, 107, 120, 0.08);
  color: var(--faded-ink);
}
.asset-action:hover,
.asset-action:focus { border-color: var(--faded-ink); color: var(--graphite); box-shadow: none; }
.asset-action.danger { border-color: rgba(166, 95, 70, 0.32); color: var(--rust-note); background: rgba(166, 95, 70, 0.06); }
.asset-action.danger:hover,
.asset-action.danger:focus { border-color: var(--rust-note); color: var(--rust-dark); box-shadow: none; }
.energy-track { background: rgba(61, 61, 57, 0.1); }
.energy-fill { background: linear-gradient(90deg, var(--faded-ink), var(--rust-note)); }
.detail {
  border-left: 1px solid var(--line-strong);
  background: rgba(218, 213, 202, 0.4);
}
.detail-card { position: relative; }
.detail-card::before,
.preview-workbench::before {
  content: "field note";
  position: absolute;
  right: 14px;
  top: -10px;
  color: var(--rust-note);
  font: italic 11px/1 Georgia, serif;
  transform: rotate(3deg);
}
.preview-workbench {
  position: relative;
  background: rgba(244, 241, 233, 0.93);
  border: 1px solid var(--line-strong);
  border-radius: 2px;
  box-shadow: -8px 9px 0 rgba(226, 221, 210, 0.9), -9px 10px 0 var(--line), 0 28px 70px rgba(67, 62, 53, 0.12);
}
.preview-stage { border-radius: 0; background: #f7f5ef; border-color: var(--line); }
.preview-workbench-frame { border-color: var(--line-strong); box-shadow: none; }
.report-block { line-height: 1.75; }
pre {
  border: 1px solid var(--line);
  border-radius: 1px;
  background: rgba(232, 229, 220, 0.82);
  color: #40535a;
  box-shadow: inset 3px 0 0 rgba(73, 107, 120, 0.22);
}
@keyframes manuscript-arrive {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
.toolbar, .metrics, .component-controls, .asset-list, .detail { animation: manuscript-arrive 500ms ease both; }
.metrics { animation-delay: 45ms; }
.asset-list { animation-delay: 90ms; }
.detail { animation-delay: 130ms; }
@media (max-width: 1100px) {
  .app {
    grid-template-columns: 190px minmax(420px, 1fr);
  }
  .app.sidebar-collapsed {
    grid-template-columns: 68px minmax(420px, 1fr);
  }
  .app.preview-focused,
  .app.preview-focused.sidebar-collapsed {
    grid-template-columns: 190px minmax(0, 1fr);
  }
  .app.preview-focused .main {
    grid-column: 1;
  }
  .app.preview-focused .detail {
    grid-column: 2;
    height: auto;
    min-height: 100vh;
  }
  .detail {
    grid-column: 1 / -1;
    border-left: 0;
    border-top: 1px solid var(--line);
  }
  .metrics {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}
@media (max-width: 640px) {
  .app { grid-template-columns: 1fr; }
  .app.sidebar-collapsed { grid-template-columns: 1fr; }
  .sidebar {
    position: static;
    height: auto;
    padding: 16px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .app.sidebar-collapsed .brand-text,
  .app.sidebar-collapsed .brand-subtitle,
  .app.sidebar-collapsed .nav-label {
    display: inline;
  }
  .app.sidebar-collapsed .nav {
    display: none;
  }
  .sidebar-top {
    margin-bottom: 14px;
  }
  .app.sidebar-collapsed .sidebar-top {
    flex-direction: row;
    align-items: flex-start;
  }
  .nav { display: flex; overflow-x: auto; }
  .nav button {
    width: auto;
    flex: 0 0 auto;
    white-space: nowrap;
  }
  .main {
    padding: 18px;
  }
  .toolbar { flex-direction: column; align-items: stretch; }
  .search { width: 100%; }
  .metrics { grid-template-columns: 1fr; }
  .component-controls { align-items: stretch; }
  .control-group { flex: 1 1 100%; }
  .control-select { width: 100%; }
  .component-count { margin-left: 0; }
  .asset-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  .title h1, .asset-card p { overflow-wrap: anywhere; }
  .app.preview-focused .main,
  .app.preview-focused .detail {
    grid-column: auto;
  }
  .app.preview-focused .asset-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
  .preview-workbench {
    min-height: auto;
  }
  .preview-workbench-head,
  .preview-context {
    grid-template-columns: 1fr;
    flex-direction: column;
  }
  .preview-workbench-frame {
    --preview-frame-height: 420px;
  }
  .detail {
    padding: 18px;
  }
}
`;

const webAppJs = `
const state = {
  model: null,
  category: 'overview',
  query: '',
  selected: null,
  particleRaf: null,
  componentLabelFilter: 'all',
  componentProjectFilter: 'all',
  componentLabelOverrides: {},
  deletedComponentIds: new Set(),
  activePreviewAssetId: null,
  previewHoverTimer: null
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
function reuseScoreFor(asset) {
  const potential = String(asset.raw?.reusePotential || '').toLowerCase();
  const byPotential = {
    high: { key: 'high', score: 92, label: '高复用' },
    medium: { key: 'medium', score: 68, label: '中复用' },
    low: { key: 'low', score: 36, label: '低复用' },
  };
  if (byPotential[potential]) return byPotential[potential];
  const rawScore = Number(asset.raw?.score);
  if (Number.isFinite(rawScore) && rawScore > 0) {
    const score = Math.max(1, Math.min(100, Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)));
    return { key: 'scored', score, label: score + '%' };
  }
  return { key: 'unscored', score: 0, label: '未评分' };
}
function renderEnergyBar(asset) {
  const reuse = reuseScoreFor(asset);
  return '<span class="energy-bar" data-reuse-score="' + escapeHtml(reuse.key) + '" title="复用价值：' + escapeHtml(reuse.label) + '" style="--reuse-score: ' + reuse.score + '%">' +
    '<span class="energy-bar-fill"></span>' +
    '</span>';
}
function renderLanguageBadge(asset) {
  return '<span class="language-badge" data-language="' + escapeHtml(asset.language) + '" aria-label="编程语言">' +
    escapeHtml(asset.languageLabel || asset.language || 'Unknown') + '</span>';
}
const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5 6.2 14l9.9-9.9 3.8 3.8L10 17.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m14.8 5.4 3.8 3.8M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const deleteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8h11M10 8V5.8h4V8M8.2 8l.7 11h6.2l.7-11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 11.5v4M13.5 11.5v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
function componentStorageKey() {
  return 'vibe-foundry:component-view:' + (state.model?.project?.sourceProject || 'unknown-project');
}
function loadComponentState() {
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
  const labels = componentLabelsFor(asset);
  if (labels.length === 0) return '';
  return '<div class="component-labels">' + labels.map((label) =>
    '<span class="component-label">' + escapeHtml(label) + '</span>'
  ).join('') + '</div>';
}
function renderAssetTools(asset) {
  if (asset.category !== 'components') {
    return renderEnergyBar(asset);
  }
  return '<div class="asset-card-tools">' +
    renderEnergyBar(asset) +
    '<button class="asset-action" type="button" data-action="edit-labels" data-component-id="' + escapeHtml(asset.id) + '" title="编辑标签" aria-label="编辑 ' + escapeHtml(asset.name) + ' 标签">' + editIcon + '</button>' +
    '<button class="asset-action danger" type="button" data-action="delete-component" data-component-id="' + escapeHtml(asset.id) + '" title="删除组件" aria-label="删除 ' + escapeHtml(asset.name) + '">' + deleteIcon + '</button>' +
    '</div>';
}
function initManuscriptField() {
  const canvas = byId('manuscript-canvas');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let particles = [];
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(34, Math.floor((window.innerWidth * window.innerHeight) / 26000));
    particles = Array.from({ length: count }, (_, index) => ({
      x: (index * 89 % 100) / 100 * window.innerWidth,
      y: (index * 53 % 100) / 100 * window.innerHeight,
      radius: 0.8 + (index % 5) * 0.26,
      phase: index * 0.37,
      speed: 0.18 + (index % 7) * 0.035,
    }));
    draw(0);
  }
  function draw(time) {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const particle of particles) {
      const drift = reducedMotion ? 0 : Math.sin(time * 0.00035 * particle.speed + particle.phase) * 18;
      const x = particle.x + drift;
      const y = particle.y + Math.cos(time * 0.00028 * particle.speed + particle.phase) * 12;
      context.beginPath();
      context.fillStyle = particle.radius > 1.5 ? 'rgba(166, 95, 70, 0.26)' : 'rgba(55, 58, 57, 0.2)';
      context.arc(x, y, particle.radius, 0, Math.PI * 2);
      context.fill();
      particle.currentX = x;
      particle.currentY = y;
    }
    context.lineWidth = 1;
    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const a = particles[i];
        const b = particles[j];
        const distance = Math.hypot(a.currentX - b.currentX, a.currentY - b.currentY);
        if (distance < 120) {
          context.strokeStyle = 'rgba(55, 58, 57, ' + (0.1 * (1 - distance / 120)).toFixed(3) + ')';
          context.beginPath();
          context.moveTo(a.currentX, a.currentY);
          context.lineTo(b.currentX, b.currentY);
          context.stroke();
        }
      }
    }
  }
  function animate(time) {
    draw(time);
    state.particleRaf = window.requestAnimationFrame(animate);
  }
  resize();
  window.addEventListener('resize', resize);
  if (!reducedMotion) {
    state.particleRaf = window.requestAnimationFrame(animate);
  }
}
function componentPreviewIsBuildable(componentPreview) {
  return Boolean(componentPreview && componentPreview.status !== 'blocked' && componentPreview.buildable !== false);
}
function renderCardPreview(asset) {
  if (!asset.interactionPreview) return '';
  const previewAttributes = componentPreviewIsBuildable(asset.componentPreview)
    ? ' data-action="show-component-preview" data-component-id="' + escapeHtml(asset.id) + '"'
    : '';
  return '<button class="component-cue" type="button"' + previewAttributes + '>组件交互预览</button>';
}
function renderComponentRuntimePreview(asset) {
  const componentPreview = asset.componentPreview;
  if (!componentPreview) return '';
  const blockers = componentPreview.blockers?.length
    ? '<p>' + componentPreview.blockers.map((blocker) => escapeHtml(blocker)).join('；') + '</p>'
    : '';
  const frameUrl = previewEmbedUrlFor(componentPreview);
  const content = componentPreviewIsBuildable(componentPreview) && frameUrl
    ? state.activePreviewAssetId === asset.id
      ? '<iframe class="runtime-frame" title="' + escapeHtml(asset.name) + ' 真实组件预览" src="' + escapeHtml(frameUrl) + '" loading="lazy"></iframe>'
      : '<button class="runtime-preview-button" type="button" data-action="show-component-preview" data-component-id="' + escapeHtml(asset.id) + '">在这里查看预览</button>'
    : blockers;
  return '<section class="runtime-preview" aria-label="真实组件预览">' +
    '<h3>真实组件预览</h3>' +
    '<p>Runtime：' + escapeHtml(componentPreview.runtime || 'unknown') + ' · 状态：' + escapeHtml(componentPreview.status || 'unknown') + '</p>' +
    content +
    '</section>';
}
function renderPreviewWorkbench(asset) {
  const componentPreview = asset.componentPreview;
  const frameUrl = previewEmbedUrlFor(componentPreview);
  const blockers = componentPreview?.blockers?.length
    ? '<p>' + componentPreview.blockers.map((blocker) => escapeHtml(blocker)).join('；') + '</p>'
    : '';
  const viewportClass = /Mobile$/i.test(asset.name) ? ' preview-mobile-frame' : '';
  const stage = componentPreviewIsBuildable(componentPreview) && frameUrl
    ? '<div class="preview-stage">' +
      '<iframe class="runtime-frame preview-workbench-frame' + viewportClass + '" data-preview-frame title="' + escapeHtml(asset.name) + ' 组件预览" src="' + escapeHtml(frameUrl) + '" loading="eager"></iframe>' +
      '</div>'
    : '<div class="preview-stage">' + blockers + '</div>';
  const openLink = frameUrl
    ? '<a class="preview-tool" href="' + escapeHtml(frameUrl) + '" target="_blank" rel="noreferrer">独立打开</a>'
    : '';
  return '<section class="detail-card preview-workbench" aria-label="组件预览">' +
    '<div class="preview-workbench-head">' +
    '<div>' +
    '<div class="detail-title-row"><h2>' + escapeHtml(asset.name) + '</h2>' + renderLanguageBadge(asset) + '</div>' +
    renderComponentLabelChips(asset) +
    '</div>' +
    '<div class="preview-workbench-actions">' +
    '<button class="preview-tool" type="button" data-action="refresh-preview">刷新预览</button>' +
    openLink +
    '</div>' +
    '</div>' +
    stage +
    '<div class="preview-context">' +
    '<dl>' +
    '<dt>类型</dt><dd>' + escapeHtml(asset.kind) + '</dd>' +
    '<dt>语言</dt><dd>' + escapeHtml(asset.languageLabel) + '</dd>' +
    '<dt>来源</dt><dd>' + escapeHtml(asset.source || '生成的资产包') + '</dd>' +
    '<dt>Runtime</dt><dd>' + escapeHtml(componentPreview?.runtime || 'unknown') + ' · ' + escapeHtml(componentPreview?.status || 'unknown') + '</dd>' +
    '</dl>' +
    '</div>' +
    '<details class="preview-raw"><summary>查看原始 JSON</summary><pre>' + escapeHtml(JSON.stringify(asset.raw, null, 2)) + '</pre></details>' +
    '</section>';
}
function previewEmbedUrlFor(componentPreview) {
  const url = componentPreview?.previewUrl || componentPreview?.browserUrl || '';
  if (!url) return '';
  return url + (url.includes('?') ? '&' : '?') + 'embed=1';
}
function componentAssetById(componentId) {
  return state.model.assets.find((asset) => asset.id === componentId && asset.category === 'components') || null;
}
function showComponentPreview(componentId) {
  const asset = componentAssetById(componentId);
  if (!asset || !componentPreviewIsBuildable(asset.componentPreview)) return;
  state.selected = asset;
  state.activePreviewAssetId = asset.id;
  syncPreviewFocusMode();
  renderDetail();
  renderList();
}
function hidePreviewPopover() {
  const popover = byId('preview-popover');
  if (!popover) return;
  popover.hidden = true;
  popover.innerHTML = '';
}
function showPreviewPopover(asset, anchor) {
  if (!componentPreviewIsBuildable(asset?.componentPreview)) return;
  const frameUrl = previewEmbedUrlFor(asset.componentPreview);
  if (!frameUrl) return;
  const popover = byId('preview-popover');
  if (!popover) return;
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = 380;
  const gap = 12;
  const preferredRight = rect.right + gap;
  const preferredLeft = rect.left - popoverWidth - gap;
  const left = preferredRight + popoverWidth <= window.innerWidth - 14
    ? preferredRight
    : Math.max(14, preferredLeft);
  const top = Math.min(window.innerHeight - 300, Math.max(14, rect.top + 10));
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
  popover.innerHTML =
    '<p class="preview-popover-title">' + escapeHtml(asset.name) + '</p>' +
    '<iframe class="preview-popover-frame" title="' + escapeHtml(asset.name) + ' 悬浮预览" src="' + escapeHtml(frameUrl) + '" loading="lazy"></iframe>';
  popover.hidden = false;
}
function bindComponentPreviewActions(scope) {
  scope.querySelectorAll('[data-action="show-component-preview"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      showComponentPreview(button.dataset.componentId);
    });
  });
}
function bindPreviewWorkbenchActions(scope) {
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
  const focused = state.selected?.id === state.activePreviewAssetId && componentPreviewIsBuildable(state.selected?.componentPreview);
  app.classList.toggle('preview-focused', Boolean(focused));
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
  byId('nav').innerHTML = state.model.categories.map((category) => {
    const label = categoryLabels[category.id] || category.label;
    const icon = categoryIcons[category.id] || '';
    return '<button class="' + (state.category === category.id ? 'active' : '') + '" data-category="' + category.id + '" title="' + escapeHtml(label) + '">' +
      '<span class="nav-mark" aria-hidden="true">' + icon + '</span>' +
      '<span class="nav-label">' + escapeHtml(label) + '</span>' +
      '</button>';
  }).join('');
  document.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.category = button.dataset.category;
      state.selected = null;
      state.activePreviewAssetId = null;
      render();
    });
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
function renderList() {
  const list = byId('asset-list');
  if (state.category === 'reports') {
    list.className = 'asset-list report-list';
    list.innerHTML =
      '<section class="report-block"><strong>复用报告</strong>\\n\\n' + escapeHtml(state.model.reports.reuse) + '</section>' +
      '<section class="report-block"><strong>Agent 规则</strong>\\n\\n' + escapeHtml(state.model.reports.rules) + '</section>';
    return;
  }
  list.className = 'asset-list asset-grid';
  const assets = filteredAssets();
  if (!state.selected && assets.length > 0) state.selected = assets[0];
  list.innerHTML = assets.map((asset, index) =>
    '<article class="asset-card tracing-card ' + (state.selected?.id === asset.id ? 'active' : '') + '" tabindex="0" data-index="' + index + '">' +
    '<div class="asset-card-header"><h2>' + escapeHtml(asset.name) + '</h2>' + renderAssetTools(asset) + '</div>' +
    '<p>' + escapeHtml(asset.description) + '</p>' +
    '<div class="asset-meta">' + renderLanguageBadge(asset) + '<span class="tag">' + escapeHtml(categoryLabels[asset.category] || asset.kind) + '</span></div>' +
    renderComponentLabelChips(asset) +
    renderCardPreview(asset) +
    '</article>'
  ).join('') || '<section class="empty-state">当前视图没有匹配的资产。</section>';
  document.querySelectorAll('[data-index]').forEach((card) => {
    card.addEventListener('click', () => {
      const asset = assets[Number(card.dataset.index)];
      state.selected = asset;
      state.activePreviewAssetId = componentPreviewIsBuildable(asset.componentPreview) ? asset.id : null;
      syncPreviewFocusMode();
      renderDetail();
      renderList();
    });
    card.addEventListener('mouseenter', () => {
      const asset = assets[Number(card.dataset.index)];
      window.clearTimeout(state.previewHoverTimer);
      state.previewHoverTimer = window.setTimeout(() => showPreviewPopover(asset, card), 360);
    });
    card.addEventListener('mouseleave', () => {
      window.clearTimeout(state.previewHoverTimer);
      hidePreviewPopover();
    });
  });
  bindComponentPreviewActions(document);
  document.querySelectorAll('[data-action="edit-labels"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      editComponentLabels(button.dataset.componentId);
    });
  });
  document.querySelectorAll('[data-action="delete-component"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteComponent(button.dataset.componentId);
    });
  });
}
function editComponentLabels(componentId) {
  const asset = state.model.assets.find((candidate) => candidate.id === componentId);
  if (!asset || asset.category !== 'components') return;
  const currentLabels = componentLabelsFor(asset);
  const value = window.prompt('编辑标签，用逗号分隔', currentLabels.join(', '));
  if (value === null) return;
  state.componentLabelOverrides[componentId] = parseLabelInput(value);
  saveComponentState();
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
  render();
}
function renderDetail() {
  const asset = state.selected;
  if (!asset) {
    syncPreviewFocusMode();
    byId('asset-detail').innerHTML = '<section class="detail-card"><h2>资产详情</h2><p>选择一个资产，查看来源、复用建议和原始 JSON。</p></section>';
    return;
  }
  syncPreviewFocusMode();
  const detail = byId('asset-detail');
  if (state.activePreviewAssetId === asset.id && componentPreviewIsBuildable(asset.componentPreview)) {
    detail.innerHTML = renderPreviewWorkbench(asset);
    bindPreviewWorkbenchActions(detail);
    return;
  }
  detail.innerHTML =
    '<section class="detail-card">' +
    '<div class="detail-title-row"><h2>' + escapeHtml(asset.name) + '</h2>' + renderLanguageBadge(asset) + '</div>' +
    renderComponentLabelChips(asset) +
    renderComponentRuntimePreview(asset) +
    '<dl>' +
    '<dt>类型</dt><dd>' + escapeHtml(asset.kind) + '</dd>' +
    '<dt>语言</dt><dd>' + escapeHtml(asset.languageLabel) + '</dd>' +
    '<dt>来源</dt><dd>' + escapeHtml(asset.source || '生成的资产包') + '</dd>' +
    '<dt>复用建议</dt><dd>' + escapeHtml(asset.description) + '</dd>' +
    '</dl>' +
    '<pre>' + escapeHtml(JSON.stringify(asset.raw, null, 2)) + '</pre>' +
    '</section>';
  bindComponentPreviewActions(detail);
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
  document.body.innerHTML = '<main class="empty-state" style="margin:40px"><h1>VibeFoundry</h1><p>集中资产库中没有找到对应资产包。请先运行 <code>node dist/cli.js distill &lt;project-root&gt;</code>。</p></main>';
}
function render() {
  if (state.model?.isError) { renderMissing(); return; }
  syncPreviewFocusMode();
  renderNav();
  renderMetrics();
  renderComponentControls();
  renderList();
  renderDetail();
  byId('project-name').textContent = state.model.project.sourceProject;
  byId('project-meta').textContent = '本地资产库 · 生成时间 ' + (state.model.project.generatedAt || '未知');
}
initManuscriptField();
byId('sidebar-toggle').addEventListener('click', toggleSidebar);
fetch('/api/assets')
  .then((response) => response.json())
  .then((model) => {
    state.model = model;
    loadComponentState();
    byId('search').addEventListener('input', (event) => {
      state.query = event.target.value;
      state.selected = null;
      state.activePreviewAssetId = null;
      render();
    });
    render();
  });
`;

export function renderWebAppHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VibeFoundry 资产浏览器</title>
  <style>${webAppCss}</style>
</head>
<body>
  <canvas id="manuscript-canvas" class="manuscript-canvas" aria-hidden="true"></canvas>
  <div id="app" class="app">
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="brand-wrap">
          <div class="brand"><span class="brand-mark" aria-hidden="true">VF</span><span class="brand-text">VibeFoundry</span></div>
          <p class="brand-subtitle">把项目经验炼化成可复用资产</p>
        </div>
        <button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-expanded="true" aria-controls="nav" title="收起侧边栏">&lt;</button>
      </div>
      <nav id="nav" class="nav" aria-label="资产分类">
        <button class="active"><span class="nav-mark" aria-hidden="true"><svg class="nav-icon" data-icon="overview" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".72"/><circle cx="7" cy="8" r="1.45" fill="currentColor"/><circle cx="16.5" cy="9.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="16" r="1.1" fill="currentColor"/></svg></span><span class="nav-label">资产总览</span></button>
        <button><span class="nav-mark" aria-hidden="true"><svg class="nav-icon" data-icon="reports" viewBox="0 0 24 24"><path d="M7 4.5h7l3 3v12H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 4.5v3h3M9.5 16.5h5M9.5 13h6M9.5 9.5h2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 18.5h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></svg></span><span class="nav-label">复用报告</span></button>
      </nav>
    </aside>
    <main class="main">
      <header class="toolbar">
        <div class="title">
          <h1 id="project-name">VibeFoundry</h1>
          <p id="project-meta">本地资产库</p>
        </div>
        <input id="search" class="search" type="search" placeholder="搜索资产、来源或复用建议">
      </header>
      <section id="metrics" class="metrics"></section>
      <section id="component-controls" class="component-controls" hidden></section>
      <section id="asset-list" class="asset-list asset-grid"></section>
    </main>
    <aside id="asset-detail" class="detail" aria-label="资产详情"></aside>
    <div id="preview-popover" class="preview-popover" hidden></div>
  </div>
  <script>${webAppJs}</script>
</body>
</html>`;
}
