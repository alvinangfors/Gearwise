#!/usr/bin/env node
// Bygger den statiska sajten till dist/.
//
//   npm run build
//
// Indata:  site.config.json, data/catalog.json (redaktionellt), data/amazon.json (valfritt, från npm run fetch)
// Utdata:  dist/ – index, en sida per produkt, jämförelse, om, integritet, cookies, 404,
//          products.json, sitemap.xml, robots.txt, webmanifest, ikoner, typsnitt, CSS/JS.

import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { ICONS } from './lib/icons.mjs';
import { GUIDES } from './lib/guides.mjs';

const root = new URL('../', import.meta.url);
const r = (p) => readFile(new URL(p, root), 'utf8');
const config = JSON.parse(await r('site.config.json'));
const catalog = JSON.parse(await r('data/catalog.json'));
const amazonRaw = existsSync(new URL('data/amazon.json', root)) ? JSON.parse(await r('data/amazon.json')) : null;

const MAX_AGE = 24 * 3600 * 1000; // Amazon: pris/data får visas högst 24 h efter hämtning
const tag = process.env.AMAZON_PARTNER_TAG || config.partnerTag;
const base = ('/' + (config.basePath || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const origin = config.url.replace(/\/+$/, '');
const abs = (p = '') => origin + base + p;
const href = (p = '') => base + p;
const year = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);

// ---------- Säsong: jultema 15 nov–26 dec (config.season: "auto" | "jul" | "av") ----------
const NOW = new Date();
const inXmas = (d) => (d.getMonth() === 10 && d.getDate() >= 15) || (d.getMonth() === 11 && d.getDate() <= 26);
const JUL = config.season === 'jul' || (config.season !== 'av' && inXmas(NOW));
const YR = NOW.getFullYear();
const XMAS = new Date(`${YR}-12-24T00:00:00+01:00`);
const blackFriday = (y) => { const d = new Date(Date.UTC(y, 10, 1)); const firstThu = 1 + ((4 - d.getUTCDay() + 7) % 7); return new Date(Date.UTC(y, 10, firstThu + 22, 6)); };
const BF = blackFriday(YR);
const CM = new Date(BF.getTime() + 3 * 864e5);
const BF_OVER = NOW > new Date(CM.getTime() + 864e5);
const daysTo = (d) => Math.max(0, Math.ceil((d - NOW) / 864e5));
const dLong = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });

// ---------- Kontroller ----------
const warnings = [];
if (tag === 'gearwise-21') warnings.push('partnerTag är fortfarande exemplet "gearwise-21" – byt till ditt eget Associates-ID i site.config.json (eller AMAZON_PARTNER_TAG).');
if (/^\[.*\]$/.test(config.owner)) warnings.push('owner i site.config.json är en platshållare – integritetspolicyn måste ange vem som är personuppgiftsansvarig.');
if (config.contactEmail === 'hej@gearwise.se') warnings.push('contactEmail är platshållaren hej@gearwise.se – kontrollera att adressen fungerar.');
const cats = config.categories;
for (const p of catalog) {
  if (!cats.includes(p.cat)) throw new Error(`${p.slug}: kategorin "${p.cat}" finns inte i site.config.json`);
  if (!ICONS[p.icon]) throw new Error(`${p.slug}: ikonen "${p.icon}" finns inte`);
  if (p.asin && !/^[A-Z0-9]{10}$/.test(p.asin)) throw new Error(`${p.slug}: ogiltigt ASIN "${p.asin}"`);
  if (p.bestsellers && !/^[a-z-]+\/\d+$/.test(p.bestsellers)) throw new Error(`${p.slug}: ogiltig bestsellers-sökväg "${p.bestsellers}"`);
}
if (new Set(catalog.map((p) => p.slug)).size !== catalog.length) throw new Error('Dubbla slugs i catalog.json');

// ---------- Amazon-data (bara om den är färsk) ----------
let amazon = null;
if (amazonRaw) {
  const age = Date.now() - Date.parse(amazonRaw.fetchedAt);
  if (age < MAX_AGE) amazon = amazonRaw;
  else warnings.push(`data/amazon.json är ${Math.round(age / 3600000)} h gammal (> 24 h) – priser och API-bilder visas inte. Kör npm run fetch.`);
}
const dFmt = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Stockholm' });
const tFmt = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
const fetchedText = amazon ? `${dFmt.format(new Date(amazon.fetchedAt))} kl. ${tFmt.format(new Date(amazon.fetchedAt))}` : null;
const DISCLAIMER = 'Priser och tillgänglighet stämmer vid angiven tidpunkt och kan ändras. Det pris och den tillgänglighet som visas på Amazon.se vid köptillfället gäller för köpet.';

