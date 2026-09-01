// ══ ARVOSTELUT · Firebase ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_FIREBASE = '2026-09-01.17';
// Moduuli (type="module"): ajetaan aina tavallisten skriptien JÄLKEEN.
// Ulospäin näkyvät funktiot asetetaan window-objektiin.
//
// TIETORAKENNE (schema 2):
//   arvostelut/meta                  → kategoriat, genret, budjetti, asetukset
//   arvostelut/meta/reviews/{id}     → yksi arvostelu = yksi dokumentti
//   arvostelut/data                  → VANHA rakenne, jätetään koskematta varmuuden vuoksi
//
// window.fbSave() toimii ulospäin täsmälleen kuten ennenkin, mutta kirjoittaa
// vain ne arvostelut jotka ovat oikeasti muuttuneet.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, collection,
  getDocsFromServer, query, limit,
  onSnapshot, writeBatch, updateDoc, waitForPendingWrites,
  enableNetwork, disableNetwork
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
const FIRESTORE_URL = "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_VUBuT2lcDtrtMEUZV-U8CNy0Rv1XSNI",
  authDomain: "arvostelut-a07dd.firebaseapp.com",
  projectId: "arvostelut-a07dd",
  storageBucket: "arvostelut-a07dd.firebasestorage.app",
  messagingSenderId: "998880403275",
  appId: "1:998880403275:web:08ce4b3ef0489d31de52ce"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);

const SCHEMA    = 2;
const BATCH_MAX = 400;   // Firestoren raja on 500 operaatiota per erä

// Kuinka kauan odotetaan että PALVELIN kuittaa kirjoituksen. Firestoren
// commit-lupaus ei ratkea koskaan jos yhteyttä ei ole — se ei heitä virhettä,
// se vain jää roikkumaan. Ilman aikakatkaisua isSaving jäisi pysyvästi
// päälle ja kaikki loput saman istunnon tallennukset katoaisivat hiljaa.
const COMMIT_TIMEOUT = 10000;

// Kuinka kauan käynnistyksessä odotetaan että edellisten istuntojen
// jonossa olevat kirjoitukset menevät läpi, ennen kuin varoitetaan.
const QUEUE_TIMEOUT = 12000;

// Nämä syntyvät vasta initDb():ssä, koska tietokannan asetukset on
// annettava ennen ensimmäistä käyttöä.
let db = null, OLD_DOC = null, META_DOC = null, REVIEWS = null;
window._fbCacheMode = 'tuntematon';

// Yrittää ottaa käyttöön pysyvän paikallisen välimuistin (IndexedDB).
// Sen ansiosta sovelluksen avaus lukee arvostelut levyltä ja pyytää
// palvelimelta vain muuttuneet — muuten jokainen avaus lukisi kaikki
// dokumentit uudelleen ja söisi ilmaisen tason päivittäistä lukukiintiötä.
//
// Käyttö on suojattu: jos SDK ei tunne näitä funktioita, palataan
// tavalliseen muistinvaraiseen tilaan eikä mikään hajoa.
async function initDb(){
  if(db) return db;
  try{
    const fs = await import(FIRESTORE_URL);
    if(typeof fs.initializeFirestore === 'function' && typeof fs.persistentLocalCache === 'function'){
      const cacheOpts = (typeof fs.persistentMultipleTabManager === 'function')
        ? { tabManager: fs.persistentMultipleTabManager() }
        : {};
      db = fs.initializeFirestore(fbApp, { localCache: fs.persistentLocalCache(cacheOpts) });
      window._fbCacheMode = 'pysyvä';
    }
  } catch(e){
    // Selain voi estää IndexedDB:n (esim. yksityinen selaus) — ei kaadeta sovellusta
  }
  if(!db){
    db = getFirestore(fbApp);
    window._fbCacheMode = 'muisti';
  }
  OLD_DOC  = doc(db, "arvostelut", "data");
  META_DOC = doc(db, "arvostelut", "meta");
  REVIEWS  = collection(db, "arvostelut", "meta", "reviews");
  return db;
}

let isSaving = false;
let saveQueued = false;
let reviewListenerReady = false;
let metaListenerReady = false;

// Viimeksi pilveen kirjoitettu tila. Näiden avulla tiedetään mikä on muuttunut,
// jottei jokaisella tallennuksella kirjoiteta kaikkia arvosteluja uudelleen.
let lastSavedReviews = new Map();   // id (merkkijono) -> JSON
let lastSavedMeta = null;           // JSON

// Meta-dokumenttia EI kirjoiteta ennen kuin se on kerran luettu palvelimelta.
// Muuten tyhjästä välimuistista syntyvä puutteellinen tila voi ylikirjoittaa
// kategoriat, genret, budjetin ja asetukset.
let metaTrusted = false;

// Kirjoitukset jotka on annettu Firestorelle mutta joita palvelin EI ole
// vielä kuitannut. Nämä elävät toistaiseksi vain selaimen paikallisessa
// välimuistissa (IndexedDB) — jos selaustiedot tyhjennetään, ne katoavat.
const DEL_MARK = '\u0000poistettu';
let pendingWrites = new Map();      // id -> JSON tai DEL_MARK (tämän istunnon kirjoitukset)
let cacheQueuedIds = new Set();     // latauksessa löytyneet kuittaamattomat (aiemmat istunnot)
let pendingMeta = null;             // JSON
let queueStuck = false;             // edellisistä istunnoista jäänyt jono ei liiku
let syncWarnShown = false;

