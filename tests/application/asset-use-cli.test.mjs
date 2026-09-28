import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCli } from '../../dist/cli.js';
import { png } from '../images/fixtures.mjs';

test('image CLI imports an explicit analysis and exports exactly that version in task context', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vibehub-image-cli-'));
  const previousRoot = process.env.VIBEHUB_LIBRARY_ROOT;
  process.env.VIBEHUB_LIBRARY_ROOT = join(root, 'library');
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.VIBEHUB_LIBRARY_ROOT; else process.env.VIBEHUB_LIBRARY_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  });
  async function cli(...args) {
    let output = '';
    const result = await runCli(['node', 'cli', ...args], { stdout: { write: value => { output += value; } }, stderr: { write() {} } });
    assert.equal(result.exitCode, 0);
    return JSON.parse(output);
  }
  const bytes = png(1, 1);
  const imagePath = join(root, 'sample.png');
  await writeFile(imagePath, bytes);
  const metadata = await cli('image', 'inspect', imagePath);
  assert.equal(metadata.digest, createHash('sha256').update(bytes).digest('hex'));
  const analysis = {
    schemaVersion: '0.1.0', sourceDigest: metadata.digest, title: '单像素测试样本', description: '仅用于协议验证的图片样本。',
    observations: [{ aspect: 'composition', text: '画面为单像素。', evidence: { scope: 'whole-image' } }],
    inferences: [], prompts: [{ targetModel: 'generic', prompt: '创建一张单像素测试图片。', verification: 'unverified' }], tags: ['测试'],
  };
  const analysisPath = join(root, 'analysis.json');
  await writeFile(analysisPath, JSON.stringify(analysis));
  const asset = await cli('image', 'import', imagePath, analysisPath);
  assert.equal(asset.kind, 'image-knowledge');
  assert.deepEqual(await cli('image', 'import', imagePath, analysisPath), asset);
  const selectionPath = join(root, 'context.json');
  await writeFile(selectionPath, JSON.stringify({ goal: '核对图片专业链路', assetIds: [asset.id] }));
  const context = await cli('context', selectionPath);
  assert.equal(context.status, 'proposed');
  assert.equal(context.assets[0].id, asset.id);
  assert.equal(context.assets[0].revision, asset.revision);
  assert.match(context.markdown, /核对图片专业链路/);
  for (const args of [['image'], ['image', 'unknown'], ['image', 'inspect'], ['image', 'inspect', imagePath, 'extra'], ['image', 'import', imagePath], ['context'], ['context', selectionPath, 'extra']]) {
    await assert.rejects(runCli(['node', 'cli', ...args]), /参数|命令/);
  }
});
