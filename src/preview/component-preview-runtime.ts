import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalSerialize,
  createPreviewActionSpec,
  previewActionDigest,
} from "./preview-action.js";
import { openPreviewBuildCache } from "./preview-build-cache.js";
import { assertPreviewDependencies, installedVueVersion } from "./preview-dependencies.js";
import {
  assetPackageDirectoryFor,
  resolveAssetLibraryRoot,
} from "../library/asset-library.js";
import { listFiles } from "../utils/files.js";
import { createSafeProcessEnvironment } from "../utils/process-environment.js";

const schemaVersion = "0.1.0";
const reactRuntime = "vite-react";
const vueRuntime = "vite-vue";
const mixedRuntime = "mixed-vite";
const requireFromPreviewToolchain = createRequire(import.meta.url);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function slugify(value) {
  return String(value ?? "component")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "component";
}

function fingerprint(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 16);
}

function fullFingerprint(value) {
  return createHash("sha256").update(canonicalSerialize(value)).digest("hex");
}

function defaultPreviewBuilderDigest() {
  return createHash("sha256")
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .update(readFileSync(new URL("./vue26-preview-plugin.js", import.meta.url)))
    .update(readFileSync(new URL("./preview-dependencies.js", import.meta.url)))
    .digest("hex");
}

function defaultPreviewToolchain(runtime) {
  return {
    node: process.versions.node,
    vite: "5.4.21",
    plugins: runtime === vueRuntime
      ? ["@vitejs/plugin-vue@5.2.4", "@vitejs/plugin-vue2@2.3.4", "@vue/component-compiler-utils@3.3.0", "sass-embedded@1.89.2"]
      : [],
  };
}

function previewIdFor(component, projectRoot) {
  const resolvedRoot = resolve(projectRoot);
  const projectIdentity = process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot;
  return `${slugify(component.name)}-${fingerprint([projectIdentity, normalizePath(component.filePath), component.name])}`;
}

function isReadyExport(component) {
  return component.exportMode === "default" || component.exportMode === "named";
}

function isVueComponent(component) {
  return normalizePath(component.filePath).toLowerCase().endsWith(".vue");
}

function runtimeForComponent(component) {
  return isVueComponent(component) ? vueRuntime : reactRuntime;
}

function registryRuntimeFor(previews) {
  const runtimes = [...new Set(previews.map((preview) => preview.runtime))];
  if (runtimes.length === 0) {
    return reactRuntime;
  }
  return runtimes.length === 1 ? runtimes[0] : mixedRuntime;
}

function browserUrlFor(id) {
  return `/component-preview/${id}/`;
}

export function componentPreviewVersionUrl(id, actionDigest) {
  return `${browserUrlFor(id)}${actionDigest}/`;
}