// TMDB token — TÄMÄ ON VAIN OLETUS.
// Asetuksiin tallennettu tunnus (settings.tmdbToken) korvaa tämän
// heti kun asetukset on ladattu pilvestä. Katso syncTmdbToken().
window.tmdbTokenDefault = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyYjhkODg4ZjdkMGZkNmRlNzE4MjIxNTM2NWYzZTlmMSIsIm5iZiI6MTc3NDkwNDg1Ny42MjIwMDAyLCJzdWIiOiI2OWNhZTYxOWIwMGYyNWRlZmJjZTNjY2YiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.EGIEIkcAl8J5FloGkTmahs_L3PQ6WTIuRsV3KLg4t2g";
window.tmdbToken = window.tmdbTokenDefault;

function showStatus(msg, color, duration){
  const el = document.getElementById('saveStatus');
  el.textContent=msg; el.style.background=color; el.style.color='white'; el.style.opacity='1';
  setTimeout(()=>el.style.opacity='0', duration || 2200);
}
window.showStatus = showStatus;

// ── AIKAKATKAISUAPURI ──
// Palauttaa aina ratkeavan lupauksen: { ok:true, value } | { error } | { timedOut:true }.
// Alkuperäinen lupaus jää elämään taustalle — jos yhteys palaa myöhemmin,
// sen omat then-käsittelijät kuittaavat kirjoituksen normaalisti.
function withTimeout(promise, ms){
  let timer = null;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  return Promise.race([
    promise.then(value => ({ ok: true, value }), error => ({ error })),
    timeout
  ]).then(res => { clearTimeout(timer); return res; });
}

// ── SYNKRONOINTIVAROITUS ──
// Pysyvä palkki ruudun alalaidassa aina kun jotain on tallennettu vain
// paikallisesti. Palkki katoaa vasta kun palvelin on kuitannut kaiken.
function ensureSyncBar(){
  let el = document.getElementById('syncWarnBar');
  if(el) return el;

  el = document.createElement('div');
  el.id = 'syncWarnBar';
  el.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:400;display:none;' +
    'align-items:center;gap:10px;background:#991b1b;color:#fff;' +
    'font-size:12.5px;font-weight:600;line-height:1.35;' +
    'padding:10px 14px;padding-bottom:calc(10px + env(safe-area-inset-bottom));' +
    'box-shadow:0 -2px 16px rgba(0,0,0,0.55);';

  const txt = document.createElement('span');
  txt.id = 'syncWarnText';
  txt.style.cssText = 'flex:1;';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '⬇️ Varmuuskopio';
  btn.style.cssText =
    'flex:0 0 auto;background:#fff;color:#991b1b;border:none;border-radius:9px;' +
    'padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer;';
  btn.onclick = (e) => { e.stopPropagation(); if(window.downloadBackup) window.downloadBackup(); };
  // Palkista pääsee suoraan jonon tarkasteluun
  el.style.cursor = 'pointer';
  el.onclick = () => { if(window.openSyncQueue) window.openSyncQueue(); };

  el.appendChild(txt);
  el.appendChild(btn);
  document.body.appendChild(el);
  return el;
}

function updateSyncBanner(){
  const ids = new Set(pendingWrites.keys());
  cacheQueuedIds.forEach(id => ids.add(id));
  const n = ids.size;
  const unsynced = n > 0 || pendingMeta !== null || queueStuck;
  const bar = ensureSyncBar();
  const fab = document.getElementById('fab');

  if(unsynced){
    const msg = n > 0
      ? `⚠️ ${n} ${n === 1 ? 'arvostelu' : 'arvostelua'} ei ole tallennettu pilveen — älä tyhjennä selaustietoja`
      : '⚠️ Tallentamattomia muutoksia odottaa yhteyttä — älä tyhjennä selaustietoja';
    // textContent, ei innerHTML — teksti sisältää arvosteluista johdettuja lukuja
    document.getElementById('syncWarnText').textContent = msg;
    bar.style.display = 'flex';
    // Synkronointivaroitus on tärkeämpi kuin varmuuskopiomuistutus
    if(window.hideBackupReminder) window.hideBackupReminder();
    if(fab) fab.style.bottom = '78px';
    syncWarnShown = true;
  } else {
    bar.style.display = 'none';
    if(fab) fab.style.bottom = (window.backupBarVisible && window.backupBarVisible()) ? '82px' : '';
    if(syncWarnShown){
      syncWarnShown = false;
      showStatus('✅ Kaikki tallennettu pilveen','#22c55e', 3000);
    }
  }
}
window.fbSyncState = function(){
  const ids = new Set(pendingWrites.keys());
  cacheQueuedIds.forEach(id => ids.add(id));
  return { pending: ids.size, meta: pendingMeta !== null, queueStuck };
};

// Yksityiskohtainen lista tallennusjonosta asetuksia varten.
// Kertoo mitkä arvostelut odottavat ja mistä syystä.
window.fbPendingList = function(){
  const rows = [];
  // plainName tulee app-core.js:stä. Moduuli ajetaan sen jälkeen, mutta
  // varmistetaan silti ettei puuttuva funktio kaada koko näkymää.
  const nameOf = (r) => {
    if(!r) return '(tuntematon)';
    try { return window.plainName ? window.plainName(r) : String(r.name || '(nimetön)'); }
    catch(e){ return String(r.name || '(nimetön)'); }
  };
  const byId = new Map();
  (appData.reviews || []).forEach(r => { if(r && r.id != null) byId.set(String(r.id), r); });

  pendingWrites.forEach((val, id) => {
    const r = byId.get(id);
    rows.push({
      id,
      name: val === DEL_MARK ? '(poistettu arvostelu)' : nameOf(r),
      kind: val === DEL_MARK ? 'poisto' : 'tallennus',
      source: 'tämä istunto'
    });
  });

  cacheQueuedIds.forEach(id => {
    if(pendingWrites.has(id)) return;
    const r = byId.get(String(id));
    rows.push({
      id: String(id),
      name: nameOf(r),
      kind: 'tallennus',
      source: 'aiempi istunto'
    });
  });

  return {
    rows,
    meta: pendingMeta !== null,
    queueStuck,
    online: navigator.onLine !== false,
    cacheMode: window._fbCacheMode
  };
};

