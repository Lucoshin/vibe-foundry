import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveAssetLibraryRoot } from '../library/asset-library.js';
import { loadAssetLibraryViewModel } from './asset-catalog.js';

const schemaVersion = '0.1.0';
const idPattern = /^collection-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const inputFields = ['name', 'description', 'assetIds'];
const recordFields = ['schemaVersion', 'id', ...inputFields, 'createdAt', 'updatedAt'];

function fields(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
    throw new Error('集合参数存在缺失或未知字段。');
  }
}
function collectionId(id) {
  if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('集合标识无效。');
}
function assetIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 1024 || /[\u0000-\u001f\u007f]/.test(id))) {
    throw new Error('请选择 1–100 个精确资产 ID。');
  }
  if (new Set(ids).size !== ids.length) throw new Error('集合资产 ID 不得重复。');
}
function content(value) {
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 160 || /[\u0000-\u001f\u007f]/.test(value.name)) throw new Error('集合名称必须为 1–160 个字符。');
  if (typeof value.description !== 'string' || value.description.length > 4000 || value.description.includes('\0')) throw new Error('集合说明不得超过 4000 个字符。');
  assetIds(value.assetIds);
}
function validateRecord(record, id) {
  fields(record, recordFields);
  collectionId(record.id);
  content(record);
  if (record.schemaVersion !== schemaVersion || record.id !== id) throw new Error('集合协议或文件身份不一致。');
  for (const field of ['createdAt', 'updatedAt']) {
    if (typeof record[field] !== 'string' || !Number.isFinite(Date.parse(record[field])) || new Date(record[field]).toISOString() !== record[field]) throw new Error('集合时间必须为 UTC ISO 格式。');
  }
  if (record.updatedAt < record.createdAt) throw new Error('集合更新时间早于创建时间。');
  return record;
}
async function stat(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function collectionDirectory(libraryRoot, create = false) {
  const root = resolveAssetLibraryRoot(libraryRoot);
  if (create) await mkdir(root, { recursive: true });
  if (!await stat(root)) return null;
  const directory = join(await realpath(root), 'collections');
  if (create) {
    try { await mkdir(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const info = await stat(directory);
  if (!info) return null;
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('集合目录不能为链接或非目录。');
  return directory;
}
async function readRecord(libraryRoot, id) {
  collectionId(id);
  const directory = await collectionDirectory(libraryRoot);
  const path = directory && join(directory, id + '.json');
  const info = path && await stat(path);
  if (!info) throw Object.assign(new Error('集合不存在。'), { code: 'ENOENT' });
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('集合文件不能为链接或非普通文件。');
  return validateRecord(JSON.parse(await readFile(path, 'utf8')), id);
}
function modelErrors(model) {
  return [...(model.isError ? [{ message: model.message }] : []), ...model.errors];
}
function assetSummary(model, asset) {
  return { id: asset.id, name: asset.name, kind: asset.kind, sourceId: asset.sourceId, sourceKind: asset.sourceKind,
    sourceName: model.sources.find(source => source.id === asset.sourceId)?.name ?? asset.project,
    ...(asset.revision ? { revision: asset.revision } : {}) };
}
function member(model, id) {
  const matches = model.assets.filter(asset => asset.id === id);
  const asset = matches.length === 1 ? matches[0] : null;
  if (!asset || model.errors.some(error => error.sourceId === asset.sourceId && (error.revision === undefined || error.revision === asset.revision))) {
    return { assetId: id, status: matches.length > 1 ? 'ambiguous' : 'missing', asset: null };
  }
  return { assetId: id, status: 'available', asset: assetSummary(model, asset) };
}

export async function listCollectionAssets(libraryRoot) {
  const model = await loadAssetLibraryViewModel(libraryRoot, { runtimePreviewState: false });
  return { assets: model.assets.map(asset => assetSummary(model, asset)), errors: modelErrors(model) };
}

export async function saveKnowledgeCollection(libraryRoot, input) {
  fields(input, inputFields, ['id']);
  content(input);
  if (Object.hasOwn(input, 'id')) collectionId(input.id);
  const model = await loadAssetLibraryViewModel(libraryRoot, { runtimePreviewState: false });
  if (model.isError) throw new Error(model.message);
  for (const id of input.assetIds) {
    if (member(model, id).status !== 'available') throw new Error(`资产 ID 未找到、无法读取或不唯一：${id}`);
  }
  const previous = Object.hasOwn(input, 'id') ? await readRecord(libraryRoot, input.id) : null;
  const now = new Date().toISOString();
  const record = { schemaVersion, id: previous?.id ?? `collection-${randomUUID()}`, name: input.name.trim(), description: input.description,
    assetIds: [...input.assetIds], createdAt: previous?.createdAt ?? now, updatedAt: now };
  const directory = await collectionDirectory(libraryRoot, true);
  const pending = join(directory, `.pending-${randomUUID()}`);
  await writeFile(pending, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  try { await rename(pending, join(directory, record.id + '.json')); }
  finally { if (await stat(pending)) await unlink(pending); }
  return record;
}

export async function listKnowledgeCollections(libraryRoot) {
  const directory = await collectionDirectory(libraryRoot);
  if (!directory) return { collections: [], errors: [] };
  const collections = [];
  const errors = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (/^\.pending-[a-f0-9-]{36}$/.test(entry.name)) continue;
    const id = entry.name.replace(/\.json$/, '');
    try {
      if (entry.name !== id + '.json') throw new Error('集合目录包含未知文件。');
      collections.push(await readRecord(libraryRoot, id));
    } catch (error) { errors.push({ id, message: error.message }); }
  }
  collections.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return { collections, errors };
}

export async function getKnowledgeCollection(libraryRoot, id) {
  const record = await readRecord(libraryRoot, id);
  const model = await loadAssetLibraryViewModel(libraryRoot, { runtimePreviewState: false });
  return { ...record, members: record.assetIds.map(assetId => member(model, assetId)), errors: modelErrors(model) };
}

export async function exploreAssetRelations(libraryRoot, input) {
  fields(input, ['assetIds']);
  assetIds(input.assetIds);
  const model = await loadAssetLibraryViewModel(libraryRoot, { runtimePreviewState: false });
  const selected = input.assetIds.map(id => member(model, id));
  const relations = new Map();
  for (const selectedMember of selected) {
    if (selectedMember.status !== 'available') continue;
    const asset = model.assets.find(item => item.id === selectedMember.assetId);
    const book = asset.sourceKind === 'book';
    if (!book && !asset.id.startsWith('learning:')) continue;
    for (const edge of asset.relations) {
      const id = book ? 'book-relation:' + createHash('sha256').update(JSON.stringify([asset.sourceId, asset.revision, edge.id])).digest('hex') : edge.id;
      if (relations.has(id)) continue;
      const endpoint = reference => {
        const matches = model.assets.filter(item => book ? item.sourceId === asset.sourceId && item.raw.id === reference : item.id === reference);
        const target = matches.length === 1 ? matches[0] : null;
        const status = target ? member(model, target.id).status : matches.length > 1 ? 'ambiguous' : 'missing';
        return { reference, assetId: target?.id ?? (book ? null : reference), name: status === 'available' ? target.name : null, status };
      };
      const from = endpoint(edge.from);
      const to = endpoint(edge.to);
      relations.set(id, { id, localId: book ? edge.id : edge.localId, sourceId: asset.sourceId, sourceKind: asset.sourceKind,
        sourceName: model.sources.find(source => source.id === asset.sourceId)?.name ?? asset.project,
        revision: asset.revision, type: edge.type, description: edge.description, basis: edge.basis, evidence: edge.evidence,
        from, to, status: from.status === 'available' && to.status === 'available' ? 'resolved' : 'broken' });
    }
  }
  return { schemaVersion, selected, relations: [...relations.values()], errors: modelErrors(model),
    limitations: ['仅展示选中资产已有的一跳书籍/学习关系；同在集合不表示存在语义关系。', '关系证据保留原分析的明示或解释标记，不代表已经验证其结论。'] };
}
