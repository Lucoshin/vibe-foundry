import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { discoverProjectAliases } from '../../dist/preview/project-aliases.js';
import { buildPreviewRuntimeFiles } from '../../dist/preview/component-preview-runtime.js';

test('preview build receives the source-proven aliases', () => {
  const files = buildPreviewRuntimeFiles({runtime:'vite-vue',previews:[]}, {
    runtimeContext:{projectAliases:{aliases:[{find:'vuex',replacement:'D:/fixture/src/compat/vuex.js'}],evidence:[]}},
  });
  assert.match(files['vite.config.js'], /D:\/fixture\/src\/compat\/vuex\.js/);
});

const root = resolve('fixture-project');
const read = files => async path => files[path] ?? '';

test('uses real exported Vite aliases and fingerprints the actual alias dependency graph', async () => {
  const files = {
    'vite.config.ts': `import type {UserConfig} from 'vite'; import {defineConfig} from 'vite'; import {resolve as resolvePath} from 'node:path'; export default defineConfig(async ({mode})=>{const ignored=mode;return {resolve:{alias:{'@':resolvePath('./src'),vuex:resolvePath('./src/compat/vuex.js'),'react':'preact/compat'}}} as UserConfig;});`,
    'src/compat/vuex.js': "export {state} from '../stores/legacy.js'",
    'src/stores/legacy.js': 'export const state = 1',
  };
  const sourceIndex = {files:[{filePath:'src/compat/vuex.js',dependencies:[{resolvedFilePath:'src/stores/legacy.js'}]},{filePath:'src/stores/legacy.js',dependencies:[]}]};
  const result = await discoverProjectAliases(root, read(files), {sourceIndex});
  assert.deepEqual(result.aliases,[{find:'@',replacement:resolve(root,'src')},{find:'vuex',replacement:resolve(root,'src/compat/vuex.js')},{find:'react',replacement:'preact/compat'}]);
  assert.deepEqual(result.evidence.map(item=>item.filePath),['vite.config.ts','src/compat/vuex.js','src/stores/legacy.js']);
  files['src/stores/legacy.js']='export const state = 2';
  assert.notDeepEqual((await discoverProjectAliases(root,read(files),{sourceIndex})).evidence,result.evidence);
});

test('supports URL-based local aliases without executing project config', async () => {
  const result=await discoverProjectAliases(root,read({'vite.config.js':`import {fileURLToPath as fromUrl} from 'node:url'; export default {resolve:{alias:{'@':fromUrl(new URL('./src',import.meta.url))}}};`}));
  assert.deepEqual(result.aliases,[{find:'@',replacement:resolve(root,'src')}]);
});

test('does not invent aliases for unrelated, computed, dynamic or shadowed expressions', async () => {
  for (const source of [
    `const unrelated={resolve:{alias:{vuex:'fake'}}}; export default {};`,
    `import {resolve} from 'node:path'; export default (resolve)=>({resolve:{alias:{vuex:resolve('./fake')}}});`,
    `import {defineConfig} from 'vite'; import {resolve} from 'node:path'; export default defineConfig(()=>{ const resolve=()=>'/fake'; return {resolve:{alias:{vuex:resolve('./src/real.js')}}};});`,
    `import {defineConfig} from 'other'; export default defineConfig({resolve:{alias:{vuex:'fake'}}});`,
    `export default {resolve:{alias:{[name]:'fake', vuex:process.env.ALIAS}}};`,
  ]) assert.deepEqual((await discoverProjectAliases(root,read({'vite.config.ts':source}))).aliases,[]);
});
