import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { collectionFixture } from '../application/knowledge-collections-fixture.mjs';

test('collection HTTP API requires local token and roundtrips references, summaries and directed evidence', async t => {
  const { createKnowledgeCollectionsRequestHandler } = await import('../../dist/web/knowledge-collections-api.js');
  const { root, model } = await collectionFixture(t);
  const handle = createKnowledgeCollectionsRequestHandler({ libraryRoot: root, token: 'local-page' });
  const call = async (path, method = 'GET', body, token = 'local-page') => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(request, { method, headers: { host: '127.0.0.1:4317', 'content-type': 'application/json', 'x-vibe-import-token': token }, socket: { remoteAddress: '127.0.0.1' } });
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.body = JSON.parse(value); } };
    assert.equal(await handle(request, response, new URL('http://127.0.0.1:4317/api/knowledge-collections' + path)), true);
    return response;
  };
  assert.equal((await call('', 'GET', undefined, 'wrong')).statusCode, 403);
  const assets = await call('/assets');
  assert.equal(assets.body.assets.length, model.assets.length);
  assert.equal(assets.body.assets.some(item => Object.hasOwn(item, 'raw')), false);
  const assetIds = [model.assets[0].id];
  const saved = await call('', 'POST', { name: 'HTTP 集合', description: '', assetIds });
  assert.equal(saved.statusCode, 201);
  const detail = await call('/item?id=' + saved.body.id);
  assert.equal(detail.body.members[0].assetId, assetIds[0]);
  assert.equal((await call('/relations?assetId=' + encodeURIComponent(assetIds[0]))).body.relations.length, 1);
  const postedRelations = await call('/relations', 'POST', { assetIds });
  assert.equal(postedRelations.statusCode, 200);
  assert.equal(postedRelations.body.relations.length, 1);
  assert.equal((await call('')).body.collections.length, 1);
  assert.equal(detail.headers['cache-control'], 'no-store');
  assert.equal((await call('/item?id=../bad')).statusCode, 400);
  assert.equal((await call('/missing')).statusCode, 404);
  assert.equal((await call('', 'DELETE')).statusCode, 405);
  assert.equal((await call('', 'POST', { name: 'bad', description: '', assetIds, raw: {} })).statusCode, 400);
});
