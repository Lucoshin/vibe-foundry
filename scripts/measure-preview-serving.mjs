import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { assetPackageDirectoryFor, registerAssetPackage } from '../dist/library/asset-library.js';
import { openPreviewBuildCache } from '../dist/preview/preview-build-cache.js';
import { createWebRequestHandler } from '../dist/web/server.js';

// Isolated synthetic cached bundles: measures serving, not framework compilation.
const root = await mkdtemp(join(tmpdir(), 'vibehub-preview-speed-'));
const libraryRoot = join(root, 'library');
const digest = 'a'.repeat(64);
const count = 24;
try {
  for (let project = 0; project < 8; project += 1) {
    const projectRoot = join(root, `project-${project}`);
    const assetDir = assetPackageDirectoryFor(libraryRoot, projectRoot);
    await mkdir(assetDir, { recursive: true });
    await writeFile(join(assetDir, 'component-previews.json'), JSON.stringify({ runtime: 'vite-react', previews: Array.from({ length: 150 }, (_, i) => ({ id: `component-${project}-${i}`, actionDigest: digest })) }));
    await registerAssetPackage(libraryRoot, { projectRoot, assetPackageDir: assetDir, sourceProject: `project-${project}`, generatedAt: new Date().toISOString() });
    if (project !== 0) continue;
    const outputDir = join(root, 'bundle');
    await mkdir(join(outputDir, 'assets'), { recursive: true });
    await writeFile(join(outputDir, 'index.html'), '<title>Benchmark</title>');
    await writeFile(join(outputDir, 'preview-manifest.json'), JSON.stringify({ componentId: 'component-0-0', actionDigest: digest }));
    for (let i = 0; i < count; i += 1) await writeFile(join(outputDir, 'assets', `${i}.js`), `${i};${' '.repeat(256 * 1024)}`);
    const cache = openPreviewBuildCache(assetDir);
    try {
      cache.claim(digest, 'benchmark', { now: 100, ttlMs: 100 });
      await cache.commitSuccess({ actionDigest: digest, leaseOwner: 'benchmark', outputDir, completedAt: 101 });
    } finally { cache.close(); }
  }
  const handler = createWebRequestHandler(undefined, { assetLibraryRoot: libraryRoot });
  const rounds = [];
  for (let round = 0; round < 4; round += 1) {
    const started = performance.now();
    for (let i = 0; i < count; i += 1) {
      const response = { statusCode: 200, setHeader() {}, end(body) { assert.equal(this.statusCode, 200); assert.ok(body.length > 256 * 1024); } };
      await handler({ method: 'GET', url: `/component-preview/component-0-0/${digest}/assets/${i}.js` }, response);
    }
    rounds.push(Math.round(performance.now() - started));
  }
  console.log(JSON.stringify({ projects: 8, previews: 1200, resources: count, bundleMiB: 6, roundsMs: rounds }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
