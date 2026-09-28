import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createEmptyAssetPackage } from '../schema/asset-package.js';
import { assetPackageDirectoryFor, registerAssetPackage, resolveAssetLibraryRoot } from '../library/asset-library.js';
import { writeAssetPackage } from '../writers/asset-writer.js';
import { canonicalSerialize } from '../utils/canonical-json.js';
import { digest, readWebsiteCapture, writeCaptureFiles } from './website-capture.js';

export async function distillWebsite(captureDirectory, options={}) {
  const capture = await readWebsiteCapture(captureDirectory);
  const {manifest,snapshotDigest} = capture;
  const libraryRoot = resolveAssetLibraryRoot(options.assetLibraryRoot);
  const identity = digest(new URL(manifest.url).href).slice(0,16);
  const projectRoot = join(libraryRoot,'website-sources',identity);
  const snapshotRoot = join(projectRoot,snapshotDigest);
  const outputDir = assetPackageDirectoryFor(libraryRoot,projectRoot);
  const generatedAt = new Date().toISOString();
  const builderDigest = digest(await readFile(fileURLToPath(new URL('./website-preview.js',import.meta.url))));
  await writeCaptureFiles(snapshotRoot,capture);
  const assetPackage = createEmptyAssetPackage({sourceProject:manifest.name,projectRoot,generatedAt,framework:'static-website',language:'html',packageManager:'none'});
  const prompts=[];
  const previews=[];
  for (const control of manifest.controls) {
    const id = 'website-'+identity+'-'+control.id;
    const actionDigest = digest(canonicalSerialize({runtime:'static-website',snapshotDigest,builderDigest,id}));
    const filePath = snapshotDigest+"/"+control.entry;
    const component = {name:control.name,filePath,componentType:'visual',reusePotential:'high',dependencies:[],props:[],guidance:[control.description.visual],limitations:control.limitations,sourceUrl:manifest.url,sourceFiles:control.sourceFiles.map(path=>snapshotDigest+"/"+path),snapshotRoot};
    assetPackage.components.push(component);
    prompts.push({schemaVersion:'0.2.0',componentName:control.name,filePath,sourceDigest:actionDigest,sourceFiles:control.sourceFiles.map(path=>snapshotDigest+"/"+path),unresolved:control.limitations,prompt:['# '+control.name,'','## 布局',control.description.layout,'','## 视觉',control.description.visual,'','## 动效',control.description.motion,'','## 交互',control.description.interaction].join('\n')});
    previews.push({id,componentName:control.name,componentPath:filePath,runtime:'static-website',status:'degraded',buildable:true,blockers:[],limitations:['runtime-validation-pending'],browserUrl:'/component-preview/'+id+'/',interactions:[control.description.interaction],actionDigest,snapshotDigest,controlId:control.id});
  }
  assetPackage.componentPreviews=previews;
  assetPackage.assetCounts.components=previews.length;
  assetPackage.assetCounts.componentPreviews=previews.length;
  const registry={schemaVersion:'0.1.0',runtime:'static-website',generatedAt,previews};
  await writeAssetPackage(assetPackage,{outputDir,componentPreviewRegistry:registry,componentPrompts:prompts});
  await writeFile(join(outputDir,'website-provenance.json'),JSON.stringify({url:manifest.url,capturedAt:manifest.capturedAt,snapshotDigest,snapshotRoot,controls:manifest.controls},null,2)+'\n');
  const report = await readFile(join(outputDir,'reuse-report.md'),'utf8');
  await writeFile(join(outputDir,'reuse-report.md'),report+'\n## Website Source\n\n- '+manifest.url+'\n- Captured: '+manifest.capturedAt+'\n- 本地原站快照；控件描述由宿主 AI 根据来源编写。挂载成功不代表逐像素保真或交互验证。\n- 未确认原站及媒体再分发许可；复用发布前核对授权。\n'+manifest.controls.flatMap(c=>c.limitations.map(l=>'- '+c.name+'：'+l)).join('\n')+'\n');
  await registerAssetPackage(libraryRoot,{projectRoot,sourceProject:manifest.name,assetPackageDir:outputDir,generatedAt});
  return {outputDir,projectRoot,components:previews.length};
}
