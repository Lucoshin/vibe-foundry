import { reviseImageAnalysis } from '../images/workflow.js';
import { isLocalPageRequest,readLocalJson } from './local-request.js';

export function createImageEditRequestHandler({libraryRoot,token}) {
  return async(request,response,url)=>{
    if(url.pathname!=='/api/images/revisions') return false;
    const send=(status,body)=>{response.statusCode=status;response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');response.end(JSON.stringify(body));};
    if(!isLocalPageRequest(request,token)) send(403,{message:'请求未通过本地页面校验，请刷新页面。'});
    else if(request.method!=='POST') send(405,{message:'不支持的请求方法。'});
    else {
      try {
        if(url.search) throw new Error('图片修订不接受 URL 查询参数。');
        send(201,await reviseImageAnalysis(libraryRoot,await readLocalJson(request,2*1024*1024)));
      }catch(error){send(error.code==='ENOENT'?404:400,{message:error.message});}
    }
    return true;
  };
}
