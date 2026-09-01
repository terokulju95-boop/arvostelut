// ══ ARVOSTELUT · kysymyspankki ══
// Versioleima: jokaisessa tiedostossa sama.
window.BUILD_QUESTIONS = '2026-09-01.17';
//
// Ohjattu kirjoittaminen elokuva-arvosteluihin. Sovelluksessa ei ole
// tekoälyä, joten teksti kootaan säännöillä: kysymykset on kirjoitettu
// niin että vastaus on jo itsessään lause, ja kokoaja hoitaa järjestyksen,
// johdantofraasit ja kappalejaon. Lopputulos on aina muokattavissa.
//
// Vain elokuville. TV-sarjoissa riittää vapaa tekstikenttä.

// ════════════════════════════════════════════════════════════
// SYVYYSTASOT
// kevyt      = nopea, ei vaadi analyysia
// tavallinen = perustason arvostelu
// syva       = pohdiskeleva
// ════════════════════════════════════════════════════════════

const Q_DEPTHS = [
  { id:'kevyt',      label:'Kevyt',        hint:'Nopeat kysymykset, ei vaadi pohdintaa' },
  { id:'tavallinen', label:'Tavallinen',   hint:'Kevyet ja perustason kysymykset' },
  { id:'syva',       label:'Pohdiskeleva', hint:'Kaikki kysymykset, myös analyyttiset' }
];

const Q_STYLES = [
  { id:'proosa',  label:'Vapaa teksti', hint:'Vastaukset yhtenäiseksi tekstiksi' },
  { id:'otsikot', label:'Otsikoitu',    hint:'Kysymys lihavoituna, vastaus alle' },
  { id:'lista',   label:'Luettelo',     hint:'Lyhyt luettelo aiheittain' }
];

// Elokuvatyypit joilla on omat kysymyksensä
const Q_KINDS = [
  { id:'perus',      label:'Elokuvat',    icon:'🎬' },
  { id:'dokumentti', label:'Dokumentit',  icon:'🎥' },
  { id:'animaatio',  label:'Animaatiot',  icon:'🎨' }
];

// ════════════════════════════════════════════════════════════
// KYSYMYSPANKKI
// text  = kysymys sellaisena kuin se näytetään
// label = lyhyt aihetunniste luettelotyyliin
// leads = johdantofraasit vapaan tekstin tyyliin. Päättyvät kaksoispisteeseen,
//         jolloin vastaus voi olla mikä tahansa lause ilman taivutusongelmia.
// genres = kysymys nousee esiin useammin näissä genreissä
// ════════════════════════════════════════════════════════════

