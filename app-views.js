// ══ ARVOSTELUT · näkymät (kortit, lomake, vertailu, TV-osat, Top) ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_VIEWS = '2026-08-28.11';
// Tavallinen skripti (ei moduuli): ylätason muuttujat ja funktiot
// jaetaan tiedostojen kesken globaalin skoopin kautta.
// LATAUSJÄRJESTYS ON MERKITSEVÄ — katso index.html:n loppu.

// ── KORTIT ──
// ── NÄKYMÄTILA: kortti / ruudukko / lista ──
let viewMode = 'cards';
try { viewMode = localStorage.getItem('arvostelut_viewMode') || 'cards'; } catch(e){}

const VIEW_MODES = [
  { id:'cards', icon:'🗂️', label:'Kortit' },
  { id:'grid',  icon:'▦',  label:'Ruudukko' },
  { id:'list',  icon:'☰',  label:'Lista' }
];

window.updateViewModeBtn = function(){
  const btn = document.getElementById('viewModeBtn');
  if(!btn) return;
  const m = VIEW_MODES.find(v=>v.id===viewMode) || VIEW_MODES[0];
  btn.textContent = m.icon;
  btn.title = 'Näkymä: ' + m.label;
};

window.cycleViewMode = function(){
  const i = VIEW_MODES.findIndex(v=>v.id===viewMode);
  viewMode = VIEW_MODES[(i+1) % VIEW_MODES.length].id;
  try { localStorage.setItem('arvostelut_viewMode', viewMode); } catch(e){}
  window.updateViewModeBtn();
  const m = VIEW_MODES.find(v=>v.id===viewMode);
  const el = document.getElementById('saveStatus');
  if(el){
    el.textContent = m.icon + ' ' + m.label;
    el.style.background='#333'; el.style.color='white'; el.style.opacity='1';
    setTimeout(()=>el.style.opacity='0', 1500);
  }
  renderCards();
};

// Kategorian kuvake. Tunnistus nimen perusteella, jotta itse lisätyt
// kategoriat saavat järkevän kuvakkeen ilman erillistä asetusta.
function catEmoji(cat){
  const c = String(cat || '').toLowerCase();
  if(c.includes('elokuv') || c.includes('leffa')) return '🎬';
  if(c.includes('sarj') || c.includes('tv')) return '📺';
  if(c.includes('dokument')) return '🎥';
  if(c.includes('anime')) return '🍥';
  if(c.includes('kirj')) return '📚';
  if(c.includes('peli')) return '🎮';
  if(c.includes('ruo') || c.includes('ravinto')) return '🍽️';
  if(c.includes('juom')) return '🥤';
  if(c.includes('musi') || c.includes('albumi')) return '🎵';
  if(c.includes('teatteri') || c.includes('näytelmä')) return '🎭';
  if(c.includes('konsert') || c.includes('keikka')) return '🎤';
  return '⭐';
}

// Ruudukkotila: pelkkä juliste + pistepallo
function renderPosterTile(r, idx){
  const score = getReviewScore(r);
  const cls = score!=null ? scoreClass(score) : '';
  const name = plainName(r);
  const img = r.poster
    ? `<img class="tile-img" src="https://image.tmdb.org/t/p/w342${r.poster}" alt="" loading="lazy">`
    : `<div class="tile-img tile-noimg">${catEmoji(r.category)}<span class="tile-noimg-name">${esc(name)}</span></div>`;
  const mark = r.mark==='heart' ? '<div class="tile-mark">❤️</div>'
             : r.mark==='skull' ? '<div class="tile-mark">💀</div>' : '';
  const pc = pcAttrs(r);
  return `<div class="poster-tile ${r.mark==='heart'?'is-fav':''}${pc.cls}"${pc.id} style="animation-delay:${Math.min(idx*0.03,0.4)}s;${pc.style}" onclick="openReadModal(${r.id})">
    ${img}
    ${score!=null?`<div class="tile-score ${cls}">${score}</div>`:''}
    ${mark}
    <div class="tile-name">${esc(name)}${r.year?` <span class="tile-year">${r.year}</span>`:''}</div>
  </div>`;
}

// Listatila: yksi rivi per arvostelu
function renderListRow(r){
  const score = getReviewScore(r);
  const cls = score!=null ? scoreClass(score) : '';
  const dateStr = r.date ? new Date(r.date).toLocaleDateString('fi-FI') : '';
  const mark = r.mark==='heart' ? ' ❤️' : r.mark==='skull' ? ' 💀' : '';
  return `<div class="list-row" onclick="openReadModal(${r.id})">
    <span class="list-icon">${catEmoji(r.category)}</span>
    <span class="list-name">${esc(plainName(r))}${r.year?` <span class="list-year">${r.year}</span>`:''}${mark}</span>
    <span class="list-date">${dateStr}</span>
    <span class="list-score ${cls}">${score!=null?score:'–'}</span>
  </div>`;
}

