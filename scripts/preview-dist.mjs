import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function normalizeBasePath(value = '/') {
  if (!/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(value)) throw new Error('Use a simple project path such as /cornfields/');
  return value.endsWith('/') ? value : value + '/';
}

export async function resolvePreviewFile(root, requestUrl, basePath = '/') {
  basePath = normalizeBasePath(basePath);
  const pathname = decodeURIComponent(requestUrl.split(/[?#]/, 1)[0]);
  if (!pathname.startsWith(basePath) || pathname.includes('\\') || pathname.includes('\0')) throw new Error('Not found');
  let relative = pathname.slice(basePath.length);
  if (!relative) relative = 'index.html';
  if (relative.split('/').some(part => !part || part === '..' || part.startsWith('.'))) throw new Error('Not found');
  const resolvedRoot = await realpath(root);
  const file = await realpath(path.resolve(resolvedRoot, relative));
  if (!file.startsWith(resolvedRoot + path.sep) || !(await stat(file)).isFile()) throw new Error('Not found');
  return file;
}

export async function startPreview({
  root = fileURLToPath(new URL('../dist/', import.meta.url)),
  port = Number(process.env.PORT || 4180),
  basePath = process.env.CORNFIELD_BASE_PATH || '/',
  seconds = Number(process.env.CORNFIELD_SESSION_SECONDS || 3600),
} = {}) {
  root = await realpath(root);
  basePath = normalizeBasePath(basePath);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid preview port');
  const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.glb':'model/gltf-binary', '.md':'text/plain; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.ttf':'font/ttf', '.wav':'audio/wav', '.mp3':'audio/mpeg'};
  const server = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, {'Allow':'GET, HEAD'}); res.end(); return;
    }
    if (basePath !== '/' && req.url.split(/[?#]/, 1)[0] === basePath.slice(0, -1)) {
      res.writeHead(308, {'Location':basePath}); res.end(); return;
    }
    try {
      const file = await resolvePreviewFile(root, req.url, basePath);
      res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch {
      res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const ttl = Number.isFinite(seconds) ? Math.max(60, Math.min(seconds, 14400)) : 3600;
  const timer = setTimeout(() => server.close(), ttl * 1000);
  timer.unref();
  server.once('close', () => clearTimeout(timer));
  return {server, url:`http://127.0.0.1:${server.address().port}${basePath}`};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {server, url} = await startPreview();
  console.log(`CORNFIELD package preview: ${url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
