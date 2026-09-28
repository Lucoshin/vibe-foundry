import { normalizeConversation, prepareConversation } from '../learning/conversations.js';
import { getLearningMemory } from '../learning/memory.js';
import { isLocalPageRequest, readLocalJson } from './local-request.js';

export function createConversationRequestHandler({ libraryRoot, token }) {
  return async (request, response, url) => {
    if (!url.pathname.startsWith('/api/conversations/')) return false;
    const send = (status, body) => {
      response.statusCode = status;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(JSON.stringify(body));
    };
    if (!isLocalPageRequest(request, token)) { send(403, { message: '请求未通过本地页面校验，请刷新页面。' }); return true; }
    try {
      const path = url.pathname.slice('/api/conversations/'.length);
      if (request.method === 'GET' && path === 'memory') {
        if ([...url.searchParams.keys()].some(key => key !== 'assetId') || url.searchParams.getAll('assetId').length !== 1) throw new Error('记忆回查仅接受一个 assetId。');
        send(200, await getLearningMemory(libraryRoot, { assetId: url.searchParams.get('assetId') }));
      } else if (request.method === 'POST' && ['preview', 'prepare'].includes(path)) {
        const input = await readLocalJson(request, 1024 * 1024);
        send(path === 'prepare' ? 201 : 200, path === 'prepare' ? await prepareConversation(libraryRoot, input) : normalizeConversation(input));
      } else if (!['GET', 'POST'].includes(request.method)) send(405, { message: '不支持的请求方法。' });
      else send(404, { message: '未知对话资源或请求方法。' });
    } catch (error) { send(400, { message: error.message }); }
    return true;
  };
}
