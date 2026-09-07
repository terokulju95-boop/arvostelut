#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// VERSIONNOSTO
// Ajetaan GitHub Actionissa jokaisen pushin jälkeen. Tekee kaksi asiaa:
//
//   1. Kirjoittaa saman versioleiman kaikkiin JS-tiedostoihin
//      (window.BUILD_XXX = 'YYYY-MM-DD.N')
//   2. Nostaa service workerin VERSION-numeroa yhdellä
//
// Nämä on ennen pitänyt muistaa käsin. Yksikin unohdus tarkoittaa että
// puhelin voi tarjoilla vanhaa koodia välimuistista, tai että osa
// tiedostoista on eri versiota kuin muut — jolloin napit näkyvät mutta
// niiden takana oleva funktio puuttuu.
//
// Skripti ei ota kantaa siihen mitä muutit. Se olettaa että jos jotain
// on työnnetty, versio kuuluu nostaa.
//
// Ajo paikallisesti (kuivaharjoitus, ei kirjoita mitään):
//   node tools/bump-version.js --dry
// ══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY  = process.argv.includes('--dry');

// Versioleima on muotoa 2026-09-08.3 — päivä ja saman päivän juokseva
// numero. Päivä luetaan Suomen ajassa, koska leima näkyy käyttäjälle.
const BUILD_RE   = /(window\.BUILD_[A-Z0-9_]+\s*=\s*')(\d{4}-\d{2}-\d{2}\.\d+)(')/g;
const SW_RE      = /(^const VERSION\s*=\s*)(\d+)(\s*;)/m;
const SW_FILE    = path.join(ROOT, 'sw.js');

function today(){
  // sv-SE antaa valmiiksi muodon YYYY-MM-DD.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function jsFiles(){
  return fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(ROOT, f));
}

// Suurin leima kaikista tiedostoista. Jos joku tiedosto on jäänyt
// jälkeen, se ei saa vetää koko versiota taaksepäin.
function currentStamp(files){
  let best = null;
  let bestRank = -1;
  for(const file of files){
    const src = fs.readFileSync(file, 'utf8');
    for(const m of src.matchAll(BUILD_RE)){
      const r = rank(m[2]);
      if(r > bestRank){ bestRank = r; best = m[2]; }
    }
  }
  return best;
}

// Sama vertailulogiikka kuin app-cards.js:n buildRank. Merkkijonovertailu
// menisi pieleen heti kun saman päivän julkaisuja on yli yhdeksän:
// '2026-09-06.10' on merkkijonona pienempi kuin '2026-09-06.9'.
function rank(stamp){
  const m = String(stamp || '').match(/^(\d{4})-(\d{2})-(\d{2})\.(\d+)$/);
  if(!m) return -1;
  return ((+m[1] * 10000) + (+m[2] * 100) + (+m[3])) * 10000 + (+m[4]);
}

function nextStamp(cur){
  const day = today();
  if(!cur) return day + '.0';
  const m = cur.match(/^(\d{4}-\d{2}-\d{2})\.(\d+)$/);
  if(!m) return day + '.0';

  // Sama päivä → juokseva numero eteenpäin.
  if(m[1] === day) return day + '.' + (Number(m[2]) + 1);

  // Tiedostoissa on tulevaisuuden päivä. Ei palata ajassa taaksepäin,
  // koska laskeva versio rikkoisi uutuuslistan vertailun. Jatketaan
  // juoksevasta numerosta kunnes kello ehtii kiinni.
  //
  // HUOM: vertailu tehdään päivämäärämerkkijonoina, ei rank-lukuna.
  // Muoto YYYY-MM-DD järjestyy merkkijonona oikein, kun taas rank
  // pakkaa juoksevan numeron 10000:n lokeroon — sentinelin '.999999'
  // käyttö vuoti seuraavan päivän alueelle ja käänsi vertailun väärin
  // päin. Sama raja koskee app-cards.js:n buildRank-funktiota: yli
  // 9999 julkaisua samana päivänä sotkisi järjestyksen.
  if(m[1] > day) return m[1] + '.' + (Number(m[2]) + 1);

  // Normaali tapaus: uusi päivä, numerointi alkaa nollasta.
  return day + '.0';
}

