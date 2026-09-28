import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as workflow from '../../dist/learning/workflow.js';
import { loadAssetLibraryViewModel } from '../../dist/application/asset-catalog.js';

function assertSnapshot(snapshot) {
  const tasks=new Map(snapshot.tasks.map(task=>[task.id,task]));
  for (const asset of snapshot.assets) {
    const task=tasks.get(asset.taskId);
    assert.ok(task,'every asset must have a task in the same snapshot');
    assert.ok(task.results.some(result=>result.id===asset.resultId),'every asset must have a result in the same task snapshot');
  }
  for (const task of snapshot.tasks) {
    for (const result of task.results) {
      assert.equal(snapshot.assets.filter(asset=>asset.taskId===task.id && asset.resultId===result.id).length,result.assetCount);
    }
  }
}

test('returns a coherent empty learning library snapshot',async()=> {
  const root=await mkdtemp(join(tmpdir(),'vibe-learning-snapshot-'));
  assert.deepEqual(await workflow.loadLearningLibrary(root),{tasks:[],assets:[]});
});

test('concurrent publication keeps tasks, assets and the shared catalog mutually consistent',async()=> {
  const root=await mkdtemp(join(tmpdir(),'vibe-learning-snapshot-concurrent-'));
  let writing=true;
  const writer=(async()=> {
    try {
      for(let index=0;index<12;index++) {
        const quote=`第 ${index} 次实践保留真实证据。`;
        const task=await workflow.prepareLearning(root,{recipeId:'general-knowledge',source:{schemaVersion:'0.1.0',title:`实践 ${index}`,kind:'text',entries:[{id:'entry',role:'document',text:quote}]}});
        await workflow.importLearningAnalysis(root,task.id,{schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[{id:'lesson',type:'lesson',title:'保留证据',summary:quote,tags:[],basis:'explicit',evidence:[{entryId:'entry',quote}]}],relations:[]});
      }
    } finally { writing=false; }
  })();
  const reader=(async()=> {
    do {
      assertSnapshot(await workflow.loadLearningLibrary(root));
      const model=await loadAssetLibraryViewModel(root);
      for(const asset of model.assets) assert.ok(model.sources.some(source=>source.id===asset.sourceId));
    } while(writing);
  })();
  await Promise.all([writer,reader]);
  const final=await workflow.loadLearningLibrary(root);
  assertSnapshot(final);
  assert.equal(final.tasks.length,12);
  assert.equal(final.assets.length,12);
});
