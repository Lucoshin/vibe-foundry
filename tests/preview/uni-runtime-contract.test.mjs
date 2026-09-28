import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import { buildComponentPreviewRegistry, buildPreviewRuntimeFiles, discoverPreviewRuntimeContext } from '../../dist/preview/component-preview-runtime.js';
import { discoverUniPlatformDefine } from '../../dist/preview/uni-platform-define.js';

function files(context) {
  const registry = buildComponentPreviewRegistry([{ name:'Panel', filePath:'src/components/Panel.vue', kind:'component', exportMode:'default', exportName:'default', platformRuntime:'uni-h5', platformComponents:['view'], previewScenario:{ props:{}, events:['add-custom-skill','update:visible'], slots:{} } }], {projectRoot:join(tmpdir(),'uni-contract'),runtimeContext:context});
  return buildPreviewRuntimeFiles(registry,{runtime:'vite-vue',runtimeContext:context});
}
test('Vue wrapper with hyphenated and model events stays valid without empty event handlers',()=>{
  const generated=files();
  const wrapper=Object.entries(generated).find(([name])=>name.endsWith('.vue'))[1];
  const script=wrapper.match(/<script(?: setup)?>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(()=>parse(script,{sourceType:'module'}));
  assert.doesNotMatch(script,/"onAdd-custom-skill":|"onUpdate:visible":/);
  assert.match(wrapper,/v-on="listeners"/);
  assert.match(script,/previewModelListeners/);
});
test('platform discovery rejects unexported or shadowed platform expressions', async()=>{
 const configuration="import {currentPlatform} from './platform'; export default {define:{PLATFORM:JSON.stringify(currentPlatform)}};";
 for(const source of [
  'const currentPlatform=process.env.UNI_PLATFORM;',
  'const process={env:{UNI_PLATFORM:"custom"}}; export const currentPlatform=process.env.UNI_PLATFORM;',
 ]) {
  const sources={'vite.config.ts':configuration,'platform.ts':source};
  assert.equal(await discoverUniPlatformDefine(async name=>sources[name]??''),null);
 }
 const sources={'vite.config.ts':'const JSON={stringify:()=>"native"}; const currentPlatform=process.env.UNI_PLATFORM; export default {define:{PLATFORM:JSON.stringify(currentPlatform)}};'};
 assert.equal(await discoverUniPlatformDefine(async name=>sources[name]??''),null);
});
test('only source-proven UNI_PLATFORM define becomes the H5 platform and affects runtime identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'uni-contract-'));
 try {
  await mkdir(join(root,'src')); await mkdir(join(root,'build'));
  await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{'@dcloudio/uni-h5':'1'}}));
  await writeFile(join(root,'vite.config.ts'),"import {currentPlatform} from './build'; export default defineConfig(() => ({define:{PLATFORM:JSON.stringify(currentPlatform)}}));");
  await writeFile(join(root,'build/index.ts'),"export * from './platform';");
  await writeFile(join(root,'build/platform.ts'),"const currentPlatform=process.env.UNI_PLATFORM; export {currentPlatform};");
  const context=await discoverPreviewRuntimeContext(root);
  assert.equal(context.uniPlatformDefine?.value,'h5');
  assert.match(files(context)['vite.config.js'],/"PLATFORM": "\\"h5\\""/);
  await writeFile(join(root,'build/platform.ts'),"const currentPlatform=customPlatform(); export {currentPlatform};");
  const unknown=await discoverPreviewRuntimeContext(root);
  assert.equal(unknown.uniPlatformDefine,null);
  assert.notEqual(context.fingerprint,unknown.fingerprint);
  assert.doesNotMatch(files(unknown)['vite.config.js'],/"PLATFORM":/);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('uni template conversion leaves preview controls as native HTML',()=>{
 const config=files({})['vite.config.js'];
 const pluginStart=config.indexOf('name: "vibehub-uni-conditional-loader"');
 const transformSource=config.slice(pluginStart).match(/transform\(code, id\) \{[\s\S]*?\n      \}/)[0];
 const transform=new Function('resolve','sep','previewRoot','projectVueSourcePattern','injectVueAutoImports','stripUniConditionals','useUniH5','normalizeUniComponentTags','closeUniVoidInputs',`return ({${transformSource}}).transform`)(
  (...parts)=>parts.join('/'), '/', '/preview', /\/src\/.*\.vue$/, x=>x,x=>x,true,x=>'converted:'+x,x=>x);
 assert.equal(transform('<input type="checkbox"/>','/preview/src/previews/test.vue'),null);
 assert.equal(transform('<view/>','/source/src/components/test.vue'),'converted:<view/>');
});
