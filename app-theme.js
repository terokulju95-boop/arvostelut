// ══ ARVOSTELUT · ulkoasu, testitila ja työkalut ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_THEME = '2026-08-28.11';
// Tavallinen skripti (ei moduuli): ajetaan app-core.js:n JÄLKEEN,
// koska se käyttää ensureSettings()- ja appData-muuttujia.

// ════════════════════════════════════════════════════════════
// 1. TEEMA
// Teematila (tumma/vaalea/AMOLED/järjestelmä) ja väripaketti ovat
// erillisiä valintoja. Paketti ohittaa tilan, koska paketti määrittelee
// oman kokonaisuutensa — muuten "Sepia + AMOLED" tuottaisi sekasotkun.
// ════════════════════════════════════════════════════════════

const THEME_MODES = [
  { id:'dark',   name:'Tumma',        icon:'🌙', a:'#0a0a0f', b:'#1a1a24' },
  { id:'light',  name:'Vaalea',       icon:'☀️', a:'#f4f4f8', b:'#ffffff' },
  { id:'amoled', name:'AMOLED-musta', icon:'⬛', a:'#000000', b:'#0c0c11' },
  { id:'auto',   name:'Järjestelmä',  icon:'🔄', a:'#0a0a0f', b:'#f4f4f8' }
];

// Paketin accent asetetaan vain kun paketti valitaan, jotta oman
// korostusvärin voi vaihtaa jälkikäteen ilman että paketti pakottaa sen takaisin.
const THEME_PACKS = [
  { id:'perus',  name:'Perus',     accent:null,      prev:['#0a0a0f','#e8b84b','#4ade80'] },
  { id:'neon',   name:'Neon',      accent:'#3dd6ff', prev:['#05050e','#3dd6ff','#39ff8b'] },
  { id:'sepia',  name:'Sepia',     accent:'#a0522d', prev:['#efe4d2','#a0522d','#4f7a2f'] },
  { id:'nordic', name:'Nordic',    accent:'#88c0d0', prev:['#2e3440','#88c0d0','#a3be8c'] },
  { id:'vhs',    name:'Retro VHS', accent:'#ff2e88', prev:['#0d0518','#ff2e88','#00d9ff'] },
  { id:'paperi', name:'Paperi',    accent:'#4a5568', prev:['#fbfaf7','#4a5568','#166534'] }
];
window.THEME_PACKS = THEME_PACKS;

const prefersLight = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

// Mikä tila on oikeasti voimassa (auto ratkaistaan järjestelmästä)
function effectiveMode(){
  const s = (typeof appData !== 'undefined' && appData.settings) || {};
  const m = s.themeMode || 'dark';
  if(m !== 'auto') return m;
  return (prefersLight && prefersLight.matches) ? 'light' : 'dark';
}

window.applyTheme = function(){
  const s = (typeof appData !== 'undefined' && appData.settings) || {};
  const pack = s.themePack || 'perus';
  const root = document.documentElement;
  root.setAttribute('data-theme', effectiveMode());
  root.setAttribute('data-pack', pack);

  // Androidin statusbar seuraa taustaväriä. Arvo pitää lukea vasta
  // attribuuttien asettamisen jälkeen, muuten saadaan edellinen väri.
  requestAnimationFrame(() => {
    let bg = '';
    try { bg = getComputedStyle(root).getPropertyValue('--bg').trim(); } catch(e){}
    if(!bg) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', bg));
  });
};

// Järjestelmän tila voi vaihtua kesken käytön (Androidin öinen tila)
if(prefersLight && prefersLight.addEventListener){
  prefersLight.addEventListener('change', () => {
    const s = (typeof appData !== 'undefined' && appData.settings) || {};
    if((s.themeMode || 'dark') === 'auto') window.applyTheme();
  });
}

