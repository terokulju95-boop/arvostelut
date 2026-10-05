// ══ ARVOSTELUT · DVD-hylly ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_DVD = '2026-09-18.0';
//
// Tavallinen skripti. Ajetaan app-core.js:n, app-views.js:n ja
// app-watchlist.js:n JÄLKEEN.
//
// Hylly kertoo mitä levyjä omistat. Se on kolmas oma taulukko arvostelujen
// ja katselulistan rinnalla, samasta syystä kuin katselulista: arvostelu
// tarkoittaa nähtyä teosta, eikä yksikään olemassa oleva laskenta saa
// alkaa nähdä omistettuja levyjä arvosteluina.
//
// ── KOKOELMAT JA PUUTTUVAT OSAT ──
// Elokuvan kokoelma (esim. Taru sormusten herrasta) tulee TMDB:n kentästä
// belongs_to_collection. Tietueeseen tallennetaan vain kokoelman tunnus ja
// nimi. Kokoelman osaluettelo ja sarjan kausiluettelo haetaan TMDB:stä ja
// pidetään tämän laitteen välimuistissa (localStorage), ei Firestoressa:
// ne ovat TMDB:n tietoa, eivät sinun, ja meta-dokumentin koko on rajallinen.
// Toisella laitteella luettelot haetaan kerran uudelleen, yksi kutsu per
// kokoelma tai sarja.
//
// Puuttuvaksi lasketaan vain JULKAISTU osa. Tulossa oleva elokuva tai kausi
// näytetään erikseen, jottei vajaa-merkki pala ennen kuin levyä voi ostaa.
//
// ── TIETUEEN MUOTO ──
//   { id, tmdb_id, tmdb_type, name, orig, year, poster, format, added, note,
//     coll_id, coll_name, cc,          // elokuva; cc = kokoelma tarkistettu
//     seasons, season_count }          // sarja; seasons = omistetut kaudet

function ensureDvds(){
  if(!Array.isArray(appData.dvds)) appData.dvds = [];
  return appData.dvds;
}
window.ensureDvds = ensureDvds;

const DVD_FORMATS = ['DVD', 'Blu-ray', '4K'];
const DVD_FMT_KEY = 'arvostelut_dvdfmt_v1';
const DVD_CACHE_KEY = 'arvostelut_dvdcache_v1';
const DVD_CACHE_TTL = 14 * 86400000;   // luettelot päivitetään kahden viikon välein
const DVD_IMG = 'https://image.tmdb.org/t/p/';

function dvdLastFormat(){
  try{ const f = localStorage.getItem(DVD_FMT_KEY); if(DVD_FORMATS.includes(f)) return f; } catch(e){}
  return 'DVD';
}
function dvdRememberFormat(f){ try{ localStorage.setItem(DVD_FMT_KEY, f); } catch(e){} }

function dvdToday(){ return new Date().toISOString().slice(0, 10); }
function dvdYear(date){ return date ? String(date).slice(0, 4) : ''; }
function dvdReleased(date){ return !!date && String(date) <= dvdToday(); }

function dvdFind(type, tmdbId){
  if(tmdbId == null) return null;
  return ensureDvds().find(d => d && String(d.tmdb_id) === String(tmdbId) && (d.tmdb_type || 'movie') === (type || 'movie')) || null;
}
window.dvdHas = function(type, tmdbId){ return !!dvdFind(type, tmdbId); };

function dvdById(id){
  return ensureDvds().find(d => String(d.id) === String(id)) || null;
}

function dvdNewId(){ return Date.now() + Math.floor(Math.random() * 100000); }

// ════════════════════════════════════════════════════════════
// TMDB-VÄLIMUISTI (vain tällä laitteella)
// ════════════════════════════════════════════════════════════

let dvdCache = null;
function dvdCacheAll(){
  if(dvdCache) return dvdCache;
  try{ dvdCache = JSON.parse(localStorage.getItem(DVD_CACHE_KEY) || '{}') || {}; }
  catch(e){ dvdCache = {}; }
  return dvdCache;
}
function dvdCacheGet(key){ return dvdCacheAll()[key] || null; }
function dvdCacheSet(key, val){
  const c = dvdCacheAll();
  c[key] = Object.assign({ at: Date.now() }, val);
  try{ localStorage.setItem(DVD_CACHE_KEY, JSON.stringify(c)); }
  catch(e){
    // Täysi localStorage ei saa kaataa mitään: tyhjennetään oma välimuisti
    // ja yritetään kerran uudelleen pelkällä tällä merkinnällä.
    dvdCache = { [key]: c[key] };
    try{ localStorage.setItem(DVD_CACHE_KEY, JSON.stringify(dvdCache)); } catch(e2){}
  }
}
function dvdStale(entry){ return !entry || (Date.now() - (entry.at || 0)) > DVD_CACHE_TTL; }

async function dvdFetchCollection(id){
  const d = await window.tmdbGet(`/collection/${id}?language=fi-FI`);
  if(!d || !Array.isArray(d.parts)) return null;
  const parts = d.parts.map(p => ({
    id: p.id, t: p.title || p.original_title || '', o: p.original_title || '',
    d: p.release_date || '', p: p.poster_path || ''
  })).sort((a, b) => (a.d || '9999').localeCompare(b.d || '9999'));
  const entry = { name: d.name || '', poster: d.poster_path || '', parts };
  dvdCacheSet('c:' + id, entry);
  return dvdCacheGet('c:' + id);
}

async function dvdFetchTv(id){
  const d = await window.tmdbGet(`/tv/${id}?language=fi-FI`);
  if(!d) return null;
  const seasons = (d.seasons || [])
    .filter(s => s && s.season_number > 0)
    .map(s => ({ n: s.season_number, name: s.name || '', d: s.air_date || '', p: s.poster_path || '', e: s.episode_count || 0 }))
    .sort((a, b) => a.n - b.n);
  dvdCacheSet('t:' + id, { seasons, status: d.status || '' });
  return { detail: d, entry: dvdCacheGet('t:' + id) };
}

