// ══ ARVOSTELUT · omat listat ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_LISTS = '2026-09-08.17';
//
// Tavallinen skripti. Ajetaan app-views.js:n JÄLKEEN, koska se käärii
// renderTop-funktion.
//
// Automaattinen Top-lista järjestää teokset pisteen mukaan. Se on hyvä
// mutta jäykkä: sillä ei voi tehdä listaa "parhaat sotaelokuvat" tai
// "mitä näytän vieraille". Oma lista on käsin koottu ja käsin järjestetty.
//
// ── MIKSI ERI RAKENNE KUIN KATSELULISTALLA ──
// Katselulistan teoksia ei ole arvosteltu, joten jokainen tarvitsee oman
// tietueensa (nimi, juliste, TMDB-tunnus). Oma lista sisältää vain jo
// arvosteltuja teoksia, joten riittää viittaus arvostelun tunnukseen.
// Yhteinen rakenne tarkoittaisi että jokainen alkio olisi "joko tunnus
// tai upotettu tietue", mikä on huonompi kuin kaksi selkeää muotoa.
//
// ── SIJAINTI KÄYTTÖLIITTYMÄSSÄ ──
// Listat asuvat Top-näkymän sisällä eivätkä omalla välilehdellään.
// Molemmat ovat järjestettyjä kokoelmia parhaista teoksista, ja
// välilehtipalkissa on jo kuusi kohtaa — seitsemäs tekisi siitä
// puhelimella kolmirivisen.

// ── TIETUEEN MUOTO ──
//   { id, name, icon, desc, items:[arvostelun id], created }

const LIST_ICONS = ['📋','🎬','🏆','🌙','🔥','💔','🎃','🎄','🧠','❤️','🗡️','🚀','🎭','🌍'];

function ensureLists(){
  if(!Array.isArray(appData.lists)) appData.lists = [];
  return appData.lists;
}
window.ensureLists = ensureLists;

let activeListId = null;   // null = automaattinen Top-lista

function findList(id){
  return ensureLists().find(l => String(l.id) === String(id)) || null;
}

// Listan teokset arvosteluina, käyttäjän omassa järjestyksessä.
// Kadonneet viittaukset pudotetaan näkymästä hiljaa — ne raportoidaan
// datan tarkistuksessa, jossa ne voi myös siivota.
function listReviews(list){
  if(!list) return [];
  return (list.items || [])
    .map(id => window.findReview ? window.findReview(id) : null)
    .filter(Boolean);
}

// ════════════════════════════════════════════════════════════
// MUOKKAUS
// ════════════════════════════════════════════════════════════

window.listCreate = async function(name, icon){
  const n = String(name || '').trim();
  if(!n) return null;
  const list = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: n,
    icon: icon || '📋',
    desc: '',
    items: [],
    created: new Date().toISOString().slice(0, 10)
  };
  ensureLists().push(list);
  if(window.fbSave) await window.fbSave();
  return list;
};

window.listDelete = async function(id){
  const lists = ensureLists();
  const i = lists.findIndex(l => String(l.id) === String(id));
  if(i < 0) return;
  const name = lists[i].name;
  if(!confirm('Poistetaanko lista “' + name + '”?\n\nArvosteluihin ei kosketa — vain lista katoaa.')) return;
  lists.splice(i, 1);
  if(String(activeListId) === String(id)) activeListId = null;
  if(window.fbSave) await window.fbSave();
  if(window.renderTop) window.renderTop();
};

window.listRename = async function(id){
  const l = findList(id);
  if(!l) return;
  const n = prompt('Listan nimi:', l.name);
  if(n === null) return;
  const trimmed = String(n).trim();
  if(!trimmed) return;
  l.name = trimmed;
  if(window.fbSave) await window.fbSave();
  if(window.renderTop) window.renderTop();
};

