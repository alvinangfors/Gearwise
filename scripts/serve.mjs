#!/usr/bin/env node
// Enkel lokal server för dist/ – bara för förhandsgranskning.  npm run dev  →  http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const config = JSON.parse(await readFile(new URL('../site.config.json', import.meta.url), 'utf8'));
const base = ('/' + (config.basePath || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(base)) { res.writeHead(302, { Location: base }); return res.end(); }
  p = normalize(join(dist, p.slice(base.length)));
  if (!p.startsWith(dist)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html'); } catch {}
  try {
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }); res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': types['.html'] }); res.end(await readFile(join(dist, '404.html')));
  }
}).listen(port, () => console.log(`http://localhost:${port}${base}`));
