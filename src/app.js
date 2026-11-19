// Gearwise – klientskript (delas av alla sidor). Inga beroenden.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const BASE = document.documentElement.dataset.base || '/';
  const MAX_CMP = 3;
  const DAY = 24 * 3600 * 1000;

  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let favs = load('gw-favs').filter((x) => typeof x === 'string');
  let cmp = load('gw-cmp').filter((x) => typeof x === 'string').slice(0, MAX_CMP);

  // ---------- Priser: visa bara om de är yngre än 24 h (Amazons krav) ----------
  function expirePrices() {
    for (const el of $$('[data-price-ts]')) {
      const t = Date.parse(el.dataset.priceTs);
      if (!t || Date.now() - t > DAY) el.remove();
    }
  }

  // ---------- Bilder: fall tillbaka på ritad ikon om Amazon-bilden inte laddar ----------
  function fallback(img) { const fb = img.nextElementSibling; if (fb) fb.hidden = false; img.remove(); }
  document.addEventListener('error', (e) => { if (e.target.matches?.('img.ph')) fallback(e.target); }, true);
  const checkImgs = () => $$('img.ph').forEach((i) => { if (i.complete && i.naturalWidth === 0) fallback(i); });

  // ---------- Favoriter ----------
  function syncFavs() {
    $$('[data-fav]').forEach((b) => b.setAttribute('aria-pressed', favs.includes(b.dataset.fav)));
    $$('.favcount').forEach((b) => (b.textContent = favs.length));
  }
  function toggleFav(slug) {
    favs = favs.includes(slug) ? favs.filter((x) => x !== slug) : [...favs, slug];
    save('gw-favs', favs); syncFavs(); if (shop) shop.render();
  }

  // ---------- Jämförelse ----------
  const bar = $('#cmpbar');
  function syncCmp() {
    $$('[data-cmp]').forEach((b) => {
      const on = cmp.includes(b.dataset.cmp);
      b.setAttribute('aria-pressed', on);
      b.textContent = on ? (b.dataset.on || 'Jämförs') : (b.dataset.off || 'Jämför');
    });
    if (!bar || document.body.dataset.page === 'jamfor') return;
    bar.hidden = cmp.length === 0;
    $('#cmpn', bar).textContent = cmp.length === 1 ? '1 vald – välj en till' : `${cmp.length} valda`;
    const a = $('a', bar);
    a.href = `${BASE}jamfor/?p=${cmp.join(',')}`;
    a.setAttribute('aria-disabled', cmp.length < 2);
  }
  function toggleCmp(slug) {
    if (cmp.includes(slug)) cmp = cmp.filter((x) => x !== slug);
    else if (cmp.length >= MAX_CMP) { alert(`Du kan jämföra högst ${MAX_CMP} prylar. Ta bort någon först.`); return; }
    else cmp = [...cmp, slug];
    save('gw-cmp', cmp); syncCmp();
    if (document.body.dataset.page === 'jamfor') renderCompare();
  }
  bar && $('button', bar).addEventListener('click', () => { cmp = []; save('gw-cmp', cmp); syncCmp(); });

  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fav]'); if (f) { e.preventDefault(); toggleFav(f.dataset.fav); return; }
    const c = e.target.closest('[data-cmp]'); if (c) { e.preventDefault(); toggleCmp(c.dataset.cmp); }
  });

  // ---------- Butiken (startsidan) ----------
  let shop = null;
  const grid = $('#grid');
  if (grid) {
    const cards = $$('.card', grid);
    const params = new URLSearchParams(location.search);
    let cat = params.get('kategori') || 'Alla';
    let favOnly = params.has('favoriter');
    const q = $('#q'), sort = $('#sort'), count = $('#count'), empty = $('#empty');

    shop = {
      render() {
        const term = q.value.trim().toLowerCase();
        const s = sort.value;
        const shown = cards.filter((c) => {
          const ok = favOnly ? favs.includes(c.dataset.slug) : (cat === 'Alla' || c.dataset.cat === cat);
          const hit = !term || c.dataset.text.includes(term);
          c.hidden = !(ok && hit);
          return ok && hit;
        });
        const key = { pop: (a, b) => b.dataset.pop - a.dataset.pop, low: (a, b) => a.dataset.lvl - b.dataset.lvl || b.dataset.pop - a.dataset.pop,
          high: (a, b) => b.dataset.lvl - a.dataset.lvl || b.dataset.pop - a.dataset.pop, az: (a, b) => a.dataset.name.localeCompare(b.dataset.name, 'sv') }[s];
        [...cards].sort(key).forEach((c) => grid.appendChild(c));
        grid.appendChild(empty);
        empty.hidden = shown.length > 0;
        empty.textContent = favOnly ? 'Du har inga favoriter än. Tryck på ♥ på en pryl för att spara den.' : 'Inga prylar matchade din sökning.';
        count.textContent = favOnly ? `Dina favoriter: ${shown.length} st` : `${shown.length} prylar${cat !== 'Alla' ? ' i ' + cat : ''}`;
        $$('#chips [data-c]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === cat && !favOnly));
        const ft = $('#favToggle'); ft && ft.setAttribute('aria-pressed', favOnly);
      },
    };
    $('#chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      cat = b.dataset.c; favOnly = false; shop.render();
      const u = new URL(location.href); u.searchParams.delete('favoriter');
      cat === 'Alla' ? u.searchParams.delete('kategori') : u.searchParams.set('kategori', cat);
      history.replaceState(null, '', u);
    });
    q.addEventListener('input', shop.render); sort.addEventListener('change', shop.render);
    $('#favToggle')?.addEventListener('click', () => { favOnly = !favOnly; shop.render(); $('#butik').scrollIntoView(); });
    shop.render();
  }

  // ---------- Jämförelsesidan ----------
  let data = null;
  async function renderCompare() {
    const root = $('#cmp-root'); if (!root) return;
    if (!data) data = await fetch(`${BASE}products.json`).then((r) => r.json());
    const fromUrl = new URLSearchParams(location.search).get('p');
    if (fromUrl && !renderCompare.used) {
      renderCompare.used = true;
      cmp = fromUrl.split(',').filter((s) => data.products.some((p) => p.slug === s)).slice(0, MAX_CMP);
      save('gw-cmp', cmp);
    }
    const u = new URL(location.href); cmp.length ? u.searchParams.set('p', cmp.join(',')) : u.searchParams.delete('p');
    history.replaceState(null, '', u);
    const list = cmp.map((s) => data.products.find((p) => p.slug === s)).filter(Boolean);
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fresh = data.amazonFetchedAt && Date.now() - Date.parse(data.amazonFetchedAt) < DAY;
    const opts = data.products.filter((p) => !cmp.includes(p.slug)).map((p) => `<option value="${p.slug}">${esc(p.name)}</option>`).join('');
    const add = list.length < MAX_CMP
      ? `<label class="addcmp">Lägg till pryl: <select id="addCmp"><option value="">Välj…</option>${opts}</select></label>` : '';
    if (!list.length) { root.innerHTML = `<p>Du har inte valt några prylar ännu. Välj 2–3 stycken här nedanför, eller tryck på <b>Jämför</b> på en pryl i butiken.</p>${add}`; bindAdd(); return; }
    const pic = (p) => p.img ? `<img class="ph" src="${esc(p.img)}" alt="" referrerpolicy="no-referrer" loading="lazy"><span hidden>${p.icon}</span>` : p.icon;
    const row = (label, fn) => `<tr><th scope="row">${label}</th>${list.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`;
    root.innerHTML = `${add}<div class="tablewrap" style="margin-top:16px"><table class="cmpt"><thead><tr><td></td>${list.map((p) => `<th scope="col"><div class="pic">${pic(p)}</div><h3><a href="${BASE}produkt/${p.slug}/">${esc(p.name)}</a></h3>
      <button class="btn2" data-cmp="${p.slug}" data-on="Ta bort" data-off="Jämför" style="margin-top:8px">Ta bort</button></th>`).join('')}</tr></thead><tbody>
      ${row('Kategori', (p) => esc(p.cat))}
      ${row('Prisklass', (p) => esc(p.level))}
      ${row('Pris', (p) => (fresh && p.price) ? `<strong>${esc(p.price)}</strong><br><span class="price">Amazon.se, ${esc(data.amazonFetchedAtText)}</span>` : '<span class="price">Se aktuellt pris hos Amazon</span>')}
      ${row('Passar för', (p) => esc(p.guide?.forWho || p.why))}
      ${row('Egenskaper', (p) => `<ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)}
      ${row('Tänk på', (p) => `<ul>${(p.guide?.consider || []).map((c) => `<li>${esc(c[0])}</li>`).join('')}</ul>`)}
      ${row('Hoppa över om', (p) => esc(p.guide?.skipIf || '–'))}
      ${row('', (p) => `<a class="buy" href="${esc(p.link)}" target="_blank" rel="nofollow sponsored noopener">Se pris på Amazon →</a>`)}
      </tbody></table></div>
      ${fresh && list.some((p) => p.price) ? `<p class="price" style="margin-top:12px">${esc(data.priceDisclaimer)}</p>` : ''}`;
    bindAdd(); syncCmp(); checkImgs();
  }
  function bindAdd() { $('#addCmp')?.addEventListener('change', (e) => { if (e.target.value) toggleCmp(e.target.value); }); }

  // ---------- Start ----------
  expirePrices(); checkImgs(); syncFavs(); syncCmp();
  if (document.body.dataset.page === 'jamfor') renderCompare().catch(() => { $('#cmp-root').textContent = 'Kunde inte läsa produktlistan.'; });
})();
