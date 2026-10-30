// Versioleima — tools/bump-version.js päivittää tämän automaattisesti.
window.BUILD_AI = '2026-10-26.0';

// ════════════════════════════════════════════════════════════
// AI-ARVOSTELU
// Muotoilee Lisätiedot-kenttään kirjoitetut omat pohdinnat arvosteluksi
// Googlen Gemini-mallilla. Tulos näytetään omana ehdotuksenaan kentän
// alla, jotta omaa ja AI:n versiota voi verrata ennen valintaa.
//
// Reitit:
//  1. Oma avain asetuksissa (settings.geminiKey) → suoraan Geminille
//  2. Muuten Firebase AI Logic
//
// Laajasta arvioinnista poimitaan mukaan vain parhaat ja heikoimmat
// osa-alueet (enintään 3 + 3), samalla logiikalla kuin arvostelun
// "Vahvuudet ja heikkoudet" -laatikossa.
// ════════════════════════════════════════════════════════════
(function(){
  const SDK = 'https://www.gstatic.com/firebasejs/12.10.0/';
  const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
  // Nopein ensin riittävällä laadulla; kevyempi varalla.
  const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  // Hiljaisuusraja: jos Googlelta ei kuulu mitään näin pitkään, pyyntö
  // katkaistaan eikä nappi jää roikkumaan. Mietintä mahtuu tähän reilusti.
  const IDLE_MS = 45000;
  // Vaiheen ilmoitus käyttöliittymälle (asetetaan aiWriteReview:ssä)
  let onPhase = function(){};
  let onThought = function(){};

  let aiPromise = null;
  let undoText = null;
  let suggestion = null;
  let busy = false;

  // ── APURIT ──
  function val(id){
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }
  function ownKey(){
    const st = (typeof appData !== 'undefined' && appData && appData.settings) || {};
    return String(st.geminiKey || '').trim();
  }
  function statusOf(e){
    const s = e && e.customErrorData && e.customErrorData.status;
    if(s) return +s;
    const m = String((e && e.message) || '').match(/\[(\d{3})\b/);
    return m ? +m[1] : 0;
  }
  function isTimeout(e){
    return e && (e.name === 'AbortError' || e.isTimeout || /abort|timed? ?out|aikaraja/i.test(String(e.message)));
  }

  // ── LAAJA ARVIOINTI: PARHAAT JA HEIKOIMMAT ──
  function ratingHighlights(ratings, sub){
    try{
      if(!ratings) return null;
      const set = ratingSet(sub);
      if(!set) return null;
      const scored = set.dims
        .map(d => ({ d, v: ratings[d.id] }))
        .filter(x => isAnswered(x.v));
      if(scored.length < 4) return null;
      const vals = scored.map(x => x.v);
      if(Math.max(...vals) === Math.min(...vals)) return null;
      const order = new Map(set.dims.map((d, i) => [d.id, i]));
      const ranked = scored.slice().sort((a,b) => b.v - a.v || order.get(a.d.id) - order.get(b.d.id));
      const n = Math.min(3, Math.floor(scored.length / 2));
      const setKey = ratingSetKey(sub);
      const fmt = x => {
        const name = String(x.d.dynamic ? 'Genrelupaus' : x.d.label).replace(/^[^\p{L}]+/u, '').trim();
        const lv = ratingLevels(dimScaleId(setKey, x.d)).find(l => l.v === x.v);
        return name + ': ' + (lv ? lv.label : x.v + '/6') + (x.d.hint ? ' (' + x.d.hint + ')' : '');
      };
      return {
        best:  ranked.slice(0, n).map(fmt),
        worst: ranked.slice(-n).reverse().map(fmt)
      };
    } catch(e){ return null; }
  }

  // ── KEHOTE ──
  // Lomakkeen tiedot kehotteen muotoon
  function formInfo(notes){
    let ratings = null, sub = '';
    try{
      if(typeof selectedRatings !== 'undefined') ratings = selectedRatings;
      if(typeof formRatingSub === 'function') sub = formRatingSub();
    } catch(e){}
    return {
      title: val('formName'), year: val('formYear'), cat: val('formCat'), plot: val('formPlot'),
      score: (typeof selectedScore === 'number') ? selectedScore : null,
      hl: ratingHighlights(ratings, sub), notes
    };
  }
  // Tallennetun arvostelun tiedot kehotteen muotoon (joukkoarvostelu)
  function reviewInfo(r){
    return {
      title: plainName(r), year: r.year ? String(r.year) : '', cat: r.category || '',
      plot: String(r.plot || ''), score: (typeof r.score === 'number') ? r.score : null,
      hl: ratingHighlights(r.ratings, subcatOf(r)), notes: sourceNote(r)
    };
  }
  // Joukkoarvostelun lähdeteksti: jos AI-teksti on jo otettu käyttöön,
  // uusi versio tehdään alkuperäisistä muistiinpanoista.
  function sourceNote(r){
    return String((r.aiOrigNote != null ? r.aiOrigNote : r.note) || '').trim();
  }

  function buildPrompt(info){
    const { title, year, cat, plot, score, hl, notes } = info;

    const L = [];
    L.push('Olet kokenut suomalainen elokuva- ja sarjakriitikko. Kirjoita arvostelu, joka perustuu katsojan muistiinpanoihin, mutta on selvästi oma, viimeistelty tekstinsä — ei muistiinpanojen siistitty versio.');
    L.push('');
    L.push('Näin kirjoitat:');
    L.push('- Kirjoita kokonaan omin sanoin ja omalla rakenteella. Älä toista muistiinpanojen lauseita tai sanajärjestystä.');
    L.push('- Avaa jokaista havaintoa: miksi se toimii tai ei toimi, ja miten se vaikuttaa katselukokemukseen. Lyhyt maininta muistiinpanoissa saa kasvaa perustelluksi ajatukseksi.');
    L.push('- Rakenne: vetävä avaus joka kertoo mistä teoksessa on kyse ja millainen kokonaisvaikutelma on, sitten havainnot perusteluineen, lopuksi napakka kokoava tuomio.');
    L.push('- Pituus 3 lyhyttä kappaletta, yhteensä noin 120–180 sanaa.');
    L.push('- Sävy ja kokonaisarvio noudattavat katsojan näkemystä. Älä keksi uusia mielipiteitä, kehuja tai moitteita, joille ei ole pohjaa muistiinpanoissa tai osa-arvioissa.');
    L.push('- Älä mainitse näyttelijöiden, ohjaajan tai henkilöhahmojen nimiä. Älä kerro juonta uudelleen.');
    L.push('- Hyvää, elävää yleiskieltä. Ei otsikkoa, tähtiä, arvosanaa, luettelomerkkejä eikä muotoilumerkkejä — pelkkä arvosteluteksti.');
    L.push('');
    if(title) L.push('Teos: ' + title + (year ? ' (' + year + ')' : '') + (cat ? ', ' + cat : ''));
    if(plot) L.push('Juoni taustatiedoksi (älä toista sitä): ' + plot.slice(0, 900));
    if(score !== null) L.push('Katsojan pisteet: ' + score + '/100 (käytä sävyn mitoittamiseen, älä mainitse lukua).');
    if(hl){
      L.push('');
      L.push('Katsojan laajasta arvioinnista nousivat esiin nämä — puno ne luontevasti tekstiin, älä luettele:');
      L.push('Vahvimmat: ' + hl.best.join('; '));
      L.push('Heikoimmat: ' + hl.worst.join('; '));
    }
    L.push('');
    L.push('Katsojan muistiinpanot:');
    L.push(notes);
    return L.join('\n');
  }

  // ── REITTI 1: OMA AVAIN ──
  // Tavallinen (ei suoratoistettu) pyyntö ilman mietintäasetuksia: tämä
  // muoto on todettu toimivaksi AQ.-avaimella. Malli saa miettiä
  // oletuksensa mukaan. Aikaraja estää loputtoman odotuksen.
  async function callDirect(model, prompt, apiKey, timeoutMs){
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try{
      const res = await fetch(API + model + ':generateContent', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.0, maxOutputTokens: 8192 }
        })
      });
      let data = null;
      try{ data = await res.json(); } catch(e){}
      if(!res.ok){
        const err = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        err.customErrorData = { status: res.status };
        err.directKey = true;
        throw err;
      }
      const parts = data && data.candidates && data.candidates[0] &&
                    data.candidates[0].content && data.candidates[0].content.parts;
      const text = (parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
      if(!text) throw new Error('Tyhjä vastaus');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  // Päämalli saa aikaa 75 s (mietintä mukaan lukien). Jos se ei ehdi
  // tai on ruuhkassa, kevyt malli yrittää vielä 40 s.
  async function generateDirect(prompt, apiKey){
    const attempts = [
      { model: MODELS[0], ms: 75000 },
      { model: MODELS[1], ms: 40000, fallback: true }
    ];
    let lastErr = null;
    for(const a of attempts){
      if(a.fallback) onPhase('fallback');
      try{ return await callDirect(a.model, prompt, apiKey, a.ms); }
      catch(e){
        lastErr = e;
        const s = statusOf(e);
        if(s === 401 || s === 403) break;
      }
    }
    throw lastErr || new Error('Tuntematon virhe');
  }

  // ── REITTI 2: FIREBASE AI LOGIC ──
  function loadAi(){
    if(!aiPromise){
      aiPromise = Promise.all([
        import(SDK + 'firebase-app.js'),
        import(SDK + 'firebase-ai.js')
      ]).then(([appMod, aiMod]) => ({
        ai: aiMod.getAI(appMod.getApp(), { backend: new aiMod.GoogleAIBackend() }),
        getGenerativeModel: aiMod.getGenerativeModel
      })).catch(e => { aiPromise = null; throw e; });
    }
    return aiPromise;
  }

  async function generateFirebase(prompt){
    const { ai, getGenerativeModel } = await loadAi();
    let lastErr = null;
    for(const name of MODELS){
      try{
        const model = getGenerativeModel(ai, {
          model: name,
          generationConfig: { temperature: 1.0, maxOutputTokens: 8192 }
        }, { timeout: 75000 });
        const res = await model.generateContent(prompt);
        const text = String(res.response.text() || '').trim();
        if(!text) throw new Error('Tyhjä vastaus');
        return text;
      } catch(e){
        lastErr = e;
        const s = statusOf(e);
        if(s === 401 || s === 403) break;
        if(/api-not-enabled|not been used|disabled|genai config/i.test(String(e && e.message))) break;
      }
    }
    throw lastErr || new Error('Tuntematon virhe');
  }

  async function generate(prompt, keyOverride){
    const k = keyOverride || ownKey();
    if(k) return generateDirect(prompt, k);
    return generateFirebase(prompt);
  }

  function friendly(e){
    const msg = String((e && e.message) || '');
    const s = statusOf(e);
    if(!navigator.onLine) return 'Ei verkkoyhteyttä.';
    if(isTimeout(e)) return 'Google ei vastannut ajoissa. Sen palvelu voi olla juuri nyt ruuhkainen — yritä hetken päästä uudelleen.';
    const g = msg ? ' (Google: ' + msg.slice(0, 200) + ')' : '';
    if(e && e.directKey && (s === 401 || s === 403))
      return 'Gemini-avain ei kelpaa tai sen rajaukset estävät pyynnön.' + g;
    if(e && e.directKey && s === 400)
      return 'Google hylkäsi pyynnön.' + g;
    if(/genai config/i.test(msg))
      return 'Firebase AI Logic ei vielä toimi. Lisää oma ilmainen Gemini-avain: Asetukset → TMDB → ✨ AI-arvostelu.';
    if(/api-not-enabled|not been used|disabled|Get started/i.test(msg) || s === 403)
      return 'AI Logic ei ole vielä käytössä. Ota se käyttöön Firebase-konsolissa tai lisää oma Gemini-avain asetuksiin.';
    if(s === 429) return 'Päivän ilmainen kiintiö on täynnä tai pyyntöjä tuli liian tiheään. Yritä hetken päästä uudelleen.' + g;
    if(s >= 500) return 'Googlen palvelu on juuri nyt ruuhkautunut. Yritä hetken päästä uudelleen.' + g;
    if(/app-check|appcheck/i.test(msg)) return 'App Check esti pyynnön. Tarkista App Check -asetukset Firebase-konsolista.';
    return 'Arvostelun luonti epäonnistui: ' + (msg || 'tuntematon virhe');
  }

  // ── KÄYTTÖLIITTYMÄ ──
  function setStatus(msg){
    const el = document.getElementById('aiReviewStatus');
    if(el) el.textContent = msg || '';
  }
  function showUndo(show){
    const b = document.getElementById('aiUndoBtn');
    if(b) b.style.display = show ? '' : 'none';
  }
  function esc(s){
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function renderSuggestion(){
    const box = document.getElementById('aiSuggestBox');
    if(!box) return;
    if(!suggestion){ box.style.display = 'none'; box.innerHTML = ''; return; }
    const words = suggestion.trim().split(/\s+/).length;
    box.style.display = '';
    box.innerHTML =
      '<div class="ai-suggest-head">✨ AI:n ehdotus <span class="ai-suggest-meta">' + words + ' sanaa</span></div>' +
      '<div class="ai-suggest-text">' + esc(suggestion).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>') + '</p></div>' +
      '<div class="ai-suggest-hint">Oma tekstisi on yllä kentässä ennallaan. Vertaa ja valitse.</div>' +
      '<div class="ai-suggest-actions">' +
        '<button type="button" class="btn-primary ai-btn" onclick="aiUseSuggestion()">✅ Käytä tätä</button>' +
        '<button type="button" class="btn-secondary ai-btn" onclick="aiWriteReview()">🔄 Uusi versio</button>' +
        '<button type="button" class="btn-secondary ai-btn" onclick="aiDiscardSuggestion()">✖️ Pidä omani</button>' +
      '</div>';
  }

  // Elävä näkymä kirjoituksen ajalta: vaihe, kulunut aika ja teksti
  // sitä mukaa kun se valmistuu.
  function renderLive(phase, secs, text, thought){
    const box = document.getElementById('aiSuggestBox');
    if(!box) return;
    box.style.display = '';
    const msg = phase === 'fallback' ? 'Päämalli ei ehtinyt — kokeillaan nopeampaa mallia…'
              : secs < 2             ? 'Lähetetään Googlelle…'
              : secs < 20            ? 'AI miettii ja kirjoittaa arvostelua…'
              : secs < 45            ? 'Hiotaan tekstiä — mietintä kestää yleensä 15–40 s…'
              :                        'Kestää tavallista pidempään, odota vielä hetki…';
    box.innerHTML =
      '<div class="ai-suggest-head">✨ AI <span class="ai-suggest-meta">' + secs + ' s</span></div>' +
      '<div class="ai-live"><span class="ai-dots"><i></i><i></i><i></i></span> ' + msg + '</div>' +
      (text ? '<div class="ai-suggest-text">' + esc(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>') + '</p></div>' : '');
  }

  window.aiWriteReview = async function(){
    if(busy) return;
    const ta = document.getElementById('formNote');
    if(!ta) return;
    // Uusi versio tehdään aina alkuperäisistä muistiinpanoista
    const notes = (undoText !== null ? undoText : ta.value).trim();
    if(!notes){ setStatus('Kirjoita ensin omat ajatuksesi kenttään.'); ta.focus(); return; }

    busy = true;
    suggestion = null;
    const btn = document.getElementById('aiReviewBtn');
    const started = Date.now();
    let phase = 'send', live = '', thought = '';
    const secs = () => Math.round((Date.now() - started) / 1000);
    const paint = () => {
      if(btn) btn.textContent = '⏳ ' + (phase === 'fallback' ? 'Uusi yritys' : 'Kirjoitetaan') + '… ' + secs() + ' s';
      renderLive(phase, secs(), live, thought);
    };
    onPhase = p => {
      if(p === 'fallback'){ phase = 'fallback'; live = ''; thought = ''; paint(); return; }
      if(phase === 'send' || phase === 'fallback'){ phase = p; paint(); }
    };
    // Mietinnän tiivistelmästä näytetään otsikko tai ensimmäinen lause
    onThought = t => {
      const m = String(t).match(/\*\*(.+?)\*\*/);
      const line = (m ? m[1] : String(t).split(/(?<=[.!?])\s/)[0]).trim();
      if(line){ thought = line.length > 90 ? line.slice(0, 88) + '…' : line; paint(); }
    };
    paint();
    const iv = setInterval(paint, 1000);
    if(btn) btn.disabled = true;
    setStatus('');
    const box = document.getElementById('aiSuggestBox');
    if(box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try{
      suggestion = await generate(buildPrompt(formInfo(notes)));
      renderSuggestion();
    } catch(e){
      console.warn('[AI-arvostelu]', e);
      suggestion = null;
      renderSuggestion();
      setStatus(friendly(e));
    } finally {
      clearInterval(iv);
      onPhase = function(){};
      onThought = function(){};
      busy = false;
      if(btn){ btn.disabled = false; btn.textContent = '✨ Tee arvostelu'; }
    }
  };

  window.aiUseSuggestion = function(){
    const ta = document.getElementById('formNote');
    if(!ta || !suggestion) return;
    if(undoText === null) undoText = ta.value;
    ta.value = suggestion;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    suggestion = null;
    renderSuggestion();
    showUndo(true);
    setStatus('AI:n versio otettu käyttöön. Voit vielä muokata sitä ennen tallennusta.');
  };

  window.aiDiscardSuggestion = function(){
    suggestion = null;
    renderSuggestion();
    setStatus('');
  };

  window.aiUndoReview = function(){
    const ta = document.getElementById('formNote');
    if(!ta || undoText === null) return;
    ta.value = undoText;
    undoText = null;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    showUndo(false);
    setStatus('Omat muistiinpanot palautettu.');
  };

  window.aiResetReviewUi = function(){
    undoText = null;
    suggestion = null;
    renderSuggestion();
    showUndo(false);
    setStatus('');
  };

  // ════════════════════════════════════════════════════════════
  // JOUKKOARVOSTELU
  // 1. Valinta: lista arvosteluista joilla on muistiinpanoja
  // 2. Ajo: kaksi rinnakkain, ruuhkasta (429) odotetaan ja yritetään uudelleen
  // 3. Tulokset: joko hyväksytään yksitellen tai kirjataan suoraan
  // Alkuperäinen teksti säilyy kentässä aiOrigNote, joten AI-tekstin voi
  // aina perua. Arvosanoihin, osa-arvioihin tai muihin kenttiin ei kosketa.
  // ════════════════════════════════════════════════════════════
  const BULK_PARALLEL = 2;
  let bulk = { step: 1, scope: 'new', mode: 'review', rows: [], q: '', cancel: false, running: false };
  let wakeLock = null;

  function bulkEligible(){
    return (appData.reviews || []).filter(r => r && sourceNote(r));
  }
  function bulkScopeRows(){
    const q = bulk.q.trim().toLowerCase();
    return bulk.rows.filter(x => {
      if(bulk.scope === 'new' && x.r.aiOrigNote != null) return false;
      if(q && !(plainName(x.r).toLowerCase().includes(q))) return false;
      return true;
    });
  }

  window.openAiBulk = function(){
    if(bulk.running){ window.openModalOnTop('aiBulkModal'); return; }
    bulk = { step: 1, scope: 'new', mode: bulk.mode || 'review', q: '', cancel: false, running: false,
      rows: bulkEligible()
        .sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')))
        .map(r => ({ r, checked: false, status: 'idle', text: '', err: '' })) };
    renderAiBulk();
    window.openModalOnTop('aiBulkModal');
  };

  window.aiBulkScope = function(s){ bulk.scope = s; renderAiBulk(); };
  window.aiBulkMode = function(m){ bulk.mode = m; renderAiBulk(); };
  window.aiBulkSearch = function(v){ bulk.q = v; renderAiBulkList(); };
  window.aiBulkPick = function(id, on){
    const x = bulk.rows.find(x => String(x.r.id) === String(id));
    if(x) x.checked = !!on;
    updateAiBulkBtn();
  };
  window.aiBulkAll = function(on){
    bulkScopeRows().forEach(x => x.checked = !!on);
    renderAiBulkList();
  };

  function updateAiBulkBtn(){
    const btn = document.getElementById('aiBulkGo');
    if(!btn) return;
    const n = bulk.rows.filter(x => x.checked).length;
    btn.disabled = !n;
    btn.style.opacity = n ? '1' : '0.5';
    btn.textContent = n ? '✨ Arvostele ' + n + ' kpl' : 'Valitse ainakin yksi';
  }

  function rowsHtml(list){
    if(!list.length) return '<div class="bulk-empty">Ei arvosteluja tällä rajauksella.</div>';
    return list.map(x => {
      const r = x.r;
      const note = sourceNote(r);
      return '<label class="bulk-row">' +
        '<input type="checkbox" class="bulk-check" ' + (x.checked ? 'checked' : '') +
        ' onchange="aiBulkPick(\'' + escJs(String(r.id)) + '\', this.checked)">' +
        '<span class="bulk-info">' +
          '<span class="bulk-name">' + esc(plainName(r)) + (r.year ? ' <span>(' + r.year + ')</span>' : '') + '</span>' +
          '<span class="bulk-tags"><span class="bulk-tag">' + esc(r.category || '') + '</span>' +
            (r.aiOrigNote != null ? '<span class="bulk-tag add">AI-teksti käytössä</span>' +
              '<button type="button" class="aib-mini" onclick="event.preventDefault();event.stopPropagation();aiBulkRestoreOne(\'' + escJs(String(r.id)) + '\')">↩️ Palauta oma</button>' : '') +
            (r.ratings ? '<span class="bulk-tag">📊 laaja</span>' : '') + '</span>' +
          '<span class="aib-note">' + esc(note.length > 110 ? note.slice(0, 108) + '…' : note) + '</span>' +
        '</span></label>';
    }).join('');
  }

  function renderAiBulkList(){
    const el = document.getElementById('aiBulkList');
    if(el) el.innerHTML = rowsHtml(bulkScopeRows());
    updateAiBulkBtn();
  }

  function renderAiBulk(){
    const body = document.getElementById('aiBulkBody');
    if(!body) return;
    if(bulk.step === 1){
      const total = bulk.rows.length;
      const fresh = bulk.rows.filter(x => x.r.aiOrigNote == null).length;
      body.innerHTML =
        '<div class="bulk-step"><strong>Valitse arvostelut.</strong> Mukana ovat arvostelut, joissa on omia muistiinpanoja. ' +
        'AI kirjoittaa jokaiselle arvostelun muistiinpanojen, pisteiden ja laajan arvioinnin pohjalta. ' +
        'Alkuperäinen tekstisi tallentuu aina talteen, joten AI-tekstin voi perua myöhemmin.</div>' +
        '<div class="bulk-sum">' +
          '<div class="bulk-sum-box"><div class="bulk-sum-num">' + total + '</div><div class="bulk-sum-lbl">muistiinpanollista</div></div>' +
          '<div class="bulk-sum-box"><div class="bulk-sum-num">' + fresh + '</div><div class="bulk-sum-lbl">ilman AI-tekstiä</div></div>' +
          '<div class="bulk-sum-box"><div class="bulk-sum-num">' + (total - fresh) + '</div><div class="bulk-sum-lbl">AI-teksti käytössä</div></div>' +
        '</div>' +
        '<label style="margin-top:4px;">Kun AI-teksti valmistuu</label>' +
        '<div class="bulk-scope">' +
          '<button type="button" class="filter-chip ' + (bulk.mode === 'review' ? 'active' : '') + '" onclick="aiBulkMode(\'review\')">👀 Hyväksyn itse</button>' +
          '<button type="button" class="filter-chip ' + (bulk.mode === 'auto' ? 'active' : '') + '" onclick="aiBulkMode(\'auto\')">⚡ Kirjaa suoraan</button>' +
        '</div>' +
        '<div class="toggle-row-sub" style="margin:-4px 0 12px;">' + (bulk.mode === 'review'
          ? 'Näet jokaisen AI-tekstin omasi rinnalla ja hyväksyt tai hylkäät sen. Mitään ei tallenneta ennen hyväksyntää.'
          : 'AI-teksti korvaa muistiinpanot heti kun se valmistuu. Alkuperäisen voi palauttaa tulosnäkymästä tai myöhemmin.') + '</div>' +
        '<div class="bulk-scope">' +
          '<button type="button" class="filter-chip ' + (bulk.scope === 'new' ? 'active' : '') + '" onclick="aiBulkScope(\'new\')">Ilman AI-tekstiä</button>' +
          '<button type="button" class="filter-chip ' + (bulk.scope === 'all' ? 'active' : '') + '" onclick="aiBulkScope(\'all\')">Kaikki</button>' +
        '</div>' +
        '<input type="text" class="aib-search" placeholder="🔍 Hae nimellä…" value="' + esc(bulk.q) + '" oninput="aiBulkSearch(this.value)">' +
        '<div class="si-tools">' +
          '<button type="button" class="si-tool" onclick="aiBulkAll(true)">Valitse näkyvät</button>' +
          '<button type="button" class="si-tool" onclick="aiBulkAll(false)">Tyhjennä</button>' +
        '</div>' +
        '<div class="bulk-list" id="aiBulkList"></div>' +
        '<div class="toggle-row-sub" style="margin-top:8px;">Yksi arvostelu vie noin 15–40 s, ja kaksi kirjoitetaan kerrallaan. Pidä sovellus auki ajon ajan. Ilmaisella kiintiöllä kannattaa ajaa kerralla enintään 20–30.</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-secondary" onclick="closeModal(\'aiBulkModal\')">Sulje</button>' +
          '<button class="btn-primary" id="aiBulkGo" onclick="aiBulkRun()">Valitse ainakin yksi</button>' +
        '</div>';
      renderAiBulkList();
      return;
    }
    renderAiBulkProgress();
  }

  const ST = {
    queued:  ['⏳', 'Jonossa'],
    working: ['✍️', 'Kirjoitetaan…'],
    wait:    ['🕒', 'Odotetaan ruuhkan hellittämistä…'],
    ready:   ['✨', 'Valmis — odottaa hyväksyntää'],
    applied: ['✅', 'Kirjattu käyttöön'],
    rejected:['✖️', 'Hylätty'],
    reverted:['↩️', 'Palautettu omaksi'],
    error:   ['⚠️', 'Epäonnistui'],
    skipped: ['⏹️', 'Keskeytetty']
  };

  function para(t){
    return '<p>' + esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  }

  function renderAiBulkProgress(){
    const body = document.getElementById('aiBulkBody');
    if(!body) return;
    const sel = bulk.rows.filter(x => x.checked);
    const done = sel.filter(x => !['queued', 'working', 'wait'].includes(x.status)).length;
    const ready = sel.filter(x => x.status === 'ready').length;
    const pct = sel.length ? Math.round(done / sel.length * 100) : 0;
    const head = bulk.running
      ? '<div class="aib-progress"><div class="aib-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="ai-live"><span class="ai-dots"><i></i><i></i><i></i></span> ' + done + ' / ' + sel.length + ' valmiina</div></div>'
      : '<div class="bulk-step"><strong>Valmis.</strong> ' + done + ' / ' + sel.length + ' käsitelty' +
        (ready ? ', ' + ready + ' odottaa hyväksyntääsi.' : '.') + '</div>';

    const items = sel.map(x => {
      const r = x.r, id = escJs(String(r.id)), st = ST[x.status] || ['', ''];
      let inner = '';
      if(x.status === 'ready'){
        inner =
          '<details class="aib-cmp"><summary>Oma tekstisi</summary><div class="aib-own">' + para(sourceNote(r)) + '</div></details>' +
          '<div class="ai-suggest-text aib-ai">' + para(x.text) + '</div>' +
          '<div class="ai-suggest-actions">' +
            '<button type="button" class="btn-primary ai-btn" onclick="aiBulkAccept(\'' + id + '\')">✅ Hyväksy</button>' +
            '<button type="button" class="btn-secondary ai-btn" onclick="aiBulkRetry(\'' + id + '\')">🔄 Uusi</button>' +
            '<button type="button" class="btn-secondary ai-btn" onclick="aiBulkReject(\'' + id + '\')">✖️ Hylkää</button>' +
          '</div>';
      } else if(x.status === 'applied'){
        inner = '<details class="aib-cmp"><summary>Näytä teksti</summary><div class="aib-own">' + para(r.note || '') + '</div></details>' +
          '<div class="ai-suggest-actions"><button type="button" class="btn-secondary ai-btn" onclick="aiBulkRevert(\'' + id + '\')">↩️ Palauta oma teksti</button></div>';
      } else if(bulk.running && ['error','rejected','reverted','skipped'].includes(x.status)){
        inner = x.status === 'error' ? '<div class="aib-err">' + esc(x.err) + '</div>' : '';
      } else if(x.status === 'error'){
        inner = '<div class="aib-err">' + esc(x.err) + '</div>' +
          '<div class="ai-suggest-actions"><button type="button" class="btn-secondary ai-btn" onclick="aiBulkRetry(\'' + id + '\')">🔄 Yritä uudelleen</button></div>';
      } else if(x.status === 'rejected' || x.status === 'reverted' || x.status === 'skipped'){
        inner = '<div class="ai-suggest-actions"><button type="button" class="btn-secondary ai-btn" onclick="aiBulkRetry(\'' + id + '\')">🔄 Kirjoita uudelleen</button></div>';
      }
      return '<div class="aib-item aib-' + x.status + '">' +
        '<div class="aib-head"><span class="bulk-name">' + esc(plainName(r)) + (r.year ? ' <span>(' + r.year + ')</span>' : '') + '</span>' +
        '<span class="aib-st">' + st[0] + ' ' + st[1] + '</span></div>' + inner + '</div>';
    }).join('');

    body.innerHTML = head +
      (ready > 1 ? '<div class="si-tools"><button type="button" class="si-tool" onclick="aiBulkAcceptAll()">✅ Hyväksy kaikki valmiit (' + ready + ')</button></div>' : '') +
      '<div class="aib-list">' + items + '</div>' +
      '<div class="modal-actions">' +
        (bulk.running
          ? '<button class="btn-secondary" onclick="aiBulkStop()">⏹️ Keskeytä</button>'
          : '<button class="btn-secondary" onclick="openAiBulk()">↩️ Uusi valinta</button>') +
        '<button class="btn-primary" onclick="aiBulkClose()">' + (bulk.running ? 'Piilota (jatkuu taustalla)' : 'Sulje') + '</button>' +
      '</div>';
  }

  function setRow(x, status, patch){
    x.status = status;
    if(patch) Object.assign(x, patch);
    if(bulk.step === 2) renderAiBulkProgress();
  }

  async function applyText(x, text){
    const r = x.r;
    if(r.aiOrigNote == null) r.aiOrigNote = r.note || '';
    r.note = text;
    try{ if(typeof renderAll === 'function') renderAll(); } catch(e){}
    await window.fbSave();
  }

  // Yksi arvostelu. Ruuhkasta (429) odotetaan ja yritetään enintään 3 kertaa.
  async function bulkOne(x){
    let tries = 0;
    for(;;){
      if(bulk.cancel){ setRow(x, 'skipped'); return; }
      setRow(x, 'working');
      try{
        const text = await generate(buildPrompt(reviewInfo(x.r)));
        if(bulk.cancel && bulk.mode !== 'auto'){ setRow(x, 'ready', { text }); return; }
        if(bulk.mode === 'auto'){ await applyText(x, text); setRow(x, 'applied', { text }); }
        else setRow(x, 'ready', { text });
        return;
      } catch(e){
        const s = statusOf(e);
        if((s === 429 || s >= 500 || isTimeout(e)) && tries < 3 && !bulk.cancel){
          tries++;
          setRow(x, 'wait');
          await new Promise(res => setTimeout(res, s === 429 ? 30000 * tries : 8000));
          continue;
        }
        console.warn('[AI-joukko]', e);
        setRow(x, 'error', { err: friendly(e) });
        // Avain- tai oikeusvirhe koskee kaikkia — ei jatketa turhaan
        if(s === 401 || s === 403) bulk.cancel = true;
        return;
      }
    }
  }

  async function runQueue(list){
    bulk.running = true;
    bulk.cancel = false;
    try{ if(navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
    renderAiBulkProgress();
    let i = 0;
    const worker = async () => {
      while(i < list.length){
        const x = list[i++];
        if(bulk.cancel){ setRow(x, 'skipped'); continue; }
        await bulkOne(x);
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_PARALLEL, list.length) }, worker));
    bulk.running = false;
    try{ if(wakeLock) await wakeLock.release(); } catch(e){}
    wakeLock = null;
    renderAiBulkProgress();
  }

  window.aiBulkRun = function(){
    const sel = bulk.rows.filter(x => x.checked);
    if(!sel.length || bulk.running) return;
    if(bulk.mode === 'auto' && !confirm('AI-teksti korvaa ' + sel.length + ' arvostelun muistiinpanot heti kun se valmistuu. Alkuperäiset säilyvät ja ne voi palauttaa.\n\nAloitetaanko?')) return;
    sel.forEach(x => { x.status = 'queued'; x.text = ''; x.err = ''; });
    bulk.step = 2;
    runQueue(sel);
  };

  window.aiBulkStop = function(){
    bulk.cancel = true;
    renderAiBulkProgress();
  };

  window.aiBulkClose = function(){
    const ready = bulk.rows.filter(x => x.checked && x.status === 'ready').length;
    if(!bulk.running && ready && !confirm(ready + ' AI-tekstiä odottaa vielä hyväksyntää. Jos suljet, ne hylätään.\n\nSuljetaanko?')) return;
    closeModal('aiBulkModal');
  };

  function rowById(id){ return bulk.rows.find(x => String(x.r.id) === String(id)); }

  window.aiBulkAccept = async function(id){
    const x = rowById(id);
    if(!x || x.status !== 'ready') return;
    await applyText(x, x.text);
    setRow(x, 'applied');
  };

  window.aiBulkAcceptAll = async function(){
    const list = bulk.rows.filter(x => x.checked && x.status === 'ready');
    if(!list.length) return;
    list.forEach(x => {
      if(x.r.aiOrigNote == null) x.r.aiOrigNote = x.r.note || '';
      x.r.note = x.text;
      x.status = 'applied';
    });
    try{ if(typeof renderAll === 'function') renderAll(); } catch(e){}
    renderAiBulkProgress();
    await window.fbSave();
  };

  window.aiBulkReject = function(id){
    const x = rowById(id);
    if(x) setRow(x, 'rejected', { text: '' });
  };

  window.aiBulkRevert = async function(id){
    const x = rowById(id);
    if(!x || x.r.aiOrigNote == null) return;
    x.r.note = x.r.aiOrigNote;
    delete x.r.aiOrigNote;
    try{ if(typeof renderAll === 'function') renderAll(); } catch(e){}
    setRow(x, 'reverted');
    await window.fbSave();
  };

  window.aiBulkRestoreOne = async function(id){
    const x = rowById(id);
    if(!x || x.r.aiOrigNote == null) return;
    if(!confirm('Palautetaanko arvosteluun "' + plainName(x.r) + '" oma alkuperäinen tekstisi? AI-teksti poistuu.')) return;
    x.r.note = x.r.aiOrigNote;
    delete x.r.aiOrigNote;
    try{ if(typeof renderAll === 'function') renderAll(); } catch(e){}
    renderAiBulk();
    await window.fbSave();
  };

  window.aiBulkRetry = async function(id){
    const x = rowById(id);
    if(!x) return;
    if(bulk.running) return;   // ajon aikana uusinta odottaa ajon loppuun
    bulk.cancel = false;
    setRow(x, 'queued');
    bulk.running = true;
    renderAiBulkProgress();
    await bulkOne(x);
    bulk.running = false;
    renderAiBulkProgress();
  };

  // ── ASETUKSET ──
  window.renderGeminiSettings = function(){
    const inp = document.getElementById('geminiKeyInput');
    const st = document.getElementById('geminiKeyState');
    const has = !!ownKey();
    if(inp) inp.placeholder = has ? 'Avain on tallennettu (liitä uusi korvataksesi)' : 'Liitä Gemini API -avain';
    if(st) st.textContent = has ? '✅ Oma avain tallennettu — ✨-nappi käyttää sitä.' : 'Ei omaa avainta — ✨-nappi käyttää Firebase AI Logicia.';
  };

  window.testGeminiKey = async function(){
    const inp = document.getElementById('geminiKeyInput');
    const st = document.getElementById('geminiKeyState');
    const typed = inp ? inp.value.trim() : '';
    const k = typed || ownKey();
    if(!k){ if(st) st.textContent = 'Liitä ensin avain.'; return; }
    if(st) st.textContent = '⏳ Testataan...';
    try{
      await generate('Vastaa pelkällä sanalla: toimii', k);
      if(st) st.textContent = '✅ Avain toimii.' + (typed ? ' Muista vielä tallentaa.' : '');
    } catch(e){
      console.warn('[AI-arvostelu]', e);
      if(st) st.textContent = '❌ ' + friendly(e);
    }
  };

  window.saveGeminiKey = async function(){
    const inp = document.getElementById('geminiKeyInput');
    if(!inp) return;
    const v = inp.value.trim();
    if(!v) return;
    ensureSettings().geminiKey = v;
    inp.value = '';
    window.renderGeminiSettings();
    await window.fbSave();
  };

  window.clearGeminiKey = async function(){
    if(!ownKey()) return;
    if(!confirm('Poistetaanko tallennettu Gemini-avain? ✨-nappi käyttää sen jälkeen Firebase AI Logicia.')) return;
    ensureSettings().geminiKey = '';
    window.renderGeminiSettings();
    await window.fbSave();
  };

  document.addEventListener('click', function(ev){
    const t = ev.target;
    if(t && t.closest && t.closest('[data-sec="ai"] .set-sec-head')) setTimeout(window.renderGeminiSettings, 0);
  });

  // Lomakkeen avautuessa vanha ehdotus ja kumoustila nollataan.
  function watchModal(){
    const m = document.getElementById('addModal');
    if(!m) return;
    let wasOpen = m.classList.contains('open');
    new MutationObserver(function(){
      const isOpen = m.classList.contains('open');
      if(isOpen && !wasOpen) window.aiResetReviewUi();
      wasOpen = isOpen;
    }).observe(m, { attributes: true, attributeFilter: ['class'] });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchModal);
  else watchModal();
})();
