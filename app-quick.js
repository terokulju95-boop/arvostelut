// ── ARVOSTELUT – PISTEIDEN PIKAMUOKKAUS ──
// Kevyt lista jossa on vain elokuvan nimi ja piste, ja jossa pisteen voi
// muuttaa avaamatta arvostelun muokkausta. Järjestys on aina parhaasta
// huonoimpaan, ja rivi siirtyy uuteen kohtaansa heti kun piste muuttuu.
//
// Tämä moduuli ei kosketa mitään olemassa olevaa toiminnallisuutta:
// se lukee ja kirjoittaa vain arvostelun score-kenttää, ja käyttää
// samaa fbSave-tallennusta kuin muukin sovellus.

window.BUILD_QUICK = '2026-09-05.26';

// Vain elokuvat. Muut kategoriat eivät kuulu tähän näkymään.
const QS_CAT = 'Elokuvat';

// Valittu alalajirajaus: 'all' = kaikki, '' = perus, muu = alalajin nimi.
let _qsSub = 'all';

// Kirjoituksen aikana ei järjestetä uudelleen joka näppäinpainalluksesta,
// koska rivi hyppisi kesken numeron kirjoittamisen. Tämä ajastin siirtää
// järjestämisen hetkeen jolloin kirjoittaminen on tauonnut.
let _qsSortTimer = null;
const QS_SORT_DELAY = 700;

// Tallennus pilveen viiveellä. Muutos näkyy heti muistissa, mutta
// peräkkäiset säädöt niputetaan yhdeksi kirjoitukseksi.
let _qsSaveTimer = null;
const QS_SAVE_DELAY = 1200;

// ── APURIT ──

function qsPool(){
  const subs = window.subcatsFor ? window.subcatsFor(QS_CAT) : [];
  return (appData.reviews || [])
    .filter(r => r && r.category === QS_CAT)
    .filter(r => {
      if(_qsSub === 'all') return true;
      const s = window.subcatOf ? window.subcatOf(r) : (r.subcat || '');
      // Tuntematon alalaji (esim. poistettu) näkyy vain Kaikki-valinnalla
      if(_qsSub !== '' && !subs.includes(_qsSub)) return false;
      return s === _qsSub;
    });
}

// Pisteellinen ensin parhaasta huonoimpaan, pisteettömät omaan lohkoonsa.
// Tasapelin ratkaisee nimi, jotta järjestys ei heilu satunnaisesti.
function qsSortPool(pool){
  const scored = pool.filter(r => r.score != null)
    .sort((a,b) => (b.score - a.score) || qsName(a).localeCompare(qsName(b), 'fi'));
  const blank = pool.filter(r => r.score == null)
    .sort((a,b) => qsName(a).localeCompare(qsName(b), 'fi'));
  return { scored, blank };
}

function qsName(r){
  return window.plainName ? window.plainName(r) : String(r.name || '');
}

function qsCls(score){
  return (score != null && window.scoreClass) ? window.scoreClass(score) : '';
}

function qsSubLabel(r){
  const s = window.subcatOf ? window.subcatOf(r) : (r.subcat || '');
  return s || '';
}

// ── RENDERÖINTI ──

window.renderQuickScores = function(){
  const host = document.getElementById('quickView');
  if(!host) return;

  const subs = window.subcatsFor ? window.subcatsFor(QS_CAT) : [];
  const choices = [
    { id:'all', label:'Kaikki' },
    { id:'',    label:'Perus'  },
    ...subs.map(s => ({ id:s, label:s }))
  ];
  // Jos aiemmin valittu alalaji on poistettu, palataan kaikkiin
  if(_qsSub !== 'all' && _qsSub !== '' && !subs.includes(_qsSub)) _qsSub = 'all';

  const pool = qsPool();
  const { scored, blank } = qsSortPool(pool);
  const showSub = _qsSub === 'all' && subs.length > 0;

  const subRow = choices.map(c =>
    `<button class="qs-sub${c.id === _qsSub ? ' active' : ''}" onclick="qsSetSub('${escJs(String(c.id))}')">${esc(c.label)}</button>`
  ).join('');

  const rows = scored.map((r, i) => qsRowHtml(r, i + 1, showSub)).join('');
  const blankRows = blank.map(r => qsRowHtml(r, null, showSub)).join('');

  host.innerHTML = `
    <div class="qs-intro">
      Vain elokuvat. Muuta pistettä suoraan listassa — rivi siirtyy heti uuteen kohtaansa.
      Muut kentät säilyvät koskemattomina.
    </div>
    <div class="qs-subs">${subRow}</div>
    <div class="qs-count" id="qsCount">${qsCountText(scored.length, blank.length)}</div>
    ${scored.length || blank.length ? `
      <div class="qs-list" id="qsList">${rows}</div>
      ${blank.length ? `
        <div class="qs-blank-head">Ilman pistettä (${blank.length})</div>
        <div class="qs-list" id="qsBlankList">${blankRows}</div>` : ''}
    ` : `<div class="qs-empty">Ei elokuvia tässä ryhmässä.</div>`}
  `;
};

