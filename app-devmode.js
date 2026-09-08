// ══ ARVOSTELUT · kehittäjätila ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_DEVMODE = '2026-09-08.17';
//
// Tavallinen skripti. Ajetaan app-cards.js:n JÄLKEEN, koska se käärii
// toggleSetSec-funktion.
//
// Sovelluksessa on seitsemän välilehteä ja 36 asetusosiota. Osa niistä on
// varmasti turhia, mutta niitä on vaikea löytää selaamalla: turha asetus
// näyttää täsmälleen samalta kuin tarpeellinen.
//
// Kehittäjätilassa jokaisen asetuksen viereen ilmestyy lippu. Merkitset
// mitä olet mieltä, ja lopuksi lataat listan.
//
// ── KOLME PERIAATETTA ──
//
// 1. Kehittäjätila EI kosketa dataan. Merkinnät elävät omassa
//    localStorage-avaimessaan, eivät appData:ssa. Ne eivät siis mene
//    pilveen, eivät päädy varmuuskopioon eivätkä katoa testitilasta
//    poistuttaessa. Sivutuote: merkinnät ovat vain tällä laitteella,
//    joten lataa yhteenveto kun olet valmis.
//
// 2. Tila itse ei säily uudelleenkäynnistyksen yli, merkinnät säilyvät.
//    Kehittäjätila on työkalu jota käytetään hetken, ei asetus jonka
//    unohtaa päälle.
//
// 3. Lähdekoodia ei analysoida täällä. Riippuvuudet, kuollut koodi ja
//    rivinumerot vaatisivat sovelluksen omien tiedostojen lukemista ja
//    regexittämistä ajossa, mikä hajoaisi jokaisessa refaktoroinnissa.
//    Ne tehdään yhteenvedon perusteella siellä missä tiedostot voi
//    oikeasti lukea.

const DEV_KEY  = 'arvostelut-devmarks-v1';
const USE_KEY  = 'arvostelut-secuse-v1';

const MARK_TYPES = [
  { id:'poista',  icon:'🗑️', label:'Poista',   desc:'Turha, saa hävitä kokonaan' },
  { id:'muuta',   icon:'✏️', label:'Muuta',    desc:'Tarpeellinen mutta väärin toteutettu' },
  { id:'piilota', icon:'🙈', label:'Piilota',  desc:'Pidä toiminto, poista näkyvistä' },
  { id:'toive',   icon:'💡', label:'Toive',    desc:'Tähän liittyen haluaisin jotain uutta' },
  { id:'bugi',    icon:'🐞', label:'Bugi',     desc:'Tämä ei toimi oikein' }
];

let devOn = false;
let marks = {};
let usage = {};
let pickTarget = null;

// ════════════════════════════════════════════════════════════
// 1. TALLENNUS
// ════════════════════════════════════════════════════════════

function loadMarks(){
  try{ marks = JSON.parse(localStorage.getItem(DEV_KEY) || '{}') || {}; }
  catch(e){ marks = {}; }
  try{ usage = JSON.parse(localStorage.getItem(USE_KEY) || '{}') || {}; }
  catch(e){ usage = {}; }
  // Seurannan alkupäivä. Ilman sitä "et ole avannut tätä koskaan" olisi
  // harhaanjohtava: laskuri ei tiedä mitään ajasta ennen asennusta.
  if(!usage._alkoi){
    usage._alkoi = new Date().toISOString().slice(0, 10);
    saveUsage();
  }
}
function saveMarks(){
  try{ localStorage.setItem(DEV_KEY, JSON.stringify(marks)); } catch(e){}
}
function saveUsage(){
  try{ localStorage.setItem(USE_KEY, JSON.stringify(usage)); } catch(e){}
}

// ════════════════════════════════════════════════════════════
// 2. KÄYTTÖSEURANTA
// ════════════════════════════════════════════════════════════

// Kehittäjätilan hyödyllisin osa. Ilman tätä joutuisit käymään 36 osiota
// läpi arvaillen; tämän kanssa sovellus kertoo mitä et ole avannut.
(function hookSec(){
  const orig = window.toggleSetSec;
  if(typeof orig !== 'function') return;
  window.toggleSetSec = function(id, ...rest){
    try{
      if(id && id !== '_alkoi'){
        if(!usage[id]) usage[id] = { n:0, last:null };
        usage[id].n++;
        usage[id].last = new Date().toISOString().slice(0, 10);
        saveUsage();
      }
    } catch(e){}
    const out = orig.call(this, id, ...rest);
    if(devOn) setTimeout(injectFlags, 30);
    return out;
  };
})();

