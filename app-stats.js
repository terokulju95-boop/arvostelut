// ══ ARVOSTELUT · tilastot ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_STATS = '2026-09-08.16';
//
// Tavallinen skripti. Ajetaan app-core.js:n JÄLKEEN.
//
// Sovelluksessa on satoja pisteytettyjä teoksia, mutta ainoa tapa katsoa
// niitä kokonaisuutena on ollut Top-lista. Tämä näkymä vastaa
// kysymyksiin joita yksittäinen kortti ei voi vastata: mitä oikeasti
// katson, milloin, ja onko makuni muuttunut.
//
// ══ KATTAVUUS ══
// Tämän moduulin tärkein sääntö: jokainen luku kertoo mihin osaan
// datasta se perustuu.
//
// Kaikilla arvosteluilla ei ole vuotta, genreä tai ohjaajaa. Jos
// genrekeskiarvo laskettaisiin hiljaa vain niistä 180 arvostelusta
// joilla genre sattuu olemaan, luku näyttäisi yhtä varmalta kuin jos se
// perustuisi kaikkiin 460:een. Se on tilastoissa pahin yksittäinen tapa
// johtaa itseään harhaan — ja sitä ei huomaa mistään.
//
// Siksi jokaisen osion alla lukee montako arvostelua siihen kelpasi.

// Kuinka monta teosta ryhmässä on oltava, ennen kuin sen keskiarvo
// näytetään. Yhden teoksen "keskiarvo" ei kerro mitään ryhmästä.
const STATS_MIN_GROUP = 3;
const STATS_TOP_N = 8;

let statsScope = 'all';   // all | <kategoria>

// ── PERUSJOUKKO ──
// Arvostelu tarkoittaa nähtyä teosta. Katselulista ei ole täällä mukana
// lainkaan, koska se on oma taulukkonsa — ks. app-watchlist.js.
function statReviews(){
  let list = (appData.reviews || []).filter(r => r && typeof r === 'object');
  if(statsScope !== 'all') list = list.filter(r => r.category === statsScope);
  return list;
}

// Pisteet numeroina. Number()-muunnos ei ole kosmeettinen: jos piste on
// tallentunut merkkijonona (vanha varmuuskopio, käsin muokattu kenttä),
// yhteenlasku liittäisi merkkijonot peräkkäin. Kahdesta arvostelusta
// '80' ja '90' tulisi keskiarvoksi 4045 eikä 85 — ja luku näyttäisi
// aivan yhtä uskottavalta kuin oikea.
function scored(list){
  return list.map(r => {
    const raw = window.getReviewScore ? window.getReviewScore(r) : r.score;
    return { r, s: raw == null || raw === '' ? null : Number(raw) };
  }).filter(x => x.s != null && isFinite(x.s));
}