export function buildComponentPreviewRegistry(components, options = {}) {
  if (typeof options.projectRoot !== "string" || !options.projectRoot.trim()) {
    throw new Error("projectRoot is required to register component previews.");
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const previews = components.map((component) => {
    const id = previewIdFor(component, options.projectRoot);
    const runtime = runtimeForComponent(component);
    const blockers = [];
    if (!component.filePath) {
      blockers.push("Missing component source path.");
    }
    if (!isReadyExport(component)) {
      blockers.push("Missing component export contract.");
    }
    const limitations = [];
    if (!component.previewScenario) {
      limitations.push("missing-source-scenario");
    }
    if (component.previewScenario?.unresolvedProps?.length > 0) {
      limitations.push(`unresolved-props:${component.previewScenario.unresolvedProps.join(",")}`);
    }
    if (component.previewScenario?.unresolvedSlots?.length > 0) {
      limitations.push(`unresolved-slots:${component.previewScenario.unresolvedSlots.join(",")}`);
    }
    if (options.runtimeContext?.unresolved?.length > 0) {
      limitations.push(`unresolved-runtime:${options.runtimeContext.unresolved.join(",")}`);
    }
    const buildable = blockers.length === 0;
    if (buildable && limitations.length === 0) {
      limitations.push("runtime-validation-pending");
    }
    const status = !buildable ? "blocked" : "degraded";
    const actionSpec = createPreviewActionSpec({
      component,
      runtimeContext: options.runtimeContext,
      builderDigest: options.builderDigest ?? defaultPreviewBuilderDigest(),
      toolchain: options.toolchain ?? defaultPreviewToolchain(runtime),
      platform: options.platform ?? { os: process.platform, arch: process.arch },
      buildOptions: {
        ...(options.buildOptions ?? {
          runtime,
          networkPolicy: options.runtimeContext?.networkPolicy ?? "block-external",
        }),
        previewBase: browserUrlFor(id),
      },
      declaredEnvironmentDigest: options.declaredEnvironmentDigest ?? fullFingerprint(
        options.runtimeContext?.environmentVariables ?? [],
      ),
    });
    const actionDigest = previewActionDigest(actionSpec);
    return {
      id,
      componentName: component.name,
      componentPath: normalizePath(component.filePath),
      exportMode: component.exportMode ?? "unknown",
      exportName: component.exportName ?? "",
      status,
      runtime,
      browserUrl: browserUrlFor(id),
      buildable,
      interactions: buildable ? ["hover", "click", "focus"] : [],
      blockers,
      limitations,
      actionDigest,
      ...(component.platformRuntime ? { platformRuntime: component.platformRuntime } : {}),
      ...(component.platformComponents ? { platformComponents: component.platformComponents } : {}),
      ...(component.previewScenario ? { previewScenario: component.previewScenario } : {}),
    };
  });

  return {
    schemaVersion,
    runtime: registryRuntimeFor(previews),
    generatedAt,
    previews,
    ...(options.runtimeContext ? { runtimeContext: options.runtimeContext } : {}),
  };
}

function jsString(value) {
  return JSON.stringify(String(value ?? ""));
}

function projectRelativeImportPath(projectRootPrefix, sourcePath) {
  const normalizedPrefix = normalizePath(projectRootPrefix).replace(/\/+$/, "");
  const normalizedSource = normalizePath(sourcePath);
  if (!normalizedPrefix || normalizedPrefix === ".") {
    return normalizedSource;
  }
  return `${normalizedPrefix}/${normalizedSource}`;
}

function componentImportPath(componentPath, options = {}) {
  return projectRelativeImportPath(options.componentImportPrefix ?? "../../../..", componentPath);
}

function runtimeImportPath(sourcePath, options = {}) {
  const normalizedSource = normalizePath(sourcePath);
  if (normalizedSource.startsWith("src/") || normalizedSource.startsWith("app/")) {
    return projectRelativeImportPath(options.runtimeImportPrefix ?? "../../..", normalizedSource);
  }
  return normalizedSource;
}

function objectCode(value) {
  if (Array.isArray(value)) {
    return `[${value.map(objectCode).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    return `{ ${Object.entries(value).map(([key, item]) => `${propertyKeyCode(key)}: ${objectCode(item)}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}

function propertyKeyCode(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function scenarioPropsCode(scenario, options = {}) {
  if (!scenario) {
    return null;
  }
  const props = Object.entries(scenario.props ?? {}).map(([key, value]) => `${propertyKeyCode(key)}: ${objectCode(value)}`);
  if (options.includeDefaultSlot && scenario.slots?.default && !("children" in (scenario.props ?? {}))) {
    props.push(`children: ${objectCode(scenario.slots.default)}`);
  }
  for (const eventName of scenario.events ?? []) {
    const propName = eventName.startsWith("on") ? eventName : `on${eventName[0]?.toUpperCase()}${eventName.slice(1)}`;
    props.push(`${propName}: () => {}`);
  }
  return `{ ${props.join(", ")} }`;
}

function propsCodeFor(_componentName, scenario, options = {}) {
  return scenarioPropsCode(scenario, options) ?? "{}";
}

function escapeVueTemplateText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function reactPreviewFileFor(preview, options = {}) {
  const importPath = componentImportPath(preview.componentPath, options);
  const hasMemoryRouter = options.runtimeContext?.providers?.includes("react-router-memory");
  const providerImport = hasMemoryRouter
    ? 'import { MemoryRouter } from "react-router-dom";'
    : "";
  const componentMarkup = hasMemoryRouter
    ? "<MemoryRouter><Component {...props} /></MemoryRouter>"
    : "<Component {...props} />";
  const importLine = preview.exportMode === "named"
    ? `import { ${preview.exportName} as Component } from ${jsString(importPath)};`
    : `import Component from ${jsString(importPath)};`;
  return `import React from "react";
${importLine}
${providerImport}

const props = ${propsCodeFor(preview.componentName, preview.previewScenario, { includeDefaultSlot: true })};

export default function ${slugify(preview.componentName).replace(/-([a-z])/g, (_, char) => char.toUpperCase())}Preview() {
  return ${componentMarkup};
}
`;
}

function networkGuardSource(runtimeContext) {
  if (runtimeContext?.networkPolicy !== "block-external") {
    return "";
  }
  return `function installPreviewNetworkGuard() {
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (!nativeFetch) return;
  globalThis.fetch = (input, init) => {
    const rawUrl = typeof input === "string" || input instanceof URL ? input : input.url;
    const requestUrl = new URL(rawUrl, window.location.href);
    if (requestUrl.origin !== window.location.origin) {
      return Promise.reject(new Error("External network request blocked in component preview: " + requestUrl.origin));
    }
    return nativeFetch(input, init);
  };
}

installPreviewNetworkGuard();`;
}

function vuePreviewFileFor(preview, options = {}) {
  const importPath = componentImportPath(preview.componentPath, options);
  const sourceSlotText = preview.previewScenario?.slots?.default;
  const slotTemplate = sourceSlotText
    ? `    ${escapeVueTemplateText(sourceSlotText)}`
    : "";
  const componentMarkup = slotTemplate
    ? `<Component v-bind="props">
${slotTemplate}
  </Component>`
    : `<Component v-bind="props" />`;
  return `<template>
  ${componentMarkup}
</template>

${options.vueVersion?.startsWith("2.") ? "<script>" : "<script setup>"}
import Component from ${jsString(importPath)};

const props = ${propsCodeFor(preview.componentName, preview.previewScenario)};
${options.vueVersion?.startsWith("2.") ? "export default { components: { Component }, data() { return { props }; } };" : ""}
</script>
`;
}

function reactAppFileFor(readyPreviews, options = {}) {
  const styleImports = (options.globalStyleImports ?? [])
    .map((sourcePath) => `import ${jsString(runtimeImportPath(sourcePath, options))};`)
    .join("\n");
  const modules = readyPreviews
    .map((preview) => `  ${jsString(preview.id)}: () => import("./previews/${preview.id}.jsx"),`)
    .join("\n");
  return `import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { previews } from "./preview-data.js";
${styleImports}
import "./vibe-preview.css";

const previewModules = {
${modules}
};

${networkGuardSource(options.runtimeContext)}

function selectedPreviewId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("component") || previews.find((preview) => preview.status === "ready")?.id || "";
}

function isEmbeddedPreview() {
  const params = new URLSearchParams(window.location.search);
  return params.get("embed") === "1";
}

function triggerDemoInteraction() {
  const target = document.querySelector([
    '[data-vibe-preview-canvas] button',
    '[data-vibe-preview-canvas] a',
    '[data-vibe-preview-canvas] input',
    '[role="dialog"] button',
    '.ant-modal button',
    '.ant-drawer button',
  ].join(", "));
  if (!target) return;
  target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  if (typeof target.focus === "function") target.focus();
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function reportPreviewMounted(previewId, actionDigest) {
  if (!previewId) return;
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const canvas = document.querySelector("[data-vibe-preview-canvas]");
    if (!canvas || canvas.querySelector(".vibe-preview-empty")) return;
    fetch("/api/component-preview-validation/" + encodeURIComponent(previewId) + "?actionDigest=" + encodeURIComponent(actionDigest), {
      method: "POST",
    }).catch(() => {});
  }));
}

function useFitPreview(enabled, dependencies) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;
    if (!enabled) {
      stage.style.setProperty("--vibe-preview-scale", "1");
      return undefined;
    }

    function updateScale() {
      stage.style.setProperty("--vibe-preview-scale", "1");
      const canvasBox = canvas.getBoundingClientRect();
      const availableWidth = Math.max(1, canvasBox.width - 2);
      stage.style.setProperty("--vibe-preview-available-width", availableWidth + "px");
      const stageBox = stage.getBoundingClientRect();
      const contentWidth = Math.max(stage.scrollWidth, stageBox.width);
      if (!contentWidth) return;
      const scale = Math.min(1, availableWidth / contentWidth);
      stage.style.setProperty("--vibe-preview-scale", String(Number(scale.toFixed(3))));
    }

    const animationFrame = window.requestAnimationFrame(updateScale);
    const observer = new ResizeObserver(updateScale);
    observer.observe(canvas);
    observer.observe(stage);
    window.addEventListener("resize", updateScale);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [enabled, ...dependencies]);

  return { canvasRef, stageRef };
}

class PreviewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div className="vibe-preview-empty">预览运行失败：{this.state.error.message || String(this.state.error)}</div>;
    }
    return this.props.children;
  }
}

