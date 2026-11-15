// Static server for the game under test. Usage: node serve.mjs <dir> <port>
import http from 'http'; import fs from 'fs'; import path from 'path';
const [dir, port] = [process.argv[2], Number(process.argv[3])];
http.createServer((q, r) => {
  const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('not found'); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); r.end(b); });
}).listen(port, '127.0.0.1');
