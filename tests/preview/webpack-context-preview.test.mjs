import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverPreviewRuntimeContext, buildComponentPreviewRegistry, buildPreviewRuntimeFiles } from '../../dist/preview/component-preview-runtime.js';
import { webpackContextPreviewPlugin } from '../../dist/preview/webpack-context-preview.js';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-webpack-context-'));
  const put = async (file, text) => { const path = join(root, file); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, text); };
  try {
    await put('package.json', JSON.stringify({ dependencies: { vue: '2.6.14', 'svg-sprite-loader': '5.1.1' } }));
    await put('node_modules/vue/package.json', JSON.stringify({ name: 'vue', version: '2.6.14' }));
    await put('src/main.js', "import './assets/icons';");
    await put('src/assets/icons/index.js', "import Vue from 'vue'; import SvgIcon from '@/components/SvgIcon'; Vue.component('svg-icon', SvgIcon); const req = require.context('./svg', false, /\\.svg$/); req.keys().map(req);");
    await put('src/components/SvgIcon/index.vue', '<template><svg><use :href="`#icon-${name}`" /></svg></template>');
    await put('vue.config.js', "module.exports = { chainWebpack(config) { config.module.rule('icons').test(/\\.svg$/).include.add(resolve('src/assets/icons')).end().use('svg-sprite-loader').loader('svg-sprite-loader').options({ symbolId: 'icon-[name]' }).end(); } };");
    await put('src/assets/icons/svg/star.svg', '<svg viewBox="0 0 16 16"><path d="M0 0h16v16z"/></svg>');
    await run(root, put);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('discovers authored SVG sprite registration and invalidates context when icon contents change', async () => fixture(async (root, put) => {
  const first = await discoverPreviewRuntimeContext(root);
  assert.deepEqual(first.webpackSvgSprites?.entries, ['src/assets/icons/index.js']);
  assert.equal(first.webpackSvgSprites?.symbolId, 'icon-[name]');
  assert.equal(first.webpackSvgSprites?.directory, 'src/assets/icons');
  await put('src/assets/icons/svg/star.svg', '<svg viewBox="0 0 16 16"><circle r="4"/></svg>');
  const changed = await discoverPreviewRuntimeContext(root);
  assert.notEqual(changed.fingerprint, first.fingerprint);
  const registry = buildComponentPreviewRegistry([{ name: 'IconSelect', filePath: 'src/components/IconSelect/index.vue', exportMode: 'default' }], { projectRoot: root, runtimeContext: changed });
  const files = buildPreviewRuntimeFiles(registry, { vueVersion: '2.6.14', runtimeContext: changed });
  assert.match(files['src/App.js'], /assets\/icons\/index\.js/);
  assert.match(files['vite.config.js'], /webpackContextPreviewPlugin/);
  assert.match(files['vite.config.js'], /extensions:.*"\.vue"/);
}));

test('does not activate sprite adaptation for a config string or an unimported registration', async () => fixture(async (root, put) => {
  await put('src/main.js', '// no authored icon entry');
  assert.equal((await discoverPreviewRuntimeContext(root)).webpackSvgSprites, null);
  await put('src/main.js', "import './assets/icons';");
  await put('vue.config.js', "const docs = \".loader('svg-sprite-loader').options({symbolId:'icon-[name]'})\";");
  assert.equal((await discoverPreviewRuntimeContext(root)).webpackSvgSprites, null);
}));

test('unsupported JS contexts and recursive contexts fail rather than changing require semantics', async () => fixture(async (root, put) => {
  await put('src/assets/icons/svg/data.json', '{"label":"真实数据"}');
  const config = (await discoverPreviewRuntimeContext(root)).webpackSvgSprites;
  const plugin = webpackContextPreviewPlugin(root, config);
  const run = code => plugin.transform.call({ addWatchFile() {} }, code, join(root, 'src/assets/icons/index.js'));
  await assert.rejects(run("require.context('./svg', false, /\\.json$/)"), /仅支持已确认规则的 SVG/);
  await assert.rejects(run("require.context('./svg', true, /\\.svg$/)"), /仅支持非递归/);
}));

test('unknown SVG loaders and dynamic context arguments fail explicitly', async () => fixture(async (root, put) => {
  const plugin = webpackContextPreviewPlugin(root);
  const id = join(root, 'src/assets/icons/index.js');
  const run = code => plugin.transform.call({ addWatchFile() {} }, code, id);
  await assert.rejects(run("require.context('./svg', false, /\\.svg$/)"), /SVG loader 语义尚未确认/);
  await put('src/assets/icons/empty/ignored.txt', 'not an icon');
  await assert.rejects(run("require.context('./empty', false, /\\.svg$/)"), /SVG loader 语义尚未确认/);
  for (const code of ["require.context(path, false, /\\.svg$/)", "require.context('./svg', false, /\\.svg$/, 'lazy')", "require.context('./svg', false, /\\.svg$/g)"]) {
    await assert.rejects(run(code), /尚未支持此 require.context 参数/);
  }
  assert.equal(await run("// require.context('./svg', false, /\\.svg$/)"), null);
}));

test('SVG transformation marks actual files for sprite compilation and missing source compiler fails', async () => fixture(async (root) => {
  const context = await discoverPreviewRuntimeContext(root);
  const plugin = webpackContextPreviewPlugin(root, context.webpackSvgSprites);
  const code = await readFile(join(root, 'src/assets/icons/index.js'), 'utf8');
  const result = await plugin.transform.call({ addWatchFile() {} }, code, join(root, 'src/assets/icons/index.js'));
  assert.match(result.code, /star\.svg\?vibehub-svg-symbol/);
  assert.match(result.code, /"\.\/star\.svg"/);
  await assert.rejects(plugin.load(join(root, 'src/assets/icons/svg/star.svg') + '?vibehub-svg-symbol'), /svg-sprite-loader/);
}));

test('local require bindings and duplicate SVG symbol names fail explicitly', async () => fixture(async (root, put) => {
  const config = (await discoverPreviewRuntimeContext(root)).webpackSvgSprites;
  const plugin = webpackContextPreviewPlugin(root, config);
  const run = code => plugin.transform.call({ addWatchFile() {} }, code, join(root, 'src/assets/icons/index.js'));
  await assert.rejects(run("function custom(require) { return require.context('./svg', false, /\\.svg$/); }"), /局部 require 绑定/);
  await run("require.context('./svg', false, /\\.svg$/)");
  await put('src/assets/icons/other/star.svg', '<svg><circle r="5"/></svg>');
  await assert.rejects(run("require.context('./other', false, /\\.svg$/)"), /重复的 SVG symbol/);
}));

test('authored recursive lazy Vue contexts preserve deferred module promises and relative keys', async () => fixture(async (root, put) => {
  await put('src/views/login.vue', '<template><div>登录</div></template>');
  await put('src/views/system/user/index.vue', '<template><div>用户</div></template>');
  await put('src/views/ignored.js', 'export default 1');
  const watched=[];
  const plugin=webpackContextPreviewPlugin(root);
  const transformed=await plugin.transform.call({addWatchFile(path){watched.push(path);}}, "const views=require.context('@/views', true, /\\.vue$/, 'lazy');", join(root,'src/store/modules/permission.js'));
  assert.match(transformed.code,/=> import\(/);
  const requested=[];
  const context=Function('load',transformed.code.replaceAll('import(', 'load(')+';return views;')(async path=>{requested.push(path);return {default:'real fixture export'};});
  assert.deepEqual(context.keys(),['./login.vue','./system/user/index.vue']);
  assert.equal(requested.length,0);
  assert.deepEqual(await context('./login.vue'),{default:'real fixture export'});
  assert.equal(requested.length,1);
  await assert.rejects(context('./missing.vue'),{code:'MODULE_NOT_FOUND'});
  assert.ok(watched.some(path=>path.endsWith('index.vue')));
}));
