import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {runCli} from '../dist/cli.js';
import {callVibeHubTool} from '../dist/mcp/server.js';
import {importLearningAnalysis,recordApplication} from '../dist/learning/workflow.js';
import {createTaskContext} from '../dist/application/task-context.js';
import {startWebServer} from '../dist/web/server.js';

const base=resolve('output/all-directions-acceptance');await mkdir(base,{recursive:true});
const libraryRoot=join(base,'library');process.env.VIBEHUB_LIBRARY_ROOT=libraryRoot;
const json=async(name,value)=>{const path=join(base,name);await writeFile(path,JSON.stringify(value,null,2)+'\n');return path;};
async function cli(...args){let text='';const result=await runCli(['node','cli',...args],{stdout:{write:value=>text+=value}});assert.equal(result.exitCode,0);return JSON.parse(text);}
const prepared=await cli('creator','prepare','examples/creators/3blue1brown-capture.json');
assert.deepEqual(prepared.coverage,{works:3,transcripts:0,metadataOnly:3});
const creatorAnalysis={schemaVersion:'0.1.0',sourceDigest:prepared.task.sourceDigest,recipeDigest:prepared.task.recipeDigest,assets:[
 {id:'declared-position',type:'creator-profile',title:'作者声明：直观分享数学',summary:'主页自述用深入浅出、直观明了的方式分享数学；这里只记录作者声明，不评价全部作品是否做到。',basis:'explicit',tags:['账号','数学'],evidence:[{entryId:'creator-profile',quote:'深入浅出、直观明了地分享数学之美。'}]},
 {id:'sample-topics',type:'creator-topic',title:'样本涉及线性代数与微积分',summary:'所选作品标题分别出现线性代数、微积分；这是标题层选题观察，不代表完整账号内容分布或已阅读视频论证。',basis:'explicit',tags:['选题','数学'],evidence:[{entryId:'work-BV1Ys411k7yQ-metadata',quote:'【熟肉】线性代数的本质 - 01 - 向量究竟是什么？'},{entryId:'work-BV1qW411N7FU-metadata',quote:'【官方双语/合集】微积分的本质 - 系列合集'}]},
 {id:'question-template',type:'creator-template',title:'候选标题模板：概念加直观问题',summary:'可尝试“系列名称 + 核心概念究竟是什么？”的标题结构。依据仅为一个实际标题，适用于概念解释型内容；尚未验证传播效果，也不能断言是全账号固定模式。',basis:'interpretation',tags:['标题模板'],evidence:[{entryId:'work-BV1Ys411k7yQ-metadata',quote:'向量究竟是什么？'}]},
 {id:'support-link',type:'creator-conversion',title:'主页公开资助入口',summary:'主页提供 Patreon 资助地址；只能说明入口存在，不能据此推断收入、转化率或商业成效。',basis:'explicit',tags:['公开入口'],evidence:[{entryId:'creator-profile',quote:'资助页面：www.patreon.com/3blue1brown'}]},
],relations:[]};
const account=await cli('creator','import',prepared.task.id,await json('creator-analysis.json',creatorAnalysis));
assert.equal(account.assets.length,4);
const conversationInput={title:'继续全部并行与对话提炼：当前可见用户指令',format:'messages',messages:[{id:'u-parallel',role:'user',text:'多线并行推进'},{id:'u-all',role:'user',text:'全部继续并行开发。账号线你先看能不能把b站随便找个知识博主跑通吧。还有对话提炼呢。'}]};
const conversation=await cli('conversation','prepare',await json('conversation-input.json',conversationInput));
const learned=await importLearningAnalysis(libraryRoot,conversation.task.id,{schemaVersion:'0.1.0',sourceDigest:conversation.task.sourceDigest,recipeDigest:conversation.task.recipeDigest,assets:[
 {id:'parallel',type:'decision',title:'继续多方向并行开发',summary:'用户明确全部继续并行，且没有将对话提炼排除。',basis:'explicit',tags:['需求'],evidence:[{entryId:'u-all',quote:'全部继续并行开发。'}]},
 {id:'conversation',type:'open-question',title:'对话提炼需要继续推进',summary:'用户明确追问对话提炼，需要在本轮交付中给出具体进展。',basis:'explicit',tags:['对话'],evidence:[{entryId:'u-all',quote:'还有对话提炼呢。'}]},
],relations:[{id:'includes',from:'parallel',to:'conversation',type:'includes',description:'根据同条用户消息，推断本轮并行范围包含对话提炼。',basis:'interpretation',evidence:[{entryId:'u-all',quote:conversationInput.messages[1].text}]}]});
const image=await cli('image','import','output/pencil-web-design/AJTN7.png','examples/images/asset-library-analysis.json');
const revisedAnalysis=JSON.parse(await readFile('examples/images/asset-library-analysis.json','utf8'));revisedAnalysis.description+=' 本轮仅验证专业编辑保存新版本，仍是历史图像观察。';
const revisedImage=await cli('image','revise',image.id,await json('image-revision.json',revisedAnalysis));assert.notEqual(image.revision,revisedImage.revision);
const promptInput={title:'数学知识标题草案',description:'基于一个真实标题提炼的候选模板，未验证传播效果。',targetModel:'generic',template:'请围绕 {{concept}} 写一个“究竟是什么”的解释型标题。',variables:[{name:'concept',description:'概念名称'}],sourceAssetIds:[account.assets[2].id]};
const prompt=await cli('prompts','save',await json('prompt-input.json',promptInput));
const nextPrompt=await cli('prompts','save',await json('prompt-revision.json',{...promptInput,id:prompt.id,baseRevision:prompt.revision,description:promptInput.description+' 保留来源引用。'}));assert.notEqual(prompt.revision,nextPrompt.revision);
const renderInput={id:nextPrompt.id,revision:nextPrompt.revision,values:{concept:'向量'}};
const rendered=await cli('prompts','render',await json('prompt-render.json',renderInput));assert.match(rendered.text,/向量/);
const collection=await cli('collections','save',await json('collection-input.json',{name:'数学账号与开发知识组合',description:'引用真实账号、对话与历史图片版本，不复制原始资产。',assetIds:[account.assets[0].id,...learned.assets.map(a=>a.id),revisedImage.id]}));
const members=await cli('collections','get',collection.id);assert.equal(members.members.length,4);assert.ok(members.members.every(member=>member.status==='available'));
const relations=await cli('collections','relations',await json('relations-selection.json',{assetIds:learned.assets.map(a=>a.id)}));assert.equal(relations.relations.length,1);
const context=await createTaskContext(libraryRoot,{goal:'按照真实用户指令继续多线推进，保留账号采样和未取得字幕的限制。',assetIds:[account.assets[0].id,...learned.assets.map(a=>a.id),revisedImage.id]});assert.match(context.markdown,/未取得字幕/);
const application=await recordApplication(libraryRoot,{assetIds:learned.assets.map(a=>a.id),target:'本轮账号、对话、提示词与集合整合',reason:'用户明确继续并行并追问对话流程。',action:'接通专业准备、证据导入、图片修订、提示词变量渲染和集合引用；比较 CLI 与 MCP 确切版本。',outcome:'本脚本的数据链路断言通过；字幕不可用，不能声称完成视频内容或生图效果验收。',evidence:[{label:'验收脚本',uri:resolve('scripts/verify-knowledge-directions.mjs')}]});
const memory=await cli('memory',learned.assets[0].id);assert.ok(memory.applications.some(record=>record.id===application.id));
for(const [tool,args,expected] of [['get_prompt',{id:nextPrompt.id,revision:nextPrompt.revision},nextPrompt],['render_prompt',renderInput,rendered],['get_knowledge_collection',{id:collection.id},members],['get_learning_memory',{assetId:learned.assets[0].id},memory]]){const result=await callVibeHubTool(libraryRoot,tool,args,{assetLibraryRoot:libraryRoot});assert.equal(result.isError,false);assert.deepEqual(result.structuredContent,expected);}
const {server}=await startWebServer(undefined,{assetLibraryRoot:libraryRoot,port:0});
try{
 const url='http://127.0.0.1:'+server.address().port;const html=await(await fetch(url)).text();const token=html.match(/name="vibe-import-token" content="([^"]+)"/)[1];
 const checks=[
  ['/api/prompts',await cli('prompts','list'),'list_prompts',{}],
  ['/api/knowledge-collections',await cli('collections','list'),'list_knowledge_collections',{}],
  ['/api/creators/task?id='+prepared.task.id,await cli('creator','task',prepared.task.id),'get_creator_task',{taskId:prepared.task.id}],
  ['/api/conversations/memory?assetId='+encodeURIComponent(learned.assets[0].id),memory,'get_learning_memory',{assetId:learned.assets[0].id}],
 ];
 for(const [path,expected,tool,args] of checks){
  const response=await fetch(url+path,{headers:{'x-vibe-import-token':token}});assert.equal(response.status,200,path);
  assert.deepEqual(await response.json(),expected,path+' HTTP / CLI 正文不一致');
  const mcp=await callVibeHubTool(libraryRoot,tool,args,{assetLibraryRoot:libraryRoot});assert.equal(mcp.isError,false,tool);assert.deepEqual(mcp.structuredContent,expected,tool+' MCP / CLI 正文不一致');
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
const evidence={libraryRoot,creatorTaskId:prepared.task.id,creatorAssets:account.assets.length,creatorCoverage:prepared.coverage,conversationTaskId:conversation.task.id,conversationAssets:learned.assets.length,relations:relations.relations.length,promptId:prompt.id,promptVersions:[prompt.revision,nextPrompt.revision],imageVersions:[image.revision,revisedImage.revision],collectionId:collection.id,collectionMembers:members.members.length,applicationId:application.id,contextDigest:context.digest,mcpHttpCliConsistent:true,videoContentAnalyzed:false};
await json('evidence.json',evidence);console.log(JSON.stringify(evidence,null,2));