window.listSetIcon = async function(id){
  const l = findList(id);
  if(!l) return;
  // Kierretään kuvakelistaa eteenpäin. Yksinkertaisin tapa vaihtaa
  // kuvake puhelimella: ei valikkoa, vain napautus.
  const i = LIST_ICONS.indexOf(l.icon);
  l.icon = LIST_ICONS[(i + 1) % LIST_ICONS.length];
  if(window.fbSave) await window.fbSave();
  if(window.renderTop) window.renderTop();
};

window.listSetDesc = async function(id){
  const l = findList(id);
  if(!l) return;
  const d = prompt('Listan kuvaus (tyhjä poistaa):', l.desc || '');
  if(d === null) return;
  l.desc = String(d).trim();
  if(window.fbSave) await window.fbSave();
  if(window.renderTop) window.renderTop();
};

// Arvostelun lisäys tai poisto listalta.
window.listToggleItem = async function(listId, reviewId){
  const l = findList(listId);
  if(!l) return;
  if(!Array.isArray(l.items)) l.items = [];
  const key = String(reviewId);
  const i = l.items.findIndex(x => String(x) === key);
  if(i >= 0) l.items.splice(i, 1);
  else l.items.push(reviewId);
  if(window.fbSave) await window.fbSave();
  window.renderListPicker();
  if(window.renderTop && currentViewIsTop()) window.renderTop();
};

// Siirto listan sisällä. dir on -1 (ylös) tai 1 (alas).
window.listMove = async function(listId, reviewId, dir){
  const l = findList(listId);
  if(!l || !Array.isArray(l.items)) return;
  const key = String(reviewId);
  const i = l.items.findIndex(x => String(x) === key);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= l.items.length) return;
  const tmp = l.items[i];
  l.items[i] = l.items[j];
  l.items[j] = tmp;
  if(window.fbSave) await window.fbSave();
  if(window.renderTop) window.renderTop();
};

window.listRemoveItem = async function(listId, reviewId){
  const l = findList(listId);
  if(!l || !Array.isArray(l.items)) return;
  l.items = l.items.filter(x => String(x) !== String(reviewId));
  if(window.fbSave) await window.fbSave();
  if(window.renderTop) window.renderTop();
};

// Poistetun arvostelun siivous kaikilta listoilta. Palauttaa poistettujen
// viittausten määrän.
window.listsPruneReview = function(reviewId){
  const key = String(reviewId);
  let n = 0;
  ensureLists().forEach(l => {
    if(!Array.isArray(l.items)) return;
    const before = l.items.length;
    l.items = l.items.filter(x => String(x) !== key);
    n += before - l.items.length;
  });
  return n;
};

// Kaikkien kadonneiden viittausten siivous. Käytetään datan tarkistuksessa.
window.listsPruneMissing = function(){
  const ids = new Set((appData.reviews || []).map(r => String(r.id)));
  let n = 0;
  ensureLists().forEach(l => {
    if(!Array.isArray(l.items)) return;
    const before = l.items.length;
    l.items = l.items.filter(x => ids.has(String(x)));
    n += before - l.items.length;
  });
  return n;
};

// Millä listoilla arvostelu on.
window.listsOf = function(reviewId){
  const key = String(reviewId);
  return ensureLists().filter(l => (l.items || []).some(x => String(x) === key));
};

// ════════════════════════════════════════════════════════════
// TOP-NÄKYMÄN INTEGRAATIO
// ════════════════════════════════════════════════════════════

function currentViewIsTop(){
  const el = document.getElementById('viewTabTop');
  return !!(el && el.classList.contains('active'));
}

window.listSelect = function(id){
  activeListId = (id === '' || id == null) ? null : id;
  if(window.renderTop) window.renderTop();
};

// Valintarivi Top-näkymän kärkeen. app-views.js:n topControlsHtml kutsuu
// tätä, jos moduuli on ladattu.
window.listChipsHtml = function(){
  const lists = ensureLists();
  const chip = (id, label, on) =>
    `<button type="button" class="lst-chip${on ? ' on' : ''}" onclick="listSelect('${escJs(String(id))}')">${label}</button>`;

  const chips = [chip('', '🏆 Automaattinen', activeListId === null)]
    .concat(lists.map(l => chip(l.id, `${l.icon} ${esc(l.name)}`, String(activeListId) === String(l.id))))
    .join('');

  return `<div class="lst-chips">${chips}
    <button type="button" class="lst-chip lst-new" onclick="listNewPrompt()">＋ Uusi lista</button>
  </div>`;
};

