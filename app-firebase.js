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
  getFirestore, doc, getDoc, setDoc, getDocs, collection,
  onSnapshot, writeBatch, updateDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
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
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

const OLD_DOC   = doc(db, "arvostelut", "data");
const META_DOC  = doc(db, "arvostelut", "meta");
const REVIEWS   = collection(db, "arvostelut", "meta", "reviews");
const SCHEMA    = 2;
const BATCH_MAX = 400;   // Firestoren raja on 500 operaatiota per erä

let isSaving = false;
let saveQueued = false;
let listenersReady = false;

// Viimeksi pilveen kirjoitettu tila. Näiden avulla tiedetään mikä on muuttunut,
// jottei jokaisella tallennuksella kirjoiteta kaikkia arvosteluja uudelleen.
let lastSavedReviews = new Map();   // id (merkkijono) -> JSON
let lastSavedMeta = null;           // JSON

// TMDB token
window.tmdbToken = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyYjhkODg4ZjdkMGZkNmRlNzE4MjIxNTM2NWYzZTlmMSIsIm5iZiI6MTc3NDkwNDg1Ny42MjIwMDAyLCJzdWIiOiI2OWNhZTYxOWIwMGYyNWRlZmJjZTNjY2YiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.EGIEIkcAl8J5FloGkTmahs_L3PQ6WTIuRsV3KLg4t2g";

function showStatus(msg, color, duration){
  const el = document.getElementById('saveStatus');
  el.textContent=msg; el.style.background=color; el.style.color='white'; el.style.opacity='1';
  setTimeout(()=>el.style.opacity='0', duration || 2200);
}
window.showStatus = showStatus;

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
window.fbSave = async function(){
  if(isSaving){ saveQueued = true; return; }
  isSaving = true;

  try{
    localStorage.setItem('arvostelut_bkp', JSON.stringify(appData));
  } catch(e){ /* localStorage voi olla täynnä — ei kaadeta tallennusta */ }

  try{
    const ops = [];
    const seen = new Set();

    (appData.reviews || []).forEach(r => {
      if(r == null || r.id == null) return;
      const id = String(r.id);
      seen.add(id);
      const js = JSON.stringify(r);
      if(lastSavedReviews.get(id) !== js) ops.push({ kind:'set', id, data:r, js });
    });

    lastSavedReviews.forEach((_, id) => {
      if(!seen.has(id)) ops.push({ kind:'del', id });
    });

    const meta = metaObject();
    const metaJs = JSON.stringify(meta);
    const metaChanged = metaJs !== lastSavedMeta;

    if(!ops.length && !metaChanged){
      isSaving = false;
      if(saveQueued){ saveQueued = false; return window.fbSave(); }
      return;
    }

    showStatus('💾 Tallennetaan...','#f97316');

    for(let i = 0; i < ops.length; i += BATCH_MAX){
      const chunk = ops.slice(i, i + BATCH_MAX);
      const batch = writeBatch(db);
      chunk.forEach(op => {
        const ref = doc(REVIEWS, op.id);
        if(op.kind === 'set') batch.set(ref, clean(op.data));
        else batch.delete(ref);
      });
      await batch.commit();
      // Merkitään onnistuneet vasta commitin jälkeen
      chunk.forEach(op => {
        if(op.kind === 'set') lastSavedReviews.set(op.id, op.js);
        else lastSavedReviews.delete(op.id);
      });
    }

    if(metaChanged){
      await setDoc(META_DOC, clean(meta), { merge: true });
      lastSavedMeta = metaJs;
    }

    showStatus('✅ Tallennettu','#22c55e');
  } catch(e){
    showStatus('❌ Virhe: ' + (e && e.code ? e.code : 'tallennus epäonnistui'), '#dc2626', 5000);
  }

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
  let loaded = false;

  try{
    const metaSnap = await getDoc(META_DOC);

    if(metaSnap.exists() && metaSnap.data().schema >= SCHEMA){
      // Uusi rakenne
      const revSnap = await getDocs(REVIEWS);
      const reviews = revSnap.docs.map(d => d.data()).filter(Boolean);
      appData = assembleAppData(metaSnap.data(), reviews);
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

  // Jos migraatio muutti jotain tai pilvi oli tyhjä mutta paikallista dataa löytyi
  if(needsSave || (!loaded && (appData.reviews||[]).length > 0)){
    lastSavedReviews = new Map();   // pakota kaikkien kirjoitus
    lastSavedMeta = null;
    await window.fbSave();
  }

  startListeners();
}

// ── REAALIAIKAINEN SEURANTA ──
function startListeners(){
  if(listenersReady) return;
  listenersReady = true;

  onSnapshot(REVIEWS, snap => {
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
      }
    });

    if(changed){
      if(window.migrateYearField) window.migrateYearField();
      renderAll();
    }
  }, err => {
    showStatus('⚠️ Synkronointi katkesi','#f59e0b', 4000);
  });

  onSnapshot(META_DOC, snap => {
    if(!snap.exists() || snap.metadata.hasPendingWrites) return;
    const m = snap.data();
    appData.categories = m.categories || appData.categories;
    appData.genres     = m.genres || appData.genres;
    appData.budget     = m.budget || appData.budget;
    appData.settings   = m.settings || appData.settings;
    lastSavedMeta = JSON.stringify(metaObject());
    if(typeof GENRES !== 'undefined') GENRES = [...(appData.genres||[])];
    if(appData.settings && appData.settings.accent && window.applyAccent) window.applyAccent(appData.settings.accent);
    renderAll();
  }, err => {});
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
