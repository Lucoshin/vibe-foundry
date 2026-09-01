import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("web frontend module", () => {
  it("exports the Chinese manuscript asset browser shell separately from the server", async () => {
    const { renderWebAppHtml, webAppCss } = await import("../../dist/web/frontend.js");

    const html = renderWebAppHtml();

    assert.match(html, /VibeFoundry/);
    assert.match(html, /资产总览/);
    assert.match(html, /搜索资产、来源或复用建议/);
    assert.match(html, /asset-detail/);
    assert.match(html, /复用报告/);
    assert.match(html, /集中资产库中没有找到对应资产包/);
    assert.doesNotMatch(html, /没有找到 \.vibe-foundry 资产包/);
    assert.match(html, /lang="zh-CN"/);
    assert.match(html, /manuscript-canvas/);
    assert.match(webAppCss, /--paper/);
    assert.match(webAppCss, /--graphite/);
    assert.match(webAppCss, /--faded-ink/);
    assert.match(webAppCss, /--rust-note/);
    assert.match(webAppCss, /--reading-surface/);
    assert.match(webAppCss, /--content-paper/);
    assert.match(webAppCss, /font-family: "Noto Sans SC"/);
    assert.match(webAppCss, /\.title h1[\s\S]*font-family: "Noto Serif SC"/);
    assert.match(webAppCss, /radial-gradient/);
    assert.match(webAppCss, /1px solid/);
    assert.match(webAppCss, /--glass/);
    assert.match(webAppCss, /backdrop-filter/);
    assert.match(webAppCss, /box-shadow/);
  });

  it("renders language badges and component interaction preview affordances", async () => {
    const { renderWebAppHtml, webAppCss } = await import("../../dist/web/frontend.js");

    const html = renderWebAppHtml();

    assert.match(html, /language-badge/);
    assert.match(html, /asset-grid/);
    assert.match(html, /asset-card/);
    assert.match(html, /tracing-card/);
    assert.match(html, /energy-bar/);
    assert.match(html, /data-reuse-score/);
    assert.match(html, /组件交互预览/);
    assert.match(html, /interactionPreview/);
    assert.doesNotMatch(html, /renderInteractionPreview/);
    assert.match(html, /componentPreview/);
    assert.match(html, /renderComponentRuntimePreview/);
    assert.match(html, /真实组件预览/);
    assert.match(html, /class="runtime-frame"/);
    assert.match(html, /iframe/);
    assert.match(html, /previewEmbedUrlFor/);
    assert.match(html, /preview-popover/);
    assert.match(html, /const popoverWidth = 380/);
    assert.match(html, /const gap = 12/);
    assert.match(html, /const preferredRight = rect\.right \+ gap/);
    assert.match(html, /const preferredLeft = rect\.left - popoverWidth - gap/);
    assert.doesNotMatch(html, /rect\.right - 380/);
    assert.match(html, /data-action="show-component-preview"/);
    assert.match(html, /componentPreviewIsBuildable/);
    assert.doesNotMatch(html, /启动命令/);
    assert.doesNotMatch(html, /预览链接/);
    assert.doesNotMatch(html, /vibe-foundry preview/);
    assert.doesNotMatch(html, /5173/);
    assert.doesNotMatch(html, /5184/);
    assert.match(webAppCss, /\.language-badge/);
    assert.match(webAppCss, /\.language-badge\[data-language="js"\][\s\S]*background: rgba\(73, 107, 120, 0\.08\)/);
    assert.match(webAppCss, /\.component-label[\s\S]*color: var\(--muted\)/);
    assert.match(webAppCss, /\.asset-grid/);
    assert.match(webAppCss, /\.asset-card:hover/);
    assert.match(webAppCss, /\.tracing-card/);
    assert.match(webAppCss, /\.energy-bar/);
    assert.match(webAppCss, /\.runtime-preview/);
    assert.match(webAppCss, /\.runtime-frame/);
    assert.match(webAppCss, /\.preview-popover/);
    assert.match(webAppCss, /\.preview-popover-frame/);
    assert.match(webAppCss, /--preview-frame-height/);
    assert.match(webAppCss, /@keyframes previewPulse/);
    assert.doesNotMatch(webAppCss, /@keyframes hologramMaterialize/);
  });

  it("uses roomier asset cards for component management controls", async () => {
    const { webAppCss } = await import("../../dist/web/frontend.js");

    assert.match(webAppCss, /grid-template-columns: repeat\(auto-fill, minmax\(190px, 1fr\)\)/);
    assert.match(webAppCss, /min-height: 204px/);
    assert.match(webAppCss, /grid-template-columns: repeat\(auto-fill, minmax\(160px, 1fr\)\)/);
  });

  it("supports a collapsible sidebar and a centered preview workbench", async () => {
    const { renderWebAppHtml, webAppCss } = await import("../../dist/web/frontend.js");

    const html = renderWebAppHtml();

    assert.match(html, /sidebar-toggle/);
    assert.match(html, /toggleSidebar/);
    assert.match(html, /sidebar-collapsed/);
    assert.match(html, /preview-focused/);
    assert.match(html, /renderPreviewWorkbench/);
    assert.doesNotMatch(html, /固定试玩台/);
    assert.match(html, /preview-workbench-frame/);
    assert.match(html, /preview-mobile-frame/);
    assert.match(html, /\/Mobile\$\/i/);
    assert.match(html, /data-action="refresh-preview"/);
    assert.match(html, /独立打开/);
    assert.match(html, /loading="eager"/);
    assert.match(html, /aria-expanded="true"/);
    assert.match(webAppCss, /\.app\.sidebar-collapsed/);
    assert.match(webAppCss, /\.app\.preview-focused/);
    assert.match(webAppCss, /\.app\.preview-focused \.asset-grid/);
    assert.match(webAppCss, /\.app\.preview-focused \.detail/);
    assert.match(webAppCss, /\.preview-workbench/);
    assert.match(webAppCss, /\.preview-stage/);
    assert.match(webAppCss, /\.preview-workbench-frame/);
    assert.match(webAppCss, /\.preview-mobile-frame/);
    assert.match(webAppCss, /\.app\.sidebar-collapsed \.sidebar/);
    assert.match(webAppCss, /\.app\.sidebar-collapsed \.nav-label/);
    assert.match(webAppCss, /\.brand-text \{\s*min-width: 0;\s*overflow: hidden;\s*text-overflow: ellipsis;\s*white-space: nowrap;/);
  });

  it("uses semantic metaphor icons for sidebar asset categories", async () => {
    const { renderWebAppHtml, webAppCss } = await import("../../dist/web/frontend.js");

    const html = renderWebAppHtml();

    assert.match(html, /categoryIcons/);
    assert.match(html, /nav-icon/);
    assert.match(html, /data-icon="overview"/);
    assert.match(html, /data-icon="components"/);
    assert.match(html, /data-icon="services"/);
    assert.match(html, /data-icon="business"/);
    assert.match(html, /data-icon="tokens"/);
    assert.match(html, /data-icon="product"/);
    assert.match(html, /data-icon="metaphors"/);
    assert.match(html, /data-icon="reports"/);
    assert.doesNotMatch(html, /const categoryGlyphs =/);
    assert.match(webAppCss, /\.nav-icon/);
    assert.match(webAppCss, /\.nav-icon \*/);
  });

  it("defines a lightweight manuscript canvas without magnetic-card noise", async () => {
    const { renderWebAppHtml, webAppCss } = await import("../../dist/web/frontend.js");

    const html = renderWebAppHtml();

    assert.match(html, /initManuscriptField/);
    assert.doesNotMatch(html, /updateCardTilt|resetCardTilt/);
    assert.match(html, /prefers-reduced-motion/);
    assert.match(webAppCss, /\.manuscript-canvas/);
    assert.doesNotMatch(webAppCss, /--lava-gold|--quantum-cyan|amber-card|dark-lab-canvas/);
    assert.match(webAppCss, /pointer-events: none/);
    assert.match(webAppCss, /mix-blend-mode: multiply/);
  });

  it("keeps metrics on overview and adds local component label management controls", async () => {
    const { renderWebAppHtml, webAppCss } = await import("../../dist/web/frontend.js");

    const html = renderWebAppHtml();

    assert.match(html, /id="component-controls"/);
    assert.match(html, /function renderComponentControls/);
    assert.match(html, /state\.category !== 'overview'/);
    assert.match(html, /component-label-filter/);
    assert.match(html, /component-project-filter/);
    assert.match(html, /按标签分类/);
    assert.match(html, /按项目分类/);
    assert.match(html, /editComponentLabels/);
    assert.match(html, /deleteComponent/);
    assert.match(html, /window\.confirm/);
    assert.match(html, /确认从当前视图删除/);
    assert.match(html, /localStorage/);
    assert.match(html, /data-action="edit-labels"/);
    assert.match(html, /data-action="delete-component"/);
    assert.match(webAppCss, /\.component-controls/);
    assert.match(webAppCss, /\.control-select/);
    assert.match(webAppCss, /\.component-label/);
    assert.match(webAppCss, /\.asset-action/);
  });

  it("defines a narrow mobile layout without fixed three-column overflow", async () => {
    const { webAppCss } = await import("../../dist/web/frontend.js");

    assert.match(webAppCss, /@media \(max-width: 640px\)/);
    assert.match(webAppCss, /\.app \{ grid-template-columns: 1fr; \}/);
    assert.match(webAppCss, /\.toolbar \{ flex-direction: column; align-items: stretch; \}/);
    assert.match(webAppCss, /\.search \{ width: 100%; \}/);
    assert.match(webAppCss, /\.nav \{ display: flex; overflow-x: auto; \}/);
    assert.match(webAppCss, /scrollbar-width: none/);
    assert.match(webAppCss, /\.metrics \{ grid-template-columns: 1fr; \}/);
    assert.match(webAppCss, /\.title h1, \.asset-card p \{ overflow-wrap: anywhere; \}/);
  });
});