function App() {
  const [activeId, setActiveId] = useState(selectedPreviewId);
  const [ActiveComponent, setActiveComponent] = useState(null);
  const [loadError, setLoadError] = useState("");
  const embedded = isEmbeddedPreview();
  const activePreview = useMemo(
    () => previews.find((preview) => preview.id === activeId) || previews[0],
    [activeId],
  );
  const { canvasRef, stageRef } = useFitPreview(embedded, [activePreview?.id, ActiveComponent, loadError]);

  useEffect(() => {
    let cancelled = false;
    setActiveComponent(null);
    setLoadError("");
    const loadPreview = activePreview ? previewModules[activePreview.id] : null;
    if (!loadPreview) {
      setLoadError(activePreview?.blockers?.join(" ") || "当前组件没有可运行预览。");
      return () => {
        cancelled = true;
      };
    }
    loadPreview()
      .then((module) => {
        if (!cancelled) setActiveComponent(() => module.default);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [activePreview?.id]);

  useEffect(() => {
    if (ActiveComponent && !loadError) reportPreviewMounted(activePreview?.id, activePreview?.actionDigest);
  }, [activePreview?.id, ActiveComponent, loadError]);

  return (
    <main className={embedded ? "vibe-preview-shell embedded" : "vibe-preview-shell"}>
      {!embedded && (
        <aside className="vibe-preview-sidebar">
          <strong>Component Preview Runtime</strong>
          {previews.map((preview) => (
            <button
              key={preview.id}
              type="button"
              className={preview.id === activePreview?.id ? "active" : ""}
              onClick={() => setActiveId(preview.id)}
            >
              {preview.componentName}
              <span>{preview.status}</span>
            </button>
          ))}
        </aside>
      )}
      <section className="vibe-preview-main">
        {!embedded && (
          <header>
            <div>
              <h1>{activePreview?.componentName || "No preview"}</h1>
              <p>{activePreview?.componentPath}</p>
            </div>
            <button type="button" onClick={triggerDemoInteraction}>运行交互演示</button>
          </header>
        )}
        <div ref={canvasRef} className="vibe-preview-canvas" data-vibe-preview-canvas>
          {loadError ? (
            <div className="vibe-preview-empty">预览加载失败：{loadError}</div>
          ) : ActiveComponent ? (
            <div ref={stageRef} className="vibe-preview-fit-stage">
              <div className="vibe-preview-fit-target">
                <PreviewErrorBoundary key={activePreview?.id}>
                  <ActiveComponent />
                </PreviewErrorBoundary>
              </div>
            </div>
          ) : (
            <div className="vibe-preview-empty">正在加载组件预览...</div>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
`;
}

function vueAppFileFor(readyPreviews, options = {}) {
  const isVue2 = options.vueVersion?.startsWith("2.");
  const uniComponentExports = {
    button: "Button", checkbox: "Checkbox", "checkbox-group": "CheckboxGroup", image: "Image",
    input: "Input", label: "Label", navigator: "Navigator", picker: "Picker",
    "picker-view": "PickerView", "picker-view-column": "PickerViewColumn", radio: "Radio",
    "radio-group": "RadioGroup", "scroll-view": "ScrollView", slider: "Slider", swiper: "Swiper",
    "swiper-item": "SwiperItem", switch: "Switch", text: "Text", textarea: "Textarea", view: "View",
  };
  const uniComponents = [...new Set(readyPreviews
    .filter((preview) => preview.platformRuntime === "uni-h5")
    .flatMap((preview) => preview.platformComponents ?? []))]
    .filter((name) => uniComponentExports[name]);
  const uniHostImports = uniComponents.length > 0
    ? `import { ${uniComponents.map((name) => uniComponentExports[name]).join(", ")} } from "@dcloudio/uni-h5";\n${uniComponents.map((name) => `import "@dcloudio/uni-components/style/${name}.css";`).join("\n")}`
    : "";
  const providers = options.runtimeContext?.providers ?? [];
  const hasPinia = providers.includes("vue-pinia");
  const hasRouter = providers.includes("vue-router-memory");
  const hasElement = isVue2 && providers.includes("vue2-element-ui");
  const providerImports = [
    hasPinia ? 'import { createPinia } from "pinia";' : "",
    hasRouter ? (isVue2 ? 'import VueRouter from "vue-router";' : 'import { createMemoryHistory, createRouter } from "vue-router";') : "",
    hasElement ? 'import ElementUI from "element-ui";' : "",
  ].filter(Boolean).join("\n");
  const providerSetup = isVue2 ? [
    hasElement ? "Vue.use(ElementUI);" : "",
    hasRouter ? 'Vue.use(VueRouter);\nconst router = new VueRouter({ mode: "abstract", routes: [] });' : "",
    'new Vue({ ' + (hasRouter ? "router, " : "") + 'render: h => h(App) }).$mount("#root");',
  ].filter(Boolean).join("\n") : [
    "const previewApp = createApp(App);",
    ...uniComponents.flatMap((name) => [
      `previewApp.component(${jsString(name)}, ${uniComponentExports[name]});`,
      `previewApp.component(${jsString(`uni-${name}`)}, ${uniComponentExports[name]});`,
    ]),
    hasPinia ? "previewApp.use(createPinia());" : "",
    hasRouter ? 'const previewRouter = createRouter({ history: createMemoryHistory(), routes: [] });\npreviewApp.use(previewRouter);' : "",
    'previewApp.mount("#root");',
  ].filter(Boolean).join("\n");
  const styleImports = (options.globalStyleImports ?? [])
    .map((sourcePath) => `import ${jsString(runtimeImportPath(sourcePath, options))};`)
    .join("\n");
  const modules = readyPreviews
    .map((preview) => `  ${jsString(preview.id)}: () => import("./previews/${preview.id}.vue"),`)
    .join("\n");
  return `${isVue2 ? 'import Vue from "vue";' : 'import { createApp, h, markRaw } from "vue";'}
${uniHostImports}
${providerImports}
import { previews } from "./preview-data.js";
${styleImports}
import "./vibe-preview.css";

const previewModules = {
${modules}
};

${networkGuardSource(options.runtimeContext)}

function createPreviewCanvasContext() {
  return {
    setFillStyle() {},
    fillRect() {},
    setStrokeStyle() {},
    setLineWidth() {},
    setLineCap() {},
    setLineJoin() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    draw(reserve, callback) {
      const done = typeof reserve === "function" ? reserve : callback;
      if (typeof done === "function") window.setTimeout(done, 0);
    },
  };
}

function previewSystemInfo() {
  return {
    platform: "web",
    windowWidth: window.innerWidth || 420,
    windowHeight: window.innerHeight || 760,
    statusBarHeight: 0,
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

function installUniPreviewMock() {
  if (globalThis.uni) return;
  const resizeHandlers = new Set();
  globalThis.uni = {
    getSystemInfoSync: previewSystemInfo,
    onWindowResize(handler) {
      if (typeof handler === "function") resizeHandlers.add(handler);
    },
    offWindowResize(handler) {
      resizeHandlers.delete(handler);
    },
    createCanvasContext() {
      return createPreviewCanvasContext();
    },
    previewImage() {},
    showToast() {},
    hideToast() {},
    navigateBack() {},
    canvasToTempFilePath(options) {
      window.setTimeout(() => {
        if (typeof options?.success === "function") {
          options.success({ tempFilePath: "data:image/png;base64," });
        }
      }, 0);
    },
  };
  window.addEventListener("resize", () => {
    const size = previewSystemInfo();
    resizeHandlers.forEach((handler) => handler(size));
  });
}

installUniPreviewMock();

function selectedPreviewId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("component") || previews.find((preview) => preview.status === "ready")?.id || "";
}

function isEmbeddedPreview() {
  const params = new URLSearchParams(window.location.search);
  return params.get("embed") === "1";
}

function triggerDemoInteraction() {
  const target = document.querySelector([
    '[data-vibe-preview-canvas] button',
    '[data-vibe-preview-canvas] a',
    '[data-vibe-preview-canvas] input',
  ].join(", "));
  if (!target) return;
  target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  if (typeof target.focus === "function") target.focus();
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function reportPreviewMounted(previewId, actionDigest) {
  if (!previewId) return;
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const canvas = document.querySelector("[data-vibe-preview-canvas]");
    if (!canvas || canvas.querySelector(".vibe-preview-empty")) return;
    fetch("/api/component-preview-validation/" + encodeURIComponent(previewId) + "?actionDigest=" + encodeURIComponent(actionDigest), {
      method: "POST",
    }).catch(() => {});
  }));
}

const App = {
  data() {
    return {
      activeId: selectedPreviewId(),
      ActiveComponent: null,
      loadError: "",
      embedded: isEmbeddedPreview(),
      previewResizeObserver: null,
      previewRaf: 0,
    };
  },
  computed: {
    activePreview() {
      return previews.find((preview) => preview.id === this.activeId) || previews[0] || null;
    },
  },
  watch: {
    activeId() {
      this.loadPreview();
    },
  },
  mounted() {
    this.loadPreview();
    window.addEventListener("resize", this.fitPreview);
  },
  updated() {
    this.$nextTick(this.fitPreview);
  },
  ${isVue2 ? "beforeDestroy" : "beforeUnmount"}() {
    window.removeEventListener("resize", this.fitPreview);
    if (this.previewResizeObserver) {
      this.previewResizeObserver.disconnect();
    }
    if (this.previewRaf) {
      window.cancelAnimationFrame(this.previewRaf);
    }
  },
  errorCaptured(error) {
    this.loadError = error instanceof Error ? error.message : String(error);
    return false;
  },
  methods: {
    async loadPreview() {
      this.ActiveComponent = null;
      this.loadError = "";
      const activePreview = this.activePreview;
      const loadPreview = activePreview ? previewModules[activePreview.id] : null;
      if (!loadPreview) {
        this.loadError = activePreview?.blockers?.join(" ") || "当前组件没有可运行预览。";
        return;
      }
      try {
        const module = await loadPreview();
        this.ActiveComponent = ${isVue2 ? "Vue.extend(module.default)" : "markRaw(module.default)"};
        this.$nextTick(() => {
          this.fitPreview();
          reportPreviewMounted(activePreview.id, activePreview.actionDigest);
        });
      } catch (error) {
        this.loadError = error instanceof Error ? error.message : String(error);
      }
    },
    fitPreview() {
      if (!this.embedded) return;
      const canvas = this.$refs.previewCanvas;
      const stage = this.$refs.previewStage;
      if (!canvas || !stage) return;
      if (!this.previewResizeObserver) {
        this.previewResizeObserver = new ResizeObserver(() => {
          if (this.previewRaf) window.cancelAnimationFrame(this.previewRaf);
          this.previewRaf = window.requestAnimationFrame(this.fitPreview);
        });
        this.previewResizeObserver.observe(canvas);
        this.previewResizeObserver.observe(stage);
      }
      stage.style.setProperty("--vibe-preview-scale", "1");
      const canvasBox = canvas.getBoundingClientRect();
      const availableWidth = Math.max(1, canvasBox.width - 2);
      stage.style.setProperty("--vibe-preview-available-width", availableWidth + "px");
      const stageBox = stage.getBoundingClientRect();
      const contentWidth = Math.max(stage.scrollWidth, stageBox.width);
      if (!contentWidth) return;
      const scale = Math.min(1, availableWidth / contentWidth);
      stage.style.setProperty("--vibe-preview-scale", String(Number(scale.toFixed(3))));
    },
    triggerDemoInteraction,
  },
  render(${isVue2 ? "h" : ""}) {
    const activePreview = this.activePreview;
    const sidebar = this.embedded ? null : h("aside", { class: "vibe-preview-sidebar" }, [
      h("strong", "Component Preview Runtime"),
      ...previews.map((preview) => h("button", {
        ${isVue2 ? 'attrs: { type: "button" },' : 'type: "button",'}
        class: preview.id === activePreview?.id ? "active" : "",
        ${isVue2 ? 'on: { click: () => { this.activeId = preview.id; } },' : 'onClick: () => { this.activeId = preview.id; },'}
      }, [
        preview.componentName,
        h("span", preview.status),
      ])),
    ]);
    const header = this.embedded ? null : h("header", [
      h("div", [
        h("h1", activePreview?.componentName || "No preview"),
        h("p", activePreview?.componentPath || ""),
      ]),
      h("button", ${isVue2 ? '{ attrs: { type: "button" }, on: { click: this.triggerDemoInteraction } }' : '{ type: "button", onClick: this.triggerDemoInteraction }'}, "运行交互演示"),
    ]);
    const canvasContent = this.loadError
      ? h("div", { class: "vibe-preview-empty" }, "预览加载失败：" + this.loadError)
      : this.ActiveComponent
        ? h("div", { ref: "previewStage", class: "vibe-preview-fit-stage" }, [
            h("div", { class: "vibe-preview-fit-target" }, [h(this.ActiveComponent)]),
          ])
        : h("div", { class: "vibe-preview-empty" }, "正在加载组件预览...");
    return h("main", { class: this.embedded ? "vibe-preview-shell embedded" : "vibe-preview-shell" }, [
      sidebar,
      h("section", { class: "vibe-preview-main" }, [
        header,
        h("div", { ref: "previewCanvas", class: "vibe-preview-canvas", ${isVue2 ? 'attrs: { "data-vibe-preview-canvas": "" }' : '"data-vibe-preview-canvas": ""'} }, [canvasContent]),
      ]),
    ]);
  },
};

${providerSetup}
`;
}

function previewDataFileFor(registry) {
  return `export const previews = ${JSON.stringify(registry.previews, null, 2)};
`;
}

function viteConfigFile(options = {}) {
  const hasVuePreviews = options.hasVuePreviews === true;
  const isVue26 = options.vueVersion?.startsWith("2.6.");
  const isVue27 = options.vueVersion?.startsWith("2.7.");
  const hasUnoCss = options.runtimeContext?.plugins?.includes("unocss");
  const hasUniH5 = options.hasUniH5 === true;
  const projectRootRelativePath = options.projectRootRelativePath ?? "../..";
  const vuePluginImport = !hasVuePreviews ? "" : isVue26
    ? `const { vue26PreviewPlugin } = await import(${jsString(new URL("./vue26-preview-plugin.js", import.meta.url).href)});
const vue = () => vue26PreviewPlugin(projectRoot);
`
    : `const vuePluginModuleUrl = pathToFileURL(requireFromPreviewToolchain.resolve(${jsString(isVue27 ? "@vibe-foundry/vue2-preview-toolchain" : "@vitejs/plugin-vue")})).href;
const { default: vue } = await import(vuePluginModuleUrl);
`;
  const vuePluginEntry = hasVuePreviews ? `    {
      name: "vibe-foundry-uni-conditional-loader",
      enforce: "pre",
      transform(code, id) {
        const sourcePath = id.split("?")[0];
        if (!projectVueSourcePattern.test(sourcePath) || sourcePath.includes("node_modules")) {
          return null;
        }
        const prepared = injectVueAutoImports(stripUniConditionals(code));
        return useUniH5 ? normalizeUniComponentTags(prepared) : prepared;
      },
    },
    ${isVue27 ? 'vue({ compiler: createRequire(resolve(projectRoot, "package.json"))("vue/compiler-sfc") }),' : "vue(),"}
    {
      name: "vibe-foundry-vue-ts-script-loader",
      enforce: "post",
      transform(code, id) {
        if (!id.includes(".vue?vue&type=script") || !id.includes("lang.ts") || id.includes("node_modules")) {
          return null;
        }
        const sourcePath = id.split("?")[0];
        return transformWithEsbuild(code, sourcePath + ".ts", {
          loader: "ts",
        });
      },
    },
` : "";
  const unoCssImport = hasUnoCss
    ? `const requireFromProject = createRequire(resolve(projectRoot, "package.json"));
const unoCssModuleUrl = pathToFileURL(requireFromProject.resolve("unocss/vite")).href;
const { default: UnoCSS } = await import(unoCssModuleUrl);
`
    : "";
  const unoCssPluginEntry = hasUnoCss ? "    UnoCSS(),\n" : "";
  const uniRpxPluginEntry = hasUniH5 ? `    {
      name: "vibe-foundry-uni-rpx",
      enforce: "post",
      transform(code, id) {
        if (!id.includes("type=style") && !/\\.(?:css|scss|sass|less|styl|stylus)$/.test(id.split("?")[0])) {
          return null;
        }
        return code.replace(/(-?(?:\\d+\\.)?\\d+)rpx\\b/g, (_, value) => {
          return "calc(" + value + " * var(--vibe-foundry-rpx-unit))";
        });
      },
      generateBundle(_options, bundle) {
        for (const asset of Object.values(bundle)) {
          if (asset.type !== "asset" || !asset.fileName.endsWith(".css")) continue;
          asset.source = String(asset.source).replace(/(-?(?:\\d+\\.)?\\d+)rpx\\b/g, (_, value) => {
            return "calc(" + value + " * var(--vibe-foundry-rpx-unit))";
          });
        }
      },
    },
` : "";
  return `import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const previewRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(previewRoot, ${jsString(projectRootRelativePath)});
const projectJsSourcePattern = /[\\/]src[\\/].*\\.js$/;
const projectTsSourcePattern = /[\\/]src[\\/].*\\.ts$/;
const projectVueSourcePattern = /[\\/]src[\\/].*\\.vue$/;
const uniPreviewTargets = new Set(["H5", "WEB"]);
const rpxCalcMaxDeviceWidth = 960;
const useUniH5 = ${hasUniH5};

function uniTargetsFrom(value) {
  return String(value || "")
    .replaceAll("||", " ")
    .split(/[ \t]+/)
    .map((target) => target.trim())
    .filter(Boolean);
}

function uniConditionEnabled(value) {
  const targets = uniTargetsFrom(value);
  if (targets.length === 1 && targets[0] === "APP-PLUS") {
    return false;
  }
  return targets.length > 0 && targets.some((target) => uniPreviewTargets.has(target));
}

function uniDirectiveFor(line) {
  const jsIndex = line.indexOf("// #");
  const htmlIndex = line.indexOf("<!-- #");
  const markerIndex = jsIndex === -1 ? htmlIndex : htmlIndex === -1 ? jsIndex : Math.min(jsIndex, htmlIndex);
  if (markerIndex === -1) {
    return null;
  }
  const markerOffset = markerIndex === htmlIndex ? "<!-- #".length : "// #".length;
  const directiveText = line.slice(markerIndex + markerOffset).trim();
  const [type, ...valueParts] = directiveText.split(/[ \t]+/);
  if (!["ifdef", "ifndef", "else", "endif"].includes(type)) {
    return null;
  }
  return { type, value: valueParts.join(" ") };
}

function stripUniConditionals(code) {
  const activeStack = [];
  const output = [];
  for (const rawLine of code.split(String.fromCharCode(10))) {
    const line = rawLine.endsWith(String.fromCharCode(13)) ? rawLine.slice(0, -1) : rawLine;
    const directive = uniDirectiveFor(line);
    if (directive?.type === "ifdef") {
      activeStack.push(uniConditionEnabled(directive.value));
      continue;
    }
    if (directive?.type === "ifndef") {
      activeStack.push(!uniConditionEnabled(directive.value));
      continue;
    }
    if (directive?.type === "else") {
      if (activeStack.length > 0) {
        activeStack[activeStack.length - 1] = !activeStack[activeStack.length - 1];
      }
      continue;
    }
    if (directive?.type === "endif") {
      activeStack.pop();
      continue;
    }
    if (activeStack.every(Boolean)) {
      output.push(line);
    }
  }
  return output.join(String.fromCharCode(10));
}

const vueAutoImportNames = ["computed", "ref"];

function hasVueImport(code, name) {
  return code.split(String.fromCharCode(10)).some((line) => {
    return line.includes(name) && (line.includes('from "vue"') || line.includes("from 'vue'"));
  });
}

function injectVueAutoImports(code) {
  const missing = vueAutoImportNames.filter((name) => {
    const usePattern = new RegExp("\\\\b" + name + "\\\\s*\\\\(");
    return usePattern.test(code) && !hasVueImport(code, name);
  });
  if (missing.length === 0) {
    return code;
  }
  return code.replace(/<script\\s+setup([^>]*)>/i, (match) => {
    return match + String.fromCharCode(10) + "import { " + missing.join(", ") + " } from \\"vue\\";";
  });
}

const uniTemplateTags = new Set([
  "button", "checkbox", "checkbox-group", "image", "input", "label", "navigator", "picker",
  "radio", "radio-group", "scroll-view", "slider", "swiper", "swiper-item", "switch", "text",
  "textarea", "view",
]);

function normalizeUniComponentTags(code) {
  return code.replace(/<(\\/)?([a-z][a-z0-9-]*)(?=[\\s>])/g, (match, closing, name) => {
    return uniTemplateTags.has(name) ? "<" + (closing || "") + "uni-" + name : match;
  });
}
const requireFromPreviewToolchain = createRequire(${jsString(fileURLToPath(import.meta.url))});
const vitePackageRoot = dirname(requireFromPreviewToolchain.resolve("vite/package.json"));
const viteModuleUrl = pathToFileURL(resolve(vitePackageRoot, "dist/node/index.js")).href;
const { transformWithEsbuild } = await import(viteModuleUrl);
const previewBase = process.env.VIBE_FOUNDRY_PREVIEW_BASE || "/";
${vuePluginImport}
${unoCssImport}

export default {
  base: previewBase,
  resolve: {
    alias: [
      { find: /^~/, replacement: resolve(projectRoot, "node_modules") + "/" },
      { find: /^@\\//, replacement: resolve(projectRoot, "src") + "/" },
      ...(useUniH5 ? [{ find: "vue", replacement: resolve(projectRoot, "node_modules/@dcloudio/uni-h5-vue") }] : ${hasVuePreviews ? '[{ find: "vue", replacement: dirname(createRequire(resolve(projectRoot, "package.json")).resolve("vue/package.json")) }]' : "[]"}),
    ],
  },
  plugins: [
    {
      name: "vibe-preview-project-dependencies",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer || source.startsWith(".") || source.startsWith("/") || source.includes(":") || source.startsWith("\\0")) return null;
        const normalized = importer.replaceAll("\\\\", "/");
        if (!normalized.startsWith(previewRoot.replaceAll("\\\\", "/") + "/")) return null;
        return this.resolve(source, resolve(projectRoot, "package.json"), { skipSelf: true });
      },
    },
${unoCssPluginEntry}${vuePluginEntry}${uniRpxPluginEntry}    {
      name: "vibe-foundry-ts-source-loader",
      enforce: "pre",
      transform(code, id) {
        const sourcePath = id.split("?")[0];
        if (!projectTsSourcePattern.test(sourcePath) || sourcePath.endsWith(".d.ts") || sourcePath.includes("node_modules")) {
          return null;
        }
        return transformWithEsbuild(code, sourcePath, {
          loader: "ts",
        });
      },
    },
    {
      name: "vibe-foundry-jsx-in-js-loader",
      enforce: "pre",
      transform(code, id) {
        const sourcePath = id.split("?")[0];
        if (!projectJsSourcePattern.test(sourcePath) || sourcePath.includes("node_modules")) {
          return null;
        }
        return transformWithEsbuild(code, sourcePath, {
          loader: "jsx",
          jsx: "automatic",
        });
      },
    },
  ],
  server: {
    fs: {
      allow: [projectRoot, previewRoot],
    },
  },
  define: {
    "process.env": {},
    ...(useUniH5 ? {
      "__VUE_OPTIONS_API__": true,
      "__VUE_PROD_DEVTOOLS__": false,
      "__VUE_PROD_HYDRATION_MISMATCH_DETAILS__": false,
      "__UNI_FEATURE_WX__": false,
      "__UNI_FEATURE_WXS__": true,
      "__UNI_FEATURE_LONGPRESS__": true,
      "__UNI_FEATURE_ROUTER_MODE__": JSON.stringify("hash"),
      "__UNI_FEATURE_I18N_EN__": false,
      "__UNI_FEATURE_I18N_ES__": false,
      "__UNI_FEATURE_I18N_FR__": false,
      "__UNI_FEATURE_I18N_ZH_HANS__": false,
      "__UNI_FEATURE_I18N_ZH_HANT__": false,
      "__UNI_FEATURE_I18N_LOCALE__": false,
      "__UNI_FEATURE_UNI_CLOUD__": false,
      "__UNI_FEATURE_PAGES__": false,
      "__UNI_FEATURE_TABBAR__": false,
      "__UNI_FEATURE_TABBAR_MIDBUTTON__": false,
      "__UNI_FEATURE_TOPWINDOW__": false,
      "__UNI_FEATURE_LEFTWINDOW__": false,
      "__UNI_FEATURE_RIGHTWINDOW__": false,
      "__UNI_FEATURE_RESPONSIVE__": false,
      "__UNI_FEATURE_NAVIGATIONBAR__": false,
      "__UNI_FEATURE_PULL_DOWN_REFRESH__": false,
      "__UNI_FEATURE_NAVIGATIONBAR_BUTTONS__": false,
      "__UNI_FEATURE_NAVIGATIONBAR_SEARCHINPUT__": false,
      "__UNI_FEATURE_NAVIGATIONBAR_TRANSPARENT__": false,
    } : {}),
  },
${hasVuePreviews ? "" : `  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
`}  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" },
    },
  },
};
`;
}

function previewCssFile() {
  return `:root {
  --vibe-foundry-rpx-unit: calc(100vw / 750);
}
@media (min-width: 961px) {
  :root { --vibe-foundry-rpx-unit: 0.5px; }
}
html,
body,
#root {
  margin: 0;
  min-height: 100%;
}
.vibe-preview-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  background: #f5f5f7;
  color: #1d1d1f;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Microsoft YaHei", sans-serif;
}
.vibe-preview-shell.embedded {
  display: block;
  min-height: 100vh;
  background: #ffffff;
}
.vibe-preview-sidebar {
  padding: 22px;
  border-right: 1px solid #d2d2d7;
  background: #ffffff;
}
.vibe-preview-sidebar strong {
  display: block;
  margin-bottom: 16px;
}
.vibe-preview-sidebar button {
  width: 100%;
  border: 1px solid #d2d2d7;
  border-radius: 8px;
  margin-bottom: 8px;
  padding: 10px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
}
.vibe-preview-sidebar button.active {
  border-color: #0071e3;
  background: #e8f2ff;
}
.vibe-preview-sidebar span {
  display: block;
  margin-top: 3px;
  color: #6e6e73;
  font-size: 12px;
}
.vibe-preview-main {
  min-width: 0;
  padding: 24px;
}
.vibe-preview-main header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
}
.vibe-preview-main h1 {
  margin: 0;
  font-size: 24px;
}
.vibe-preview-main p {
  margin: 5px 0 0;
  color: #6e6e73;
  font-size: 13px;
}
.vibe-preview-main header button {
  height: 36px;
  border: 0;
  border-radius: 8px;
  padding: 0 14px;
  background: #0071e3;
  color: #ffffff;
  cursor: pointer;
}
.vibe-preview-canvas {
  min-height: 640px;
  border: 1px solid #d2d2d7;
  border-radius: 10px;
  padding: 24px;
  background: #ffffff;
  overflow: auto;
}
.vibe-preview-shell.embedded .vibe-preview-main {
  height: 100vh;
  min-height: 100vh;
  padding: 0;
  overflow: hidden;
}
.vibe-preview-shell.embedded .vibe-preview-canvas {
  height: 100vh;
  min-height: 100vh;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 0;
  padding: clamp(8px, 2vw, 18px);
  overflow-x: hidden;
  overflow-y: auto;
}
.vibe-preview-fit-stage {
  --vibe-preview-scale: 1;
  --vibe-preview-available-width: none;
  width: max-content;
  height: max-content;
  max-width: none;
  max-height: none;
  transform: scale(var(--vibe-preview-scale));
  transform-origin: center center;
  transition: transform 120ms ease;
}
.vibe-preview-fit-target {
  width: max-content;
  min-width: var(--vibe-preview-available-width);
  height: max-content;
  max-width: none;
  max-height: none;
}
.vibe-preview-fit-target > * {
  max-width: var(--vibe-preview-available-width);
}
.vibe-preview-fit-target :is(svg, img, canvas, video) {
  max-width: var(--vibe-preview-available-width);
  object-fit: contain;
}
.vibe-preview-empty {
  color: #6e6e73;
}
@media (max-width: 760px) {
  .vibe-preview-shell {
    grid-template-columns: 1fr;
  }
  .vibe-preview-sidebar {
    border-right: 0;
    border-bottom: 1px solid #d2d2d7;
  }
}
`;
}

function packageFile() {
  return `{
  "name": "vibe-foundry-component-preview-runtime",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build"
  }
}
`;
}

function indexHtmlFile(entryPath = "/src/App.jsx") {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VibeFoundry Component Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${entryPath}"></script>
  </body>
</html>
`;
}

