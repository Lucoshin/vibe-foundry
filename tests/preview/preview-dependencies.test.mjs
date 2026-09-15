import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertPreviewDependencies } from '../../dist/preview/preview-dependencies.js';

test('Vue 2.6 requires a matching compiler while Vue 2.7 and Vue 3 need no legacy compiler', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibe-vue-version-'));
  try {
    const vueDir = join(root, 'node_modules', 'vue');
    await mkdir(vueDir, { recursive: true });
    await writeFile(join(vueDir, 'index.js'), '');
    await writeFile(join(vueDir, 'package.json'), JSON.stringify({ name: 'vue', version: '2.6.12', main: 'index.js' }));
    assert.throws(() => assertPreviewDependencies(root, 'vite-vue'), error => {
      assert.equal(error.code, 'PREVIEW_COMPILER_MISSING');
      assert.match(error.message, /Vue 2.6.*vue-template-compiler/);
      return true;
    });
    const compilerDir = join(root, 'node_modules', 'vue-template-compiler');
    await mkdir(compilerDir, { recursive: true });
    await writeFile(join(compilerDir, 'package.json'), JSON.stringify({ version: '2.6.14' }));
    assert.throws(() => assertPreviewDependencies(root, 'vite-vue'), { code: 'PREVIEW_COMPILER_MISMATCH' });
    await writeFile(join(compilerDir, 'package.json'), JSON.stringify({ version: '2.6.12' }));
    assert.doesNotThrow(() => assertPreviewDependencies(root, 'vite-vue'));
    await writeFile(join(vueDir, 'package.json'), JSON.stringify({ name: 'vue', version: '2.7.16', main: 'index.js' }));
    assert.doesNotThrow(() => assertPreviewDependencies(root, 'vite-vue'));
    await writeFile(join(vueDir, 'package.json'), JSON.stringify({ name: 'vue', version: '1.0.0', main: 'index.js' }));
    assert.throws(() => assertPreviewDependencies(root, 'vite-vue'), { code: 'PREVIEW_RUNTIME_UNSUPPORTED' });
    await writeFile(join(vueDir, 'package.json'), JSON.stringify({ name: 'vue', version: '3.5.0', main: 'index.js' }));
    assert.doesNotThrow(() => assertPreviewDependencies(root, 'vite-vue'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing React runtime is actionable before invoking the builder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibe-missing-deps-'));
  try {
    assert.throws(() => assertPreviewDependencies(root, 'vite-react'), error => {
      assert.equal(error.code, 'PREVIEW_DEPENDENCIES_MISSING');
      assert.match(error.message, /react/);
      assert.match(error.message, /安装.*依赖/);
      return true;
    });
    for (const [name, file] of [['react', 'jsx-runtime.js'], ['react-dom', 'client.js']]) {
      const packageDir = join(root, 'node_modules', name);
      await mkdir(packageDir, { recursive: true });
      await writeFile(join(packageDir, file), '');
    }
    assert.doesNotThrow(() => assertPreviewDependencies(root, 'vite-react'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
