// ══ ARVOSTELUT · korttien ja yläpalkin asetukset ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_CARDS = '2026-09-01.20';
// Tavallinen skripti. Ajetaan app-core.js:n JÄLKEEN.
// Sisältää neljä asiaa:
//   1. Kortin sisällön valinta (listakortti ja iso kortti erikseen)
//   2. Julisteen sijainti kortissa
//   3. Yläpalkin logon teksti ja piilotus

// ════════════════════════════════════════════════════════════
// 1. KENTTÄREKISTERI
// Yksi lista molemmille näkymille, jotta asetusruutu ja renderöinti
// pysyvät varmasti synkassa. `only` rajaa kentän niihin näkymiin
// joissa se ylipäätään esiintyy.
// ════════════════════════════════════════════════════════════

const CARD_FIELDS = [
  { id:'poster',     label:'Juliste',            icon:'🖼️' },
  { id:'year',       label:'Julkaisuvuosi',      icon:'📆' },
  { id:'score',      label:'Arvosanarengas',     icon:'⭐' },
  { id:'category',   label:'Kategoria',          icon:'📁' },
  { id:'subcat',     label:'Alalaji',            icon:'📂' },
  { id:'genre',      label:'Genret',             icon:'🏷️' },
  { id:'tvtype',     label:'Arvostelutapa',      icon:'📺' },
  { id:'status',     label:'Tuotantotila',       icon:'📡' },
  { id:'mark',       label:'Suosikki/huono',     icon:'❤️' },
  { id:'director',   label:'Ohjaaja',            icon:'🎬' },
  { id:'cast',       label:'Näyttelijät',        icon:'🎭' },
  { id:'runtime',    label:'Kesto',              icon:'⏱️' },
  { id:'episodes',   label:'Jaksomäärä',         icon:'🔢' },
  { id:'country',    label:'Maa',                icon:'🌍' },
  { id:'tmdbScore',  label:'TMDB-arvosana',      icon:'🌟' },
  { id:'plot',       label:'Juoni',              icon:'📖' },
  { id:'note',       label:'Arvostelu',          icon:'💭' },
  { id:'parts',      label:'Kaudet ja jaksot',   icon:'🎞️' },
  { id:'date',       label:'Päivämäärä',         icon:'📅' }
];

// Listakortti on tiivis, joten siitä on oletuksena piilotettu ne kentät
// jotka näkyvät kuitenkin isossa kortissa.
const CARD_DEFAULTS = { cast:false, country:false, tmdbScore:false };
const READ_DEFAULTS = {};

function fieldsFor(which){
  const s = ensureSettings();
  const key = which === 'read' ? 'readFields' : 'cardFields';
  if(!s[key] || typeof s[key] !== 'object') s[key] = {};
  return s[key];
}

// Kentän näkyvyys. Puuttuva arvo tarkoittaa oletusta, ei piilotusta —
// näin uudet kentät ilmestyvät automaattisesti myös vanhoille asetuksille.
window.cardField = function(which, id){
  const saved = fieldsFor(which)[id];
  if(typeof saved === 'boolean') return saved;
  const def = which === 'read' ? READ_DEFAULTS : CARD_DEFAULTS;
  return def[id] !== undefined ? def[id] : true;
};

// Huom: naita EI saa esitella const:lla. app-core.js on jo asettanut
// window.cf ja window.rf, ja lexical-sidonta varjostaisi ne kaikissa
// tiedostoissa — jolloin puuttuva app-cards.js rikkoisi koko listan.
window.cf = id => window.cardField('card', id);
window.rf = id => window.cardField('read', id);
const cf = window.cf, rf = window.rf;

window.setCardField = async function(which, id, on){
  fieldsFor(which)[id] = !!on;
  window.renderCardSettings();
  renderAll();
  await window.fbSave();
};

window.resetCardFields = async function(which){
  const s = ensureSettings();
  s[which === 'read' ? 'readFields' : 'cardFields'] = {};
  window.renderCardSettings();
  renderAll();
  await window.fbSave();
};

// ════════════════════════════════════════════════════════════
// 2. JULISTEEN SIJAINTI
// ════════════════════════════════════════════════════════════