function avg(nums){
  if(!nums.length) return null;
  const sum = nums.reduce((a, b) => a + Number(b), 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

function genresOf(r){
  const g = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
  return g.filter(Boolean);
}

// ════════════════════════════════════════════════════════════
// PIIRTOAPUJA
// ════════════════════════════════════════════════════════════

function statSection(title, sub, body, coverage){
  return `<div class="st-sec">
    <div class="st-sec-head">
      <div class="st-sec-title">${title}</div>
      ${sub ? `<div class="st-sec-sub">${esc(sub)}</div>` : ''}
    </div>
    ${body}
    ${coverage ? `<div class="st-cov">${esc(coverage)}</div>` : ''}
  </div>`;
}

// Vaakapalkkirivi. Arvo voi olla mitä tahansa; leveys suhteutetaan
// suurimpaan. Palkit piirretään CSS:llä, ei kirjastolla — koko
// sovelluksessa ei ole yhtään ulkoista riippuvuutta eikä sellaista
// kannata ottaa yhtä näkymää varten.
function barRows(rows, opts){
  const o = opts || {};
  const max = Math.max(...rows.map(r => r.value), o.max || 0, 1);
  return `<div class="st-bars">` + rows.map(r => `
    <div class="st-bar-row">
      <div class="st-bar-label">${esc(r.label)}</div>
      <div class="st-bar-track">
        <div class="st-bar-fill${r.cls ? ' ' + r.cls : ''}" style="width:${Math.max(2, (r.value / max) * 100)}%"></div>
      </div>
      <div class="st-bar-value">${esc(r.text != null ? r.text : String(r.value))}</div>
    </div>`).join('') + `</div>`;
}

function statEmpty(msg){
  return `<div class="st-empty">${esc(msg)}</div>`;
}

// ════════════════════════════════════════════════════════════
// OSIOT
// ════════════════════════════════════════════════════════════

// ── YHTEENVETO ──
function secSummary(list){
  const sc = scored(list);
  const scores = sc.map(x => x.s);
  const minutes = list.reduce((a, r) => a + (Number(r.runtime) || 0), 0);
  const withRuntime = list.filter(r => Number(r.runtime) > 0).length;
  const hours = Math.round(minutes / 60);

  const cards = [
    { n: list.length, l: list.length === 1 ? 'arvostelu' : 'arvostelua' },
    { n: avg(scores) != null ? avg(scores) : '—', l: 'keskiarvo' },
    { n: hours ? hours : '—', l: hours === 1 ? 'tunti katsottu' : 'tuntia katsottu' },
    { n: sc.length, l: 'pisteytetty' }
  ];

  const body = `<div class="st-cards">${cards.map(c =>
    `<div class="st-card"><div class="st-card-n">${esc(String(c.n))}</div><div class="st-card-l">${esc(c.l)}</div></div>`
  ).join('')}</div>`;

  // Katsottu aika on se luku joka helpoiten johtaa harhaan: kesto puuttuu
  // usein vanhoilta arvosteluilta, jolloin summa on liian pieni.
  const cov = withRuntime < list.length
    ? `Katsottu aika perustuu ${withRuntime}/${list.length} arvosteluun — muilta puuttuu kesto. Aja TMDB-massapäivitys täydentääksesi.`
    : `Kesto on tiedossa kaikilta.`;

  return statSection('📌 Yhteenveto', null, body, list.length ? cov : null);
}

// ── PISTEJAKAUMA (K08-005) ──
function secDistribution(list){
  const sc = scored(list);
  if(!sc.length) return statSection('📊 Pistejakauma', null, statEmpty('Ei vielä pisteytettyjä arvosteluja.'), null);

  const buckets = [];
  for(let lo = 0; lo < 100; lo += 10){
    const hi = lo + 9;
    const n = sc.filter(x => x.s >= lo && x.s <= (lo === 90 ? 100 : hi)).length;
    buckets.push({
      label: lo === 90 ? '90–100' : `${lo}–${hi}`,
      value: n,
      text: n ? String(n) : '',
      cls: window.scoreClass ? window.scoreClass(lo + 5) : ''
    });
  }
  buckets.reverse();   // korkein ylös, kuten Top-listassa

  const scores = sc.map(x => x.s);
  const median = (() => {
    const a = scores.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round(((a[m - 1] + a[m]) / 2) * 10) / 10;
  })();

  return statSection('📊 Pistejakauma',
    `Keskiarvo ${avg(scores)} · mediaani ${median} · matalin ${Math.min(...scores)} · korkein ${Math.max(...scores)}`,
    barRows(buckets),
    `${sc.length}/${list.length} arvostelulla on piste.`);
}

// ── KUUKAUSITTAIN (K08-004) ──
function secMonthly(list){
  const withDate = list.filter(r => r.date && !isNaN(new Date(r.date).getTime()));
  if(!withDate.length) return statSection('📅 Katsotut kuukausittain', null, statEmpty('Yhdelläkään arvostelulla ei ole katselupäivää.'), null);

  // Viimeiset 12 kuukautta, myös tyhjät — muuten kaavio valehtelee
  // aktiivisuudesta jättämällä hiljaiset kuukaudet kokonaan pois.
  const months = [];
  const now = new Date();
  for(let i = 11; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), d });
  }
  const NAMES = ['tammi','helmi','maalis','huhti','touko','kesä','heinä','elo','syys','loka','marras','joulu'];

  const rows = months.map(m => {
    const n = withDate.filter(r => String(r.date).slice(0, 7) === m.key).length;
    return {
      label: `${NAMES[m.d.getMonth()]} ${String(m.d.getFullYear()).slice(2)}`,
      value: n,
      text: n ? String(n) : '–'
    };
  });

  const total = rows.reduce((a, r) => a + r.value, 0);
  const perMonth = Math.round((total / 12) * 10) / 10;

  return statSection('📅 Katsotut kuukausittain',
    `Viimeiset 12 kuukautta · ${total} arvostelua · keskimäärin ${perMonth} kuukaudessa`,
    barRows(rows),
    `${withDate.length}/${list.length} arvostelulla on katselupäivä.`);
}

