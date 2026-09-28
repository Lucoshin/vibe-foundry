import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {resolveAssetLibraryRoot} from '../dist/library/asset-library.js';
import {loadAssetLibraryViewModel} from '../dist/application/asset-catalog.js';
import {isEmptyComponentShell,isIconPrimitive} from '../dist/analyzers/component-selection.js';
import {getRecipe} from '../dist/learning/recipes.js';

const libraryRoot=resolveAssetLibraryRoot(process.argv[2]);
const output=resolve('output/component-selection-audit');
const recipe=await getRecipe(libraryRoot,process.argv[3]??'component-distillation');
assert.deepEqual(recipe.sourceKinds,['project']);
const index=JSON.parse(await readFile(join(libraryRoot,'index.json'),'utf8'));
const model=await loadAssetLibraryViewModel(libraryRoot,{runtimePreviewState:false});
assert.equal(model.isError,false);assert.deepEqual(model.errors,[]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const excluded=[],retainedIcons=[],sources=new Map();
for(const asset of model.assets.filter(asset=>asset.kind==='component')){
 const project=index.projects.find(project=>project.assetPackageDir===asset.assetPackageDir);
 assert.ok(project,asset.id);
 const path=join(project.projectRoot,asset.raw.filePath);
 const bytes=await readFile(path);sources.set(path,hash(bytes));
 const source=bytes.toString('utf8');
 const reason=recipe.componentRules.emptyShells==='exclude'&&isEmptyComponentShell(asset.raw.filePath,source)?'empty-slot-shell':recipe.componentRules.iconPrimitives==='exclude'&&isIconPrimitive(asset.raw.filePath,asset.name,source)?'icon-primitive':null;
 const entry={id:asset.id,name:asset.name,project:asset.project,filePath:asset.raw.filePath,sourceDigest:hash(bytes)};
 if(reason)excluded.push({...entry,reason});
 else if(/icon/i.test(asset.name+' '+asset.raw.filePath))retainedIcons.push(entry);
}
for(const [path,digest] of sources)assert.equal(hash(await readFile(path)),digest,'Source changed during audit: '+path);
const evidence={libraryRoot,recipe,componentCount:model.assets.filter(a=>a.kind==='component').length,excluded,retainedIcons,sourceFilesUnchanged:sources.size,scope:'按指定方案只读试算；未修改原库资产或来源'};
await mkdir(output,{recursive:true});await writeFile(join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({components:evidence.componentCount,excluded:excluded.map(({name,project,reason})=>({name,project,reason})),retainedIcons:retainedIcons.map(({name,project})=>({name,project})),sourceFilesUnchanged:sources.size},null,2));
