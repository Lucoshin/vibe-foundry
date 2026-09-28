import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLearning, importLearningAnalysis } from '../../dist/learning/workflow.js';
import { loadAssetLibraryViewModel } from '../../dist/application/asset-catalog.js';
import { distillProject } from '../../dist/index.js';
import { assetPackageDirectoryFor } from '../../dist/library/asset-library.js';
import { createBookDocument } from '../../dist/analyzers/book-document.js';
import { validateBookKnowledge } from '../../dist/schema/book-knowledge.js';
import { importImageAnalysis } from '../../dist/images/workflow.js';
import { analysisFor, png } from '../images/fixtures.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-task-context-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const source = {schemaVersion:'0.1.0',title:'预览提速实践片段',kind:'text',entries:[{id:'check',role:'document',text:'资源缓存必须绑定确切版本。首轮编译耗时另行报告。'}]};
  const task = await prepareLearning(root, {source,recipeId:'general-knowledge'});
  await importLearningAnalysis(root,task.id,{schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[
    {id:'cache',type:'practice',title:'版本缓存',summary:'缓存与版本绑定。',tags:['预览'],basis:'explicit',evidence:[{entryId:'check',quote:'资源缓存必须绑定确切版本。'}]},
    {id:'measurement',type:'practice',title:'测量边界',summary:'首次编译单独报告。',tags:[],basis:'explicit',evidence:[{entryId:'check',quote:'首轮编译耗时另行报告。'}]},
  ],relations:[]});
  return {root,model:await loadAssetLibraryViewModel(root,{runtimePreviewState:false})};
}

async function storageSnapshot(root) {
  const snapshot = {};
  for (const entry of await readdir(root,{recursive:true,withFileTypes:true})) {
    if (entry.isFile()) snapshot[join(entry.parentPath,entry.name)] = await readFile(join(entry.parentPath,entry.name),'utf8');
  }
  return snapshot;
}

test('task context preserves exact selected knowledge, provenance and revision without recording adoption',async t=>{
  const {createTaskContext} = await import('../../dist/application/task-context.js');
  const {root,model} = await fixture(t);
  const filesBefore = await storageSnapshot(root);
  const selected = model.assets[0];
  const result = await createTaskContext(root,{goal:'继续优化组件预览并核对缓存版本',assetIds:[selected.id]});
  assert.equal(result.status,'proposed');
  assert.equal(result.assets.length,1);
  assert.equal(result.assets[0].id,selected.id);
  assert.equal(result.assets[0].revision,selected.revision);
  assert.deepEqual(result.assets[0].content,selected.raw);
  assert.deepEqual(result.assets[0].evidence,selected.evidence);
  assert.equal(result.assets[0].source.id,selected.sourceId);
  assert.match(result.assets[0].contentDigest,/^sha256:[a-f0-9]{64}$/);
  assert.match(result.markdown,/待采用/);
  assert.match(result.markdown,/参考数据/);
  assert.match(result.markdown,/版本缓存/);
  assert.doesNotMatch(result.markdown,/测量边界/);
  assert.deepEqual(await storageSnapshot(root),filesBefore);
  assert.deepEqual(await createTaskContext(root,{goal:result.goal,assetIds:[selected.id]}),result);
});

test('task context requires an explicit bounded selection and goal',async t=>{
  const {createTaskContext} = await import('../../dist/application/task-context.js');
  const {root,model} = await fixture(t);
  const id = model.assets[0].id;
  for (const input of [null,[],{}, {goal:' ',assetIds:[id]}, {goal:'x',assetIds:[]}, {goal:'x',assetIds:[id,id]}, {goal:'x',assetIds:['missing']}, {goal:'x',assetIds:[1]}, {goal:'x',assetIds:[id],extra:true}, {goal:'x'.repeat(4001),assetIds:[id]}, {goal:'x',assetIds:Array.from({length:11},(_,i)=>String(i))}]) {
    await assert.rejects(createTaskContext(root,input),Error,JSON.stringify(input));
  }
});

test('task context rejects damaged selected storage',async t=>{
  const {createTaskContext} = await import('../../dist/application/task-context.js');
  const {root,model} = await fixture(t);
  await writeFile(join(root,'index.json'),'{broken');
  await assert.rejects(createTaskContext(root,{goal:'验证',assetIds:[model.assets[0].id]}));
});

