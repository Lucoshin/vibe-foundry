export function isLocalPageRequest(request, token) {
  const address = request.socket?.remoteAddress;
  const headers = request.headers || {};
  const host = headers.host;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
    && /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host || '')
    && headers['x-vibe-import-token'] === token
    && (!headers.origin || headers.origin === `http://${host}`)
    && (!headers['sec-fetch-site'] || headers['sec-fetch-site'] === 'same-origin');
}

export async function readLocalJson(request, maxBytes) {
  if (String(request.headers?.['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('请求必须为 JSON。');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('请求材料过大，请分批处理。');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