function useLabel(sec){
  const u = usage[sec];
  if(!u || !u.n) return { txt:'ei avattu', cls:'dev-unused' };
  if(u.n === 1) return { txt:'avattu kerran', cls:'' };
  return { txt:'avattu ' + u.n + '×', cls:'' };
}

// ════════════════════════════════════════════════════════════
// 3. KOHTEIDEN TUNNISTUS
// ════════════════════════════════════════════════════════════

// Tunnisteet muodostetaan DOMista ajossa. Osioilla ja välilehdillä on
// valmiit data-attribuutit; yksittäisillä riveillä käytetään säätimen
// omaa tunnusta, ja vasta sen puuttuessa järjestysnumeroa.
//
// Järjestysnumero on hauras: rivin siirto muuttaa sen. Siksi
// yhteenvetoon kirjoitetaan aina myös osio ja rivin näkyvä teksti, jotka
// ovat se mistä kohteen oikeasti tunnistaa.
function targetsIn(root){
  const out = [];

  root.querySelectorAll('.set-sec[data-sec]').forEach(sec => {
    const id   = sec.getAttribute('data-sec');
    const head = sec.querySelector('.set-sec-head');
    const pane = sec.closest('.settings-pane');
    const tab  = pane ? pane.getAttribute('data-pane') : '';
    const title = sec.querySelector('.set-sec-title');
    out.push({
      key: 'osio:' + id,
      kind: 'osio',
      label: title ? title.childNodes[0].textContent.trim() : id,
      sec: id, tab,
      host: head
    });

    // Kytkinrivit
    let i = 0;
    sec.querySelectorAll('.toggle-row').forEach(row => {
      i++;
      const ctrl = row.querySelector('[id]');
      const lab  = row.querySelector('.toggle-row-label');
      if(!lab) return;   // pelkkä ohjeteksti, ei säädettävä rivi
      out.push({
        key: 'rivi:' + id + ':' + (ctrl ? ctrl.id : '#' + i),
        kind: 'asetus',
        label: lab.textContent.trim(),
        sec: id, tab,
        host: row
      });
    });

    // Valintarivit. Suurin osa asetuksista on näitä eikä kytkimiä: 30
    // asetusosiossa on 9 kytkinriviä ja 12 valintariviä, ja loput
    // renderöidään ajossa. Nimi on edeltävässä label-elementissä, koska
    // valintarivi itse sisältää vain napit.
    let j = 0;
    sec.querySelectorAll('.seg-row').forEach(row => {
      j++;
      const prev = row.previousElementSibling;
      const isLabel = prev && prev.tagName === 'LABEL';
      out.push({
        key: 'valinta:' + id + ':' + (row.id || '#' + j),
        kind: 'asetus',
        label: isLabel ? prev.textContent.trim() : (row.id || 'valinta ' + j),
        sec: id, tab,
        host: isLabel ? prev : row
      });
    });
  });

  return out;
}

function viewTargets(){
  return [...document.querySelectorAll('.view-tab[id]')].map(el => ({
    key: 'nakyma:' + el.id,
    kind: 'näkymä',
    label: (el.querySelector('.vt-label') || el).textContent.trim(),
    sec: '', tab: '',
    host: el
  }));
}

// ════════════════════════════════════════════════════════════
// 4. LIPUT
// ════════════════════════════════════════════════════════════

function flagHtml(key){
  const m = marks[key];
  const t = m ? MARK_TYPES.find(x => x.id === m.t) : null;
  return `<button type="button" class="dev-flag${m ? ' on' : ''}${m && m.d ? ' done' : ''}"
    title="${m ? esc(t ? t.label : m.t) : 'Merkitse'}"
    onclick="event.stopPropagation();devPick('${escJs(key)}')">${m ? (t ? t.icon : '🚩') : '🚩'}</button>`;
}

