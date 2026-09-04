// ══ ARVOSTELUT · ydin (data, apufunktiot, värit, pisteytys) ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_CORE = '2026-09-04.25';
// Tavallinen skripti (ei moduuli): ylätason muuttujat ja funktiot
// jaetaan tiedostojen kesken globaalin skoopin kautta.
// LATAUSJÄRJESTYS ON MERKITSEVÄ — katso index.html:n loppu.

// ── DATA ──
const DEFAULT_CATS = ['Elokuvat','TV-sarjat'];
const DEFAULT_GENRES = ['Toiminta','Komedia','Draama','Kauhu','Sci-fi','Trilleri','Dokumentti','Animaatio','Romantiikka','Fantasia','Seikkailu','Musiikki','Urheilu','Rikostarina','Historia','Sota','Western','Noir','Perhe','Tositapahtumat'];
let GENRES = [...DEFAULT_GENRES];
const GENRE_CATS = ['Elokuvat','TV-sarjat'];
// Kategoriat joilla on TMDB-tiedot ja siten juoni
const PLOT_CATS = ['Elokuvat','TV-sarjat'];
window.PLOT_CATS = PLOT_CATS;

// ── SUOSITUS JA UUSINTAKATSELU ──
// Kolme vaihtoehtoa kummallekin, eikä kumpikaan ole pakollinen. Tekstit
// ovat kolmessa muodossa: nappi lomakkeella on lyhyt, kortin merkkilappu
// keskipitkä ja luku-modaalin rivi kokonainen lause. Arvot (id) ovat
// tallennettavia koodeja eivätkä saa muuttua — vain tekstit saa vaihtaa.
const RECOMMEND_OPTS = [
  { id:'yes',     btn:'👍 Kyllä',      chip:'👍 Suosittelen',   read:'👍 Kyllä, suosittelen' },
  { id:'depends', btn:'🤔 Riippuu',    chip:'🤔 Riippuu',       read:'🤔 Riippuu' },
  { id:'no',      btn:'👎 En',         chip:'👎 En suosittele', read:'👎 En suosittele' }
];
const REWATCH_OPTS = [
  { id:'now',     btn:'⚡ Heti',       chip:'⚡ Uusinta heti',  read:'⚡ Katsoisin heti uudelleen' },
  { id:'someday', btn:'🕐 Joskus',     chip:'🕐 Uusinta joskus',read:'🕐 Katsoisin joskus uudelleen' },
  { id:'never',   btn:'🚫 En koskaan', chip:'🚫 Ei uusintaa',   read:'🚫 En katsoisi uudelleen' }
];
window.RECOMMEND_OPTS = RECOMMEND_OPTS;
window.REWATCH_OPTS   = REWATCH_OPTS;
window.recommendOpt = id => RECOMMEND_OPTS.find(o => o.id === id) || null;
window.rewatchOpt   = id => REWATCH_OPTS.find(o => o.id === id) || null;

