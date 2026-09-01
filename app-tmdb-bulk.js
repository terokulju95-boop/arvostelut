// ══ ARVOSTELUT · TMDB-massapäivitys ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_BULK = '2026-09-01.20';
//
// Kolme vaihetta, koska verkkokutsu on kallis ja peruuttamaton:
//   1. TARKISTUS  – pelkkä paikallinen läpikäynti. Kertoo miltä puuttuu mitä.
//   2. HAKU       – valituille haetaan TMDB:stä ja lasketaan mitä muuttuisi.
//   3. PÄIVITYS   – vasta tässä data muuttuu, ja vain valituille.
//
// Arvosanoihin, muistiinpanoihin, merkintöihin, nimiin ja jaksojen
// pisteisiin EI kosketa missään vaiheessa.

const BULK_CATS = ['Elokuvat','TV-sarjat'];
const BULK_DELAY = 130;    // ms kutsujen välissä, jottei TMDB:tä kuormiteta

let bulkStep = 1;
let bulkScope = 'missing';        // missing | all | notmdb
let bulkCandidates = [];          // vaiheen 1 rivit
let bulkResults = [];             // vaiheen 2 rivit
let bulkCancel = false;
let bulkOnlyMissing = true;       // true = täytä vain tyhjät kentät

// ── KENTTÄMÄÄRITTELYT ──
// getNew lukee arvon TMDB:n vastauksesta, isEmpty kertoo puuttuuko se
// arvostelusta, show muotoilee arvon luettavaksi.
const asList  = v => Array.isArray(v) && v.length ? v.join(', ') : null;
const emptyArr = v => !Array.isArray(v) || !v.length;
const emptyVal = v => v == null || v === '' ;

const BULK_FIELDS = [
  { key:'poster',        label:'Juliste',       both:1, show:v => v ? 'kuva ' + v : null, isEmpty:emptyVal },
  { key:'backdrop',      label:'Taustakuva',    both:1, show:v => v ? 'kuva ' + v : null, isEmpty:emptyVal },
  { key:'plot',          label:'Juoni',         both:1, show:v => v ? String(v).slice(0,70) + (String(v).length>70?'…':'') : null, isEmpty:emptyVal },
  { key:'director',      label:'Ohjaaja',       both:1, show:v => v || null, isEmpty:emptyVal },
  { key:'director_id',   label:'Ohjaajan id',   both:1, hidden:1, isEmpty:emptyVal },
  { key:'cast',          label:'Näyttelijät',   both:1, show:asList, isEmpty:emptyArr, cmp:'json' },
  { key:'cast_ids',      label:'Näyttelijäid',  both:1, hidden:1, isEmpty:emptyArr, cmp:'json' },
  { key:'country',       label:'Maa',           both:1, show:v => v || null, isEmpty:emptyVal },
  { key:'tmdb_score',    label:'TMDB-arvosana', both:1, show:v => v != null ? v + '/10' : null, isEmpty:emptyVal },
  { key:'genre_ids',     label:'TMDB-genret',   both:1, hidden:1, isEmpty:emptyArr, cmp:'json' },
  { key:'runtime',       label:'Kesto',         movie:1, show:v => v ? v + ' min' : null, isEmpty:emptyVal },
  { key:'collection',    label:'Kokoelma',      movie:1, show:v => v && v.name ? v.name : null, isEmpty:v => !v || !v.name, cmp:'json' },
  { key:'episodes_total',label:'Jaksoja',       tv:1, show:v => v != null ? String(v) : null, isEmpty:emptyVal },
  { key:'seasons_total', label:'Kausia',        tv:1, show:v => v != null ? String(v) : null, isEmpty:emptyVal },
  { key:'tv_status',     label:'Tuotantotila',  tv:1, show:v => { const i = window.tvStatusInfo && window.tvStatusInfo(v); return i ? i.fi : (v || null); }, isEmpty:emptyVal },
  { key:'tv_in_prod',    label:'Tuotannossa',   tv:1, hidden:1, isEmpty:v => v == null },
  { key:'last_air_date', label:'Viim. jakso',   tv:1, show:v => v || null, isEmpty:emptyVal },
  { key:'next_air',      label:'Seur. jakso',   tv:1, cmp:'json', isEmpty:v => !v,
    show:v => v && v.date ? `K${v.season}J${v.episode} ${v.date}` : null }
];

