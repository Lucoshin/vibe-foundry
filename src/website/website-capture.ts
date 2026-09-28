import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { canonicalSerialize } from '../utils/canonical-json.js';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function capturePath(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid capture path / 路径');
  return value;
}
function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing '+label);
}
function webUrl(value) {
  const url = new URL(value);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid source URL');
  return url.href;
}
export async function readWebsiteCapture(directory) {
  const root = await realpath(resolve(directory));
  const manifest = JSON.parse(await readFile(join(root,'website-capture.json'),'utf8'));
  if (manifest.schemaVersion !== '0.1.0') throw new Error('Unsupported website capture schema');
  webUrl(manifest.url);
  nonempty(manifest.name,'name');
  if (!Number.isFinite(Date.parse(manifest.capturedAt))) throw new Error('Invalid capturedAt');
  if (!Array.isArray(manifest.files) || !manifest.files.length || !Array.isArray(manifest.controls) || !manifest.controls.length) throw new Error('Website requires files and controls');
  const files = new Map();
  const names = new Set();
  for (const file of manifest.files) {
    capturePath(file.path);
    if (file.path === 'website-capture.json' || names.has(file.path.toLowerCase())) throw new Error('Duplicate or reserved capture path');
    names.add(file.path.toLowerCase());
    if (!['source','adaptation'].includes(file.kind)) throw new Error('Invalid source kind');
    if (file.kind === 'source') webUrl(file.url);
    if (file.kind === 'adaptation' && file.url !== null) throw new Error('Adaptation URL must be null');
    const fullPath = join(root,file.path);
    if (!(await lstat(fullPath)).isFile()) throw new Error('Source must be a regular file');
    const actual = await realpath(fullPath);
    const rel = relative(root,actual);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Source path outside capture');
    const bytes = await readFile(actual);
    if (digest(bytes) !== file.sha256) throw new Error('Source digest mismatch: '+file.path);
    files.set(file.path,bytes);
  }
  const ids = new Set();
  const entries = new Set();
  for (const control of manifest.controls) {
    if (!/^[a-z][a-z0-9-]*$/.test(control.id) || ids.has(control.id)) throw new Error('Invalid or duplicate control id');
    ids.add(control.id);
    nonempty(control.name,'control name');
    capturePath(control.entry);
    if (!control.entry.endsWith('.html') || !files.has(control.entry)) throw new Error('Missing HTML entry');
    if (entries.has(control.entry)) throw new Error("Duplicate control entry");
    entries.add(control.entry);
    nonempty(control.selector,'selector');
    if (!Array.isArray(control.sourceFiles) || !control.sourceFiles.length || control.sourceFiles.some(path => !files.has(path)) || !control.sourceFiles.some(path => manifest.files.find(file => file.path === path)?.kind === 'source')) throw new Error('Missing source evidence');
    for (const key of ['layout','visual','motion','interaction']) nonempty(control.description?.[key],'description.'+key);
    if (!Array.isArray(control.limitations) || control.limitations.some(item => typeof item !== 'string')) throw new Error('Invalid limitations');
  }
  return {manifest,files,snapshotDigest:digest(canonicalSerialize(manifest))};
}
export async function writeCaptureFiles(directory, capture) {
  await mkdir(directory,{recursive:true});
  for (const [path,bytes] of capture.files) {
    await mkdir(dirname(join(directory,path)),{recursive:true});
    await writeFile(join(directory,path),bytes);
  }
  await writeFile(join(directory,'website-capture.json'),JSON.stringify(capture.manifest,null,2)+'\n');
}
