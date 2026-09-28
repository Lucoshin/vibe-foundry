import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { callVibeHubTool } from '../../dist/mcp/server.js';
import { loadAssetLibraryViewModel } from '../../dist/application/asset-catalog.js';
import { openPreviewActionStore } from '../../dist/preview/preview-action-store.js';
import { browserMountValidatorDigest } from '../../dist/preview/preview-validation.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-mcp-preview-readonly-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const assetDir = join(root, 'package');
  await mkdir(assetDir);
  const files = {
    'asset-manifest.json': { sourceProject: 'readonly-fixture', framework: 'static-website', assetCounts: { components: 1 } },
    'component-catalog.json': { components: [{ name: 'Button', filePath: 'button.html' }] },
    'component-previews.json': { runtime: 'static-website', previews: [{ id: 'button', componentPath: 'button.html', componentName: 'Button', actionDigest: 'a'.repeat(64), status: 'pending', buildable: true }] },
    'service-catalog.json': { services: [], businessPatterns: [] },
    'tokens.json': { tokens: [] },
    'concept-assets.json': { conceptAssets: [], metaphorPacks: [] },
  };
  await Promise.all(Object.entries(files).map(([name, value]) => writeFile(join(assetDir, name), JSON.stringify(value))));
  await writeFile(join(assetDir, 'reuse-report.md'), '真实报告');
  await writeFile(join(assetDir, 'agent-rules.md'), '真实规则');
  await writeFile(join(root, 'index.json'), JSON.stringify({ projects: [{ projectRoot: root, assetPackageDir: assetDir }] }));
  return { root, assetDir, databasePath: join(assetDir, 'preview-state.db') };
}
async function snapshot(directory) {
  const files = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    files[entry.name] = entry.isDirectory() ? await snapshot(path) : createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return files;
}

test('MCP reads registry snapshots without migrating preview caches while Web reads live state', async t => {
  const { root, databasePath } = await fixture(t);
  const writer = openPreviewActionStore(databasePath);
  writer.recordActionSuccess({ actionDigest: 'a'.repeat(64), artifactTreeDigest: 'b'.repeat(64), completedAt: 100 });
  writer.recordValidation({ artifactTreeDigest: 'b'.repeat(64), validatorDigest: browserMountValidatorDigest, state: 'ready', evidenceDigest: 'c'.repeat(64), validatedAt: 200 });
  writer.close();
  const legacy = new Database(databasePath);
  legacy.prepare("UPDATE schema_metadata SET value = '1' WHERE key = 'schema_version'").run();
  legacy.close();
  const before = await snapshot(root);
  const result = await callVibeHubTool(root, 'search_library_assets', {}, { assetLibraryRoot: root });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.previewStateSource, 'registry');
  assert.equal(result.structuredContent.assets[0].componentPreview.status, 'pending');
  const detail = await callVibeHubTool(root, 'get_library_asset', { id: result.structuredContent.assets[0].id }, { assetLibraryRoot: root });
  assert.equal(detail.structuredContent.previewStateSource, 'registry');
  assert.deepEqual(detail.structuredContent.errors, []);
  assert.deepEqual(await snapshot(root), before);
  const web = await loadAssetLibraryViewModel(root);
  assert.equal(web.previewStateSource, 'live');
  assert.equal(web.assets[0].componentPreview.status, 'ready');
});

test('read-only MCP knowledge access does not depend on a valid or accessible runtime database', async t => {
  const { root, databasePath } = await fixture(t);
  await writeFile(databasePath, 'not a SQLite database');
  const before = await snapshot(root);
  const result = await callVibeHubTool(root, 'search_library_assets', {}, { assetLibraryRoot: root });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.assets.length, 1);
  assert.equal(result.structuredContent.previewStateSource, 'registry');
  assert.deepEqual(await snapshot(root), before);
});

test('exact MCP asset lookups retain unreadable source diagnostics instead of silently returning null', async t => {
  const { root } = await fixture(t);
  const bookDir = join(root, 'books', 'damaged-book');
  await mkdir(bookDir, { recursive: true });
  await writeFile(join(bookDir, 'book-assets.json'), '{bad json');
  const result = await callVibeHubTool(root, 'get_library_asset', { id: 'knowledge:previous-id' }, { assetLibraryRoot: root });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.asset, null);
  assert.equal(result.structuredContent.errors[0].sourceId, 'book:damaged-book');
  assert.ok(result.structuredContent.errors[0].message.length);
});
