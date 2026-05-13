import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 19908);
const ROOT = resolve(process.env.STATIC_ROOT ?? 'dist');
const INDEX = join(ROOT, 'index.html');

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.glb', 'model/gltf-binary'],
]);

function resolveRequestPath(url) {
  const { pathname } = new URL(url, `http://${HOST}:${PORT}`);
  const decoded = decodeURIComponent(pathname);
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  return join(ROOT, clean);
}

async function existingFile(path) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return null;
  return path;
}

const server = createServer(async (req, res) => {
  if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(405).end('method not allowed\n');
    return;
  }

  const requested = resolveRequestPath(req.url);
  const filePath = await existingFile(requested) ?? INDEX;
  const contentType = MIME_TYPES.get(extname(filePath)) ?? 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  if (filePath !== INDEX) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(filePath)
    .on('error', () => {
      res.writeHead(500).end('server error\n');
    })
    .pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`lechera static server listening on http://${HOST}:${PORT}, root=${ROOT}`);
});