function runtimeForBuild(registry, options = {}) {
  if (options.runtime) {
    return options.runtime;
  }
  if (registry.runtime && registry.runtime !== mixedRuntime) {
    return registry.runtime;
  }
  return registry.previews.find((preview) => preview.status === "ready")?.runtime ?? reactRuntime;
}

export function buildPreviewRuntimeFiles(registry, options = {}) {
  const runtime = runtimeForBuild(registry, options);
  const readyPreviews = registry.previews.filter((preview) =>
    preview.buildable !== false && preview.status !== "blocked"
      && preview.runtime === runtime
      && (!options.previewId || preview.id === options.previewId),
  );
  const hasVuePreviews = runtime === vueRuntime;
  const hasUniH5 = readyPreviews.some((preview) => preview.platformRuntime === "uni-h5");
  const files = {
    "package.json": packageFile(),
    "index.html": indexHtmlFile(hasVuePreviews ? "/src/App.js" : "/src/App.jsx"),
    "vite.config.js": viteConfigFile({
      hasVuePreviews,
      vueVersion: options.vueVersion,
      projectRootRelativePath: options.projectRootRelativePath,
      runtimeContext: options.runtimeContext,
      hasUniH5,
    }),
    [hasVuePreviews ? "src/App.js" : "src/App.jsx"]: hasVuePreviews
      ? vueAppFileFor(readyPreviews, options)
      : reactAppFileFor(readyPreviews, options),
    "src/preview-data.js": previewDataFileFor(options.previewId ? { ...registry, previews: readyPreviews } : registry),
    "src/vibe-preview.css": previewCssFile(),
  };
  for (const preview of readyPreviews) {
    files[`src/previews/${preview.id}.${hasVuePreviews ? "vue" : "jsx"}`] = hasVuePreviews
      ? vuePreviewFileFor(preview, options)
      : reactPreviewFileFor(preview, options);
  }
  return files;
}

