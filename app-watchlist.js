// ══ ARVOSTELUT · katselulista ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_WATCHLIST = '2026-09-08.9';
//
// Tavallinen skripti. Ajetaan app-core.js:n ja app-views.js:n JÄLKEEN.
//
// Sovellus on tähän asti tallentanut vain menneen: teoksen sai talteen
// ainoastaan arvostelemalla sen. Katselulista on odotushuone niille
// teoksille joita ei ole vielä nähty.
//
// ── MIKSI OMA TIETUE EIKÄ ARVOSTELU JOLLA ON LIPPU ──
// Katsomaton teos voisi olla tavallinen arvostelu, jolla on kenttä
// status:'watchlist'. Se olisi houkuttelevaa, koska TMDB-kentät ja
// korttien piirto tulisivat ilmaiseksi. Hinta olisi kuitenkin se, että
// jokainen appData.reviews-taulukkoa lukeva kohta pitäisi käydä läpi ja
// muistaa suodattaa katsomattomat pois: tilastot, Top-lista, budjetin
// elokuvalaskuri, kaksoiskappaleiden tunnistus, pistenäkymä,
// varmuuskopion luvut. Yksikin unohdus tuottaisi vääriä lukuja hiljaa.
//
// Siksi katselulista on oma taulukkonsa. Arvostelu tarkoittaa edelleen
// täsmälleen samaa kuin ennen: nähty teos. Mikään olemassa oleva
// laskenta ei muutu, koska mikään ei näe näitä tietueita.

// ── TIETUEEN MUOTO ──
// Tarkoituksella kevyt. Juoni ja näyttelijät haetaan TMDB:stä vasta kun
// teos avataan, jottei meta-dokumentti kasva turhaan: koko lista elää
// samassa dokumentissa kuin asetukset ja kategoriat.
//
//   { id, name, year, tmdb_id, tmdb_type, poster, category,
//     added, note, source, prio }

function ensureWatchlist(){
  if(!Array.isArray(appData.watchlist)) appData.watchlist = [];
  return appData.watchlist;
}
window.ensureWatchlist = ensureWatchlist;

// Avain jolla teos tunnistetaan TMDB:n puolelta. Sama muoto kuin
// app-discover.js:n reviewedTmdbIds käyttää, jotta joukot ovat
// yhdistettävissä suoraan.
function wlKey(type, id){ return `${type || 'movie'}:${id}`; }

// Löydä-osio kysyy tätä, jottei se ehdota teosta joka on jo listalla.
window.wlTmdbKeys = function(){
  const set = new Set();
  ensureWatchlist().forEach(w => {
    if(w && w.tmdb_id != null) set.add(wlKey(w.tmdb_type, w.tmdb_id));
  });
  return set;
};

window.wlHas = function(type, tmdbId){
  if(tmdbId == null) return false;
  return ensureWatchlist().some(w => w && String(w.tmdb_id) === String(tmdbId) && (w.tmdb_type || 'movie') === (type || 'movie'));
};

// ════════════════════════════════════════════════════════════
// LISÄYS JA POISTO
// ════════════════════════════════════════════════════════════

