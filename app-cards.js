// ══ ARVOSTELUT · korttien ja yläpalkin asetukset ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_CARDS = '2026-09-04.25';
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
  { id:'recommend',  label:'Suositus',           icon:'👍' },
  { id:'rewatch',    label:'Uusintakatselu',     icon:'🔁' },
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
// Suositus ja uusintakatselu ovat oletuksena piilossa listakortissa:
// kortin merkkilapputila on rajallinen, ja molemmat näkyvät joka
// tapauksessa luku-modaalissa.
const CARD_DEFAULTS = { cast:false, country:false, tmdbScore:false, recommend:false, rewatch:false };
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
// 3. MUODOT JA MITAT
// Kortin pyöristys ja arvosanarenkaan paksuus. Molemmat asetetaan
// CSS-muuttujina, jolloin ne seuraavat kaikkia näkymiä kerralla.
// Väripaketit asettavat oman --card-radius-arvonsa, joten oma valinta
// kirjoitetaan documentElementille jotta se voittaa paketin.
// ════════════════════════════════════════════════════════════

const RADIUS_DEFAULT = null;   // null = seuraa väripakettia
const RING_DEFAULT   = 6;

window.cardRadius = function(){
  const v = ensureSettings().cardRadius;
  if(v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? Math.max(0, Math.min(28, Math.round(n))) : null;
};

window.ringWidth = function(){
  const n = Number(ensureSettings().ringWidth);
  return isFinite(n) ? Math.max(2, Math.min(14, Math.round(n))) : RING_DEFAULT;
};

window.applyShapes = function(){
  const root = document.documentElement;
  const r = window.cardRadius();
  if(r === null) root.style.removeProperty('--card-radius');
  else root.style.setProperty('--card-radius', r + 'px');
  root.style.setProperty('--ring-width', window.ringWidth() + 'px');
};

window.setCardRadius = function(val, live){
  const s = ensureSettings();
  s.cardRadius = (val === '' || val === null) ? RADIUS_DEFAULT : Number(val);
  window.applyShapes();
  // Live-tilassa vain lukuarvot päivittyvät. Koko laatikon uudelleenpiirto
  // tuhoaisi säätimen jota sormi raahaa, ja veto katkeaisi.
  renderShapeSettings(live ? 'radius' : null);
  if(live) return;
  if(window.renderSectionSummaries) window.renderSectionSummaries();
  window.fbSave();
};

window.setRingWidth = function(val, live){
  ensureSettings().ringWidth = Number(val);
  window.applyShapes();
  renderShapeSettings(live ? 'ring' : null);
  if(live) return;
  if(window.renderSectionSummaries) window.renderSectionSummaries();
  window.fbSave();
};

window.resetShapes = async function(){
  const s = ensureSettings();
  s.cardRadius = RADIUS_DEFAULT;
  s.ringWidth  = RING_DEFAULT;
  window.applyShapes();
  renderShapeSettings();
  if(window.renderSectionSummaries) window.renderSectionSummaries();
  await window.fbSave();
};

function renderShapeSettings(liveKey){
  const host = document.getElementById('shapeBox');
  if(!host) return;
  const r = window.cardRadius();
  const w = window.ringWidth();

  // Raahauksen aikana päivitetään vain näkyvät luvut ja huomautus.
  if(liveKey && host.querySelector('#shapeRadiusVal')){
    const rv = host.querySelector('#shapeRadiusVal');
    const wv = host.querySelector('#shapeRingVal');
    const note = host.querySelector('#shapeRadiusNote');
    if(rv) rv.textContent = (r === null ? '—' : r + 'px');
    if(wv) wv.textContent = w + 'px';
    if(note) note.textContent = (r === null ? 'Seuraa väripakettia' : 'Oma valinta');
    return;
  }

  // Väripaketin oma arvo näytetään kun omaa valintaa ei ole tehty
  const packR = getComputedStyle(document.documentElement)
    .getPropertyValue('--card-radius').trim() || '14px';

  host.innerHTML = `
    <div class="thr-row">
      <span class="thr-label">⬜ Kortin pyöristys</span>
      <input type="range" class="thr-slider" min="0" max="28" step="1" value="${r === null ? parseInt(packR, 10) || 14 : r}"
        oninput="setCardRadius(this.value, true)" onchange="setCardRadius(this.value, false)">
      <span class="thr-val" id="shapeRadiusVal">${r === null ? packR : r + 'px'}</span>
    </div>
    <div class="shape-prev">
      <span class="shape-prev-card" style="border-radius:var(--card-radius);"></span>
      <span class="shape-prev-note" id="shapeRadiusNote">${r === null ? 'Seuraa väripakettia' : 'Oma valinta'}</span>
    </div>

    <div class="thr-row" style="margin-top:14px;">
      <span class="thr-label">⭕ Renkaan paksuus</span>
      <input type="range" class="thr-slider" min="2" max="14" step="1" value="${w}"
        oninput="setRingWidth(this.value, true)" onchange="setRingWidth(this.value, false)">
      <span class="thr-val" id="shapeRingVal">${w}px</span>
    </div>
    <div class="shape-prev">
      <svg width="54" height="54" viewBox="0 0 88 88" style="transform:rotate(-90deg);">
        <circle class="score-ring-bg" cx="44" cy="44" r="38"/>
        <circle class="score-ring-fill high" cx="44" cy="44" r="38"
          stroke-dasharray="238.8" stroke-dashoffset="60"/>
      </svg>
      <span class="shape-prev-note">Esikatselu</span>
    </div>

    <button type="button" class="thr-reset" onclick="resetShapes()">↩️ Palauta oletukset</button>`;
}
window.renderShapeSettings = renderShapeSettings;

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
  renderShapeSettings();
  renderLogoSettings();
  if(window.renderSectionSummaries) window.renderSectionSummaries();
};

