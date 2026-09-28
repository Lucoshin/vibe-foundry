import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,readdir,rm,writeFile,symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { importImageAnalysis } from '../../dist/images/workflow.js';
import { png,analysisFor } from '../images/fixtures.mjs';

async function api(){assert.ok(existsSync(new URL('../../dist/prompts/workflow.js',import.meta.url)),'独立提示词库尚未实现');return import('../../dist/prompts/workflow.js');}
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'vibehub-prompts-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const draft=()=>({title:'构图提示词',description:'用于明确主体的视觉候选',targetModel:'generic',template:'画面主体：{{subject}}，再次强调 {{subject}}。色调：{{color}}。',variables:[{name:'subject',description:'主体'},{name:'color',description:'色调'}],sourceAssetIds:[]});

test('保存、精确读取与重复初版去重，并发发布保持唯一',async t=>{
  const {savePrompt,getPrompt,listPrompts}=await api(),root=await fixture(t);
  const records=await Promise.all(Array.from({length:4},()=>savePrompt(root,draft())));
  assert.equal(new Set(records.map(r=>r.id+':'+r.revision)).size,1);
  const record=records[0];assert.equal(record.verification,'unverified');assert.equal(record.parentRevision,null);
  assert.deepEqual(await getPrompt(root,record.id,record.revision),record);
  assert.deepEqual((await listPrompts(root)).prompts,[record]);
});
test('修订必须基于存在版本，旧版保留，同内容保存不制造新版本',async t=>{
  const {savePrompt,getPrompt,listPrompts}=await api(),root=await fixture(t);
  const first=await savePrompt(root,draft());
  assert.equal((await savePrompt(root,{...draft(),id:first.id,baseRevision:first.revision})).revision,first.revision);
  const second=await savePrompt(root,{...draft(),title:'修订版',id:first.id,baseRevision:first.revision});
  assert.equal(second.id,first.id);assert.equal(second.parentRevision,first.revision);assert.notEqual(second.revision,first.revision);
  assert.equal((await getPrompt(root,first.id,first.revision)).title,'构图提示词');assert.equal((await listPrompts(root)).prompts.length,2);
  await assert.rejects(savePrompt(root,{...draft(),id:first.id,baseRevision:'a'.repeat(64)}),/不存在/);
});
test('严格声明与渲染变量，单次替换不解释用户内容，支持字面双括号',async t=>{
  const {savePrompt,renderPrompt}=await api(),root=await fixture(t),record=await savePrompt(root,draft());
  const rendered=await renderPrompt(root,{id:record.id,revision:record.revision,values:{subject:'{{color}}',color:'青色'}});
  assert.equal(rendered.text,'画面主体：{{color}}，再次强调 {{color}}。色调：青色。');assert.equal(rendered.verification,'unverified');
  for(const values of [{subject:'树'},{subject:'树',color:'青色',extra:'x'},{subject:2,color:'青色'},{subject:' ',color:'青色'}]) await assert.rejects(renderPrompt(root,{id:record.id,revision:record.revision,values}),/变量/);
  const escaped=await savePrompt(root,{...draft(),template:'字面 \\{{example\\}} 和 {"key":"value"}',variables:[]});
  assert.equal((await renderPrompt(root,{id:escaped.id,revision:escaped.revision,values:{}})).text,'字面 {{example}} 和 {"key":"value"}');
  await assert.rejects(renderPrompt(root,{id:record.id,revision:record.revision,values:{subject:'x'.repeat(200000),color:'y'}}),/变量|大小|长度/);
});
test('拒绝未知字段、缺失或多余声明、无效语法和虚假验证状态，失败不写库',async t=>{
  const {savePrompt}=await api(),root=await fixture(t),library=join(root,'library');
  const changes=[d=>d.variables=[],d=>d.variables.push({name:'extra',description:'多余'}),d=>d.variables[0].name='bad-name',d=>d.variables.push({...d.variables[0]}),d=>d.template='{{subject}',d=>d.template='{{ subject }}',d=>d.template='{{}}',d=>d.verification='verified',d=>d.unknown=true,d=>d.id='prompt-'+'a'.repeat(64),d=>d.baseRevision='a'.repeat(64),d=>d.sourceAssetIds=['missing']];
  for(const change of changes){const input=draft();change(input);await assert.rejects(savePrompt(library,input));}
  assert.equal(existsSync(library),false);
});
test('图片候选保持真实源资产引用，未知引用拒绝',async t=>{
  const {savePrompt}=await api(),root=await fixture(t),path=join(root,'source.png');await writeFile(path,png());
  const image=await importImageAnalysis(root,{imagePath:path,analysis:analysisFor()});
  const record=await savePrompt(root,{...draft(),sourceAssetIds:[image.id]});assert.deepEqual(record.sourceAssetIds,[image.id]);
  await assert.rejects(savePrompt(root,{...draft(),sourceAssetIds:[image.id,image.id]}),/重复/);
  await assert.rejects(savePrompt(root,{...draft(),sourceAssetIds:['image:unknown']}),/不存在|读取/);
});
test('损坏版本报告错误且不遮盖好版本，不能通过重复保存覆盖',async t=>{
  const {savePrompt,listPrompts,getPrompt}=await api(),root=await fixture(t),first=await savePrompt(root,draft());
  const second=await savePrompt(root,{...draft(),title:'修订版',id:first.id,baseRevision:first.revision});
  const path=join(root,'prompts',first.id,second.revision+'.json');
  const original=JSON.parse(await readFile(path,'utf8'));await writeFile(path,JSON.stringify({...original,title:'篡改'}));
  const result=await listPrompts(root);assert.deepEqual(result.prompts.map(p=>p.revision),[first.revision]);assert.equal(result.errors.length,1);
  await assert.rejects(getPrompt(root,first.id,second.revision),/摘要/);
  await assert.rejects(savePrompt(root,{...draft(),title:'修订版',id:first.id,baseRevision:first.revision}),/摘要/);
});
test('缺失库为空，路径遍历和库内链接拒绝',async t=>{
  const {savePrompt,listPrompts,getPrompt}=await api(),root=await fixture(t);
  assert.deepEqual(await listPrompts(root),{prompts:[],errors:[]});await assert.rejects(getPrompt(root,'../outside','a'.repeat(64)),/标识/);
  const outside=join(root,'outside');await mkdir(outside);await symlink(outside,join(root,'prompts'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(savePrompt(root,draft()),/链接/);assert.deepEqual(await readdir(outside),[]);
});
