import { createHash,randomUUID } from 'node:crypto';
import { link,lstat,mkdir,readFile,readdir,realpath,unlink,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveAssetLibraryRoot } from '../library/asset-library.js';
import { canonicalSerialize } from '../utils/canonical-json.js';
import { loadAssetLibraryViewModel } from '../application/asset-catalog.js';
import { promptFields,validatePromptContent,renderPromptTemplate } from './template.js';

const contentKeys=['title','description','targetModel','template','variables','sourceAssetIds'];
const idPattern=/^prompt-[a-f0-9]{64}$/;
const revisionPattern=/^[a-f0-9]{64}$/;
const hash=value=>createHash('sha256').update(canonicalSerialize(value)).digest('hex');
const contentOf=value=>Object.fromEntries(contentKeys.map(key=>[key,value[key]]));
function identifiers(id,revision) {
  if(typeof id!=='string'||!idPattern.test(id)||typeof revision!=='string'||!revisionPattern.test(revision)) throw new Error('提示词标识或版本摘要无效。');
}
async function stat(path) {try{return await lstat(path);}catch(error){if(error.code==='ENOENT') return null;throw error;}}
async function directory(libraryRoot,parts=[],create=false) {
  const root=resolveAssetLibraryRoot(libraryRoot);
  if(create) await mkdir(root,{recursive:true});
  if(!await stat(root)) return null;
  let path=await realpath(root);
  for(const part of ['prompts',...parts]) {
    path=join(path,part);
    if(create) {try{await mkdir(path);}catch(error){if(error.code!=='EEXIST') throw error;}}
    const info=await stat(path);
    if(!info) return null;
    if(!info.isDirectory()||info.isSymbolicLink()) throw new Error('提示词目录必须为普通目录，不能为链接。');
  }
  return path;
}
async function readRecord(parent,id,revision) {
  const path=join(parent,revision+'.json'),info=await stat(path);
  if(!info) throw Object.assign(new Error('提示词版本不存在。'),{code:'ENOENT'});
  if(!info.isFile()||info.isSymbolicLink()) throw new Error('提示词快照必须为普通文件，不能为链接。');
  const record=JSON.parse(await readFile(path,'utf8'));
  promptFields(record,['schemaVersion','id','revision','parentRevision','createdAt','verification',...contentKeys]);
  validatePromptContent(contentOf(record));
  if(record.schemaVersion!=='0.1.0'||record.id!==id||record.revision!==revision||record.verification!=='unverified'
    ||typeof record.createdAt!=='string'||!Number.isFinite(Date.parse(record.createdAt))) throw new Error('提示词快照协议或身份无效。');
  if(record.parentRevision!==null&&!revisionPattern.test(record.parentRevision)) throw new Error('提示词父版本摘要无效。');
  if(hash({content:contentOf(record),parentRevision:record.parentRevision})!==revision
    ||record.parentRevision===null&&id!=='prompt-'+hash(contentOf(record))) throw new Error('提示词版本摘要不匹配。');
  return record;
}
async function publish(parent,record) {
  const target=join(parent,record.revision+'.json');
  if(await stat(target)) return;
  const pending=join(parent,`.pending-${randomUUID()}`);
  try {
    await writeFile(pending,canonicalSerialize(record),{flag:'wx'});
    try{await link(pending,target);}catch(error){if(error.code!=='EEXIST') throw error;}
  } finally {await unlink(pending);}
}
export async function getPrompt(libraryRoot,id,revision) {
  identifiers(id,revision);
  const parent=await directory(libraryRoot,[id]);
  if(!parent) throw Object.assign(new Error('提示词不存在。'),{code:'ENOENT'});
  return readRecord(parent,id,revision);
}
export async function savePrompt(libraryRoot,input) {
  promptFields(input,contentKeys,['id','baseRevision']);
  if(Object.hasOwn(input,'id')!==Object.hasOwn(input,'baseRevision')) throw new Error('提示词修订必须同时提供 id 与 baseRevision。');
  const content=contentOf(input);validatePromptContent(content);
  const detached=JSON.parse(canonicalSerialize(content));
  if(detached.sourceAssetIds.length) {
    const catalog=await loadAssetLibraryViewModel(libraryRoot,{runtimePreviewState:false});
    if(catalog.isError) throw new Error(catalog.message);
    const existing=new Set(catalog.assets.map(asset=>asset.id));
    if(detached.sourceAssetIds.some(id=>!existing.has(id))) throw new Error('提示词来源资产不存在或不可读取，请使用精确全局 ID。');
  }
  let parentRevision=null,id='prompt-'+hash(detached);
  if(Object.hasOwn(input,'id')) {
    const base=await getPrompt(libraryRoot,input.id,input.baseRevision);
    if(canonicalSerialize(contentOf(base))===canonicalSerialize(detached)) return base;
    id=base.id;parentRevision=base.revision;
  }
  const revision=hash({content:detached,parentRevision});
  const record={schemaVersion:'0.1.0',id,revision,parentRevision,createdAt:new Date().toISOString(),verification:'unverified',...detached};
  const parent=await directory(libraryRoot,[id],true);
  await publish(parent,record);
  return getPrompt(libraryRoot,id,revision);
}
export async function listPrompts(libraryRoot) {
  const result={prompts:[],errors:[]};
  let parent;
  try {parent=await directory(libraryRoot);}catch(error){result.errors.push({message:error.message});return result;}
  if(!parent) return result;
  for(const entry of (await readdir(parent,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    try {
      if(!idPattern.test(entry.name)||!entry.isDirectory()||entry.isSymbolicLink()) throw new Error('提示词目录标识无效或是链接。');
      const path=await directory(libraryRoot,[entry.name]);
      for(const version of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
        if(/^\.pending-[a-f0-9-]{36}$/.test(version.name)) continue;
        const revision=version.name.replace(/\.json$/,'');
        try {
          if(version.name!==revision+'.json'||!revisionPattern.test(revision)||!version.isFile()||version.isSymbolicLink()) throw new Error('提示词版本文件无效或是链接。');
          result.prompts.push(await readRecord(path,entry.name,revision));
        }catch(error){result.errors.push({id:entry.name,revision,message:error.message});}
      }
    }catch(error){result.errors.push({id:entry.name,message:error.message});}
  }
  result.prompts.sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id)||a.createdAt.localeCompare(b.createdAt)||a.revision.localeCompare(b.revision));
  return result;
}
export async function renderPrompt(libraryRoot,input) {
  promptFields(input,['id','revision','values']);
  const record=await getPrompt(libraryRoot,input.id,input.revision);
  return {id:record.id,revision:record.revision,title:record.title,targetModel:record.targetModel,sourceAssetIds:record.sourceAssetIds,
    text:renderPromptTemplate(contentOf(record),input.values),verification:'unverified'};
}