window.wlAdd = async function(entry){
  if(!entry || !entry.name) return false;
  const list = ensureWatchlist();

  // Sama teos kahdesti ei ole virhe vaan vahinko. Kerrotaan siitä
  // ystävällisesti eikä lisätä kaksoiskappaletta.
  if(entry.tmdb_id != null && window.wlHas(entry.tmdb_type, entry.tmdb_id)){
    if(window.showStatus) window.showStatus('📌 Tämä on jo katselulistalla', '#f59e0b', 2500);
    return false;
  }

  // Jos teos on jo arvosteltu, katselulistalle lisääminen on lähes aina
  // virhe. Ei estetä sitä — uusintakatselu on laillinen syy — mutta
  // sanotaan se ääneen.
  const reviewed = (appData.reviews || []).some(r =>
    r.tmdb_id != null && String(r.tmdb_id) === String(entry.tmdb_id));
  if(reviewed && window.showStatus){
    window.showStatus('⚠️ Tämä on jo arvosteluissasi — lisätty silti', '#f59e0b', 3500);
  }

  list.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: String(entry.name).trim(),
    year: entry.year || null,
    tmdb_id: entry.tmdb_id != null ? entry.tmdb_id : null,
    tmdb_type: entry.tmdb_type || 'movie',
    poster: entry.poster || null,
    category: entry.category || (entry.tmdb_type === 'tv' ? 'TV-sarjat' : 'Elokuvat'),
    added: new Date().toISOString().slice(0, 10),
    note: entry.note || '',
    source: entry.source || 'käsin',
    prio: 0
  });

  if(window.fbSave) await window.fbSave();
  window.updateWatchlistBadge();
  window.renderWatchlist();   // säiliö on aina olemassa, piilossa renderöinti on ilmaista
  if(window.showStatus) window.showStatus('📌 Lisätty katselulistalle', '#22c55e', 2500);
  return true;
};

window.wlRemove = async function(id, silent){
  const list = ensureWatchlist();
  const i = list.findIndex(w => String(w.id) === String(id));
  if(i < 0) return;
  list.splice(i, 1);
  if(window.fbSave) await window.fbSave();
  window.updateWatchlistBadge();
  window.renderWatchlist();
  if(!silent && window.showStatus) window.showStatus('Poistettu katselulistalta', '#8b8b9e', 2000);
};

window.wlTogglePrio = async function(id){
  const w = ensureWatchlist().find(x => String(x.id) === String(id));
  if(!w) return;
  w.prio = w.prio ? 0 : 1;
  if(window.fbSave) await window.fbSave();
  window.renderWatchlist();
};

// ── SIIRTO ARVOSTELUKSI ──
// Avaa tavallisen lisäyslomakkeen valmiiksi täytettynä. Tietuetta EI
// poisteta tässä: jos lomake suljetaan tallentamatta, teos jäisi
// kadoksiin. Poisto tapahtuu vasta kun arvostelu on oikeasti tallessa,
// ks. wlPruneReviewed alempana.
window.wlToReview = function(id){
  const w = ensureWatchlist().find(x => String(x.id) === String(id));
  if(!w) return;
  if(window.addFromDiscover) window.addFromDiscover(w.name, w.tmdb_type || 'movie');
};

// Poistaa listalta ne teokset jotka on sittemmin arvosteltu. Ajetaan
// jokaisen tallennuksen jälkeen, jolloin siirto arvosteluksi siivoutuu
// itsestään riippumatta siitä miten arvostelu syntyi.
window.wlPruneReviewed = function(){
  const list = ensureWatchlist();
  if(!list.length) return 0;

  const ids = new Set();
  const names = new Set();
  (appData.reviews || []).forEach(r => {
    if(r.tmdb_id != null) ids.add(wlKey(r.tmdb_type || (r.tvType ? 'tv' : 'movie'), r.tmdb_id));
    const n = window.fuzzyNormCached ? window.fuzzyNormCached(plainName(r)) : String(r.name || '').toLowerCase();
    if(n) names.add(n);
  });

  const before = list.length;
  const kept = list.filter(w => {
    if(w.tmdb_id != null && ids.has(wlKey(w.tmdb_type, w.tmdb_id))) return false;
    // Ilman TMDB-tunnusta verrataan nimellä. Sumea normalisointi hoitaa
    // isot kirjaimet ja välimerkit.
    const n = window.fuzzyNormCached ? window.fuzzyNormCached(w.name) : String(w.name || '').toLowerCase();
    if(n && names.has(n)) return false;
    return true;
  });

  if(kept.length === before) return 0;
  appData.watchlist = kept;
  return before - kept.length;
};

// ════════════════════════════════════════════════════════════
// NÄKYMÄ
// ════════════════════════════════════════════════════════════

