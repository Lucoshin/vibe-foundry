import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createLocalImport } from '../../dist/web/local-import.js';
import { createImportRequestHandler } from '../../dist/web/local-import.js';
import { getRecipe, saveRecipe } from '../../dist/learning/recipes.js';
import { Readable } from 'node:stream';
import vm from 'node:vm';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-local-import-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '项目'));
  await writeFile(join(root, '资料.md'), '# 第一章\n英雄踏上旅程，面对命运。');
  await writeFile(join(root, 'unsupported.zip'), 'not a document');
  return root;
}

async function completed(service) {
  const deadline = Date.now() + 15000;
  while (service.status()?.state === 'running' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.notEqual(service.status()?.state, 'running');
  return service.status();
}

test('local picker lists real directories and supported documents with original paths', async t => {
  const root = await fixture(t);
  const service = createLocalImport({ libraryRoot: join(root, 'library'), initialDirectory: root });
  const listing = await service.browse(root);
  assert.equal(listing.path, await realpath(root));
  assert.deepEqual(listing.entries.map(entry => entry.name), ['项目', '资料.md']);
  assert.equal(listing.entries[1].path, join(listing.path, '资料.md'));
  await assert.rejects(service.browse(join(root, 'absent')));
  await assert.rejects(service.start(join(root, 'unsupported.zip')), /支持/);
});

test('document import runs real analysis, preserves source and delivers fixed result files', async t => {
  const root = await fixture(t);
  const service = createLocalImport({ libraryRoot: join(root, 'library') });
  const path = join(root, '资料.md');
  const before = await readFile(path, 'utf8');
  await service.start(path);
  const result = await completed(service);
  assert.equal(result.state, 'succeeded', result.message);
  assert.equal(result.kind, 'document');
  assert.match(await service.result('report'), /Chapters/);
  assert.equal(JSON.parse(await service.result('assets')).sourcePath, await realpath(path));
  await assert.rejects(service.result('../../secret'), /结果/);
  assert.equal(await readFile(path, 'utf8'), before);
});

test('serializes starts including path validation and allows retry after worker failure', async t => {
  const root = await fixture(t);
  const service = createLocalImport({ libraryRoot: join(root, 'library') });
  const starts = await Promise.allSettled([service.start(join(root, '项目')), service.start(join(root, '项目'))]);
  assert.equal(starts.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(starts.find(result => result.status === 'rejected').reason.message, /正在/);
  assert.equal((await completed(service)).state, 'failed');
  await service.start(join(root, '资料.md'));
  assert.equal((await completed(service)).state, 'succeeded');
});

test('project import registers the real project in the configured central library', async t => {
  const root = await fixture(t);
  const libraryRoot = join(root, 'library');
  const service = createLocalImport({ libraryRoot });
  await service.start(resolve('examples/fixture-project'));
  const result = await completed(service);
  assert.equal(result.state, 'succeeded', result.message);
  assert.equal(result.kind, 'project');
  const recipe=await getRecipe(libraryRoot,'component-distillation');
  assert.deepEqual(result.recipe,{id:recipe.id,version:recipe.version,name:recipe.name,digest:recipe.digest});
  const index = JSON.parse(await readFile(join(libraryRoot, 'index.json'), 'utf8'));
  assert.equal(index.projects[0].projectRoot, resolve('examples/fixture-project'));
  await assert.rejects(service.result('assets'), /文档/);
});

test('rejects unknown options, non-project recipes and document recipe combinations before creating a job',async t=>{
  const root=await fixture(t),service=createLocalImport({libraryRoot:join(root,'library')});
  await assert.rejects(service.start(join(root,'项目'),{unsupported:true}),/字段/);
  await assert.rejects(service.start(join(root,'项目'),{recipeId:'general-knowledge'}),/工程|project/);
  await assert.rejects(service.start(join(root,'项目'),{recipeId:null}),/id/);
  await assert.rejects(service.start(join(root,'资料.md'),{recipeId:'component-distillation'}),/文档/);
  assert.equal(service.status(),null);
});

test('freezes an exact personal project recipe before an asynchronous worker can select a newer version',async t=>{
  const root=await fixture(t),libraryRoot=join(root,'library');
  const input={name:'我的工程方案',description:'真实测试',sourceKinds:['project'],focus:['组件'],prompt:'按来源分析',outputInstructions:'说明未知项',componentRules:{iconPrimitives:'exclude',emptyShells:'exclude'}};
  const recipe=await saveRecipe(libraryRoot,input);
  const service=createLocalImport({libraryRoot});
  const started=await service.start(join(root,'项目'),{recipeId:recipe.id});
  await saveRecipe(libraryRoot,{id:recipe.id,...input,name:'下一版'});
  assert.deepEqual(started.recipe,{id:recipe.id,version:recipe.version,name:recipe.name,digest:recipe.digest});
  started.recipe.name='调用方改写副本';
  assert.equal(service.status().recipe.name,recipe.name);
  await completed(service);
  assert.equal(service.status().recipe.version,recipe.version);
  const exact=await service.start(join(root,'项目'),{recipeId:recipe.id,recipeVersion:recipe.version});
  assert.equal(exact.recipe.version,1);
  await completed(service);
});

test('import worker forwards the frozen version to project distillation only',async()=>{
  const script=(await readFile(new URL('../../dist/web/import-worker.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
  for(const kind of ['project','document']){
    let options;
    const process={argv:['node','worker',kind,'source','library',...(kind==='project'?['my-recipe','3']:[])],stdout:{write(){}},stderr:{write(message){throw new Error(message);}}};
    const context=vm.createContext({process,URL,distillProject:async(_path,input)=>{options=input;return {outputDir:'out'};},distillBook:async(_path,input)=>{options=input;return {outputDir:'out'};}});
    await vm.runInContext('(async()=>{'+script+'})()',context);
    assert.deepEqual(JSON.parse(JSON.stringify(options)),kind==='project'?{assetLibraryRoot:'library',recipeId:'my-recipe',recipeVersion:3}:{assetLibraryRoot:'library'});
  }
});

test('import API keeps browse strict and rejects recipe options on documents',async t=>{
  const root=await fixture(t),handler=createImportRequestHandler({libraryRoot:join(root,'library'),token:'token',initialDirectory:root});
  for(const [route,body] of [['browse',{path:root,recipeId:'component-distillation'}],['start',{path:join(root,'资料.md'),recipeVersion:1}],['start',{path:root,unknown:true}]]){
    const request=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(request,{method:'POST',socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:1234','x-vibe-import-token':'token','content-type':'application/json'}});
    const response={setHeader(){},end(value){this.body=value;}};
    await handler(request,response,new URL('http://127.0.0.1:1234/api/import/'+route));
    assert.equal(response.statusCode,400,response.body);
  }
});
