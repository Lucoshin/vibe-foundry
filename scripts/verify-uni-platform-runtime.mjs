import { discoverPreviewRuntimeContext, writeComponentPreviewRuntime, createPreviewBuildProcessSpec } from '../dist/preview/component-preview-runtime.js';
import { createSafeProcessEnvironment } from '../dist/utils/process-environment.js';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const [projectRoot,assetDir]=process.argv.slice(2);
if(!projectRoot || !assetDir) throw new Error('Usage: node scripts/verify-uni-platform-runtime.mjs <project-root> <asset-directory>');
const output=resolve('output/uni-platform-validation');
await mkdir(output,{recursive:true});
const runtimeContext=await discoverPreviewRuntimeContext(projectRoot);
const registry=JSON.parse(await readFile(join(assetDir,'component-previews.json'),'utf8'));
const results=[];
for(const component of ['AppImageUploader','CustomerFeedbackPanel']) {
 const selected=registry.previews.find(item=>item.componentName===component);
 const previewRoot=join(output,component);
 await writeComponentPreviewRuntime(projectRoot,registry,{previewRoot,previewId:selected.id,runtimeContext});
 const spec=createPreviewBuildProcessSpec('dist');
 const result=spawnSync(spec.command,spec.args,{cwd:previewRoot,encoding:'utf8',env:{...createSafeProcessEnvironment(),VIBEHUB_PREVIEW_BASE:'/'}});
 await writeFile(join(output,component+'.log'),result.stdout+'\n'+result.stderr);
 results.push({component,status:result.status,id:selected.id,previewRoot});
}
await writeFile(join(output,'evidence.json'),JSON.stringify({runtimeDefinition:runtimeContext.uniPlatformDefine,results},null,2));
console.log(JSON.stringify(results));
