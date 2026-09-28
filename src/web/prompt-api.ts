import { getPrompt,listPrompts,renderPrompt,savePrompt } from '../prompts/workflow.js';
import { isLocalPageRequest,readLocalJson } from './local-request.js';

export function createPromptRequestHandler({libraryRoot,token}) {
  return async(request,response,url)=>{
    if(url.pathname!=='/api/prompts'&&!url.pathname.startsWith('/api/prompts/')) return false;
    const send=(status,body)=>{response.statusCode=status;response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');response.end(JSON.stringify(body));};
    if(!isLocalPageRequest(request,token)){send(403,{message:'请求未通过本地页面校验，请刷新页面。'});return true;}
    try {
      if(request.method==='GET') {
        const allowed=url.pathname==='/api/prompts/item'?['id','revision']:[];
        if([...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1)) throw new Error('提示词查询参数未知或重复。');
        if(url.pathname==='/api/prompts') send(200,await listPrompts(libraryRoot));
        else if(url.pathname==='/api/prompts/item') send(200,await getPrompt(libraryRoot,url.searchParams.get('id'),url.searchParams.get('revision')));
        else send(404,{message:'未知提示词资源。'});
      } else if(request.method==='POST') {
        if(url.search) throw new Error('提示词写入与渲染不接受 URL 查询参数。');
        if(!['/api/prompts/save','/api/prompts/render'].includes(url.pathname)) {send(404,{message:'未知提示词操作。'});return true;}
        const input=await readLocalJson(request,512*1024);
        if(url.pathname==='/api/prompts/save') send(201,await savePrompt(libraryRoot,input));
        else send(200,await renderPrompt(libraryRoot,input));
      } else send(405,{message:'不支持的请求方法。'});
    } catch(error){send(error.code==='ENOENT'?404:400,{message:error.message});}
    return true;
  };
}