const LVL = ['', 'Budget', 'Mellanklass', 'Premium'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const catSlug = (c) => encodeURIComponent(c);

const products = catalog.map((p) => {
  const a = (amazon && p.asin && amazon.items[p.asin]) || null;
  const link = p.asin
    ? (a?.url || `${config.store}/dp/${encodeURIComponent(p.asin)}?tag=${encodeURIComponent(tag)}`)
    : p.bestsellers
      ? `${config.store}/gp/bestsellers/${p.bestsellers}?tag=${encodeURIComponent(tag)}`
      : `${config.store}/s?k=${encodeURIComponent(p.q)}&tag=${encodeURIComponent(tag)}`;
  const img = a?.img || (p.img ? { url: p.img } : null);
  return { ...p, a, link, img, level: LVL[p.lvl], price: a?.price?.display || null };
});

// ---------- Byggstenar ----------
const pic = (p, alt = '') => p.img
  ? `<img class="ph" src="${esc(p.img.url)}" alt="${esc(alt)}"${p.img.w ? ` width="${p.img.w}" height="${p.img.h}"` : ''} loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="fb" hidden>${ICONS[p.icon]}</span>`
  : ICONS[p.icon];

const priceBlock = (p) => p.price ? `<div class="price" data-price-ts="${amazon.fetchedAt}"><strong>${esc(p.price)}</strong>Amazon.se, ${esc(fetchedText)}
  <details><summary>Prisinfo</summary><p>${DISCLAIMER}</p></details></div>` : '';

const buy = (p, long = false) => `<a class="buy" href="${esc(p.link)}" target="_blank" rel="nofollow sponsored noopener">${long ? (p.asin ? 'Se pris på Amazon' : p.bestsellers ? 'Se topplistan på Amazon' : 'Se urval på Amazon') : 'Se på Amazon'} →</a>`;

const card = (p, vt = false, i = 0) => `<article class="card" data-reveal style="${vt ? `view-transition-name:c-${p.slug};` : ''}--i:${i % 4}" data-slug="${p.slug}" data-cat="${esc(p.cat)}" data-lvl="${p.lvl}" data-pop="${p.pop}" data-name="${esc(p.name)}" data-text="${esc((p.name + ' ' + p.why + ' ' + p.cat + ' ' + p.bullets.join(' ')).toLowerCase())}">
  <div class="pic"${vt ? ` style="view-transition-name:p-${p.slug}"` : ''}>${pic(p)}</div>
  ${(p.asin || p.pick) ? '<span class="badge">Vårt val</span>' : ''}
  <button class="heart" data-fav="${p.slug}" aria-pressed="false" aria-label="Spara ${esc(p.name)} som favorit">♥</button>
  <div class="body"><div class="meta"><span>${esc(p.cat)}</span><span>·</span><span class="lvl">${p.level}</span></div>
  <h3><a href="${href(`produkt/${p.slug}/`)}">${esc(p.name)}</a></h3><p>${esc(p.why)}</p>${priceBlock(p)}
  <div class="actions">${buy(p)}<button class="cmp" data-cmp="${p.slug}" aria-pressed="false" aria-label="Jämför ${esc(p.name)}">Jämför</button></div></div></article>`;

const css = (await r('src/style.css')).replace(/url\(fonts\//g, `url(${base}assets/fonts/`).replace(/\n\s*/g, '\n');
const js = await r('src/app.js');
const jsHash = createHash('sha256').update(js).digest('hex').slice(0, 10);
const jsFile = `assets/app.${jsHash}.js`;

function layout({ path, title, desc, body, page = '', jsonld = null, noindex = false, ogType = 'website' }) {
  const fullTitle = path === '' ? title : `${title} – ${config.name}`;
  const nav = [...(JUL ? [['🎁 Julklappar', 'julklappar/', 'julklappar']] : []), ['Butik', '#butik', 'butik'], ['Prylguiden', '#guiden', 'prylguiden'], ['Guider', 'guider/', 'guider'], ['Jämför', 'jamfor/', 'jamfor'], ...(JUL ? [] : [['Om oss', 'om/', 'om']])];
  const mnav = [...nav, ...(JUL ? [['Black Friday', 'black-friday/', 'black-friday'], ['Om oss', 'om/', 'om']] : [['Black Friday', 'black-friday/', 'black-friday']]), ['Frågor', '#fragor', 'fragor']];
  const favBtn = page === 'start'
    ? `<button class="favbtn" id="favToggle" aria-pressed="false">♥ Favoriter <b class="favcount">0</b></button>`
    : `<a class="favbtn" href="${href('?favoriter#butik')}">♥ Favoriter <b class="favcount">0</b></a>`;
  return `<!DOCTYPE html>
<html lang="sv" data-base="${base}"${JUL ? ' class="jul"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${abs(path)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}${config.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">\n` : ''}<meta name="theme-color" content="#0a2540">
<link rel="icon" href="${href('favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${href('favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${href('apple-touch-icon.png')}">
<link rel="manifest" href="${href('site.webmanifest')}">
<link rel="preload" href="${href('assets/fonts/hanken-grotesk-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<meta property="og:site_name" content="${esc(config.name)}">
<meta property="og:locale" content="sv_SE">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${abs(path)}">
<meta property="og:image" content="${abs('og.png')}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(config.name)} – teknik och gadgets">
<meta name="twitter:card" content="summary_large_image">
<script>document.documentElement.classList.add('js')</script>
<style>${css}</style>
<script src="${href(jsFile)}" defer></script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body data-page="${page}">
<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="progress" aria-hidden="true"></div>
<a class="skip" href="#main">Hoppa till innehållet</a>
${JUL ? '<div class="snow" aria-hidden="true"><i></i><i></i></div>' : ''}
<header class="top"><nav class="nav" aria-label="Huvudmeny">
  <a class="logo" href="${href()}"><i></i>${esc(config.name)}</a>
  <div class="links">${nav.map(([t, h, k]) => `<a href="${href(h)}"${k === page ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</div>
  ${favBtn}
  <button class="menubtn" id="menubtn" type="button" aria-expanded="false" aria-controls="mnav" aria-label="Meny"><span></span><span></span><span></span></button>
</nav>${JUL ? `<div class="garland" aria-hidden="true">${Array.from({ length: 32 }, (_, i) => `<b style="left:${i * 80 + 40}px"></b>`).join('')}</div>` : ''}</header>
<nav class="mnav" id="mnav" aria-label="Mobilmeny" hidden>${mnav.map(([t, h, k], i) => `<a href="${href(h)}" style="--i:${i}"${k === page ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
${JUL ? `<div class="xbar"><div class="wrap"><span>🎄 <b data-days="${XMAS.toISOString()}">${daysTo(XMAS)}</b> dagar kvar till julafton</span> <a href="${href('julklappar/')}">Julklappsguiden ${YR} →</a>${BF_OVER ? '' : ` <a href="${href('black-friday/')}">Black Friday ${BF.getUTCDate()} nov →</a>`}</div></div>` : ''}
<main id="main">
${body}
</main>
<footer class="band"><div class="wrap">
  <div>
    <a class="logo" href="${href()}"><i></i>${esc(config.name)}</a>
    <p class="disc">Som Amazon-partner tjänar ${esc(config.name)} på kvalificerade köp. Länkarna till Amazon är affiliatelänkar. Priser och tillgänglighet kan ändras; aktuella uppgifter finns alltid hos Amazon.</p>
  </div>
  <div><p>Kontakt: <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>
  <nav aria-label="Om sajten"><a href="${href('guider/')}">Guider</a><a href="${href('julklappar/')}">Julklappar</a><a href="${href('black-friday/')}">Black Friday</a><a href="${href('om/')}">Om oss</a><a href="${href('integritet/')}">Integritetspolicy</a><a href="${href('cookies/')}">Cookies</a></nav>
  ${JUL ? `<p class="godjul">God jul önskar ${esc(config.name)} ✨</p>` : ''}
  <p>© ${year} ${esc(config.name)}</p></div>
</div>
<div class="mega" aria-hidden="true">${[...config.name].map((ch, i) => `<span style="--i:${i}">${esc(ch)}</span>`).join('')}</div></footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="cur-ring" aria-hidden="true"></div><div class="cur-dot" aria-hidden="true"></div>
<button class="totop" id="totop" type="button" aria-label="Till toppen av sidan" hidden><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" fill="none" stroke="rgba(143,211,255,.2)" stroke-width="3"/><circle class="pr" cx="26" cy="26" r="22" fill="none" stroke="url(#tg)" stroke-width="3" stroke-linecap="round"/><defs><linearGradient id="tg"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#ff5c8a"/></linearGradient></defs><path d="M26 34V19M19 25l7-7 7 7" fill="none" stroke="#eef4fb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="cmpbar" id="cmpbar" hidden role="region" aria-label="Jämförelse"><span id="cmpn"></span><a href="${href('jamfor/')}">Jämför →</a><button type="button">Rensa</button></div>
</body>
</html>
`;
}

// ---------- Kategoritexter och Prylguiden ----------
const CAT_TEXT = {
  'Ljud': 'Hörlurar och högtalare för pendling, träning och fest.',
  'Laddning': 'Laddare, powerbanks och kablar som klarar allt.',
  'Smarta hemmet': 'Lampor, kontakter och kameror för ett smartare hem.',
  'Dator & kontor': 'Skönare skrivbord och skarpare videomöten.',
  'Resa & ute': 'Prylar som följer med på resan och äventyret.',
  'Hem & inredning': 'Tavlor, speglar, hyllor och mys för ett hem som känns som ditt.',
};
const SCENARIOS = [
  ['pendla', '🚆', 'Pendla', ['brusreducerande-horlurar', 'tradlosa-in-ear-horlurar', 'powerbank-20000', 'bluetooth-tracker']],
  ['trana', '🏃', 'Träna', ['smartklocka-gps', 'tradlosa-in-ear-horlurar', 'actionkamera-4k']],
  ['jobba', '💻', 'Jobba hemma', ['webbkamera', 'laptopstall-aluminium', 'ergonomisk-mus', 'mekaniskt-tangentbord', 'usb-c-hubb-7-i-1']],
  ['hemma', '🏠', 'Smartare hem', ['smart-hogtalare', 'smarta-led-lampor', 'smart-kontakt-energimatning', 'wifi-kamera-inomhus']],
  ['resa', '✈️', 'Resa', ['universell-reseadapter', 'powerbank-20000', 'bluetooth-tracker', 'brusreducerande-horlurar']],
  ['ladda', '⚡', 'Ladda allt', ['usb-c-laddare-65w', 'tradlos-laddstation-3-i-1', 'usb-c-kabel-flatad', 'powerbank-20000']],
  ['fest', '🎉', 'Fest & ute', ['bluetooth-hogtalare', 'actionkamera-4k', 'powerbank-20000']],
  ['inred', '🛋️', 'Inreda hemmet', ['posters-och-tavlor', 'tavelramar', 'vagghyllor', 'led-ljus', 'kuddfodral']],
];
const splitChars = (s) => s.split(' ').map((w, wi, arr) => `<span class="w">${[...w].map((ch, ci) => `<span class="ch" style="--c:${arr.slice(0, wi).join('').length + wi + ci}">${esc(ch)}</span>`).join('')}</span>`).join(' ');
const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
for (const [id, , , slugs] of SCENARIOS) for (const s of slugs) if (!bySlug[s]) throw new Error(`Prylguiden "${id}": produkten "${s}" finns inte`);
for (const c of cats) if (!CAT_TEXT[c]) warnings.push(`Kategorin "${c}" saknar text i CAT_TEXT.`);

const guideCard = (g, i = 0) => `<a class="gcard" data-reveal style="--i:${i % 3}" href="${href(`guider/${g.slug}/`)}"><span class="ge" aria-hidden="true">${g.emoji}</span><span class="kicker">${esc(g.kicker)}</span><b>${esc(g.title)}</b><span class="gd">${esc(g.desc)}</span><span class="more">Läs guiden <span aria-hidden="true">→</span></span></a>`;
for (const g of GUIDES) for (const s of g.products) if (!bySlug[s]) throw new Error(`Guiden "${g.slug}": produkten "${s}" finns inte`);
const GIFTS = [
  ['pendlaren', '🚆', 'Pendlaren', ['brusreducerande-horlurar', 'tradlosa-in-ear-horlurar', 'powerbank-20000', 'bluetooth-tracker']],
  ['inredaren', '🛋️', 'Inredaren', ['posters-och-tavlor', 'tavelramar', 'vaggspegel', 'kuddfodral', 'led-ljus']],
  ['traning', '🏃', 'Träningsnörden', ['smartklocka-gps', 'tradlosa-in-ear-horlurar', 'actionkamera-4k', 'bluetooth-hogtalare']],
  ['kontoret', '💻', 'Kontorsmänniskan', ['mekaniskt-tangentbord', 'ergonomisk-mus', 'webbkamera', 'laptopstall-aluminium']],
  ['resenaren', '✈️', 'Resenären', ['universell-reseadapter', 'powerbank-20000', 'bluetooth-tracker', 'brusreducerande-horlurar']],
  ['smarthem', '🏠', 'Smarta hem-fantasten', ['smart-hogtalare', 'smarta-led-lampor', 'smart-kontakt-energimatning', 'wifi-kamera-inomhus']],
];
for (const [id, , , slugs] of GIFTS) for (const s of slugs) if (!bySlug[s]) throw new Error(`Julklappar "${id}": produkten "${s}" finns inte`);

// ---------- Sidor ----------
const pages = new Map(); // sökväg (relativt base) -> html

// Startsidan
const heroSvg = (await r('src/hero.svg')).trim();
pages.set('', layout({
  path: '', page: 'start',
  title: `${config.name} – teknik & gadgets, handplockade`,
  desc: config.description,
  jsonld: { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: config.name, url: abs(), inLanguage: 'sv-SE' },
    { '@type': 'Organization', name: config.name, url: abs(), logo: abs('apple-touch-icon.png') },
  ] },
  body: `<section class="hero band"><canvas class="stars" id="stars" aria-hidden="true"></canvas><div class="wrap hero-grid">
  <div class="hero-copy">
    ${JUL ? `<a class="eyebrow" href="${href('julklappar/')}"><b>🎄 Jul</b> Julklappsguiden ${YR} är här →</a>` : `<a class="eyebrow" href="#guiden"><b>Nytt</b> Prylguiden – hitta rätt pryl snabbt →</a>`}
    <h1><span class="sr">Smarta prylar för ${JUL ? 'julen, ' : ''}pendlingen, träningen, hemmet, kontoret och resan</span><span aria-hidden="true">${splitChars('Smarta prylar')}<br>${splitChars('för')} <span class="rot" id="rot" data-words="${JUL ? 'julen|' : ''}pendlingen|träningen|hemmet|kontoret|resan|festen">${JUL ? 'julen' : 'pendlingen'}</span></span></h1>
    <p class="sub">Vi går igenom tekniken så att du slipper. Hitta rätt hörlurar, laddare eller smarta hem-prylar, och köp tryggt hos Amazon med deras leverans och returer.</p>
    <div class="ctas"><a class="cta magnetic" href="#butik">Utforska prylarna <span class="arr" aria-hidden="true">→</span></a><a class="ghost" href="#guiden">Starta Prylguiden</a></div>
    <div class="trust"><span>Frakt och returer via Amazon</span><span>Säker betalning</span><span>Köpguide för varje pryl</span></div>
  </div>
  ${heroSvg}
</div>
<div class="wrap stats">
  ${[[products.length, 'köpguider'], [cats.length, 'kategorier'], [0, 'cookies och spårare'], [0, 'kr extra för dig']].map(([n, l], i) => `<div class="stat" data-reveal style="--i:${i}"><b data-count="${n}">${n}</b><span>${l}</span></div>`).join('')}
</div>
</section>

<div class="marquee" aria-hidden="true">
  <div class="track">${[...products, ...products].map((p) => `<span>${esc(p.name)}</span>`).join('')}</div>
  <div class="track rev">${[...products, ...products].reverse().map((p) => `<span class="mi"><i>${ICONS[p.icon]}</i>${esc(p.cat)}</span>`).join('')}</div>
</div>

${JUL ? `<section class="band promo-band" aria-label="Säsong"><div class="wrap promo">
  <a class="promo-card xmas-card" data-reveal href="${href('julklappar/')}"><span class="pe" aria-hidden="true">🎁</span><span class="kicker">Julklappsguiden ${YR}</span><b>Julklappar till alla på listan</b><span>Pendlaren, inredaren, träningsnörden och kontorsmänniskan – handplockat och sorterat efter budget.</span><span class="go" aria-hidden="true">→</span></a>
  <a class="promo-card bf-card" data-reveal style="--i:1" href="${href('black-friday/')}"><span class="pe" aria-hidden="true">🏷️</span><span class="kicker">Black Friday ${BF.getUTCDate()} nov</span><b>${BF_OVER ? 'Tips för smart rea-shopping' : 'Handla smart på Black Friday'}</b><span>Så skiljer du riktiga erbjudanden från falska, och vilka prylar som är värda att vänta på.</span><span class="go" aria-hidden="true">→</span></a>
</div></section>` : ''}

<section class="band" id="kategorier" aria-labelledby="kat-h"><div class="wrap">
  <p class="kicker">Kategorier</p>
  <h2 id="kat-h">Utforska efter <span class="gt">kategori</span></h2>
  <p class="lede">${({ 4: 'Fyra', 5: 'Fem', 6: 'Sex', 7: 'Sju', 8: 'Åtta' })[cats.length] || cats.length} områden, handplockade prylar och en köpguide för varje.</p>
  <div class="bento">
  ${cats.map((c, i) => {
    const inCat = products.filter((p) => p.cat === c).sort((a, b) => b.pop - a.pop);
    return `<a class="tile" data-reveal style="--i:${i % 3}" data-cat="${esc(c)}" href="${href(`?kategori=${catSlug(c)}#butik`)}">
      <span class="n">${inCat.length} prylar</span>
      <div><h3>${esc(c)}</h3><p>${esc(CAT_TEXT[c] || '')}</p></div>
      <div class="icons" aria-hidden="true">${inCat.slice(0, 3).map((p) => `<span>${ICONS[p.icon]}</span>`).join('')}</div>
      <span class="go" aria-hidden="true">→</span></a>`;
  }).join('\n  ')}
  </div>
</div></section>

<section class="band" id="guiden" aria-labelledby="guide-h"><div class="wrap"><div class="quiz" data-reveal>
  <p class="kicker">Prylguiden</p>
  <h2 id="guide-h">Vad ska du <span class="gt">göra?</span></h2>
  <p class="lede" style="margin-bottom:8px">Välj det som passar dig, så visar vi prylarna som gör mest skillnad.</p>
  <div class="qtabs" role="tablist" aria-label="Vad ska du göra?">
  ${SCENARIOS.map(([id, e, label], i) => `<button class="qtab" role="tab" id="qt-${id}" aria-controls="qp-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="e" aria-hidden="true">${e}</span>${label}</button>`).join('')}
  </div>
  ${SCENARIOS.map(([id, , , slugs], i) => `<div class="qpanel" role="tabpanel" id="qp-${id}" aria-labelledby="qt-${id}"${i === 0 ? '' : ' hidden'}>
    ${slugs.map((s, j) => { const p = bySlug[s]; return `<a class="mini" style="--i:${j}" href="${href(`produkt/${p.slug}/`)}"><span class="ic" aria-hidden="true">${ICONS[p.icon]}</span><span><b>${esc(p.name)}</b><small>${esc(p.why)}</small></span></a>`; }).join('')}
  </div>`).join('\n  ')}
</div></div></section>

<div class="shop">
<div class="cats" id="butik"><div class="wrap" style="max-width:none">
  <div class="chips" id="chips" role="group" aria-label="Kategorier">${['Alla', ...cats].map((c) => `<button class="chip" data-c="${esc(c)}" aria-pressed="${c === 'Alla'}">${esc(c)}</button>`).join('')}</div>
  <div class="tools">
    <input type="search" id="q" placeholder="Sök prylar…" aria-label="Sök produkter">
    <select id="sort" aria-label="Sortera"><option value="pop">Populärast</option><option value="low">Prisklass: låg först</option><option value="high">Prisklass: hög först</option><option value="az">Namn A–Ö</option></select>
  </div>
</div></div>

<section class="band" aria-labelledby="prod-h"><div class="wrap">
  <h2 class="sr" id="prod-h">Alla prylar</h2>
  <p class="count" id="count" aria-live="polite">${products.length} prylar</p>
  <div class="grid" id="grid">
${[...products].sort((a, b) => b.pop - a.pop).map((p, i) => card(p, true, i)).join('\n')}
  <div class="empty" id="empty" hidden></div>
  </div>
</div></section>
</div>

<section class="band" id="sa-funkar-det" aria-labelledby="how-h"><div class="wrap">
  <p class="kicker">Så funkar det</p>
  <h2 id="how-h">Tre steg till <span class="gt">rätt pryl</span></h2>
  <div class="steps" data-reveal>
    <div class="step"><span class="no">1</span><h3>Hitta din pryl</h3><p>Bläddra efter kategori, sök eller fråga Prylguiden. Varje pryl har en köpguide om vad du ska tänka på och vem den passar.</p></div>
    <div class="step"><span class="no">2</span><h3>Köp hos Amazon</h3><p>Knappen tar dig till Amazon.se där du ser aktuellt pris, betyg och leveranstid.</p></div>
    <div class="step"><span class="no">3</span><h3>Amazon levererar</h3><p>Betalning, frakt, garanti och returer sköts av Amazon. Du handlar som vanligt.</p></div>
  </div>
</div></section>

<section class="band" id="guider-start" aria-labelledby="gs-h"><div class="wrap">
  <p class="kicker">Guider</p>
  <h2 id="gs-h">Lär dig välja <span class="gt">rätt</span></h2>
  <p class="lede">Korta guider som svarar på det folk faktiskt undrar.</p>
  <div class="ggrid">${GUIDES.slice(0, 3).map(guideCard).join('')}</div>
  <p style="margin-top:22px"><a class="ghost" href="${href('guider/')}">Alla guider →</a></p>
</div></section>

<section class="band" id="fragor" aria-labelledby="faq-h"><div class="wrap narrow">
  <p class="kicker">Frågor</p>
  <h2 id="faq-h">Vanliga <span class="gt">frågor</span></h2>
  <details class="faq"><summary>Säljer ${esc(config.name)} produkterna själva?</summary><p>Nej. Vi väljer ut och tipsar om produkter. Själva köpet görs hos Amazon, som står för betalning, leverans och kundservice.</p></details>
  <details class="faq"><summary>Kostar det mer att köpa via er?</summary><p>Nej, du betalar samma pris som om du gick direkt till Amazon. Vi kan få en liten provision från Amazon när du handlar.</p></details>
  <details class="faq"><summary>Var ser jag priset?</summary><p>När vi visar ett pris kommer det direkt från Amazon och är högst ett dygn gammalt. Tidpunkten står bredvid. Annars visar vi en ungefärlig prisklass. Det pris som gäller ser du alltid hos Amazon.</p></details>
  <details class="faq"><summary>Har ni testat allt?</summary><p>Våra köpguider handlar om vad du bör tänka på när du väljer. Vi skriver inga betyg och hittar aldrig på omdömen. Läs mer under <a href="${href('om/')}">Om oss</a>.</p></details>
  <details class="faq"><summary>Hur gör jag en retur?</summary><p>Returer görs via ditt Amazon-konto under Mina beställningar, enligt Amazons returvillkor.</p></details>
</div></section>`,
}));

// Produktsidor
for (const p of products) {
  const related = products.filter((x) => x.cat === p.cat && x.slug !== p.slug).sort((a, b) => b.pop - a.pop).slice(0, 3);
  const g = p.guide;
  pages.set(`produkt/${p.slug}/`, layout({
    path: `produkt/${p.slug}/`, page: 'produkt', ogType: 'article',
    title: `${p.name} – köpguide`,
    desc: `${p.why} Så väljer du rätt: ${g.consider.map((c) => c[0].toLowerCase()).slice(0, 3).join(', ')}.`,
    jsonld: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Start', item: abs() },
      { '@type': 'ListItem', position: 2, name: p.cat, item: abs(`?kategori=${catSlug(p.cat)}`) },
      { '@type': 'ListItem', position: 3, name: p.name, item: abs(`produkt/${p.slug}/`) },
    ] },
    body: `<div class="band"><div class="wrap">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="${href()}">Start</a><span aria-hidden="true">›</span><a href="${href(`?kategori=${catSlug(p.cat)}#butik`)}">${esc(p.cat)}</a><span aria-hidden="true">›</span><span aria-current="page">${esc(p.name)}</span></nav>
  <article class="prod">
    <div class="halo"><div class="pic" style="view-transition-name:p-${p.slug}">${pic(p, p.a?.title || p.name)}</div></div>
    <div class="pinfo">
      <div class="meta"><span>${esc(p.cat)}</span><span>·</span><span class="lvl">${p.level}</span></div>
      <h1>${esc(p.name)}</h1>
      <p class="lead">${esc(p.why)}</p>
      ${(p.a?.title || p.pick) ? `<p class="pick"><b>Vårt val</b> <span>${esc(p.a?.title || p.pick)}</span></p>` : ''}
      <ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      ${priceBlock(p)}
      <div class="actions" id="mainbuy">${buy(p, true)}
        <button class="btn2" data-fav="${p.slug}" aria-pressed="false" aria-label="Spara som favorit">♥ Spara</button>
        <button class="btn2" data-cmp="${p.slug}" aria-pressed="false" data-on="✓ Jämförs" data-off="Jämför">Jämför</button></div>
      ${!p.asin && p.bestsellers ? `<p class="hint">Länken går till Amazons bästsäljarlista för kategorin, sorterad efter vad som säljer mest just nu.</p>` : ''}
    </div>
  </article>
</div></div>

<section class="band" aria-labelledby="kg-h"><div class="wrap guide">
  <p class="kicker">Köpguide</p>
  <h2 id="kg-h">Så väljer du <span class="gt">rätt</span></h2>
  <p class="intro">${esc(g.intro)}</p>
  <div class="consider">
  ${g.consider.map(([h, tx], i) => `<div class="ccard" data-reveal style="--i:${i % 2}"><h3>${esc(h)}</h3><p>${esc(tx)}</p></div>`).join('\n  ')}
  </div>
  <div class="fit" data-reveal>
    <div><h3>Passar dig som…</h3><p>${esc(g.forWho)}</p></div>
    <div><h3>Hoppa över om…</h3><p>${esc(g.skipIf)}</p></div>
  </div>
  <p class="note">Vi sätter inga betyg och skriver inte kundomdömen. Guiden beskriver vad som skiljer olika modeller åt. Aktuella betyg från köpare finns hos Amazon. <a href="${href('om/')}">Så väljer vi prylar</a>.</p>
</div></section>

${related.length ? `<section class="band related" aria-labelledby="rel-h"><div class="wrap">
  <p class="kicker">Mer inom ${esc(p.cat.toLowerCase())}</p>
  <h2 id="rel-h">Fler <span class="gt">prylar</span></h2>
  <div class="grid">${related.map((x, i) => card(x, false, i)).join('\n')}</div>
</div></section>` : ''}
<div class="stickybuy" id="stickybuy" inert><b>${esc(p.pick || p.name)}</b>${buy(p)}</div>`,
  }));
}

// Julklappsguiden
{
  const byLvl = (l) => products.filter((p) => p.lvl === l).sort((a, b) => b.pop - a.pop);
  const tiers = [[1, '🧦', 'Mjuka paket i budgetklassen', 'Små klappar som gör stor skillnad i vardagen.'], [2, '🎁', 'Mellanklassen', 'Prylar som känns lyxiga utan att kosta skjortan.'], [3, '✨', 'Den stora klappen', 'När du verkligen vill imponera.']];
  pages.set('julklappar/', layout({
    path: 'julklappar/', page: 'julklappar', title: `Julklappsguiden ${YR} – tech och inredning`,
    desc: `Julklappstips ${YR}: handplockade prylar till pendlaren, inredaren, träningsnörden och kontorsmänniskan – sorterade efter budget.`,
    jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', name: `Julklappsguiden ${YR}`, itemListElement: products.filter((p) => p.asin || p.pick).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`produkt/${p.slug}/`), name: p.name })) },
    body: `<section class="band xhero"><div class="wrap">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="${href()}">Start</a><span aria-hidden="true">›</span><span aria-current="page">Julklappar</span></nav>
  <div class="xgrid">
    <div>
      <p class="kicker">Julklappsguiden ${YR}</p>
      <h1>Julklappar till <span class="gt">alla på listan</span></h1>
      <p class="lede">Handplockade prylar för pendlaren, inredaren, träningsnörden och den som jobbar hemma. Välj mottagare nedan eller bläddra efter budget.</p>
      <div class="ctas"><a class="cta magnetic" href="#mottagare">Hitta rätt klapp <span class="arr" aria-hidden="true">→</span></a><a class="ghost" href="#budget">Efter budget</a></div>
    </div>
    <div class="xcount" data-reveal><span class="xbig" data-days="${XMAS.toISOString()}">${daysTo(XMAS)}</span><span>dagar kvar till julafton</span><span class="xgift" aria-hidden="true">🎁</span></div>
  </div>
</div></section>

<section class="band" id="mottagare" aria-labelledby="mot-h"><div class="wrap"><div class="quiz" data-reveal>
  <p class="kicker">Till vem?</p>
  <h2 id="mot-h">Vem ska få <span class="gt">klappen?</span></h2>
  <div class="qtabs" role="tablist" aria-label="Vem ska få klappen?">
  ${GIFTS.map(([id, e, label], i) => `<button class="qtab" role="tab" id="gt-${id}" aria-controls="gp-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="e" aria-hidden="true">${e}</span>${label}</button>`).join('')}
  </div>
  ${GIFTS.map(([id, , , slugs], i) => `<div class="qpanel" role="tabpanel" id="gp-${id}" aria-labelledby="gt-${id}"${i === 0 ? '' : ' hidden'}>
    ${slugs.map((s, j) => { const p = bySlug[s]; return `<a class="mini" style="--i:${j}" href="${href(`produkt/${p.slug}/`)}"><span class="ic" aria-hidden="true">${ICONS[p.icon]}</span><span><b>${esc(p.pick || p.name)}</b><small>${esc(p.why)}</small></span></a>`; }).join('')}
  </div>`).join('\n  ')}
</div></div></section>

<div id="budget"></div>
${tiers.map(([l, e, h, sub]) => `<section class="band" aria-labelledby="t${l}-h"><div class="wrap">
  <p class="kicker">${LVL[l]}</p>
  <h2 id="t${l}-h"><span aria-hidden="true">${e}</span> ${h}</h2>
  <p class="lede">${sub}</p>
  <div class="grid">${byLvl(l).map((p, i) => card(p, false, i)).join('\n')}</div>
</div></section>`).join('\n')}

<section class="band" aria-labelledby="xt-h"><div class="wrap guide">
  <p class="kicker">Smarta tips</p>
  <h2 id="xt-h">Så lyckas du med <span class="gt">julklapparna</span></h2>
  <div class="consider">
    <div class="ccard" data-reveal><h3>Beställ i tid</h3><p>Leveranstiden skiljer sig mellan produkter och säljare. Kolla det beräknade leveransdatumet hos Amazon innan du beställer, särskilt veckan före jul.</p></div>
    <div class="ccard" data-reveal style="--i:1"><h3>Tänk på returer</h3><p>Är du osäker på storlek, färg eller om mottagaren redan har prylen? Läs Amazons returvillkor innan du köper, så vet du vad som gäller om något behöver bytas.</p></div>
    <div class="ccard" data-reveal><h3>Kolla kompatibiliteten</h3><p>Klockor, trackers och smarta högtalare fungerar inte alltid med alla mobiler. Läs köpguiden för prylen innan du köper.</p></div>
    <div class="ccard" data-reveal style="--i:1"><h3>Spara dina idéer</h3><p>Tryck på ♥ på prylarna du funderar på, så hittar du dem under Favoriter när det är dags att bestämma dig.</p></div>
  </div>
  <p class="note">Vi visar inga påhittade betyg eller rabatter. Aktuella priser och leveranstider ser du alltid hos Amazon.</p>
</div></section>`,
  }));
}

// Black Friday
pages.set('black-friday/', layout({
  path: 'black-friday/', page: 'black-friday', title: `Black Friday ${YR} – så handlar du smart`,
  desc: `Black Friday ${YR} är ${dLong.format(BF)}. Så känner du igen riktiga erbjudanden, vad lägsta 30-dagarspris betyder och vilka prylar som är värda att vänta på.`,
  body: `<section class="band xhero bf"><div class="wrap">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="${href()}">Start</a><span aria-hidden="true">›</span><span aria-current="page">Black Friday</span></nav>
  <div class="xgrid">
    <div>
      <p class="kicker">Black Friday ${YR}</p>
      <h1>${BF_OVER ? 'Rea-shoppa' : 'Black Friday'} – <span class="gt">handla smart</span></h1>
      <p class="lede">${BF_OVER ? `Black Friday ${YR} är över, men tipsen gäller varje rea.` : `Black Friday infaller ${dLong.format(BF)} och Cyber Monday ${dLong.format(CM)}. Många butiker kör erbjudanden hela veckan.`} Här är hur du skiljer riktiga fynd från falska – och vilka prylar som är värda att hålla koll på.</p>
      <div class="ctas"><a class="cta magnetic" href="${esc(`${config.store}/gp/goldbox?tag=${encodeURIComponent(tag)}`)}" target="_blank" rel="nofollow sponsored noopener">Se Amazons erbjudanden <span class="arr" aria-hidden="true">→</span></a><a class="ghost" href="#bf-prylar">Prylar att bevaka</a></div>
    </div>
    <div class="xcount bfcount" data-reveal>${BF_OVER ? `<span class="xbig">${YR + 1}</span><span>Nästa Black Friday</span>` : `<span class="xbig" data-days="${BF.toISOString()}">${daysTo(BF)}</span><span>dagar kvar till Black Friday</span>`}<span class="xgift" aria-hidden="true">🏷️</span></div>
  </div>
</div></section>

<section class="band" aria-labelledby="bft-h"><div class="wrap guide">
  <p class="kicker">Fem regler</p>
  <h2 id="bft-h">Så känner du igen ett <span class="gt">riktigt fynd</span></h2>
  <div class="consider">
    <div class="ccard" data-reveal><h3>Jämför med lägsta 30-dagarspriset</h3><p>När en butik i Sverige annonserar en prissänkning ska den enligt prisinformationslagen även visa det lägsta pris varan haft de senaste 30 dagarna. Det är det priset rabatten ska jämföras med.</p></div>
    <div class="ccard" data-reveal style="--i:1"><h3>Gör en lista innan</h3><p>Bestäm vad du behöver innan rean börjar. Då är det lättare att låta bli erbjudanden på saker du egentligen inte ville ha.</p></div>
    <div class="ccard" data-reveal><h3>Jämför modeller, inte bara procent</h3><p>En stor rabatt på fel produkt är ingen vinst. Läs köpguiden och välj rätt typ av pryl först – sedan priset.</p></div>
    <div class="ccard" data-reveal style="--i:1"><h3>Kolla säljaren och returvillkoren</h3><p>På Amazon kan samma produkt säljas av olika säljare. Se vem som säljer och skickar varan, och vilka returvillkor som gäller.</p></div>
  </div>
  <p class="note">Vi hittar aldrig på rabatter. Aktuella priser och erbjudanden ser du hos Amazon. Spara prylarna du bevakar med ♥, så hittar du dem snabbt när rean drar igång.</p>
</div></section>

<section class="band" id="bf-prylar" aria-labelledby="bfp-h"><div class="wrap">
  <p class="kicker">Att bevaka</p>
  <h2 id="bfp-h">Prylar värda att <span class="gt">hålla koll på</span></h2>
  <div class="grid">${[...products].sort((a, b) => (!!(b.asin || b.pick) - !!(a.asin || a.pick)) || b.pop - a.pop).slice(0, 12).map((p, i) => card(p, false, i)).join('\n')}</div>
</div></section>`,
}));

// Guider
pages.set('guider/', layout({
  path: 'guider/', page: 'guider', title: 'Guider – välj rätt pryl',
  desc: 'Korta, faktabaserade guider: powerbank på flyget, hur många watt laddaren behöver, tavelvägg, ergonomi och mysbelysning.',
  body: `<section class="band"><div class="wrap">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="${href()}">Start</a><span aria-hidden="true">›</span><span aria-current="page">Guider</span></nav>
  <p class="kicker">Guider</p>
  <h1 class="pageh">Lär dig välja <span class="gt">rätt</span></h1>
  <p class="lede">Korta guider som svarar på det folk faktiskt undrar – utan reklamsnack.</p>
  <div class="ggrid">${GUIDES.map(guideCard).join('')}</div>
</div></section>`,
}));
for (const g of GUIDES) {
  const prods = g.products.map((s) => bySlug[s]);
  const others = GUIDES.filter((x) => x !== g).slice(0, 3);
  pages.set(`guider/${g.slug}/`, layout({
    path: `guider/${g.slug}/`, page: 'guider', ogType: 'article', title: g.title, desc: g.desc,
    jsonld: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'Article', headline: g.title, description: g.desc, inLanguage: 'sv-SE', dateModified: today, author: { '@type': 'Organization', name: config.name }, publisher: { '@type': 'Organization', name: config.name, logo: { '@type': 'ImageObject', url: abs('apple-touch-icon.png') } }, mainEntityOfPage: abs(`guider/${g.slug}/`) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Start', item: abs() },
        { '@type': 'ListItem', position: 2, name: 'Guider', item: abs('guider/') },
        { '@type': 'ListItem', position: 3, name: g.title, item: abs(`guider/${g.slug}/`) },
      ] },
    ] },
    body: `<article class="band"><div class="wrap article">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="${href()}">Start</a><span aria-hidden="true">›</span><a href="${href('guider/')}">Guider</a><span aria-hidden="true">›</span><span aria-current="page">${esc(g.title)}</span></nav>
  <p class="kicker"><span aria-hidden="true">${g.emoji}</span> ${esc(g.kicker)}</p>
  <h1 class="pageh">${esc(g.title)}</h1>
  <p class="lede">${esc(g.desc)}</p>
  ${g.sections.map(([h, ps], i) => `<section class="asec" data-reveal><h2><span class="an" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${esc(h)}</h2>${ps.map((x) => `<p>${esc(x)}</p>`).join('')}</section>`).join('\n  ')}
  <p class="note">Guiden beskriver allmänna fakta och tumregler. Kontrollera alltid tillverkarens och, där det gäller, myndighetens eller flygbolagets aktuella regler.</p>
</div></article>
<section class="band" aria-labelledby="gp-h"><div class="wrap">
  <p class="kicker">Prylar i guiden</p>
  <h2 id="gp-h">Läs mer om <span class="gt">prylarna</span></h2>
  <div class="grid">${prods.map((p, i) => card(p, false, i)).join('\n')}</div>
</div></section>
<section class="band" aria-labelledby="go-h"><div class="wrap">
  <p class="kicker">Fler guider</p>
  <h2 id="go-h">Läs <span class="gt">vidare</span></h2>
  <div class="ggrid">${others.map(guideCard).join('')}</div>
</div></section>`,
  }));
}

// Jämför
pages.set('jamfor/', layout({
  path: 'jamfor/', page: 'jamfor', title: 'Jämför prylar',
  desc: 'Jämför 2–3 prylar sida vid sida: prisklass, egenskaper, vem de passar och vad du ska tänka på.',
  body: `<div class="band"><div class="wrap">
  <div class="prose"><p class="kicker">Jämför</p><h1>Jämför <span class="gt">prylar</span></h1><p>Välj upp till tre prylar och se dem sida vid sida. Ditt val sparas bara i din webbläsare.</p></div>
  <div id="cmp-root" aria-live="polite"><noscript>Jämförelsen kräver JavaScript. Du kan läsa varje pryls köpguide via <a href="${href('#butik')}">butiken</a>.</noscript></div>
</div></div>`,
}));

// Om oss
const prose = (h) => `<div class="band"><div class="wrap prose">${h}</div></div>`;
pages.set('om/', layout({
  path: 'om/', page: 'om', title: 'Om oss och hur vi väljer prylar',
  desc: `Hur ${config.name} väljer produkter, hur vi tjänar pengar och varför vi inte visar betyg.`,
  body: prose(`<h1>Om ${esc(config.name)}</h1>
<p>${esc(config.name)} är en liten guide till teknik och prylar för vardagen. Vi samlar de produkttyper som många behöver och förklarar vad du ska tänka på innan du köper.</p>
<h2>Hur vi tjänar pengar</h2>
<p>Som Amazon-partner tjänar ${esc(config.name)} på kvalificerade köp. När du klickar på en Amazon-länk och handlar får vi en provision från Amazon. Du betalar samma pris som annars. Provisionen påverkar inte vad vi skriver i köpguiderna.</p>
<h2>Hur vi väljer</h2>
<p>Vi utgår från vad folk faktiskt behöver: laddare som klarar flera prylar, hörlurar för pendling, smarta hem-prylar som är enkla att komma igång med. För varje produkttyp skriver vi en köpguide om vad som skiljer modellerna åt, vem den passar och när du hellre ska välja något annat.</p>
<h2>Det här gör vi inte</h2>
<ul>
<li>Vi hittar aldrig på betyg, recensioner eller kundomdömen.</li>
<li>Vi påstår inte att vi har testat en produkt om vi inte har gjort det.</li>
<li>Vi visar bara priser som kommer direkt från Amazon. De är högst ett dygn gamla och har tidpunkten utskriven.</li>
</ul>
<h2>Kontakt</h2>
<p>Har du synpunkter eller hittar något som är fel? Mejla <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>.</p>`),
}));

// Integritetspolicy
const ownerLine = `${esc(config.owner)}${config.ownerOrgNr ? `, org.nr ${esc(config.ownerOrgNr)}` : ''}`;
pages.set('integritet/', layout({
  path: 'integritet/', page: 'integritet', title: 'Integritetspolicy',
  desc: `Så hanterar ${config.name} personuppgifter: vad som sparas, vad som delas med Amazon och dina rättigheter.`,
  body: prose(`<h1>Integritetspolicy</h1>
<p>Senast uppdaterad ${esc(config.policyUpdated)}.</p>
<h2>Kort sammanfattning</h2>
<p>${esc(config.name)} har inga användarkonton, inga formulär, inga analysverktyg och inga reklamcookies. Vi samlar inte in några personuppgifter om dig när du besöker sajten. Det som behöver förklaras är ditt webbhotell, produktbilder och länkarna till Amazon.</p>
<h2>Personuppgiftsansvarig</h2>
<p>${ownerLine}. Kontakt: <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>.</p>
<h2>Det som sparas i din webbläsare</h2>
<p>Dina favoriter och de prylar du valt att jämföra sparas i webbläsarens lokala lagring (localStorage) på din egen enhet. Uppgifterna skickas aldrig till oss och du kan radera dem när som helst genom att rensa webbplatsdata i webbläsaren. Lagringen behövs för funktioner som du själv använder och kräver därför inget samtycke enligt lagen om elektronisk kommunikation. Se också vår <a href="${href('cookies/')}">cookiesida</a>.</p>
<h2>Webbhotell och serverloggar</h2>
<p>Sajten drivs hos ${esc(config.hosting)}. Som för alla webbplatser behandlar webbhotellet tekniska uppgifter som IP-adress och webbläsartyp när sidorna skickas till dig, och sparar dem en kortare tid i loggar för drift och säkerhet. Den rättsliga grunden är vårt berättigade intresse av en säker och fungerande webbplats (artikel 6.1 f i dataskyddsförordningen).</p>
<h2>Produktbilder från Amazon</h2>
<p>Produktbilder visas direkt från Amazons servrar och lagras inte hos oss. När en sådan bild laddas tar Amazon emot din IP-adress och teknisk information om webbläsaren, på samma sätt som när du besöker en webbplats.</p>
<h2>När du klickar vidare till Amazon</h2>
<p>Länkarna till Amazon.se är affiliatelänkar. När du klickar på en länk lämnar du ${esc(config.name)}. Amazon använder cookies för att se att du kom från oss, så att vi kan få provision om du handlar. Amazon ansvarar själva för den behandlingen enligt sitt integritetsmeddelande, som du hittar längst ner på amazon.se. Vi får bara sammanställd statistik om vilka produkter som köpts via våra länkar, aldrig uppgifter om vem som har köpt.</p>
<h2>Om du mejlar oss</h2>
<p>Om du kontaktar oss via e-post använder vi din adress och det du skriver för att svara dig. Vi raderar mejlet när ärendet är avslutat, om vi inte behöver spara det av rättsliga skäl. Den rättsliga grunden är vårt berättigade intresse av att kunna svara på frågor.</p>
<h2>Dina rättigheter</h2>
<p>Du har rätt att begära tillgång till, rättelse eller radering av dina personuppgifter, att begära begränsning av behandlingen och att invända mot den. Kontakta oss på adressen ovan. Om du är missnöjd med hur vi hanterar personuppgifter kan du klaga hos Integritetsskyddsmyndigheten (IMY), <a href="https://www.imy.se">imy.se</a>.</p>
<h2>Ändringar</h2>
<p>Om vi ändrar policyn, till exempel för att lägga till statistik, uppdaterar vi den här sidan och datumet ovan. Om en ändring kräver ditt samtycke frågar vi först.</p>`),
}));

// Cookies
pages.set('cookies/', layout({
  path: 'cookies/', page: 'cookies', title: 'Cookies och lokal lagring',
  desc: `${config.name} sätter inga cookies. Här ser du vad som sparas lokalt och vad som händer hos Amazon.`,
  body: prose(`<h1>Cookies och lokal lagring</h1>
<p><strong>${esc(config.name)} sätter inga egna cookies</strong> och använder inga analys- eller annonsverktyg. Därför visar vi ingen cookiebanner.</p>
<h2>Lokal lagring i din webbläsare</h2>
<table><thead><tr><th>Namn</th><th>Vad det gör</th><th>Hur länge</th></tr></thead><tbody>
<tr><td><code>gw-favs</code></td><td>Kommer ihåg dina favoriter (♥).</td><td>Tills du tar bort dem eller rensar webbläsaren</td></tr>
<tr><td><code>gw-cmp</code></td><td>Kommer ihåg vilka prylar du valt att jämföra.</td><td>Tills du rensar jämförelsen eller webbläsaren</td></tr>
</tbody></table>
<p>Uppgifterna finns bara på din enhet och skickas aldrig till oss. Lagringen behövs för funktioner du själv använder och kräver därför inget samtycke enligt lagen om elektronisk kommunikation.</p>
<h2>Amazon</h2>
<p>När du klickar på en länk till Amazon.se kan Amazon sätta cookies, bland annat för att se att du kom från ${esc(config.name)}. Det sker på Amazons webbplats och styrs av Amazons egna cookievillkor och inställningar. Produktbilder hämtas från Amazons servrar, läs mer i vår <a href="${href('integritet/')}">integritetspolicy</a>.</p>
<h2>Så rensar du</h2>
<p>Du kan radera lokal lagring i webbläsarens inställningar under webbplatsdata eller cookies och webbplatsdata. Favoriterna och jämförelsen försvinner då.</p>`),
}));

// 404
const notFound = layout({
  path: '404.html', page: '404', title: 'Sidan finns inte', noindex: true,
  desc: 'Sidan du letade efter finns inte.',
  body: prose(`<p class="e404 gt" aria-hidden="true">404</p><h1>Hoppsan – sidan finns inte</h1><p>Länken kan vara gammal eller felstavad.</p><p><a class="cta" href="${href()}">Till butiken <span class="arr" aria-hidden="true">→</span></a></p>`),
});

// ---------- Skriv ut ----------
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(new URL('assets/', dist), { recursive: true });
const out = async (p, s) => { const u = new URL(p, dist); await mkdir(new URL('./', u), { recursive: true }); await writeFile(u, s); };

for (const [p, html] of pages) await out(p + 'index.html', html);
await out('404.html', notFound);
await out(jsFile, js);
await cp(new URL('static/', root), dist, { recursive: true });

await out('products.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  amazonFetchedAt: amazon?.fetchedAt || null,
  amazonFetchedAtText: fetchedText,
  priceDisclaimer: DISCLAIMER,
  products: products.map((p) => ({
    slug: p.slug, name: p.name, cat: p.cat, level: p.level, why: p.why, bullets: p.bullets, guide: p.guide,
    asin: p.asin || null, title: p.a?.title || p.pick || null, link: p.link, img: p.img?.url || null, price: p.price, icon: ICONS[p.icon],
  })),
}));

const urls = [...pages.keys()];
await out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${abs(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
await out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);
await out('site.webmanifest', JSON.stringify({
  name: config.name, short_name: config.name, start_url: base, display: 'standalone', lang: 'sv',
  background_color: '#0a2540', theme_color: '#0a2540',
  icons: [{ src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' }, { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' }, { src: `${base}favicon.svg`, sizes: 'any', type: 'image/svg+xml' }],
}, null, 2));
const host = new URL(origin).host;
if (!host.endsWith('github.io') && !host.endsWith('netlify.app') && !host.endsWith('vercel.app')) await out('CNAME', host + '\n');

console.log(`Byggt ${pages.size + 1} sidor till dist/ (${products.filter((p) => p.price).length} med pris från Amazon${fetchedText ? `, hämtat ${fetchedText}` : ''}).`);
for (const w of warnings) console.warn(`⚠ ${w}`);
