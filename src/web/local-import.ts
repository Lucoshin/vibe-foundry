import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const documentExtensions = new Set(['.pdf', '.txt', '.md', '.markdown']);

function requirePath(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('请选择文件或输入完整的本地目录路径。');
}

export function createLocalImport({ libraryRoot, initialDirectory = process.cwd() }) {
  let job = null;
  let starting = false;
  return {
    async browse(path = initialDirectory) {
      requirePath(path);
      const directory = await realpath(path);
      const entries = await readdir(directory, { withFileTypes: true });
      return {
        path: directory,
        parent: dirname(directory),
        home: homedir(),
        initialDirectory,
        entries: entries.filter(entry => entry.isDirectory() || entry.isFile() && documentExtensions.has(extname(entry.name).toLowerCase()))
          .map(entry => ({ name: entry.name, path: join(directory, entry.name), kind: entry.isDirectory() ? 'directory' : 'document' }))
          .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh-CN') : a.kind === 'directory' ? -1 : 1)),
      };
    },
    status() { return job && { ...job }; },
    async start(path) {
      if (starting || job?.state === 'running') throw new Error('已有任务正在炼化，请等待完成。');
      starting = true;
      try {
        requirePath(path);
        const sourcePath = await realpath(path);
        const info = await stat(sourcePath);
        const kind = info.isDirectory() ? 'project' : info.isFile() && documentExtensions.has(extname(sourcePath).toLowerCase()) ? 'document' : null;
        if (!kind) throw new Error('仅支持项目文件夹或 PDF、TXT、Markdown 文档。');
        job = { id: randomUUID(), state: 'running', kind, sourcePath, name: basename(sourcePath), message: '正在分析并生成资产…' };
        const active = job;
        execute(process.execPath, [fileURLToPath(new URL('./import-worker.js', import.meta.url)), kind, sourcePath, libraryRoot], { windowsHide: true, maxBuffer: 1024 * 1024 })
          .then(({ stdout }) => {
            active.outputDir = JSON.parse(stdout).outputDir;
            active.state = 'succeeded';
            active.message = kind === 'project' ? '项目炼化完成，资产已写入集中库。' : '文档基础炼化完成。当前为章节和预设词表统计，深度语义分析需由宿主 AI 执行。';
          })
          .catch(error => {
            active.state = 'failed';
            active.message = error.stderr?.trim() || error.message;
          });
        return { ...job };
      } finally {
        starting = false;
      }
    },
    async result(type) {
      if (!['report', 'assets'].includes(type)) throw new Error('未知结果类型。');
      if (job?.state !== 'succeeded' || job.kind !== 'document') throw new Error('当前没有已完成的文档结果。');
      return readFile(join(job.outputDir, type === 'report' ? 'book-report.md' : 'book-assets.json'), 'utf8');
    },
  };
}

export function createImportRequestHandler({ libraryRoot, token, initialDirectory }) {
  const service = createLocalImport({ libraryRoot, initialDirectory });
  return async (request, response, url) => {
    if (!url.pathname.startsWith('/api/import/')) return false;
    const send = (status, value, type = 'application/json; charset=utf-8') => {
      response.statusCode = status;
      response.setHeader('content-type', type);
      response.setHeader('cache-control', 'no-store');
      response.end(type.startsWith('application/json') && typeof value !== 'string' ? JSON.stringify(value) : value);
    };
    const address = request.socket?.remoteAddress;
    const host = request.headers?.host;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
      || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host || '')
      || request.headers?.['x-vibe-import-token'] !== token
      || (request.headers.origin && request.headers.origin !== `http://${host}`)
      || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) {
      send(403, { message: '本地导入请求未通过页面校验，请刷新页面后重试。' });
      return true;
    }
    try {
      if (request.method === 'GET' && url.pathname === '/api/import/status') send(200, service.status());
      else if (request.method === 'GET' && ['/api/import/result/report', '/api/import/result/assets'].includes(url.pathname)) {
        const type = url.pathname.endsWith('/report') ? 'report' : 'assets';
        send(200, await service.result(type), type === 'report' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8');
      } else if (request.method === 'POST' && ['/api/import/browse', '/api/import/start'].includes(url.pathname)) {
        if (!String(request.headers['content-type']).startsWith('application/json')) throw new Error('请求必须为 JSON。');
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 16384) throw new Error('请求路径过长。');
          chunks.push(chunk);
        }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => key !== 'path')) throw new Error('请求仅允许 path 字段。');
        send(url.pathname.endsWith('/start') ? 202 : 200, url.pathname.endsWith('/start') ? await service.start(data.path) : await service.browse(data.path));
      } else send(405, { message: '不支持的导入请求。' });
    } catch (error) {
      send(400, { message: error.message });
    }
    return true;
  };
}