window.setThemeMode = async function(id){
  const s = ensureSettings();
  s.themeMode = id;
  // Tilan valitseminen tarkoittaa paluuta perusväreihin — muuten
  // nappi näyttäisi menevän rikki, koska paketti peittää tilan.
  if(s.themePack && s.themePack !== 'perus') s.themePack = 'perus';
  window.applyTheme();
  window.renderThemeSettings();
  if(window.renderAll) renderAll();
  await window.fbSave();
};

window.setThemePack = async function(id){
  const s = ensureSettings();
  s.themePack = id;
  const p = THEME_PACKS.find(x => x.id === id);
  if(p && p.accent){
    s.accent = p.accent;
    if(window.applyAccent) window.applyAccent(p.accent);
    if(window.renderAccentRow) window.renderAccentRow();
  }
  window.applyTheme();
  window.renderThemeSettings();
  if(window.renderAll) renderAll();
  await window.fbSave();
};

window.renderThemeSettings = function(){
  const s = ensureSettings();
  const modeEl = document.getElementById('themeModeRow');
  if(modeEl){
    const cur = s.themeMode || 'dark';
    const locked = (s.themePack && s.themePack !== 'perus');
    modeEl.innerHTML = THEME_MODES.map(m => `
      <button type="button" class="theme-mode-btn ${m.id===cur && !locked ? 'active':''}" onclick="setThemeMode('${m.id}')">
        <span class="theme-mode-swatch" style="background:${m.a};"><i style="background:${m.b};"></i></span>
        <span>${m.icon} ${esc(m.name)}</span>
      </button>`).join('');
  }
  const packEl = document.getElementById('themePackRow');
  if(packEl){
    const cur = s.themePack || 'perus';
    packEl.innerHTML = THEME_PACKS.map(p => `
      <button type="button" class="theme-pack ${p.id===cur?'active':''}" onclick="setThemePack('${p.id}')">
        <span class="theme-pack-prev" style="background:${p.prev[0]};">
          <span class="theme-pack-bar b1" style="background:${p.prev[1]};"></span>
          <span class="theme-pack-bar b2" style="background:${p.prev[2]};"></span>
        </span>
        <span class="theme-pack-name">${esc(p.name)}</span>
      </button>`).join('');
  }
  const note = document.getElementById('themeNote');
  if(note){
    note.textContent = (s.themePack && s.themePack !== 'perus')
      ? 'Väripaketti määrittelee kaikki värit itse, joten tumma/vaalea-valinta ei vaikuta nyt. Valitse Perus jos haluat sen takaisin käyttöön.'
      : (s.themeMode === 'auto'
          ? 'Seuraa puhelimen tummaa tilaa. Vaihtuu itsestään kun Android vaihtaa.'
          : 'AMOLED sammuttaa mustat pikselit kokonaan ja säästää akkua OLED-näytöllä.');
  }
};

// ════════════════════════════════════════════════════════════
// 2. PISTELUOKKIEN RAJAT
// ════════════════════════════════════════════════════════════

window.renderScoreBandSettings = function(){
  const b = scoreBands();
  const prev = document.getElementById('thrPreview');
  if(prev){
    prev.innerHTML = `
      <span class="thr-seg low"  style="width:${b.mid}%">${b.mid >= 14 ? '0–'+(b.mid-1) : ''}</span>
      <span class="thr-seg mid"  style="width:${b.high-b.mid}%">${(b.high-b.mid) >= 14 ? b.mid+'–'+(b.high-1) : ''}</span>
      <span class="thr-seg high" style="width:${100-b.high}%">${(100-b.high) >= 14 ? b.high+'–100' : ''}</span>`;
  }
  const hs = document.getElementById('thrHigh');
  const ms = document.getElementById('thrMid');
  if(hs && document.activeElement !== hs) hs.value = b.high;
  if(ms && document.activeElement !== ms) ms.value = b.mid;
  const hv = document.getElementById('thrHighVal');
  const mv = document.getElementById('thrMidVal');
  if(hv) hv.textContent = b.high;
  if(mv) mv.textContent = b.mid;
  if(ms) ms.max = String(Math.max(1, b.high - 1));
};

