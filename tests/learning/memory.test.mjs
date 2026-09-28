import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareLearning, importLearningAnalysis, recordApplication, listApplications } from '../../dist/learning/workflow.js';

test('memory returns exact knowledge evidence, declared outcomes and separate revision candidates',async t=>{
  const {getLearningMemory} = await import('../../dist/learning/memory.js');
  const root = await mkdtemp(join(tmpdir(),'vibe-memory-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const task = await prepareLearning(root,{recipeId:'conversation-learning',source:{schemaVersion:'0.1.0',title:'当前会话片段',kind:'conversation',entries:[{id:'u1',role:'user',text:'多线并行推进'}]}});
  const analysis = {schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[{id:'direction',type:'decision',title:'并行推进',summary:'同时推进明确的独立工作。',basis:'explicit',tags:[],evidence:[{entryId:'u1',quote:'多线并行推进'}]}],relations:[]};
  const first = await importLearningAnalysis(root,task.id,analysis);
  const second = await importLearningAnalysis(root,task.id,{...analysis,assets:[{...analysis.assets[0],summary:'按独立职责并行推进，结果分别验收。'}]});
  const otherTask = await prepareLearning(root,{recipeId:'general-knowledge',source:task.source});
  await importLearningAnalysis(root,otherTask.id,{...analysis,recipeDigest:otherTask.recipeDigest});
  const application = await recordApplication(root,{assetIds:[first.assets[0].id],target:'本轮增量',reason:'有独立工作可以并行',action:'划分上下文与图片实现',outcome:'由使用者记录，尚待验收',evidence:[]});
  const memory = await getLearningMemory(root,{assetId:first.assets[0].id});
  assert.equal(memory.asset.id,first.assets[0].id);
  assert.deepEqual(memory.evidence,[{entryId:'u1',role:'user',quote:'多线并行推进'}]);
  assert.deepEqual(memory.applications,[application]);
  assert.equal(memory.revisions[0].assetId,second.assets[0].id);
  assert.equal(memory.revisions.length,1,'相同局部 ID 不跨任务合并');
  assert.deepEqual(memory.revisions[0].applications,[]);
  assert.match(memory.limitations.join(' '),/不.*取代/);
  assert.deepEqual(await listApplications(root),[application]);
  for (const input of [null,{}, {assetId:'missing'}, {assetId:first.assets[0].id,latest:true}]) await assert.rejects(getLearningMemory(root,input),Error);
});
