import { prepareLearning, getLearningTask, importLearningAnalysis } from './workflow.js';
import { normalizeCreatorCapture, creatorCaptureFromSource } from './creator-protocol.js';
export { normalizeCreatorCapture } from './creator-protocol.js';

export async function prepareCreator(libraryRoot,capture) {
  const normalized=normalizeCreatorCapture(capture);
  const task=await prepareLearning(libraryRoot,{source:normalized.source,recipeId:'creator-analysis'});
  return {task,coverage:normalized.coverage,limitations:normalized.limitations};
}
export async function getCreatorTask(libraryRoot,taskId) {
  const task=await getLearningTask(libraryRoot,taskId);
  if(task.recipe.id!=='creator-analysis') throw new Error('任务不是账号专业采集任务。');
  const normalized=creatorCaptureFromSource(task.source);
  if(!normalized) throw new Error('账号任务缺少采集清单。');
  return {task,capture:normalized.capture,coverage:normalized.coverage,limitations:normalized.limitations};
}
export async function importCreatorAnalysis(libraryRoot,taskId,analysis) {
  const {task}=await getCreatorTask(libraryRoot,taskId);
  return importLearningAnalysis(libraryRoot,task.id,analysis);
}
