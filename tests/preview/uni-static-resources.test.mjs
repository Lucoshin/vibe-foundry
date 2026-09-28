import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectUniStaticResources,writeUniStaticResources} from '../../dist/preview/uni-static-resources.js';
import {buildComponentPrompts} from '../../dist/analyzers/component-prompt.js';
import {createPreviewActionSpec,previewActionDigest} from '../../dist/preview/preview-action.js';

test('uni static resources follow exact source references and imports, carry bytes, and reject stale artifacts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'uni-static-'));
 try {
  await mkdir(join(root,'src/static'),{recursive:true});
  for(const name of ['phone.svg','wechat.svg','unused.svg']) await writeFile(join(root,'src/static',name),'<svg>'+name+'</svg>');
  const index={files:[{filePath:'src/pages/test.vue',sourceText:'<template><image src="/static/phone.svg" /></template>',dependencies:[{resolvedFilePath:'src/components/card.vue'}]},{filePath:'src/components/card.vue',sourceText:'<template><image :src="`/static/${id}.svg`" /></template><style>.a{background:url("/static/wechat.svg")}</style>',dependencies:[]}]};
  const result=await collectUniStaticResources(root,{filePath:'src/pages/test.vue'},index);
  const component={name:'Test',filePath:'src/pages/test.vue',staticResources:result.resources};
  const [prompt]=await buildComponentPrompts(root,[component],{sourceIndex:index});
  assert.ok(prompt.sourceFiles.includes('src/static/phone.svg'));
  assert.ok(!prompt.unresolved.some(item=>item.includes('未解析资源路径')&&item.includes('phone.svg')));
  const action=resources=>previewActionDigest(createPreviewActionSpec({component:{...component,staticResources:resources},builderDigest:'test',toolchain:{},platform:{},buildOptions:{},declaredEnvironmentDigest:'test'}));
  assert.deepEqual(result.resources.map(item=>item.publicPath),['static/phone.svg','static/wechat.svg']);
  assert.match(result.limitations[0],/动态静态资源路径未解析/);
  const output=join(root,'preview');await writeUniStaticResources(root,output,result.resources);
  assert.equal(await readFile(join(output,'public/static/phone.svg'),'utf8'),'<svg>phone.svg</svg>');
  await assert.rejects(readFile(join(output,'public/static/unused.svg')), {code:'ENOENT'});
  await writeFile(join(root,'src/static/phone.svg'),'<svg>changed</svg>');
  await assert.rejects(writeUniStaticResources(root,output,result.resources),/已变化/);
  const updated=await collectUniStaticResources(root,{filePath:'src/pages/test.vue'},index);
  assert.notEqual(updated.resources[0].sha256,result.resources[0].sha256);
  const [changedPrompt]=await buildComponentPrompts(root,[{...component,staticResources:updated.resources}],{sourceIndex:index});
  assert.notEqual(changedPrompt.sourceDigest,prompt.sourceDigest);
  assert.notEqual(action(result.resources),action(updated.resources));
  await assert.rejects(writeUniStaticResources(root,output,[{publicPath:'static/../escape.svg',filePath:'src/static/../escape.svg'}]),/无效/);
 } finally {await rm(root,{recursive:true,force:true});}
});
