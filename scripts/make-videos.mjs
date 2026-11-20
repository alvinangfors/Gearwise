#!/usr/bin/env node
// Renderar korta stående videor (1080×1920, 30 fps, H.264) för TikTok, Reels och Shorts till videos/.
//   npm run videos            (alla)
//   npm run videos -- 2 5     (bara video 2 och 5)
// Kräver Playwright (Chromium) och ffmpeg. Musiken är egenkomponerad (scripts/lib/music.mjs).
//   npm run videos -- --ljud   (byt bara musik på redan renderade videor)
//
// Varje scen: [sekunder, text, undertext?, ikoner?, extra?]. **ord** = gradient.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ICONS } from './lib/icons.mjs';
import { makeTrack } from './lib/music.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('site.config.json', root), 'utf8'));
const font = (await readFile(new URL('static/assets/fonts/hanken-grotesk-latin.woff2', root))).toString('base64');
const base = ('/' + (config.basePath || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const site = (config.url.replace(/^https?:\/\//, '') + base).replace(/\/$/, '');
const W = 1080, H = 1920, FPS = 30;

const CTA = (sub) => [3.2, `**${config.name}**`, sub, [], { cta: true }];
const VIDEOS = [
  { file: '1-varfor-gearwise', theme: 'blue', scenes: [
    [3.0, 'Har du också köpt en pryl och **ångrat dig direkt?**'],
    [3.0, 'Tusentals hörlurar. Laddare. Lampor.', 'Och alla recensioner säger olika.', ['phones', 'charger', 'bulb']],
    [2.6, 'Därför startade jag **Gearwise**', null, [], { logo: true }],
    [3.2, 'För varje pryl: **vad du ska kolla** innan du köper'],
    [2.6, '…och vem den **inte** passar.'],
    [2.8, 'Inga fejkade betyg. **Inga cookies.**'],
    [2.6, 'Rätt pryl på **en minut.**'],
    CTA('Länk i bio'),
  ] },
  { file: '2-falskt-black-friday-fynd', theme: 'pink', scenes: [
    [2.8, '**50 % rabatt** på Black Friday?', 'Kolla det här först'],
    [3.6, 'Butiker i Sverige måste visa **lägsta pris senaste 30 dagarna**', 'när de sänker ett pris'],
    [4.2, 'Jämför med **det** priset', null, [], { price: true }],
    [2.6, 'Ingen skillnad? **Inget fynd.**'],
    [2.8, 'Black Friday **27 november**', 'Spara videon!'],
    CTA('Fler Black Friday-tips – länk i bio'),
  ] },
  { file: '3-lista-fore-black-friday', theme: 'pink', scenes: [
    [3.2, 'Det dyraste misstaget på Black Friday:', '**Att handla utan lista**'],
    [3.4, 'Erbjudandena är gjorda för att du ska köpa saker **du inte planerade**'],
    [2.6, '1. **Bestäm** vad du behöver', null, ['phones', 'power', 'watch']],
    [2.6, '2. **Läs** vad du ska kolla'],
    [2.8, '3. **Spara** med hjärtat', null, [], { heart: true }],
    CTA('Gör din lista på Gearwise – länk i bio'),
  ] },
  { file: '4-hur-manga-watt', theme: 'blue', scenes: [
    [3.0, 'Kan en för stark laddare **förstöra mobilen?**'],
    [3.0, '**Nej.**', 'Med USB-C kommer laddaren och mobilen överens.'],
    [2.6, 'Mobilen tar bara **det den klarar.**'],
    [4.4, 'Så många watt behöver du', null, [], { rows: [['Mobil', '20–45 W'], ['Surfplatta, tunn laptop', '30–65 W'], ['Stor laptop', '90 W+']] }],
    [2.8, '**65 W** klarar det mesta', null, ['charger']],
    [3.0, 'Men kolla kabeln:', 'vanliga USB-C-kablar klarar **60 W**', ['cable']],
    CTA('Hela guiden – länk i bio'),
  ] },
  { file: '5-powerbank-pa-flyget', theme: 'blue', scenes: [
    [3.0, 'Lägg **aldrig** powerbanken i den incheckade väskan'],
    [2.6, 'Den ska ligga i **handbagaget**', null, ['power']],
    [3.0, 'Under **100 Wh** = okej hos de flesta flygbolag'],
    [3.2, 'Så räknar du:', '**mAh × 3,7 ÷ 1 000 = Wh**'],
    [3.0, '20 000 mAh → **74 Wh**', 'Under gränsen'],
    [3.2, 'Kolla ditt flygbolag – vissa förbjuder **laddning ombord**'],
    CTA('Spara inför resan – guiden finns i bio'),
  ] },
  { file: '6-julklappar-till-pendlaren', theme: 'jul', scenes: [
    [3.0, 'Känner du någon som **pendlar** varje dag?', '3 julklappar'],
    [3.0, '1. **Brusreducerande hörlurar**', 'Dämpar tågbruset mest', ['phones']],
    [3.0, '2. **Powerbank**', 'Mobilen klarar hela dagen', ['power']],
    [3.2, '3. **Bluetooth-tracker**', 'Kolla att den passar mottagarens mobil', ['tag']],
    [2.8, 'Fler i **Julklappsguiden 2026**'],
    CTA('Länk i bio'),
  ] },
  { file: '7-tavelvagg', theme: 'home', scenes: [
    [2.8, 'Sluta borra hål **på fel ställe**'],
    [3.0, '1. Klipp **pappersmallar** i ramarnas storlek', null, ['frame']],
    [2.8, '2. **Tejpa upp** dem och flytta tills det ser bra ut'],
    [2.6, '3. **5–8 cm** mellan ramarna'],
    [2.8, '4. Mitten runt **150 cm** från golvet', null, ['poster']],
    [2.6, '5. Borra **genom pappret**'],
    CTA('Hela guiden – länk i bio'),
  ] },
];

const THEMES = {
  blue: ['rgba(31,111,181,.65)', 'rgba(182,156,255,.4)'],
  pink: ['rgba(255,92,138,.55)', 'rgba(182,156,255,.45)'],
  jul: ['rgba(226,59,78,.6)', 'rgba(46,158,107,.55)'],
  home: ['rgba(182,156,255,.5)', 'rgba(255,209,102,.35)'],
};
const md = (s) => s ? String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).split(/(\*\*[^*]+\*\*)/).map((part) => {
  const em = part.startsWith('**');
  const txt = em ? part.slice(2, -2) : part;
  return txt.split(/(\s+)/).map((w) => (w.trim() ? `<span class="wd${em ? ' em' : ''}">${w}</span>` : w)).join('');
}).join('') : '';

function pageHtml(v) {
  const [c1, c2] = THEMES[v.theme];
  let t = 0;
  const scenes = v.scenes.map(([dur, text, sub, icons = [], x = {}]) => {
    const s = { start: t, dur }; t += dur;
    let extra = '';
    if (x.logo) extra = `<div class="logo-big"><i></i></div>`;
    if (x.heart) extra = `<div class="heart">&#9829;</div>`;
    if (x.price) extra = `<div class="pricecard"><div class="tag">Exempel</div><div class="r"><span>Ordinarie</span><s>999 kr</s></div><div class="r big"><span>Nu</span><b>599 kr</b></div><div class="r hl"><span>Lägsta 30 dagar</span><b>619 kr</b></div><div class="r note">Rabatten mot 30-dagarspriset: ca 3 %</div></div>`;
    if (x.rows) extra = `<div class="rows">${x.rows.map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join('')}</div>`;
    if (x.cta) extra = `<div class="cta-box"><div class="logo-big"><i></i></div><div class="url">${site}</div></div>`;
    if (x.cta) return { ...s, html: `<section class="scene cta"><div class="logo-big"><i></i></div><h1>${md(text)}</h1>${sub ? `<p>${md(sub)}</p>` : ''}<div class="url">${site}</div></section>` };
    return { ...s, html: `<section class="scene"><h1>${md(text)}</h1>${sub ? `<p>${md(sub)}</p>` : ''}${icons.length ? `<div class="icons">${icons.map((k) => `<span class="ic">${ICONS[k]}</span>`).join('')}</div>` : ''}${extra}</section>` };
  });
  const total = t;
  const snow = v.theme === 'jul' ? Array.from({ length: 90 }, (_, i) => `<i style="left:${(i * 37) % 100}%;--y:${(i * 53) % 100};--s:${0.4 + (i % 5) * 0.25};--r:${2 + (i % 3) * 2}px"></i>`).join('') : '';
  return { total, scenes, html: `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:H;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#050d1a;font-family:H;color:#fff}
.bg{position:absolute;inset:-20%;background:radial-gradient(45% 35% at 20% 20%,${c1},transparent 70%),radial-gradient(45% 35% at 80% 75%,${c2},transparent 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(143,211,255,.07) 2px,transparent 2px),linear-gradient(90deg,rgba(143,211,255,.07) 2px,transparent 2px);background-size:90px 90px;-webkit-mask-image:radial-gradient(ellipse at 50% 45%,#000,transparent 75%)}
.snow i{position:absolute;top:0;width:var(--r);height:var(--r);border-radius:50%;background:#fff;opacity:.7}
.bar{position:absolute;top:70px;left:70px;right:70px;display:flex;gap:10px}.bar b{flex:1;height:8px;border-radius:8px;background:rgba(255,255,255,.2);overflow:hidden}.bar b i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8fd3ff,#ff5c8a)}
.brand{position:absolute;top:110px;left:70px;display:flex;align-items:center;gap:16px;font-weight:800;font-size:44px}.brand i{width:22px;height:22px;border-radius:50%;background:#ff5c8a}
.ad{position:absolute;top:116px;right:70px;padding:8px 20px;border-radius:99px;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.35);font-size:28px;font-weight:700;letter-spacing:.04em}
.scene{position:absolute;left:80px;right:170px;top:300px;bottom:460px;display:flex;flex-direction:column;justify-content:center;gap:34px;opacity:0}
.scene.cta{right:80px;align-items:center;text-align:center}
h1{margin:0;font-size:104px;line-height:1.06;font-weight:300;letter-spacing:-.03em}
p{margin:0;font-size:56px;line-height:1.2;color:#d6e4f0;font-weight:400}
.wd{display:inline-block;will-change:transform,opacity}
.em{font-weight:800;background:linear-gradient(120deg,#8fd3ff,#b69cff 48%,#ff5c8a);-webkit-background-clip:text;background-clip:text;color:transparent}
.icons{display:flex;gap:30px;margin-top:10px}
.ic{width:240px;height:184px;border-radius:44px;background:linear-gradient(160deg,#f1f8fe,#cfe2f2);display:grid;place-items:center;box-shadow:0 30px 70px -30px #000}.ic svg{width:76%;height:auto}
.logo-big{width:220px;height:220px;border-radius:64px;background:#0a2540;border:4px solid rgba(143,211,255,.4);display:grid;place-items:center;box-shadow:0 40px 100px -30px rgba(182,156,255,.8)}.logo-big i{width:64px;height:64px;border-radius:50%;background:#ff5c8a}
.cta h1{font-size:150px}.cta-box{display:flex;flex-direction:column;align-items:center;gap:30px}.url{font-size:40px;color:#cfe0ef}
.cta p{font-size:50px;font-weight:700;padding:24px 44px;max-width:900px;border-radius:99px;background:linear-gradient(120deg,#8fd3ff,#b69cff 48%,#ff5c8a);color:#0a2540}
.heart{font-size:260px;line-height:1;color:#ff5c8a;text-shadow:0 20px 80px rgba(255,92,138,.7)}
.pricecard{position:relative;padding:44px 48px;border-radius:44px;background:rgba(255,255,255,.08);border:3px solid rgba(143,211,255,.35);font-size:48px}
.pricecard .tag{position:absolute;top:-26px;left:44px;padding:6px 20px;border-radius:99px;background:#ffd166;color:#0a2540;font-size:30px;font-weight:800}
.pricecard .r{display:flex;justify-content:space-between;gap:30px;padding:10px 0}.pricecard s{color:#a3b6ca}.pricecard .big b{font-size:64px}
.pricecard .hl{color:#ffd166;font-weight:700}.pricecard .note{font-size:36px;color:#cfe0ef;border-top:2px solid rgba(255,255,255,.15);margin-top:10px;padding-top:20px}
.rows{display:flex;flex-direction:column;gap:22px}.row{display:flex;justify-content:space-between;gap:24px;padding:30px 40px;border-radius:32px;background:rgba(255,255,255,.07);border:2px solid rgba(143,211,255,.3);font-size:50px}.row b{background:linear-gradient(120deg,#8fd3ff,#ff5c8a);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800}
</style></head><body>
<div class="bg" id="bg"></div><div class="grid"></div><div class="snow" id="snow">${snow}</div>
<div class="bar">${scenes.map(() => '<b><i></i></b>').join('')}</div>
<div class="brand"><i></i>${config.name}</div><div class="ad">Reklam</div>
${scenes.map((s) => s.html).join('\n')}
<script>
const S=${JSON.stringify(scenes.map(({ start, dur }) => ({ start, dur })))};
const els=[...document.querySelectorAll('.scene')], bars=[...document.querySelectorAll('.bar i')], flakes=[...document.querySelectorAll('.snow i')];
const ease=(x)=>1-Math.pow(1-Math.min(1,Math.max(0,x)),3), back=(x)=>{x=Math.min(1,Math.max(0,x));const c=1.7;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
window.seek=(t)=>{
  document.getElementById('bg').style.transform='translate('+Math.sin(t/3)*40+'px,'+Math.cos(t/4)*50+'px) scale('+(1.05+Math.sin(t/5)*.04)+')';
  flakes.forEach((f)=>{const y=(+f.style.getPropertyValue('--y')/100*${H}+t*90*+f.style.getPropertyValue('--s'))%${H};f.style.transform='translate('+Math.sin(t+y/200)*20+'px,'+y+'px)'});
  S.forEach((s,i)=>{const el=els[i],l=t-s.start,o=s.start+s.dur-t;
    bars[i].style.width=(Math.min(1,Math.max(0,l/s.dur))*100)+'%';
    if(l<0||o<0){el.style.opacity=0;return}
    const inn=ease(l/.45), out=i===S.length-1?1:ease(o/.3);
    el.style.opacity=Math.min(inn,out); el.style.transform='translateY('+((1-inn)*60-(1-out)*40)+'px)';
    el.querySelectorAll('.wd').forEach((w,j)=>{const k=ease((l-j*.07)/.4);w.style.opacity=k;w.style.transform='translateY('+(1-k)*36+'px)';w.style.filter='blur('+(1-k)*10+'px)'});
    el.querySelectorAll('.ic,.logo-big,.heart,.pricecard,.row').forEach((x,j)=>{const k=back((l-.35-j*.12)/.5);x.style.opacity=Math.min(1,Math.max(0,(l-.35-j*.12)/.3));x.style.transform='scale('+(0.6+0.4*k)+') translateY('+Math.sin(l*2+j)*8+'px)'});
  });
};
</script></body></html>` };
}

const args = process.argv.slice(2);
const audioOnly = args.includes('--ljud');
const pick = args.map(Number).filter(Boolean);
const out = new URL('videos/', root);
await mkdir(new URL('silent/', out), { recursive: true });
const browser = await chromium.launch();
for (const [i, v] of VIDEOS.entries()) {
  if (pick.length && !pick.includes(i + 1)) continue;
  const { total, html, scenes } = pageHtml(v);
  const silent = new URL(`silent/${v.file}.mp4`, out).pathname;
  const file = new URL(`${v.file}.mp4`, out).pathname;
  if (!(audioOnly && existsSync(silent))) await renderVideo(v, total, html, silent);
  // Musik + effekter, synkade mot scenbytena
  const wav = new URL(`silent/${v.file}.wav`, out).pathname;
  await writeFile(wav, makeTrack({ duration: total, sceneStarts: scenes.map((s) => s.start), theme: v.theme, seed: i + 7 }));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', file]);
  await rm(wav);
  console.log(`videos/${v.file}.mp4 (${total.toFixed(1)} s, med ljud)`);
}
await browser.close();

function run(cmd, a) { return new Promise((r, j) => spawn(cmd, a, { stdio: 'inherit' }).on('close', (c) => (c === 0 ? r() : j(new Error(cmd + ' ' + c))))); }

async function renderVideo(v, total, html, file) {
  const page = await browser.newPage({ viewport: { width: W, height: H } }); // ny flik per video, annars krockar skripten
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.seek(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));
  await page.close();
}
