import { listRecipes, getRecipe, saveRecipe } from '../learning/recipes.js';
import { prepareLearning, getLearningTask, listLearningTasks, importLearningAnalysis, recordApplication, listApplications } from '../learning/workflow.js';
import { isLocalPageRequest, readLocalJson } from './local-request.js';

export function createLearningRequestHandler({libraryRoot, token}) {
  return async (request,response,url) => {
    if (!url.pathname.startsWith('/api/learning/')) return false;
    const send = (status,value) => { response.statusCode=status; response.setHeader('content-type','application/json; charset=utf-8'); response.setHeader('cache-control','no-store'); response.end(JSON.stringify(value)); };
    if (!isLocalPageRequest(request,token)) { send(403,{message:'请求未通过本地页面校验，请刷新页面。'}); return true; }
    try {
      const path = url.pathname.slice('/api/learning/'.length);
      if(request.method==='GET') {
        if(path==='recipes') send(200,await listRecipes(libraryRoot));
        else if(path==='recipe') send(200,await getRecipe(libraryRoot,url.searchParams.get('id'),url.searchParams.has('version')?Number(url.searchParams.get('version')):undefined));
        else if(path==='tasks') send(200,await listLearningTasks(libraryRoot));
        else if(path==='task') send(200,await getLearningTask(libraryRoot,url.searchParams.get('id')));
        else if(path==='applications') send(200,await listApplications(libraryRoot));
        else send(404,{message:'未知学习资源。'});
      } else if(request.method==='POST') {
        const input=await readLocalJson(request,2*1024*1024);
        if(path==='recipes') send(201,await saveRecipe(libraryRoot,input));
        else if(path==='tasks') send(201,await prepareLearning(libraryRoot,input));
        else if(path==='analysis') {
          if(!input || Object.keys(input).some(k=>!['taskId','analysis'].includes(k))) throw new Error('分析导入仅允许 taskId 和 analysis。');
          send(201,await importLearningAnalysis(libraryRoot,input.taskId,input.analysis));
        } else if(path==='applications') send(201,await recordApplication(libraryRoot,input));
        else send(404,{message:'未知学习资源。'});
      } else send(405,{message:'不支持的请求方法。'});
    } catch(error) { send(400,{message:error.message}); }
    return true;
  };
}