window.renderCardFieldSettings = renderCardFieldSettings;

// Logo asetetaan heti kun asetukset ovat luettavissa.
document.addEventListener('DOMContentLoaded', () => {
  try{ window.applyLogo(); } catch(e){}
  try{ window.applyShapes(); } catch(e){}
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
  const defs = (typeof scoreBandDefs === 'function') ? scoreBandDefs() : { count:3, cuts:[70,40] };

  return {
    teema:        modeName,
    paketti:      packName,
    korostus:     '',
    julistevari:  s.posterColors === false ? 'pois' : 'käytössä',
    filmiraita:   s.filmstrip ? 'käytössä' : 'pois',
    logo:         s.logoHidden ? 'piilotettu' : ((s.logoText || LOGO_DEFAULT).trim()),
    kortinkentat: (hiddenCard || hiddenRead)
                    ? `${hiddenCard} + ${hiddenRead} piilotettu`
                    : 'kaikki näkyvissä',
    julistepaikka: posLabel,
    muodot:       `${window.cardRadius() === null ? 'paketin mukaan' : window.cardRadius() + 'px'} · rengas ${window.ringWidth()}px`,
    kenttajarj:   (s.formOrder && s.formOrder.length) ? 'muokattu' : 'oletus',
    kategoriat:   `${cats} kpl`,
    genret:       `${gens} kpl`,
    alalajit:     subs ? `${subs} kpl` : 'ei yhtään',
    rajat:        `${window.bandCount()} luokkaa · ${defs.cuts.join(' / ')}`,
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

// ════════════════════════════════════════════════════════════
// 6. PÄIVITYKSEN TARKISTUSLISTA
// Uudet asetukset jäävät helposti huomaamatta, koska mikään ei kerro
// niistä. Kun versioleima muuttuu, näytetään kerran lyhyt lista siitä
// mitä on tullut lisää ja mistä kukin löytyy. Lista kuitataan luetuksi
// paikallisesti, joten se ei palaa laitteessa uudelleen.
// ════════════════════════════════════════════════════════════

const SEEN_BUILD_KEY = 'arvostelut_seenBuild';

// Uusimmat ensin. tab = mille asetusvälilehdelle vie, sec = mikä osio avataan.
// HUOM: nämä versionumerot EIVÄT ole tiedoston versioleima vaan viittaus
// siihen julkaisuun jossa ominaisuus tuli. Älä korvaa niitä massahaulla
// kun leimoja päivitetään — lista rikkoutuu.
const WHATS_NEW = [
  { build:'2026-09-04.25', items:[
    { icon:'🎚️', title:'Pisteiden pikamuokkaus',
      text:'Uusi näkymä ylhäältä: elokuvat pelkkänä nimi- ja pistelistana parhaasta huonoimpaan. Pistettä voi muuttaa suoraan listassa avaamatta muokkausta, ja rivi siirtyy heti uuteen kohtaansa.',
      view:'quick' }
  ]},
  { build:'2026-09-02.23', items:[
    { icon:'👍', title:'Suosittelisitko ja katsoisitko uudelleen',
      text:'Kaksi uutta kenttää lomakkeelle. Molemmat ovat vapaaehtoisia: napauta valittua uudelleen jos haluat tyhjentää sen.',
      tab:'kortit', sec:'kortinkentat' },
    { icon:'🎞️', title:'Filmiraita reunoissa',
      text:'Rei\'itetty filminauha ruudun molempiin reunoihin. Löytyy Ulkoasu-välilehdeltä.',
      tab:'ulkoasu', sec:'filmiraita' },
    { icon:'⏱️', title:'Löydä: lyhyt ensimmäinen kausi',
      text:'Uusi haku etsii sarjoja joiden ensimmäinen kausi on lyhyt, eli kokeilu ei vie montaa iltaa.',
      view:'discover' }
  ]},
  { build:'2026-09-01.21', items:[
    { icon:'📐', title:'Kortin pyöristys ja renkaan paksuus',
      text:'Kortin kulmat ja arvosanarenkaan viivan paksuus säätyvät liukusäätimillä.',
      tab:'kortit', sec:'muodot' },
    { icon:'🚦', title:'Viisi pisteluokkaa kolmen sijaan',
      text:'Voit jakaa asteikon viiteen portaaseen. Lisävärit johdetaan nykyisestä teemasta.',
      tab:'pisteet', sec:'rajat' },
    { icon:'🩹', title:'Datan tarkistus ja korjaukset',
      text:'Sovellus etsii rikkinäisiä kenttiä ja kirjoitusvirheitä. Mitään ei muuteta ilman hyväksyntääsi.',
      tab:'data', sec:'korjaukset' },
    { icon:'📚', title:'Löydä: pitkät sarjat',
      text:'Uusi haku Löydä-näkymässä etsii pitkiä sarjoja joita et ole aloittanut.',
      view:'discover' }
  ]},
  { build:'2026-09-01.20', items:[
    { icon:'🗂️', title:'Asetukset jaettu kuudelle välilehdelle',
      text:'Kaikki välilehdet mahtuvat riville, ja jokainen osio avautuu napista.',
      tab:'ulkoasu' }
  ]}
];

// Aivan uudella asennuksella listaa ei näytetä — silloin kaikki on uutta
// eikä lista kertoisi mitään. Vanha asennus tunnistetaan siitä että
// sovellus on jättänyt laitteeseen muita jälkiä tai pilvessä on arvosteluja.
// Tämä on olennaista: ilman sitä päivittävä käyttäjä ei näkisi listaa
// koskaan, koska hänelläkään ei ole vielä kuittausmerkintää.
function looksLikeExistingInstall(){
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith('arvostelut_') && k !== SEEN_BUILD_KEY) return true;
    }
  } catch(e){}
  return !!(appData && Array.isArray(appData.reviews) && appData.reviews.length);
}

