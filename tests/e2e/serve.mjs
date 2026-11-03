// Kleiner statischer Server mit SPA-Fallback für den E2E-Build (dist-e2e).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist-e2e');
const port = Number(process.argv[3] ?? 8199);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.css': 'text/css' };
http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  let f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  r.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream');
  r.setHeader('cache-control', 'no-store');
  r.end(fs.readFileSync(f));
}).listen(port, () => console.log(`E2E-Server auf ${port}`));
