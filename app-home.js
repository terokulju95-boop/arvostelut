// ══ ARVOSTELUT · etusivu (koontinäkymä) ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_HOME = '2026-09-10.5';
//
// Tavallinen skripti. Ajetaan app-core.js:n JÄLKEEN.
//
// Etusivu on lohkoista koottu näkymä, joka vastaa kysymykseen "mitä nyt".
// Lista vastaa kysymykseen "mitä minulla on" — se on eri kysymys, ja siksi
// etusivu on oma näkymänsä eikä listan yläreunaan tungettu palkki.
//
// PERIAATE: etusivu ei koskaan muuta dataa. Se lukee, laskee ja linkittää.
// Jokainen lohko on vain näkymä olemassa olevaan tietoon, joten rikkinäinen
// lohko ei voi rikkoa arvosteluja.

// ── LOHKOJEN MÄÄRITTELY ──
// Uuden lohkon lisääminen on yhden rivin työ tähän taulukkoon: se ilmestyy
// automaattisesti myös muokkaustilaan ja vanhoihin asetuksiin, koska
// homeConfig() täydentää puuttuvat lohkot listan loppuun.
const HOME_MODS = [
  { id:'pulssi',      icon:'💓', name:'Kokoelman pulssi',   size:'p' },
  { id:'jatka',       icon:'▶️', name:'Jatka tästä',         size:'k' },
  { id:'uusimmat',    icon:'🆕', name:'Viimeksi lisätyt',    size:'k' },
  { id:'seuraavaksi', icon:'📌', name:'Seuraavaksi',         size:'k' },
  { id:'viikko',      icon:'📆', name:'Viikon kooste',       size:'p' },
  { id:'kuukausi',    icon:'🏅', name:'Kuukauden paras',     size:'p' },
  { id:'nosto',       icon:'🎲', name:'Päivän nosto',        size:'k' },
  { id:'kunto',       icon:'🧹', name:'Kokoelman kunto',     size:'p' }
];

const HOME_SIZES = [
  { v:'p', label:'Pieni' },
  { v:'k', label:'Keski' },
  { v:'l', label:'Laaja' }
];

// Montako riviä lohko näyttää. Puhelimessa koko tarkoittaa ennen kaikkea
// sisällön määrää — leveys on joka tapauksessa koko ruutu.
const HOME_ROWS = { p:1, k:3, l:6 };

let homeEdit = false;

function homeConfig(){
  const s = ensureSettings();
  const saved = Array.isArray(s.homeModules) ? s.homeModules : null;
  const known = {};
  HOME_MODS.forEach(m => { known[m.id] = m; });

  const out = [];
  (saved || []).forEach(row => {
    if(!row || !known[row.id]) return;              // poistettu lohko unohdetaan
    if(out.some(x => x.id === row.id)) return;      // kaksoiskappale pois
    out.push({
      id: row.id,
      on: row.on !== false,
      size: HOME_SIZES.some(z => z.v === row.size) ? row.size : known[row.id].size
    });
  });
  // Uudet lohkot loppuun päälle kytkettyinä. Näin päivitys ei koskaan
  // hukkaa käyttäjän järjestystä eikä piilota uutta ominaisuutta.
  HOME_MODS.forEach(m => {
    if(!out.some(x => x.id === m.id)) out.push({ id:m.id, on:true, size:m.size });
  });
  return out;
}

async function homeSave(cfg){
  ensureSettings().homeModules = cfg;
  window.renderHome();
  if(window.renderSectionSummaries) window.renderSectionSummaries();
  await window.fbSave();
}