// Käsin käynnistettävä uudelleenyritys.
// Firestoren oma jono yrittää itsestään, mutta jos yhteys on jäänyt
// puolittaiseen tilaan, verkon katkaisu ja avaus herättää sen. Lisäksi
// tyhjennämme oman jonokirjanpitomme, jotta fbSave lähettää tiedot
// uudelleen eikä ohita niitä "jo jonossa" -tarkistuksessa.
window.fbRetryPending = async function(){
  if(!db) await initDb();
  try{
    await disableNetwork(db);
    await new Promise(r => setTimeout(r, 300));
    await enableNetwork(db);
  } catch(e){ /* verkkotempun epäonnistuminen ei saa estää tallennusta */ }

  pendingWrites.clear();
  cacheQueuedIds.clear();
  pendingMeta = null;
  queueStuck = false;
  updateSyncBanner();

  await window.fbSave();

  // Odota kuittausta lyhyen aikaa, jotta käyttäjä näkee tuloksen heti
  try{
    const res = await withTimeout(waitForPendingWrites(db), 8000);
    if(res && res.timedOut) queueStuck = true;
  } catch(e){}
  updateSyncBanner();
  return window.fbSyncState();
};

// Käynnistyksessä: onko edellisistä istunnoista jäänyt kuittaamattomia
// kirjoituksia jonoon? Näistä oma pendingWrites-kirjanpito ei tiedä mitään,
// koska se elää vain muistissa.
async function checkQueuedWrites(){
  if(!db) return;
  let p;
  try{ p = waitForPendingWrites(db); } catch(e){ return; }
  p.then(() => { queueStuck = false; updateSyncBanner(); }).catch(() => {});
  const res = await withTimeout(p, QUEUE_TIMEOUT);
  if(res && res.timedOut){
    queueStuck = true;
    updateSyncBanner();
  }
}

// ── TMDB-TUNNUKSEN TARKISTUS ──
// Huom: TMDB:n v4-lukutunnuksissa (JWT) ei ole kiinteää "exp"-vanhenemispäivää,
// joten emme voi näyttää todellista vanhenemispäivää — sen sijaan tarkistetaan
// tunnuksen TOIMIVUUS oikealla testihaulla joka kerta kun sovellus käynnistetään,
// ja näytetään "myönnetty"-päivä (JWT:n nbf-kentästä) tiedoksi asetuksissa.
function decodeJwtPayload(token){
  try{
    const parts = token.split('.');
    if(parts.length < 2) return null;
    let payload = parts[1].replace(/-/g,'+').replace(/_/g,'/');
    while(payload.length % 4) payload += '=';
    return JSON.parse(atob(payload));
  } catch(e){ return null; }
}
function tmdbIssuedAt(token){
  const p = decodeJwtPayload(token);
  return (p && p.nbf) ? new Date(p.nbf * 1000).toISOString() : null;
}
window.tmdbIssuedAt = tmdbIssuedAt;
window.tmdbTokenIssuedAt = tmdbIssuedAt(window.tmdbToken);
window._tmdbTokenStatus = { ok: null, checkedAt: null, message: '' };

// Testaa annetun (tai nykyisen) tunnuksen oikealla API-kutsulla.
// Palauttaa { ok, message } jotta asetusten "Testaa"-nappi voi
// kokeilla uutta tunnusta ENNEN kuin se otetaan käyttöön.
window.tmdbTestToken = async function(token){
  const t = token || window.tmdbToken;
  if(!t) return { ok:false, message:'Tunnus puuttuu' };
  try{
    if(window.tmdbNote) window.tmdbNote('/authentication');
    const res = await fetch('https://api.themoviedb.org/3/authentication', {
      headers: { Authorization: `Bearer ${t}` }
    });
    const data = await res.json().catch(()=>({}));
    if(res.ok && data.success) return { ok:true, message:'Toimii normaalisti' };
    return { ok:false, message: data.status_message || `Virhe (HTTP ${res.status})` };
  } catch(e){
    return { ok:false, message:'Verkkovirhe tunnuksen tarkistuksessa' };
  }
};

async function checkTmdbTokenStartup(){
  const r = await window.tmdbTestToken();
  window._tmdbTokenStatus = { ok:r.ok, checkedAt: new Date().toISOString(), message: r.message };
  if(!r.ok && r.message !== 'Verkkovirhe tunnuksen tarkistuksessa'){
    window.showStatus('⚠️ TMDB-tunnus ei toimi — katso Asetukset', '#dc2626', 6000);
  }
  if(document.getElementById('settingsModal')?.classList.contains('open') && window.refreshTmdbStatusInSettings){
    window.refreshTmdbStatusInSettings();
  }
}
window.recheckTmdbToken = checkTmdbTokenStartup;
checkTmdbTokenStartup();

// ── APUFUNKTIOT ──

// Firestore ei hyväksy undefined-arvoja. JSON-kierros poistaa ne
// ja varmistaa samalla ettei mukana ole funktioita tai muuta kelvotonta.
function clean(obj){
  return JSON.parse(JSON.stringify(obj));
}

