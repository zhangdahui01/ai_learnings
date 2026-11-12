// Serve the exported web build (app/dist).   node server/static.mjs [dir] [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'app/dist');
const port = Number(process.argv[3] || 8790);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
                '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.map': 'application/json', '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, path);
  for (const candidate of [file.startsWith(root) && extname(file) ? file : null, join(root, 'index.html')]) {
    if (!candidate) continue;
    try {
      const data = await readFile(candidate);
      res.writeHead(200, { 'content-type': TYPES[extname(candidate)] || 'application/octet-stream', 'cache-control': 'no-store' });
      return res.end(data);
    } catch { /* try the next candidate */ }
  }
  res.writeHead(404); res.end('not found: run `npx expo export -p web` in app/ first');
}).listen(port, '0.0.0.0', () => console.log(`Quiet Hall web on http://localhost:${port}`));
