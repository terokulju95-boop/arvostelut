// Versioleima — tools/bump-version.js päivittää tämän automaattisesti.
window.BUILD_AI = '2026-10-26.0';

// ════════════════════════════════════════════════════════════
// AI-ARVOSTELU (Firebase AI Logic)
// Muotoilee Lisätiedot-kenttään kirjoitetut omat pohdinnat valmiiksi
// arvosteluksi Googlen Gemini-mallilla Firebase AI Logicin kautta.
// Gemini-avain on Firebasen palvelimella — sitä ei ole koodissa,
// tietokannassa eikä selaimessa. Vaatii että Firebase-konsolissa on
// AI Logic otettu käyttöön (Gemini Developer API).
// ════════════════════════════════════════════════════════════
(function(){
  // Sama SDK-versio kuin app-firebase.js:ssä, jotta getApp() löytää
  // jo alustetun sovelluksen.
  const SDK = 'https://www.gstatic.com/firebasejs/12.10.0/';
  // Kokeillaan järjestyksessä: jos malli on ruuhkassa, sen kiintiö on
  // täynnä tai nimeä ei tunneta, siirrytään seuraavaan.
  const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];

  let undoText = null;
  let aiPromise = null;

  function loadAi(){
    if(!aiPromise){
      aiPromise = Promise.all([
        import(SDK + 'firebase-app.js'),
        import(SDK + 'firebase-ai.js')
      ]).then(([appMod, aiMod]) => {
        const ai = aiMod.getAI(appMod.getApp(), { backend: new aiMod.GoogleAIBackend() });
        return { ai, getGenerativeModel: aiMod.getGenerativeModel };
      }).catch(e => { aiPromise = null; throw e; });
    }
    return aiPromise;
  }

  function val(id){
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function buildPrompt(notes){
    const title = val('formName');
    const year = val('formYear');
    const cat = val('formCat');
    const score = (typeof selectedScore === 'number') ? selectedScore : null;
    const lines = [
      'Kirjoita suomeksi lyhyt, selkeä ja harkittu arvostelu alla olevien omien muistiinpanojeni pohjalta.',
      '',
      'Säännöt:',
      '- Pituus 2–3 lyhyttä kappaletta.',
      '- Säilytä kaikki mielipiteeni ja niiden sävy. Älä lisää uusia väitteitä, kehuja tai moitteita joita muistiinpanoissa ei ole.',
      '- Älä mainitse näyttelijöiden, ohjaajan tai henkilöhahmojen nimiä.',
      '- Älä keksi faktoja teoksesta.',
      '- Kirjoita luontevaa, hyvää yleiskieltä ja korjaa kirjoitusvirheet.',
      '- Älä kirjoita otsikkoa, tähtiä tai arvosanaa. Palauta pelkkä arvosteluteksti ilman muotoilumerkkejä.',
      ''
    ];
    if(title) lines.push('Teos: ' + title + (year ? ' (' + year + ')' : ''));
    if(cat) lines.push('Kategoria: ' + cat);
    if(score !== null) lines.push('Antamani pisteet: ' + score + '/100 (käytä vain sävyn arvioimiseen, älä mainitse lukua).');
    lines.push('', 'Muistiinpanoni:', notes);
    return lines.join('\n');
  }

  // Firebase AI -virheissä HTTP-tila on customErrorData.status:ssa,
  // vanhemmissa versioissa vain viestissä muodossa [404 ...].
  function statusOf(e){
    const s = e && e.customErrorData && e.customErrorData.status;
    if(s) return +s;
    const m = String((e && e.message) || '').match(/\[(\d{3})\b/);
    return m ? +m[1] : 0;
  }


  // ── OMA AVAIN (Google AI Studio) ──
  // Jos asetuksiin on tallennettu oma Gemini-avain, sitä käytetään
  // suoraan. Muuten käytetään Firebase AI Logicia.
  const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

  function ownKey(){
    const st = (typeof appData !== 'undefined' && appData && appData.settings) || {};
    return String(st.geminiKey || '').trim();
  }

  async function callDirect(model, prompt, apiKey){
    const res = await fetch(API + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
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
    const text = (parts || []).map(p => p.text || '').join('').trim();
    if(!text) throw new Error('Tyhjä vastaus');
    return text;
  }

  async function generateDirect(prompt, apiKey){
    let lastErr = null;
    for(const name of MODELS){
      try{ return await callDirect(name, prompt, apiKey); }
      catch(e){
        lastErr = e;
        const s = statusOf(e);
        if(s === 400 || s === 401 || s === 403) break;
      }
    }
    throw lastErr || new Error('Tuntematon virhe');
  }

  async function generate(prompt, keyOverride){
    const k = keyOverride || ownKey();
    if(k) return generateDirect(prompt, k);
    return generateFirebase(prompt);
  }

  async function generateFirebase(prompt){
    const { ai, getGenerativeModel } = await loadAi();
    let lastErr = null;
    for(const name of MODELS){
      try{
        const model = getGenerativeModel(ai, {
          model: name,
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        });
        const res = await model.generateContent(prompt);
        const text = String(res.response.text() || '').trim();
        if(!text) throw new Error('Tyhjä vastaus');
        return text;
      } catch(e){
        lastErr = e;
        const s = statusOf(e);
        // Käyttöönotto- tai oikeusongelma ei korjaannu toisella mallilla
        if(s === 401 || s === 403) break;
        if(/api-not-enabled|not been used|disabled|genai config/i.test(String(e && e.message))) break;
      }
    }
    throw lastErr || new Error('Tuntematon virhe');
  }

  function friendly(e){
    const msg = String((e && e.message) || '');
    const s = statusOf(e);
    if(!navigator.onLine) return 'Ei verkkoyhteyttä.';
    if(e && e.directKey && (s === 400 || s === 401 || s === 403))
      return 'Gemini-avain ei kelpaa tai sen rajaukset estävät pyynnön. Tarkista avain: Asetukset → TMDB → ✨ AI-arvostelu.';
    if(/genai config/i.test(msg))
      return 'Firebase AI Logic ei vielä toimi (Googlen puolelta puuttuu avain). Lisää oma ilmainen Gemini-avain: Asetukset → TMDB → ✨ AI-arvostelu.';
    if(/api-not-enabled|not been used|disabled|Get started/i.test(msg) || s === 403)
      return 'AI Logic ei ole vielä käytössä. Ota se käyttöön Firebase-konsolissa: AI Logic → Get started → Gemini Developer API.';
    if(s === 429) return 'Päivän ilmainen kiintiö on täynnä tai pyyntöjä tuli liian tiheään. Yritä hetken päästä uudelleen.';
    if(s >= 500) return 'Googlen palvelu on juuri nyt ruuhkautunut. Yritä hetken päästä uudelleen.';
    if(/app-check|appcheck/i.test(msg)) return 'App Check esti pyynnön. Tarkista App Check -asetukset Firebase-konsolista.';
    return 'Arvostelun luonti epäonnistui: ' + (msg || 'tuntematon virhe');
  }

  function setStatus(msg){
    const el = document.getElementById('aiReviewStatus');
    if(el) el.textContent = msg || '';
  }

  function showUndo(show){
    const b = document.getElementById('aiUndoBtn');
    if(b) b.style.display = show ? '' : 'none';
  }

  window.aiWriteReview = async function(){
    const ta = document.getElementById('formNote');
    if(!ta) return;
    const notes = ta.value.trim();
    if(!notes){ setStatus('Kirjoita ensin omat ajatuksesi kenttään.'); ta.focus(); return; }
    const btn = document.getElementById('aiReviewBtn');
    if(btn){ btn.disabled = true; btn.textContent = '⏳ Kirjoitetaan...'; }
    setStatus('');
    try{
      const text = await generate(buildPrompt(notes));
      undoText = ta.value;
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      showUndo(true);
      setStatus('Valmis. Voit muokata tekstiä vapaasti ennen tallennusta.');
    } catch(e){
      console.warn('[AI-arvostelu]', e);
      setStatus(friendly(e));
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = '✨ Tee arvostelu'; }
    }
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

  // Lomakkeen avautuessa vanha kumoustila ja viesti nollataan.
  window.aiResetReviewUi = function(){
    undoText = null;
    showUndo(false);
    setStatus('');
  };

  // ── ASETUKSET ──
  window.renderGeminiSettings = function(){
    const inp = document.getElementById('geminiKeyInput');
    const st = document.getElementById('geminiKeyState');
    const has = !!ownKey();
    if(inp) inp.placeholder = has ? 'Avain on tallennettu (liitä uusi korvataksesi)' : 'Liitä Gemini API -avain (alkaa AIza)';
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