function metaObject(){
  // Tyhjää kategoria- tai genrelistaa ei kirjoiteta koskaan. Sovellus on
  // käyttökelvoton ilman kategorioita, joten tyhjä lista on aina virhe.
  const cats = (Array.isArray(appData.categories) && appData.categories.length)
    ? appData.categories : [...DEFAULT_CATS];
  const gens = (Array.isArray(appData.genres) && appData.genres.length)
    ? appData.genres : [...DEFAULT_GENRES];
  return {
    categories: cats,
    genres:     gens,
    // Alalajit puuttuivat metasta kokonaan, joten itse luodut alalajit
    // katosivat aina seuraavassa latauksessa ja palautuivat oletuksiin.
    subcats:    appData.subcats || {},
    budget:     appData.budget || { monthlyPrice: 26.90, periods: [] },
    settings:   appData.settings || {},
    schema:     SCHEMA
  };
}

// Kokoaa appData-objektin metasta ja arvostelutaulukosta
function assembleAppData(meta, reviews){
  const m = meta || {};
  return {
    categories: (Array.isArray(m.categories) && m.categories.length) ? m.categories : [...DEFAULT_CATS],
    genres:     (Array.isArray(m.genres) && m.genres.length) ? m.genres : [...DEFAULT_GENRES],
    subcats:    (m.subcats && typeof m.subcats === 'object') ? m.subcats : null,
    budget:     m.budget || { monthlyPrice: 26.90, periods: [] },
    settings:   m.settings || {},
    reviews:    reviews
  };
}

function rememberSaved(){
  lastSavedReviews = new Map();
  (appData.reviews||[]).forEach(r => lastSavedReviews.set(String(r.id), JSON.stringify(r)));
  lastSavedMeta = JSON.stringify(metaObject());
}

// ── TALLENNUS ──
// Kirjoittaa vain muuttuneet arvostelut ja metan. Rajapinta ulospäin
// on sama kuin ennen: await window.fbSave().

// Palvelin kuittasi erän → se on oikeasti pilvessä
function confirmChunk(chunk){
  chunk.forEach(op => {
    if(op.kind === 'set'){
      lastSavedReviews.set(op.id, op.js);
      if(pendingWrites.get(op.id) === op.js) pendingWrites.delete(op.id);
    } else {
      lastSavedReviews.delete(op.id);
      if(pendingWrites.get(op.id) === DEL_MARK) pendingWrites.delete(op.id);
    }
    cacheQueuedIds.delete(op.id);
  });
  updateSyncBanner();
}

// Kirjoitus hylättiin pysyvästi → poistetaan odottavista, jotta se
// yritetään uudelleen seuraavalla tallennuksella
function releaseChunk(chunk){
  chunk.forEach(op => {
    const mark = op.kind === 'set' ? op.js : DEL_MARK;
    if(pendingWrites.get(op.id) === mark) pendingWrites.delete(op.id);
  });
  updateSyncBanner();
}

// ── PAKOTETTU UUDELLEENLATAUS (pull-to-refresh) ──
// Kuuntelijat pitävät datan ajan tasalla itsestään, mutta jos yhteys on
// ollut poikki tai kuuntelija on katkennut, muistissa oleva kuva voi olla
// vanha. Tämä lukee arvostelut ja metan suoraan PALVELIMELTA välimuistin
// ohi, ja palauttaa tiedon siitä muuttuiko mikään.
window.fbRefresh = async function(){
  if(window._sandbox) throw new Error('Testitila on päällä');
  if(!db) await initDb();
  if(!REVIEWS || !META_DOC) throw new Error('Ei yhteyttä tietokantaan');

  const [snap, mSnap] = await Promise.all([
    withTimeout(getDocsFromServer(REVIEWS), COMMIT_TIMEOUT),
    withTimeout(getDocFromServer(META_DOC), COMMIT_TIMEOUT)
  ]);

  const fresh = snap.docs.map(d => d.data()).filter(Boolean);
  const before = JSON.stringify(appData.reviews || []);

  appData.reviews = fresh;
  if(mSnap.exists()){
    const m = mSnap.data();
    appData.categories = m.categories || appData.categories;
    appData.genres     = m.genres || appData.genres;
    if(m.subcats && typeof m.subcats === 'object') appData.subcats = m.subcats;
    appData.budget     = m.budget || appData.budget;
    appData.settings   = m.settings || appData.settings;
    metaTrusted = true;
  }

  try{ if(typeof ensureSettings === 'function') ensureSettings(); } catch(e){}
  if(typeof GENRES !== 'undefined') GENRES = [...(appData.genres || [])];
  if(window.migrateYearField) window.migrateYearField();

  // Palvelimen tilannekuva on nyt totuus — nollataan jonokirjanpito,
  // jottei fbSave lähetä samoja tietoja heti perään takaisin.
  cacheQueuedIds = new Set();
  rememberSaved();
  updateSyncBanner();

  if(window.applyTheme) window.applyTheme();
  if(appData.settings && appData.settings.accent && window.applyAccent) window.applyAccent(appData.settings.accent);
  renderAll();

  return { count: fresh.length, changed: before !== JSON.stringify(fresh) };
};

