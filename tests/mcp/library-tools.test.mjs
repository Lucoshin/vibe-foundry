import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { callVibeHubTool } from '../../dist/mcp/server.js';
import { loadAssetLibraryViewModel } from '../../dist/application/asset-catalog.js';
import { prepareLearning, importLearningAnalysis } from '../../dist/learning/workflow.js';

async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'vibe-library-mcp-'));
  const task=await prepareLearning(root,{recipeId:'general-knowledge',source:{schemaVersion:'0.1.0',title:'导航决策',kind:'text',entries:[{id:'decision-1',role:'document',text:'导航按工作入口组织，语言作为筛选。'}]}});
  await importLearningAnalysis(root,task.id,{schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[{id:'navigation',type:'decision',title:'工作入口导航',summary:'语言作为筛选维度。',tags:['导航'],basis:'explicit',evidence:[{entryId:'decision-1',quote:'导航按工作入口组织，语言作为筛选。'}]}],relations:[]});
  return root;
}

test('library tools expose the exact shared catalog identity and evidence',async()=> {
  const root=await fixture();
  const model=await loadAssetLibraryViewModel(root);
  const result=await callVibeHubTool(root,'search_library_assets',{query:'导航',kind:'decision'},{assetLibraryRoot:root});
  assert.equal(result.isError,false);
  assert.deepEqual(result.structuredContent.assets,model.assets);
  const detail=await callVibeHubTool(root,'get_library_asset',{id:model.assets[0].id},{assetLibraryRoot:root});
  assert.deepEqual(detail.structuredContent.asset,model.assets[0]);
  assert.equal(detail.structuredContent.asset.evidence[0].entryId,'decision-1');
});

test('library tools return tool errors for invalid filters and exact ID arguments',async()=> {
  const root=await fixture();
  for (const args of [[],null,'query',{query:1},{category:'knowledge'}]) {
    const result=await callVibeHubTool(root,'search_library_assets',args,{assetLibraryRoot:root});
    assert.equal(result.isError,true,JSON.stringify(args));
    assert.equal(typeof result.structuredContent.message,'string');
  }
  for (const args of [[],null,{}, {id:1},{id:' '},{id:'missing',extra:true}]) {
    const result=await callVibeHubTool(root,'get_library_asset',args,{assetLibraryRoot:root});
    assert.equal(result.isError,true,JSON.stringify(args));
  }
});

test('library tools surface damaged storage as tool errors instead of throwing',async()=> {
  const root=await mkdtemp(join(tmpdir(),'vibe-library-mcp-broken-'));
  await writeFile(join(root,'index.json'),'{broken');
  for (const [name,args] of [['search_library_assets',{}],['get_library_asset',{id:'missing'}]]) {
    const result=await callVibeHubTool(root,name,args,{assetLibraryRoot:root});
    assert.equal(result.isError,true);
    assert.ok(result.structuredContent.message.length>0);
  }
});

test('stdio isolates malformed JSON and failed tool calls while continuing later requests',async()=> {
  const root=await mkdtemp(join(tmpdir(),'vibe-library-mcp-stdio-'));
  const child=spawn(process.execPath,['dist/mcp/server.js'],{cwd:process.cwd(),env:{...process.env,VIBEHUB_LIBRARY_ROOT:root},stdio:['pipe','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>stdout+=chunk); child.stderr.on('data',chunk=>stderr+=chunk);
  const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
  child.stdin.end([
    JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize'}),
    '{malformed',
    'null',
    JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'search_library_assets',arguments:{query:12}}}),
    JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/list'}),
  ].join('\n')+'\n');
  assert.equal(await closed,0,stderr);
  const messages=stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(messages.find(message=>message.id===1).result.serverInfo.name,'vibehub');
  assert.ok(messages.some(message=>message.error?.code===-32700));
  assert.ok(messages.some(message=>message.error?.code===-32600));
  assert.equal(messages.find(message=>message.id===2).result.isError,true);
  assert.ok(messages.find(message=>message.id===3).result.tools.some(tool=>tool.name==='get_library_asset'));
});
