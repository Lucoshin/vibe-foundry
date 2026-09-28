import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLearning, importLearningAnalysis } from '../../dist/learning/workflow.js';
import { createBookDocument } from '../../dist/analyzers/book-document.js';
import { validateBookKnowledge } from '../../dist/schema/book-knowledge.js';
import { loadAssetLibraryViewModel } from '../../dist/application/asset-catalog.js';

export async function collectionFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-collections-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const text = '林岚守护灯塔。';
  for (const name of ['book-a', 'book-b']) {
    const document = createBookDocument(text, { title: '同名故事', sourcePath: `${name}.txt` });
    const evidence = [{ unitId: document.units[0].id, quote: text }];
    const book = validateBookKnowledge(document, { schemaVersion: '0.2.0', sourceDigest: document.sourceDigest,
      processedChunkIds: document.chunks.map(chunk => chunk.id),
      entities: [{ id: 'lin', type: 'character', name: '林岚', aliases: [], facets: [{ name: '职责', value: '守护灯塔', basis: 'explicit', evidence }] },
        { id: 'tower', type: 'setting', name: '灯塔', aliases: [], facets: [{ name: '守护者', value: '林岚', basis: 'explicit', evidence }] }],
      relations: [{ id: 'guard', from: 'lin', to: 'tower', type: '守护', description: text, basis: 'explicit', evidence }], uncertainties: [],
    });
    await mkdir(join(root, 'books', name), { recursive: true });
    await writeFile(join(root, 'books', name, 'book-assets.json'), JSON.stringify(book));
  }
  const source = { schemaVersion: '0.1.0', kind: 'text', title: '关系查看规则', entries: [{ id: 'rule', role: 'document', text: '集合保存精确身份。名称相同不能证明资产相同。' }] };
  const task = await prepareLearning(root, { source, recipeId: 'general-knowledge' });
  await importLearningAnalysis(root, task.id, { schemaVersion: '0.1.0', sourceDigest: task.sourceDigest, recipeDigest: task.recipeDigest,
    assets: [{ id: 'identity', type: 'practice', title: '精确身份', summary: '按资产 ID 保存引用。', basis: 'explicit', tags: [], evidence: [{ entryId: 'rule', quote: '集合保存精确身份。' }] },
      { id: 'names', type: 'constraint', title: '同名边界', summary: '不按名称合并资产。', basis: 'explicit', tags: [], evidence: [{ entryId: 'rule', quote: '名称相同不能证明资产相同。' }] }],
    relations: [{ id: 'explains', from: 'names', to: 'identity', type: 'constrains', description: '名称不能作为精确身份的替代。', basis: 'interpretation', evidence: [{ entryId: 'rule', quote: '名称相同不能证明资产相同。' }] }],
  });
  return { root, model: await loadAssetLibraryViewModel(root, { runtimePreviewState: false }) };
}

export async function collectionSnapshot(root) {
  const files = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files[join(entry.parentPath, entry.name)] = await readFile(join(entry.parentPath, entry.name), 'utf8');
  }
  return files;
}
