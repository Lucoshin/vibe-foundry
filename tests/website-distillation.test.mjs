import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { runCli } from '../dist/cli.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vibe-website-'));
  const capture = join(root, 'capture');
  await mkdir(capture);
  const html = '<!doctype html><html><head></head><body><button id="demo" onclick="this.textContent=\'ON\'">OFF</button></body></html>';
  await writeFile(join(capture, 'button.html'), html);
  const manifest = {schemaVersion:'0.1.0', url:'https://example.com/studio', name:'Example studio', capturedAt:'2026-09-16T00:00:00.000Z', files:[{path:'button.html', sha256:hash(html), kind:'source', url:'https://example.com/studio'}], controls:[{id:'button', name:'示例按钮', entry:'button.html', selector:'#demo', sourceFiles:['button.html'], description:{layout:'单按钮布局',visual:'原始按钮外观',motion:'没有动画',interaction:'点击从 OFF 变为 ON'}, limitations:['原站场景内控件，未验证其他浏览器。']}]};
  await writeFile(join(capture,'website-capture.json'), JSON.stringify(manifest));
  return {root,capture,manifest};
}

test('website CLI routes an explicit capture target, never the current project', async () => {
  let called;
  const result = await runCli(['node','cli','distill-website','capture'], {stdout:{write(){}},stderr:{write(){}},distillWebsite:async target => {called=target;return {outputDir:'library/example',components:1};}});
  assert.equal(result.exitCode,0);
  assert.equal(called,'capture');
});

test('imports real website controls, prompts, immutable sources and rebuildable previews', async () => {
  const {distillWebsite} = await import('../dist/website/distill-website.js');
  const {buildComponentPreviewStaticBundle} = await import('../dist/preview/component-preview-runtime.js');
  const {readComponentPrompt} = await import('../dist/library/component-prompts.js');
  const {root,capture} = await fixture();
  const result = await distillWebsite(capture,{assetLibraryRoot:join(root,'library')});
  const catalog = JSON.parse(await readFile(join(result.outputDir,'component-catalog.json')));
  assert.equal(catalog.components.length,1);
  const component = catalog.components[0];
  const prompt = await readComponentPrompt(result.outputDir,component.filePath);
  assert.match(prompt.prompt,/布局[\s\S]*视觉[\s\S]*动效[\s\S]*交互/);
  const registry = JSON.parse(await readFile(join(result.outputDir,'component-previews.json')));
  assert.equal(registry.runtime,'static-website');
  assert.deepEqual(registry.previews[0].limitations,['runtime-validation-pending']);
  assert.match(component.limitations[0],/未验证其他浏览器/);
  assert.match(prompt.unresolved[0],/未验证其他浏览器/);
  const bundle = await buildComponentPreviewStaticBundle(result.projectRoot,{assetDir:result.outputDir,component:registry.previews[0].id});
  assert.match(bundle.artifactTreeDigest,/^[a-f0-9]{64}$/);
  const {createServer}=await import('node:http');
  const {createWebRequestHandler}=await import('../dist/web/server.js');
  const server=createServer(createWebRequestHandler(result.projectRoot,{assetLibraryRoot:join(root,'library')}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    const preview=registry.previews[0];
    const html=await fetch(base+preview.browserUrl);
    assert.match(await html.text(),/sandbox="allow-scripts"/);
    const cookie=html.headers.get('set-cookie').split(';')[0];
    const mounted=await fetch(base+'/api/component-preview-validation/'+preview.id+'?actionDigest='+preview.actionDigest,{method:'POST',headers:{cookie}});
    assert.equal(mounted.status,204);
    const model=await (await fetch(base+'/api/assets')).json();
    assert.equal(model.assets[0].componentPreview.status,'ready');
    const inner=await fetch(base+preview.browserUrl+'website/button.html');
    assert.equal(inner.headers.get('content-security-policy'),'sandbox allow-scripts');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

  const again = await distillWebsite(capture,{assetLibraryRoot:join(root,'library')});
  assert.equal(again.outputDir,result.outputDir);
  assert.equal(JSON.parse(await readFile(join(again.outputDir,'component-previews.json'))).previews[0].actionDigest,registry.previews[0].actionDigest);
});

for (const [name, mutate, pattern] of [
  ['tampered bytes', m=>{m.files[0].sha256='a'.repeat(64);}, /digest|散列/i],
  ['path escape', m=>{m.files[0].path='../button.html';}, /path|路径/i],
  ['duplicate control', m=>{m.controls.push(m.controls[0]);}, /duplicate|重复/i],
  ['missing source evidence', m=>{m.controls[0].sourceFiles=['missing.js'];}, /source|来源/i],
  ['missing entry', m=>{m.controls[0].entry='absent.html';}, /entry|入口/i],
  ['incomplete prompt', m=>{delete m.controls[0].description.visual;}, /description|描述/i],
]) test('rejects '+name+' before registering assets', async()=>{
  const {distillWebsite} = await import('../dist/website/distill-website.js');
  const {root,capture,manifest} = await fixture();
  mutate(manifest);
  await writeFile(join(capture,'website-capture.json'),JSON.stringify(manifest));
  await assert.rejects(distillWebsite(capture,{assetLibraryRoot:join(root,'library')}),pattern);
  await assert.rejects(readFile(join(root,'library','index.json')), {code:'ENOENT'});
});
test('previews valid source HTML with omitted head without modifying its original bytes', async()=>{
  const {distillWebsite}=await import('../dist/website/distill-website.js');
  const {buildComponentPreviewStaticBundle}=await import('../dist/preview/component-preview-runtime.js');
  const {root,capture,manifest}=await fixture();
  const html='<!doctype html><button id="demo">OFF</button>';
  await writeFile(join(capture,'button.html'),html);
  manifest.files[0].sha256=hash(html);
  await writeFile(join(capture,'website-capture.json'),JSON.stringify(manifest));
  const result=await distillWebsite(capture,{assetLibraryRoot:join(root,'library')});
  const registry=JSON.parse(await readFile(join(result.outputDir,'component-previews.json')));
  const preview=registry.previews[0];
  await buildComponentPreviewStaticBundle(result.projectRoot,{assetDir:result.outputDir,component:preview.id});
  assert.equal(await readFile(join(result.projectRoot,preview.snapshotDigest,'button.html'),'utf8'),html);
});