// Juliste on AINA kortin taustana ja häivytetty tekstin alta pois.
// Valinta koskee vain sitä mihin reunaan tausta asettuu. Erillistä
// kuvaa tekstin vieressä ei tehdä — se rikkoo kortin ilmeen.
const POSTER_POSITIONS = [
  { id:'right',  label:'Oikea',      hint:'Juliste kortin oikeassa reunassa, häivytettynä vasemmalle' },
  { id:'left',   label:'Vasen',      hint:'Juliste kortin vasemmassa reunassa, häivytettynä oikealle' },
  { id:'top',    label:'Ylä',        hint:'Juliste kortin yläreunassa, häivytettynä alaspäin' },
  { id:'bottom', label:'Ala',        hint:'Juliste kortin alareunassa, häivytettynä ylöspäin' },
  { id:'full',   label:'Koko kortti',hint:'Juliste täyttää koko kortin pohjan vaimennettuna' }
];

window.posterPos = function(){
  const p = ensureSettings().posterPos;
  // Vanha 'bg' tarkoitti oikeaa reunaa. Migraatio ilman erillistä askelta.
  if(p === 'bg' || p == null) return 'right';
  return POSTER_POSITIONS.some(x => x.id === p) ? p : 'right';
};

window.setPosterPos = async function(pos){
  ensureSettings().posterPos = pos;
  window.renderCardSettings();
  renderAll();
  await window.fbSave();
};

// Palauttaa julisteen kortin osana. Taustatila on eri elementti kuin
// muut, koska se on absoluuttisesti sijoitettu häivytysmaskilla.
window.cardPosterHtml = function(r){
  if(!cf('poster') || !window.hasPoster(r)) return '';
  const pos = window.posterPos();
  // Vaaka-asennoissa tarvitaan leveämpi lähde, jottei kuva vetisty.
  const size = (pos === 'top' || pos === 'bottom' || pos === 'full') ? 'w342' : 'w200';
  return `<div class="card-poster-bg" style="background-image:${window.posterCss(r, size)}"></div>`;
};

// ════════════════════════════════════════════════════════════
// 3. YLÄPALKIN LOGO
// ════════════════════════════════════════════════════════════

const LOGO_DEFAULT = '★ ARVOSTELUT';

window.applyLogo = function(){
  const el = document.getElementById('appLogo');
  if(!el) return;
  const s = ensureSettings();
  if(s.logoHidden){ el.style.display = 'none'; return; }
  el.style.display = '';
  const txt = (typeof s.logoText === 'string' && s.logoText.trim()) ? s.logoText : LOGO_DEFAULT;
  // Ensimmäinen sana omaan elementtiinsä, jotta nykyinen tyyli säilyy:
  // symboli on isompi ja nimi omassa span-elementissään.
  const parts = txt.trim().split(/\s+/);
  if(parts.length > 1){
    el.innerHTML = `${esc(parts[0])} <span>${esc(parts.slice(1).join(' '))}</span>`;
  } else {
    el.innerHTML = `<span>${esc(txt)}</span>`;
  }
};

window.onLogoTextInput = function(val){
  ensureSettings().logoText = val;
  window.applyLogo();
};

window.commitLogoText = async function(){
  await window.fbSave();
};

window.setLogoHidden = async function(on){
  ensureSettings().logoHidden = !!on;
  window.applyLogo();
  window.renderCardSettings();
  await window.fbSave();
};

window.resetLogo = async function(){
  const s = ensureSettings();
  s.logoText = LOGO_DEFAULT;
  s.logoHidden = false;
  const inp = document.getElementById('logoTextInput');
  if(inp) inp.value = LOGO_DEFAULT;
  window.applyLogo();
  window.renderCardSettings();
  await window.fbSave();
};

// ════════════════════════════════════════════════════════════
// ASETUSNÄKYMÄ
// ════════════════════════════════════════════════════════════

let _cfTab = 'card';

window.setCardFieldTab = function(tab){
  _cfTab = tab;
  renderCardFieldSettings();
};

function fieldToggleRow(which, f){
  const on = window.cardField(which, f.id);
  return `<button type="button" class="cfld ${on ? 'on' : ''}"
      onclick="setCardField('${which}','${f.id}',${on ? 'false' : 'true'})">
    <span class="cfld-icon">${f.icon}</span>
    <span class="cfld-label">${esc(f.label)}</span>
    <span class="cfld-state">${on ? '👁️' : '🚫'}</span>
  </button>`;
}

