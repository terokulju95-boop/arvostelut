// ══ ARVOSTELUT · budjetti, asetukset, modaalit, TMDB-haku ══
// Versioleima: jokaisessa tiedostossa sama. Jos yksi tiedosto jää
// päivittämättä GitHubiin, asetukset näyttävät siitä varoituksen.
window.BUILD_MODALS = '2026-09-01.17';
// Tavallinen skripti (ei moduuli): ylätason muuttujat ja funktiot
// jaetaan tiedostojen kesken globaalin skoopin kautta.
// LATAUSJÄRJESTYS ON MERKITSEVÄ — katso index.html:n loppu.

// ── BUDJETTI ──
let editingPeriodId = null;
let editingVisitPeriodId = null;
let editingVisitIdx = null;
let expandedBudgetStat = null;
let budgetRangeOpen = false;
let budgetRangeStart = null;
let budgetRangeEnd = null;
let budgetRangeCalculated = false;

function todayStr(){
  return new Date().toISOString().slice(0,10);
}

function fmtEur(n){
  return (Math.round(n*100)/100).toFixed(2).replace('.', ',') + ' €';
}

function fmtDateFi(d){
  if(!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('fi-FI');
}

function getOpenPeriod(){
  const periods = appData.budget.periods;
  return periods.find(p => !p.endDate) || null;
}

function periodExtras(p){
  return (p.visits||[]).reduce((s,v)=>s + (Number(v.extra)||0), 0);
}

function periodCost(p){
  return (Number(p.price)||0) + periodExtras(p);
}

function periodMovieCount(p){
  return (p.visits||[]).length;
}

function periodCostPerMovie(p){
  const c = periodMovieCount(p);
  return c > 0 ? periodCost(p) / c : null;
}

function statsForMonths(monthsAgo){
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsAgo);
  let subscriptionTotal = 0, extrasTotal = 0, movies = 0, periodsCount = 0;
  appData.budget.periods.forEach(p => {
    if(new Date(p.startDate) >= cutoff){
      subscriptionTotal += Number(p.price) || 0;
      extrasTotal += periodExtras(p);
      movies += periodMovieCount(p);
      periodsCount++;
    }
  });
  return { subscriptionTotal, extrasTotal, movies, periodsCount, total: subscriptionTotal + extrasTotal };
}

function statsAll(){
  let subscriptionTotal = 0, extrasTotal = 0, movies = 0;
  appData.budget.periods.forEach(p => {
    subscriptionTotal += Number(p.price) || 0;
    extrasTotal += periodExtras(p);
    movies += periodMovieCount(p);
  });
  return { subscriptionTotal, extrasTotal, movies, periodsCount: appData.budget.periods.length, total: subscriptionTotal + extrasTotal };
}

// Kaikki todelliset laskutusrajat (kuukauden alku- ja loppupäivät), joista voi valita kulujakson.
function getBudgetBoundaryDates(){
  const set = new Set();
  (appData.budget.periods || []).forEach(p => {
    if(p.startDate) set.add(p.startDate);
    if(p.endDate) set.add(p.endDate);
  });
  return Array.from(set).sort();
}

// Kulujakso rajataan aina todellisiin laskutusrajoihin, joten laskenta on täsmällinen
// (ei arvio) — mukaan lasketaan vain kokonaiset kuukaudet, jotka mahtuvat valitulle välille.
// endSelection on joko jonkin päättyneen kuukauden loppupäivä, tai merkkijono 'today',
// joka sisällyttää mukaan myös parhaillaan käynnissä olevan (vielä avoimen) kuukauden.
function computeBoundaryRangeStats(startDate, endSelection){
  let subscriptionTotal = 0, extrasTotal = 0, movies = 0, periodsCount = 0;
  appData.budget.periods.forEach(p => {
    if(p.startDate < startDate) return;
    if(p.endDate){
      if(endSelection !== 'today' && p.endDate > endSelection) return;
    } else {
      if(endSelection !== 'today') return;
    }
    subscriptionTotal += Number(p.price) || 0;
    extrasTotal += periodExtras(p);
    movies += periodMovieCount(p);
    periodsCount++;
  });
  return { subscriptionTotal, extrasTotal, movies, periodsCount, total: subscriptionTotal + extrasTotal };
}

window.budgetFabClick = function(){
  const open = getOpenPeriod();
  if(!open){
    window.openBudgetPeriodModal('new');
  } else {
    window.openBudgetVisitModal(open.id);
  }
};

window.toggleBudgetStatDetail = function(key){
  expandedBudgetStat = (expandedBudgetStat === key) ? null : key;
  renderBudget();
};

window.toggleBudgetRangePanel = function(){
  budgetRangeOpen = !budgetRangeOpen;
  if(!budgetRangeOpen) budgetRangeCalculated = false;
  renderBudget();
};

window.calcBudgetRange = function(){
  const s = document.getElementById('budgetRangeStartInput').value;
  const e = document.getElementById('budgetRangeEndInput').value;
  if(!s || !e){ alert('Valitse molemmat päivämäärät!'); return; }
  const eForCompare = e === 'today' ? todayStr() : e;
  if(new Date(s) > new Date(eForCompare)){ alert('Alkupäivä ei voi olla loppupäivää myöhemmin!'); return; }
  budgetRangeStart = s;
  budgetRangeEnd = e;
  budgetRangeCalculated = true;
  renderBudget();
};

