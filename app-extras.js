// ══ ARVOSTELUT · lisätoiminnot ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_EXTRAS = '2026-08-31.15';
// Tavallinen skripti (ei moduuli): ajetaan app-core.js:n JÄLKEEN.
// Sisältää neljä toisistaan riippumatonta osaa:
//   1. Pull-to-refresh
//   2. Ohjaajasuodatin
//   3. Julisteen vaihto (TMDB:n vaihtoehdot + oma kuva)
//   4. Lomakkeen kenttäjärjestys

// ════════════════════════════════════════════════════════════
// 1. PULL-TO-REFRESH
// Firestoren kuuntelijat pitävät datan ajan tasalla itsestään, joten
// tämä ei ole tavallisessa käytössä välttämätön. Se on olemassa niitä
// tilanteita varten joissa yhteys on ollut poikki tai kuuntelija on
// katkennut — silloin muistissa oleva kuva voi olla vanha eikä siitä
// näy mitään ulospäin.
// ════════════════════════════════════════════════════════════

const PTR_TRIGGER  = 58;    // näin pitkälle indikaattorin on liu'uttava
const PTR_MAX      = 96;    // indikaattori ei liu'u tätä alemmas
// Vastus: indikaattori liikkuu hitaammin kuin sormi, jolloin ele tuntuu
// kumilta. 0,6 tarkoittaa että laukaisu vaatii noin 97 px sormenliikettä —
// pystyssä pidettävällä puhelimella se on mukava peukalon veto.
const PTR_FRICTION = 0.6;

let ptrStartY = 0;
let ptrPulling = false;
let ptrArmed = false;
let ptrBusy = false;

function ptrEl(){
  let el = document.getElementById('ptrIndicator');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'ptrIndicator';
  el.innerHTML = '<span class="ptr-icon">↓</span><span class="ptr-text">Vedä päivittääksesi</span>';
  document.body.appendChild(el);
  return el;
}

// Veto sallitaan vain kun sivu on aidosti ylhäällä, mikään modaali ei ole
// auki eikä testitila ole päällä. Muuten ele osuisi päällekkäin sivun
// oman vierityksen ja modaalin sulkemisvedon kanssa.
function ptrAllowed(){
  if(ptrBusy) return false;
  if(window._sandbox) return false;
  if(typeof currentView !== 'undefined' && currentView === 'discover') return false;
  if(document.querySelector('.modal-overlay.open')) return false;
  if(window.scrollY > 2) return false;
  return true;
}

function ptrSet(dist, state){
  const el = ptrEl();
  const icon = el.querySelector('.ptr-icon');
  const text = el.querySelector('.ptr-text');
  if(state === 'hidden'){
    el.classList.remove('visible','armed','busy','done','fail');
    el.style.transform = '';
    return;
  }
  el.classList.add('visible');
  if(state === 'busy'){
    el.classList.add('busy');
    el.classList.remove('armed');
    el.style.transform = `translateX(-50%) translateY(${PTR_TRIGGER}px)`;
    icon.textContent = '⟳';
    text.textContent = 'Päivitetään…';
    return;
  }
  if(state === 'done' || state === 'fail'){
    el.classList.remove('busy','armed');
    el.classList.add(state);
    el.style.transform = `translateX(-50%) translateY(${PTR_TRIGGER}px)`;
    icon.textContent = state === 'done' ? '✓' : '⚠️';
    return;
  }
  const shown = Math.min(dist, PTR_MAX);
  el.style.transform = `translateX(-50%) translateY(${shown}px)`;
  const armed = dist >= PTR_TRIGGER;
  el.classList.toggle('armed', armed);
  icon.textContent = armed ? '↑' : '↓';
  text.textContent = armed ? 'Päästä irti' : 'Vedä päivittääksesi';
}

async function ptrRun(){
  ptrBusy = true;
  ptrSet(0, 'busy');
  try{
    if(!window.fbRefresh) throw new Error('Päivitys ei ole käytettävissä');
    const res = await window.fbRefresh();
    const el = ptrEl();
    ptrSet(0, 'done');
    el.querySelector('.ptr-text').textContent = res && res.changed
      ? `Päivitetty · ${res.count} arvostelua`
      : `Päivitetty · ei muutoksia`;
  } catch(e){
    ptrSet(0, 'fail');
    ptrEl().querySelector('.ptr-text').textContent = 'Päivitys ei onnistunut';
  }
  setTimeout(() => { ptrSet(0, 'hidden'); ptrBusy = false; }, 1300);
}