// ── TURVALLINEN HTML ──
// Kaikki käyttäjän syöttämä teksti (nimet, muistiinpanot, kategoriat, genret)
// pitää ajaa esc():n läpi ennen kuin se laitetaan innerHTML-merkkijonoon.
// esc()   = tavallinen teksti
// escNl() = teksti jossa rivinvaihdot muuttuvat <br>-elementeiksi
// escJs() = teksti joka menee onclick="foo('...')" -attribuutin sisään
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function escNl(s){ return esc(s).replace(/\n/g,'<br>'); }
function escJs(s){
  return esc(String(s == null ? '' : s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
}
window.esc = esc; window.escNl = escNl; window.escJs = escJs;

let appData = { categories: [...DEFAULT_CATS], genres: [...DEFAULT_GENRES], reviews: [], budget: { monthlyPrice: 26.90, periods: [] } };
let activeCat = null;
let sortMode = 'uusin';
let activeGenreFilter = null;
let activeScoreFilter = null;
let activeMarkFilter = null;
let activeYearFilter = null;
let activeDecadeFilter = null;
// Ohjaajasuodatin. Ei osa suodatinpaneelia, vaan käynnistyy kortin
// ohjaajanimeä napauttamalla — siksi se elää omana muuttujanaan.
let activeDirectorFilter = null;
let selectedMark = null;
// Suositus ja uusintakatselu. Molemmat ovat kolmen vaihtoehdon valintoja
// joista mitään ei ole pakko valita, joten null on kelvollinen arvo.
let selectedRecommend = null;
let selectedRewatch = null;
let currentView = 'reviews';
let editingId = null;
let editingPartId = null;
let editingPartReviewId = null;
let selectedTvType = 'kokonaisuus';
let selectedScore = null;
let selectedPartScore = null;

function initApp(){
  if(!activeCat && appData.categories.length) activeCat = appData.categories[0];
  ensureSubcats();
  activeSub = loadSubChoice(activeCat);
  if(activeSub !== '' && !subcatsFor(activeCat).includes(activeSub)) activeSub = '';
  ensureSettings();
  window.applyAccent(appData.settings.accent);
  if(window.applyTheme) window.applyTheme();
  if(!appData.genres) appData.genres = [...DEFAULT_GENRES];
  if(!appData.budget) appData.budget = { monthlyPrice: 26.90, periods: [] };
  if(appData.budget.monthlyPrice == null) appData.budget.monthlyPrice = 26.90;
  if(!appData.budget.periods) appData.budget.periods = [];
  GENRES = [...appData.genres];
  renderCatTabs();
  renderGenreFilters();
  renderYearFilters();
  if(window.updateViewModeBtn) window.updateViewModeBtn();
  renderAll();
}

function renderAll(){
  renderCatTabs();
  renderGenreFilters();
  renderYearFilters();
  renderDecadeFilters();
  if(window.updateFilterBadge) window.updateFilterBadge();
  if(currentView==='reviews') renderCards();
  else if(currentView==='top') renderTop();
  else if(currentView==='budget') renderBudget();
  else if(currentView==='quick' && window.renderQuickScores) window.renderQuickScores();
  // Löydä-näkymä ei renderöi mitään itsestään: tulokset syntyvät vasta
  // kun käyttäjä painaa nappia, eivätkä ne katoa muuta näkymää päivitettäessä.
}

// ── NÄKYMÄ ──
window.setView = function(view){
  currentView = view;
  // Ohjaajarajaus on aina väliaikainen näkymä listaan. Se ei saa jäädä
  // päälle taustalle, koska se ohittaa kategoriavalinnan kokonaan.
  if(view !== 'reviews') activeDirectorFilter = null;
  if(window.renderDiscoverCount && view === 'discover') window.renderDiscoverCount();
  // Pikamuokkauksen kesken oleva tallennus lähtee heti kun poistut siitä
  if(currentView !== 'quick' && window.qsFlushSave) window.qsFlushSave();
  ['reviews','top','discover','budget','quick'].forEach(v=>{
    const el = document.getElementById('viewTab'+v.charAt(0).toUpperCase()+v.slice(1));
    if(el) el.classList.toggle('active', v===view);
  });
  const showCats = view==='reviews';
  document.getElementById('catTabs').style.display = showCats?'':'none';
  const stb = document.getElementById('subTabs');
  if(stb && !showCats){ stb.style.display = 'none'; }
  const disc = document.getElementById('discoverView');
  if(disc) disc.style.display = view==='discover' ? 'block' : 'none';
  const qv = document.getElementById('quickView');
  if(qv) qv.style.display = view==='quick' ? 'block' : 'none';
  // Korttilista ja lisäysnappi piiloon niissä näkymissä joilla on oma säiliö
  const ownContainer = view==='discover' || view==='quick';
  const grid = document.getElementById('cardsGrid');
  if(grid) grid.style.display = ownContainer ? 'none' : '';
  const fab = document.getElementById('fab');
  if(fab) fab.style.display = ownContainer ? 'none' : '';
  const tb = document.querySelector('.toolbar');
  if(tb) tb.style.display = view==='reviews'?'':'none';
  // Sulje suodatinpaneeli näkymää vaihdettaessa.
  // HUOM: ei inline-tyyliä — se jäisi voimaan eikä .filter-panel.open enää avaisi paneelia.
  const fp = document.getElementById('filterPanel');
  if(fp){ fp.classList.remove('open'); fp.style.display = ''; }
  const ftb = document.getElementById('filterToggleBtn');
  if(ftb) ftb.classList.remove('active');
  const sn = document.getElementById('searchNote');
  if(sn){ sn.style.display = 'none'; sn.innerHTML = ''; }
  renderAll();
};

window.fabClick = function(){
  if(currentView==='budget') window.budgetFabClick();
  else if(currentView==='discover' || currentView==='quick') return;
  else window.openAddModal();
};

// ══ ALALAJIT ══
// Kategorian sisäinen jako, esimerkiksi Elokuvat → Perus / Dokumentit.
// Arvostelussa kenttä on `subcat`: tyhjä tai puuttuva tarkoittaa "Perus",
// joten vanhat arvostelut toimivat sellaisenaan ilman migraatiota.
const DEFAULT_SUBCATS = {
  'Elokuvat':  ['Dokumentit', 'Animaatiot'],
  'TV-sarjat': ['Dokumentit', 'Animaatiot']
};

// Uusien oletusalalajien lisäys vanhaan dataan ajetaan kerran.
// Merkki tallentuu subcats-objektiin, joten poistetut alalajit eivät
// palaa takaisin seuraavalla latauksella.
const SUBCAT_SEED = 1;   // 1 = Animaatiot

function ensureSubcats(){
  if(!appData.subcats || typeof appData.subcats !== 'object'){
    appData.subcats = JSON.parse(JSON.stringify(DEFAULT_SUBCATS));
    appData.subcats._seed = SUBCAT_SEED;
    return appData.subcats;
  }
  if((Number(appData.subcats._seed) || 0) < 1){
    ['Elokuvat','TV-sarjat'].forEach(c => {
      if(!Array.isArray(appData.subcats[c])) appData.subcats[c] = [];
      if(!appData.subcats[c].includes('Animaatiot')) appData.subcats[c].push('Animaatiot');
    });
    appData.subcats._seed = 1;
  }
  return appData.subcats;
}
window.ensureSubcats = ensureSubcats;

// Kategorian alalajit listana (tyhjä = kategorialla ei ole jakoa)
function subcatsFor(cat){
  if(!cat || String(cat).charAt(0) === '_') return [];
  const all = ensureSubcats();
  const list = all[cat];
  return Array.isArray(list) ? list.filter(Boolean) : [];
}
window.subcatsFor = subcatsFor;

// ── VERTAILURYHMÄ ──
// Kategoria JA alalaji yhdessä muodostavat ryhmän, jonka sisällä
// arvosteluja verrataan toisiinsa. Perusleffat, dokumentit ja
// animaatiot ovat siis eri ryhmiä, eivätkä ne kohtaa vertailussa,
// pistejakaumassa, ennusteessa eivätkä lähimmissä arvosteluissa.
function sameGroup(r, cat, sub){
  return r && r.category === cat && subcatOf(r) === (sub || '');
}
window.sameGroup = sameGroup;

// Ryhmän nimi käyttöliittymään. Jos kategorialla ei ole alalajeja,
// pelkkä kategorian nimi riittää.
function groupLabel(cat, sub){
  if(!subcatsFor(cat).length) return cat;
  return cat + ' · ' + (sub || 'Perus');
}
window.groupLabel = groupLabel;

// Arvostelun alalaji normalisoituna. '' = Perus.
function subcatOf(r){
  const v = String((r && r.subcat) || '').trim();
  return v;
}
window.subcatOf = subcatOf;

// Valittu alalaji per kategoria. '' = perus, muu = alalajin nimi.
let activeSub = '';
const SUB_KEY = 'arvostelut_activeSub_v1';

function loadSubChoice(cat){
  try{
    const raw = localStorage.getItem(SUB_KEY);
    if(raw){
      const o = JSON.parse(raw);
      if(o && Object.prototype.hasOwnProperty.call(o, cat)){
        // Vanha "kaikki"-valinta ei ole enää olemassa → Perus
        return o[cat] === 'all' ? '' : o[cat];
      }
    }
  } catch(e){}
  return '';
}

function saveSubChoice(cat, val){
  try{
    let o = {};
    const raw = localStorage.getItem(SUB_KEY);
    if(raw) o = JSON.parse(raw) || {};
    o[cat] = val;
    localStorage.setItem(SUB_KEY, JSON.stringify(o));
  } catch(e){}
}

window.getActiveSub = function(){ return activeSub; };

window.setActiveSub = function(val){
  activeSub = val;
  saveSubChoice(activeCat, val);
  renderSubTabs();
  renderCards();
};

// ── KATEGORIA TABS ──
function renderCatTabs(){
  const tabs = document.getElementById('catTabs');
  if(!tabs) return;
  tabs.innerHTML = appData.categories.map(c=>`
    <button class="cat-tab ${c===activeCat?'active':''}" onclick="setActiveCat('${escJs(c)}')">${esc(c)}</button>
  `).join('');
  renderSubTabs();
}

// Alalajirivi näkyy vain jos aktiivisella kategorialla on alalajeja.
function renderSubTabs(){
  const el = document.getElementById('subTabs');
  if(!el) return;
  const subs = subcatsFor(activeCat);
  if(!subs.length || currentView !== 'reviews'){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const count = (val) => (appData.reviews || []).filter(r =>
    r.category === activeCat && subcatOf(r) === val
  ).length;

  const opts = [
    { val: '', label: 'Perus' },
    ...subs.map(s => ({ val: s, label: s }))
  ];
  el.style.display = 'flex';
  el.innerHTML = opts.map(o => `
    <button class="sub-tab ${o.val === activeSub ? 'active' : ''}" onclick="setActiveSub('${escJs(o.val)}')">
      ${esc(o.label)}<span class="sub-tab-count">${count(o.val)}</span>
    </button>
  `).join('');
}
window.renderSubTabs = renderSubTabs;

window.setActiveCat = function(cat){
  activeCat = cat;
  activeSub = loadSubChoice(cat);
  // Jos muistissa oleva alalaji on poistettu, palataan kaikkiin
  if(activeSub !== '' && !subcatsFor(cat).includes(activeSub)) activeSub = '';
  activeGenreFilter = null;
  activeScoreFilter = null;
  activeMarkFilter = null;
  activeYearFilter = null;
  activeDecadeFilter = null;
  document.querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));
  renderCatTabs();
  renderCards();
  if(window.updateFilterBadge) window.updateFilterBadge();
};

// ── GENREFILTERIT ──
function renderGenreFilters(){
  const el = document.getElementById('genreFilters');
  if(!el) return;
  el.innerHTML = GENRES.map(g=>`
    <button class="filter-chip ${g===activeGenreFilter?'active':''}" onclick="toggleGenreFilter(this,'${escJs(g)}')">${esc(g)}</button>
  `).join('');
}

window.toggleGenreFilter = function(btn, genre){
  activeGenreFilter = activeGenreFilter===genre ? null : genre;
  document.querySelectorAll('#genreFilters .filter-chip').forEach(b=>b.classList.remove('active'));
  if(activeGenreFilter) btn.classList.add('active');
  renderCards();
  if(window.updateFilterBadge) window.updateFilterBadge();
};

window.toggleScoreFilter = function(btn){
  const s = btn.dataset.score;
  activeScoreFilter = activeScoreFilter===s ? null : s;
  document.querySelectorAll('#scoreFilters .filter-chip').forEach(b=>b.classList.remove('active'));
  if(activeScoreFilter) btn.classList.add('active');
  renderCards();
  if(window.updateFilterBadge) window.updateFilterBadge();
};

window.toggleMarkFilter = function(btn){
  const m = btn.dataset.mark;
  activeMarkFilter = activeMarkFilter===m ? null : m;
  document.querySelectorAll('#markFilters .filter-chip').forEach(b=>b.classList.remove('active'));
  if(activeMarkFilter) btn.classList.add('active');
  renderCards();
  if(window.updateFilterBadge) window.updateFilterBadge();
};

function renderDecadeFilters(){
  const el = document.getElementById('decadeFilters');
  const lbl = document.getElementById('decadeFilterLabel');
  if(!el) return;
  const decades = [...new Set(appData.reviews.filter(r=>r.year).map(r=>Math.floor(r.year/10)*10))].sort((a,b)=>b-a);
  if(!decades.length){
    el.innerHTML = '';
    el.style.display = 'none';
    if(lbl) lbl.style.display = 'none';
    return;
  }
  el.style.display = '';
  if(lbl) lbl.style.display = '';
  el.innerHTML = decades.map(d=>`
    <button class="filter-chip ${d===activeDecadeFilter?'active':''}" onclick="toggleDecadeFilter(this,${d})">${d}-luku</button>
  `).join('');
}

window.toggleDecadeFilter = function(btn, dec){
  activeDecadeFilter = activeDecadeFilter===dec ? null : dec;
  document.querySelectorAll('#decadeFilters .filter-chip').forEach(b=>b.classList.remove('active'));
  if(activeDecadeFilter) btn.classList.add('active');
  renderCards();
  if(window.updateFilterBadge) window.updateFilterBadge();
};

function renderYearFilters(){
  const el = document.getElementById('yearFilters');
  if(!el) return;
  const years = [...new Set(appData.reviews.filter(r=>r.date).map(r=>new Date(r.date).getFullYear()))].sort((a,b)=>b-a);
  el.innerHTML = years.map(y=>`
    <button class="filter-chip ${y===activeYearFilter?'active':''}" onclick="toggleYearFilter(this,${y})">${y}</button>
  `).join('');
}

window.toggleYearFilter = function(btn, year){
  activeYearFilter = activeYearFilter===year ? null : year;
  document.querySelectorAll('#yearFilters .filter-chip').forEach(b=>b.classList.remove('active'));
  if(activeYearFilter) btn.classList.add('active');
  renderCards();
  if(window.updateFilterBadge) window.updateFilterBadge();
};

window.toggleFilter = function(){
  const panel = document.getElementById('filterPanel');
  const btn = document.getElementById('filterToggleBtn');
  if(!panel) return;
  panel.style.display = '';           // varmistus vanhan inline-tyylin varalta
  const open = !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  if(btn) btn.classList.toggle('active', open);
  if(open){
    renderGenreFilters();
    renderYearFilters();
    renderDecadeFilters();
  }
};

// Näytä ⚡-napissa merkki kun jokin suodatin on käytössä
window.updateFilterBadge = function(){
  const btn = document.getElementById('filterToggleBtn');
  if(!btn) return;
  const any = !!(activeGenreFilter || activeScoreFilter || activeMarkFilter || activeYearFilter || activeDecadeFilter);
  btn.classList.toggle('has-filters', any);
};

window.clearAllFilters = function(){
  activeGenreFilter = null;
  activeScoreFilter = null;
  activeMarkFilter = null;
  activeYearFilter = null;
  activeDecadeFilter = null;
  document.querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));
  renderCards();
  if(window.updateFilterBadge) window.updateFilterBadge();
};

// ── HAKUKENTTÄ ──
// Sumea haku käy koko listan läpi, joten renderöintiä ei kannata tehdä
// jokaisella näppäinpainalluksella. Pieni viive riittää pitämään sen sujuvana.
let _searchTimer = null;
window.onSearchInput = function(){
  const inp = document.getElementById('searchInput');
  const clr = document.getElementById('searchClear');
  if(clr) clr.style.display = (inp && inp.value) ? 'flex' : 'none';
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(()=>renderCards(), 140);
};

window.clearSearch = function(){
  const inp = document.getElementById('searchInput');
  if(inp) inp.value = '';
  const clr = document.getElementById('searchClear');
  if(clr) clr.style.display = 'none';
  const note = document.getElementById('searchNote');
  if(note){ note.style.display='none'; note.innerHTML=''; }
  renderCards();
};

