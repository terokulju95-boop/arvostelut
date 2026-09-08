// ══ ARVOSTELUT · datan tarkistus ja korjaukset ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_DATACHECK = '2026-09-08.10';
//
// Tavallinen skripti. Ajetaan app-core.js:n JÄLKEEN.
//
// Käy arvostelut läpi paikallisesti ja etsii rakenteellisia ongelmia:
// arvosteluja jotka eivät näy missään, tunnuksia jotka osuvat päällekkäin,
// päivämääriä jotka eivät ole olemassa. Verkkoon ei oteta yhteyttä eikä
// mitään muuteta ennen kuin korjausnappia painetaan.
//
// PERIAATE — sama kuin TMDB-massapäivityksessä:
// arvosanoihin, muistiinpanoihin, merkintöihin ja jaksojen pisteisiin EI
// kosketa missään tilanteessa. Automaattikorjaus tarjotaan vain silloin
// kun oikea arvo on yksiselitteinen eikä mitään käyttäjän kirjoittamaa
// katoa. Kaikki muu vain raportoidaan.

// ════════════════════════════════════════════════════════════
// 1. TARKISTUKSET
// ════════════════════════════════════════════════════════════

// Vakavuusaste. Määrää värin ja järjestyksen.
//   virhe  = arvostelu on rikki tai näkymätön
//   huomio = toimii, mutta jokin on epäjohdonmukaista
//   tieto  = ei vikaa, mutta kannattaa tietää
const DC_LEVELS = { virhe: 0, huomio: 1, tieto: 2 };

function dcReviews(){
  return (appData.reviews || []).filter(r => r && typeof r === 'object');
}

function dcName(r){
  const n = window.plainName ? window.plainName(r) : String((r && r.name) || '');
  return n || '(nimetön)';
}