// live = liu'utuksen aikana (ei tallenneta joka pikselistä)
window.setScoreBand = function(which, val, live){
  const s = ensureSettings();
  if(!s.scoreBands) s.scoreBands = { high:70, mid:40 };
  let v = Math.round(Number(val));
  if(!isFinite(v)) return;
  if(which === 'high'){
    v = Math.max(2, Math.min(100, v));
    s.scoreBands.high = v;
    if(s.scoreBands.mid >= v) s.scoreBands.mid = v - 1;   // mid ei voi ohittaa highia
  } else {
    v = Math.max(0, Math.min(s.scoreBands.high - 1, v));
    s.scoreBands.mid = v;
  }
  window.renderScoreBandSettings();
  if(live) return;
  if(window.renderAll) renderAll();
  window.fbSave();
};

window.resetScoreBands = async function(){
  const s = ensureSettings();
  s.scoreBands = { high:70, mid:40 };
  window.renderScoreBandSettings();
  if(window.renderAll) renderAll();
  await window.fbSave();
};

// ════════════════════════════════════════════════════════════
// 3. KIRJAUTUMISRUUDUN JULISTEKOLLAASI
// Kirjautumisruutu näkyy ennen kuin pilviyhteyttä on, joten julisteiden
// polut otetaan edellisellä käynnillä talteen localStorageen.
// ════════════════════════════════════════════════════════════

const LC_KEY = 'arvostelut_loginPosters_v1';
const LC_MAX = 36;

window.cacheLoginPosters = function(){
  try{
    const seen = new Set();
    const out = [];
    // Parhaat ensin: omalla kokoelmalla on mukavampi katsoa suosikkeja
    (appData.reviews || [])
      .filter(r => r && r.poster)
      .map(r => ({ p: r.poster, s: (typeof getReviewScore === 'function' ? getReviewScore(r) : null) }))
      .sort((a, b) => (b.s == null ? -1 : b.s) - (a.s == null ? -1 : a.s))
      .forEach(x => { if(!seen.has(x.p) && out.length < LC_MAX){ seen.add(x.p); out.push(x.p); } });
    if(out.length) localStorage.setItem(LC_KEY, JSON.stringify(out));
  } catch(e){}
};

function buildLoginCollage(){
  const host = document.getElementById('loginCollage');
  if(!host || host.dataset.built) return;
  let posters = [];
  try{ posters = JSON.parse(localStorage.getItem(LC_KEY) || '[]'); } catch(e){}
  if(!Array.isArray(posters) || posters.length < 6) return;   // liian harva näyttäisi rikkinäiseltä
  host.dataset.built = '1';

  // Kolme saraketta, jokainen omalla nopeudellaan ja suunnallaan.
  // Sisältö monistetaan kolmesti, jotta vieritys on saumaton.
  const cols = [[], [], []];
  posters.forEach((p, i) => cols[i % 3].push(p));
  host.innerHTML = cols.map((col, ci) => {
    if(!col.length) return '';
    const imgs = col.concat(col, col)
      .map(p => `<img src="https://image.tmdb.org/t/p/w185${p}" alt="" loading="lazy" decoding="async">`)
      .join('');
    const dur = 70 + ci * 22;
    const anim = ci === 1 ? 'lcDriftUp' : 'lcDrift';
    return `<div class="lc-col" style="left:${ci*33.34}%;animation:${anim} ${dur}s linear infinite;">${imgs}</div>`;
  }).join('');
  requestAnimationFrame(() => host.classList.add('on'));
}

// ════════════════════════════════════════════════════════════
// 4. MODAALIN SULKEMINEN ALASPÄIN VETÄMÄLLÄ
// Veto aloitetaan vain kahvasta tai kun arkki on vieritetty ylös asti,
// jottei sisällön selaaminen sulje ikkunaa vahingossa.
// ════════════════════════════════════════════════════════════

const DRAG_CLOSE_PX = 110;      // näin pitkä veto sulkee
const DRAG_FLICK_V  = 0.55;     // ...tai tätä nopeampi heilautus (px/ms)

