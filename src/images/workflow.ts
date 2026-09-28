import { createHash,randomUUID } from 'node:crypto';
import { lstat,mkdir,readFile,readdir,realpath,rename,rm,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { canonicalSerialize } from '../utils/canonical-json.js';
import { resolveAssetLibraryRoot } from '../library/asset-library.js';
import { inspectImageBytes } from './image-format.js';
import { fields,imageSchemaVersion,validateImageAnalysis,validateImageDigest } from './analysis.js';

const hash=value=>createHash('sha256').update(canonicalSerialize(value)).digest('hex');
const digestPattern=/^[a-f0-9]{64}$/;
async function stat(path) {
  try{return await lstat(path);}catch(error){if(error.code==='ENOENT') return null;throw error;}
}
async function directory(libraryRoot,parts,create=false) {
  const root=resolveAssetLibraryRoot(libraryRoot);
  if(create) await mkdir(root,{recursive:true});
  if(!await stat(root)) return null;
  let current=await realpath(root);
  for(const part of parts) {
    current=join(current,part);
    if(create) {try{await mkdir(current);}catch(error){if(error.code!=='EEXIST') throw error;}}
    const info=await stat(current);
    if(!info) return null;
    if(!info.isDirectory() || info.isSymbolicLink()) throw new Error('图片存储目录必须为普通目录，不能是链接。');
  }
  return current;
}
async function file(path) {
  const info=await lstat(path);
  if(!info.isFile() || info.isSymbolicLink()) throw new Error('图片存储文件必须为普通文件，不能是链接。');
  return readFile(path);
}
async function json(path) {return JSON.parse((await file(path)).toString('utf8'));}
async function publish(parent,id,files,childDirectory) {
  const target=join(parent,id);
  if(await stat(target)) return;
  const pending=join(parent,`.pending-${randomUUID()}`);
  await mkdir(pending);
  try {
    for(const [name,bytes] of Object.entries(files)) await writeFile(join(pending,name),bytes,{flag:'wx'});
    if(childDirectory) await mkdir(join(pending,childDirectory));
    try {await rename(pending,target);}catch(error){if(!await stat(target)) throw error;}
  } finally {await rm(pending,{recursive:true,force:true});}
}
async function sourceSnapshot(libraryRoot,sourceDigest) {
  validateImageDigest(sourceDigest);
  const path=await directory(libraryRoot,['images',sourceDigest]);
  if(!path) throw Object.assign(new Error('图片来源不存在。'),{code:'ENOENT'});
  const record=await json(join(path,'source.json'));
  fields(record,['schemaVersion','image'],'source');
  if(record.schemaVersion!==imageSchemaVersion) throw new Error('不支持的图片来源协议。');
  fields(record.image,['digest','format','mimeType','width','height','byteLength'],'source.image');
  if(!['png','jpeg','webp'].includes(record.image.format)) throw new Error('图片来源格式无效。');
  const originalPath=join(path,'original.'+record.image.format);
  const bytes=await file(originalPath);
  const image=inspectImageBytes(bytes);
  if(image.digest!==sourceDigest || canonicalSerialize(image)!==canonicalSerialize(record.image)) throw new Error('图片来源摘要或元数据不匹配。');
  return {path,originalPath,image,bytes};
}
function assetView(analysis,image,revision,path) {
  return {
    id:`image:${image.digest}:${revision}`,revision,kind:'image-knowledge',category:'images',
    name:analysis.title,description:analysis.description,source:'original.'+image.format,project:analysis.title,
    sourceId:'image:'+image.digest,sourceKind:'image',language:null,languageLabel:'',labels:analysis.tags,
    assetPackageDir:path,evidence:analysis.observations.map(observation=>({sourceDigest:image.digest,...observation.evidence})),
    raw:{...analysis,image},
  };
}
async function readVersion(libraryRoot,image,revision) {
  validateImageDigest(revision);
  const path=await directory(libraryRoot,['images',image.digest,'versions',revision]);
  if(!path) throw new Error('图片分析版本不存在。');
  const analysis=await json(join(path,'analysis.json'));
  validateImageAnalysis(analysis,image);
  if(hash(analysis)!==revision) throw new Error('图片分析版本摘要不匹配。');
  return assetView(analysis,image,revision,path);
}
export async function inspectImage(imagePath) {
  return inspectImageBytes(await file(resolve(imagePath)));
}
export async function importImageAnalysis(libraryRoot,input) {
  fields(input,['imagePath','analysis'],'import');
  const bytes=await file(resolve(input.imagePath)),image=inspectImageBytes(bytes);
  validateImageAnalysis(input.analysis,image);
  const analysis=JSON.parse(canonicalSerialize(input.analysis)),revision=hash(analysis);
  const parent=await directory(libraryRoot,['images'],true);
  await publish(parent,image.digest,{'source.json':canonicalSerialize({schemaVersion:imageSchemaVersion,image}),['original.'+image.format]:bytes},'versions');
  await sourceSnapshot(libraryRoot,image.digest);
  const versions=await directory(libraryRoot,['images',image.digest,'versions']);
  if(!versions) throw new Error('图片来源缺少版本目录。');
  await publish(versions,revision,{'analysis.json':canonicalSerialize(analysis)});
  return readVersion(libraryRoot,image,revision);
}
export async function readImageFile(libraryRoot,sourceDigest) {
  const {bytes,image}=await sourceSnapshot(libraryRoot,sourceDigest);
  return {bytes,mimeType:image.mimeType};
}
export async function reviseImageAnalysis(libraryRoot,input) {
  fields(input,['assetId','analysis'],'revision');
  if(typeof input.assetId!=='string'||!/^image:[a-f0-9]{64}:[a-f0-9]{64}$/.test(input.assetId)) throw new Error('图片修订必须引用精确资产版本 ID。');
  const [,sourceDigest,baseRevision]=input.assetId.split(':');
  const {image}=await sourceSnapshot(libraryRoot,sourceDigest);
  await readVersion(libraryRoot,image,baseRevision);
  validateImageAnalysis(input.analysis,image);
  const analysis=JSON.parse(canonicalSerialize(input.analysis)),revision=hash(analysis);
  const versions=await directory(libraryRoot,['images',sourceDigest,'versions']);
  await publish(versions,revision,{'analysis.json':canonicalSerialize(analysis)});
  return readVersion(libraryRoot,image,revision);
}
export async function loadImageLibraryAssets(libraryRoot) {
  const result={assets:[],sources:[],errors:[]};
  let parent;
  try{parent=await directory(libraryRoot,['images']);}
  catch(error){result.errors.push({sourceId:'images',message:error.message});return result;}
  if(!parent) return result;
  const entries=await readdir(parent,{withFileTypes:true});
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    if(/^\.pending-[a-f0-9-]{36}$/.test(entry.name)) continue;
    const sourceId='image:'+entry.name;
    try {
      if(!digestPattern.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) throw new Error('图片来源目录身份无效或是链接。');
      const {originalPath,image}=await sourceSnapshot(libraryRoot,entry.name);
      const versions=await directory(libraryRoot,['images',entry.name,'versions']);
      if(!versions) throw new Error('图片来源缺少版本目录。');
      const sourceAssets=[];
      for(const version of (await readdir(versions,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
        if(/^\.pending-[a-f0-9-]{36}$/.test(version.name)) continue;
        try {
          if(!digestPattern.test(version.name) || !version.isDirectory() || version.isSymbolicLink()) throw new Error('图片分析版本目录无效或是链接。');
          sourceAssets.push(await readVersion(libraryRoot,image,version.name));
        } catch(error){result.errors.push({sourceId,revision:version.name,message:error.message});}
      }
      result.assets.push(...sourceAssets);
      result.sources.push({id:sourceId,kind:'image',name:'图片 '+image.digest.slice(0,12),path:originalPath,status:sourceAssets.length?'knowledge':'prepared',assetCount:sourceAssets.length});
    } catch(error){result.errors.push({sourceId,message:error.message});}
  }
  return result;
}
