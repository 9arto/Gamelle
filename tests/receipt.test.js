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