const QUESTION_BANK = [
  // ── PERUS · kevyt ──
  { id:'q_mieleen', kinds:['perus','dokumentti','animaatio'], depth:'kevyt',
    text:'Mikä jäi ensimmäisenä mieleen?', label:'Mieleen jäi',
    leads:['Ensimmäisenä mieleen jäi', 'Päällimmäisenä jäi mieleen'] },
  { id:'q_yllatti', kinds:['perus','dokumentti','animaatio'], depth:'kevyt',
    text:'Mikä yllätti?', label:'Yllätys',
    leads:['Yllätyksistä sen verran', 'Odottamatonta oli'] },
  { id:'q_fiilis', kinds:['perus','dokumentti','animaatio'], depth:'kevyt',
    text:'Millä fiiliksellä jäit lopputekstien jälkeen?', label:'Fiilis lopuksi',
    leads:['Lopputeksteissä olo oli tällainen', 'Jälkifiilis'] },
  { id:'q_paras', kinds:['perus','dokumentti','animaatio'], depth:'kevyt',
    text:'Mikä oli parasta?', label:'Parasta',
    leads:['Parasta oli', 'Vahvinta antia'] },
  { id:'q_huonoin', kinds:['perus','dokumentti','animaatio'], depth:'kevyt',
    text:'Mikä oli heikointa?', label:'Heikointa',
    leads:['Heikointa oli', 'Ontuvinta'] },
  { id:'q_kohtaus', kinds:['perus','animaatio'], depth:'kevyt',
    text:'Mikä kohtaus jäi mieleen?', label:'Kohtaus',
    leads:['Yksi kohtaus jäi mieleen', 'Muistettavin hetki'] },
  { id:'q_uudelleen', kinds:['perus','dokumentti','animaatio'], depth:'kevyt',
    text:'Katsoisitko uudelleen? Miksi tai miksi et?', label:'Uudelleen',
    leads:['Uudelleenkatselusta', 'Katsoisinko uudelleen'] },
  { id:'q_kenelle', kinds:['perus','animaatio'], depth:'kevyt',
    text:'Kenelle suosittelisit tätä?', label:'Suositus',
    leads:['Suosittelisin tätä', 'Tämä sopii'] },
  { id:'q_yksisana', kinds:['perus','dokumentti','animaatio'], depth:'kevyt',
    text:'Kuvaile yhdellä sanalla — ja kerro miksi juuri se sana.', label:'Yhdellä sanalla',
    leads:['Yhdellä sanalla', 'Jos pitäisi tiivistää yhteen sanaan'] },

  // ── PERUS · tavallinen ──
  { id:'q_odotus', kinds:['perus','dokumentti','animaatio'], depth:'tavallinen',
    text:'Mitä odotit ennen katsomista?', label:'Odotukset', pair:'q_saitko',
    leads:['Ennen katsomista odotin', 'Lähtökohtaisesti odotin'] },
  { id:'q_saitko', kinds:['perus','dokumentti','animaatio'], depth:'tavallinen',
    text:'Saitko sitä mitä odotit?', label:'Toteutuivatko odotukset',
    leads:['Odotusten suhteen', 'Toteutuivatko odotukset'] },
  { id:'q_juoni', kinds:['perus','animaatio'], depth:'tavallinen',
    text:'Toimiko tarina? Pysyitkö mukana?', label:'Tarina',
    leads:['Tarinasta', 'Juonen osalta'] },
  { id:'q_hahmot', kinds:['perus','animaatio'], depth:'tavallinen',
    text:'Kiinnostivatko hahmot? Välititkö siitä miten heille käy?', label:'Hahmot',
    leads:['Hahmoista', 'Henkilöiden osalta'] },
  { id:'q_kesto', kinds:['perus','dokumentti','animaatio'], depth:'tavallinen',
    text:'Oliko kesto oikea? Venyikö tai jäikö jokin kesken?', label:'Kesto',
    leads:['Kestosta', 'Pituuden puolesta'] },
  { id:'q_musiikki', kinds:['perus','dokumentti','animaatio'], depth:'tavallinen',
    text:'Huomasitko musiikin tai äänimaailman?', label:'Ääni ja musiikki',
    leads:['Äänimaailmasta', 'Musiikin osalta'] },
  { id:'q_ulkoasu', kinds:['perus'], depth:'tavallinen',
    text:'Miltä elokuva näytti? Jäikö jokin kuva mieleen?', label:'Ulkoasu',
    leads:['Ulkoisesti', 'Visuaalisesti'] },
  { id:'q_tunne', kinds:['perus','dokumentti','animaatio'], depth:'tavallinen',
    text:'Herättikö se jonkin tunteen?', label:'Tunne',
    leads:['Tunnetasolla', 'Tunnereaktiosta'] },
  { id:'q_viikko', kinds:['perus','dokumentti','animaatio'], depth:'tavallinen',
    text:'Mitä muistat tästä viikon päästä?', label:'Viikon päästä',
    leads:['Viikon päästä muistan luultavasti', 'Mieleen jää pidemmäksi aikaa'] },
  { id:'q_toisin', kinds:['perus','animaatio'], depth:'tavallinen',
    text:'Mitä olisit tehnyt toisin, jos olisit ohjannut tämän?', label:'Toisin tehtynä',
    leads:['Toisin tehtynä', 'Itse olisin muuttanut'] },

  // ── PERUS · syvä ──
  { id:'q_teema', kinds:['perus','dokumentti','animaatio'], depth:'syva',
    text:'Mistä elokuva oikeastaan kertoi — juonen alla?', label:'Teema',
    leads:['Pinnan alla', 'Varsinainen aihe'] },
  { id:'q_oma', kinds:['perus','dokumentti'], depth:'syva',
    text:'Mitä se sai sinut ajattelemaan omasta elämästäsi?', label:'Omat ajatukset',
    leads:['Omalle kohdalle käännettynä', 'Itselleni tästä jäi'] },
  { id:'q_vaivaamaan', kinds:['perus','dokumentti','animaatio'], depth:'syva',
    text:'Jäikö jokin vaivaamaan?', label:'Jäi vaivaamaan',
    leads:['Vaivaamaan jäi', 'Yksi asia jäi kaivelemaan'] },
  { id:'q_riski', kinds:['perus','animaatio'], depth:'syva',
    text:'Otettiinko elokuvassa riskejä vai mentiin varman päälle?', label:'Riskit',
    leads:['Rohkeudesta', 'Riskinoton osalta'] },
  { id:'q_kestavyys', kinds:['perus','animaatio'], depth:'syva',
    text:'Miten tämä kestää aikaa? Katsotaanko tätä kymmenen vuoden päästä?', label:'Kestävyys',
    leads:['Ajan kestämisestä', 'Pidemmällä aikavälillä'] },
  { id:'q_nakokulma', kinds:['perus'], depth:'syva',
    text:'Kenen tarina tämä oikeastaan oli?', label:'Näkökulma',
    leads:['Näkökulmasta', 'Kenen tarina tämä oli'] },

  // ── GENREKOHTAISET (nousevat esiin useammin näissä genreissä) ──
  { id:'q_pelko', kinds:['perus'], depth:'kevyt', genres:['kauhu'],
    text:'Pelottiko oikeasti? Missä kohtaa?', label:'Pelko',
    leads:['Pelottavuudesta', 'Kauhun osalta'] },
  { id:'q_ahdistus', kinds:['perus'], depth:'tavallinen', genres:['kauhu','trilleri','jännitys'],
    text:'Millainen tunnelma elokuvassa oli?', label:'Tunnelma',
    leads:['Tunnelmasta', 'Ilmapiirin osalta'] },
  { id:'q_nauru', kinds:['perus','animaatio'], depth:'kevyt', genres:['komedia'],
    text:'Nauroitko oikeasti ääneen? Kuinka monta kertaa?', label:'Nauru',
    leads:['Naurujen osalta', 'Hauskuudesta'] },
  { id:'q_vitsi', kinds:['perus','animaatio'], depth:'tavallinen', genres:['komedia'],
    text:'Mikä vitsi tai kohtaus toimi parhaiten?', label:'Paras vitsi',
    leads:['Parhaiten toimi', 'Huumorin huippukohta'] },
  { id:'q_kaanteet', kinds:['perus'], depth:'tavallinen', genres:['trilleri','mysteeri','rikostarina','jännitys'],
    text:'Arvasitko käänteet etukäteen?', label:'Käänteet',
    leads:['Käänteistä', 'Yllätysten osalta'] },
  { id:'q_kosketti', kinds:['perus'], depth:'tavallinen', genres:['draama','romantiikka'],
    text:'Koskettiko se? Missä kohtaa?', label:'Koskettavuus',
    leads:['Koskettavuudesta', 'Tunteisiin käymisestä'] },
  { id:'q_maailma', kinds:['perus','animaatio'], depth:'tavallinen', genres:['sci-fi','scifi','fantasia'],
    text:'Toimiko elokuvan maailma? Uskoitko siihen?', label:'Maailma',
    leads:['Maailmanrakennuksesta', 'Elokuvan maailmasta'] },
  { id:'q_toiminta', kinds:['perus'], depth:'tavallinen', genres:['toiminta','seikkailu'],
    text:'Miten toimintakohtaukset toimivat? Pysyitkö kärryillä?', label:'Toiminta',
    leads:['Toimintakohtauksista', 'Actionin osalta'] },
  { id:'q_kemia', kinds:['perus'], depth:'tavallinen', genres:['romantiikka'],
    text:'Toimiko päähenkilöiden välinen kemia?', label:'Kemia',
    leads:['Kemiasta', 'Päähenkilöiden välillä'] },

  // ── DOKUMENTIT ──
  { id:'q_dok_kenelle', kinds:['dokumentti'], depth:'kevyt',
    text:'Kenen pitäisi nähdä tämä?', label:'Kenelle',
    leads:['Tämän pitäisi nähdä', 'Suosittelisin erityisesti'] },
  { id:'q_dok_uutta', kinds:['dokumentti'], depth:'kevyt',
    text:'Mitä opit? Mikä oli sinulle uutta?', label:'Uutta tietoa',
    leads:['Uutta tietoa', 'Opin tästä'] },
  { id:'q_dok_aihe', kinds:['dokumentti'], depth:'kevyt',
    text:'Kiinnostiko aihe jo etukäteen vai vasta katsoessa?', label:'Aihe',
    leads:['Aiheesta', 'Kiinnostuksen suhteen'] },
  { id:'q_dok_vakuutti', kinds:['dokumentti'], depth:'tavallinen',
    text:'Vakuuttiko dokumentti? Uskoitko sen väitteitä?', label:'Uskottavuus',
    leads:['Uskottavuudesta', 'Vakuuttavuuden osalta'] },
  { id:'q_dok_puoli', kinds:['dokumentti'], depth:'tavallinen',
    text:'Oliko näkökulma tasapuolinen vai selvästi puolueellinen?', label:'Tasapuolisuus',
    leads:['Näkökulmasta', 'Tasapuolisuuden osalta'] },
  { id:'q_dok_haast', kinds:['dokumentti'], depth:'tavallinen',
    text:'Toimivatko haastateltavat? Jäikö joku mieleen?', label:'Haastateltavat',
    leads:['Haastateltavista', 'Puhujien osalta'] },
  { id:'q_dok_rakenne', kinds:['dokumentti'], depth:'tavallinen',
    text:'Pysyikö dokumentti kasassa vai rönsyilikö se?', label:'Rakenne',
    leads:['Rakenteesta', 'Kokonaisuuden hallinnasta'] },
  { id:'q_dok_muutti', kinds:['dokumentti'], depth:'syva',
    text:'Muuttiko se käsitystäsi jostain?', label:'Muutti käsitystä',
    leads:['Käsitykseni muuttui', 'Ajattelun osalta'] },
  { id:'q_dok_keinot', kinds:['dokumentti'], depth:'syva',
    text:'Miten arkistomateriaalia, haastatteluja tai rekonstruktioita käytettiin?', label:'Keinot',
    leads:['Toteutuksen keinoista', 'Kerronnan tavoista'] },

  // ── ANIMAATIOT ──
  { id:'q_ani_tyyli', kinds:['animaatio'], depth:'kevyt',
    text:'Miltä animaatiotyyli näytti?', label:'Animaatiotyyli',
    leads:['Animaatiotyylistä', 'Ulkoasun osalta'] },
  { id:'q_ani_kuva', kinds:['animaatio'], depth:'kevyt',
    text:'Mikä kuva tai kohtaus jäi silmiin?', label:'Kuva',
    leads:['Silmiin jäi', 'Visuaalisesti mieleen jäi'] },
  { id:'q_ani_huumori', kinds:['animaatio'], depth:'kevyt',
    text:'Toimiko huumori myös aikuiselle?', label:'Huumori',
    leads:['Huumorista', 'Aikuisen näkökulmasta'] },
  { id:'q_ani_aani', kinds:['animaatio'], depth:'tavallinen',
    text:'Toimivatko ääninäyttelijät?', label:'Ääninäyttely',
    leads:['Ääninäyttelystä', 'Äänirooleista'] },
  { id:'q_ani_kohde', kinds:['animaatio'], depth:'tavallinen',
    text:'Kenelle tämä oikeastaan on suunnattu?', label:'Kohdeyleisö',
    leads:['Kohdeyleisöstä', 'Kenelle tämä on tehty'] },
  { id:'q_ani_tunne', kinds:['animaatio'], depth:'tavallinen',
    text:'Toimiko tunnepuoli vai jäikö se pinnalliseksi?', label:'Tunnepuoli',
    leads:['Tunnepuolesta', 'Tunteiden osalta'] },
  { id:'q_ani_tekniikka', kinds:['animaatio'], depth:'syva',
    text:'Huomasitko tekniikan — käsin piirretty, 3D, stop motion? Palveliko se tarinaa?', label:'Tekniikka',
    leads:['Tekniikasta', 'Toteutustavan osalta'] },
  { id:'q_ani_maailma', kinds:['animaatio'], depth:'syva',
    text:'Millainen maailma rakennettiin? Olisitko halunnut nähdä siitä enemmän?', label:'Maailma',
    leads:['Maailmasta', 'Rakennetun maailman osalta'] }
];

