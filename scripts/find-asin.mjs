#!/usr/bin/env node
// Sök produkter på Amazon.se via Creators API, för att välja ASIN till data/catalog.json.
//
//   npm run find -- brusreducerande-horlurar     (använder produktens sökord "q")
//   npm run find -- "usb-c laddare 65w"          (fritt sökord)
//
// Skriptet väljer ingenting åt dig: du bedömer själv vilken produkt som är värd att tipsa om
// och skriver in dess ASIN i catalog.json.

import { readFile } from 'node:fs/promises';
import { readEnv, createClient, simplify } from './lib/amazon.mjs';

const arg = process.argv.slice(2).join(' ').trim();
if (!arg) { console.error('Ange en produkt-slug eller ett sökord.'); process.exit(1); }

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('site.config.json', root), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('data/catalog.json', root), 'utf8'));
const product = catalog.find((p) => p.slug === arg);
const keywords = product ? product.q : arg;

const env = readEnv();
const client = createClient({ ...env, marketplace: config.marketplace });
const res = await client.searchItems(keywords, env.partnerTag || config.partnerTag);
const rows = (res.searchResult?.items || []).map(simplify);

console.log(`\nSökning: "${keywords}" på ${config.marketplace}${product ? ` (för ${product.slug})` : ''}\n`);
if (!rows.length) console.log('Inga träffar.');
for (const r of rows) {
  console.log(`${r.asin}  ${(r.price?.display || '–').padEnd(14)} ${r.title}`);
}
for (const e of res.errors || []) console.warn(`API-fel: ${e.code}: ${e.message}`);
console.log('\nLägg in valt ASIN som "asin" på produkten i data/catalog.json och kör sedan: npm run fetch');
