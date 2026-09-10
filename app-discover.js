// ══ ARVOSTELUT · Löydä (suositukset, uudet kaudet) ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_DISCOVER = '2026-09-10.3';

// Tämä osio ei tee mitään itsestään. Kaikki haut käynnistyvät vain
// napin painalluksesta, eivätkä tulokset vuoda muihin näkymiin.

// ── APUJA ──

// Kaikki jo arvostellut TMDB-tunnukset, jotta niitä ei ehdoteta uudelleen.
function reviewedTmdbIds(){
  const ids = new Set();
  (appData.reviews || []).forEach(r => {
    if(r.tmdb_id != null) ids.add(`${r.tmdb_type || (r.tvType ? 'tv' : 'movie')}:${r.tmdb_id}`);
  });
  return ids;
}

// Nimien perusteella tehtävä varmistus: jos teos on arvosteltu ennen kuin
// TMDB-linkitys otettiin käyttöön, sillä ei ole tunnusta lainkaan.
function reviewedNames(){
  const set = new Set();
  (appData.reviews || []).forEach(r => set.add(fuzzyNormCached(plainName(r))));
  return set;
}

// Onko teos jo arvosteluissa. Erillään ohituslistasta, koska hakunäkymä
// haluaa kertoa tilan mutta ei piilottaa osumaa.
function alreadyHaveRaw(item, ids, names){
  const type = item.media_type || (item.title ? 'movie' : 'tv');
  if(ids.has(`${type}:${item.id}`)) return true;
  const title = item.title || item.name || '';
  return names.has(fuzzyNormCached(title));
}

function alreadyHave(item, ids, names){
  const type = item.media_type || (item.title ? 'movie' : 'tv');
  // Käyttäjän ohittamat käsitellään samalla tavalla kuin jo arvostellut:
  // yksi suodatin kattaa kaikki haut, eikä yhtäkään tarvinnut muuttaa.
  if(isHidden(type, item.id)) return true;
  // Katselulistalla oleva on jo löydetty. Sen ehdottaminen uudelleen olisi
  // pelkkää kohinaa. Hakunäkymä käyttää alreadyHaveRaw-versiota, joten se
  // näyttää teoksen silti ja kertoo missä se on.
  if(window.wlHas && window.wlHas(type, item.id)) return true;
  return alreadyHaveRaw(item, ids, names);
}

// Montako ehdotusta yhdestä lähteestä otetaan. Asetus elää Löydä-näkymän
// omassa valitsimessa, koska sitä säädetään juuri silloin kun haetaan.
function discCount(){
  const n = Number((ensureSettings() || {}).discoverCount);
  return (n >= 1 && n <= 12) ? n : 3;
}

// TMDB:n elokuvagenret suomeksi. Käänteinen kuvaus omista genreistä
// TMDB:n tunnuksiin, jotta klassikkohaku osaa pyytää oikeaa genreä.
// Vain elokuvapuolen tunnukset — discover/movie ei tunne sarjagenrejä.
const MOVIE_GENRE_IDS = {
  'toiminta':28, 'seikkailu':12, 'animaatio':16, 'komedia':35, 'rikostarina':80,
  'dokumentti':99, 'draama':18, 'perhe':10751, 'fantasia':14, 'historia':36,
  'kauhu':27, 'musiikki':10402, 'mysteeri':9648, 'romantiikka':10749,
  'sci-fi':878, 'scifi':878, 'trilleri':53, 'sota':10752, 'western':37,
  'jännitys':53, 'noir':80, 'tositapahtumat':99, 'urheilu':18
};

function genreToTmdbId(name){
  const k = String(name || '').toLowerCase().trim();
  return MOVIE_GENRE_IDS[k] != null ? MOVIE_GENRE_IDS[k] : null;
}