window.listNewPrompt = async function(){
  const n = prompt('Uuden listan nimi:\n\nEsimerkiksi “Parhaat sotaelokuvat” tai “Mitä näytän vieraille”.');
  if(n === null) return;
  const list = await window.listCreate(n);
  if(!list){
    if(window.showStatus) window.showStatus('Nimi ei voi olla tyhjä', '#f59e0b', 2500);
    return;
  }
  activeListId = list.id;
  if(window.renderTop) window.renderTop();
  if(window.showStatus) window.showStatus('📋 Lista luotu — lisää teoksia arvostelun kautta', '#22c55e', 4000);
};

// Yksittäisen listan näkymä. Korvaa automaattisen Top-listan silloin kun
// lista on valittuna.
function renderListView(list){
  const grid = document.getElementById('cardsGrid');
  if(!grid) return;
  grid.className = 'cards-grid';

  const items = listReviews(list);
  const missing = (list.items || []).length - items.length;

  const head = `
    <div class="lst-head">
      <div class="lst-head-row">
        <button type="button" class="lst-icon" title="Vaihda kuvake" onclick="listSetIcon('${escJs(String(list.id))}')">${list.icon}</button>
        <div class="lst-head-text">
          <div class="lst-name">${esc(list.name)}</div>
          <div class="lst-count">${items.length} ${items.length === 1 ? 'teos' : 'teosta'}${missing ? ` · ${missing} viittausta kadonnut` : ''}</div>
        </div>
      </div>
      ${list.desc ? `<div class="lst-desc">${esc(list.desc)}</div>` : ''}
      <div class="lst-head-btns">
        <button type="button" class="lst-hbtn" onclick="listRename('${escJs(String(list.id))}')">✏️ Nimi</button>
        <button type="button" class="lst-hbtn" onclick="listSetDesc('${escJs(String(list.id))}')">📝 Kuvaus</button>
        <button type="button" class="lst-hbtn lst-del" onclick="listDelete('${escJs(String(list.id))}')">🗑️ Poista</button>
      </div>
    </div>`;

  if(!items.length){
    grid.innerHTML = window.listChipsHtml() + head + `
      <div class="lst-empty">
        <div class="lst-empty-ico">${list.icon}</div>
        <div class="lst-empty-title">Lista on tyhjä</div>
        <div class="lst-empty-sub">Avaa mikä tahansa arvostelu ja napauta sen Listat-riviä. Sama teos voi olla useammalla listalla.</div>
      </div>`;
    return;
  }

  const rows = items.map((r, i) => {
    const score = window.getReviewScore ? window.getReviewScore(r) : null;
    const poster = window.hasPoster && window.hasPoster(r)
      ? `<div class="lst-poster" style="background-image:${window.posterCss(r, 'w185')}"></div>`
      : `<div class="lst-poster lst-poster-none">🎬</div>`;
    return `<div class="lst-row">
      <div class="lst-rank">${i + 1}</div>
      <div class="lst-open" onclick="openReadModal(${JSON.stringify(r.id)})">${poster}</div>
      <div class="lst-info lst-open" onclick="openReadModal(${JSON.stringify(r.id)})">
        <div class="lst-title">${esc(window.plainName ? window.plainName(r) : r.name)}</div>
        <div class="lst-sub">${r.year ? esc(String(r.year)) + ' · ' : ''}${score != null ? score + ' p' : 'ei pistettä'}</div>
      </div>
      <div class="lst-move">
        <button type="button" class="lst-mbtn" title="Ylös"${i === 0 ? ' disabled' : ''}
          onclick="listMove('${escJs(String(list.id))}',${JSON.stringify(r.id)},-1)">▲</button>
        <button type="button" class="lst-mbtn" title="Alas"${i === items.length - 1 ? ' disabled' : ''}
          onclick="listMove('${escJs(String(list.id))}',${JSON.stringify(r.id)},1)">▼</button>
        <button type="button" class="lst-mbtn lst-x" title="Poista listalta"
          onclick="listRemoveItem('${escJs(String(list.id))}',${JSON.stringify(r.id)})">✕</button>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = window.listChipsHtml() + head + rows;
}

// Kääre: kun oma lista on valittuna, automaattista Top-listaa ei piirretä
// lainkaan. Alkuperäistä funktiota ei muokata, jotta se pysyy yhtenä
// selkeänä kokonaisuutena.
(function hookTop(){
  const orig = window.renderTop;
  if(typeof orig !== 'function') return;
  window.renderTop = function(...args){
    if(activeListId != null){
      const list = findList(activeListId);
      if(list){ renderListView(list); return; }
      activeListId = null;   // lista poistettu toisella laitteella
    }
    return orig.apply(this, args);
  };
})();

// Arvostelun poisto siivoaa viittaukset kaikilta listoilta.
(function hookDelete(){
  const orig = window.deleteReview;
  if(typeof orig !== 'function') return;
  window.deleteReview = async function(id, ...rest){
    const n = window.listsPruneReview(id);
    const out = await orig.call(this, id, ...rest);
    // fbSave ajetaan deleteReviewin sisällä, mutta siivous tehtiin ennen
    // sitä, joten se meni samaan kirjoitukseen. Varmistetaan silti.
    if(n && window.fbSave){ try{ await window.fbSave(); } catch(e){} }
    return out;
  };
})();

// ════════════════════════════════════════════════════════════
// LISÄYS ARVOSTELUSTA
// ════════════════════════════════════════════════════════════

let pickerReviewId = null;

window.openListPicker = function(reviewId){
  pickerReviewId = reviewId;
  window.renderListPicker();
  // Sovelluksessa ei ole openModal-apufunktiota: modaalit avataan
  // lisäämällä open-luokka, kuten budjettimodaaleissa.
  const el = document.getElementById('listPickerModal');
  if(el) el.classList.add('open');
};

window.renderListPicker = function(){
  const box = document.getElementById('listPickerBody');
  if(!box || pickerReviewId == null) return;
  const lists = ensureLists();

  if(!lists.length){
    box.innerHTML = `<div class="lst-empty">
      <div class="lst-empty-sub">Yhtään listaa ei ole vielä luotu.</div>
    </div>`;
    return;
  }

  box.innerHTML = lists.map(l => {
    const on = (l.items || []).some(x => String(x) === String(pickerReviewId));
    return `<button type="button" class="lst-pick${on ? ' on' : ''}"
      onclick="listToggleItem('${escJs(String(l.id))}',${JSON.stringify(pickerReviewId)})">
      <span class="lst-pick-box">${on ? '✓' : ''}</span>
      <span class="lst-pick-ico">${l.icon}</span>
      <span class="lst-pick-name">${esc(l.name)}</span>
      <span class="lst-pick-n">${(l.items || []).length}</span>
    </button>`;
  }).join('');
};

window.listPickerNew = async function(){
  const n = prompt('Uuden listan nimi:');
  if(n === null) return;
  const list = await window.listCreate(n);
  if(!list) return;
  if(pickerReviewId != null) await window.listToggleItem(list.id, pickerReviewId);
  window.renderListPicker();
};

// Rivi lukunäkymään: millä listoilla teos on, ja napautus avaa valitsimen.
// Erillinen funktio, jotta app-modals.js voi kutsua sitä yhdellä rivillä.
window.listsRowHtml = function(r){
  if(!r) return '';
  const on = window.listsOf(r.id);
  const label = on.length
    ? on.map(l => `${l.icon} ${esc(l.name)}`).join(' · ')
    : 'Ei millään listalla';
  return `<div class="read-section"><div class="read-label">📋 Listat</div>
    <div class="read-value"><button type="button" class="dir-link dir-link-lg"
      onclick="openListPicker(${JSON.stringify(r.id)})">${label}</button></div></div>`;
};