(function initSheetDrag(){
  let sheet = null, overlay = null, grab = null;
  let startY = 0, startT = 0, lastY = 0, lastT = 0, dy = 0, active = false;

  function overlayOf(el){ return el ? el.closest('.modal-overlay') : null; }

  document.addEventListener('touchstart', e => {
    if(active) return;
    const t = e.target;
    const s = t.closest ? t.closest('.modal-sheet') : null;
    if(!s) return;
    const g = t.closest('.modal-grab');
    // Kahvasta saa aina vetää. Muualta vain jos ollaan aivan ylhäällä,
    // eikä kosketus ole vieritettävän tai säädettävän elementin päällä.
    if(!g){
      if(s.scrollTop > 2) return;
      if(t.closest('input,textarea,select,.weight-slider,.thr-slider,.tmdb-results,.autocomplete-list,.bulk-list,.sq-list,#moveList')) return;
    }
    sheet = s; overlay = overlayOf(s); grab = g;
    startY = lastY = e.touches[0].clientY;
    startT = lastT = performance.now();
    dy = 0; active = true;
    sheet.classList.remove('snapback');
  }, { passive:true });

  document.addEventListener('touchmove', e => {
    if(!active || !sheet) return;
    const y = e.touches[0].clientY;
    dy = y - startY;
    lastY = y; lastT = performance.now();

    if(dy <= 0){
      // Ylöspäin veto on tavallista vieritystä
      sheet.style.transform = '';
      sheet.classList.remove('dragging');
      if(grab) grab.classList.remove('active');
      return;
    }
    if(!grab && sheet.scrollTop > 2){ active = false; sheet.style.transform = ''; return; }

    sheet.classList.add('dragging');
    if(grab) grab.classList.add('active');
    // Vastus: mitä pidemmälle vetää, sitä raskaammalta tuntuu
    const shown = dy < DRAG_CLOSE_PX ? dy : DRAG_CLOSE_PX + (dy - DRAG_CLOSE_PX) * 0.4;
    sheet.style.transform = `translateY(${shown}px)`;
    if(overlay) overlay.style.opacity = String(Math.max(0.35, 1 - dy / 700));
    if(e.cancelable) e.preventDefault();
  }, { passive:false });

  function end(){
    if(!active || !sheet) return;
    const v = (lastY - startY) / Math.max(1, lastT - startT);
    const shouldClose = dy > DRAG_CLOSE_PX || (dy > 40 && v > DRAG_FLICK_V);
    const s = sheet, o = overlay, g = grab;
    active = false; sheet = null; overlay = null; grab = null;

    s.classList.remove('dragging');
    if(g) g.classList.remove('active');

    if(shouldClose && o){
      s.classList.add('snapback');
      s.style.transform = 'translateY(100%)';
      setTimeout(() => {
        window.closeModal(o.id);
        s.style.transform = '';
        s.classList.remove('snapback');
        o.style.opacity = '';
      }, 200);
    } else {
      s.classList.add('snapback');
      s.style.transform = '';
      if(o) o.style.opacity = '';
      setTimeout(() => s.classList.remove('snapback'), 240);
    }
  }
  document.addEventListener('touchend', end, { passive:true });
  document.addEventListener('touchcancel', end, { passive:true });
})();

// ════════════════════════════════════════════════════════════
// 5. TESTITILA
// Kopioi nykyisen datan muistiin, estää kaikki kirjoitukset ja
// palauttaa alkuperäisen tilan poistuttaessa. Mitään ei mene pilveen,
// joten teemoja ja asetuksia voi kokeilla rauhassa.
// ════════════════════════════════════════════════════════════

let _sandboxSnapshot = null;
let _sandboxChanges = 0;

