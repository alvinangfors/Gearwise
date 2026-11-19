#!/usr/bin/env node
// Hämtar titel, bild, pris och tillgänglighet från Amazon Creators API för alla produkter
// i data/catalog.json som har ett "asin", och skriver resultatet till data/amazon.json.
//
//   npm run fetch
//
// Nycklar läses från miljövariabler eller en lokal .env (checkas aldrig in).
// Bygget (scripts/build.mjs) visar bara data som är yngre än 24 timmar.

import { readFile, writeFile } from 'node:fs/promises';
import { readEnv, createClient, simplify, sleep } from './lib/amazon.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('site.config.json', root), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('data/catalog.json', root), 'utf8'));
const env = readEnv();
const partnerTag = env.partnerTag || config.partnerTag;

const asins = [...new Set(catalog.map((p) => p.asin).filter(Boolean))];
if (!asins.length) {
  console.log('Inga produkter har "asin" i data/catalog.json ännu – inget att hämta.');
  console.log('Tips: npm run find -- <slug>  visar kandidater från Amazon.');
  process.exit(0);
}

const client = createClient({ ...env, marketplace: config.marketplace });
const items = {};
const errors = [];

for (let i = 0; i < asins.length; i += 10) {
  const batch = asins.slice(i, i + 10);
  const res = await client.getItems(batch, partnerTag);
  for (const it of res.itemsResult?.items || []) items[it.asin] = simplify(it);
  for (const e of res.errors || []) errors.push(`${e.code}: ${e.message}`);
  if (i + 10 < asins.length) await sleep(1100); // Creators API: ca 1 anrop/s
}

const out = { fetchedAt: new Date().toISOString(), marketplace: config.marketplace, items };
await writeFile(new URL('data/amazon.json', root), JSON.stringify(out, null, 2) + '\n');

const missing = asins.filter((a) => !items[a]);
console.log(`Hämtade ${Object.keys(items).length}/${asins.length} produkter → data/amazon.json`);
if (missing.length) console.warn(`Saknas i svaret: ${missing.join(', ')}`);
for (const e of errors) console.warn(`API-fel: ${e}`);
