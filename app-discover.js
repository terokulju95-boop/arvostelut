// ══ ARVOSTELUT · Löydä (suositukset, uudet kaudet) ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_DISCOVER = '2026-09-01.22';

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

function alreadyHave(item, ids, names){
  const type = item.media_type || (item.title ? 'movie' : 'tv');
  if(ids.has(`${type}:${item.id}`)) return true;
  const title = item.title || item.name || '';
  return names.has(fuzzyNormCached(title));
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

  return `<div class="disc-card">
    ${poster}
    <div class="disc-body">
      <div class="disc-title">${esc(title)}${year ? ` <span class="disc-year">${year}</span>` : ''}</div>
      <div class="disc-reason">${reason}</div>
      ${score ? `<div class="disc-score">⭐ ${score}/10 TMDB</div>` : ''}
      ${overview ? `<div class="disc-overview">${overview}</div>` : ''}
      <button class="disc-add" onclick="addFromDiscover('${escJs(title)}', '${type}')">+ Lisää arvosteluihin</button>
    </div>
  </div>`;
}

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
window.addFromDiscover = function(title, type){
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
  discSetBusy(true);
  try{
    if(mode === 'new-seasons')       await discoverNewSeasons(out);
    else if(mode === 'people')       await discoverByPeople(out);
    else if(mode === 'similar')      await discoverSimilar(out);
    else if(mode === 'collections')  await discoverCollections(out);
    else if(mode === 'classics')     await discoverClassics(out);
    else if(mode === 'ended')        await discoverEndedSeries(out);
    else if(mode === 'longtv')       await discoverLongSeries(out);
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
const CLASSIC_AGE  = 20;     // vuotta
const CLASSIC_VOTES = 700;   // vähimmäisäänimäärä TMDB:ssä

function bestGenres(){
  const stats = new Map();   // genre -> { sum, n }
  (appData.reviews || []).forEach(r => {
    const sc = getReviewScore(r);
    if(sc == null) return;
    // Vain elokuvamaiset kategoriat: sarjojen pisteet eivät kerro
    // mitään siitä millaisista elokuvaklassikoista pidät.
    if(!GENRE_CATS.includes(r.category)) return;
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

  const cutoff = `${new Date().getFullYear() - CLASSIC_AGE}-12-31`;
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
      `Keskiarvosi genressä ${g.avg} pistettä (${g.n} teosta) · vähintään ${CLASSIC_AGE} vuotta vanhoja`,
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
    gs.forEach(g => {
      const id = tvGenreId(g);
      if(id == null) return;
      // Useampi oma genre voi osoittaa samaan TMDB-tunnukseen
      // (esim. toiminta ja seikkailu), joten ne niputetaan yhteen.
      const key = id + '|' + g;
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

// ── 7. PITKÄT SARJAT JOITA ET OLE ALOITTANUT ──
// Sarjoja joissa riittää katsottavaa pitkäksi aikaa. TMDB:n discover ei
// osaa suodattaa jaksomäärällä, joten haetaan arvostetut sarjat ja
// kysytään jaksomäärä yksitellen vasta karsinnan jälkeen — muuten
// kutsuja kuluisi kymmenkertaisesti.
const LONG_MIN_EPISODES = 40;
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
      if(eps < LONG_MIN_EPISODES || seas < LONG_MIN_SEASONS) continue;
      // Kesto arvioidaan jakson keskikestosta kun se on tiedossa
      const runtime = Array.isArray(d.episode_run_time) && d.episode_run_time.length
        ? d.episode_run_time[0] : null;
      const hours = runtime ? Math.round(eps * runtime / 60) : null;
      picks.push({ item, eps, seas, hours });
      seen.add(item.id);
    }

    if(!picks.length) continue;

    sections.push(discSection(
      g.name ? `📚 ${esc(g.name)}` : '📚 Pitkät sarjat',
      g.name
        ? `Keskiarvosi genressä ${g.avg} pistettä (${g.n} sarjaa) · vähintään ${LONG_MIN_SEASONS} kautta ja ${LONG_MIN_EPISODES} jaksoa`
        : `Vähintään ${LONG_MIN_SEASONS} kautta ja ${LONG_MIN_EPISODES} jaksoa`,
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
