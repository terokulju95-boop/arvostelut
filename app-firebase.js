// ══ ARVOSTELUT · Firebase ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_FIREBASE = '2026-10-30.4';
// Moduuli (type="module"): ajetaan aina tavallisten skriptien JÄLKEEN.
// Ulospäin näkyvät funktiot asetetaan window-objektiin.
//
// TIETORAKENNE (schema 2, split):
//   arvostelut/meta                  → kategoriat, genret, alalajit, budjetti, asetukset
//   arvostelut/meta/reviews/{id}     → yksi arvostelu = yksi dokumentti
//   arvostelut/meta/watchlist/{id}   → yksi katselulistan teos = yksi dokumentti
//   arvostelut/meta/lists/{id}       → yksi oma lista = yksi dokumentti
//   arvostelut/meta/dvds/{id}        → yksi levy = yksi dokumentti
//   arvostelut/meta_v2_backup        → kopio metan taulukoista ennen pilkkomista
//   arvostelut/data                  → VANHA rakenne, jätetään koskematta varmuuden vuoksi
//
// Katselulista, omat listat ja DVD-hylly asuivat ennen meta-dokumentin
// taulukoissa. Firestoren raja on 1 Mt per dokumentti, ja jokainen
// asetusmuutos kirjoitti ne kaikki uudelleen. Nyt ne ovat omissa
// alikokoelmissaan samaan tapaan kuin arvostelut. Siirto tehdään kerran
// käynnistyksessä (migrateSplit), ja metaan jää merkintä split:true.
//
// window.fbSave() toimii ulospäin täsmälleen kuten ennenkin, mutta kirjoittaa
// vain ne arvostelut ja tietueet jotka ovat oikeasti muuttuneet. appData
// näyttää muulle koodille samalta kuin ennen: appData.watchlist, .lists ja
// .dvds ovat edelleen tavallisia taulukoita.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, collection,
  getDocsFromServer, query, limit,
  onSnapshot, writeBatch, updateDoc, waitForPendingWrites,
  enableNetwork, disableNetwork, deleteField
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
let db = null, OLD_DOC = null, META_DOC = null, REVIEWS = null, SPLIT_BKP_DOC = null;
window._fbCacheMode = 'tuntematon';

// ── ALIKOKOELMAT (katselulista, omat listat, DVD-hylly) ──
// Jokaisella on sama kirjanpito kuin arvosteluilla: mitä on viimeksi
// kuitattu pilvessä, mitä odottaa kuittausta ja mitä aiemmista istunnoista
// on jäänyt jonoon. Avain on appData-kentän nimi ja samalla alikokoelman nimi.
const SUB_KEYS = ['watchlist', 'lists', 'dvds'];
const SUB_LABEL = { watchlist:'katselulista', lists:'omat listat', dvds:'DVD-hylly' };
const SUBS = {};
SUB_KEYS.forEach(k => {
  SUBS[k] = {
    key: k,
    ref: null,               // collection-viite, syntyy initDb():ssä
    lastSaved: new Map(),    // id -> JSON (palvelimen kuittaama)
    pending: new Map(),      // id -> JSON tai DEL_MARK (tämän istunnon kirjoitukset)
    queued: new Set(),       // latauksessa löytyneet kuittaamattomat (aiemmat istunnot)
    listening: false,
    loaded: false            // ensimmäinen tilannekuva saatu → saa kirjoittaa
  };
});

// Onko tieto jo pilkottu alikokoelmiin. Ennen sitä taulukot kirjoitetaan
// metaan kuten ennenkin, jotta mikään ei katoa jos siirto ei onnistu.
let splitMode = false;
// Vanha sovellusversio toisella laitteella voi vielä kirjoittaa taulukot
// metaan. Ne siivotaan seuraavassa meta-kirjoituksessa.
let legacyLeftover = false;

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
  SPLIT_BKP_DOC = doc(db, "arvostelut", "meta_v2_backup");
  SUB_KEYS.forEach(k => { SUBS[k].ref = collection(db, "arvostelut", "meta", k); });
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

// ── META-SUOJAUS ──
// Syyskuussa 2026 koko meta-dokumentti nollautui koodin oletusarvoiksi:
// kategoriat, genret, alalajit ja budjetti korvautuivat oletuksilla, ja
// neljä arvostelua jäi orvoiksi kategoriaan jota ei enää ollut listalla.
// Aiempi suoja esti vain TYHJÄN listan kirjoittamisen — ei oletusten
// kirjoittamista oikean datan päälle. Nämä kolme asiaa korjaavat sen:
//
//   1. metaTrusted vaatii nyt sisältöä, ei pelkkää palvelimen vastausta
//   2. viimeisin palvelimelta vahvistettu meta säilyy laitteella erikseen
//   3. oletusten näköinen meta ei koskaan korvaa sisältöä ilman varoitusta
const META_BKP_KEY = 'arvostelut_meta_v1';
let lastGoodMeta = null;   // viimeisin palvelimelta vahvistettu meta, jossa oli sisältöä

// Onko tässä istunnossa luettu palvelimelta meta jossa oli sisältöä.
// Tämä erottaa kaksi muuten samannäköistä tilannetta toisistaan:
//   · käyttäjä poistaa itse viimeisen budjettijakson → meta on luettu → sallitaan
//   · metaa ei saatu luettua ja tila putosi oletuksiin → ei luettu → estetään
let metaSeenThisSession = false;

// Onko meta pelkkiä oletusarvoja. Juuri tämä yhdistelmä syntyy silloin kun
// metaa ei saatu luettua ja assembleAppData() putosi oletuksiin.
function looksLikeDefaults(m){
  if(!m) return false;
  const cats = m.categories || [];
  const gens = m.genres || [];
  const per  = (m.budget && m.budget.periods) || [];
  const wl   = m.watchlist || [];
  const lst  = m.lists || [];
  const dvd  = m.dvds || [];
  const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // Katselulista ja omat listat ovat mukana samasta syystä kuin budjetti:
  // jos kirjoitus näyttää oletuksilta MUTTA sisältöä on, se ei ole oletus.
  return sameList(cats, DEFAULT_CATS) && sameList(gens, DEFAULT_GENRES)
    && per.length === 0 && wl.length === 0 && lst.length === 0 && dvd.length === 0;
}

