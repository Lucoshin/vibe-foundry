import assert from 'node:assert/strict';
import {test} from 'node:test';
import {discoverVue3SourceGlobals,renderVue3SourceGlobals} from '../../src/preview/vue3-source-globals.ts';

test('Vue 3 globals preserve imported functions and the proven source system-info expression',()=>{
 const source="import {createSSRApp} from 'vue';import App from './App.vue';import {showDialog} from './dialog';export function createApp(){const app=createSSRApp(App);const systemInfo=uni.getSystemInfoSync();app.config.globalProperties.$statusBarHeight=systemInfo.statusBarHeight||25;app.config.globalProperties.$showDialog=showDialog;setupBusiness(app);return {app};}";
 const index={files:[{filePath:'src/main.ts',sourceText:source,dependencies:[{source:'./dialog',resolvedFilePath:'src/dialog.js'}]},{filePath:'src/dialog.js',sourceText:'export const showDialog=()=>true;',dependencies:[]}]};
 const result=discoverVue3SourceGlobals(index,'3.5.0');
 assert.equal(result.assignments.length,2);
 const code=renderVue3SourceGlobals(result,path=>'../../'+path);
 assert.match(code,/uni.getSystemInfoSync\(\)/);
 assert.match(code,/systemInfo.statusBarHeight\|\|25/);
 assert.match(code,/\["\$showDialog"\] = showDialog/);
 assert.doesNotMatch(code,/setupBusiness|createSSRApp|App.vue/);
 index.files[1].sourceText='export const showDialog=()=>false;';
 assert.notEqual(discoverVue3SourceGlobals(index,'3.5.0').fingerprint,result.fingerprint);
 assert.equal(discoverVue3SourceGlobals(index,'2.6.14'),null);
});

test('Vue 3 globals exclude unproved app factories and local function shadows',()=>{
 const source="import {createSSRApp} from 'vue';import App from './App.vue';import {showDialog} from './dialog';export function createApp(){const app=createSSRApp(App);const showDialog=()=>{};app.config.globalProperties.$showDialog=showDialog;app.config.globalProperties.$height=unknown.height;return {app};}";
 assert.equal(discoverVue3SourceGlobals({files:[{filePath:'src/main.ts',sourceText:source}]},'3.5.0'),null);
 assert.equal(discoverVue3SourceGlobals({files:[{filePath:'src/main.ts',sourceText:source.replace('const app=createSSRApp(App)','const app=otherFactory(App)')}]},'3.5.0'),null);
});