function injectFlags(){
  if(!devOn) return;
  const all = targetsIn(document).concat(viewTargets());

  all.forEach(t => {
    if(!t.host) return;
    t.host.classList.add('dev-host');
    let f = t.host.querySelector(':scope > .dev-flag-wrap');
    if(!f){
      f = document.createElement('span');
      f.className = 'dev-flag-wrap';
      t.host.appendChild(f);
    }
    let extra = '';
    if(t.kind === 'osio'){
      const u = useLabel(t.sec);
      extra = `<span class="dev-use ${u.cls}">${esc(u.txt)}</span>`;
    }
    f.innerHTML = extra + flagHtml(t.key);
    // Tunnistetiedot talteen elementtiin, jotta merkintä osaa tallentaa
    // ihmisluettavan nimen eikä pelkkää avainta.
    f.dataset.key = t.key;
    f.dataset.label = t.label;
    f.dataset.sec = t.sec;
    f.dataset.tab = t.tab;
    f.dataset.kind = t.kind;
  });

  updateDevBar();
}

function clearFlags(){
  document.querySelectorAll('.dev-flag-wrap').forEach(el => el.remove());
  document.querySelectorAll('.dev-host').forEach(el => el.classList.remove('dev-host'));
}

// ════════════════════════════════════════════════════════════
// 5. TILAN KYTKENTÄ
// ════════════════════════════════════════════════════════════

window.toggleDevMode = function(){
  devOn ? window.stopDevMode() : window.startDevMode();
};

window.startDevMode = function(){
  devOn = true;
  document.body.classList.add('dev-on');
  injectFlags();
  const bar = document.getElementById('devBar');
  if(bar) bar.classList.add('on');
  if(window.updateBottomStack) window.updateBottomStack();
  window.renderDevSettings();
  if(window.showStatus) window.showStatus('🛠️ Kehittäjätila päällä — dataan ei kosketa', '#0891b2', 3500);
};

window.stopDevMode = function(){
  devOn = false;
  document.body.classList.remove('dev-on');
  clearFlags();
  const bar = document.getElementById('devBar');
  if(bar) bar.classList.remove('on');
  if(window.updateBottomStack) window.updateBottomStack();
  window.renderDevSettings();
};

function markCount(){ return Object.keys(marks).filter(k => !marks[k].d).length; }
function doneCount(){ return Object.keys(marks).filter(k => marks[k].d).length; }

function updateDevBar(){
  const t = document.getElementById('devBarText');
  if(!t) return;
  const n = markCount(), d = doneCount();
  t.textContent = n || d
    ? `🛠️ ${n} merkintää${d ? ` · ${d} kuitattu` : ''}`
    : '🛠️ Kehittäjätila — napauta lippua merkitäksesi';
}

window.renderDevSettings = function(){
  const el = document.getElementById('devStatus');
  if(!el) return;
  const n = markCount(), d = doneCount();
  el.innerHTML = devOn
    ? `Päällä. ${n} merkintää${d ? `, ${d} kuitattu` : ''}. Seuranta alkoi ${esc(usage._alkoi || '?')}.`
    : `Pois päältä. ${n ? n + ' merkintää tallessa.' : 'Ei merkintöjä.'}`;
  const btn = document.getElementById('devToggleBtn');
  if(btn) btn.textContent = devOn ? '⏹️ Poistu kehittäjätilasta' : '🛠️ Käynnistä kehittäjätila';
};

// ════════════════════════════════════════════════════════════
// 6. MERKINNÄN TEKO
// ════════════════════════════════════════════════════════════

window.devPick = function(key){
  const wrap = document.querySelector(`.dev-flag-wrap[data-key="${CSS.escape(key)}"]`);
  pickTarget = {
    key,
    label: wrap ? wrap.dataset.label : key,
    sec:   wrap ? wrap.dataset.sec : '',
    tab:   wrap ? wrap.dataset.tab : '',
    kind:  wrap ? wrap.dataset.kind : ''
  };
  window.renderDevPicker();
  const m = document.getElementById('devPickModal');
  if(m) m.classList.add('open');
};

window.renderDevPicker = function(){
  const box = document.getElementById('devPickBody');
  if(!box || !pickTarget) return;
  const cur = marks[pickTarget.key];

  box.innerHTML = `
    <div class="dev-pick-head">
      <div class="dev-pick-label">${esc(pickTarget.label)}</div>
      <div class="dev-pick-sub">${esc(pickTarget.kind)}${pickTarget.sec ? ' · ' + esc(pickTarget.sec) : ''}${pickTarget.tab ? ' · ' + esc(pickTarget.tab) : ''}</div>
    </div>
    ${MARK_TYPES.map(t => `<button type="button" class="dev-type${cur && cur.t === t.id ? ' on' : ''}"
      onclick="devSetType('${t.id}')">
      <span class="dev-type-ico">${t.icon}</span>
      <span class="dev-type-txt"><strong>${t.label}</strong><span>${esc(t.desc)}</span></span>
    </button>`).join('')}
    <textarea id="devNote" class="dev-note" rows="2"
      placeholder="Miksi? Vapaaehtoinen, mutta auttaa kun luen listan.">${esc(cur ? cur.n || '' : '')}</textarea>
    ${cur ? `<button type="button" class="dev-remove" onclick="devClear()">Poista merkintä</button>` : ''}`;
};

