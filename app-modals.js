// ══ ARVOSTELUT · budjetti, asetukset, modaalit, TMDB-haku ══
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
  el.innerHTML = `${st.reviews} arvostelua · ${st.kb} kt yhteensä${extra}${cache}`;
}

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
window.openSettings = function(){
  if(!appData.genres) appData.genres = [...DEFAULT_GENRES];
  GENRES = [...appData.genres];
  renderCatManage();
  renderGenreManage();
  renderAccentRow();
  renderPrecisionRow();
  renderWeightRows();
  updatePosterColorToggle();
  renderTmdbStatus();
  renderBackupInfo();
  _oldDocReport = null;
  const odr = document.getElementById('oldDocReport');
  if(odr) odr.innerHTML = '';
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
  box.innerHTML = `
    <div>${statusLine}</div>
    <div style="margin-top:6px;">📅 Myönnetty: ${issued}</div>
    <div>🕓 Viimeksi tarkistettu: ${checkedAt}</div>
    <div style="margin-top:8px;font-size:11px;opacity:0.8;">TMDB:n lukutunnuksilla ei ole kiinteää vanhenemispäivää — sovellus testaa toimivuuden oikealla API-kutsulla joka kerta kun sovellus käynnistetään.</div>
  `;
}
window.refreshTmdbStatusInSettings = renderTmdbStatus;

function renderCatManage(){
  const el = document.getElementById('catManageList');
  if(!el) return;
  el.innerHTML = appData.categories.map((c,i)=>`
    <div class="cat-row">
      <span class="cat-row-name">${esc(c)}</span>
      ${!DEFAULT_CATS.includes(c)?`<button class="cat-del" onclick="deleteCat(${i})">Poista</button>`:'<span style="font-size:12px;color:var(--muted);">vakio</span>'}
    </div>
  `).join('');
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
  if(appData.reviews.some(r=>r.category===cat)){
    alert('Poista ensin kaikki tämän kategorian arvostelut!'); return;
  }
  if(!confirm(`Poistetaanko kategoria "${cat}"?`)) return;
  appData.categories.splice(i,1);
  if(activeCat===cat) activeCat = appData.categories[0]||null;
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
  const cls = score!=null?(score>=70?'high':score>=40?'mid':'low'):'mid';

  const extraRows = [];
  if(r.director) extraRows.push(`<div class="read-section"><div class="read-label">🎬 Ohjaaja</div><div class="read-value">${esc(r.director)}</div></div>`);
  if(r.cast && r.cast.length) extraRows.push(`<div class="read-section"><div class="read-label">🎭 Näyttelijät</div><div class="read-value">${esc(r.cast.join(', '))}</div></div>`);
  if(r.runtime) extraRows.push(`<div class="read-section"><div class="read-label">⏱️ Kesto</div><div class="read-value">${r.runtime} min</div></div>`);
  if(r.episodes_total) extraRows.push(`<div class="read-section"><div class="read-label">📺 Jaksoja</div><div class="read-value">${r.episodes_total}</div></div>`);
  if(r.country) extraRows.push(`<div class="read-section"><div class="read-label">🌍 Maa</div><div class="read-value">${esc(r.country)}</div></div>`);
  if(r.tmdb_score) extraRows.push(`<div class="read-section"><div class="read-label">⭐ TMDB-arvosana</div><div class="read-value">${r.tmdb_score}/10</div></div>`);

  const posterHtml = r.poster ? `<img src="https://image.tmdb.org/t/p/w200${r.poster}" style="width:70px;height:105px;object-fit:cover;border-radius:8px;flex-shrink:0;" alt="">` : '';

  document.getElementById('readModalContent').innerHTML = `
    <div class="read-ring-row" style="align-items:flex-start;gap:12px;">
      ${posterHtml}
      <div style="flex:1;">
        ${score!=null?buildRing(score):''}
        <div class="read-title">${escNl(r.name)}${r.year?` <span class="read-year">${r.year}</span>`:''}</div>
        <div class="read-sub">${esc(r.category)}${genres.length?' · '+esc(genres.join(', ')):''}</div>
        ${r.mark==='heart'?'<span style="color:#ff6482;font-size:13px;font-weight:700;">❤️ Suosikki</span>':''}
        ${r.mark==='skull'?'<span style="color:#aaa;font-size:13px;font-weight:700;">💀 Huono</span>':''}
      </div>
    </div>
    ${extraRows.join('')}
    ${r.plot?`<div class="read-section">
      <div class="read-label">📖 Juoni</div>
      <div class="read-value" style="color:var(--muted);font-style:italic;">${escNl(r.plot)}</div>
    </div>`:''}
    ${r.note?`<div class="read-section">
      <div class="read-label">Arvostelu</div>
      <div class="read-value read-note">${mdText(r.note)}</div>
    </div>`:''}
    ${dateStr?`<div class="read-section">
      <div class="read-label">Päivämäärä</div>
      <div class="read-value">📅 ${dateStr}</div>
    </div>`:''}
  `;
  // "Tarkista sijoitus" vain jos arvostelulla on oma piste ja vertailtavia löytyy
  const rrHost = document.getElementById('readModalContent');
  const ownScore = (!r.tvType || r.tvType === 'kokonaisuus') ? r.score : null;
  if(ownScore != null && ratingsEligible(r.category)){
    const cand = getComparisonCandidates(r.category, Array.isArray(r.genre)?r.genre:(r.genre?[r.genre]:[]), r.id);
    if(cand.list.length >= 2){
      rrHost.insertAdjacentHTML('beforeend',
        `<button type="button" class="rerank-btn" onclick="openRerank(${id})">⚖️ Tarkista sijoitus</button>`);
    }
  }
  document.getElementById('readEditBtn').setAttribute('onclick', `closeModal('readModal'); editReviewWithFlip(${id})`);
  document.getElementById('readModal').classList.add('open');
};

