import { saveKnowledgeCollection, listKnowledgeCollections, getKnowledgeCollection, exploreAssetRelations, listCollectionAssets } from '../application/knowledge-collections.js';
import { isLocalPageRequest, readLocalJson } from './local-request.js';

export function createKnowledgeCollectionsRequestHandler({ libraryRoot, token }) {
  return async (request, response, url) => {
    const base = '/api/knowledge-collections';
    if (url.pathname !== base && !url.pathname.startsWith(base + '/')) return false;
    const send = (status, body) => {
      response.statusCode = status;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(JSON.stringify(body));
    };
    if (!isLocalPageRequest(request, token)) { send(403, { message: '请求未通过本地页面校验，请刷新页面。' }); return true; }
    try {
      const path = url.pathname.slice(base.length);
      if (request.method === 'GET') {
        if (path === '') send(200, await listKnowledgeCollections(libraryRoot));
        else if (path === '/item') send(200, await getKnowledgeCollection(libraryRoot, url.searchParams.get('id')));
        else if (path === '/assets') send(200, await listCollectionAssets(libraryRoot));
        else if (path === '/relations') send(200, await exploreAssetRelations(libraryRoot, { assetIds: url.searchParams.getAll('assetId') }));
        else send(404, { message: '未知集合资源。' });
      } else if (request.method === 'POST' && path === '') {
        send(201, await saveKnowledgeCollection(libraryRoot, await readLocalJson(request, 256 * 1024)));
      } else if (request.method === 'POST' && path === '/relations') {
        send(200, await exploreAssetRelations(libraryRoot, await readLocalJson(request, 256 * 1024)));
      } else send(405, { message: '不支持的集合请求方法。' });
    } catch (error) { send(error.code === 'ENOENT' ? 404 : 400, { message: error.message }); }
    return true;
  };
}
