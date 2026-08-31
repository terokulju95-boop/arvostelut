// ══ ARVOSTELUT · Löydä (suositukset, uudet kaudet) ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_DISCOVER = '2026-08-28.13';

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
      .slice(0, 4);

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
      .slice(0, 3);

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