const WL_SORTS = [
  { id:'added',  label:'Lisätty' },
  { id:'name',   label:'Nimi' },
  { id:'year',   label:'Vuosi' },
  { id:'prio',   label:'Kiireellisyys' }
];
let wlSort = 'added';
let wlFilter = 'all';   // all | movie | tv

window.wlSetSort = function(v){ wlSort = v; window.renderWatchlist(); };
window.wlSetFilter = function(v){ wlFilter = v; window.renderWatchlist(); };

function wlSorted(){
  let list = ensureWatchlist().slice();
  if(wlFilter !== 'all') list = list.filter(w => (w.tmdb_type || 'movie') === wlFilter);

  // Kiireelliset ovat aina ensin, olipa lajittelu mikä tahansa. Se on
  // koko merkinnän tarkoitus.
  return list.sort((a, b) => {
    if((b.prio || 0) !== (a.prio || 0)) return (b.prio || 0) - (a.prio || 0);
    if(wlSort === 'name')  return String(a.name).localeCompare(String(b.name), 'fi');
    if(wlSort === 'year')  return (Number(b.year) || 0) - (Number(a.year) || 0);
    if(wlSort === 'prio')  return String(b.added || '').localeCompare(String(a.added || ''));
    return String(b.added || '').localeCompare(String(a.added || ''));   // lisätty, uusin ensin
  });
}

function wlPosterHtml(w){
  if(w.poster){
    return `<img class="wl-poster" src="https://image.tmdb.org/t/p/w185${esc(w.poster)}" loading="lazy" alt="">`;
  }
  return `<div class="wl-poster wl-poster-none">${(w.tmdb_type === 'tv') ? '📺' : '🎬'}</div>`;
}

function wlCardHtml(w){
  const days = w.added ? Math.round((Date.now() - new Date(w.added + 'T00:00:00')) / 86400000) : null;
  const waited = days == null ? '' :
    days <= 0 ? 'lisätty tänään' :
    days === 1 ? 'odottanut päivän' :
    days < 30 ? `odottanut ${days} päivää` :
    days < 365 ? `odottanut ${Math.round(days / 30)} kk` :
    'odottanut yli vuoden';

  return `<div class="wl-card${w.prio ? ' is-prio' : ''}">
    <div class="wl-open" onclick="wlOpen('${escJs(String(w.id))}')">${wlPosterHtml(w)}</div>
    <div class="wl-body">
      <div class="wl-open" onclick="wlOpen('${escJs(String(w.id))}')">
        <div class="wl-title">${esc(w.name)}${w.year ? ` <span class="wl-year">${esc(String(w.year))}</span>` : ''}</div>
        <div class="wl-meta">${w.tmdb_type === 'tv' ? '📺 Sarja' : '🎬 Elokuva'} · ${esc(waited)}</div>
        ${w.note ? `<div class="wl-note">${esc(w.note)}</div>` : ''}
      </div>
      <div class="wl-actions">
        <button class="wl-btn wl-review" onclick="wlToReview('${escJs(String(w.id))}')">✍️ Arvostele</button>
        <button class="wl-btn wl-prio${w.prio ? ' on' : ''}" title="Kiireellinen"
                onclick="wlTogglePrio('${escJs(String(w.id))}')">${w.prio ? '📍' : '📌'}</button>
        <button class="wl-btn wl-del" title="Poista listalta"
                onclick="wlConfirmRemove('${escJs(String(w.id))}')">🗑️</button>
      </div>
    </div>
  </div>`;
}

window.wlConfirmRemove = function(id){
  const w = ensureWatchlist().find(x => String(x.id) === String(id));
  if(!w) return;
  if(confirm('Poistetaanko “' + w.name + '” katselulistalta?')) window.wlRemove(id);
};

// Avaa teoksen tiedot Löydä-osion omalla näkymällä, jossa on jo juoni,
// traileri ja tieto siitä missä teoksen voi katsoa Suomessa. Ilman
// TMDB-tunnusta ei ole mitään avattavaa.
window.wlOpen = function(id){
  const w = ensureWatchlist().find(x => String(x.id) === String(id));
  if(!w) return;
  if(w.tmdb_id == null){
    if(window.showStatus) window.showStatus('Tällä ei ole TMDB-tunnusta', '#8b8b9e', 2500);
    return;
  }
  if(window.openDiscoverDetail) window.openDiscoverDetail(w.tmdb_type || 'movie', w.tmdb_id);
};

