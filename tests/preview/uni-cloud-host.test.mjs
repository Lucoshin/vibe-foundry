import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {discoverUniCloudHost} from '../../dist/preview/uni-cloud-host.js';
import {uniPreviewHostSource} from '../../dist/preview/uni-official-api-host.js';

test('cloud host requires actual source calls and a resolvable installed official SDK',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cloud-host-'));
 try {
  await writeFile(join(root,'package.json'),'{}');
  const sources=[{filePath:'src/Pay.vue',source:'<script>const pay=uniCloud.importObject("pay");</script>'}];
  assert.equal(await discoverUniCloudHost(root,sources),null);
  const dir=join(root,'node_modules/@dcloudio/uni-cloud'); await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'package.json'),'{"main":"index.js"}'); await writeFile(join(dir,'index.js'),'module.exports={}');
  const found=await discoverUniCloudHost(root,sources);
  assert.deepEqual(found.sourceFiles,['src/Pay.vue']); assert.match(found.sdkDigest,/^[a-f0-9]{64}$/);
  assert.equal(await discoverUniCloudHost(root,[{filePath:'src/text.js',source:'const text="uniCloud.importObject()"; // uniCloud.callFunction()'}]),null);
  assert.equal(await discoverUniCloudHost(root,[{filePath:'src/local.js',source:'const uniCloud={importObject(){}}; uniCloud.importObject();'}]),null);
  assert.equal(await discoverUniCloudHost(root,[{filePath:'src/uni_modules/pay/uniCloud/cloudfunctions/pay/index.js',source:'uniCloud.database();'}]),null);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('cloud load follows official uni host and does not declare fake cloud responses',()=>{
 const source=uniPreviewHostSource('component',null,true);
 assert.match(source,/import\("@dcloudio\/uni-cloud"\)/);
 assert.ok(source.indexOf('installUniPreviewHost(globalThis')<source.indexOf('import("@dcloudio/uni-cloud")'));
 assert.doesNotMatch(source,/uniCloud\s*=\s*\{/);
 assert.doesNotMatch(uniPreviewHostSource('component'),/import\("@dcloudio\/uni-cloud"\)/);
});
