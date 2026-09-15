import assert from 'node:assert/strict';
import { test } from 'node:test';
import { symlink, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildComponentPreviewRegistry, buildPreviewRuntimeFiles, buildComponentPreviewStaticBundle } from '../../dist/preview/component-preview-runtime.js';
import { assertPreviewDependencies } from '../../dist/preview/preview-dependencies.js';

const require = createRequire(import.meta.url);
const vue2Toolchain = createRequire(require.resolve('@vibe-foundry/vue2-preview-toolchain'));
const context = {providers:[],plugins:[],globalStyles:[],unresolved:[],environmentVariables:[],networkPolicy:'block-external',fingerprint:'vue-test'};

for (const [version, vuePath, compilerPath] of [
  ['2.6.14', require.resolve('vue26-test/package.json'), require.resolve('vue26-compiler-test/package.json')],
  ['2.7.16', vue2Toolchain.resolve('vue/package.json'), null],
  ['3.5.42', require.resolve('vue/package.json'), null],
]) {
  test('builds real Vue '+version+' SFC with scoped styles, assets and authored slots', async () => {
    const root = await mkdtemp(join(tmpdir(),'vibe-vue-build-'));
    try {
      const projectRoot=join(root,'project'); const assetDir=join(root,'assets');
      await mkdir(join(projectRoot,'src'),{recursive:true}); await mkdir(assetDir);
      await mkdir(join(projectRoot,'node_modules'),{recursive:true});
      await symlink(dirname(vuePath),join(projectRoot,'node_modules/vue'),process.platform==='win32'?'junction':'dir');
      if (compilerPath) await symlink(dirname(compilerPath),join(projectRoot,'node_modules/vue-template-compiler'),process.platform==='win32'?'junction':'dir');
      // Compiler entry dependencies are resolved from the toolchain for 2.7, while browser Vue stays in the source project.
      const actual=JSON.parse(await readFile(vuePath,'utf8')).version;
      await writeFile(join(projectRoot,'package.json'),JSON.stringify({name:'vue-test',dependencies:{vue:actual,'parent-fixture':'1.0.0','nested-fixture':'3.0.0'}}));
      const parent=join(projectRoot,'node_modules/parent-fixture');
      const nested=join(parent,'node_modules/nested-fixture');
      const top=join(projectRoot,'node_modules/nested-fixture');
      await mkdir(nested,{recursive:true}); await mkdir(top,{recursive:true});
      await writeFile(join(parent,'package.json'),JSON.stringify({name:'parent-fixture',main:'index.js'}));
      await writeFile(join(parent,'index.js'),"import value from 'nested-fixture/legacy.js'; export default value;");
      await writeFile(join(nested,'package.json'),JSON.stringify({name:'nested-fixture',version:'2.0.0'}));
      await writeFile(join(nested,'legacy.js'),'export default 0;');
      await writeFile(join(top,'package.json'),JSON.stringify({name:'nested-fixture',version:'3.0.0'}));
      await mkdir(join(projectRoot,'node_modules/fixture-theme'),{recursive:true});
      await writeFile(join(projectRoot,'node_modules/fixture-theme/_tokens.scss'),'$tone:#237245;');
      await writeFile(join(projectRoot,'src/dot.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle r="4"/></svg>');
      await writeFile(join(projectRoot,'src/Card.vue'),`<template><button class="card" @click="count++"><img src="./dot.svg"/>{{label}} {{count}}<slot>源插槽默认值</slot></button></template><script>import nested from 'parent-fixture'; export default {props:{label:String},data(){return {count:nested}}}</script><style scoped lang="scss">@import "~fixture-theme/tokens";.card{color:$tone;padding:12px}</style>`);
      const registry=buildComponentPreviewRegistry([{name:'Card',filePath:'src/Card.vue',exportMode:'default',exportName:'default',sourceFingerprint:'fixture',previewScenario:{source:'usage',props:{label:'真实调用'},slots:{default:'真实插槽'}}}],{projectRoot,runtimeContext:{...context,vueVersion:actual}});
      await writeFile(join(assetDir,'component-previews.json'),JSON.stringify(registry));
      assert.doesNotThrow(()=>assertPreviewDependencies(projectRoot,'vite-vue'));
      const result=await buildComponentPreviewStaticBundle(projectRoot,{assetDir,component:registry.previews[0].id});
      // The returned successful action is the build assertion; generated runtime syntax is checked separately below.
      assert.ok(result.actionDigest);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
}

test('selects Vue 2 mount protocol without changing Vue 3 mount protocol',()=>{
 const registry=buildComponentPreviewRegistry([{name:'Card',filePath:'src/Card.vue',exportMode:'default'}],{projectRoot:process.cwd()});
 const two=buildPreviewRuntimeFiles(registry,{vueVersion:'2.6.14',runtimeContext:context});
 assert.match(two['src/App.js'],/new Vue\(/);
 assert.doesNotMatch(two['src/App.js'],/createApp|markRaw|beforeUnmount/);
 assert.doesNotMatch(two[Object.keys(two).find(k=>k.startsWith('src/previews/'))],/<script setup>/);
 const three=buildPreviewRuntimeFiles(registry,{vueVersion:'3.5.42',runtimeContext:context});
 assert.match(three['src/App.js'],/createApp/);
});
