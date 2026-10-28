import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import {dirname, extname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../dist'));
const portOption = process.argv.indexOf('--port');
const port = Number(portOption >= 0 ? process.argv[portOption + 1] : process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('端口须为 1–65535 的整数。使用：node scripts/preview-server.mjs --port 4173');
  process.exit(1);
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.wasm': 'application/wasm'
};
const insideRoot = path => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
};

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const end = (status, message) => {
    response.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8'});
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    end(405, 'Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  } catch {
    end(400, 'Invalid request path');
    return;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) {
    end(400, 'Invalid request path');
    return;
  }
  if (pathname === '/') {
    response.writeHead(302, {Location: '/preview.html'});
    response.end();
    return;
  }
  const candidate = resolve(root, `.${pathname}`);
  if (!insideRoot(candidate)) {
    end(403, 'Forbidden');
    return;
  }
  try {
    const path = await realpath(candidate);
    if (!insideRoot(path)) {
      end(403, 'Forbidden');
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) {
      end(404, 'Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size
    });
    if (request.method === 'HEAD') response.end();
    else {
      const stream = createReadStream(path);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    }
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') end(404, 'Not found');
    else if (error.code === 'EACCES') end(403, 'Forbidden');
    else end(500, 'Unable to read file');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，可使用 --port 指定其他端口。` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`桌面预览：http://127.0.0.1:${port}/preview.html`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close());
}
