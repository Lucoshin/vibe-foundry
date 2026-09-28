import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runCli} from '../../dist/cli.js';
import {callVibeHubTool,listVibeHubTools} from '../../dist/mcp/server.js';
test('new CLI and readonly MCP entries share exact prompt versions and reject unknown inputs',async t=>{
 const root=await mkdtemp(join(tmpdir(),'vibe-parallel-entry-'));const previous=process.env.VIBEHUB_LIBRARY_ROOT;process.env.VIBEHUB_LIBRARY_ROOT=root;
 t.after(async()=>{if(previous===undefined)delete process.env.VIBEHUB_LIBRARY_ROOT;else process.env.VIBEHUB_LIBRARY_ROOT=previous;await rm(root,{recursive:true,force:true});});
 const cli=async(...args)=>{let output='';const result=await runCli(['node','cli',...args],{stdout:{write:value=>output+=value}});assert.equal(result.exitCode,0);return JSON.parse(output);};
 const prompt={title:'协议样本',description:'输入输出验证',targetModel:'generic',template:'整理 {{topic}}',variables:[{name:'topic',description:'主题'}],sourceAssetIds:[]};
 const input=join(root,'prompt-input.json');await writeFile(input,JSON.stringify(prompt));
 const saved=await cli('prompts','save',input);assert.equal(saved.verification,'unverified');
 assert.deepEqual(await cli('prompts','get',saved.id,saved.revision),saved);
 const mcp=await callVibeHubTool(root,'get_prompt',{id:saved.id,revision:saved.revision},{assetLibraryRoot:root});assert.equal(mcp.isError,false);assert.deepEqual(mcp.structuredContent,saved);
 const rendered=await callVibeHubTool(root,'render_prompt',{id:saved.id,revision:saved.revision,values:{topic:'真实材料'}},{assetLibraryRoot:root});assert.equal(rendered.structuredContent.text,'整理 真实材料');
 for(const name of ['list_prompts','get_prompt','render_prompt','list_knowledge_collections','get_knowledge_collection','explore_asset_relations','get_learning_memory','get_creator_task']){
  assert.equal(listVibeHubTools().find(tool=>tool.name===name).annotations.readOnlyHint,true);
  assert.equal((await callVibeHubTool(root,name,{extra:true},{assetLibraryRoot:root})).isError,true);
 }
 await assert.rejects(cli('prompts','save',input,'extra'),/参数/);
 const source=join(root,'conversation-input.json');await writeFile(source,JSON.stringify({title:'真实用户片段',format:'messages',messages:[{id:'u1',role:'user',text:'还有对话提炼呢。'}]}));
 const prepared=await cli('conversation','prepare',source);assert.equal(prepared.task.source.entries[0].id,'u1');assert.equal(prepared.task.recipe.id,'conversation-decisions');
});
