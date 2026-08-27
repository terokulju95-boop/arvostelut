// ── ARVOSTELUT – SERVICE WORKER ──
// TÄRKEÄÄ: nosta VERSION-numeroa aina kun muutat index.html:ää tai muita tiedostoja.
// Muuten Android-puhelimen PWA voi tarjoilla vanhaa versiota välimuistista.
const VERSION = 19;

const SHELL_CACHE = `arvostelut-shell-v${VERSION}`;
const IMG_CACHE   = 'tmdb-img-v1';   // julisteet <img>-tagista (no-cors)
const IMG_CORS_CACHE = 'tmdb-img-cors-v1'; // julisteet värianalyysia varten (cors) – pidettävä erillään,
                                           // koska CORS-pyyntö ei voi käyttää läpinäkymätöntä vastausta
const API_CACHE   = 'tmdb-api-v1';   // TMDB-hakutulokset – vanhenevat 24 h:ssa

const KEEP = [SHELL_CACHE, IMG_CACHE, IMG_CORS_CACHE, API_CACHE];

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app-core.js',
  './app-views.js',
  './app-modals.js',
  './app-firebase.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

const API_TTL = 24 * 60 * 60 * 1000; // 24 tuntia
const IMG_MAX = 300;                 // enintään näin monta julistetta välimuistiin

// ── ASENNUS ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(() => {}) // yksi puuttuva tiedosto ei saa kaataa asennusta
  );
  self.skipWaiting();
});

// ── AKTIVOINTI: siivoa vanhat välimuistit ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── APUFUNKTIOT ──

// Rajoita julistevälimuistin kokoa (Cache API säilyttää lisäysjärjestyksen)
async function trimImageCache(cacheName) {
  const cache = await caches.open(cacheName || IMG_CACHE);
  const keys = await cache.keys();
  if (keys.length <= IMG_MAX) return;
  const remove = keys.slice(0, keys.length - IMG_MAX);
  await Promise.all(remove.map(k => cache.delete(k)));
}

// Cache-first: käytä välimuistia, hae verkosta vain jos puuttuu
async function cacheFirst(req, cacheName, onStore) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) {
    cache.put(req, res.clone());
    if (onStore) onStore();
  }
  return res;
}

// Network-first: hae verkosta, käytä välimuistia vain jos verkko pettää
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    // Navigointipyyntö offline-tilassa → tarjoile sovelluksen runko
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

// Stale-while-revalidate: näytä välimuisti heti, päivitä taustalla
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || network || fetch(req);
}

// TMDB-API: välimuisti aikarajalla. Aikaleima tallennetaan omaan otsakkeeseen.
async function apiWithTtl(req) {
  const cache = await caches.open(API_CACHE);
  const hit = await cache.match(req);

  if (hit) {
    const stamp = parseInt(hit.headers.get('x-cached-at') || '0', 10);
    if (Date.now() - stamp < API_TTL) return hit;
  }

  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const body = await res.clone().blob();
      const headers = new Headers(res.headers);
      headers.set('x-cached-at', String(Date.now()));
      cache.put(req, new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers
      }));
    }
    return res;
  } catch (err) {
    if (hit) return hit; // vanhentunut on parempi kuin ei mitään
    throw err;
  }
}

// ── PYYNTÖJEN OHJAUS ──
self.addEventListener('fetch', e => {
  const req = e.request;

  // 1. Vain GET-pyynnöt voidaan tallentaa välimuistiin.
  //    Firestore käyttää POSTia — cache.put heittäisi virheen.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 2. Ei http/https (esim. chrome-extension) → ohita
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const host = url.hostname;

  // 3. Firebase / Google API -liikenne: ei koskaan välimuistiin.
  //    Firestorella on oma offline-mekanisminsa.
  if (
    host.endsWith('googleapis.com') ||
    host.endsWith('firebaseio.com') ||
    host.endsWith('firebaseapp.com') ||
    host.endsWith('gstatic.com') ||
    host.endsWith('firebase.com')
  ) return;

  // 4. TMDB-julisteet: cache-first, ne eivät muutu koskaan
  if (host === 'image.tmdb.org') {
    const imgCache = req.mode === 'cors' ? IMG_CORS_CACHE : IMG_CACHE;
    e.respondWith(
      cacheFirst(req, imgCache, () => e.waitUntil(trimImageCache(imgCache)))
        .catch(() => new Response('', { status: 504 }))
    );
    return;
  }

  // 5. TMDB-API: välimuisti 24 tunniksi
  if (host === 'api.themoviedb.org') {
    e.respondWith(apiWithTtl(req).catch(() => new Response('{}', {
      status: 504,
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // 6. Käännös-API (MyMemory): ei välimuistiin
  if (host.includes('mymemory')) return;

  // 7. Fontit: stale-while-revalidate
  if (host.includes('fonts.googleapis.com') || host.includes('fonts.gstatic.com')) {
    e.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  // 8. Oma sovellus
  if (url.origin === self.location.origin) {
    // Sivu, skriptit ja tyylit → network-first, jotta GitHubiin pusketut
    // muutokset näkyvät heti. Offline-tilassa käytetään välimuistia.
    // TÄRKEÄÄ: js ja css ovat samaa kokonaisuutta kuin index.html — jos niitä
    // tarjoiltaisiin välimuistista, sivu voisi saada uuden HTML:n ja vanhan JS:n.
    const p = url.pathname;
    if (req.mode === 'navigate' || p.endsWith('.html') || p.endsWith('/') ||
        p.endsWith('.js') || p.endsWith('.css')) {
      e.respondWith(networkFirst(req, SHELL_CACHE));
      return;
    }
    // Muut omat tiedostot (ikonit, manifest) → cache-first
    e.respondWith(
      cacheFirst(req, SHELL_CACHE).catch(() => caches.match(req).then(r => r || new Response('', { status: 504 })))
    );
    return;
  }

  // 9. Kaikki muu: suoraan verkkoon, ei välimuistia
});

// ── VIESTIT SOVELLUKSELTA ──
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'CLEAR_CACHES') {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  }
});