// Onko metassa jotain säilyttämisen arvoista
function metaHasContent(m){
  if(!m) return false;
  return !looksLikeDefaults(m);
}

function rememberGoodMeta(m){
  // Palvelimelta saatu meta = tila on aito, ei oletuksista johdettu.
  // Merkintä tehdään myös oletusten näköiselle metalle: sekin on aito
  // vastaus, jos se on oikeasti pilvessä sellaisena.
  metaSeenThisSession = true;
  if(!metaHasContent(m)) return;
  lastGoodMeta = clean(m);
  // Erillinen ja pieni: tämä ei sisällä arvosteluja, joten se mahtuu
  // localStorageen silloinkin kun koko datan varmuuskopio ei enää mahdu.
  try{ localStorage.setItem(META_BKP_KEY, JSON.stringify(lastGoodMeta)); } catch(e){}
}

function loadGoodMeta(){
  if(lastGoodMeta) return lastGoodMeta;
  try{
    const raw = localStorage.getItem(META_BKP_KEY);
    if(raw){
      const m = JSON.parse(raw);
      if(metaHasContent(m)) lastGoodMeta = m;
    }
  } catch(e){}
  return lastGoodMeta;
}

// Estää oletusten kirjoittumisen sisällön päälle. Palauttaa syyn tai null.
//
// Ehto on tarkoituksella kapea. Estetään VAIN silloin kun kaikki kolme pätee:
//   1. kirjoitettava meta on tarkalleen koodin oletusarvot
//   2. laitteella on tiedossa aiempi meta jossa oli sisältöä
//   3. tässä istunnossa ei ole kertaakaan luettu palvelimelta metaa
// Kolmas ehto on se joka pitää käsin tehdyt poistot sallittuina: jos olet
// nähnyt budjettisi ja poistat sen viimeisen jakson, meta on luettu eikä
// kirjoitus esty. Ilman sitä ehtoa oletuskategorioilla elävä käyttäjä ei
// olisi saanut tyhjentää budjettiaan lainkaan.
function metaWouldWipe(meta){
  if(metaSeenThisSession) return null;            // tila on aidosti palvelimelta
  if(!looksLikeDefaults(meta)) return null;       // ei oletusten näköinen → sallitaan
  const good = loadGoodMeta();
  if(!good) return null;                          // ei mitään mitä menettää
  const bits = [];
  if((good.categories||[]).length !== (meta.categories||[]).length) bits.push('kategoriat');
  if((good.genres||[]).length !== (meta.genres||[]).length) bits.push('genret');
  if(((good.budget||{}).periods||[]).length) bits.push('budjetti');
  // Pilkotussa rakenteessa nämä eivät kulje metan mukana, joten meta-
  // kirjoitus ei voi pyyhkiä niitä.
  if(!splitMode){
    if((good.watchlist||[]).length) bits.push('katselulista');
    if((good.lists||[]).length) bits.push('omat listat');
    if((good.dvds||[]).length) bits.push('DVD-hylly');
  }
  return bits.length ? bits.join(', ') : null;
}


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
// Tyhjä tarkoituksella. Aiemmin tässä oli toimiva lukutunnus, joka vuoti
// julkisen GitHub-repon mukana. TMDB:n v4-lukutunnus on JWT, jonka aud-kenttä
// sisältää v3 API-avaimen selkokielisenä — vuodossa meni siis molemmat.
// Vanha avain on luotu uudelleen ja mitätöity.
//
// Tunnus annetaan nyt vain Asetukset → TMDB -kentästä. Se tallentuu
// meta-dokumenttiin omaan Firestoreesi, jota säännöt suojaavat, eikä päädy
// koodiin eikä versiohistoriaan.
window.tmdbTokenDefault = "";
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

// Odottavien tietueiden määrä alikokoelmittain (katselulista, listat, DVD:t)
function subPendingCount(){
  let n = 0;
  SUB_KEYS.forEach(k => {
    const s = SUBS[k];
    const ids = new Set(s.pending.keys());
    s.queued.forEach(id => ids.add(id));
    n += ids.size;
  });
  return n;
}