window.fbSave = async function(){
  // TESTITILA: mitään ei kirjoiteta pilveen eikä paikalliseen
  // varmuuskopioon. Muutokset elävät vain muistissa ja katoavat
  // kun testitila suljetaan.
  if(window._sandbox){
    if(window.sandboxTouched) window.sandboxTouched();
    return;
  }
  // TÄRKEÄ: paikallinen varmuuskopio kirjoitetaan ENNEN isSaving-tarkistusta.
  // Aiemmin se oli tarkistuksen jälkeen, jolloin jumiin jäänyt tallennus
  // esti myös varmuuskopion syntymisen.
  try{
    localStorage.setItem('arvostelut_bkp', JSON.stringify(appData));
  } catch(e){ /* localStorage voi olla täynnä — ei kaadeta tallennusta */ }

  if(isSaving){ saveQueued = true; return; }
  isSaving = true;
  if(!db) await initDb();

  try{
    const ops = [];
    const seen = new Set();

    (appData.reviews || []).forEach(r => {
      if(r == null || r.id == null) return;
      const id = String(r.id);
      seen.add(id);
      const js = JSON.stringify(r);
      if(lastSavedReviews.get(id) === js) return;   // jo pilvessä
      if(pendingWrites.get(id) === js) return;      // jo jonossa samalla sisällöllä
      ops.push({ kind:'set', id, data:r, js });
    });

    lastSavedReviews.forEach((_, id) => {
      if(seen.has(id)) return;
      if(pendingWrites.get(id) === DEL_MARK) return;
      ops.push({ kind:'del', id });
    });

    const meta = metaObject();
    const metaJs = JSON.stringify(meta);
    const metaChanged = metaTrusted && metaJs !== lastSavedMeta && metaJs !== pendingMeta;

    if(!ops.length && !metaChanged){
      isSaving = false;
      if(saveQueued){ saveQueued = false; return window.fbSave(); }
      return;
    }

    showStatus('💾 Tallennetaan...','#f97316');

    // Kaikki erät annetaan Firestorelle heti. Offline-tilassa ne menevät
    // paikalliseen jonoon ja lähtevät myöhemmin itsestään.
    const commits = [];

    for(let i = 0; i < ops.length; i += BATCH_MAX){
      const chunk = ops.slice(i, i + BATCH_MAX);
      const batch = writeBatch(db);
      chunk.forEach(op => {
        const ref = doc(REVIEWS, op.id);
        if(op.kind === 'set') batch.set(ref, clean(op.data));
        else batch.delete(ref);
        pendingWrites.set(op.id, op.kind === 'set' ? op.js : DEL_MARK);
      });

      const p = batch.commit();
      // Myöhäinenkin kuittaus otetaan vastaan: jos yhteys palaa vasta
      // aikakatkaisun jälkeen, varoituspalkki katoaa silloin.
      p.then(() => confirmChunk(chunk), () => releaseChunk(chunk));
      commits.push(p);
    }

    if(metaChanged){
      pendingMeta = metaJs;
      const p = setDoc(META_DOC, clean(meta), { merge: true });
      p.then(
        () => { lastSavedMeta = metaJs; if(pendingMeta === metaJs) pendingMeta = null; updateSyncBanner(); },
        () => { if(pendingMeta === metaJs) pendingMeta = null; updateSyncBanner(); }
      );
      commits.push(p);
    }

    updateSyncBanner();

    const res = await withTimeout(Promise.all(commits), COMMIT_TIMEOUT);

    if(res && res.timedOut){
      // Kirjoitukset ovat paikallisessa jonossa, eivät pilvessä.
      // Varoituspalkki jää näkyviin kunnes palvelin kuittaa ne.
      showStatus('⏳ Ei yhteyttä — tallennus jäi odottamaan','#f59e0b', 5000);
    } else if(res && res.error){
      const e = res.error;
      showStatus('❌ Virhe: ' + (e && e.code ? e.code : 'tallennus epäonnistui'), '#dc2626', 5000);
    } else {
      showStatus('✅ Tallennettu','#22c55e');
    }
  } catch(e){
    showStatus('❌ Virhe: ' + (e && e.code ? e.code : 'tallennus epäonnistui'), '#dc2626', 5000);
  }

  updateSyncBanner();
  isSaving = false;
  if(saveQueued){ saveQueued = false; return window.fbSave(); }
};

// Kertoo asetuksille kuinka iso suurin yksittäinen dokumentti on
window.fbSizeInfo = function(){
  let largest = 0, largestName = '';
  (appData.reviews||[]).forEach(r => {
    const n = new Blob([JSON.stringify(r)]).size;
    if(n > largest){ largest = n; largestName = String(r.name||'').split('\n')[0]; }
  });
  const metaSize = new Blob([JSON.stringify(metaObject())]).size;
  return { largest, largestName, metaSize, count: (appData.reviews||[]).length };
};

// ── VANHA PILVIKOPIO (arvostelut/data) ──
// Tätä ei enää käytetä automaattisesti missään. Asetuksista voi katsoa
// raportin siitä mitä vanhassa dokumentissa on, ja halutessaan lisätä
// sieltä VAIN ne arvostelut jotka puuttuvat nykyisestä datasta.
// Olemassa olevien päälle ei kirjoiteta koskaan.

function ratedParts(r){
  const p = (r && Array.isArray(r.parts)) ? r.parts : [];
  return p.filter(x => x && Number(x.score) > 0).length;
}