// Kolme erillistä hosttia, koska ne asuvat nyt eri asetusosioissa:
// näkyvät tiedot ja julisteen sijainti Kortit-välilehdellä, logo Ulkoasussa.
function renderCardFieldSettings(){
  const host = document.getElementById('cardFieldsBox');
  if(!host) return;
  const which = _cfTab;
  host.innerHTML = `
    <div class="cfld-tabs">
      <button type="button" class="cfld-tab ${which==='card'?'active':''}" onclick="setCardFieldTab('card')">Kortti listassa</button>
      <button type="button" class="cfld-tab ${which==='read'?'active':''}" onclick="setCardFieldTab('read')">Iso kortti</button>
    </div>
    <div class="toggle-row-sub" style="margin:0 0 10px;">
      ${which==='card'
        ? 'Mitä näkyy listan kortissa. Piilotetut tiedot löytyvät edelleen isosta kortista.'
        : 'Mitä näkyy kun korttia painaa kahdesti. Tänne kannattaa jättää enemmän kuin listakorttiin.'}
    </div>
    <div class="cfld-grid">${CARD_FIELDS.map(f => fieldToggleRow(which, f)).join('')}</div>
    <button type="button" class="thr-reset" onclick="resetCardFields('${which}')">↩️ Palauta oletukset</button>`;
}

function renderPosterPosSettings(){
  const host = document.getElementById('posterPosBox');
  if(!host) return;
  const pos = window.posterPos();
  host.innerHTML = `
    <div class="toggle-row-sub" style="margin-bottom:10px;">Juliste on aina kortin taustana ja häivytetty tekstin alta pois. Tämä valitsee vain reunan. Jos juliste on piilotettu Näkyvät tiedot -osiosta, valinnalla ei ole vaikutusta.</div>
    <div class="pos-grid">
      ${POSTER_POSITIONS.map(p => `
        <button type="button" class="pos-opt ${pos===p.id?'active':''}" onclick="setPosterPos('${p.id}')">
          <span class="pos-preview pos-preview-${p.id}"><i></i><b></b></span>
          <span class="pos-label">${esc(p.label)}</span>
        </button>`).join('')}
    </div>
    <div class="toggle-row-sub" style="margin-top:8px;">${esc((POSTER_POSITIONS.find(p=>p.id===pos)||{}).hint || '')}</div>`;
}

function renderLogoSettings(){
  const host = document.getElementById('logoBox');
  if(!host) return;
  const s = ensureSettings();
  const logoTxt = (typeof s.logoText === 'string') ? s.logoText : LOGO_DEFAULT;
  host.innerHTML = `
    <input type="text" id="logoTextInput" maxlength="40" value="${esc(logoTxt)}"
      placeholder="${esc(LOGO_DEFAULT)}"
      oninput="onLogoTextInput(this.value)" onchange="commitLogoText()"
      ${s.logoHidden ? 'disabled' : ''}>
    <div class="toggle-row-sub" style="margin-top:6px;">Ensimmäinen sana näkyy isompana. Viiden napautuksen pikkuyllätys toimii edelleen.</div>
    <div class="toggle-row" style="margin-top:12px;">
      <div>
        <div class="toggle-row-label">Piilota logo kokonaan</div>
        <div class="toggle-row-sub">Yläpalkkiin jää vain asetusnappi.</div>
      </div>
      <button type="button" class="toggle-switch ${s.logoHidden?'on':''}" onclick="setLogoHidden(${s.logoHidden?'false':'true'})"><span></span></button>
    </div>
    <button type="button" class="thr-reset" onclick="resetLogo()">↩️ Palauta oletuslogo</button>`;
}

// Yhteinen päivitys: kaikki kolme osiota kerralla.
window.renderCardSettings = function(){
  renderCardFieldSettings();
  renderPosterPosSettings();
  renderLogoSettings();
  if(window.renderSectionSummaries) window.renderSectionSummaries();
};

window.renderCardFieldSettings = renderCardFieldSettings;

// Logo asetetaan heti kun asetukset ovat luettavissa.
document.addEventListener('DOMContentLoaded', () => {
  try{ window.applyLogo(); } catch(e){}
});

// ════════════════════════════════════════════════════════════
// 4. ASETUSTEN HAITARIOSIOT
// Jokainen asetusosio on napin takana ja suljettu aina kun asetukset
// avataan. Näin pitkät listat — kategoriat, genret, kysymykset — eivät
// täytä näkymää heti, ja välilehti pysyy silmäiltävän mittaisena.
// Kerrallaan auki on vain yksi osio, jolloin vieritettävää ei kerry.
// ════════════════════════════════════════════════════════════

