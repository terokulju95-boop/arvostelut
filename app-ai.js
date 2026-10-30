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
  const IDLE_MS = 60000;
  // Vaiheen ilmoitus käyttöliittymälle (asetetaan aiWriteReview:ssä)
  let onPhase = function(){};

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
  function ratingHighlights(){
    try{
      if(typeof selectedRatings === 'undefined' || !selectedRatings) return null;
      const sub = (typeof formRatingSub === 'function') ? formRatingSub() : '';
      const set = ratingSet(sub);
      if(!set) return null;
      const scored = set.dims
        .map(d => ({ d, v: selectedRatings[d.id] }))
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
  function buildPrompt(notes){
    const title = val('formName');
    const year = val('formYear');
    const cat = val('formCat');
    const plot = val('formPlot');
    const score = (typeof selectedScore === 'number') ? selectedScore : null;
    const hl = ratingHighlights();

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

  // ── REITTI 1: OMA AVAIN (suoratoisto) ──
  // Vastaus luetaan suoratoistona (SSE), jolloin teksti ilmestyy ruudulle
  // sitä mukaa kun malli kirjoittaa. Aikaraja on "hiljaisuusraja": pyyntö
  // katkaistaan vain jos Googlelta ei kuulu mitään IDLE_MS aikaan.
  async function streamDirect(model, prompt, apiKey, onText){
    const ctrl = new AbortController();
    let timer = null;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), IDLE_MS); };
    arm();
    try{
      const res = await fetch(API + model + ':streamGenerateContent?alt=sse', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.0, maxOutputTokens: 8192 }
        })
      });
      if(!res.ok){
        let data = null;
        try{ data = await res.json(); } catch(e){}
        const err = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        err.customErrorData = { status: res.status };
        err.directKey = true;
        throw err;
      }
      onPhase('thinking');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', text = '';
      for(;;){
        const { done, value } = await reader.read();
        if(done) break;
        arm();
        buf += dec.decode(value, { stream: true });
        let i;
        while((i = buf.indexOf('\n')) >= 0){
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if(!line.startsWith('data:')) continue;
          let obj = null;
          try{ obj = JSON.parse(line.slice(5)); } catch(e){ continue; }
          const parts = obj && obj.candidates && obj.candidates[0] &&
                        obj.candidates[0].content && obj.candidates[0].content.parts;
          const piece = (parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
          if(piece){ text += piece; onText(text); }
        }
      }
      text = text.trim();
      if(!text) throw new Error('Tyhjä vastaus');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async function generateDirect(prompt, apiKey, onText){
    let lastErr = null;
    for(const name of MODELS){
      try{ return await streamDirect(name, prompt, apiKey, onText); }
      catch(e){
        lastErr = e;
        const s = statusOf(e);
        if(s === 400 || s === 401 || s === 403) break;
        if(isTimeout(e)) break;   // ei pitkitetä odotusta toisella mallilla
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

  async function generateFirebase(prompt, onText){
    const { ai, getGenerativeModel } = await loadAi();
    let lastErr = null;
    for(const name of MODELS){
      try{
        const model = getGenerativeModel(ai, {
          model: name,
          generationConfig: { temperature: 1.0, maxOutputTokens: 8192 }
        }, { timeout: 90000 });
        const res = await model.generateContentStream(prompt);
        onPhase('thinking');
        let text = '';
        for await (const chunk of res.stream){
          let piece = '';
          try{ piece = chunk.text(); } catch(e){}
          if(piece){ text += piece; onText(text); }
        }
        text = text.trim();
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

  async function generate(prompt, keyOverride, onText){
    const cb = onText || function(){};
    const k = keyOverride || ownKey();
    if(k) return generateDirect(prompt, k, cb);
    return generateFirebase(prompt, cb);
  }

  function friendly(e){
    const msg = String((e && e.message) || '');
    const s = statusOf(e);
    if(!navigator.onLine) return 'Ei verkkoyhteyttä.';
    if(isTimeout(e)) return 'Google ei vastannut minuuttiin. Paina nappia uudelleen — yleensä toinen yritys menee läpi.';
    if(e && e.directKey && (s === 400 || s === 401 || s === 403))
      return 'Gemini-avain ei kelpaa tai sen rajaukset estävät pyynnön. Tarkista avain: Asetukset → TMDB → ✨ AI-arvostelu.';
    if(/genai config/i.test(msg))
      return 'Firebase AI Logic ei vielä toimi. Lisää oma ilmainen Gemini-avain: Asetukset → TMDB → ✨ AI-arvostelu.';
    if(/api-not-enabled|not been used|disabled|Get started/i.test(msg) || s === 403)
      return 'AI Logic ei ole vielä käytössä. Ota se käyttöön Firebase-konsolissa tai lisää oma Gemini-avain asetuksiin.';
    if(s === 429) return 'Päivän ilmainen kiintiö on täynnä tai pyyntöjä tuli liian tiheään. Yritä hetken päästä uudelleen.';
    if(s >= 500) return 'Googlen palvelu on juuri nyt ruuhkautunut. Yritä hetken päästä uudelleen.';
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
  function renderLive(phase, secs, text){
    const box = document.getElementById('aiSuggestBox');
    if(!box) return;
    box.style.display = '';
    const msg = phase === 'send'     ? 'Lähetetään Googlelle…'
              : phase === 'writing'  ? 'Kirjoittaa…'
              : secs >= 40           ? 'Miettii yhä — pitkä mietintä on normaalia, odota vielä hetki…'
              :                        'Miettii arvostelua…';
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
    let phase = 'send', live = '';
    const secs = () => Math.round((Date.now() - started) / 1000);
    const paint = () => {
      if(btn) btn.textContent = '⏳ ' + (phase === 'writing' ? 'Kirjoittaa' : phase === 'send' ? 'Lähetetään' : 'Miettii') + '… ' + secs() + ' s';
      renderLive(phase, secs(), live);
    };
    onPhase = p => { if(phase === 'send'){ phase = p; paint(); } };
    paint();
    const iv = setInterval(paint, 1000);
    if(btn) btn.disabled = true;
    setStatus('');
    const box = document.getElementById('aiSuggestBox');
    if(box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try{
      suggestion = await generate(buildPrompt(notes), null, t => { phase = 'writing'; live = t; paint(); });
      renderSuggestion();
    } catch(e){
      console.warn('[AI-arvostelu]', e);
      suggestion = null;
      renderSuggestion();
      setStatus(friendly(e));
    } finally {
      clearInterval(iv);
      onPhase = function(){};
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