window.startSandbox = function(){
  if(window._sandbox) return;
  _sandboxSnapshot = JSON.stringify(appData);
  _sandboxChanges = 0;
  window._sandbox = true;
  document.body.classList.add('sandbox-on');
  const bar = document.getElementById('sandboxBar');
  if(bar) bar.classList.add('on');
  window.updateSandboxBar();
  window.renderSandboxSettings();
  const el = document.getElementById('saveStatus');
  if(el){
    el.textContent = '🧪 Testitila päällä — mitään ei tallenneta';
    el.style.background = '#7c3aed'; el.style.color = 'white'; el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 2600);
  }
};

window.sandboxTouched = function(){
  _sandboxChanges++;
  window.updateSandboxBar();
};

window.updateSandboxBar = function(){
  const t = document.getElementById('sandboxBarText');
  if(!t) return;
  t.textContent = _sandboxChanges
    ? `🧪 Testitila — ${_sandboxChanges} muutosta, joita ei tallenneta`
    : '🧪 Testitila — muutoksia ei tallenneta';
};

window.stopSandbox = function(silent){
  if(!window._sandbox) return;
  if(!silent && _sandboxChanges && !confirm(`Poistutaanko testitilasta? ${_sandboxChanges} muutosta hylätään ja alkuperäiset asetukset palautetaan.`)) return;
  window._sandbox = false;
  try{
    if(_sandboxSnapshot) appData = JSON.parse(_sandboxSnapshot);
  } catch(e){}
  _sandboxSnapshot = null;
  _sandboxChanges = 0;
  document.body.classList.remove('sandbox-on');
  const bar = document.getElementById('sandboxBar');
  if(bar) bar.classList.remove('on');

  // Palauta ulkoasu ja lista alkuperäiseen tilaan
  try{ ensureSettings(); } catch(e){}
  if(typeof GENRES !== 'undefined') GENRES = [...(appData.genres || [])];
  if(window.applyAccent && appData.settings) window.applyAccent(appData.settings.accent);
  window.applyTheme();
  if(window.renderAll) renderAll();
  window.renderThemeSettings();
  window.renderScoreBandSettings();
  window.renderSandboxSettings();
  if(window.renderAccentRow) window.renderAccentRow();
};

window.renderSandboxSettings = function(){
  const el = document.getElementById('sandboxBox');
  if(!el) return;
  el.innerHTML = window._sandbox
    ? `<div class="token-state" style="border-color:var(--purple);color:var(--purple);">🧪 Testitila on päällä. Kokeile teemoja, värejä ja rajoja vapaasti — mikään ei tallennu pilveen. Poistuminen palauttaa kaiken ennalleen.</div>
       <button class="btn-primary" style="width:100%;margin-top:10px;" onclick="stopSandbox()">↩️ Poistu testitilasta ja palauta asetukset</button>`
    : `<div class="toggle-row-sub" style="margin-bottom:10px;">Testitila ottaa datasta kopion muistiin ja katkaisee tallennuksen pilveen. Voit kokeilla teemoja, korostusvärejä, pisterajoja ja painotuksia näkemättä niiden vaikutusta oikeaan dataan. Poistuminen palauttaa kaiken sellaisena kuin se oli.</div>
       <button class="btn-secondary" style="width:100%;padding:13px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;" onclick="startSandbox()">🧪 Käynnistä testitila</button>`;
};

// ════════════════════════════════════════════════════════════
// 6. TMDB-TUNNUS ASETUKSISTA
// ════════════════════════════════════════════════════════════

// Ottaa asetuksiin tallennetun tunnuksen käyttöön. Kutsutaan
// ensureSettings():sta, joten se ajetaan aina kun asetuksia luetaan.
window.syncTmdbToken = function(){
  const s = (typeof appData !== 'undefined' && appData.settings) || {};
  const want = String(s.tmdbToken || '').trim() || window.tmdbTokenDefault || window.tmdbToken;
  if(want && want !== window.tmdbToken){
    window.tmdbToken = want;
    if(window.tmdbIssuedAt) window.tmdbTokenIssuedAt = window.tmdbIssuedAt(want);
    // Tarkistus uudelleen, jotta asetusten tilarivi kertoo totuuden
    if(window.recheckTmdbToken) window.recheckTmdbToken();
  }
};

