#!/usr/bin/env node
// Bygger den statiska sajten till dist/ – på svenska (roten) och engelska (/en/).
//
//   npm run build
//
// Indata:  site.config.json, data/catalog.json (sv), data/catalog.en.json (en),
//          data/amazon.json (valfritt, från npm run fetch), scripts/lib/{guides,guides.en,strings,icons}.mjs
// Utdata:  dist/ – alla sidor på två språk med hreflang, products.json per språk,
//          sitemap.xml, robots.txt, webmanifest, ikoner, typsnitt, CSS/JS.

import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { ICONS } from './lib/icons.mjs';
import { GUIDES } from './lib/guides.mjs';
import { GUIDES_EN } from './lib/guides.en.mjs';
import { S, CAT_EN } from './lib/strings.mjs';

const root = new URL('../', import.meta.url);
const r = (p) => readFile(new URL(p, root), 'utf8');
const config = JSON.parse(await r('site.config.json'));
const catalog = JSON.parse(await r('data/catalog.json'));
const catalogEn = JSON.parse(await r('data/catalog.en.json'));
const amazonRaw = existsSync(new URL('data/amazon.json', root)) ? JSON.parse(await r('data/amazon.json')) : null;

const MAX_AGE = 24 * 3600 * 1000; // Amazon: pris/data får visas högst 24 h efter hämtning
const tag = process.env.AMAZON_PARTNER_TAG || config.partnerTag;
const base = ('/' + (config.basePath || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const origin = config.url.replace(/\/+$/, '');
const abs = (p = '') => origin + base + p;
const href = (p = '') => base + p;
const year = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const catSlug = (c) => encodeURIComponent(c);
const gt = ([a, b]) => `${esc(a)}<span class="gt">${esc(b)}</span>`; // rubrik med gradientord

// ---------- Språk ----------
const LANGS = {
  sv: { code: 'sv', pre: '', og: 'sv_SE', inLang: 'sv-SE', locale: 'sv-SE',
    P: { product: 'produkt', compare: 'jamfor', about: 'om', privacy: 'integritet', cookies: 'cookies', gifts: 'julklappar', bf: 'black-friday', guides: 'guider' } },
  en: { code: 'en', pre: 'en/', og: 'en_GB', inLang: 'en', locale: 'en-GB',
    P: { product: 'product', compare: 'compare', about: 'about', privacy: 'privacy', cookies: 'cookies', gifts: 'gifts', bf: 'black-friday', guides: 'guides' } },
};
const route = (L, k, slug) => (k === 'home' ? L.pre : `${L.pre}${L.P[k]}/${slug ? slug + '/' : ''}`);

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
const dLong = (L) => new Intl.DateTimeFormat(L.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });

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
  const en = catalogEn[p.slug];
  if (!en) throw new Error(`${p.slug}: saknar engelsk översättning i data/catalog.en.json`);
  for (const k of ['slug', 'name', 'why', 'bullets', 'guide']) if (!en[k]) throw new Error(`${p.slug}: engelska fältet "${k}" saknas`);
  if (p.pick && !en.pick) warnings.push(`${p.slug}: har "pick" men saknar engelsk "pick" – den svenska används.`);
}
for (const c of cats) { if (!CAT_EN[c]) throw new Error(`Kategorin "${c}" saknar engelskt namn i CAT_EN`); for (const l of ['sv', 'en']) if (!S[l].catText[c]) warnings.push(`Kategorin "${c}" saknar text (${l}).`); }
for (const g of GUIDES) if (!GUIDES_EN[g.slug]) throw new Error(`Guiden "${g.slug}" saknar engelsk version`);
if (new Set(catalog.map((p) => p.slug)).size !== catalog.length) throw new Error('Dubbla slugs i catalog.json');
if (new Set(Object.values(catalogEn).map((e) => e.slug)).size !== Object.keys(catalogEn).length) throw new Error('Dubbla engelska slugs i catalog.en.json');