window.renderCards = function(){
  const searchEl = document.getElementById('searchInput');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let reviews = [...appData.reviews];
  if(activeCat) reviews = reviews.filter(r=>r.category===activeCat);
  // Alalaji: '' = perus, muu = kyseinen alalaji. Kategoriassa jolla ei ole
  // alalajeja rajausta ei tehdä lainkaan.
  const sub = window.getActiveSub ? window.getActiveSub() : '';
  if(activeCat && subcatsFor(activeCat).length){
    reviews = reviews.filter(r => subcatOf(r) === sub);
  }

  // ── SUMEA HAKU ──
  // matchScore pitää kirjaa siitä kuinka hyvin kukin osui, jotta parhaat
  // osumat voidaan nostaa listan kärkeen. null = ei hakua käynnissä.
  let matchScore = null;
  let bestMatch = 0;
  if(q){
    const nq = fuzzyNormCached(q);
    const digits = /^\d+$/.test(q.trim());
    matchScore = new Map();
    reviews = reviews.filter(r=>{
      let m = fuzzyMatch(nq, fuzzyNormCached(plainName(r)));
      // Vuosiluku: "2023" löytää kaikki vuoden 2023 teokset
      if(digits && r.year && String(r.year).indexOf(q.trim()) !== -1){
        m = Math.max(m, 75);
      }
      if(m > 0){
        matchScore.set(r.id, m);
        if(m > bestMatch) bestMatch = m;
      }
      return m > 0;
    });
  }
  if(activeGenreFilter) reviews = reviews.filter(r=>{
    const genres = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
    return genres.includes(activeGenreFilter);
  });
  if(activeScoreFilter){
    reviews = reviews.filter(r=>{
      const s=getReviewScore(r); if(s===null) return false;
      if(activeScoreFilter==='high') return scoreBand(s)==='high';
      if(activeScoreFilter==='mid') return scoreBand(s)==='mid';
      return s<40;
    });
  }
  if(activeMarkFilter) reviews = reviews.filter(r=>r.mark===activeMarkFilter);
  if(activeYearFilter) reviews = reviews.filter(r=>r.date&&new Date(r.date).getFullYear()===activeYearFilter);
  if(activeDecadeFilter) reviews = reviews.filter(r=>r.year&&Math.floor(r.year/10)*10===activeDecadeFilter);

  reviews.sort((a,b)=>{
    // Haun aikana osuvuus ratkaisee ensin, valittu järjestys vasta tasapelin.
    if(matchScore){
      const d = (matchScore.get(b.id)||0) - (matchScore.get(a.id)||0);
      if(d) return d;
    }
    if(sortMode==='uusin') return b.id-a.id;
    if(sortMode==='vanhin') return a.id-b.id;
    if(sortMode==='paras') return (getReviewScore(b)||0)-(getReviewScore(a)||0);
    return (getReviewScore(a)||0)-(getReviewScore(b)||0);
  });

  // Kerro jos näytetään vain sumeita osumia — muuten vaikuttaa siltä
  // että haku löysi jotain aivan muuta kuin mitä kirjoitit.
  const noteEl = document.getElementById('searchNote');
  if(noteEl){
    if(matchScore && reviews.length && bestMatch < 70){
      noteEl.innerHTML = `Ei tarkkoja osumia haulle <strong>${esc(q)}</strong> — näytetään samankaltaiset.`;
      noteEl.style.display = 'block';
    } else {
      noteEl.style.display = 'none';
      noteEl.innerHTML = '';
    }
  }

  const grid = document.getElementById('cardsGrid');
  if(!reviews.length){
    grid.className = 'cards-grid';
    const subLabel = !subcatsFor(activeCat).length ? '' : (sub === '' ? 'Perus' : sub);
    grid.innerHTML = q
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Ei osumia haulle “${esc(q)}”</div></div>`
      : `<div class="empty-state"><div class="empty-icon">🎬</div><div class="empty-title">Ei arvosteluja${subLabel ? ` alalajissa “${esc(subLabel)}”` : ' vielä'}</div>
         ${subLabel ? '<div class="empty-sub">Vaihda alalajia yltä nähdäksesi muut.</div>' : ''}</div>`;
    return;
  }

  grid.className = 'cards-grid' + (viewMode==='grid' ? ' mode-grid' : viewMode==='list' ? ' mode-list' : '');

  if(viewMode==='grid'){
    grid.innerHTML = reviews.map((r,idx)=>renderPosterTile(r,idx)).join('');
    schedulePosterColors(reviews.slice(0,60));
    return;
  }
  if(viewMode==='list'){
    grid.innerHTML = reviews.map(r=>renderListRow(r)).join('');
    return;
  }

  schedulePosterColors(reviews.slice(0,40));
  grid.innerHTML = reviews.map((r,idx)=>{
    const score = getReviewScore(r);
    const isTvParts = r.tvType && r.tvType!=='kokonaisuus';
    const typeClass = catType(r.category);
    const dateStr = r.date ? new Date(r.date).toLocaleDateString('fi-FI') : '';

    let partsHtml = '';
    if(isTvParts){
      const avg = getReviewScore(r);
      const isJaksot = r.tvType==='jaksot';

      if(isJaksot){
        // Kausiryhmittely
        const seasons = r.seasons||[];
        // Taaksepäin yhteensopivuus: jos vanhoja parts ilman seasons
        let seasonHtml = '';
        if(seasons.length===0){
          seasonHtml = `<div style="color:var(--muted);font-size:13px;padding:8px 0;">Ei kausia vielä</div>`;
        } else {
          seasonHtml = seasons.map((s,si)=>{
            const eps = s.episodes||[];
            const sRated = eps.filter(e=>e.score!=null).length;
            const sAvg = ratedAvg(eps);
            const sKey = `season-${r.id}-${si}`;
            const sCls = sAvg!==null ? scoreClass(sAvg) : '';
            const sDone = eps.length>0 && sRated===eps.length;
            return `<div class="season-group">
              <div class="season-header" onclick="toggleSeason('${sKey}')">
                <span class="season-arrow" id="arr-${sKey}">▶</span>
                <span class="season-name">${esc(s.name)}</span>
                <span class="season-count${sDone?' is-done':''}">${sDone?'✓ ':''}${sRated}/${eps.length}</span>
                ${sAvg!==null?`<span class="season-avg ${sCls}">${sAvg}</span>`:''}
                <button class="season-del" onclick="event.stopPropagation();deleteSeason(${r.id},${si})">✕</button>
              </div>
              <div class="season-episodes" id="${sKey}" style="display:none;">
                ${eps.map((ep,ei)=>`
                  <div class="tv-part">
                    <div class="tv-part-info">
                      <span class="tv-part-name">${ep.episode?`<span style="color:var(--accent);font-weight:700;font-size:12px;">J${ep.episode} </span>`:''}${esc(ep.name||'')}</span>
                      ${ep.plot?`<span class="tv-part-plot${(ep.plotLang==='en')?' is-en':''}" onclick="event.stopPropagation();this.classList.toggle('open')" title="Napauta laajentaaksesi">${ep.plotLang==='en'?'<span class="plot-lang">EN</span> ':''}${escNl(ep.plot)}</span>`:''}
                      ${ep.note?`<span class="tv-part-note">${mdText(ep.note)}</span>`:''}
                    </div>
                    <span class="tv-part-score ${ep.score != null ? scoreClass(ep.score) : ''}" style="${ep.score == null ? 'color:var(--muted);font-size:14px;' : ''}">${ep.score != null ? ep.score : '–'}</span>
                    <button class="btn-sm btn-edit" style="padding:4px 8px;font-size:12px;" onclick="editEpisode(${r.id},${si},${ei})">✏️</button>
                    <button class="btn-sm btn-del" style="padding:4px 8px;font-size:12px;" onclick="deleteEpisode(${r.id},${si},${ei})">✕</button>
                  </div>
                `).join('')}
                <button class="btn-add-part" onclick="openAddPart(${r.id},${si})">+ Lisää jakso</button>
              </div>
            </div>`;
          }).join('');
        }
        // Laske paras/huonoin jakso kaikista kausista
        const allEps = (r.seasons||[]).flatMap((s,si)=>(s.episodes||[]).map(e=>({...e, _si:si+1}))).filter(e=>e.score!=null);
        let bestWorstHtml = '';
        if(allEps.length > 0){
          const maxScore = Math.max(...allEps.map(e=>e.score));
          const minScore = Math.min(...allEps.map(e=>e.score));
          const bestEps = allEps.filter(e=>e.score===maxScore);
          const worstEps = allEps.filter(e=>e.score===minScore);
          const epLabel = ep => `${ep._si?'K'+ep._si:''}${ep.episode?'J'+ep.episode:''}${(ep._si||ep.episode)&&ep.name?' ':'' }${ep.name||''}`.trim()||'–';
          bestWorstHtml = `<div class="best-worst-box">
            <div class="best-worst-row">
              <span class="best-worst-icon">🏆</span>
              <span class="best-worst-label">Paras</span>
              <span class="best-worst-names">${esc(bestEps.map(epLabel).join(', '))}</span>
              <span class="tv-part-score ${scoreClass(maxScore)}" style="font-family:'Bebas Neue',sans-serif;font-size:18px;">${maxScore}</span>
            </div>
            ${minScore!==maxScore?`<div class="best-worst-row">
              <span class="best-worst-icon">💀</span>
              <span class="best-worst-label">Huonoin</span>
              <span class="best-worst-names">${esc(worstEps.map(epLabel).join(', '))}</span>
              <span class="tv-part-score ${scoreClass(minScore)}" style="font-family:'Bebas Neue',sans-serif;font-size:18px;">${minScore}</span>
            </div>`:''}
          </div>`;
        }

        // Edistyminen: montako jaksoa arvosteltu kaikkiaan
        const prog = episodeProgress(r);
        const progHtml = prog.total ? `<div class="ep-progress${prog.rated>=prog.total?' is-complete':''}">
          <div class="ep-progress-head">
            <span>📺 ${prog.rated}/${prog.total} jaksoa arvosteltu</span>
            <span class="ep-progress-pct">${prog.rated>=prog.total?'valmis ✓':prog.pct+' %'}</span>
          </div>
          <div class="ep-progress-track">
            <div class="ep-progress-bar" style="width:${Math.min(100,prog.pct)}%"></div>
          </div>
        </div>` : '';

        partsHtml = `<div class="tv-parts">
          ${avg!==null?`<div class="tv-avg">${buildRing(avg)}</div>`:''}
          ${progHtml}
          ${bestWorstHtml}
          ${seasonHtml}
          <div class="season-actions">
            <button class="btn-add-season" onclick="openAddSeason(${r.id})">+ Lisää kausi</button>
            <button class="btn-import-seasons" onclick="openSeasonImport(${r.id})">📥 Tuo TMDB:stä</button>
          </div>
          ${(function(){
            const pend = pendingTranslations(r).length;
            if(!pend) return '';
            return `<button class="btn-translate-seasons" onclick="openTranslateModal(${r.id})">🌐 Käännä suomeksi <span class="bts-count">${pend}</span></button>`;
          })()}
        </div>`;
      } else {
        // Kausittain (ei muutosta rakenteeseen)
        const parts = r.parts||[];
        partsHtml = `<div class="tv-parts">
          ${avg!==null?`<div class="tv-avg">${buildRing(avg)}</div>`:''}
          ${parts.map((p,i)=>`
            <div class="tv-part">
              <div class="tv-part-info">
                <span class="tv-part-name">${esc(p.name||'')}</span>
                ${p.note?`<span class="tv-part-note">${mdText(p.note)}</span>`:''}
              </div>
              <span class="tv-part-score ${scoreClass(p.score)}">${p.score}</span>
              <button class="btn-sm btn-edit" style="padding:4px 8px;font-size:12px;" onclick="editPart(${r.id},${i})">✏️</button>
              <button class="btn-sm btn-del" style="padding:4px 8px;font-size:12px;" onclick="deletePart(${r.id},${i})">✕</button>
            </div>
          `).join('')}
          <button class="btn-add-part" onclick="openAddPart(${r.id})">+ Lisää kausi</button>
        </div>`;
      }
    }

    const scoreCardCls = score!==null ? ('score-'+scoreBand(score)+'-card') : '';
    const favCls = r.mark==='heart' ? 'is-favorite' : '';
    const posterBg = r.poster ? `<div class="card-poster-bg" style="background-image:url('https://image.tmdb.org/t/p/w200${r.poster}')"></div>` : '';
    const extraInfo = [];
    if(r.director) extraInfo.push(`🎬 ${esc(r.director)}`);
    if(r.runtime) extraInfo.push(`⏱️ ${r.runtime} min`);
    if(r.episodes_total) extraInfo.push(`📺 ${r.episodes_total} jaksoa`);
    if(r.country) extraInfo.push(`🌍 ${esc(r.country)}`);
    if(r.cast && r.cast.length) extraInfo.push(`🎭 ${esc(r.cast.slice(0,3).join(', '))}`);
    const tmdbScoreHtml = r.tmdb_score ? `<span class="tmdb-score-compare">⭐ TMDB ${r.tmdb_score}</span>` : '';
    const pc = pcAttrs(r);
    return `<div class="review-card type-${typeClass} ${scoreCardCls} ${favCls}${pc.cls}"${pc.id} style="animation-delay:${Math.min(idx*0.06,0.5)}s;${pc.style}" ondblclick="openReadModal(${r.id})">
      ${posterBg}
      <div class="card-top">
        <div class="card-title">${escNl(r.name)}${r.year?` <span class="card-year">${r.year}</span>`:''}</div>
        ${score!==null&&!isTvParts ? buildRing(score) : ''}
      </div>
      <div class="card-meta">
        <span class="meta-chip">${esc(r.category)}</span>
        ${subcatOf(r) ? `<span class="meta-chip subcat-chip">${esc(subcatOf(r))}</span>` : ''}
        ${(()=>{
          const genres = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
          return genres.map(g=>`<span class="meta-chip">${esc(g)}</span>`).join('');
        })()}
        ${isTvParts?`<span class="meta-chip">${r.tvType==='kaudet'?'Kausi-arv.':'Jakso-arv.'}</span>`:''}
        ${(()=>{
          const st = tvStatusInfo(r.tv_status);
          if(!st) return '';
          return `<span class="meta-chip status-chip status-${st.cls}">${st.icon} ${esc(st.fi)}</span>`;
        })()}
        ${r.mark==='heart'?'<span class="meta-chip" style="background:rgba(255,100,130,0.18);color:#ff6482;">❤️ Suosikki</span>':''}
        ${r.mark==='skull'?'<span class="meta-chip" style="background:rgba(160,160,160,0.12);color:#aaa;">💀 Huono</span>':''}
      </div>
      ${extraInfo.length ? `<div class="card-extra-info">${extraInfo.map(i=>`<span>${i}</span>`).join('')}</div>` : ''}
      ${tmdbScoreHtml}
      ${r.plot?`<div class="card-plot"><span class="card-plot-label">📖 Juoni</span>${escNl(r.plot)}</div>`:''}
      ${r.note?`<div class="card-note" id="note-${r.id}">${mdText(r.note)}</div>`:''}
      ${partsHtml}
      ${dateStr?`<div class="card-date">📅 ${dateStr}</div>`:''}
      <div class="card-actions">
        <button class="btn-sm btn-edit" onclick="editReviewWithFlip(${r.id})">✏️ Muokkaa</button>
        ${(r.category==='Elokuvat'||r.category==='TV-sarjat') ? `<button class="btn-sm" style="background:rgba(96,165,250,0.12);color:var(--blue);" onclick="updateTmdbData(${r.id})">🎬 TMDB</button>` : ''}
        <button class="btn-sm btn-del" onclick="deleteReview(${r.id})">🗑️ Poista</button>
      </div>
    </div>`;
  }).join('');
};

window.toggleNote = function(id){
  const el = document.getElementById('note-'+id);
  if(!el) return;
  el.classList.toggle('collapsed');
  const btn = el.querySelector('.btn-expand');
  if(btn) btn.textContent = el.classList.contains('collapsed') ? 'Näytä lisää ▾' : 'Piilota ▴';
};

// ── LISÄÄ/MUOKKAA ──
window.openAddModal = function(){
  editingId = null;
  selectedScore = null;
  selectedTvType = 'kokonaisuus';
  selectedMark = null;
  window._tmdbPending = null;
  selectedRatings = {};
  window._ratingsSuggestedScore = null;
  window._compareSuggestedScore = null;
  document.getElementById('tmdbSearchInput').value = '';
  document.getElementById('tmdbResults').style.display = 'none';
  document.getElementById('modalTitle').textContent = 'Lisää arvostelu';
  document.getElementById('formName').value = '';
  const fy0 = document.getElementById('formYear'); if(fy0) fy0.value = '';
  document.getElementById('formNote').value = '';
  document.getElementById('formDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('scoreSection').style.display = 'block';
  document.getElementById('tvTypeSection').style.display = 'none';
  // Uusi arvostelu perii sen alalajin jota parhaillaan selaat — jos katsot
  // Dokumentit-välilehteä, lisäät todennäköisesti dokumentin.
  const si=document.getElementById('scoreInput'); if(si) si.value='';
  const prev=document.getElementById('scorePreview'); if(prev) prev.textContent='';
  const pb=document.getElementById('scorePredictionBox'); if(pb) pb.style.display='none';
  const scb=document.getElementById('scoreContextBox'); if(scb){ scb.style.display='none'; scb.innerHTML=''; }
  populateFormCat();
  // Uusi arvostelu perii sen alalajin jota parhaillaan selaat — jos katsot
  // Dokumentit-välilehteä, lisäät todennäköisesti dokumentin.
  // Tämä on populateFormCatin JÄLKEEN, koska se nollaa valitsimen.
  const curSub = window.getActiveSub ? window.getActiveSub() : '';
  populateFormSubcat(document.getElementById('formCat').value, curSub);
  buildScorePicker('scorePicker', 'selectedScore');
  window.toggleMark(null);
  document.getElementById('addModal').classList.add('open');
};

window.editReview = function(id){
  const r = appData.reviews.find(x=>x.id===id); if(!r) return;
  editingId = id;
  selectedScore = r.score!=null ? r.score : null;
  selectedTvType = r.tvType||'kokonaisuus';
  selectedMark = r.mark||null;
  selectedRatings = r.ratings ? {...r.ratings} : {};
  window._ratingsSuggestedScore = null;
  window._compareSuggestedScore = null;
  document.getElementById('modalTitle').textContent = 'Muokkaa arvostelua';
  document.getElementById('formName').value = plainName(r);
  const fy = document.getElementById('formYear'); if(fy) fy.value = r.year || '';
  document.getElementById('formNote').value = r.note||'';
  document.getElementById('formDate').value = r.date ? r.date.split('T')[0] : new Date().toISOString().split('T')[0];
  document.getElementById('scoreSection').style.display = 'block';
  populateFormCat(r.category);
  populateFormSubcat(r.category, subcatOf(r));
  window.onCatChange(r.genre);
  populateFormSubcat(r.category, subcatOf(r));
  if(r.category==='TV-sarjat') selectTvTypeByValue(r.tvType||'kokonaisuus');
  buildScorePicker('scorePicker', 'selectedScore');
  window.toggleMark(r.mark||null);
  document.getElementById('addModal').classList.add('open');
};

function populateFormCat(selected){
  const sel = document.getElementById('formCat');
  sel.innerHTML = appData.categories.map(c=>`<option value="${esc(c)}" ${c===(selected||activeCat)?'selected':''}>${esc(c)}</option>`).join('');
  window.onCatChange();
}

// Alalajivalitsin. Näkyy vain jos kategorialla on alalajeja määritelty.
// Säilyttää valinnan jos sama alalaji löytyy myös uudesta kategoriasta.
function populateFormSubcat(cat, preselect){
  const sec = document.getElementById('subcatSection');
  const sel = document.getElementById('formSubcat');
  if(!sec || !sel) return;
  const subs = subcatsFor(cat);
  if(!subs.length){
    sec.style.display = 'none';
    sel.innerHTML = '<option value=""></option>';
    return;
  }
  const want = preselect !== undefined ? preselect : sel.value;
  sec.style.display = 'block';
  const opts = [{ v:'', l:'Perus' }, ...subs.map(x => ({ v:x, l:x }))];
  sel.innerHTML = opts.map(o =>
    `<option value="${esc(o.v)}" ${o.v === want ? 'selected' : ''}>${esc(o.l)}</option>`
  ).join('');
}
window.populateFormSubcat = populateFormSubcat;

window.onCatChange = function(preselectedGenre){
  const cat = document.getElementById('formCat').value;
  const isTv = cat==='TV-sarjat';
  const hasGenre = GENRE_CATS.includes(cat);
  populateFormSubcat(cat);
  document.getElementById('tvTypeSection').style.display = isTv?'block':'none';
  document.getElementById('genreSection').style.display = hasGenre?'block':'none';
  setTimeout(window.updateScorePrediction, 50);
  setTimeout(window.updateCompareButtonVisibility, 50);
  setTimeout(window.updateRatingsGridVisibility, 50);
  setTimeout(window.updateScoreContext, 50);
  // Näytä TMDB-haku vain elokuville ja TV-sarjoille
  if(window.onTmdbCatChange) window.onTmdbCatChange(cat);
  if(hasGenre){
    // pre-selected: support array or string (backward compat)
    let preArr = [];
    if(Array.isArray(preselectedGenre)) preArr = preselectedGenre;
    else if(preselectedGenre) preArr = [preselectedGenre];
    const chips = document.getElementById('genreChips');
    chips.innerHTML = GENRES.map(g=>`
      <button type="button" class="genre-chip${preArr.includes(g)?' genre-chip-active':''}" onclick="toggleGenreChip(this,'${escJs(g)}')">${esc(g)}</button>
    `).join('');
  }
};

window.toggleGenreChip = function(el, genre){
  el.classList.toggle('genre-chip-active');
  setTimeout(window.updateScorePrediction, 50);
  setTimeout(window.updateCompareButtonVisibility, 50);
  setTimeout(()=>{
    if(document.getElementById('mainRatingsSection')?.style.display !== 'none'){
      renderRatingsGrid('mainRatingsGrid', selectedRatings, 'onMainRatingChange');
    }
  }, 50);
};

function getSelectedGenres(){
  const chips = document.querySelectorAll('#genreChips .genre-chip-active');
  return Array.from(chips).map(c=>c.textContent.trim());
}

window.selectTvType = function(el){
  document.querySelectorAll('.tv-type-opt').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
  selectedTvType = el.dataset.type;
  document.getElementById('scoreSection').style.display = selectedTvType==='kokonaisuus'?'block':'none';
  window.updateCompareButtonVisibility();
  window.updateRatingsGridVisibility();
};

function selectTvTypeByValue(val){
  document.querySelectorAll('.tv-type-opt').forEach(e=>e.classList.toggle('selected', e.dataset.type===val));
  selectedTvType = val;
  document.getElementById('scoreSection').style.display = val==='kokonaisuus'?'block':'none';
  window.updateCompareButtonVisibility();
  window.updateRatingsGridVisibility();
}

function buildScorePicker(pickerId, varName){
  // Now using number inputs; just set the value
  if(varName==='selectedScore'){
    const inp = document.getElementById('scoreInput');
    if(inp) inp.value = selectedScore !== null ? selectedScore : '';
    updateScorePreview();
  } else {
    const inp = document.getElementById('partScoreInput');
    if(inp) inp.value = selectedPartScore !== null ? selectedPartScore : '';
  }
}

window.updateScorePreview = function(){
  const prev = document.getElementById('scorePreview');
  if(prev){
    if(selectedScore===null){
      prev.textContent='';
    } else {
      const s = selectedScore;
      const _b = scoreBands();
      const _exc = Math.round(_b.high + (100 - _b.high) * 0.35);   // selvästi hyvän yläpuolella
      prev.textContent = s>=_exc?'🟢 Erinomainen':s>=_b.high?'🟢 Hyvä':s>=_b.mid?'🟠 Kohtalainen':'🔴 Heikko';
    }
  }
  if(window.updateScoreContext) window.updateScoreContext();
};

// ── PISTEKONTEKSTI: oma jakauma + lähimmät arvostelut ──
// Auttaa antamaan johdonmukaisia pisteitä: näet mihin kohtaan uusi piste
// osuu omassa jakaumassasi ja mitkä teokset saivat suunnilleen saman pisteen.

function getScoreContextPool(){
  const cat = document.getElementById('formCat')?.value;
  if(!cat) return { cat:null, label:null, pool:[] };
  // Sama ryhmäraja kuin vertailussa: dokumentit ja animaatiot eivät
  // sekoitu perusleffojen jakaumaan eivätkä lähimpiin arvosteluihin.
  const sub = readFormSubcat(cat);
  const pool = appData.reviews
    .filter(r => sameGroup(r, cat, sub) && r.id !== editingId)
    .map(r => ({ name:(r.name||'').split('\n')[0].trim(), s:getReviewScore(r) }))
    .filter(r => r.s != null);
  return { cat, label: groupLabel(cat, sub), pool };
}

function buildScoreHistogram(pool, current){
  const buckets = new Array(10).fill(0);
  pool.forEach(r => { buckets[Math.min(9, Math.max(0, Math.floor(r.s/10)))]++; });
  const max = Math.max.apply(null, buckets.concat([1]));
  const W = 300, slot = W/10, bw = slot - 7;
  const curBucket = current==null ? -1 : Math.min(9, Math.max(0, Math.floor(current/10)));

  const bars = buckets.map((n,i)=>{
    const h = n ? Math.max(4, Math.round(n/max*36)) : 1.5;
    const x = i*slot + 3.5, y = 48 - h;
    const mid = i*10 + 5;
    const fill = 'var(--sc-' + scoreBand(mid) + ')';
    const op = curBucket === -1 ? 0.6 : (i===curBucket ? 1 : 0.35);
    const count = (i===curBucket && n) ? `<text x="${x+bw/2}" y="${y-4}" text-anchor="middle" font-size="9" fill="var(--muted)">${n}</text>` : '';
    return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="2" fill="${fill}" opacity="${op}"/>${count}`;
  }).join('');

  const markX = current==null ? null : Math.max(1, Math.min(W-1, (current/100)*W));
  const marker = markX==null ? '' :
    `<line x1="${markX}" y1="6" x2="${markX}" y2="52" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.85"/>`;

  return `<svg class="score-hist" viewBox="0 0 ${W} 62" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="49" x2="${W}" y2="49" stroke="var(--border)" stroke-width="1"/>
    ${bars}${marker}
    <text x="1" y="60" font-size="9" fill="var(--muted)">0</text>
    <text x="${W/2}" y="60" font-size="9" fill="var(--muted)" text-anchor="middle">50</text>
    <text x="${W-1}" y="60" font-size="9" fill="var(--muted)" text-anchor="end">100</text>
  </svg>`;
}

