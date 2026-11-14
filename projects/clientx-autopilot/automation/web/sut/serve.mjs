// Tiny static server for the demo shop (the system under test when BASE_URL is not set).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)));
const port = Number(process.argv[2] || 4173);
createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); })
  .listen(port, '127.0.0.1', () => console.log(`demo shop on http://127.0.0.1:${port}`));