function updateSyncBanner(){
  const ids = new Set(pendingWrites.keys());
  cacheQueuedIds.forEach(id => ids.add(id));
  const n = ids.size;
  const unsynced = n > 0 || pendingMeta !== null || queueStuck || subPendingCount() > 0;
  const bar = ensureSyncBar();

  if(unsynced){
    const msg = n > 0
      ? `⚠️ ${n} ${n === 1 ? 'arvostelu' : 'arvostelua'} ei ole tallennettu pilveen — älä tyhjennä selaustietoja`
      : '⚠️ Tallentamattomia muutoksia odottaa yhteyttä — älä tyhjennä selaustietoja';
    // textContent, ei innerHTML — teksti sisältää arvosteluista johdettuja lukuja
    document.getElementById('syncWarnText').textContent = msg;
    bar.style.display = 'flex';
    // Synkronointivaroitus on tärkeämpi kuin varmuuskopiomuistutus
    if(window.hideBackupReminder) window.hideBackupReminder();
    syncWarnShown = true;
  } else {
    bar.style.display = 'none';
    if(syncWarnShown){
      syncWarnShown = false;
      showStatus('✅ Kaikki tallennettu pilveen','#22c55e', 3000);
    }
  }
  // Palkin näkyvyys muuttui — kelluvat napit siirtyvät sen mukaan.
  if(window.updateBottomStack) window.updateBottomStack();
}
window.fbSyncState = function(){
  const ids = new Set(pendingWrites.keys());
  cacheQueuedIds.forEach(id => ids.add(id));
  return { pending: ids.size + subPendingCount(), meta: pendingMeta !== null, queueStuck };
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

  // Katselulista, omat listat ja DVD-hylly
  SUB_KEYS.forEach(k => {
    const s = SUBS[k];
    const arr = Array.isArray(appData[k]) ? appData[k] : [];
    const itemName = (id) => {
      const x = arr.find(o => o && String(o.id) === String(id));
      return x ? String(x.name || x.title || '(nimetön)') : '(tuntematon)';
    };
    s.pending.forEach((val, id) => {
      rows.push({
        id,
        name: SUB_LABEL[k] + ': ' + (val === DEL_MARK ? '(poistettu)' : itemName(id)),
        kind: val === DEL_MARK ? 'poisto' : 'tallennus',
        source: 'tämä istunto'
      });
    });
    s.queued.forEach(id => {
      if(s.pending.has(id)) return;
      rows.push({ id: String(id), name: SUB_LABEL[k] + ': ' + itemName(id), kind: 'tallennus', source: 'aiempi istunto' });
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
  SUB_KEYS.forEach(k => {
    // Jonossa olleet merkitään tallentamattomiksi, jotta fbSave lähettää ne
    SUBS[k].queued.forEach(id => SUBS[k].lastSaved.delete(id));
    SUBS[k].pending.clear();
    SUBS[k].queued.clear();
  });
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
  // Tunnus tulee asetuksista eli Firestoren meta-dokumentista, joka saapuu
  // vasta hetken kuluttua käynnistyksestä. Käynnistyshetkellä puuttuva
  // tunnus on siis odotustila, ei virhe — aiemmin tästä välähti joka
  // avauksella punainen "TMDB-tunnus ei toimi" vaikka kaikki oli kunnossa.
  // Tarkistus tehdään uudelleen syncTmdbToken():sta heti kun tunnus saapuu.
  if(!window.tmdbToken){
    window._tmdbTokenStatus = { ok:null, checkedAt:null, message:'Odottaa tunnusta' };
    refreshTokenStatusInSettings();
    return;
  }
  const r = await window.tmdbTestToken();
  window._tmdbTokenStatus = { ok:r.ok, checkedAt: new Date().toISOString(), message: r.message };
  if(!r.ok && r.message !== 'Verkkovirhe tunnuksen tarkistuksessa'){
    window.showStatus('⚠️ TMDB-tunnus ei toimi — katso Asetukset', '#dc2626', 6000);
  }
  refreshTokenStatusInSettings();
}

function refreshTokenStatusInSettings(){
  if(document.getElementById('settingsModal')?.classList.contains('open') && window.refreshTmdbStatusInSettings){
    window.refreshTmdbStatusInSettings();
  }
}

// Kutsutaan vasta kun asetukset on ladattu. Jos tunnusta ei silloinkaan ole,
// kyseessä on aito puute ja siitä kerrotaan kerran.
let noTokenWarned = false;
window.tmdbTokenGate = function(){
  if(window.tmdbToken){ noTokenWarned = false; return; }
  if(noTokenWarned) return;
  noTokenWarned = true;
  window._tmdbTokenStatus = { ok:false, checkedAt:new Date().toISOString(), message:'Tunnus puuttuu' };
  window.showStatus('⚠️ TMDB-tunnusta ei ole asetettu — katso Asetukset', '#f59e0b', 6000);
  refreshTokenStatusInSettings();
};

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
  const m = {
    categories: cats,
    genres:     gens,
    // Alalajit puuttuivat metasta kokonaan, joten itse luodut alalajit
    // katosivat aina seuraavassa latauksessa ja palautuivat oletuksiin.
    subcats:    appData.subcats || {},
    budget:     appData.budget || { monthlyPrice: 26.90, periods: [] },
    settings:   appData.settings || {},
    schema:     SCHEMA
  };
  if(splitMode){
    // Katselulista, omat listat ja DVD-hylly asuvat omissa alikokoelmissaan.
    // Merkintä kirjoitetaan joka kerta, jottei se voi kadota.
    m.split = true;
  } else {
    // Vanha rakenne: taulukot metan sisällä. Käytössä vain siihen asti
    // että siirto alikokoelmiin on tehty.
    m.watchlist = Array.isArray(appData.watchlist) ? appData.watchlist : [];
    m.lists     = Array.isArray(appData.lists) ? appData.lists : [];
    m.dvds      = Array.isArray(appData.dvds) ? appData.dvds : [];
  }
  return m;
}

// ── ALIKOKOELMIEN APUFUNKTIOT ──

function subArr(k){
  return Array.isArray(appData[k]) ? appData[k] : [];
}

// Tunnus on dokumentin nimi, joten sen on oltava olemassa, yksilöllinen
// ja kelvollinen. Kaikki tietueet saavat tunnuksen Date.now()-pohjaisesti,
// mutta varmuuskopioiden yhdistely tai vanha data voi tuottaa puuttuvan tai
// kahdesti esiintyvän tunnuksen. Kaksi samaa tunnusta veisi saman
// dokumentin, ja toinen tietue katoaisi hiljaa seuraavassa latauksessa.
// Korjaus tehdään paikallaan: tietue saa uuden tunnuksen, sisältö säilyy.
function fixSubIds(arr){
  const used = new Set();
  let fixed = 0;
  arr.forEach(x => {
    if(!x || typeof x !== 'object') return;
    const s = x.id == null ? '' : String(x.id);
    if(!s || s.includes('/') || s === '.' || s === '..' || s.startsWith('__') || used.has(s)){
      let id;
      do { id = Date.now() + Math.floor(Math.random() * 1000000); } while(used.has(String(id)));
      x.id = id;
      fixed++;
    }
    used.add(String(x.id));
  });
  return fixed;
}

// Sama järjestys kaikilla laitteilla: tunnukset ovat aikaleimoja, joten
// tunnuksen mukaan lajittelu palauttaa lisäysjärjestyksen.
function subOrder(a, b){
  const na = Number(a && a.id), nb = Number(b && b.id);
  const fa = isFinite(na), fb = isFinite(nb);
  if(fa && fb) return na - nb;
  if(fa) return -1;
  if(fb) return 1;
  return String(a && a.id).localeCompare(String(b && b.id));
}

// Kirjoitettavat muutokset yhdestä alikokoelmasta
function subOps(k, ops){
  const s = SUBS[k];
  // Ennen ensimmäistä tilannekuvaa ei tiedetä mitä pilvessä on —
  // silloin mikään muutos ei ole luotettava.
  if(!splitMode || !s.loaded || !s.ref) return;
  const arr = subArr(k);
  fixSubIds(arr);
  const seen = new Set();
  arr.forEach(x => {
    if(!x || typeof x !== 'object' || x.id == null) return;
    const id = String(x.id);
    seen.add(id);
    const js = JSON.stringify(x);
    if(s.lastSaved.get(id) === js) return;
    if(s.pending.get(id) === js) return;
    ops.push({ coll:k, kind:'set', id, data:x, js });
  });
  s.lastSaved.forEach((_, id) => {
    if(seen.has(id)) return;
    if(s.pending.get(id) === DEL_MARK) return;
    ops.push({ coll:k, kind:'del', id });
  });
}

// Palauttaa alikokoelman kirjanpidon. Arvostelujen kirjanpito on
// historiallisista syistä omissa muuttujissaan, joten se haetaan tässä.
function bookOf(coll){
  if(coll === 'reviews') return { lastSaved: lastSavedReviews, pending: pendingWrites, queued: cacheQueuedIds };
  return SUBS[coll];
}

// Onko meta-dokumentissa vanhan rakenteen taulukoita
function legacyArraysIn(m){
  if(!m) return false;
  return SUB_KEYS.some(k => Array.isArray(m[k]));
}
function legacyHasItems(m){
  if(!m) return false;
  return SUB_KEYS.some(k => Array.isArray(m[k]) && m[k].length > 0);
}

// Pilkottuun tilaan siirtyminen kesken istunnon (esim. toinen laite teki
// siirron). Alikokoelmien kuuntelijat tuovat tiedot.
function enterSplitMode(){
  if(splitMode) return;
  splitMode = true;
  startSubListeners();
}

// Vanha sovellusversio kirjoitti taulukot metaan pilkkomisen jälkeen.
// Ne kopioidaan talteen ennen siivousta, jottei mitään katoa jäljettömiin.
async function stashLeftover(m){
  legacyLeftover = true;
  if(!legacyHasItems(m)) return;
  try{
    await setDoc(SPLIT_BKP_DOC, clean({
      leftover: {
        at: new Date().toISOString(),
        watchlist: Array.isArray(m.watchlist) ? m.watchlist : [],
        lists:     Array.isArray(m.lists) ? m.lists : [],
        dvds:      Array.isArray(m.dvds) ? m.dvds : []
      }
    }), { merge: true });
  } catch(e){ if(window.logError) window.logError('tallennus', e, 'stashLeftover'); }
  showStatus('⚠️ Vanha sovellusversio toisella laitteella — päivitä se', '#f59e0b', 8000);
}

// ── SIIRTO ALIKOKOELMIIN (kerran) ──
// Ajetaan vain kun meta on luettu PALVELIMELTA eikä siinä ole split-merkintää.
//   1. Taulukot kopioidaan erilliseen dokumenttiin arvostelut/meta_v2_backup
//      ja odotetaan palvelimen kuittaus. Ilman kuittausta mitään ei muuteta.
//   2. Tietueet kirjoitetaan alikokoelmiin. Viimeisessä erässä metaan tulee
//      split:true ja vanhat taulukot poistetaan — samassa erässä, joten
//      pilvessä ei ole koskaan tilaa jossa taulukot olisivat kummassakin
//      tai ei kummassakaan.
// Firestore lähettää saman laitteen kirjoitukset järjestyksessä, joten
// varmuuskopio on aina pilvessä ennen kuin taulukot poistetaan.
async function migrateSplit(meta){
  const src = {};
  SUB_KEYS.forEach(k => {
    src[k] = (Array.isArray(meta[k]) ? meta[k] : []).filter(x => x && typeof x === 'object').map(x => clean(x));
    fixSubIds(src[k]);
  });

  const bkp = await withTimeout(setDoc(SPLIT_BKP_DOC, clean({
    at: new Date().toISOString(),
    watchlist: src.watchlist, lists: src.lists, dvds: src.dvds
  })), COMMIT_TIMEOUT);
  if(!bkp || !bkp.ok){
    if(window.logError) window.logError('tallennus', (bkp && bkp.error) || 'aikakatkaisu', 'migrateSplit/backup');
    return false;
  }

  const ops = [];
  SUB_KEYS.forEach(k => src[k].forEach(x => ops.push({ coll:k, kind:'set', id:String(x.id), data:x, js:JSON.stringify(x) })));

  // Keskeytynyt aiempi yritys on voinut jättää alikokoelmiin dokumentteja,
  // jotka on sen jälkeen poistettu taulukosta. Ne poistetaan, jottei
  // poistettu teos palaa. Jos tätä ei saada luettua, siirtoa ei tehdä.
  for(const k of SUB_KEYS){
    const r = await withTimeout(getDocsFromServer(SUBS[k].ref), COMMIT_TIMEOUT);
    if(!r || !r.ok) return false;
    const want = new Set(src[k].map(x => String(x.id)));
    r.value.docs.forEach(d => { if(!want.has(d.id)) ops.push({ coll:k, kind:'del', id:d.id }); });
  }

  const metaPatch = { split: true };
  SUB_KEYS.forEach(k => { metaPatch[k] = deleteField(); });

  // Erät: meta-päivitys mahtuu viimeiseen erään (BATCH_MAX < 500)
  const chunks = [];
  for(let i = 0; i < ops.length; i += BATCH_MAX) chunks.push(ops.slice(i, i + BATCH_MAX));
  if(!chunks.length) chunks.push([]);

  const commits = [];
  chunks.forEach((chunk, ci) => {
    const batch = writeBatch(db);
    chunk.forEach(op => {
      const ref = doc(SUBS[op.coll].ref, op.id);
      if(op.kind === 'set') batch.set(ref, op.data);
      else batch.delete(ref);
      SUBS[op.coll].pending.set(op.id, op.kind === 'set' ? op.js : DEL_MARK);
    });
    if(ci === chunks.length - 1) batch.update(META_DOC, metaPatch);
    const p = batch.commit();
    p.then(() => confirmChunk(chunk), (e) => {
      releaseChunk(chunk);
      if(window.logError) window.logError('tallennus', e, 'migrateSplit');
    });
    commits.push(p);
  });

  // Kirjoitukset ovat nyt Firestoren jonossa. Paikallisesti siirrytään heti
  // uuteen rakenteeseen: kuuntelijat näkevät jonossa olevat dokumentit
  // välimuistista, ja jos yhteys katkeaa, jono lähtee myöhemmin.
  SUB_KEYS.forEach(k => { appData[k] = src[k]; });
  splitMode = true;
  updateSyncBanner();

  const res = await withTimeout(Promise.all(commits), COMMIT_TIMEOUT);
  if(res && res.error){
    // Palvelin hylkäsi kirjoituksen (esim. säännöt). Palataan vanhaan
    // rakenteeseen: meta ja taulukot ovat pilvessä ennallaan, koska
    // viimeinen erä meta-päivityksineen ei mennyt läpi.
    splitMode = false;
    SUB_KEYS.forEach(k => { SUBS[k].pending.clear(); });
    updateSyncBanner();
    showStatus('⚠️ Tietojen siirto ei onnistunut — jatketaan vanhalla tavalla', '#f59e0b', 6000);
    return false;
  }
  console.info('Katselulista, omat listat ja DVD-hylly siirretty omiin kokoelmiinsa (' + ops.length + ' tietuetta).');
  return true;
}

// Kokoaa appData-objektin metasta ja arvostelutaulukosta
function assembleAppData(meta, reviews){
  const m = meta || {};
  // Pilkotussa rakenteessa metan taulukot ovat korkeintaan vanhan version
  // jäänteitä. Oikeat tiedot tuo alikokoelmien kuuntelija.
  const legacy = (k) => (!m.split && Array.isArray(m[k])) ? m[k] : [];
  return {
    categories: (Array.isArray(m.categories) && m.categories.length) ? m.categories : [...DEFAULT_CATS],
    genres:     (Array.isArray(m.genres) && m.genres.length) ? m.genres : [...DEFAULT_GENRES],
    subcats:    (m.subcats && typeof m.subcats === 'object') ? m.subcats : null,
    budget:     m.budget || { monthlyPrice: 26.90, periods: [] },
    settings:   m.settings || {},
    watchlist:  legacy('watchlist'),
    lists:      legacy('lists'),
    dvds:       legacy('dvds'),
    reviews:    reviews
  };
}

function rememberSaved(){
  lastSavedReviews = new Map();
  (appData.reviews||[]).forEach(r => lastSavedReviews.set(String(r.id), JSON.stringify(r)));
  lastSavedMeta = JSON.stringify(metaObject());
  // Alikokoelmat vain kun niiden tila on oikeasti luettu. Muuten muistissa
  // voi olla esim. paikallisen varmuuskopion taulukko, jota ei saa pitää
  // pilven totuutena.
  SUB_KEYS.forEach(k => {
    const s = SUBS[k];
    if(!splitMode || !s.loaded) return;
    s.lastSaved = new Map();
    subArr(k).forEach(x => { if(x && x.id != null) s.lastSaved.set(String(x.id), JSON.stringify(x)); });
    s.queued.forEach(id => s.lastSaved.delete(id));
  });
}

// ── TALLENNUS ──
// Kirjoittaa vain muuttuneet arvostelut ja metan. Rajapinta ulospäin
// on sama kuin ennen: await window.fbSave().

// Palvelin kuittasi erän → se on oikeasti pilvessä
// op.coll kertoo kokoelman: puuttuva = arvostelut, muuten watchlist/lists/dvds.
function confirmChunk(chunk){
  chunk.forEach(op => {
    const b = bookOf(op.coll || 'reviews');
    if(op.kind === 'set'){
      b.lastSaved.set(op.id, op.js);
      if(b.pending.get(op.id) === op.js) b.pending.delete(op.id);
    } else {
      b.lastSaved.delete(op.id);
      if(b.pending.get(op.id) === DEL_MARK) b.pending.delete(op.id);
    }
    b.queued.delete(op.id);
  });
  updateSyncBanner();
}

// Kirjoitus hylättiin pysyvästi → poistetaan odottavista, jotta se
// yritetään uudelleen seuraavalla tallennuksella
function releaseChunk(chunk){
  chunk.forEach(op => {
    const b = bookOf(op.coll || 'reviews');
    const mark = op.kind === 'set' ? op.js : DEL_MARK;
    if(b.pending.get(op.id) === mark) b.pending.delete(op.id);
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

  // withTimeout palauttaa { ok, value } | { error } | { timedOut }.
  // Aiemmin tulosta käytettiin suoraan tilannekuvana, jolloin aikakatkaisu
  // kaatui epäselvään virheeseen. Nyt kerrotaan mikä meni pieleen.
  const unwrap = (r, what) => {
    if(r && r.ok) return r.value;
    if(r && r.timedOut) throw new Error('Palvelin ei vastannut (' + what + ')');
    throw (r && r.error) || new Error('Lukuvirhe (' + what + ')');
  };
  const [rSnap, mRes] = await Promise.all([
    withTimeout(getDocsFromServer(REVIEWS), COMMIT_TIMEOUT),
    withTimeout(getDocFromServer(META_DOC), COMMIT_TIMEOUT)
  ]);
  const snap  = unwrap(rSnap, 'arvostelut');
  const mSnap = unwrap(mRes, 'asetukset');

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
    if(m.split) splitMode = true;
    if(!splitMode){
      // Vanha rakenne: taulukot tulevat metasta
      SUB_KEYS.forEach(k => { if(Array.isArray(m[k])) appData[k] = m[k]; });
    }
    metaTrusted = true;
    rememberGoodMeta(m);
  }

  // Pilkotussa rakenteessa katselulista, listat ja DVD:t luetaan omista
  // kokoelmistaan, nekin suoraan palvelimelta.
  if(splitMode){
    const subSnaps = await Promise.all(SUB_KEYS.map(k => withTimeout(getDocsFromServer(SUBS[k].ref), COMMIT_TIMEOUT)));
    SUB_KEYS.forEach((k, i) => {
      const ss = unwrap(subSnaps[i], SUB_LABEL[k]);
      appData[k] = ss.docs.map(d => d.data()).filter(Boolean).sort(subOrder);
      SUBS[k].queued = new Set();
      SUBS[k].loaded = true;
    });
    startSubListeners();
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
    window._bkpFull = false;
  } catch(e){
    // localStorage voi olla täynnä — tallennusta ei kaadeta, koska pilvi on
    // ensisijainen. Aiemmin virhe niellään kokonaan, jolloin paikallinen
    // varakopio jäi hiljaa vanhaksi. Omat julisteet ovat ~120 kt kappaleelta,
    // joten noin 40 kuvaa täyttää selaimen ~5 Mt rajan.
    if(!window._bkpFull){
      window._bkpFull = true;
      console.warn('Paikallista varmuuskopiota ei voitu kirjoittaa:', e && e.message);
      if(window.logError) window.logError('tallennus', e, 'paikallinen varmuuskopio');
      if(window.showStatus){
        window.showStatus('⚠️ Laitteen muisti täynnä — lataa varmuuskopio', '#f59e0b', 5000);
      }
    }
  }

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

    // Katselulista, omat listat ja DVD-hylly (vain pilkotussa rakenteessa)
    SUB_KEYS.forEach(k => subOps(k, ops));

    const meta = metaObject();
    const metaJs = JSON.stringify(meta);
    const metaChanged = metaTrusted && (legacyLeftover || (metaJs !== lastSavedMeta && metaJs !== pendingMeta));

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
        const ref = doc(op.coll ? SUBS[op.coll].ref : REVIEWS, op.id);
        if(op.kind === 'set') batch.set(ref, clean(op.data));
        else batch.delete(ref);
        bookOf(op.coll || 'reviews').pending.set(op.id, op.kind === 'set' ? op.js : DEL_MARK);
      });

      const p = batch.commit();
      // Myöhäinenkin kuittaus otetaan vastaan: jos yhteys palaa vasta
      // aikakatkaisun jälkeen, varoituspalkki katoaa silloin.
      p.then(() => confirmChunk(chunk), () => releaseChunk(chunk));
      commits.push(p);
    }

    if(metaChanged){
      // Viimeinen lukko ennen kirjoitusta: oletusten näköinen meta ei saa
      // korvata sisältöä. Tämä on se kohta jossa budjetti, kategoriat ja
      // genret aiemmin katosivat hiljaa.
      const wipes = metaWouldWipe(meta);
      if(wipes){
        console.error('Meta-kirjoitus estetty: oletukset olisivat korvanneet sisällön (' + wipes + ')');
        showStatus('🛡️ Asetusten ylikirjoitus estetty — avaa Asetukset → Data', '#dc2626', 8000);
        window._metaWipeBlocked = wipes;
        // Ei kirjoiteta metaa lainkaan. Arvostelut menevät silti läpi,
        // koska ne ovat omia dokumenttejaan eikä niitä uhkaa mikään.
      } else {
        pendingMeta = metaJs;
        const payload = clean(meta);
        // Vanhan version jättämät taulukot pois metasta. merge:true säilyttäisi
        // ne muuten ikuisesti, ja meta kasvaisi juuri siitä syystä jota
        // pilkkomisella yritettiin välttää.
        const wasLeftover = legacyLeftover;
        if(splitMode && legacyLeftover) SUB_KEYS.forEach(k => { payload[k] = deleteField(); });
        const p = setDoc(META_DOC, payload, { merge: true });
        p.then(
          () => {
            if(wasLeftover) legacyLeftover = false;
            lastSavedMeta = metaJs;
            rememberGoodMeta(meta);
            if(pendingMeta === metaJs) pendingMeta = null;
            updateSyncBanner();
          },
          () => { if(pendingMeta === metaJs) pendingMeta = null; updateSyncBanner(); }
        );
        commits.push(p);
      }
    }

    updateSyncBanner();

    const res = await withTimeout(Promise.all(commits), COMMIT_TIMEOUT);

    if(res && res.timedOut){
      // Kirjoitukset ovat paikallisessa jonossa, eivät pilvessä.
      // Varoituspalkki jää näkyviin kunnes palvelin kuittaa ne.
      showStatus('⏳ Ei yhteyttä — tallennus jäi odottamaan','#f59e0b', 5000);
    } else if(res && res.error){
      const e = res.error;
      if(window.logError) window.logError('tallennus', e, 'fbSave');
      showStatus('❌ Virhe: ' + (e && e.code ? e.code : 'tallennus epäonnistui'), '#dc2626', 5000);
    } else {
      showStatus('✅ Tallennettu','#22c55e');
    }
  } catch(e){
    if(window.logError) window.logError('tallennus', e, 'fbSave');
    showStatus('❌ Virhe: ' + (e && e.code ? e.code : 'tallennus epäonnistui'), '#dc2626', 5000);
  }

  updateSyncBanner();
  isSaving = false;
  if(saveQueued){ saveQueued = false; return window.fbSave(); }
};