// ── LÄHIMMÄT ARVOSTELUSI ──
// Ikkuna omaan paremmuusjärjestykseen: keskisivulla kolme parempaa ja
// kolme huonompaa, taaksepäin kuusi parempaa, eteenpäin kuusi huonompaa.
// Yhteensä 18 riviä kolmella sivulla, jotta uuden pisteen sijoituksesta
// näkee kokonaiskuvan eikä vain lähintä naapuria.
const NB_PER_PAGE = 6;
let neighborPage = 0;
let neighborLastScore = null;

// Sivu p alkaa kohdasta pos-3 + p*6. Negatiivista alkua ei rajata
// nollaan, koska silloin sivut menisivät päällekkäin.
function neighborSlice(sorted, pos, p){
  const start = pos - (NB_PER_PAGE / 2) + p * NB_PER_PAGE;
  const to = start + NB_PER_PAGE;
  if(to <= 0 || start >= sorted.length) return { rows: [], start };
  return { rows: sorted.slice(Math.max(0, start), to), start: Math.max(0, start) };
}

window.setNeighborPage = function(p){
  neighborPage = Math.max(-1, Math.min(1, p));
  window.updateScoreContext(true);
};

function buildScoreNeighbors(pool, current){
  if(current == null || !pool.length) return '';

  // Paremmuusjärjestys, paras ensin
  const sorted = pool.slice().sort((a,b) => b.s - a.s);
  const pos = sorted.filter(r => r.s > current).length;   // uuden pisteen sijoitus
  const total = sorted.length + 1;

  const { rows, start } = neighborSlice(sorted, pos, neighborPage);
  if(!rows.length && neighborPage !== 0){
    neighborPage = 0;
    return buildScoreNeighbors(pool, current);
  }

  const line = (r, rank) => {
    const d = r.s - current;
    const diff = d === 0 ? 'sama' : (d > 0 ? '+' + d : String(d));
    return `<div class="score-neighbor">
      <span class="score-neighbor-rank">${rank}.</span>
      <span class="score-neighbor-name">${esc(r.name || '–')}</span>
      <span class="score-neighbor-diff">${diff}</span>
      <span class="score-neighbor-score ${scoreClass(r.s)}">${r.s}</span>
    </div>`;
  };

  // Keskisivulle merkitään mihin kohtaan uusi piste asettuu
  const html = [];
  rows.forEach((r, i) => {
    const idx = start + i;
    if(neighborPage === 0 && idx === pos){
      html.push(`<div class="score-neighbor is-you">
        <span class="score-neighbor-rank">${pos + 1}.</span>
        <span class="score-neighbor-name">Tämä arvostelu</span>
        <span class="score-neighbor-diff"></span>
        <span class="score-neighbor-score ${scoreClass(current)}">${current}</span>
      </div>`);
    }
    // Rivin sijoitus: uuden pisteen jälkeen tulevat siirtyvät yhdellä
    html.push(line(r, idx < pos ? idx + 1 : idx + 2));
  });
  if(neighborPage === 0 && pos >= start + rows.length){
    html.push(`<div class="score-neighbor is-you">
      <span class="score-neighbor-rank">${pos + 1}.</span>
      <span class="score-neighbor-name">Tämä arvostelu</span>
      <span class="score-neighbor-diff"></span>
      <span class="score-neighbor-score ${scoreClass(current)}">${current}</span>
    </div>`);
  }

  const canBack = neighborSlice(sorted, pos, neighborPage - 1).rows.length > 0 && neighborPage > -1;
  const canFwd  = neighborSlice(sorted, pos, neighborPage + 1).rows.length > 0 && neighborPage < 1;
  const first = start + 1;
  const last  = start + rows.length;
  const pageName = neighborPage === -1 ? 'Paremmat' : (neighborPage === 1 ? 'Heikommat' : 'Lähimmät');

  return `<div class="score-neighbors">
      <div class="score-neighbors-head">
        <span class="score-neighbors-label">${pageName} arvostelusi</span>
        <span class="score-neighbors-page">sijat ${first}–${last} / ${total}</span>
      </div>
      ${html.join('')}
      <div class="nb-nav">
        <button type="button" class="nb-btn" ${canBack?'':'disabled'} onclick="setNeighborPage(${neighborPage - 1})">↑ Paremmat</button>
        <span class="nb-dots">
          <i class="${neighborPage===-1?'on':''}"></i><i class="${neighborPage===0?'on':''}"></i><i class="${neighborPage===1?'on':''}"></i>
        </span>
        <button type="button" class="nb-btn" ${canFwd?'':'disabled'} onclick="setNeighborPage(${neighborPage + 1})">Heikommat ↓</button>
      </div>
    </div>
    <div class="score-rank">Sijoitus tällä pisteellä: <strong>${pos + 1}.</strong> / ${total}</div>`;
}

