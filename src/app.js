// Gearwise – klientskript (delas av alla sidor). Inga beroenden.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const BASE = document.documentElement.dataset.base || '/';
  const MAX_CMP = 3;
  const DAY = 24 * 3600 * 1000;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const page = document.body.dataset.page;

  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let favs = load('gw-favs').filter((x) => typeof x === 'string');
  let cmp = load('gw-cmp').filter((x) => typeof x === 'string').slice(0, MAX_CMP);

  // ---------- Toast ----------
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2200);
  }

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

  // ---------- Hjärtexplosion ----------
  function burst(el) {
    if (reduce || !el.animate) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const colors = ['#ff5c8a', '#8fd3ff', '#b69cff', '#ffffff'];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      s.style.left = cx - 4 + 'px'; s.style.top = cy - 4 + 'px';
      s.style.background = colors[i % colors.length];
      document.body.appendChild(s);
      const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const dist = 34 + Math.random() * 30;
      s.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px) scale(0)`, opacity: 0 },
      ], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => s.remove();
    }
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' });
  }

  // ---------- Favoriter ----------
  function syncFavs() {
    $$('[data-fav]').forEach((b) => b.setAttribute('aria-pressed', favs.includes(b.dataset.fav)));
    $$('.favcount').forEach((b) => (b.textContent = favs.length));
  }
  function toggleFav(slug, btn) {
    const on = !favs.includes(slug);
    favs = on ? [...favs, slug] : favs.filter((x) => x !== slug);
    save('gw-favs', favs); syncFavs(); if (shop) shop.render(false);
    if (on) { burst(btn); toast('Sparad i favoriter ♥'); } else toast('Borttagen från favoriter');
  }

  // ---------- Jämförelse ----------
  const bar = $('#cmpbar');
  function syncCmp() {
    $$('[data-cmp]').forEach((b) => {
      const on = cmp.includes(b.dataset.cmp);
      b.setAttribute('aria-pressed', on);
      b.textContent = on ? (b.dataset.on || 'Jämförs') : (b.dataset.off || 'Jämför');
    });
    if (!bar || page === 'jamfor') return;
    bar.hidden = cmp.length === 0;
    $('#cmpn', bar).textContent = cmp.length === 1 ? '1 vald – välj en till' : `${cmp.length} valda`;
    const a = $('a', bar);
    a.href = `${BASE}jamfor/?p=${cmp.join(',')}`;
    a.setAttribute('aria-disabled', cmp.length < 2);
  }
  function toggleCmp(slug) {
    if (cmp.includes(slug)) { cmp = cmp.filter((x) => x !== slug); toast('Borttagen från jämförelsen'); }
    else if (cmp.length >= MAX_CMP) { toast(`Du kan jämföra högst ${MAX_CMP} prylar`); return; }
    else { cmp = [...cmp, slug]; toast(`Tillagd i jämförelsen (${cmp.length}/${MAX_CMP})`); }
    save('gw-cmp', cmp); syncCmp();
    if (page === 'jamfor') renderCompare();
  }
  bar && $('button', bar).addEventListener('click', () => { cmp = []; save('gw-cmp', cmp); syncCmp(); toast('Jämförelsen är rensad'); });

  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fav]'); if (f) { e.preventDefault(); toggleFav(f.dataset.fav, f); return; }
    const c = e.target.closest('[data-cmp]'); if (c) { e.preventDefault(); toggleCmp(c.dataset.cmp); }
  });

  // ---------- Sidhuvud och läsförlopp ----------
  const header = $('header.top');
  const prog = $('.progress');
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      header && header.classList.toggle('scrolled', y > 8);
      if (prog) {
        const max = document.documentElement.scrollHeight - innerHeight;
        prog.style.setProperty('--p', max > 0 ? Math.min(1, y / max) : 0);
      }
      ticking = false;
    });
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ---------- Avslöjande vid scroll + uppräkning ----------
  function countUp(el) {
    const n = Number(el.dataset.count);
    if (reduce || Number.isNaN(n)) return;
    const from = n === 0 ? 99 : 0, dur = 1400, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (n - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('in');
        $$('[data-count]', en.target).forEach(countUp);
        io.unobserve(en.target);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else revealEls.forEach((el) => el.classList.add('in'));

  // ---------- Roterande ord i rubriken ----------
  const rot = $('#rot');
  if (rot && !reduce) {
    const words = rot.dataset.words.split('|');
    let i = 0;
    setInterval(() => {
      if (document.hidden) return;
      rot.classList.remove('in'); rot.classList.add('out');
      setTimeout(() => {
        i = (i + 1) % words.length;
        rot.textContent = words[i];
        rot.classList.remove('out'); void rot.offsetWidth; rot.classList.add('in');
      }, 320);
    }, 2600);
  }

  // ---------- Parallax i illustrationen ----------
  const scene = $('#scene');
  if (scene && !reduce && finePointer) {
    const hero = scene.closest('.hero') || document.body;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      scene.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5) * 2);
      scene.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5) * 2);
    });
    hero.addEventListener('pointerleave', () => { scene.style.setProperty('--px', 0); scene.style.setProperty('--py', 0); });
  }

  // ---------- Magnetiska knappar, 3D-lutning och spotlight ----------
  if (!reduce && finePointer) {
    $$('.magnetic').forEach((m) => {
      m.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1), background-position .5s, box-shadow .3s';
      m.addEventListener('pointermove', (e) => {
        const r = m.getBoundingClientRect();
        m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.22}px,${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      });
      m.addEventListener('pointerleave', () => (m.style.transform = ''));
    });
    let raf = 0, last = null;
    document.addEventListener('pointermove', (e) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = last.target.closest?.('.card, .tile');
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = last.clientX - r.left, y = last.clientY - r.top;
        el.style.setProperty('--mx', x + 'px'); el.style.setProperty('--my', y + 'px');
        if (el.classList.contains('card')) {
          const rx = ((y / r.height) - 0.5) * -6, ry = ((x / r.width) - 0.5) * 7;
          el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
        }
      });
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const el = e.target.closest?.('.card');
      if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
    });
  }

  // ---------- Butiken (startsidan) ----------
  let shop = null;
  const grid = $('#grid');
  if (grid) {
    const cards = $$('.card', grid);
    const params = new URLSearchParams(location.search);
    const chipsEl = $('#chips');
    let cat = params.get('kategori') || 'Alla';
    let favOnly = params.has('favoriter');
    const q = $('#q'), sort = $('#sort'), count = $('#count'), empty = $('#empty');

    // Glidande markering bakom vald kategori
    const pill = document.createElement('span');
    pill.className = 'pill'; pill.setAttribute('aria-hidden', 'true');
    chipsEl.prepend(pill);
    let pillReady = false;
    function movePill() {
      const active = $('[data-c][aria-pressed="true"]', chipsEl);
      if (!active) { chipsEl.classList.remove('has-pill'); return; }
      pill.style.width = active.offsetWidth + 'px';
      pill.style.height = active.offsetHeight + 'px';
      pill.style.transform = `translate(${active.offsetLeft}px,${active.offsetTop}px)`;
      if (!pillReady) {
        chipsEl.classList.add('has-pill');
        requestAnimationFrame(() => { if (!reduce) pill.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1), width .5s cubic-bezier(.2,.8,.2,1), height .3s'; });
        pillReady = true;
      }
    }
    addEventListener('resize', movePill);

    const apply = () => {
      const term = q.value.trim().toLowerCase();
      const s = sort.value;
      const shown = cards.filter((c) => {
        const ok = favOnly ? favs.includes(c.dataset.slug) : (cat === 'Alla' || c.dataset.cat === cat);
        const hit = !term || c.dataset.text.includes(term);
        c.hidden = !(ok && hit);
        if (ok && hit) c.classList.add('in');
        return ok && hit;
      });
      const key = { pop: (a, b) => b.dataset.pop - a.dataset.pop, low: (a, b) => a.dataset.lvl - b.dataset.lvl || b.dataset.pop - a.dataset.pop,
        high: (a, b) => b.dataset.lvl - a.dataset.lvl || b.dataset.pop - a.dataset.pop, az: (a, b) => a.dataset.name.localeCompare(b.dataset.name, 'sv') }[s];
      [...cards].sort(key).forEach((c) => grid.appendChild(c));
      grid.appendChild(empty);
      empty.hidden = shown.length > 0;
      empty.textContent = favOnly ? 'Du har inga favoriter än. Tryck på ♥ på en pryl för att spara den.' : 'Inga prylar matchade din sökning.';
      count.textContent = favOnly ? `Dina favoriter: ${shown.length} st` : `${shown.length} prylar${cat !== 'Alla' ? ' i ' + cat : ''}`;
      $$('[data-c]', chipsEl).forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === cat && !favOnly));
      const ft = $('#favToggle'); ft && ft.setAttribute('aria-pressed', favOnly);
      movePill();
    };
    shop = {
      render(animate = true) {
        if (animate && !reduce && document.startViewTransition) document.startViewTransition(apply);
        else apply();
      },
    };
    const setCat = (c) => {
      cat = c; favOnly = false; shop.render();
      const u = new URL(location.href); u.searchParams.delete('favoriter');
      cat === 'Alla' ? u.searchParams.delete('kategori') : u.searchParams.set('kategori', cat);
      history.replaceState(null, '', u);
    };
    chipsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) setCat(b.dataset.c); });
    $$('.tile[data-cat]').forEach((t) => t.addEventListener('click', (e) => {
      e.preventDefault(); setCat(t.dataset.cat); $('#butik').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    }));
    let qt; q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => shop.render(), 120); });
    sort.addEventListener('change', () => shop.render());
    $('#favToggle')?.addEventListener('click', () => { favOnly = !favOnly; shop.render(); $('#butik').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); });
    apply();
    if (document.fonts?.ready) document.fonts.ready.then(movePill);
  }

  // ---------- Prylguiden (flikar) ----------
  const tabs = $$('.qtab');
  if (tabs.length) {
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        $('#' + t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
        if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
        if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
      });
    });
  }

  // ---------- Köpknapp som följer med på produktsidan ----------
  const mainBuy = $('#mainbuy'), sticky = $('#stickybuy');
  if (mainBuy && sticky && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => {
      const on = !en.isIntersecting && en.boundingClientRect.top < 0;
      document.body.classList.toggle('sticky-on', on);
      sticky.inert = !on;
    }).observe(mainBuy);
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
    const pic = (p) => p.img ? `<img class="ph" src="${esc(p.img)}" alt="" referrerpolicy="no-referrer" loading="lazy"><span class="fb" hidden>${p.icon}</span>` : p.icon;
    const row = (label, fn) => `<tr><th scope="row">${label}</th>${list.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`;
    root.innerHTML = `${add}<div class="tablewrap" style="margin-top:16px"><table class="cmpt"><thead><tr><td></td>${list.map((p) => `<th scope="col"><div class="pic">${pic(p)}</div><h3><a href="${BASE}produkt/${p.slug}/">${esc(p.name)}</a></h3>
      ${p.title ? `<p class="price" style="margin-top:4px">Vårt val: ${esc(p.title)}</p>` : ''}
      <button class="btn2" data-cmp="${p.slug}" data-on="Ta bort" data-off="Jämför" style="margin-top:8px;min-height:44px">Ta bort</button></th>`).join('')}</tr></thead><tbody>
      ${row('Kategori', (p) => esc(p.cat))}
      ${row('Prisklass', (p) => esc(p.level))}
      ${row('Pris', (p) => (fresh && p.price) ? `<strong>${esc(p.price)}</strong><br><span class="price">Amazon.se, ${esc(data.amazonFetchedAtText)}</span>` : '<span class="price">Se aktuellt pris hos Amazon</span>')}
      ${row('Passar för', (p) => esc(p.guide?.forWho || p.why))}
      ${row('Egenskaper', (p) => `<ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)}
      ${row('Tänk på', (p) => `<ul>${(p.guide?.consider || []).map((c) => `<li>${esc(c[0])}</li>`).join('')}</ul>`)}
      ${row('Hoppa över om', (p) => esc(p.guide?.skipIf || '–'))}
      ${row('', (p) => `<a class="buy" href="${esc(p.link)}" target="_blank" rel="nofollow sponsored noopener">Se på Amazon →</a>`)}
      </tbody></table></div>
      ${fresh && list.some((p) => p.price) ? `<p class="price" style="margin-top:12px">${esc(data.priceDisclaimer)}</p>` : ''}`;
    bindAdd(); syncCmp(); checkImgs();
  }
  function bindAdd() { $('#addCmp')?.addEventListener('change', (e) => { if (e.target.value) toggleCmp(e.target.value); }); }

  // ---------- Start ----------
  expirePrices(); checkImgs(); syncFavs(); syncCmp();
  if (page === 'jamfor') renderCompare().catch(() => { $('#cmp-root').textContent = 'Kunde inte läsa produktlistan.'; });
})();
