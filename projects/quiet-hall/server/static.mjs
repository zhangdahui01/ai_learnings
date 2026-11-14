// Serve the exported web build (app/dist).   node server/static.mjs [dir] [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'app/dist');
const adminDir = resolve(new URL('../admin', import.meta.url).pathname);       // the visit dashboard, served at /admin
const port = Number(process.argv[3] || 8790);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
                '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.map': 'application/json', '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8' };

const api = process.env.HALL_API || 'http://127.0.0.1:8787';          // /api/* is passed on to the hall server, as on the deployed site

createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const out = await fetch(api + req.url, { method: req.method, body: body || undefined,
        headers: { 'content-type': 'application/json', 'user-agent': req.headers['user-agent'] ?? '', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) } });
      res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(await out.text());
    } catch { res.writeHead(502); return res.end('{"error":"hall server not reachable"}'); }
  }
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, path);
  const inAdmin = path === '/admin' || path.startsWith('/admin/');
  const adminFile = join(adminDir, path.slice(6) || 'index.html');
  for (const candidate of inAdmin ? [adminFile.startsWith(adminDir) ? (extname(adminFile) ? adminFile : join(adminDir, 'index.html')) : null]
                                  : [file.startsWith(root) && extname(file) ? file : null, join(root, 'index.html')]) {
    if (!candidate) continue;
    try {
      const data = await readFile(candidate);
      res.writeHead(200, { 'content-type': TYPES[extname(candidate)] || 'application/octet-stream', 'cache-control': 'no-store' });
      return res.end(data);
    } catch { /* try the next candidate */ }
  }
  res.writeHead(404); res.end('not found: run `npx expo export -p web` in app/ first');
}).listen(port, '0.0.0.0', () => console.log(`Quiet Hall web on http://localhost:${port}`));