function fieldsFor(isTv){
  return BULK_FIELDS.filter(f => f.both || (isTv ? f.tv : f.movie));
}

function isTvReview(r){
  return r.category === 'TV-sarjat' || r.tmdb_type === 'tv';
}

// ════════════════════════════════════════════════════════════
// VAIHE 1 — PAIKALLINEN TARKISTUS
// ════════════════════════════════════════════════════════════

function scanReviews(){
  const out = [];
  (appData.reviews || []).forEach(r => {
    if(!r || !BULK_CATS.includes(r.category)) return;
    const isTv = isTvReview(r);
    const missing = fieldsFor(isTv)
      .filter(f => !f.hidden && f.isEmpty(r[f.key]))
      .map(f => f.label);
    // Oma juoni on täytetty tieto, ei puute
    if(!r.year) missing.push('Vuosi');
    out.push({
      id: r.id,
      name: plainName(r),
      year: r.year || null,
      cat: r.category,
      isTv,
      hasId: !!r.tmdb_id,
      missing,
      checked: false,
      lastChecked: r.tmdb_checked || null
    });
  });
  // Eniten puutteita ensin — ne hyötyvät päivityksestä eniten
  out.sort((a,b) => (b.missing.length - a.missing.length) || a.name.localeCompare(b.name,'fi'));
  return out;
}

function scopeList(){
  if(bulkScope === 'all')     return bulkCandidates;
  if(bulkScope === 'notmdb')  return bulkCandidates.filter(c => !c.hasId);
  return bulkCandidates.filter(c => c.missing.length > 0);
}

window.openBulkTmdb = function(){
  bulkStep = 1;
  bulkScope = 'missing';
  bulkCancel = false;
  bulkResults = [];
  bulkOnlyMissing = true;
  bulkCandidates = scanReviews();
  // Oletusvalinta: puutteelliset joilla on jo tunnus — ne ovat turvallisin joukko
  bulkCandidates.forEach(c => { c.checked = c.missing.length > 0 && c.hasId; });
  renderBulk();
  window.openModalOnTop('bulkTmdbModal');
};

window.setBulkScope = function(s){
  bulkScope = s;
  renderBulk();
};

window.toggleBulkPick = function(id, on){
  const c = bulkCandidates.find(x => String(x.id) === String(id));
  if(c) c.checked = !!on;
  updateBulkButton();
};

window.bulkSelectAll = function(on){
  scopeList().forEach(c => c.checked = !!on);
  renderBulk();
};

function updateBulkButton(){
  const btn = document.getElementById('bulkGoBtn');
  if(!btn) return;
  const n = bulkCandidates.filter(c => c.checked).length;
  btn.textContent = n ? `🔍 Hae TMDB:stä (${n})` : 'Valitse ainakin yksi';
  btn.disabled = !n;
  btn.style.opacity = n ? '1' : '0.5';
}

