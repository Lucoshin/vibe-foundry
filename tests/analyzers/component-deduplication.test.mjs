import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deduplicateComponents} from '../../src/analyzers/component-deduplication.ts';
const component=(filePath,extra={})=>({filePath,name:filePath.split('/').at(-1),kind:'component',...extra});
const indexed=(filePath,sourceText,dependencies=[])=>({filePath,sourceText,dependencies});
test('merges only byte-identical resolved components and retains source/scenario evidence',()=>{
 const a=component('src/a/Badge.vue',{primaryScenarioId:'a',previewScenario:{id:'a'},scenarios:[{id:'a'}],analysisEvidence:{scenarioCount:1}});
 const b=component('src/b/Badge.vue',{primaryScenarioId:'b',scenarios:[{id:'a'},{id:'b'}]});
 const source='<template><span>Badge</span></template>';
 const index={files:[indexed(a.filePath,source),indexed(b.filePath,source)]};
 const result=deduplicateComponents([b,a],index,'merge-identical');
 assert.equal(result.length,1);assert.equal(result[0].filePath,a.filePath);
 assert.equal(result[0].primaryScenarioId,'a');assert.deepEqual(result[0].previewScenario,{id:'a'});
 assert.deepEqual(result[0].scenarios,[{id:'a'},{id:'b'}]);assert.equal(result[0].analysisEvidence.scenarioCount,2);
 assert.equal(result[0].duplicateSources[0].filePath,b.filePath);assert.match(result[0].duplicateSources[0].sourceFingerprint,/^[a-f0-9]{64}$/);
 assert.equal(a.duplicateSources,undefined);assert.equal(a.scenarios.length,1);
});
test('keeps pages, missing sources, unresolved dependencies, different dependencies and similar text distinct',()=>{
 const a=component('src/a.vue'),b=component('src/b.vue');
 for(const files of [[],[indexed(a.filePath,'same')],[indexed(a.filePath,'same'),indexed(b.filePath,'same ')],[indexed(a.filePath,'same',[{source:'x',resolvedFilePath:null}]),indexed(b.filePath,'same',[{source:'x',resolvedFilePath:null}])],[indexed(a.filePath,'same',[{source:'x',resolvedFilePath:'src/x.js'}]),indexed(b.filePath,'same',[{source:'x',resolvedFilePath:'src/y.js'}])]]) {
  assert.equal(deduplicateComponents([a,b],{files},'merge-identical').length,2);
 }
 const files=[indexed(a.filePath,'same'),indexed(b.filePath,'same')];
 assert.equal(deduplicateComponents([a,{...b,kind:'page'}],{files},'merge-identical').length,2);
 const original=[a,b];assert.equal(deduplicateComponents(original,{files}),original);assert.equal(deduplicateComponents(original,{files},'keep'),original);
});
test('cross-directory relative references stay separate, same-directory identical imports can merge',()=>{
 const a=component('src/a/A.tsx'),b=component('src/b/B.tsx'),c=component('src/a/C.tsx');
 const source="import X from './X';export default ()=> <X/>";
 const dependencies=[{source:'./X',resolvedFilePath:'src/a/X.tsx'}];
 const index={files:[a,b,c].map(item=>indexed(item.filePath,source,dependencies))};
 assert.equal(deduplicateComponents([a,b,c],index,'merge-identical').length,2);
});
test('JS and TS candidates require actual JSX nodes, not JSX-looking strings or business modules',()=>{
 for(const extension of ['js','ts']) {
  const a=component('src/a.'+extension),b=component('src/b.'+extension);
  for(const [source,count] of [["export default ()=> <button>Go</button>",1],["export const label='<button>Go</button>'",2]]) {
   const files=[a,b].map(item=>indexed(item.filePath,source));
   assert.equal(deduplicateComponents([a,b],{files},'merge-identical').length,count);
  }
 }
});

test('bare resource paths and module location expressions cannot merge across directories',()=>{
 const a=component('src/a/Card.vue'),b=component('src/b/Card.vue');
 for(const source of ['<template><img src="photo.png" /></template>','<style>.card{background:url(photo.png)}</style>','<script>const base=import.meta.url</script>']) {
  assert.equal(deduplicateComponents([a,b],{files:[a,b].map(item=>indexed(item.filePath,source))},'merge-identical').length,2);
 }
});
