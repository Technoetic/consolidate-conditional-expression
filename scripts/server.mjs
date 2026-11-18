import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, build } from './build.mjs';

export const prefix = '/consolidate-conditional-expression/';
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp'
};

export function createServer({ root = path.join(project, 'dist') } = {}) {
  const directory = path.resolve(root);
  return http.createServer(async (request, response) => {
    const fail = (code, message) => {
      response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(message);
    };
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        return fail(405, 'Method not allowed');
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/' || url.pathname === prefix.slice(0, -1)) {
        response.writeHead(302, { Location: prefix + url.search, 'Cache-Control': 'no-store' });
        return response.end();
      }
      if (!url.pathname.startsWith(prefix)) return fail(404, 'Not found');
      const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
      const target = path.resolve(directory, relative);
      if (!target.startsWith(directory + path.sep) || relative.includes('\0')) return fail(404, 'Not found');
      const info = await stat(target).catch(() => null);
      if (!info?.isFile()) return fail(404, 'Not found');
      const body = request.method === 'HEAD' ? undefined : await readFile(target);
      response.writeHead(200, {
        'Content-Type': types[path.extname(target)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': relative.startsWith('releases/') ? 'public, max-age=31536000, immutable' : 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(body);
    } catch (error) {
      fail(error instanceof URIError ? 400 : 500, error instanceof URIError ? 'Invalid URL' : 'Unable to serve this file');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  const port = Number(value('--port') ?? 8917);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid port');
  const root = value('--root');
  if (!root) await build();
  const server = createServer(root ? { root } : {});
  server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + prefix));
}