function renderStep1(){
  const list = scopeList();
  const withMissing = bulkCandidates.filter(c => c.missing.length).length;
  const noId = bulkCandidates.filter(c => !c.hasId).length;

  const rows = list.length ? list.map(c => `
    <label class="bulk-row">
      <input type="checkbox" class="bulk-check" ${c.checked?'checked':''}
        onchange="toggleBulkPick('${escJs(String(c.id))}', this.checked)">
      <span class="bulk-info">
        <span class="bulk-name">${esc(c.name)} ${c.year?`<span>(${c.year})</span>`:''}</span>
        <span class="bulk-tags">
          <span class="bulk-tag">${esc(c.cat)}</span>
          ${c.hasId ? '' : '<span class="bulk-tag miss">ei TMDB-tunnusta</span>'}
          ${c.missing.length
            ? c.missing.map(m => `<span class="bulk-tag miss">${esc(m)}</span>`).join('')
            : '<span class="bulk-tag add">kaikki tiedot tallessa</span>'}
        </span>
        ${c.lastChecked ? `<span class="bulk-match">Haettu viimeksi ${esc(c.lastChecked)}</span>` : ''}
      </span>
    </label>`).join('') : '<div class="bulk-empty">Ei arvosteluja tällä rajauksella.</div>';

  return `
    <div class="bulk-step">
      <strong>Vaihe 1 / 3 — tarkistus.</strong> Tämä on pelkkä paikallinen läpikäynti
      eikä hae verkosta mitään. Alla näkyy mitä tietoja kultakin arvostelulta puuttuu.
      Valitse mitkä haetaan, niin seuraavassa vaiheessa näet mitä muuttuisi ennen kuin
      mitään tallennetaan.
    </div>
    <div class="bulk-sum">
      <div class="bulk-sum-box"><div class="bulk-sum-num">${bulkCandidates.length}</div><div class="bulk-sum-lbl">elokuvaa ja sarjaa</div></div>
      <div class="bulk-sum-box"><div class="bulk-sum-num">${withMissing}</div><div class="bulk-sum-lbl">joilta puuttuu tietoja</div></div>
      <div class="bulk-sum-box"><div class="bulk-sum-num">${noId}</div><div class="bulk-sum-lbl">ilman TMDB-tunnusta</div></div>
    </div>
    <div class="bulk-scope">
      <button type="button" class="filter-chip ${bulkScope==='missing'?'active':''}" onclick="setBulkScope('missing')">Puutteelliset</button>
      <button type="button" class="filter-chip ${bulkScope==='notmdb'?'active':''}" onclick="setBulkScope('notmdb')">Ilman tunnusta</button>
      <button type="button" class="filter-chip ${bulkScope==='all'?'active':''}" onclick="setBulkScope('all')">Kaikki</button>
    </div>
    <div class="si-tools">
      <button type="button" class="si-tool" onclick="bulkSelectAll(true)">Valitse näkyvät</button>
      <button type="button" class="si-tool" onclick="bulkSelectAll(false)">Tyhjennä</button>
    </div>
    <div class="bulk-list">${rows}</div>
    ${noId ? `<div class="toggle-row-sub" style="margin-top:10px;">
      Ilman tunnusta olevat haetaan nimellä. Nimihaku voi osua väärään teokseen,
      joten seuraavassa vaiheessa näet löydetyn nimen ja vuoden ja voit hylätä osuman.
    </div>` : ''}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal('bulkTmdbModal')">Sulje</button>
      <button class="btn-primary" id="bulkGoBtn" onclick="runBulkFetch()">Hae TMDB:stä</button>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// VAIHE 2 — HAKU JA EROJEN LASKENTA
// ════════════════════════════════════════════════════════════

function changed(f, oldV, newV){
  if(newV == null || newV === '') return false;
  if(Array.isArray(newV) && !newV.length) return false;
  if(f.cmp === 'json') return JSON.stringify(oldV == null ? null : oldV) !== JSON.stringify(newV);
  return String(oldV == null ? '' : oldV) !== String(newV);
}

// Kokoaa TMDB:n vastauksesta samat kentät joita tuontikin käyttää
function newValuesFrom(detail, isTv){
  const tf = extractTmdbFields(detail, isTv);
  tf.poster = detail.poster_path || null;
  tf.plot   = detail.overview || null;
  return tf;
}

function diffFor(r, detail, isTv){
  const nv = newValuesFrom(detail, isTv);
  const rows = [];
  fieldsFor(isTv).forEach(f => {
    // Itse kirjoitettua juonta ei tarjota korvattavaksi missään tilassa.
    // TMDB:n versio pannaan hiljaa talteen, jotta sen voi halutessaan
    // palauttaa juonen muokkausikkunasta.
    if(f.key === 'plot' && isOwnPlot(r)){
      if(nv.plot && nv.plot !== r.plot_tmdb){
        rows.push({ key:'plot_tmdb', label:'TMDB:n juoni talteen', hidden:true,
                    kind:'add', oldShow:null, newShow:'varmuuskopio', value:nv.plot });
      }
      return;
    }
    const oldV = r[f.key];
    const newV = nv[f.key];
    if(!changed(f, oldV, newV)) return;
    const wasEmpty = f.isEmpty(oldV);
    rows.push({
      key: f.key,
      label: f.label,
      hidden: !!f.hidden,
      kind: wasEmpty ? 'add' : 'change',
      oldShow: f.show ? f.show(oldV) : (oldV == null ? null : String(oldV)),
      newShow: f.show ? f.show(newV) : String(newV),
      value: newV
    });
  });
  // Vuosi täydennetään vain jos se puuttuu — omaa merkintää ei ylikirjoiteta
  const relYear = (detail.release_date || detail.first_air_date || '').slice(0,4);
  if(!r.year && /^(18|19|20)\d{2}$/.test(relYear)){
    rows.push({ key:'year', label:'Vuosi', kind:'add', oldShow:null, newShow:relYear, value: parseInt(relYear,10) });
  }
  return rows;
}

window.runBulkFetch = async function(){
  const picked = bulkCandidates.filter(c => c.checked);
  if(!picked.length) return;
  bulkStep = 2;
  bulkCancel = false;
  bulkResults = [];
  renderBulk();

  const setProg = (i, txt) => {
    const bar = document.getElementById('bulkProgBar');
    const hd  = document.getElementById('bulkProgHead');
    const sub = document.getElementById('bulkProgSub');
    if(bar) bar.style.width = Math.round(i / picked.length * 100) + '%';
    if(hd)  hd.textContent = `${i} / ${picked.length}`;
    if(sub) sub.textContent = txt || '';
  };

  for(let i = 0; i < picked.length; i++){
    if(bulkCancel) break;
    const c = picked[i];
    setProg(i, c.name);
    const r = (appData.reviews || []).find(x => String(x.id) === String(c.id));
    if(!r){ continue; }

    const type = c.isTv ? 'tv' : 'movie';
    let tmdbId = r.tmdb_id || null;
    let matched = null;

    // Nimihaku vain jos tunnusta ei ole
    if(!tmdbId){
      const q = encodeURIComponent(c.name);
      const yq = c.year ? (c.isTv ? `&first_air_date_year=${c.year}` : `&year=${c.year}`) : '';
      const sr = await tmdbGet(`/search/${type}?query=${q}&language=fi-FI&page=1${yq}`);
      const hit = sr && sr.results && sr.results[0];
      if(hit){
        tmdbId = hit.id;
        matched = {
          title: hit.title || hit.name || '',
          year: (hit.release_date || hit.first_air_date || '').slice(0,4),
          count: sr.results.length
        };
      }
    }

    if(!tmdbId){
      bulkResults.push({ id:c.id, name:c.name, year:c.year, isTv:c.isTv, error:'Ei osumaa TMDB:stä', diff:[], checked:false });
      await new Promise(res => setTimeout(res, BULK_DELAY));
      continue;
    }

    const detail = await tmdbGet(`/${type}/${tmdbId}?language=fi-FI&append_to_response=credits`);
    if(!detail || detail.success === false){
      bulkResults.push({ id:c.id, name:c.name, year:c.year, isTv:c.isTv, error:'Tietojen haku epäonnistui', diff:[], checked:false });
      await new Promise(res => setTimeout(res, BULK_DELAY));
      continue;
    }

    const diff = diffFor(r, detail, c.isTv);
    if(!r.tmdb_id) diff.unshift({ key:'tmdb_id', label:'TMDB-tunnus', kind:'add', oldShow:null, newShow:String(tmdbId), value: tmdbId });

    bulkResults.push({
      id: c.id, name: c.name, year: c.year, isTv: c.isTv,
      matched, diff,
      checked: diff.length > 0 && !matched,   // nimihaun osumat vaativat oman vahvistuksen
      error: null
    });
    await new Promise(res => setTimeout(res, BULK_DELAY));
  }

  setProg(picked.length, 'Valmis');
  bulkStep = 3;
  renderBulk();
};

window.cancelBulk = function(){
  bulkCancel = true;
};

function renderStep2(){
  return `
    <div class="bulk-step"><strong>Vaihe 2 / 3 — haku.</strong> Haetaan tiedot TMDB:stä.
      Mitään ei vielä muuteta.</div>
    <div class="bulk-prog">
      <div class="bulk-prog-head"><span>Haetaan</span><span id="bulkProgHead">0 / 0</span></div>
      <div class="bulk-prog-track"><div class="bulk-prog-bar" id="bulkProgBar" style="width:0%"></div></div>
      <div class="bulk-prog-sub" id="bulkProgSub"></div>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="cancelBulk()">Keskeytä</button>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// VAIHE 3 — ESIKATSELU JA PÄIVITYS
// ════════════════════════════════════════════════════════════

window.toggleBulkResult = function(id, on){
  const r = bulkResults.find(x => String(x.id) === String(id));
  if(r) r.checked = !!on;
  updateApplyButton();
};

window.bulkResultsAll = function(on){
  bulkResults.forEach(r => { if(r.diff.length) r.checked = !!on; });
  renderBulk();
};

window.toggleBulkOnlyMissing = function(){
  bulkOnlyMissing = !bulkOnlyMissing;
  renderBulk();
};

function applicableRows(res){
  return res.diff.filter(d => bulkOnlyMissing ? d.kind === 'add' : true);
}

function updateApplyButton(){
  const btn = document.getElementById('bulkApplyBtn');
  if(!btn) return;
  const picked = bulkResults.filter(r => r.checked && applicableRows(r).length);
  const fields = picked.reduce((a,r) => a + applicableRows(r).length, 0);
  btn.textContent = picked.length ? `✅ Päivitä ${picked.length} (${fields} kenttää)` : 'Ei mitään päivitettävää';
  btn.disabled = !picked.length;
  btn.style.opacity = picked.length ? '1' : '0.5';
}

function renderStep3(){
  const withChanges = bulkResults.filter(r => applicableRows(r).length);
  const errors = bulkResults.filter(r => r.error);
  const clean = bulkResults.filter(r => !r.error && !applicableRows(r).length);

  const rows = withChanges.map(r => {
    const rows2 = applicableRows(r).filter(d => !d.hidden);
    const hiddenN = applicableRows(r).filter(d => d.hidden).length;
    return `
    <label class="bulk-row">
      <input type="checkbox" class="bulk-check" ${r.checked?'checked':''}
        onchange="toggleBulkResult('${escJs(String(r.id))}', this.checked)">
      <span class="bulk-info">
        <span class="bulk-name">${esc(r.name)} ${r.year?`<span>(${r.year})</span>`:''}</span>
        ${r.matched ? `<span class="bulk-match">🔎 Nimihaun osuma: <strong>${esc(r.matched.title)}</strong>${r.matched.year?` (${esc(r.matched.year)})`:''}${r.matched.count>1?` · ${r.matched.count} tulosta, tämä oli osuvin`:''} — tarkista että se on oikea teos</span>` : ''}
        <span class="bulk-diff">
          ${rows2.map(d => `
            <span class="bulk-diff-row">
              <span class="bulk-diff-key">${esc(d.label)}</span>
              <span class="bulk-diff-val">
                ${d.kind==='change' && d.oldShow ? `<span class="bulk-diff-old">${esc(d.oldShow)}</span> <span class="bulk-diff-arrow">→</span> ` : ''}
                ${esc(d.newShow || '')}
              </span>
            </span>`).join('')}
          ${hiddenN ? `<span class="bulk-diff-row"><span class="bulk-diff-key">Tekniset</span><span class="bulk-diff-val" style="color:var(--muted);">${hiddenN} sisäistä kenttää (tunnisteet, genre-id:t)</span></span>` : ''}
        </span>
      </span>
    </label>`;
  }).join('');

  return `
    <div class="bulk-step"><strong>Vaihe 3 / 3 — esikatselu.</strong>
      Alla on tarkalleen se mitä tallennus muuttaisi. Arvosanoihin, muistiinpanoihin,
      merkintöihin tai jaksojen pisteisiin ei kosketa.</div>

    <div class="bulk-sum">
      <div class="bulk-sum-box"><div class="bulk-sum-num">${withChanges.length}</div><div class="bulk-sum-lbl">päivitettävää</div></div>
      <div class="bulk-sum-box"><div class="bulk-sum-num">${clean.length}</div><div class="bulk-sum-lbl">jo ajan tasalla</div></div>
      <div class="bulk-sum-box"><div class="bulk-sum-num">${errors.length}</div><div class="bulk-sum-lbl">ei löytynyt</div></div>
    </div>

    <div class="toggle-row" style="margin-bottom:12px;">
      <div>
        <div class="toggle-row-label">Täytä vain puuttuvat kentät</div>
        <div class="toggle-row-sub">${bulkOnlyMissing
          ? 'Turvallinen: olemassa olevia arvoja ei ylikirjoiteta.'
          : 'Myös muuttuneet arvot korvataan TMDB:n uusilla (esim. tuotantotila ja arvosana).'}</div>
      </div>
      <button type="button" class="toggle-switch ${bulkOnlyMissing?'on':''}" onclick="toggleBulkOnlyMissing()"></button>
    </div>

    ${withChanges.length ? `<div class="si-tools">
      <button type="button" class="si-tool" onclick="bulkResultsAll(true)">Valitse kaikki</button>
      <button type="button" class="si-tool" onclick="bulkResultsAll(false)">Tyhjennä</button>
    </div>` : ''}

    <div class="bulk-list">
      ${rows || '<div class="bulk-empty">Ei muutettavaa. Valitut arvostelut ovat jo ajan tasalla.</div>'}
      ${errors.length ? errors.map(r => `
        <div class="bulk-row is-skip">
          <span class="bulk-info">
            <span class="bulk-name">${esc(r.name)} ${r.year?`<span>(${r.year})</span>`:''}</span>
            <span class="bulk-nomatch">⚠️ ${esc(r.error)} — korjaa nimi tai hae tiedot käsin arvostelun muokkauksesta</span>
          </span>
        </div>`).join('') : ''}
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="openBulkTmdb()">↩️ Alusta</button>
      <button class="btn-primary" id="bulkApplyBtn" onclick="applyBulk()">Päivitä valitut</button>
    </div>`;
}

window.applyBulk = async function(){
  const picked = bulkResults.filter(r => r.checked && applicableRows(r).length);
  if(!picked.length) return;

  let files = 0, fields = 0;
  const today = new Date().toISOString().slice(0,10);

  picked.forEach(res => {
    const r = (appData.reviews || []).find(x => String(x.id) === String(res.id));
    if(!r) return;
    applicableRows(res).forEach(d => { r[d.key] = d.value; fields++; });
    r.tmdb_checked = today;
    if(!r.tmdb_type) r.tmdb_type = res.isTv ? 'tv' : 'movie';
    files++;
  });

  closeModal('bulkTmdbModal');
  if(window.renderAll) renderAll();
  await window.fbSave();

  const el = document.getElementById('saveStatus');
  if(el){
    el.textContent = `✅ ${files} arvostelua päivitetty (${fields} kenttää)`;
    el.style.background = '#22c55e'; el.style.color = 'white'; el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 3000);
  }
  if(window.launchConfetti && files >= 5) window.launchConfetti();
};

function renderBulk(){
  const el = document.getElementById('bulkBody');
  if(!el) return;
  el.innerHTML = bulkStep === 1 ? renderStep1() : (bulkStep === 2 ? renderStep2() : renderStep3());
  if(bulkStep === 1) updateBulkButton();
  if(bulkStep === 3) updateApplyButton();
}
window.renderBulk = renderBulk;
