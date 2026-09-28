export function createScopedStorage(storage, scope) {
  const prefix = `vibehub-preview:${encodeURIComponent(scope)}:`;
  const keys = () => Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key) => key?.startsWith(prefix)).map((key) => key.slice(prefix.length));
  const methods = {
    get length() { return keys().length; },
    key(index) { return keys()[index] ?? null; },
    getItem(key) { return storage.getItem(prefix + String(key)); },
    setItem(key, value) { storage.setItem(prefix + String(key), String(value)); },
    removeItem(key) { storage.removeItem(prefix + String(key)); },
    clear() { keys().forEach((key) => storage.removeItem(prefix + key)); },
  };
  return new Proxy(methods, {
    get(target, key) { return key in target || typeof key === 'symbol' ? target[key] : target.getItem(key) ?? undefined; },
    set(target, key, value) { target.setItem(key, value); return true; },
    deleteProperty(target, key) { target.removeItem(key); return true; },
    ownKeys() { return keys(); },
    getOwnPropertyDescriptor(target, key) {
      return keys().includes(key) ? { configurable: true, enumerable: true, writable: true, value: target.getItem(key) } : undefined;
    },
  });
}

export function installUniPreviewHost(host, official, scope, reportLimitation, baseUrl, page) {
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(host, name, { configurable: true, value: createScopedStorage(host[name], scope) });
  }
  host.__uniConfig = { appId: 'vibehub-preview', appName: 'VibeHub 组件预览', locale: host.navigator.language, locales: {}, globalStyle: {}, router: { base: baseUrl } };
  if (page) {
    host.__uniConfig.globalStyle = page.globalStyle;
    host.__uniConfig.nvue = page.nvue;
    host.__uniRoutes = [{ path: page.route, meta: { ...page.style, route: page.route.replace(/^\//, '') } }];
  }
  host.UniServiceJSBridge = official.UniServiceJSBridge;
  host.UniViewJSBridge = official.UniViewJSBridge;
  host.getCurrentPages = official.getCurrentPages;
  host.getApp = official.getApp;
  host.uni = { ...official.uni };
  const blocked = {
    navigateTo: '预览未注册目标页面，无法跳转', redirectTo: '预览未注册目标页面，无法跳转',
    reLaunch: '预览未注册目标页面，无法重启应用', switchTab: '预览未注册目标 TabBar 页面', navigateBack: '独立预览没有应用页面返回栈',
    request: '独立预览未连接业务服务', uploadFile: '独立预览未连接上传服务', downloadFile: '独立预览未连接下载服务', connectSocket: '独立预览未连接业务消息服务',
  };
  for (const [name, reason] of Object.entries(blocked)) {
    host.uni[name] = (options = {}) => {
      const error = { errMsg: `${name}:fail ${reason}` };
      reportLimitation(error.errMsg);
      if (typeof options.fail === 'function' || typeof options.complete === 'function' || typeof options.success === 'function') {
        options.fail?.(error); options.complete?.(error); return;
      }
      return Promise.reject(error);
    };
  }
}

export function wrapUniPreviewPage(setupPage, component, host = globalThis) {
  const page = setupPage(component);
  const setup = page.setup;
  page.setup = function(...args) {
    const original = host.location.href;
    const pageUrl = new URL(original);
    pageUrl.searchParams.delete('embed');
    pageUrl.searchParams.delete('component');
    host.history.replaceState(host.history.state, '', pageUrl.href);
    try { return setup.apply(this, args); }
    finally { host.history.replaceState(host.history.state, '', original); }
  };
  return page;
}

export function uniPreviewHostSource(scope, page, cloud = false) {
  return `import { uni, getCurrentPages, getApp, UniServiceJSBridge, UniViewJSBridge } from "@dcloudio/uni-h5";
${createScopedStorage.toString()}
${installUniPreviewHost.toString()}
export ${wrapUniPreviewPage.toString()}
function reportLimitation(message) {
  let notice = document.querySelector('[data-vibe-runtime-limitation]');
  if (!notice) {
    notice = document.createElement('div');
    notice.setAttribute('data-vibe-runtime-limitation', '');
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;bottom:4px;left:4px;right:4px;z-index:2147483647;padding:8px;background:#fff7df;color:#58471d;font:12px sans-serif;pointer-events:none';
    document.body.appendChild(notice);
  }
  notice.textContent = message;
}
installUniPreviewHost(globalThis, { uni, getCurrentPages, getApp, UniServiceJSBridge, UniViewJSBridge }, ${JSON.stringify(scope)}, reportLimitation, import.meta.env.BASE_URL, ${JSON.stringify(page ?? null)});
export const uniCloudReady = ${cloud ? 'import("@dcloudio/uni-cloud").then(module => { globalThis.uniCloud = module.default; })' : 'Promise.resolve()'};
window.addEventListener('unhandledrejection', event => {
  const message = event.reason?.errMsg;
  if (typeof message === 'string' && /^(hideTabBar|showTabBar):fail not TabBar page$/.test(message)) {
    event.preventDefault();
    reportLimitation('当前独立预览没有 TabBar 页面，无法切换底栏；其他交互仍可使用。');
  }
});
`;
}