// Hakee taustalla puuttuvat tai vanhentuneet luettelot ja tarkistaa
// kokoelman niille elokuville joilta se on vielä tarkistamatta (esim.
// palautetut tai ilman TMDB-yhteyttä lisätyt). Rinnakkain enintään kolme,
// jottei sadan levyn hylly polta kiintiötä kerralla.
let dvdSyncRunning = false;
// Tässä istunnossa epäonnistuneet haut. Ilman tätä jokainen piirto
// yrittäisi niitä uudelleen, ja piirto käynnistyy haun jälkeen —
// tuloksena loputon kierre jos TMDB ei vastaa.
const dvdFailed = new Set();
async function dvdSyncMeta(force){
  if(dvdSyncRunning || !window.tmdbToken || !window.tmdbGet) return;
  const list = ensureDvds();
  const jobs = [];
  const seen = new Set();

  list.forEach(d => {
    if(!d || d.tmdb_id == null) return;
    if((d.tmdb_type || 'movie') === 'movie' && !d.cc && !dvdFailed.has('m:' + d.tmdb_id)){
      jobs.push({ kind: 'movie', rec: d });
    }
  });
  list.forEach(d => {
    if(!d || d.tmdb_id == null) return;
    if(d.tmdb_type === 'tv'){
      const k = 't:' + d.tmdb_id;
      if(seen.has(k)) return; seen.add(k);
      if(!force && dvdFailed.has(k)) return;
      if(force || dvdStale(dvdCacheGet(k))) jobs.push({ kind: 'tv', id: d.tmdb_id });
    } else if(d.coll_id){
      const k = 'c:' + d.coll_id;
      if(seen.has(k)) return; seen.add(k);
      if(!force && dvdFailed.has(k)) return;
      if(force || dvdStale(dvdCacheGet(k))) jobs.push({ kind: 'coll', id: d.coll_id });
    }
  });
  if(!jobs.length) return;

  dvdSyncRunning = true;
  let recordsChanged = false;
  let fetched = 0;
  const run = async job => {
    if(job.kind === 'coll'){
      const c = await dvdFetchCollection(job.id);
      if(c){ fetched++; dvdFailed.delete('c:' + job.id); } else dvdFailed.add('c:' + job.id);
      return;
    }
    if(job.kind === 'tv'){
      const r = await dvdFetchTv(job.id);
      if(!r) dvdFailed.add('t:' + job.id);
      if(r && r.entry){
        fetched++;
        // Kausimäärä talteen myös tietueeseen, jotta toinen laite näkee
        // puuttuvat kaudet jo ennen omaa hakuaan.
        const aired = r.entry.seasons.filter(s => dvdReleased(s.d)).length;
        ensureDvds().forEach(d => {
          if(d.tmdb_type === 'tv' && String(d.tmdb_id) === String(job.id) && d.season_count !== aired){
            d.season_count = aired; recordsChanged = true;
          }
        });
      }
      return;
    }
    if(job.kind === 'movie'){
      const m = await window.tmdbGet(`/movie/${job.rec.tmdb_id}?language=fi-FI`);
      if(!m){ dvdFailed.add('m:' + job.rec.tmdb_id); return; }
      fetched++;
      const c = m.belongs_to_collection;
      job.rec.coll_id = c ? c.id : null;
      job.rec.coll_name = c ? (c.name || '') : null;
      if(!job.rec.poster && m.poster_path) job.rec.poster = m.poster_path;
      job.rec.cc = 1;
      recordsChanged = true;
      if(c && dvdStale(dvdCacheGet('c:' + c.id))) await dvdFetchCollection(c.id);
    }
  };

  try{
    const queue = jobs.slice();
    const workers = [0, 1, 2].map(async () => {
      while(queue.length){
        const j = queue.shift();
        try{ await run(j); } catch(e){}
      }
    });
    await Promise.all(workers);
  } finally {
    dvdSyncRunning = false;
  }
  if(recordsChanged && window.fbSave) await window.fbSave();
  if(fetched && window.currentViewIsDvd && window.currentViewIsDvd()) window.renderDvd();
}
window.dvdRefreshAll = async function(){
  dvdFailed.clear();
  if(window.showStatus) window.showStatus('🔄 Päivitetään kokoelmia ja kausia…', '#8b8b9e', 2500);
  await dvdSyncMeta(true);
  if(window.showStatus) window.showStatus('✅ Hyllyn tiedot päivitetty', '#22c55e', 2500);
};

// ════════════════════════════════════════════════════════════
// RYHMITTELY
// ════════════════════════════════════════════════════════════

// Kokoelman osat yhdistettynä omistettuihin. Jos luetteloa ei ole vielä
// haettu, näytetään omistetut ja merkitään luettelo puuttuvaksi.
function dvdCollectionGroup(collId, owned){
  const cache = dvdCacheGet('c:' + collId);
  const ownedByTmdb = new Map(owned.map(d => [String(d.tmdb_id), d]));
  let items, known = !!cache;
  if(cache){
    items = cache.parts.map(p => {
      const rec = ownedByTmdb.get(String(p.id)) || null;
      return { part: p, rec, state: rec ? 'owned' : (dvdReleased(p.d) ? 'missing' : 'upcoming') };
    });
    // Omistettu levy jota TMDB ei enää listaa kokoelmassa: näytetään silti.
    owned.forEach(d => {
      if(!cache.parts.some(p => String(p.id) === String(d.tmdb_id))){
        items.push({ part: null, rec: d, state: 'owned' });
      }
    });
  } else {
    items = owned.slice().sort((a, b) => String(a.year || '').localeCompare(String(b.year || '')))
      .map(d => ({ part: null, rec: d, state: 'owned' }));
  }
  const name = (cache && cache.name) || (owned[0] && owned[0].coll_name) || 'Kokoelma';
  return {
    id: collId, name, poster: cache ? cache.poster : '', known, items,
    owned: items.filter(i => i.state === 'owned').length,
    missing: items.filter(i => i.state === 'missing'),
    upcoming: items.filter(i => i.state === 'upcoming'),
    total: items.filter(i => i.state !== 'upcoming').length,
    added: owned.reduce((m, d) => (d.added || '') > m ? (d.added || '') : m, ''),
    year: items.length ? (items[0].part ? dvdYear(items[0].part.d) : String(items[0].rec.year || '')) : ''
  };
}

