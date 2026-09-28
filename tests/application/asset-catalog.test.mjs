import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('shared catalog supports an empty cross-domain library and exact filters', async t => {
  const { loadAssetLibraryViewModel, queryAssets } = await import('../../dist/application/asset-catalog.js');
  const root = await mkdtemp(join(tmpdir(), 'vibe-catalog-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const model = await loadAssetLibraryViewModel(root);
  assert.equal(model.isError,false);
  assert.deepEqual(model.assets,[]);
  assert.deepEqual(model.sources,[]);
  const items=[{id:'a',name:'状态机',description:'游戏状态',sourceId:'one',kind:'module',language:'ts',labels:[]},{id:'b',name:'状态机',description:'人物',sourceId:'two',kind:'concept',language:null,labels:[]}];
  assert.deepEqual(queryAssets(items,{query:'状态',kind:'module',sourceId:'one',language:'ts'}).map(a=>a.id),['a']);
  assert.throws(()=>queryAssets(items,{category:'invented'}),/Unknown|不支持/);
});
test('application and learning modules do not depend on transport adapters',async()=>{
  for (const folder of ['application','learning']) {
    for (const entry of await readdir('src/'+folder)) {
      if(!entry.endsWith('.ts'))continue;
      const code=await readFile('src/'+folder+'/'+entry,'utf8');
      assert.doesNotMatch(code,/from\s+["'][^"']*(?:\/web\/|\/mcp\/|\/cli\.)/);
    }
  }
});
import { prepareLearning, importLearningAnalysis } from '../../dist/learning/workflow.js';
import { saveRecipe } from '../../dist/learning/recipes.js';
test('the same material stays one source across recipes, even before assets exist', async t=>{
 const {loadAssetLibraryViewModel}=await import('../../dist/application/asset-catalog.js');
 const root=await mkdtemp(join(tmpdir(),'vibe-sources-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source={schemaVersion:'0.1.0',title:'实践记录',kind:'text',entries:[{id:'one',role:'document',text:'先验证结果，再把经验作为规则。'}]};
 const first=await prepareLearning(root,{source,recipeId:'general-knowledge'});
 const recipe=await saveRecipe(root,{name:'另一角度',description:'比较',sourceKinds:['text'],focus:['验证'],prompt:'{source}',outputInstructions:'保留证据'});
 await prepareLearning(root,{source,recipeId:recipe.id});
 let model=await loadAssetLibraryViewModel(root);assert.equal(model.sources.length,1);assert.equal(model.assets.length,0);
 await importLearningAnalysis(root,first.id,{schemaVersion:'0.1.0',sourceDigest:first.sourceDigest,recipeDigest:first.recipeDigest,assets:[],relations:[]});
 model=await loadAssetLibraryViewModel(root);assert.equal(model.sources.length,1);assert.equal(model.sources[0].status,'knowledge');
});