// Lukee vanhan dokumentin palvelimelta ja vertaa sitä nykyiseen dataan
window.fbOldDocReport = async function(){
  await initDb();
  let snap;
  try{
    snap = await getDocFromServer(OLD_DOC);
  } catch(e){
    return { ok:false, error:'Vanhaa dokumenttia ei saatu luettua palvelimelta. Tarkista yhteys.' };
  }
  if(!snap.exists()) return { ok:false, error:'Vanhaa dokumenttia arvostelut/data ei ole olemassa.' };

  let old;
  try{ old = JSON.parse(snap.data().json); }
  catch(e){ return { ok:false, error:'Vanhan dokumentin sisältöä ei voitu jäsentää.' }; }

  const oldReviews = Array.isArray(old.reviews) ? old.reviews : [];
  const now = new Map();
  (appData.reviews||[]).forEach(r => { if(r && r.id != null) now.set(String(r.id), r); });

  const missing = [], differing = [];
  let same = 0;

  oldReviews.forEach(r => {
    if(!r || r.id == null) return;
    const id = String(r.id);
    const cur = now.get(id);
    const info = {
      id,
      name: String(r.name || '(nimetön)').split('\n')[0],
      cat:  String(r.category || ''),
      oldScore: Number(r.score) || 0,
      oldParts: ratedParts(r)
    };
    if(!cur){
      missing.push(info);
    } else if(JSON.stringify(cur) !== JSON.stringify(r)){
      info.nowScore = Number(cur.score) || 0;
      info.nowParts = ratedParts(cur);
      differing.push(info);
    } else {
      same++;
    }
  });

  const onlyOld = (a, b) => (a||[]).filter(x => !(b||[]).includes(x));

  return {
    ok: true,
    count: oldReviews.length,
    nowCount: (appData.reviews||[]).length,
    savedAt: snap.data().migratedAt || snap.data().savedAt || null,
    migratedToSchema: snap.data().migratedToSchema || null,
    missing, differing, same,
    catsOnlyOld:   onlyOld(old.categories, appData.categories),
    genresOnlyOld: onlyOld(old.genres, appData.genres),
    oldMeta: {
      categories: Array.isArray(old.categories) ? old.categories : [],
      genres:     Array.isArray(old.genres) ? old.genres : [],
      subcats:    (old.subcats && typeof old.subcats === 'object') ? old.subcats : null,
      budget:     old.budget || null,
      settings:   old.settings || {}
    }
  };
};

// Palauttaa VAIN asetukset (kategoriat, genret, budjetti, asetukset).
// Arvosteluihin ei kosketa. Tämä on tarkoituksellinen käyttäjän toiminto,
// joten se ohittaa metaTrusted-suojauksen.
window.fbRestoreMeta = async function(src){
  if(!src) return false;
  await initDb();

  if(Array.isArray(src.categories) && src.categories.length) appData.categories = [...src.categories];
  if(Array.isArray(src.genres) && src.genres.length)         appData.genres     = [...src.genres];
  if(src.subcats && typeof src.subcats === 'object') appData.subcats = src.subcats;
  if(src.budget)   appData.budget   = src.budget;
  if(src.settings) appData.settings = src.settings;

  try{ if(typeof ensureSettings === 'function') ensureSettings(); } catch(e){}
  if(typeof GENRES !== 'undefined') GENRES = [...(appData.genres||[])];

  try{
    await setDoc(META_DOC, clean(metaObject()), { merge: true });
  } catch(e){
    return false;
  }
  metaTrusted = true;
  lastSavedMeta = JSON.stringify(metaObject());
  if(appData.settings && appData.settings.accent && window.applyAccent) window.applyAccent(appData.settings.accent);
  if(window.renderAll) renderAll();
  return true;
};

// Lisää vain annetut id:t. Kirjoitus menee normaalin fbSave()-polun kautta,
// joten muutosseuranta ja synkronointivaroitus toimivat samalla tavalla.
window.fbRestoreMissing = async function(ids){
  const want = new Set((ids||[]).map(String));
  if(!want.size) return 0;
  await initDb();

  let snap;
  try{ snap = await getDocFromServer(OLD_DOC); } catch(e){ return -1; }
  if(!snap.exists()) return -1;

  let old;
  try{ old = JSON.parse(snap.data().json); } catch(e){ return -1; }

  const have = new Set((appData.reviews||[]).map(r => r && r.id != null ? String(r.id) : ''));
  let added = 0;
  (Array.isArray(old.reviews) ? old.reviews : []).forEach(r => {
    if(!r || r.id == null) return;
    const id = String(r.id);
    if(!want.has(id) || have.has(id)) return;   // ei koskaan olemassa olevan päälle
    if(r.queue) delete r.queue;
    appData.reviews.push(r);
    have.add(id);
    added++;
  });

  if(added){
    if(window.renderAll) renderAll();
    await window.fbSave();
  }
  return added;
};

