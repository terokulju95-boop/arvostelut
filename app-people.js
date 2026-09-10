// ══ ARVOSTELUT · tekijäsivut ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_PEOPLE = '2026-09-10.2';
// Tavallinen skripti. Ajetaan app-core.js:n JÄLKEEN.
//
// Ohjaaja ja näyttelijät ovat arvostelun kenttiä, eivät omia tietueitaan.
// Tämä tiedosto ei muuta sitä: hakemisto kootaan lennossa arvosteluista
// joka kerta uudelleen. Näin mitään ei tarvitse tallentaa erikseen, mikään
// ei voi ajautua eri tahtiin datan kanssa, eikä TMDB-päivitys jätä jälkeensä
// orpoja henkilötietueita.
//
// Nimi on avain. Vertailu tehdään pienaakkosin ja välilyönnit siistittyinä,
// jotta "Denis Villeneuve" ja "denis  villeneuve" ovat sama tekijä.

// ════════════════════════════════════════════════════════════
// 1. HAKEMISTO
// ════════════════════════════════════════════════════════════

function pplName(s){ return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); }
function pplKey(s){ return pplName(s).toLocaleLowerCase('fi'); }

// Kaikki tekijät: avain → { name, dir:[arvostelut], cast:[arvostelut] }.
// Näyttönimeksi jää se kirjoitusasu joka nähtiin ensimmäisenä.
window.peopleIndex = function(){
  const map = new Map();
  const add = (raw, kind, r) => {
    const nm = pplName(raw);
    if(!nm) return;
    const k = pplKey(nm);
    let p = map.get(k);
    if(!p){ p = { key: k, name: nm, dir: [], cast: [] }; map.set(k, p); }
    p[kind].push(r);
  };
  (appData.reviews || []).forEach(r => {
    if(r.director) add(r.director, 'dir', r);
    if(Array.isArray(r.cast)) r.cast.forEach(c => add(c, 'cast', r));
  });
  return map;
};

function pplScore(r){
  const s = window.getReviewScore ? window.getReviewScore(r) : r.score;
  return (s != null && isFinite(s)) ? Number(s) : null;
}