document.addEventListener('touchstart', e => {
  if(e.touches.length !== 1 || !ptrAllowed()) return;
  ptrStartY = e.touches[0].clientY;
  ptrPulling = true;
  ptrArmed = false;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if(!ptrPulling || e.touches.length !== 1) return;
  const dy = e.touches[0].clientY - ptrStartY;
  // Ylöspäin veto tai sivun vierittäminen kesken eleen peruu vedon
  if(dy <= 0 || window.scrollY > 2){
    if(ptrArmed) ptrSet(0, 'hidden');
    ptrPulling = false;
    ptrArmed = false;
    return;
  }
  // Vastus: veto tuntuu kumilta eikä indikaattori karkaa sormen mukana
  const dist = dy * PTR_FRICTION;
  if(dist < 8) return;
  ptrArmed = true;
  ptrSet(dist, 'pull');
}, { passive: true });

function ptrEnd(){
  if(!ptrPulling){ return; }
  const armed = ptrEl().classList.contains('armed');
  ptrPulling = false;
  if(!ptrArmed){ return; }
  ptrArmed = false;
  if(armed) ptrRun();
  else ptrSet(0, 'hidden');
}
document.addEventListener('touchend', ptrEnd, { passive: true });
document.addEventListener('touchcancel', ptrEnd, { passive: true });


// ════════════════════════════════════════════════════════════
// 2. OHJAAJASUODATIN
// Käynnistyy kortin tai luku-modaalin ohjaajanimestä. Näkyy omana
// palkkinaan listan yläpuolella, koska se ohittaa kategoriavalinnan
// eikä sitä muuten huomaisi olevan päällä.
// ════════════════════════════════════════════════════════════