// ── KESKIARVO KATEGORIOITTAIN (K08-006) ──
function secByCategory(list){
  const cats = (appData.categories || []);
  const rows = cats.map(c => {
    const sc = scored(list.filter(r => r.category === c));
    return { label: c, n: sc.length, a: avg(sc.map(x => x.s)) };
  }).filter(x => x.n >= 1);

  if(rows.length < 2) return '';   // yhden kategorian vertailu ei kerro mitään

  return statSection('🗂️ Keskiarvo kategorioittain', null,
    barRows(rows.map(x => ({
      label: `${x.label} (${x.n})`,
      value: x.a || 0,
      text: x.a != null ? String(x.a) : '—',
      cls: x.a != null && window.scoreClass ? window.scoreClass(x.a) : ''
    })), { max: 100 }),
    null);
}

// ── KESKIARVO GENREITTÄIN (K08-007) ──
function secByGenre(list){
  const sc = scored(list);
  const withGenre = sc.filter(x => genresOf(x.r).length);
  const map = new Map();
  withGenre.forEach(x => genresOf(x.r).forEach(g => {
    if(!map.has(g)) map.set(g, []);
    map.get(g).push(x.s);
  }));

  const rows = [...map.entries()]
    .filter(([, arr]) => arr.length >= STATS_MIN_GROUP)
    .map(([g, arr]) => ({ g, n: arr.length, a: avg(arr) }))
    .sort((a, b) => b.a - a.a);

  if(!rows.length){
    return statSection('🎭 Keskiarvo genreittäin', null,
      statEmpty(`Yhdelläkään genrellä ei ole vielä ${STATS_MIN_GROUP} pisteytettyä teosta.`), null);
  }

  return statSection('🎭 Keskiarvo genreittäin',
    `Vähintään ${STATS_MIN_GROUP} teosta per genre · paras ylimpänä`,
    barRows(rows.map(x => ({
      label: `${x.g} (${x.n})`,
      value: x.a,
      text: String(x.a),
      cls: window.scoreClass ? window.scoreClass(x.a) : ''
    })), { max: 100 }),
    `${withGenre.length}/${sc.length} pisteytetystä arvostelusta on merkitty genre. Teos voi kuulua useaan genreen, joten luvut eivät summaudu.`);
}

// ── KESKIARVO VUOSIKYMMENITTÄIN (K08-008) ──
function secByDecade(list){
  const sc = scored(list);
  const withYear = sc.filter(x => Number(x.r.year) > 1800);
  const map = new Map();
  withYear.forEach(x => {
    const dec = Math.floor(Number(x.r.year) / 10) * 10;
    if(!map.has(dec)) map.set(dec, []);
    map.get(dec).push(x.s);
  });

  const rows = [...map.entries()]
    .filter(([, arr]) => arr.length >= STATS_MIN_GROUP)
    .sort((a, b) => b[0] - a[0])
    .map(([dec, arr]) => ({ dec, n: arr.length, a: avg(arr) }));

  if(!rows.length){
    return statSection('🕰️ Keskiarvo vuosikymmenittäin', null,
      statEmpty(`Yhdelläkään vuosikymmenellä ei ole vielä ${STATS_MIN_GROUP} pisteytettyä teosta.`), null);
  }

  return statSection('🕰️ Keskiarvo vuosikymmenittäin',
    'Teoksen julkaisuvuoden mukaan, ei katseluvuoden',
    barRows(rows.map(x => ({
      label: `${x.dec}-luku (${x.n})`,
      value: x.a,
      text: String(x.a),
      cls: window.scoreClass ? window.scoreClass(x.a) : ''
    })), { max: 100 }),
    `${withYear.length}/${sc.length} pisteytetyllä arvostelulla on julkaisuvuosi.`);
}