test('project context uses a content digest without inventing a revision and changes when exported content changes',async t=>{
  const {createTaskContext} = await import('../../dist/application/task-context.js');
  const root = await mkdtemp(join(tmpdir(),'vibe-project-context-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const projectRoot = join(process.cwd(),'examples','fixture-project');
  await distillProject(projectRoot,{assetLibraryRoot:root});
  const model = await loadAssetLibraryViewModel(root,{runtimePreviewState:false});
  const asset = model.assets.find(item=>item.kind==='component');
  assert.ok(asset);
  const input = {goal:'复用选定组件',assetIds:[asset.id]};
  const before = await storageSnapshot(root);
  const first = await createTaskContext(root,input);
  assert.equal(Object.hasOwn(first.assets[0],'revision'),false);
  assert.match(first.assets[0].limitations.join(' '),/未提供不可变版本/);
  assert.deepEqual(await storageSnapshot(root),before);
  const path = join(assetPackageDirectoryFor(root,projectRoot),'component-catalog.json');
  const catalog = JSON.parse(await readFile(path,'utf8'));
  catalog.components.find(item=>item.filePath===asset.raw.filePath).reusePotential = 'review-required';
  await writeFile(path,JSON.stringify(catalog));
  const second = await createTaskContext(root,input);
  assert.equal(second.assets[0].id,first.assets[0].id);
  assert.notEqual(second.assets[0].contentDigest,first.assets[0].contentDigest);
});

test('book context keeps evidence and uncertainty while excluding unrelated damaged sources',async t=>{
  const {createTaskContext} = await import('../../dist/application/task-context.js');
  const {root,model} = await fixture(t);
  const document = createBookDocument('灯塔立在海岬。',{title:'灯塔',sourcePath:'book.txt'});
  const book = validateBookKnowledge(document,{schemaVersion:'0.2.0',sourceDigest:document.sourceDigest,processedChunkIds:document.chunks.map(chunk=>chunk.id),entities:[{id:'tower',type:'setting',name:'灯塔',aliases:[],facets:[{name:'位置',value:'海岬',basis:'explicit',evidence:[{unitId:document.units[0].id,quote:'灯塔立在海岬。'}]}]}],relations:[],uncertainties:[{description:'建成年代不明。',evidence:[]}]});
  await mkdir(join(root,'books','tower'),{recursive:true});
  await writeFile(join(root,'books','tower','book-assets.json'),JSON.stringify(book));
  await mkdir(join(root,'books','broken'),{recursive:true});
  await writeFile(join(root,'books','broken','book-assets.json'),'{broken');
  const expanded = await loadAssetLibraryViewModel(root,{runtimePreviewState:false});
  const selected = expanded.assets.find(asset=>asset.sourceKind==='book');
  const context = await createTaskContext(root,{goal:'核对场景依据',assetIds:[selected.id,model.assets[0].id]});
  assert.equal(context.assets[0].revision,selected.revision);
  assert.deepEqual(context.assets[0].source.uncertainties,book.uncertainties);
  assert.deepEqual(context.assets[0].evidence,selected.evidence);
  assert.match(context.limitations.join(' '),/1 个来源读取问题/);
});

test('task context rejects oversized selected content instead of silently truncating',async t=>{
  const {createTaskContext} = await import('../../dist/application/task-context.js');
  const root = await mkdtemp(join(tmpdir(),'vibe-context-size-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const task = await prepareLearning(root,{recipeId:'general-knowledge',source:{schemaVersion:'0.1.0',kind:'text',title:'大小边界',entries:[{id:'one',role:'document',text:'原文'}]}});
  await importLearningAnalysis(root,task.id,{schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[{id:'large',type:'rule',title:'大内容',summary:'字'.repeat(48000),basis:'interpretation',tags:[],evidence:[{entryId:'one',quote:'原文'}]}],relations:[]});
  const model = await loadAssetLibraryViewModel(root);
  await assert.rejects(createTaskContext(root,{goal:'验证范围限制',assetIds:[model.assets[0].id]}),/128 KiB/);
});

test('image context accepts a sound selected revision when another revision of the same source is damaged',async t=>{
  const {createTaskContext} = await import('../../dist/application/task-context.js');
  const root = await mkdtemp(join(tmpdir(),'vibe-image-context-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const imagePath = join(root,'input.png');
  await writeFile(imagePath,png());
  const library = join(root,'library');
  const analysis = analysisFor();
  const first = await importImageAnalysis(library,{imagePath,analysis});
  const second = await importImageAnalysis(library,{imagePath,analysis:{...analysis,title:'选中正常版本'}});
  await writeFile(join(first.assetPackageDir,'analysis.json'),JSON.stringify({...analysis,title:'已篡改历史版本'}));
  const model = await loadAssetLibraryViewModel(library,{runtimePreviewState:false});
  assert.deepEqual(model.assets.map(asset=>asset.id),[second.id]);
  assert.equal(model.errors[0].sourceId,second.sourceId);
  assert.equal(model.errors[0].revision,first.revision);
  const before = await storageSnapshot(library);
  const result = await createTaskContext(library,{goal:'参考正常版本的构图观察',assetIds:[second.id]});
  assert.equal(result.assets[0].revision,second.revision);
  assert.deepEqual(result.assets[0].content,second.raw);
  assert.match(result.limitations.join(' '),/1 个来源读取问题/);
  assert.deepEqual(await storageSnapshot(library),before);
  await assert.rejects(createTaskContext(library,{goal:'拒绝损坏版本',assetIds:[first.id]}),/未找到|无法读取/);
  await writeFile(join(library,'images',analysis.sourceDigest,'original.png'),png(3,3));
  await assert.rejects(createTaskContext(library,{goal:'拒绝损坏原图',assetIds:[second.id]}),/未找到|无法读取/);
});