function dvdTvSeasons(d){
  const cache = dvdCacheGet('t:' + d.tmdb_id);
  const owned = new Set((d.seasons || []).map(Number));
  let all;
  if(cache && Array.isArray(cache.seasons)){
    all = cache.seasons.map(s => ({ n: s.n, d: s.d, aired: dvdReleased(s.d) }));
  } else {
    const n = Number(d.season_count) || 0;
    all = [];
    for(let i = 1; i <= n; i++) all.push({ n: i, d: '', aired: true });
  }
  // Omistettu kausi jota luettelossa ei ole (esim. käsin merkitty): mukaan.
  owned.forEach(n => { if(!all.some(s => s.n === n)) all.push({ n, d: '', aired: true }); });
  all.sort((a, b) => a.n - b.n);
  all.forEach(s => { s.owned = owned.has(s.n); });
  const missing = all.filter(s => s.aired && !s.owned);
  return { all, missing, ownedCount: all.filter(s => s.owned).length, airedCount: all.filter(s => s.aired).length };
}

function dvdGroups(){
  const list = ensureDvds().filter(Boolean);
  const byColl = new Map();
  const singles = [];
  const tv = [];
  list.forEach(d => {
    if(d.tmdb_type === 'tv') tv.push(d);
    else if(d.coll_id) {
      const k = String(d.coll_id);
      if(!byColl.has(k)) byColl.set(k, []);
      byColl.get(k).push(d);
    } else singles.push(d);
  });
  const colls = [...byColl.entries()].map(([id, owned]) => dvdCollectionGroup(id, owned));
  return { colls, singles, tv };
}

// ════════════════════════════════════════════════════════════
// TILA JA NÄKYMÄ
// ════════════════════════════════════════════════════════════

let dvdFilter = 'all';   // all | coll | movie | tv | gaps
let dvdSort = 'name';    // name | added | year
let dvdQuery = '';

window.dvdSetFilter = function(v){ dvdFilter = v; window.renderDvd(); };
window.dvdSetSort = function(v){ dvdSort = v; window.renderDvd(); };
window.dvdOnSearch = function(v){
  dvdQuery = String(v || '');
  const clr = document.getElementById('dvdSearchClear');
  if(clr) clr.style.display = dvdQuery ? '' : 'none';
  dvdRenderBody();
};
window.dvdClearSearch = function(){
  dvdQuery = '';
  const i = document.getElementById('dvdSearch');
  if(i){ i.value = ''; i.focus(); }
  window.dvdOnSearch('');
};

function dvdCmp(a, b, nameA, nameB, yearA, yearB, addedA, addedB){
  if(dvdSort === 'added') return String(addedB || '').localeCompare(String(addedA || ''));
  if(dvdSort === 'year'){
    const d = (Number(yearA) || 9999) - (Number(yearB) || 9999);
    if(d) return d;
  }
  return String(nameA || '').localeCompare(String(nameB || ''), 'fi');
}

function dvdPoster(path, size, cls, fallback){
  if(path) return `<img class="${cls}" src="${DVD_IMG}${size}${esc(path)}" loading="lazy" alt="">`;
  return `<div class="${cls} dvd-noposter">${fallback || '📀'}</div>`;
}

function dvdFmtBadge(d){
  const f = d && d.format;
  if(!f) return '';
  const cls = f === '4K' ? ' is-4k' : f === 'Blu-ray' ? ' is-br' : '';
  return `<span class="dvd-fmt${cls}">${esc(f)}</span>`;
}

// Kokoelman sisällä toistuva sarjan nimi on turha: "Taru sormusten
// herrasta: Kaksi tornia" näkyy kannen alla muodossa "Kaksi tornia".
// Koko nimi säilyy title-attribuutissa ja levyn tiedoissa.
function dvdShortTitle(title, collName){
  const t = String(title || '');
  if(!collName) return t;
  const base = String(collName).replace(/\s*[-–]?\s*(kokoelma|collection|elokuvasarja|sarja)\s*$/i, '').trim();
  if(base.length < 3) return t;
  if(t.toLowerCase().indexOf(base.toLowerCase()) !== 0) return t;
  const rest = t.slice(base.length).replace(/^[\s:–\-.,]+/, '').trim();
  return rest.length >= 2 ? rest : t;
}

function dvdTileOwned(d, collName){
  return `<button type="button" class="dvd-tile" onclick="dvdOpenItem('${escJs(String(d.id))}')">
    ${dvdPoster(d.poster, 'w185', 'dvd-tile-img', '🎬')}
    ${dvdFmtBadge(d)}
    <div class="dvd-tile-t" title="${esc(d.name)}">${esc(dvdShortTitle(d.name, collName))}</div>
    <div class="dvd-tile-y">${esc(String(d.year || ''))}</div>
  </button>`;
}

function dvdTileMissing(p, upcoming, collName){
  const y = dvdYear(p.d);
  return `<div class="dvd-tile is-missing${upcoming ? ' is-upcoming' : ''}">
    <div class="dvd-tile-imgwrap">
      ${dvdPoster(p.p, 'w185', 'dvd-tile-img', '🎬')}
      <span class="dvd-miss-tag">${upcoming ? (y ? 'Tulossa ' + esc(y) : 'Tulossa') : 'Puuttuu'}</span>
    </div>
    <div class="dvd-tile-t" title="${esc(p.t)}">${esc(dvdShortTitle(p.t, collName))}</div>
    <div class="dvd-tile-y">${esc(y)}</div>
    ${upcoming ? '' : `<button type="button" class="dvd-tile-add" onclick="dvdOpenAddFor('movie', ${Number(p.id)})">＋ Ostin tämän</button>`}
  </div>`;
}

function dvdCollCard(g){
  const pct = g.total ? Math.round(g.owned / g.total * 100) : 100;
  const complete = g.known && !g.missing.length;
  const status = !g.known ? 'Haetaan kokoelman osia…'
    : complete ? `✅ Koko kokoelma hyllyssä (${g.owned}/${g.total})`
    : `${g.owned}/${g.total} hyllyssä · puuttuu ${g.missing.length}`;
  const tiles = g.items.map(i => i.state === 'owned' ? dvdTileOwned(i.rec, g.name) : dvdTileMissing(i.part, i.state === 'upcoming', g.name)).join('');
  return `<div class="dvd-coll${complete ? ' is-complete' : ''}${g.missing.length ? ' has-gaps' : ''}">
    <div class="dvd-coll-head">
      <div class="dvd-coll-name">🧩 ${esc(g.name)}</div>
      <div class="dvd-coll-status">${esc(status)}</div>
      <div class="dvd-bar"><div class="dvd-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="dvd-strip">${tiles}</div>
  </div>`;
}

