import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createWebRequestHandler } from '../../dist/web/server.js';

test('local import HTTP requires the page token and rejects foreign origins before browsing', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vibe-import-http-'));
  const server = createServer(createWebRequestHandler(undefined, { assetLibraryRoot: root }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const html = await fetch(url).then(response => response.text());
  const token = html.match(/name="vibe-import-token" content="([a-f0-9-]+)"/)?.[1];
  assert.ok(token);
  const headers = { 'content-type': 'application/json', 'x-vibe-import-token': token };
  const browse = options => fetch(url + '/api/import/browse', { method: 'POST', body: JSON.stringify({ path: root }), ...options });
  assert.equal((await browse({ headers: { 'content-type': 'application/json' } })).status, 403);
  assert.equal((await browse({ headers: { ...headers, origin: 'https://foreign.example' } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const call = request(url + '/api/import/browse', { method: 'POST', headers: { ...headers, host: 'foreign.example:80' } }, response => { response.resume(); resolve(response.statusCode); });
    call.on('error', reject);
    call.end(JSON.stringify({ path: root }));
  });
  assert.equal(foreignHostStatus, 403);
  const listing = await browse({ headers });
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).path, await realpath(root));
  assert.equal(await fetch(url + '/api/import/status', { headers }).then(response => response.json()), null);
  assert.equal((await fetch(url + '/api/import/start', { method: 'POST', headers, body: '{bad' })).status, 400);
  assert.equal((await fetch(url + '/api/import/result/assets', { headers })).status, 400);
});
