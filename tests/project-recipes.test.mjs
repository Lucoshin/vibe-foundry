import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {distillProject} from '../dist/index.js';
import {getRecipe,saveRecipe} from '../dist/learning/recipes.js';
import {readComponentPrompt} from '../dist/library/component-prompts.js';
import {runCli} from '../dist/cli.js';

test('project distillation uses the selected immutable recipe for both selection and effect instructions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vibehub-project-recipe-')),library=join(root,'library');
 await mkdir(join(root,'src/components'),{recursive:true});
 await writeFile(join(root,'package.json'),JSON.stringify({name:'recipe-test',dependencies:{react:'19.0.0'}}));
 await writeFile(join(root,'src/components/ArrowIcon.tsx'),'export default function ArrowIcon(){return <svg><path/></svg>}');
 await writeFile(join(root,'src/components/Button.tsx'),'export default function Button(){return <button>Save</button>}');
 const builtin=await getRecipe(library,'component-distillation');
 const {id,version,builtin:flag,digest,...content}=builtin;
 const first=await distillProject(root,{assetLibraryRoot:library});
 const initial=JSON.parse(await readFile(join(first.outputDir,'component-catalog.json'),'utf8'));
 assert.deepEqual(initial.components.map(c=>c.name),['Button']);
 assert.deepEqual(initial.recipe,builtin);
 const firstPrompt=await readComponentPrompt(first.outputDir,'src/components/Button.tsx');
 const personal=await saveRecipe(library,{...content,name:'图标也保留',componentRules:{iconPrimitives:'include',emptyShells:'include'},prompt:'请重点复现键盘焦点。\n{source}\n关注：{focus}',outputInstructions:'未测量的参数请明确说明，不得虚构。'});
 await saveRecipe(library,{...content,id:personal.id,name:'后续版本不应被偷偷采用'});
 const second=await distillProject(root,{assetLibraryRoot:library,recipeId:personal.id,recipeVersion:1});
 const selected=JSON.parse(await readFile(join(second.outputDir,'component-catalog.json'),'utf8'));
 assert.deepEqual(selected.components.map(c=>c.name),['ArrowIcon','Button']);
 assert.deepEqual(selected.recipe,personal);
 const prompt=await readComponentPrompt(second.outputDir,'src/components/Button.tsx');
 assert.match(prompt.prompt,/请重点复现键盘焦点/);assert.match(prompt.prompt,/未测量的参数请明确说明/);
 assert.notEqual(prompt.sourceDigest,firstPrompt.sourceDigest);
 await assert.rejects(distillProject(root,{assetLibraryRoot:library,recipeId:'general-knowledge'}),/工程|project/);
});

test('CLI forwards explicit recipe and version and rejects unknown or incomplete flags',async()=>{
 const calls=[];
 await runCli(['node','cli','distill','source','--recipe','chosen','--recipe-version','2'],{stdout:{write(){}},distillProject:async(root,options)=>{calls.push({root,options});return {outputDir:'library',analysis:{files:0,parsed:0,reused:0}};}});
 assert.deepEqual(calls,[{root:'source',options:{recipeId:'chosen',recipeVersion:2}}]);
 for(const extra of [['--recipe'],['--recipe-version','2'],['--unknown','x'],['--recipe','chosen','--recipe-version','NaN']]){
  await assert.rejects(runCli(['node','cli','distill','source',...extra],{distillProject:async()=>assert.fail('invalid args executed')}));
 }
});

test('component-first rules merge only identical implementations and retain editable source decisions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vibehub-component-first-')),library=join(root,'library');
 await mkdir(join(root,'src/components'),{recursive:true});
 await writeFile(join(root,'package.json'),JSON.stringify({name:'component-first',dependencies:{vue:'3.5.0'}}));
 const files={
  'A.vue':'<template><button @click="$emit(\'choose\')">选择套餐</button></template>',
  'B.vue':'<template><button @click="$emit(\'choose\')">选择套餐</button></template>',
  'Provider.vue':'<script setup>const context = 1;</script><template><view><slot /></view></template><style scoped></style>',
  'Close.vue':'<template><svg><path d="M0 0L1 1" /></svg></template>',
  'Counter.vue':'<template><button @click="$emit(\'increase\')">增加数量</button></template>',
 };
 for(const [name,source] of Object.entries(files))await writeFile(join(root,'src/components',name),source);
 const first=await distillProject(root,{assetLibraryRoot:library});
 const catalog=JSON.parse(await readFile(join(first.outputDir,'component-catalog.json'),'utf8'));
 assert.deepEqual(catalog.components.map(c=>c.name),['A','Counter']);
 assert.equal(catalog.components[0].duplicateSources[0].filePath,'src/components/B.vue');
 assert.deepEqual(new Set(catalog.selectionDecisions.map(d=>d.rule)),new Set(['duplicates','headlessContainers','iconPrimitives']));
 const prompt=await readComponentPrompt(first.outputDir,'src/components/A.vue');
 assert.ok(prompt.sourceFiles.includes('src/components/B.vue'));
 const {id,version,builtin,digest,...content}=await getRecipe(library,'component-distillation');
 const personal=await saveRecipe(library,{...content,componentRules:{...content.componentRules,iconPrimitives:'include',headlessContainers:'include',duplicates:'keep'}});
 const second=await distillProject(root,{assetLibraryRoot:library,recipeId:personal.id});
 const kept=JSON.parse(await readFile(join(second.outputDir,'component-catalog.json'),'utf8'));
 assert.deepEqual(kept.components.map(c=>c.name),['A','B','Close','Counter','Provider']);
});

test('whole views are optional candidates while authored reusable blocks remain components',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vibehub-view-granularity-')),library=join(root,'library');
 await mkdir(join(root,'src/views/report/components'),{recursive:true});
 await writeFile(join(root,'package.json'),JSON.stringify({name:'view-granularity',dependencies:{vue:'3.5.0'}}));
 await writeFile(join(root,'src/views/report/index.vue'),'<script setup>import Filters from "./Filters.vue";</script><template><main><Filters/><h1>完整报表页</h1></main></template>');
 await writeFile(join(root,'src/views/report/Filters.vue'),'<template><button @click="$emit(\'apply\')">应用筛选</button></template>');
  await writeFile(join(root,'src/views/report/components/ExportButton.vue'),'<template><button @click="$emit(\'export\')">导出</button></template>');
  await writeFile(join(root,'src/views/report/UnusedPicker.vue'),'<script setup>defineProps({value:String});defineEmits(["choose"]);</script><template><button @click="$emit(\'choose\')">选择日期</button></template>');
 const first=await distillProject(root,{assetLibraryRoot:library});
 const catalog=JSON.parse(await readFile(join(first.outputDir,'component-catalog.json'),'utf8'));
 assert.deepEqual(new Set(catalog.components.map(c=>c.filePath)),new Set(['src/views/report/Filters.vue','src/views/report/components/ExportButton.vue','src/views/report/UnusedPicker.vue']));
 assert.ok(catalog.selectionDecisions.some(item=>item.filePath==='src/views/report/index.vue'&&item.rule==='viewEntries'));
 const {id,version,builtin,digest,...content}=await getRecipe(library,'component-distillation');
 const custom=await saveRecipe(library,{...content,componentRules:{...content.componentRules,viewEntries:'include'}});
 const second=await distillProject(root,{assetLibraryRoot:library,recipeId:custom.id});
 const included=JSON.parse(await readFile(join(second.outputDir,'component-catalog.json'),'utf8'));
 assert.equal(included.components.length,4);
});
