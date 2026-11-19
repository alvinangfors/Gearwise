#!/usr/bin/env node
// Renderar PNG-ikoner och delningsbilden (og.png) till static/ från favicon.svg och hero.svg.
// Behövs bara när du ändrar logga eller illustration. Kräver Playwright med Chromium:
//   npx playwright install chromium   (en gång)
//   npm run images

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = createRequire(import.meta.url)('playwright')); } // global installation (NODE_PATH)

const root = new URL('../', import.meta.url);
const fav = await readFile(new URL('static/favicon.svg', root), 'utf8');
const hero = (await readFile(new URL('src/hero.svg', root), 'utf8')).replace('class="scene"', 'width="560" height="448"');
const font = (await readFile(new URL('static/assets/fonts/hanken-grotesk-latin.woff2', root))).toString('base64');
const config = JSON.parse(await readFile(new URL('site.config.json', root), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of [32, 180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${fav.replace('rx="14"', size >= 180 ? 'rx="0"' : 'rx="14"')}`);
  const name = size === 32 ? 'favicon-32.png' : size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  await writeFile(new URL(`static/${name}`, root), await page.screenshot({ omitBackground: size === 32 }));
}

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<style>
@font-face{font-family:H;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
body{margin:0;width:1200px;height:630px;background:#0a2540;color:#fff;font-family:H;display:grid;grid-template-columns:600px 600px;align-items:center;overflow:hidden}
.t{padding-left:72px}.logo{font-weight:700;font-size:34px;display:flex;align-items:center;gap:12px}.logo i{width:18px;height:18px;border-radius:50%;background:#ff5c8a}
h1{font-weight:300;font-size:64px;line-height:1.04;margin:28px 0 22px}p{font-size:26px;color:#8fd3ff;margin:0}
</style><div class="t"><div class="logo"><i></i>${config.name}</div><h1>Smarta prylar, handplockade</h1><p>Köpguider · köp tryggt via Amazon.se</p></div><div>${hero}</div>`);
await page.evaluate(() => document.fonts.ready);
await writeFile(new URL('static/og.png', root), await page.screenshot());

await browser.close();
console.log('Skrev static/favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, og.png');