window.toggleSetSec = function(id){
  const sec = document.querySelector(`.set-sec[data-sec="${id}"]`);
  if(!sec) return;
  const body = document.getElementById('sec-' + id);
  const head = sec.querySelector('.set-sec-head');
  const opening = body.hasAttribute('hidden');

  // Saman välilehden muut osiot kiinni
  const pane = sec.closest('.settings-pane');
  if(pane){
    pane.querySelectorAll('.set-sec').forEach(o => {
      if(o === sec) return;
      const b = o.querySelector('.set-sec-body');
      const h = o.querySelector('.set-sec-head');
      if(b) b.setAttribute('hidden', '');
      if(h) h.setAttribute('aria-expanded', 'false');
      o.classList.remove('open');
    });
  }

  if(opening) body.removeAttribute('hidden');
  else body.setAttribute('hidden', '');
  head.setAttribute('aria-expanded', opening ? 'true' : 'false');
  sec.classList.toggle('open', opening);

  // Avattu osio näkyviin, jottei se jää ruudun alalaidan taakse
  if(opening){
    requestAnimationFrame(() => {
      try{ head.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(e){}
    });
  }
};

window.closeAllSetSecs = function(){
  document.querySelectorAll('#settingsModal .set-sec').forEach(o => {
    const b = o.querySelector('.set-sec-body');
    const h = o.querySelector('.set-sec-head');
    if(b) b.setAttribute('hidden', '');
    if(h) h.setAttribute('aria-expanded', 'false');
    o.classList.remove('open');
  });
};

// Otsikkorivin tiivistelmä: kertoo osion tilan avaamatta sitä.
function sectionSummaries(){
  const s = ensureSettings();
  const cats = (appData.categories || []).length;
  const gens = (appData.genres || []).length;
  const subs = Object.values(ensureSubcats() || {})
    .reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0);
  const hiddenCard = CARD_FIELDS.filter(f => !window.cardField('card', f.id)).length;
  const hiddenRead = CARD_FIELDS.filter(f => !window.cardField('read', f.id)).length;
  const posLabel = (POSTER_POSITIONS.find(p => p.id === window.posterPos()) || {}).label || '';
  const noPlot = (appData.reviews || [])
    .filter(r => PLOT_CATS.includes(r.category) && !r.plot).length;

  const modeName = ((window.THEME_MODES || []).find(m => m.id === (s.themeMode || 'dark')) || {}).name || '';
  const packName = ((window.THEME_PACKS || []).find(x => x.id === (s.themePack || 'perus')) || {}).name || '';
  const bands = (typeof scoreBands === 'function') ? scoreBands() : { high:70, mid:40 };

  return {
    teema:        modeName,
    paketti:      packName,
    korostus:     '',
    julistevari:  s.posterColors === false ? 'pois' : 'käytössä',
    logo:         s.logoHidden ? 'piilotettu' : ((s.logoText || LOGO_DEFAULT).trim()),
    kortinkentat: (hiddenCard || hiddenRead)
                    ? `${hiddenCard} + ${hiddenRead} piilotettu`
                    : 'kaikki näkyvissä',
    julistepaikka: posLabel,
    kenttajarj:   (s.formOrder && s.formOrder.length) ? 'muokattu' : 'oletus',
    kategoriat:   `${cats} kpl`,
    genret:       `${gens} kpl`,
    alalajit:     subs ? `${subs} kpl` : 'ei yhtään',
    rajat:        `${bands.mid}–${bands.high}`,
    tunnus:       (s.tmdbToken || '').trim() ? 'oma tunnus' : 'oletus',
    juonet:       noPlot ? `${noPlot} puuttuu` : 'ei puutu',
    kaannokset:   s.translatePlots ? 'juonet mukana' : 'juonet pois',
    testitila:    window._sandbox ? 'PÄÄLLÄ' : 'pois'
  };
}

window.renderSectionSummaries = function(){
  let sums = {};
  try{ sums = sectionSummaries(); } catch(e){ return; }
  Object.keys(sums).forEach(id => {
    const el = document.getElementById('sum-' + id);
    if(el) el.textContent = sums[id] ? ' · ' + sums[id] : '';
  });
};
