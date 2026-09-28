import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callVibeHubTool, listVibeHubTools } from '../../dist/mcp/server.js';
import { prepareLearning, importLearningAnalysis } from '../../dist/learning/workflow.js';
import { loadAssetLibraryViewModel } from '../../dist/application/asset-catalog.js';

test('MCP exposes bounded readonly task context and the same application result',async t=>{
  const definition = listVibeHubTools().find(tool=>tool.name==='create_task_context');
  assert.ok(definition);
  assert.equal(definition.annotations.readOnlyHint,true);
  assert.deepEqual(definition.inputSchema.required,['goal','assetIds']);
  const root = await mkdtemp(join(tmpdir(),'vibe-mcp-context-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const task = await prepareLearning(root,{recipeId:'general-knowledge',source:{schemaVersion:'0.1.0',kind:'text',title:'依据',entries:[{id:'one',role:'document',text:'先核对证据。'}]}});
  await importLearningAnalysis(root,task.id,{schemaVersion:'0.1.0',sourceDigest:task.sourceDigest,recipeDigest:task.recipeDigest,assets:[{id:'one',type:'rule',title:'核对证据',summary:'先核对。',basis:'explicit',tags:[],evidence:[{entryId:'one',quote:'先核对证据。'}]}],relations:[]});
  const model = await loadAssetLibraryViewModel(root);
  const input = {goal:'开发前核对依据',assetIds:[model.assets[0].id]};
  const result = await callVibeHubTool(root,'create_task_context',input,{assetLibraryRoot:root});
  assert.equal(result.isError,false);
  const {createTaskContext} = await import('../../dist/application/task-context.js');
  assert.deepEqual(result.structuredContent,await createTaskContext(root,input));
  assert.equal(result.structuredContent.status,'proposed');
  for (const invalid of [null,{}, {goal:'验证',assetIds:['missing']}, {...input,extra:true}]) {
    const error = await callVibeHubTool(root,'create_task_context',invalid,{assetLibraryRoot:root});
    assert.equal(error.isError,true);
    assert.equal(typeof error.structuredContent.message,'string');
  }
});