function dvdTvCard(d){
  const s = dvdTvSeasons(d);
  const chips = s.all.map(x => {
    const cls = x.owned ? ' on' : (x.aired ? ' miss' : ' soon');
    const title = x.owned ? 'Omistat — napauta poistaaksesi' : x.aired ? 'Puuttuu — napauta merkitäksesi omistetuksi' : 'Ei vielä julkaistu';
    return `<button type="button" class="dvd-season${cls}" title="${title}" onclick="dvdToggleSeason('${escJs(String(d.id))}', ${x.n})">K${x.n}</button>`;
  }).join('');
  const status = !s.all.length ? 'Kausitiedot haetaan…'
    : !s.missing.length ? `✅ Kaikki ${s.airedCount} kautta hyllyssä`
    : `${s.ownedCount}/${s.airedCount} kautta · puuttuu ${s.missing.map(m => 'K' + m.n).join(', ')}`;
  return `<div class="dvd-tv${s.missing.length ? ' has-gaps' : ''}">
    <button type="button" class="dvd-tv-poster" onclick="dvdOpenItem('${escJs(String(d.id))}')">${dvdPoster(d.poster, 'w185', 'dvd-tv-img', '📺')}</button>
    <div class="dvd-tv-body">
      <div class="dvd-tv-t" onclick="dvdOpenItem('${escJs(String(d.id))}')">${esc(d.name)}${d.year ? ` <span class="dvd-dim">${esc(String(d.year))}</span>` : ''} ${dvdFmtBadge(d)}</div>
      <div class="dvd-tv-status">${esc(status)}</div>
      <div class="dvd-seasons">${chips}</div>
    </div>
  </div>`;
}

function dvdSection(title, n, html){
  if(!html) return '';
  return `<div class="dvd-sec"><div class="dvd-sec-t">${title} <span class="dvd-dim">${n}</span></div>${html}</div>`;
}

// ── HAKU ──
// Etsii omista levyistä ja omistettujen kokoelmien PUUTTUVISTA osista.
// Jälkimmäinen on se tilanne kaupassa: "onko minulla jo tämä?"
function dvdSearchHtml(){
  const fz = window.fuzzyMatch, fn = window.fuzzyNormCached || (s => String(s || '').toLowerCase());
  const q = fn(dvdQuery);
  const score = (...names) => names.reduce((m, n) => {
    if(!n) return m;
    const s = fz ? fz(q, fn(n)) : (fn(n).includes(q) ? 70 : 0);
    return s > m ? s : m;
  }, 0);

  const { colls } = dvdGroups();
  const rows = [];
  ensureDvds().forEach(d => {
    const s = score(d.name, d.orig, d.coll_name);
    if(s >= 40) rows.push({ s, html: dvdRowOwned(d) });
  });
  colls.forEach(g => {
    g.items.forEach(i => {
      if(i.state === 'owned') return;
      const s = score(i.part.t, i.part.o);
      if(s >= 40) rows.push({ s: s - 1, html: dvdRowMissing(i.part, g, i.state === 'upcoming') });
    });
  });
  rows.sort((a, b) => b.s - a.s);

  const tmdbBtn = `<button type="button" class="dvd-search-tmdb" onclick="dvdOpenAdd('${escJs(dvdQuery)}')">🔎 Hae TMDB:stä “${esc(dvdQuery)}” ja lisää hyllyyn</button>`;
  if(!rows.length){
    return `<div class="dvd-notfound">
      <div class="dvd-notfound-ico">🚫📀</div>
      <div class="dvd-notfound-t">Ei hyllyssäsi</div>
      <div class="dvd-notfound-s">Haulla “${esc(dvdQuery)}” ei löytynyt omistamaasi levyä eikä puuttuvaa osaa kokoelmistasi.</div>
    </div>${tmdbBtn}`;
  }
  return rows.slice(0, 60).map(r => r.html).join('') + tmdbBtn;
}

function dvdRowOwned(d){
  let extra = '';
  if(d.tmdb_type === 'tv'){
    const s = dvdTvSeasons(d);
    extra = s.missing.length ? ` · puuttuu ${s.missing.map(m => 'K' + m.n).join(', ')}` : ` · kaudet ${s.ownedCount}/${s.airedCount}`;
  } else if(d.coll_name){
    extra = ` · ${d.coll_name}`;
  }
  return `<button type="button" class="dvd-row is-owned" onclick="dvdOpenItem('${escJs(String(d.id))}')">
    ${dvdPoster(d.poster, 'w92', 'dvd-row-img', d.tmdb_type === 'tv' ? '📺' : '🎬')}
    <div class="dvd-row-body">
      <div class="dvd-row-t">${esc(d.name)}${d.year ? ` <span class="dvd-dim">${esc(String(d.year))}</span>` : ''}</div>
      <div class="dvd-row-s"><b class="dvd-yes">✅ Hyllyssä</b> · ${esc(d.format || 'DVD')}${esc(extra)}</div>
    </div>
  </button>`;
}

function dvdRowMissing(p, g, upcoming){
  return `<div class="dvd-row is-missing">
    ${dvdPoster(p.p, 'w92', 'dvd-row-img', '🎬')}
    <div class="dvd-row-body">
      <div class="dvd-row-t">${esc(p.t)}${p.d ? ` <span class="dvd-dim">${esc(dvdYear(p.d))}</span>` : ''}</div>
      <div class="dvd-row-s"><b class="dvd-no">${upcoming ? '⏳ Ei vielä julkaistu' : '❌ Ei hyllyssä'}</b> · kokoelmasta ${esc(g.name)} sinulla on ${g.owned}/${g.total}</div>
    </div>
    ${upcoming ? '' : `<button type="button" class="dvd-row-add" onclick="dvdOpenAddFor('movie', ${Number(p.id)})">＋</button>`}
  </div>`;
}

