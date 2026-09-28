import { createTaskContext } from '../application/task-context.js';
import { isLocalPageRequest, readLocalJson } from './local-request.js';
import { readImageFile } from '../images/workflow.js';

export function createAssetUseRequestHandler({ libraryRoot, token }) {
  return async (request, response, url) => {
    const imagePrefix = '/api/image-snapshots/';
    if (url.pathname.startsWith(imagePrefix)) {
      response.setHeader('cache-control', 'no-store');
      response.setHeader('x-content-type-options', 'nosniff');
      try {
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.end('不支持的请求方法。');
          return true;
        }
        const { bytes, mimeType } = await readImageFile(libraryRoot, url.pathname.slice(imagePrefix.length));
        response.statusCode = 200;
        response.setHeader('content-type', mimeType);
        response.setHeader('cache-control', 'private, max-age=31536000, immutable');
        response.end(bytes);
      } catch (error) {
        response.statusCode = error.code === 'ENOENT' ? 404 : 400;
        response.setHeader('content-type', 'text/plain; charset=utf-8');
        response.end(error.message);
      }
      return true;
    }
    if (url.pathname !== '/api/task-context') return false;
    const send = (status, body) => {
      response.statusCode = status;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(JSON.stringify(body));
    };
    if (!isLocalPageRequest(request, token)) {
      send(403, { message: '请求未通过本地页面校验，请刷新页面。' });
    } else if (request.method !== 'POST') {
      send(405, { message: '不支持的请求方法。' });
    } else {
      try {
        const input = await readLocalJson(request, 64 * 1024);
        send(200, await createTaskContext(libraryRoot, input));
      } catch (error) {
        send(400, { message: error.message });
      }
    }
    return true;
  };
}
