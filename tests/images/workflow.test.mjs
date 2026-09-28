import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analysisFor, png, jpeg, webp, digest } from './fixtures.mjs';

async function api() {
  assert.ok(existsSync(new URL('../../dist/images/workflow.js',import.meta.url)),'图片专业流程尚未实现');
  return import('../../dist/images/workflow.js');
}
async function fixture(t,bytes=png()) {
  const root=await mkdtemp(join(tmpdir(),'vibehub-image-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const imagePath=join(root,'selected.image'); await writeFile(imagePath,bytes);
  return {root,library:join(root,'library'),imagePath,analysis:analysisFor(bytes)};
}

test('从二进制识别 PNG/JPEG/WebP，文件扩展名不作为格式依据',async t=>{
  const {inspectImage}=await api();
  for(const [bytes,format,width,height] of [[png(),'png',2,3],[jpeg,'jpeg',2,3],[webp,'webp',1,1]]) {
    const {imagePath}=await fixture(t,bytes);
    assert.deepEqual(await inspectImage(imagePath),{digest:digest(bytes),format,mimeType:'image/'+format,width,height,byteLength:bytes.length});
  }
});

test('拒绝伪装图片、截断内容和 PNG 校验和破坏',async t=>{
  const {inspectImage}=await api();
  const damaged=png(); damaged[33]^=1;
  for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),png().subarray(0,40),jpeg.subarray(0,jpeg.length-2),webp.subarray(0,webp.length-1),damaged]) {
    const {imagePath}=await fixture(t,bytes); await assert.rejects(inspectImage(imagePath),/图片|PNG|JPEG|WebP/);
  }
});

test('严格校验摘要、区域、观察、推断和未验证提示词，不创建失败资产',async t=>{
  const {importImageAnalysis}=await api(), f=await fixture(t);
  const changes=[
    a=>a.sourceDigest='a'.repeat(64),a=>a.extra=true,a=>a.observations=[],a=>a.observations[0].aspect='unknown',
    a=>a.observations[0].evidence={scope:'whole-image',x:0},a=>a.observations[1].evidence.x=-1,
    a=>a.observations[1].evidence.width=3,a=>a.observations[1].evidence.height=0,a=>a.observations[1].evidence.x=0.5,
    a=>a.inferences[0].basedOn=[9],a=>a.inferences[0].basedOn=[],a=>a.inferences[0].basedOn=[0,0],a=>a.inferences[0].uncertainty='',
    a=>a.prompts[0].verification='verified',a=>a.prompts[0].targetModel='unknown-model',a=>a.prompts[0].seed=123,
    a=>a.prompts.push({...a.prompts[0]}),a=>a.tags=['重复','重复'],a=>a.description=' ',
  ];
  for(const change of changes) {const analysis=structuredClone(f.analysis);change(analysis);await assert.rejects(importImageAnalysis(f.library,{imagePath:f.imagePath,analysis}),/图片|字段|观察|推断|提示词|摘要|标签/);}
  assert.equal(existsSync(f.library),false);
});

test('相同原图与键序不同的同一分析去重；分析变更保留两个不可变版本',async t=>{
  const {importImageAnalysis,loadImageLibraryAssets,readImageFile}=await api(),f=await fixture(t);
  const first=await importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:f.analysis});
  const renamed=join(f.root,'renamed.png');await writeFile(renamed,png());
  const reordered=Object.fromEntries(Object.entries(f.analysis).reverse());
  const same=await importImageAnalysis(f.library,{imagePath:renamed,analysis:reordered});
  assert.equal(first.id,same.id);assert.equal(first.revision,same.revision);
  assert.equal(first.kind,'image-knowledge');assert.equal(first.raw.prompts[0].verification,'unverified');
  const modified=structuredClone(f.analysis);modified.prompts[0].prompt='绘制纯黑色竖向矩形';
  const second=await importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:modified});
  assert.notEqual(first.id,second.id);
  await rm(f.imagePath);
  const library=await loadImageLibraryAssets(f.library);
  assert.equal(library.assets.length,2);assert.equal(library.sources.length,1);assert.equal(library.sources[0].assetCount,2);assert.deepEqual(library.errors,[]);
  assert.equal(library.assets.find(a=>a.id===first.id).raw.prompts[0].prompt,'绘制黑色矩形');
  assert.deepEqual((await readImageFile(f.library,f.analysis.sourceDigest)).bytes,png());
  await assert.rejects(readImageFile(f.library,'../outside'),/摘要/);
});

test('并发相同导入只发布一个有效版本',async t=>{
  const {importImageAnalysis,loadImageLibraryAssets}=await api(),f=await fixture(t);
  const results=await Promise.all(Array.from({length:4},()=>importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:f.analysis})));
  assert.equal(new Set(results.map(a=>a.id)).size,1);
  assert.equal((await loadImageLibraryAssets(f.library)).assets.length,1);
  const entries=await readdir(join(f.library,'images'));assert.deepEqual(entries,[f.analysis.sourceDigest]);
});

test('篡改版本显式报错，有效历史版本仍可读取，重复导入不能覆盖损坏证据',async t=>{
  const {importImageAnalysis,loadImageLibraryAssets}=await api(),f=await fixture(t);
  const first=await importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:f.analysis});
  const modified=structuredClone(f.analysis);modified.title='第二版';
  const second=await importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:modified});
  const corrupted={...f.analysis,title:'篡改'};await writeFile(join(first.assetPackageDir,'analysis.json'),JSON.stringify(corrupted));
  const library=await loadImageLibraryAssets(f.library);
  assert.deepEqual(library.assets.map(a=>a.id),[second.id]);assert.equal(library.errors.length,1);assert.match(library.errors[0].message,/摘要/);
  await assert.rejects(importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:f.analysis}),/摘要/);
  assert.equal(JSON.parse(await readFile(join(first.assetPackageDir,'analysis.json'),'utf8')).title,'篡改');
});

test('库内原图损坏后资产和原图读取均拒绝',async t=>{
  const {importImageAnalysis,loadImageLibraryAssets,readImageFile}=await api(),f=await fixture(t);
  await importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:f.analysis});
  await writeFile(join(f.library,'images',f.analysis.sourceDigest,'original.png'),png(3,3));
  const library=await loadImageLibraryAssets(f.library);assert.equal(library.assets.length,0);assert.equal(library.errors.length,1);
  await assert.rejects(readImageFile(f.library,f.analysis.sourceDigest),/摘要/);
});

test('缺失库返回空目录，受管图片目录的链接不能越过库边界',async t=>{
  const {loadImageLibraryAssets,importImageAnalysis}=await api(),f=await fixture(t);
  assert.deepEqual(await loadImageLibraryAssets(f.library),{assets:[],sources:[],errors:[]});
  await mkdir(f.library);const outside=join(f.root,'outside');await mkdir(outside);
  await symlink(outside,join(f.library,'images'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:f.analysis}),/链接/);
  const library=await loadImageLibraryAssets(f.library);assert.equal(library.assets.length,0);assert.equal(library.errors.length,1);
  assert.deepEqual(await readdir(outside),[]);
});

test('原图文件路由可区分不存在和证据损坏',async t=>{
  const {readImageFile,importImageAnalysis}=await api(),f=await fixture(t);
  await assert.rejects(readImageFile(f.library,f.analysis.sourceDigest),{code:'ENOENT'});
  await importImageAnalysis(f.library,{imagePath:f.imagePath,analysis:f.analysis});
  await rm(join(f.library,'images',f.analysis.sourceDigest,'original.png'));
  await assert.rejects(readImageFile(f.library,f.analysis.sourceDigest),{code:'ENOENT'});
});