window.cycleSort = function(){
  const modes = ['uusin','vanhin','paras','huonoin'];
  sortMode = modes[(modes.indexOf(sortMode)+1)%modes.length];
  const icons = {uusin:'🕐',vanhin:'📅',paras:'⭐',huonoin:'📉'};
  const labels = {uusin:'Uusin ensin',vanhin:'Vanhin ensin',paras:'Paras ensin',huonoin:'Huonoin ensin'};
  document.getElementById('sortBtn').textContent = icons[sortMode];
  const el=document.getElementById('saveStatus');
  el.textContent=labels[sortMode]; el.style.background='#333'; el.style.color='white'; el.style.opacity='1';
  setTimeout(()=>el.style.opacity='0',1500);
  renderCards();
};

// ── ARVOSANA-RENGAS ──
function buildRing(score){
  const r = 38, c = 2*Math.PI*r;
  const cls = scoreBand(score);
  const uid = 'ring-'+Math.random().toString(36).slice(2,7);
  // Rengas alkaa tyhjänä, animoituu JS:llä
  setTimeout(()=>{
    const el = document.getElementById(uid);
    if(el){
      const pct = score/100;
      el.style.strokeDashoffset = c*(1-pct);
      // Animoi numero 0 → score
      const numEl = document.getElementById(uid+'-num');
      if(numEl){
        let cur = 0;
        const step = Math.ceil(score/30);
        const timer = setInterval(()=>{
          cur = Math.min(cur+step, score);
          numEl.textContent = cur;
          if(cur>=score) clearInterval(timer);
        }, 20);
      }
    }
  }, 80);
  return `<div class="score-ring">
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle class="score-ring-bg" cx="44" cy="44" r="${r}"/>
      <circle id="${uid}" class="score-ring-fill ${cls}" cx="44" cy="44" r="${r}"
        stroke-dasharray="${c}"
        stroke-dashoffset="${c}"
        style="transition:stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1);"/>
    </svg>
    <div id="${uid}-num" class="score-ring-num ${cls}">0</div>
  </div>`;
}

// ── VÄRIT ──
const ACCENT_PRESETS = [
  { hex:'#e8b84b', name:'Kulta' },
  { hex:'#ff6b6b', name:'Punainen' },
  { hex:'#fb923c', name:'Oranssi' },
  { hex:'#4ade80', name:'Vihreä' },
  { hex:'#2dd4bf', name:'Minttu' },
  { hex:'#38bdf8', name:'Syaani' },
  { hex:'#a78bfa', name:'Violetti' },
  { hex:'#f472b6', name:'Pinkki' }
];

function hexToRgb(hex){
  const h = String(hex||'').replace('#','');
  const full = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
  const n = parseInt(full, 16);
  if(isNaN(n) || full.length !== 6) return { r:232, g:184, b:75 };
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}

function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max+min)/2;
  const d = max-min;
  if(d){
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    if(max===r) h = ((g-b)/d + (g<b?6:0))/6;
    else if(max===g) h = ((b-r)/d + 2)/6;
    else h = ((r-g)/d + 4)/6;
  }
  return [h,s,l];
}

function hslToHex(h,s,l){
  const f = n => {
    const k = (n + h*12) % 12;
    const a = s * Math.min(l, 1-l);
    const v = l - a * Math.max(-1, Math.min(k-3, Math.min(9-k, 1)));
    return Math.round(255*v).toString(16).padStart(2,'0');
  };
  return '#' + f(0) + f(8) + f(4);
}

window.applyAccent = function(hex){
  const { r, g, b } = hexToRgb(hex);
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  [['--acc-08',0.08],['--acc-10',0.1],['--acc-15',0.15],['--acc-18',0.18],
   ['--acc-20',0.2],['--acc-30',0.3],['--acc-35',0.35],['--acc-40',0.4]]
    .forEach(([name,a]) => root.style.setProperty(name, `rgba(${r},${g},${b},${a})`));
};

function ensureSettings(){
  if(!appData.settings) appData.settings = {};
  if(!appData.settings.accent) appData.settings.accent = ACCENT_PRESETS[0].hex;
  if(appData.settings.posterColors == null) appData.settings.posterColors = true;
  // Filmiraita on koriste, joten se on oletuksena pois: se kaventaa listaa.
  if(appData.settings.filmstrip == null) appData.settings.filmstrip = false;
  if(!appData.settings.precision) appData.settings.precision = 'normal';
  if(!appData.settings.weights) appData.settings.weights = {};
  if(appData.settings.topLimit == null) appData.settings.topLimit = 5;
  // Jaksotiedot: juonet käännetään oletuksena, nimiä ei — jaksojen nimet
  // ovat usein sanaleikkejä tai erisnimiä, joita konekäännös pilaa.
  if(appData.settings.translatePlots == null) appData.settings.translatePlots = true;
  if(appData.settings.translateNames == null) appData.settings.translateNames = false;
  if(appData.settings.translateEmail == null) appData.settings.translateEmail = '';
  // Teema. themeMode koskee perustilaa, themePack ohittaa sen kokonaan.
  if(!appData.settings.themeMode) appData.settings.themeMode = 'dark';
  if(!appData.settings.themePack) appData.settings.themePack = 'perus';
  // Pisteluokkien rajat. high = tästä ylöspäin vihreä, mid = tästä ylöspäin keltainen.
  if(!appData.settings.scoreBands) appData.settings.scoreBands = { high: 70, mid: 40 };
  if(typeof appData.settings.tmdbToken !== 'string') appData.settings.tmdbToken = '';
  // Löydä-näkymä: montako ehdotusta yhtä lähdettä kohden haetaan.
  if(appData.settings.discoverCount == null) appData.settings.discoverCount = 3;
  // Lomakkeen kenttäjärjestys. Tyhjä taulukko = oletusjärjestys.
  if(!Array.isArray(appData.settings.formOrder)) appData.settings.formOrder = [];
  // Poistettujen ominaisuuksien jäänteet pois, jotta tallennettu asetusdata
  // ei kanna mukanaan kenttiä joita mikään ei enää lue.
  delete appData.settings.qbank;
  delete appData.settings.cardActionsMenu;
  // Asetuksiin tallennettu TMDB-tunnus voittaa koodissa olevan oletuksen.
  if(window.syncTmdbToken) window.syncTmdbToken();
  return appData.settings;
}

window.renderAccentRow = function(){
  const el = document.getElementById('accentRow');
  if(!el) return;
  const cur = ensureSettings().accent;
  el.innerHTML = ACCENT_PRESETS.map(p=>`
    <button type="button" class="accent-dot ${p.hex===cur?'active':''}" title="${esc(p.name)}"
      style="background:${p.hex};" onclick="setAccent('${p.hex}')"></button>
  `).join('');
};

window.setAccent = async function(hex){
  ensureSettings().accent = hex;
  window.applyAccent(hex);
  window.renderAccentRow();
  await window.fbSave();
};

window.togglePosterColors = async function(){
  const s = ensureSettings();
  s.posterColors = !s.posterColors;
  window.updatePosterColorToggle();
  renderCards();
  await window.fbSave();
};

window.updatePosterColorToggle = function(){
  const btn = document.getElementById('posterColorToggle');
  if(!btn) return;
  btn.classList.toggle('on', !!ensureSettings().posterColors);
};

// ── KORTTIEN KENTTIEN NAKYVYYS ──
// Oletustoteutus: kaikki kentat nakyvat. app-cards.js korvaa taman
// asetuksia lukevalla versiolla. Naita kutsutaan korttien ja luku-modaalin
// pohjissa, joten ilman oletusta puuttuva app-cards.js kaataisi koko listan
// pelkan varoituksen sijaan.
window.cardField = function(){ return true; };
window.cf = id => window.cardField('card', id);
window.rf = id => window.cardField('read', id);

// ── JULISTEEN OSOITE ──
// Juliste voi tulla kahdesta paikasta: TMDB:n polusta (r.poster) tai
// itse ladatusta kuvasta (r.posterCustom, data-URL). Oma kuva voittaa
// aina, jotta TMDB-päivitys ei pyyhi käsin valittua julistetta.
window.posterUrl = function(r, size){
  if(!r) return '';
  if(r.posterCustom) return r.posterCustom;
  if(r.poster) return 'https://image.tmdb.org/t/p/' + (size || 'w342') + r.poster;
  return '';
};

window.hasPoster = function(r){ return !!(r && (r.posterCustom || r.poster)); };

// CSS:n url() sijoitetaan style="..." -attribuutin sisään, joten arvo EI saa
// sisältää kaksoislainausmerkkiä — se katkaisisi attribuutin ja juliste
// jäisi kokonaan pois. Siksi yksinkertaiset lainausmerkit ja varmuuden
// vuoksi prosenttikoodaus molemmille lainausmerkeille ja suluille.
window.posterCss = function(r, size){
  const u = window.posterUrl(r, size);
  if(!u) return '';
  const safe = u.replace(/'/g, '%27').replace(/"/g, '%22')
                .replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `url('${safe}')`;
};

// Oletustoteutukset kortin julisteelle ja toimintonapeille. app-cards.js
// korvaa nämä asetuksia lukevilla versioilla. Ilman oletuksia puuttuva
// moduuli veisi julisteet kokonaan pois — sama oire jonka korjasimme jo
// kerran, joten se estetään tässä rakenteellisesti.
window.posterPos = function(){ return 'bg'; };
window.cardPosterHtml = function(r){
  return window.hasPoster(r)
    ? `<div class="card-poster-bg" style="background-image:${window.posterCss(r,'w200')}"></div>`
    : '';
};

// ── JULISTEESTA POIMITTU VÄRI ──
// Väri lasketaan kerran ja tallennetaan arvosteluun (r.posterColor),
// jotta sitä ei tarvitse laskea uudelleen joka renderöinnillä.
const _pcQueue = [];
const _pcFailed = new Set();
let _pcRunning = false, _pcDirty = false, _pcSaveTimer = null;

function extractPosterColor(url){
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let done = false;
    const finish = v => { if(!done){ done = true; resolve(v); } };
    setTimeout(()=>finish(null), 8000);
    img.onerror = () => finish(null);
    img.onload = () => {
      try{
        const N = 12;
        const cv = document.createElement('canvas');
        cv.width = N; cv.height = N;
        const ctx = cv.getContext('2d', { willReadFrequently:true });
        ctx.drawImage(img, 0, 0, N, N);
        const d = ctx.getImageData(0, 0, N, N).data;
        let vx=0, vy=0, ssum=0, n=0, rs=0, gs=0, bs=0, tot=0;
        for(let i=0;i<d.length;i+=4){
          const R=d[i], G=d[i+1], B=d[i+2];
          rs+=R; gs+=G; bs+=B; tot++;
          const hsl = rgbToHsl(R,G,B);
          // Ohita lähes mustat, lähes valkoiset ja harmaat pikselit
          if(hsl[1] > 0.22 && hsl[2] > 0.18 && hsl[2] < 0.88){
            const a = hsl[0] * 2 * Math.PI;
            vx += Math.cos(a) * hsl[1];
            vy += Math.sin(a) * hsl[1];
            ssum += hsl[1]; n++;
          }
        }
        if(n >= 8){
          let hue = Math.atan2(vy, vx) / (2*Math.PI);
          if(hue < 0) hue += 1;
          const sat = Math.min(0.72, Math.max(0.40, ssum/n));
          finish(hslToHex(hue, sat, 0.56));
        } else if(tot){
          const hsl = rgbToHsl(rs/tot, gs/tot, bs/tot);
          // Lähes harmaa juliste (mustavalkoinen) → ei väriä, kortti pitää oletussävynsä
          finish(hsl[1] < 0.10 ? null : hslToHex(hsl[0], 0.32, 0.54));
        } else finish(null);
      } catch(e){
        finish(null); // canvas saastui (CORS) tai muu virhe
      }
    };
    img.src = url;
  });
}

