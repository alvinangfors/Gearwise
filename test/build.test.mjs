// Kör fetch + build i en tillfällig kopia av projektet mot en låtsasserver och kontrollerar
// att priser visas med tidpunkt, att gamla data (> 24 h) aldrig visas och att länkar är märkta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = new URL('../', import.meta.url).pathname;

async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'gearwise-'));
  for (const p of ['scripts', 'src', 'static', 'data', 'site.config.json', 'package.json']) await cp(join(repo, p), join(dir, p), { recursive: true });
  await rm(join(dir, 'data/amazon.json'), { force: true });
  const cat = JSON.parse(await readFile(join(dir, 'data/catalog.json'), 'utf8'));
  cat[0].asin = 'B0TESTAAAA'; cat[1].asin = 'B0TESTBBBB';
  delete cat[0].pick; delete cat[1].pick; // testa API-titeln, inte redaktionella namn
  await writeFile(join(dir, 'data/catalog.json'), JSON.stringify(cat));
  return { dir, slug0: cat[0].slug, slug2: cat[2].slug };
}
const run = (dir, script, env = {}) => execFileSync('node', [`scripts/${script}`], { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'pipe' });

test('fetch → build visar pris, tidpunkt och prisinfo', async () => {
  const server = createServer(async (req, res) => {
    let b = ''; for await (const c of req) b += c;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/token') return res.end('{"access_token":"T","expires_in":3600}');
    const { itemIds } = JSON.parse(b);
    res.end(JSON.stringify({ itemsResult: { items: itemIds.map((asin) => ({ asin, detailPageURL: `https://www.amazon.se/dp/${asin}?tag=t-21`,
      itemInfo: { title: { displayValue: `Modell ${asin}` } },
      offersV2: { listings: [{ isBuyBoxWinner: true, price: { money: { amount: 1, currency: 'SEK', displayAmount: '1 299,00 kr' } } }] } })) } }));
  });
  await new Promise((ok) => server.listen(0, ok));
  const url = `http://localhost:${server.address().port}`;
  const { dir, slug0, slug2 } = await project();

  const env = { AMAZON_CREDENTIAL_ID: 'x', AMAZON_CREDENTIAL_SECRET: 'y', AMAZON_API_HOST: url, AMAZON_TOKEN_URL: `${url}/token` };
  server.unref();
  const fetchOut = await new Promise((ok, fail) => {
    import('node:child_process').then(({ execFile }) => execFile('node', ['scripts/fetch-amazon.mjs'], { cwd: dir, env: { ...process.env, ...env } }, (e, so, se) => e ? fail(new Error(se)) : ok(so)));
  });
  server.close();
  assert.match(fetchOut, /Hämtade (\d+)\/\1 produkter/);
  run(dir, 'build.mjs');

  const html = await readFile(join(dir, `dist/produkt/${slug0}/index.html`), 'utf8');
  assert.match(html, /<strong>1 299,00 kr<\/strong>Amazon\.se, \d+ \w+\.? \d{4} kl\. \d\d:\d\d/);
  assert.match(html, /data-price-ts="\d{4}-/);
  assert.match(html, /Det pris och den tillgänglighet som visas på Amazon\.se vid köptillfället gäller/);
  assert.match(html, /Vårt val:<\/b> Modell B0TESTAAAA/);
  assert.match(html, /href="https:\/\/www\.amazon\.se\/dp\/B0TESTAAAA\?tag=t-21" target="_blank" rel="nofollow sponsored noopener"/);
  const other = await readFile(join(dir, `dist/produkt/${slug2}/index.html`), 'utf8');
  assert.doesNotMatch(other.split('<section')[0], /data-price-ts/); // produkt utan ASIN har inget pris

  // Gör datan 25 h gammal → bygget ska utelämna priser och API-data
  const a = JSON.parse(await readFile(join(dir, 'data/amazon.json'), 'utf8'));
  a.fetchedAt = new Date(Date.now() - 25 * 3600e3).toISOString();
  await writeFile(join(dir, 'data/amazon.json'), JSON.stringify(a));
  run(dir, 'build.mjs');
  const stale = await readFile(join(dir, `dist/produkt/${slug0}/index.html`), 'utf8');
  assert.doesNotMatch(stale, /data-price-ts|1 299,00 kr|Vårt val/);
  assert.match(stale, /amazon\.se\/dp\/B0TESTAAAA\?tag=/); // länken fungerar ändå
  await rm(dir, { recursive: true, force: true });
});

test('alla Amazon-länkar har partnertagg och rel="nofollow sponsored noopener"', async () => {
  const { dir } = await project();
  run(dir, 'build.mjs');
  const html = await readFile(join(dir, 'dist/index.html'), 'utf8');
  const links = [...html.matchAll(/<a [^>]*href="(https:\/\/www\.amazon\.se[^"]*)"[^>]*>/g)];
  assert.ok(links.length >= 21);
  for (const [tag, href] of links) {
    assert.match(href.replaceAll('&amp;', '&'), /[?&]tag=[\w-]+/);
    assert.match(tag, /rel="nofollow sponsored noopener"/);
  }
  assert.match(html, /Som Amazon-partner tjänar Gearwise på kvalificerade köp/);
  await rm(dir, { recursive: true, force: true });
});
