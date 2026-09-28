import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Readable} from 'node:stream';
import {createCreatorRequestHandler} from '../../dist/web/creator-api.js';
import {creatorWorkbenchJs} from '../../dist/web/creator-frontend.js';
import vm from 'node:vm';
test('creator API protects local writes and reports invalid captures without preparing a task',async()=>{
 const handler=createCreatorRequestHandler({libraryRoot:'unused',token:'local'});
 const call=async(token,method='POST')=>{const request=Readable.from([Buffer.from('{}')]);Object.assign(request,{method,headers:{host:'127.0.0.1:4317','x-vibe-import-token':token,'content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}});const response={setHeader(){},end(value){this.body=JSON.parse(value);}};assert.equal(await handler(request,response,new URL('http://127.0.0.1:4317/api/creators/prepare')),true);return response;};
 assert.equal((await call('foreign')).statusCode,403);assert.equal((await call('local')).statusCode,400);assert.equal((await call('local','PUT')).statusCode,405);
});
test('creator detail renders scope and escapes collected content',()=>{
 const context=vm.createContext({escapeHtml:value=>String(value).replaceAll('<','&lt;')});vm.runInContext(creatorWorkbenchJs,context);
 context.asset={raw:{creator:{account:{name:'<source>',url:'https://space.bilibili.com/123'},collectedAt:'2026-09-17',coverage:{works:1,transcripts:0},sampling:{method:'指定样本'},limitations:['未取得字幕'],entries:[{id:'work',text:'<script>不执行</script>'}]}}};
 const html=vm.runInContext('renderCreatorDetails(asset)',context);assert.match(html,/未取得字幕/);assert.match(html,/&lt;script>/);assert.doesNotMatch(html,/<script>/);
});