// ════════════════════════════════════════════════════════════
// ASETUKSET
// ════════════════════════════════════════════════════════════

function qs(){
  const s = ensureSettings();
  if(!s.qbank || typeof s.qbank !== 'object') s.qbank = {};
  const q = s.qbank;
  if(typeof q.enabled !== 'boolean') q.enabled = true;
  if(!Q_DEPTHS.some(d => d.id === q.depth)) q.depth = 'tavallinen';
  if(!Q_STYLES.some(d => d.id === q.style)) q.style = 'proosa';
  if(typeof q.closing !== 'boolean') q.closing = false;
  if(!Array.isArray(q.favorites)) q.favorites = [];
  if(!Array.isArray(q.skipped))   q.skipped = [];
  if(!Array.isArray(q.custom))    q.custom = [];
  return q;
}
window.qbankSettings = qs;

window.qbankEnabled = function(){ return qs().enabled; };

// ════════════════════════════════════════════════════════════
// ELOKUVATYYPIN TUNNISTUS
// Alalaji ja genre voivat kumpikin kertoa dokumentista tai animaatiosta.
// Kumpaakaan ei voi olettaa käytössä olevaksi, joten katsotaan molempia.
// ════════════════════════════════════════════════════════════

window.movieKind = function(r){
  const hay = [
    subcatOf(r),
    ...(Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []))
  ].join(' ').toLowerCase();
  if(/dokument/.test(hay)) return 'dokumentti';
  if(/animaatio|anime/.test(hay)) return 'animaatio';
  return 'perus';
};

