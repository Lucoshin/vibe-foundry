import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {discoverUniKuRootHost,createUniKuRootPreviewPlugin} from '../../src/preview/uni-ku-root-host.ts';

test('root host requires an invoked default plugin and hashes the real root dependency graph',async()=>{
 const root=await mkdtemp(join(tmpdir(),'uni-root-host-'));
 try {
  await mkdir(join(root,'build'),{recursive:true});await mkdir(join(root,'src'));
  await writeFile(join(root,'package.json'),'{}');
  await writeFile(join(root,'build/vitePlugins.ts'),"import Root from '@uni-ku/root'; export const plugins=[Root()];");
  await writeFile(join(root,'src/App.ku.vue'),'<template><ku-root-view/><ModalHost/></template>');
  await writeFile(join(root,'src/ModalHost.vue'),'<template>Modal</template>');
  const dir=join(root,'node_modules/@uni-ku/root');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'package.json'),'{"main":"index.cjs"}');
  await writeFile(join(dir,'index.cjs'),"module.exports=()=>({name:'official-fixture',capturedInput:process.env.UNI_INPUT_DIR,transform(code){return code}})");
  const readSource=async file=>{try{return await readFile(join(root,file),'utf8')}catch{return ''}};
  const index={files:[{filePath:'src/App.ku.vue',dependencies:[{resolvedFilePath:'src/ModalHost.vue'}]},{filePath:'src/ModalHost.vue',dependencies:[]}]};
  const result=await discoverUniKuRootHost(root,readSource,{sourceIndex:index});
  assert.equal(result.rootFile,'src/App.ku.vue');assert.ok(result.evidence.some(item=>item.filePath==='src/ModalHost.vue'));
  const original=process.env.UNI_INPUT_DIR;
  const plugin=createUniKuRootPreviewPlugin(root,result);
  assert.equal(plugin.capturedInput,join(root,'src'));assert.equal(process.env.UNI_INPUT_DIR,original);
  await writeFile(join(root,'src/ModalHost.vue'),'<template>Changed modal</template>');
  const changed=await discoverUniKuRootHost(root,readSource,{sourceIndex:index});
  assert.notEqual(changed.evidence.find(item=>item.filePath==='src/ModalHost.vue').digest,result.evidence.find(item=>item.filePath==='src/ModalHost.vue').digest);
  await writeFile(join(root,'build/vitePlugins.ts'),"import Root from '@uni-ku/root'; export const plugins=[Root({rootFileName:'Other'})];");
  await assert.rejects(discoverUniKuRootHost(root,readSource),/custom options are not supported/);
  await writeFile(join(root,'build/vitePlugins.ts'),"import Root from '@uni-ku/root'; export function unrelated(Root){return Root()}");
  assert.equal(await discoverUniKuRootHost(root,readSource),null);
  await writeFile(join(root,'build/vitePlugins.ts'),"import Root from '@uni-ku/root'; export const text='Root()';");
  assert.equal(await discoverUniKuRootHost(root,readSource),null);
 }finally{await rm(root,{recursive:true,force:true})}
});