export function resolveComponentPreview(registry, target) {
  const normalizedTarget = normalizePath(target).toLowerCase();
  return registry.previews.find((preview) => {
    return (
      preview.id.toLowerCase() === normalizedTarget ||
      preview.componentName.toLowerCase() === normalizedTarget ||
      preview.componentPath.toLowerCase() === normalizedTarget
    );
  }) ?? null;
}

const cssImportPattern = /\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+\.(?:css|scss|sass|less|styl|stylus))["']/g;

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function sourceReaderFor(projectRoot, sourceIndex) {
  const texts = new Map((sourceIndex?.files ?? []).map((file) => [file.filePath, file.sourceText]));
  return (filePath) => {
    const normalized = normalizePath(filePath);
    if (!texts.has(normalized)) texts.set(normalized, readOptionalText(join(projectRoot, normalized)));
    return texts.get(normalized);
  };
}

async function discoverProjectStyleImports(projectRoot, readSource) {
  const imports = [];
  const addImport = (sourcePath) => {
    const normalizedSource = normalizePath(sourcePath);
    if (!imports.includes(normalizedSource)) {
      imports.push(normalizedSource);
    }
  };
  const entryFiles = [
    "src/index.js",
    "src/index.jsx",
    "src/index.tsx",
    "src/main.js",
    "src/main.jsx",
    "src/main.ts",
    "src/main.tsx",
    "app/layout.tsx",
    "app/layout.jsx",
    "src/app/layout.tsx",
    "src/app/layout.jsx",
    "pages/_app.tsx",
    "pages/_app.jsx",
    "src/pages/_app.tsx",
    "src/pages/_app.jsx",
  ];
  for (const entryFile of entryFiles) {
    const entryText = await readSource(entryFile);
    for (const match of entryText.matchAll(cssImportPattern)) {
      const source = match[1];
      if (source.startsWith(".")) {
        addImport(relative(projectRoot, resolve(projectRoot, dirname(entryFile), source)));
      } else {
        addImport(source);
      }
    }
  }
  return imports;
}

export async function discoverPreviewStyleImports(projectRoot, previews, options = {}) {
  const readSource = sourceReaderFor(projectRoot, options.sourceIndex);
  const imports = [];
  for (const preview of previews) {
    const sourceFile = preview.previewScenario?.sourceFile;
    if (!sourceFile) {
      continue;
    }
    const sourceText = await readSource(sourceFile);
    for (const match of sourceText.matchAll(cssImportPattern)) {
      const source = match[1];
      const importPath = source.startsWith(".")
        ? normalizePath(relative(projectRoot, resolve(projectRoot, dirname(sourceFile), source)))
        : source;
      if (!imports.includes(importPath)) {
        imports.push(importPath);
      }
    }
  }
  return imports;
}

export async function discoverPreviewRuntimeContext(projectRoot, options = {}) {
  const readSource = sourceReaderFor(projectRoot, options.sourceIndex);
  const packageJsonText = await readSource("package.json");
  const packageJson = packageJsonText ? JSON.parse(packageJsonText) : {};
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  const runtimeFiles = options.sourceIndex?.files
    ?? await listFiles(projectRoot, ["src"], [".js", ".jsx", ".ts", ".tsx", ".vue"]);
  const runtimeSources = await Promise.all(runtimeFiles.map(async (file) => ({
    filePath: file.filePath,
    source: await readSource(file.filePath),
  })));
  const vueVersion = installedVueVersion(projectRoot);
  const runtimeSourceText = runtimeSources.map((item) => item.source).join("\n");
  const providers = [];
  if ("react-router-dom" in dependencies && /\b(?:BrowserRouter|RouterProvider|createBrowserRouter|useRoutes)\b/.test(runtimeSourceText)) {
    providers.push("react-router-memory");
  }
  if ("pinia" in dependencies && /\bcreatePinia\s*\(|\.use\s*\(\s*pinia\b/.test(runtimeSourceText)) {
    providers.push("vue-pinia");
  }
  if ("vue-router" in dependencies && /\bcreateRouter\s*\(|\.use\s*\(\s*router\b/.test(runtimeSourceText)) {
    providers.push("vue-router-memory");
  }
  if (vueVersion?.startsWith("2.") && "vue-router" in dependencies && /new Router\s*\(/.test(runtimeSourceText)) {
    if (!providers.includes("vue-router-memory")) providers.push("vue-router-memory");
  }
  if (vueVersion?.startsWith("2.") && "element-ui" in dependencies && /Vue\.use\s*\(\s*Element(?:UI)?\b/.test(runtimeSourceText)) providers.push("vue2-element-ui");
  const unresolved = [];
  if (
    ("redux" in dependencies || "react-redux" in dependencies || "@reduxjs/toolkit" in dependencies)
    && /\b(?:configureStore|createStore|react-redux)\b/.test(runtimeSourceText)
  ) {
    unresolved.push("redux-store");
  }
  if (
    ("i18next" in dependencies || "react-i18next" in dependencies || "vue-i18n" in dependencies)
    && /\b(?:createI18n|I18nextProvider|initReactI18next)\b/.test(runtimeSourceText)
  ) {
    unresolved.push("i18n-messages");
  }
  const environmentVariables = [...runtimeSourceText.matchAll(
    /\b(?:import\.meta\.env|process\.env)\.([A-Z][A-Z0-9_]*)\b/g,
  )].map((match) => match[1]).filter((name, index, names) => names.indexOf(name) === index).sort();
  const globalStyles = await discoverProjectStyleImports(projectRoot, readSource);
  const plugins = "unocss" in dependencies ? ["unocss"] : [];
  const runtimeEvidence = runtimeSources.filter((item) =>
    /\b(?:BrowserRouter|RouterProvider|createBrowserRouter|useRoutes|createPinia|createRouter|configureStore|createStore|createI18n|I18nextProvider|initReactI18next)\b|react-redux/.test(item.source),
  );
  const lockfileText = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]
    .map(async (fileName) => readSource(fileName));
  const dependencyFingerprint = fullFingerprint({
    packageJson: packageJsonText,
    vueVersion,
    lockfiles: await Promise.all(lockfileText),
    globalStyles: await Promise.all(globalStyles.map(async (filePath) => ({
      filePath,
      source: await readSource(filePath),
    }))),
    runtimeEvidence: runtimeEvidence.map((item) => ({ filePath: item.filePath, digest: fullFingerprint(item.source) })),
    providers,
    plugins,
    unresolved,
    environmentVariables,
  });
  return {
    vueVersion,
    providers,
    globalStyles,
    plugins,
    networkPolicy: "block-external",
    unresolved,
    environmentVariables,
    sourceFiles: runtimeEvidence.map((item) => item.filePath),
    fingerprint: dependencyFingerprint,
  };
}

export async function writeComponentPreviewRuntime(projectRoot, registry, options = {}) {
  const resolvedRoot = resolve(projectRoot);
  const previewRoot = options.previewRoot
    ? resolve(options.previewRoot)
    : join(
        assetPackageDirectoryFor(
          resolveAssetLibraryRoot(options.assetLibraryRoot),
          resolvedRoot,
        ),
        "preview-runtime",
      );
  const runtimeSourceRoot = join(previewRoot, "src");
  const projectRootRelativePath = normalizePath(relative(previewRoot, resolvedRoot));
  const runtimeImportPrefix = normalizePath(relative(runtimeSourceRoot, resolvedRoot));
  const componentImportPrefix = normalizePath(relative(join(runtimeSourceRoot, "previews"), resolvedRoot));
  const runtimeContext = options.runtimeContext
    ?? registry.runtimeContext
    ?? await discoverPreviewRuntimeContext(resolvedRoot);
  const selectedPreviews = options.previewId
    ? registry.previews.filter((preview) => preview.id === options.previewId)
    : registry.previews;
  const scenarioStyleImports = await discoverPreviewStyleImports(resolvedRoot, selectedPreviews, { sourceIndex: options.sourceIndex });
  const globalStyleImports = [...new Set([
    ...runtimeContext.globalStyles,
    ...scenarioStyleImports,
  ])];
  const files = buildPreviewRuntimeFiles(registry, {
    globalStyleImports,
    vueVersion: installedVueVersion(resolvedRoot),
    runtime: options.runtime,
    previewId: options.previewId,
    projectRootRelativePath,
    runtimeImportPrefix,
    componentImportPrefix,
    runtimeContext,
  });
  await mkdir(previewRoot, { recursive: true });
  await Promise.all(
    Object.entries(files).map(async ([filePath, content]) => {
      const outputPath = join(previewRoot, filePath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, content);
    }),
  );
  return { previewRoot };
}

export async function prepareComponentPreviewRuntime(projectRoot, options = {}) {
  const resolvedRoot = resolve(projectRoot);
  const assetDir = options.assetDir
    ? resolve(options.assetDir)
    : assetPackageDirectoryFor(
        resolveAssetLibraryRoot(options.assetLibraryRoot),
        resolvedRoot,
      );
  const registry = JSON.parse(
    await readFile(join(assetDir, "component-previews.json"), "utf8"),
  );
  if (!registry.runtimeContext) {
    throw new Error("Component preview runtime context is missing. Run vibe-foundry distill again.");
  }
  const runtimeContext = registry.runtimeContext;
  const selectedPreview = resolveComponentPreview(registry, options.component)
    ?? registry.previews.find((candidate) => candidate.buildable !== false);
  const previewRoot = selectedPreview && typeof options.previewRootFor === "function"
    ? options.previewRootFor(selectedPreview)
    : options.previewRoot ?? join(assetDir, "preview-runtime");
  const runtime = await writeComponentPreviewRuntime(resolvedRoot, registry, {
    runtime: selectedPreview?.runtime,
    previewId: selectedPreview?.id,
    previewRoot,
    runtimeContext,
  });
  return { registry, selectedPreview, ...runtime };
}

export function createPreviewBuildProcessSpec(outDir) {
  const vitePackageRoot = dirname(requireFromPreviewToolchain.resolve("vite/package.json"));
  return {
    command: process.execPath,
    args: [join(vitePackageRoot, "bin", "vite.js"), "build", "--outDir", outDir, "--emptyOutDir"],
  };
}

function runPreviewBuild(processSpec, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      processSpec.command,
      processSpec.args,
      {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error((stderr || stdout || `Preview build failed with exit code ${code}`).trim()));
    });
  });
}

export async function buildComponentPreviewStaticBundle(projectRoot, options = {}) {
  const resolvedRoot = resolve(projectRoot);
  const assetDir = options.assetDir
    ? resolve(options.assetDir)
    : assetPackageDirectoryFor(
        resolveAssetLibraryRoot(options.assetLibraryRoot),
        resolvedRoot,
      );
  const registry = JSON.parse(await readFile(join(assetDir, "component-previews.json"), "utf8"));
  const preview = resolveComponentPreview(registry, options.component)
    ?? registry.previews.find((candidate) => candidate.buildable !== false);
  if (!preview) {
    throw new Error("No runnable component preview found.");
  }
  if (preview.status === "blocked" || preview.buildable === false) {
    throw new Error(`Component preview is blocked: ${preview.blockers.join(" ")}`);
  }
  if (!preview.actionDigest) {
    throw new Error("Component preview action digest is missing. Run vibe-foundry distill again.");
  }

  const previewUrl = componentPreviewVersionUrl(preview.id, preview.actionDigest);
  const cache = openPreviewBuildCache(assetDir);
  const owner = randomUUID();
  const leaseTtlMs = options.leaseTtlMs ?? 30_000;
  const leasePollMs = options.leasePollMs ?? 100;
  const leaseWaitMs = options.leaseWaitMs ?? 120_000;
  const transientRetryBaseMs = options.transientRetryBaseMs ?? 1_000;
  const maxTransientAttempts = options.maxTransientAttempts ?? 3;
  let leaseOwned = false;
  let previewRoot = "";
  try {
    const deadline = Date.now() + leaseWaitMs;
    while (!leaseOwned) {
      const lookup = await cache.lookup(preview.actionDigest);
      if (lookup.reason === "HIT") {
        return {
          previewUrl,
          component: preview.componentName,
          actionDigest: preview.actionDigest,
          artifactTreeDigest: lookup.artifactTreeDigest,
          assetDir,
        };
      }
      if (lookup.reason === "NEGATIVE_CACHE_HIT") {
        throw new Error(`Cached component preview build failure: ${lookup.failureCode}`);
      }
      const now = Date.now();
      if (lookup.reason === "TRANSIENT_FAILURE") {
        if (lookup.attemptCount >= maxTransientAttempts) {
          throw new Error(
            `Transient component preview retry budget exhausted: ${lookup.failureCode}`,
          );
        }
        const retryDelay = transientRetryBaseMs * (2 ** Math.max(0, lookup.attemptCount - 1));
        if (now < lookup.updatedAt + retryDelay) {
          throw new Error(
            `Transient component preview failure is cooling down: ${lookup.failureCode}`,
          );
        }
      }
      leaseOwned = cache.claim(preview.actionDigest, owner, { now, ttlMs: leaseTtlMs });
      if (!leaseOwned) {
        if (now >= deadline) {
          throw new Error(`Timed out waiting for component preview action: ${preview.actionDigest}`);
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, leasePollMs));
      }
    }

    const prepared = await prepareComponentPreviewRuntime(resolvedRoot, {
      assetDir,
      component: preview.id,
      previewRootFor: (selectedPreview) => join(
        assetDir,
        "preview-runtime-static",
        `${selectedPreview.id}-${owner}`,
      ),
    });
    previewRoot = prepared.previewRoot;
    const outputDir = join(prepared.previewRoot, "dist");
    const buildOutDir = relative(prepared.previewRoot, outputDir);
    const processSpec = options.buildProcessSpec ?? createPreviewBuildProcessSpec(buildOutDir);
    const buildEnvironment = createSafeProcessEnvironment(options.hostEnvironment, {
      BROWSER: "none",
      VIBE_FOUNDRY_PREVIEW_BASE: previewUrl,
    });
    const heartbeat = setInterval(() => {
      cache.renew(preview.actionDigest, owner, {
        now: Date.now(),
        ttlMs: leaseTtlMs,
      });
    }, Math.max(1_000, Math.floor(leaseTtlMs / 3)));
    try {
      if (options.executeBuild) {
        await options.executeBuild({
          outputDir,
          previewRoot: prepared.previewRoot,
          preview,
          processSpec,
          env: buildEnvironment,
        });
      } else {
        if (!options.buildProcessSpec) assertPreviewDependencies(resolvedRoot, preview.runtime);
        await runPreviewBuild(processSpec, {
          cwd: prepared.previewRoot,
          env: buildEnvironment,
        });
      }
    } finally {
      clearInterval(heartbeat);
    }
    await writeFile(join(outputDir, "preview-manifest.json"), stableJson({
      componentId: preview.id,
      actionDigest: preview.actionDigest,
    }));
    const committed = await cache.commitSuccess({
      actionDigest: preview.actionDigest,
      leaseOwner: owner,
      outputDir,
      completedAt: Date.now(),
    });
    if (!committed.committed) {
      throw new Error(`Component preview lease was lost before commit: ${preview.actionDigest}`);
    }
    return {
      previewUrl,
      component: preview.componentName,
      actionDigest: preview.actionDigest,
      artifactTreeDigest: committed.artifactTreeDigest,
      assetDir,
    };
  } catch (error) {
    if (leaseOwned) {
      const transientCodes = new Set(["EAGAIN", "EBUSY", "ENOMEM"]);
      await cache.commitFailure({
        actionDigest: preview.actionDigest,
        leaseOwner: owner,
        failureClass: transientCodes.has(error?.code) ? "transient" : "deterministic",
        failureCode: error?.code ?? "BUILD_ERROR",
        completedAt: Date.now(),
      });
    }
    throw error;
  } finally {
    if (previewRoot) {
      await rm(previewRoot, { recursive: true, force: true });
    }
    cache.close();
  }
}
