// ══ ARVOSTELUT · ydin (data, apufunktiot, värit, pisteytys) ══
// Tavallinen skripti (ei moduuli): ylätason muuttujat ja funktiot
// jaetaan tiedostojen kesken globaalin skoopin kautta.
// LATAUSJÄRJESTYS ON MERKITSEVÄ — katso index.html:n loppu.

// ── DATA ──
const DEFAULT_CATS = ['Elokuvat','TV-sarjat','Ruuat','Juomat'];
const DEFAULT_GENRES = ['Toiminta','Komedia','Draama','Kauhu','Sci-fi','Trilleri','Dokumentti','Animaatio','Romantiikka','Fantasia','Seikkailu','Musiikki','Urheilu','Rikostarina','Historia','Sota','Western','Noir','Perhe','Tositapahtumat'];
let GENRES = [...DEFAULT_GENRES];
const GENRE_CATS = ['Elokuvat','TV-sarjat'];

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
let selectedMark = null;
let currentView = 'reviews';
let editingId = null;
let editingPartId = null;
let editingPartReviewId = null;
let selectedTvType = 'kokonaisuus';
let selectedScore = null;
let selectedPartScore = null;

function initApp(){
  if(!activeCat && appData.categories.length) activeCat = appData.categories[0];
  ensureSettings();
  window.applyAccent(appData.settings.accent);
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
}

// ── NÄKYMÄ ──
window.setView = function(view){
  currentView = view;
  ['reviews','top','budget'].forEach(v=>{
    const el = document.getElementById('viewTab'+v.charAt(0).toUpperCase()+v.slice(1));
    if(el) el.classList.toggle('active', v===view);
  });
  const showCats = view==='reviews';
  document.getElementById('catTabs').style.display = showCats?'':'none';
  const tb = document.querySelector('.toolbar');
  if(tb) tb.style.display = view==='reviews'?'':'none';
  // Sulje suodatinpaneeli näkymää vaihdettaessa.
  // HUOM: ei inline-tyyliä — se jäisi voimaan eikä .filter-panel.open enää avaisi paneelia.
  const fp = document.getElementById('filterPanel');
  if(fp){ fp.classList.remove('open'); fp.style.display = ''; }
  const ftb = document.getElementById('filterToggleBtn');
  if(ftb) ftb.classList.remove('active');
  renderAll();
};

window.fabClick = function(){
  if(currentView==='budget') window.budgetFabClick();
  else window.openAddModal();
};

// ── KATEGORIA TABS ──
function renderCatTabs(){
  const tabs = document.getElementById('catTabs');
  if(!tabs) return;
  tabs.innerHTML = appData.categories.map(c=>`
    <button class="cat-tab ${c===activeCat?'active':''}" onclick="setActiveCat('${escJs(c)}')">${esc(c)}</button>
  `).join('');
}

window.setActiveCat = function(cat){
  activeCat = cat;
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
  const cls = score>=70?'high':score>=40?'mid':'low';
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
  if(!appData.settings.precision) appData.settings.precision = 'normal';
  if(!appData.settings.weights) appData.settings.weights = {};
  if(appData.settings.topLimit == null) appData.settings.topLimit = 5;
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
    if(!r || !r.poster || r.posterColor) continue;
    const hex = await extractPosterColor('https://image.tmdb.org/t/p/w92' + r.poster);
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
    if(r.poster && !r.posterColor && !_pcFailed.has(r.id) && !_pcQueue.includes(r)){
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
    const poster = dup.poster
      ? `<img class="dup-poster" src="https://image.tmdb.org/t/p/w154${dup.poster}" alt="">`
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

// ── PISTEYTYS ──
function getReviewScore(r){
  if(r.tvType && r.tvType!=='kokonaisuus'){
    if(r.tvType==='jaksot'){
      // Laske kaikki jaksot kaikista kausista
      const seasons = r.seasons||[];
      const allEps = seasons.flatMap(s=>s.episodes||[]);
      if(allEps.length===0) return null;
      const sum = allEps.reduce((a,e)=>a+(e.score||0),0);
      return Math.round(sum/allEps.length);
    }
    if(r.parts && r.parts.length>0){
      const sum = r.parts.reduce((a,p)=>a+(p.score||0),0);
      return Math.round((sum/r.parts.length)*10)/10;
    }
    return null;
  }
  return r.score!=null?r.score:null;
}

function scoreClass(s){ return s>=70?'score-high':s>=40?'score-mid':'score-low'; }
function catType(cat){
  if(cat==='TV-sarjat') return 'tv';
  if(cat==='Ruuat') return 'ruoka';
  if(cat==='Juomat') return 'juoma';
  return 'custom';
}

