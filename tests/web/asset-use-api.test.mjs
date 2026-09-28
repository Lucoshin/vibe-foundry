import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createAssetUseRequestHandler } from '../../dist/web/asset-use-api.js';
import { prepareLearning, importLearningAnalysis, listApplications } from '../../dist/learning/workflow.js';
import { inspectImage, importImageAnalysis } from '../../dist/images/workflow.js';
import { png } from '../images/fixtures.mjs';

test('task context API preserves selected evidence without recording an application', async t => {
  const libraryRoot = await mkdtemp(join(tmpdir(), 'vibehub-context-api-'));
  t.after(() => rm(libraryRoot, { recursive: true, force: true }));
  const task = await prepareLearning(libraryRoot, { recipeId: 'general-knowledge', source: {
    schemaVersion: '0.1.0', title: '预览经验', kind: 'text', entries: [{ id: 'measurement', role: 'document', text: '资源读取应避免重复扫描整个产物包。' }],
  } });
  const result = await importLearningAnalysis(libraryRoot, task.id, {
    schemaVersion: '0.1.0', sourceDigest: task.sourceDigest, recipeDigest: task.recipeDigest,
    assets: [{ id: 'reading', type: 'practice', title: '按需读取', summary: '减少资源请求的重复扫描。', tags: ['性能'], basis: 'explicit', evidence: [{ entryId: 'measurement', quote: '资源读取应避免重复扫描整个产物包。' }] }], relations: [],
  });
  const handler = createAssetUseRequestHandler({ libraryRoot, token: 'local-token' });
  async function call(body, token = 'local-token', method = 'POST') {
    const request = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(request, { method, headers: { host: '127.0.0.1:4317', 'content-type': 'application/json', 'x-vibe-import-token': token }, socket: { remoteAddress: '127.0.0.1' } });
    const response = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
    assert.equal(await handler(request, response, new URL('http://127.0.0.1:4317/api/task-context')), true);
    return response;
  }
  const selection = { goal: '优化资源服务', assetIds: [result.assets[0].id] };
  assert.equal((await call(selection, 'foreign')).statusCode, 403);
  assert.equal((await call(selection, 'local-token', 'GET')).statusCode, 405);
  const response = await call(selection);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.status, 'proposed');
  assert.match(response.body.markdown, /优化资源服务/);
  assert.match(response.body.markdown, /资源读取应避免重复扫描整个产物包/);
  assert.deepEqual(await listApplications(libraryRoot), []);
  assert.equal((await call({ ...selection, assetIds: ['missing'] })).statusCode, 400);
  assert.equal((await call({ ...selection, autoApply: true })).statusCode, 400);
});

test('image snapshot endpoint serves only the requested verified original with its actual MIME type', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vibehub-image-api-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = png(1, 1);
  const path = join(root, 'sample.png');
  await writeFile(path, bytes);
  const metadata = await inspectImage(path);
  const libraryRoot = join(root, 'library');
  await importImageAnalysis(libraryRoot, { imagePath: path, analysis: {
    schemaVersion: '0.1.0', sourceDigest: metadata.digest, title: '协议测试', description: '仅用于测试。',
    observations: [{ aspect: 'composition', text: '单像素图片。', evidence: { scope: 'whole-image' } }], inferences: [],
    prompts: [{ targetModel: 'generic', prompt: '单像素图。', verification: 'unverified' }], tags: [],
  } });
  const handler = createAssetUseRequestHandler({ libraryRoot, token: 'page' });
  async function read(digest) {
    const response = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
    await handler({ method: 'GET' }, response, new URL('http://localhost:4317/api/image-snapshots/' + digest));
    return response;
  }
  const response = await read(metadata.digest);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'image/png');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(response.body, bytes);
  assert.equal((await read('not-a-digest')).statusCode, 400);
  assert.equal((await read('b'.repeat(64))).statusCode, 404);
});