window.devSetType = function(type){
  if(!pickTarget) return;
  const noteEl = document.getElementById('devNote');
  const note = noteEl ? noteEl.value.trim() : '';
  const prev = marks[pickTarget.key];

  // Saman tyypin uudelleenvalinta poistaa merkinnän. Yksi nappi sekä
  // asettaa että peruu, jolloin väärin osuneen merkinnän saa pois heti
  // eikä sitä tarvitse etsiä yhteenvedosta.
  if(prev && prev.t === type && !note){
    delete marks[pickTarget.key];
  } else {
    marks[pickTarget.key] = {
      t: type, n: note,
      l: pickTarget.label, s: pickTarget.sec, b: pickTarget.tab, k: pickTarget.kind,
      d: prev ? !!prev.d : false,
      pvm: new Date().toISOString().slice(0, 10)
    };
  }
  saveMarks();
  injectFlags();
  const m = document.getElementById('devPickModal');
  if(m) m.classList.remove('open');
  pickTarget = null;
};

window.devClear = function(){
  if(!pickTarget) return;
  delete marks[pickTarget.key];
  saveMarks();
  injectFlags();
  const m = document.getElementById('devPickModal');
  if(m) m.classList.remove('open');
  pickTarget = null;
};

// ════════════════════════════════════════════════════════════
// 7. YHTEENVETO
// ════════════════════════════════════════════════════════════

window.openDevSummary = function(){
  window.renderDevSummary();
  const m = document.getElementById('devSumModal');
  if(m) m.classList.add('open');
};

function marksByTab(){
  const groups = new Map();
  Object.keys(marks).forEach(k => {
    const m = marks[k];
    const g = m.b || m.k || 'muu';
    if(!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ key:k, ...m });
  });
  return groups;
}

window.renderDevSummary = function(){
  const box = document.getElementById('devSumBody');
  if(!box) return;
  const keys = Object.keys(marks);

  if(!keys.length){
    box.innerHTML = `<div class="dev-empty">Ei vielä merkintöjä.<br><br>Käynnistä kehittäjätila ja napauta 🚩 sen asetuksen vierestä josta haluat sanoa jotain.</div>`;
    return;
  }

  const groups = marksByTab();
  let html = `<div class="dev-sum-top">${markCount()} avointa${doneCount() ? ` · ${doneCount()} kuitattu` : ''}</div>`;

  groups.forEach((list, tab) => {
    html += `<div class="dev-group"><div class="dev-group-t">${esc(tab)}</div>`;
    list.forEach(m => {
      const t = MARK_TYPES.find(x => x.id === m.t);
      html += `<div class="dev-item${m.d ? ' done' : ''}">
        <div class="dev-item-top">
          <span class="dev-item-ico">${t ? t.icon : '🚩'}</span>
          <span class="dev-item-label">${esc(m.l || m.key)}</span>
          <button type="button" class="dev-item-x" title="Poista" onclick="devDrop('${escJs(m.key)}')">✕</button>
        </div>
        <div class="dev-item-meta">${esc(t ? t.label : m.t)}${m.s ? ' · ' + esc(m.s) : ''}</div>
        ${m.n ? `<div class="dev-item-note">${esc(m.n)}</div>` : ''}
        <button type="button" class="dev-done" onclick="devToggleDone('${escJs(m.key)}')">${m.d ? '↩️ Palauta avoimeksi' : '✅ Merkitse tehdyksi'}</button>
      </div>`;
    });
    html += `</div>`;
  });

  box.innerHTML = html;
};

window.devDrop = function(key){
  delete marks[key];
  saveMarks();
  window.renderDevSummary();
  if(devOn) injectFlags();
};

