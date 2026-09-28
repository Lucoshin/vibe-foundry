import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { importImageAnalysis } from '../../dist/images/workflow.js';
import { png,analysisFor } from '../images/fixtures.mjs';

async function setup(t){
  assert.ok(existsSync(new URL('../../dist/web/prompt-api.js',import.meta.url)),'提示词与图片编辑 API 尚未实现');
  const {createPromptRequestHandler}=await import('../../dist/web/prompt-api.js');
  const {createImageEditRequestHandler}=await import('../../dist/web/image-edit-api.js');
  const root=await mkdtemp(join(tmpdir(),'vibehub-prompt-api-'));t.after(()=>rm(root,{recursive:true,force:true}));
  return {root,prompts:createPromptRequestHandler({libraryRoot:root,token:'test-token'}),images:createImageEditRequestHandler({libraryRoot:root,token:'test-token'})};
}
async function request(handler,path,method='GET',body,token='test-token',headers={}) {
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;req.headers={host:'127.0.0.1:4317','content-type':'application/json','x-vibe-import-token':token,...headers};req.socket={remoteAddress:'127.0.0.1'};
  const response={headers:{},setHeader(name,value){this.headers[name]=value;},end(value){this.body=JSON.parse(value);}};
  const handled=await handler(req,response,new URL(path,'http://127.0.0.1:4317'));return {...response,handled};
}
const draft={title:'测试模板',description:'API 验证',targetModel:'generic',template:'主题{{subject}}',variables:[{name:'subject',description:'主体'}],sourceAssetIds:[]};
test('提示词 API 拒绝跨站与未知方法；保存、列表、精确导出、渲染共享版本',async t=>{
  const {prompts}=await setup(t);
  assert.equal((await request(prompts,'/api/prompts/save','POST',draft,'wrong')).statusCode,403);
  assert.equal((await request(prompts,'/api/prompts','GET',undefined,'test-token',{origin:'http://evil.invalid'})).statusCode,403);
  assert.equal((await request(prompts,'/api/prompts/save','DELETE')).statusCode,405);
  const saved=await request(prompts,'/api/prompts/save','POST',draft);assert.equal(saved.statusCode,201);
  const {id,revision}=saved.body;
  assert.deepEqual((await request(prompts,'/api/prompts')).body.prompts,[saved.body]);
  assert.deepEqual((await request(prompts,'/api/prompts/item?id='+id+'&revision='+revision)).body,saved.body);
  assert.equal((await request(prompts,'/api/prompts/render','POST',{id,revision,values:{subject:'树'}})).body.text,'主题树');
  assert.equal((await request(prompts,'/api/prompts/render','POST',{id,revision,values:{}})).statusCode,400);
  assert.equal((await request(prompts,'/unrelated')).handled,false);
  assert.equal((await request(prompts,'/api/prompts/item?id='+id+'&revision='+revision+'&extra=true')).statusCode,400);
});
test('图片修订 API 需要本地令牌且仅允许现有精确版本与分析',async t=>{
  const {root,images}=await setup(t),imagePath=join(root,'source.png');await writeFile(imagePath,png());
  const analysis=analysisFor(),first=await importImageAnalysis(root,{imagePath,analysis});
  const input={assetId:first.id,analysis:{...analysis,title:'在线改名'}};
  assert.equal((await request(images,'/api/images/revisions','POST',input,'wrong')).statusCode,403);
  assert.equal((await request(images,'/api/images/revisions','GET')).statusCode,405);
  const revised=await request(images,'/api/images/revisions','POST',input);assert.equal(revised.statusCode,201);assert.notEqual(revised.body.id,first.id);
  assert.equal((await request(images,'/api/images/revisions','POST',{...input,path:'outside'})).statusCode,400);
});
