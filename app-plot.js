// ══ ARVOSTELUT · juonten muokkaus ══
window.BUILD_PLOT = '2026-09-01.16';
//
// TMDB tuo juonet automaattisesti, mutta kaikkiin teoksiin niitä ei löydy.
// Tässä tiedostossa juonen voi kirjoittaa itse. Ydinsääntö: itse kirjoitettua
// tekstiä ei koskaan ylikirjoiteta TMDB:n päivityksellä. Merkinnät ja
// palautuslogiikka ovat app-core.js:ssä (setOwnPlot, restoreTmdbPlot).

// ════════════════════════════════════════════════════════════
// 1. LOMAKKEEN JUONIKENTTÄ
// ════════════════════════════════════════════════════════════

// Muokataanko juonta juuri nyt lomakkeella. TMDB-tuonti kunnioittaa tätä.
let formPlotOwn = false;
let formPlotTmdb = null;      // TMDB:n teksti talteen palautusta varten
let formPlotTmdbLang = '';

window.resetFormPlot = function(r){
  const ta = document.getElementById('formPlot');
  if(!ta) return;
  ta.value = (r && r.plot) || '';
  formPlotOwn = isOwnPlot(r);
  formPlotTmdb = (r && r.plot_tmdb) || null;
  formPlotTmdbLang = (r && r.plot_tmdb_lang) || '';
  window.updatePlotSectionVisibility();
};

window.updatePlotSectionVisibility = function(){
  const sec = document.getElementById('plotSection');
  if(!sec) return;
  const cat = document.getElementById('formCat')?.value || '';
  sec.style.display = PLOT_CATS.includes(cat) ? 'block' : 'none';
  window.renderPlotMeta();
};

// TMDB-haku täyttää kentän vain jos siinä ei ole omaa tekstiä
window.fillFormPlotFromTmdb = function(text){
  const ta = document.getElementById('formPlot');
  if(!ta) return;
  if(formPlotOwn && ta.value.trim()){
    // Oma teksti säilyy, TMDB:n versio menee talteen
    formPlotTmdb = text || formPlotTmdb;
    window.renderPlotMeta();
    return;
  }
  ta.value = text || '';
  formPlotOwn = false;
  window.renderPlotMeta();
};

window.onPlotInput = function(){
  const ta = document.getElementById('formPlot');
  if(!ta) return;
  // Käsin kirjoitettu teksti merkitään omaksi heti ensimmäisestä näppäimestä
  formPlotOwn = !!ta.value.trim();
  window.renderPlotMeta();
};

window.restoreFormPlot = function(){
  const ta = document.getElementById('formPlot');
  if(!ta || !formPlotTmdb) return;
  ta.value = formPlotTmdb;
  formPlotOwn = false;
  window.renderPlotMeta();
};

function plotMetaHtml(text, own, tmdbBackup){
  const n = String(text || '').trim().length;
  const badge = !n
    ? '<span class="plot-badge none">EI JUONTA</span>'
    : (own ? '<span class="plot-badge own">OMA</span>'
           : '<span class="plot-badge tmdb">TMDB</span>');
  const info = !n
    ? 'Kirjoita juoni itse, jos TMDB:stä ei löytynyt.'
    : (own ? 'Oma teksti. TMDB-päivitykset eivät ylikirjoita tätä.'
           : 'Tuotu TMDB:stä. Muokkaus tekee siitä oman.');
  const restore = (own && tmdbBackup)
    ? '<button type="button" class="plot-restore" onclick="restoreFormPlot()">↩️ Palauta TMDB:n juoni</button>'
    : '';
  return `${badge}<span>${n} merkkiä</span><span>·</span><span>${info}</span>${restore}`;
}

window.renderPlotMeta = function(){
  const el = document.getElementById('plotMeta');
  const ta = document.getElementById('formPlot');
  if(!el || !ta) return;
  el.innerHTML = plotMetaHtml(ta.value, formPlotOwn, formPlotTmdb);
};

