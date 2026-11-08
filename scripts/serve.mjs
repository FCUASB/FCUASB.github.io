import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpath, stat, readFile } from 'node:fs/promises';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
const previewOrigin = `http://localhost:${port}`;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const inside = target => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const server = http.createServer(async (request, response) => {
  const fail = (status, message) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(message); };
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return fail(405, 'Method not allowed');
  }
  try {
    const requested = new URL(request.url, previewOrigin);
    const pathname = decodeURIComponent(requested.pathname);
    const parts = pathname.split(/[\\/]/);
    if (parts.some(part => part.startsWith('.')) || pathname.includes('\0')) return fail(403, 'Forbidden');
    let target = path.resolve(root, `.${pathname}`);
    if (!inside(target)) return fail(403, 'Forbidden');
    // Use a named origin: YouTube can reject embeds referred by a loopback IP.
    if (request.headers.host?.split(':')[0] === '127.0.0.1') {
      response.writeHead(307, { Location: previewOrigin + requested.pathname + requested.search, 'Cache-Control': 'no-store' });
      return response.end();
    }
    if ((await stat(target)).isDirectory()) {
      if (!pathname.endsWith('/')) {
        response.writeHead(301, { Location: new URL(request.url, 'http://localhost').pathname + '/' });
        return response.end();
      }
      target = path.join(target, 'index.html');
    }
    target = await realpath(target);
    if (!inside(target)) return fail(403, 'Forbidden');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    fail(error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) ? 404 : 500, 'Unable to serve requested file');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Stop the existing server or set PORT to another port.` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Preview: ${previewOrigin}/ (Ctrl+C to stop)`));