window.devToggleDone = function(key){
  if(!marks[key]) return;
  marks[key].d = !marks[key].d;
  saveMarks();
  window.renderDevSummary();
  if(devOn) injectFlags();
};

// ── VIENTI ──

function summaryMarkdown(){
  const keys = Object.keys(marks);
  const lines = [];
  lines.push('# Arvostelut · kehittäjätilan yhteenveto');
  lines.push('');
  lines.push(`Sovelluksen versio: ${window.BUILD_CORE || '?'}`);
  lines.push(`Merkintöjä: ${markCount()} avointa, ${doneCount()} kuitattua`);
  lines.push(`Käyttöseuranta alkoi: ${usage._alkoi || '?'}`);
  lines.push('');

  MARK_TYPES.forEach(type => {
    const list = keys.map(k => ({ key:k, ...marks[k] })).filter(m => m.t === type.id && !m.d);
    if(!list.length) return;
    lines.push(`## ${type.icon} ${type.label} (${list.length})`);
    list.forEach(m => {
      lines.push(`- **${m.l || m.key}**${m.s ? ` — osio: ${m.s}` : ''}${m.b ? `, välilehti: ${m.b}` : ''}`);
      lines.push(`  - tunniste: \`${m.key}\``);
      if(m.n) lines.push(`  - perustelu: ${m.n}`);
    });
    lines.push('');
  });

  // Käyttämättömät osiot mukaan omana lukunaan: ne ovat ehdokkaita joita
  // ei ole vielä merkitty, ja juuri se tieto puuttuisi muuten kokonaan.
  const unused = [...document.querySelectorAll('.set-sec[data-sec]')]
    .map(s => s.getAttribute('data-sec'))
    .filter(id => !usage[id] || !usage[id].n);
  if(unused.length){
    lines.push(`## 📉 Osiot joita ei ole avattu ${usage._alkoi} jälkeen (${unused.length})`);
    lines.push('');
    lines.push('Ei merkintä vaan havainto: nämä ovat ehdokkaita, eivät päätöksiä.');
    lines.push('');
    unused.forEach(id => lines.push(`- ${id}`));
    lines.push('');
  }

  const done = keys.map(k => ({ key:k, ...marks[k] })).filter(m => m.d);
  if(done.length){
    lines.push(`## ✅ Kuitatut (${done.length})`);
    done.forEach(m => lines.push(`- ${m.l || m.key} (${m.t})`));
  }

  return lines.join('\n');
}

function summaryJson(){
  return JSON.stringify({
    versio: window.BUILD_CORE || null,
    seurantaAlkoi: usage._alkoi || null,
    merkinnat: Object.keys(marks).map(k => ({ tunniste:k, ...marks[k] })),
    avaamattomatOsiot: [...document.querySelectorAll('.set-sec[data-sec]')]
      .map(s => s.getAttribute('data-sec'))
      .filter(id => !usage[id] || !usage[id].n)
  }, null, 2);
}

window.devExport = function(fmt){
  const txt = fmt === 'json' ? summaryJson() : summaryMarkdown();
  const blob = new Blob([txt], { type: fmt === 'json' ? 'application/json' : 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kehittajatila-${new Date().toISOString().slice(0,10)}.${fmt === 'json' ? 'json' : 'md'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if(window.showStatus) window.showStatus('📄 Yhteenveto ladattu', '#22c55e', 2500);
};

window.devCopy = async function(){
  try{
    await navigator.clipboard.writeText(summaryMarkdown());
    if(window.showStatus) window.showStatus('📋 Kopioitu leikepöydälle', '#22c55e', 2500);
  } catch(e){
    if(window.showStatus) window.showStatus('Kopiointi ei onnistunut', '#dc2626', 2500);
  }
};

window.devReset = function(){
  const n = Object.keys(marks).length;
  if(!n) return;
  if(!confirm(`Poistetaanko kaikki ${n} merkintää?\n\nLataa yhteenveto ensin jos et ole vielä tehnyt sitä — merkinnät ovat vain tällä laitteella.`)) return;
  marks = {};
  saveMarks();
  window.renderDevSummary();
  if(devOn) injectFlags();
  window.renderDevSettings();
};

// Testattavuutta varten.
window._devInternals = {
  get marks(){ return marks; },
  set marks(v){ marks = v; },
  get usage(){ return usage; },
  set usage(v){ usage = v; },
  summaryMarkdown, summaryJson, markCount, doneCount, MARK_TYPES
};

loadMarks();
