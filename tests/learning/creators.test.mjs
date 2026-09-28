import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeCreatorCapture,prepareCreator,importCreatorAnalysis,getCreatorTask} from '../../dist/learning/creators.js';

const capture=()=>({schemaVersion:'0.1.0',platform:'bilibili',account:{id:'123',name:'测试知识账号',url:'https://space.bilibili.com/123',description:'测试主页声明'},collectedAt:'2026-09-17T00:00:00.000Z',sampling:{method:'明确选取的单个协议样本',windowStart:'2026-01-01T00:00:00.000Z',windowEnd:'2026-09-17T00:00:00.000Z',limitations:['非全量采集']},works:[{id:'BV1Ys411k7yQ',url:'https://www.bilibili.com/video/BV1Ys411k7yQ/',title:'测试向量',description:'测试简介',publishedAt:'2026-02-01T00:00:00.000Z',transcript:{status:'unavailable',reason:'没有取得字幕'}}]});
test('creator capture preserves exact metadata and makes absent transcript explicit',()=>{
 const result=normalizeCreatorCapture(capture());
 assert.equal(result.coverage.works,1);assert.equal(result.coverage.transcripts,0);
 assert.match(result.limitations.join(' '),/字幕/);
 assert.ok(result.source.entries.some(e=>e.id==='work-BV1Ys411k7yQ-metadata'&&e.text.includes('测试简介')));
 for(const change of [x=>x.account.url='https://space.bilibili.com/999',x=>x.works[0].url='https://example.com/video',x=>x.works.push(x.works[0]),x=>x.sampling.windowEnd='2025-01-01',x=>x.extra=true,x=>x.works[0].transcript={status:'available',segments:[]}]){
  const value=capture();change(value);assert.throws(()=>normalizeCreatorCapture(value));
 }
});
test('creator transcript anchors retain times and reject invalid ranges',()=>{
 const value=capture();value.works[0].transcript={status:'available',segments:[{startSeconds:1,endSeconds:3,text:'真实字幕片段（测试）'}]};
 const result=normalizeCreatorCapture(value);assert.equal(result.coverage.transcripts,1);
 assert.match(result.source.entries.find(e=>e.id==='work-BV1Ys411k7yQ-segment-0').text,/1.*3.*真实字幕/s);
 value.works[0].transcript.segments[0].endSeconds=0;assert.throws(()=>normalizeCreatorCapture(value));
});
test('creator import rejects unsupported transcript claims and keeps ordinary metadata assets consumable',async t=>{
 const root=await mkdtemp(join(tmpdir(),'vibe-creator-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const prepared=await prepareCreator(root,capture());
 assert.equal(prepared.task.recipe.id,'creator-analysis');
 assert.equal((await getCreatorTask(root,prepared.task.id)).capture.account.id,'123');
 const analysis={schemaVersion:'0.1.0',sourceDigest:prepared.task.sourceDigest,recipeDigest:prepared.task.recipeDigest,assets:[{id:'topic',type:'creator-topic',title:'样本选题',summary:'这个样本标题涉及向量。',basis:'explicit',tags:[],evidence:[{entryId:'work-BV1Ys411k7yQ-metadata',quote:'测试向量'}]}],relations:[]};
 const imported=await importCreatorAnalysis(root,prepared.task.id,analysis);assert.equal(imported.assets.length,1);
 const bad=structuredClone(analysis);bad.assets[0].type='creator-transcript';await assert.rejects(importCreatorAnalysis(root,prepared.task.id,bad),/字幕/);
 const {importLearningAnalysis}=await import('../../dist/learning/workflow.js');await assert.rejects(importLearningAnalysis(root,prepared.task.id,bad),/字幕/);
 bad.assets[0].type='creator-audience';await assert.rejects(importCreatorAnalysis(root,prepared.task.id,bad),/推断/);
 const {loadAssetLibraryViewModel}=await import('../../dist/application/asset-catalog.js');
 assert.ok((await loadAssetLibraryViewModel(root,{runtimePreviewState:false})).assets.some(a=>a.id===imported.assets[0].id));
 const {createTaskContext}=await import('../../dist/application/task-context.js');
 const context=await createTaskContext(root,{goal:'核对账号样本边界',assetIds:[imported.assets[0].id]});
 assert.match(context.markdown,/未取得字幕/);assert.match(context.markdown,/space.bilibili.com/);
});

test('creator transcript evidence must quote the actual segment body instead of the generated URL or time header',async t=>{
 const root=await mkdtemp(join(tmpdir(),'vibe-creator-body-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const value=capture();value.works[0].transcript={status:'available',segments:[{startSeconds:1,endSeconds:3,text:'这里是真实字幕正文。'},{startSeconds:4,endSeconds:6,text:'另一段字幕正文。'}]};
 const {task}=await prepareCreator(root,value);
 const analysis={schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[{id:'transcript',type:'creator-transcript',title:'字幕观察',summary:'引用实际字幕。',basis:'explicit',tags:[],evidence:[{entryId:'work-BV1Ys411k7yQ-segment-0',quote:'这里是真实字幕正文。'}]}],relations:[]};
 for(const quote of [value.works[0].url,'1–3 秒','另一段字幕正文。']) {
  const invalid=structuredClone(analysis);invalid.assets[0].evidence[0].quote=quote;
  await assert.rejects(importCreatorAnalysis(root,task.id,invalid),/字幕|引文/);
 }
 assert.equal((await importCreatorAnalysis(root,task.id,analysis)).assets.length,1);
});

test('creator source identity and limitations survive other recipes, which may extract ordinary knowledge',async t=>{
 const root=await mkdtemp(join(tmpdir(),'vibe-creator-shared-source-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const {prepareLearning,importLearningAnalysis}=await import('../../dist/learning/workflow.js');
 const {loadAssetLibraryViewModel}=await import('../../dist/application/asset-catalog.js');
 const normalized=normalizeCreatorCapture(capture());
 const generic=await prepareLearning(root,{source:normalized.source,recipeId:'general-knowledge'});
 const analysis={schemaVersion:'0.1.0',sourceDigest:generic.sourceDigest,recipeDigest:generic.recipeDigest,assets:[{id:'scope',type:'decision',title:'仅检查样本',summary:'用户选定样本供复用观察。',basis:'interpretation',tags:[],evidence:[{entryId:'work-BV1Ys411k7yQ-metadata',quote:'测试向量'}]}],relations:[]};
 const imported=await importLearningAnalysis(root,generic.id,analysis);
 let model=await loadAssetLibraryViewModel(root,{runtimePreviewState:false});
 assert.equal(model.sources[0].kind,'creator');
 assert.equal(model.sources[0].path,capture().account.url);
 assert.equal(model.assets[0].id,imported.assets[0].id);
 assert.equal(model.assets[0].sourceKind,'creator');
 assert.match(model.assets[0].raw.creator.limitations.join(' '),/未取得字幕/);
 await prepareCreator(root,capture());
 model=await loadAssetLibraryViewModel(root,{runtimePreviewState:false});
 assert.equal(model.sources.length,1);assert.equal(model.sources[0].kind,'creator');assert.equal(model.sources[0].path,capture().account.url);
 const mislabeled=structuredClone(analysis);mislabeled.assets[0].type='creator-transcript';
 await assert.rejects(importLearningAnalysis(root,generic.id,mislabeled),/字幕/);
});

test('creator capture rejects impossible UTC calendar dates instead of accepting Date.parse rollover',()=>{
 for(const invalid of ['2026-02-31T00:00:00.000Z','2026-02-29T00:00:00Z','2026-04-31T00:00:00.000Z']) {
  const value=capture();value.works[0].publishedAt=invalid;assert.throws(()=>normalizeCreatorCapture(value),/日期/);
 }
 const value=capture();value.works[0].publishedAt='2026-02-28T00:00:00Z';assert.equal(normalizeCreatorCapture(value).coverage.works,1);
});

test('a conversation message ID cannot accidentally mark the conversation as creator capture',async t=>{
 const root=await mkdtemp(join(tmpdir(),'vibe-creator-message-id-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const {prepareLearning}=await import('../../dist/learning/workflow.js');
 const source={schemaVersion:'0.1.0',kind:'conversation',title:'普通对话',entries:[{id:'creator-capture',role:'user',text:'这是原始消息 ID，不是账号采集清单。'}]};
 const task=await prepareLearning(root,{source,recipeId:'conversation-learning'});
 assert.deepEqual(task.source,source);
});
