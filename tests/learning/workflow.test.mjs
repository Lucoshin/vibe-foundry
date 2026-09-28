import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as workflow from '../../dist/learning/workflow.js';

const source = () => ({schemaVersion:'0.1.0',title:'侧栏改造讨论',kind:'conversation',entries:[
  {id:'user-1',role:'user',text:'分类应改为资产库、来源库、学习任务。我们保留真实来源证据。'},
  {id:'assistant-1',role:'assistant',text:'采用工作入口导航，将语言和角色放入组合筛选。'}
]});
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(),'vibe-learning-'));
  const task = await workflow.prepareLearning(root,{source:source(),recipeId:'conversation-learning'});
  return {root,task};
}
function analysis(task) {
  return {schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[
    {id:'navigation',type:'decision',title:'按工作入口导航',summary:'导航按工作入口组织，专业属性进入组合筛选。',tags:['导航','检索'],basis:'explicit',evidence:[{entryId:'user-1',quote:'分类应改为资产库、来源库、学习任务。'}]},
    {id:'facets',type:'design-pattern',title:'组合筛选',summary:'语言和角色作为筛选。',tags:['筛选'],basis:'interpretation',evidence:[{entryId:'assistant-1',quote:'将语言和角色放入组合筛选。'}]}
  ],relations:[{id:'navigation-facets',from:'navigation',to:'facets',type:'uses',description:'导航决策使用组合筛选组织专业属性。',basis:'interpretation',evidence:[{entryId:'assistant-1',quote:'采用工作入口导航，将语言和角色放入组合筛选。'}]}]};
}

test('prepares an immutable host task with source and recipe snapshots',async t => {
  const {root,task} = await setup(t);
  assert.match(task.id,/^task-[a-f0-9]{64}$/);
  assert.equal(task.status,'prepared');
  assert.equal(task.recipe.id,'conversation-learning');
  assert.equal(task.recipe.digest,task.recipeDigest);
  assert.deepEqual(task.source,source());
  assert.match(await readFile(task.taskPath,'utf8'),/sourceDigest[\s\S]*recipeDigest[\s\S]*evidence/);
  assert.match(task.instructions,/宿主/);
  const again = await workflow.prepareLearning(root,{source:source(),recipeId:'conversation-learning'});
  assert.equal(again.id,task.id);
  assert.equal(again.createdAt,task.createdAt);
  assert.equal((await workflow.listLearningTasks(root)).length,1);
  assert.deepEqual(await workflow.getLearningTask(root,task.id),task);
});

test('imports exact evidence and preserves multiple immutable result versions without duplicates',async t => {
  const {root,task} = await setup(t);
  const input = analysis(task);
  const first = await workflow.importLearningAnalysis(root,task.id,input);
  assert.equal(first.assets.length,2);
  const asset = first.assets[0];
  assert.equal(asset.localId,'navigation');
  assert.equal(asset.id,`learning:${task.id}:${first.digest}:navigation`);
  assert.equal(first.relations[0].from,asset.id);
  assert.equal(asset.sourceTitle,source().title);
  assert.equal((await workflow.getLearningTask(root,task.id)).status,'analyzed');
  const duplicate = await workflow.importLearningAnalysis(root,task.id,input);
  assert.deepEqual(duplicate,first);
  assert.equal((await workflow.listLearningAssets(root)).length,2);
  input.assets[0].summary = '新的摘要版本，保留旧结果。';
  const second = await workflow.importLearningAnalysis(root,task.id,input);
  assert.notEqual(second.digest,first.digest);
  assert.equal((await workflow.listLearningAssets(root)).length,4);
  const read = (await workflow.listLearningAssets(root)).find(item=>item.id===asset.id);
  assert.deepEqual(read.evidence,asset.evidence);
  assert.equal(read.relations[0].to,first.assets[1].id);
  assert.equal((await workflow.getLearningTask(root,task.id)).results.length,2);
});

const badAnalyses = [
  ['source digest',a=>a.sourceDigest='0'.repeat(64)],
  ['recipe digest',a=>a.recipeDigest='0'.repeat(64)],
  ['unknown analysis field',a=>a.trusted=true],
  ['unknown asset field',a=>a.assets[0].confidence=1],
  ['unknown evidence field',a=>a.assets[0].evidence[0].start=0],
  ['missing evidence',a=>a.assets[0].evidence=[]],
  ['nonexistent entry',a=>a.assets[0].evidence[0].entryId='missing'],
  ['invented quote',a=>a.assets[0].evidence[0].quote='没有出现过的结论'],
  ['duplicate asset identity',a=>a.assets[1].id=a.assets[0].id],
  ['invalid type',a=>a.assets[0].type='../../decision'],
  ['unsupported basis',a=>a.assets[0].basis='verified'],
  ['missing relation endpoint',a=>a.relations[0].to='missing'],
  ['relation evidence',a=>a.relations[0].evidence=[]],
  ['duplicate relation identity',a=>a.relations.push({...a.relations[0]})],
];
for (const [label,mutate] of badAnalyses) test(`rejects ${label} without registering partial results`,async t=> {
  const {root,task} = await setup(t);
  const input = analysis(task); mutate(input);
  await assert.rejects(workflow.importLearningAnalysis(root,task.id,input));
  assert.deepEqual(await workflow.listLearningAssets(root),[]);
  assert.equal((await workflow.getLearningTask(root,task.id)).status,'prepared');
});

