import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { createServer } from 'node:http'

const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 19908)
const root = join(process.cwd(), 'dist')

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8'
}

function resolvePath(urlPath) {
  const safePath = normalize(decodeURIComponent((urlPath || '/').split('?')[0]))
  const trimmed = safePath.replace(/^\/+/, '')
  let filePath = join(root, trimmed)

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html')
  }

  if (!existsSync(filePath)) {
    const withHtml = `${filePath}.html`
    if (existsSync(withHtml)) filePath = withHtml
  }

  return filePath
}

createServer((req, res) => {
  const filePath = resolvePath(req.url)

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`)
})