function qsCountText(n, blanks){
  if(!n && !blanks) return '';
  const parts = [`${n} pisteytettyä`];
  if(blanks) parts.push(`${blanks} ilman pistettä`);
  return parts.join(' · ');
}

function qsRowHtml(r, rank, showSub){
  const s = r.score;
  const sub = showSub ? qsSubLabel(r) : '';
  return `<div class="qs-row" id="qs-row-${r.id}" data-id="${r.id}">
    <span class="qs-rank" id="qs-rank-${r.id}">${rank != null ? rank : '–'}</span>
    <span class="qs-name" onclick="openReadModal(${r.id})">${esc(qsName(r))}${r.year ? ` <span class="qs-year">${r.year}</span>` : ''}${sub ? ` <span class="qs-sub-tag">${esc(sub)}</span>` : ''}</span>
    <button type="button" class="qs-step" onclick="qsStep(${r.id},-1)" aria-label="Vähennä piste">−</button>
    <input type="text" class="qs-input ${qsCls(s)}" id="qs-in-${r.id}"
      inputmode="numeric" pattern="[0-9]*" maxlength="3"
      value="${s != null ? s : ''}" placeholder="–"
      oninput="qsInput(${r.id},this)" onchange="qsCommit(${r.id},this)"
      onblur="qsCommit(${r.id},this)" onkeydown="qsKey(event,${r.id},this)"
      onfocus="this.select()">
    <button type="button" class="qs-step" onclick="qsStep(${r.id},1)" aria-label="Kasvata piste">+</button>
  </div>`;
}

// ── ALALAJIN VALINTA ──

window.qsSetSub = function(id){
  _qsSub = id;
  window.renderQuickScores();
};

// ── PISTEEN MUUTTAMINEN ──

function qsReview(id){
  return (appData.reviews || []).find(r => String(r.id) === String(id)) || null;
}

// Yhteinen kirjaus: asettaa arvon, päivittää värin ja merkitsee
// tallennuksen odottamaan. EI järjestä uudelleen.
function qsApply(id, val){
  const r = qsReview(id);
  if(!r) return null;
  r.score = val;
  const inp = document.getElementById('qs-in-' + id);
  if(inp){
    inp.value = val != null ? val : '';
    inp.className = 'qs-input ' + qsCls(val);
  }
  qsScheduleSave();
  return r;
}

// −/+ napit: muutos on yksiselitteinen, joten järjestys päivittyy heti.
window.qsStep = function(id, delta){
  const r = qsReview(id);
  if(!r) return;
  const cur = r.score != null ? r.score : (delta > 0 ? -1 : 101);
  let next = cur + delta;
  if(next < 0) next = 0;
  if(next > 100) next = 100;
  qsApply(id, next);
  qsResort(id);
};

// Kirjoittaminen: arvo talteen heti, järjestys vasta kun kirjoitus tauko.
window.qsInput = function(id, el){
  el.value = el.value.replace(/[^0-9]/g, '');
  if(el.value !== '' && +el.value > 100) el.value = '100';
  const val = el.value === '' ? null : +el.value;
  qsApply(id, val);
  clearTimeout(_qsSortTimer);
  _qsSortTimer = setTimeout(() => qsResort(id), QS_SORT_DELAY);
};

// Kentästä poistuminen tai Enter: järjestetään heti odottamatta viivettä.
window.qsCommit = function(id, el){
  clearTimeout(_qsSortTimer);
  const val = el.value === '' ? null : Math.max(0, Math.min(100, +el.value));
  qsApply(id, val);
  qsResort(id);
};

window.qsKey = function(ev, id, el){
  if(ev.key === 'Enter'){ ev.preventDefault(); el.blur(); }
};

// ── UUDELLEENJÄRJESTÄMINEN ──
// Rivi siirretään DOMissa uuteen kohtaan sen sijaan että koko lista
// piirrettäisiin uudelleen. Näin kirjoituskohdistus ei katoa kesken
// muokkauksen, ja siirtymän voi myös animoida.