// Kutsutaan tallennuksesta. Kirjoittaa juonen arvosteluun oikein merkittynä.
window.applyFormPlot = function(r){
  const ta = document.getElementById('formPlot');
  const cat = document.getElementById('formCat')?.value || '';
  if(!ta || !PLOT_CATS.includes(cat)) return;
  const t = ta.value.trim();

  if(!t){
    // Tyhjennys: setOwnPlot palauttaa TMDB:n tekstin jos se on tallessa
    if(formPlotTmdb && !r.plot_tmdb){ r.plot_tmdb = formPlotTmdb; r.plot_tmdb_lang = formPlotTmdbLang; }
    setOwnPlot(r, '');
    return;
  }
  if(formPlotOwn){
    if(formPlotTmdb && !r.plot_tmdb){ r.plot_tmdb = formPlotTmdb; r.plot_tmdb_lang = formPlotTmdbLang; }
    setOwnPlot(r, t);
  } else {
    // TMDB:n teksti sellaisenaan — ei omaksi merkintää
    r.plot = t;
    delete r.plotSource;
    delete r.plotEdited;
  }
};

// ════════════════════════════════════════════════════════════
// 2. JUONIMODAALI
// Avautuu lukunäkymästä ja asetusten puuttuvien juonten listasta.
// ════════════════════════════════════════════════════════════

let plotEditId = null;
let plotQueue = null;      // taulukko id:itä kun käydään puuttuvia läpi
let plotQueueIdx = 0;
let plotQueueDone = 0;

window.openPlotEditor = function(reviewId, queue){
  const r = (appData.reviews || []).find(x => x.id === reviewId);
  if(!r) return;
  plotEditId = reviewId;
  if(queue !== undefined) plotQueue = queue;

  document.getElementById('plotModalName').innerHTML =
    `${esc(plainName(r))}<span>${esc(r.category)}${r.year ? ' · ' + r.year : ''}${subcatOf(r) ? ' · ' + esc(subcatOf(r)) : ''}</span>`;
  const ta = document.getElementById('plotModalText');
  ta.value = r.plot || '';
  window.onPlotModalInput();
  renderPlotQueueBar();
  window.openModalOnTop('plotModal');
};

window.onPlotModalInput = function(){
  const r = (appData.reviews || []).find(x => x.id === plotEditId);
  const ta = document.getElementById('plotModalText');
  const el = document.getElementById('plotModalMeta');
  if(!ta || !el || !r) return;
  const t = ta.value.trim();
  const orig = String(r.plot || '').trim();
  // Muuttunut teksti on aina omaa; muuttumaton säilyttää alkuperäisen lähteen
  const own = t ? (t !== orig ? true : isOwnPlot(r)) : false;
  el.innerHTML = plotMetaHtml(t, own, r.plot_tmdb || null);
};

window.restorePlotModal = function(){
  const r = (appData.reviews || []).find(x => x.id === plotEditId);
  if(!r || !r.plot_tmdb) return;
  document.getElementById('plotModalText').value = r.plot_tmdb;
  window.onPlotModalInput();
};

window.savePlotModal = async function(){
  const r = (appData.reviews || []).find(x => x.id === plotEditId);
  const ta = document.getElementById('plotModalText');
  if(!r || !ta) return;
  const t = ta.value.trim();
  const orig = String(r.plot || '').trim();

  if(t && t === orig){
    // Ei muutosta — ei myöskään turhaa tallennusta
    if(plotQueue) return window.plotQueueNext();
    closeModal('plotModal');
    return;
  }
  setOwnPlot(r, t);
  if(t) plotQueueDone++;

  if(window.renderAll) renderAll();
  await window.fbSave();
  window.renderMissingPlots();

  if(plotQueue) return window.plotQueueNext();
  closeModal('plotModal');
  const el = document.getElementById('saveStatus');
  if(el){
    el.textContent = t ? '📖 Juoni tallennettu' : '📖 Juoni poistettu';
    el.style.background = '#22c55e'; el.style.color = 'white'; el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 2200);
  }
};

// ── Jono: käydään puuttuvat läpi yksi kerrallaan ──
window.startPlotQueue = function(){
  const missing = reviewsWithoutPlot();
  if(!missing.length) return;
  plotQueue = missing.map(r => r.id);
  plotQueueIdx = 0;
  plotQueueDone = 0;
  window.openPlotEditor(plotQueue[0], plotQueue);
};