// Kysymykset koskevat vain elokuvia. Sarjoissa vapaa kenttä riittää.
window.qbankApplies = function(r){
  if(!r) return false;
  if(!qs().enabled) return false;
  return r.category === 'Elokuvat';
};

// ════════════════════════════════════════════════════════════
// KYSYMYSTEN VALINTA
// ════════════════════════════════════════════════════════════

function allQuestions(){
  const custom = qs().custom.map(c => ({
    id: c.id, text: c.text, label: c.label || 'Oma kysymys',
    depth: c.depth || 'kevyt', kinds: Array.isArray(c.kinds) && c.kinds.length ? c.kinds : ['perus','dokumentti','animaatio'],
    leads: (c.label ? [c.label] : ['Lisäksi']), custom: true
  }));
  return [...QUESTION_BANK, ...custom];
}
window.allQuestions = allQuestions;

function depthAllows(qDepth){
  const d = qs().depth;
  if(d === 'kevyt')      return qDepth === 'kevyt';
  if(d === 'tavallinen') return qDepth === 'kevyt' || qDepth === 'tavallinen';
  return true;
}

// Dynaamiset kysymykset syntyvät teoksen omista tiedoista, joten niitä
// ei voi säilyttää pankissa valmiina.
function dynamicQuestions(r){
  const out = [];
  if(r.cast && r.cast.length){
    out.push({ id:'q_dyn_cast', dynamic:true, depth:'tavallinen', label:'Näyttelijätyö',
      text:`Miten ${r.cast[0]} pärjäsi roolissaan?`,
      leads:[`${r.cast[0]} roolissaan`, 'Näyttelijätyöstä'] });
  }
  if(r.director){
    out.push({ id:'q_dyn_dir', dynamic:true, depth:'syva', label:'Ohjaajan käsiala',
      text:`Tunnistitko ${r.director} käsialaa? Miten tämä suhteutuu hänen muihin töihinsä?`,
      leads:['Ohjaajan käsialasta', `${r.director} otteesta`] });
  }
  // Vertailukohta omasta kokoelmasta: lähin piste samasta kategoriasta
  const score = getReviewScore(r);
  if(score != null){
    const near = (appData.reviews || [])
      .filter(x => x.id !== r.id && x.category === 'Elokuvat' && getReviewScore(x) != null)
      .map(x => ({ x, d: Math.abs(getReviewScore(x) - score) }))
      .sort((a, b) => a.d - b.d)[0];
    if(near && near.d <= 6){
      const nm = plainName(near.x);
      out.push({ id:'q_dyn_cmp', dynamic:true, depth:'tavallinen', label:'Vertailu',
        text:`Annoit elokuvalle ${nm} lähes saman pisteen (${getReviewScore(near.x)}). Kumpi oli parempi ja miksi?`,
        leads:[`Verrattuna elokuvaan ${nm}`, 'Vertailusta'] });
    }
  }
  return out;
}

// Kysymysten painotus: suosikit nousevat useammin, ohitetut eivät koskaan,
// ja genreen osuvat kysymykset saavat lisäpainoa.
window.pickQuestions = function(r, exclude){
  const kind = window.movieKind(r);
  const skip = new Set([...(qs().skipped || []), ...(exclude || [])]);
  const favs = new Set(qs().favorites || []);
  const genres = (Array.isArray(r.genre) ? r.genre : (r.genre ? [r.genre] : []))
    .map(g => String(g).toLowerCase());

  const pool = [...allQuestions(), ...dynamicQuestions(r)]
    .filter(q => !skip.has(q.id))
    .filter(q => q.dynamic || (q.kinds || []).includes(kind))
    .filter(q => depthAllows(q.depth))
    .map(q => {
      let w = 1;
      if(favs.has(q.id)) w += 3;
      if(q.genres && q.genres.some(g => genres.includes(g))) w += 4;
      else if(q.genres) w -= 0.7;   // genrekysymys väärässä genressä: harvemmin
      return { q, w: Math.max(0.2, w) };
    });

  return pool;
};

// Painotettu arvonta ilman toistoa
window.nextQuestion = function(r, used){
  const pool = window.pickQuestions(r, used);
  if(!pool.length) return null;
  const total = pool.reduce((a, p) => a + p.w, 0);
  let t = Math.random() * total;
  for(const p of pool){ t -= p.w; if(t <= 0) return p.q; }
  return pool[pool.length - 1].q;
};