// ── OHJAAJAT (K08-016, K08-018) ──
function secDirectors(list){
  const withDir = list.filter(r => r.director);
  if(!withDir.length){
    return statSection('🎬 Ohjaajat', null,
      statEmpty('Yhdelläkään arvostelulla ei ole ohjaajaa. Aja TMDB-massapäivitys.'), null);
  }

  const map = new Map();
  withDir.forEach(r => {
    const s = window.getReviewScore ? window.getReviewScore(r) : r.score;
    if(!map.has(r.director)) map.set(r.director, []);
    map.get(r.director).push(s);
  });

  const most = [...map.entries()]
    .map(([d, arr]) => ({ d, n: arr.length }))
    .sort((a, b) => b.n - a.n || a.d.localeCompare(b.d, 'fi'))
    .slice(0, STATS_TOP_N);

  const best = [...map.entries()]
    .map(([d, arr]) => {
      const nums = arr.filter(s => s != null && isFinite(s));
      return { d, n: nums.length, a: avg(nums) };
    })
    .filter(x => x.n >= STATS_MIN_GROUP)
    .sort((a, b) => b.a - a.a)
    .slice(0, STATS_TOP_N);

  const bodyMost = barRows(most.map(x => ({ label: x.d, value: x.n, text: String(x.n) })));
  const bodyBest = best.length
    ? barRows(best.map(x => ({
        label: `${x.d} (${x.n})`, value: x.a, text: String(x.a),
        cls: window.scoreClass ? window.scoreClass(x.a) : ''
      })), { max: 100 })
    : statEmpty(`Yhdelläkään ohjaajalla ei ole vielä ${STATS_MIN_GROUP} pisteytettyä teosta.`);

  return statSection('🎬 Eniten katsotut ohjaajat', null, bodyMost,
      `${withDir.length}/${list.length} arvostelulla on ohjaaja.`)
    + statSection('🏅 Parhaat ohjaajat', `Keskiarvon mukaan, vähintään ${STATS_MIN_GROUP} teosta`, bodyBest, null);
}

// ── NÄYTTELIJÄT (K08-017) ──
function secActors(list){
  const withCast = list.filter(r => Array.isArray(r.cast) && r.cast.length);
  if(!withCast.length){
    return statSection('🎭 Näyttelijät', null,
      statEmpty('Yhdelläkään arvostelulla ei ole näyttelijöitä. Aja TMDB-massapäivitys.'), null);
  }

  const map = new Map();
  withCast.forEach(r => r.cast.forEach(a => map.set(a, (map.get(a) || 0) + 1)));

  const rows = [...map.entries()]
    .map(([a, n]) => ({ a, n }))
    .filter(x => x.n >= 2)
    .sort((a, b) => b.n - a.n || a.a.localeCompare(b.a, 'fi'))
    .slice(0, STATS_TOP_N);

  if(!rows.length){
    return statSection('🎭 Toistuvat näyttelijät', null,
      statEmpty('Yksikään näyttelijä ei esiinny vielä kahdessa teoksessa.'), null);
  }

  return statSection('🎭 Toistuvat näyttelijät',
    'Vähintään kaksi esiintymistä',
    barRows(rows.map(x => ({ label: x.a, value: x.n, text: String(x.n) }))),
    `${withCast.length}/${list.length} arvostelulla on näyttelijätiedot. Jokaisesta teoksesta tallennetaan vain viisi pääosaa, joten sivuosat eivät näy näissä luvuissa.`);
}