// ── PÄÄNÄKYMÄ ──
function dvdRenderBody(){
  const out = document.getElementById('dvdBody');
  if(!out) return;
  if(dvdQuery.trim()){ out.innerHTML = dvdSearchHtml(); return; }

  const { colls, singles, tv } = dvdGroups();

  let C = colls.slice(), S = singles.slice(), T = tv.slice();
  if(dvdFilter === 'gaps'){
    C = C.filter(g => g.missing.length);
    T = T.filter(d => dvdTvSeasons(d).missing.length);
    S = [];
  } else if(dvdFilter === 'coll'){ S = []; T = []; }
  else if(dvdFilter === 'movie'){ T = []; }
  else if(dvdFilter === 'tv'){ C = []; S = []; }

  C.sort((a, b) => dvdCmp(a, b, a.name, b.name, a.year, b.year, a.added, b.added));
  S.sort((a, b) => dvdCmp(a, b, a.name, b.name, a.year, b.year, a.added, b.added));
  T.sort((a, b) => dvdCmp(a, b, a.name, b.name, a.year, b.year, a.added, b.added));

  const html =
    dvdSection('🧩 Kokoelmat', C.length, C.map(dvdCollCard).join('')) +
    dvdSection('📺 Sarjat', T.length, T.map(dvdTvCard).join('')) +
    dvdSection('🎬 Elokuvat', S.length, S.length ? `<div class="dvd-grid">${S.map(d => dvdTileOwned(d)).join('')}</div>` : '');

  out.innerHTML = html || `<div class="wl-empty"><div class="wl-empty-sub">${dvdFilter === 'gaps' ? '✅ Ei puuttuvia osia — kaikki kokoelmat ja sarjat ovat täydellisiä.' : 'Ei osumia tällä rajauksella.'}</div></div>`;
}

window.renderDvd = function(){
  const out = document.getElementById('dvdView');
  if(!out) return;
  const all = ensureDvds();

  const head = `<div class="wl-head">
    <div class="wl-head-title">📀 DVD-hylly</div>
    <div class="wl-head-sub">Omistamasi levyt. Elokuvat ryhmittyvät kokoelmiksi automaattisesti TMDB:n tietojen mukaan, ja puuttuvat osat näkyvät.</div>
  </div>`;

  if(!all.length){
    out.innerHTML = head + `<div class="wl-empty">
      <div class="wl-empty-ico">📀</div>
      <div class="wl-empty-title">Hylly on tyhjä</div>
      <div class="wl-empty-sub">Lisää ensimmäinen levy hakemalla se TMDB:stä. Kansikuva tulee mukaan, ja jos elokuva kuuluu sarjaan, näet heti mitkä osat puuttuvat.</div>
      <button class="wl-empty-btn" onclick="dvdOpenAdd()">➕ Lisää levy</button>
    </div>`;
    return;
  }

  const { colls, singles, tv } = dvdGroups();
  const movies = all.filter(d => d.tmdb_type !== 'tv').length;
  const gapColls = colls.filter(g => g.missing.length).length;
  const gapTv = tv.filter(d => dvdTvSeasons(d).missing.length).length;
  const gapParts = colls.reduce((n, g) => n + g.missing.length, 0) + tv.reduce((n, d) => n + dvdTvSeasons(d).missing.length, 0);

  const summary = `<div class="dvd-summary">
    <div class="dvd-stat"><b>${movies}</b><span>elokuvaa</span></div>
    <div class="dvd-stat"><b>${tv.length}</b><span>sarjaa</span></div>
    <div class="dvd-stat"><b>${colls.length}</b><span>kokoelmaa</span></div>
    <div class="dvd-stat${gapParts ? ' is-gap' : ''}"><b>${gapParts}</b><span>puuttuu</span></div>
  </div>`;

  const chip = (v, label, n) => `<button class="wl-chip${dvdFilter === v ? ' on' : ''}" onclick="dvdSetFilter('${v}')">${label}${n != null ? ' ' + n : ''}</button>`;
  const controls = `
    <div class="dvd-toolbar">
      <div class="search-box dvd-search">
        <span class="search-icon">🔍</span>
        <input type="text" id="dvdSearch" placeholder="Onko minulla jo…?" autocomplete="off" value="${esc(dvdQuery)}" oninput="dvdOnSearch(this.value)">
        <button type="button" class="search-clear" id="dvdSearchClear" onclick="dvdClearSearch()" aria-label="Tyhjennä haku" style="${dvdQuery ? '' : 'display:none;'}">✕</button>
      </div>
      <button type="button" class="dvd-add-btn" onclick="dvdOpenAdd()">➕ Lisää</button>
    </div>
    <div class="wl-controls">
      <div class="wl-chips">
        ${chip('all', 'Kaikki', all.length)}
        ${chip('coll', '🧩', colls.length)}
        ${chip('movie', '🎬', movies)}
        ${chip('tv', '📺', tv.length)}
        ${chip('gaps', '⚠️ Vajaat', gapColls + gapTv)}
      </div>
      <select class="wl-sort" onchange="dvdSetSort(this.value)">
        <option value="name"${dvdSort === 'name' ? ' selected' : ''}>Nimi</option>
        <option value="year"${dvdSort === 'year' ? ' selected' : ''}>Vuosi</option>
        <option value="added"${dvdSort === 'added' ? ' selected' : ''}>Lisätty</option>
      </select>
    </div>`;

  // Meta-dokumentin enimmäiskoko on 1 Mt. Varoitetaan hyvissä ajoin.
  let sizeWarn = '';
  try{
    const kb = Math.round(JSON.stringify(all).length / 1024);
    if(kb > 500) sizeWarn = `<div class="dvd-warn">⚠️ Hyllyn tiedot vievät ${kb} kt. Firestoren dokumentin raja on 1024 kt yhteensä asetusten ja katselulistan kanssa.</div>`;
  } catch(e){}

  const foot = `<div class="dvd-foot"><button type="button" class="wl-btn" onclick="dvdRefreshAll()">🔄 Päivitä kokoelmat ja kaudet TMDB:stä</button></div>`;

  out.innerHTML = head + summary + controls + sizeWarn + `<div id="dvdBody"></div>` + foot;
  dvdRenderBody();

  // Taustahaku puuttuville luetteloille. Ei odoteta: näkymä piirtyy heti
  // ja täydentyy kun tiedot saapuvat.
  dvdSyncMeta(false);
};

