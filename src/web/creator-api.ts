import {prepareCreator,getCreatorTask,importCreatorAnalysis} from '../learning/creators.js';
import {isLocalPageRequest,readLocalJson} from './local-request.js';

export function createCreatorRequestHandler({libraryRoot,token}) {
  return async(request,response,url)=>{
    if(!url.pathname.startsWith('/api/creators/')) return false;
    const send=(status,value)=>{response.statusCode=status;response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');response.end(JSON.stringify(value));};
    if(!isLocalPageRequest(request,token)){send(403,{message:'请求未通过本地页面校验。'});return true;}
    try {
      if(request.method==='GET'&&url.pathname==='/api/creators/task') send(200,await getCreatorTask(libraryRoot,url.searchParams.get('id')));
      else if(request.method==='POST') {
        const input=await readLocalJson(request,2*1024*1024);
        if(url.pathname==='/api/creators/prepare') send(201,await prepareCreator(libraryRoot,input));
        else if(url.pathname==='/api/creators/analysis') {
          if(!input||Object.keys(input).length!==2||!Object.hasOwn(input,'taskId')||!Object.hasOwn(input,'analysis')) throw new Error('账号分析仅允许 taskId 和 analysis。');
          send(201,await importCreatorAnalysis(libraryRoot,input.taskId,input.analysis));
        } else send(404,{message:'未知账号流程资源。'});
      } else send(405,{message:'不支持的请求方法。'});
    }catch(error){send(400,{message:error.message});}
    return true;
  };
}