// ── SUOSITUKSET JA UUSINTAKATSELU (K08-025, K08-026) ──
function secOpinions(list){
  const recOpts = window.RECOMMEND_OPTS || [];
  const rewOpts = window.REWATCH_OPTS || [];

  const withRec = list.filter(r => r.recommend);
  const withRew = list.filter(r => r.rewatch);

  const recRows = recOpts.map(o => {
    const n = withRec.filter(r => r.recommend === o.id).length;
    return { label: o.chip || o.btn, value: n, text: String(n),
             cls: o.tone === 'good' ? 'st-good' : o.tone === 'bad' ? 'st-bad' : 'st-mid' };
  });
  const rewRows = rewOpts.map(o => {
    const n = withRew.filter(r => r.rewatch === o.id).length;
    return { label: o.chip || o.btn, value: n, text: String(n),
             cls: o.tone === 'good' ? 'st-good' : o.tone === 'bad' ? 'st-bad' : 'st-mid' };
  });

  const yes = withRec.filter(r => r.recommend === 'yes').length;
  const pct = withRec.length ? Math.round((yes / withRec.length) * 100) : null;
  const now = withRew.filter(r => r.rewatch === 'now').length;

  let out = '';
  out += statSection('👍 Suositusten jakauma',
    pct != null ? `Suosittelet ${pct} prosenttia niistä joille olet ottanut kantaa` : null,
    withRec.length ? barRows(recRows) : statEmpty('Yhdellekään arvostelulle ei ole merkitty suositusta.'),
    withRec.length ? `${withRec.length}/${list.length} arvostelulle on merkitty suositus.` : null);

  out += statSection('🔁 Katsoisitko uudelleen',
    now ? `${now} ${now === 1 ? 'teos jonka' : 'teosta jotka'} katsoisit heti uudelleen` : null,
    withRew.length ? barRows(rewRows) : statEmpty('Yhdellekään arvostelulle ei ole merkitty uusintakatselua.'),
    withRew.length ? `${withRew.length}/${list.length} arvostelulle on merkitty uusintakatselu.` : null);

  return out;
}

// ════════════════════════════════════════════════════════════
// NÄKYMÄ
// ════════════════════════════════════════════════════════════

window.statsSetScope = function(v){
  statsScope = v;
  window.renderStats();
};

window.renderStats = function(){
  const out = document.getElementById('statsView');
  if(!out) return;

  const list = statReviews();
  const total = (appData.reviews || []).length;

  const scopes = [{ id:'all', label:'Kaikki' }]
    .concat((appData.categories || []).map(c => ({ id:c, label:c })));
  const chips = scopes.map(s =>
    `<button type="button" class="st-chip${statsScope === s.id ? ' on' : ''}" onclick="statsSetScope('${escJs(s.id)}')">${esc(s.label)}</button>`
  ).join('');

  const head = `
    <div class="st-head">
      <div class="st-head-title">📊 Tilastot</div>
      <div class="st-head-sub">Kaikki luvut lasketaan laitteella arvosteluistasi. Jokainen osio kertoo mihin osaan datasta se perustuu.</div>
      <div class="st-chips">${chips}</div>
    </div>`;

  if(!total){
    out.innerHTML = head + `<div class="st-empty-big">
      <div class="st-empty-ico">📊</div>
      <div class="st-empty-title">Ei vielä arvosteluja</div>
      <div class="st-empty-sub">Tilastot ilmestyvät tänne kun olet arvostellut muutaman teoksen.</div>
    </div>`;
    return;
  }

  if(!list.length){
    out.innerHTML = head + statEmpty('Tässä kategoriassa ei ole vielä arvosteluja.');
    return;
  }

  out.innerHTML = head
    + secSummary(list)
    + secDistribution(list)
    + secMonthly(list)
    + secByCategory(list)
    + secByGenre(list)
    + secByDecade(list)
    + secDirectors(list)
    + secActors(list)
    + secOpinions(list)
    + `<div class="st-foot">Tilastot päivittyvät itsestään kun lisäät tai muokkaat arvosteluja. Jos jokin luku näyttää liian pieneltä, katso osion alla oleva kattavuusrivi — puuttuva tieto ei ole sama asia kuin nolla.</div>`;
};

// Testattavuutta varten: laskenta erillään piirrosta.
window._statsCompute = { avg, scored, genresOf, statReviews };
