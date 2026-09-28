import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const messages = [{id:'u1',role:'user',text:'保留原始角色。\n第二行'}, {id:'a1',role:'assistant',text:'声称已经完成。'}, {id:'u2',role:'user',text:'尚未验收，请继续核对。'}];

test('conversation selection preserves exact original messages and input order without inventing roles',async()=>{
  const {normalizeConversation} = await import('../../dist/learning/conversations.js');
  const input = {title:'显式片段',format:'messages',messages,messageIds:['u2','u1']};
  const result = normalizeConversation(input);
  assert.deepEqual(result.source,{schemaVersion:'0.1.0',title:'显式片段',kind:'conversation',entries:[messages[0],messages[2]]});
  assert.deepEqual(result.coverage,{inputEntries:3,selectedEntries:2,omittedEntries:1});
  assert.deepEqual(input.messages,messages);
  const text = '用户：不应猜测角色\r\n助手：这一行也只是原文\n';
  const plain = normalizeConversation({title:'原文',format:'text',text});
  assert.equal(plain.source.kind,'text');
  assert.deepEqual(plain.source.entries,[{id:'text-1',role:'document',text}]);
  assert.match(plain.limitations.join(' '),/角色/);
});

test('conversation input rejects missing, unknown, ambiguous and oversized material',async()=>{
  const {normalizeConversation} = await import('../../dist/learning/conversations.js');
  const base = {title:'材料',format:'messages',messages};
  for (const input of [null,[],{}, {...base,title:' '}, {...base,format:'chatgpt'}, {...base,messages:[]}, {...base,messageIds:[]}, {...base,messageIds:['u1','u1']}, {...base,messageIds:['missing']}, {...base,messages:[messages[0],messages[0]]}, {...base,messages:[{...messages[0],timestamp:'2026-09-17'}]}, {...base,messages:[{...messages[0],role:'system'}]}, {...base,messages:[{...messages[0],id:'../secret'}]}, {...base,messages:Array.from({length:1001},(_,i)=>({...messages[0],id:'m'+i}))}, {title:'大材料',format:'text',text:'文'.repeat(400000)}, {title:'空',format:'text',text:' '}, {...base,text:'不允许双输入'}]) assert.throws(()=>normalizeConversation(input),Error);
});

test('conversation preparation freezes a professional recipe and does not fabricate analysis',async t=>{
  const {prepareConversation} = await import('../../dist/learning/conversations.js');
  const {listLearningAssets} = await import('../../dist/learning/workflow.js');
  const root = await mkdtemp(join(tmpdir(),'vibe-conversation-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const input = {title:'决定与修正',format:'messages',messages};
  const first = await prepareConversation(root,input);
  assert.equal(first.task.recipe.id,'conversation-decisions');
  assert.equal(first.task.status,'prepared');
  assert.equal(first.task.source.entries[1].role,'assistant');
  assert.match(first.task.instructions,/supersedes/);
  assert.match(first.task.instructions,/open-question/);
  assert.equal((await prepareConversation(root,input)).task.id,first.task.id);
  assert.deepEqual(await listLearningAssets(root),[]);
});
