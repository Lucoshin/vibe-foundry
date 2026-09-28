import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as images from '../../dist/images/workflow.js';
import { png,analysisFor } from './fixtures.mjs';

test('只用已存原图在线修订，保留旧版且相同修订去重',async t=>{
  assert.equal(typeof images.reviseImageAnalysis,'function','图片在线修订尚未实现');
  const root=await mkdtemp(join(tmpdir(),'vibehub-image-revision-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const imagePath=join(root,'input.png');await writeFile(imagePath,png());const analysis=analysisFor();
  const first=await images.importImageAnalysis(root,{imagePath,analysis});await rm(imagePath);
  const changed={...analysis,title:'在线修订',observations:[{...analysis.observations[0],text:'重新核对的黑色'}],inferences:[]};
  const second=await images.reviseImageAnalysis(root,{assetId:first.id,analysis:changed});assert.notEqual(first.id,second.id);
  assert.equal((await images.reviseImageAnalysis(root,{assetId:first.id,analysis:changed})).id,second.id);
  const result=await images.loadImageLibraryAssets(root);assert.equal(result.assets.length,2);assert.equal(result.assets.find(a=>a.id===first.id).name,'测试图片');
  await assert.rejects(images.reviseImageAnalysis(root,{assetId:'image:'+analysis.sourceDigest+':'+'a'.repeat(64),analysis:changed}),/不存在/);
  await assert.rejects(images.reviseImageAnalysis(root,{assetId:first.id,analysis:{...changed,sourceDigest:'b'.repeat(64)}}),/摘要/);
  await assert.rejects(images.reviseImageAnalysis(root,{assetId:first.id,analysis:changed,imagePath:'outside'}),/字段/);
});
