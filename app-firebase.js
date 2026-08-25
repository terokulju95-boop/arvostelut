// ══ ARVOSTELUT · Firebase ══
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
  getFirestore, doc, getDoc, setDoc, collection,
  onSnapshot, writeBatch, updateDoc, waitForPendingWrites
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

// Kirjoitukset jotka on annettu Firestorelle mutta joita palvelin EI ole
// vielä kuitannut. Nämä elävät toistaiseksi vain selaimen paikallisessa
// välimuistissa (IndexedDB) — jos selaustiedot tyhjennetään, ne katoavat.
const DEL_MARK = '\u0000poistettu';
let pendingWrites = new Map();      // id -> JSON tai DEL_MARK (tämän istunnon kirjoitukset)
let cacheQueuedIds = new Set();     // latauksessa löytyneet kuittaamattomat (aiemmat istunnot)
let pendingMeta = null;             // JSON
let queueStuck = false;             // edellisistä istunnoista jäänyt jono ei liiku
let syncWarnShown = false;

// TMDB token
window.tmdbToken = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyYjhkODg4ZjdkMGZkNmRlNzE4MjIxNTM2NWYzZTlmMSIsIm5iZiI6MTc3NDkwNDg1Ny42MjIwMDAyLCJzdWIiOiI2OWNhZTYxOWIwMGYyNWRlZmJjZTNjY2YiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.EGIEIkcAl8J5FloGkTmahs_L3PQ6WTIuRsV3KLg4t2g";

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
  btn.onclick = () => { if(window.downloadBackup) window.downloadBackup(); };

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
    if(fab) fab.style.bottom = '78px';
    syncWarnShown = true;
  } else {
    bar.style.display = 'none';
    if(fab) fab.style.bottom = '';
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
const tmdbPayload = decodeJwtPayload(window.tmdbToken);
window.tmdbTokenIssuedAt = (tmdbPayload && tmdbPayload.nbf) ? new Date(tmdbPayload.nbf * 1000).toISOString() : null;
window._tmdbTokenStatus = { ok: null, checkedAt: null, message: '' };

async function checkTmdbTokenStartup(){
  try{
    const res = await fetch('https://api.themoviedb.org/3/authentication', {
      headers: { Authorization: `Bearer ${window.tmdbToken}` }
    });
    const data = await res.json().catch(()=>({}));
    if(res.ok && data.success){
      window._tmdbTokenStatus = { ok:true, checkedAt: new Date().toISOString(), message:'Toimii normaalisti' };
    } else {
      window._tmdbTokenStatus = { ok:false, checkedAt: new Date().toISOString(), message: data.status_message || `Virhe (HTTP ${res.status})` };
      window.showStatus('⚠️ TMDB-tunnus ei toimi — katso Asetukset', '#dc2626', 6000);
    }
  } catch(e){
    window._tmdbTokenStatus = { ok:false, checkedAt: new Date().toISOString(), message: 'Verkkovirhe tunnuksen tarkistuksessa' };
  }
  if(document.getElementById('settingsModal')?.classList.contains('open') && window.refreshTmdbStatusInSettings){
    window.refreshTmdbStatusInSettings();
  }
}
checkTmdbTokenStartup();

// ── APUFUNKTIOT ──

// Firestore ei hyväksy undefined-arvoja. JSON-kierros poistaa ne
// ja varmistaa samalla ettei mukana ole funktioita tai muuta kelvotonta.
function clean(obj){
  return JSON.parse(JSON.stringify(obj));
}

function metaObject(){
  return {
    categories: appData.categories || [],
    genres:     appData.genres || [],
    budget:     appData.budget || { monthlyPrice: 26.90, periods: [] },
    settings:   appData.settings || {},
    schema:     SCHEMA
  };
}

// Kokoaa appData-objektin metasta ja arvostelutaulukosta
function assembleAppData(meta, reviews){
  return {
    categories: meta.categories || [],
    genres:     meta.genres || [],
    budget:     meta.budget || { monthlyPrice: 26.90, periods: [] },
    settings:   meta.settings || {},
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

window.fbSave = async function(){
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
    const metaChanged = metaJs !== lastSavedMeta && metaJs !== pendingMeta;

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

// ── MIGRAATIO VANHASTA RAKENTEESTA ──
async function migrateFromOldDoc(oldData){
  showStatus('🔄 Päivitetään tietorakennetta...','#f97316', 8000);

  // Jono-ominaisuutta ei ole käytössä — ei siirretä sitä uuteen rakenteeseen
  if(oldData.queue) delete oldData.queue;

  const reviews = Array.isArray(oldData.reviews) ? oldData.reviews : [];
  for(let i = 0; i < reviews.length; i += BATCH_MAX){
    const batch = writeBatch(db);
    reviews.slice(i, i + BATCH_MAX).forEach(r => {
      if(r && r.id != null) batch.set(doc(REVIEWS, String(r.id)), clean(r));
    });
    await batch.commit();
  }

  await setDoc(META_DOC, clean({
    categories: oldData.categories || [],
    genres:     oldData.genres || [],
    budget:     oldData.budget || { monthlyPrice: 26.90, periods: [] },
    settings:   oldData.settings || {},
    schema:     SCHEMA,
    migratedAt: new Date().toISOString(),
    migratedFrom: 'arvostelut/data'
  }));

  // Vanhaan dokumenttiin jätetään merkintä, mutta sitä EI poisteta.
  // Se jää koskemattomaksi varmuuskopioksi.
  try{
    await updateDoc(OLD_DOC, { migratedToSchema: SCHEMA, migratedAt: new Date().toISOString() });
  } catch(e){ /* ei kriittinen */ }

  showStatus('✅ Tietorakenne päivitetty','#22c55e');
  return reviews;
}

// ── LATAUS ──
async function fbLoad(){
  await initDb();
  let loaded = false;

  try{
    const metaSnap = await getDoc(META_DOC);

    if(metaSnap.exists() && metaSnap.data().schema >= SCHEMA){
      // Uusi rakenne.
      // Arvosteluja EI haeta erikseen getDocs-kutsulla: kuuntelijan ensimmäinen
      // tilannekuva sisältää saman datan, joten erillinen haku maksaisi
      // jokaisen dokumentin lukuna kahteen kertaan.
      appData = assembleAppData(metaSnap.data(), []);
      await startReviewListener();
      loaded = true;
    } else {
      // Vanha rakenne → siirretään uuteen
      const oldSnap = await getDoc(OLD_DOC);
      if(oldSnap.exists()){
        const oldData = JSON.parse(oldSnap.data().json);
        const reviews = await migrateFromOldDoc(oldData);
        if(oldData.queue) delete oldData.queue;
        oldData.reviews = reviews;
        appData = oldData;
        loaded = true;
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
  }

  startMetaListener();
  if(!reviewListenerReady) startReviewListener();   // esim. yhteysvirheen jälkeen
}

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
    if(!snap.exists() || snap.metadata.hasPendingWrites) return;
    const m = snap.data();
    appData.categories = m.categories || appData.categories;
    appData.genres     = m.genres || appData.genres;
    appData.budget     = m.budget || appData.budget;
    appData.settings   = m.settings || appData.settings;
    // Täydennä oletusasetukset ENNEN vertailuarvon laskentaa, muutoin
    // ne näyttäisivät muutokselta ja aiheuttaisivat turhan kirjoituksen.
    try{ if(typeof ensureSettings === 'function') ensureSettings(); } catch(e){}
    lastSavedMeta = JSON.stringify(metaObject());
    if(typeof GENRES !== 'undefined') GENRES = [...(appData.genres||[])];
    if(appData.settings && appData.settings.accent && window.applyAccent) window.applyAccent(appData.settings.accent);
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
    document.getElementById('loginScreen').style.display = 'none';
    fbLoad();
  } else {
    // Ei kirjautunut — näytä login
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginBtn').textContent = 'Kirjaudu sisään';
    document.getElementById('loginBtn').disabled = false;
  }
});