window.renderTokenSettings = function(){
  const s = ensureSettings();
  const inp = document.getElementById('tmdbTokenInput');
  if(inp && document.activeElement !== inp) inp.value = s.tmdbToken || '';
  const st = document.getElementById('tmdbTokenState');
  if(st){
    const custom = !!String(s.tmdbToken || '').trim();
    st.className = 'token-state';
    st.textContent = custom
      ? '🔑 Käytössä on asetuksiin tallennettu oma tunnus. Se säilyy vain omassa pilvessäsi.'
      : '📦 Käytössä on koodiin kirjoitettu oletustunnus. Jos repositorio on julkinen, tunnus näkyy kaikille — kannattaa vaihtaa oma tähän.';
  }
};

window.testTmdbTokenInput = async function(){
  const inp = document.getElementById('tmdbTokenInput');
  const st = document.getElementById('tmdbTokenState');
  if(!inp || !st) return;
  const val = inp.value.trim();
  st.className = 'token-state';
  st.textContent = '⏳ Testataan tunnusta...';
  const r = await window.tmdbTestToken(val || window.tmdbTokenDefault);
  st.className = 'token-state ' + (r.ok ? 'ok' : 'bad');
  st.textContent = r.ok
    ? `✅ Tunnus toimii (${r.message}). Muista vielä tallentaa.`
    : `❌ ${r.message}`;
};

window.saveTmdbToken = async function(){
  const inp = document.getElementById('tmdbTokenInput');
  if(!inp) return;
  const val = inp.value.trim();
  if(val){
    const r = await window.tmdbTestToken(val);
    if(!r.ok && !confirm(`Tunnus ei läpäissyt testiä (${r.message}). Tallennetaanko silti?`)) return;
  }
  ensureSettings().tmdbToken = val;
  window.syncTmdbToken();
  window.renderTokenSettings();
  if(window.refreshTmdbStatusInSettings) window.refreshTmdbStatusInSettings();
  await window.fbSave();
};

window.clearTmdbToken = async function(){
  if(!confirm('Palautetaanko koodissa oleva oletustunnus käyttöön?')) return;
  ensureSettings().tmdbToken = '';
  window.tmdbToken = window.tmdbTokenDefault;
  if(window.tmdbIssuedAt) window.tmdbTokenIssuedAt = window.tmdbIssuedAt(window.tmdbToken);
  if(window.recheckTmdbToken) window.recheckTmdbToken();
  window.renderTokenSettings();
  await window.fbSave();
};

// ════════════════════════════════════════════════════════════
// 7. TMDB-KUTSUJEN LASKURI
// ════════════════════════════════════════════════════════════

const KIND_LABELS = {
  haku:'Haut', tiedot:'Teostiedot', kaudet:'Kaudet',
  suositukset:'Suositukset', löydä:'Löydä', tarkistus:'Tunnuksen testit', muu:'Muut'
};