function newSinceSeen(){
  let seen = '';
  try{ seen = localStorage.getItem(SEEN_BUILD_KEY) || ''; } catch(e){}
  const cur = window.BUILD_CARDS || '';
  if(!cur) return [];
  if(seen === cur) return [];

  if(!seen){
    if(!looksLikeExistingInstall()) return [];
    // Vanha asennus ilman kuittausta: näytetään kaikki tiedossa olevat
    return WHATS_NEW.flatMap(e => e.items);
  }

  const out = [];
  for(const entry of WHATS_NEW){
    if(entry.build <= seen) break;
    out.push(...entry.items);
  }
  return out;
}

window.hasUnseenNews = function(){
  try{ return newSinceSeen().length > 0; } catch(e){ return false; }
};

// Merkkipiste asetusnapin kulmaan, jotta listan olemassaolon huomaa
// ilman että asetuksiin tarvitsee eksyä sattumalta.
window.updateNewsBadge = function(){
  const btn = document.querySelector('.settings-btn');
  if(!btn) return;
  const has = window.hasUnseenNews();
  let dot = btn.querySelector('.settings-dot');
  if(has && !dot){
    dot = document.createElement('span');
    dot.className = 'settings-dot';
    btn.appendChild(dot);
  } else if(!has && dot){
    dot.remove();
  }
};