window.updateDvdBadge = function(){
  const el = document.getElementById('viewTabDvd');
  if(!el) return;
  const n = ensureDvds().length;
  const lbl = el.querySelector('.vt-label');
  if(lbl) lbl.textContent = n ? `Hylly ${n}` : 'Hylly';
};

// ════════════════════════════════════════════════════════════
// MUOKKAUS
// ════════════════════════════════════════════════════════════

async function dvdSaveAndRender(){
  if(window.fbSave) await window.fbSave();
  window.updateDvdBadge();
  window.renderDvd();
}

window.dvdToggleSeason = async function(id, n){
  const d = dvdById(id);
  if(!d) return;
  const set = new Set((d.seasons || []).map(Number));
  if(set.has(n)) set.delete(n); else set.add(n);
  d.seasons = [...set].sort((a, b) => a - b);
  await dvdSaveAndRender();
  if(document.getElementById('dvdItemModal').classList.contains('open')) window.dvdOpenItem(id);
};

window.dvdSetFormat = async function(id, f){
  const d = dvdById(id);
  if(!d || !DVD_FORMATS.includes(f)) return;
  d.format = f;
  await dvdSaveAndRender();
  window.dvdOpenItem(id);
};

window.dvdSetNote = async function(id, v){
  const d = dvdById(id);
  if(!d) return;
  const t = String(v || '').trim();
  if((d.note || '') === t) return;
  d.note = t;
  await dvdSaveAndRender();
};

window.dvdRemove = async function(id){
  const d = dvdById(id);
  if(!d) return;
  if(!confirm('Poistetaanko “' + d.name + '” hyllystä?')) return;
  appData.dvds = ensureDvds().filter(x => String(x.id) !== String(id));
  closeModal('dvdItemModal');
  await dvdSaveAndRender();
  if(window.showStatus) window.showStatus('Poistettu hyllystä', '#8b8b9e', 2000);
};

// ── LEVYN TIEDOT ──
window.dvdOpenItem = function(id){
  const d = dvdById(id);
  if(!d) return;
  const body = document.getElementById('dvdItemBody');
  const isTv = d.tmdb_type === 'tv';

  const review = (appData.reviews || []).find(r => r && r.tmdb_id != null && String(r.tmdb_id) === String(d.tmdb_id)
    && (r.tmdb_type || (r.tvType ? 'tv' : 'movie')) === (d.tmdb_type || 'movie'));
  const reviewLine = review
    ? `<button type="button" class="dvd-item-link" onclick="closeModal('dvdItemModal'); openReadModal('${escJs(String(review.id))}')">⭐ Olet arvostellut tämän${review.score != null ? ' · ' + esc(String(review.score)) + ' p' : ''} →</button>`
    : '';

  let collLine = '';
  if(!isTv && d.coll_id){
    const g = dvdGroups().colls.find(c => String(c.id) === String(d.coll_id));
    if(g) collLine = `<div class="dvd-item-line">🧩 ${esc(g.name)} · ${g.owned}/${g.total} hyllyssä${g.missing.length ? ' · puuttuu: ' + esc(g.missing.map(m => m.part.t).join(', ')) : ''}</div>`;
  }

  let seasons = '';
  if(isTv){
    const s = dvdTvSeasons(d);
    seasons = `<div class="dvd-item-sect">Omistamasi kaudet</div>
      <div class="dvd-seasons">${s.all.map(x => `<button type="button" class="dvd-season${x.owned ? ' on' : x.aired ? ' miss' : ' soon'}" onclick="dvdToggleSeason('${escJs(String(d.id))}', ${x.n})">K${x.n}</button>`).join('') || '<span class="dvd-dim">Kausitietoja ei ole vielä haettu.</span>'}</div>`;
  }

  const fmt = DVD_FORMATS.map(f => `<button type="button" class="dvd-seg${(d.format || 'DVD') === f ? ' on' : ''}" onclick="dvdSetFormat('${escJs(String(d.id))}','${f}')">${f}</button>`).join('');

  body.innerHTML = `
    <div class="dvd-item-top">
      ${dvdPoster(d.poster, 'w342', 'dvd-item-img', isTv ? '📺' : '🎬')}
      <div class="dvd-item-info">
        <div class="dvd-item-t">${esc(d.name)}</div>
        <div class="dvd-item-line">${isTv ? '📺 Sarja' : '🎬 Elokuva'}${d.year ? ' · ' + esc(String(d.year)) : ''}</div>
        ${d.orig && d.orig !== d.name ? `<div class="dvd-item-line dvd-dim">${esc(d.orig)}</div>` : ''}
        <div class="dvd-item-line dvd-dim">Lisätty ${esc(d.added || '')}</div>
        ${collLine}
        ${reviewLine}
      </div>
    </div>
    <div class="dvd-item-sect">Formaatti</div>
    <div class="dvd-segs">${fmt}</div>
    ${seasons}
    <div class="dvd-item-sect">Muistiinpano</div>
    <textarea class="dvd-note" rows="2" placeholder="Esim. erikoisjulkaisu, steelbook, lainassa…" onchange="dvdSetNote('${escJs(String(d.id))}', this.value)">${esc(d.note || '')}</textarea>
    <div class="dvd-item-btns">
      ${d.tmdb_id != null && window.openDiscoverDetail ? `<button type="button" class="wl-btn" onclick="closeModal('dvdItemModal'); openDiscoverDetail('${isTv ? 'tv' : 'movie'}', ${Number(d.tmdb_id)})">ℹ️ Tiedot</button>` : ''}
      <button type="button" class="wl-btn wl-del" onclick="dvdRemove('${escJs(String(d.id))}')">🗑️ Poista hyllystä</button>
    </div>`;
  if(window.openModalOnTop) window.openModalOnTop('dvdItemModal');
};

// ════════════════════════════════════════════════════════════
// LISÄYS
// ════════════════════════════════════════════════════════════

