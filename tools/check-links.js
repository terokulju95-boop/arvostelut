#!/usr/bin/env node
// Tarkistaa että uutuuslistan tab- ja sec-viittaukset osoittavat oikeasti
// olemassa oleviin asetusvälilehtiin ja osioihin. Kuollut linkki ei kaada
// mitään, se vain ei tee mitään — mikä on juuri se vika jonka huomaa vasta
// kun joku painaa nappia eikä mitään tapahdu.
//
// Ajo: node tools/check-links.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const html  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cards = fs.readFileSync(path.join(ROOT, 'app-cards.js'), 'utf8');

const secs = new Set([...html.matchAll(/data-sec="([^"]+)"/g)].map(m => m[1]));
const tabs = new Set([...html.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1]));

const badSec = [...new Set([...cards.matchAll(/sec:'([^']+)'/g)].map(m => m[1]))].filter(s => !secs.has(s));
const badTab = [...new Set([...cards.matchAll(/tab:'([^']+)'/g)].map(m => m[1]))].filter(t => !tabs.has(t));

if(badSec.length) console.error('Osiota ei ole: ' + badSec.join(', '));
if(badTab.length) console.error('Välilehteä ei ole: ' + badTab.join(', '));

// ── MODAALIEN TUNNUKSET ──
// Modaali avataan lisäämällä open-luokka ja suljetaan closeModal-kutsulla.
// Kumpikaan ei kerro mitään jos tunnus on kirjoitettu väärin: nappi vain
// ei tee mitään, eikä konsoliin tule riviäkään.
//
// Tarkistus rajataan modaaleihin eikä kaikkiin elementteihin, koska iso
// osa sovelluksen elementeistä luodaan ajossa eikä niitä ole HTML:ssä.
// Kattaa nimet joissa esiintyy Modal tai Overlay sekä kaikki
// closeModal-kutsujen kohteet. Ei siis löydä aivan jokaista
// kirjoitusvirhettä, mutta kaikki jotka noudattavat nimeämistapaa.
const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
const js = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n') + '\n' + html;

const allIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const modals = new Set([...html.matchAll(/class="modal-overlay[^"]*"\s+id="([^"]+)"/g)].map(m => m[1]));

const refs = new Set([
  ...[...js.matchAll(/closeModal\('([^']+)'\)/g)].map(m => m[1]),
  ...[...js.matchAll(/closeModalIfOutside\(event,\s*'([^']+)'\)/g)].map(m => m[1]),
  ...[...js.matchAll(/getElementById\('([^']*(?:Modal|Overlay)[^']*)'\)/g)].map(m => m[1])
]);
const badModal = [...refs].filter(id => !allIds.has(id));
if(badModal.length) console.error('Tunnusta ei ole HTML:ssä: ' + badModal.join(', '));

if(badSec.length || badTab.length || badModal.length) process.exit(1);
console.log('Uutuuslistan linkit kunnossa: ' + secs.size + ' osiota, ' + tabs.size + ' välilehteä.');
console.log('Modaalit kunnossa: ' + modals.size + ' määriteltyä, ' + refs.size + ' viitattua tunnusta.');