window.filterByDirector = function(name){
  if(!name) return;
  // Sama nimi uudelleen = pois päältä
  if(activeDirectorFilter && normName(activeDirectorFilter) === normName(name)){
    return window.clearDirectorFilter();
  }
  activeDirectorFilter = name;
  if(typeof currentView !== 'undefined' && currentView !== 'reviews'){
    window.setView('reviews');
  } else {
    renderCards();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.clearDirectorFilter = function(){
  activeDirectorFilter = null;
  renderCards();
};

window.renderDirectorBanner = function(count){
  let el = document.getElementById('directorBanner');
  if(!activeDirectorFilter){
    if(el) el.remove();
    return;
  }
  if(!el){
    el = document.createElement('div');
    el.id = 'directorBanner';
    const grid = document.getElementById('cardsGrid');
    grid.parentNode.insertBefore(el, grid);
  }
  const n = count == null ? 0 : count;
  const avg = (() => {
    const scores = (appData.reviews || [])
      .filter(r => r.director && normName(r.director) === normName(activeDirectorFilter))
      .map(getReviewScore)
      .filter(s => s != null);
    if(!scores.length) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  })();

  el.innerHTML = `
    <span class="db-icon">🎬</span>
    <span class="db-text">
      <strong>${esc(activeDirectorFilter)}</strong>
      <span class="db-sub">${n} ${n === 1 ? 'teos' : 'teosta'}${avg != null ? ` · keskiarvosi ${avg}` : ''} · kaikki kategoriat</span>
    </span>
    <button type="button" class="db-clear" onclick="clearDirectorFilter()" aria-label="Poista ohjaajarajaus">✕</button>`;
};


// ════════════════════════════════════════════════════════════
// 3. JULISTEEN VAIHTO
// Kaksi tapaa: TMDB:n muut julisteversiot samasta teoksesta, tai oma
// kuva laitteelta. Oma kuva tallennetaan pakattuna data-URL:na suoraan
// arvosteluun (r.posterCustom), jolloin erillistä tiedostovarastoa ei
// tarvita. Oma kuva voittaa aina TMDB:n polun, joten massapäivitys ei
// pyyhi käsin valittua julistetta.
// ════════════════════════════════════════════════════════════

// Juliste näkyy puhelimessa enintään noin 200 px leveänä, joten 400 px
// riittää tarkkuudeksi hyvin. Kokoraja on tiukempi kuin Firestoren 1 Mt
// vaatisi, koska paikallinen varmuuskopio menee localStorageen — sen noin
// 5 Mt täyttyisi nopeasti täysikokoisilla kamerakuvilla.
const POSTER_MAX_W     = 400;
const POSTER_MAX_BYTES = 120000;   // ~120 kt data-URL:na

let _posterId = null;

window.openPosterPicker = function(id){
  const r = (appData.reviews || []).find(x => x.id === id);
  if(!r) return;
  _posterId = id;
  renderPosterPicker();
  if(window.openModalOnTop) window.openModalOnTop('posterModal');
  else document.getElementById('posterModal').classList.add('open');
};

function posterReview(){
  return (appData.reviews || []).find(x => x.id === _posterId) || null;
}

function renderPosterPicker(extraHtml){
  const r = posterReview();
  const body = document.getElementById('posterModalBody');
  if(!r || !body) return;

  const current = window.hasPoster(r)
    ? `<img class="pp-current-img" src="${esc(window.posterUrl(r, 'w342'))}" alt="">`
    : `<div class="pp-current-img pp-none">${r.category === 'TV-sarjat' ? '📺' : '🎬'}</div>`;

  const source = r.posterCustom ? 'Oma kuva' : (r.poster ? 'TMDB' : 'Ei julistetta');

  body.innerHTML = `
    <div class="pp-current">
      ${current}
      <div class="pp-current-info">
        <div class="pp-name">${esc(plainName(r))}${r.year ? ` <span class="pp-year">${r.year}</span>` : ''}</div>
        <div class="pp-source">Lähde: <strong>${esc(source)}</strong></div>
        ${r.posterCustom ? '<div class="pp-note">Oma kuva säilyy myös TMDB-massapäivityksen yli.</div>' : ''}
      </div>
    </div>

    <div class="pp-actions">
      ${r.tmdb_id
        ? `<button type="button" class="btn-secondary pp-btn" onclick="loadTmdbPosters()">🎬 Hae TMDB:n vaihtoehdot</button>`
        : `<div class="pp-hint">Tällä teoksella ei ole TMDB-linkitystä, joten vaihtoehtoisia julisteita ei voi hakea. Oman kuvan voi silti lisätä.</div>`}
      <button type="button" class="btn-secondary pp-btn" onclick="document.getElementById('posterFileInput').click()">🖼️ Lataa oma kuva</button>
      ${r.posterCustom ? `<button type="button" class="btn-secondary pp-btn pp-btn-del" onclick="removeCustomPoster()">↩️ Poista oma kuva${r.poster ? ' ja palaa TMDB:hen' : ''}</button>` : ''}
    </div>

    <div id="ppStatus" class="pp-status"></div>
    <div id="ppGrid" class="pp-grid">${extraHtml || ''}</div>`;
}

function ppStatus(html, spinning){
  const el = document.getElementById('ppStatus');
  if(!el) return;
  if(!html){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = (spinning ? '<span class="disc-spin"></span>' : '') + html;
}

// TMDB:n muut julisteversiot. include_image_language pyytää suomalaiset ja
// englanninkieliset sekä tekstittömät (null) julisteet — tekstittömät ovat
// usein siistein vaihtoehto, koska ne eivät toista nimeä kortissa kahdesti.
window.loadTmdbPosters = async function(){
  const r = posterReview();
  if(!r || !r.tmdb_id) return;
  const type = r.tmdb_type || (r.tvType ? 'tv' : 'movie');
  ppStatus('Haetaan julisteita…', true);
  const data = await tmdbGet(`/${type}/${r.tmdb_id}/images?include_image_language=fi,en,null`);
  if(!data || !Array.isArray(data.posters) || !data.posters.length){
    ppStatus('Ei vaihtoehtoisia julisteita. Voit silti ladata oman kuvan.');
    return;
  }
  // Suosituimmat ensin, enintään 24 — enempää ei jaksa selata puhelimella
  const list = data.posters
    .slice()
    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    .slice(0, 24);

  ppStatus(`${list.length} vaihtoehtoa · napauta valitaksesi`);
  document.getElementById('ppGrid').innerHTML = list.map(p => {
    const isCur = !r.posterCustom && r.poster === p.file_path;
    const lang = p.iso_639_1 ? p.iso_639_1.toUpperCase() : 'ei tekstiä';
    return `<button type="button" class="pp-opt ${isCur ? 'current' : ''}" onclick="choosePoster('${escJs(p.file_path)}')">
      <img src="https://image.tmdb.org/t/p/w185${esc(p.file_path)}" loading="lazy" alt="">
      <span class="pp-opt-lang">${esc(lang)}</span>
      ${isCur ? '<span class="pp-opt-cur">✓</span>' : ''}
    </button>`;
  }).join('');
};

window.choosePoster = async function(path){
  const r = posterReview();
  if(!r) return;
  r.poster = path;
  delete r.posterCustom;
  // Väri lasketaan uudesta julisteesta — vanha sävy ei enää päde
  delete r.posterColor;
  await window.fbSave();
  renderAll();
  renderPosterPicker();
  ppStatus('✅ Juliste vaihdettu.');
};

window.removeCustomPoster = async function(){
  const r = posterReview();
  if(!r) return;
  delete r.posterCustom;
  delete r.posterColor;
  await window.fbSave();
  renderAll();
  renderPosterPicker();
  ppStatus(r.poster ? '↩️ Palattiin TMDB:n julisteeseen.' : 'Oma kuva poistettu.');
};

// Pakkaa kuvan selaimessa ennen tallennusta. Laadun laskemista jatketaan
// kunnes tulos mahtuu rajaan — puhelimen kameran kuva on pakkaamattomana
// useita megatavuja eikä mahtuisi Firestoren dokumenttiin lainkaan.
function compressImage(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Tiedostoa ei voitu lukea'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Kuvaa ei voitu avata'));
      img.onload = () => {
        try{
          const scale = Math.min(1, POSTER_MAX_W / img.width);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          // Valkoinen pohja, jottei läpinäkyvä PNG muutu mustaksi JPEGissä
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          let q = 0.82;
          let url = cv.toDataURL('image/jpeg', q);
          while(url.length > POSTER_MAX_BYTES && q > 0.35){
            q -= 0.1;
            url = cv.toDataURL('image/jpeg', q);
          }
          if(url.length > POSTER_MAX_BYTES){
            return reject(new Error('Kuva on liian suuri pakkauksen jälkeenkin'));
          }
          resolve({ url, w, h, q, bytes: url.length });
        } catch(e){ reject(e); }
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

window.onPosterFile = async function(input){
  const file = input.files && input.files[0];
  input.value = '';   // sama tiedosto uudelleen laukaisee changen vasta tyhjennyksen jälkeen
  const r = posterReview();
  if(!file || !r) return;
  if(!/^image\//.test(file.type)){
    ppStatus('❌ Valitse kuvatiedosto.');
    return;
  }
  ppStatus('Pakataan kuvaa…', true);
  try{
    const out = await compressImage(file);
    r.posterCustom = out.url;
    delete r.posterColor;
    await window.fbSave();
    renderAll();
    renderPosterPicker();
    ppStatus(`✅ Oma juliste tallennettu · ${out.w}×${out.h}px, ${Math.round(out.bytes / 1024)} kt`);
  } catch(e){
    ppStatus('❌ ' + esc(e.message || 'Kuvan käsittely epäonnistui'));
  }
};


// ════════════════════════════════════════════════════════════
// 4. LOMAKKEEN KENTTÄJÄRJESTYS
// Kategoria, alalaji ja arvostelutyyppi pysyvät aina ylimpänä, koska ne
// ratkaisevat mitkä muut kentät ylipäätään näkyvät. Loput saa järjestää
// vapaasti raahaamalla.
// ════════════════════════════════════════════════════════════

const FORM_FIELDS = [
  { el:'tmdbSearchSection', label:'TMDB-haku',    icon:'🎬' },
  { el:'nameSection',       label:'Nimi ja vuosi', icon:'📝' },
  { el:'genreSection',      label:'Genre',         icon:'🏷️' },
  // Piste-ennustelaatikko kulkee aina arvosanan mukana, koska se
  // kommentoi juuri sitä lukua.
  { el:'scoreSection',      label:'Arvosana',      icon:'⭐', glue:'scorePredictionBox' },
  { el:'markSection',       label:'Merkintä',      icon:'❤️' },
  { el:'plotSection',       label:'Juoni',         icon:'📖' },
  { el:'noteSection',       label:'Lisätiedot',    icon:'💭' },
  { el:'dateSection',       label:'Päivämäärä',    icon:'📅' }
];

const DEFAULT_FORM_ORDER = FORM_FIELDS.map(f => f.el);

// Tallennettu järjestys voi olla vanhentunut tai rikki: siitä voi puuttua
// uusia kenttiä, siinä voi olla poistettuja, ja synkronointi kahdelta
// laitteelta on voinut jättää saman kentän listaan kahdesti. Siksi se
// siivotaan aina lukuhetkellä eikä luoteta tallennettuun sisältöön.
function formOrder(){
  const seen = new Set();
  const saved = (ensureSettings().formOrder || []).filter(id => {
    if(!DEFAULT_FORM_ORDER.includes(id)) return false;
    if(seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const missing = DEFAULT_FORM_ORDER.filter(id => !seen.has(id));
  return [...saved, ...missing];
}

window.applyFormOrder = function(){
  const sheet = document.querySelector('#addModal .modal-sheet');
  const anchor = sheet && sheet.querySelector('.modal-actions');
  if(!sheet || !anchor) return;
  formOrder().forEach(id => {
    const node = document.getElementById(id);
    if(!node) return;
    sheet.insertBefore(node, anchor);
    const def = FORM_FIELDS.find(f => f.el === id);
    if(def && def.glue){
      const g = document.getElementById(def.glue);
      if(g) sheet.insertBefore(g, anchor);
    }
  });
};

window.renderFormOrderSettings = function(){
  const host = document.getElementById('formOrderList');
  if(!host) return;
  host.innerHTML = formOrder().map(id => {
    const f = FORM_FIELDS.find(x => x.el === id);
    if(!f) return '';
    return `<div class="fo-row" data-field="${esc(id)}">
      <span class="fo-handle" aria-hidden="true">⠿</span>
      <span class="fo-icon">${f.icon}</span>
      <span class="fo-label">${esc(f.label)}</span>
    </div>`;
  }).join('');
};

window.resetFormOrder = async function(){
  ensureSettings().formOrder = [];
  window.renderFormOrderSettings();
  window.applyFormOrder();
  await window.fbSave();
};

async function saveFormOrder(){
  const host = document.getElementById('formOrderList');
  if(!host) return;
  ensureSettings().formOrder = [...host.querySelectorAll('.fo-row')].map(r => r.dataset.field);
  window.applyFormOrder();
  await window.fbSave();
}

// Raahaus pointer-tapahtumilla. HTML5:n drag and drop ei toimi Androidin
// kosketusnäytöllä, joten siirto lasketaan käsin: raahattava rivi seuraa
// sormea ja muut rivit siirtyvät sen tieltä.
(function initFormOrderDrag(){
  let host = null, dragEl = null, rows = [], startY = 0, fromIdx = 0, toIdx = 0, rowH = 0;

  function onDown(e){
    host = document.getElementById('formOrderList');
    if(!host) return;
    const row = e.target.closest('.fo-row');
    if(!row || !host.contains(row)) return;
    dragEl = row;
    rows = [...host.querySelectorAll('.fo-row')];
    fromIdx = rows.indexOf(row);
    toIdx = fromIdx;
    const box = row.getBoundingClientRect();
    // Väli rivien välissä tulee CSS:n gapista — mitataan se todellisesta
    // asettelusta, jottei arvaus mene pieleen tiheämmällä fontilla.
    const second = rows[1] ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : box.height;
    rowH = second || box.height;
    startY = e.clientY;
    row.classList.add('dragging');
    try{ row.setPointerCapture(e.pointerId); } catch(err){}
    e.preventDefault();
  }

  function onMove(e){
    if(!dragEl) return;
    const dy = e.clientY - startY;
    dragEl.style.transform = `translateY(${dy}px)`;
    toIdx = Math.max(0, Math.min(rows.length - 1, fromIdx + Math.round(dy / rowH)));
    rows.forEach((r, i) => {
      if(r === dragEl) return;
      let shift = 0;
      if(fromIdx < toIdx && i > fromIdx && i <= toIdx) shift = -rowH;
      else if(fromIdx > toIdx && i < fromIdx && i >= toIdx) shift = rowH;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function onUp(){
    if(!dragEl) return;
    const el = dragEl;
    dragEl = null;
    rows.forEach(r => { r.style.transform = ''; });
    el.classList.remove('dragging');
    if(toIdx !== fromIdx && host){
      const moved = rows[fromIdx];
      const ref = toIdx > fromIdx ? rows[toIdx].nextSibling : rows[toIdx];
      host.insertBefore(moved, ref);
      saveFormOrder();
    }
  }

  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
})();

// Järjestys asetetaan aina kun lomake avataan, koska modaali on olemassa
// koko ajan eikä sitä rakenneta uudelleen.
['openAddModal', 'editReview'].forEach(fn => {
  const orig = window[fn];
  if(typeof orig !== 'function') return;
  window[fn] = function(...args){
    const out = orig.apply(this, args);
    try{ window.applyFormOrder(); } catch(e){}
    return out;
  };
});