window.updateScoreContext = function(keepPage){
  const box = document.getElementById('scoreContextBox');
  if(!box) return;
  const { cat, label, pool } = getScoreContextPool();
  if(!cat || pool.length < 3){ box.style.display='none'; box.innerHTML=''; return; }

  const cur = (typeof selectedScore === 'number') ? selectedScore : null;
  // Pisteen vaihtuminen palauttaa keskisivulle; sivunavigointi ei
  if(!keepPage && cur !== neighborLastScore){ neighborPage = 0; }
  neighborLastScore = cur;
  const avg = Math.round(pool.reduce((a,r)=>a+r.s,0)/pool.length);

  // Pisteinflaation huomautus: yli 60 % arvosteluista 80 pisteen yläpuolella
  const highShare = pool.filter(r=>r.s>=80).length / pool.length;
  const warn = (pool.length >= 8 && highShare > 0.6)
    ? `<div class="score-warn">⚠️ ${Math.round(highShare*100)} % arvosteluistasi on 80+ — asteikon yläpää alkaa täyttyä.</div>`
    : '';

  box.style.display = 'block';
  box.innerHTML = `<div class="score-context">
    <div class="score-context-head">
      <span>📊 Jakauma · ${esc(label || cat)}</span>
      <span>${pool.length} kpl · ka ${avg}</span>
    </div>
    ${buildScoreHistogram(pool, cur)}
    ${buildScoreNeighbors(pool, cur)}
    ${warn}
  </div>`;
};

window.updateScorePrediction = function(){
  const box = document.getElementById('scorePredictionBox');
  if(!box) return;
  const cat = document.getElementById('formCat')?.value;
  const genres = getSelectedGenres();
  if(!cat){ box.style.display='none'; return; }
  // Keskiarvo lasketaan samasta ryhmästä, ei koko kategoriasta
  const sub = readFormSubcat(cat);
  let pool = appData.reviews.filter(r=>sameGroup(r, cat, sub) && r.score!=null);
  // Jos genrejä valittu, suosi niitä
  let genrePool = genres.length ? pool.filter(r=>{
    const rg = Array.isArray(r.genre)?r.genre:(r.genre?[r.genre]:[]);
    return genres.some(g=>rg.includes(g));
  }) : [];
  const usePool = genrePool.length >= 3 ? genrePool : pool;
  if(usePool.length < 2){ box.style.display='none'; return; }
  const avg = Math.round(usePool.reduce((a,r)=>a+(r.score||0),0)/usePool.length);
  const genreLabel = genrePool.length>=3 ? genres.join(', ') : groupLabel(cat, sub);
  const cls = 'color:var(--sc-' + scoreBand(avg) + ')';
  box.style.display='block';
  box.innerHTML = `<div class="score-prediction">
    <span class="score-prediction-icon">🎯</span>
    <span>Annat <strong>${genreLabel}</strong>-teoksille yleensä <strong style="${cls}">${avg}p</strong> (${usePool.length} arvostelua)</span>
  </div>`;
};

// ── VERTAILEVA PISTEYTYS ──
let compareState = null;

function getScoredReviewsByGroup(cat, sub, excludeId){
  return appData.reviews
    .filter(r => sameGroup(r, cat, sub) && r.id !== excludeId)
    .map(r => ({...r, finalScore: getReviewScore(r)}))
    .filter(r => r.finalScore != null);
}

// Palauttaa vertailukelpoiset arvostelut. Alalaji on KOVA raja: perusleffa
// ei kohtaa dokumenttia eikä animaatiota, koska niitä arvostellaan eri
// mittapuulla. Genre on sen sisällä pehmeä suositus — jos samaa genreä ei
// löydy tarpeeksi, käytetään koko ryhmää mutta ei koskaan toista ryhmää.
function getComparisonCandidates(cat, sub, genres, excludeId){
  const all = getScoredReviewsByGroup(cat, sub, excludeId);
  if(!genres || !genres.length) return { list: all, genreFiltered: false };
  const filtered = all.filter(r=>{
    const rg = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
    return genres.some(g=>rg.includes(g));
  });
  if(filtered.length >= 2) return { list: filtered, genreFiltered: true };
  return { list: all, genreFiltered: false };
}

window.updateCompareButtonVisibility = function(){
  const btn = document.getElementById('compareTuneBtn');
  if(!btn) return;
  const cat = document.getElementById('formCat')?.value;
  if(!ratingsEligible(cat)){ btn.style.display = 'none'; return; }
  const sub = readFormSubcat(cat);
  const genres = getSelectedGenres();
  const { list } = getComparisonCandidates(cat, sub, genres, editingId);
  btn.style.display = list.length >= 2 ? 'block' : 'none';
};

window.openCompareTune = function(){
  const cat = document.getElementById('formCat')?.value;
  if(!cat) return;
  const name = document.getElementById('formName').value.trim();
  if(!name){ alert('Anna ensin nimi!'); return; }
  const sub = readFormSubcat(cat);
  const genres = getSelectedGenres();
  const { list, genreFiltered } = getComparisonCandidates(cat, sub, genres, editingId);
  const candidates = list.slice().sort((a,b)=>a.finalScore-b.finalScore);
  if(candidates.length < 2){
    // Vertailu ei putoa takaisin koko kategoriaan, koska silloin
    // animaatio joutuisi perusleffaa vastaan.
    alert('Tarvitset vähintään kaksi aiempaa pisteytettyä teosta ryhmässä '
      + groupLabel(cat, sub) + ' vertailua varten.');
    return;
  }
  const poster = window._tmdbPending?.poster || (editingId ? appData.reviews.find(r=>r.id===editingId)?.poster : null) || null;

  compareState = {
    mode: 'tune',
    category: cat,
    subcat: sub,
    genreFiltered,
    candidates,
    loIdx: -1,
    hiIdx: candidates.length,
    round: 0,
    tieScore: null,
    newTitle: { name, poster, category: cat }
  };
  compareState.maxRounds = duelRounds(candidates.length);
  showNextCompareRound();
};

// Kysymysten enimmäismäärä: käyttäjän valitsema tarkkuus, rajattuna siihen
// mitä binäärihaku ylipäätään tarvitsee (log2 kandidaattien määrästä).
const PRECISION_LEVELS = [
  { id:'quick',   rounds:3, label:'Nopea',   sub:'3 kysymystä' },
  { id:'normal',  rounds:5, label:'Normaali', sub:'5 kysymystä' },
  { id:'precise', rounds:7, label:'Tarkka',  sub:'7 kysymystä' }
];

function duelRounds(candidateCount){
  const id = (appData.settings && appData.settings.precision) || 'normal';
  const lvl = PRECISION_LEVELS.find(p=>p.id===id) || PRECISION_LEVELS[1];
  // Binäärihaku tarvitsee log2(n) kysymystä; pienissä joukoissa ei ylimääräistä puskuria
  const needed = Math.ceil(Math.log2(candidateCount + 1)) + (candidateCount >= 6 ? 1 : 0);
  return Math.max(2, Math.min(lvl.rounds, needed));
}

window.renderPrecisionRow = function(){
  const el = document.getElementById('precisionRow');
  if(!el) return;
  const cur = (ensureSettings().precision) || 'normal';
  el.innerHTML = PRECISION_LEVELS.map(p=>`
    <button type="button" class="precision-btn ${p.id===cur?'active':''}" onclick="setPrecision('${p.id}')">
      ${p.label}<span class="precision-btn-sub">${p.sub}</span>
    </button>
  `).join('');
};

window.setPrecision = async function(id){
  ensureSettings().precision = id;
  window.renderPrecisionRow();
  await window.fbSave();
};

function showNextCompareRound(){
  const st = compareState;
  if(!st) return;
  if(st.mode === 'tune' || st.mode === 'replace'){
    if(st.tieScore !== null || st.round >= st.maxRounds || st.hiIdx - st.loIdx <= 1){
      finishCompareTuning();
      return;
    }
    const rangeSize = st.hiIdx - st.loIdx - 1;
    const wildcard = rangeSize > 2 && st.round > 0 && Math.random() < 0.3;
    const probeIdx = wildcard
      ? st.loIdx + 1 + Math.floor(Math.random() * rangeSize)
      : Math.floor((st.loIdx + st.hiIdx) / 2);
    st.currentProbeIdx = probeIdx;
    renderCompareDuel(st.newTitle, st.candidates[probeIdx], st.round + 1, st.maxRounds);
    return;
  }
}

function compareCardIcon(cat){ return cat === 'TV-sarjat' ? '📺' : '🎬'; }

function compareCardHtml(item, side){
  const posterHtml = item.poster
    ? `<img src="https://image.tmdb.org/t/p/w200${item.poster}" alt="">`
    : `<div class="compare-card-icon">${compareCardIcon(item.category || compareState?.category)}</div>`;
  const scoreHtml = item.finalScore != null ? `<span class="compare-card-score">${item.finalScore}p</span>` : '<span class="compare-card-score">?</span>';
  const tmdbHtml = item.tmdb_score != null ? `<span class="compare-card-score" style="opacity:0.7;">⭐ TMDB ${item.tmdb_score}/10</span>` : '';
  return `<div class="compare-card" onclick="compareChoose('${side}')">
    ${posterHtml}
    <div class="compare-card-name">${esc(nameWithYear(item))}</div>
    ${scoreHtml}
    ${tmdbHtml}
  </div>`;
}

function renderCompareDuel(left, right, roundNum, maxRounds){
  document.getElementById('compareModalTitle').textContent = '⚖️ Kumpi oli parempi?';
  const genreNote = compareState?.genreFiltered ? ' · samat genret' : ' · ei tarpeeksi samaa genreä, koko kategoria';
  document.getElementById('compareModalSub').textContent = `Kysymys ${roundNum}/${maxRounds}${genreNote}`;
  document.getElementById('compareDuelArea').innerHTML = `${compareCardHtml(left,'a')}<div class="compare-vs">VS</div>${compareCardHtml(right,'b')}`;
  document.getElementById('compareDuelArea').style.display = 'flex';
  document.getElementById('compareResultArea').style.display = 'none';
  document.getElementById('compareTieBtn').style.display = 'block';
  document.getElementById('compareSkipBtn').textContent = 'Ohita';
  document.getElementById('compareModal').classList.add('open');
}

window.compareChoose = function(side){
  const st = compareState;
  if(!st) return;
  if(st.mode === 'tune' || st.mode === 'replace'){
    const idx = st.currentProbeIdx;
    if(side === 'a') st.loIdx = idx;
    else if(side === 'b') st.hiIdx = idx;
    else if(side === 'tie') st.tieScore = st.candidates[idx].finalScore;
    st.round++;
    closeModal('compareModal');
    setTimeout(showNextCompareRound, 250);
  }
};

window.compareSkip = function(){
  closeModal('compareModal');
  compareState = null;
  window._rerankPending = null;
};