function qsResort(movedId){
  const list = document.getElementById('qsList');
  if(!list) return;

  const pool = qsPool();
  const { scored, blank } = qsSortPool(pool);
  const movedRow = document.getElementById('qs-row-' + movedId);

  // Pisteetön rivi ei kuulu pääsivulle eikä päinvastoin. Näissä
  // tapauksissa koko näkymä piirretään uudelleen, koska rivi vaihtaa
  // lohkoa. Kohdistus palautetaan käsin.
  const wasBlankBlock = movedRow && movedRow.parentElement &&
                        movedRow.parentElement.id === 'qsBlankList';
  const isBlankNow = blank.some(r => String(r.id) === String(movedId));
  if(!movedRow || wasBlankBlock !== isBlankNow){
    const hadFocus = document.activeElement &&
                     document.activeElement.id === 'qs-in-' + movedId;
    const caret = hadFocus ? document.activeElement.value.length : 0;
    window.renderQuickScores();
    if(hadFocus){
      const again = document.getElementById('qs-in-' + movedId);
      if(again){
        again.focus();
        try{ again.setSelectionRange(caret, caret); }catch(e){ /* number-kenttä ei aina tue */ }
        qsFlash(document.getElementById('qs-row-' + movedId));
      }
    }
    return;
  }

  // Järjestä pisteelliset rivit uudelleen paikoilleen
  const before = movedRow.getBoundingClientRect().top;
  scored.forEach(r => {
    const el = document.getElementById('qs-row-' + r.id);
    if(el) list.appendChild(el);          // appendChild siirtää, ei kopioi
  });
  qsRenumber(scored);

  // Näytä liike: rivi siirtyy vanhasta kohdasta uuteen
  const after = movedRow.getBoundingClientRect().top;
  const shift = before - after;
  if(Math.abs(shift) > 1 && !qsReducedMotion()){
    movedRow.style.transition = 'none';
    movedRow.style.transform = `translateY(${shift}px)`;
    requestAnimationFrame(() => {
      movedRow.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1)';
      movedRow.style.transform = '';
    });
  }
  qsFlash(movedRow);
  qsKeepVisible(movedRow);
  qsUpdateCount(scored.length, blank.length);
}

function qsRenumber(scored){
  scored.forEach((r, i) => {
    const el = document.getElementById('qs-rank-' + r.id);
    if(el) el.textContent = i + 1;
  });
}

function qsUpdateCount(n, blanks){
  const el = document.getElementById('qsCount');
  if(el) el.textContent = qsCountText(n, blanks);
}

function qsFlash(row){
  if(!row) return;
  row.classList.remove('qs-moved');
  void row.offsetWidth;               // pakota animaation uudelleenkäynnistys
  row.classList.add('qs-moved');
  setTimeout(() => row.classList.remove('qs-moved'), 900);
}

// Jos rivi siirtyi näkyvän alueen ulkopuolelle, tuodaan se takaisin
// näkyviin. Näkyvissä olevaa riviä ei liikuteta turhaan.
function qsKeepVisible(row){
  if(!row || typeof row.scrollIntoView !== 'function') return;
  if(typeof row.getBoundingClientRect !== 'function') return;
  const rect = row.getBoundingClientRect();
  const top = 90;                      // yläpalkin alle jäävä alue
  const bottom = window.innerHeight - 80;
  if(rect.top < top || rect.bottom > bottom){
    row.scrollIntoView({ block:'center', behavior: qsReducedMotion() ? 'auto' : 'smooth' });
  }
}

function qsReducedMotion(){
  try{
    if(appData.settings && appData.settings.reduceMotion) return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }catch(e){ return false; }
}

// ── TALLENNUS ──
// Peräkkäiset säädöt niputetaan. fbSave kirjoittaa muutenkin vain
// muuttuneet arvostelut, joten tämä on vain lisäsuoja kirjoitusryöpyltä.

function qsScheduleSave(){
  clearTimeout(_qsSaveTimer);
  _qsSaveTimer = setTimeout(() => {
    _qsSaveTimer = null;
    if(window.fbSave) window.fbSave();
  }, QS_SAVE_DELAY);
}

// Näkymästä poistuttaessa tallennetaan heti, jottei viive jää roikkumaan.
window.qsFlushSave = function(){
  if(_qsSaveTimer){
    clearTimeout(_qsSaveTimer);
    _qsSaveTimer = null;
    if(window.fbSave) window.fbSave();
  }
};
