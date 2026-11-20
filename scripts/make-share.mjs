#!/usr/bin/env node
// Renderar delningsbilder för Pinterest och Instagram till share/ (checkas inte in).
//   npm run share
// Kräver Playwright med Chromium (samma som npm run images).

import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ICONS } from './lib/icons.mjs';
import { GUIDES } from './lib/guides.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('site.config.json', root), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('data/catalog.json', root), 'utf8'));
const font = (await readFile(new URL('static/assets/fonts/hanken-grotesk-latin.woff2', root))).toString('base64');
const bySlug = Object.fromEntries(catalog.map((p) => [p.slug, p]));
const base = ('/' + (config.basePath || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const site = (config.url.replace(/^https?:\/\//, '') + base).replace(/\/$/, '');
const YR = new Date().getFullYear();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const out = new URL('share/', root);
await mkdir(out, { recursive: true });

// Varje bild: format, filnamn, etikett, rubrik (med <em> för gradient), underrubrik, ikoner, tema
const pin = [1000, 1500], sq = [1080, 1080], story = [1080, 1920];
const giftIcons = ['brusreducerande-horlurar', 'posters-och-tavlor', 'smartklocka-gps', 'led-ljus', 'bluetooth-hogtalare', 'mekaniskt-tangentbord'];
const bfIcons = ['usb-c-laddare-65w', 'powerbank-20000', 'tradlosa-in-ear-horlurar', 'smart-hogtalare', 'portabel-ssd-1tb', 'smarta-led-lampor'];
const homeIcons = ['posters-och-tavlor', 'tavelramar', 'vagghyllor', 'vaggspegel', 'kuddfodral', 'led-ljus'];
const jobs = [
  [pin, 'pin-julklappar', `Julklappsguiden ${YR}`, 'Julklappar till <em>alla på listan</em>', 'Pendlaren · inredaren · träningsnörden · kontorsmänniskan', giftIcons, 'jul'],
  [sq, 'ig-julklappar', `Julklappsguiden ${YR}`, 'Julklappar till <em>alla på listan</em>', 'Handplockat och sorterat efter budget', giftIcons, 'jul'],
  [story, 'story-julklappar', `Julklappsguiden ${YR}`, 'Hitta <em>rätt klapp</em> på en minut', 'Pendlaren · inredaren · träningsnörden · kontorsmänniskan', giftIcons, 'jul'],
  [pin, 'pin-black-friday', `Black Friday ${YR}`, 'Handla smart på <em>Black Friday</em>', 'Så känner du igen ett riktigt fynd', bfIcons, 'bf'],
  [sq, 'ig-black-friday', `Black Friday ${YR}`, 'Handla smart på <em>Black Friday</em>', 'Fem regler för riktiga fynd', bfIcons, 'bf'],
  [pin, 'pin-inredning', 'Hem & inredning', 'Ge hemmet <em>personlighet</em>', 'Tavlor, speglar, hyllor och mysbelysning', homeIcons, 'home'],
  [sq, 'ig-inredning', 'Hem & inredning', 'Ge hemmet <em>personlighet</em>', 'Tavlor, speglar, hyllor och mys', homeIcons, 'home'],
  ...GUIDES.map((g) => [pin, `pin-guide-${g.slug}`, `${g.emoji} Guide · ${g.kicker}`, esc(g.title).replace(/ – (.*)$/, ' – <em>$1</em>'), g.desc.split('. ')[0].replace(/\.$/, '') + '.', g.products, 'guide']),
];

const themes = {
  jul: 'radial-gradient(70% 50% at 15% 10%,rgba(226,59,78,.55),transparent 60%),radial-gradient(70% 50% at 90% 85%,rgba(46,158,107,.5),transparent 60%),#06101f',
  bf: 'radial-gradient(70% 50% at 15% 10%,rgba(255,92,138,.5),transparent 60%),radial-gradient(70% 50% at 90% 85%,rgba(182,156,255,.45),transparent 60%),#06101f',
  home: 'radial-gradient(70% 50% at 15% 10%,rgba(182,156,255,.45),transparent 60%),radial-gradient(70% 50% at 90% 85%,rgba(255,209,102,.3),transparent 60%),#06101f',
  guide: 'radial-gradient(70% 50% at 15% 10%,rgba(31,111,181,.6),transparent 60%),radial-gradient(70% 50% at 90% 85%,rgba(255,92,138,.35),transparent 60%),#06101f',
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [[w, h], name, kicker, title, sub, icons, theme] of jobs) {
  const s = w / 1000; // skalfaktor
  const tall = h / w > 1.6;
  const snow = theme === 'jul' ? Array.from({ length: 70 }, (_, i) => `<i style="left:${(i * 37) % 100}%;top:${(i * 53) % 100}%;width:${2 + (i % 3) * 2}px;height:${2 + (i % 3) * 2}px;opacity:${0.25 + (i % 4) * 0.15}"></i>`).join('') : '';
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>
@font-face{font-family:H;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
*{box-sizing:border-box}body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:H;color:#fff;background:${themes[theme]};position:relative}
body::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(143,211,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(143,211,255,.07) 1px,transparent 1px);background-size:${48 * s}px ${48 * s}px;-webkit-mask-image:radial-gradient(ellipse at 50% 40%,#000,transparent 75%)}
.snow i{position:absolute;border-radius:50%;background:#fff}
.in{position:relative;height:100%;display:flex;flex-direction:column;padding:${80 * s}px ${72 * s}px ${70 * s}px}
.logo{display:flex;align-items:center;gap:${14 * s}px;font-weight:800;font-size:${40 * s}px;letter-spacing:-.02em}.logo i{width:${20 * s}px;height:${20 * s}px;border-radius:50%;background:#ff5c8a}
.k{margin-top:${tall ? 180 * s : 60 * s}px;display:inline-flex;align-items:center;gap:${14 * s}px;font-size:${28 * s}px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${theme === 'jul' || theme === 'home' ? '#ffd166' : '#8fd3ff'}}
.k::before{content:"";width:${40 * s}px;height:${4 * s}px;border-radius:4px;background:currentColor}
h1{margin:${26 * s}px 0 ${24 * s}px;font-weight:300;font-size:${(h / w > 1.2 ? 104 : 92) * s}px;line-height:1.02;letter-spacing:-.035em}
h1 em{font-style:normal;font-weight:700;background:linear-gradient(120deg,#8fd3ff,#b69cff 48%,#ff5c8a);-webkit-background-clip:text;background-clip:text;color:transparent}
p{margin:0;font-size:${34 * s}px;line-height:1.35;color:#d6e4f0;max-width:22em}
.icons{display:grid;grid-template-columns:repeat(3,1fr);gap:${22 * s}px;margin-top:auto;margin-bottom:${50 * s}px}
.icons span{aspect-ratio:1.3;border-radius:${26 * s}px;background:linear-gradient(160deg,#f1f8fe,#cfe2f2);display:grid;place-items:center;box-shadow:0 ${20 * s}px ${50 * s}px -${20 * s}px rgba(0,0,0,.6)}
.icons svg{width:72%;height:auto}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:${28 * s}px;color:#cfe0ef}
.btn{padding:${18 * s}px ${30 * s}px;border-radius:99px;background:linear-gradient(120deg,#8fd3ff,#b69cff 48%,#ff5c8a);color:#0a2540;font-weight:800;font-size:${30 * s}px}
</style><div class="snow">${snow}</div><div class="in">
<div class="logo"><i></i>${esc(config.name)}</div>
<div class="k">${esc(kicker)}</div>
<h1>${title}</h1>
<p>${esc(sub)}</p>
<div class="icons">${icons.slice(0, h / w > 1.2 ? 6 : 3).map((sl) => `<span>${ICONS[bySlug[sl].icon]}</span>`).join('')}</div>
<div class="foot"><span>${esc(site)}</span><span class="btn">Läs mer →</span></div>
</div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname });
  console.log(`share/${name}.png (${w}×${h})`);
}
await browser.close();