// Laskee ehdotetun pisteen ja kertoo mihin väliin se osui
function computeCompareResult(st){
  const lowerItem = st.loIdx >= 0 ? st.candidates[st.loIdx] : null;
  const upperItem = st.hiIdx < st.candidates.length ? st.candidates[st.hiIdx] : null;
  const lower = lowerItem ? lowerItem.finalScore : null;
  const upper = upperItem ? upperItem.finalScore : null;
  let suggested;
  if(st.tieScore !== null){
    suggested = st.tieScore;
  } else if(lower != null && upper != null){
    suggested = Math.round((lower + upper) / 2);
  } else if(lower != null){
    suggested = Math.min(100, lower + 5);
  } else if(upper != null){
    suggested = Math.max(0, upper - 5);
  } else {
    suggested = 50;
  }
  return { suggested, lowerItem, upperItem };
}

// Vaakajana joka näyttää mihin uusi piste asettuu naapureidensa väliin
function buildScoreLine(value, lowerItem, upperItem){
  const W = 300, PAD = 10;
  const x = v => PAD + (Math.max(0, Math.min(100, v)) / 100) * (W - 2*PAD);
  const y = 46;
  const short = s => {
    const t = String(s || '');
    return t.length > 16 ? t.slice(0, 15) + '…' : t;
  };
  const anchorFor = px => px < 55 ? 'start' : (px > W - 55 ? 'end' : 'middle');

  let marks = '';
  [[lowerItem, 'alle'], [upperItem, 'yli']].forEach(pair => {
    const it = pair[0];
    if(!it) return;
    const px = x(it.finalScore);
    marks += `<line x1="${px}" y1="${y-6}" x2="${px}" y2="${y+6}" stroke="var(--muted)" stroke-width="1.5"/>
      <text x="${px}" y="${y+20}" font-size="9.5" fill="var(--muted)" text-anchor="${anchorFor(px)}">${esc(short(plainName(it)))} ${it.finalScore}</text>`;
  });

  const vx = x(value);
  return `<svg class="score-line" viewBox="0 0 ${W} 66" xmlns="http://www.w3.org/2000/svg">
    <rect x="${PAD}" y="${y-3}" width="${(W-2*PAD)*0.4}" height="6" rx="3" fill="#ff6b6b" opacity="0.28"/>
    <rect x="${PAD+(W-2*PAD)*0.4}" y="${y-3}" width="${(W-2*PAD)*0.3}" height="6" rx="0" fill="#e8b84b" opacity="0.28"/>
    <rect x="${PAD+(W-2*PAD)*0.7}" y="${y-3}" width="${(W-2*PAD)*0.3}" height="6" rx="3" fill="#4ade80" opacity="0.28"/>
    ${marks}
    <line x1="${vx}" y1="${y-16}" x2="${vx}" y2="${y+8}" stroke="var(--accent)" stroke-width="2"/>
    <circle cx="${vx}" cy="${y}" r="5" fill="var(--accent)"/>
    <text x="${vx}" y="${y-21}" font-size="18" font-family="'Bebas Neue',sans-serif" fill="var(--accent)" text-anchor="${anchorFor(vx)}">${value}</text>
  </svg>`;
}

function finishCompareTuning(){
  const st = compareState;
  if(!st) return;
  const res = computeCompareResult(st);
  const suggested = res.suggested;
  if(st.mode === 'replace'){
    finishCompareReplace(st, res);
    return;
  }
  compareState = null;
  window._compareSuggestedScore = suggested;
  applyCombinedSuggestedScore();

  const finalVal = document.getElementById('scoreInput')?.value ?? suggested;
  const hasRatings = window._ratingsSuggestedScore != null;

  document.getElementById('compareModalTitle').textContent = '⚖️ Ehdotettu piste';
  document.getElementById('compareModalSub').textContent = hasRatings
    ? 'Yhdistetty vertailun ja osa-arvioiden perusteella — voit vielä muokata.'
    : 'Piste täytettiin lomakkeeseen — voit vielä muokata sitä.';
  document.getElementById('compareDuelArea').style.display = 'none';
  const resultArea = document.getElementById('compareResultArea');
  resultArea.style.display = 'block';
  resultArea.innerHTML = `<div class="compare-result-box">
    <div class="compare-result-score">${finalVal}</div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px;">${hasRatings ? 'yhdistetty piste (vertailu + osa-arviot)' : 'pistettä ehdotettu vertailun perusteella'}</div>
    ${buildScoreLine(Number(finalVal), res.lowerItem, res.upperItem)}
  </div>`;
  document.getElementById('compareTieBtn').style.display = 'none';
  document.getElementById('compareSkipBtn').textContent = 'Sulje';
  document.getElementById('compareModal').classList.add('open');
}

// ── SIJOITA LISTALLE: vanhan arvostelun pisteen tarkistus ──
window.openRerank = function(id){
  const r = appData.reviews.find(x => x.id === id);
  if(!r) return;
  const own = (!r.tvType || r.tvType === 'kokonaisuus') ? r.score : null;
  if(own == null){ alert('Tämä toimii vain arvosteluille joilla on oma piste.'); return; }
  const genres = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
  const rSub = subcatOf(r);
  const { list, genreFiltered } = getComparisonCandidates(r.category, rSub, genres, r.id);
  if(list.length < 2){
    alert('Tarvitset vähintään kaksi muuta pisteytettyä teosta ryhmässä '
      + groupLabel(r.category, rSub) + ' vertailua varten.');
    return;
  }
  const candidates = list.slice().sort((a,b)=>a.finalScore-b.finalScore);

  closeModal('readModal');
  compareState = {
    mode: 'replace',
    reviewId: id,
    oldScore: own,
    category: r.category,
    subcat: rSub,
    genreFiltered,
    candidates,
    loIdx: -1,
    hiIdx: candidates.length,
    round: 0,
    tieScore: null,
    newTitle: { name: plainName(r), year: r.year, poster: r.poster || null, category: r.category }
  };
  compareState.maxRounds = duelRounds(candidates.length);
  setTimeout(showNextCompareRound, 250);
};

function finishCompareReplace(st, res){
  const id = st.reviewId;
  const oldScore = st.oldScore;
  const suggested = res.suggested;
  compareState = null;
  window._rerankPending = { id, oldScore, suggested };

  const diff = suggested - oldScore;
  const diffText = diff === 0 ? 'Piste pysyi samana.'
    : diff > 0 ? `Nousee ${diff} pistettä.`
    : `Laskee ${Math.abs(diff)} pistettä.`;

  document.getElementById('compareModalTitle').textContent = '⚖️ Uusi sijoitus';
  document.getElementById('compareModalSub').textContent = diffText;
  document.getElementById('compareDuelArea').style.display = 'none';
  const resultArea = document.getElementById('compareResultArea');
  resultArea.style.display = 'block';
  resultArea.innerHTML = `<div class="compare-result-box" style="background:var(--acc-10);border-color:var(--acc-30);">
    <div class="compare-change">
      <span class="compare-change-old">${oldScore}</span>
      <span class="compare-change-arrow">→</span>
      <span class="compare-change-new ${scoreClass(suggested)}">${suggested}</span>
    </div>
    ${buildScoreLine(suggested, res.lowerItem, res.upperItem)}
  </div>
  <button type="button" class="btn-primary" style="width:100%;margin-top:14px;padding:14px;border-radius:12px;" onclick="applyRerank()">Tallenna uusi piste</button>`;
  document.getElementById('compareTieBtn').style.display = 'none';
  document.getElementById('compareSkipBtn').textContent = 'Pidä vanha';
  document.getElementById('compareModal').classList.add('open');
}

window.applyRerank = async function(){
  const p = window._rerankPending;
  window._rerankPending = null;
  if(!p) return;
  const r = appData.reviews.find(x => x.id === p.id);
  if(r){
    if(!Array.isArray(r.scoreHistory)) r.scoreHistory = [];
    r.scoreHistory.push({ score: p.oldScore, date: new Date().toISOString() });
    r.score = p.suggested;
  }
  closeModal('compareModal');
  await window.fbSave();
  renderCards();
};

// ── LAAJENNETTU ARVIOINTI (osa-arviot) ──
const RATING_LEVELS = [
  {v:1,label:'Surkea'},
  {v:2,label:'Heikko'},
  {v:3,label:'Kohtalainen'},
  {v:4,label:'Hyvä'},
  {v:5,label:'Erittäin hyvä'},
  {v:6,label:'Erinomainen'}
];

const RATING_GROUPS = [
  {id:'tech', label:'🎬 Tekninen toteutus'},
  {id:'story', label:'📖 Tarina & maailma'},
  {id:'cast', label:'🎭 Näyttelijät & tunne'}
];

const DIMENSION_DEFS = [
  {id:'kuvaus', label:'🎥 Kuvaus', group:'tech'},
  {id:'valaistus', label:'💡 Valaistus', group:'tech'},
  {id:'aanet', label:'🔊 Äänet', group:'tech'},
  {id:'musiikki', label:'🎵 Musiikki', group:'tech'},
  {id:'leikkaus', label:'✂️ Leikkaus/tempo', group:'tech'},
  {id:'puvustus', label:'👗 Puvustus/lavastus', group:'tech'},
  {id:'tarina', label:'📖 Tarina', group:'story'},
  {id:'loppuratkaisu', label:'🏁 Loppuratkaisu', group:'story'},
  {id:'kerronta', label:'🎬 Kerronta', group:'story'},
  {id:'hahmokehitys', label:'🌱 Hahmokehitys', group:'story'},
  {id:'dialogi', label:'💬 Dialogi', group:'story'},
  {id:'omaperaisyys', label:'✨ Omaperäisyys', group:'story'},
  {id:'maailmanrakennus', label:'🌍 Maailmanrakennus', group:'story'},
  {id:'genrelupaus', label:'🎯 Genrelupaus', group:'story', dynamic:true},
  {id:'nayttelijat', label:'🎭 Näyttelijät', group:'cast'},
  {id:'tunnevaikutus', label:'❤️ Tunnevaikutus', group:'cast'}
];

function genreLupausLabel(){
  const genres = getSelectedGenres();
  return genres.length ? `🎯 Onnistuiko genressään (${genres.join(', ')})?` : '🎯 Onnistuiko genressään?';
}

// Ryhmäkohtaiset painot: tarina voi vaikuttaa enemmän kuin puvustus
function groupWeight(groupId){
  const w = (appData.settings && appData.settings.weights) || {};
  const v = w[groupId];
  if(typeof v !== 'number' || !isFinite(v)) return 1;
  return Math.max(0.5, Math.min(2, v));   // vioittunut arvo rajataan, ei ohiteta
}

function computeRatingsScore(stateObj){
  let sum = 0, wsum = 0;
  DIMENSION_DEFS.forEach(d=>{
    const v = stateObj[d.id];
    if(v == null) return;
    const w = groupWeight(d.group);
    sum += v * w;
    wsum += w;
  });
  if(!wsum) return null;
  const avg = sum / wsum;
  const maxLevel = RATING_LEVELS[RATING_LEVELS.length-1].v;
  return Math.round((avg-1)/(maxLevel-1)*100);
}

window.renderWeightRows = function(){
  const el = document.getElementById('weightRows');
  if(!el) return;
  ensureSettings();
  el.innerHTML = RATING_GROUPS.map(g=>{
    const v = groupWeight(g.id);
    return `<div class="weight-row">
      <span class="weight-label">${g.label}</span>
      <input type="range" class="weight-slider" min="0.5" max="2" step="0.1" value="${v}"
        oninput="setGroupWeight('${g.id}', this.value, true)"
        onchange="setGroupWeight('${g.id}', this.value, false)">
      <span class="weight-val" id="weightVal-${g.id}">${v.toFixed(1).replace('.', ',')}</span>
    </div>`;
  }).join('');
};