function discStatus(html, spinning){
  const el = document.getElementById('discStatus');
  if(!el) return;
  if(!html){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = (spinning ? '<span class="disc-spin"></span>' : '') + html;
}

function discSetBusy(on){
  document.querySelectorAll('.disc-btn').forEach(b => { b.disabled = !!on; });
}

// Kortti yhdelle ehdotukselle.
function discCard(item, reason){
  const type  = item.media_type || (item.title ? 'movie' : 'tv');
  const title = item.title || item.name || '';
  const year  = (item.release_date || item.first_air_date || '').slice(0,4);
  const score = item.vote_average ? Math.round(item.vote_average * 10) / 10 : null;
  const poster = item.poster_path
    ? `<img class="disc-poster" src="https://image.tmdb.org/t/p/w185${item.poster_path}" loading="lazy" alt="">`
    : `<div class="disc-poster disc-poster-none">${type === 'tv' ? '📺' : '🎬'}</div>`;
  const overview = item.overview ? esc(item.overview) : '';

  // Juliste ja teksti avaavat tiedot. Lisäysnappi on erikseen, jottei
  // kortin selaaminen johda vahingossa lomakkeelle.
  return `<div class="disc-card" data-key="${type}:${item.id}">
    <div class="disc-open" onclick="openDiscoverDetail('${type}',${Number(item.id)})">${poster}</div>
    <div class="disc-body">
      <div class="disc-open" onclick="openDiscoverDetail('${type}',${Number(item.id)})">
        <div class="disc-title">${esc(title)}${year ? ` <span class="disc-year">${year}</span>` : ''}</div>
        <div class="disc-reason">${reason}</div>
        ${score ? `<div class="disc-score">⭐ ${score}/10 TMDB</div>` : ''}
        ${overview ? `<div class="disc-overview">${overview}</div>` : ''}
        <div class="disc-more">Lue lisää ›</div>
      </div>
      <div class="disc-card-actions">
        <button class="disc-add" onclick="addFromDiscover('${escJs(title)}', '${type}')">+ Arvostele</button>
        <button class="disc-watch" title="Tallenna katselulistalle"
          onclick="addToWatchlist('${escJs(title)}','${type}',${Number(item.id)},'${escJs(item.poster_path || '')}','${escJs(year || '')}')">📌</button>
        <button class="disc-skip" title="Ei kiinnosta" onclick="hideFromDiscover('${type}',${Number(item.id)},'${escJs(title)}')">🚫</button>
      </div>
    </div>
  </div>`;
}

// Löydä-osion silta katselulistaan. Erillinen funktio siksi, että
// app-watchlist.js ladataan tämän jälkeen: suora kutsu wlAdd-funktioon
// kortin onclick-attribuutissa toimii, mutta tämä kääre antaa selkeän
// virheilmoituksen jos moduuli on jäänyt lataamatta.
window.addToWatchlist = function(title, type, tmdbId, poster, year){
  if(!window.wlAdd){
    if(window.showStatus) window.showStatus('Katselulista ei ole käytettävissä', '#dc2626', 3000);
    return;
  }
  window.wlAdd({
    name: title,
    year: year ? Number(year) : null,
    tmdb_id: tmdbId,
    tmdb_type: type,
    poster: poster || null,
    source: 'Löydä'
  });
};

function discSection(title, sub, cards){
  return `<div class="disc-section">
    <div class="disc-section-head">
      <div class="disc-section-title">${title}</div>
      ${sub ? `<div class="disc-section-sub">${sub}</div>` : ''}
    </div>
    ${cards}
  </div>`;
}

function discEmpty(msg){
  return `<div class="disc-empty">${msg}</div>`;
}

// Avaa lisäyslomakkeen valmiiksi täytetyllä nimellä.
// Alalaji on valinnainen kolmas parametri. Tositarinat-haussa kaikki osumat
// kuuluvat samaan alalajiin, joten sen esivalinta säästää yhden askeleen —
// ja varmistaa että arvostelu saa heti oikean kysymyssarjan.
window.addFromDiscover = function(title, type, subcat){
  window.setView('reviews');
  window.openAddModal();
  setTimeout(() => {
    const catEl = document.getElementById('formCat');
    if(catEl){
      const want = type === 'tv' ? 'TV-sarjat' : 'Elokuvat';
      const match = (appData.categories || []).find(c => c === want)
        || (appData.categories || []).find(c => fuzzyNorm(c).includes(type === 'tv' ? 'sarj' : 'elokuv'));
      if(match){ catEl.value = match; if(window.onCatChange) window.onCatChange(); }
    }
    setTimeout(() => {
      const nameEl = document.getElementById('formName');
      if(nameEl) nameEl.value = String(title).toUpperCase();
      // Alalaji vasta kategorian jälkeen: onCatChange rakentaa valikon uusiksi.
      if(subcat){
        const sub = document.getElementById('formSubcat');
        if(sub && [...sub.options].some(o => o.value === subcat)){
          sub.value = subcat;
          if(window.onSubcatChange) window.onSubcatChange();
        }
      }
    }, 120);
  }, 60);
};

// ── PÄÄKUTSU ──
window.runDiscover = async function(mode){
  if(!window.tmdbToken && mode !== 'new-seasons'){
    alert('TMDB-tunnus ei ole vielä latautunut. Yritä hetken kuluttua uudelleen.');
    return;
  }
  const out = document.getElementById('discResults');
  out.innerHTML = '';
  // Tositarinat-haussa lisäys esivalitsee alalajin myös tietonäkymästä.
  window._discSubcat = (mode === 'truestory') ? 'Tositarinat' : '';
  discSetBusy(true);
  try{
    if(mode === 'new-seasons')       await discoverNewSeasons(out);
    else if(mode === 'people')       await discoverByPeople(out);
    else if(mode === 'similar')      await discoverSimilar(out);
    else if(mode === 'collections')  await discoverCollections(out);
    else if(mode === 'classics')     await discoverClassics(out);
    else if(mode === 'ended')        await discoverEndedSeries(out);
    else if(mode === 'mini')         await discoverMiniSeries(out);
    else if(mode === 'longtv')       await discoverLongSeries(out);
    else if(mode === 'shorttv')      await discoverShortStart(out);
    else if(mode === 'truestory')    await discoverTrueStories(out);
  } catch(e){
    console.error(e);
    discStatus('❌ Haku epäonnistui. Tarkista internetyhteys.');
  }
  discSetBusy(false);
};

// ── 1. UUDET KAUDET SEURAAMISSASI SARJOISSA ──
async function discoverNewSeasons(out){
  const series = (appData.reviews || []).filter(r => r.tvType && r.tmdb_id);
  if(!series.length){
    discStatus('');
    out.innerHTML = discEmpty('Ei TMDB:hen linkitettyjä sarjoja. Päivitä sarjan tiedot TMDB:stä ensin.');
    return;
  }

  const found = [];
  for(let i = 0; i < series.length; i++){
    const r = series[i];
    discStatus(`Tarkistetaan ${i+1}/${series.length}: ${esc(plainName(r))}`, true);
    const detail = await tmdbGet(`/tv/${r.tmdb_id}?language=fi-FI`);
    if(!detail) continue;

    const tf = extractTmdbFields(detail, true);
    // Päivitetään tuotantotila samalla — tieto on juuri haettu
    r.tv_status     = tf.tv_status || r.tv_status;
    r.tv_in_prod    = tf.tv_in_prod;
    r.seasons_total = tf.seasons_total || r.seasons_total;
    r.last_air_date = tf.last_air_date || r.last_air_date;
    r.next_air      = tf.next_air;
    r.tmdb_checked  = new Date().toISOString().slice(0,10);

    // Kausivertailu on mielekäs vain jos seuraat kausia erikseen.
    // Kokonaisuutena arvostellulla sarjalla ei ole kausilistaa, joten
    // "3 uutta kautta" olisi harhaanjohtava — sille katsotaan vain
    // ilmestyivätkö uudet jaksot katselusi jälkeen.
    const tracksSeasons = r.tvType === 'jaksot' || r.tvType === 'kaudet';
    const mine = (r.seasons || []).filter(s => Number(s.seasonNumber) !== 0).length;
    const theirs = tf.seasons_total || 0;
    const newSeasons = (tracksSeasons && mine > 0) ? Math.max(0, theirs - mine) : 0;

    // Onko sarjassa jaksoja jotka ovat ilmestyneet viimeisen katselusi jälkeen
    const myLast = (r.date || '').slice(0,10);
    const airedSince = !!(tf.last_air_date && myLast && tf.last_air_date > myLast);

    if(newSeasons > 0 || airedSince || tf.next_air){
      found.push({ r, newSeasons, tf, airedSince, mine, tracksSeasons });
    }
    await new Promise(res => setTimeout(res, 80));
  }

  await window.fbSave();
  discStatus('');

  if(!found.length){
    out.innerHTML = discEmpty(`Tarkistettiin ${series.length} sarjaa. Mitään uutta ei ole ilmestynyt.`);
    return;
  }

  // Järjestys: uudet kaudet ensin, sitten tulossa olevat
  found.sort((a,b) => b.newSeasons - a.newSeasons);

  const cards = found.map(f => {
    const st = tvStatusInfo(f.tf.tv_status);
    const bits = [];
    if(f.newSeasons > 0){
      bits.push(`<span class="disc-badge disc-badge-new">${f.newSeasons} ${f.newSeasons === 1 ? 'uusi kausi' : 'uutta kautta'}</span>`);
    }
    if(f.tf.next_air && f.tf.next_air.date){
      const d = new Date(f.tf.next_air.date + 'T00:00:00');
      const days = Math.ceil((d - new Date()) / 86400000);
      const when = days > 1 ? `${days} pv` : (days === 1 ? 'huomenna' : (days === 0 ? 'tänään' : ''));
      bits.push(`<span class="disc-badge">Seuraava K${f.tf.next_air.season}J${f.tf.next_air.episode} ${esc(f.tf.next_air.date)}${when ? ' · ' + when : ''}</span>`);
    }
    if(f.airedSince && f.newSeasons === 0){
      bits.push(`<span class="disc-badge disc-badge-new">Uusia jaksoja katselusi jälkeen · viimeisin ${esc(f.tf.last_air_date)}</span>`);
    }
    if(!bits.length) bits.push('<span class="disc-badge">Seuraa tilannetta</span>');

    const poster = f.r.poster
      ? `<img class="disc-poster" src="https://image.tmdb.org/t/p/w185${f.r.poster}" loading="lazy" alt="">`
      : `<div class="disc-poster disc-poster-none">📺</div>`;

    return `<div class="disc-card">
      ${poster}
      <div class="disc-body">
        <div class="disc-title">${esc(plainName(f.r))}</div>
        <div class="disc-reason">
          ${st ? `${st.icon} ${esc(st.fi)}` : ''}${f.tracksSeasons
            ? ` · sinulla ${f.mine} / TMDB ${f.tf.seasons_total || '?'} kautta`
            : (f.tf.seasons_total ? ` · ${f.tf.seasons_total} kautta` : '')}
        </div>
        <div class="disc-badges">${bits.join('')}</div>
        ${f.tracksSeasons
          ? `<button class="disc-add" onclick="openSeasonImport(${f.r.id})">📥 Tuo puuttuvat kaudet</button>`
          : `<button class="disc-add" onclick="openReadModal(${f.r.id})">Avaa arvostelu</button>`}
      </div>
    </div>`;
  }).join('');

  out.innerHTML = discSection(
    '📺 Uutta seuraamissasi sarjoissa',
    `${found.length} / ${series.length} sarjassa on jotain uutta`,
    cards
  );
}

// ── 2. OHJAAJAT JA NÄYTTELIJÄT ──
async function discoverByPeople(out){
  const reviews = (appData.reviews || []).filter(r => getReviewScore(r) != null);
  if(reviews.length < 3){
    discStatus('');
    out.innerHTML = discEmpty('Tarvitaan vähintään muutama pisteytetty arvostelu, jotta ehdotuksissa on pohjaa.');
    return;
  }

  // Kerää henkilöt ja laske heidän keskiarvonsa sinun pisteilläsi.
  // Painotus: ohjaaja vaikuttaa enemmän kuin yksittäinen näyttelijä.
  const people = new Map();   // id -> { id, name, scores:[], role }
  const add = (id, name, score, role) => {
    if(id == null || !name) return;
    const key = `${id}`;
    if(!people.has(key)) people.set(key, { id, name, scores: [], role });
    people.get(key).scores.push(score);
  };

  reviews.forEach(r => {
    const sc = getReviewScore(r);
    if(r.director_id) add(r.director_id, r.director, sc, 'ohjaaja');
    (r.cast_ids || []).forEach((cid, i) => add(cid, (r.cast || [])[i], sc, 'näyttelijä'));
  });

  // Valitse henkilöt joista todella pidät: keskiarvo vähintään 75,
  // tai vähintään kaksi teosta keskiarvolla 70.
  const liked = [...people.values()]
    .map(p => ({ ...p, avg: Math.round(p.scores.reduce((a,b)=>a+b,0) / p.scores.length), n: p.scores.length }))
    .filter(p => (p.avg >= 75 && p.n >= 1) || (p.avg >= 70 && p.n >= 2))
    .sort((a,b) => (b.n - a.n) || (b.avg - a.avg))
    .slice(0, 8);

  if(!liked.length){
    discStatus('');
    out.innerHTML = discEmpty('Ei tarpeeksi korkeita pisteitä, joista päätellä suosikkitekijöitä. Päivitä arvostelujen TMDB-tiedot, jos ohjaaja- ja näyttelijätiedot puuttuvat.');
    return;
  }

  const ids = reviewedTmdbIds();
  const names = reviewedNames();
  const sections = [];

  for(let i = 0; i < liked.length; i++){
    const p = liked[i];
    discStatus(`Haetaan ${i+1}/${liked.length}: ${esc(p.name)}`, true);

    const credits = await tmdbGet(`/person/${p.id}/combined_credits?language=fi-FI`);
    if(!credits) continue;

    // Ohjaajalta otetaan ohjaustyöt, näyttelijältä roolit
    const pool = p.role === 'ohjaaja'
      ? (credits.crew || []).filter(c => c.job === 'Director' || c.job === 'Creator')
      : (credits.cast || []);

    const picks = pool
      .filter(item => ['movie','tv'].includes(item.media_type))
      .filter(item => !alreadyHave(item, ids, names))
      .filter(item => (item.vote_count || 0) >= 50)     // karsii tuntemattomat
      .sort((a,b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, discCount());

    if(!picks.length) continue;

    const reason = `${p.role === 'ohjaaja' ? '🎬' : '🎭'} ${esc(p.name)} · keskiarvosi ${p.avg} (${p.n} ${p.n === 1 ? 'teos' : 'teosta'})`;
    sections.push(discSection(
      `${p.role === 'ohjaaja' ? '🎬' : '🎭'} ${esc(p.name)}`,
      `Keskiarvosi ${p.avg} pistettä ${p.n} ${p.n === 1 ? 'teoksesta' : 'teoksesta'}`,
      picks.map(item => discCard(item, reason)).join('')
    ));
    await new Promise(res => setTimeout(res, 80));
  }

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Suosikkitekijöiltäsi ei löytynyt teoksia, joita et olisi jo arvostellut.');
}

// ── 3. SAMANKALTAISET SUOSIKKIEN KANSSA ──
async function discoverSimilar(out){
  const top = (appData.reviews || [])
    .filter(r => r.tmdb_id && getReviewScore(r) != null && getReviewScore(r) >= 75)
    .sort((a,b) => getReviewScore(b) - getReviewScore(a))
    .slice(0, 6);

  if(!top.length){
    discStatus('');
    out.innerHTML = discEmpty('Ei yhtään vähintään 75 pisteen teosta, jolla on TMDB-linkitys.');
    return;
  }

  const ids = reviewedTmdbIds();
  const names = reviewedNames();
  const seen = new Set();
  const sections = [];

  for(let i = 0; i < top.length; i++){
    const r = top[i];
    const type = r.tmdb_type || (r.tvType ? 'tv' : 'movie');
    discStatus(`Haetaan ${i+1}/${top.length}: ${esc(plainName(r))}`, true);

    const rec = await tmdbGet(`/${type}/${r.tmdb_id}/recommendations?language=fi-FI&page=1`);
    if(!rec || !rec.results) continue;

    const picks = rec.results
      .filter(item => !alreadyHave(item, ids, names))
      .filter(item => !seen.has(item.id))
      .filter(item => (item.vote_count || 0) >= 50)
      .slice(0, discCount());

    picks.forEach(item => seen.add(item.id));
    if(!picks.length) continue;

    const score = getReviewScore(r);
    sections.push(discSection(
      `✨ Koska pidit: ${esc(plainName(r))}`,
      `Annoit sille ${score} pistettä`,
      picks.map(item => discCard(item, `Samankaltainen kuin ${esc(plainName(r))}`)).join('')
    ));
    await new Promise(res => setTimeout(res, 80));
  }

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Ei uusia ehdotuksia — TMDB:n suositukset ovat teoksia jotka olet jo arvostellut.');
}

// ── 4. PUUTTUVAT OSAT ELOKUVASARJOISTA ──
async function discoverCollections(out){
  const withColl = (appData.reviews || []).filter(r => r.collection && r.collection.id);
  if(!withColl.length){
    discStatus('');
    out.innerHTML = discEmpty('Yhdelläkään elokuvalla ei ole kokoelmatietoa. Päivitä elokuvien TMDB-tiedot, niin kokoelmat tallentuvat.');
    return;
  }

  const ids = reviewedTmdbIds();
  const names = reviewedNames();
  const done = new Set();
  const sections = [];
  const list = withColl.filter(r => {
    if(done.has(r.collection.id)) return false;
    done.add(r.collection.id);
    return true;
  });

  for(let i = 0; i < list.length; i++){
    const r = list[i];
    discStatus(`Haetaan ${i+1}/${list.length}: ${esc(r.collection.name)}`, true);
    const coll = await tmdbGet(`/collection/${r.collection.id}?language=fi-FI`);
    if(!coll || !coll.parts) continue;

    const missing = coll.parts
      .filter(item => !alreadyHave(Object.assign({ media_type:'movie' }, item), ids, names))
      .sort((a,b) => (a.release_date || '').localeCompare(b.release_date || ''));

    if(!missing.length) continue;
    const have = coll.parts.length - missing.length;
    sections.push(discSection(
      `🎞️ ${esc(coll.name)}`,
      `Olet nähnyt ${have}/${coll.parts.length} osaa`,
      missing.map(item => discCard(item, `Puuttuu kokoelmasta ${esc(coll.name)}`)).join('')
    ));
    await new Promise(res => setTimeout(res, 80));
  }

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Olet nähnyt kaikki osat niistä kokoelmista jotka tunnetaan.');
}

// ── 5. KLASSIKOT JOITA ET OLE NÄHNYT ──
// Painotus tulee omista pisteistäsi: haetaan vain niistä genreistä joille
// annat keskimäärin parhaat pisteet. "Klassikko" = vähintään 20 vuotta
// vanha ja laajasti äänestetty, jotta listalle ei nouse tuoretta hittiä
// eikä tuntematonta kuriositeettia.
// Asetuksista säädettävissä; vakio jää oletukseksi.
function classicAge(){ return Number((appData.settings||{}).classicAge) || 20; }
const CLASSIC_AGE  = 20;     // vuotta
const CLASSIC_VOTES = 700;   // vähimmäisäänimäärä TMDB:ssä

function bestGenres(){
  const stats = new Map();   // genre -> { sum, n }
  (appData.reviews || []).forEach(r => {
    const sc = getReviewScore(r);
    if(sc == null) return;
    // Vain elokuvamaiset kategoriat: sarjojen pisteet eivät kerro
    // mitään siitä millaisista elokuvaklassikoista pidät.
    if(!catHas(r.category, 'genre')) return;
    const gs = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
    gs.forEach(g => {
      if(genreToTmdbId(g) == null) return;
      if(!stats.has(g)) stats.set(g, { sum: 0, n: 0 });
      const o = stats.get(g);
      o.sum += sc; o.n++;
    });
  });

  return [...stats.entries()]
    .map(([name, o]) => ({ name, avg: Math.round(o.sum / o.n), n: o.n, id: genreToTmdbId(name) }))
    // Yksi arvostelu ei riitä genren luonnehtimiseen, kaksi jo riittää
    .filter(g => g.n >= 2)
    .sort((a, b) => b.avg - a.avg || b.n - a.n)
    .slice(0, 3);
}

async function discoverClassics(out){
  const liked = bestGenres();
  if(!liked.length){
    discStatus('');
    out.innerHTML = discEmpty('Tarvitaan vähintään kaksi pisteytettyä elokuvaa samasta genrestä, jotta osaan päätellä mistä pidät. Lisää genretiedot arvosteluihin tai päivitä ne TMDB:stä.');
    return;
  }

  const cutoff = `${new Date().getFullYear() - classicAge()}-12-31`;
  const ids   = reviewedTmdbIds();
  const names = reviewedNames();
  const seen  = new Set();
  const sections = [];
  const want = discCount();

  for(let i = 0; i < liked.length; i++){
    const g = liked[i];
    discStatus(`Haetaan klassikoita ${i+1}/${liked.length}: ${esc(g.name)}`, true);

    // Haetaan kaksi sivua, jotta jo nähtyjen karsimisen jälkeen jää
    // riittävästi ehdotettavaa myös hyvin katsotuissa genreissä.
    const pages = [];
    for(let page = 1; page <= 2; page++){
      const res = await tmdbGet(
        `/discover/movie?language=fi-FI&page=${page}` +
        `&with_genres=${g.id}` +
        `&sort_by=vote_average.desc` +
        `&vote_count.gte=${CLASSIC_VOTES}` +
        `&primary_release_date.lte=${cutoff}`
      );
      if(res && res.results) pages.push(...res.results);
      if(!res || !res.results || res.results.length < 20) break;
      await new Promise(r => setTimeout(r, 80));
    }

    const picks = pages
      .filter(item => !alreadyHave(Object.assign({ media_type: 'movie' }, item), ids, names))
      .filter(item => !seen.has(item.id))
      .slice(0, want);

    picks.forEach(item => seen.add(item.id));
    if(!picks.length) continue;

    sections.push(discSection(
      `🏛️ ${esc(g.name)}`,
      `Keskiarvosi genressä ${g.avg} pistettä (${g.n} teosta) · vähintään ${classicAge()} vuotta vanhoja`,
      picks.map(item => discCard(item, `Klassikko genressä ${esc(g.name)}, jota et ole arvostellut`)).join('')
    ));
    await new Promise(r => setTimeout(r, 80));
  }

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Olet nähnyt parhaiden genrejesi klassikot jo. Nosta ehdotusten määrää tai anna pisteitä useammalle genrelle.');
}

// ── EHDOTUSTEN MÄÄRÄ ──
const DISCOVER_COUNTS = [2, 3, 5, 8];

window.renderDiscoverCount = function(){
  const el = document.getElementById('discCountRow');
  if(!el) return;
  const cur = discCount();
  el.innerHTML = DISCOVER_COUNTS.map(n =>
    `<button type="button" class="filter-chip ${n === cur ? 'active' : ''}" onclick="setDiscoverCount(${n})">${n}</button>`
  ).join('');
};

window.setDiscoverCount = async function(n){
  ensureSettings().discoverCount = n;
  window.renderDiscoverCount();
  await window.fbSave();
};

// ── 6. PÄÄTTYNEET SARJAT ──
// Sarjoja joita ei tarvitse jäädä odottamaan: tarina on kokonaan
// katsottavissa. TMDB:n with_status: 3 = Ended, 4 = Canceled. Peruttu
// sarja ei jatku sekään, joten molemmat kelpaavat.
//
// TV-genrejen tunnukset ovat eri kuin elokuvien, eikä kaikille omille
// genreille ole vastinetta — silloin haetaan ilman genrerajausta.
const TV_GENRE_IDS = {
  'toiminta':10759, 'seikkailu':10759, 'animaatio':16, 'komedia':35,
  'rikostarina':80, 'dokumentti':99, 'draama':18, 'perhe':10751,
  'fantasia':10765, 'sci-fi':10765, 'scifi':10765, 'mysteeri':9648,
  'trilleri':9648, 'jännitys':9648, 'sota':10768, 'western':37,
  'historia':10768, 'noir':80, 'tositapahtumat':99
};

function tvGenreId(name){
  const k = String(name || '').toLowerCase().trim();
  return TV_GENRE_IDS[k] != null ? TV_GENRE_IDS[k] : null;
}

// Parhaat TV-genret omien sarja-arvostelujen perusteella. Sarjapisteet
// eivät kerro elokuvamausta eivätkä päinvastoin, joten tässä katsotaan
// vain TV-sarjoja.
function bestTvGenres(){
  const stats = new Map();
  (appData.reviews || []).forEach(r => {
    if(r.category !== 'TV-sarjat') return;
    const sc = getReviewScore(r);
    if(sc == null) return;
    const gs = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
    // Useampi oma genre voi osoittaa samaan TMDB-tunnukseen (esim. toiminta ja
    // seikkailu ovat molemmat 10759). Ne niputetaan yhteen, koska muuten sama
    // haku tehtäisiin kahdesti ja veisi kaksi kolmesta hakupaikasta.
    // Sama arvostelu lasketaan tunnusta kohden vain kerran.
    const seenIds = new Set();
    gs.forEach(g => {
      const id = tvGenreId(g);
      if(id == null || seenIds.has(id)) return;
      seenIds.add(id);
      const key = String(id);
      if(!stats.has(key)) stats.set(key, { name:g, id, sum:0, n:0 });
      const o = stats.get(key);
      o.sum += sc; o.n++;
    });
  });
  return [...stats.values()]
    .map(o => ({ ...o, avg: Math.round(o.sum / o.n) }))
    .filter(o => o.n >= 2)
    .sort((a, b) => b.avg - a.avg || b.n - a.n)
    .slice(0, 3);
}

const ENDED_VOTES = 200;   // sarjoilla on vähemmän ääniä kuin elokuvilla

// ── TOSITARINAT ──
// TMDB:llä ei ole "perustuu tositapahtumiin" -genreä, joten haku tehdään
// avainsanalla 9672 (based on true story). Dokumentit ja animaatiot rajataan
// pois, koska ne kuuluvat omiin alalajeihinsa — jäljelle jää juuri se mitä
// Tositarinat tarkoittaa: näytelty elokuva tai sarja tositapahtumista.
const TRUE_STORY_KEYWORD = 9672;
const TRUE_STORY_EXCLUDE = '99,16';   // dokumentti, animaatio
const TRUE_STORY_VOTES   = 300;

// Ehdotuskortti joka esivalitsee Tositarinat-alalajin lisättäessä.
function trueStoryCard(item, type, reason){
  const html = discCard(Object.assign({ media_type: type }, item), reason);
  const title = item.title || item.name || '';
  return html.replace(
    `addFromDiscover('${escJs(title)}', '${type}')`,
    `addFromDiscover('${escJs(title)}', '${type}', 'Tositarinat')`
  );
}

async function trueStoryPages(type, extraQuery, pages){
  const out = [];
  for(let page = 1; page <= pages; page++){
    const res = await tmdbGet(
      `/discover/${type}?language=fi-FI&page=${page}` +
      `&with_keywords=${TRUE_STORY_KEYWORD}` +
      `&without_genres=${TRUE_STORY_EXCLUDE}` +
      extraQuery
    );
    if(res && res.results) out.push(...res.results);
    if(!res || !res.results || res.results.length < 20) break;
    await new Promise(r => setTimeout(r, 80));
  }
  return out;
}

async function discoverTrueStories(out){
  const ids   = reviewedTmdbIds();
  const names = reviewedNames();
  const seen  = new Set();
  const want  = discCount();
  const sections = [];
  const thisYear = new Date().getFullYear();

  const pick = (list, type) => list
    .filter(item => !alreadyHave(Object.assign({ media_type: type }, item), ids, names))
    .filter(item => !seen.has(type + ':' + item.id))
    .slice(0, want);

  // 1. Arvostetuimmat. Äänikynnys karsii pois pienet tuntemattomat, joiden
  //    keskiarvo on korkea vain kymmenen äänen takia.
  discStatus('Haetaan arvostetuimpia tositarinoita…', true);
  const best = pick(await trueStoryPages('movie',
    `&sort_by=vote_average.desc&vote_count.gte=${TRUE_STORY_VOTES}`, 2), 'movie');
  best.forEach(i => seen.add('movie:' + i.id));
  if(best.length) sections.push(discSection(
    '🏅 Arvostetuimmat tositarinat',
    `Näyteltyjä elokuvia tositapahtumista · vähintään ${TRUE_STORY_VOTES} ääntä TMDB:ssä`,
    best.map(i => trueStoryCard(i, 'movie', 'Tositapahtumiin perustuva elokuva jota et ole arvostellut')).join('')
  ));

  // 2. Tuoreet. Sama aihe, mutta viimeisiltä vuosilta ja matalammalla
  //    äänikynnyksellä — uusi elokuva ei ehdi kerätä satoja ääniä.
  discStatus('Haetaan tuoreita tositarinoita…', true);
  const fresh = pick(await trueStoryPages('movie',
    `&sort_by=popularity.desc&vote_count.gte=50` +
    `&primary_release_date.gte=${thisYear - 3}-01-01`, 2), 'movie');
  fresh.forEach(i => seen.add('movie:' + i.id));
  if(fresh.length) sections.push(discSection(
    '🆕 Tuoreet tositarinat',
    `Vuodesta ${thisYear - 3} alkaen`,
    fresh.map(i => trueStoryCard(i, 'movie', 'Uudehko tositapahtumiin perustuva elokuva')).join('')
  ));

  // 3. Sarjat. Sama avainsana toimii myös sarjapuolella.
  discStatus('Haetaan tositarinoihin perustuvia sarjoja…', true);
  const tv = pick(await trueStoryPages('tv',
    `&sort_by=vote_average.desc&vote_count.gte=100`, 2), 'tv');
  tv.forEach(i => seen.add('tv:' + i.id));
  if(tv.length) sections.push(discSection(
    '📺 Tositarinat sarjoina',
    'Näyteltyjä sarjoja tositapahtumista',
    tv.map(i => trueStoryCard(i, 'tv', 'Tositapahtumiin perustuva sarja jota et ole arvostellut')).join('')
  ));

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Kaikki löytyneet tositarinat ovat jo arvostelussasi. Nosta ehdotusten määrää valitsimesta, niin haetaan syvemmältä.');
}

// ── EI KIINNOSTA -LISTA ──
// Ohitetut teokset elävät asetuksissa, joten lista synkronoituu pilveen eikä
// jää yhteen laitteeseen. Avain on tyyppi ja tunnus yhdessä, koska elokuvalla
// ja sarjalla voi olla sama numero.
function hiddenMap(){
  try{
    ensureSettings();
    if(!appData.settings.discoverHidden) appData.settings.discoverHidden = {};
    return appData.settings.discoverHidden;
  }catch(e){ return {}; }
}
function isHidden(type, id){ return !!hiddenMap()[type + ':' + id]; }

window.hideFromDiscover = async function(type, id, title){
  const m = hiddenMap();
  m[type + ':' + id] = title || true;
  await window.fbSave();
  window.closeModal('discDetailModal');
  // Kortti poistetaan heti näkyvistä, jotta valinta näkyy ilman uutta hakua.
  // Alue luetaan ennen poistoa, koska irrotetulla elementillä ei ole enää
  // vanhempaa josta sen tunnistaisi.
  const card = document.querySelector(`.disc-card[data-key="${type}:${id}"]`);
  const fromSearch = !!(card && card.closest('#discSearchResults'));
  if(card) card.remove();
  // Kuittaus siihen kohtaan josta ohitus tehtiin. Nimihaussa katse on
  // hakukentässä, joten sivun pohjalle kirjoitettu viesti jäi huomaamatta.
  const say = fromSearch ? discSearchStatus : discStatus;
  say('🚫 Ei ehdoteta enää. Listan voi tyhjentää asetuksista.');
  setTimeout(() => say(''), 2600);
};

window.hiddenCount = function(){ return Object.keys(hiddenMap()).length; };

window.clearHiddenDiscover = async function(){
  const n = window.hiddenCount();
  if(!n){ alert('Lista on jo tyhjä.'); return; }
  if(!confirm(`Tyhjennetäänkö "ei kiinnosta" -lista?\n\n${n} teosta voi taas tulla ehdotuksiin.`)) return;
  appData.settings.discoverHidden = {};
  await window.fbSave();
  if(window.renderHiddenInfo) window.renderHiddenInfo();
};

// ── TEOKSEN TIEDOT ──
// Ehdotuskortti näyttää vain katkaistun juonen. Tästä näkymästä saa koko
// tekstin, tuotantotiedot ja sen mistä teoksen voi Suomessa katsoa.
const PROVIDER_LOGO = 'https://image.tmdb.org/t/p/w45';

function providerRow(label, list){
  if(!list || !list.length) return '';
  return `<div class="dd-prov-row">
    <div class="dd-prov-label">${label}</div>
    <div class="dd-prov-list">${list.map(p => `<span class="dd-prov">
        ${p.logo_path ? `<img src="${PROVIDER_LOGO}${p.logo_path}" alt="" loading="lazy">` : ''}
        ${esc(p.provider_name || '')}
      </span>`).join('')}</div>
  </div>`;
}

window.openDiscoverDetail = async function(type, id){
  const modal = document.getElementById('discDetailModal');
  const body  = document.getElementById('discDetailBody');
  if(!modal || !body) return;
  body.innerHTML = '<div class="dd-loading">Haetaan tietoja…</div>';
  modal.classList.add('open');

  const d = await tmdbGet(`/${type}/${id}?language=fi-FI&append_to_response=watch/providers,credits`);
  if(!d){
    body.innerHTML = '<div class="dd-loading">Tietojen haku ei onnistunut. Tarkista verkkoyhteys.</div>';
    return;
  }

  const title = d.title || d.name || '';
  const year  = (d.release_date || d.first_air_date || '').slice(0,4);
  const genres = (d.genres || []).map(g => g.name).filter(Boolean);
  const crew = (d.credits && d.credits.crew) || [];
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 6).map(c => c.name);
  const director = crew.filter(c => c.job === 'Director').map(c => c.name);
  const creators = (d.created_by || []).map(c => c.name);

  // Kesto: elokuvalla minuutteina, sarjalla kausien ja jaksojen määrä.
  const runtime = type === 'movie'
    ? (d.runtime ? `${d.runtime} min` : '')
    : [d.number_of_seasons ? `${d.number_of_seasons} kautta` : '',
       d.number_of_episodes ? `${d.number_of_episodes} jaksoa` : ''].filter(Boolean).join(' · ');

  // Suoratoisto. TMDB tarjoaa tiedot maittain ja ne tulevat JustWatchilta,
  // joten lähde mainitaan kuten TMDB:n ehdot edellyttävät.
  const wp = (d['watch/providers'] && d['watch/providers'].results) || {};
  const fi = wp.FI || null;
  let watch;
  if(!fi){
    watch = `<div class="dd-prov-none">Ei tietoa saatavuudesta Suomessa.</div>`;
  } else {
    const rows = providerRow('Suoratoistossa', fi.flatrate)
               + providerRow('Vuokraa', fi.rent)
               + providerRow('Osta', fi.buy);
    watch = rows || `<div class="dd-prov-none">Ei tarjolla Suomessa juuri nyt.</div>`;
  }

  const meta = [year, runtime, genres.join(', ')].filter(Boolean).join(' · ');
  const people = [
    director.length ? `<div class="dd-line"><b>Ohjaus</b> ${esc(director.join(', '))}</div>` : '',
    creators.length ? `<div class="dd-line"><b>Luonut</b> ${esc(creators.join(', '))}</div>` : '',
    cast.length     ? `<div class="dd-line"><b>Roolissa</b> ${esc(cast.join(', '))}</div>` : ''
  ].join('');

  body.innerHTML = `
    ${d.backdrop_path ? `<img class="dd-backdrop" src="https://image.tmdb.org/t/p/w780${d.backdrop_path}" alt="">` : ''}
    <div class="dd-title">${esc(title)}</div>
    <div class="dd-meta">${esc(meta)}</div>
    ${d.vote_average ? `<div class="dd-score">⭐ ${Math.round(d.vote_average*10)/10}/10 TMDB · ${d.vote_count || 0} ääntä</div>` : ''}
    ${d.overview ? `<div class="dd-overview">${esc(d.overview)}</div>`
                 : `<div class="dd-overview dd-dim">Suomenkielistä kuvausta ei ole TMDB:ssä.</div>`}
    ${people}
    <div class="dd-sect">📺 Missä katsoa Suomessa</div>
    ${watch}
    <div class="dd-source">Saatavuustiedot: JustWatch TMDB:n kautta</div>
    <div class="dd-btns">
      <button class="dd-btn dd-btn-add" onclick="closeModal('discDetailModal'); addFromDiscover('${escJs(title)}','${type}','${escJs(window._discSubcat || '')}')">+ Lisää arvosteluihin</button>
      <button class="dd-btn dd-btn-watch" onclick="closeModal('discDetailModal'); addToWatchlist('${escJs(title)}','${type}',${Number(id)},'${escJs(d.poster_path || '')}','${escJs(String(year || ''))}')">📌 Katselulistalle</button>
      <button class="dd-btn dd-btn-no" onclick="hideFromDiscover('${type}',${Number(id)},'${escJs(title)}')">🚫 Ei kiinnosta</button>
    </div>`;
};

window.renderHiddenInfo = function(){
  const el = document.getElementById('hiddenBox');
  if(!el) return;
  const m = hiddenMap();
  const keys = Object.keys(m);
  if(!keys.length){
    el.innerHTML = `<div class="sc-note">Et ole vielä merkinnyt yhtään teosta ohitetuksi. Löydä-osiossa jokaisen ehdotuksen kohdalla on 🚫-nappi.</div>`;
    return;
  }
  const rows = keys.map(k => {
    const name = (typeof m[k] === 'string' && m[k]) ? m[k] : k;
    const type = k.split(':')[0] === 'tv' ? '📺' : '🎬';
    return `<div class="dim-row"><span class="dim-row-label">${type} ${esc(name)}</span>
      <button type="button" class="sc-mini" onclick="unhideFromDiscover('${escJs(k)}')">↩︎</button></div>`;
  }).join('');
  el.innerHTML = `<div class="sc-note">Näitä ${keys.length} teosta ei ehdoteta Löydä-osiossa. Palauta yksittäinen ↩︎-napista tai tyhjennä koko lista.</div>
    ${rows}
    <button type="button" class="sc-add" onclick="clearHiddenDiscover()">🗑️ Tyhjennä lista</button>`;
};

window.unhideFromDiscover = async function(key){
  const m = hiddenMap();
  delete m[key];
  await window.fbSave();
  window.renderHiddenInfo();
};

// ── SUORA HAKU NIMELLÄ ──
// Löydä-osion muut haut lähtevät omista arvosteluista. Tämä on eri asia:
// katsotaan yksittäistä teosta jota harkitsee, ilman aikomusta arvostella.
// Siksi tuloksista EI suodateta pois jo arvosteltuja eikä ohitettuja — jos
// haet nimellä, haluat nähdä osuman vaikka teos olisi jo kirjastossasi.
//
// Tuloksilla on oma alue heti hakukentän alla, koska hakiessa katse on
// kentässä eikä sivun pohjalla. Nappihaut kirjoittavat edelleen alas.

function discSearchStatus(html, spinning){
  const el = document.getElementById('discSearchStatus');
  if(!el) return;
  if(!html){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = (spinning ? '<span class="disc-spin"></span>' : '') + html;
}

window.onDiscSearchKey = function(e){
  if(e && e.key === 'Enter'){ e.preventDefault(); window.runDiscSearch(); }
};

window.clearDiscSearch = function(){
  const inp = document.getElementById('discSearchInput');
  if(inp){ inp.value = ''; inp.focus(); }
  const out = document.getElementById('discSearchResults');
  if(out) out.innerHTML = '';
  discSearchStatus('');
};

// TMDB:n oma haku ei siedä kirjoitusvirheitä juuri lainkaan. Siksi haetaan
// tarvittaessa useammalla muunnelmalla ja lajitellaan tulokset lopuksi
// sovelluksen omalla sumealla vertailulla. Kutsuja on enintään viisi.
function searchVariants(q){
  const out = [q];
  const words = q.split(/\s+/).filter(Boolean);
  const longest = words.slice().sort((a,b) => b.length - a.length)[0] || q;

  // Lopusta lyhentäminen auttaa kun loppu on kirjoitettu väärin tai kesken.
  if(q.length > 4) out.push(q.slice(0, -1));
  if(q.length > 6) out.push(q.slice(0, -2));
  // Pisin sana yksin auttaa kun virhe on jossain muussa sanassa.
  if(words.length > 1 && longest.length > 3) out.push(longest);
  // Väärä tai ylimääräinen kirjain sanan sisällä: poistetaan yksi kirjain
  // parista kohdasta. Tämä on se muunnelma joka pelastaa lyhyet sanat —
  // "fuury" muuttuu muotoon "fury", jota TMDB ei muuten löytäisi lainkaan.
  if(longest.length > 4){
    const mid = Math.floor(longest.length / 2);
    [mid, mid + 1].forEach(i => {
      if(i > 0 && i < longest.length) out.push(longest.slice(0, i) + longest.slice(i + 1));
    });
  }
  return [...new Set(out)].slice(0, 5);
}

window.runDiscSearch = async function(){
  const inp = document.getElementById('discSearchInput');
  const q = (inp?.value || '').trim();
  const out = document.getElementById('discSearchResults');
  if(!out) return;
  if(!q){ discSearchStatus('Kirjoita ensin hakusana.'); setTimeout(()=>discSearchStatus(''), 2000); return; }
  if(!window.tmdbToken){ alert('TMDB-tunnus ei ole vielä latautunut. Yritä hetken kuluttua uudelleen.'); return; }

  window._discSubcat = '';
  out.innerHTML = '';
  discSearchStatus(`Haetaan: ${esc(q)}`, true);

  try{
    const variants = searchVariants(q);
    const found = new Map();          // tyyppi:id -> teos
    let usedFuzzy = false;

    for(let i = 0; i < variants.length; i++){
      // Muunnelmiin siirrytään vasta jos suora haku antoi vähän osumia.
      if(i > 0 && found.size >= 5) break;
      if(i > 0) usedFuzzy = true;

      const res = await tmdbGet(
        `/search/multi?language=fi-FI&include_adult=false&query=${encodeURIComponent(variants[i])}`
      );
      ((res && res.results) || [])
        .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
        .forEach(r => { if(!found.has(r.media_type + ':' + r.id)) found.set(r.media_type + ':' + r.id, r); });

      if(i < variants.length - 1) await new Promise(r => setTimeout(r, 80));
    }

    if(!found.size){
      discSearchStatus('');
      out.innerHTML = discEmpty(`Ei osumia haulla "${esc(q)}". Kokeile alkuperäistä nimeä tai lyhyempää hakusanaa.`);
      return;
    }

    // Lajittelu sovelluksen omalla sumealla vertailulla. Vertaillaan sekä
    // suomenkieliseen että alkuperäiseen nimeen, koska TMDB palauttaa
    // molempia ja käyttäjä on voinut kirjoittaa kumman tahansa.
    const nq = fuzzyNormCached(q);
    const scored = [...found.values()].map(item => {
      const t1 = fuzzyNormCached(item.title || item.name || '');
      const t2 = fuzzyNormCached(item.original_title || item.original_name || '');
      const s  = Math.max(fuzzyMatch(nq, t1), fuzzyMatch(nq, t2));
      return { item, s, pop: item.popularity || 0 };
    });

    // Täysin osumattomat pudotetaan vain jos oikeita osumia on tarpeeksi.
    // Muuten luotetaan TMDB:n omaan järjestykseen eikä jätetä tyhjää ruutua.
    const good = scored.filter(x => x.s > 0);
    const list = (good.length >= 3 ? good : scored)
      .sort((a,b) => b.s - a.s || b.pop - a.pop)
      .slice(0, 12);

    const ids   = reviewedTmdbIds();
    const names = reviewedNames();
    const cards = list.map(({ item }) => {
      const type = item.media_type;
      let tag;
      if(isHidden(type, item.id))               tag = '🚫 Merkitty ohitetuksi';
      else if(alreadyHaveRaw(item, ids, names)) tag = '✓ Tämä on jo arvostelussasi';
      else                                      tag = type === 'tv' ? 'TV-sarja' : 'Elokuva';
      return discCard(item, tag);
    }).join('');

    discSearchStatus('');
    out.innerHTML = discSection(
      `🔎 Osumat haulla "${esc(q)}"`,
      `${list.length} tulosta${usedFuzzy ? ' · mukana sumeita osumia' : ''} · avaa teos nähdäksesi juonen ja missä sen voi katsoa Suomessa`,
      cards
    );
  } catch(e){
    console.error(e);
    discSearchStatus('❌ Haku epäonnistui. Tarkista internetyhteys.');
  }
};

async function discoverEndedSeries(out){
  const ids   = reviewedTmdbIds();
  const names = reviewedNames();
  const seen  = new Set();
  const want  = discCount();
  const liked = bestTvGenres();
  const sections = [];

  // Ilman riittävää sarjahistoriaa haetaan yleisesti parhaat päättyneet
  // sarjat. Se on hyödyllisempi kuin tyhjä näkymä ja kehotus palata
  // myöhemmin.
  const targets = liked.length
    ? liked
    : [{ name:null, id:null, avg:null, n:0 }];

  for(let i = 0; i < targets.length; i++){
    const g = targets[i];
    discStatus(g.name
      ? `Haetaan päättyneitä sarjoja ${i+1}/${targets.length}: ${esc(g.name)}`
      : 'Haetaan arvostetuimpia päättyneitä sarjoja', true);

    const results = [];
    for(let page = 1; page <= 2; page++){
      const res = await tmdbGet(
        `/discover/tv?language=fi-FI&page=${page}` +
        `&with_status=3|4` +
        `&sort_by=vote_average.desc` +
        `&vote_count.gte=${ENDED_VOTES}` +
        (g.id ? `&with_genres=${g.id}` : '')
      );
      if(res && res.results) results.push(...res.results);
      if(!res || !res.results || res.results.length < 20) break;
      await new Promise(r => setTimeout(r, 80));
    }

    const picks = results
      .filter(item => !alreadyHave(Object.assign({ media_type: 'tv' }, item), ids, names))
      .filter(item => !seen.has(item.id))
      .slice(0, want);

    picks.forEach(item => seen.add(item.id));
    if(!picks.length) continue;

    sections.push(discSection(
      g.name ? `🏁 ${esc(g.name)}` : '🏁 Päättyneet sarjat',
      g.name
        ? `Keskiarvosi genressä ${g.avg} pistettä (${g.n} sarjaa) · tarina on kokonaan katsottavissa`
        : 'Arvostetuimmat loppuun asti kerrotut sarjat',
      picks.map(item => discCard(item, 'Päättynyt sarja — ei tarvitse odottaa jatkoa')).join('')
    ));
    await new Promise(r => setTimeout(r, 80));
  }

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Et löytänyt uusia päättyneitä sarjoja. Nosta ehdotusten määrää tai kokeile toista hakua.');
}


// ── 10. MINISARJAT YHTEEN ILTAAN ──
// TMDB tuntee sarjatyypin: with_type=2 on miniseries. Se on paljon
// luotettavampi kuin jaksomäärän arvailu, koska minisarja on rajattu
// tarina jo lähtökohtaisesti. Jaksomäärä ja kokonaiskesto haetaan
// yksitellen vasta karsinnan jälkeen — samasta syystä kuin pitkissä
// sarjoissa: kutsuja kuluisi muuten moninkertaisesti.
const MINI_TYPE       = 2;    // TMDB:n sarjatyyppi "miniseries"
const MINI_MAX_EP     = 8;    // enintään näin monta jaksoa koko sarjassa
const MINI_MAX_MIN    = 420;  // enintään seitsemän tuntia yhteensä
const MINI_CHECK_MAX  = 14;   // montako ehdokasta tarkistetaan hakua kohden

async function discoverMiniSeries(out){
  const ids   = reviewedTmdbIds();
  const names = reviewedNames();
  const want  = discCount();
  const liked = bestTvGenres();
  const seen  = new Set();
  const sections = [];

  // Ilman omia sarja-arvosteluja haetaan ilman genrerajausta.
  const targets = liked.length ? liked : [{ name:null, id:null, avg:null, n:0 }];

  for(let i = 0; i < targets.length; i++){
    const g = targets[i];
    discStatus(g.name
      ? `Haetaan minisarjoja ${i+1}/${targets.length}: ${esc(g.name)}`
      : 'Haetaan arvostetuimpia minisarjoja', true);

    const results = [];
    for(let page = 1; page <= 2; page++){
      const res = await tmdbGet(
        `/discover/tv?language=fi-FI&page=${page}` +
        `&with_type=${MINI_TYPE}` +
        `&sort_by=vote_average.desc` +
        `&vote_count.gte=${ENDED_VOTES}` +
        (g.id ? `&with_genres=${g.id}` : '')
      );
      if(res && res.results) results.push(...res.results);
      if(!res || !res.results || res.results.length < 20) break;
      await new Promise(r => setTimeout(r, 80));
    }

    const candidates = results
      .filter(item => !alreadyHave(Object.assign({ media_type:'tv' }, item), ids, names))
      .filter(item => !seen.has(item.id))
      .slice(0, MINI_CHECK_MAX);

    const picks = [];
    for(const item of candidates){
      if(picks.length >= want) break;
      const d = await tmdbGet(`/tv/${item.id}?language=fi-FI`);
      await new Promise(r => setTimeout(r, 70));
      if(!d) continue;

      // Hylätty ehdokas merkitään nähdyksi heti, jottei sitä tarkisteta
      // uudelleen seuraavan genren kohdalla.
      seen.add(item.id);

      const eps = Number(d.number_of_episodes) || 0;
      if(!eps || eps > MINI_MAX_EP) continue;

      const runtime = Array.isArray(d.episode_run_time) && d.episode_run_time.length
        ? d.episode_run_time[0] : null;
      const mins = runtime ? eps * runtime : null;
      if(mins && mins > MINI_MAX_MIN) continue;

      picks.push({ item, eps, mins });
    }

    if(!picks.length) continue;

    sections.push(discSection(
      g.name ? `🌙 ${esc(g.name)}` : '🌙 Minisarjat',
      g.name
        ? `Keskiarvosi genressä ${g.avg} pistettä (${g.n} sarjaa) · rajattu tarina, enintään ${MINI_MAX_EP} jaksoa`
        : `Rajattuja tarinoita, enintään ${MINI_MAX_EP} jaksoa`,
      picks.map(p => {
        const kesto = shortRuntimeLabel(p.mins);
        const osat = [
          `${p.eps} jaksoa`,
          kesto ? `yhteensä noin ${kesto}` : '',
          (p.mins && p.mins <= 240) ? 'ehtii yhteen iltaan' : ''
        ].filter(Boolean);
        return discCard(p.item, osat.join(' · '));
      }).join('')
    ));
    await new Promise(r => setTimeout(r, 80));
  }

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Minisarjoja ei löytynyt. Nosta ehdotusten määrää tai kokeile toista hakua.');
}

// ── 7. PITKÄT SARJAT JOITA ET OLE ALOITTANUT ──
// Sarjoja joissa riittää katsottavaa pitkäksi aikaa. TMDB:n discover ei
// osaa suodattaa jaksomäärällä, joten haetaan arvostetut sarjat ja
// kysytään jaksomäärä yksitellen vasta karsinnan jälkeen — muuten
// kutsuja kuluisi kymmenkertaisesti.
function longEpisodes(){ return Number((appData.settings||{}).longEpisodes) || 40; }
const LONG_MIN_EPISODES = 40;
function longSeasons(){ return Number((appData.settings||{}).longSeasons) || 3; }
const LONG_MIN_SEASONS  = 3;
const LONG_CHECK_MAX    = 14;   // montako ehdokasta tarkistetaan yhtä hakua kohden

async function discoverLongSeries(out){
  const ids   = reviewedTmdbIds();
  const names = reviewedNames();
  const want  = discCount();
  const liked = bestTvGenres();
  const seen  = new Set();
  const sections = [];

  const targets = liked.length ? liked : [{ name:null, id:null, avg:null, n:0 }];

  for(let i = 0; i < targets.length; i++){
    const g = targets[i];
    discStatus(g.name
      ? `Haetaan pitkiä sarjoja ${i+1}/${targets.length}: ${esc(g.name)}`
      : 'Haetaan pitkiä sarjoja', true);

    const results = [];
    for(let page = 1; page <= 2; page++){
      const res = await tmdbGet(
        `/discover/tv?language=fi-FI&page=${page}` +
        `&sort_by=vote_average.desc` +
        `&vote_count.gte=${ENDED_VOTES}` +
        (g.id ? `&with_genres=${g.id}` : '')
      );
      if(res && res.results) results.push(...res.results);
      if(!res || !res.results || res.results.length < 20) break;
      await new Promise(r => setTimeout(r, 80));
    }

    // Aloittamattomat: mitään omaa arvostelua ei saa löytyä
    const candidates = results
      .filter(item => !alreadyHave(Object.assign({ media_type:'tv' }, item), ids, names))
      .filter(item => !seen.has(item.id))
      .slice(0, LONG_CHECK_MAX);

    const picks = [];
    for(const item of candidates){
      if(picks.length >= want) break;
      const d = await tmdbGet(`/tv/${item.id}?language=fi-FI`);
      await new Promise(r => setTimeout(r, 70));
      if(!d) continue;
      const eps  = Number(d.number_of_episodes) || 0;
      const seas = Number(d.number_of_seasons) || 0;
      // Hylätty ehdokas merkitään myös nähdyksi, jottei seuraava genrekierros
      // hae samaa sarjaa uudelleen vain hylätäkseen sen taas.
      seen.add(item.id);
      if(eps < longEpisodes() || seas < longSeasons()) continue;
      // Kesto arvioidaan jakson keskikestosta kun se on tiedossa
      const runtime = Array.isArray(d.episode_run_time) && d.episode_run_time.length
        ? d.episode_run_time[0] : null;
      const hours = runtime ? Math.round(eps * runtime / 60) : null;
      picks.push({ item, eps, seas, hours });
    }

    if(!picks.length) continue;

    sections.push(discSection(
      g.name ? `📚 ${esc(g.name)}` : '📚 Pitkät sarjat',
      g.name
        ? `Keskiarvosi genressä ${g.avg} pistettä (${g.n} sarjaa) · vähintään ${longSeasons()} kautta ja ${longEpisodes()} jaksoa`
        : `Vähintään ${longSeasons()} kautta ja ${longEpisodes()} jaksoa`,
      picks.map(p => discCard(p.item,
        `${p.seas} kautta · ${p.eps} jaksoa${p.hours ? ` · noin ${p.hours} h katsottavaa` : ''}`
      )).join('')
    ));
    await new Promise(r => setTimeout(r, 80));
  }

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Pitkiä aloittamattomia sarjoja ei löytynyt. Nosta ehdotusten määrää tai kokeile toista hakua.');
}

// ── 8. LYHYT ENSIMMÄINEN KAUSI ──
// Matalan kynnyksen aloitus: sarja jonka ensimmäinen kausi on lyhyt,
// jolloin kokeilu ei sido montaa iltaa. Kausien kokonaismäärä kerrotaan
// mukana, jotta näkee heti onko jatkoa luvassa jos sarja osuu makuun.
const SHORT_MAX_EP1   = 10;   // ensimmäisessä kaudessa enintään näin monta jaksoa
const SHORT_CHECK_MAX = 14;   // montako ehdokasta tarkistetaan yhtä hakua kohden

// Kesto luettavaan muotoon. Alle tunnin kestot jäävät minuuteiksi,
// koska "0 h 45 min" näyttäisi hassulta.
function shortRuntimeLabel(mins){
  if(!mins) return '';
  if(mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

async function discoverShortStart(out){
  const ids   = reviewedTmdbIds();
  const names = reviewedNames();
  const want  = discCount();
  const liked = bestTvGenres();
  const seen  = new Set();
  const sections = [];

  // Ilman omia sarja-arvosteluja haetaan ilman genrerajausta.
  const targets = liked.length ? liked : [{ name:null, id:null, avg:null, n:0 }];

  for(let i = 0; i < targets.length; i++){
    const g = targets[i];
    discStatus(g.name
      ? `Haetaan lyhyitä aloituksia ${i+1}/${targets.length}: ${esc(g.name)}`
      : 'Haetaan lyhyitä aloituksia', true);

    const results = [];
    for(let page = 1; page <= 2; page++){
      const res = await tmdbGet(
        `/discover/tv?language=fi-FI&page=${page}` +
        `&sort_by=vote_average.desc` +
        `&vote_count.gte=${ENDED_VOTES}` +
        (g.id ? `&with_genres=${g.id}` : '')
      );
      if(res && res.results) results.push(...res.results);
      if(!res || !res.results || res.results.length < 20) break;
      await new Promise(r => setTimeout(r, 80));
    }

    // Aloittamattomat: mitään omaa arvostelua ei saa löytyä
    const candidates = results
      .filter(item => !alreadyHave(Object.assign({ media_type:'tv' }, item), ids, names))
      .filter(item => !seen.has(item.id))
      .slice(0, SHORT_CHECK_MAX);

    const picks = [];
    for(const item of candidates){
      if(picks.length >= want) break;
      const d = await tmdbGet(`/tv/${item.id}?language=fi-FI`);
      await new Promise(r => setTimeout(r, 70));
      if(!d) continue;

      // Jaksomäärä luetaan nimenomaan kaudesta 1. Kausi 0 on erikoisjaksot,
      // eikä number_of_episodes kelpaa koska se kattaa koko sarjan.
      const s1  = (d.seasons || []).find(s => Number(s.season_number) === 1);
      const ep1 = s1 ? (Number(s1.episode_count) || 0) : 0;
      // Kuten pitkissä sarjoissa: hylättyä ei haeta enää uudelleen.
      seen.add(item.id);
      if(!ep1 || ep1 > SHORT_MAX_EP1) continue;

      const runtime = Array.isArray(d.episode_run_time) && d.episode_run_time.length
        ? d.episode_run_time[0] : null;
      const mins = runtime ? ep1 * runtime : null;
      const seas = Number(d.number_of_seasons) || 0;

      picks.push({ item, ep1, seas, mins });
    }

    if(!picks.length) continue;

    sections.push(discSection(
      g.name ? `⏱️ ${esc(g.name)}` : '⏱️ Lyhyt aloitus',
      g.name
        ? `Keskiarvosi genressä ${g.avg} pistettä (${g.n} sarjaa) · ensimmäisessä kaudessa enintään ${SHORT_MAX_EP1} jaksoa`
        : `Ensimmäisessä kaudessa enintään ${SHORT_MAX_EP1} jaksoa`,
      picks.map(p => {
        const kesto = shortRuntimeLabel(p.mins);
        const jatko = p.seas > 1
          ? `jatkoa ${p.seas - 1} kautta`
          : (p.seas === 1 ? 'vain yksi kausi' : '');
        const osat = [
          `Kausi 1: ${p.ep1} jaksoa`,
          kesto ? `noin ${kesto}` : '',
          jatko
        ].filter(Boolean);
        return discCard(p.item, osat.join(' · '));
      }).join('')
    ));
    await new Promise(r => setTimeout(r, 80));
  }

  discStatus('');
  out.innerHTML = sections.length
    ? sections.join('')
    : discEmpty('Lyhyen aloituskauden sarjoja ei löytynyt. Nosta ehdotusten määrää tai kokeile toista hakua.');
}
