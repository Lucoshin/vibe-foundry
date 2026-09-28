import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createScopedStorage, installUniPreviewHost, wrapUniPreviewPage} from '../../dist/preview/uni-official-api-host.js';
import {buildComponentPreviewRegistry,buildPreviewRuntimeFiles} from '../../dist/preview/component-preview-runtime.js';

function storage() {
 const data=new Map(); return {get length(){return data.size}, key(index){return [...data.keys()][index]??null},getItem(key){return data.get(String(key))??null},setItem(key,value){data.set(String(key),String(value))},removeItem(key){data.delete(String(key))},clear(){data.clear()}};
}
test('official page setup sees only actual page query and preview URL is restored on failures',()=>{
 const host={location:{href:'https://preview.test/p/?embed=1&component=p&jobId=real'},history:{state:{key:1},replaceState(state,title,url){host.location.href=String(url)}}};
 const original=host.location.href; let observed;
 const page=wrapUniPreviewPage(component=>({...component,setup(){observed=host.location.href;throw Error('source setup failed')}}),{},host);
 assert.throws(()=>page.setup({},{}),/source setup failed/);
 assert.equal(new URL(observed).search,'?jobId=real'); assert.equal(host.location.href,original);
});
test('real storage keeps preview identities and host data isolated including clear and enumeration',()=>{
 const actual=storage(); actual.setItem('host','keep');
 const a=createScopedStorage(actual,'a'),b=createScopedStorage(actual,'b');
 a.setItem('token','a'); b.setItem('token','b');
 assert.equal(a.token,'a'); assert.equal(b.getItem('token'),'b'); assert.equal(a.getItem('host'),null);
 assert.equal(a.length,1); assert.equal(a.key(0),'token'); assert.deepEqual(Object.keys(a),['token']);
 a.user='actual'; assert.equal(a.getItem('user'),'actual'); delete a.user; assert.equal(a.getItem('user'),null);
 a.clear(); assert.equal(b.token,'b'); assert.equal(actual.getItem('host'),'keep');
});
test('registered uni page keeps actual route and normalized styles in identity and official host',()=>{
 const component={name:'Publish',filePath:'src/pages/publish/index.vue',kind:'page',route:'/pages/publish/index',exportMode:'default',platformRuntime:'uni-h5',platformComponents:['view']};
 const context={uniPages:{pages:[{path:'pages/publish/index',style:{navigationBar:{titleText:'发布'}}}],globalStyle:{navigationBar:{backgroundColor:'#ffffff'}},nvue:{'flex-direction':'column'}}};
 const registry=buildComponentPreviewRegistry([component],{projectRoot:'D:/fixture',runtimeContext:context});
 assert.equal(registry.previews[0].kind,'page');
 assert.equal(registry.previews[0].uniPage.route,component.route);
 assert.equal(registry.previews[0].limitations.includes('missing-source-scenario'),false);
 assert.equal(registry.previews[0].limitations.includes('runtime-validation-pending'),true);
 const changed=buildComponentPreviewRegistry([component],{projectRoot:'D:/fixture',runtimeContext:{...context,uniPages:{...context.uniPages,globalStyle:{navigationBar:{backgroundColor:'#eeeeee'}}}}});
 assert.notEqual(registry.previews[0].actionDigest,changed.previews[0].actionDigest);
 const files=buildPreviewRuntimeFiles(registry,{runtime:'vite-vue',runtimeContext:context});
 assert.match(files['src/App.js'],/previewApp.use\(uniPagePlugin\)/);
 assert.match(files['src/uni-preview-host.js'],/__uniRoutes/);
});
test('a registered non-uni route is its own scenario, while unregistered views still need context',()=>{
 const component={name:'View',filePath:'src/views/View.vue',kind:'page',route:'/view',exportMode:'default'};
 const registry=buildComponentPreviewRegistry([component],{projectRoot:'D:/fixture'});
 assert.deepEqual(registry.previews[0].limitations,['runtime-validation-pending']);
 const missing=buildComponentPreviewRegistry([{...component,route:undefined}],{projectRoot:'D:/fixture'});
 assert.equal(missing.previews[0].limitations.includes('missing-source-scenario'),true);
 assert.equal(registry.previews[0].status,'degraded');
});
test('installs official API, keeps genuine tabbar failure, and explicitly blocks unregistered navigation',async()=>{
 const actual=storage(); const messages=[]; const host={localStorage:actual,sessionStorage:storage(),navigator:{language:'zh-CN'}};
 const hide=()=>Promise.reject({errMsg:'hideTabBar:fail not TabBar page'});
 const official={uni:{getStorageSync:key=>host.localStorage.getItem(key),hideTabBar:hide,navigateTo:()=>{throw Error('must not navigate')}},getCurrentPages:()=>[],UniServiceJSBridge:{},UniViewJSBridge:{}};
 installUniPreviewHost(host,official,'sample',message=>messages.push(message),'/component-preview/sample/action/');
 assert.deepEqual(host.__uniConfig.router,{base:'/component-preview/sample/action/'});
 host.localStorage.setItem('sample','stored'); assert.equal(host.uni.getStorageSync('sample'),'stored');
 await assert.rejects(host.uni.hideTabBar(),error=>error.errMsg==='hideTabBar:fail not TabBar page');
 await assert.rejects(host.uni.navigateTo({url:'/private'}),error=>error.errMsg.includes('预览未注册'));
 let fail,complete; host.uni.navigateTo({url:'/private',fail:error=>fail=error,complete:error=>complete=error});
 assert.equal(fail,complete); assert.ok(messages.some(message=>message.includes('预览未注册')));
 assert.equal(host.getCurrentPages,official.getCurrentPages); assert.equal(host.__uniConfig.appName,'VibeHub 组件预览');
});
test('page host carries the official manifest nvue projection without inventing source defaults',()=>{
 const host={localStorage:storage(),sessionStorage:storage(),navigator:{language:'zh-CN'}};
 const page={route:'/pages/publish/index',style:{navigationBar:{}},globalStyle:{navigationBar:{}},nvue:{'flex-direction':'row'}};
 installUniPreviewHost(host,{uni:{}},'page',()=>{},'/preview/',page);
 assert.deepEqual(host.__uniConfig.nvue,page.nvue);
});