window.setGroupWeight = async function(groupId, value, liveOnly){
  const v = Math.max(0.5, Math.min(2, parseFloat(value) || 1));
  const s = ensureSettings();
  if(!s.weights) s.weights = {};
  s.weights[groupId] = Math.round(v*10)/10;
  const lbl = document.getElementById('weightVal-'+groupId);
  if(lbl) lbl.textContent = s.weights[groupId].toFixed(1).replace('.', ',');
  if(liveOnly) return;          // sormi vielä säätimellä — ei tallenneta joka pikselillä
  await window.fbSave();
};

let ratingsGroupOpenState = {};

function renderRatingsGrid(containerId, stateObj, onChangeFnName){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = RATING_GROUPS.map((g, gi)=>{
    const key = containerId+'|'+g.id;
    if(!(key in ratingsGroupOpenState)) ratingsGroupOpenState[key] = (gi===0);
    const isOpen = ratingsGroupOpenState[key];
    const dims = DIMENSION_DEFS.filter(d=>d.group===g.id);
    const answered = dims.filter(d=>stateObj[d.id]!=null).length;
    const rowsHtml = dims.map(d=>{
      const label = d.dynamic ? genreLupausLabel() : d.label;
      return `<div class="rating-dim-row">
        <div class="rating-dim-label">${label}</div>
        <div class="rating-dim-opts">
          ${RATING_LEVELS.map(l=>`<button type="button" class="rating-opt${stateObj[d.id]===l.v?' active':''}" onclick="${onChangeFnName}('${d.id}',${l.v})">${l.label}</button>`).join('')}
        </div>
      </div>`;
    }).join('');
    return `<div class="rating-group">
      <button type="button" class="rating-group-header" onclick="toggleRatingGroup('${containerId}','${g.id}','${onChangeFnName}')">
        <span>${g.label}</span>
        <span class="rating-group-count">${answered}/${dims.length} ${isOpen?'▲':'▼'}</span>
      </button>
      <div class="rating-group-body" style="display:${isOpen?'block':'none'};">${rowsHtml}</div>
    </div>`;
  }).join('');
}

window.toggleRatingGroup = function(containerId, groupId, onChangeFnName){
  const key = containerId+'|'+groupId;
  ratingsGroupOpenState[key] = !ratingsGroupOpenState[key];
  const stateObj = containerId==='mainRatingsGrid' ? selectedRatings : selectedPartRatings;
  renderRatingsGrid(containerId, stateObj, onChangeFnName);
};

function ratingsEligible(cat){
  return cat === 'Elokuvat' || (cat === 'TV-sarjat' && selectedTvType === 'kokonaisuus');
}

window.updateRatingsGridVisibility = function(){
  const section = document.getElementById('mainRatingsSection');
  if(!section) return;
  const cat = document.getElementById('formCat')?.value;
  if(ratingsEligible(cat)){
    section.style.display = 'block';
    renderRatingsGrid('mainRatingsGrid', selectedRatings, 'onMainRatingChange');
  } else {
    section.style.display = 'none';
  }
};

let selectedRatings = {};
window._ratingsSuggestedScore = null;
window._compareSuggestedScore = null;

window.onMainRatingChange = function(dim, val){
  if(selectedRatings[dim] === val) delete selectedRatings[dim];
  else selectedRatings[dim] = val;
  renderRatingsGrid('mainRatingsGrid', selectedRatings, 'onMainRatingChange');
  window._ratingsSuggestedScore = computeRatingsScore(selectedRatings);
  applyCombinedSuggestedScore();
};

function applyCombinedSuggestedScore(){
  const a = window._ratingsSuggestedScore;
  const b = window._compareSuggestedScore;
  let combined = null;
  if(a!=null && b!=null) combined = Math.round((a+b)/2);
  else if(a!=null) combined = a;
  else if(b!=null) combined = b;
  if(combined == null) return;
  const inp = document.getElementById('scoreInput');
  if(inp){ inp.value = combined; selectedScore = combined; window.updateScorePreview(); }
}

let selectedPartRatings = {};
let partRatingsEnabled = false;

window.togglePartRatings = function(){
  partRatingsEnabled = !partRatingsEnabled;
  document.getElementById('partRatingsSection').style.display = partRatingsEnabled ? 'block' : 'none';
  document.getElementById('partRatingsToggleBtn').textContent = partRatingsEnabled ? '📊 Piilota laaja arviointi' : '📊 Arvostele laajasti (valinnainen)';
  if(partRatingsEnabled) renderRatingsGrid('partRatingsGrid', selectedPartRatings, 'onPartRatingChange');
};

window.onPartRatingChange = function(dim, val){
  if(selectedPartRatings[dim] === val) delete selectedPartRatings[dim];
  else selectedPartRatings[dim] = val;
  renderRatingsGrid('partRatingsGrid', selectedPartRatings, 'onPartRatingChange');
  const score = computeRatingsScore(selectedPartRatings);
  if(score != null){
    const inp = document.getElementById('partScoreInput');
    if(inp){ inp.value = score; selectedPartScore = score; }
  }
};

window.toggleMark = function(mark){
  selectedMark = mark;
  const hBtn = document.getElementById('markHeart');
  const sBtn = document.getElementById('markSkull');
  const nBtn = document.getElementById('markNone');
  if(hBtn) hBtn.className = 'mark-btn' + (mark==='heart'?' active-heart':'');
  if(sBtn) sBtn.className = 'mark-btn' + (mark==='skull'?' active-skull':'');
  if(nBtn){ nBtn.className = 'mark-btn'; nBtn.style.opacity = mark===null?'1':'0.5'; }
};

// Lomakkeen alalaji. Jos kategorialla ei ole alalajeja, arvo on aina tyhjä.
function readFormSubcat(cat){
  if(!subcatsFor(cat).length) return '';
  const el = document.getElementById('formSubcat');
  return el ? String(el.value || '') : '';
}

window.saveReview = async function(){
  let name = document.getElementById('formName').value.trim();
  const yearEl = document.getElementById('formYear');
  let yearRaw = yearEl ? String(yearEl.value).trim() : '';
  // Jos nimeen on liimattu vuosi rivinvaihdolla (vanha tapa), siirrä se vuosikenttään
  if(name.indexOf('\n') > -1){
    const parts = name.split('\n').map(x=>x.trim()).filter(Boolean);
    const last = parts[parts.length-1];
    if(parts.length >= 2 && /^(18|19|20)\d{2}$/.test(last)){
      if(!yearRaw) yearRaw = last;
      name = parts.slice(0,-1).join(' ').trim();
    } else {
      name = parts.join(' ').trim();
    }
  }
  const year = /^\d{4}$/.test(yearRaw) ? parseInt(yearRaw,10) : null;
  if(!name){ alert('Anna nimi!'); return; }
  const cat = document.getElementById('formCat').value;

  const isTv = cat==='TV-sarjat';
  const needsScore = !isTv || selectedTvType==='kokonaisuus';
  if(needsScore){ const inp=document.getElementById('scoreInput'); selectedScore=inp&&inp.value!==''?+inp.value:null; }
  if(needsScore && selectedScore===null){ alert('Anna arvosana (0–100)!'); return; }

  // Varoita jos sama teos on jo arvosteltu (vain uusia lisättäessä)
  if(!editingId){
    const dup = findDuplicateReview(name, year, cat, window._tmdbPending?.tmdb_id, null);
    if(dup){
      const choice = await askDuplicate(dup);
      if(choice !== 'new'){
        if(choice === 'edit'){
          closeModal('addModal');
          setTimeout(()=>window.editReview(dup.id), 300);
        }
        return;
      }
    }
  }

  if(editingId){
    const r = appData.reviews.find(x=>x.id===editingId);
    if(r){
      r.name=name; r.year=year; r.category=cat;
      r.subcat = readFormSubcat(cat);
      r.genre=GENRE_CATS.includes(cat)?getSelectedGenres():[];
      r.tvType=isTv?selectedTvType:'';
      r.score=needsScore?selectedScore:null;
      r.mark=selectedMark;
      r.date=(document.getElementById('formDate').value || new Date().toISOString().split('T')[0]) + 'T00:00:00.000Z';
      r.note=document.getElementById('formNote').value;
      r.plot = window._tmdbPending?.plot || r.plot || null;
      r.ratings = Object.keys(selectedRatings).length ? {...selectedRatings} : (r.ratings || null);
      // Säilytä TMDB-tiedot jos niitä ei päivitetä
    }
  } else {
    const newReview = {
      id: Date.now(),
      date: (document.getElementById('formDate').value || new Date().toISOString().split('T')[0]) + 'T00:00:00.000Z',
      name, year, category:cat,
      subcat: readFormSubcat(cat),
      genre: GENRE_CATS.includes(cat)?getSelectedGenres():[],
      tvType: isTv?selectedTvType:'',
      score: needsScore?selectedScore:null,
      parts: [],
      mark: selectedMark,
      note: document.getElementById('formNote').value,
      // TMDB-tiedot
      poster: window._tmdbPending?.poster || null,
      director: window._tmdbPending?.director || null,
      runtime: window._tmdbPending?.runtime || null,
      episodes_total: window._tmdbPending?.episodes_total || null,
      country: window._tmdbPending?.country || null,
      cast: window._tmdbPending?.cast || null,
      tmdb_score: window._tmdbPending?.tmdb_score || null,
      tmdb_id: window._tmdbPending?.tmdb_id || null,
      plot: window._tmdbPending?.plot || null,
      ratings: Object.keys(selectedRatings).length ? {...selectedRatings} : null,
    };
    // Jos TV-sarja jaksoittain ja TMDB-kaudet haettu, lisää ne
    if(isTv && selectedTvType==='jaksot' && window._tmdbPending?.seasons) {
      newReview.seasons = window._tmdbPending.seasons;
    }
    appData.reviews.push(newReview);
    window._tmdbPending = null;
  }
  closeModal('addModal');
  await window.fbSave();
  renderCards();
  if(selectedScore===100) setTimeout(launchConfetti, 300);
};