window.plotQueueNext = function(){
  if(!plotQueue) return closeModal('plotModal');
  plotQueueIdx++;
  // Ohitetaan ne, jotka on täytetty tai poistettu kesken jonon
  while(plotQueueIdx < plotQueue.length){
    const id = plotQueue[plotQueueIdx];
    const r = (appData.reviews || []).find(x => x.id === id);
    if(r && !String(r.plot || '').trim()) break;
    plotQueueIdx++;
  }
  if(plotQueueIdx >= plotQueue.length){
    const done = plotQueueDone;
    plotQueue = null; plotQueueIdx = 0; plotQueueDone = 0;
    closeModal('plotModal');
    const el = document.getElementById('saveStatus');
    if(el){
      el.textContent = done ? `📖 ${done} juonta lisätty` : 'Ei muutoksia';
      el.style.background = done ? '#22c55e' : '#6b7280';
      el.style.color = 'white'; el.style.opacity = '1';
      setTimeout(() => el.style.opacity = '0', 2600);
    }
    if(done >= 5 && window.launchConfetti) window.launchConfetti();
    return;
  }
  window.openPlotEditor(plotQueue[plotQueueIdx], plotQueue);
};

function renderPlotQueueBar(){
  const bar = document.getElementById('plotQueueBar');
  const skip = document.getElementById('plotSkipBtn');
  if(!bar || !skip) return;
  if(!plotQueue){
    bar.style.display = 'none';
    skip.style.display = 'none';
    return;
  }
  bar.style.display = 'block';
  skip.style.display = 'block';
  const n = plotQueue.length;
  const i = plotQueueIdx + 1;
  bar.innerHTML = `Puuttuvat juonet: <strong>${i}</strong> / ${n}${plotQueueDone ? ` · ${plotQueueDone} lisätty` : ''}
    <div class="plot-queue-track"><div class="plot-queue-bar" style="width:${Math.round(i / n * 100)}%"></div></div>`;
}

// Modaalin sulkeminen keskeyttää jonon
const _closePlotOrig = window.closeModal;
window.closeModal = function(id){
  if(id === 'plotModal'){ plotQueue = null; plotQueueIdx = 0; plotQueueDone = 0; }
  return _closePlotOrig.apply(this, arguments);
};

// ════════════════════════════════════════════════════════════
// 3. ASETUKSET: PUUTTUVAT JUONET
// ════════════════════════════════════════════════════════════

window.renderMissingPlots = function(){
  const el = document.getElementById('missingPlotsBox');
  if(!el) return;
  const missing = reviewsWithoutPlot();
  const own = (appData.reviews || []).filter(r => isOwnPlot(r)).length;

  if(!missing.length){
    el.innerHTML = `<div class="token-state ok">✅ Kaikilla elokuvilla ja sarjoilla on juoni.${own ? ` Niistä ${own} on itse kirjoitettu.` : ''}</div>`;
    return;
  }
  const rows = missing.slice(0, 8).map(r => `
    <div class="mp-row">
      <span class="mp-name">${esc(plainName(r))} <span>${esc(r.category)}${r.year ? ' · ' + r.year : ''}</span></span>
      <button type="button" class="mp-go" onclick="openPlotEditor(${r.id}, null)">Lisää</button>
    </div>`).join('');

  el.innerHTML = `
    <div class="toggle-row-sub" style="margin-bottom:10px;">
      ${missing.length} teokselta puuttuu juoni. TMDB:stä niitä ei löytynyt, joten
      ne pitää kirjoittaa itse. Käy läpi -nappi avaa ne yksi kerrallaan.${own ? ` Omia juonia on nyt ${own}.` : ''}
    </div>
    ${rows}
    ${missing.length > 8 ? `<div class="toggle-row-sub" style="margin:6px 0 10px;">…ja ${missing.length - 8} muuta.</div>` : ''}
    <button class="btn-secondary" style="width:100%;padding:13px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-top:6px;"
      onclick="startPlotQueue()">📖 Käy läpi ${missing.length} puuttuvaa</button>`;
};
