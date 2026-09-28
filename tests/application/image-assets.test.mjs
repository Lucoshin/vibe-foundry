import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAssetLibraryViewModel,queryAssets } from '../../dist/application/asset-catalog.js';
import { png,analysisFor } from '../images/fixtures.mjs';

test('统一目录按图片类型、来源和观察关键词查询，图片版本身份保持一致',async t=>{
  assert.ok(existsSync(new URL('../../dist/images/workflow.js',import.meta.url)),'图片专业流程尚未实现');
  const {importImageAnalysis}=await import('../../dist/images/workflow.js');
  const root=await mkdtemp(join(tmpdir(),'vibehub-image-catalog-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const imagePath=join(root,'input.png');await writeFile(imagePath,png());
  const analysis=analysisFor();analysis.observations[0].text='可检索的观察词青铜色';
  const asset=await importImageAnalysis(root,{imagePath,analysis});
  const catalog=await loadAssetLibraryViewModel(root);
  assert.equal(catalog.summary.totalAssets,1);assert.equal(catalog.assets[0].id,asset.id);assert.equal(catalog.assets[0].revision,asset.revision);
  assert.equal(catalog.sources[0].kind,'image');assert.equal(catalog.sources[0].assetCount,1);
  assert.deepEqual(queryAssets(catalog.assets,{kind:'image-knowledge',sourceId:asset.sourceId,query:'青铜色'}).map(a=>a.id),[asset.id]);
  assert.deepEqual(queryAssets(catalog.assets,{language:'ts'}),[]);
  assert.deepEqual(catalog.errors,[]);assert.equal(catalog.isError,false);
});