// ── APURIT ──
function hReviews(){
  return (appData.reviews || []).filter(r => r && typeof r === 'object');
}
function hScore(r){
  return window.getReviewScore ? window.getReviewScore(r) : r.score;
}
function hName(r){
  return window.plainName ? window.plainName(r) : String((r && r.name) || '');
}
function hDate(v){
  if(!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function hAvg(list){
  const v = list.map(hScore).filter(x => x != null && !isNaN(x));
  if(!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
// Uudet arvostelut saavat id:kseen Date.now(), joten tunnus kertoo
// lisäyshetken ilman erillistä kenttää. Vanhemmat tuodut rivit voivat
// käyttää muuta numerointia, joten liian pienet tunnukset ohitetaan.
function hAdded(r){
  const n = Number(r.id);
  return (n > 1e12) ? n : null;
}

function hRowHtml(r, right){
  const rightHtml = right ? `<span class="hm-row-right">${esc(right)}</span>` : '';
  return `<button type="button" class="hm-row" onclick="openReadModal(${escJs(String(r.id))})">
    <span class="hm-row-name">${esc(hName(r))}</span>${rightHtml}
  </button>`;
}
function hEmpty(text){
  return `<div class="hm-empty">${esc(text)}</div>`;
}
function hBig(value, label){
  return `<div class="hm-big"><span class="hm-big-v">${esc(String(value))}</span><span class="hm-big-l">${esc(label)}</span></div>`;
}

// ── LOHKOJEN SISÄLTÖ ──
// Jokainen palauttaa valmiin HTML:n. Rivimäärä tulee koosta.
const HOME_RENDER = {

  pulssi(rows){
    const R = hReviews();
    const avg = hAvg(R);
    const cut = Date.now() - 90 * 86400000;
    const recent = R.filter(r => { const d = hDate(r.date); return d && d.getTime() > cut; });
    const tahti = Math.round(recent.length / 3);
    let html = `<div class="hm-bigs">${hBig(R.length, R.length === 1 ? 'arvostelu' : 'arvostelua')}`;
    if(avg != null) html += hBig(avg, 'keskiarvo');
    if(rows > 1 || avg == null) html += hBig(tahti, 'kk-tahti');
    return html + '</div>';
  },

  jatka(rows){
    // Kesken = sarja jossa on jaksoja, joista osalta puuttuu piste.
    const list = hReviews().filter(r => {
      const seasons = r.seasons || [];
      if(!seasons.length) return false;
      let total = 0, scored = 0;
      seasons.forEach(s => (s.episodes || []).forEach(e => {
        total++;
        if(e.score != null) scored++;
      }));
      return total > 0 && scored > 0 && scored < total;
    }).sort((a, b) => (hAdded(b) || 0) - (hAdded(a) || 0)).slice(0, rows);

    if(!list.length) return hEmpty('Ei kesken olevia sarjoja.');
    return list.map(r => {
      let total = 0, scored = 0;
      (r.seasons || []).forEach(s => (s.episodes || []).forEach(e => {
        total++;
        if(e.score != null) scored++;
      }));
      return hRowHtml(r, scored + '/' + total);
    }).join('');
  },

  uusimmat(rows){
    const list = hReviews()
      .filter(r => hAdded(r) != null)
      .sort((a, b) => hAdded(b) - hAdded(a))
      .slice(0, rows);
    if(!list.length) return hEmpty('Ei vielä arvosteluja.');
    return list.map(r => {
      const sc = hScore(r);
      return hRowHtml(r, sc != null ? String(sc) : '');
    }).join('');
  },

  seuraavaksi(rows){
    const wl = Array.isArray(appData.watchlist) ? appData.watchlist : [];
    const list = wl.filter(w => w && w.name).slice(0, rows);
    if(!list.length) return hEmpty('Katselulista on tyhjä.');
    return list.map(w => `<button type="button" class="hm-row" onclick="setView('watchlist')">
      <span class="hm-row-name">${esc(w.name)}</span>
      <span class="hm-row-right">${esc(w.year ? String(w.year) : '')}</span>
    </button>`).join('');
  },

  viikko(rows){
    const cut = Date.now() - 7 * 86400000;
    const list = hReviews().filter(r => { const d = hDate(r.date); return d && d.getTime() > cut; });
    const avg = hAvg(list);
    let html = `<div class="hm-bigs">${hBig(list.length, list.length === 1 ? 'katsottu' : 'katsottua')}`;
    if(avg != null) html += hBig(avg, 'keskiarvo');
    html += '</div>';
    if(rows > 1 && list.length){
      html += list.slice(0, rows - 1).map(r => hRowHtml(r, String(hScore(r) ?? ''))).join('');
    }
    return html;
  },

  kuukausi(rows){
    const now = new Date();
    const list = hReviews().filter(r => {
      const d = hDate(r.date);
      return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && hScore(r) != null;
    }).sort((a, b) => hScore(b) - hScore(a));
    if(!list.length) return hEmpty('Ei vielä arvosteluja tässä kuussa.');
    return list.slice(0, Math.max(1, rows)).map(r => hRowHtml(r, String(hScore(r)))).join('');
  },

  nosto(){
    const R = hReviews();
    if(!R.length) return hEmpty('Ei vielä arvosteluja.');
    // Sama teos koko päivän: valinta perustuu päivän numeroon eikä sattumaan,
    // joten lohko ei vaihdu joka kerta kun näkymä piirretään uudelleen.
    const day = Math.floor(Date.now() / 86400000);
    const r = R[day % R.length];
    const sc = hScore(r);
    const poster = window.posterUrl ? window.posterUrl(r, 'w200') : '';
    const img = poster
      ? `<img class="hm-nosto-img" src="${esc(poster)}" alt="" loading="lazy">`
      : `<div class="hm-nosto-img hm-nosto-empty">🎬</div>`;
    return `<button type="button" class="hm-nosto" onclick="openReadModal(${escJs(String(r.id))})">
      ${img}
      <span class="hm-nosto-text">
        <span class="hm-nosto-name">${esc(hName(r))}</span>
        <span class="hm-nosto-meta">${esc([r.year || '', r.category || ''].filter(Boolean).join(' · '))}</span>
      </span>
      ${sc != null ? `<span class="hm-row-right">${esc(String(sc))}</span>` : ''}
    </button>`;
  },

  kunto(){
    const pct = window.gapPercent ? window.gapPercent() : null;
    if(pct == null) return hEmpty('Tarkistus ei ole käytettävissä.');
    return `<div class="hm-bigs">${hBig(pct + ' %', 'täydellisyys')}</div>
      <button type="button" class="hm-link" onclick="homeOpenHealth()">Avaa kokoelman kunto ›</button>`;
  }
};

// ── NÄKYMÄ ──
function homeModHtml(row, idx, cfg){
  const def = HOME_MODS.filter(m => m.id === row.id)[0];
  if(!def) return '';
  const rows = HOME_ROWS[row.size] || 3;

  // Sisältö lasketaan try/catchin sisällä: yhden lohkon virhe ei saa jättää
  // koko etusivua tyhjäksi, ja virhe menee virhelokiin tutkittavaksi.
  let body = '';
  try {
    body = HOME_RENDER[row.id] ? HOME_RENDER[row.id](rows) : '';
  } catch(e){
    if(window.logError) window.logError('koodi', e, 'etusivun lohko: ' + row.id);
    body = hEmpty('Lohkoa ei voitu näyttää.');
  }

  const controls = homeEdit ? `
    <div class="hm-edit">
      <button type="button" class="hm-ebtn" onclick="homeMove('${escJs(row.id)}',-1)" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="hm-ebtn" onclick="homeMove('${escJs(row.id)}',1)" ${idx === cfg.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="hm-ebtn hm-esize" onclick="homeCycleSize('${escJs(row.id)}')">${esc((HOME_SIZES.filter(z => z.v === row.size)[0] || {}).label || '')}</button>
      <button type="button" class="toggle-switch${row.on ? ' on' : ''}" onclick="homeToggle('${escJs(row.id)}')"></button>
    </div>` : '';

  return `<div class="hm size-${esc(row.size)}${row.on ? '' : ' hm-off'}">
    <div class="hm-head"><span class="hm-ico">${def.icon}</span><span class="hm-name">${esc(def.name)}</span></div>
    ${controls}
    ${row.on || homeEdit ? `<div class="hm-body">${body}</div>` : ''}
  </div>`;
}

window.renderHome = function(){
  const box = document.getElementById('homeView');
  if(!box) return;
  const cfg = homeConfig();
  const visible = cfg.filter(c => c.on);

  const bar = `<div class="home-bar">
    <div class="home-hello" onclick="logoTap()" style="cursor:pointer;user-select:none;">${esc(homeGreeting())}</div>
    <button type="button" class="home-editbtn" onclick="homeEditToggle()">${homeEdit ? 'Valmis' : 'Muokkaa'}</button>
  </div>`;

  const note = homeEdit
    ? `<div class="home-note">Kytke lohkoja päälle ja pois, vaihda kokoa ja järjestä nuolilla. Muutokset tallentuvat heti.
        <button type="button" class="hm-link" onclick="homeReset()">Palauta oletukset</button></div>`
    : '';

  const list = homeEdit ? cfg : visible;
  const body = list.length
    ? list.map((row, i) => homeModHtml(row, i, list)).join('')
    : `<div class="hm"><div class="hm-body">${hEmpty('Kaikki lohkot on piilotettu. Avaa muokkaus ja kytke haluamasi takaisin.')}</div></div>`;

  box.innerHTML = bar + note + `<div class="home-grid">${body}</div>`;
};

function homeGreeting(){
  const h = new Date().getHours();
  if(h < 5)  return 'Yöllistä katselua';
  if(h < 10) return 'Huomenta';
  if(h < 17) return 'Päivää';
  if(h < 23) return 'Iltaa';
  return 'Yötä';
}

// ── TOIMINNOT ──
window.homeEditToggle = function(){
  homeEdit = !homeEdit;
  window.renderHome();
};

window.homeToggle = async function(id){
  const cfg = homeConfig();
  const row = cfg.filter(x => x.id === id)[0];
  if(!row) return;
  row.on = !row.on;
  await homeSave(cfg);
};

window.homeCycleSize = async function(id){
  const cfg = homeConfig();
  const row = cfg.filter(x => x.id === id)[0];
  if(!row) return;
  const i = HOME_SIZES.findIndex(z => z.v === row.size);
  row.size = HOME_SIZES[(i + 1) % HOME_SIZES.length].v;
  await homeSave(cfg);
};

// Nuolet eikä raahaus: raahaus on puhelimessa epätarkkaa ja osuu helposti
// vieritykseen, ja lohkoja on kahdeksan — nuolilla siirto on nopeampi.
window.homeMove = async function(id, dir){
  const cfg = homeConfig();
  const i = cfg.findIndex(x => x.id === id);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= cfg.length) return;
  const tmp = cfg[i];
  cfg[i] = cfg[j];
  cfg[j] = tmp;
  await homeSave(cfg);
};

window.homeReset = async function(){
  if(!confirm('Palautetaanko etusivun lohkot oletusjärjestykseen?')) return;
  ensureSettings().homeModules = null;
  window.renderHome();
  if(window.renderSectionSummaries) window.renderSectionSummaries();
  await window.fbSave();
};

window.homeOpenHealth = function(){
  if(window.openSettings) window.openSettings();
  if(window.setSettingsTab) window.setSettingsTab('data');
  if(window.toggleSetSec) setTimeout(() => window.toggleSetSec('korjaukset'), 60);
};

// Asetuksista: siirry etusivulle muokkaustila valmiiksi auki. Esikatselu
// asetusikkunan sisällä olisi puhelimessa ahdas ja näyttäisi eri kokoisena
// kuin oikea näkymä — tämä näyttää lohkot oikean levyisinä.
window.homeEditFromSettings = function(){
  homeEdit = true;
  if(window.closeModal) window.closeModal('settingsModal');
  if(window.setView) window.setView('home');
  else window.renderHome();
};

window.renderHomeSettings = function(){
  const el = document.getElementById('homeSettingsBox');
  if(!el) return;
  const cfg = homeConfig();
  const on = cfg.filter(c => c.on).length;
  el.innerHTML = `<div class="toggle-row-sub" style="margin-bottom:10px;">Näkyvissä ${on}/${cfg.length} lohkoa. Muokkaus tapahtuu etusivulla, jossa näet lohkot oikean levyisinä.</div>
    <button type="button" class="btn-secondary" style="width:100%;" onclick="homeEditFromSettings()">🏠 Muokkaa etusivua</button>`;
};

window.homeModCount = function(){
  try{
    const cfg = homeConfig();
    return cfg.filter(c => c.on).length + '/' + cfg.length + ' lohkoa';
  } catch(e){ return ''; }
};