window.renderBudget = function(){
  const grid = document.getElementById('cardsGrid');
  grid.className = 'cards-grid';
  if(!appData.budget) appData.budget = { monthlyPrice: 26.90, periods: [] };
  const periods = [...appData.budget.periods].sort((a,b)=> new Date(b.startDate) - new Date(a.startDate));
  const open = getOpenPeriod();

  const s3 = statsForMonths(3), s6 = statsForMonths(6), s12 = statsForMonths(12);
  const all = statsAll();
  const statMap = {
    '3': { label: 'Viimeiset 3 kuukautta', data: s3 },
    '6': { label: 'Viimeiset 6 kuukautta', data: s6 },
    '12': { label: 'Viimeiset 12 kuukautta', data: s12 },
    'all': { label: 'Kaikki yhteensä', data: all }
  };

  let html = `
    <div class="budget-hero">
      <button class="budget-edit-price" onclick="openBudgetPriceModal()" title="Muokkaa kuukausihintaa">✏️</button>
      <div class="budget-hero-label">Kuukausitilaus</div>
      <div class="budget-hero-value">${fmtEur(appData.budget.monthlyPrice)}</div>
      <div class="budget-hero-sub">${open ? `Nykyinen kuukausi alkoi ${fmtDateFi(open.startDate)} · ${periodMovieCount(open)} elokuvaa` : (appData.budget.periods.length ? 'Tilaus ei ole tällä hetkellä käytössä' : 'Ei vielä aloitettu')}</div>
    </div>
  `;

  if(open){
    const cpm = periodCostPerMovie(open);
    html += `
      <div class="budget-stats-grid">
        <div class="budget-stat-card">
          <div class="budget-stat-label">Kuukauden hinta / elokuva</div>
          <div class="budget-stat-value">${cpm!==null ? fmtEur(cpm) : '–'}</div>
          <div class="budget-stat-sub">${periodMovieCount(open)} elokuvaa katsottu</div>
        </div>
        <div class="budget-stat-card">
          <div class="budget-stat-label">Kuukauden kulut yht.</div>
          <div class="budget-stat-value">${fmtEur(periodCost(open))}</div>
          <div class="budget-stat-sub">${periodExtras(open)>0 ? fmtEur(periodExtras(open))+' ostoksia' : 'Ei ostoksia'}</div>
        </div>
      </div>
      <div class="budget-actions-row">
        <button class="btn-add-visit" style="margin-top:0;" onclick="openBudgetVisitModal('${open.id}')">🎬 Lisää elokuvakäynti</button>
      </div>
      <div class="budget-actions-row">
        <button class="btn-add-visit" style="margin-top:0;border-color:rgba(96,165,250,0.3);color:var(--blue);background:rgba(96,165,250,0.1);" onclick="openBudgetPeriodModal('renew')">🔁 Uusi kuukausi laskutettu</button>
      </div>
      <div class="budget-actions-row">
        <button class="btn-add-visit" style="margin-top:0;border-color:rgba(255,107,107,0.3);color:var(--accent2);background:rgba(255,107,107,0.08);" onclick="openBudgetPeriodModal('pause')">⏸️ Lopeta tilaus</button>
      </div>
    `;
  } else {
    const hasHistory = appData.budget.periods.length > 0;
    const lastClosed = hasHistory ? [...appData.budget.periods].sort((a,b)=> new Date(b.endDate||b.startDate) - new Date(a.endDate||a.startDate))[0] : null;
    html += `
      ${hasHistory ? `<div class="budget-empty-hint" style="margin-bottom:10px;">⏸️ Tilaus ei ole käytössä${lastClosed && lastClosed.endDate ? ' (päättyi '+fmtDateFi(lastClosed.endDate)+')' : ''}</div>` : ''}
      <div class="budget-actions-row">
        <button class="btn-add-visit" style="margin-top:0;" onclick="openBudgetPeriodModal('new')">▶️ ${hasHistory ? 'Aloita tilaus uudelleen' : 'Aloita ensimmäinen kuukausi'}</button>
      </div>
    `;
  }

  html += `
    <div class="budget-section-title">📊 Tilastot</div>
    <div class="budget-stats-grid">
      ${Object.keys(statMap).map(key => {
        const s = statMap[key];
        const shortLabel = key==='all' ? 'Kaikki yhteensä' : `Viim. ${key} kk`;
        return `
        <div class="budget-stat-card clickable ${expandedBudgetStat===key ? 'expanded' : ''}" onclick="toggleBudgetStatDetail('${key}')">
          <div class="budget-stat-label">${shortLabel}</div>
          <div class="budget-stat-value">${fmtEur(s.data.total)}</div>
          <div class="budget-stat-sub">${s.data.movies>0 ? fmtEur(s.data.total/s.data.movies)+' / elokuva' : `${s.data.movies} elokuvaa`}</div>
        </div>`;
      }).join('')}
    </div>
  `;

  if(expandedBudgetStat && statMap[expandedBudgetStat]){
    const s = statMap[expandedBudgetStat];
    const d = s.data;
    html += `
      <div class="budget-detail-panel">
        <div class="budget-detail-title">${s.label}</div>
        <div class="budget-detail-row"><span>Elokuvia katsottu</span><b>${d.movies} kpl</b></div>
        <div class="budget-detail-row"><span>Kuukausia jaksolla</span><b>${d.periodsCount} kpl</b></div>
        <div class="budget-detail-row"><span>Tilausmaksut yhteensä</span><b>${fmtEur(d.subscriptionTotal)}</b></div>
        <div class="budget-detail-row"><span>Ostot yhteensä</span><b>${fmtEur(d.extrasTotal)}</b></div>
        <div class="budget-detail-row"><span>Yhteensä</span><b>${fmtEur(d.total)}</b></div>
        <div class="budget-detail-row"><span>€ / elokuva</span><b>${d.movies>0 ? fmtEur(d.total/d.movies) : '–'}</b></div>
      </div>
    `;
  }

  html += `<button class="budget-range-toggle" onclick="toggleBudgetRangePanel()">📅 ${budgetRangeOpen ? 'Piilota kulujaksot' : 'Tarkastele kulujaksoa (alku–loppu)'}</button>`;

  if(budgetRangeOpen){
    const boundaryDates = getBudgetBoundaryDates();
    if(!boundaryDates.length){
      html += `<div class="budget-range-panel"><div class="budget-empty-hint">Aloita ensin ainakin yksi kuukausi, jotta voit valita kulujakson.</div></div>`;
    } else {
      const today = todayStr();
      const startOptions = boundaryDates.map(d =>
        `<option value="${d}" ${budgetRangeStart===d?'selected':''}>${fmtDateFi(d)}</option>`
      ).join('');
      let endOptions = boundaryDates.map(d =>
        `<option value="${d}" ${budgetRangeEnd===d?'selected':''}>${fmtDateFi(d)}</option>`
      ).join('');
      if(getOpenPeriod()){
        endOptions += `<option value="today" ${budgetRangeEnd==='today'?'selected':''}>Tänään (${fmtDateFi(today)}) – kesken oleva kuukausi mukaan</option>`;
      }
      html += `
        <div class="budget-range-panel">
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;">Valitse päivät sen mukaan, milloin joku laskutuskuukausi on alkanut tai päättynyt. Näin laskenta on aina täsmällinen, ei arvio.</div>
          <div class="budget-range-row">
            <div class="form-group">
              <label>Alkaen</label>
              <select id="budgetRangeStartInput">${startOptions}</select>
            </div>
            <div class="form-group">
              <label>Päättyen</label>
              <select id="budgetRangeEndInput">${endOptions}</select>
            </div>
          </div>
          <button class="btn-add-visit" style="margin-top:0;" onclick="calcBudgetRange()">Näytä tiedot</button>
      `;
      if(budgetRangeCalculated && budgetRangeStart && budgetRangeEnd){
        const r = computeBoundaryRangeStats(budgetRangeStart, budgetRangeEnd);
        const endLabel = budgetRangeEnd === 'today' ? `tänään (${fmtDateFi(today)})` : fmtDateFi(budgetRangeEnd);
        if(r.periodsCount === 0){
          html += `<div class="budget-detail-panel" style="margin-top:14px;margin-bottom:0;"><div class="budget-empty-hint">Ei tilauskuukausia tällä välillä.</div></div>`;
        } else {
          html += `
            <div class="budget-detail-panel" style="margin-top:14px;margin-bottom:0;">
              <div class="budget-detail-title">${fmtDateFi(budgetRangeStart)} – ${endLabel}</div>
              <div class="budget-detail-row"><span>Elokuvia katsottu</span><b>${r.movies} kpl</b></div>
              <div class="budget-detail-row"><span>Kuukausia jaksolla</span><b>${r.periodsCount} kpl</b></div>
              <div class="budget-detail-row"><span>Tilausmaksut yhteensä</span><b>${fmtEur(r.subscriptionTotal)}</b></div>
              <div class="budget-detail-row"><span>Ostot yhteensä</span><b>${fmtEur(r.extrasTotal)}</b></div>
              <div class="budget-detail-row"><span>Yhteensä</span><b>${fmtEur(r.total)}</b></div>
              <div class="budget-detail-row"><span>€ / elokuva</span><b>${r.movies>0 ? fmtEur(r.total/r.movies) : '–'}</b></div>
            </div>
          `;
        }
      }
      html += `</div>`;
    }
  }

  html += `<div class="budget-section-title">🗓️ Kuukausihistoria</div>`;
  if(!periods.length){
    html += `<div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">Ei vielä yhtään kuukautta</div></div>`;
  } else {
    html += periods.map(p => {
      const cpm = periodCostPerMovie(p);
      const visits = [...(p.visits||[])].sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
      return `
        <div class="budget-period-card ${p.endDate ? 'closed' : ''}">
          <div class="budget-period-top">
            <div>
              <div class="budget-period-dates">${fmtDateFi(p.startDate)} – ${p.endDate ? fmtDateFi(p.endDate) : 'nyt'}</div>
              <span class="budget-period-badge">${p.endDate ? 'Päättynyt' : 'Käynnissä'}</span>
            </div>
            <div class="budget-period-icons">
              <button class="budget-icon-btn" onclick="openBudgetPeriodModal('edit','${p.id}')" title="Muokkaa">✏️</button>
              <button class="budget-icon-btn" onclick="deleteBudgetPeriod('${p.id}')" title="Poista">🗑️</button>
            </div>
          </div>
          <div class="budget-period-meta">
            <div class="budget-period-meta-item">Elokuvia: <b>${periodMovieCount(p)}</b></div>
            <div class="budget-period-meta-item">Tilaus: <b>${fmtEur(p.price)}</b></div>
            <div class="budget-period-meta-item">Ostot: <b>${fmtEur(periodExtras(p))}</b></div>
            <div class="budget-period-meta-item">Yhteensä: <b>${fmtEur(periodCost(p))}</b></div>
            <div class="budget-period-meta-item">€ / elokuva: <b>${cpm!==null ? fmtEur(cpm) : '–'}</b></div>
          </div>
          <div class="budget-visit-list">
            ${visits.length ? visits.map(v => {
              const realIdx = (p.visits||[]).indexOf(v);
              return `
              <div class="budget-visit">
                <div class="budget-visit-name">🎬 ${esc(v.name)}${v.date ? ' <span class="budget-visit-extra">· '+fmtDateFi(v.date)+'</span>' : ''}</div>
                <div class="budget-visit-extra">${v.extra ? fmtEur(v.extra) : ''}</div>
                <div class="budget-visit-icons">
                  <button onclick="openBudgetVisitModal('${p.id}', ${realIdx})" title="Muokkaa">✏️</button>
                  <button onclick="deleteBudgetVisit('${p.id}', ${realIdx})" title="Poista">🗑️</button>
                </div>
              </div>`;
            }).join('') : `<div class="budget-empty-hint">Ei vielä elokuvakäyntejä tällä kuukaudella</div>`}
            ${!p.endDate ? `<button class="btn-add-visit" onclick="openBudgetVisitModal('${p.id}')">🎬 Lisää elokuvakäynti</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  grid.innerHTML = html;
};

// Kuukausihinnan muokkaus
window.openBudgetPriceModal = function(){
  document.getElementById('budgetPriceInput').value = appData.budget.monthlyPrice;
  document.getElementById('budgetPriceModal').classList.add('open');
};

window.saveBudgetPrice = async function(){
  const val = parseFloat(document.getElementById('budgetPriceInput').value);
  if(isNaN(val) || val < 0){ alert('Anna kelvollinen hinta!'); return; }
  appData.budget.monthlyPrice = val;
  closeModal('budgetPriceModal');
  await window.fbSave();
  renderBudget();
};

// Kuukauden aloitus / uusiminen / muokkaus
window.openBudgetPeriodModal = function(mode, periodId){
  editingPeriodId = null;
  const title = document.getElementById('budgetPeriodModalTitle');
  const hint = document.getElementById('budgetPeriodHint');
  const startLabel = document.getElementById('budgetPeriodStartLabel');
  const endGroup = document.getElementById('budgetPeriodEndGroup');
  const startInput = document.getElementById('budgetPeriodStart');
  const endInput = document.getElementById('budgetPeriodEnd');
  const priceInput = document.getElementById('budgetPeriodPrice');
  const priceGroup = document.getElementById('budgetPeriodPriceGroup');

  window._budgetPeriodMode = mode;
  priceGroup.style.display = 'block';

  if(mode === 'new'){
    const hasHistory = appData.budget.periods.length > 0;
    title.textContent = hasHistory ? '▶️ Aloita tilaus uudelleen' : '▶️ Aloita ensimmäinen kuukausi';
    hint.textContent = 'Merkitse päivä, jolloin kuukausitilaus alkoi.';
    startLabel.textContent = 'Aloituspäivä';
    endGroup.style.display = 'none';
    startInput.value = todayStr();
    priceInput.value = appData.budget.monthlyPrice;
  } else if(mode === 'renew'){
    title.textContent = '🔁 Uusi kuukausi laskutettu';
    hint.textContent = 'Tämä päättää nykyisen kuukauden ja aloittaa uuden samasta päivästä.';
    startLabel.textContent = 'Uuden kuukauden alkupäivä';
    endGroup.style.display = 'none';
    startInput.value = todayStr();
    priceInput.value = appData.budget.monthlyPrice;
  } else if(mode === 'pause'){
    title.textContent = '⏸️ Lopeta tilaus';
    hint.textContent = 'Tämä päättää nykyisen kuukauden eikä aloita uutta. Tilastot pysyvät tarkkoina, koska tilauskatkoa ei lasketa mukaan. Voit aloittaa tilauksen uudelleen myöhemmin.';
    startLabel.textContent = 'Päivä jolloin tilaus päättyi';
    endGroup.style.display = 'none';
    startInput.value = todayStr();
    priceGroup.style.display = 'none';
  } else if(mode === 'edit'){
    const p = appData.budget.periods.find(x=>x.id === periodId);
    if(!p) return;
    editingPeriodId = periodId;
    title.textContent = '✏️ Muokkaa kuukautta';
    hint.textContent = '';
    startLabel.textContent = 'Aloituspäivä';
    endGroup.style.display = p.endDate ? 'block' : 'none';
    startInput.value = p.startDate;
    endInput.value = p.endDate || '';
    priceInput.value = p.price;
  }

  document.getElementById('budgetPeriodModal').classList.add('open');
};

window.saveBudgetPeriod = async function(){
  const mode = window._budgetPeriodMode;
  const start = document.getElementById('budgetPeriodStart').value;
  const end = document.getElementById('budgetPeriodEnd').value;
  const price = parseFloat(document.getElementById('budgetPeriodPrice').value);
  if(!start){ alert('Anna päivämäärä!'); return; }
  if(mode !== 'pause' && (isNaN(price) || price < 0)){ alert('Anna kelvollinen hinta!'); return; }

  if(mode === 'new'){
    if(appData.budget.periods.some(p=>!p.endDate)){ alert('Käynnissä oleva kuukausi on jo olemassa.'); return; }
    appData.budget.periods.push({ id: String(Date.now()), startDate: start, endDate: null, price, visits: [] });
  } else if(mode === 'renew'){
    const open = getOpenPeriod();
    if(open) open.endDate = start;
    appData.budget.periods.push({ id: String(Date.now()), startDate: start, endDate: null, price, visits: [] });
  } else if(mode === 'pause'){
    const open = getOpenPeriod();
    if(open) open.endDate = start;
  } else if(mode === 'edit' && editingPeriodId){
    const p = appData.budget.periods.find(x=>x.id === editingPeriodId);
    if(p){
      p.startDate = start;
      p.price = price;
      if(p.endDate) p.endDate = end || p.endDate;
    }
  }

  closeModal('budgetPeriodModal');
  await window.fbSave();
  renderBudget();
};

window.deleteBudgetPeriod = async function(periodId){
  if(!confirm('Poistetaanko tämä kuukausi kokonaan, käynteineen?')) return;
  appData.budget.periods = appData.budget.periods.filter(p=>p.id !== periodId);
  await window.fbSave();
  renderBudget();
};

// Elokuvakäynnin lisäys / muokkaus / poisto
window.openBudgetVisitModal = function(periodId, visitIdx){
  editingVisitPeriodId = periodId;
  editingVisitIdx = (visitIdx !== undefined) ? visitIdx : null;
  const title = document.getElementById('budgetVisitModalTitle');
  const nameEl = document.getElementById('budgetVisitName');
  const extraEl = document.getElementById('budgetVisitExtra');
  const dateEl = document.getElementById('budgetVisitDate');

  if(editingVisitIdx !== null){
    const p = appData.budget.periods.find(x=>x.id === periodId);
    const v = p && p.visits[editingVisitIdx];
    title.textContent = '✏️ Muokkaa käyntiä';
    nameEl.value = v ? v.name : '';
    extraEl.value = v && v.extra ? v.extra : '';
    dateEl.value = v && v.date ? v.date : todayStr();
  } else {
    title.textContent = '🎬 Lisää elokuvakäynti';
    nameEl.value = '';
    extraEl.value = '';
    dateEl.value = todayStr();
  }

  document.getElementById('budgetVisitModal').classList.add('open');
};

window.saveBudgetVisit = async function(){
  const name = document.getElementById('budgetVisitName').value.trim();
  const extra = parseFloat(document.getElementById('budgetVisitExtra').value) || 0;
  const date = document.getElementById('budgetVisitDate').value || todayStr();
  if(!name){ alert('Anna elokuvan nimi!'); return; }

  const p = appData.budget.periods.find(x=>x.id === editingVisitPeriodId);
  if(!p){ closeModal('budgetVisitModal'); return; }
  if(!p.visits) p.visits = [];

  const visitData = { name, extra, date };
  if(editingVisitIdx !== null) p.visits[editingVisitIdx] = visitData;
  else p.visits.push(visitData);

  closeModal('budgetVisitModal');
  await window.fbSave();
  renderBudget();
};

window.deleteBudgetVisit = async function(periodId, visitIdx){
  if(!confirm('Poistetaanko käynti?')) return;
  const p = appData.budget.periods.find(x=>x.id === periodId);
  if(!p) return;
  p.visits.splice(visitIdx, 1);
  await window.fbSave();
  renderBudget();
};

// ── VARMUUSKOPIOINTI ──
function backupStats(){
  const reviews = (appData.reviews||[]).length;
  const bytes = new Blob([JSON.stringify(appData)]).size;
  return { reviews, bytes, kb: Math.round(bytes/1024) };
}

function renderBackupInfo(){
  const el = document.getElementById('backupInfo');
  if(!el) return;
  const st = backupStats();
  // Uudessa rakenteessa 1 Mt:n raja koskee yhtä arvostelua, ei koko dataa
  let extra = '';
  if(window.fbSizeInfo){
    try{
      const info = window.fbSizeInfo();
      const pct = Math.round(info.largest / (1024*1024) * 100);
      extra = `<br>Suurin yksittäinen arvostelu: ${Math.max(1, Math.round(info.largest/1024))} kt`
            + (info.largestName ? ` (${esc(info.largestName)})` : '')
            + (pct >= 50 ? `<br><span style="color:var(--accent2);">⚠️ Lähestyy 1 Mt:n rajaa (${pct} %).</span>` : '');
    } catch(e){}
  }
  const cache = window._fbCacheMode === 'pysyvä'
    ? '<br><span style="color:var(--muted);">Paikallinen välimuisti käytössä</span>'
    : '';
  let last = '';
  if(window.fbBackupDays){
    const d = window.fbBackupDays();
    if(d === null){
      last = '<br><span style="color:var(--accent2);">Varmuuskopiota ei ole vielä ladattu</span>';
    } else {
      const teksti = d === 0 ? 'tänään' : (d === 1 ? 'eilen' : `${d} päivää sitten`);
      const vari = d >= BACKUP_REMIND_DAYS ? 'var(--accent2)' : 'var(--muted)';
      last = `<br><span style="color:${vari};">Edellinen varmuuskopio: ${teksti}</span>`;
    }
  }
  el.innerHTML = `${st.reviews} arvostelua · ${st.kb} kt yhteensä${extra}${last}${cache}`;
}

// ── VARMUUSKOPIOMUISTUTUS ──
const BACKUP_REMIND_DAYS = 7;
let _backupReminderDismissed = false;

function ensureBackupBar(){
  let el = document.getElementById('backupReminderBar');
  if(el) return el;

  el = document.createElement('div');
  el.id = 'backupReminderBar';
  el.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:390;display:none;' +
    'align-items:center;gap:10px;background:var(--bg3);color:var(--text);' +
    'border-top:2px solid var(--accent);font-size:13px;font-weight:600;line-height:1.35;' +
    'padding:12px 14px;padding-bottom:calc(12px + env(safe-area-inset-bottom));' +
    'box-shadow:0 -2px 16px rgba(0,0,0,0.5);';

  const txt = document.createElement('span');
  txt.id = 'backupReminderText';
  txt.style.cssText = 'flex:1;';

  const dl = document.createElement('button');
  dl.type = 'button';
  dl.textContent = '⬇️ Lataa';
  dl.style.cssText =
    'flex:0 0 auto;background:var(--accent);color:#111;border:none;border-radius:9px;' +
    'padding:9px 13px;font-size:13px;font-weight:700;cursor:pointer;';
  dl.onclick = () => { window.downloadBackup(); };

  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = '✕';
  no.setAttribute('aria-label','Sulje');
  no.style.cssText =
    'flex:0 0 auto;background:transparent;color:var(--muted);border:none;' +
    'padding:9px 6px;font-size:16px;cursor:pointer;';
  no.onclick = () => { _backupReminderDismissed = true; hideBackupReminder(); };

  el.appendChild(txt);
  el.appendChild(dl);
  el.appendChild(no);
  document.body.appendChild(el);
  return el;
}

function hideBackupReminder(){
  const el = document.getElementById('backupReminderBar');
  if(el) el.style.display = 'none';
  const fab = document.getElementById('fab');
  if(fab && !syncBarVisible()) fab.style.bottom = '';
}
window.hideBackupReminder = hideBackupReminder;
window.backupBarVisible = function(){
  const el = document.getElementById('backupReminderBar');
  return !!(el && el.style.display === 'flex');
};

function syncBarVisible(){
  const sb = document.getElementById('syncWarnBar');
  return !!(sb && sb.style.display === 'flex');
}

window.maybeShowBackupReminder = function(){
  if(_backupReminderDismissed) return;
  // Synkronointivaroitus on tärkeämpi — ei kahta palkkia päällekkäin
  if(syncBarVisible()) return;
  if(!window.fbBackupDays) return;

  const days = window.fbBackupDays();
  if(days !== null && days < BACKUP_REMIND_DAYS) return;

  const el = ensureBackupBar();
  document.getElementById('backupReminderText').textContent =
    days === null
      ? '📦 Et ole vielä ladannut varmuuskopiota'
      : `📦 Edellisestä varmuuskopiosta on ${days} ${days === 1 ? 'päivä' : 'päivää'}`;
  el.style.display = 'flex';
  const fab = document.getElementById('fab');
  if(fab) fab.style.bottom = '82px';
};

window.downloadBackup = function(){
  try{
    const stamp = new Date().toISOString().slice(0,10);
    const payload = JSON.stringify({
      _tyyppi: 'arvostelut-varmuuskopio',
      _paivays: new Date().toISOString(),
      data: appData
    }, null, 2);
    const blob = new Blob([payload], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arvostelut-varmuuskopio-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    showStatus('✅ Varmuuskopio ladattu','#22c55e');
    _backupReminderDismissed = true;
    hideBackupReminder();
    if(window.fbMarkBackupDone) window.fbMarkBackupDone().then(()=>renderBackupInfo());
  } catch(e){
    alert('Varmuuskopion luonti epäonnistui: ' + e.message);
  }
};

// ── VANHA PILVIKOPIO (arvostelut/data) ──
// Näyttää mitä elokuun tilannekuvassa on ja mitä siitä KANNATTAISI lisätä.
// Mitään ei kirjoiteta olemassa olevien arvostelujen päälle.
let _oldDocReport = null;

function oldDocRow(x, mode){
  const nimi = esc(x.name);
  const kat  = x.cat ? ` · ${esc(x.cat)}` : '';
  if(mode === 'diff'){
    const osat = (x.oldParts || x.nowParts)
      ? ` · arvosteltuja osia ${x.oldParts} → ${x.nowParts}`
      : '';
    return `<div style="margin:3px 0;">• ${nimi}${kat}<br>` +
           `<span style="color:var(--muted);">&nbsp;&nbsp;piste ${x.oldScore} → ${x.nowScore}${osat}</span></div>`;
  }
  return `<div style="margin:3px 0;">• ${nimi}${kat}</div>`;
}

function renderOldDocReport(){
  const el = document.getElementById('oldDocReport');
  if(!el) return;
  const r = _oldDocReport;
  if(!r){ el.innerHTML = ''; return; }

  const LIMIT = 15;
  const lista = (arr, mode) => {
    const osa = arr.slice(0, LIMIT).map(x => oldDocRow(x, mode)).join('');
    const loput = arr.length > LIMIT ? `<div style="margin:3px 0;">… ja ${arr.length - LIMIT} muuta</div>` : '';
    return osa + loput;
  };

  const pvm = r.savedAt ? esc(String(r.savedAt).slice(0,10)) : 'ei tiedossa';

  let html = `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">`;
  html += `<div style="color:var(--text);font-weight:600;margin-bottom:6px;">Vanha pilvikopio · arvostelut/data</div>`;
  html += `Tilannekuvan päiväys: ${pvm}<br>`;
  html += `Vanhassa ${r.count} arvostelua · nykyisessä ${r.nowCount}<br>`;
  html += `<div style="margin-top:8px;">✅ Täysin samoja: ${r.same}</div>`;

  html += `<div style="margin-top:8px;color:#22c55e;">➕ Puuttuu nykyisestä: ${r.missing.length}</div>`;
  if(r.missing.length){
    html += `<div style="margin-top:4px;">${lista(r.missing, 'miss')}</div>`;
    html += `<div style="margin-top:6px;color:var(--muted);">Nämä voidaan lisätä turvallisesti.</div>`;
  }

  html += `<div style="margin-top:10px;color:var(--accent2);">⚠️ Eroaa nykyisestä: ${r.differing.length}</div>`;
  if(r.differing.length){
    html += `<div style="margin-top:4px;">${lista(r.differing, 'diff')}</div>`;
    html += `<div style="margin-top:6px;color:var(--muted);">Näihin EI kosketa. Vanha versio on lähes aina huonompi — juuri näiden ylikirjoittaminen hävitti jaksojen pisteet.</div>`;
  }

  if(r.catsOnlyOld.length) html += `<div style="margin-top:8px;">Vain vanhassa olevat kategoriat: ${esc(r.catsOnlyOld.join(', '))}</div>`;
  if(r.genresOnlyOld.length) html += `<div style="margin-top:4px;">Vain vanhassa olevat genret: ${esc(r.genresOnlyOld.join(', '))}</div>`;

  const om = r.oldMeta || {};
  const jaksot = (om.budget && Array.isArray(om.budget.periods)) ? om.budget.periods.length : 0;
  html += `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);">`;
  html += `<span style="color:var(--text);">Asetukset vanhassa kopiossa</span><br>`;
  html += `${(om.categories||[]).length} kategoriaa · ${(om.genres||[]).length} genreä · ${jaksot} budjettijaksoa`;
  if((om.categories||[]).length) html += `<br><span style="color:var(--muted);">${esc(om.categories.join(', '))}</span>`;
  html += `</div>`;

  html += `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);color:var(--text);">`;
  html += r.missing.length
    ? `Hyötyä: ${r.missing.length} arvostelua on lisättävissä.`
    : `Ei mitään lisättävää — vanhassa kopiossa ei ole yhtään arvostelua jota sinulla ei jo olisi.`;
  html += `</div></div>`;

  if(r.missing.length){
    html += `<button class="btn-secondary" style="width:100%;padding:13px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-top:8px;" onclick="restoreMissingFromOldDoc()">➕ Lisää ${r.missing.length} puuttuvaa arvostelua</button>`;
  }
  if((r.oldMeta && (r.oldMeta.categories||[]).length)){
    html += `<button class="btn-secondary" style="width:100%;padding:13px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-top:8px;" onclick="restoreMetaFromOldDoc()">⚙️ Palauta vain asetukset vanhasta kopiosta</button>`;
  }

  el.innerHTML = html;
}

window.restoreMetaFromOldDoc = async function(){
  const r = _oldDocReport;
  if(!r || !r.oldMeta) return;
  const om = r.oldMeta;
  const jaksot = (om.budget && Array.isArray(om.budget.periods)) ? om.budget.periods.length : 0;
  if(!confirm(
    'Palautetaanko asetukset vanhasta pilvikopiosta?\n\n' +
    `Kategoriat: ${om.categories.length}\nGenret: ${om.genres.length}\nBudjettijaksot: ${jaksot}\n\n` +
    'Arvosteluihin EI kosketa. Nykyiset kategoriat, genret, budjetti ja asetukset korvataan.'
  )) return;

  const ok = await window.fbRestoreMeta(om);
  if(!ok){ alert('Asetusten palautus epäonnistui. Tarkista yhteys.'); return; }
  showStatus('✅ Asetukset palautettu','#22c55e');
  renderBackupInfo();
};

// Palauttaa vain asetukset JSON-tiedostosta — arvosteluihin ei kosketa
window.restoreMetaFile = function(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let parsed;
    try{ parsed = JSON.parse(reader.result); }
    catch(e){ alert('Tiedostoa ei voitu lukea — onko se kelvollinen JSON-varmuuskopio?'); return; }
    const d = (parsed && parsed.data) ? parsed.data : parsed;
    if(!d || !Array.isArray(d.categories) || !d.categories.length){
      alert('Tiedostosta ei löytynyt kategorioita.');
      return;
    }
    const jaksot = (d.budget && Array.isArray(d.budget.periods)) ? d.budget.periods.length : 0;
    if(!confirm(
      'Palautetaanko asetukset tiedostosta?\n\n' +
      `Kategoriat: ${d.categories.length}\nGenret: ${(d.genres||[]).length}\nBudjettijaksot: ${jaksot}\n\n` +
      'Arvosteluihin EI kosketa.'
    )) return;
    const ok = await window.fbRestoreMeta(d);
    if(!ok){ alert('Asetusten palautus epäonnistui. Tarkista yhteys.'); return; }
    showStatus('✅ Asetukset palautettu','#22c55e');
    renderBackupInfo();
  };
  reader.readAsText(file);
};

window.checkOldDoc = async function(){
  const el = document.getElementById('oldDocReport');
  if(!el) return;
  _oldDocReport = null;
  el.innerHTML = '<span style="color:var(--muted);">Luetaan vanhaa dokumenttia palvelimelta…</span>';

  if(!window.fbOldDocReport){
    el.innerHTML = '<span style="color:var(--accent2);">Toimintoa ei ole käytettävissä.</span>';
    return;
  }
  let rep;
  try{
    rep = await window.fbOldDocReport();
  } catch(e){
    el.innerHTML = `<span style="color:var(--accent2);">${esc('Virhe: ' + (e && e.message ? e.message : 'lukeminen epäonnistui'))}</span>`;
    return;
  }
  if(!rep || !rep.ok){
    el.innerHTML = `<span style="color:var(--accent2);">${esc(rep && rep.error ? rep.error : 'Lukeminen epäonnistui.')}</span>`;
    return;
  }
  _oldDocReport = rep;
  renderOldDocReport();
};

window.restoreMissingFromOldDoc = async function(){
  const r = _oldDocReport;
  if(!r || !r.missing.length) return;
  if(!confirm(`Lisätäänkö ${r.missing.length} arvostelua vanhasta pilvikopiosta?\n\nOlemassa oleviin arvosteluihin ei kosketa.`)) return;

  const n = await window.fbRestoreMissing(r.missing.map(x => x.id));
  if(n < 0){
    alert('Vanhaa dokumenttia ei saatu luettua. Tarkista yhteys ja yritä uudelleen.');
    return;
  }
  showStatus(`✅ Lisättiin ${n} arvostelua`, '#22c55e');
  renderBackupInfo();
  await window.checkOldDoc();
};

window.restoreBackup = function(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let parsed;
    try{
      parsed = JSON.parse(reader.result);
    } catch(e){
      alert('Tiedostoa ei voitu lukea — onko se kelvollinen JSON-varmuuskopio?');
      return;
    }
    // Hyväksytään sekä uusi muoto (_tyyppi + data) että pelkkä appData
    const incoming = (parsed && parsed.data && parsed.data.reviews) ? parsed.data : parsed;
    if(!incoming || !Array.isArray(incoming.reviews)){
      alert('Tiedosto ei näytä Arvostelut-varmuuskopiolta (reviews-taulukko puuttuu).');
      return;
    }
    const nykyiset = (appData.reviews||[]).length;
    const tulevat = incoming.reviews.length;
    if(!confirm(`Korvataanko nykyiset tiedot?\n\nNykyisin: ${nykyiset} arvostelua\nTiedostossa: ${tulevat} arvostelua\n\nTämä korvaa kaiken myös pilvessä.`)) return;

    appData = incoming;
    if(!appData.categories) appData.categories = [...DEFAULT_CATS];
    if(!appData.genres) appData.genres = [...DEFAULT_GENRES];
    if(!appData.budget) appData.budget = { monthlyPrice: 26.90, periods: [] };
    if(window.migrateYearField) window.migrateYearField();
    GENRES = [...appData.genres];
    if(!appData.categories.includes(activeCat)) activeCat = appData.categories[0] || null;

    await window.fbSave();
    renderAll();
    renderBackupInfo();
    alert(`Palautettu: ${tulevat} arvostelua.`);
  };
  reader.readAsText(file);
};

// ── ASETUKSET ──
// Asetukset on jaettu neljään välilehteen. Valittu välilehti muistetaan,
// jotta esim. varmuuskopiointi löytyy heti uudelleen avattaessa.
const SETTINGS_TABS = ['ulkoasu','pisteytys','data','tili'];
let settingsTab = 'ulkoasu';
try {
  const saved = localStorage.getItem('arvostelut_settingsTab');
  if(saved && SETTINGS_TABS.includes(saved)) settingsTab = saved;
} catch(e){}

window.setSettingsTab = function(id){
  if(!SETTINGS_TABS.includes(id)) id = 'ulkoasu';
  settingsTab = id;
  try { localStorage.setItem('arvostelut_settingsTab', id); } catch(e){}
  document.querySelectorAll('#settingsTabs .settings-tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab === id);
  });
  document.querySelectorAll('#settingsModal .settings-pane').forEach(p=>{
    p.classList.toggle('active', p.dataset.pane === id);
  });
  // Vieritä ylös, muuten pitkältä välilehdeltä lyhyelle siirtyminen
  // jättää näkymän tyhjän näköiseksi
  const sheet = document.querySelector('#settingsModal .modal-sheet');
  if(sheet) sheet.scrollTop = 0;
};

function renderAccountInfo(){
  const el = document.getElementById('accountInfo');
  if(!el) return;
  const email = window.fbUserEmail || '–';
  const cache = window._fbCacheMode || 'tuntematon';
  const count = (appData.reviews || []).length;
  el.innerHTML = `
    <div>📧 ${esc(email)}</div>
    <div style="margin-top:6px;">📚 ${count} arvostelua</div>
    <div>💾 Paikallinen välimuisti: ${esc(cache)}</div>
    <div style="margin-top:6px;">🏷️ Versio: ${esc(window.BUILD_CORE || 'tuntematon')}</div>
  `;
}

// ── JAKSOTIETOJEN ASETUKSET ──
function renderTranslateSettings(){
  const s = ensureSettings();
  const p = document.getElementById('translatePlotsToggle');
  const n = document.getElementById('translateNamesToggle');
  const e = document.getElementById('translateEmailInput');
  const c = document.getElementById('translateCacheInfo');
  if(p) p.classList.toggle('on', !!s.translatePlots);
  if(n) n.classList.toggle('on', !!s.translateNames);
  if(e && document.activeElement !== e) e.value = s.translateEmail || '';
  if(c){
    const n2 = window.translationCacheSize();
    c.textContent = n2
      ? `💾 ${n2} käännöstä muistissa — samaa tekstiä ei käännetä kahdesti.`
      : '💾 Käännösvälimuisti on tyhjä.';
  }
}

window.toggleTranslatePlots = async function(){
  const s = ensureSettings();
  s.translatePlots = !s.translatePlots;
  renderTranslateSettings();
  await window.fbSave();
};

window.toggleTranslateNames = async function(){
  const s = ensureSettings();
  s.translateNames = !s.translateNames;
  renderTranslateSettings();
  await window.fbSave();
};

window.saveTranslateEmail = async function(val){
  ensureSettings().translateEmail = String(val || '').trim();
  window.resetTranslateQuotaFlag();
  await window.fbSave();
};

window.resetTranslationCache = async function(){
  if(!confirm('Tyhjennetäänkö käännösvälimuisti? Seuraava tuonti kääntää tekstit uudelleen.')) return;
  window.clearTranslationCache();
  window.resetTranslateQuotaFlag();
  renderTranslateSettings();
};

// ── VERSIOTARKISTUS ──
// Jokaisessa JS-tiedostossa on sama versioleima. Jos yksi tiedosto jää
// päivittämättä (tai jää välimuistiin), toiminnot katoavat hiljaisesti:
// napit näkyvät, mutta niiden takana oleva funktio puuttuu eikä mitään
// tapahdu. Tämä tarkistus tekee tilanteesta heti näkyvän.
const BUILD_FILES = [
  ['app-core.js',     'BUILD_CORE',     true],
  ['app-views.js',    'BUILD_VIEWS',    true],
  ['app-modals.js',   'BUILD_MODALS',   true],
  ['app-discover.js', 'BUILD_DISCOVER', true],
  ['app-theme.js',     'BUILD_THEME',    true],
  ['app-tmdb-bulk.js', 'BUILD_BULK',     true],
  ['app-plot.js',      'BUILD_PLOT',     true],
  ['app-extras.js',    'BUILD_EXTRAS',   true],
  ['app-cards.js',     'BUILD_CARDS',    true],
  ['app-questions.js', 'BUILD_QUESTIONS',true],
  ['app-firebase.js', 'BUILD_FIREBASE', false]   // moduuli, latautuu viimeisenä
];

function renderBuildCheck(){
  const el = document.getElementById('buildWarning');
  if(!el) return;
  const rows = BUILD_FILES.map(([file, key, required]) => ({ file, required, v: window[key] || null }));
  const versions = [...new Set(rows.filter(r => r.v).map(r => r.v))];
  // Puuttuva versioleima kertoo vanhasta tiedostosta. Firebase-moduuli
  // jätetään pois tästä, koska se voi olla vielä latautumatta.
  const missing = rows.filter(r => r.required && !r.v);

  if(versions.length <= 1 && !missing.length){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const list = rows.map(r =>
    `<div class="bw-row"><span>${r.file}</span><span>${r.v ? esc(r.v) : (r.required ? '⚠️ vanha versio' : '– ei ladattu')}</span></div>`
  ).join('');
  el.style.display = 'block';
  el.innerHTML = `
    <div class="bw-title">⚠️ Tiedostot eivät ole samaa versiota</div>
    <div class="bw-text">Osa napeista ei toimi ennen kuin kaikki tiedostot on päivitetty GitHubiin samasta paketista.</div>
    ${list}
    <button class="bw-btn" onclick="forceReload()">🔄 Tyhjennä välimuisti ja lataa uudelleen</button>
  `;
}

window.forceReload = function(){
  if(navigator.serviceWorker && navigator.serviceWorker.controller){
    navigator.serviceWorker.controller.postMessage('CLEAR_CACHES');
  }
  setTimeout(() => location.reload(true), 400);
};

// Suorittaa renderöinnin niin, ettei yhden osan virhe estä modaalin avautumista.
function safeRender(label, fn){
  // Puuttuva funktio tarkoittaa että jokin tiedosto on vanhaa versiota.
  // Versiovaroitus kertoo siitä erikseen — tässä vain ohitetaan.
  if(typeof fn !== 'function') return;
  try { fn(); }
  catch(e){ console.error('Asetusten osa epäonnistui:', label, e); }
}

// ── TALLENNUSJONO ──
// Näyttää mitkä muutokset odottavat pilveen pääsyä ja miksi.
// Firestore yrittää itsestään, mutta jos jono jumittuu, tästä pääsee
// käynnistämään yrityksen käsin.
function renderSyncSummary(){
  const el = document.getElementById('syncSummary');
  if(!el) return;
  if(!window.fbSyncState){ el.textContent = 'Tallennustilaa ei saatavilla.'; return; }
  const st = window.fbSyncState();
  const online = navigator.onLine !== false;
  if(st.pending === 0 && !st.meta && !st.queueStuck){
    el.innerHTML = `✅ Kaikki muutokset on tallennettu pilveen.<br>${online ? '🌐 Yhteys kunnossa' : '📴 Ei verkkoyhteyttä'}`;
  } else {
    const n = st.pending;
    el.innerHTML = `⚠️ ${n} ${n === 1 ? 'muutos' : 'muutosta'} odottaa tallennusta${st.meta ? ' (myös asetukset)' : ''}.<br>`
      + `${online ? '🌐 Yhteys kunnossa' : '📴 Ei verkkoyhteyttä — jono lähtee kun verkko palaa'}`
      + (st.queueStuck ? '<br>⏳ Jono ei ole liikkunut — kokeile uudelleenyritystä' : '');
  }
}

window.openSyncQueue = function(){
  renderSyncQueue();
  window.openModalOnTop('syncQueueModal');
};

function renderSyncQueue(){
  const el = document.getElementById('sqBody');
  if(!el) return;
  if(!window.fbPendingList){
    el.innerHTML = '<div class="sq-empty">Tallennustietoja ei ole saatavilla.</div>';
    return;
  }
  const st = window.fbPendingList();
  const online = st.online;

  const head = `<div class="sq-status ${st.rows.length || st.meta ? 'sq-warn' : 'sq-ok'}">
    <div class="sq-status-title">${st.rows.length || st.meta
      ? `⚠️ ${st.rows.length} ${st.rows.length === 1 ? 'kohde' : 'kohdetta'} odottaa`
      : '✅ Kaikki tallennettu pilveen'}</div>
    <div class="sq-status-sub">
      ${online ? '🌐 Verkkoyhteys kunnossa' : '📴 Ei verkkoyhteyttä'}
      · 💾 välimuisti: ${esc(st.cacheMode || 'tuntematon')}
      ${st.queueStuck ? '<br>⏳ Jono ei ole liikkunut tässä istunnossa.' : ''}
      ${st.meta ? '<br>⚙️ Myös asetukset odottavat tallennusta.' : ''}
    </div>
  </div>`;

  if(!st.rows.length && !st.meta){
    el.innerHTML = head + `<div class="sq-empty">Ei mitään jonossa. Tiedot ovat turvassa pilvessä.</div>`;
    const btn = document.getElementById('sqRetryBtn');
    if(btn){ btn.textContent = '🔄 Tallenna varmuuden vuoksi'; btn.disabled = false; }
    return;
  }

  const rows = st.rows.map(r => `<div class="sq-row">
    <span class="sq-kind sq-kind-${r.kind === 'poisto' ? 'del' : 'set'}">${r.kind === 'poisto' ? '🗑️' : '💾'}</span>
    <span class="sq-name">${esc(r.name)}</span>
    <span class="sq-src">${esc(r.source)}</span>
  </div>`).join('');

  el.innerHTML = head
    + `<div class="sq-list">${rows}</div>`
    + `<div class="sq-hint">Muutokset ovat tallessa myös laitteellasi. Älä tyhjennä selaustietoja ennen kuin jono on tyhjä — ja ota tarvittaessa varmuuskopio Data-välilehdeltä.</div>`;

  const btn = document.getElementById('sqRetryBtn');
  if(btn){ btn.textContent = '🔄 Yritä uudelleen'; btn.disabled = false; }
}

window.retrySyncQueue = async function(){
  const btn = document.getElementById('sqRetryBtn');
  const el = document.getElementById('sqBody');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Yritetään...'; }
  if(el) el.innerHTML = `<div class="sq-status sq-warn"><div class="sq-status-title">⏳ Yhdistetään uudelleen</div>
    <div class="sq-status-sub">Verkkoyhteys nollataan ja muutokset lähetetään uudelleen.</div></div>`;

  let st = null;
  try {
    st = window.fbRetryPending ? await window.fbRetryPending() : null;
  } catch(e){
    console.error('Uudelleenyritys epäonnistui:', e);
  }
  renderSyncQueue();
  renderSyncSummary();
  if(st && st.pending === 0 && !st.queueStuck){
    const b = document.getElementById('sqBody');
    if(b) b.insertAdjacentHTML('afterbegin', '<div class="sq-flash">✅ Kaikki meni läpi.</div>');
  }
};

// ── ALALAJIEN HALLINTA ──
function renderSubcatCatSelect(){
  const sel = document.getElementById('subcatCatSelect');
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = (appData.categories || []).map(c =>
    `<option value="${esc(c)}" ${c === prev ? 'selected' : ''}>${esc(c)}</option>`
  ).join('');
  if(!sel.value && appData.categories.length) sel.value = appData.categories[0];
}

function renderSubcatManage(){
  renderSubcatCatSelect();
  const cat = document.getElementById('subcatCatSelect')?.value;
  const el = document.getElementById('subcatManageList');
  if(!el || !cat) return;
  const subs = subcatsFor(cat);
  if(!subs.length){
    el.innerHTML = `<div class="cat-row" style="opacity:0.6;"><span class="cat-row-name">Ei alalajeja — kaikki näkyy yhtenä listana</span></div>`;
    return;
  }
  el.innerHTML = subs.map((sc, i) => {
    const n = (appData.reviews || []).filter(r => r.category === cat && subcatOf(r) === sc).length;
    return `<div class="cat-row">
      <span class="cat-row-name">${esc(sc)}</span>
      <span class="cat-row-count">${n} kpl</span>
      <button class="cat-del" onclick="deleteSubcat(${i})">Poista</button>
    </div>`;
  }).join('');
}
window.renderSubcatManage = renderSubcatManage;

window.addSubcat = async function(){
  const cat = document.getElementById('subcatCatSelect')?.value;
  const inp = document.getElementById('newSubcatInput');
  const val = (inp?.value || '').trim();
  if(!cat || !val) return;
  if(val.toLowerCase() === 'perus'){ alert('"Perus" on varattu nimi — se tarkoittaa arvosteluja ilman alalajia.'); return; }
  const subs = ensureSubcats();
  if(!Array.isArray(subs[cat])) subs[cat] = [];
  if(subs[cat].includes(val)){ alert('Alalaji on jo olemassa.'); return; }
  subs[cat].push(val);
  inp.value = '';
  renderSubcatManage();
  renderAll();
  await window.fbSave();
};

window.deleteSubcat = async function(i){
  const cat = document.getElementById('subcatCatSelect')?.value;
  if(!cat) return;
  const subs = ensureSubcats();
  const name = (subs[cat] || [])[i];
  if(!name) return;
  const n = (appData.reviews || []).filter(r => r.category === cat && subcatOf(r) === name).length;
  const msg = n
    ? `Poistetaanko alalaji "${name}"? ${n} ${n === 1 ? 'arvostelu siirtyy' : 'arvostelua siirtyy'} takaisin Perus-listaan. Arvosteluja ei poisteta.`
    : `Poistetaanko alalaji "${name}"?`;
  if(!confirm(msg)) return;
  subs[cat].splice(i, 1);
  if(n) (appData.reviews || []).forEach(r => { if(r.category === cat && subcatOf(r) === name) r.subcat = ''; });
  renderSubcatManage();
  renderAll();
  await window.fbSave();
};

// ── SIIRTOTYÖKALU ──
// Sekä yksittäisen arvostelun siirtoon (lukumodaalista) että
// joukkosiirtoon (asetuksista).
let _movePreselect = null;

window.openMoveModal = function(preselectId){
  _movePreselect = preselectId != null ? preselectId : null;
  const r = preselectId != null ? appData.reviews.find(x => x.id === preselectId) : null;

  const srcGroup = document.getElementById('moveSourceGroup');
  const info = document.getElementById('moveInfo');

  // Yksittäistä arvostelua siirrettäessä lähdevalitsimia ei tarvita
  if(r){
    srcGroup.style.display = 'none';
    info.innerHTML = `<div class="si-info">Siirretään <strong>${esc(plainName(r))}</strong><br>
      Nyt: ${esc(r.category)}${subcatOf(r) ? ' · ' + esc(subcatOf(r)) : ' · Perus'}</div>`;
  } else {
    srcGroup.style.display = 'block';
    info.innerHTML = `<div class="si-info">Valitse arvostelut ja kohde. Pisteet, muistiinpanot ja jaksotiedot säilyvät ennallaan.</div>`;
    const sc = document.getElementById('moveSourceCat');
    sc.innerHTML = (appData.categories || []).map(c =>
      `<option value="${esc(c)}" ${c === activeCat ? 'selected' : ''}>${esc(c)}</option>`).join('');
    renderMoveSourceSub();
  }

  const tc = document.getElementById('moveTargetCat');
  tc.innerHTML = (appData.categories || []).map(c =>
    `<option value="${esc(c)}" ${r && c === r.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
  onMoveTargetCatChange();

  renderMoveList();
  window.openModalOnTop('moveModal');
};

function subOptions(cat, includeAll){
  const subs = subcatsFor(cat);
  const opts = [];
  if(includeAll) opts.push({ v:'__all', l:'Kaikki alalajit' });
  opts.push({ v:'', l: subs.length ? 'Perus' : '(ei alalajeja)' });
  subs.forEach(s => opts.push({ v:s, l:s }));
  return opts;
}

function renderMoveSourceSub(){
  const cat = document.getElementById('moveSourceCat')?.value;
  const sel = document.getElementById('moveSourceSub');
  if(!sel || !cat) return;
  sel.innerHTML = subOptions(cat, true).map(o =>
    `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');
  sel.style.display = subcatsFor(cat).length ? 'block' : 'none';
}

window.onMoveTargetCatChange = function(){
  const cat = document.getElementById('moveTargetCat')?.value;
  const sel = document.getElementById('moveTargetSub');
  if(!sel || !cat) return;
  const subs = subcatsFor(cat);
  sel.innerHTML = subOptions(cat, false).map(o =>
    `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');
  sel.style.display = subs.length ? 'block' : 'none';
  // Esivalitse siirrettävän nykyinen alalaji jos se löytyy kohteesta
  if(_movePreselect != null){
    const r = appData.reviews.find(x => x.id === _movePreselect);
    if(r && subs.includes(subcatOf(r))) sel.value = subcatOf(r);
  }
};

window.onMoveSourceCatChange = function(){
  renderMoveSourceSub();
  renderMoveList();
};

window.renderMoveList = function(){
  const host = document.getElementById('moveList');
  if(!host) return;

  if(_movePreselect != null){
    const r = appData.reviews.find(x => x.id === _movePreselect);
    host.innerHTML = r
      ? `<input type="checkbox" class="mv-check" data-id="${r.id}" checked style="display:none;">`
      : '';
    document.querySelector('.mv-tools').style.display = 'none';
    return;
  }
  document.querySelector('.mv-tools').style.display = 'flex';

  const cat = document.getElementById('moveSourceCat')?.value;
  const sub = document.getElementById('moveSourceSub')?.value;
  let list = (appData.reviews || []).filter(r => r.category === cat);
  if(sub !== '__all' && subcatsFor(cat).length) list = list.filter(r => subcatOf(r) === sub);
  list.sort((a,b) => plainName(a).localeCompare(plainName(b), 'fi'));

  if(!list.length){
    host.innerHTML = `<div class="mv-empty">Ei arvosteluja tällä valinnalla.</div>`;
    return;
  }
  host.innerHTML = list.map(r => {
    const sc = subcatOf(r);
    return `<label class="si-row">
      <input type="checkbox" class="mv-check" data-id="${r.id}">
      <span class="si-name">${esc(plainName(r))}${r.year ? ` <span class="si-count">${r.year}</span>` : ''}</span>
      <span class="si-badge">${sc ? esc(sc) : 'Perus'}</span>
    </label>`;
  }).join('');
};

window.moveSelectAll = function(on){
  document.querySelectorAll('#moveList .mv-check').forEach(c => { c.checked = !!on; });
};

window.runMove = async function(){
  const ids = [...document.querySelectorAll('#moveList .mv-check')]
    .filter(c => c.checked).map(c => Number(c.dataset.id));
  if(!ids.length){ alert('Valitse ainakin yksi arvostelu.'); return; }

  const tCat = document.getElementById('moveTargetCat').value;
  const tSubEl = document.getElementById('moveTargetSub');
  const tSub = subcatsFor(tCat).length ? String(tSubEl.value || '') : '';

  let moved = 0;
  ids.forEach(id => {
    const r = appData.reviews.find(x => x.id === id);
    if(!r) return;
    const changedCat = r.category !== tCat;
    r.category = tCat;
    r.subcat = tSub;
    // Kategorian vaihtuessa genrelista voi olla epäkelpo uudessa
    // kategoriassa, mutta sitä ei hävitetä — käyttäjä voi korjata itse.
    if(changedCat && tCat !== 'TV-sarjat' && r.tvType) r.tvType = '';
    moved++;
  });

  closeModal('moveModal');
  _movePreselect = null;
  await window.fbSave();
  renderAll();
  // Asetukset voivat olla auki taustalla — päivitä sen listat lukumäärineen
  if(document.getElementById('settingsModal').classList.contains('open')){
    safeRender('kategoriat', renderCatManage);
    safeRender('alalajit', renderSubcatManage);
  }
  if(window.showStatus) window.showStatus(`✅ ${moved} ${moved === 1 ? 'arvostelu siirretty' : 'arvostelua siirretty'}`, '#22c55e', 2500);
};

window.openSettings = function(){
  if(!appData.genres) appData.genres = [...DEFAULT_GENRES];
  GENRES = [...appData.genres];
  safeRender('versiotarkistus', renderBuildCheck);
  safeRender('kategoriat', renderCatManage);
  safeRender('alalajit', renderSubcatManage);
  safeRender('genret', renderGenreManage);
  safeRender('teema', window.renderThemeSettings);
  safeRender('korostusväri', renderAccentRow);
  safeRender('pisterajat', window.renderScoreBandSettings);
  safeRender('tmdb-tunnus', window.renderTokenSettings);
  safeRender('tmdb-laskuri', window.renderTmdbCalls);
  safeRender('puuttuvat juonet', window.renderMissingPlots);
  safeRender('suorituskyky', window.renderPerfInfo);
  safeRender('testitila', window.renderSandboxSettings);
  safeRender('tarkkuus', renderPrecisionRow);
  safeRender('painotukset', renderWeightRows);
  safeRender('julistevärit', updatePosterColorToggle);
  safeRender('kenttäjärjestys', window.renderFormOrderSettings);
  safeRender('korttien sisältö', window.renderCardFieldSettings);
  safeRender('kysymyspankki', window.renderQbankSettings);
  safeRender('tmdb-tila', renderTmdbStatus);
  safeRender('varmuuskopio', renderBackupInfo);
  safeRender('tili', renderAccountInfo);
  safeRender('tallennustila', renderSyncSummary);
  safeRender('käännösasetukset', renderTranslateSettings);
  _oldDocReport = null;
  const odr = document.getElementById('oldDocReport');
  if(odr) odr.innerHTML = '';
  window.setSettingsTab(settingsTab);
  document.getElementById('settingsModal').classList.add('open');
};

function renderTmdbStatus(){
  const box = document.getElementById('tmdbStatusBox');
  if(!box) return;
  const st = window._tmdbTokenStatus || {};
  const issued = window.tmdbTokenIssuedAt ? new Date(window.tmdbTokenIssuedAt).toLocaleDateString('fi-FI') : 'Ei tiedossa';
  let statusLine;
  if(st.ok === true) statusLine = `✅ Toimii (${st.message||''})`;
  else if(st.ok === false) statusLine = `❌ Ongelma: ${st.message||'Tuntematon virhe'}`;
  else statusLine = '⏳ Tarkistetaan...';
  const checkedAt = st.checkedAt ? new Date(st.checkedAt).toLocaleString('fi-FI') : '–';
  const custom = !!String((appData.settings && appData.settings.tmdbToken) || '').trim();
  box.innerHTML = `
    <div>${statusLine}</div>
    <div style="margin-top:6px;">🔑 Lähde: ${custom ? 'asetuksiin tallennettu oma tunnus' : 'koodin oletustunnus'}</div>
    <div>📅 Myönnetty: ${issued}</div>
    <div>🕓 Viimeksi tarkistettu: ${checkedAt}</div>
    <div style="margin-top:8px;font-size:11px;opacity:0.8;">TMDB:n lukutunnuksilla ei ole kiinteää vanhenemispäivää — sovellus testaa toimivuuden oikealla API-kutsulla joka kerta kun sovellus käynnistetään.</div>
  `;
}
window.refreshTmdbStatusInSettings = renderTmdbStatus;

function renderCatManage(){
  const el = document.getElementById('catManageList');
  if(!el) return;
  // Kaikki kategoriat ovat poistettavissa. Ainoa rajoitus on, ettei
  // viimeistä kategoriaa voi poistaa — muuten sovellukseen ei jäisi
  // yhtään paikkaa mihin arvostelun voisi tallentaa.
  const last = appData.categories.length <= 1;
  el.innerHTML = appData.categories.map((c,i)=>{
    const count = appData.reviews.filter(r => r.category === c).length;
    return `<div class="cat-row">
      <span class="cat-row-name">${esc(c)}</span>
      <span class="cat-row-count">${count} kpl</span>
      ${last
        ? '<span style="font-size:12px;color:var(--muted);">viimeinen</span>'
        : `<button class="cat-del" onclick="deleteCat(${i})">Poista</button>`}
    </div>`;
  }).join('');
}

window.addCategory = async function(){
  const val = document.getElementById('newCatInput').value.trim();
  if(!val) return;
  if(appData.categories.includes(val)){ alert('Kategoria on jo olemassa!'); return; }
  appData.categories.push(val);
  document.getElementById('newCatInput').value='';
  renderCatManage();
  renderAll();
  await window.fbSave();
};

window.deleteCat = async function(i){
  const cat = appData.categories[i];
  if(appData.categories.length <= 1){
    alert('Viimeistä kategoriaa ei voi poistaa.'); return;
  }
  const inCat = appData.reviews.filter(r => r.category === cat);

  // Jos kategoriassa on arvosteluja, tarjotaan siirtoa toiseen kategoriaan
  // sen sijaan että vaadittaisiin niiden poistamista ensin.
  if(inCat.length){
    const others = appData.categories.filter(c => c !== cat);
    const list = others.map((c,n) => `${n+1}. ${c}`).join('\n');
    const pick = prompt(
      `Kategoriassa "${cat}" on ${inCat.length} ${inCat.length === 1 ? "arvostelu" : "arvostelua"}.\n\n` +
      `Mihin kategoriaan ne siirretään?\nAnna numero, tai peruuta jos et halua poistaa.\n\n${list}`
    );
    if(pick === null) return;
    const idx = parseInt(pick, 10) - 1;
    if(isNaN(idx) || idx < 0 || idx >= others.length){ alert('Virheellinen valinta.'); return; }
    const target = others[idx];
    if(!confirm(`Siirretäänkö ${inCat.length} ${inCat.length === 1 ? "arvostelu" : "arvostelua"} kategoriaan "${target}" ja poistetaan "${cat}"?`)) return;
    inCat.forEach(r => { r.category = target; });
  } else {
    if(!confirm(`Poistetaanko kategoria "${cat}"?`)) return;
  }

  appData.categories.splice(i,1);
  if(activeCat === cat) activeCat = appData.categories[0] || null;
  renderCatManage();
  renderAll();
  await window.fbSave();
};

// ── GENRE HALLINTA ──
function renderGenreManage(){
  const el = document.getElementById('genreManageList');
  if(!el) return;
  if(!appData.genres) appData.genres = [...DEFAULT_GENRES];
  el.innerHTML = appData.genres.map((g,i)=>`
    <div class="cat-row">
      <span class="cat-row-name">${esc(g)}</span>
      ${!DEFAULT_GENRES.includes(g)?`<button class="cat-del" onclick="deleteGenre(${i})">Poista</button>`:'<span style="font-size:12px;color:var(--muted);">vakio</span>'}
    </div>
  `).join('');
}

window.addGenre = async function(){
  const val = document.getElementById('newGenreInput').value.trim();
  if(!val) return;
  if(appData.genres.includes(val)){ alert('Genre on jo olemassa!'); return; }
  appData.genres.push(val);
  GENRES = [...appData.genres];
  document.getElementById('newGenreInput').value='';
  renderGenreManage();
  renderGenreFilters();
  await window.fbSave();
};

window.deleteGenre = async function(i){
  const genre = appData.genres[i];
  if(DEFAULT_GENRES.includes(genre)){ alert('Vakiogenreä ei voi poistaa!'); return; }
  if(!confirm(`Poistetaanko genre "${genre}"?`)) return;
  appData.genres.splice(i,1);
  GENRES = [...appData.genres];
  renderGenreManage();
  renderGenreFilters();
  await window.fbSave();
};

// ── AUTOCOMPLETE ──
window.showNameSuggestions = function(val){
  const list = document.getElementById('acList');
  if(!list) return;
  if(!val||val.length<1){ list.style.display='none'; return; }
  const all = [...new Set(appData.reviews.map(r=>plainName(r)))]
    .filter(n=>n.toUpperCase().startsWith(val.toUpperCase())&&n.toUpperCase()!==val.toUpperCase()).slice(0,5);
  if(!all.length){ list.style.display='none'; return; }
  list.innerHTML = all.map(n=>`
    <div class="autocomplete-item" onmousedown="selectAcItem('${escJs(n)}')" ontouchstart="selectAcItem('${escJs(n)}')">
      📝 <span><mark>${esc(n.slice(0,val.length))}</mark>${esc(n.slice(val.length))}</span>
    </div>
  `).join('');
  list.style.display='block';
};

window.selectAcItem = function(val){
  const inp = document.getElementById('formName');
  if(inp) inp.value = val;
  const list = document.getElementById('acList');
  if(list) list.style.display='none';
};

window.handleAcKey = function(e){
  if(e.key==='Escape'){
    const list = document.getElementById('acList');
    if(list) list.style.display='none';
  }
};

document.addEventListener('click', e=>{
  if(!e.target.closest('.autocomplete-wrap')){
    const l=document.getElementById('acList');
    if(l) l.style.display='none';
  }
});

// ── MODAALIT ──
// ── LUKU-MODAALI ──
window.openReadModal = function(id){
  const r = appData.reviews.find(x=>x.id===id); if(!r) return;
  const score = getReviewScore(r);
  const genres = Array.isArray(r.genre)?r.genre:(r.genre?[r.genre]:[]);
  const dateStr = r.date ? new Date(r.date).toLocaleDateString('fi-FI') : '';
  const cls = score!=null?scoreBand(score):'mid';

  const extraRows = [];
  if(r.director && rf('director')) extraRows.push(`<div class="read-section"><div class="read-label">🎬 Ohjaaja</div>
    <div class="read-value"><button type="button" class="dir-link dir-link-lg" onclick="closeModal('readModal');filterByDirector('${escJs(r.director)}')">${esc(r.director)}</button></div></div>`);
  if(r.cast && r.cast.length && rf('cast')) extraRows.push(`<div class="read-section"><div class="read-label">🎭 Näyttelijät</div><div class="read-value">${esc(r.cast.join(', '))}</div></div>`);
  if(r.runtime && rf('runtime')) extraRows.push(`<div class="read-section"><div class="read-label">⏱️ Kesto</div><div class="read-value">${r.runtime} min</div></div>`);
  if(r.tvType === 'jaksot' && rf('parts')){
    const p = episodeProgress(r);
    if(p.total) extraRows.push(`<div class="read-section">
      <div class="read-label">📺 Edistyminen</div>
      <div class="read-value">${p.rated}/${p.total} jaksoa arvosteltu</div>
      <div class="ep-progress${p.rated>=p.total?' is-complete':''}" style="margin-top:8px;">
        <div class="ep-progress-track"><div class="ep-progress-bar" style="width:${Math.min(100,p.pct)}%"></div></div>
      </div>
    </div>`);
  } else if(r.episodes_total && rf('episodes')){
    extraRows.push(`<div class="read-section"><div class="read-label">📺 Jaksoja</div><div class="read-value">${r.episodes_total}</div></div>`);
  }
  const st = rf('status') ? tvStatusInfo(r.tv_status) : null;
  if(st){
    let extra = '';
    if(r.next_air && r.next_air.date){
      const d = new Date(r.next_air.date + 'T00:00:00');
      const days = Math.ceil((d - new Date()) / 86400000);
      const when = days > 1 ? `${days} päivän päästä` : (days === 1 ? 'huomenna' : (days === 0 ? 'tänään' : ''));
      extra = `<div style="font-size:12px;color:var(--muted);margin-top:4px;">
        Seuraava jakso K${r.next_air.season}J${r.next_air.episode} ${esc(r.next_air.date)}${when ? ' · ' + when : ''}
      </div>`;
    } else if(r.tv_status === 'Ended' && r.last_air_date){
      extra = `<div style="font-size:12px;color:var(--muted);margin-top:4px;">Viimeinen jakso ${esc(r.last_air_date)}</div>`;
    } else if((r.tv_status === 'Canceled' || r.tv_status === 'Cancelled') && r.last_air_date){
      extra = `<div style="font-size:12px;color:var(--muted);margin-top:4px;">Peruttu — viimeinen jakso ${esc(r.last_air_date)}</div>`;
    }
    extraRows.push(`<div class="read-section"><div class="read-label">📡 Tuotantotila</div>
      <div class="read-value">${st.icon} ${esc(st.fi)}${r.seasons_total ? ` · ${r.seasons_total} kautta` : ''}</div>${extra}</div>`);
  }
  if(subcatOf(r) && rf('subcat')) extraRows.push(`<div class="read-section"><div class="read-label">📂 Alalaji</div><div class="read-value">${esc(subcatOf(r))}</div></div>`);
  if(r.country && rf('country')) extraRows.push(`<div class="read-section"><div class="read-label">🌍 Maa</div><div class="read-value">${esc(r.country)}</div></div>`);
  if(r.tmdb_score && rf('tmdbScore')) extraRows.push(`<div class="read-section"><div class="read-label">⭐ TMDB-arvosana</div><div class="read-value">${r.tmdb_score}/10</div></div>`);

  // Juliste on napautettava: se avaa julisteen vaihtajan. Ilman julistetta
  // tilalla on sama nappi paikkakuvana, jotta oman kuvan voi lisätä myös
  // teokselle jota TMDB ei tunne lainkaan.
  const posterHtml = !rf('poster') ? ''
    : window.hasPoster(r)
    ? `<button type="button" class="read-poster-btn" onclick="openPosterPicker(${r.id})" title="Vaihda juliste">
         <img src="${esc(window.posterUrl(r,'w200'))}" alt="">
         <span class="read-poster-edit">✏️</span>
       </button>`
    : `<button type="button" class="read-poster-btn read-poster-empty" onclick="openPosterPicker(${r.id})" title="Lisää juliste">
         <span>🖼️</span><span class="read-poster-add">Lisää</span>
       </button>`;

  document.getElementById('readModalContent').innerHTML = `
    <div class="read-ring-row" style="align-items:flex-start;gap:12px;">
      ${posterHtml}
      <div style="flex:1;">
        ${score!=null&&rf('score')?buildRing(score):''}
        <div class="read-title">${escNl(r.name)}${(r.year&&rf('year'))?` <span class="read-year">${r.year}</span>`:''}</div>
        ${(()=>{
          const parts = [];
          if(rf('category')) parts.push(esc(r.category));
          if(rf('genre') && genres.length) parts.push(esc(genres.join(', ')));
          return parts.length ? `<div class="read-sub">${parts.join(' · ')}</div>` : '';
        })()}
        ${(rf('mark')&&r.mark==='heart')?'<span style="color:#ff6482;font-size:13px;font-weight:700;">❤️ Suosikki</span>':''}
        ${(rf('mark')&&r.mark==='skull')?'<span style="color:#aaa;font-size:13px;font-weight:700;">💀 Huono</span>':''}
      </div>
    </div>
    ${extraRows.join('')}
    ${(PLOT_CATS.includes(r.category) && rf('plot')) ? (r.plot ? `<div class="read-section">
      <div class="read-label read-label-row">
        <span>📖 Juoni</span>
        ${isOwnPlot(r) ? '<span class="plot-badge own">OMA</span>' : ''}
        <button type="button" class="read-plot-edit" onclick="openPlotEditor(${r.id}, null)">✏️ Muokkaa</button>
      </div>
      <div class="read-value" style="color:var(--muted);font-style:italic;">${escNl(r.plot)}</div>
    </div>` : `<div class="read-section">
      <div class="read-label">📖 Juoni</div>
      <button type="button" class="plot-add-btn" onclick="openPlotEditor(${r.id}, null)">➕ Lisää juoni itse</button>
    </div>`) : ''}
    ${(r.note&&rf('note'))?`<div class="read-section">
      <div class="read-label">Arvostelu</div>
      <div class="read-value read-note">${mdText(r.note)}</div>
    </div>`:''}
    ${(dateStr&&rf('date'))?`<div class="read-section">
      <div class="read-label">Päivämäärä</div>
      <div class="read-value">📅 ${dateStr}</div>
    </div>`:''}
  `;
  // "Tarkista sijoitus" vain jos arvostelulla on oma piste ja vertailtavia löytyy
  const rrHost = document.getElementById('readModalContent');
  const ownScore = (!r.tvType || r.tvType === 'kokonaisuus') ? r.score : null;
  if(ownScore != null && ratingsEligible(r.category)){
    const cand = getComparisonCandidates(r.category, subcatOf(r), Array.isArray(r.genre)?r.genre:(r.genre?[r.genre]:[]), r.id);
    if(cand.list.length >= 2){
      rrHost.insertAdjacentHTML('beforeend',
        `<button type="button" class="rerank-btn" onclick="openRerank(${id})">⚖️ Tarkista sijoitus</button>`);
    }
  }
  document.getElementById('readEditBtn').setAttribute('onclick', `closeModal('readModal'); editReviewWithFlip(${id})`);
  const mv = document.getElementById('readMoveBtn');
  if(mv) mv.setAttribute('onclick', `closeModal('readModal'); setTimeout(()=>openMoveModal(${id}), 250)`);
  document.getElementById('readModal').classList.add('open');
};

// ══ KÄÄNNÖS SUOMEKSI (KÄSIN KÄYNNISTETTÄVÄ) ══
// Tuonti hakee tiedot suomeksi, ja englanniksi vain siltä osin kuin
// suomennosta ei ole. Kääntäminen on erillinen, käyttäjän käynnistämä työ,
// koska se kuluttaa rajallista päiväkiintiötä.
let _trReviewId = null;
let _trCancel = false;

window.openTranslateModal = function(reviewId){
  const r = appData.reviews.find(x => x.id === reviewId);
  if(!r) return;
  _trReviewId = reviewId;
  _trCancel = false;
  document.getElementById('trmSetup').style.display = 'block';
  document.getElementById('trmProgress').style.display = 'none';
  renderTranslateSetup(r);
  window.openModalOnTop('translateModal');
};

function fmtNum(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

function renderTranslateSetup(r){
  const q = window.translateQuotaState();
  const s = ensureSettings();
  const info = document.getElementById('trmInfo');
  const host = document.getElementById('trmList');

  const what = [];
  if(s.translatePlots) what.push('juonet');
  if(s.translateNames) what.push('nimet');

  const pct = Math.min(100, Math.round(q.chars / q.limit * 100));
  const quotaLine = q.exhausted
    ? `<div class="trm-quota-warn">⏳ Päivän käännöskiintiö on täynnä. Jatka huomenna — jo käännetyt tekstit säilyvät.</div>`
    : `<div class="trm-quota">
         <div class="trm-quota-head"><span>Päiväkiintiö</span><span>${fmtNum(q.chars)} / ${fmtNum(q.limit)} merkkiä</span></div>
         <div class="trm-quota-track"><div class="trm-quota-bar" style="width:${pct}%"></div></div>
         <div class="trm-quota-sub">${fmtNum(q.left)} merkkiä jäljellä tänään${q.hasEmail ? '' : ' · sähköpostilla raja olisi 50 000'}</div>
       </div>`;

  info.innerHTML = `
    <div class="si-info">
      <strong>${esc(plainName(r))}</strong><br>
      Käännetään vain ne tekstit, joita TMDB ei tarjoa suomeksi.
      ${what.length ? `Mukaan otetaan: <strong>${what.join(' ja ')}</strong> (valittavissa asetuksista).`
                    : '<strong>Asetuksissa ei ole valittuna mitään käännettävää.</strong>'}
    </div>
    ${quotaLine}
  `;

  const seasons = r.seasons || [];
  const rows = seasons.map((season, si) => {
    const jobs = pendingTranslations(r, [si]);
    const cost = window.pendingCharCost(jobs);
    const total = (season.episodes || []).length;
    const already = (season.episodes || []).filter(e => e.plotLang === 'fi' || e.plotLang === 'fi-auto').length;
    return { si, season, jobs, cost, total, already };
  });

  const withWork = rows.filter(x => x.jobs.length);
  if(!withWork.length){
    host.innerHTML = `<div class="trm-empty">✅ Kaikki on jo suomeksi. Ei käännettävää.</div>`;
    document.getElementById('trmStartBtn').disabled = true;
    document.getElementById('trmStartBtn').textContent = 'Ei käännettävää';
    return;
  }

  document.getElementById('trmStartBtn').disabled = false;
  host.innerHTML = rows.map(x => {
    const none = x.jobs.length === 0;
    return `<label class="si-row${none ? ' is-done' : ''}">
      <input type="checkbox" class="trm-check" data-si="${x.si}" ${none ? 'disabled' : 'checked'}>
      <span class="si-name">${esc(x.season.name || ('Kausi ' + (x.si+1)))}</span>
      ${none
        ? `<span class="si-badge">✓ suomeksi</span>`
        : `<span class="si-count">${x.jobs.length} ${x.jobs.length === 1 ? 'kohde' : 'kohdetta'}</span><span class="si-badge si-new">${fmtNum(x.cost)} merkkiä</span>`}
    </label>`;
  }).join('');
  updateTrmEstimate();
}

// Näyttää valinnan yhteismerkkimäärän ja varoittaa jos kiintiö ei riitä.
window.updateTrmEstimate = function(){
  const r = appData.reviews.find(x => x.id === _trReviewId);
  if(!r) return;
  const sel = [...document.querySelectorAll('.trm-check')].filter(c => c.checked).map(c => +c.dataset.si);
  const jobs = pendingTranslations(r, sel);
  const cost = window.pendingCharCost(jobs);
  const q = window.translateQuotaState();
  const el = document.getElementById('trmEstimate');
  if(!el) return;
  if(!jobs.length){ el.innerHTML = 'Ei valittuja kausia.'; return; }
  const fits = cost <= q.left && !q.exhausted;
  el.innerHTML = fits
    ? `Valittuna <strong>${jobs.length}</strong> ${jobs.length === 1 ? 'kohde' : 'kohdetta'}, noin <strong>${fmtNum(cost)}</strong> merkkiä. Mahtuu tämän päivän kiintiöön.`
    : `Valittuna <strong>${jobs.length}</strong> kohdetta, noin <strong>${fmtNum(cost)}</strong> merkkiä.
       <span class="trm-warn">Tämän päivän kiintiöstä on jäljellä ${fmtNum(q.left)} merkkiä, joten työ keskeytyy kesken ja voit jatkaa huomenna.</span>`;
};

window.trmSelectAll = function(on){
  document.querySelectorAll('.trm-check').forEach(c => { if(!c.disabled) c.checked = !!on; });
  updateTrmEstimate();
};

window.cancelTranslate = function(){ _trCancel = true; };

window.runTranslate = async function(){
  const r = appData.reviews.find(x => x.id === _trReviewId);
  if(!r) return;
  const sel = [...document.querySelectorAll('.trm-check')].filter(c => c.checked).map(c => +c.dataset.si);
  const jobs = pendingTranslations(r, sel);
  if(!jobs.length){ alert('Valitse ainakin yksi kausi.'); return; }

  _trCancel = false;
  document.getElementById('trmSetup').style.display = 'none';
  const prog = document.getElementById('trmProgress');
  prog.style.display = 'block';
  // Rakennetaan joka ajolla uudelleen, koska lopputulos korvaa tämän sisällön
  prog.innerHTML = `
    <div class="trm-run">
      <div class="trm-run-head">
        <span id="trmLabel">0 / ${jobs.length}</span>
        <span class="trm-run-pct">Käännetään...</span>
      </div>
      <div class="trm-quota-track"><div class="trm-quota-bar" id="trmBar" style="width:0%"></div></div>
      <div class="trm-run-sub" id="trmSub">Aloitetaan...</div>
      <button class="btn-secondary" style="width:100%;margin-top:16px;" onclick="cancelTranslate()">Keskeytä</button>
      <div class="trm-run-note">Keskeytys ei hukkaa jo käännettyjä tekstejä.</div>
    </div>`;
  const bar   = document.getElementById('trmBar');
  const label = document.getElementById('trmLabel');
  const sub   = document.getElementById('trmSub');

  const result = await runTranslationJobs(
    jobs,
    (done, total, job) => {
      bar.style.width = Math.round(done / total * 100) + '%';
      label.textContent = `${done} / ${total}`;
      const name = job.ep.name || ('Jakso ' + job.ep.episode);
      sub.textContent = `${job.field === 'name' ? 'Nimi' : 'Juoni'}: ${name}`;
    },
    () => _trCancel,
    async () => { await window.fbSave(); }   // välitallennus 8 kohteen välein
  );

  await window.fbSave();
  renderCards();

  // Yhteenveto
  const q = window.translateQuotaState();
  let title, tone;
  if(result.quota){
    title = '⏳ Päivän kiintiö täyttyi';
    tone = 'warn';
  } else if(result.cancelled){
    title = '⏸️ Keskeytetty';
    tone = 'warn';
  } else {
    title = '✅ Valmis';
    tone = 'ok';
  }
  const left = jobs.length - result.ok;
  document.getElementById('trmProgress').innerHTML = `
    <div class="trm-result trm-${tone}">
      <div class="trm-result-title">${title}</div>
      <div class="trm-result-text">
        Käännetty ${result.ok}/${jobs.length} kohdetta.
        ${result.failed ? `${result.failed} epäonnistui ja jäi englanniksi.<br>` : ''}
        ${left > 0
          ? (result.quota
              ? `<strong>${left} ${left === 1 ? 'kohde jäi' : 'kohdetta jäi'} jäljelle.</strong> Kiintiö nollautuu vuorokauden kuluessa — avaa tämä ikkuna huomenna uudelleen ja jatka siitä mihin jäit. Jo käännetyt tekstit on tallennettu.`
              : `${left} ${left === 1 ? 'kohde jäi' : 'kohdetta jäi'} jäljelle.`)
          : 'Kaikki valitut on nyt suomeksi.'}
      </div>
      <div class="trm-result-quota">Käytetty tänään: ${fmtNum(q.chars)} / ${fmtNum(q.limit)} merkkiä</div>
      <button class="btn-primary" style="width:100%;margin-top:14px;" onclick="closeModal('translateModal')">Sulje</button>
    </div>
  `;
};

// ══ KAUSIEN TUONTI TMDB:STÄ ══
// Erillinen, valikoiva tuonti: näet mitkä kaudet ovat jo tuotu ja valitset
// mitä haetaan. Pisteitä ja omia muistiinpanoja ei koskaan ylikirjoiteta.
let _seasonImport = null;   // { reviewId, tmdbId, seasons: [...] }

window.openSeasonImport = async function(reviewId){
  const r = appData.reviews.find(x => x.id === reviewId);
  if(!r) return;
  if(!window.tmdbToken){ alert('TMDB-tunnus ei ole vielä latautunut. Yritä hetken kuluttua uudelleen.'); return; }

  const overlay = document.getElementById('tmdbLoadingOverlay');
  const subEl   = document.getElementById('tmdbLoadingSub');
  const progBar = document.getElementById('tmdbProgressBar');
  overlay.classList.add('open');
  subEl.textContent = 'Haetaan sarjan kaudet...';
  progBar.style.width = '20%';

  try{
    let tmdbId = r.tmdb_id;

    // Sarjaa ei ole vielä linkitetty TMDB:hen → hae nimellä
    if(!tmdbId){
      subEl.textContent = `Etsitään: ${plainName(r)}`;
      const sr = await tmdbGet(`/search/tv?query=${encodeURIComponent(plainName(r))}&language=fi-FI&page=1`);
      const hits = (sr && sr.results) || [];
      if(!hits.length){
        overlay.classList.remove('open');
        alert(`Ei tuloksia haulle "${plainName(r)}". Avaa arvostelu muokattavaksi ja hae sarja TMDB-haulla.`);
        return;
      }
      tmdbId = hits[0].id;
      if(hits.length > 1){
        overlay.classList.remove('open');
        const opts = hits.slice(0,5).map((h,i)=>`${i+1}. ${h.name}${h.first_air_date?' ('+h.first_air_date.slice(0,4)+')':''}`).join('\n');
        const pick = prompt(`Löytyi useita sarjoja. Valitse numero (1-${Math.min(hits.length,5)}):\n\n${opts}`);
        const idx = parseInt(pick,10) - 1;
        if(isNaN(idx) || idx < 0 || idx >= hits.length) return;
        tmdbId = hits[idx].id;
        overlay.classList.add('open');
      }
    }

    progBar.style.width = '60%';
    const detail = await tmdbGet(`/tv/${tmdbId}?language=fi-FI`);
    overlay.classList.remove('open');
    if(!detail || !detail.seasons){ alert('Kausitietoja ei saatu haettua.'); return; }

    // Erikoisjaksot (kausi 0) viimeiseksi, ne ovat harvemmin haluttuja
    const list = detail.seasons
      .filter(s => s.episode_count > 0)
      .sort((a,b) => (a.season_number === 0 ? 999 : a.season_number) - (b.season_number === 0 ? 999 : b.season_number));

    _seasonImport = { reviewId, tmdbId, seasons: list };
    renderSeasonImportList(r, list);
    window.openModalOnTop('seasonImportModal');
  } catch(e){
    overlay.classList.remove('open');
    alert('Virhe kausien haussa. Tarkista internetyhteys.');
  }
};

function renderSeasonImportList(r, list){
  const info = document.getElementById('seasonImportInfo');
  const host = document.getElementById('seasonImportList');
  info.innerHTML = `<div class="si-info">
    <strong>${esc(plainName(r))}</strong> · ${list.length} kautta TMDB:ssä<br>
    Haetaan suomeksi, ja englanniksi vain siltä osin kuin suomennosta ei ole.
    Pisteesi ja omat muistiinpanosi säilyvät.<br>
    Kääntäminen tehdään erikseen tuonnin jälkeen 🌐-napista.
  </div>`;

  host.innerHTML = list.map((s2, i) => {
    const ex = findSeasonByNumber(r, s2.season_number);
    const have = ex ? (ex.episodes || []).length : 0;
    const rated = ex ? (ex.episodes || []).filter(e => e.score != null).length : 0;
    const isNew = !ex;
    const label = s2.season_number === 0 ? 'Erikoisjaksot' : (s2.name || `Kausi ${s2.season_number}`);
    const status = isNew
      ? `<span class="si-badge si-new">uusi</span>`
      : `<span class="si-badge">${have} tuotu · ${rated} arvosteltu</span>`;
    return `<label class="si-row">
      <input type="checkbox" class="si-check" data-idx="${i}" ${isNew ? 'checked' : ''}>
      <span class="si-name">${esc(label)}</span>
      <span class="si-count">${s2.episode_count} jaksoa</span>
      ${status}
    </label>`;
  }).join('');
}

window.seasonImportSelectAll = function(on){
  document.querySelectorAll('#seasonImportList .si-check').forEach(c => { c.checked = !!on; });
};

window.runSeasonImport = async function(){
  if(!_seasonImport) return;
  const r = appData.reviews.find(x => x.id === _seasonImport.reviewId);
  if(!r) return;
  const picked = [...document.querySelectorAll('#seasonImportList .si-check')]
    .filter(c => c.checked)
    .map(c => _seasonImport.seasons[parseInt(c.dataset.idx, 10)]);
  if(!picked.length){ alert('Valitse ainakin yksi kausi.'); return; }

  closeModal('seasonImportModal');
  const overlay = document.getElementById('tmdbLoadingOverlay');
  const subEl   = document.getElementById('tmdbLoadingSub');
  const progBar = document.getElementById('tmdbProgressBar');
  overlay.classList.add('open');
  progBar.style.width = '5%';
  window.resetTranslateQuotaFlag();

  r.seasons = r.seasons || [];
  r.tmdb_id = r.tmdb_id || _seasonImport.tmdbId;
  let added = 0, renamed = 0, plots = 0, failed = 0;

  for(let i = 0; i < picked.length; i++){
    const sNum = picked[i].season_number;
    subEl.textContent = `Haetaan kausi ${i+1}/${picked.length}...`;
    progBar.style.width = (5 + (i / picked.length) * 90) + '%';

    const fresh = await fetchSeasonFromTmdb(_seasonImport.tmdbId, sNum);
    if(!fresh){ failed++; continue; }
    if(sNum === 0 && /^Kausi 0$/.test(fresh.name)) fresh.name = 'Erikoisjaksot';

    const target = findSeasonByNumber(r, sNum);
    if(target){
      const st = mergeSeasonInto(target, fresh);
      added += st.added; renamed += st.renamed; plots += st.plots;
    } else {
      r.seasons.push(seasonFromFresh(fresh));
      added += fresh.episodes.length;
      plots += fresh.episodes.filter(e => e.plot).length;
    }
  }

  // Pidä kaudet järjestyksessä, erikoisjaksot viimeisenä
  r.seasons.sort((a,b) => {
    const an = a.seasonNumber == null ? 998 : (a.seasonNumber === 0 ? 999 : a.seasonNumber);
    const bn = b.seasonNumber == null ? 998 : (b.seasonNumber === 0 ? 999 : b.seasonNumber);
    return an - bn;
  });

  if(!r.episodes_total){
    r.episodes_total = r.seasons.reduce((a,s) => a + (s.episodes || []).length, 0);
  }

  progBar.style.width = '100%';
  const bits = [];
  if(added) bits.push(`${added} jaksoa`);
  if(renamed) bits.push(`${renamed} nimeä täydennetty`);
  if(plots) bits.push(`${plots} juonta`);
  if(failed) bits.push(`${failed} kautta epäonnistui`);
  subEl.textContent = bits.length ? `✅ ${bits.join(' · ')}` : '✅ Kaikki oli jo ajan tasalla';
  _seasonImport = null;
  await window.fbSave();
  renderCards();
  setTimeout(() => overlay.classList.remove('open'), 2200);
};

// ── KONFETTI ──
function launchConfetti(){
  const colors = ['#e8b84b','#4ade80','#ff6b6b','#60a5fa','#a78bfa','#fb923c','#f0f0f5'];
  const count = 80;
  for(let i=0; i<count; i++){
    setTimeout(()=>{
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.left = Math.random()*100 + 'vw';
      el.style.top = '-20px';
      el.style.background = colors[Math.floor(Math.random()*colors.length)];
      el.style.width = (8+Math.random()*10)+'px';
      el.style.height = (8+Math.random()*10)+'px';
      el.style.borderRadius = Math.random()>0.5?'50%':'2px';
      el.style.animationDuration = (1.5+Math.random()*2)+'s';
      el.style.animationDelay = '0s';
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 4000);
    }, i*25);
  }
}

// ── FLIP ANIMAATIO ──
window.editReviewWithFlip = function(id){
  // Etsi kortti: muokkaa-nappi on kortissa, hae se ja siitä ylös kortti
  const btn = document.querySelector(`[onclick="editReviewWithFlip(${id})"]`);
  const card = btn ? btn.closest('.review-card') : null;
  if(card){
    card.classList.add('flipping');
    setTimeout(()=>{ card.classList.remove('flipping'); editReview(id); }, 250);
  } else {
    editReview(id);
  }
};

// ── EASTER EGG ──
let logoTapCount = 0;
let logoTapTimer = null;
const easterEggs = [
  { emoji:'🎬', text:'KRIITIKKO-MESTARI!', sub:'Olet katsonut liikaa elokuvia 😄' },
  { emoji:'⭐', text:'TÄHTIARVOSTELIJA!', sub:'Top 1% maailman parhaista kriitikoista' },
  { emoji:'🍿', text:'POPCORN-KUNINGAS!', sub:'Popcornia kulunut arviolta 47kg' },
  { emoji:'🎭', text:'SALAISUUS LÖYDETTY!', sub:'Olet todella utelias, hyvä niin!' },
  { emoji:'🏆', text:'ELOKUVA-GURU!', sub:'IMDb pelkää sinua' },
];
window.logoTap = function(){
  logoTapCount++;
  const logo = document.getElementById('appLogo');
  if(logo){ logo.style.transform='scale(1.15)'; setTimeout(()=>logo.style.transform='', 150); }
  if(logoTapTimer) clearTimeout(logoTapTimer);
  if(logoTapCount>=5){
    logoTapCount=0;
    const egg = easterEggs[Math.floor(Math.random()*easterEggs.length)];
    document.getElementById('easterEmoji').textContent = egg.emoji;
    document.getElementById('easterText').textContent = egg.text;
    document.querySelector('.easter-sub').textContent = egg.sub;
    document.getElementById('easterEggOverlay').classList.add('open');
    launchConfetti();
    return;
  }
  logoTapTimer = setTimeout(()=>{ logoTapCount=0; }, 2000);
};
window.closeEasterEgg = function(){
  document.getElementById('easterEggOverlay').classList.remove('open');
};


// ── TMDB HAKU ──
let tmdbTimer = null;

window.onTmdbInput = function(val) {
  clearTimeout(tmdbTimer);
  const results = document.getElementById('tmdbResults');
  if (!val || val.length < 2) { results.style.display = 'none'; return; }
  tmdbTimer = setTimeout(() => searchTmdb(val), 400);
};

async function searchTmdb(query) {
  const token = window.tmdbToken;
  if (!token) { return; }
  const spinner = document.getElementById('tmdbSpinner');
  const results = document.getElementById('tmdbResults');
  spinner.style.display = 'block';
  results.style.display = 'none';

  // Valitaan haku kategorian mukaan
  const cat = document.getElementById('formCat')?.value || '';
  const isTv = cat === 'TV-sarjat';
  const searchType = isTv ? 'tv' : 'multi';

  try {
    const url = `https://api.themoviedb.org/3/search/${searchType}?query=${encodeURIComponent(query)}&language=fi-FI&page=1`;
    const res = await window.tmdbFetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const data = await res.json();
    spinner.style.display = 'none';
    const items = (data.results || []).slice(0, 6).filter(i => i.media_type !== 'person');
    if (!items.length) { results.style.display = 'none'; return; }
    // Tallennetaan tulokset muuttujaan — ei JSON-enkoodausta onclickiin
    window._tmdbSearchResults = items;
    results.innerHTML = items.map((item, idx) => {
      const title = item.title || item.name || '';
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const type = item.media_type === 'tv' || isTv ? 'TV' : 'Elokuva';
      const poster = item.poster_path ? `https://image.tmdb.org/t/p/w154${item.poster_path}` : '';
      const imgEl = poster ? `<img class="tmdb-poster" src="${poster}" alt="" loading="lazy">` : `<div class="tmdb-poster" style="display:flex;align-items:center;justify-content:center;font-size:22px;">🎬</div>`;
      const genres = (item.genre_ids || []).slice(0, 2).map(id => tmdbGenreMap[id]).filter(Boolean).join(', ');
      return `<div class="tmdb-item" onclick="fillFromTmdb(${idx})">
        ${imgEl}
        <div class="tmdb-item-info">
          <div class="tmdb-item-title">${esc(title)}${year ? `<span class="tmdb-item-year">${esc(year)}</span>` : ''}</div>
          <div class="tmdb-item-meta">${type}${genres ? ' · ' + esc(genres) : ''}</div>
          <div class="tmdb-item-rating">${item.vote_count ? `⭐ <strong>${Number(item.vote_average).toFixed(1)}</strong>/10 · ${item.vote_count} ääntä` : 'ei vielä arvioita'}</div>
        </div>
      </div>`;
    }).join('');
    results.style.display = 'block';
  } catch(e) {
    spinner.style.display = 'none';
  }
}

const tmdbGenreMap = {
  28:'Toiminta',12:'Seikkailu',16:'Animaatio',35:'Komedia',80:'Rikostarina',
  99:'Dokumentti',18:'Draama',10751:'Perhe',14:'Fantasia',36:'Historia',
  27:'Kauhu',10402:'Musiikki',9648:'Mysteeri',10749:'Romantiikka',878:'Sci-fi',
  10770:'TV-elokuva',53:'Trilleri',10752:'Sota',37:'Western',
  10759:'Toiminta',10762:'Lastenohjelma',10763:'Uutiset',10764:'Reality',
  10765:'Sci-fi & Fantasia',10766:'Saippuasarja',10767:'Talkshow',10768:'Sota & Politiikka'
};

window.fillFromTmdb = async function(idx) {
  const item = window._tmdbSearchResults && window._tmdbSearchResults[idx];
  if (!item) return;
  const token = window.tmdbToken;
  const isTv = item.media_type === 'tv' || document.getElementById('formCat')?.value === 'TV-sarjat';
  const tmdbId = item.id;

  // Näytä latausikkuna
  const overlay = document.getElementById('tmdbLoadingOverlay');
  const subEl = document.getElementById('tmdbLoadingSub');
  const progBar = document.getElementById('tmdbProgressBar');
  overlay.classList.add('open');
  subEl.textContent = 'Haetaan tietoja...';
  progBar.style.width = '10%';

  // Piilota tulokset
  document.getElementById('tmdbResults').style.display = 'none';
  document.getElementById('tmdbSearchInput').value = '';

  try {
    const lang = 'fi-FI';
    // Hae täydet tiedot
    const detailUrl = `https://api.themoviedb.org/3/${isTv?'tv':'movie'}/${tmdbId}?language=${lang}&append_to_response=credits`;
    const detailRes = await window.tmdbFetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } });
    const detail = await detailRes.json();
    progBar.style.width = '30%';

    const title = (detail.title || detail.name || '').toUpperCase();
    const year = (detail.release_date || detail.first_air_date || '').slice(0, 4);
    const overview = detail.overview || '';
    const genreIds = (detail.genres || []).map(g => g.id);
    const poster = detail.poster_path || null;
    const tmdb_score = detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null;
    const country = (detail.production_countries || detail.origin_country || []);
    const countryStr = Array.isArray(country) ? (country[0]?.iso_3166_1 || country[0] || '') : '';

    // Näyttelijät
    const cast = (detail.credits?.cast || []).slice(0, 5).map(a => a.name);

    // Ohjaaja (elokuvat) tai luoja (TV)
    let director = null;
    if (!isTv) {
      const dir = (detail.credits?.crew || []).find(c => c.job === 'Director');
      director = dir ? dir.name : null;
    } else {
      const creators = detail.created_by || [];
      director = creators.length ? creators[0].name : null;
    }

    // Kesto / jaksomäärä
    const runtime = detail.runtime || null;
    const episodes_total = detail.number_of_episodes || null;

    // Täytä lomake
    const nameEl = document.getElementById('formName');
    if (nameEl) nameEl.value = String(title || '').toUpperCase();
    const yearEl = document.getElementById('formYear');
    if (yearEl) yearEl.value = year || '';

    // Juoni menee juonikenttään heti, jotta sen näkee ennen tallennusta.
    // Ilman tätä applyFormPlot() lukisi tyhjän kentän ja juoni katoaisi
    // uutta arvostelua luotaessa. Oma kirjoitettu teksti ei ylikirjoitu:
    // siitä huolehtii fillFormPlotFromTmdb itse.
    if(window.fillFormPlotFromTmdb) window.fillFormPlotFromTmdb(overview);


    // Genret
    setTimeout(() => {
      document.querySelectorAll('.genre-chip').forEach(chip => {
        const chipGenre = chip.textContent.trim();
        const match = (detail.genres || []).some(g => {
          const mapped = tmdbGenreMap[g.id];
          return mapped === chipGenre;
        });
        if (match) chip.classList.add('genre-chip-active');
      });
    }, 100);

    progBar.style.width = '50%';

    // Tallenna pending TMDB-data
    const tf = extractTmdbFields(detail, isTv);
    window._tmdbPending = Object.assign({}, tf, {
      poster, director, runtime, episodes_total,
      country: countryStr, cast, tmdb_score,
      tmdb_id: tmdbId, plot: overview || null,
      tmdb_checked: new Date().toISOString().slice(0,10)
    });

    // Jos TV-sarja — hae kaudet ja jaksot yhteisellä logiikalla
    // Sama totuuden lähde kuin saveReview():lla. Aiemmin tämä luki DOMin
    // .selected-luokkaa, joka saattoi olla edellisestä lomakkeesta jäänyt
    // — silloin kaudet haettiin turhaan ja tallennus heitti ne pois.
    const tvType = (typeof selectedTvType !== 'undefined') ? selectedTvType : null;
    if (isTv && tvType === 'jaksot') {
      const numSeasons = detail.number_of_seasons || 0;
      const seasons = [];
      for (let s = 1; s <= numSeasons; s++) {
        subEl.textContent = `Haetaan kausi ${s}/${numSeasons}...`;
        progBar.style.width = (50 + (s / numSeasons) * 45) + '%';
        const fresh = await fetchSeasonFromTmdb(tmdbId, s);
        if (!fresh) { seasons.push({ name: `Kausi ${s}`, seasonNumber: s, episodes: [] }); continue; }
        // Ei automaattikäännöstä. Suomi käytetään jos TMDB:ssä on suomi,
        // muuten englanti. Kääntäminen tehdään erikseen napista.
        seasons.push(seasonFromFresh(fresh));
      }
      window._tmdbPending.seasons = seasons;
      const epCount = seasons.reduce((a, x) => a + x.episodes.length, 0);
      const enCount = seasons.reduce((a, x) => a + x.episodes.filter(e => e.plotLang === 'en').length, 0);
      subEl.textContent = `${seasons.length} kautta, ${epCount} jaksoa`
        + (enCount ? ` · ${enCount} juonta englanniksi` : '');
    }

    progBar.style.width = '100%';
    setTimeout(() => overlay.classList.remove('open'), 800);

    // Näytä vahvistus
    const badge = document.createElement('div');
    badge.style.cssText = 'background:rgba(74,222,128,0.15);border:1px solid #4ade80;border-radius:8px;padding:8px 12px;font-size:13px;color:#4ade80;font-weight:600;margin-bottom:10px;';
    const infoparts = [];
    if (director) infoparts.push(`🎬 ${director}`);
    if (runtime) infoparts.push(`⏱️ ${runtime} min`);
    if (episodes_total) infoparts.push(`📺 ${episodes_total} jaksoa`);
    if (cast.length) infoparts.push(`🎭 ${cast.slice(0,2).join(', ')}`);
    badge.innerHTML = `✅ <strong>${detail.title || detail.name}</strong>${infoparts.length ? '<br><span style="font-weight:400;font-size:12px;">' + infoparts.join(' · ') + '</span>' : ''}`;
    const tmdbSection = document.getElementById('tmdbSearchSection');
    tmdbSection.after(badge);
    setTimeout(() => badge.remove(), 5000);

  } catch(e) {
    overlay.classList.remove('open');
    console.error('TMDB error:', e);
  }
};