// Päivämäärä kelvollisena Date-oliona tai null.
function dcDate(v){
  if(!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function scanData(){
  const R      = dcReviews();
  const cats   = Array.isArray(appData.categories) ? appData.categories : [];
  const genres = Array.isArray(appData.genres) ? appData.genres : [];
  const issues = [];

  const add = o => { if(o.rows.length) issues.push(o); };

  // ── 1. SAMA TUNNUS KAHDESTI ──
  // Tunnus yksilöi arvostelun. Jos kaksi jakaa saman, muokkaus ja poisto
  // osuvat siihen jonka findReview sattuu löytämään ensin.
  const byId = new Map();
  R.forEach(r => {
    const k = String(r.id);
    if(!byId.has(k)) byId.set(k, []);
    byId.get(k).push(r);
  });
  add({
    id: 'dupid', level: 'virhe',
    title: 'Sama tunnus useammalla arvostelulla',
    why: 'Muokkaus ja poisto voivat osua väärään arvosteluun. Korjaus vaatii että päätät kumpi säilytetään — avaa molemmat ja poista tarpeeton.',
    rows: [...byId.entries()].filter(([, list]) => list.length > 1)
      .map(([k, list]) => ({ id: list[0].id, name: list.map(dcName).join(' · '), detail: 'tunnus ' + k })),
    fix: null
  });

  // ── 2. TYHJÄ NIMI ──
  add({
    id: 'noname', level: 'virhe',
    title: 'Arvostelu ilman nimeä',
    why: 'Nimetön arvostelu ei löydy haulla eikä erotu listassa. Avaa se ja anna nimi.',
    rows: R.filter(r => !(window.plainName ? window.plainName(r) : String(r.name || '')).trim())
      .map(r => ({ id: r.id, name: '(nimetön)', detail: r.category || 'ei kategoriaa' })),
    fix: null
  });

  // ── 3. KELVOTON PISTE ──
  // Ei korjata automaattisesti: oikeaa arvoa ei voi päätellä, ja piste on
  // juuri sitä sisältöä johon ei kosketa.
  add({
    id: 'badscore', level: 'virhe',
    title: 'Piste asteikon ulkopuolella',
    why: 'Piste vääristää keskiarvoja ja Top-listaa. Avaa arvostelu ja korjaa luku itse — sovellus ei arvaa sitä puolestasi.',
    rows: R.filter(r => {
      if(r.score == null || r.score === '') return false;
      const n = Number(r.score);
      return !isFinite(n) || n < 0 || n > 100;
    }).map(r => ({ id: r.id, name: dcName(r), detail: 'piste ' + r.score })),
    fix: null
  });

  // ── 4. KATEGORIAA EI OLE ──
  // Tämä on hiljaisin vika koko sovelluksessa: arvostelu on tallessa mutta
  // ei näy yhdelläkään välilehdellä, koska sen kategoriaa ei ole enää
  // olemassa. Se löytyy vain varmuuskopiosta.
  add({
    id: 'orphancat', level: 'virhe',
    title: 'Kategoriaa ei ole enää olemassa',
    why: 'Arvostelu on tallessa mutta ei näy millään välilehdellä. Luo kategoria uudelleen tai avaa arvostelu ja vaihda sen kategoria.',
    rows: R.filter(r => r.category && cats.length && !cats.includes(r.category))
      .map(r => ({ id: r.id, name: dcName(r), detail: 'kategoria “' + r.category + '”' })),
    fix: null
  });

  // ── 5. ALALAJIA EI OLE ──
  // Sama oire lievempänä: arvostelu ei näy missään alalajivälilehdessä.
  // Tässä oikea arvo on yksiselitteinen — tyhjä alalaji tarkoittaa Perus,
  // eikä mitään käyttäjän kirjoittamaa katoa.
  const orphanSub = R.filter(r => {
    const sub = window.subcatOf ? window.subcatOf(r) : String(r.subcat || '').trim();
    if(!sub) return false;
    const list = window.subcatsFor ? window.subcatsFor(r.category) : [];
    return list.length ? !list.includes(sub) : true;
  });
  add({
    id: 'orphansub', level: 'huomio',
    title: 'Alalajia ei ole enää olemassa',
    why: 'Arvostelu ei näy yhdessäkään alalajivälilehdessä. Korjaus siirtää sen Perus-alalajiin, jolloin se tulee taas näkyviin.',
    rows: orphanSub.map(r => ({
      id: r.id, name: dcName(r),
      detail: 'alalaji “' + (window.subcatOf ? window.subcatOf(r) : r.subcat) + '”'
    })),
    fixLabel: 'Siirrä Perus-alalajiin',
    fix: () => { orphanSub.forEach(r => { r.subcat = ''; }); return orphanSub.length; }
  });

  // ── 6. KELVOTON PÄIVÄMÄÄRÄ ──
  add({
    id: 'baddate', level: 'virhe',
    title: 'Katselupäivä ei ole kelvollinen',
    why: 'Päivämäärä ei muunnu ajaksi, joten arvostelu putoaa pois vuosisuodattimesta ja aikajärjestyksestä.',
    rows: R.filter(r => r.date && !dcDate(r.date))
      .map(r => ({ id: r.id, name: dcName(r), detail: String(r.date) })),
    fix: null
  });

  // ── 7. PÄIVÄMÄÄRÄ TULEVAISUUDESSA ──
  // Lähes aina kirjoitusvirhe vuosiluvussa. Ei korjata automaattisesti:
  // oikeaa vuotta ei voi tietää.
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  add({
    id: 'futuredate', level: 'huomio',
    title: 'Katselupäivä on tulevaisuudessa',
    why: 'Yleensä kirjoitusvirhe vuosiluvussa. Vääristää vuosittaisia lukuja.',
    rows: R.filter(r => { const d = dcDate(r.date); return d && d >= tomorrow; })
      .map(r => ({ id: r.id, name: dcName(r), detail: String(r.date) })),
    fix: null
  });

  // ── 8. MAHDOLLINEN KAKSOISKAPPALE ──
  // Sama normalisoitu nimi, sama kategoria, sama julkaisuvuosi.
  // Uusintakatselu tai remake voi olla laillinen syy, joten pelkkä huomio.
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const seen = new Map();
  const dups = [];
  R.forEach(r => {
    const key = r.category + '|' + norm(dcName(r)) + '|' + (r.year || '');
    if(!norm(dcName(r))) return;
    if(seen.has(key)) dups.push({ a: seen.get(key), b: r });
    else seen.set(key, r);
  });
  add({
    id: 'dupname', level: 'huomio',
    title: 'Kaksi arvostelua samasta teoksesta',
    why: 'Sama nimi, kategoria ja julkaisuvuosi. Uusintakatselu voi olla laillinen syy — avaa molemmat ja päätä itse.',
    rows: dups.map(d => ({ id: d.b.id, name: dcName(d.b), detail: (d.b.year || 'ei vuotta') + ' · ' + d.b.category })),
    fix: null
  });

  // ── 9. TUNTEMATON GENRE ──
  // Ei korjata poistamalla: genre on käyttäjän valitsema tieto, ja
  // oikea korjaus on yleensä lisätä genre takaisin listaan.
  const badGenre = [];
  R.forEach(r => {
    const list = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
    const unknown = list.filter(g => g && genres.length && !genres.includes(g));
    if(unknown.length) badGenre.push({ r, unknown });
  });
  add({
    id: 'badgenre', level: 'huomio',
    title: 'Genreä ei ole enää listassa',
    why: 'Genrelappu näkyy kortissa mutta sillä ei voi suodattaa. Lisää genre takaisin Lomake-välilehden genrelistaan, tai vaihda arvostelun genre.',
    rows: badGenre.map(x => ({ id: x.r.id, name: dcName(x.r), detail: x.unknown.join(', ') })),
    fix: null
  });

  // ── 10. KAUSIARVOSTELU ILMAN KAUSIA ──
  add({
    id: 'emptyparts', level: 'huomio',
    title: 'Kausi- tai jaksoarvostelu ilman sisältöä',
    why: 'Arvostelutavaksi on valittu kaudet tai jaksot, mutta yhtään ei ole lisätty. Kortti näyttää tyhjältä eikä sillä ole pistettä.',
    rows: R.filter(r => {
      if(!r.tvType || r.tvType === 'kokonaisuus') return false;
      if(r.tvType === 'jaksot'){
        return !(r.seasons || []).some(s => (s.episodes || []).length);
      }
      return !(r.parts || []).length;
    }).map(r => ({ id: r.id, name: dcName(r), detail: r.tvType === 'jaksot' ? 'ei jaksoja' : 'ei kausia' })),
    fix: null
  });

  // ── 11. VANHENTUNUT SEURAAVA JAKSO ──
  // next_air haettiin joskus TMDB:stä ja jakso on sittemmin ilmestynyt.
  // Kortti ei näytä sitä (nextAirInfo suodattaa menneet pois), mutta
  // tieto vie tilaa ja hämää massapäivityksen vertailua.
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const stale = R.filter(r => {
    const d = r.next_air && r.next_air.date ? dcDate(r.next_air.date + 'T00:00:00') : null;
    return d && d < today0;
  });
  add({
    id: 'staleair', level: 'tieto',
    title: 'Vanhentunut tieto seuraavasta jaksosta',
    why: 'Jakso on jo ilmestynyt. Korjaus tyhjentää vanhan tiedon — tuoreen saa TMDB-massapäivityksestä.',
    rows: stale.map(r => ({ id: r.id, name: dcName(r), detail: r.next_air.date })),
    fixLabel: 'Tyhjennä vanhentuneet',
    fix: () => { stale.forEach(r => { r.next_air = null; }); return stale.length; }
  });

  // ── 12. YLIMÄÄRÄISET VÄLILYÖNNIT NIMESSÄ ──
  // Rikkoo kaksoiskappaleiden tunnistuksen ja aakkosjärjestyksen.
  // Korjaus ei muuta sanaakaan, vain poistaa tyhjän tilan reunoilta.
  const spacey = R.filter(r => {
    const raw = String(r.name || '');
    // Pelkästään välilyönneistä koostuva nimi kuuluu kohtaan "ilman nimeä",
    // eikä sitä pidä raportoida kahdesti. Siistiminen ei sitä paitsi
    // auttaisi siinä mitään: lopputulos olisi edelleen tyhjä.
    if(!raw.trim()) return false;
    return raw !== raw.trim();
  });
  add({
    id: 'spacey', level: 'tieto',
    title: 'Nimessä ylimääräisiä välilyöntejä',
    why: 'Sotkee aakkosjärjestyksen ja kaksoiskappaleiden tunnistuksen. Korjaus poistaa vain nimen alusta ja lopusta tyhjän tilan — yhtään merkkiä ei muuteta.',
    rows: spacey.map(r => ({ id: r.id, name: dcName(r), detail: 'ylimääräistä tyhjää' })),
    fixLabel: 'Siisti nimet',
    fix: () => { spacey.forEach(r => { r.name = String(r.name).trim(); }); return spacey.length; }
  });

  // ── 13. TMDB-TUNNUS PUUTTUU ──
  add({
    id: 'notmdb', level: 'tieto',
    title: 'TMDB-tunnus puuttuu',
    why: 'Ilman tunnusta juliste, ohjaaja, kesto ja tuotantotila jäävät hakematta. TMDB-välilehden massapäivitys osaa etsiä tunnuksen nimen perusteella.',
    rows: R.filter(r => window.catHas && window.catHas(r.category, 'tmdb') && !r.tmdb_id)
      .map(r => ({ id: r.id, name: dcName(r), detail: r.category })),
    fix: null,
    goto: { tab: 'tmdb', sec: 'massa', label: 'Avaa massapäivitys' }
  });

  // ── 14. KATSELULISTALLA TEOS JOKA ON JO ARVOSTELTU ──
  // Normaalisti tämä siivoutuu itsestään tallennuksen yhteydessä. Jäänne
  // voi silti syntyä jos arvostelu on lisätty toisella laitteella tai
  // tuotu varmuuskopiosta.
  const wl = Array.isArray(appData.watchlist) ? appData.watchlist : [];
  const wlIds = new Set();
  const wlNames = new Set();
  R.forEach(r => {
    if(r.tmdb_id != null) wlIds.add((r.tmdb_type || (r.tvType ? 'tv' : 'movie')) + ':' + r.tmdb_id);
    const n = String(dcName(r)).toLowerCase().trim();
    if(n) wlNames.add(n);
  });
  const wlDone = wl.filter(w => {
    if(!w) return false;
    if(w.tmdb_id != null && wlIds.has((w.tmdb_type || 'movie') + ':' + w.tmdb_id)) return true;
    return wlNames.has(String(w.name || '').toLowerCase().trim());
  });
  add({
    id: 'wldone', level: 'tieto',
    title: 'Katselulistalla teos jonka olet jo arvostellut',
    why: 'Odotushuoneeseen jäänyt jäänne. Korjaus poistaa sen listalta — arvosteluun ei kosketa.',
    rows: wlDone.map(w => ({ id: null, name: String(w.name || ''), detail: w.year ? String(w.year) : '' })),
    fixLabel: 'Siivoa katselulista',
    fix: () => {
      const n = window.wlPruneReviewed ? window.wlPruneReviewed() : 0;
      return n;
    }
  });

  // ── 15. KATSELULISTAN RIKKINÄINEN TIETUE ──
  const wlBroken = wl.filter(w => !w || !w.name || !String(w.name).trim() || w.id == null);
  add({
    id: 'wlbroken', level: 'huomio',
    title: 'Katselulistan tietue on vajaa',
    why: 'Tietueelta puuttuu nimi tai tunnus, joten sitä ei voi avata eikä poistaa listanäkymästä. Korjaus poistaa vain vajaat tietueet.',
    rows: wlBroken.map((w, i) => ({ id: null, name: (w && w.name) || '(nimetön)', detail: 'rivi ' + (i + 1) })),
    fixLabel: 'Poista vajaat tietueet',
    fix: () => {
      // Luetaan appData tuoreena eikä skannaushetken muuttujasta. Jos
      // edellinen korjaus (wldone) on jo korvannut taulukon uudella, vanha
      // viittaus herättäisi poistetut tietueet henkiin ja kumoaisi sen —
      // juuri näin kävisi napista "Korjaa kaikki turvalliset".
      const cur = Array.isArray(appData.watchlist) ? appData.watchlist : [];
      const before = cur.length;
      appData.watchlist = cur.filter(w => w && w.name && String(w.name).trim() && w.id != null);
      return before - appData.watchlist.length;
    }
  });

  // ── 16. LISTALLA VIITTAUS ARVOSTELUUN JOTA EI OLE ──
  // Syntyy jos arvostelu poistettiin toisella laitteella tai palautettiin
  // vanha varmuuskopio. Viittaus ei näy listanäkymässä mitenkään, joten
  // sen huomaisi vain siitä että listan lukumäärä ei täsmää.
  const lists = Array.isArray(appData.lists) ? appData.lists : [];
  const liveIds = new Set(R.map(r => String(r.id)));
  const brokenRefs = [];
  lists.forEach(l => {
    if(!l || !Array.isArray(l.items)) return;
    const n = l.items.filter(x => !liveIds.has(String(x))).length;
    if(n) brokenRefs.push({ name: (l.icon || '📋') + ' ' + (l.name || 'nimetön'), n });
  });
  add({
    id: 'listref', level: 'huomio',
    title: 'Listalla viittaus arvosteluun jota ei ole',
    why: 'Arvostelu on poistettu mutta viittaus jäi. Listan lukumäärä näyttää suuremmalta kuin sisältö. Korjaus poistaa vain kadonneet viittaukset.',
    rows: brokenRefs.map(b => ({ id: null, name: b.name, detail: b.n + (b.n === 1 ? ' viittaus' : ' viittausta') })),
    fixLabel: 'Siivoa kadonneet viittaukset',
    fix: () => (window.listsPruneMissing ? window.listsPruneMissing() : 0)
  });

  // ── 17. TYHJÄ LISTA ──
  add({
    id: 'listempty', level: 'tieto',
    title: 'Tyhjä lista',
    why: 'Lista on luotu mutta sille ei ole lisätty yhtään teosta. Voit poistaa sen Top-näkymästä tai lisätä sisältöä arvostelun Listat-riviltä.',
    rows: lists.filter(l => l && (!Array.isArray(l.items) || !l.items.length))
      .map(l => ({ id: null, name: (l.icon || '📋') + ' ' + (l.name || 'nimetön'), detail: l.created || '' })),
    fix: null
  });

  issues.sort((a, b) => (DC_LEVELS[a.level] - DC_LEVELS[b.level]) || (b.rows.length - a.rows.length));
  return { issues, total: R.length };
}

// ════════════════════════════════════════════════════════════
// 2. NÄKYMÄ
// ════════════════════════════════════════════════════════════

let dcLast = null;          // viimeisin tulos, jotta korjaus löytää funktiot
const DC_ROWS_SHOWN = 8;    // pitkä lista tiivistetään

const dcLevelIcon = { virhe: '⛔', huomio: '⚠️', tieto: 'ℹ️' };

function dcIssueHtml(iss, idx){
  const shown = iss.rows.slice(0, DC_ROWS_SHOWN);
  const rest  = iss.rows.length - shown.length;
  // Osa riveistä ei viittaa arvosteluun lainkaan (katselulistan tietueet),
  // jolloin napautus ei saa yrittää avata mitään.
  const rows  = shown.map(row => row.id == null
    ? `<div class="dc-row dc-row-flat">
      <span class="dc-row-name">${esc(row.name)}</span>
      <span class="dc-row-detail">${esc(row.detail || '')}</span>
    </div>`
    : `<button type="button" class="dc-row" onclick="dcOpen('${escJs(String(row.id))}')">
      <span class="dc-row-name">${esc(row.name)}</span>
      <span class="dc-row-detail">${esc(row.detail || '')}</span>
    </button>`).join('');

  const fixBtn = iss.fix
    ? `<button type="button" class="dc-fix" onclick="dcFix(${idx})">🩹 ${esc(iss.fixLabel || 'Korjaa')}</button>`
    : '';
  const gotoBtn = iss.goto
    ? `<button type="button" class="dc-fix dc-goto" onclick="dcGoto('${escJs(iss.goto.tab)}','${escJs(iss.goto.sec)}')">${esc(iss.goto.label)}</button>`
    : '';

  return `<div class="dc-issue dc-${iss.level}">
    <div class="dc-head">
      <span class="dc-ico">${dcLevelIcon[iss.level]}</span>
      <span class="dc-title">${esc(iss.title)}</span>
      <span class="dc-count">${iss.rows.length}</span>
    </div>
    <div class="dc-why">${esc(iss.why)}</div>
    <div class="dc-rows">${rows}${rest > 0 ? `<div class="dc-more">…ja ${rest} muuta</div>` : ''}</div>
    ${fixBtn}${gotoBtn}
  </div>`;
}

window.renderDataCheck = function(res){
  const box = document.getElementById('dataCheckBox');
  if(!box) return;

  if(!res){
    box.innerHTML = '';
    return;
  }

  if(!res.issues.length){
    box.innerHTML = `<div class="dc-clean">
      <div class="dc-clean-ico">✅</div>
      <div class="dc-clean-title">Ei löytynyt mitään korjattavaa</div>
      <div class="dc-clean-sub">${res.total} ${res.total === 1 ? 'arvostelu' : 'arvostelua'} käyty läpi.</div>
    </div>`;
    return;
  }

  const counts = { virhe: 0, huomio: 0, tieto: 0 };
  res.issues.forEach(i => { counts[i.level] += i.rows.length; });
  const fixable = res.issues.reduce((n, i) => n + (i.fix ? i.rows.length : 0), 0);

  const summary = ['virhe', 'huomio', 'tieto']
    .filter(l => counts[l])
    .map(l => `<span class="dc-sum dc-sum-${l}">${dcLevelIcon[l]} ${counts[l]}</span>`)
    .join('');

  box.innerHTML = `
    <div class="dc-summary">${summary}
      <span class="dc-scanned">${res.total} arvostelua käyty läpi</span>
    </div>
    ${fixable ? `<button type="button" class="dc-fixall" onclick="dcFixAll()">🩹 Korjaa kaikki turvalliset (${fixable})</button>` : ''}
    ${res.issues.map((iss, i) => dcIssueHtml(iss, i)).join('')}`;
};

// ════════════════════════════════════════════════════════════
// 3. TOIMINNOT
// ════════════════════════════════════════════════════════════

window.runDataCheck = function(){
  dcLast = scanData();
  window.renderDataCheck(dcLast);
};

// Rivin napautus avaa arvostelun luettavaksi. Asetusmodaali suljetaan,
// koska lukunäkymä avautuisi muuten sen alle.
window.dcOpen = function(id){
  const r = window.findReview ? window.findReview(id) : null;
  if(!r) return;
  if(window.closeModal) window.closeModal('settingsModal');
  if(window.openReadModal) setTimeout(() => window.openReadModal(r.id), 80);
};

window.dcGoto = function(tab, sec){
  if(tab && window.setSettingsTab) window.setSettingsTab(tab);
  if(sec && window.toggleSetSec) setTimeout(() => window.toggleSetSec(sec), 60);
};

async function dcApply(list){
  let n = 0;
  list.forEach(iss => { if(iss.fix) n += (iss.fix() || 0); });
  if(!n) return;

  // Testitilassa muutokset jäävät vain muistiin, kuten kaikki muukin.
  if(window.fbSave) await window.fbSave();
  if(window.updateWatchlistBadge) window.updateWatchlistBadge();
  if(window.renderAll) window.renderAll();

  if(window.showStatus) window.showStatus(`✅ Korjattu ${n} ${n === 1 ? 'kohta' : 'kohtaa'}`, '#22c55e', 3000);
  // Tarkistus ajetaan uudelleen, jotta lista näyttää todellisen tilanteen
  // eikä korjattuja rivejä jää roikkumaan ruudulle.
  window.runDataCheck();
}

window.dcFix = function(idx){
  if(!dcLast || !dcLast.issues[idx]) return;
  dcApply([dcLast.issues[idx]]);
};

window.dcFixAll = function(){
  if(!dcLast) return;
  dcApply(dcLast.issues.filter(i => i.fix));
};

// Osio avataan tyhjänä. Tarkistus on nopea mutta ei ilmainen isolla
// kokoelmalla, eikä sitä kannata ajaa joka kerta kun asetukset avataan.
window.resetDataCheck = function(){
  dcLast = null;
  window.renderDataCheck(null);
};
