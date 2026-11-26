// Lecture du texte d'un ticket de caisse (sortie d'OCR simulée) : total, articles, rapprochement, carnet de prix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, loadRecipes } = require('./load-groceries.js');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'receipt.js'), 'utf8'), ctx);
const R = ctx.window.GamelleReceipt;
const plain = (v) => JSON.parse(JSON.stringify(v));

const T1 = `GRAND FRAIS
12 RUE DES LILAS 75000 PARIS
Date 22/11/2026 18:42
POULET FERMIER 12,40
1,240 kg x 9,99 EUR/kg
TOMATES GRAPPE 3,45
CREME FRAICHE EPAISSE 20CL 1,89
LAIT DEMI ECREME 2,30
2 x 1,15
COURGETTES 2,10
SOUS-TOTAL 22,14
TOTAL A PAYER 22,14
CB SANS CONTACT 22,14
TVA 5,5% 1,10
MERCI DE VOTRE VISITE`;

test('ticket : total, date et lignes d\'articles (poids, quantité × prix)', () => {
  const r = R.parseReceipt(T1);
  assert.equal(r.total, 22.14);
  assert.equal(r.date, '22/11/2026');
  assert.deepEqual(plain(r.lines.map((l) => [l.label, l.price, l.qty, l.kg])), [
    ['POULET FERMIER', 12.4, 1, 1.24], ['TOMATES GRAPPE', 3.45, 1, null], ['CREME FRAICHE EPAISSE 20CL', 1.89, 1, null],
    ['LAIT DEMI ECREME', 2.3, 2, null], ['COURGETTES', 2.1, 1, null]
  ]);
  assert.equal(r.itemsSum, 22.14);
});

test('ticket : poids avant l\'article, lignes sans « TOTAL » (repli sur CB), confusions OCR (O/l)', () => {
  const t = `BOUCHERIE
0,85O kg x 14,90 EUR/kg
BAVETTE DE BOEUF 12,67
BEURRE DOUX 250G 2,l9
CB 14,86`;
  const r = R.parseReceipt(t);
  assert.deepEqual(plain(r.lines.map((l) => [l.label, l.price, l.kg])), [['BAVETTE DE BOEUF', 12.67, 0.85], ['BEURRE DOUX 250G', 2.19, null]]);
  assert.equal(r.total, 14.86);
});

test('ticket : sans aucun total, la somme des articles est proposée ; les lignes parasites sont ignorées', () => {
  const r = R.parseReceipt('PAIN COMPLET 1,50\nPOMMES GOLDEN 2,80\nCarte fidélité 0,00\nTVA 5,5% 0,23');
  assert.equal(r.total, 4.3);
  assert.equal(r.lines.length, 2);
  assert.equal(R.parseReceipt('').total, null);
});

test('ticket : rapprochement avec les articles de la liste de courses', () => {
  const { normalizeIngredient } = load([]).api;
  const names = ['Crème fraîche (épaisse ou liquide)', 'Lait (demi-écrémé ou entier)', 'Tomates fraîches', 'Courgettes', 'Filet de poulet'];
  const m = (l) => R.matchArticle(l, names, (i) => normalizeIngredient(i));
  assert.equal(m('CREME FRAICHE EPAISSE 20CL'), 'Crème fraîche (épaisse ou liquide)');
  assert.equal(m('LAIT DEMI ECREME'), 'Lait (demi-écrémé ou entier)');
  assert.equal(m('COURGETTES'), 'Courgettes');
  assert.equal(m('SAVON LIQUIDE'), null, 'article hors liste : non reconnu');
});

test('prix réels : carnet de prix, prix appris et totaux par rayon', () => {
  let book = R.updatePriceBook({}, [{ id: 'filet de poulet', price: 12.4, kg: 1.24 }, { id: 'courgettes', price: 2.1, qty: 1 }], 1000);
  assert.equal(book['filet de poulet'].kg, 10);
  assert.equal(book['courgettes'].u, 2.1);
  book = R.updatePriceBook(book, [{ id: 'filet de poulet', price: 13, kg: 1 }], 2000); // lissage 40/60
  assert.equal(book['filet de poulet'].kg, 11.8);
  assert.equal(book['filet de poulet'].n, 2);
  assert.equal(R.learnedPrice({ id: 'filet de poulet', baseUnit: 'g', quantity: 500 }, book), 5.9);
  assert.equal(R.learnedPrice({ id: 'courgettes', baseUnit: 'piece', quantity: 3 }, book), 6.3, 'pièces');
  assert.equal(R.learnedPrice({ id: 'inconnu', baseUnit: 'g', quantity: 100 }, book), null);
  assert.equal(R.learnedPrice({ id: 'courgettes', baseUnit: 'g', quantity: 100 }, book), null, 'prix à la pièce, quantité en g : on ne devine pas');
  assert.deepEqual(plain(R.rayonTotals([{ rayon: 'boucherie', price: 12.4 }, { rayon: 'boucherie', price: 3 }, { price: 2 }])), { boucherie: 15.4, autres: 2 });
});