function main(){
  const files = jsFiles();
  if(!files.length){
    console.error('VIRHE: yhtään .js-tiedostoa ei löytynyt kansiosta ' + ROOT);
    process.exit(1);
  }

  const cur  = currentStamp(files);
  const next = nextStamp(cur);
  console.log('Nykyinen leima: ' + (cur || 'ei löytynyt'));
  console.log('Uusi leima:     ' + next);

  let stampCount = 0;
  let fileCount  = 0;
  for(const file of files){
    const src = fs.readFileSync(file, 'utf8');
    let hits = 0;
    const out = src.replace(BUILD_RE, (all, a, old, b) => {
      hits++;
      return a + next + b;
    });
    if(!hits) continue;
    stampCount += hits;
    fileCount++;
    if(out !== src && !DRY) fs.writeFileSync(file, out);
    console.log('  ' + path.basename(file) + ' (' + hits + ')');
  }

  if(!stampCount){
    console.error('VIRHE: yhtään versioleimaa ei löytynyt. Onko muoto muuttunut?');
    process.exit(1);
  }

  // ── SERVICE WORKER ──
  if(!fs.existsSync(SW_FILE)){
    console.error('VIRHE: sw.js puuttuu.');
    process.exit(1);
  }
  const sw = fs.readFileSync(SW_FILE, 'utf8');
  const m = sw.match(SW_RE);
  if(!m){
    console.error('VIRHE: sw.js:stä ei löytynyt riviä "const VERSION = <numero>;"');
    process.exit(1);
  }
  const swNext = Number(m[2]) + 1;
  if(!DRY) fs.writeFileSync(SW_FILE, sw.replace(SW_RE, (all, a, old, b) => a + swNext + b));
  console.log('  sw.js VERSION ' + m[2] + ' → ' + swNext);

  // ── UUTUUSLISTAN UUSIN MERKINTÄ ──
  // WHATS_NEW-listan build-arvot ovat julkaisumerkkejä, eivät tiedoston
  // versioleimoja. Käsin kirjoitettu merkintä jäisi kuitenkin aina yhden
  // jälkeen, koska tämä skripti ajetaan vasta pushin jälkeen — jolloin
  // asetusten versionumero ja muutoslokin otsikko eivät täsmää.
  //
  // Päivitetään siksi VAIN ensimmäinen esiintymä, ja vain jos se on tällä
  // hetkellä listan suurin. Massahaku rikkoisi vanhat merkinnät, mistä
  // app-cards.js:n oma kommentti erikseen varoittaa.
  const CARDS = path.join(ROOT, 'app-cards.js');
  if(fs.existsSync(CARDS)){
    const cards = fs.readFileSync(CARDS, 'utf8');
    const all = [...cards.matchAll(/\{\s*build:'(\d{4}-\d{2}-\d{2}\.\d+)'/g)];
    if(all.length){
      const first = all[0][1];
      const maxRank = Math.max(...all.map(x => rank(x[1])));
      if(rank(first) === maxRank && rank(first) < rank(next)){
        const out = cards.replace(all[0][0], all[0][0].replace(first, next));
        if(!DRY) fs.writeFileSync(CARDS, out);
        console.log('  uutuuslistan uusin merkintä ' + first + ' → ' + next);
      }
    }
  }

  console.log('\nValmis: ' + stampCount + ' leimaa ' + fileCount + ' tiedostossa' + (DRY ? ' (kuivaharjoitus, mitään ei kirjoitettu)' : ''));

  // GitHub Action lukee tämän ja käyttää sitä commit-viestissä.
  if(process.env.GITHUB_OUTPUT){
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'stamp=' + next + '\n');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'swversion=' + swNext + '\n');
  }
}

main();
