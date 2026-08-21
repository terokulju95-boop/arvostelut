// ══ ARVOSTELUT · Firebase ══
// Moduuli (type="module"): ajetaan aina tavallisten skriptien JÄLKEEN.
// Ulospäin näkyvät funktiot asetetaan window-objektiin.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
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
const DATA_DOC = doc(db, "arvostelut", "data");
let isSaving = false;

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

window.fbSave = async function(){
  if(isSaving) return;
  isSaving=true; showStatus('💾 Tallennetaan...','#f97316');
  try{
    localStorage.setItem('arvostelut_bkp', JSON.stringify(appData));
    await setDoc(DATA_DOC, { json: JSON.stringify(appData) });
    showStatus('✅ Tallennettu','#22c55e');
  } catch(e){ showStatus('❌ Virhe','#dc2626'); }
  isSaving=false;
};

async function fbLoad(){
  try{
    const snap = await getDoc(DATA_DOC);
    if(snap.exists()){
      appData = JSON.parse(snap.data().json);
    } else {
      const bkp = localStorage.getItem('arvostelut_bkp');
      if(bkp) appData = JSON.parse(bkp);
      if(appData.reviews.length > 0) await window.fbSave();
    }
  } catch(e){
    showStatus('⚠️ Yhteysvirhe','#f59e0b');
    const bkp = localStorage.getItem('arvostelut_bkp');
    if(bkp) appData = JSON.parse(bkp);
  }
  // Siirrä nimeen upotetut vuosiluvut omaan kenttäänsä (ajetaan kerran)
  try{
    if(window.migrateYearField && window.migrateYearField()) await window.fbSave();
  } catch(e){}
  initApp();
  onSnapshot(DATA_DOC, snap => {
    if(!snap.exists() || isSaving) return;
    try{
      appData = JSON.parse(snap.data().json);
      if(window.migrateYearField) window.migrateYearField();
      if(appData.settings && appData.settings.accent && window.applyAccent) window.applyAccent(appData.settings.accent);
      renderAll();
    } catch(e){}
  });
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