// ── JAKSONIMIEN KÄÄNTÄMINEN SUOMEKSI (MyMemory API) ──
async function translateEpisodeNamesBatch(names) {
  const toTranslate = names.map((n, i) => ({ i, n: (n || '').trim() })).filter(x => x.n);
  if (!toTranslate.length) return names;

  // MyMemory tukee max ~500 merkkiä per kutsu — pilko eriin
  const BATCH_SIZE = 10;
  const result = [...names];

  for (let b = 0; b < toTranslate.length; b += BATCH_SIZE) {
    const batch = toTranslate.slice(b, b + BATCH_SIZE);
    // Yhdistä nimien välimerkeillä jotka ovat helppo splitata
    const joined = batch.map(x => x.n).join(' ||| ');
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(joined)}&langpair=en|fi`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const parts = data.responseData.translatedText.split(' ||| ');
        batch.forEach((x, idx) => {
          const translated = parts[idx] ? parts[idx].trim() : '';
          // Käytä käännöstä vain jos se ei ole tyhjä eikä identtinen englanniksi
          if (translated && translated.toLowerCase() !== x.n.toLowerCase()) {
            result[x.i] = translated;
          }
        });
      }
    } catch (e) { /* fallback: pidä englanninkieliset */ }
  }
  return result;
}

// ── AI ARVOSTELU ──
let aiGeneratedText = '';
window.generateAIReview = function(){
  const note = document.getElementById('formNote').value.trim();
  const name = document.getElementById('formName').value.trim().split('\n')[0];
  const cat = document.getElementById('formCat')?.value||'';
  const genres = getSelectedGenres();
  const score = selectedScore;

  if(!note){ alert('Kirjoita ensin muutama avainsana lisätiedot-kenttään!'); return; }

  const resultEl = document.getElementById('aiResult');
  const textEl = document.getElementById('aiResultText');
  resultEl.classList.add('open');
  textEl.innerHTML = '<span style="color:var(--muted);">✨ Generoidaan...</span>';

  // Analysoi avainsanat ja rakenna arvostelu älykkäästi
  setTimeout(()=>{
    aiGeneratedText = buildSmartReview(note, name, cat, genres, score);
    textEl.innerHTML = aiGeneratedText.replace(/\n/g,'<br>');
  }, 600);
};

function buildSmartReview(keywords, name, cat, genres, score){
  const kw = keywords.toLowerCase();
  const sentences = [];

  // Sanakirja: avainsana -> lause joka käyttää sitä suoraan
  const wordMap = [
    { words:['hauska','nauratti','humoristinen'], fn: ()=>'Huumori on parhaimmillaan ja jakso naurattaa oikeissa kohdissa.' },
    { words:['viihdyttävä','piristävä','kevyt'], fn: ()=>'Jakso on viihdyttävä — helppo katsottava ilman suurempia odotuksia.' },
    { words:['tylsä','pitkästyttävä','kuiva'], fn: ()=>'Paikoin tempoa voisi kiristää, sillä jakso tuntuu venähtävän turhaan.' },
    { words:['hyvä tarina','hyvä juoni','tarina on','juoni on'], fn: ()=>'Tarina on kirjoitettu hyvin ja pitää katsojan mukana alusta loppuun.' },
    { words:['surullinen','koskettava','itketti','liikuttava'], fn: ()=>'Jakso on yllättävän koskettava ja herättää aitoja tunteita.' },
    { words:['jännittävä','intensiivinen','vauhdikas'], fn: ()=>'Jännitys pysyy yllä läpi jakson eikä katse halua irrottautua ruudusta.' },
    { words:['hyvät näyttälijät','näyttelijät','roolisuoritukset'], fn: ()=>'Näyttelijäsuoritukset ovat vahvoja ja henkilöhahmot tuntuvat aidoilta.' },
    { words:['loppu on','loppu oli','lopetus'], fn: ()=>`Lopetus on jakson vahvin hetki — se jättää hyvän fiiliksen.` },
    { words:['huono loppu','pettymys loppu'], fn: ()=>'Lopetus jättää toivomisen varaa ja tuntuu hieman hutiloidulta.' },
    { words:['erinomainen','loistava','mahtava','upea','fantastinen'], fn: ()=>'Kokonaisuutena yksi sarjan vahvimmista jaksoista.' },
    { words:['huono','pettymys','heikko','turha'], fn: ()=>'Jakso ei onnistu lunastamaan odotuksia ja jää sarjan heikompaan päähän.' },
    { words:['raukkaus','liikaa raukkaus','seksijuttuja'], fn: ()=>'Käsikirjoituksessa on turhan paljon asiaan kuulumatonta täytettä.' },
    { words:['hahmo','hahmonkehitys','kehitys'], fn: ()=>'Hahmojen kehitys on hienosti kirjoitettu ja tuntuu luontevalta.' },
    { words:['dramaattinen','raskas','synkkä'], fn: ()=>'Jakso on tunnelataukseltaan raskas mutta se sopii sarjan sävyyn.' },
  ];

  // Kerää lauseet jotka osuvat käyttäjän sanoihin
  const usedSentences = new Set();
  wordMap.forEach(({words, fn})=>{
    if(words.some(w=>kw.includes(w))){
      const s = fn();
      if(!usedSentences.has(s)){ usedSentences.add(s); sentences.push(s); }
    }
  });

  // Jos ei löydy yhtään osumaa, käytä yleistä aloitusta
  if(sentences.length === 0){
    const title = name || 'Tämä jakso';
    sentences.push(`${title} on tasapainoinen kokemus — ei huippu eikä pohja.`);
  }

  // Lopuksi pisteisiin perustuva yhteenveto JOS pisteet on annettu
  if(score!=null){
    if(score>=85) sentences.push(`Pisteytys ${score}/100 kertoo kaiken — ehdottomasti sarjan parhaimmistoa.`);
    else if(score>=70) sentences.push(`Vahva jakso, ${score} pistettä ansaitusti.`);
    else if(score>=50) sentences.push(`Kohtuullinen jakso ${score} pisteellä — ei täydellinen mutta toimiva.`);
    else sentences.push(`${score} pistettä kuvastaa hyvin jakson tasoa — jää sarjan heikommaksi hetkeksi.`);
  }

  return sentences.join(' ');
}

let savedOwnReview = '';
window.keepOwnReview = function(){
  document.getElementById('aiResult').classList.remove('open');
  aiGeneratedText = '';
};
window.useAIReview = function(){
  const noteEl = document.getElementById('formNote');
  if(noteEl){ savedOwnReview = noteEl.value; noteEl.value = aiGeneratedText; }
  document.getElementById('aiResult').classList.remove('open');
};

// AI jakso-modalissa
let aiGeneratedTextPart = '';
window.generateAIReviewPart = function(){
  const note = document.getElementById('partNote').value.trim();
  const name = document.getElementById('partName').value.trim();
  if(!note){ alert('Kirjoita ensin muutama avainsana lisätiedot-kenttään!'); return; }
  const resultEl = document.getElementById('aiResultPart');
  const textEl = document.getElementById('aiResultPartText');
  resultEl.classList.add('open');
  textEl.innerHTML = '<span style="color:var(--muted);">✨ Generoidaan...</span>';
  setTimeout(()=>{
    aiGeneratedTextPart = buildSmartReview(note, name, 'TV-sarjat', [], selectedPartScore);
    textEl.innerHTML = aiGeneratedTextPart.replace(/\n/g,'<br>');
  }, 600);
};
window.keepOwnReviewPart = function(){
  document.getElementById('aiResultPart').classList.remove('open');
  aiGeneratedTextPart = '';
};
window.useAIReviewPart = function(){
  const noteEl = document.getElementById('partNote');
  if(noteEl){ noteEl.value = aiGeneratedTextPart; }
  document.getElementById('aiResultPart').classList.remove('open');
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
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
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
    const detailRes = await fetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } });
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

    // Juoni tallennetaan erikseen — EI lomakkeen arvostelukenttään

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
    window._tmdbPending = { poster, director, runtime, episodes_total, country: countryStr, cast, tmdb_score, tmdb_id: tmdbId, plot: overview || null };

    // Jos TV-sarja — hae kaudet ja jaksot
    const tvType = document.querySelector('.tv-type-opt.selected')?.dataset?.type;
    if (isTv && tvType === 'jaksot') {
      const numSeasons = detail.number_of_seasons || 0;
      subEl.textContent = `Haetaan ${numSeasons} kautta...`;
      const seasons = [];
      for (let s = 1; s <= numSeasons; s++) {
        subEl.textContent = `Haetaan kausi ${s}/${numSeasons}...`;
        progBar.style.width = (50 + (s / numSeasons) * 45) + '%';
        try {
          const sUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${s}?language=${lang}`;
          const sRes = await fetch(sUrl, { headers: { Authorization: `Bearer ${token}` } });
          const sData = await sRes.json();

          // Tarkista onko nimet geneerisiä (Jakso 1, Jakso 2...) — jos on, hae englanninkieliset
          const fiEps = sData.episodes || [];
          const hasGenericNames = fiEps.length > 0 && fiEps.every(ep =>
            !ep.name || ep.name.trim() === `Jakso ${ep.episode_number}` || ep.name.trim() === `Episode ${ep.episode_number}`
          );
          let enEps = [];
          if (hasGenericNames) {
            try {
              const enUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${s}?language=en-US`;
              const enRes = await fetch(enUrl, { headers: { Authorization: `Bearer ${token}` } });
              const enData = await enRes.json();
              enEps = enData.episodes || [];
            } catch(e2) {}
          }

          const episodes = fiEps.map((ep, i) => {
            const enEp = enEps[i];
            const fiName = ep.name ? ep.name.trim() : '';
            const isGeneric = !fiName || fiName === `Jakso ${ep.episode_number}` || fiName === `Episode ${ep.episode_number}`;
            const name = isGeneric && enEp && enEp.name ? enEp.name : fiName;
            return {
              episode: ep.episode_number,
              name,
              note: ep.overview || (enEp && !ep.overview ? enEp.overview : '') || '',
              score: null
            };
          });

          // Käännä englanninkieliset nimet suomeksi Claudella jos tarpeen
          if (hasGenericNames && enEps.length > 0) {
            subEl.textContent = `✨ Käännetään kausi ${s} suomeksi...`;
            const rawNames = episodes.map(e => e.name);
            const translated = await translateEpisodeNamesBatch(rawNames);
            translated.forEach((name, i) => { if (episodes[i]) episodes[i].name = name; });
          }

          seasons.push({ name: sData.name || `Kausi ${s}`, episodes });
        } catch(e) {
          seasons.push({ name: `Kausi ${s}`, episodes: [] });
        }
      }
      window._tmdbPending.seasons = seasons;
      subEl.textContent = `✅ ${seasons.length} kautta, ${seasons.reduce((a,s)=>a+s.episodes.length,0)} jaksoa haettu!`;
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
  if(el) el.classList.remove('open');
};

window.closeModalIfOutside = function(e, id){
  if(e.target===document.getElementById(id)) closeModal(id);
};