// ---------- Amazon-data (bara om den är färsk) ----------
let amazon = null;
if (amazonRaw) {
  const age = Date.now() - Date.parse(amazonRaw.fetchedAt);
  if (age < MAX_AGE) amazon = amazonRaw;
  else warnings.push(`data/amazon.json är ${Math.round(age / 3600000)} h gammal (> 24 h) – priser och API-bilder visas inte. Kör npm run fetch.`);
}
const fetchedText = (L) => {
  if (!amazon) return null;
  const d = new Date(amazon.fetchedAt);
  const df = new Intl.DateTimeFormat(L.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Stockholm' });
  const tf = new Intl.DateTimeFormat(L.locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
  return S[L.code].fetched(df.format(d), tf.format(d));
};

// ---------- Produkter (gemensamt) och per språk ----------
const baseProducts = catalog.map((p) => {
  const a = (amazon && p.asin && amazon.items[p.asin]) || null;
  const link = p.asin
    ? (a?.url || `${config.store}/dp/${encodeURIComponent(p.asin)}?tag=${encodeURIComponent(tag)}`)
    : p.bestsellers
      ? `${config.store}/gp/bestsellers/${p.bestsellers}?tag=${encodeURIComponent(tag)}`
      : `${config.store}/s?k=${encodeURIComponent(p.q)}&tag=${encodeURIComponent(tag)}`;
  const img = a?.img || (p.img ? { url: p.img } : null);
  return { ...p, id: p.slug, a, link, img, price: a?.price?.display || null };
});
const productsFor = (L) => baseProducts.map((p) => {
  const t = L.code === 'en' ? catalogEn[p.id] : null;
  return {
    ...p,
    name: t ? t.name : p.name, why: t ? t.why : p.why, bullets: t ? t.bullets : p.bullets, guide: t ? t.guide : p.guide,
    pick: t ? (t.pick || p.pick || null) : (p.pick || null),
    catName: t ? CAT_EN[p.cat] : p.cat, level: S[L.code].lvl[p.lvl],
    url: route(L, 'product', t ? t.slug : p.slug),
  };
});
const guidesFor = (L) => GUIDES.map((g) => {
  const t = L.code === 'en' ? GUIDES_EN[g.slug] : null;
  return { ...g, ...(t || {}), id: g.slug, url: route(L, 'guides', t ? t.slug : g.slug) };
});

// ---------- Prylguiden och julklappar ----------
const SCENARIOS = [
  ['pendla', '🚆', ['brusreducerande-horlurar', 'tradlosa-in-ear-horlurar', 'powerbank-20000', 'bluetooth-tracker']],
  ['trana', '🏃', ['smartklocka-gps', 'tradlosa-in-ear-horlurar', 'actionkamera-4k']],
  ['jobba', '💻', ['webbkamera', 'laptopstall-aluminium', 'ergonomisk-mus', 'mekaniskt-tangentbord', 'usb-c-hubb-7-i-1']],
  ['hemma', '🏠', ['smart-hogtalare', 'smarta-led-lampor', 'smart-kontakt-energimatning', 'wifi-kamera-inomhus']],
  ['resa', '✈️', ['universell-reseadapter', 'powerbank-20000', 'bluetooth-tracker', 'brusreducerande-horlurar']],
  ['ladda', '⚡', ['usb-c-laddare-65w', 'tradlos-laddstation-3-i-1', 'usb-c-kabel-flatad', 'powerbank-20000']],
  ['fest', '🎉', ['bluetooth-hogtalare', 'actionkamera-4k', 'powerbank-20000']],
  ['inred', '🛋️', ['posters-och-tavlor', 'tavelramar', 'vagghyllor', 'led-ljus', 'kuddfodral']],
];
const GIFTS = [
  ['pendlaren', '🚆', ['brusreducerande-horlurar', 'tradlosa-in-ear-horlurar', 'powerbank-20000', 'bluetooth-tracker']],
  ['inredaren', '🛋️', ['posters-och-tavlor', 'tavelramar', 'vaggspegel', 'kuddfodral', 'led-ljus']],
  ['traning', '🏃', ['smartklocka-gps', 'tradlosa-in-ear-horlurar', 'actionkamera-4k', 'bluetooth-hogtalare']],
  ['kontoret', '💻', ['mekaniskt-tangentbord', 'ergonomisk-mus', 'webbkamera', 'laptopstall-aluminium']],
  ['resenaren', '✈️', ['universell-reseadapter', 'powerbank-20000', 'bluetooth-tracker', 'brusreducerande-horlurar']],
  ['smarthem', '🏠', ['smart-hogtalare', 'smarta-led-lampor', 'smart-kontakt-energimatning', 'wifi-kamera-inomhus']],
];
{
  const ids = new Set(catalog.map((p) => p.slug));
  for (const [id, , list] of [...SCENARIOS, ...GIFTS]) for (const s of list) if (!ids.has(s)) throw new Error(`"${id}": produkten "${s}" finns inte`);
  for (const g of GUIDES) for (const s of g.products) if (!ids.has(s)) throw new Error(`Guiden "${g.slug}": produkten "${s}" finns inte`);
}
const splitChars = (s) => s.split(' ').map((w, wi, arr) => `<span class="w">${[...w].map((ch, ci) => `<span class="ch" style="--c:${arr.slice(0, wi).join('').length + wi + ci}">${esc(ch)}</span>`).join('')}</span>`).join(' ');

const css = (await r('src/style.css')).replace(/url\(fonts\//g, `url(${base}assets/fonts/`).replace(/\n\s*/g, '\n');
const js = await r('src/app.js');
const jsHash = createHash('sha256').update(js).digest('hex').slice(0, 10);
const jsFile = `assets/app.${jsHash}.js`;
const heroSvg = (await r('src/hero.svg')).trim();

// ---------- Sidor ----------
const pages = new Map(); // sökväg (relativt base) -> html
const sitemap = [];

for (const L of Object.values(LANGS)) {
  const T = S[L.code];
  const O = L.code === 'sv' ? LANGS.en : LANGS.sv; // det andra språket
  const products = productsFor(L);
  const guides = guidesFor(L);
  const bySlug = Object.fromEntries(products.map((p) => [p.id, p]));
  const otherProducts = Object.fromEntries(productsFor(O).map((p) => [p.id, p]));
  const otherGuides = Object.fromEntries(guidesFor(O).map((g) => [g.id, g]));
  const fetched = fetchedText(L);
  const R = (k, s) => route(L, k, s);
  const H = (p = '') => href(p);

  // ----- Byggstenar -----
  const pic = (p, alt = '') => p.img
    ? `<img class="ph" src="${esc(p.img.url)}" alt="${esc(alt)}"${p.img.w ? ` width="${p.img.w}" height="${p.img.h}"` : ''} loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="fb" hidden>${ICONS[p.icon]}</span>`
    : ICONS[p.icon];
  const priceBlock = (p) => p.price ? `<div class="price" data-price-ts="${amazon.fetchedAt}"><strong>${esc(p.price)}</strong>Amazon.se, ${esc(fetched)}
  <details><summary>${T.priceInfo}</summary><p>${T.disclaimer}</p></details></div>` : '';
  const buy = (p, long = false) => `<a class="buy" href="${esc(p.link)}" target="_blank" rel="nofollow sponsored noopener">${long ? (p.asin ? T.buyPrice : p.bestsellers ? T.buyBest : T.buySearch) : T.buyShort} →</a>`;
  const card = (p, vt = false, i = 0) => `<article class="card" data-reveal style="${vt ? `view-transition-name:c-${p.id};` : ''}--i:${i % 4}" data-slug="${p.id}" data-cat="${esc(p.cat)}" data-lvl="${p.lvl}" data-pop="${p.pop}" data-name="${esc(p.name)}" data-text="${esc((p.name + ' ' + p.why + ' ' + p.catName + ' ' + p.bullets.join(' ')).toLowerCase())}">
  <div class="pic"${vt ? ` style="view-transition-name:p-${p.id}"` : ''}>${pic(p)}</div>
  ${(p.asin || p.pick) ? `<span class="badge">${T.ourPick}</span>` : ''}
  <button class="heart" data-fav="${p.id}" aria-pressed="false" aria-label="${esc(T.saveFav(p.name))}">♥</button>
  <div class="body"><div class="meta"><span>${esc(p.catName)}</span><span>·</span><span class="lvl">${p.level}</span></div>
  <h3><a href="${H(p.url)}">${esc(p.name)}</a></h3><p>${esc(p.why)}</p>${priceBlock(p)}
  <div class="actions">${buy(p)}<button class="cmp" data-cmp="${p.id}" data-on="${T.comparing.replace('✓ ', '')}" data-off="${T.compare}" aria-pressed="false" aria-label="${esc(T.compareX(p.name))}">${T.compare}</button></div></div></article>`;
  const guideCard = (g, i = 0) => `<a class="gcard" data-reveal style="--i:${i % 3}" href="${H(g.url)}"><span class="ge" aria-hidden="true">${g.emoji}</span><span class="kicker">${esc(g.kicker)}</span><b>${esc(g.title)}</b><span class="gd">${esc(g.desc)}</span><span class="more">${T.readGuide} <span aria-hidden="true">→</span></span></a>`;
  const prose = (h) => `<div class="band"><div class="wrap prose">${h}</div></div>`;
  const crumbs = (items) => `<nav class="crumbs" aria-label="${T.crumbs}"><a href="${H(R('home'))}">${T.home}</a>${items.map(([t, u]) => `<span aria-hidden="true">›</span>${u ? `<a href="${H(u)}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`}`).join('')}</nav>`;

  // ----- Sidram -----
  function layout({ path, alt, title, desc, body, page = '', jsonld = null, noindex = false, ogType = 'website' }) {
    const fullTitle = path === L.pre ? title : `${title} – ${config.name}`;
    const nav = [...(JUL ? [[T.nav.gifts, R('gifts'), 'gifts']] : []), [T.nav.shop, `${R('home')}#butik`, 'shop'], [T.nav.finder, `${R('home')}#guiden`, 'finder'], [T.nav.guides, R('guides'), 'guides'], [T.nav.compare, R('compare'), 'compare'], ...(JUL ? [] : [[T.nav.about, R('about'), 'about']])];
    const mnav = [...nav, [T.nav.bf, R('bf'), 'bf'], ...(JUL ? [[T.nav.about, R('about'), 'about']] : []), [T.nav.faq, `${R('home')}#fragor`, 'faq']];
    const favBtn = page === 'start'
      ? `<button class="favbtn" id="favToggle" aria-pressed="false"><span aria-hidden="true">♥</span> <span class="fl">${T.favs}</span> <b class="favcount">0</b></button>`
      : `<a class="favbtn" href="${H(R('home') + '?favoriter#butik')}"><span aria-hidden="true">♥</span> <span class="fl">${T.favs}</span> <b class="favcount">0</b></a>`;
    const alts = alt ? `<link rel="alternate" hreflang="sv" href="${abs(alt.sv)}">\n<link rel="alternate" hreflang="en" href="${abs(alt.en)}">\n<link rel="alternate" hreflang="x-default" href="${abs(alt.sv)}">\n` : '';
    if (!noindex) sitemap.push(path);
    return `<!DOCTYPE html>
<html lang="${L.code}" data-base="${base}" data-pre="${L.pre}"${JUL ? ' class="jul"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${abs(path)}">
${alts}${noindex ? '<meta name="robots" content="noindex">\n' : ''}${config.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">\n` : ''}<meta name="theme-color" content="#0a2540">
<link rel="icon" href="${H('favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${H('favicon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${H('apple-touch-icon.png')}">
<link rel="manifest" href="${H('site.webmanifest')}">
<link rel="preload" href="${H('assets/fonts/hanken-grotesk-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<meta property="og:site_name" content="${esc(config.name)}">
<meta property="og:locale" content="${L.og}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${abs(path)}">
<meta property="og:image" content="${abs('og.png')}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(config.name)}">
<meta name="twitter:card" content="summary_large_image">
<script>document.documentElement.classList.add('js')</script>
<style>${css}</style>
<script src="${H(jsFile)}" defer></script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body data-page="${page}">
<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="progress" aria-hidden="true"></div>
<a class="skip" href="#main">${T.skip}</a>
${JUL ? '<div class="snow" aria-hidden="true"><i></i><i></i></div>' : ''}
<header class="top"><nav class="nav" aria-label="${T.mainMenu}">
  <a class="logo" href="${H(R('home'))}"><i></i>${esc(config.name)}</a>
  <div class="links">${nav.map(([t, h, k]) => `<a href="${H(h)}"${k === page ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</div>
  ${alt ? `<a class="lang" href="${H(alt[O.code])}" hreflang="${O.code}" lang="${O.code}" aria-label="${T.langSwitchLabel}">${T.langSwitch}</a>` : ''}
  ${favBtn}
  <button class="menubtn" id="menubtn" type="button" aria-expanded="false" aria-controls="mnav" aria-label="${T.menu}"><span></span><span></span><span></span></button>
</nav>${JUL ? `<div class="garland" aria-hidden="true">${Array.from({ length: 32 }, (_, i) => `<b style="left:${i * 80 + 40}px"></b>`).join('')}</div>` : ''}</header>
<nav class="mnav" id="mnav" aria-label="${T.mobileMenu}" hidden>${mnav.map(([t, h, k], i) => `<a href="${H(h)}" style="--i:${i}"${k === page ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
${JUL ? `<div class="xbar"><div class="wrap"><span>🎄 <b data-days="${XMAS.toISOString()}">${daysTo(XMAS)}</b> ${T.xbarDays}</span> <a href="${H(R('gifts'))}">${T.xbarGuide(YR)}</a>${BF_OVER ? '' : ` <a href="${H(R('bf'))}">${T.xbarBf(BF.getUTCDate())}</a>`}</div></div>` : ''}
<main id="main">
${body}
</main>
<footer class="band"><div class="wrap">
  <div>
    <a class="logo" href="${H(R('home'))}"><i></i>${esc(config.name)}</a>
    <p class="disc">${T.disc(esc(config.name))}</p>
  </div>
  <div><p>${T.contact}: <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>
  <nav aria-label="${T.aboutSite}"><a href="${H(R('guides'))}">${T.nav.guides}</a><a href="${H(R('gifts'))}">${T.gifts}</a><a href="${H(R('bf'))}">Black Friday</a><a href="${H(R('about'))}">${T.nav.about}</a><a href="${H(R('privacy'))}">${T.privacy}</a><a href="${H(R('cookies'))}">${T.cookies}</a>${alt ? `<a href="${H(alt[O.code])}" hreflang="${O.code}" lang="${O.code}">${O.code === 'en' ? 'English' : 'Svenska'}</a>` : ''}</nav>
  ${JUL ? `<p class="godjul">${T.merry(esc(config.name))}</p>` : ''}
  <p>© ${year} ${esc(config.name)}</p></div>
</div>
<div class="mega" aria-hidden="true">${[...config.name].map((ch, i) => `<span style="--i:${i}">${esc(ch)}</span>`).join('')}</div></footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="cur-ring" aria-hidden="true"></div><div class="cur-dot" aria-hidden="true"></div>
<button class="totop" id="totop" type="button" aria-label="${T.toTop}" hidden><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" fill="none" stroke="rgba(143,211,255,.2)" stroke-width="3"/><circle class="pr" cx="26" cy="26" r="22" fill="none" stroke="url(#tg)" stroke-width="3" stroke-linecap="round"/><defs><linearGradient id="tg"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#ff5c8a"/></linearGradient></defs><path d="M26 34V19M19 25l7-7 7 7" fill="none" stroke="#eef4fb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="cmpbar" id="cmpbar" hidden role="region" aria-label="${T.comparison}"><span id="cmpn"></span><a href="${H(R('compare'))}">${T.compareGo}</a><button type="button">${T.clear}</button></div>
</body>
</html>
`;
  }
  const pair = (k, slugSv, slugEn) => ({ sv: route(LANGS.sv, k, slugSv), en: route(LANGS.en, k, slugEn ?? slugSv) });

  // ----- Startsidan -----
  pages.set(R('home'), layout({
    path: R('home'), alt: pair('home'), page: 'start', title: T.homeTitle(config.name), desc: T.homeDesc,
    jsonld: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebSite', name: config.name, url: abs(R('home')), inLanguage: L.inLang },
      { '@type': 'Organization', name: config.name, url: abs(), logo: abs('apple-touch-icon.png') },
    ] },
    body: `<section class="hero band"><canvas class="stars" id="stars" aria-hidden="true"></canvas><div class="wrap hero-grid">
  <div class="hero-copy">
    ${JUL ? `<a class="eyebrow" href="${H(R('gifts'))}"><b>${T.eyeJul}</b> ${T.eyeJulText(YR)}</a>` : `<a class="eyebrow" href="#guiden"><b>${T.eyeNew}</b> ${T.eyeNewText}</a>`}
    <h1><span class="sr">${esc(T.h1sr(JUL))}</span><span aria-hidden="true">${splitChars(T.h1a)}<br>${splitChars(T.h1b)} <span class="rot" id="rot" data-words="${esc(T.words(JUL))}">${esc(T.words(JUL).split('|')[0])}</span></span></h1>
    <p class="sub">${T.sub}</p>
    <div class="ctas"><a class="cta magnetic" href="#butik">${T.ctaExplore} <span class="arr" aria-hidden="true">→</span></a><a class="ghost" href="#guiden">${T.ctaFinder}</a></div>
    <div class="trust">${T.trust.map((x) => `<span>${x}</span>`).join('')}</div>
  </div>
  ${heroSvg}
</div>
<div class="wrap stats">
  ${[[products.length, T.stats[0]], [cats.length, T.stats[1]], [0, T.stats[2]], [0, T.stats[3]]].map(([n, l], i) => `<div class="stat" data-reveal style="--i:${i}"><b data-count="${n}">${n}</b><span>${l}</span></div>`).join('')}
</div>
</section>

<div class="marquee" aria-hidden="true">
  <div class="track">${[...products, ...products].map((p) => `<span>${esc(p.name)}</span>`).join('')}</div>
  <div class="track rev">${[...products, ...products].reverse().map((p) => `<span class="mi"><i>${ICONS[p.icon]}</i>${esc(p.catName)}</span>`).join('')}</div>
</div>

${JUL ? `<section class="band promo-band" aria-label="${T.season}"><div class="wrap promo">
  <a class="promo-card xmas-card" data-reveal href="${H(R('gifts'))}"><span class="pe" aria-hidden="true">🎁</span><span class="kicker">${T.promoGiftK(YR)}</span><b>${T.promoGiftT}</b><span>${T.promoGiftS}</span><span class="go" aria-hidden="true">→</span></a>
  <a class="promo-card bf-card" data-reveal style="--i:1" href="${H(R('bf'))}"><span class="pe" aria-hidden="true">🏷️</span><span class="kicker">${T.promoBfK(BF.getUTCDate())}</span><b>${T.promoBfT(BF_OVER)}</b><span>${T.promoBfS}</span><span class="go" aria-hidden="true">→</span></a>
</div></section>` : ''}

<section class="band" id="kategorier" aria-labelledby="kat-h"><div class="wrap">
  <p class="kicker">${T.catsK}</p>
  <h2 id="kat-h">${gt(T.catsH)}</h2>
  <p class="lede">${T.catsLede(T.numWord[cats.length] || cats.length)}</p>
  <div class="bento">
  ${cats.map((c, i) => {
    const inCat = products.filter((p) => p.cat === c).sort((a, b) => b.pop - a.pop);
    return `<a class="tile" data-reveal style="--i:${i % 3}" data-cat="${esc(c)}" href="${H(`${R('home')}?kategori=${catSlug(c)}#butik`)}">
      <span class="n">${T.nItems(inCat.length)}</span>
      <div><h3>${esc(L.code === 'en' ? CAT_EN[c] : c)}</h3><p>${esc(T.catText[c] || '')}</p></div>
      <div class="icons" aria-hidden="true">${inCat.slice(0, 3).map((p) => `<span>${ICONS[p.icon]}</span>`).join('')}</div>
      <span class="go" aria-hidden="true">→</span></a>`;
  }).join('\n  ')}
  </div>
</div></section>

<section class="band" id="guiden" aria-labelledby="guide-h"><div class="wrap"><div class="quiz" data-reveal>
  <p class="kicker">${T.finderK}</p>
  <h2 id="guide-h">${gt(T.finderH)}</h2>
  <p class="lede" style="margin-bottom:8px">${T.finderLede}</p>
  <div class="qtabs" role="tablist" aria-label="${T.finderAria}">
  ${SCENARIOS.map(([id, e], i) => `<button class="qtab" role="tab" id="qt-${id}" aria-controls="qp-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="e" aria-hidden="true">${e}</span>${T.scen[id]}</button>`).join('')}
  </div>
  ${SCENARIOS.map(([id, , slugs], i) => `<div class="qpanel" role="tabpanel" id="qp-${id}" aria-labelledby="qt-${id}"${i === 0 ? '' : ' hidden'}>
    ${slugs.map((s, j) => { const p = bySlug[s]; return `<a class="mini" style="--i:${j}" href="${H(p.url)}"><span class="ic" aria-hidden="true">${ICONS[p.icon]}</span><span><b>${esc(p.name)}</b><small>${esc(p.why)}</small></span></a>`; }).join('')}
  </div>`).join('\n  ')}
</div></div></section>

<div class="shop">
<div class="cats" id="butik"><div class="wrap" style="max-width:none">
  <div class="chips" id="chips" role="group" aria-label="${T.catsAria}">${['Alla', ...cats].map((c) => `<button class="chip" data-c="${esc(c)}" aria-pressed="${c === 'Alla'}">${esc(c === 'Alla' ? T.all : (L.code === 'en' ? CAT_EN[c] : c))}</button>`).join('')}</div>
  <div class="tools">
    <input type="search" id="q" placeholder="${T.search}" aria-label="${T.searchAria}">
    <select id="sort" aria-label="${T.sortAria}">${['pop', 'low', 'high', 'az'].map((v, i) => `<option value="${v}">${T.sort[i]}</option>`).join('')}</select>
  </div>
</div></div>

<section class="band" aria-labelledby="prod-h"><div class="wrap">
  <h2 class="sr" id="prod-h">${T.allGear}</h2>
  <p class="count" id="count" aria-live="polite">${T.nItems(products.length)}</p>
  <div class="grid" id="grid">
${[...products].sort((a, b) => b.pop - a.pop).map((p, i) => card(p, true, i)).join('\n')}
  <div class="empty" id="empty" hidden></div>
  </div>
</div></section>
</div>

<section class="band" id="sa-funkar-det" aria-labelledby="how-h"><div class="wrap">
  <p class="kicker">${T.howK}</p>
  <h2 id="how-h">${gt(T.howH)}</h2>
  <div class="steps" data-reveal>
    ${T.steps.map(([h, p], i) => `<div class="step"><span class="no">${i + 1}</span><h3>${h}</h3><p>${p}</p></div>`).join('\n    ')}
  </div>
</div></section>

<section class="band" id="guider-start" aria-labelledby="gs-h"><div class="wrap">
  <p class="kicker">${T.guidesK}</p>
  <h2 id="gs-h">${gt(T.guidesH)}</h2>
  <p class="lede">${T.guidesLede}</p>
  <div class="ggrid">${guides.slice(0, 3).map(guideCard).join('')}</div>
  <p style="margin-top:22px"><a class="ghost" href="${H(R('guides'))}">${T.allGuides}</a></p>
</div></section>

<section class="band" id="fragor" aria-labelledby="faq-h"><div class="wrap narrow">
  <p class="kicker">${T.faqK}</p>
  <h2 id="faq-h">${gt(T.faqH)}</h2>
  ${T.faq(esc(config.name), H(R('about'))).map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('\n  ')}
</div></section>`,
  }));

  // ----- Produktsidor -----
  for (const p of products) {
    const related = products.filter((x) => x.cat === p.cat && x.id !== p.id).sort((a, b) => b.pop - a.pop).slice(0, 3);
    const g = p.guide;
    const altP = { [L.code]: p.url, [O.code]: otherProducts[p.id].url };
    pages.set(p.url, layout({
      path: p.url, alt: altP, page: 'produkt', ogType: 'article',
      title: T.prodTitle(p.name),
      desc: T.prodDesc(p.why, g.consider.map((c) => c[0].toLowerCase()).slice(0, 3).join(', ')),
      jsonld: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: T.home, item: abs(R('home')) },
        { '@type': 'ListItem', position: 2, name: p.catName, item: abs(`${R('home')}?kategori=${catSlug(p.cat)}`) },
        { '@type': 'ListItem', position: 3, name: p.name, item: abs(p.url) },
      ] },
      body: `<div class="band"><div class="wrap">
  ${crumbs([[p.catName, `${R('home')}?kategori=${catSlug(p.cat)}#butik`], [p.name]])}
  <article class="prod">
    <div class="halo"><div class="pic" style="view-transition-name:p-${p.id}">${pic(p, p.a?.title || p.name)}</div></div>
    <div class="pinfo">
      <div class="meta"><span>${esc(p.catName)}</span><span>·</span><span class="lvl">${p.level}</span></div>
      <h1>${esc(p.name)}</h1>
      <p class="lead">${esc(p.why)}</p>
      ${(p.a?.title || p.pick) ? `<p class="pick"><b>${T.ourPick}</b> <span>${esc(p.a?.title || p.pick)}</span></p>` : ''}
      <ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      ${priceBlock(p)}
      <div class="actions" id="mainbuy">${buy(p, true)}
        <button class="btn2" data-fav="${p.id}" aria-pressed="false" aria-label="${T.saveAria}">${T.save}</button>
        <button class="btn2" data-cmp="${p.id}" aria-pressed="false" data-on="${T.comparing}" data-off="${T.compare}">${T.compare}</button></div>
      ${!p.asin && p.bestsellers ? `<p class="hint">${T.hintBest}</p>` : ''}
    </div>
  </article>
</div></div>

<section class="band" aria-labelledby="kg-h"><div class="wrap guide">
  <p class="kicker">${T.guideK}</p>
  <h2 id="kg-h">${gt(T.guideH)}</h2>
  <p class="intro">${esc(g.intro)}</p>
  <div class="consider">
  ${g.consider.map(([h, tx], i) => `<div class="ccard" data-reveal style="--i:${i % 2}"><h3>${esc(h)}</h3><p>${esc(tx)}</p></div>`).join('\n  ')}
  </div>
  <div class="fit" data-reveal>
    <div><h3>${T.fitYes}</h3><p>${esc(g.forWho)}</p></div>
    <div><h3>${T.fitNo}</h3><p>${esc(g.skipIf)}</p></div>
  </div>
  <p class="note">${T.prodNote(H(R('about')))}</p>
</div></section>

${related.length ? `<section class="band related" aria-labelledby="rel-h"><div class="wrap">
  <p class="kicker">${esc(T.moreIn(p.catName))}</p>
  <h2 id="rel-h">${gt(T.moreH)}</h2>
  <div class="grid">${related.map((x, i) => card(x, false, i)).join('\n')}</div>
</div></section>` : ''}
<div class="stickybuy" id="stickybuy" inert><b>${esc(p.pick || p.name)}</b>${buy(p)}</div>`,
    }));
  }

  // ----- Julklappar -----
  {
    const byLvl = (l) => products.filter((p) => p.lvl === l).sort((a, b) => b.pop - a.pop);
    pages.set(R('gifts'), layout({
      path: R('gifts'), alt: pair('gifts'), page: 'gifts', title: T.giftTitle(YR), desc: T.giftDesc(YR),
      jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', name: T.giftK(YR), itemListElement: products.filter((p) => p.asin || p.pick).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(p.url), name: p.name })) },
      body: `<section class="band xhero"><div class="wrap">
  ${crumbs([[T.giftCrumb]])}
  <div class="xgrid">
    <div>
      <p class="kicker">${T.giftK(YR)}</p>
      <h1>${gt(T.giftH)}</h1>
      <p class="lede">${T.giftLede}</p>
      <div class="ctas"><a class="cta magnetic" href="#mottagare">${T.giftCta} <span class="arr" aria-hidden="true">→</span></a><a class="ghost" href="#budget">${T.giftCta2}</a></div>
    </div>
    <div class="xcount" data-reveal><span class="xbig" data-days="${XMAS.toISOString()}">${daysTo(XMAS)}</span><span>${T.giftDays}</span><span class="xgift" aria-hidden="true">🎁</span></div>
  </div>
</div></section>

<section class="band" id="mottagare" aria-labelledby="mot-h"><div class="wrap"><div class="quiz" data-reveal>
  <p class="kicker">${T.giftWhoK}</p>
  <h2 id="mot-h">${gt(T.giftWhoH)}</h2>
  <div class="qtabs" role="tablist" aria-label="${T.giftWhoAria}">
  ${GIFTS.map(([id, e], i) => `<button class="qtab" role="tab" id="gt-${id}" aria-controls="gp-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="e" aria-hidden="true">${e}</span>${T.giftWho[id]}</button>`).join('')}
  </div>
  ${GIFTS.map(([id, , slugs], i) => `<div class="qpanel" role="tabpanel" id="gp-${id}" aria-labelledby="gt-${id}"${i === 0 ? '' : ' hidden'}>
    ${slugs.map((s, j) => { const p = bySlug[s]; return `<a class="mini" style="--i:${j}" href="${H(p.url)}"><span class="ic" aria-hidden="true">${ICONS[p.icon]}</span><span><b>${esc(p.pick || p.name)}</b><small>${esc(p.why)}</small></span></a>`; }).join('')}
  </div>`).join('\n  ')}
</div></div></section>

<div id="budget"></div>
${T.tiers.map(([e, h, sub], i) => { const l = i + 1; return `<section class="band" aria-labelledby="t${l}-h"><div class="wrap">
  <p class="kicker">${T.lvl[l]}</p>
  <h2 id="t${l}-h"><span aria-hidden="true">${e}</span> ${h}</h2>
  <p class="lede">${sub}</p>
  <div class="grid">${byLvl(l).map((p, j) => card(p, false, j)).join('\n')}</div>
</div></section>`; }).join('\n')}

<section class="band" aria-labelledby="xt-h"><div class="wrap guide">
  <p class="kicker">${T.giftTipsK}</p>
  <h2 id="xt-h">${gt(T.giftTipsH)}</h2>
  <div class="consider">
    ${T.giftTips.map(([h, p], i) => `<div class="ccard" data-reveal style="--i:${i % 2}"><h3>${h}</h3><p>${p}</p></div>`).join('\n    ')}
  </div>
  <p class="note">${T.noFake}</p>
</div></section>`,
    }));
  }

  // ----- Black Friday -----
  pages.set(R('bf'), layout({
    path: R('bf'), alt: pair('bf'), page: 'bf', title: T.bfTitle(YR), desc: T.bfDesc(YR, dLong(L).format(BF)),
    body: `<section class="band xhero bf"><div class="wrap">
  ${crumbs([['Black Friday']])}
  <div class="xgrid">
    <div>
      <p class="kicker">${T.bfK(YR)}</p>
      <h1>${gt(T.bfH(BF_OVER))}</h1>
      <p class="lede">${T.bfLede(BF_OVER, YR, dLong(L).format(BF), dLong(L).format(CM))}</p>
      <div class="ctas"><a class="cta magnetic" href="${esc(`${config.store}/gp/goldbox?tag=${encodeURIComponent(tag)}`)}" target="_blank" rel="nofollow sponsored noopener">${T.bfCta} <span class="arr" aria-hidden="true">→</span></a><a class="ghost" href="#bf-prylar">${T.bfCta2}</a></div>
    </div>
    <div class="xcount bfcount" data-reveal>${BF_OVER ? `<span class="xbig">${YR + 1}</span><span>${T.bfNext}</span>` : `<span class="xbig" data-days="${BF.toISOString()}">${daysTo(BF)}</span><span>${T.bfDays}</span>`}<span class="xgift" aria-hidden="true">🏷️</span></div>
  </div>
</div></section>

<section class="band" aria-labelledby="bft-h"><div class="wrap guide">
  <p class="kicker">${T.bfRulesK}</p>
  <h2 id="bft-h">${gt(T.bfRulesH)}</h2>
  <div class="consider">
    ${T.bfRules.map(([h, p], i) => `<div class="ccard" data-reveal style="--i:${i % 2}"><h3>${h}</h3><p>${p}</p></div>`).join('\n    ')}
  </div>
  <p class="note">${T.bfNote}</p>
</div></section>

<section class="band" id="bf-prylar" aria-labelledby="bfp-h"><div class="wrap">
  <p class="kicker">${T.bfWatchK}</p>
  <h2 id="bfp-h">${gt(T.bfWatchH)}</h2>
  <div class="grid">${[...products].sort((a, b) => (!!(b.asin || b.pick) - !!(a.asin || a.pick)) || b.pop - a.pop).slice(0, 12).map((p, i) => card(p, false, i)).join('\n')}</div>
</div></section>`,
  }));

  // ----- Guider -----
  pages.set(R('guides'), layout({
    path: R('guides'), alt: pair('guides'), page: 'guides', title: T.gTitle, desc: T.gDesc,
    body: `<section class="band"><div class="wrap">
  ${crumbs([[T.nav.guides]])}
  <p class="kicker">${T.guidesK}</p>
  <h1 class="pageh">${gt(T.guidesH)}</h1>
  <p class="lede">${T.gLede}</p>
  <div class="ggrid">${guides.map(guideCard).join('')}</div>
</div></section>`,
  }));
  for (const g of guides) {
    const prods = g.products.map((s) => bySlug[s]);
    const others = guides.filter((x) => x.id !== g.id).slice(0, 3);
    pages.set(g.url, layout({
      path: g.url, alt: { [L.code]: g.url, [O.code]: otherGuides[g.id].url }, page: 'guides', ogType: 'article', title: g.title, desc: g.desc,
      jsonld: { '@context': 'https://schema.org', '@graph': [
        { '@type': 'Article', headline: g.title, description: g.desc, inLanguage: L.inLang, dateModified: today, author: { '@type': 'Organization', name: config.name }, publisher: { '@type': 'Organization', name: config.name, logo: { '@type': 'ImageObject', url: abs('apple-touch-icon.png') } }, mainEntityOfPage: abs(g.url) },
        { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: T.home, item: abs(R('home')) },
          { '@type': 'ListItem', position: 2, name: T.nav.guides, item: abs(R('guides')) },
          { '@type': 'ListItem', position: 3, name: g.title, item: abs(g.url) },
        ] },
      ] },
      body: `<article class="band"><div class="wrap article">
  ${crumbs([[T.nav.guides, R('guides')], [g.title]])}
  <p class="kicker"><span aria-hidden="true">${g.emoji}</span> ${esc(g.kicker)}</p>
  <h1 class="pageh">${esc(g.title)}</h1>
  <p class="lede">${esc(g.desc)}</p>
  ${g.sections.map(([h, ps], i) => `<section class="asec" data-reveal><h2><span class="an" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${esc(h)}</h2>${ps.map((x) => `<p>${esc(x)}</p>`).join('')}</section>`).join('\n  ')}
  <p class="note">${T.gNote}</p>
</div></article>
<section class="band" aria-labelledby="gp-h"><div class="wrap">
  <p class="kicker">${T.gProdK}</p>
  <h2 id="gp-h">${gt(T.gProdH)}</h2>
  <div class="grid">${prods.map((p, i) => card(p, false, i)).join('\n')}</div>
</div></section>
<section class="band" aria-labelledby="go-h"><div class="wrap">
  <p class="kicker">${T.gMoreK}</p>
  <h2 id="go-h">${gt(T.gMoreH)}</h2>
  <div class="ggrid">${others.map(guideCard).join('')}</div>
</div></section>`,
    }));
  }

  // ----- Jämför -----
  pages.set(R('compare'), layout({
    path: R('compare'), alt: pair('compare'), page: 'compare', title: T.cmpTitle, desc: T.cmpDesc,
    body: `<div class="band"><div class="wrap">
  <div class="prose"><p class="kicker">${T.cmpK}</p><h1>${gt(T.cmpH)}</h1><p>${T.cmpText}</p></div>
  <div id="cmp-root" aria-live="polite"><noscript>${T.cmpNoscript(H(R('home') + '#butik'))}</noscript></div>
</div></div>`,
  }).replace('<body data-page="compare">', '<body data-page="jamfor">'));

  // ----- Om oss, integritet, cookies -----
  const n = esc(config.name), mail = `<a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>`;
  const ownerLine = `${esc(config.owner)}${config.ownerOrgNr ? `, org.nr ${esc(config.ownerOrgNr)}` : ''}`;
  const LEGAL = L.code === 'sv' ? {
    aboutT: 'Om oss och hur vi väljer prylar', aboutD: `Hur ${config.name} väljer produkter, hur vi tjänar pengar och varför vi inte visar betyg.`,
    about: `<h1>Om ${n}</h1>
<p>${n} är en liten guide till teknik, prylar och inredning för vardagen. Vi samlar de produkttyper som många behöver och förklarar vad du ska tänka på innan du köper.</p>
<h2>Hur vi tjänar pengar</h2>
<p>Som Amazon-partner tjänar ${n} på kvalificerade köp. När du klickar på en Amazon-länk och handlar får vi en provision från Amazon. Du betalar samma pris som annars. Provisionen påverkar inte vad vi skriver i köpguiderna.</p>
<h2>Hur vi väljer</h2>
<p>Vi utgår från vad folk faktiskt behöver: laddare som klarar flera prylar, hörlurar för pendling, smarta hem-prylar som är enkla att komma igång med. För varje produkttyp skriver vi en köpguide om vad som skiljer modellerna åt, vem den passar och när du hellre ska välja något annat.</p>
<h2>Det här gör vi inte</h2>
<ul><li>Vi hittar aldrig på betyg, recensioner eller kundomdömen.</li><li>Vi påstår inte att vi har testat en produkt om vi inte har gjort det.</li><li>Vi visar bara priser som kommer direkt från Amazon. De är högst ett dygn gamla och har tidpunkten utskriven.</li></ul>
<h2>Kontakt</h2>
<p>Har du synpunkter eller hittar något som är fel? Mejla ${mail}.</p>`,
    privT: 'Integritetspolicy', privD: `Så hanterar ${config.name} personuppgifter: vad som sparas, vad som delas med Amazon och dina rättigheter.`,
    priv: `<h1>Integritetspolicy</h1>
<p>Senast uppdaterad ${esc(config.policyUpdated)}.</p>
<h2>Kort sammanfattning</h2>
<p>${n} har inga användarkonton, inga formulär, inga analysverktyg och inga reklamcookies. Vi samlar inte in några personuppgifter om dig när du besöker sajten. Det som behöver förklaras är ditt webbhotell, produktbilder och länkarna till Amazon.</p>
<h2>Personuppgiftsansvarig</h2>
<p>${ownerLine}. Kontakt: ${mail}.</p>
<h2>Det som sparas i din webbläsare</h2>
<p>Dina favoriter och de prylar du valt att jämföra sparas i webbläsarens lokala lagring (localStorage) på din egen enhet. Uppgifterna skickas aldrig till oss och du kan radera dem när som helst genom att rensa webbplatsdata i webbläsaren. Lagringen behövs för funktioner som du själv använder och kräver därför inget samtycke enligt lagen om elektronisk kommunikation. Se också vår <a href="${H(R('cookies'))}">cookiesida</a>.</p>
<h2>Webbhotell och serverloggar</h2>
<p>Sajten drivs hos ${esc(config.hosting)}. Som för alla webbplatser behandlar webbhotellet tekniska uppgifter som IP-adress och webbläsartyp när sidorna skickas till dig, och sparar dem en kortare tid i loggar för drift och säkerhet. Den rättsliga grunden är vårt berättigade intresse av en säker och fungerande webbplats (artikel 6.1 f i dataskyddsförordningen).</p>
<h2>Produktbilder från Amazon</h2>
<p>Produktbilder visas direkt från Amazons servrar och lagras inte hos oss. När en sådan bild laddas tar Amazon emot din IP-adress och teknisk information om webbläsaren, på samma sätt som när du besöker en webbplats.</p>
<h2>När du klickar vidare till Amazon</h2>
<p>Länkarna till Amazon.se är affiliatelänkar. När du klickar på en länk lämnar du ${n}. Amazon använder cookies för att se att du kom från oss, så att vi kan få provision om du handlar. Amazon ansvarar själva för den behandlingen enligt sitt integritetsmeddelande, som du hittar längst ner på amazon.se. Vi får bara sammanställd statistik om vilka produkter som köpts via våra länkar, aldrig uppgifter om vem som har köpt.</p>
<h2>Om du mejlar oss</h2>
<p>Om du kontaktar oss via e-post använder vi din adress och det du skriver för att svara dig. Vi raderar mejlet när ärendet är avslutat, om vi inte behöver spara det av rättsliga skäl. Den rättsliga grunden är vårt berättigade intresse av att kunna svara på frågor.</p>
<h2>Dina rättigheter</h2>
<p>Du har rätt att begära tillgång till, rättelse eller radering av dina personuppgifter, att begära begränsning av behandlingen och att invända mot den. Kontakta oss på adressen ovan. Om du är missnöjd med hur vi hanterar personuppgifter kan du klaga hos Integritetsskyddsmyndigheten (IMY), <a href="https://www.imy.se">imy.se</a>.</p>
<h2>Ändringar</h2>
<p>Om vi ändrar policyn, till exempel för att lägga till statistik, uppdaterar vi den här sidan och datumet ovan. Om en ändring kräver ditt samtycke frågar vi först.</p>`,
    cookT: 'Cookies och lokal lagring', cookD: `${config.name} sätter inga cookies. Här ser du vad som sparas lokalt och vad som händer hos Amazon.`,
    cook: `<h1>Cookies och lokal lagring</h1>
<p><strong>${n} sätter inga egna cookies</strong> och använder inga analys- eller annonsverktyg. Därför visar vi ingen cookiebanner.</p>
<h2>Lokal lagring i din webbläsare</h2>
<table><thead><tr><th>Namn</th><th>Vad det gör</th><th>Hur länge</th></tr></thead><tbody>
<tr><td><code>gw-favs</code></td><td>Kommer ihåg dina favoriter (♥).</td><td>Tills du tar bort dem eller rensar webbläsaren</td></tr>
<tr><td><code>gw-cmp</code></td><td>Kommer ihåg vilka prylar du valt att jämföra.</td><td>Tills du rensar jämförelsen eller webbläsaren</td></tr>
</tbody></table>
<p>Uppgifterna finns bara på din enhet och skickas aldrig till oss. Lagringen behövs för funktioner du själv använder och kräver därför inget samtycke enligt lagen om elektronisk kommunikation.</p>
<h2>Amazon</h2>
<p>När du klickar på en länk till Amazon.se kan Amazon sätta cookies, bland annat för att se att du kom från ${n}. Det sker på Amazons webbplats och styrs av Amazons egna cookievillkor och inställningar. Produktbilder hämtas från Amazons servrar, läs mer i vår <a href="${H(R('privacy'))}">integritetspolicy</a>.</p>
<h2>Så rensar du</h2>
<p>Du kan radera lokal lagring i webbläsarens inställningar under webbplatsdata eller cookies och webbplatsdata. Favoriterna och jämförelsen försvinner då.</p>`,
  } : {
    aboutT: 'About us and how we choose gear', aboutD: `How ${config.name} chooses products, how we make money and why we don't show ratings.`,
    about: `<h1>About ${n}</h1>
<p>${n} is a small guide to tech, gadgets and home decor for everyday life. We gather the product types many people need and explain what to consider before you buy.</p>
<h2>How we make money</h2>
<p>As an Amazon Associate, ${n} earns from qualifying purchases. When you click an Amazon link and shop, we receive a commission from Amazon. You pay the same price as otherwise. The commission doesn't affect what we write in our buying guides.</p>
<h2>How we choose</h2>
<p>We start from what people actually need: chargers that handle several devices, headphones for commuting, smart-home gear that's easy to get started with. For each product type we write a buying guide on what differs between models, who it suits and when you'd be better off with something else.</p>
<h2>What we don't do</h2>
<ul><li>We never make up ratings, reviews or customer testimonials.</li><li>We don't claim to have tested a product unless we have.</li><li>We only show prices that come straight from Amazon. They are at most a day old and show the time they were fetched.</li></ul>
<h2>Where our links go</h2>
<p>${n} is based in Sweden and our links go to Amazon.se, the Swedish Amazon store. You can switch Amazon.se to English.</p>
<h2>Contact</h2>
<p>Have feedback or found something wrong? Email ${mail}.</p>`,
    privT: 'Privacy policy', privD: `How ${config.name} handles personal data: what is stored, what is shared with Amazon and your rights.`,
    priv: `<h1>Privacy policy</h1>
<p>Last updated ${esc(config.policyUpdated)}.</p>
<h2>Summary</h2>
<p>${n} has no user accounts, no forms, no analytics and no advertising cookies. We don't collect any personal data about you when you visit the site. What needs explaining is our web host, product images and the links to Amazon.</p>
<h2>Data controller</h2>
<p>${ownerLine}. Contact: ${mail}.</p>
<h2>What is stored in your browser</h2>
<p>Your favourites and the items you choose to compare are stored in your browser's local storage (localStorage) on your own device. The data is never sent to us, and you can delete it at any time by clearing site data in your browser. This storage is needed for features you use yourself and therefore doesn't require consent under the Swedish Electronic Communications Act. See also our <a href="${H(R('cookies'))}">cookie page</a>.</p>
<h2>Web hosting and server logs</h2>
<p>The site is hosted by ${esc(config.hosting)}. As with any website, the host processes technical data such as your IP address and browser type when pages are sent to you, and keeps it in logs for a short period for operations and security. The legal basis is our legitimate interest in a secure, working website (Article 6(1)(f) GDPR).</p>
<h2>Product images from Amazon</h2>
<p>Product images are shown directly from Amazon's servers and are not stored by us. When such an image loads, Amazon receives your IP address and technical information about your browser, just as when you visit any website.</p>
<h2>When you click through to Amazon</h2>
<p>Links to Amazon.se are affiliate links. When you click one, you leave ${n}. Amazon uses cookies to see that you came from us, so we can earn a commission if you buy something. Amazon is responsible for that processing under its own privacy notice, which you'll find at the bottom of amazon.se. We only receive aggregated statistics about which products were bought via our links, never information about who bought them.</p>
<h2>If you email us</h2>
<p>If you contact us by email, we use your address and what you write to reply to you. We delete the email once the matter is closed, unless we need to keep it for legal reasons. The legal basis is our legitimate interest in being able to answer questions.</p>
<h2>Your rights</h2>
<p>You have the right to request access to, correction or deletion of your personal data, to request restriction of processing and to object to it. Contact us at the address above. If you're unhappy with how we handle personal data, you can complain to the Swedish Authority for Privacy Protection (IMY), <a href="https://www.imy.se/en/">imy.se</a>.</p>
<h2>Changes</h2>
<p>If we change this policy, for example to add analytics, we will update this page and the date above. If a change requires your consent, we'll ask first.</p>`,
    cookT: 'Cookies and local storage', cookD: `${config.name} sets no cookies. Here's what is stored locally and what happens on Amazon.`,
    cook: `<h1>Cookies and local storage</h1>
<p><strong>${n} sets no cookies of its own</strong> and uses no analytics or advertising tools. That's why we don't show a cookie banner.</p>
<h2>Local storage in your browser</h2>
<table><thead><tr><th>Name</th><th>What it does</th><th>How long</th></tr></thead><tbody>
<tr><td><code>gw-favs</code></td><td>Remembers your favourites (♥).</td><td>Until you remove them or clear your browser</td></tr>
<tr><td><code>gw-cmp</code></td><td>Remembers which items you chose to compare.</td><td>Until you clear the comparison or your browser</td></tr>
</tbody></table>
<p>The data only exists on your device and is never sent to us. This storage is needed for features you use yourself and therefore doesn't require consent under the Swedish Electronic Communications Act.</p>
<h2>Amazon</h2>
<p>When you click a link to Amazon.se, Amazon may set cookies, for example to see that you came from ${n}. This happens on Amazon's website and is governed by Amazon's own cookie terms and settings. Product images are loaded from Amazon's servers – read more in our <a href="${H(R('privacy'))}">privacy policy</a>.</p>
<h2>How to clear it</h2>
<p>You can delete local storage in your browser settings under site data, or cookies and site data. Your favourites and comparison will then be removed.</p>`,
  };
  pages.set(R('about'), layout({ path: R('about'), alt: pair('about'), page: 'about', title: LEGAL.aboutT, desc: LEGAL.aboutD, body: prose(LEGAL.about) }));
  pages.set(R('privacy'), layout({ path: R('privacy'), alt: pair('privacy'), page: 'privacy', title: LEGAL.privT, desc: LEGAL.privD, body: prose(LEGAL.priv) }));
  pages.set(R('cookies'), layout({ path: R('cookies'), alt: pair('cookies'), page: 'cookies', title: LEGAL.cookT, desc: LEGAL.cookD, body: prose(LEGAL.cook) }));

  // ----- products.json per språk -----
  pages.set(`${L.pre}products.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    amazonFetchedAt: amazon?.fetchedAt || null,
    amazonFetchedAtText: fetched,
    priceDisclaimer: T.disclaimer,
    products: products.map((p) => ({
      slug: p.id, url: p.url, name: p.name, cat: p.catName, level: p.level, why: p.why, bullets: p.bullets, guide: p.guide,
      asin: p.asin || null, title: p.a?.title || p.pick || null, link: p.link, img: p.img?.url || null, price: p.price, icon: ICONS[p.icon],
    })),
  }));
}

// ---------- 404 (tvåspråkig) ----------
const notFound = (() => {
  const L = LANGS.sv, T = S.sv;
  const html = `<!DOCTYPE html>
<html lang="sv" data-base="${base}" data-pre="">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${T.nfTitle} – ${esc(config.name)}</title><meta name="robots" content="noindex">
<link rel="icon" href="${href('favicon.svg')}" type="image/svg+xml"><style>${css}</style></head>
<body data-page="404"><div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<header class="top"><nav class="nav" aria-label="${T.mainMenu}"><a class="logo" href="${href(L.pre)}"><i></i>${esc(config.name)}</a></nav></header>
<main id="main"><div class="band"><div class="wrap prose">
<p class="e404 gt" aria-hidden="true">404</p>
<h1>Hoppsan – sidan finns inte</h1><p>Länken kan vara gammal eller felstavad.</p>
<p lang="en">Oops – this page doesn't exist. The link may be old or mistyped.</p>
<p><a class="cta" href="${href()}">Till butiken <span class="arr" aria-hidden="true">→</span></a> <a class="ghost" href="${href('en/')}" lang="en">Go to the shop</a></p>
</div></div></main></body></html>
`;
  return html;
})();

// ---------- Skriv ut ----------
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(new URL('assets/', dist), { recursive: true });
const out = async (p, s) => { const u = new URL(p, dist); await mkdir(new URL('./', u), { recursive: true }); await writeFile(u, s); };

for (const [p, html] of pages) await out(p.endsWith('.json') ? p : p + 'index.html', html);
await out('404.html', notFound);
await out(jsFile, js);
await cp(new URL('static/', root), dist, { recursive: true });

await out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((u) => `  <url><loc>${abs(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
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

const htmlPages = [...pages.keys()].filter((p) => !p.endsWith('.json')).length + 1;
console.log(`Byggt ${htmlPages} sidor till dist/ (sv + en, ${baseProducts.filter((p) => p.price).length} produkter med pris från Amazon${amazon ? `, hämtat ${fetchedText(LANGS.sv)}` : ''}).`);
for (const w of warnings) console.warn(`⚠ ${w}`);