window.renderWatchlist = function(){
  const out = document.getElementById('watchlistView');
  if(!out) return;

  const all = ensureWatchlist();
  const list = wlSorted();

  const head = `
    <div class="wl-head">
      <div class="wl-head-title">📌 Katselulista</div>
      <div class="wl-head-sub">${all.length} ${all.length === 1 ? 'teos' : 'teosta'} odottamassa. Lisää teoksia Löydä-osiosta — sen haku löytää minkä tahansa elokuvan tai sarjan.</div>
    </div>`;

  if(!all.length){
    out.innerHTML = head + `
      <div class="wl-empty">
        <div class="wl-empty-ico">📌</div>
        <div class="wl-empty-title">Katselulista on tyhjä</div>
        <div class="wl-empty-sub">Kun löydät jotain kiinnostavaa mutta et ole vielä nähnyt sitä, tallenna se tänne odottamaan. Arvostelu syntyy vasta kun olet katsonut teoksen.</div>
        <button class="wl-empty-btn" onclick="setView('discover')">🔮 Siirry Löydä-osioon</button>
      </div>`;
    return;
  }

  const counts = { all: all.length,
    movie: all.filter(w => (w.tmdb_type || 'movie') === 'movie').length,
    tv: all.filter(w => w.tmdb_type === 'tv').length };

  const chip = (v, label, n) =>
    `<button class="wl-chip${wlFilter === v ? ' on' : ''}" onclick="wlSetFilter('${v}')">${label} ${n}</button>`;

  const controls = `
    <div class="wl-controls">
      <div class="wl-chips">
        ${chip('all', 'Kaikki', counts.all)}
        ${chip('movie', '🎬', counts.movie)}
        ${chip('tv', '📺', counts.tv)}
      </div>
      <select class="wl-sort" onchange="wlSetSort(this.value)">
        ${WL_SORTS.map(s => `<option value="${s.id}"${wlSort === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}
      </select>
    </div>`;

  const empty = list.length ? '' :
    `<div class="wl-empty"><div class="wl-empty-sub">Ei osumia tällä rajauksella.</div></div>`;

  out.innerHTML = head + controls + empty + list.map(wlCardHtml).join('');
};

// Välilehden merkkiluku. Kertoo montako teosta odottaa ilman että
// näkymään tarvitsee siirtyä.
window.updateWatchlistBadge = function(){
  const el = document.getElementById('viewTabWatchlist');
  if(!el) return;
  const n = ensureWatchlist().length;
  el.textContent = n ? `📌 Katselulista ${n}` : '📌 Katselulista';
};

// ════════════════════════════════════════════════════════════
// KYTKENTÄ TALLENNUKSEEN
// ════════════════════════════════════════════════════════════

// Arvostelun tallennuksen jälkeen katselulistalta siivotaan pois se mitä
// juuri arvosteltiin. Kääre samaan tapaan kuin app-extras.js tekee
// lomakkeen kenttäjärjestykselle.
(function hookSave(){
  const orig = window.saveReview;
  if(typeof orig !== 'function') return;
  window.saveReview = async function(...args){
    const out = await orig.apply(this, args);
    try{
      const n = window.wlPruneReviewed();
      if(n){
        // fbSave on jo ajettu saveReviewin sisällä, joten muutos pitää
        // tallentaa erikseen. Ilman tätä siivous eläisi vain muistissa.
        if(window.fbSave) await window.fbSave();
        window.updateWatchlistBadge();
        if(window.showStatus){
          window.showStatus(`📌 Poistettu katselulistalta`, '#22c55e', 2500);
        }
      }
    } catch(e){ /* siivous ei saa koskaan estää tallennusta */ }
    return out;
  };
})();