function applyPosterColorToDom(id, hex){
  const { r, g, b } = hexToRgb(hex);
  document.querySelectorAll(`[data-pc-id="${id}"]`).forEach(el => {
    el.style.setProperty('--card-accent', hex);
    el.style.setProperty('--card-accent-soft', `rgba(${r},${g},${b},0.35)`);
    el.classList.add('has-pc');
  });
}

async function processPosterColorQueue(){
  _pcRunning = true;
  while(_pcQueue.length){
    const r = _pcQueue.shift();
    if(!r || !window.hasPoster(r) || r.posterColor) continue;
    // Oma kuva on data-URL, joten se ei tarvitse pientä w92-versiota
    // eikä CORS-kikkailua — canvas ei saastu siitä.
    const hex = await extractPosterColor(window.posterUrl(r, 'w92'));
    if(hex){
      r.posterColor = hex;
      _pcDirty = true;
      applyPosterColorToDom(r.id, hex);
    } else {
      _pcFailed.add(r.id);
    }
    await new Promise(res => setTimeout(res, 30));
  }
  _pcRunning = false;
  if(_pcDirty){
    _pcDirty = false;
    clearTimeout(_pcSaveTimer);
    // Tallenna kaikki kerralla vasta kun laskenta on ohi
    _pcSaveTimer = setTimeout(()=>{ if(window.fbSave) window.fbSave(); }, 2500);
  }
}

function schedulePosterColors(list){
  if(!ensureSettings().posterColors) return;
  let added = 0;
  list.forEach(r => {
    if(window.hasPoster(r) && !r.posterColor && !_pcFailed.has(r.id) && !_pcQueue.includes(r)){
      _pcQueue.push(r); added++;
    }
  });
  if(added && !_pcRunning) processPosterColorQueue();
}

// Palauttaa inline-tyylit ja luokan kortille jolla on julisteväri
function pcAttrs(r){
  if(!appData.settings || !appData.settings.posterColors) return { cls:'', style:'', id:'' };
  const idAttr = ` data-pc-id="${r.id}"`;
  if(!r.posterColor) return { cls:'', style:'', id:idAttr };
  const { r:cr, g:cg, b:cb } = hexToRgb(r.posterColor);
  return {
    cls: ' has-pc',
    style: `--card-accent:${r.posterColor};--card-accent-soft:rgba(${cr},${cg},${cb},0.35);`,
    id: idAttr
  };
}