let dvdAddSeq = 0;      // vanhentuneet hakuvastaukset hylätään
let dvdSearchTimer = null;
let dvdPending = null;  // vaihe 2: { type, detail, coll, tvEntry }
let dvdLastAddQuery = '';

window.dvdOpenAdd = function(query){
  dvdPending = null;
  const body = document.getElementById('dvdAddBody');
  body.innerHTML = `
    <div class="dvd-add-title">📀 Lisää hyllyyn</div>
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" id="dvdAddInput" placeholder="Elokuvan tai sarjan nimi…" autocomplete="off" oninput="dvdAddSearch(this.value)">
    </div>
    <div id="dvdAddResults" class="dvd-add-results"></div>`;
  if(window.openModalOnTop) window.openModalOnTop('dvdAddModal');
  const inp = document.getElementById('dvdAddInput');
  if(query){ inp.value = query; window.dvdAddSearch(query, true); }
  setTimeout(() => { try{ inp.focus(); } catch(e){} }, 80);
};

window.dvdAddSearch = function(q, now){
  clearTimeout(dvdSearchTimer);
  dvdLastAddQuery = String(q || '');
  const run = async () => {
    const out = document.getElementById('dvdAddResults');
    if(!out) return;
    const query = String(q || '').trim();
    if(query.length < 2){ out.innerHTML = ''; return; }
    if(!window.tmdbToken){ out.innerHTML = `<div class="dvd-dim dvd-pad">TMDB-tunnus ei ole vielä latautunut.</div>`; return; }
    const seq = ++dvdAddSeq;
    out.innerHTML = `<div class="dvd-dim dvd-pad">Haetaan…</div>`;
    const data = await window.tmdbGet(`/search/multi?query=${encodeURIComponent(query)}&language=fi-FI&include_adult=false`);
    if(seq !== dvdAddSeq) return;
    const res = ((data && data.results) || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 20);
    if(!res.length){ out.innerHTML = `<div class="dvd-dim dvd-pad">Ei tuloksia.</div>`; return; }
    out.innerHTML = res.map(r => {
      const type = r.media_type;
      const title = type === 'tv' ? (r.name || r.original_name) : (r.title || r.original_title);
      const year = dvdYear(type === 'tv' ? r.first_air_date : r.release_date);
      const own = dvdFind(type, r.id);
      const action = own ? `dvdOpenItem('${escJs(String(own.id))}')` : `dvdPick('${type}', ${Number(r.id)})`;
      return `<button type="button" class="dvd-row${own ? ' is-owned' : ''}" onclick="${action}">
        ${dvdPoster(r.poster_path, 'w92', 'dvd-row-img', type === 'tv' ? '📺' : '🎬')}
        <div class="dvd-row-body">
          <div class="dvd-row-t">${esc(title || '')}${year ? ` <span class="dvd-dim">${esc(year)}</span>` : ''}</div>
          <div class="dvd-row-s">${type === 'tv' ? '📺 Sarja' : '🎬 Elokuva'}${own ? ' · <b class="dvd-yes">✅ Jo hyllyssä</b>' : ''}</div>
        </div>
      </button>`;
    }).join('');
  };
  if(now) run(); else dvdSearchTimer = setTimeout(run, 350);
};

// Suora reitti vaiheeseen 2, esim. puuttuvan osan ＋-napista tai Löydä-osiosta.
window.dvdOpenAddFor = function(type, tmdbId){
  const own = dvdFind(type, tmdbId);
  if(own){ window.dvdOpenItem(own.id); return; }
  window.dvdOpenAdd();
  window.dvdPick(type, tmdbId);
};

window.dvdPick = async function(type, tmdbId){
  const out = document.getElementById('dvdAddResults') || document.getElementById('dvdAddBody');
  const body = document.getElementById('dvdAddBody');
  if(out) out.innerHTML = `<div class="dvd-dim dvd-pad">Haetaan tietoja…</div>`;
  const seq = ++dvdAddSeq;

  if(type === 'tv'){
    const r = await dvdFetchTv(tmdbId);
    if(seq !== dvdAddSeq) return;
    if(!r){ if(out) out.innerHTML = `<div class="dvd-dim dvd-pad">Tietojen haku epäonnistui.</div>`; return; }
    dvdPending = { type: 'tv', detail: r.detail, tvEntry: r.entry };
  } else {
    const m = await window.tmdbGet(`/movie/${tmdbId}?language=fi-FI`);
    if(seq !== dvdAddSeq) return;
    if(!m){ if(out) out.innerHTML = `<div class="dvd-dim dvd-pad">Tietojen haku epäonnistui.</div>`; return; }
    let coll = null;
    if(m.belongs_to_collection){
      coll = await dvdFetchCollection(m.belongs_to_collection.id);
      if(seq !== dvdAddSeq) return;
    }
    dvdPending = { type: 'movie', detail: m, coll, collId: m.belongs_to_collection ? m.belongs_to_collection.id : null,
                   collName: m.belongs_to_collection ? m.belongs_to_collection.name : null };
  }
  dvdRenderStep2(body);
};