// ════════════════════════════════════════════════════════════
// TEKSTIN KOKOAMINEN
// Sovellus ei ymmärrä vastauksia, joten se ei voi tiivistää niitä.
// Se voi kuitenkin järjestää ne, vaihdella johdantoja ja jakaa
// kappaleisiin — ja se riittää yllättävän pitkälle, koska kysymykset
// on kirjoitettu niin että vastaus on jo valmis lause.
// ════════════════════════════════════════════════════════════

// Siemenpohjainen satunnaisuus, jotta "muotoile uudelleen" antaa aina
// eri tuloksen mutta sama siemen tuottaa saman tekstin.
function seeded(seed){
  let t = seed >>> 0;
  return function(){
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function cleanAnswer(s){
  let t = String(s || '').trim();
  if(!t) return '';
  // Yhtenäistetään välit ja varmistetaan lopetusmerkki, jotta lauseet
  // eivät törmää toisiinsa kappaleen sisällä.
  t = t.replace(/\s+/g, ' ');
  if(!/[.!?…]$/.test(t)) t += '.';
  return t;
}

const CLOSINGS = {
  high: ['Kaiken kaikkiaan vahva katselukokemus.', 'Kokonaisuutena tämä oli onnistunut.'],
  mid:  ['Kokonaisuutena ihan katsottava.', 'Kaiken kaikkiaan kelvollinen mutta ei enempää.'],
  low:  ['Kokonaisuutena tämä ei jättänyt paljon käteen.', 'Kaiken kaikkiaan pettymys.']
};

// answers = [{ q, text }]
window.assembleNote = function(answers, opts){
  const o = opts || {};
  const style = o.style || qs().style;
  const rnd = seeded(o.seed || 1);
  const list = (answers || [])
    .map(a => ({ q: a.q, text: cleanAnswer(a.text) }))
    .filter(a => a.text);
  if(!list.length) return '';

  if(style === 'lista'){
    const rows = list.map(a => `- **${a.q.label || 'Huomio'}:** ${a.text}`);
    return rows.join('\n');
  }

  if(style === 'otsikot'){
    return list.map(a => `**${a.q.text}**\n${a.text}`).join('\n\n');
  }

  // Vapaa teksti. Johdantofraasi noin joka toiseen vastaukseen, jotta
  // teksti ei muutu kaksoispisteiden luetteloksi mutta ei myöskään jää
  // irrallisiksi lauseiksi.
  const parts = list.map((a, i) => {
    const leads = a.q.leads || [];
    const useLead = leads.length && i > 0 && rnd() < 0.55;
    if(!useLead) return a.text;
    const lead = leads[Math.floor(rnd() * leads.length)];
    // Alkukirjainta EI pienennetä: se rikkoisi erisnimet ("Toni Collette"),
    // ja suomessa kaksoispisteen jälkeinen kokonainen lause alkaa isolla.
    return `${lead}: ${a.text}`;
  });

  // Kappalejako: 2–3 virkettä per kappale, vaihdellen.
  const paras = [];
  let buf = [];
  for(let i = 0; i < parts.length; i++){
    buf.push(parts[i]);
    const target = rnd() < 0.5 ? 2 : 3;
    if(buf.length >= target && i < parts.length - 1){
      paras.push(buf.join(' '));
      buf = [];
    }
  }
  if(buf.length) paras.push(buf.join(' '));

  let text = paras.join('\n\n');

  if(o.closing && o.score != null){
    const band = o.score >= 80 ? 'high' : (o.score >= 55 ? 'mid' : 'low');
    const opts2 = CLOSINGS[band];
    text += '\n\n' + opts2[Math.floor(rnd() * opts2.length)];
  }
  return text;
};

// ════════════════════════════════════════════════════════════
// OHJATTU NÄKYMÄ
// Vastaukset kerätään omassa modaalissa. Valmis teksti siirtyy
// muistiinpanokenttään vasta kun se hyväksytään, jotta kesken jäänyt
// istunto ei sotke jo kirjoitettua tekstiä.
// ════════════════════════════════════════════════════════════

let _qaReview   = null;   // arvostelu jota kirjoitetaan
let _qaTarget   = 'form'; // 'form' = lomakkeen kenttä, 'review' = tallennettu arvostelu
let _qaAnswers  = [];     // [{ q, text }]
let _qaCurrent  = null;
let _qaSeed     = 1;

// Lomakkeelta avattaessa oikeaa arvostelua ei ole vielä olemassa, joten
// kysymysten valintaa varten kootaan väliaikainen tietue kentistä.
function formReviewStub(){
  const g = (typeof getSelectedGenres === 'function') ? getSelectedGenres() : [];
  const cast = (window._tmdbPending && window._tmdbPending.cast) || [];
  const dir  = (window._tmdbPending && window._tmdbPending.director) || null;
  const nameEl = document.getElementById('formName');
  return {
    id: editingId || -1,
    name: nameEl ? nameEl.value : '',
    category: document.getElementById('formCat') ? document.getElementById('formCat').value : 'Elokuvat',
    subcat: (typeof readFormSubcat === 'function')
      ? readFormSubcat(document.getElementById('formCat').value) : '',
    genre: g,
    cast, director: dir,
    score: (typeof selectedScore !== 'undefined') ? selectedScore : null
  };
}

window.openQuestionFlow = function(target, reviewId){
  _qaTarget  = target || 'form';
  _qaAnswers = [];
  _qaSeed    = Math.floor(Math.random() * 100000) + 1;

  if(_qaTarget === 'review'){
    _qaReview = (appData.reviews || []).find(x => x.id === reviewId) || null;
  } else {
    _qaReview = formReviewStub();
  }
  if(!_qaReview) return;
  if(_qaReview.category !== 'Elokuvat'){
    alert('Ohjatut kysymykset ovat käytössä vain elokuville. Sarjoissa kirjoita vapaasti tekstikenttään.');
    return;
  }

  _qaCurrent = window.nextQuestion(_qaReview, []);
  renderQuestionFlow();
  if(window.openModalOnTop) window.openModalOnTop('questionModal');
  else document.getElementById('questionModal').classList.add('open');
};

function usedIds(){ return _qaAnswers.map(a => a.q.id); }

window.qaNextQuestion = function(){
  const used = usedIds();
  if(_qaCurrent) used.push(_qaCurrent.id);
  const next = window.nextQuestion(_qaReview, used);
  // Kysymykset loppuivat: aloitetaan kierto alusta jo vastatut pois lukien
  _qaCurrent = next || window.nextQuestion(_qaReview, usedIds());
  renderQuestionFlow();
};

window.qaSaveAnswer = function(){
  const ta = document.getElementById('qaAnswer');
  if(!ta || !_qaCurrent) return;
  const val = ta.value.trim();
  if(!val){ window.qaNextQuestion(); return; }
  _qaAnswers.push({ q: _qaCurrent, text: val });
  ta.value = '';
  window.qaNextQuestion();
};

window.qaRemoveAnswer = function(i){
  _qaAnswers.splice(i, 1);
  renderQuestionFlow();
};

window.qaToggleFavorite = function(){
  if(!_qaCurrent || _qaCurrent.dynamic) return;
  const f = qs().favorites;
  const i = f.indexOf(_qaCurrent.id);
  if(i >= 0) f.splice(i, 1); else f.push(_qaCurrent.id);
  renderQuestionFlow();
  window.fbSave();
};

window.qaSkipForever = function(){
  if(!_qaCurrent || _qaCurrent.dynamic) return;
  const sk = qs().skipped;
  if(!sk.includes(_qaCurrent.id)) sk.push(_qaCurrent.id);
  window.fbSave();
  window.qaNextQuestion();
};

window.qaReshuffle = function(){
  _qaSeed = Math.floor(Math.random() * 100000) + 1;
  renderQuestionFlow();
};

window.qaSetStyle = function(style){
  qs().style = style;
  renderQuestionFlow();
  window.fbSave();
};

window.qaPreviewText = function(){
  return window.assembleNote(_qaAnswers, {
    seed: _qaSeed,
    style: qs().style,
    closing: qs().closing,
    score: _qaReview ? getReviewScore(_qaReview) : null
  });
};

window.qaApply = async function(mode){
  const text = window.qaPreviewText();
  if(!text) return;
  if(_qaTarget === 'form'){
    const ta = document.getElementById('formNote');
    if(!ta) return;
    const cur = ta.value.trim();
    ta.value = (mode === 'append' && cur) ? cur + '\n\n' + text : text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const r = _qaReview;
    const cur = (r.note || '').trim();
    r.note = (mode === 'append' && cur) ? cur + '\n\n' + text : text;
    await window.fbSave();
    renderAll();
    if(document.getElementById('readModal').classList.contains('open')) openReadModal(r.id);
  }
  window.closeModal('questionModal');
};

function renderQuestionFlow(){
  const host = document.getElementById('questionModalBody');
  if(!host) return;
  const q = _qaCurrent;
  const fav = q && !q.dynamic && qs().favorites.includes(q.id);
  const preview = window.qaPreviewText();
  const style = qs().style;

  host.innerHTML = `
    <div class="qa-progress">${_qaAnswers.length} ${_qaAnswers.length === 1 ? 'vastaus' : 'vastausta'} · ${esc(Q_KINDS.find(k => k.id === window.movieKind(_qaReview)).label)}</div>

    ${q ? `
    <div class="qa-card">
      <div class="qa-q">
        <span>${esc(q.text)}</span>
        ${q.dynamic ? '' : `<button type="button" class="qa-fav ${fav ? 'on' : ''}" onclick="qaToggleFavorite()" title="Suosikkikysymys">${fav ? '★' : '☆'}</button>`}
      </div>
      <textarea id="qaAnswer" rows="4" spellcheck="true" lang="fi" autocapitalize="sentences"
        placeholder="Vastaa vapaasti — tai hyppää seuraavaan."></textarea>
      <div class="qa-btns">
        <button type="button" class="btn-primary qa-btn" onclick="qaSaveAnswer()">✓ Tallenna ja jatka</button>
        <button type="button" class="btn-secondary qa-btn" onclick="qaNextQuestion()">🔀 Toinen kysymys</button>
      </div>
      ${q.dynamic ? '' : `<button type="button" class="qa-never" onclick="qaSkipForever()">Älä kysy tätä enää</button>`}
    </div>` : `<div class="qa-empty">Kysymykset loppuivat. Voit lisätä omia asetuksista.</div>`}

    ${_qaAnswers.length ? `
    <div class="qa-answers">
      <div class="qa-sec-label">Vastauksesi</div>
      ${_qaAnswers.map((a, i) => `
        <div class="qa-ans">
          <div class="qa-ans-q">${esc(a.q.label || a.q.text)}</div>
          <div class="qa-ans-t">${esc(a.text)}</div>
          <button type="button" class="qa-ans-del" onclick="qaRemoveAnswer(${i})" aria-label="Poista">✕</button>
        </div>`).join('')}
    </div>

    <div class="qa-preview-box">
      <div class="qa-sec-label">Valmis teksti</div>
      <div class="qa-styles">
        ${Q_STYLES.map(s => `<button type="button" class="filter-chip ${style === s.id ? 'active' : ''}" onclick="qaSetStyle('${s.id}')">${esc(s.label)}</button>`).join('')}
      </div>
      <div class="qa-preview">${escNl(preview)}</div>
      <div class="qa-btns">
        ${style === 'proosa' ? `<button type="button" class="btn-secondary qa-btn" onclick="qaReshuffle()">🎲 Muotoile uudelleen</button>` : ''}
        <button type="button" class="btn-secondary qa-btn" onclick="qaApply('append')">➕ Lisää perään</button>
        <button type="button" class="btn-primary qa-btn" onclick="qaApply('replace')">✓ Käytä teksti</button>
      </div>
    </div>` : `<div class="qa-hint">Vastaa vähintään yhteen kysymykseen, niin näet valmiin tekstin tässä.</div>`}`;
}

window.renderQuestionFlow = renderQuestionFlow;

// Nappi näkyy vain elokuville, joten se päivitetään kategorian mukana.
window.updateQuestionButton = function(){
  const btn = document.getElementById('qaOpenBtn');
  if(!btn) return;
  const catEl = document.getElementById('formCat');
  const isMovie = catEl && catEl.value === 'Elokuvat';
  btn.style.display = (isMovie && qs().enabled) ? '' : 'none';
};

// ════════════════════════════════════════════════════════════
// ASETUSNÄKYMÄ
// ════════════════════════════════════════════════════════════

let _qbKind = 'perus';
let _qbEditId = null;

window.setQbKind = function(k){ _qbKind = k; renderQbankSettings(); };

window.setQbEnabled = async function(on){
  qs().enabled = !!on;
  renderQbankSettings();
  window.updateQuestionButton();
  await window.fbSave();
};

window.setQbDepth = async function(d){
  qs().depth = d;
  renderQbankSettings();
  await window.fbSave();
};

window.setQbStyle = async function(s){
  qs().style = s;
  renderQbankSettings();
  await window.fbSave();
};

window.setQbClosing = async function(on){
  qs().closing = !!on;
  renderQbankSettings();
  await window.fbSave();
};

window.qbToggleFav = async function(id){
  const f = qs().favorites;
  const i = f.indexOf(id);
  if(i >= 0) f.splice(i, 1); else f.push(id);
  renderQbankSettings();
  await window.fbSave();
};

window.qbToggleSkip = async function(id){
  const sk = qs().skipped;
  const i = sk.indexOf(id);
  if(i >= 0) sk.splice(i, 1); else sk.push(id);
  renderQbankSettings();
  await window.fbSave();
};

window.qbAddOwn = async function(){
  const txt = (document.getElementById('qbNewText') || {}).value || '';
  const lbl = (document.getElementById('qbNewLabel') || {}).value || '';
  const t = txt.trim();
  if(!t){ return; }
  const c = qs().custom;
  if(_qbEditId){
    const ex = c.find(x => x.id === _qbEditId);
    if(ex){ ex.text = t; ex.label = lbl.trim() || 'Oma kysymys'; ex.kinds = [_qbKind]; }
    _qbEditId = null;
  } else {
    c.push({
      id: 'own_' + Date.now(),
      text: t,
      label: lbl.trim() || 'Oma kysymys',
      depth: 'kevyt',
      kinds: [_qbKind]
    });
  }
  renderQbankSettings();
  await window.fbSave();
};

window.qbEditOwn = function(id){
  const c = qs().custom.find(x => x.id === id);
  if(!c) return;
  _qbEditId = id;
  renderQbankSettings();
  const t = document.getElementById('qbNewText');
  const l = document.getElementById('qbNewLabel');
  if(t) t.value = c.text;
  if(l) l.value = c.label || '';
  if(t) t.focus();
};

window.qbDeleteOwn = async function(id){
  const q = qs();
  q.custom = q.custom.filter(x => x.id !== id);
  if(_qbEditId === id) _qbEditId = null;
  renderQbankSettings();
  await window.fbSave();
};

window.qbResetSkips = async function(){
  qs().skipped = [];
  renderQbankSettings();
  await window.fbSave();
};

function renderQbankSettings(){
  const host = document.getElementById('qbankBox');
  if(!host) return;
  const q = qs();

  if(!q.enabled){
    host.innerHTML = `
      <div class="toggle-row">
        <div>
          <div class="toggle-row-label">Ohjatut kysymykset</div>
          <div class="toggle-row-sub">Piilotettu. Muistiinpanokenttä toimii normaalisti.</div>
        </div>
        <button type="button" class="toggle-switch" onclick="setQbEnabled(true)"><span></span></button>
      </div>`;
    return;
  }

  const list = allQuestions().filter(x => (x.kinds || []).includes(_qbKind));
  const own  = q.custom.filter(x => (x.kinds || []).includes(_qbKind));

  host.innerHTML = `
    <div class="toggle-row">
      <div>
        <div class="toggle-row-label">Ohjatut kysymykset</div>
        <div class="toggle-row-sub">Vain elokuville. Sarjoissa käytetään vapaata tekstikenttää.</div>
      </div>
      <button type="button" class="toggle-switch on" onclick="setQbEnabled(false)"><span></span></button>
    </div>

    <div class="cfld-sep"></div>
    <label>Kysymysten syvyys</label>
    <div class="filter-row" style="margin:6px 0 4px;">
      ${Q_DEPTHS.map(d => `<button type="button" class="filter-chip ${q.depth === d.id ? 'active' : ''}" onclick="setQbDepth('${d.id}')">${esc(d.label)}</button>`).join('')}
    </div>
    <div class="toggle-row-sub">${esc((Q_DEPTHS.find(d => d.id === q.depth) || {}).hint || '')}</div>

    <div class="cfld-sep"></div>
    <label>Valmiin tekstin tyyli</label>
    <div class="filter-row" style="margin:6px 0 4px;">
      ${Q_STYLES.map(s => `<button type="button" class="filter-chip ${q.style === s.id ? 'active' : ''}" onclick="setQbStyle('${s.id}')">${esc(s.label)}</button>`).join('')}
    </div>
    <div class="toggle-row-sub">${esc((Q_STYLES.find(s => s.id === q.style) || {}).hint || '')}</div>

    <div class="toggle-row" style="margin-top:12px;">
      <div>
        <div class="toggle-row-label">Lisää loppulause pisteen mukaan</div>
        <div class="toggle-row-sub">Esimerkiksi ”Kokonaisuutena tämä oli onnistunut.” korkealla pisteellä.</div>
      </div>
      <button type="button" class="toggle-switch ${q.closing ? 'on' : ''}" onclick="setQbClosing(${q.closing ? 'false' : 'true'})"><span></span></button>
    </div>

    <div class="cfld-sep"></div>
    <label>Kysymyspankki</label>
    <div class="cfld-tabs" style="margin-top:8px;">
      ${Q_KINDS.map(k => `<button type="button" class="cfld-tab ${_qbKind === k.id ? 'active' : ''}" onclick="setQbKind('${k.id}')">${k.icon} ${esc(k.label)}</button>`).join('')}
    </div>
    <div class="toggle-row-sub" style="margin-bottom:8px;">
      ★ nostaa kysymyksen esiin useammin · 🚫 poistaa sen kierrosta.
      Dokumentti ja animaatio tunnistetaan alalajista tai genrestä.
    </div>
    <div class="qb-list">
      ${list.map(x => {
        const fav = q.favorites.includes(x.id);
        const sk  = q.skipped.includes(x.id);
        return `<div class="qb-row ${sk ? 'skipped' : ''}">
          <div class="qb-text">
            <div class="qb-q">${esc(x.text)}</div>
            <div class="qb-meta">${esc((Q_DEPTHS.find(d => d.id === x.depth) || {}).label || x.depth)}${x.genres ? ' · ' + esc(x.genres.join(', ')) : ''}${x.custom ? ' · oma' : ''}</div>
          </div>
          <button type="button" class="qb-ico ${fav ? 'on' : ''}" onclick="qbToggleFav('${x.id}')" aria-label="Suosikki">${fav ? '★' : '☆'}</button>
          <button type="button" class="qb-ico ${sk ? 'on' : ''}" onclick="qbToggleSkip('${x.id}')" aria-label="Ohita">${sk ? '🚫' : '👁️'}</button>
          ${x.custom ? `<button type="button" class="qb-ico" onclick="qbEditOwn('${x.id}')" aria-label="Muokkaa">✏️</button>
                        <button type="button" class="qb-ico" onclick="qbDeleteOwn('${x.id}')" aria-label="Poista">🗑️</button>` : ''}
        </div>`;
      }).join('')}
    </div>
    ${q.skipped.length ? `<button type="button" class="thr-reset" onclick="qbResetSkips()">↩️ Palauta ohitetut (${q.skipped.length})</button>` : ''}

    <div class="cfld-sep"></div>
    <label>${_qbEditId ? 'Muokkaa omaa kysymystä' : 'Lisää oma kysymys'}</label>
    <input type="text" id="qbNewText" maxlength="160" placeholder="Kysymys, esim. Mitä jäit miettimään?">
    <input type="text" id="qbNewLabel" maxlength="30" placeholder="Lyhyt aihetunniste, esim. Mietteet" style="margin-top:8px;">
    <button type="button" class="btn-secondary" style="width:100%;margin-top:8px;padding:11px;border-radius:10px;font-weight:600;cursor:pointer;"
      onclick="qbAddOwn()">${_qbEditId ? '✓ Tallenna muutos' : '➕ Lisää kysymys ryhmään ' + esc((Q_KINDS.find(k => k.id === _qbKind) || {}).label || '')}</button>
    <div class="toggle-row-sub" style="margin-top:6px;">Oma kysymys lisätään siihen ryhmään joka on yllä valittuna. Nykyisiä omia: ${own.length}.</div>`;
}

window.renderQbankSettings = renderQbankSettings;

// ════════════════════════════════════════════════════════════
// KYTKENNÄT
// Napit lisätään olemassa oleviin näkymiin kääreillä, jotta muiden
// tiedostojen pohjia ei tarvitse muokata tämän takia.
// ════════════════════════════════════════════════════════════

['openAddModal', 'editReview', 'onCatChange'].forEach(fn => {
  const orig = window[fn];
  if(typeof orig !== 'function') return;
  window[fn] = function(...args){
    const out = orig.apply(this, args);
    try{ window.updateQuestionButton(); } catch(e){}
    return out;
  };
});

// Luku-modaali: vanhan arvostelun täydentäminen jälkikäteen.
(function(){
  const orig = window.openReadModal;
  if(typeof orig !== 'function') return;
  window.openReadModal = function(id){
    const out = orig.call(this, id);
    try{
      const r = (appData.reviews || []).find(x => x.id === id);
      const host = document.getElementById('readModalContent');
      if(r && host && window.qbankApplies(r)){
        const has = (r.note || '').trim();
        host.insertAdjacentHTML('beforeend',
          `<button type="button" class="qa-read-btn" onclick="openQuestionFlow('review', ${id})">
             💬 ${has ? 'Täydennä arvostelua kysymysten avulla' : 'Kirjoita arvostelu kysymysten avulla'}
           </button>`);
      }
    } catch(e){}
    return out;
  };
})();