function pplAvg(nums){
  if(!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// Koko kokoelman keskiarvo vertailukohdaksi. Ilman sitä yksittäisen
// tekijän luku ei kerro mitään: 78 on hyvä jos oma keskiarvo on 70 ja
// vaisu jos se on 85.
function pplOverallAvg(){
  const all = (appData.reviews || []).map(pplScore).filter(s => s != null);
  return pplAvg(all);
}

// Yhden tekijän kaikki luvut. Sama teos voi olla sekä ohjattu että
// näytelty, joten tilastot lasketaan teoksista eikä riveistä — muuten
// se painaisi keskiarvossa kahdesti.
function personData(name){
  const p = window.peopleIndex().get(pplKey(name));
  if(!p) return null;

  const seen = new Set();
  const works = [];
  p.dir.concat(p.cast).forEach(r => {
    if(seen.has(r.id)) return;
    seen.add(r.id);
    works.push(r);
  });

  const scores = works.map(pplScore).filter(s => s != null);
  const avg = pplAvg(scores);

  const rated = works.filter(r => pplScore(r) != null)
    .sort((a, b) => pplScore(b) - pplScore(a));

  const years = works.map(r => Number(r.year)).filter(y => y && isFinite(y));

  // Genrejakauma: mistä lajityypistä tämä tekijä on sinulle tuttu.
  const gmap = new Map();
  works.forEach(r => {
    const gs = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
    gs.forEach(g => gmap.set(g, (gmap.get(g) || 0) + 1));
  });
  const genres = [...gmap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fi'))
    .slice(0, 4);

  return {
    name: p.name,
    dir: p.dir, cast: p.cast, works,
    scores, avg,
    best:  rated.length ? rated[0] : null,
    worst: rated.length > 1 ? rated[rated.length - 1] : null,
    minYear: years.length ? Math.min(...years) : null,
    maxYear: years.length ? Math.max(...years) : null,
    favorites: works.filter(r => r.mark === 'heart').length,
    genres
  };
}
window.personData = personData;

// ════════════════════════════════════════════════════════════
// 2. LINKIT KORTEISSA JA LUKUNÄKYMÄSSÄ
// ════════════════════════════════════════════════════════════

// event.stopPropagation estää kortin oman kaksoisnapautuksen laukeamisen.
window.personChip = function(name, kind){
  const nm = pplName(name);
  if(!nm) return '';
  return `<button type="button" class="ppl-chip" onclick="event.stopPropagation();openPerson('${escJs(nm)}')">` +
    `${kind === 'dir' ? '🎬' : '🎭'} ${esc(nm)}</button>`;
};

window.personChips = function(names, kind){
  return (names || []).map(n => window.personChip(n, kind)).join('');
};

// ════════════════════════════════════════════════════════════
// 3. TEKIJÄSIVU
// ════════════════════════════════════════════════════════════

function pplWorkRow(r, tag){
  const s = pplScore(r);
  const cls = s != null && window.scoreClass ? window.scoreClass(s) : '';
  const img = (window.hasPoster && window.hasPoster(r))
    ? `<img class="ppl-work-img" src="${esc(window.posterUrl(r, 'w92'))}" alt="" loading="lazy">`
    : `<span class="ppl-work-img ppl-work-noimg">${window.catEmoji ? window.catEmoji(r.category) : '🎬'}</span>`;
  const sub = [r.year || '', tag || ''].filter(Boolean).join(' · ');
  return `<button type="button" class="ppl-work" onclick="closeModal('personModal');openReadModal(${r.id})">
    ${img}
    <span class="ppl-work-txt">
      <span class="ppl-work-name">${esc(window.plainName ? window.plainName(r) : String(r.name || ''))}</span>
      ${sub ? `<span class="ppl-work-sub">${esc(sub)}</span>` : ''}
    </span>
    ${s != null
      ? `<span class="ppl-work-score ${cls}">${s}</span>`
      : `<span class="ppl-work-score ppl-work-none">–</span>`}
  </button>`;
}

// Teokset parhaasta heikoimpaan. Pisteettömät viimeisenä, koska ne eivät
// kerro mitään järjestyksestä eivätkä saa työntää arvioituja alaspäin.
function pplSortWorks(list){
  return list.slice().sort((a, b) => {
    const sa = pplScore(a), sb = pplScore(b);
    if(sa == null && sb == null) return (b.year || 0) - (a.year || 0);
    if(sa == null) return 1;
    if(sb == null) return -1;
    return sb - sa || (b.year || 0) - (a.year || 0);
  });
}

window.openPerson = function(name){
  const host = document.getElementById('personModalContent');
  if(!host) return;
  const d = personData(name);

  if(!d){
    host.innerHTML = `<div class="ppl-head"><div class="ppl-name">${esc(pplName(name))}</div></div>
      <div class="ppl-empty">Tätä tekijää ei löydy enää kokoelmasta.</div>`;
    openModalOnTop('personModal');
    return;
  }

  const roles = [];
  if(d.dir.length)  roles.push(`Ohjaaja · ${d.dir.length}`);
  if(d.cast.length) roles.push(`Roolissa · ${d.cast.length}`);

  const overall = pplOverallAvg();
  const diff = (d.avg != null && overall != null) ? d.avg - overall : null;
  const avgCls = d.avg != null && window.scoreClass ? window.scoreClass(d.avg) : '';

  // Vertailu kertoo suunnan sanoin, koska pelkkä etumerkki jää helposti
  // huomaamatta pienessä tekstissä.
  const diffText = diff == null ? ''
    : diff > 0 ? `${diff} pistettä yli oman keskiarvosi (${overall})`
    : diff < 0 ? `${Math.abs(diff)} pistettä alle oman keskiarvosi (${overall})`
    : `täsmälleen oma keskiarvosi (${overall})`;

  const years = (d.minYear && d.maxYear)
    ? (d.minYear === d.maxYear ? String(d.minYear) : `${d.minYear}–${d.maxYear}`)
    : '–';

  const stats = `<div class="ppl-stats">
    <div class="ppl-stat">
      <div class="ppl-stat-val ${avgCls}">${d.avg != null ? d.avg : '–'}</div>
      <div class="ppl-stat-lab">keskiarvo</div>
    </div>
    <div class="ppl-stat">
      <div class="ppl-stat-val">${d.works.length}</div>
      <div class="ppl-stat-lab">teosta</div>
    </div>
    <div class="ppl-stat">
      <div class="ppl-stat-val ppl-stat-sm">${esc(years)}</div>
      <div class="ppl-stat-lab">vuodet</div>
    </div>
  </div>`;

  // Yhden teoksen keskiarvo ei ole keskiarvo vaan yksittäinen piste.
  const note = d.scores.length === 1
    ? `<div class="ppl-note">Vain yksi pisteytetty teos — luku ei vielä kerro tekijästä paljoakaan.</div>`
    : (diffText ? `<div class="ppl-note">${esc(diffText)}</div>` : '');

  const genreChips = d.genres.length
    ? `<div class="ppl-genres">${d.genres.map(([g, n]) =>
        `<span class="ppl-genre">${esc(g)} <b>${n}</b></span>`).join('')}</div>`
    : '';

  const sections = [];
  if(d.dir.length){
    sections.push(`<div class="ppl-sec">
      <div class="ppl-sec-head">🎬 Ohjaajana <span>${d.dir.length}</span></div>
      ${pplSortWorks(d.dir).map(r => pplWorkRow(r, '')).join('')}
    </div>`);
  }
  if(d.cast.length){
    sections.push(`<div class="ppl-sec">
      <div class="ppl-sec-head">🎭 Roolissa <span>${d.cast.length}</span></div>
      ${pplSortWorks(d.cast).map(r => pplWorkRow(r, '')).join('')}
    </div>`);
  }

  const favLine = d.favorites
    ? `<div class="ppl-fav">❤️ ${d.favorites} suosikkia</div>` : '';

  const actions = `<div class="ppl-actions">
    ${d.dir.length ? `<button type="button" class="ppl-btn" onclick="closeModal('personModal');filterByDirector('${escJs(d.name)}')">🎬 Näytä listassa</button>` : ''}
    <button type="button" class="ppl-btn ppl-btn-ghost" onclick="openPeopleList()">👥 Kaikki tekijät</button>
  </div>`;

  host.innerHTML = `
    <div class="ppl-head">
      <div class="ppl-name">${esc(d.name)}</div>
      ${roles.length ? `<div class="ppl-roles">${esc(roles.join('  ·  '))}</div>` : ''}
      ${favLine}
    </div>
    ${stats}
    ${note}
    ${genreChips}
    ${actions}
    ${sections.join('')}`;

  openModalOnTop('personModal');
};

// ════════════════════════════════════════════════════════════
// 4. KAIKKIEN TEKIJÖIDEN SELAUS
// ════════════════════════════════════════════════════════════

// Lajittelutapa säilyy vain istunnon ajan. Se ei ole asetus vaan hetken
// valinta, eikä siksi kuulu pilveen.
let pplSort = 'count';

function pplRows(filter){
  const q = pplKey(filter || '');
  const rows = [];
  window.peopleIndex().forEach(p => {
    if(q && !p.key.includes(q)) return;
    const seen = new Set();
    const works = [];
    p.dir.concat(p.cast).forEach(r => { if(!seen.has(r.id)){ seen.add(r.id); works.push(r); } });
    const scores = works.map(pplScore).filter(s => s != null);
    rows.push({ name: p.name, n: works.length, avg: pplAvg(scores), rated: scores.length,
                isDir: !!p.dir.length, isCast: !!p.cast.length });
  });

  if(pplSort === 'avg'){
    // Yhden teoksen tekijä ei kuulu keskiarvojärjestyksen kärkeen,
    // joten vähintään kaksi pisteytettyä teosta vaaditaan.
    rows.sort((a, b) => {
      const aa = a.rated >= 2 ? a.avg : -1;
      const bb = b.rated >= 2 ? b.avg : -1;
      return bb - aa || b.n - a.n || a.name.localeCompare(b.name, 'fi');
    });
  } else if(pplSort === 'name'){
    rows.sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  } else {
    rows.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'fi'));
  }
  return rows;
}

function pplListBody(filter){
  const rows = pplRows(filter);
  if(!rows.length){
    return `<div class="ppl-empty">Ei osumia. Tekijätiedot tulevat TMDB:stä — aja massapäivitys jos ne puuttuvat.</div>`;
  }
  const shown = rows.slice(0, 300);
  const more = rows.length - shown.length;
  return shown.map(r => {
    const cls = r.avg != null && r.rated >= 2 && window.scoreClass ? window.scoreClass(r.avg) : '';
    const role = [r.isDir ? '🎬' : '', r.isCast ? '🎭' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="ppl-row" onclick="openPerson('${escJs(r.name)}')">
      <span class="ppl-row-role">${role}</span>
      <span class="ppl-row-name">${esc(r.name)}</span>
      <span class="ppl-row-n">${r.n}</span>
      <span class="ppl-row-avg ${cls}">${r.rated >= 2 && r.avg != null ? r.avg : ''}</span>
    </button>`;
  }).join('') + (more > 0
    ? `<div class="ppl-more">Näytetään 300 ensimmäistä · ${more} lisää, tarkenna hakua</div>` : '');
}

window.peopleListFilter = function(v){
  const box = document.getElementById('pplListBody');
  if(box) box.innerHTML = pplListBody(v);
};

window.setPeopleSort = function(mode){
  pplSort = mode;
  const input = document.getElementById('pplSearch');
  document.querySelectorAll('.ppl-sort-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sort === mode));
  window.peopleListFilter(input ? input.value : '');
};

window.openPeopleList = function(){
  const host = document.getElementById('personModalContent');
  if(!host) return;
  const total = window.peopleIndex().size;

  host.innerHTML = `
    <div class="ppl-head">
      <div class="ppl-name">👥 Tekijät</div>
      <div class="ppl-roles">${total} nimeä kokoelmassa</div>
    </div>
    <input type="search" id="pplSearch" class="ppl-search" placeholder="Etsi nimellä…"
      autocomplete="off" oninput="peopleListFilter(this.value)">
    <div class="ppl-sort">
      <button type="button" class="ppl-sort-btn${pplSort === 'count' ? ' active' : ''}" data-sort="count" onclick="setPeopleSort('count')">Teoksia</button>
      <button type="button" class="ppl-sort-btn${pplSort === 'avg' ? ' active' : ''}" data-sort="avg" onclick="setPeopleSort('avg')">Keskiarvo</button>
      <button type="button" class="ppl-sort-btn${pplSort === 'name' ? ' active' : ''}" data-sort="name" onclick="setPeopleSort('name')">Nimi</button>
    </div>
    <div class="ppl-list" id="pplListBody">${pplListBody('')}</div>`;

  openModalOnTop('personModal');
};
