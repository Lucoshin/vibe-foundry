import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createLocalImport } from '../../dist/web/local-import.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-local-import-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '项目'));
  await writeFile(join(root, '资料.md'), '# 第一章\n英雄踏上旅程，面对命运。');
  await writeFile(join(root, 'unsupported.zip'), 'not a document');
  return root;
}

async function completed(service) {
  const deadline = Date.now() + 15000;
  while (service.status()?.state === 'running' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.notEqual(service.status()?.state, 'running');
  return service.status();
}

test('local picker lists real directories and supported documents with original paths', async t => {
  const root = await fixture(t);
  const service = createLocalImport({ libraryRoot: join(root, 'library'), initialDirectory: root });
  const listing = await service.browse(root);
  assert.equal(listing.path, await import('node:fs/promises').then(fs => fs.realpath(root)));
  assert.deepEqual(listing.entries.map(entry => entry.name), ['项目', '资料.md']);
  assert.equal(listing.entries[1].path, join(listing.path, '资料.md'));
  await assert.rejects(service.browse(join(root, 'absent')));
  await assert.rejects(service.start(join(root, 'unsupported.zip')), /支持/);
});

test('document import runs real analysis, preserves source and delivers fixed result files', async t => {
  const root = await fixture(t);
  const service = createLocalImport({ libraryRoot: join(root, 'library') });
  const path = join(root, '资料.md');
  const before = await readFile(path, 'utf8');
  await service.start(path);
  const result = await completed(service);
  assert.equal(result.state, 'succeeded', result.message);
  assert.equal(result.kind, 'document');
  assert.match(await service.result('report'), /Chapters/);
  assert.equal(JSON.parse(await service.result('assets')).sourcePath, path);
  await assert.rejects(service.result('../../secret'), /结果/);
  assert.equal(await readFile(path, 'utf8'), before);
});

test('serializes starts including path validation and allows retry after worker failure', async t => {
  const root = await fixture(t);
  const service = createLocalImport({ libraryRoot: join(root, 'library') });
  const starts = await Promise.allSettled([service.start(join(root, '项目')), service.start(join(root, '项目'))]);
  assert.equal(starts.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(starts.find(result => result.status === 'rejected').reason.message, /正在/);
  assert.equal((await completed(service)).state, 'failed');
  await service.start(join(root, '资料.md'));
  assert.equal((await completed(service)).state, 'succeeded');
});

test('project import registers the real project in the configured central library', async t => {
  const root = await fixture(t);
  const libraryRoot = join(root, 'library');
  const service = createLocalImport({ libraryRoot });
  await service.start(resolve('examples/fixture-project'));
  const result = await completed(service);
  assert.equal(result.state, 'succeeded', result.message);
  assert.equal(result.kind, 'project');
  const index = JSON.parse(await readFile(join(libraryRoot, 'index.json'), 'utf8'));
  assert.equal(index.projects[0].projectRoot, resolve('examples/fixture-project'));
  await assert.rejects(service.result('assets'), /文档/);
});
