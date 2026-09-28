import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
test('learning API rejects foreign writes and exposes versioned recipes to its own page',async t=>{
 const {createLearningRequestHandler}=await import('../../dist/web/learning-api.js');
 const root=await mkdtemp(join(tmpdir(),'vibe-learning-api-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const handler=createLearningRequestHandler({libraryRoot:root,token:'page-token'});
 async function call(token,method='GET',path='/api/learning/recipes',body){
  const request=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(request,{method,headers:{host:'127.0.0.1:4317','x-vibe-import-token':token,'content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}});
  const response={statusCode:0,setHeader(){},end(value){this.body=JSON.parse(value)}};
  await handler(request,response,new URL(path,'http://127.0.0.1:4317'));return response;
 }
 assert.equal((await call('foreign')).statusCode,403);
 const result=await call('page-token');assert.equal(result.statusCode,200);assert.equal(result.body.length,5);
 const bad=await call('page-token','POST','/api/learning/tasks',{unexpected:true});assert.equal(bad.statusCode,400);
 assert.equal((await call('page-token','DELETE')).statusCode,405);
});