window.renderTmdbCalls = function(){
  const el = document.getElementById('tmdbCallsBox');
  if(!el || !window.tmdbCallStats) return;
  const st = window.tmdbCallStats();
  const max = Math.max(1, ...st.days.map(d => d.n));
  const wd = ['su','ma','ti','ke','to','pe','la'];

  const bars = st.days.map((d, i) => {
    const isToday = i === st.days.length - 1;
    return `<div class="calls-bar ${isToday?'today':''}" style="height:${Math.max(2, d.n/max*100)}%" title="${d.date}: ${d.n}"></div>`;
  }).join('');
  const labels = st.days.map(d => {
    const wday = wd[new Date(d.date + 'T00:00:00').getDay()];
    return `<div class="calls-day">${wday}<br>${d.n}</div>`;
  }).join('');

  const kinds = Object.entries(st.kinds)
    .sort((a,b) => b[1] - a[1])
    .map(([k,v]) => `<span class="bulk-tag">${esc(KIND_LABELS[k] || k)}: ${v}</span>`).join('');

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-box-label">Tänään</div>
        <div class="stat-box-value">${st.today}</div>
        <div class="stat-box-sub">kutsua</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">7 päivää</div>
        <div class="stat-box-value">${st.week}</div>
        <div class="stat-box-sub">yhteensä ${st.total}</div>
      </div>
    </div>
    <div class="calls-bars">${bars}</div>
    <div class="calls-days">${labels}</div>
    ${kinds ? `<div class="bulk-tags" style="margin-top:10px;">${kinds}</div>` : ''}
    <div class="toggle-row-sub" style="margin-top:10px;">
      TMDB:n käytännön raja on noin 50 kutsua sekunnissa eikä päiväkiintiötä ole,
      joten normaali käyttö ei ole lähelläkään rajaa. Luvut ovat tämän laitteen omia
      ja kertovat lähinnä sen, mikä toiminto kuluttaa verkkoa.
      ${st.lastAt ? '<br>Viimeisin kutsu: ' + new Date(st.lastAt).toLocaleString('fi-FI') : ''}
    </div>
    <button class="thr-reset" onclick="tmdbResetCalls(); renderTmdbCalls();">🗑️ Nollaa laskurit</button>`;
};

// ════════════════════════════════════════════════════════════
// 8. SUORITUSKYKYTIEDOT
// ════════════════════════════════════════════════════════════

function fmtBytes(n){
  if(n == null || !isFinite(n)) return '–';
  if(n < 1024) return n + ' B';
  if(n < 1024*1024) return (n/1024).toFixed(1).replace('.',',') + ' kt';
  return (n/1048576).toFixed(2).replace('.',',') + ' Mt';
}

window.renderPerfInfo = async function(){
  const el = document.getElementById('perfBox');
  if(!el) return;

  const reviews = appData.reviews || [];
  const size = window.fbSizeInfo ? window.fbSizeInfo() : null;
  const bootMs = (window._loadFinishedAt && window._appStartedAt)
    ? (window._loadFinishedAt - window._appStartedAt) : null;

  // Jaksojen ja kausien määrä kertoo miksi data on ison kokoinen
  let seasons = 0, episodes = 0, posters = 0, withTmdb = 0;
  reviews.forEach(r => {
    if(r.poster) posters++;
    if(r.tmdb_id) withTmdb++;
    (r.seasons || []).forEach(s => { seasons++; episodes += (s.episodes || []).length; });
  });

  let bkpSize = null;
  try{ const b = localStorage.getItem('arvostelut_bkp'); if(b) bkpSize = new Blob([b]).size; } catch(e){}

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-box-label">Arvosteluja</div>
        <div class="stat-box-value">${reviews.length}</div>
        <div class="stat-box-sub">${withTmdb} TMDB-tunnuksella</div></div>
      <div class="stat-box"><div class="stat-box-label">Käynnistys</div>
        <div class="stat-box-value">${bootMs != null ? (bootMs/1000).toFixed(2).replace('.',',') + ' s' : '–'}</div>
        <div class="stat-box-sub">avaus → data valmiina</div></div>
      <div class="stat-box"><div class="stat-box-label">Jaksoja</div>
        <div class="stat-box-value">${episodes}</div>
        <div class="stat-box-sub">${seasons} kautta</div></div>
      <div class="stat-box"><div class="stat-box-label">Julisteita</div>
        <div class="stat-box-value">${posters}</div>
        <div class="stat-box-sub">kuvia välimuistissa</div></div>
      <div class="stat-box stat-wide"><div class="stat-box-label">Suurin dokumentti</div>
        <div class="stat-box-value">${size ? fmtBytes(size.largest) : '–'}</div>
        <div class="stat-box-sub">${size && size.largestName ? esc(size.largestName) : ''} · Firestoren raja on 1 Mt</div></div>
      <div class="stat-box stat-wide"><div class="stat-box-label">Paikallinen tila</div>
        <div class="stat-box-value" id="perfStorage">lasketaan…</div>
        <div class="stat-box-sub">Firestore-välimuisti: ${esc(window._fbCacheMode || 'tuntematon')}
          · varmuuskopio ${fmtBytes(bkpSize)}
          · asetukset ${size ? fmtBytes(size.metaSize) : '–'}</div></div>
      <div class="stat-box stat-wide"><div class="stat-box-label">Selaimen välimuisti</div>
        <div class="stat-box-value" id="perfCaches" style="font-size:16px;line-height:1.5;">lasketaan…</div>
        <div class="stat-box-sub">Service worker säilyttää sovelluksen ja julisteet offline-käyttöä varten</div></div>
    </div>
    <button class="thr-reset" onclick="renderPerfInfo()">🔄 Päivitä luvut</button>`;

  // Nämä ovat asynkronisia, joten ne täytetään jälkikäteen
  try{
    if(navigator.storage && navigator.storage.estimate){
      const est = await navigator.storage.estimate();
      const t = document.getElementById('perfStorage');
      if(t) t.textContent = fmtBytes(est.usage) + (est.quota ? ' / ' + fmtBytes(est.quota) : '');
    } else {
      const t = document.getElementById('perfStorage');
      if(t) t.textContent = 'ei saatavilla';
    }
  } catch(e){}

  try{
    const t = document.getElementById('perfCaches');
    if(!t) return;
    if(!window.caches){ t.textContent = 'ei käytössä'; return; }
    const names = await caches.keys();
    if(!names.length){ t.textContent = 'tyhjä'; return; }
    const rows = [];
    for(const n of names){
      const c = await caches.open(n);
      const k = await c.keys();
      rows.push(`${n.replace(/^arvostelut-|^tmdb-/,'')}: ${k.length}`);
    }
    t.innerHTML = rows.map(r => `<span style="font-size:13px;font-family:'DM Sans',sans-serif;display:block;">${esc(r)}</span>`).join('');
  } catch(e){}
};