// Listan voi avata uudelleen milloin tahansa, myös kuittauksen jälkeen.
window.showAllNews = function(){
  try{ localStorage.removeItem(SEEN_BUILD_KEY); } catch(e){}
  window.renderWhatsNew(true);
  window.updateNewsBadge();
  const box = document.getElementById('whatsNewBox');
  if(box){ try{ box.scrollIntoView({ block:'nearest', behavior:'smooth' }); } catch(e){} }
};

window.markBuildSeen = function(){
  try{ localStorage.setItem(SEEN_BUILD_KEY, window.BUILD_CARDS || ''); } catch(e){}
  const box = document.getElementById('whatsNewBox');
  if(box) box.remove();
  window.updateNewsBadge();
};

window.openWhatsNewTarget = function(tab, sec, view){
  window.markBuildSeen();
  if(view){
    window.closeModal('settingsModal');
    window.setView(view);
    return;
  }
  if(!document.getElementById('settingsModal').classList.contains('open')){
    if(window.openSettings) window.openSettings();
  }
  if(tab) window.setSettingsTab(tab);
  if(sec) setTimeout(() => window.toggleSetSec(sec), 60);
};

// Palkki asetusten yläreunaan, heti versiovaroituksen alle.
window.renderWhatsNew = function(force){
  const items = force ? WHATS_NEW.flatMap(e => e.items) : newSinceSeen();
  const old = document.getElementById('whatsNewBox');
  if(old) old.remove();
  if(!items.length) return;

  const warn = document.getElementById('buildWarning');
  if(!warn || !warn.parentNode) return;

  const box = document.createElement('div');
  box.id = 'whatsNewBox';
  box.className = 'whats-new';
  box.innerHTML = `
    <div class="wn-head">
      <span class="wn-title">✨ Uutta tässä versiossa</span>
      <button type="button" class="wn-close" onclick="markBuildSeen()" aria-label="Kuittaa luetuksi">✕</button>
    </div>
    <div class="wn-sub">${items.length} ${items.length === 1 ? 'uusi asia' : 'uutta asiaa'} · napauta siirtyäksesi</div>
    ${items.map(i => `
      <button type="button" class="wn-item" onclick="openWhatsNewTarget(${i.tab ? `'${i.tab}'` : 'null'},${i.sec ? `'${i.sec}'` : 'null'},${i.view ? `'${i.view}'` : 'null'})">
        <span class="wn-icon">${i.icon}</span>
        <span class="wn-text">
          <strong>${esc(i.title)}</strong>
          <span>${esc(i.text)}</span>
        </span>
        <span class="wn-arrow">›</span>
      </button>`).join('')}
    <button type="button" class="wn-done" onclick="markBuildSeen()">Selvä, kuittaa luetuksi</button>`;
  warn.parentNode.insertBefore(box, warn.nextSibling);
};

// Versioleima merkitään nähdyksi vasta kun lista on kuitattu käsin.
// Merkkipiste asetusnapissa kertoo että luettavaa on.
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { try{ window.updateNewsBadge(); } catch(e){} }, 400);
});
