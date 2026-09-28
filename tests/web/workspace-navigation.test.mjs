import assert from 'node:assert/strict';
import vm from 'node:vm';
import {test} from 'node:test';
import {renderWebAppHtml} from '../../dist/web/frontend.js';
test('initial workspace loads the shared library even when the launch project has no asset package',async()=>{
 const js=renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1];
 const library={isError:false,assets:[{id:'knowledge-one'}]};
 const missing={isError:true,message:'Missing central asset package'};
 const requests=[];
 const context=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},fetch:async url=>{requests.push(url);return {json:async()=>url==='/api/assets?scope=library'?library:missing};}});
 vm.runInContext(js.slice(0,js.lastIndexOf('startWebApp();')),context);
 vm.runInContext(`byId=()=>({addEventListener(){}});loadComponentState=()=>{};render=()=>{};startWebApp();`,context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(vm.runInContext('state.model.isError',context),false);
 assert.equal(vm.runInContext('state.model.assets[0].id',context),'knowledge-one');
 assert.deepEqual(requests,['/api/assets?scope=library']);
});
test('asset filters compose language, source, kind and query across domains',()=>{
 const js=renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1];
 const context=vm.createContext({});
 vm.runInContext(js.slice(0,js.indexOf('\nfunction startWebApp()')),context);
 vm.runInContext(`state.model={assets:[{id:'a',kind:'module',category:'services',name:'状态机',sourceId:'one',language:'ts',labels:[]},{id:'b',kind:'character',category:'knowledge',name:'状态机',sourceId:'two',language:null,labels:[]}]};state.query='状态';state.kindFilter='module';state.sourceFilter='one';state.languageFilter='ts';`,context);
 assert.equal(vm.runInContext('filteredAssets().map(a=>a.id).join()',context),'a');
 vm.runInContext("state.languageFilter='python'",context);assert.equal(vm.runInContext('filteredAssets().length',context),0);
});
test('navigation has work areas, while output kinds live in filters',()=>{
 const html=renderWebAppHtml();
 assert.match(html,/data-workspace/);assert.match(html,/workbench-content/);
 assert.doesNotMatch(html,/data-category=/);
 assert.match(html,/炼化方案/);assert.match(html,/学习任务/);assert.match(html,/应用记录/);
});

test('late learning requests cannot replace the prompt workspace after navigation',async()=>{
 const js=renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1];
 const nodes=new Map();const byId=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,innerHTML:'',textContent:''});return nodes.get(id);};
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const context=vm.createContext({byId,waitForLearning:()=>pending});
 vm.runInContext(js.slice(0,js.indexOf('\nfunction startWebApp()')),context);
 context.node=byId;
 vm.runInContext(`byId=node;syncPreviewFocusMode=()=>{};renderNav=()=>{};renderTaskContextPanel=()=>{};renderDetail=()=>{};learningRequest=()=>waitForLearning();renderPromptWorkbench=()=>{byId('workbench-content').innerHTML='prompts-ui';};state.model={assets:[],sources:[],errors:[],project:{}};state.workspace='learning';render();state.workspace='prompts';render();`,context);
 finish([]);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(byId('workbench-content').innerHTML,'prompts-ui');
});

test('knowledge detail translates known evidence bases and preserves unknown values',()=>{
 const js=renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1];
 const context=vm.createContext({});
 vm.runInContext(js.slice(0,js.indexOf('\nfunction startWebApp()')),context);
 const content=vm.runInContext(`state.model={assets:[]}; renderKnowledgeDetails({category:'knowledge',raw:{basis:'explicit',facets:[{name:'身份',value:'修灯师',basis:'explicit'},{name:'扩展',value:'自定义依据',basis:'custom-basis'}]},evidence:[],relations:[{from:'a',to:'b',type:'uses',description:'可供参考',basis:'interpretation',evidence:[]}]})`,context);
 assert.match(content,/原文明示/);
 assert.match(content,/分析解读/);
 assert.match(content,/custom-basis/);
 assert.doesNotMatch(content,/>explicit<|>interpretation</);
});

test('a damaged catalog keeps independent workspaces reachable and preserves the explicit asset error',()=>{
 const js=renderWebAppHtml().match(/<script>([\s\S]*)<\/script>/)[1];
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{hidden:false,innerHTML:'',textContent:'',dataset:{},addEventListener(){},querySelectorAll(){return [];}});
  return nodes.get(id);
 };
 const context=vm.createContext({node});
 vm.runInContext(js.slice(0,js.indexOf('\nfunction startWebApp()')),context);
 vm.runInContext(`byId=node;syncPreviewFocusMode=()=>{};renderDetail=()=>{if(state.selected)throw Error('stale selection');};renderCollectionWorkbench=()=>{byId('workbench-content').innerHTML='collections-ui';};renderPromptWorkbench=()=>{byId('workbench-content').innerHTML='prompts-ui';};renderLearningWorkbench=workspace=>{if(workspace!=='recipes')throw Error('missing catalog fields');byId('workbench-content').innerHTML='recipes-ui';};renderMetrics=renderComponentControls=renderList=()=>{throw Error('catalog unavailable');};state.model={isError:true,message:'账号来源快照损坏'};state.selected={id:'old-asset'};taskContextState.assetIds.add('previously-selected');state.workspace='collections';render();`,context);
 assert.equal(node('workbench-content').innerHTML,'collections-ui');
 assert.equal(node('workbench-content').hidden,false);
 assert.match(node('nav').innerHTML,/集合与关系/);
 assert.match(node('library-errors').innerHTML,/账号来源快照损坏/);
 assert.equal(node('task-context-panel').hidden,true);
 for(const workspace of ['prompts','recipes']) {
  vm.runInContext(`state.workspace='${workspace}';render();`,context);
  assert.equal(node('workbench-content').innerHTML,workspace+'-ui');
 }
 for(const workspace of ['sources','learning','applications']) {
  vm.runInContext(`state.workspace='${workspace}';render();`,context);
  assert.match(node('workbench-content').innerHTML,/账号来源快照损坏/);
 }
 vm.runInContext("state.workspace='assets';render();",context);
 assert.equal(node('asset-list').hidden,false);
 assert.equal(node('workbench-content').hidden,true);
 assert.match(node('asset-list').innerHTML,/资产暂时无法读取/);
 assert.match(node('asset-list').innerHTML,/账号来源快照损坏/);
 assert.equal(node('asset-pagination').hidden,true);
 assert.equal(vm.runInContext('taskContextState.assetIds.size',context),1,'保留选择意图但不访问损坏目录');
});
