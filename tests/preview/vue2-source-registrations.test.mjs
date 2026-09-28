import assert from 'node:assert/strict';
import {test} from 'node:test';
import {discoverVue2SourceRegistrations,renderVue2SourceRegistrations} from '../../dist/preview/vue2-source-registrations.js';
import {buildPreviewRuntimeFiles} from '../../dist/preview/component-preview-runtime.js';
const main=`import Vue from 'vue';import Cookies from 'js-cookie';import Element from 'element-ui';import store from './store';import DictData from './dict';import Card from './Card.vue';import {parseTime} from './utils';import './permission';Vue.component('Card',Card);Vue.prototype.parseTime=parseTime;Vue.use(Element,{size:Cookies.get('size')||'medium'});DictData.install();new Vue({store,render:h=>h(App)}).$mount('#app');`;
test('extracts authored registration calls and the real store without running main mounting or permission imports',()=>{
 const index={files:[{filePath:'src/main.js',sourceText:main,dependencies:[{source:'./store',resolvedFilePath:'src/store/index.js'}]},{filePath:'src/store/index.js',sourceText:'export default actualStore',dependencies:[]}]};
 const registration=discoverVue2SourceRegistrations(index,'2.6.14');
 // The source root instance may chain $mount; this case must still retain its store.
 assert.equal(registration.store,'store');
 assert.equal(registration.statements.length,4);
 const code=renderVue2SourceRegistrations(registration,path=>'../../'+path);
 assert.match(code,/Vue\.component\('Card',Card\)/);
 assert.match(code,/Cookies.get\('size'\)/);
 assert.match(code,/DictData.install\(\)/);
 assert.match(code,/store: store/);
 assert.doesNotMatch(code,/permission|new Vue|\$mount/);
 index.files[1].sourceText='export default changedStore';
 assert.notEqual(discoverVue2SourceRegistrations(index,'2.6.14').fingerprint,registration.fingerprint);
 assert.equal(discoverVue2SourceRegistrations(index,'3.5.0'),null);
});
test('does not carry conditional registrations or unknown local options',()=>{
 const source="import Vue from 'vue';import Plugin from './plugin';const size='large';Vue.use(Plugin,{size:size});if(flag)Vue.use(Plugin);new Vue({store:makeStore()});";
 assert.equal(discoverVue2SourceRegistrations({files:[{filePath:'src/main.js',sourceText:source}]},'2.6.14'),null);
});

test('Vue2 preview installs source registrations and provides its store without duplicate Element setup',()=>{
 const registration=discoverVue2SourceRegistrations({files:[{filePath:'src/main.js',sourceText:main,dependencies:[]}]},'2.6.14');
 const files=buildPreviewRuntimeFiles({runtime:'vite-vue',previews:[]},{vueVersion:'2.6.14',runtimeContext:{providers:['vue2-element-ui','vue-router-memory'],vue2SourceRegistrations:registration}});
 assert.match(files['src/App.js'],/const sourceProviders = installSourceRegistrations\(\)/);
 assert.match(files['src/App.js'],/new Vue\(\{ \.\.\.sourceProviders, router,/);
 assert.doesNotMatch(files['src/App.js'],/Vue\.use\(ElementUI\)/);
 assert.match(files['src/vue2-source-registrations.js'],/store: store/);
});