// ── LATAUS ──
async function fbLoad(){
  await initDb();
  let loaded = false;
  let metaBroken = false;

  try{
    // SUOJAUS 1: meta luetaan ensisijaisesti PALVELIMELTA.
    // Tyhjän välimuistin kanssa getDoc() ei heitä virhettä vaan ratkeaa
    // tilannekuvalla jossa exists() === false ja fromCache === true.
    // Vanha koodi tulkitsi sen "metaa ei ole" ja käynnisti migraation,
    // joka kirjoitti elokuun varmuuskopion kaiken päälle.
    let metaSnap = null;
    let serverAnswered = false;
    try{
      metaSnap = await getDocFromServer(META_DOC);
      serverAnswered = true;
    } catch(e){
      try{ metaSnap = await getDoc(META_DOC); } catch(e2){ metaSnap = null; }
    }

    const schemaOk = !!(metaSnap && metaSnap.exists() && metaSnap.data().schema >= SCHEMA);

    if(schemaOk){
      // Uusi rakenne.
      // Arvosteluja EI haeta erikseen getDocs-kutsulla: kuuntelijan ensimmäinen
      // tilannekuva sisältää saman datan, joten erillinen haku maksaisi
      // jokaisen dokumentin lukuna kahteen kertaan.
      appData = assembleAppData(metaSnap.data(), []);
      metaTrusted = true;
      await startReviewListener();
      loaded = true;

    } else if(!serverAnswered){
      // SUOJAUS 2: emme saaneet palvelimelta vastausta, joten emme TIEDÄ
      // onko rakenne vanha. Tässä tilassa ei kosketa mihinkään.
      showStatus('⚠️ Ei yhteyttä palvelimeen','#f59e0b', 5000);
      if(metaSnap && metaSnap.exists()) appData = assembleAppData(metaSnap.data(), []);
      await startReviewListener();
      // Välimuistista saatu tila on tuoreempi kuin localStorage-kopio
      if((appData.reviews||[]).length > 0 || (metaSnap && metaSnap.exists())) loaded = true;

    } else {
      // Palvelin vastasi: metaa ei ole tai schema on vanha.
      // SUOJAUS 3: onko uusi rakenne kuitenkin jo olemassa?
      let hasReviews = false;
      let probeOk = true;
      try{
        const probe = await getDocsFromServer(query(REVIEWS, limit(1)));
        hasReviews = !probe.empty;
      } catch(e){
        probeOk = false;
      }

      if(!probeOk){
        // Emme saaneet varmuutta → ei palautusta missään tilanteessa
        showStatus('⚠️ Ei yhteyttä palvelimeen','#f59e0b', 5000);
        if(metaSnap && metaSnap.exists()) appData = assembleAppData(metaSnap.data(), []);
        await startReviewListener();
        if((appData.reviews||[]).length > 0 || (metaSnap && metaSnap.exists())) loaded = true;

      } else if(hasReviews){
        // Arvostelut ovat tallessa, mutta metaa ei saatu. Ladataan
        // oletusasetuksilla eikä kirjoiteta mitään: metaTrusted jää
        // epätodeksi kunnes kuuntelija tuo palvelimelta oikean tilan.
        appData = assembleAppData(metaSnap.exists() ? metaSnap.data() : null, []);
        await startReviewListener();
        loaded = true;
        metaBroken = true;

      } else {
        // Uusi rakenne on aidosti tyhjä. Vanhaa dokumenttia EI kosketa
        // automaattisesti — palautus tehdään käsin Asetuksista, jotta
        // mikään lataus ei voi kirjoittaa elokuun tilannekuvaa datan päälle.
        showStatus('⚠️ Pilvestä ei löytynyt arvosteluja','#f59e0b', 6000);
        await startReviewListener();
      }
    }
  } catch(e){
    showStatus('⚠️ Yhteysvirhe','#f59e0b', 4000);
  }

  if(!loaded){
    // Ei mitään pilvessä — kokeile paikallista varmuuskopiota
    try{
      const bkp = localStorage.getItem('arvostelut_bkp');
      if(bkp) appData = JSON.parse(bkp);
    } catch(e){}
  }

  if(appData.queue) delete appData.queue;

  // Siirrä nimeen upotetut vuosiluvut omaan kenttäänsä (ajetaan kerran)
  let needsSave = false;
  try{
    if(window.migrateYearField && window.migrateYearField()) needsSave = true;
  } catch(e){}

  initApp();
  // Vasta initApp():n jälkeen — se täydentää puuttuvat oletusasetukset,
  // jotka muuten näyttäisivät heti "muuttuneilta" ja aiheuttaisivat turhan kirjoituksen.
  rememberSaved();

  // Kuittaamattomia EI saa merkitä tallennetuiksi — muuten niitä ei
  // koskaan yritetä kirjoittaa uudelleen ja ne jäävät pelkkään välimuistiin.
  cacheQueuedIds.forEach(id => lastSavedReviews.delete(id));
  updateSyncBanner();
  checkQueuedWrites();

  // Jos migraatio muutti jotain tai pilvi oli tyhjä mutta paikallista dataa löytyi
  if(needsSave || (!loaded && (appData.reviews||[]).length > 0)){
    lastSavedReviews = new Map();   // pakota kaikkien kirjoitus
    lastSavedMeta = null;
    await window.fbSave();
  } else if(metaBroken){
    // Meta puuttui tai schema oli vanha. Mitään ei kirjoiteta — käyttäjä
    // näkee varoituksen ja voi palauttaa asetukset Asetuksista.
    showStatus('⚠️ Asetuksia ei saatu ladattua','#f59e0b', 6000);
  }

  startMetaListener();
  if(!reviewListenerReady) startReviewListener();   // esim. yhteysvirheen jälkeen

  // Latausaika suorituskykytietoja varten
  window._loadFinishedAt = Date.now();

  // Julisteiden polut talteen kirjautumisruudun kollaasia varten.
  // Kirjautumisruudulla ei ole vielä yhteyttä pilveen, joten kuvat
  // otetaan edellisen käynnin listasta.
  try{ if(window.cacheLoginPosters) window.cacheLoginPosters(); } catch(e){}

  // Muistutus näytetään vasta kun näkymä on ehtinyt piirtyä
  setTimeout(() => {
    try{ if(window.maybeShowBackupReminder) window.maybeShowBackupReminder(); } catch(e){}
  }, 1800);
}

// ── VARMUUSKOPIOMUISTUTUS ──
// Päiväys asuu meta-dokumentissa (settings.lastBackupAt), ei localStoragessa.
// Selausdatan tyhjennys ei siis nollaa laskuria.
window.fbBackupDays = function(){
  const t = appData.settings && appData.settings.lastBackupAt;
  if(!t) return null;
  const ms = Date.now() - Date.parse(t);
  if(!isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86400000);
};

window.fbMarkBackupDone = async function(){
  try{ if(typeof ensureSettings === 'function') ensureSettings(); } catch(e){}
  if(!appData.settings) appData.settings = {};
  appData.settings.lastBackupAt = new Date().toISOString();
  try{ await window.fbSave(); } catch(e){}
};