// Piilota TMDB-tulokset kun klikataan muualle
document.addEventListener('click', e => {
  if (!e.target.closest('#tmdbSearchSection')) {
    const r = document.getElementById('tmdbResults');
    if (r) r.style.display = 'none';
  }
});

// Näytä TMDB-haku vain elokuva/TV-kategorioissa
window.onTmdbCatChange = function(cat) {
  const section = document.getElementById('tmdbSearchSection');
  if (!section) return;
  section.style.display = (cat === 'Elokuvat' || cat === 'TV-sarjat') ? 'block' : 'none';
};


window.closeModal = function(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('open');
  // Nollaa mahdollinen päällekkäisyyttä varten asetettu kerros
  if(el.dataset.stacked){ el.style.zIndex = ''; delete el.dataset.stacked; }
};

// Avaa modaalin varmasti kaikkien jo auki olevien päälle.
// Modaalit ovat HTML:ssä eri järjestyksessä ja niillä on sama z-index,
// joten esimerkiksi asetuksista avattu ikkuna jäisi muuten asetusten alle
// — näkymättömiin, jolloin vaikuttaa siltä ettei nappi toimi lainkaan.
window.openModalOnTop = function(id){
  const el = document.getElementById(id);
  if(!el) return;
  let max = 1000;
  document.querySelectorAll('.modal-overlay.open').forEach(m => {
    if(m === el) return;
    let z = parseInt(m.style.zIndex, 10);
    if(isNaN(z)){
      try { z = parseInt(getComputedStyle(m).zIndex, 10); } catch(e){ z = NaN; }
    }
    if(!isNaN(z) && z > max) max = z;
  });
  el.style.zIndex = String(max + 10);
  el.dataset.stacked = '1';
  el.classList.add('open');
};

window.closeModalIfOutside = function(e, id){
  if(e.target===document.getElementById(id)) closeModal(id);
};
