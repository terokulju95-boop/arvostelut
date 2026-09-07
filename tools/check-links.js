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

if(badSec.length || badTab.length) process.exit(1);
console.log('Uutuuslistan linkit kunnossa: ' + secs.size + ' osiota, ' + tabs.size + ' välilehteä.');