// ── REAALIAIKAINEN SEURANTA ──
// Arvostelukuuntelijan ENSIMMÄINEN tilannekuva toimii samalla ensilatauksena.
// Palautettu lupaus ratkeaa kun data on muistissa (tai aikakatkaisun jälkeen,
// jottei sovellus jää roikkumaan jos verkko ei vastaa).
function startReviewListener(){
  if(reviewListenerReady) return Promise.resolve();
  reviewListenerReady = true;

  return new Promise(resolve => {
    let first = true;
    const finishFirst = () => { if(first){ first = false; resolve(); } };
    const timer = setTimeout(finishFirst, 8000);

    onSnapshot(REVIEWS, snap => {
      // Testitilassa muistissa oleva data on tarkoituksella "väärää" —
      // pilvestä tuleva päivitys pyyhkisi kokeilut kesken kaiken.
      if(window._sandbox && !first) return;
      if(first){
        clearTimeout(timer);
        appData.reviews = snap.docs.map(d => d.data()).filter(Boolean);
        // Dokumentit joita palvelin ei ole kuitannut elävät vain tämän
        // selaimen välimuistissa. Merkitään ne, jotta ne eivät päädy
        // rememberSaved():ssa "jo tallennettujen" joukkoon.
        cacheQueuedIds = new Set();
        snap.docs.forEach(d => { if(d.metadata && d.metadata.hasPendingWrites) cacheQueuedIds.add(d.id); });
        first = false;
        resolve();
        return;
      }

      // Omat kirjoitukset kaikuvat takaisin — ne ohitetaan
      if(snap.metadata.hasPendingWrites) return;
      let changed = false;

      snap.docChanges().forEach(ch => {
        const data = ch.doc.data();
        const id = ch.doc.id;
        if(!appData.reviews) appData.reviews = [];
        const idx = appData.reviews.findIndex(r => String(r.id) === id);

        if(ch.type === 'removed'){
          if(idx > -1){ appData.reviews.splice(idx, 1); changed = true; }
          lastSavedReviews.delete(id);
        } else {
          const js = JSON.stringify(data);
          if(idx > -1){
            if(JSON.stringify(appData.reviews[idx]) !== js){ appData.reviews[idx] = data; changed = true; }
          } else {
            appData.reviews.push(data); changed = true;
          }
          lastSavedReviews.set(id, js);
          if(pendingWrites.get(id) === js) pendingWrites.delete(id);
        }
        // Tämä tilannekuva tuli palvelimelta → dokumentti on pilvessä
        cacheQueuedIds.delete(id);
      });

      updateSyncBanner();

      if(changed){
        if(window.migrateYearField) window.migrateYearField();
        renderAll();
      }
    }, err => {
      clearTimeout(timer);
      reviewListenerReady = false;
      showStatus('⚠️ Synkronointi katkesi','#f59e0b', 4000);
      finishFirst();
    });
  });
}

function startMetaListener(){
  if(metaListenerReady) return;
  metaListenerReady = true;

  onSnapshot(META_DOC, snap => {
    if(window._sandbox) return;
    if(snap.metadata.hasPendingWrites) return;
    // Palvelimelta tullut tilannekuva — vasta nyt metaa saa kirjoittaa
    if(!snap.metadata.fromCache) metaTrusted = true;
    if(!snap.exists()) return;
    const m = snap.data();
    appData.categories = m.categories || appData.categories;
    appData.genres     = m.genres || appData.genres;
    if(m.subcats && typeof m.subcats === 'object') appData.subcats = m.subcats;
    appData.budget     = m.budget || appData.budget;
    appData.settings   = m.settings || appData.settings;
    // Täydennä oletusasetukset ENNEN vertailuarvon laskentaa, muutoin
    // ne näyttäisivät muutokselta ja aiheuttaisivat turhan kirjoituksen.
    try{ if(typeof ensureSettings === 'function') ensureSettings(); } catch(e){}
    lastSavedMeta = JSON.stringify(metaObject());
    if(typeof GENRES !== 'undefined') GENRES = [...(appData.genres||[])];
    if(appData.settings && appData.settings.accent && window.applyAccent) window.applyAccent(appData.settings.accent);
    // Teema voi muuttua toiselta laitteelta — päivitetään sekin
    if(window.applyTheme) window.applyTheme();
    if(window.renderThemeSettings) window.renderThemeSettings();
    renderAll();
  }, err => { metaListenerReady = false; });
}

// KIRJAUTUMINEN
window.doLogin = async function(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  err.textContent = '';
  if(!email || !password){ err.textContent = 'Täytä sähköposti ja salasana.'; return; }
  btn.textContent = 'Kirjaudutaan...';
  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged hoitaa loput
  } catch(e) {
    btn.textContent = 'Kirjaudu sisään';
    btn.disabled = false;
    if(e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'){
      err.textContent = 'Väärä sähköposti tai salasana.';
    } else if(e.code === 'auth/too-many-requests'){
      err.textContent = 'Liian monta yritystä. Yritä myöhemmin.';
    } else {
      err.textContent = 'Kirjautumisvirhe. Tarkista yhteys.';
    }
  }
};

// Enter-näppäin kirjautumisessa
document.getElementById('loginPassword').addEventListener('keydown', e => {
  if(e.key === 'Enter') window.doLogin();
});
document.getElementById('loginEmail').addEventListener('keydown', e => {
  if(e.key === 'Enter') document.getElementById('loginPassword').focus();
});

// ULOSKIRJAUTUMINEN
window.doSignOut = async function(){
  if(!confirm('Kirjaudutaanko ulos?')) return;
  await signOut(auth);
};

// AUTENTIKOINTITILAN SEURANTA
onAuthStateChanged(auth, user => {
  if(user){
    // Kirjautunut — piilota login, lataa data
    window.fbUserEmail = user.email || '';
    window.fbUserUid = user.uid || '';
    document.getElementById('loginScreen').style.display = 'none';
    fbLoad();
  } else {
    // Ei kirjautunut — näytä login
    window.fbUserEmail = '';
    window.fbUserUid = '';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginBtn').textContent = 'Kirjaudu sisään';
    document.getElementById('loginBtn').disabled = false;
  }
});
