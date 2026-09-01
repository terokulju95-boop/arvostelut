// ══ ARVOSTELUT · korttien ja yläpalkin asetukset ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_CARDS = '2026-09-01.16';
// Tavallinen skripti. Ajetaan app-core.js:n JÄLKEEN.
// Sisältää neljä asiaa:
//   1. Kortin sisällön valinta (listakortti ja iso kortti erikseen)
//   2. Julisteen sijainti kortissa
//   3. Toimintopainikkeet valikon taakse
//   4. Yläpalkin logon teksti ja piilotus

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
  renderCardFieldSettings();
  renderAll();
  await window.fbSave();
};

window.resetCardFields = async function(which){
  const s = ensureSettings();
  s[which === 'read' ? 'readFields' : 'cardFields'] = {};
  renderCardFieldSettings();
  renderAll();
  await window.fbSave();
};

// ════════════════════════════════════════════════════════════
// 2. JULISTEEN SIJAINTI
// ════════════════════════════════════════════════════════════

const POSTER_POSITIONS = [
  { id:'bg',     label:'Taustalla',    hint:'Häivytettynä kortin oikeassa reunassa' },
  { id:'left',   label:'Vasemmalla',   hint:'Omana kuvanaan tekstin vieressä' },
  { id:'right',  label:'Oikealla',     hint:'Omana kuvanaan tekstin vieressä' },
  { id:'top',    label:'Yläreunassa',  hint:'Leveänä kuvana kortin päällä' },
  { id:'bottom', label:'Alareunassa',  hint:'Leveänä kuvana kortin alla' }
];

window.posterPos = function(){
  const p = ensureSettings().posterPos;
  return POSTER_POSITIONS.some(x => x.id === p) ? p : 'bg';
};

window.setPosterPos = async function(pos){
  ensureSettings().posterPos = pos;
  renderCardFieldSettings();
  renderAll();
  await window.fbSave();
};

// Palauttaa julisteen kortin osana. Taustatila on eri elementti kuin
// muut, koska se on absoluuttisesti sijoitettu häivytysmaskilla.
window.cardPosterHtml = function(r){
  if(!cf('poster') || !window.hasPoster(r)) return '';
  const pos = window.posterPos();
  if(pos === 'bg'){
    return `<div class="card-poster-bg" style="background-image:${window.posterCss(r,'w200')}"></div>`;
  }
  const size = (pos === 'top' || pos === 'bottom') ? 'w500' : 'w200';
  return `<div class="card-poster-side"><img src="${esc(window.posterUrl(r, size))}" alt="" loading="lazy"></div>`;
};

// ════════════════════════════════════════════════════════════
// 3. TOIMINTOPAINIKKEET VALIKON TAAKSE
// ════════════════════════════════════════════════════════════

window.cardActionsHidden = function(){ return !!ensureSettings().cardActionsMenu; };

window.setCardActionsMenu = async function(on){
  ensureSettings().cardActionsMenu = !!on;
  renderCardFieldSettings();
  renderAll();
  await window.fbSave();
};

window.toggleCardActions = function(id, btn){
  const el = document.getElementById('acts-' + id);
  if(!el) return;
  const open = el.style.display === 'none';
  // Vain yksi valikko auki kerrallaan, muuten pitkä lista täyttyy
  // avoimista napeista eikä vieritys pysy hallinnassa.
  document.querySelectorAll('.card-actions.is-menu').forEach(o => {
    if(o !== el) o.style.display = 'none';
  });
  document.querySelectorAll('.card-menu-btn').forEach(b => b.classList.remove('open'));
  el.style.display = open ? 'flex' : 'none';
  if(btn) btn.classList.toggle('open', open);
};

// ════════════════════════════════════════════════════════════
// 4. YLÄPALKIN LOGO
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
  renderCardFieldSettings();
  await window.fbSave();
};

window.resetLogo = async function(){
  const s = ensureSettings();
  s.logoText = LOGO_DEFAULT;
  s.logoHidden = false;
  const inp = document.getElementById('logoTextInput');
  if(inp) inp.value = LOGO_DEFAULT;
  window.applyLogo();
  renderCardFieldSettings();
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

function renderCardFieldSettings(){
  const host = document.getElementById('cardFieldsBox');
  if(!host) return;
  const s = ensureSettings();
  const which = _cfTab;
  const pos = window.posterPos();
  const hidden = window.cardActionsHidden();
  const logoTxt = (typeof s.logoText === 'string') ? s.logoText : LOGO_DEFAULT;

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
    <button type="button" class="thr-reset" onclick="resetCardFields('${which}')">↩️ Palauta oletukset</button>

    <div class="cfld-sep"></div>
    <label>Julisteen sijainti kortissa</label>
    <div class="toggle-row-sub" style="margin-bottom:10px;">Koskee vain listan korttia. Jos juliste on piilotettu yltä, tällä ei ole vaikutusta.</div>
    <div class="pos-grid">
      ${POSTER_POSITIONS.map(p => `
        <button type="button" class="pos-opt ${pos===p.id?'active':''}" onclick="setPosterPos('${p.id}')">
          <span class="pos-preview pos-preview-${p.id}"><i></i></span>
          <span class="pos-label">${esc(p.label)}</span>
        </button>`).join('')}
    </div>
    <div class="toggle-row-sub" style="margin-top:8px;">${esc((POSTER_POSITIONS.find(p=>p.id===pos)||{}).hint || '')}</div>

    <div class="cfld-sep"></div>
    <div class="toggle-row">
      <div>
        <div class="toggle-row-label">Toiminnot valikon taakse</div>
        <div class="toggle-row-sub">Muokkaa, TMDB ja Poista piiloon ⋯-napin alle. Lista pysyy siistimpänä.</div>
      </div>
      <button type="button" class="toggle-switch ${hidden?'on':''}" onclick="setCardActionsMenu(${hidden?'false':'true'})"><span></span></button>
    </div>

    <div class="cfld-sep"></div>
    <label>Yläpalkin logo</label>
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

window.renderCardFieldSettings = renderCardFieldSettings;

// Logo asetetaan heti kun asetukset ovat luettavissa.
document.addEventListener('DOMContentLoaded', () => {
  try{ window.applyLogo(); } catch(e){}
});
