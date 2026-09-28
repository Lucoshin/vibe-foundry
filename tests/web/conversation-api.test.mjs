import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';

test('conversation API previews without storage, authenticates preparation and reports strict errors',async t=>{
  const {createConversationRequestHandler} = await import('../../dist/web/conversation-api.js');
  const root = await mkdtemp(join(tmpdir(),'vibe-conversation-api-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const handler = createConversationRequestHandler({libraryRoot:root,token:'page-token'});
  async function call(path,body,method='POST',token='page-token') {
    const request = Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
    Object.assign(request,{method,headers:{host:'127.0.0.1:4317','content-type':'application/json','x-vibe-import-token':token},socket:{remoteAddress:'127.0.0.1'}});
    const response = {headers:{},setHeader(key,value){this.headers[key]=value;},end(value){this.body=JSON.parse(value);}};
    assert.equal(await handler(request,response,new URL('http://127.0.0.1:4317'+path)),true);
    return response;
  }
  const input = {title:'会话片段',format:'messages',messages:[{id:'user-1',role:'user',text:'多线并行推进'}]};
  assert.equal((await call('/api/conversations/prepare',input,'POST','foreign')).statusCode,403);
  const preview = await call('/api/conversations/preview',input);
  assert.equal(preview.statusCode,200);
  assert.equal(preview.body.source.entries[0].id,'user-1');
  assert.deepEqual(await readdir(root),[]);
  const prepared = await call('/api/conversations/prepare',input);
  assert.equal(prepared.statusCode,201);
  assert.equal(prepared.body.task.status,'prepared');
  assert.equal(prepared.body.task.recipe.id,'conversation-decisions');
  assert.equal((await call('/api/conversations/prepare',{...input,messages:[{...input.messages[0],branch:'unknown'}]})).statusCode,400);
  assert.equal((await call('/api/conversations/memory?assetId=missing',undefined,'GET')).statusCode,400);
  assert.equal((await call('/api/conversations/unknown',undefined,'GET')).statusCode,404);
  assert.equal((await call('/api/conversations/preview',undefined,'PUT')).statusCode,405);
  assert.equal(preview.headers['cache-control'],'no-store');
});