test('rejects ambiguous repeated quotes and allows a truthful empty result',async()=> {
  const root=await mkdtemp(join(tmpdir(),'vibe-learning-'));
  const input=source(); input.entries[0].text+='分类应改为资产库、来源库、学习任务。';
  const task=await workflow.prepareLearning(root,{source:input,recipeId:'conversation-learning'});
  await assert.rejects(workflow.importLearningAnalysis(root,task.id,analysis(task)),/唯一|unique/);
  const result=await workflow.importLearningAnalysis(root,task.id,{schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[],relations:[]});
  assert.deepEqual(result.assets,[]);
  assert.equal((await workflow.getLearningTask(root,task.id)).status,'analyzed');
});

test('rejects malformed source and mismatched recipe source kind',async()=> {
  const root=await mkdtemp(join(tmpdir(),'vibe-learning-'));
  for(const mutate of [s=>s.extra=true,s=>s.entries[1].id=s.entries[0].id,s=>s.entries[0].role='system',s=>s.entries[0].text='',s=>s.entries=[]]) {
    const input=source(); mutate(input);
    await assert.rejects(workflow.prepareLearning(root,{source:input,recipeId:'conversation-learning'}));
  }
  const input=source(); input.kind='text';
  await assert.rejects(workflow.prepareLearning(root,{source:input,recipeId:'conversation-learning'}),/source|材料/);
  assert.deepEqual(await workflow.listLearningTasks(root),[]);
});

test('application records bind exact asset versions and preserve user-declared evidence',async t=> {
  const {root,task}=await setup(t);
  const result=await workflow.importLearningAnalysis(root,task.id,analysis(task));
  const input={assetIds:[result.assets[0].id],target:'VibeHub 侧栏',reason:'明确工作入口',action:'更新导航并保留资产筛选。',outcome:'代码已修改，尚待真实用户验收。',evidence:[{label:'本地测试报告',uri:'docs/reports/test.md'}]};
  const record=await workflow.recordApplication(root,input);
  assert.equal(record.verification,'user-declared');
  assert.deepEqual(record.assetIds,input.assetIds);
  assert.deepEqual((await workflow.listApplications(root))[0],record);
  await assert.rejects(workflow.recordApplication(root,{...input,assetIds:['navigation']}),/资产|asset/);
  await assert.rejects(workflow.recordApplication(root,{...input,verified:true}));
  await assert.rejects(workflow.recordApplication(root,{...input,evidence:[{label:'执行脚本',uri:'javascript:alert(1)'}]}));
  assert.equal((await workflow.listApplications(root)).length,1);
});

test('rejects path traversal and symlinked storage directories',async t=> {
  const {root,task}=await setup(t);
  await assert.rejects(workflow.getLearningTask(root,'../outside'));
  const other=await mkdtemp(join(tmpdir(),'vibe-learning-outside-'));
  const poisoned=await mkdtemp(join(tmpdir(),'vibe-learning-poisoned-'));
  await symlink(other,join(poisoned,'learning'),'junction');
  await assert.rejects(workflow.prepareLearning(poisoned,{source:source(),recipeId:'conversation-learning'}),/symbolic|符号|directory/);
});

test('publishes concurrent identical preparation and analysis only once',async()=> {
  const root=await mkdtemp(join(tmpdir(),'vibe-learning-concurrent-'));
  const tasks=await Promise.all(Array.from({length:4},()=>workflow.prepareLearning(root,{source:source(),recipeId:'conversation-learning'})));
  assert.ok(tasks.every(task=>task.createdAt===tasks[0].createdAt));
  const results=await Promise.all(Array.from({length:4},()=>workflow.importLearningAnalysis(root,tasks[0].id,analysis(tasks[0]))));
  assert.ok(results.every(result=>result.createdAt===results[0].createdAt));
  assert.equal((await workflow.listLearningTasks(root)).length,1);
  assert.equal((await workflow.listLearningAssets(root)).length,2);
});

test('detects mutated frozen source snapshots before accepting analysis',async t=> {
  const {root,task}=await setup(t);
  const path=join(root,'learning','tasks',task.id,'task.json');
  const snapshot=JSON.parse(await readFile(path,'utf8'));
  snapshot.source.entries[0].text='被替换的材料';
  await writeFile(path,JSON.stringify(snapshot));
  await assert.rejects(workflow.importLearningAnalysis(root,task.id,analysis(task)),/digest|快照/);
});

test('does not replace recipe placeholders inside source material',async()=> {
  const root=await mkdtemp(join(tmpdir(),'vibe-learning-placeholder-'));
  const input=source(); input.entries[0].text='保留字面量 {focus} 和 {source}，它们属于被分析材料。';
  const task=await workflow.prepareLearning(root,{source:input,recipeId:'conversation-learning'});
  assert.ok(task.instructions.slice(task.instructions.indexOf('## 方案')).includes(input.entries[0].text));
});

test('rejects active application evidence URIs with leading whitespace or controls',async t=> {
  const {root,task}=await setup(t);
  const result=await workflow.importLearningAnalysis(root,task.id,analysis(task));
  for(const uri of [' javascript:alert(1)','java\nscript:alert(1)']) {
    await assert.rejects(workflow.recordApplication(root,{assetIds:[result.assets[0].id],target:'任务',reason:'依据',action:'行动',outcome:'结果',evidence:[{label:'测试',uri}]}));
  }
});