// ── TMDB PÄIVITYS OLEMASSA OLEVAAN ARVOSTELUUN ──
window.updateTmdbData = async function(id) {
  const r = appData.reviews.find(x => x.id === id);
  if (!r) return;
  const token = window.tmdbToken;
  if (!token) { alert('TMDB-token ei ole vielä ladattu. Yritä hetken kuluttua uudelleen.'); return; }

  const isTv = r.category === 'TV-sarjat';
  const isJaksot = r.tvType === 'jaksot';

  // Hae ensin nimi hakusanana (ensimmäinen rivi)
  const searchName = plainName(r);
  const overlay = document.getElementById('tmdbLoadingOverlay');
  const subEl = document.getElementById('tmdbLoadingSub');
  const progBar = document.getElementById('tmdbProgressBar');
  overlay.classList.add('open');
  subEl.textContent = `Haetaan: ${searchName}`;
  progBar.style.width = '5%';

  try {
    const lang = 'fi-FI';
    const searchType = isTv ? 'tv' : 'movie';
    const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?query=${encodeURIComponent(searchName)}&language=${lang}&page=1`;
    const searchRes = await window.tmdbFetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
    const searchData = await searchRes.json();
    const results = searchData.results || [];
    if (!results.length) {
      overlay.classList.remove('open');
      alert(`Ei tuloksia haulle: "${searchName}". Kokeile muokata nimeä.`);
      return;
    }
    progBar.style.width = '20%';

    // Jos useita tuloksia, kysy käyttäjältä
    let chosen = results[0];
    if (results.length > 1) {
      overlay.classList.remove('open');
      const opts = results.slice(0, 5).map((item, i) => {
        const year = (item.release_date || item.first_air_date || '').slice(0, 4);
        return `${i + 1}. ${item.title || item.name}${year ? ' (' + year + ')' : ''}`;
      }).join('\n');
      const pick = prompt(`Löytyi useita tuloksia. Valitse numero (1-${Math.min(results.length,5)}):\n\n${opts}`);
      const idx = parseInt(pick) - 1;
      if (isNaN(idx) || idx < 0 || idx >= results.length) return;
      chosen = results[idx];
      overlay.classList.add('open');
      progBar.style.width = '25%';
    }

    const tmdbId = chosen.id;
    subEl.textContent = 'Haetaan tiedot...';
    const detailUrl = `https://api.themoviedb.org/3/${searchType}/${tmdbId}?language=${lang}&append_to_response=credits`;
    const detailRes = await window.tmdbFetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } });
    const detail = await detailRes.json();
    progBar.style.width = '40%';

    // Päivitä perustiedot — EI korvaa pisteitä tai muistiinpanoja
    const relYear = (detail.release_date || detail.first_air_date || '').slice(0,4);
    if(!r.year && /^(18|19|20)\d{2}$/.test(relYear)) r.year = parseInt(relYear,10);
    r.poster = detail.poster_path || r.poster || null;
    r.tmdb_score = detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : r.tmdb_score;
    r.tmdb_id = tmdbId;
    r.country = (detail.production_countries?.[0]?.iso_3166_1 || detail.origin_country?.[0] || r.country || null);
    r.plot = detail.overview || r.plot || null;

    // Yhteinen kenttäpoiminta: tuotantotila, henkilö-ID:t, seuraava jakso
    const tf = extractTmdbFields(detail, isTv);
    r.tmdb_type = tf.tmdb_type;
    if(tf.cast.length){ r.cast = tf.cast; r.cast_ids = tf.cast_ids; }
    if(tf.director){ r.director = tf.director; r.director_id = tf.director_id; }
    if(tf.genre_ids && tf.genre_ids.length) r.genre_ids = tf.genre_ids;
    if(tf.backdrop) r.backdrop = tf.backdrop;
    if (!isTv) {
      r.runtime = tf.runtime || r.runtime;
      if(tf.collection) r.collection = tf.collection;
    } else {
      r.tv_status     = tf.tv_status || r.tv_status || null;
      r.tv_in_prod    = tf.tv_in_prod;
      r.seasons_total = tf.seasons_total || r.seasons_total || null;
      r.last_air_date = tf.last_air_date || r.last_air_date || null;
      r.next_air      = tf.next_air;
      r.last_air      = tf.last_air || r.last_air || null;
      r.tmdb_checked  = new Date().toISOString().slice(0,10);
      r.episodes_total = detail.number_of_episodes || r.episodes_total;
    }

    progBar.style.width = '55%';

    // TV-sarja jaksoittain: päivitä nimet ja juonet, säilytä pisteet.
    // Yhdistäminen tehdään jaksonumeron perusteella (ks. mergeSeasonInto),
    // joten puuttuva jakso ei enää siirrä muiden nimiä väärille riveille.
    if (isTv && isJaksot) {
      const numSeasons = detail.number_of_seasons || 0;
      r.seasons = r.seasons || [];
      const existingSeasons = r.seasons;
      let added = 0, renamed = 0, plots = 0;

      for (let s = 1; s <= numSeasons; s++) {
        progBar.style.width = (55 + (s / numSeasons) * 40) + '%';
        subEl.textContent = `Päivitetään kausi ${s}/${numSeasons}...`;
        const fresh = await fetchSeasonFromTmdb(tmdbId, s);
        if (!fresh) continue;

        // Etsi vastaava kausi numerolla, nimellä tai sijainnilla
        const target = findSeasonByNumber(r, s);
        if (target) {
          const st = mergeSeasonInto(target, fresh);
          added += st.added; renamed += st.renamed; plots += st.plots;
        } else {
          existingSeasons.push(seasonFromFresh(fresh));
          added += fresh.episodes.length;
          plots += fresh.episodes.filter(e => e.plot).length;
        }
      }
      r.seasons = existingSeasons;
      window._tmdbUpdateSummary = { added, renamed, plots };
    }

    progBar.style.width = '100%';
    const sum = window._tmdbUpdateSummary;
    window._tmdbUpdateSummary = null;
    if(sum){
      const bits = [];
      if(sum.added) bits.push(`${sum.added} uutta jaksoa`);
      if(sum.renamed) bits.push(`${sum.renamed} nimeä`);
      if(sum.plots) bits.push(`${sum.plots} juonta`);
      subEl.textContent = bits.length
        ? `✅ ${bits.join(', ')}`
        : '✅ Kaikki oli jo ajan tasalla';
    } else {
      subEl.textContent = '✅ Tiedot päivitetty!';
    }
    await window.fbSave();
    renderCards();
    setTimeout(() => overlay.classList.remove('open'), sum ? 1800 : 1000);

  } catch(e) {
    overlay.classList.remove('open');
    alert('Virhe TMDB-haussa. Tarkista internetyhteys.');
    console.error(e);
  }
};

window.deleteReview = async function(id){
  if(!confirm('Poistetaanko arvostelu?')) return;
  appData.reviews = appData.reviews.filter(r=>r.id!==id);
  await window.fbSave();
  renderCards();
};

// ── TV OSAT ──
let editingSeasonIdx = null;

// Kausi-modal
window.openAddSeason = function(reviewId){
  editingPartReviewId = reviewId;
  const r = appData.reviews.find(x=>x.id===reviewId); if(!r) return;
  const nextNum = (r.seasons||[]).length + 1;
  document.getElementById('seasonModalTitle').textContent = 'Lisää kausi';
  document.getElementById('seasonName').value = `Kausi ${nextNum}`;
  document.getElementById('seasonModal').classList.add('open');
};

window.saveSeason = async function(){
  const name = document.getElementById('seasonName').value.trim();
  if(!name){ alert('Anna kauden nimi!'); return; }
  const r = appData.reviews.find(x=>x.id===editingPartReviewId); if(!r) return;
  if(!r.seasons) r.seasons=[];
  r.seasons.push({ name, episodes:[] });
  closeModal('seasonModal');
  await window.fbSave();
  renderCards();
};

window.deleteSeason = async function(reviewId, si){
  if(!confirm('Poistetaanko kausi ja kaikki sen jaksot?')) return;
  const r = appData.reviews.find(x=>x.id===reviewId); if(!r) return;
  r.seasons.splice(si,1);
  await window.fbSave();
  renderCards();
};

window.toggleSeason = function(key){
  const el = document.getElementById(key);
  const arr = document.getElementById('arr-'+key);
  if(!el) return;
  const open = el.style.display==='none';
  el.style.display = open?'block':'none';
  if(arr) arr.classList.toggle('open', open);
};

// Jakso-modal (jaksottain-moodissa)
window.openAddPart = function(reviewId, seasonIdx){
  editingPartId = null;
  editingPartReviewId = reviewId;
  editingSeasonIdx = seasonIdx!=null ? seasonIdx : null;
  selectedPartScore = null;
  selectedPartRatings = {};
  partRatingsEnabled = false;
  document.getElementById('partRatingsSection').style.display = 'none';
  document.getElementById('partRatingsToggleBtn').textContent = '📊 Arvostele laajasti (valinnainen)';
  const r = appData.reviews.find(x=>x.id===reviewId);
  const isJaksot = r&&r.tvType==='jaksot';
  document.getElementById('partModalTitle').textContent = isJaksot?'Lisää jakso':'Lisää kausi';
  document.getElementById('partNameLabel').textContent = isJaksot?'Jakson nimi':'Kauden nimi';
  document.getElementById('partSeasonSelectRow').style.display = isJaksot?'block':'none';
  document.getElementById('partEpisodeRow').style.display = isJaksot?'block':'none';
  if(isJaksot){
    const seasons = r.seasons||[];
    const sel = document.getElementById('partSeasonSelect');
    sel.innerHTML = seasons.map((s,i)=>`<option value="${i}" ${i===seasonIdx?'selected':''}>${esc(s.name)}</option>`).join('');
    if(seasonIdx!=null) sel.value = seasonIdx;
    // Auto-täytä seuraava jaksonumero
    const pe = document.getElementById('partEpisode');
    if(pe){
      if(seasonIdx!=null){
        const eps = (seasons[seasonIdx]&&seasons[seasonIdx].episodes)||[];
        const maxEp = eps.reduce((max,e)=>Math.max(max, e.episode||0), 0);
        pe.value = maxEp + 1;
      } else {
        const allEps = seasons.flatMap(s=>s.episodes||[]);
        const maxEp = allEps.reduce((max,e)=>Math.max(max, e.episode||0), 0);
        pe.value = maxEp > 0 ? maxEp + 1 : 1;
      }
    }
  }
  document.getElementById('partName').value='';
  document.getElementById('partNote').value='';
  window.renderPartPlot(null);
  selectedPartScore=null;
  const psi=document.getElementById('partScoreInput'); if(psi) psi.value='';
  buildScorePicker('partScorePicker','partScore');
  // Auto-täytä jakson nimi TMDB-datasta
  if(isJaksot) autoFillEpisodeName(true);
  document.getElementById('partModal').classList.add('open');
};

// Auto-täytä jakson nimi TMDB-datasta jaksonumeron tai kauden vaihtuessa.
// Samalla haetaan jakson juoni näkyviin, jotta arvostelua kirjoittaessa
// muistaa mistä jaksossa oli kyse.
window.autoFillEpisodeName = function(initial) {
  const r = appData.reviews.find(x => x.id === editingPartReviewId);
  const epEl = document.getElementById('partEpisode');
  const siEl = document.getElementById('partSeasonSelect');
  if (!r || !r.seasons || !epEl || !siEl) { window.renderPartPlot(null); return; }

  const epNum = +epEl.value;
  const si = +siEl.value;
  const season = (!epNum || isNaN(si)) ? null : r.seasons[si];
  const ep = season ? (season.episodes || []).find(e => e.episode === epNum) : null;
  if (!ep) { window.renderPartPlot(null); return; }

  // Täytä nimi vain jos kenttä on tyhjä — käyttäjän omaa tekstiä ei korvata
  const nameEl = document.getElementById('partName');
  if (nameEl && ep.name && (initial || !nameEl.value)) {
    nameEl.value = ep.name;
    nameEl.style.borderColor = 'var(--accent)';
    setTimeout(() => { if(nameEl) nameEl.style.borderColor = 'var(--border)'; }, 1200);
  }
  // Juoni EI mene muistiinpanokenttään — se on TMDB:n tekstiä, ei sinun.
  // Se näytetään omassa laatikossaan, josta sen voi halutessaan kopioida.
  window.renderPartPlot(ep);
};

// Jakson juoni luettavaksi arvostelua kirjoittaessa.
window.renderPartPlot = function(ep){
  const box = document.getElementById('partPlotBox');
  if(!box) return;
  if(!ep || !ep.plot){
    box.style.display = 'none';
    box.innerHTML = '';
    window._currentPartPlot = null;
    return;
  }
  const mark = ep.plotLang === 'en'
    ? '<span class="plot-lang">EN</span>'
    : (ep.plotLang === 'fi-auto' ? '<span class="plot-lang auto">konekäännös</span>' : '');
  box.style.display = 'block';
  box.innerHTML = `
    <div class="part-plot-head"><span>📖 Jakson juoni</span>${mark}</div>
    <div class="part-plot-text">${escNl(ep.plot)}</div>
    <button type="button" class="part-plot-copy" onclick="copyPlotToNote()">⬇️ Kopioi muistiinpanoon</button>
  `;
  window._currentPartPlot = ep.plot;
};

window.copyPlotToNote = function(){
  const noteEl = document.getElementById('partNote');
  if(!noteEl || !window._currentPartPlot) return;
  noteEl.value = noteEl.value
    ? noteEl.value.replace(/\s*$/, '') + '\n\n' + window._currentPartPlot
    : window._currentPartPlot;
  noteEl.focus();
};

