import { loadLearningLibrary, listApplications } from './workflow.js';

export async function getLearningMemory(libraryRoot, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== 1 || typeof input.assetId !== 'string' || !input.assetId.trim()) throw new Error('记忆回查需要精确 assetId，不能包含其他字段。');
  const { tasks, assets } = await loadLearningLibrary(libraryRoot);
  const asset = assets.find(item => item.id === input.assetId);
  if (!asset) throw new Error('确切学习资产版本不存在；工程、书籍和图片不属于学习应用记录范围。');
  const task = tasks.find(item => item.id === asset.taskId);
  const applications = await listApplications(libraryRoot);
  const usesOf = id => applications.filter(record => record.assetIds.includes(id));
  return {
    schemaVersion: '0.1.0', asset,
    source: { title: task.source.title, kind: task.source.kind, sourceDigest: task.sourceDigest },
    evidence: asset.evidence.map(item => ({ ...item, role: task.source.entries.find(entry => entry.id === item.entryId).role })),
    applications: usesOf(asset.id),
    revisions: assets.filter(item => item.taskId === asset.taskId && item.localId === asset.localId && item.id !== asset.id)
      .map(item => ({ assetId: item.id, resultId: item.resultId, summary: item.summary, applications: usesOf(item.id) })),
    relations: asset.relations,
    limitations: [
      '应用理由、行动与结果保持原始使用者声明，不自动认定已验证有效。',
      '同任务同局部 ID 的其他分析版本仅为候选，不自动构成取代或纠正；采用关系以有证据的显式分析为准。',
      '当前仅回查学习流程资产，不按相似标题建立跨任务或跨类型关联。',
    ],
  };
}
