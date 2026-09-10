// ══ ARVOSTELUT · ohjattu palautus ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_RESTORE = '2026-09-10.3';
//
// Tavallinen skripti. Ajetaan app-modals.js:n JÄLKEEN, koska se korvaa
// restoreBackup-funktion ja käärii renderBackupInfo-funktion.
//
// Palautus oli sovelluksen vaarallisin yksittäinen nappi. Se näytti yhden
// varmistuskysymyksen kahdella luvulla ja korvasi sen jälkeen kaiken —
// myös pilvessä. Jos tiedosto oli väärä tai vanha, mitään ei saanut
// takaisin.
//
// Nyt palautus on kolmivaiheinen: lue, esikatsele, vahvista. Mitään ei
// kirjoiteta ennen kuin olet nähnyt tarkalleen mitä katoaa.

// ════════════════════════════════════════════════════════════
// 1. TARKISTUSSUMMA
// ════════════════════════════════════════════════════════════

// Kanoninen esitys: avaimet aakkosjärjestyksessä joka tasolla. Ilman tätä
// sama data tuottaisi eri summan riippuen siitä missä järjestyksessä
// kentät sattuvat olemaan, koska JSON.stringify säilyttää lisäysjärjestyksen.
function canonical(v){
  if(v === null || typeof v !== 'object') return JSON.stringify(v);
  if(Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

// FNV-1a, 32 bittiä. Ei salausta vaan eheystarkistus: se paljastaa
// katkenneen latauksen tai käsin sotketun tiedoston, ei tahallista
// väärentämistä. Siihen ei tässä ole tarvetta.
function checksum(str){
  let h = 0x811c9dc5;
  for(let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

window.buildBackupPayload = function(){
  const data = appData;
  return {
    _tyyppi: 'arvostelut-varmuuskopio',
    _paivays: new Date().toISOString(),
    _versio: window.BUILD_CORE || '',
    _tarkiste: checksum(canonical(data)),
    data: data
  };
};

// Varmuuskopion koko etukäteen (K12-004).
window.backupSizeText = function(){
  try{
    const s = JSON.stringify(window.buildBackupPayload(), null, 2);
    const kb = s.length / 1024;
    return kb >= 1024 ? (Math.round(kb / 102.4) / 10) + ' Mt' : Math.round(kb) + ' kt';
  } catch(e){ return null; }
};

// ════════════════════════════════════════════════════════════
// 2. ANALYYSI
// ════════════════════════════════════════════════════════════

let rsFile = null;      // { data, meta, checksumOk }
let rsMode = 'merge';   // merge | replace | partial
let rsParts = { reviews:true, cats:false, genres:false, settings:false, watchlist:false, lists:false, budget:false };

const RS_PARTS = [
  { id:'reviews',   label:'Arvostelut' },
  { id:'cats',      label:'Kategoriat ja alalajit' },
  { id:'genres',    label:'Genret' },
  { id:'settings',  label:'Asetukset' },
  { id:'watchlist', label:'Katselulista' },
  { id:'lists',     label:'Omat listat' },
  { id:'budget',    label:'Budjetti' }
];

function nameKey(r){
  const n = window.plainName ? window.plainName(r) : String((r && r.name) || '');
  return String(n).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// Vertaa tiedoston arvosteluja nykyisiin. Ensisijainen tunniste on id;
// jos se ei osu, kokeillaan TMDB-tunnusta ja lopuksi nimeä kategorian
// sisällä. Kolme tasoa siksi, että sama teos voi olla eri laitteella eri
// id:llä mutta se on silti sama teos.
function analyze(incoming){
  const cur = (appData.reviews || []).filter(Boolean);
  const inc = (incoming.reviews || []).filter(Boolean);

  const curById   = new Map(cur.map(r => [String(r.id), r]));
  const curByTmdb = new Map();
  const curByName = new Map();
  cur.forEach(r => {
    if(r.tmdb_id != null) curByTmdb.set(r.category + '|' + r.tmdb_id, r);
    const k = nameKey(r);
    if(k) curByName.set(r.category + '|' + k, r);
  });

  const match = r => curById.get(String(r.id))
    || (r.tmdb_id != null ? curByTmdb.get(r.category + '|' + r.tmdb_id) : null)
    || curByName.get(r.category + '|' + nameKey(r))
    || null;

  const newOnes = [];
  const changed = [];
  const same = [];
  const matchedCur = new Set();

  inc.forEach(r => {
    const m = match(r);
    if(!m){ newOnes.push(r); return; }
    matchedCur.add(m);
    const a = canonical(r), b = canonical(m);
    if(a === b) same.push(r); else changed.push({ inc:r, cur:m });
  });

  // Nykyiset joita tiedostossa ei ole. Korvaavassa palautuksessa nämä
  // katoavat — se on tärkein yksittäinen luku koko näkymässä.
  const onlyCurrent = cur.filter(r => !matchedCur.has(r));

  const listDiff = (a, b) => {
    const A = new Set(a || []), B = new Set(b || []);
    return { added: [...B].filter(x => !A.has(x)), removed: [...A].filter(x => !B.has(x)) };
  };

  return {
    reviews: { newOnes, changed, same, onlyCurrent, incTotal: inc.length, curTotal: cur.length },
    cats:   listDiff(appData.categories, incoming.categories),
    genres: listDiff(appData.genres, incoming.genres),
    watchlist: { cur: (appData.watchlist || []).length, inc: (incoming.watchlist || []).length },
    lists:     { cur: (appData.lists || []).length,     inc: (incoming.lists || []).length },
    budget:    { cur: ((appData.budget || {}).periods || []).length,
                 inc: ((incoming.budget || {}).periods || []).length },
    settings:  settingsDiffCount(appData.settings, incoming.settings)
  };
}

function settingsDiffCount(a, b){
  const A = a || {}, B = b || {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  let n = 0;
  keys.forEach(k => { if(canonical(A[k]) !== canonical(B[k])) n++; });
  return { diff: n, total: keys.size };
}

// ════════════════════════════════════════════════════════════
// 3. TIEDOSTON LUKU
// ════════════════════════════════════════════════════════════

window.restoreBackup = function(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try{
      parsed = JSON.parse(reader.result);
    } catch(e){
      alert('Tiedostoa ei voitu lukea.\n\nOnko se kelvollinen JSON-varmuuskopio? Jos latasit sen puhelimella, kokeile ladata uudelleen — keskeytynyt lataus tuottaa vajaan tiedoston.');
      return;
    }

    const data = (parsed && parsed.data && parsed.data.reviews) ? parsed.data : parsed;
    if(!data || !Array.isArray(data.reviews)){
      alert('Tiedosto ei näytä Arvostelut-varmuuskopiolta.\n\nreviews-taulukko puuttuu. Valitsitko oikean tiedoston?');
      return;
    }

    // Eheystarkistus (K12-046). Vanhoissa kopioissa ei ole tarkistesummaa,
    // eikä sen puuttuminen ole virhe — se vain jää kertomatta.
    let checksumOk = null;
    if(parsed && parsed._tarkiste){
      checksumOk = (checksum(canonical(data)) === parsed._tarkiste);
    }

    rsFile = {
      data,
      meta: {
        name: file.name,
        size: file.size,
        date: (parsed && parsed._paivays) || null,
        version: (parsed && parsed._versio) || null
      },
      checksumOk,
      diff: analyze(data)
    };
    rsMode = 'merge';
    rsParts = { reviews:true, cats:false, genres:false, settings:false, watchlist:false, lists:false, budget:false };
    window.renderRestore();
    const el = document.getElementById('restoreModal');
    if(el) el.classList.add('open');
  };
  reader.readAsText(file);
};

// ════════════════════════════════════════════════════════════
// 4. NÄKYMÄ
// ════════════════════════════════════════════════════════════

window.restoreSetMode = function(m){ rsMode = m; window.renderRestore(); };
window.restoreTogglePart = function(p){ rsParts[p] = !rsParts[p]; window.renderRestore(); };

function kb(n){ return n >= 1024*1024 ? (Math.round(n/104857.6)/10)+' Mt' : Math.round(n/1024)+' kt'; }

function rsRow(label, value, tone){
  return `<div class="rs-row${tone ? ' rs-' + tone : ''}">
    <span class="rs-row-l">${esc(label)}</span><span class="rs-row-v">${esc(String(value))}</span></div>`;
}

window.renderRestore = function(){
  const box = document.getElementById('restoreBody');
  if(!box || !rsFile) return;
  const d = rsFile.diff;
  const m = rsFile.meta;
  const R = d.reviews;

  // ── TIEDOSTO ──
  let chk = '';
  if(rsFile.checksumOk === true){
    chk = `<div class="rs-note rs-ok">✅ Eheystarkistus läpi — tiedosto on ehjä.</div>`;
  } else if(rsFile.checksumOk === false){
    chk = `<div class="rs-note rs-bad">⛔ Eheystarkistus epäonnistui. Tiedosto on muuttunut latauksen jälkeen tai lataus katkesi. Palautus on mahdollinen mutta osa tiedoista voi puuttua.</div>`;
  } else {
    chk = `<div class="rs-note">ℹ️ Tiedostossa ei ole tarkistesummaa. Se on tehty ennen tätä ominaisuutta, mikä on täysin normaalia.</div>`;
  }

  const fileBox = `<div class="rs-sec">
    <div class="rs-sec-t">📄 Tiedosto</div>
    ${rsRow('Nimi', m.name)}
    ${rsRow('Koko', kb(m.size))}
    ${m.date ? rsRow('Tehty', new Date(m.date).toLocaleString('fi-FI')) : ''}
    ${m.version ? rsRow('Sovelluksen versio', m.version) : ''}
    ${chk}
  </div>`;

  // ── EROT ──
  const diffBox = `<div class="rs-sec">
    <div class="rs-sec-t">🔍 Mitä tiedostossa on</div>
    ${rsRow('Arvosteluja tiedostossa', R.incTotal)}
    ${rsRow('Arvosteluja nyt', R.curTotal)}
    <div class="rs-split"></div>
    ${rsRow('Uusia (ei vielä sinulla)', R.newOnes.length, R.newOnes.length ? 'good' : null)}
    ${rsRow('Muuttuneita', R.changed.length, R.changed.length ? 'mid' : null)}
    ${rsRow('Samoja', R.same.length)}
    ${rsRow('Vain sinulla, ei tiedostossa', R.onlyCurrent.length, R.onlyCurrent.length ? 'bad' : null)}
    ${(d.cats.added.length || d.cats.removed.length) ? rsRow('Kategoriaeroja', d.cats.added.length + d.cats.removed.length) : ''}
    ${(d.genres.added.length || d.genres.removed.length) ? rsRow('Genreeroja', d.genres.added.length + d.genres.removed.length) : ''}
    ${d.settings.diff ? rsRow('Asetuseroja', `${d.settings.diff}/${d.settings.total}`) : ''}
    ${rsRow('Katselulista', `${d.watchlist.cur} → ${d.watchlist.inc}`)}
    ${rsRow('Omat listat', `${d.lists.cur} → ${d.lists.inc}`)}
  </div>`;

  // ── TILA ──
  const modes = [
    { id:'merge',   t:'Yhdistä',    s:'Lisää puuttuvat. Mitään nykyistä ei korvata eikä poisteta.' },
    { id:'partial', t:'Valikoiden', s:'Valitse itse mitkä osat korvataan tiedoston versiolla.' },
    { id:'replace', t:'Korvaa',     s:'Kaikki korvataan tiedoston sisällöllä. Nykyinen data katoaa.' }
  ];
  const modeBox = `<div class="rs-sec">
    <div class="rs-sec-t">⚙️ Tapa</div>
    ${modes.map(x => `<button type="button" class="rs-mode${rsMode === x.id ? ' on' : ''}" onclick="restoreSetMode('${x.id}')">
      <span class="rs-mode-box">${rsMode === x.id ? '●' : ''}</span>
      <span class="rs-mode-txt"><strong>${x.t}</strong><span>${esc(x.s)}</span></span>
    </button>`).join('')}
    ${rsMode === 'partial' ? `<div class="rs-parts">${RS_PARTS.map(p =>
      `<button type="button" class="rs-part${rsParts[p.id] ? ' on' : ''}" onclick="restoreTogglePart('${p.id}')">
        <span class="rs-part-box">${rsParts[p.id] ? '✓' : ''}</span>${esc(p.label)}</button>`).join('')}</div>` : ''}
  </div>`;

  // ── SEURAUS ──
  // Tämä on koko näkymän tärkein laatikko: mitä katoaa lopullisesti.
  let effect = '';
  if(rsMode === 'merge'){
    const n = R.newOnes.length;
    effect = n
      ? `<div class="rs-note rs-ok">Lisätään ${n} ${n === 1 ? 'arvostelu' : 'arvostelua'}. Nykyisiin ${R.curTotal} arvosteluun ei kosketa lainkaan. Mitään ei katoa.</div>`
      : `<div class="rs-note">Tiedostossa ei ole yhtään arvostelua jota sinulla ei jo ole. Yhdistäminen ei muuttaisi mitään.</div>`;
    if(R.changed.length){
      effect += `<div class="rs-note">${R.changed.length} arvostelua on tiedostossa erilaisena. Yhdistämisessä säilyy <strong>sinun nykyinen versiosi</strong>. Jos haluat tiedoston version, valitse Valikoiden tai Korvaa.</div>`;
    }
  } else if(rsMode === 'replace'){
    effect = `<div class="rs-note rs-bad"><strong>${R.onlyCurrent.length} arvostelua katoaa lopullisesti</strong>, koska niitä ei ole tiedostossa. Myös asetukset, katselulista, omat listat ja budjetti korvataan. Muutos kirjoitetaan myös pilveen.</div>`;
    if(!R.onlyCurrent.length){
      effect = `<div class="rs-note rs-ok">Yhtään arvostelua ei katoa — tiedostossa on kaikki mitä sinulla on nyt. Asetukset, katselulista, omat listat ja budjetti korvataan silti tiedoston versiolla.</div>`;
    }
  } else {
    const chosen = RS_PARTS.filter(p => rsParts[p.id]);
    if(!chosen.length){
      effect = `<div class="rs-note">Valitse vähintään yksi osa.</div>`;
    } else {
      let bits = chosen.map(p => p.label.toLowerCase()).join(', ');
      effect = `<div class="rs-note rs-bad">Korvataan tiedoston versiolla: <strong>${esc(bits)}</strong>. Muuhun ei kosketa.`;
      if(rsParts.reviews && R.onlyCurrent.length){
        effect += `<br><br>Arvosteluista katoaa ${R.onlyCurrent.length}, koska niitä ei ole tiedostossa.`;
      }
      effect += `</div>`;
    }
  }

  const canGo = rsMode !== 'partial' || RS_PARTS.some(p => rsParts[p.id]);

  box.innerHTML = fileBox + diffBox + modeBox +
    `<div class="rs-sec"><div class="rs-sec-t">📌 Mitä tapahtuu</div>${effect}</div>` +
    `<button type="button" class="rs-go${canGo ? '' : ' off'}" ${canGo ? '' : 'disabled'} onclick="restoreConfirm()">
      ${rsMode === 'merge' ? '🔀 Yhdistä' : rsMode === 'partial' ? '🧩 Korvaa valitut' : '⚠️ Korvaa kaikki'}
    </button>`;
};

// ════════════════════════════════════════════════════════════
// 5. SUORITUS
// ════════════════════════════════════════════════════════════

function afterRestore(){
  if(!appData.categories || !appData.categories.length) appData.categories = [...DEFAULT_CATS];
  if(!appData.genres) appData.genres = [...DEFAULT_GENRES];
  if(!appData.budget) appData.budget = { monthlyPrice: 26.90, periods: [] };
  if(window.ensureSettings) window.ensureSettings();
  if(window.ensureSubcats) window.ensureSubcats();
  if(window.migrateYearField) window.migrateYearField();
  if(window.ensureWatchlist) window.ensureWatchlist();
  if(window.ensureLists) window.ensureLists();
  GENRES = [...appData.genres];
  if(!appData.categories.includes(activeCat)) activeCat = appData.categories[0] || null;
  if(typeof window.setActiveSub === 'function') window.setActiveSub('');
  if(window.applyAccent && appData.settings) window.applyAccent(appData.settings.accent);
  if(window.applyTheme) window.applyTheme();
}

window.restoreConfirm = async function(){
  if(!rsFile) return;
  const d = rsFile.diff, R = d.reviews;
  const inc = rsFile.data;

  // Viimeinen varmistus vain silloin kun jotain oikeasti katoaa.
  // Yhdistäminen ei kysy mitään, koska siinä ei ole mitään menetettävää.
  if(rsMode === 'replace'){
    const msg = R.onlyCurrent.length
      ? `${R.onlyCurrent.length} arvostelua katoaa lopullisesti.\n\nTämä kirjoitetaan myös pilveen. Jatketaanko?`
      : `Kaikki asetukset, katselulista, omat listat ja budjetti korvataan.\n\nJatketaanko?`;
    if(!confirm(msg)) return;
  } else if(rsMode === 'partial' && rsParts.reviews && R.onlyCurrent.length){
    if(!confirm(`${R.onlyCurrent.length} arvostelua katoaa lopullisesti.\n\nJatketaanko?`)) return;
  }

  let msg = '';

  if(rsMode === 'merge'){
    // Lisätään vain ne joita ei löydy millään kolmesta tunnistetavasta.
    //
    // Tuore tunnus annetaan siltä varalta että TIEDOSTON SISÄLLÄ on kaksi
    // arvostelua samalla tunnuksella. Nykyisten kanssa törmäystä ei voi
    // syntyä, koska tunnuksen osuminen olisi jo tunnistanut arvostelun
    // samaksi eikä se olisi täällä. Vialliseen kopioon se on silti
    // mahdollinen, ja ilman uusintaa toinen jäisi piiloon ensimmäisen
    // taakse eikä sitä voisi enää muokata.
    const used = new Set((appData.reviews || []).map(r => String(r.id)));
    let base = Date.now();
    R.newOnes.forEach(r => {
      const copy = { ...r };
      if(used.has(String(copy.id))) copy.id = base++;
      used.add(String(copy.id));
      appData.reviews.push(copy);
    });
    // Kategoriat ja genret yhdistetään, koska uusi arvostelu voi kuulua
    // kategoriaan jota ei muuten olisi — ja jäisi näkymättömiin.
    (inc.categories || []).forEach(c => { if(!appData.categories.includes(c)) appData.categories.push(c); });
    (inc.genres || []).forEach(g => { if(!appData.genres.includes(g)) appData.genres.push(g); });
    msg = `Lisätty ${R.newOnes.length} arvostelua. Nykyisiin ei koskettu.`;

  } else if(rsMode === 'replace'){
    appData = inc;
    msg = `Palautettu ${R.incTotal} arvostelua.`;

  } else {
    if(rsParts.reviews)   appData.reviews   = inc.reviews || [];
    if(rsParts.cats){     appData.categories = inc.categories || [...DEFAULT_CATS];
                          if(inc.subcats) appData.subcats = inc.subcats; }
    if(rsParts.genres)    appData.genres    = inc.genres || [...DEFAULT_GENRES];
    if(rsParts.settings)  appData.settings  = inc.settings || {};
    if(rsParts.watchlist) appData.watchlist = inc.watchlist || [];
    if(rsParts.lists)     appData.lists     = inc.lists || [];
    if(rsParts.budget)    appData.budget    = inc.budget || { monthlyPrice: 26.90, periods: [] };
    msg = 'Valitut osat korvattu.';
  }

  afterRestore();
  await window.fbSave();
  if(window.renderAll) window.renderAll();
  if(window.renderBackupInfo) window.renderBackupInfo();

  const el = document.getElementById('restoreModal');
  if(el) el.classList.remove('open');
  rsFile = null;
  alert(msg);
};

// ════════════════════════════════════════════════════════════
// 6. VARMUUSKOPION KOKO (K12-004)
// ════════════════════════════════════════════════════════════

// Kokorivi lisätään suoraan renderBackupInfo-funktioon (app-modals.js).
// Kääre ei toimisi: funktiota kutsutaan tiedoston sisällä paikallisella
// nimellä, joten window-tason korvaus ohitettaisiin.

// Testattavuutta varten.
window._restoreInternals = { canonical, checksum, analyze, settingsDiffCount };
