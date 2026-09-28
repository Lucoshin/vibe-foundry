import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { listFiles } from '../../dist/utils/files.js';

test('source walking deduplicates roots and excludes dependency internals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibehub-files-'));
  try {
    for (const path of ['src/components/Button.tsx', 'src/node_modules/vendor.tsx', 'src/.git/blob.tsx', 'src/.vibehub/generated.tsx']) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), 'export default () => <button/>;');
    }
    assert.deepEqual((await listFiles(root, ['src', 'src/components', 'missing'], ['.tsx'])).map(file => file.filePath), ['src/components/Button.tsx']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
