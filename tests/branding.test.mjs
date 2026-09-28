import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveAssetLibraryRoot } from '../dist/library/asset-library.js';
test('VibeHub package exposes vibe and matching plugin/skill identities', async()=>{
  const pkg=JSON.parse(await readFile('package.json'));
  assert.equal(pkg.name,'vibehub');
  assert.deepEqual(pkg.bin,{vibe:'./dist/cli.js'});
  const plugin=JSON.parse(await readFile('plugins/vibehub/.codex-plugin/plugin.json'));
  assert.equal(plugin.name,'vibehub');
  assert.equal(plugin.interface.displayName,'VibeHub');
  const skill=await readFile('.agents/skills/vibehub/SKILL.md','utf8');
  assert.match(skill,/name: vibehub/);
});
test('default VibeHub library uses only its current environment variable',()=>{
  const saved=process.env.VIBEHUB_LIBRARY_ROOT;
  delete process.env.VIBEHUB_LIBRARY_ROOT;
  try {
    assert.equal(resolveAssetLibraryRoot(),join(homedir(),'.vibehub','library'));
    process.env.VIBEHUB_LIBRARY_ROOT=join(homedir(),'vibehub-test-library');
    assert.equal(resolveAssetLibraryRoot(),process.env.VIBEHUB_LIBRARY_ROOT);
  } finally {if(saved===undefined)delete process.env.VIBEHUB_LIBRARY_ROOT;else process.env.VIBEHUB_LIBRARY_ROOT=saved;}
});
test('vibe command runs through npm-style directory links', async()=>{
  const {mkdtemp,symlink}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {resolve}=await import('node:path');
  const {spawnSync}=await import('node:child_process');
  const root=await mkdtemp(join(tmpdir(),'vibehub-command-'));
  await symlink(resolve('.'),join(root,'linked-tool'),'junction');
  const result=spawnSync(process.execPath,[join(root,'linked-tool','dist','cli.js'),'--help'],{encoding:'utf8'});
  assert.equal(result.status,0);
  assert.match(result.stdout,/vibe distill-website/);
});