// ════════════════════════════════════════════════════════════
// KÄYNNISTYS
// ════════════════════════════════════════════════════════════

window._appStartedAt = Date.now();

// Teema pitää saada päälle heti, ennen kuin asetukset ehtivät pilvestä.
// Muuten sovellus välähtäisi tummana ennen vaaleaan vaihtoa.
(function earlyTheme(){
  try{
    const raw = localStorage.getItem('arvostelut_bkp');
    if(!raw) return;
    const s = (JSON.parse(raw) || {}).settings || {};
    if(s.themeMode) document.documentElement.setAttribute('data-theme',
      s.themeMode === 'auto'
        ? ((prefersLight && prefersLight.matches) ? 'light' : 'dark')
        : s.themeMode);
    if(s.themePack) document.documentElement.setAttribute('data-pack', s.themePack);
  } catch(e){}
})();

document.addEventListener('DOMContentLoaded', buildLoginCollage);
if(document.readyState !== 'loading') buildLoginCollage();

// ── PWA-PIKAKUVAKKEET ──
// Kotinäytön kuvakkeen pitkä painallus voi avata sovelluksen suoraan
// haluttuun toimintoon. Parametri poistetaan osoitteesta, jottei se
// jää päälle seuraavaan käynnistykseen.
(function shortcutRoute(){
  let pika = null;
  try { pika = new URLSearchParams(location.search).get('pika'); } catch(e){}
  if(!pika) return;
  try { history.replaceState({}, '', location.pathname); } catch(e){}
  const go = () => {
    if(pika === 'lisaa' && window.openAddModal) window.openAddModal();
    else if(pika === 'top' && window.setView) window.setView('top');
  };
  // Odota että data on ladattu, muuten lomake avautuu tyhjillä kategorioilla
  let tries = 0;
  const wait = setInterval(() => {
    if((typeof appData !== 'undefined' && appData.categories && appData.categories.length) || ++tries > 40){
      clearInterval(wait); go();
    }
  }, 250);
})();