function dvdRenderStep2(body){
  const P = dvdPending;
  if(!P || !body) return;
  const d = P.detail;
  const isTv = P.type === 'tv';
  const title = isTv ? (d.name || d.original_name) : (d.title || d.original_title);
  const year = dvdYear(isTv ? d.first_air_date : d.release_date);
  const fmt = dvdLastFormat();

  let extra = '';
  if(isTv){
    const seasons = (P.tvEntry && P.tvEntry.seasons) || [];
    extra = `<div class="dvd-item-sect">Mitkä kaudet omistat?</div>
      <div class="dvd-checks">${seasons.map(s => {
        const aired = dvdReleased(s.d);
        return `<label class="dvd-check${aired ? '' : ' is-soon'}"><input type="checkbox" name="dvdSeason" value="${s.n}"${aired ? ' checked' : ' disabled'}>
          <span>Kausi ${s.n}${s.d ? ` <span class="dvd-dim">${esc(dvdYear(s.d))}</span>` : ''}${aired ? '' : ' <span class="dvd-dim">· tulossa</span>'}</span></label>`;
      }).join('') || '<div class="dvd-dim">TMDB ei listaa kausia.</div>'}</div>
      ${seasons.length > 1 ? `<div class="dvd-mini-btns">
        <button type="button" class="dvd-mini" onclick="dvdCheckAll(true)">Kaikki</button>
        <button type="button" class="dvd-mini" onclick="dvdCheckAll(false)">Ei mitään</button></div>` : ''}`;
  } else if(P.coll){
    const others = P.coll.parts.filter(p => String(p.id) !== String(d.id));
    extra = `<div class="dvd-coll-note">🧩 Kuuluu kokoelmaan <b>${esc(P.coll.name)}</b> (${P.coll.parts.length} osaa)</div>
      ${others.length ? `<div class="dvd-item-sect">Omistatko myös nämä?</div>
      <div class="dvd-checks">${others.map(p => {
        const own = dvdFind('movie', p.id);
        const rel = dvdReleased(p.d);
        const dis = own || !rel;
        const tag = own ? ' <span class="dvd-yes">· jo hyllyssä</span>' : !rel ? ' <span class="dvd-dim">· tulossa</span>' : '';
        return `<label class="dvd-check${dis ? ' is-soon' : ''}"><input type="checkbox" name="dvdPart" value="${p.id}"${own ? ' checked' : ''}${dis ? ' disabled' : ''}>
          <span>${esc(p.t)}${p.d ? ` <span class="dvd-dim">${esc(dvdYear(p.d))}</span>` : ''}${tag}</span></label>`;
      }).join('')}</div>` : ''}`;
  }

  body.innerHTML = `
    <button type="button" class="dvd-back" onclick="dvdOpenAdd(dvdAddLastQuery())">‹ Takaisin hakuun</button>
    <div class="dvd-item-top">
      ${dvdPoster(d.poster_path, 'w342', 'dvd-item-img', isTv ? '📺' : '🎬')}
      <div class="dvd-item-info">
        <div class="dvd-item-t">${esc(title || '')}</div>
        <div class="dvd-item-line">${isTv ? '📺 Sarja' : '🎬 Elokuva'}${year ? ' · ' + esc(year) : ''}</div>
        ${isTv && d.number_of_seasons ? `<div class="dvd-item-line dvd-dim">${d.number_of_seasons} kautta TMDB:ssä</div>` : ''}
      </div>
    </div>
    <div class="dvd-item-sect">Formaatti</div>
    <div class="dvd-segs" id="dvdAddFmt">${DVD_FORMATS.map(f => `<button type="button" class="dvd-seg${f === fmt ? ' on' : ''}" data-fmt="${f}" onclick="dvdPickFormat(this)">${f}</button>`).join('')}</div>
    ${extra}
    <button type="button" class="dvd-confirm" onclick="dvdConfirmAdd()">📀 Lisää hyllyyn</button>`;
}

window.dvdAddLastQuery = function(){ return dvdLastAddQuery; };

window.dvdPickFormat = function(btn){
  document.querySelectorAll('#dvdAddFmt .dvd-seg').forEach(b => b.classList.toggle('on', b === btn));
};
window.dvdCheckAll = function(on){
  document.querySelectorAll('#dvdAddBody input[name="dvdSeason"]:not(:disabled)').forEach(c => { c.checked = on; });
};

window.dvdConfirmAdd = async function(){
  const P = dvdPending;
  if(!P) return;
  const d = P.detail;
  const fmtBtn = document.querySelector('#dvdAddFmt .dvd-seg.on');
  const format = fmtBtn ? fmtBtn.dataset.fmt : dvdLastFormat();
  dvdRememberFormat(format);
  const list = ensureDvds();
  const today = dvdToday();
  let msg;

  if(P.type === 'tv'){
    const seasons = [...document.querySelectorAll('#dvdAddBody input[name="dvdSeason"]:checked')].map(c => Number(c.value));
    const aired = ((P.tvEntry && P.tvEntry.seasons) || []).filter(s => dvdReleased(s.d)).length;
    list.push({
      id: dvdNewId(), tmdb_id: d.id, tmdb_type: 'tv',
      name: d.name || d.original_name || '', orig: d.original_name || '',
      year: dvdYear(d.first_air_date) || null, poster: d.poster_path || null,
      format, added: today, note: '',
      seasons, season_count: aired
    });
    msg = `📀 ${d.name} lisätty (${seasons.length} kautta)`;
  } else {
    const add = [];
    if(!dvdFind('movie', d.id)){
      add.push({ id: d.id, t: d.title || d.original_title || '', o: d.original_title || '', d: d.release_date || '', p: d.poster_path || '' });
    }
    if(P.coll){
      const picked = new Set([...document.querySelectorAll('#dvdAddBody input[name="dvdPart"]:checked:not(:disabled)')].map(c => String(c.value)));
      P.coll.parts.forEach(p => { if(picked.has(String(p.id)) && !dvdFind('movie', p.id)) add.push(p); });
    }
    let base = dvdNewId();
    add.forEach(p => {
      list.push({
        id: base++, tmdb_id: p.id, tmdb_type: 'movie',
        name: p.t, orig: p.o || '', year: dvdYear(p.d) || null, poster: p.p || null,
        format, added: today, note: '',
        coll_id: P.collId || null, coll_name: P.coll ? P.coll.name : (P.collName || null), cc: 1
      });
    });
    if(P.collId){
      const g = dvdGroups().colls.find(c => String(c.id) === String(P.collId));
      msg = g ? (g.missing.length ? `📀 Lisätty kokoelmaan ${g.name} · ${g.owned}/${g.total}` : `🎉 ${g.name} on nyt täydellinen!`) : '📀 Lisätty hyllyyn';
    } else {
      msg = add.length > 1 ? `📀 Lisätty ${add.length} levyä` : '📀 Lisätty hyllyyn';
    }
  }

  dvdPending = null;
  closeModal('dvdAddModal');
  if(document.getElementById('dvdItemModal').classList.contains('open')) closeModal('dvdItemModal');
  dvdQuery = '';
  await dvdSaveAndRender();
  if(window.showStatus) window.showStatus(msg, '#22c55e', 3500);
};

// Näkymätarkistus app-core.js:n tilasta ilman suoraa riippuvuutta muuttujaan.
window.currentViewIsDvd = function(){
  const v = document.getElementById('dvdView');
  return !!(v && v.style.display !== 'none');
};