// ── META-SUOJAUKSEN TILA JA PALAUTUS ──
// Asetusten Data-välilehti näyttää tämän, jotta suojauksen laukeaminen ei
// jää pelkäksi hetkeksi näkyväksi tilapalkiksi.
window.fbMetaGuardState = function(){
  const good = loadGoodMeta();
  return {
    blocked:  window._metaWipeBlocked || null,
    missing:  !!window._metaMissing,
    trusted:  metaTrusted,
    hasLocal: !!good,
    local: good ? {
      categories: (good.categories || []).length,
      genres:     (good.genres || []).length,
      periods:    ((good.budget || {}).periods || []).length,
      subcats:    Object.keys(good.subcats || {}).filter(k => k !== '_seed').length
    } : null
  };
};

// Palauttaa laitteelle talletetun metan pilveen. Käyttäjän tietoinen
// toiminto, joten se ohittaa suojaukset — mutta arvosteluihin ei kosketa.
window.fbRestoreLocalMeta = async function(){
  const good = loadGoodMeta();
  if(!good) return false;
  const okDone = await window.fbRestoreMeta(good);
  if(okDone){
    window._metaWipeBlocked = null;
    window._metaMissing = false;
  }
  return okDone;
};

// Kertoo asetuksille kuinka iso suurin yksittäinen dokumentti on
window.fbSizeInfo = function(){
  let largest = 0, largestName = '';
  (appData.reviews||[]).forEach(r => {
    const n = new Blob([JSON.stringify(r)]).size;
    if(n > largest){ largest = n; largestName = String(r.name||'').split('\n')[0]; }
  });
  const metaSize = new Blob([JSON.stringify(metaObject())]).size;
  // Alikokoelmien yhteiskoko: ennen pilkkomista tämä kaikki oli metassa
  const subs = {};
  SUB_KEYS.forEach(k => {
    const arr = subArr(k);
    subs[k] = { count: arr.length, bytes: new Blob([JSON.stringify(arr)]).size };
  });
  return { largest, largestName, metaSize, count: (appData.reviews||[]).length, split: splitMode, subs };
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
  if(Array.isArray(src.watchlist)) appData.watchlist = src.watchlist;
  if(Array.isArray(src.lists))     appData.lists     = src.lists;
  if(Array.isArray(src.dvds))      appData.dvds      = src.dvds;

  try{ if(typeof ensureSettings === 'function') ensureSettings(); } catch(e){}
  if(typeof GENRES !== 'undefined') GENRES = [...(appData.genres||[])];

  try{
    await setDoc(META_DOC, clean(metaObject()), { merge: true });
  } catch(e){
    return false;
  }
  metaTrusted = true;
  lastSavedMeta = JSON.stringify(metaObject());
  rememberGoodMeta(metaObject());
  window._metaWipeBlocked = null;
  window._metaMissing = false;
  // Pilkotussa rakenteessa katselulista, listat ja DVD:t eivät kulkeneet
  // metan mukana — ne kirjoitetaan omiin kokoelmiinsa tavallista reittiä.
  if(splitMode){ try{ await window.fbSave(); } catch(e){} }
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
  // Tarvitaan myös try-lohkon jälkeen (alikokoelmien siirto)
  let metaSnap = null;
  let serverAnswered = false;

  try{
    // SUOJAUS 1: meta luetaan ensisijaisesti PALVELIMELTA.
    // Tyhjän välimuistin kanssa getDoc() ei heitä virhettä vaan ratkeaa
    // tilannekuvalla jossa exists() === false ja fromCache === true.
    // Vanha koodi tulkitsi sen "metaa ei ole" ja käynnisti migraation,
    // joka kirjoitti elokuun varmuuskopion kaiken päälle.
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
      rememberGoodMeta(metaSnap.data());
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

  // ── KATSELULISTA, OMAT LISTAT, DVD-HYLLY ──
  // Ajetaan vasta paikallisen varmuuskopion jälkeen, koska se korvaa koko
  // appData-objektin ja pyyhkisi kuuntelijoiden tuomat taulukot.
  try{
    const metaData = (metaSnap && metaSnap.exists()) ? metaSnap.data() : null;
    if(metaData && metaData.split){
      splitMode = true;
    } else if(metaData && serverAnswered && loaded && !metaBroken
              && metaData.schema >= SCHEMA && !window._sandbox){
      // Meta on luettu palvelimelta eikä siirtoa ole vielä tehty → tehdään nyt.
      // Epäonnistuessa jatketaan vanhalla rakenteella ja yritetään seuraavalla
      // käynnistyksellä uudelleen.
      await migrateSplit(metaData);
    }
    if(splitMode) await startSubListeners();
  } catch(e){
    if(window.logError) window.logError('tallennus', e, 'split');
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

  // Asetukset on nyt luettu, joten tunnuksen puuttuminen on aito puute.
  // Pieni viive antaa syncTmdbToken():n ehtiä ensin.
  setTimeout(() => { try{ window.tmdbTokenGate(); } catch(e){} }, 600);

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

// Aikaleiman asetus erillään tallennuksesta. downloadBackup kutsuu tätä
// ENNEN kuin se sarjallistaa tiedoston, jotta kopio sisältää oman
// tekohetkensä. Muuten juuri ladattu tiedosto näyttäisi palautuksen
// esikatselussa aina yhden asetuseron: lastBackupAt olisi tiedostossa
// edellisestä kopiosta ja muistissa tästä.
window.fbStampBackup = function(){
  try{ if(typeof ensureSettings === 'function') ensureSettings(); } catch(e){}
  if(!appData.settings) appData.settings = {};
  appData.settings.lastBackupAt = new Date().toISOString();
};

window.fbMarkBackupDone = async function(keepStamp){
  if(!keepStamp) window.fbStampBackup();
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

// ── ALIKOKOELMIEN KUUNTELIJAT ──
// Sama periaate kuin arvosteluissa: ensimmäinen tilannekuva on samalla
// ensilataus, sen jälkeen käsitellään vain muutokset. Ero arvosteluihin:
// omat kirjoitukset ohitetaan dokumentti kerrallaan eikä koko tilannekuvaa,
// jottei toiselta laitteelta samaan aikaan tullut muutos huku.
function startSubListener(k){
  const s = SUBS[k];
  if(s.listening || !s.ref) return Promise.resolve();
  s.listening = true;

  return new Promise(resolve => {
    let first = true;
    const finishFirst = () => { if(first){ first = false; resolve(); } };
    const timer = setTimeout(finishFirst, 8000);

    onSnapshot(s.ref, snap => {
      if(window._sandbox && s.loaded) return;

      // Ensimmäinen tilannekuva (tai ensimmäinen aikakatkaisun jälkeen):
      // koko taulukko korvataan pilven tilalla.
      if(!s.loaded){
        clearTimeout(timer);
        appData[k] = snap.docs.map(d => d.data()).filter(Boolean).sort(subOrder);
        s.queued = new Set();
        snap.docs.forEach(d => { if(d.metadata && d.metadata.hasPendingWrites) s.queued.add(d.id); });
        s.lastSaved = new Map();
        appData[k].forEach(x => {
          const id = String(x.id);
          if(!s.queued.has(id)) s.lastSaved.set(id, JSON.stringify(x));
        });
        s.loaded = true;
        updateSyncBanner();
        if(first){ finishFirst(); }
        else { try{ renderAll(); } catch(e){} }
        return;
      }

      const arr = Array.isArray(appData[k]) ? appData[k] : (appData[k] = []);
      let changed = false;

      snap.docChanges().forEach(ch => {
        const id = ch.doc.id;
        // Oma kirjoitus joka ei ole vielä palvelimella → kirjanpito hoitaa
        if(ch.doc.metadata && ch.doc.metadata.hasPendingWrites) return;
        const idx = arr.findIndex(x => x && String(x.id) === id);

        if(ch.type === 'removed'){
          // Oma poisto: confirmChunk kuittaa sen kun palvelin vastaa
          if(s.pending.get(id) === DEL_MARK) return;
          if(idx > -1 && !s.pending.has(id)){ arr.splice(idx, 1); changed = true; }
          s.lastSaved.delete(id);
        } else {
          const data = ch.doc.data();
          const js = JSON.stringify(data);
          // Jos tällä laitteella on odottava oma versio, se voittaa —
          // se lähtee pilveen heti perään joka tapauksessa.
          if(!s.pending.has(id)){
            if(idx > -1){
              if(JSON.stringify(arr[idx]) !== js){ arr[idx] = data; changed = true; }
            } else {
              arr.push(data); changed = true;
            }
          }
          s.lastSaved.set(id, js);
          if(s.pending.get(id) === js) s.pending.delete(id);
        }
        s.queued.delete(id);
      });

      updateSyncBanner();
      if(changed){ try{ renderAll(); } catch(e){} }
    }, err => {
      clearTimeout(timer);
      s.listening = false;
      if(window.logError) window.logError('verkko', err, 'kuuntelija/' + k);
      finishFirst();
    });
  });
}

function startSubListeners(){
  return Promise.all(SUB_KEYS.map(k => startSubListener(k)));
}

function startMetaListener(){
  if(metaListenerReady) return;
  metaListenerReady = true;

  onSnapshot(META_DOC, snap => {
    if(window._sandbox) return;
    if(snap.metadata.hasPendingWrites) return;
    if(!snap.exists()){
      // Palvelin sanoo ettei metaa ole. Aiemmin metaTrusted meni tässä
      // päälle, jolloin seuraava tallennus kirjoitti oletukset pilveen.
      // Jos arvosteluja on olemassa, tilanne on rikki eikä oletuksia saa
      // kirjoittaa. Tyhjällä tilillä kirjoitus on oikea toiminto.
      if(!snap.metadata.fromCache){
        const hasReviews = (appData.reviews || []).length > 0;
        metaTrusted = !hasReviews;
        if(hasReviews){
          console.error('Meta-dokumenttia ei ole, mutta arvosteluja on. Metaa ei kirjoiteta.');
          window._metaMissing = true;
          showStatus('⚠️ Asetuksia ei löytynyt pilvestä — avaa Asetukset → Data', '#f59e0b', 8000);
        }
      }
      return;
    }
    // Palvelimelta tullut tilannekuva — vasta nyt metaa saa kirjoittaa
    if(!snap.metadata.fromCache) metaTrusted = true;
    const m = snap.data();
    if(!snap.metadata.fromCache) rememberGoodMeta(m);
    appData.categories = m.categories || appData.categories;
    appData.genres     = m.genres || appData.genres;
    if(m.subcats && typeof m.subcats === 'object') appData.subcats = m.subcats;
    appData.budget     = m.budget || appData.budget;
    appData.settings   = m.settings || appData.settings;

    if(m.split){
      // Toinen laite on tehnyt siirron alikokoelmiin tämän istunnon aikana
      if(!splitMode && !snap.metadata.fromCache) enterSplitMode();
      // Vanha versio kirjoitti taulukot takaisin metaan → talteen ja siivotaan
      if(splitMode && !snap.metadata.fromCache && legacyArraysIn(m) && !legacyLeftover){
        stashLeftover(m).then(() => { if(metaTrusted && window.fbSave) window.fbSave(); });
      }
    } else if(!splitMode){
      // Vanha rakenne. Aiemmin katselulista, omat listat ja DVD-hylly
      // jätettiin tässä kokonaan päivittämättä: toisen laitteen muutokset
      // eivät näkyneet, ja tämän laitteen seuraava tallennus kirjoitti
      // vanhan taulukon niiden päälle.
      SUB_KEYS.forEach(k => { if(Array.isArray(m[k])) appData[k] = m[k]; });
    }

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