window.editEpisode = function(reviewId, si, ei){
  const r = appData.reviews.find(x=>x.id===reviewId); if(!r) return;
  const ep = (r.seasons[si].episodes||[])[ei];
  editingPartReviewId = reviewId;
  editingSeasonIdx = si;
  editingPartId = ei;
  selectedPartScore = ep.score!=null ? ep.score : null;
  selectedPartRatings = ep.ratings ? {...ep.ratings} : {};
  partRatingsEnabled = !!ep.ratings;
  document.getElementById('partRatingsSection').style.display = partRatingsEnabled ? 'block' : 'none';
  document.getElementById('partRatingsToggleBtn').textContent = partRatingsEnabled ? '📊 Piilota laaja arviointi' : '📊 Arvostele laajasti (valinnainen)';
  if(partRatingsEnabled) renderRatingsGrid('partRatingsGrid', selectedPartRatings, 'onPartRatingChange');
  document.getElementById('partModalTitle').textContent = 'Muokkaa jaksoa';
  document.getElementById('partNameLabel').textContent = 'Jakson nimi';
  document.getElementById('partSeasonSelectRow').style.display = 'block';
  document.getElementById('partEpisodeRow').style.display = 'block';
  const seasons = r.seasons||[];
  const sel = document.getElementById('partSeasonSelect');
  sel.innerHTML = seasons.map((s,i)=>`<option value="${i}" ${i===si?'selected':''}>${esc(s.name)}</option>`).join('');
  document.getElementById('partName').value = ep.name||'';
  document.getElementById('partNote').value = ep.note||'';
  window.renderPartPlot(ep);
  const pe=document.getElementById('partEpisode'); if(pe) pe.value=ep.episode||'';
  const psi=document.getElementById('partScoreInput'); if(psi) psi.value=selectedPartScore!==null?selectedPartScore:'';
  buildScorePicker('partScorePicker','partScore');
  document.getElementById('partModal').classList.add('open');
};

window.deleteEpisode = async function(reviewId, si, ei){
  if(!confirm('Poistetaanko jakso?')) return;
  const r = appData.reviews.find(x=>x.id===reviewId); if(!r) return;
  r.seasons[si].episodes.splice(ei,1);
  await window.fbSave();
  renderCards();
};

// Kausittain editPart (ei muutosta)
window.editPart = function(reviewId, partIdx){
  const r = appData.reviews.find(x=>x.id===reviewId); if(!r) return;
  const p = r.parts[partIdx];
  editingPartReviewId = reviewId;
  editingPartId = partIdx;
  editingSeasonIdx = null;
  selectedPartScore = p.score!=null ? p.score : null;
  selectedPartRatings = p.ratings ? {...p.ratings} : {};
  partRatingsEnabled = !!p.ratings;
  document.getElementById('partRatingsSection').style.display = partRatingsEnabled ? 'block' : 'none';
  document.getElementById('partRatingsToggleBtn').textContent = partRatingsEnabled ? '📊 Piilota laaja arviointi' : '📊 Arvostele laajasti (valinnainen)';
  if(partRatingsEnabled) renderRatingsGrid('partRatingsGrid', selectedPartRatings, 'onPartRatingChange');
  const editPsi=document.getElementById('partScoreInput'); if(editPsi) editPsi.value=selectedPartScore!==null?selectedPartScore:'';
  document.getElementById('partModalTitle').textContent = 'Muokkaa kautta';
  document.getElementById('partNameLabel').textContent = 'Kauden nimi';
  document.getElementById('partSeasonSelectRow').style.display = 'none';
  document.getElementById('partEpisodeRow').style.display = 'none';
  document.getElementById('partName').value = p.name||'';
  document.getElementById('partNote').value = p.note||'';
  window.renderPartPlot(null);
  buildScorePicker('partScorePicker','partScore');
  document.getElementById('partModal').classList.add('open');
};

window.savePart = async function(){
  const r = appData.reviews.find(x=>x.id===editingPartReviewId); if(!r) return;
  const isJaksot = r.tvType==='jaksot';
  const partInp=document.getElementById('partScoreInput'); selectedPartScore=partInp&&partInp.value!==''?+partInp.value:null;
  if(selectedPartScore===null){ alert('Anna arvosana (0–100)!'); return; }

  if(isJaksot){
    const si = editingPartId!==null ? editingSeasonIdx : +document.getElementById('partSeasonSelect').value;
    if(!r.seasons||!r.seasons[si]){ alert('Valitse kausi!'); return; }
    const epData = {
      name: document.getElementById('partName').value.trim(),
      episode: document.getElementById('partEpisode').value ? +document.getElementById('partEpisode').value : null,
      score: selectedPartScore,
      note: document.getElementById('partNote').value,
      ratings: partRatingsEnabled && Object.keys(selectedPartRatings).length ? {...selectedPartRatings} : null
    };
    if(!r.seasons[si].episodes) r.seasons[si].episodes=[];
    // TÄRKEÄÄ: yhdistä olemassa olevaan olioon äläkä korvaa sitä. Muuten
    // TMDB:stä haetut kentät (juoni, ensiesityspäivä, kielitiedot) katoaisivat
    // heti kun jakso arvostellaan.
    if(editingPartId!==null) {
      Object.assign(r.seasons[si].episodes[editingPartId] || {}, epData);
    } else {
      const existIdx = epData.episode != null
        ? r.seasons[si].episodes.findIndex(e => e.episode === epData.episode)
        : -1;
      if(existIdx >= 0) Object.assign(r.seasons[si].episodes[existIdx], epData);
      else r.seasons[si].episodes.push(epData);
    }
  } else {
    const name = document.getElementById('partName').value.trim();
    if(!name){ alert('Anna nimi!'); return; }
    if(!r.parts) r.parts=[];
    const partData = { name, score:selectedPartScore, note:document.getElementById('partNote').value, ratings: partRatingsEnabled && Object.keys(selectedPartRatings).length ? {...selectedPartRatings} : null };
    if(editingPartId!==null) r.parts[editingPartId]=partData;
    else r.parts.push(partData);
  }
  closeModal('partModal');
  await window.fbSave();
  renderCards();
};

window.deletePart = async function(reviewId, partIdx){
  if(!confirm('Poistetaanko?')) return;
  const r = appData.reviews.find(x=>x.id===reviewId); if(!r) return;
  r.parts.splice(partIdx,1);
  await window.fbSave();
  renderCards();
};

// ── TOP-LISTA ──
function topHeroIcon(cat){
  if(cat==='Elokuvat') return '🎬';
  if(cat==='TV-sarjat') return '📺';
  if(cat==='Ruuat') return '🍽️';
  if(cat==='Juomat') return '🥤';
  return '⭐';
}

let topGenreFilter = null;

const TOP_LIMITS = [5, 10, 25, 0];   // 0 = kaikki

window.setTopLimit = async function(n){
  ensureSettings().topLimit = n;
  renderTop();
  await window.fbSave();
};

window.setTopGenre = function(g){
  topGenreFilter = (topGenreFilter === g) ? null : g;
  renderTop();
};

function topControlsHtml(){
  const limit = (appData.settings && appData.settings.topLimit != null) ? appData.settings.topLimit : 5;
  const lenBtns = TOP_LIMITS.map(n=>`
    <button type="button" class="top-len-btn ${n===limit?'active':''}" onclick="setTopLimit(${n})">${n === 0 ? 'Kaikki' : 'Top ' + n}</button>
  `).join('');

  // Vain genret joita todella esiintyy arvosteluissa
  const used = new Set();
  appData.reviews.forEach(r=>{
    const g = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
    g.forEach(x=>used.add(x));
  });
  const genres = GENRES.filter(g=>used.has(g));
  const genreBtns = genres.length ? `<div class="top-genre-row">${
    genres.map(g=>`<button type="button" class="filter-chip ${g===topGenreFilter?'active':''}" onclick="setTopGenre('${escJs(g)}')">${esc(g)}</button>`).join('')
  }</div>` : '';

  return `<div class="top-controls">${lenBtns}</div>${genreBtns}`;
}

window.renderTop = function(){
  const grid = document.getElementById('cardsGrid');
  grid.className = 'cards-grid';
  const medals = ['gold','silver','bronze'];
  const limitSetting = (appData.settings && appData.settings.topLimit != null) ? appData.settings.topLimit : 5;
  let html = topControlsHtml();
  let anySection = false;

  // Alalajit saavat omat osionsa, jotta dokumentit eivät kilpaile
  // fiktion kanssa samassa listassa.
  const groups = [];
  appData.categories.forEach(cat => {
    const subs = subcatsFor(cat);
    if(subs.length){
      // Perusosio nimetään erikseen, jotta otsikko ei näytä siltä kuin
      // se sisältäisi myös dokumentit ja animaatiot.
      groups.push({ cat, sub: '',  label: `${cat} · Perus` });
      subs.forEach(sc => groups.push({ cat, sub: sc, label: `${cat} · ${sc}` }));
    } else {
      groups.push({ cat, sub: null, label: cat });
    }
  });

  groups.forEach(g=>{
    const cat = g.label;
    let pool = appData.reviews
      .filter(r=>r.category===g.cat)
      .filter(r=> g.sub === null ? true : subcatOf(r) === g.sub)
      .map(r=>({...r, finalScore: getReviewScore(r)}))
      .filter(r=>r.finalScore!==null);

    if(topGenreFilter){
      pool = pool.filter(r=>{
        const g = Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []);
        return g.includes(topGenreFilter);
      });
    }
    if(!pool.length) return;
    anySection = true;

    const total = pool.length;
    const avg = Math.round(pool.reduce((a,r)=>a+r.finalScore,0)/total);
    const sorted = pool.sort((a,b)=>b.finalScore-a.finalScore);
    const reviews = limitSetting === 0 ? sorted : sorted.slice(0, limitSetting);

    const top = reviews[0];
    const rest = reviews.slice(1);
    const hasPoster = !!top.poster;
    const heroStyle = hasPoster ? `style="background-image:url('https://image.tmdb.org/t/p/w500${top.poster}')"` : '';
    const heroAttrs = hasPoster ? '' : `data-icon="${topHeroIcon(g.cat)}"`;

    html += `<div class="top-section">
      <div class="top-section-title">🏆 ${esc(cat)}${topGenreFilter?` · ${esc(topGenreFilter)}`:''}</div>
      <div class="top-avg-line">${total} arvostelua · keskiarvo <strong>${avg}</strong>${limitSetting && total > limitSetting ? ` · näytetään ${limitSetting}` : ''}</div>
      <div class="top-hero-card ${hasPoster?'':'no-poster'}" ${heroStyle} ${heroAttrs} ondblclick="openReadModal(${top.id})">
        <span class="top-hero-crown">👑 #1</span>
        <div class="top-hero-content">
          <div>
            <div class="top-hero-name">${esc(nameWithYear(top))}${top.mark==='heart'?' ❤️':top.mark==='skull'?' 💀':''}</div>
            <div class="top-hero-meta">
              <span class="meta-chip">${esc(top.category)}</span>
              ${(Array.isArray(top.genre)?top.genre:(top.genre?[top.genre]:[])).slice(0,2).map(g=>`<span class="meta-chip">${esc(g)}</span>`).join('')}
            </div>
          </div>
          <span class="top-hero-score ${scoreClass(top.finalScore)}">${top.finalScore}</span>
        </div>
      </div>
      ${rest.map((r,i)=>`
        <div class="top-item">
          <span class="top-rank ${medals[i+1]||''}">${i+2}</span>
          <span class="top-name">${esc(nameWithYear(r))}${r.mark==='heart'?' ❤️':r.mark==='skull'?' 💀':''}</span>
          <span class="top-score ${scoreClass(r.finalScore)}">${r.finalScore}</span>
        </div>
      `).join('')}
    </div>`;
  });
  if(!anySection){
    html += topGenreFilter
      ? `<div class="top-empty-note">Ei arvosteluja genressä <strong>${esc(topGenreFilter)}</strong>.</div>`
      : `<div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-title">Ei arvosteluja vielä</div></div>`;
  }
  grid.innerHTML = html;
};

