// Versioleima — tools/bump-version.js päivittää tämän automaattisesti.
window.BUILD_AI = '2026-10-30.0';

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

  async function generate(prompt){
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
        if(/api-not-enabled|not been used|disabled/i.test(String(e && e.message))) break;
      }
    }
    throw lastErr || new Error('Tuntematon virhe');
  }

  function friendly(e){
    const msg = String((e && e.message) || '');
    const s = statusOf(e);
    if(!navigator.onLine) return 'Ei verkkoyhteyttä.';
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