// ---------------------------------------------------------------- vrai ticket Grand Frais (texte extrait du PDF ; numéros personnels remplacés)
const REAL = fs.readFileSync(path.join(__dirname, 'fixtures', 'ticket-grand-frais.txt'), 'utf8');

test('vrai ticket Grand Frais : total, date, remises, tare, rayons de caisse', () => {
  const r = R.parseReceipt(REAL);
  assert.equal(r.total, 110.25, '« 49 TOTAL » puis le montant sur la ligne suivante');
  assert.equal(r.date, '25/11/26');
  assert.deepEqual(plain(r.sections), { cremerie: 41.87, 'fruits-legumes': 19.78, boucherie: 33.96, epicerie: 14.64 }, 'sous-totaux imprimés par rayon');
  assert.equal(r.itemsSum, 110.25, 'la somme des lignes (remises et tare déduites, sac offert à 0 €) = le total');
  assert.equal(r.lines.length, 43);
  const by = (re) => r.lines.filter((l) => re.test(l.label));
  assert.deepEqual(plain(by(/^GNOCCHI/).map((l) => l.price)), [2.19, 2.19], '3,29 € − offre APP 1,10 €');
  const myrtille = by(/MYRTILLE/)[0];
  assert.deepEqual(plain([myrtille.price, myrtille.kg, myrtille.perKg]), [3.33, 0.19, 17.99], 'tare déduite, prix au kilo imprimé conservé');
  assert.equal(by(/^TOMATE/)[0].perKg, 2.99);
  assert.equal(by(/^YAOURT/)[0].qty, 1, '« 8X12 » n\'est pas une quantité');
  assert.ok(!r.lines.some((l) => /SAC EXCLUSIF|TARE|OFFRE/i.test(l.label)), 'sac offert, tare et offres ne sont pas des articles');
  assert.ok(r.lines.every((l) => l.section), 'chaque ligne connaît son rayon de caisse');
});

test('vrai ticket Grand Frais : rapprochement des libellés tronqués avec les articles', () => {
  const { normalizeIngredient } = load(loadRecipes()).api;
  const idx = {};
  loadRecipes().forEach((rc) => rc.ingredients.forEach((i) => { const n = normalizeIngredient(i); idx[n.name] = n.rayon; }));
  const m = (l) => R.matchArticle(l, Object.keys(idx), (i) => normalizeIngredient(i));
  assert.equal(m('PDT BINTJE FILET 2'), 'Pommes de terre fraîches', 'et non « filets de poulet »');
  assert.equal(m('POULET : FILET X2'), 'Filets de poulet frais');
  assert.equal(m('POULET: PAVE (FILE'), 'Filets de poulet frais');
  assert.equal(m('LARDON FUME COUPE'), 'Lardons fumés pur porc');
  assert.equal(m('CREME FRAICHE EPAI'), 'Crème fraîche (épaisse ou liquide)');
  assert.equal(m('OEUFS PLEIN AIR X1'), 'Œufs frais');
  assert.equal(m('TOMATE OLIVETTE IM'), 'Tomates fraîches');
  assert.equal(m('POIVRON ROUGE IMPO'), 'Poivrons (rouges ou tricolores)');
  assert.equal(m('COURGETTE ESPAGNE'), 'Courgettes fraîches');
  assert.equal(m('BATAVIA VERTE'), 'Salade verte (mâche ou roquette)');
  assert.equal(m('PAIN BURGER BUNS B'), 'Pains burger briochés');
  assert.equal(m('WRAP BLE COMPLET 6'), 'Tortillas de blé');
  assert.equal(m('FROMAGE GREC 180G'), 'Feta AOP');
  assert.equal(m('GNOCCHI POMME DE T'), 'Gnocchis à poêler', 'les gnocchis ne sont pas des pommes');
  assert.equal(m('PUR JUS ORANGE BIO'), null, 'un jus n\'est pas une orange');
  assert.equal(m('POMME GALA'), null);
  assert.equal(m('BANANE'), null);
});

test('prix réels : le prix au kilo imprimé ou le poids du paquet alimente le carnet', () => {
  const r = R.parseReceipt(REAL);
  const idx = { 'Tomates fraîches': 1, 'Cheddar râpé': 1, 'Feta AOP': 1, 'Poivrons (rouges ou tricolores)': 1 };
  const items = r.lines.map((l) => ({ ...l, article: R.matchArticle(l.label, Object.keys(idx), () => null) })).filter((l) => l.article);
  const book = R.updatePriceBook({}, items.map((l) => ({ id: l.article.toLowerCase(), price: l.price, kg: l.kg, perKg: l.perKg, pack: l.pack, qty: l.qty })), 1);
  assert.equal(book['tomates fraîches'].kg, 2.99, 'prix au kilo imprimé');
  assert.equal(book['cheddar râpé'].kg, 17.07, '2,39 € pour 140 g');
  assert.equal(book['feta aop'].kg, 12.72, '2,29 € pour 180 g');
  assert.equal(book['poivrons (rouges ou tricolores)'].kg, 5.59, 'jaune 4,99 puis rouge 5,99 (lissage 40/60)');
  assert.equal(R.packSize('POMME SSA 4X100G'), 400);
});