// ── MUISTIINPANOJEN MUOTOILU (kevyt markdown) ──
// Järjestys on tärkeä: esc() ensin, vasta sitten muotoilumerkit,
// muuten käyttäjän kirjoittama <b> päätyisi oikeaksi HTML:ksi.
function mdInline(escaped){
  // Merkkien sisällä on oltava tekstiä ilman reunavälilyöntejä,
  // jotta esim. "2 * 3 * 4" ei muutu kursiiviksi.
  return escaped
    .replace(/\*\*(\S|\S[^*]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(\S|\S[^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~(\S|\S[^~]*?\S)~~/g, '<span class="md-strike">$1</span>');
}

function mdText(s){
  if(s == null || s === '') return '';
  const lines = esc(s).split('\n');
  let out = '', inList = false;
  lines.forEach(line => {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if(m){
      if(!inList){ out += '<ul class="md-list">'; inList = true; }
      out += '<li>' + mdInline(m[1]) + '</li>';
    } else {
      if(inList){ out += '</ul>'; inList = false; }
      out += mdInline(line) + '<br>';
    }
  });
  if(inList) out += '</ul>';
  return out.replace(/(<br>)+$/, '');
}
window.mdText = mdText;

// Muotoilupainikkeet: ympäröi valinta tai lisää merkit kursorin kohdalle
window.mdWrap = function(fieldId, before, after){
  const el = document.getElementById(fieldId);
  if(!el) return;
  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const val = el.value;
  const sel = val.slice(start, end);
  el.value = val.slice(0, start) + before + sel + after + val.slice(end);
  const pos = sel ? start + before.length + sel.length + after.length : start + before.length;
  el.focus();
  el.setSelectionRange(pos, pos);
};

window.mdBullet = function(fieldId){
  const el = document.getElementById(fieldId);
  if(!el) return;
  const start = el.selectionStart || 0;
  const val = el.value;
  const lineStart = val.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const prefix = (start === lineStart) ? '- ' : '\n- ';
  el.value = val.slice(0, start) + prefix + val.slice(start);
  const pos = start + prefix.length;
  el.focus();
  el.setSelectionRange(pos, pos);
};

// ── VUOSI ──
// Vanhassa datamallissa vuosi oli osa nimeä ("OPPENHEIMER\n2023").
// Tämä siirtää sen omaan year-kenttäänsä. Ajetaan kerran latauksen yhteydessä.
window.migrateYearField = function(){
  let changed = false;
  (appData.reviews || []).forEach(r => {
    if(!r.name || r.name.indexOf('\n') === -1) return;
    const lines = r.name.split('\n').map(x => x.trim()).filter(Boolean);
    const last = lines[lines.length - 1];
    if(r.year == null && lines.length >= 2 && /^(18|19|20)\d{2}$/.test(last)){
      // Viimeinen rivi on vuosiluku → omaan kenttäänsä
      r.year = parseInt(last, 10);
      r.name = lines.slice(0, -1).join(' ').trim();
    } else {
      // Monirivinen nimi ilman vuotta → yhdistetään yhdeksi riviksi
      r.name = lines.join(' ').trim();
    }
    changed = true;
  });
  return changed;
};

// Nimi ilman rivinvaihtoja (vanha data voi yhä sisältää niitä)
function plainName(r){
  return String(r && r.name ? r.name : '').replace(/\s*\n\s*/g, ' ').trim();
}
// Nimi + julkaisuvuosi tekstinä, esim. "DUNE (2021)"
function nameWithYear(r){
  const n = plainName(r);
  return (r && r.year) ? `${n} (${r.year})` : n;
}
window.plainName = plainName;
window.nameWithYear = nameWithYear;

// ── SUMEA HAKU ──
// Haku sietää kirjoitusvirheet: "oppenhaimer" löytää OPPENHEIMERin.
// Toimintaperiaate:
//   1. Teksti normalisoidaan (pienet kirjaimet, aksentit pois, välimerkit pois).
//   2. Ensin kokeillaan halvat tarkat osumat (alkaa samalla, sisältää).
//   3. Vasta jos ne eivät osu, lasketaan muokkausetäisyys (Levenshtein).
// Palautettu luku on osuvuuspiste: mitä suurempi, sitä parempi osuma.
// 0 tarkoittaa "ei osumaa".

// Normalisointi: ä→a, ö→o, é→e, välimerkit välilyönneiksi.
// Näin "wall·e", "WALL-E" ja "walle" ovat sama asia, ja ääkkösvirheet sallitaan.
function fuzzyNorm(s){
  let t = String(s == null ? '' : s).toLowerCase();
  try {
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch(e){
    // Vanhat selaimet ilman normalize-tukea: korvaa yleisimmät käsin
    t = t.replace(/[äàáâã]/g,'a').replace(/[öòóôõ]/g,'o').replace(/[åā]/g,'a')
         .replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i').replace(/[úùûü]/g,'u');
  }
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
}

// Pienin muokkausetäisyys hakusanan ja kohteen MINKÄ TAHANSA alun välillä.
// Tämä on olennaista: kirjoitat "oppenhaim", joten koko nimeen vertaaminen
// antaisi ison etäisyyden pelkän puuttuvan lopun takia. Vertaamalla vain
// alkuun saadaan haku toimimaan jo muutaman kirjaimen jälkeen.
// max = suurin sallittu etäisyys; sen ylittyessä lopetetaan kesken.
function prefixDistance(q, t, max){
  const ql = q.length, tl = t.length;
  if(!ql) return 0;
  let prev = new Array(ql + 1), cur = new Array(ql + 1);
  for(let i = 0; i <= ql; i++) prev[i] = i;
  let best = prev[ql];
  for(let j = 1; j <= tl; j++){
    cur[0] = j;
    let rowMin = cur[0];
    for(let i = 1; i <= ql; i++){
      const cost = t.charCodeAt(j-1) === q.charCodeAt(i-1) ? 0 : 1;
      let v = prev[i] + 1;
      if(cur[i-1] + 1 < v) v = cur[i-1] + 1;
      if(prev[i-1] + cost < v) v = prev[i-1] + cost;
      cur[i] = v;
      if(v < rowMin) rowMin = v;
    }
    if(cur[ql] < best) best = cur[ql];
    if(best === 0) return 0;
    // Rivien minimi ei voi enää laskea → turha jatkaa
    if(rowMin > max) break;
    const tmp = prev; prev = cur; cur = tmp;
  }
  return best;
}

// Kuinka monta virhettä sallitaan hakusanan pituuden mukaan.
// Lyhyissä hakusanoissa ei sallita mitään, muuten tuloksia tulisi liikaa.
function fuzzyTolerance(len){
  if(len <= 3) return 0;
  if(len <= 5) return 1;
  if(len <= 9) return 2;
  return 3;
}

// Osuvuuspisteet. Tarkat osumat aina sumeiden edelle.
//   100 = täsmälleen sama      90 = alkaa hakusanalla
//    80 = jokin sana alkaa     70 = sisältää hakusanan
//  40–60 = sumea osuma (mitä vähemmän virheitä, sitä korkeampi)
// Yhden hakusanan osuvuus yhteen kohteen sanaan.
function tokenMatch(qt, w){
  if(w === qt) return 100;
  if(w.indexOf(qt) === 0) return 85;
  if(w.indexOf(qt) !== -1) return 70;
  const max = fuzzyTolerance(qt.length);
  if(max === 0 || w.length < 3) return 0;
  const d = prefixDistance(qt, w, max);
  return d <= max ? 55 - d * 6 : 0;
}

function fuzzyMatch(q, t){
  if(!q) return 1;
  if(!t) return 0;
  if(t === q) return 100;
  if(t.indexOf(q) === 0) return 90;
  const words = t.split(' ');
  for(let i = 0; i < words.length; i++){
    if(words[i].indexOf(q) === 0) return 80;
  }
  if(t.indexOf(q) !== -1) return 70;

  // Monisanainen haku: jokaisen hakusanan on löydyttävä jostain kohteen
  // sanasta, mutta järjestyksellä ei ole väliä. Näin "dark night" löytää
  // THE DARK KNIGHTin, vaikka nimi alkaa sanalla "the" ja sisältää virheen.
  const qTokens = q.split(' ').filter(Boolean);
  if(qTokens.length > 1){
    let worst = 100;
    for(let i = 0; i < qTokens.length; i++){
      let bestTok = 0;
      for(let j = 0; j < words.length; j++){
        const s = tokenMatch(qTokens[i], words[j]);
        if(s > bestTok) bestTok = s;
      }
      if(!bestTok) return 0;          // yksikin hakusana ilman osumaa → hylätään
      if(bestTok < worst) worst = bestTok;
    }
    return Math.max(30, worst - 15);  // aina tarkkojen osumien alapuolelle
  }

  const max = fuzzyTolerance(q.length);
  if(max === 0) return 0;

  const d = prefixDistance(q, t, max);
  if(d <= max) return 60 - d * 6;

  // Kokeile vielä sana kerrallaan: "haimer" osuu sanaan "oppenheimer"
  for(let i = 0; i < words.length; i++){
    const dw = tokenMatch(q, words[i]);
    if(dw) return Math.min(52, dw - 3);
  }
  return 0;
}

// Normalisoinnin välimuisti: sama nimi normalisoidaan vain kerran,
// vaikka haku suoritettaisiin joka näppäinpainalluksella.
const _normCache = new Map();
function fuzzyNormCached(s){
  let v = _normCache.get(s);
  if(v === undefined){
    v = fuzzyNorm(s);
    if(_normCache.size > 4000) _normCache.clear();
    _normCache.set(s, v);
  }
  return v;
}

window.fuzzyNorm = fuzzyNorm;
window.fuzzyMatch = fuzzyMatch;
window.fuzzyNormCached = fuzzyNormCached;

// ══════════════════════════════════════════════════════════════════
// ── JAKSOTIEDOT: TMDB-HAKU, KÄÄNNÖS JA YHDISTÄMINEN ──
// Yksi yhteinen toteutus, jota sekä uuden arvostelun luonti että
// olemassa olevan päivitys käyttävät. Aiemmin sama logiikka oli
// kahtena hieman erilaisena kopiona, mikä aiheutti sen että jaksot
// tulivat välillä suomeksi, välillä englanniksi ja välillä tyhjinä.
// ══════════════════════════════════════════════════════════════════

// TMDB:n suomenkielinen jaksodata sisältää usein paikanpitäjänimiä
// ("Jakso 7"). Ne eivät ole oikeita nimiä vaan merkki puuttuvasta
// käännöksestä, joten ne pitää tunnistaa ja korvata englanninkielisellä.
function isGenericEpName(name, num){
  const n = String(name == null ? '' : name).trim();
  if(!n) return true;
  if(n === `Jakso ${num}` || n === `Episode ${num}` || n === `Avsnitt ${num}`) return true;
  return /^(jakso|episode|ep\.?|osa)\s*\d+$/i.test(n);
}
window.isGenericEpName = isGenericEpName;

// ── TMDB-KUTSUJEN LASKURI ──
// Jokainen TMDB-kutsu kulkee tästä läpi, jotta asetuksista näkee
// paljonko kiintiötä on kulunut. Laskurit ovat paikallisia
// (localStorage) — ne kuvaavat tätä laitetta, eivät tiliä.
const TMDB_COUNT_KEY = 'arvostelut_tmdbCalls_v1';
const TMDB_COUNT_DAYS = 14;

function tmdbCountLoad(){
  try{
    const o = JSON.parse(localStorage.getItem(TMDB_COUNT_KEY) || '{}');
    if(!o.days || typeof o.days !== 'object') o.days = {};
    if(typeof o.total !== 'number') o.total = 0;
    if(!o.kinds || typeof o.kinds !== 'object') o.kinds = {};
    return o;
  } catch(e){ return { days:{}, total:0, kinds:{} }; }
}

function tmdbCountSave(o){
  // Vanhat päivät karsitaan, jottei avain kasva loputtomiin
  const keep = Object.keys(o.days).sort().slice(-TMDB_COUNT_DAYS);
  const days = {};
  keep.forEach(k => days[k] = o.days[k]);
  o.days = days;
  try{ localStorage.setItem(TMDB_COUNT_KEY, JSON.stringify(o)); } catch(e){}
}

// Päättelee kutsun tyypin polusta, jotta näkee mihin kiintiö kuluu
function tmdbKind(path){
  const p = String(path || '');
  if(p.indexOf('/search/') === 0) return 'haku';
  if(/\/season\/\d+/.test(p))    return 'kaudet';
  if(/^\/(movie|tv)\/\d+\/(recommendations|similar)/.test(p)) return 'suositukset';
  if(/^\/(person|collection)\//.test(p)) return 'löydä';
  if(/^\/(movie|tv)\/\d+/.test(p))  return 'tiedot';
  if(p.indexOf('/authentication') === 0) return 'tarkistus';
  return 'muu';
}

function tmdbNote(path){
  const o = tmdbCountLoad();
  const d = new Date().toISOString().slice(0,10);
  o.days[d] = (o.days[d] || 0) + 1;
  o.total += 1;
  const k = tmdbKind(path);
  o.kinds[k] = (o.kinds[k] || 0) + 1;
  o.lastAt = new Date().toISOString();
  tmdbCountSave(o);
}
window.tmdbNote = tmdbNote;

window.tmdbCallStats = function(){
  const o = tmdbCountLoad();
  const today = new Date().toISOString().slice(0,10);
  const days = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date(Date.now() - i*86400000).toISOString().slice(0,10);
    days.push({ date: d, n: o.days[d] || 0 });
  }
  return {
    today: o.days[today] || 0,
    week: days.reduce((a,x) => a + x.n, 0),
    total: o.total,
    days,
    kinds: o.kinds || {},
    lastAt: o.lastAt || null
  };
};

window.tmdbResetCalls = function(){
  try{ localStorage.removeItem(TMDB_COUNT_KEY); } catch(e){}
};

// Yksi TMDB-kutsu. Palauttaa null virheen sattuessa, ei heitä poikkeusta,
// jotta yhden kauden epäonnistuminen ei kaada koko tuontia.
async function tmdbGet(path){
  const token = window.tmdbToken;
  if(!token) return null;
  try{
    tmdbNote(path);
    const res = await fetch(`https://api.themoviedb.org/3${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if(!res.ok) return null;
    return await res.json();
  } catch(e){
    return null;
  }
}
window.tmdbGet = tmdbGet;

// Sama laskuri myös niille kutsuille jotka rakentavat oman URL:nsa.
window.tmdbFetch = function(url, opts){
  try{
    const i = String(url).indexOf('/3');
    tmdbNote(i > -1 ? String(url).slice(i + 2).split('?')[0] : '');
  } catch(e){}
  const o = opts || {};
  if(!o.headers) o.headers = { Authorization: `Bearer ${window.tmdbToken}` };
  return fetch(url, o);
};

// Hakee yhden kauden AINA sekä suomeksi että englanniksi ja yhdistää
// parhaat palat jakso kerrallaan. Näin puolittain käännetty kausi
// täydentyy oikein — aiemmin englanti haettiin vain jos JOKAINEN jakson
// nimi oli paikanpitäjä, joten sekamuotoiset kaudet jäivät vajaiksi.
// Molemmat kutsut menevät service workerin 24 h välimuistin läpi,
// joten toinen kutsu ei käytännössä maksa mitään.
async function fetchSeasonFromTmdb(tmdbId, sNum){
  const [fi, en] = await Promise.all([
    tmdbGet(`/tv/${tmdbId}/season/${sNum}?language=fi-FI`),
    tmdbGet(`/tv/${tmdbId}/season/${sNum}?language=en-US`)
  ]);
  if(!fi && !en) return null;

  const enByNum = {};
  ((en && en.episodes) || []).forEach(e => { enByNum[e.episode_number] = e; });

  const source = (fi && fi.episodes && fi.episodes.length) ? fi.episodes : ((en && en.episodes) || []);
  const episodes = source.map(ep => {
    const num  = ep.episode_number;
    const enEp = enByNum[num] || {};

    const fiName = String(ep.name || '').trim();
    const enName = String(enEp.name || '').trim();
    let name = '', nameLang = '';
    if(!isGenericEpName(fiName, num)){ name = fiName; nameLang = 'fi'; }
    else if(!isGenericEpName(enName, num)){ name = enName; nameLang = 'en'; }
    else { name = fiName || enName || `Jakso ${num}`; nameLang = ''; }

    const fiPlot = String(ep.overview || '').trim();
    const enPlot = String(enEp.overview || '').trim();
    const plot = fiPlot || enPlot;
    const plotLang = fiPlot ? 'fi' : (enPlot ? 'en' : '');

    return {
      episode: num,
      name, nameLang,
      plot, plotLang,
      air_date: ep.air_date || enEp.air_date || null,
      still: ep.still_path || enEp.still_path || null
    };
  });

  return {
    seasonNumber: sNum,
    name: (fi && fi.name) || (en && en.name) || `Kausi ${sNum}`,
    episodes
  };
}
window.fetchSeasonFromTmdb = fetchSeasonFromTmdb;

// ── KÄÄNNÖS (MyMemory) ──
// Vanha toteutus niputti kymmenen nimeä yhteen merkkijonoon " ||| "
// -erottimella. Käännöspalvelu muutti tai poisti erottimen usein, jolloin
// pilkkominen meni väärin ja nimet menivät sekaisin tai katosivat.
// Nyt käännetään yksi teksti kerrallaan, pitkät tekstit pilkotaan
// lauserajoilta, ja jokainen epäonnistuminen koskee vain omaa tekstiään.

const TR_CACHE_KEY = 'arvostelut_translations_v1';
const TR_USAGE_KEY = 'arvostelut_tr_usage_v1';
let _trCache = null;

function trCache(){
  if(_trCache) return _trCache;
  _trCache = {};
  try {
    const raw = localStorage.getItem(TR_CACHE_KEY);
    if(raw) _trCache = JSON.parse(raw) || {};
  } catch(e){ _trCache = {}; }
  return _trCache;
}

function trCacheSave(){
  try {
    const c = trCache();
    const keys = Object.keys(c);
    // Pidä välimuisti kohtuullisena: vanhimmat pois kun rajaa lähestytään
    if(keys.length > 1200){
      const trimmed = {};
      keys.slice(-800).forEach(k => { trimmed[k] = c[k]; });
      _trCache = trimmed;
    }
    localStorage.setItem(TR_CACHE_KEY, JSON.stringify(_trCache));
  } catch(e){}
}

window.translationCacheSize = function(){
  try { return Object.keys(trCache()).length; } catch(e){ return 0; }
};
window.clearTranslationCache = function(){
  _trCache = {};
  try { localStorage.removeItem(TR_CACHE_KEY); } catch(e){}
};

// ── PÄIVÄKIINTIÖN SEURANTA ──
// MyMemoryn raja on merkkimääräinen ja nollautuu vuorokausittain. Pidämme
// itse kirjaa käytöstä, jotta osaamme kertoa etukäteen paljonko on jäljellä
// eikä käännöstyötä tarvitse aloittaa arvaamalla. Päivämäärän vaihtuessa
// laskuri nollautuu itsestään.
function trToday(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function trUsage(){
  try {
    const raw = localStorage.getItem(TR_USAGE_KEY);
    if(raw){
      const o = JSON.parse(raw);
      if(o && o.date === trToday()) return o;
    }
  } catch(e){}
  return { date: trToday(), chars: 0, exhausted: false };
}

function trSaveUsage(u){
  try { localStorage.setItem(TR_USAGE_KEY, JSON.stringify(u)); } catch(e){}
}

function trAddUsage(n){
  const u = trUsage();
  u.chars += n;
  trSaveUsage(u);
}

function trMarkExhausted(){
  const u = trUsage();
  u.exhausted = true;
  trSaveUsage(u);
}

// Kiintiön tila käyttöliittymää varten.
window.translateQuotaState = function(){
  const u = trUsage();
  const email = String((appData.settings && appData.settings.translateEmail) || '').trim();
  const limit = email ? 50000 : 5000;
  return {
    date: u.date,
    chars: u.chars,
    limit,
    left: Math.max(0, limit - u.chars),
    exhausted: !!u.exhausted,
    hasEmail: !!email
  };
};

// Nollaa kiintiölipun käsin (esim. jos sähköposti lisättiin kesken päivän).
window.resetTranslateQuotaFlag = function(){
  const u = trUsage();
  u.exhausted = false;
  trSaveUsage(u);
};
window.translateQuotaHit = function(){ return trUsage().exhausted; };

// MyMemory palauttaa toisinaan HTML-entiteettejä (&#39;) raakana.
function decodeEntities(s){
  if(!s || s.indexOf('&') === -1) return s;
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

// Pilko pitkä teksti lauserajoilta alle rajan mittaisiin paloihin.
// MyMemory hylkää yli 500 merkin kyselyt, ja jaksojen juonikuvaukset
// ylittävät sen usein.
function splitForTranslate(text, limit){
  const max = limit || 460;
  if(text.length <= max) return [text];
  const parts = [];
  let rest = text;
  while(rest.length > max){
    let cut = -1;
    for(const mark of ['. ', '! ', '? ', '; ', ', ']){
      const i = rest.lastIndexOf(mark, max);
      if(i > cut) cut = i + mark.length - 1;
    }
    if(cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
    if(cut <= 0) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if(rest) parts.push(rest);
  return parts;
}

async function myMemoryTranslate(text){
  if(trUsage().exhausted) return null;
  const email = String((appData.settings && appData.settings.translateEmail) || '').trim();
  const url = 'https://api.mymemory.translated.net/get'
    + `?q=${encodeURIComponent(text)}&langpair=en|fi`
    + (email ? `&de=${encodeURIComponent(email)}` : '');
  try{
    const res = await fetch(url);
    const data = await res.json();
    const out = data && data.responseData && data.responseData.translatedText;
    // Päiväkiintiö täynnä tai muu palvelun oma virheilmoitus tulee
    // käännöksen paikalla tekstinä — sitä ei saa tallentaa nimeksi.
    if(/MYMEMORY WARNING|QUOTA|USAGE LIMIT|TOO MANY|INVALID/i.test(String(out || '')) ||
       data.responseStatus === 429 || data.responseStatus === 403){
      trMarkExhausted();
      return null;
    }
    if(!out || data.responseStatus !== 200) return null;
    trAddUsage(text.length);
    return decodeEntities(String(out)).trim() || null;
  } catch(e){
    return null;
  }
}

// Kääntää yhden tekstin. Palauttaa null jos käännös epäonnistuu,
// jolloin kutsuja jättää alkuperäisen englanninkielisen tekstin paikalleen.
async function translateToFi(text){
  const src = String(text || '').trim();
  if(!src) return null;
  const cache = trCache();
  if(Object.prototype.hasOwnProperty.call(cache, src)) return cache[src];

  const chunks = splitForTranslate(src, 460);
  const out = [];
  for(let i = 0; i < chunks.length; i++){
    const t = await myMemoryTranslate(chunks[i]);
    if(t == null) return null;          // yksikin pala pieleen → koko teksti ennalleen
    out.push(t);
    if(i < chunks.length - 1) await new Promise(r => setTimeout(r, 120));
  }
  const joined = out.join(' ').trim();
  if(!joined || joined.toLowerCase() === src.toLowerCase()){ cache[src] = null; trCacheSave(); return null; }
  cache[src] = joined;
  trCacheSave();
  return joined;
}
window.translateToFi = translateToFi;

// ── KÄÄNNETTÄVÄT KOHTEET ──
// Tuonti EI enää käännä mitään automaattisesti. Tämä kerää listan siitä,
// mikä olisi käännettävissä, jotta käyttöliittymä voi näyttää määrän ja
// arvioidun merkkimäärän ennen kuin mitään lähetetään palveluun.
function pendingTranslations(r, seasonIdxs){
  const s = ensureSettings();
  const jobs = [];
  (r.seasons || []).forEach((season, si) => {
    if(seasonIdxs && seasonIdxs.indexOf(si) === -1) return;
    (season.episodes || []).forEach(ep => {
      if(s.translatePlots && ep.plotLang === 'en' && ep.plot){
        jobs.push({ si, ep, field: 'plot', len: ep.plot.length });
      }
      if(s.translateNames && ep.nameLang === 'en' && ep.name){
        jobs.push({ si, ep, field: 'name', len: ep.name.length });
      }
    });
  });
  return jobs;
}
window.pendingTranslations = pendingTranslations;

// Montako merkkiä jono veisi kiintiöstä. Välimuistissa olevat eivät maksa
// mitään, joten ne jätetään laskuista pois.
window.pendingCharCost = function(jobs){
  const cache = trCache();
  let sum = 0;
  jobs.forEach(j => {
    const src = String(j.ep[j.field] || '').trim();
    if(!Object.prototype.hasOwnProperty.call(cache, src)) sum += src.length;
  });
  return sum;
};

// Ajaa käännösjonon. Keskeytyy siististi jos kiintiö loppuu tai käyttäjä
// peruu — siihen asti tehdyt käännökset jäävät voimaan.
async function runTranslationJobs(jobs, onProgress, isCancelled, onCheckpoint){
  let done = 0, ok = 0, failed = 0, cancelled = false;
  for(let i = 0; i < jobs.length; i++){
    if(isCancelled && isCancelled()){ cancelled = true; break; }
    if(trUsage().exhausted) break;

    const job = jobs[i];
    const src = job.ep[job.field];
    const t = await translateToFi(src);
    if(t){
      if(job.field === 'name'){
        job.ep.nameOriginal = src;
        job.ep.name = t;
        job.ep.nameLang = 'fi-auto';
      } else {
        job.ep.plotOriginal = src;
        job.ep.plot = t;
        job.ep.plotLang = 'fi-auto';
      }
      ok++;
    } else if(trUsage().exhausted){
      // Kiintiö loppui juuri tähän kohteeseen. Se ei ole virhe vaan
      // jatkokohta huomiselle, joten sitä ei lasketa epäonnistuneeksi.
      break;
    } else {
      failed++;
    }
    done++;
    if(onProgress) onProgress(done, jobs.length, job);
    // Tallenna välillä, jotta keskeytys ei hukkaa tehtyä työtä
    if(onCheckpoint && done % 8 === 0) await onCheckpoint();
    await new Promise(r => setTimeout(r, 120));
  }
  return { done, ok, failed, cancelled, quota: trUsage().exhausted, total: jobs.length };
}
window.runTranslationJobs = runTranslationJobs;

// ── KAUDEN YHDISTÄMINEN OLEMASSA OLEVAAN ──
// Sääntö: omat pisteet ja omat muistiinpanot ovat pyhiä eikä niitä
// koskaan ylikirjoiteta. Nimi päivitetään vain jos vanha puuttuu tai on
// paikanpitäjä. Juoni tulee aina TMDB:stä, koska se on lähdetietoa.
// Jaksot yhdistetään jaksonumeron perusteella, ei listan järjestyksen —
// muuten yksi puuttuva jakso siirsi kaikki loput nimet väärille riveille.
function mergeSeasonInto(existing, fresh){
  const stats = { added:0, renamed:0, plots:0, kept:0, keptOwn:0 };
  const byNum = new Map();
  (existing.episodes || []).forEach(ep => {
    if(ep.episode != null) byNum.set(Number(ep.episode), ep);
  });

  (fresh.episodes || []).forEach(fe => {
    const old = byNum.get(Number(fe.episode));
    if(old){
      const oldName = String(old.name || '').trim();
      if(isGenericEpName(oldName, fe.episode) && fe.name){
        old.name = fe.name;
        old.nameLang = fe.nameLang;
        stats.renamed++;
      }
      // Vanhassa datassa TMDB:n juoni tallentui muistiinpanokenttään.
      // Jos muistiinpano on täsmälleen sama teksti, se ei ole käyttäjän
      // omaa tekstiä vaan vanha tuonti → siirretään oikeaan kenttään.
      if(old.note && fe.plot && old.note.trim() === fe.plot.trim()) old.note = '';
      // Itse kirjoitettua juonta ei koskaan ylikirjoiteta TMDB:n tekstillä.
      // Alkuperäinen TMDB-teksti pannaan talteen, jotta sen voi palauttaa.
      if(fe.plot && old.plotSource !== 'oma'){
        if(old.plot !== fe.plot) stats.plots++;
        old.plot = fe.plot;
        old.plotLang = fe.plotLang;
      } else if(fe.plot && old.plotSource === 'oma'){
        old.plot_tmdb = fe.plot;
        stats.keptOwn = (stats.keptOwn || 0) + 1;
      }
      if(fe.air_date && !old.air_date) old.air_date = fe.air_date;
      if(old.episode == null) old.episode = fe.episode;
      stats.kept++;
    } else {
      existing.episodes = existing.episodes || [];
      existing.episodes.push({
        episode: fe.episode,
        name: fe.name,
        nameLang: fe.nameLang,
        plot: fe.plot,
        plotLang: fe.plotLang,
        air_date: fe.air_date || null,
        note: '',
        score: null
      });
      stats.added++;
    }
  });

  if(fresh.name && (!existing.name || /^Kausi \d+$/.test(existing.name))) existing.name = fresh.name;
  existing.seasonNumber = fresh.seasonNumber;
  (existing.episodes || []).sort((a,b) => (a.episode || 0) - (b.episode || 0));
  return stats;
}
window.mergeSeasonInto = mergeSeasonInto;

// Rakentaa uuden kausiolion tuoreesta TMDB-datasta.
function seasonFromFresh(fresh){
  return {
    name: fresh.name,
    seasonNumber: fresh.seasonNumber,
    episodes: (fresh.episodes || []).map(fe => ({
      episode: fe.episode,
      name: fe.name,
      nameLang: fe.nameLang,
      plot: fe.plot,
      plotLang: fe.plotLang,
      air_date: fe.air_date || null,
      note: '',
      score: null
    }))
  };
}
window.seasonFromFresh = seasonFromFresh;

// Etsii arvostelusta kauden, joka vastaa TMDB:n kausinumeroa.
// Ennen tätä päivitystä tallennetuissa kausissa ei ole seasonNumber-kenttää,
// joten pelkkä numerovertailu ei riitä: ilman varasuunnitelmaa tuonti loisi
// jokaisesta kaudesta kaksoiskappaleen. Päättely menee järjestyksessä
// numero → nimessä oleva luku → sijainti listassa.
function findSeasonByNumber(r, sNum){
  const list = (r && r.seasons) || [];
  let hit = list.find(x => x.seasonNumber != null && Number(x.seasonNumber) === sNum);
  if(hit) return hit;
  hit = list.find(x => {
    if(x.seasonNumber != null) return false;
    const m = String(x.name || '').match(/(\d+)/);
    return m && Number(m[1]) === sNum;
  });
  if(hit) return hit;
  if(sNum >= 1 && list[sNum - 1] && list[sNum - 1].seasonNumber == null) return list[sNum - 1];
  return null;
}
window.findSeasonByNumber = findSeasonByNumber;

// ── TMDB-KENTTIEN POIMINTA ──
// Yksi yhteinen paikka sille, mitä TMDB:n vastauksesta otetaan talteen.
// Tallennamme myös henkilöiden ID:t (ei pelkkiä nimiä), koska suositusten
// hakeminen nimellä on epätarkkaa: samannimisiä ihmisiä on useita.
function extractTmdbFields(detail, isTv){
  const out = {};
  out.tmdb_type    = isTv ? 'tv' : 'movie';
  out.poster       = detail.poster_path || null;
  out.backdrop     = detail.backdrop_path || null;
  out.plot         = detail.overview || null;
  out.tmdb_score   = detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null;
  out.genre_ids    = (detail.genres || []).map(g => g.id);
  out.country      = (detail.production_countries && detail.production_countries[0]
                        ? detail.production_countries[0].iso_3166_1
                        : (detail.origin_country && detail.origin_country[0]) || null);

  const cast = (detail.credits && detail.credits.cast) || [];
  out.cast     = cast.slice(0, 5).map(a => a.name);
  out.cast_ids = cast.slice(0, 5).map(a => a.id);

  if(isTv){
    const creators = detail.created_by || [];
    out.director     = creators.length ? creators[0].name : null;
    out.director_id  = creators.length ? creators[0].id : null;
    out.episodes_total = detail.number_of_episodes || null;
    out.seasons_total  = detail.number_of_seasons || null;

    // Tuotantotila. TMDB palauttaa englanniksi myös fi-FI-kyselyllä,
    // joten käännös tehdään itse.
    out.tv_status   = detail.status || null;
    out.tv_in_prod  = !!detail.in_production;
    out.last_air_date = detail.last_air_date || null;

    const nxt = detail.next_episode_to_air;
    out.next_air = nxt ? {
      date: nxt.air_date || null,
      season: nxt.season_number || null,
      episode: nxt.episode_number || null,
      name: nxt.name || null
    } : null;

    const last = detail.last_episode_to_air;
    out.last_air = last ? {
      date: last.air_date || null,
      season: last.season_number || null,
      episode: last.episode_number || null
    } : null;
  } else {
    const crew = (detail.credits && detail.credits.crew) || [];
    const dir = crew.find(c => c.job === 'Director');
    out.director    = dir ? dir.name : null;
    out.director_id = dir ? dir.id : null;
    out.runtime     = detail.runtime || null;
    out.collection  = detail.belongs_to_collection
      ? { id: detail.belongs_to_collection.id, name: detail.belongs_to_collection.name }
      : null;
  }
  return out;
}
window.extractTmdbFields = extractTmdbFields;

// Tuotantotilan suomennos ja väri.
const TV_STATUS_MAP = {
  'Returning Series': { fi: 'Jatkuu',        icon: '🟢', cls: 'ok'   },
  'Ended':            { fi: 'Päättynyt',     icon: '🔵', cls: 'done' },
  'Canceled':         { fi: 'Peruttu',       icon: '🔴', cls: 'bad'  },
  'Cancelled':        { fi: 'Peruttu',       icon: '🔴', cls: 'bad'  },
  'In Production':    { fi: 'Tuotannossa',   icon: '🟡', cls: 'wip'  },
  'Post Production':  { fi: 'Jälkituotannossa', icon: '🟡', cls: 'wip' },
  'Planned':          { fi: 'Suunnitteilla', icon: '⚪', cls: 'wip'  },
  'Pilot':            { fi: 'Pilotti',       icon: '⚪', cls: 'wip'  }
};
function tvStatusInfo(status){
  if(!status) return null;
  return TV_STATUS_MAP[status] || { fi: status, icon: '⚪', cls: 'wip' };
}
window.tvStatusInfo = tvStatusInfo;

// ── DUPLIKAATTITARKISTUS ──
function normName(s){
  let t = String(s == null ? '' : s).toLowerCase()
    .replace(/[\u2018\u2019'`\u00b4]/g, '');   // ocean's 11 === oceans 11
  try {
    t = t.replace(/[^\p{L}\p{N}]+/gu, ' ');
  } catch(e){
    // Vanhemmat selaimet ilman unicode-property-tukea
    t = t.replace(/[^a-z0-9äöåü]+/g, ' ');
  }
  return t.trim();
}

// Palauttaa aiemman arvostelun jos uusi näyttää samalta teokselta.
// Eri julkaisuvuosi = eri teos (esim. remake), jolloin ei varoiteta.
function findDuplicateReview(name, year, cat, tmdbId, excludeId){
  const target = normName(name);
  if(!target) return null;
  return (appData.reviews || []).find(r => {
    if(r.id === excludeId) return false;
    if(tmdbId && r.tmdb_id && String(r.tmdb_id) === String(tmdbId)) return true;
    if(r.category !== cat) return false;
    if(normName(plainName(r)) !== target) return false;
    if(year && r.year && year !== r.year) return false;
    return true;
  }) || null;
}

let _dupResolve = null;

function askDuplicate(dup){
  return new Promise(resolve => {
    _dupResolve = resolve;
    const score = getReviewScore(dup);
    const dateStr = dup.date ? new Date(dup.date).toLocaleDateString('fi-FI') : 'ei päivämäärää';
    const poster = window.hasPoster(dup)
      ? `<img class="dup-poster" src="${esc(window.posterUrl(dup, 'w154'))}" alt="">`
      : `<div class="dup-poster">${dup.category === 'TV-sarjat' ? '📺' : '🎬'}</div>`;
    document.getElementById('dupBoxArea').innerHTML = `<div class="dup-box">
      ${poster}
      <div class="dup-info">
        <div class="dup-name">${esc(plainName(dup))}${dup.year ? ` <span style="font-size:14px;color:var(--muted);">${dup.year}</span>` : ''}</div>
        <div class="dup-meta">📅 ${dateStr}${dup.note ? ' · muistiinpano tallennettu' : ''}</div>
      </div>
      ${score != null ? `<div class="dup-score ${scoreClass(score)}">${score}</div>` : ''}
    </div>`;
    document.getElementById('dupModal').classList.add('open');
  });
}

window.dupChoose = function(choice){
  closeModal('dupModal');
  const r = _dupResolve;
  _dupResolve = null;
  if(r) r(choice);
};

// ── JAKSOJEN EDISTYMINEN ──
// Kuinka moni jakso on arvosteltu ja kuinka monta niitä on kaikkiaan.
// Kokonaismäärä otetaan kausilistasta, mutta jos TMDB tietää sarjassa olevan
// enemmän jaksoja kuin olet tuonut, käytetään sitä — muuten palkki näyttäisi
// täydeltä vaikka puolet kausista puuttuisi vielä kokonaan.
function episodeProgress(r){
  const eps = (r.seasons || []).flatMap(s => s.episodes || []);
  const rated = eps.filter(e => e.score != null).length;
  const total = Math.max(eps.length, r.episodes_total || 0);
  return { rated, total, pct: total ? Math.round(rated / total * 100) : 0 };
}
window.episodeProgress = episodeProgress;

// Keskiarvo vain arvostelluista jaksoista.
function ratedAvg(eps){
  const scored = (eps || []).filter(e => e.score != null);
  if(!scored.length) return null;
  return Math.round(scored.reduce((a,e) => a + e.score, 0) / scored.length);
}
window.ratedAvg = ratedAvg;

// ── PISTEYTYS ──
function getReviewScore(r){
  if(r.tvType && r.tvType!=='kokonaisuus'){
    if(r.tvType==='jaksot'){
      // Vain arvostellut jaksot lasketaan mukaan. Aiemmin myös pisteettömät
      // jaksot (esim. TMDB:stä tuodut, vielä katsomattomat) painoivat
      // keskiarvoa nollaan päin.
      const seasons = r.seasons||[];
      return ratedAvg(seasons.flatMap(s=>s.episodes||[]));
    }
    if(r.parts && r.parts.length>0){
      const sum = r.parts.reduce((a,p)=>a+(p.score||0),0);
      return Math.round((sum/r.parts.length)*10)/10;
    }
    return null;
  }
  return r.score!=null?r.score:null;
}

// ── PISTELUOKAT ──
// Rajat ovat asetus, eivät vakio. Yksi paikka päättää minkä värinen
// mikäkin luku on, jotta kortit, renkaat ja Top-lista pysyvät samassa
// linjassa myös silloin kun rajoja siirtää.
// ── PISTELUOKAT ──
// Luokkia voi olla joko kolme (oletus) tai viisi. Kolmen tila säilyy
// ennallaan, jotta vanhat asetukset ja kaikki nykyinen CSS toimivat
// muuttumatta. Viiden tilassa mukaan tulevat 'top' ja 'bottom'.
const BAND_NAMES_3 = ['high','mid','low'];
const BAND_NAMES_5 = ['top','high','mid','low','bottom'];
const BAND_DEFAULTS_3 = { high:70, mid:40 };
const BAND_DEFAULTS_5 = { c4:85, c3:70, c2:50, c1:30 };

// Suomenkieliset nimet asetusruutua ja otsikoita varten
const BAND_LABELS = {
  top:'Huippu', high:'Hyvä', mid:'Keskitaso', low:'Heikko', bottom:'Pohja'
};
window.BAND_LABELS = BAND_LABELS;

function bandNum(v, oletus){
  // HUOM: Number(null) === 0 ja Number('') === 0, joten pelkkä isFinite
  // hyväksyisi puuttuvan arvon nollaksi ja värjäisi koko listan uusiksi.
  if(v === null || v === undefined || v === '') return oletus;
  const n = Number(v);
  return isFinite(n) ? n : oletus;
}

window.bandCount = function(){
  const s = (appData.settings && appData.settings.scoreBands) || {};
  return Number(s.count) === 5 ? 5 : 3;
};

// Palauttaa { count, names, cuts } jossa cuts on laskeva raja-arvolista.
// Luokka i kattaa välin cuts[i] .. cuts[i-1]-1, ja viimeinen luokka nollaan.
function scoreBandDefs(){
  const s = (appData.settings && appData.settings.scoreBands) || {};
  if(window.bandCount() === 5){
    let c4 = bandNum(s.c4, BAND_DEFAULTS_5.c4);
    let c3 = bandNum(s.c3, BAND_DEFAULTS_5.c3);
    let c2 = bandNum(s.c2, BAND_DEFAULTS_5.c2);
    let c1 = bandNum(s.c1, BAND_DEFAULTS_5.c1);
    // Rajat pakotetaan aidosti laskeviksi ylhäältä alas, jottei yksikään
    // luokka jää nollan levyiseksi eikä järjestys mene sekaisin.
    c4 = Math.max(4, Math.min(100, Math.round(c4)));
    c3 = Math.max(3, Math.min(c4 - 1, Math.round(c3)));
    c2 = Math.max(2, Math.min(c3 - 1, Math.round(c2)));
    c1 = Math.max(1, Math.min(c2 - 1, Math.round(c1)));
    return { count:5, names:BAND_NAMES_5, cuts:[c4, c3, c2, c1] };
  }
  let high = bandNum(s.high, BAND_DEFAULTS_3.high);
  let mid  = bandNum(s.mid,  BAND_DEFAULTS_3.mid);
  high = Math.max(1, Math.min(100, Math.round(high)));
  mid  = Math.max(0, Math.min(high - 1, Math.round(mid)));
  return { count:3, names:BAND_NAMES_3, cuts:[high, mid] };
}
window.scoreBandDefs = scoreBandDefs;

// Yhteensopivuus: vanha muoto { high, mid } säilyy käytössä muualla.
function scoreBands(){
  const d = scoreBandDefs();
  if(d.count === 3) return { high:d.cuts[0], mid:d.cuts[1] };
  // Viiden tilassa palautetaan kaksi keskimmäistä rajaa, jotta vanhat
  // kutsupaikat saavat silti mielekkään lukuparin.
  return { high:d.cuts[1], mid:d.cuts[2] };
}
window.scoreBands = scoreBands;

// 'top' | 'high' | 'mid' | 'low' | 'bottom'
function scoreBand(s){
  const d = scoreBandDefs();
  for(let i = 0; i < d.cuts.length; i++){
    if(s >= d.cuts[i]) return d.names[i];
  }
  return d.names[d.names.length - 1];
}
window.scoreBand = scoreBand;

function scoreClass(s){ return 'score-' + scoreBand(s); }

// ══ JUONET ══
// plot          = näytettävä teksti
// plotSource    = 'oma' jos teksti on itse kirjoitettu; muuten TMDB:n
// plot_tmdb     = TMDB:n alkuperäinen teksti talteen, jotta sen voi palauttaa
//
// TMDB-päivitykset eivät koskaan ylikirjoita omaa tekstiä. Jos oman
// juonen tyhjentää, kenttä palautuu TMDB:n hallintaan.
function isOwnPlot(o){ return !!(o && o.plotSource === 'oma'); }
window.isOwnPlot = isOwnPlot;

// Kirjoittaa juonen kohteeseen (arvostelu tai jakso) ja hoitaa merkinnät.
// Palauttaa true jos teksti muuttui.
function setOwnPlot(o, text){
  if(!o) return false;
  const t = String(text == null ? '' : text).trim();
  const before = o.plot || '';
  if(!t){
    // Tyhjennys palauttaa TMDB:n tekstin jos sellainen on tallessa
    if(o.plot_tmdb){
      o.plot = o.plot_tmdb;
      o.plotLang = o.plot_tmdb_lang || o.plotLang || '';
      delete o.plot_tmdb;
      delete o.plot_tmdb_lang;
    } else {
      o.plot = null;
      o.plotLang = '';
    }
    delete o.plotSource;
    delete o.plotEdited;
    return (o.plot || '') !== before;
  }
  // Ensimmäinen oma muokkaus ottaa TMDB:n tekstin talteen
  if(!isOwnPlot(o) && o.plot && !o.plot_tmdb){
    o.plot_tmdb = o.plot;
    o.plot_tmdb_lang = o.plotLang || '';
  }
  o.plot = t;
  o.plotSource = 'oma';
  o.plotLang = 'fi';
  o.plotEdited = new Date().toISOString().slice(0,10);
  return t !== before;
}
window.setOwnPlot = setOwnPlot;

// Palauttaa TMDB:n alkuperäisen juonen, jos se on tallessa
function restoreTmdbPlot(o){
  if(!o || !o.plot_tmdb) return false;
  o.plot = o.plot_tmdb;
  o.plotLang = o.plot_tmdb_lang || '';
  delete o.plot_tmdb;
  delete o.plot_tmdb_lang;
  delete o.plotSource;
  delete o.plotEdited;
  return true;
}
window.restoreTmdbPlot = restoreTmdbPlot;

// Arvostelut, joilta juoni puuttuu kokonaan
function reviewsWithoutPlot(){
  return (appData.reviews || [])
    .filter(r => PLOT_CATS.includes(r.category) && !String(r.plot || '').trim())
    .sort((a,b) => plainName(a).localeCompare(plainName(b), 'fi'));
}
window.reviewsWithoutPlot = reviewsWithoutPlot;
function catType(cat){
  if(cat==='TV-sarjat') return 'tv';
  if(cat==='Ruuat') return 'ruoka';
  if(cat==='Juomat') return 'juoma';
  return 'custom';
}

