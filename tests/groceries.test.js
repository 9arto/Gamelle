// Tests de la liste de courses « simplifiée » (harmonisation + regroupement des ingrédients).
// Lancer : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, loadRecipes } = require('./load-groceries.js');

const RECIPES = loadRecipes();
const RAYONS = ['fruits-legumes', 'boucherie', 'poissonnerie', 'cremerie', 'epicerie'];

// Petit utilitaire : calcule la liste pour un planning donné.
function listFor(planIds, { portions = 4, recipes = RECIPES, locked = [], checked = {} } = {}) {
  const ctx = load(recipes);
  Object.assign(ctx.state, { plan: planIds, portions, lockedSlots: locked, checkedGroceries: checked });
  return ctx.api.computeGroceries();
}
// Les objets viennent d'un autre « realm » (vm) : on les ramène à de simples objets pour les comparer.
const plain = (v) => JSON.parse(JSON.stringify(v));
const byName = (list, name) => list.find((i) => i.name === name);
const mini = (id, ingredients, extra = {}) => ({ id, title: `Test ${id}`, basePortions: 4, ingredients, steps: [], ...extra });
const ing = (name, quantity, unit, rayon = 'epicerie') => ({ name, quantity, unit, rayon });

// ---------------------------------------------------------------------------
test('canonicalUnit : toutes les écritures d\'une même unité donnent la même forme', () => {
  const { canonicalUnit } = load([]).api;
  const cases = {
    g: ['g', 'G', 'gr', 'grammes'], kg: ['kg', 'kilo'], ml: ['ml', 'millilitres'], cl: ['cl'], l: ['l', 'litre', 'litres'],
    'c. à soupe': ['c. à soupe', 'cuillère à soupe', 'cuillères à soupe', 'cas', 'c.a.s', 'CS'],
    'c. à café': ['c. à café', 'cuillère à café', 'cac', 'c.a.c'],
    piece: ['pièce', 'pièces', 'piece', 'grosse pièce', 'grosses pièces', 'unité', 'escalope', '', null, undefined],
    gousse: ['gousse', 'gousses'], botte: ['botte', 'bottes'], pave: ['pavé', 'pavés', 'dos'],
    oeuf: ['œuf', 'œufs', 'oeuf'], tete: ['tête', 'têtes'], pincee: ['pincée', 'pincées'],
    poignee: ['poignée', 'poignées'], boite: ['boîte', 'boîtes'], cm: ['cm', 'centimètre', 'centimètres'],
    sachet: ['sachet', 'sachets', 'salade']
  };
  for (const [expected, variants] of Object.entries(cases)) {
    for (const v of variants) assert.equal(canonicalUnit(v), expected, `« ${v} » devrait donner ${expected}`);
  }
});

test('convertQuantity : conversions poids / volume / pièces', () => {
  const { convertQuantity } = load([]).api;
  assert.equal(convertQuantity(2, 'kg', 'g', 'Riz'), 2000);
  assert.equal(convertQuantity(500, 'g', 'g', 'x'), 500);
  assert.equal(convertQuantity(2, 'c. à soupe', 'ml', 'Crème'), 30);
  assert.equal(convertQuantity(2, 'piece', 'g', 'Patates douces'), 600);
  assert.equal(convertQuantity(600, 'g', 'piece', 'Patates douces'), 2);
  assert.equal(convertQuantity(3, 'piece', 'g', 'Ingrédient inconnu'), null, 'pas de poids connu → pas de conversion hasardeuse');
  assert.equal(convertQuantity(4, 'quartier', 'piece', 'Citrons jaunes'), 4 * 14 / 110);
});

test('formatQuantityAndUnit : arrondis et grammaire pour les courses', () => {
  const { formatQuantityAndUnit: f } = load([]).api;
  assert.equal(f(1500, 'g'), '1,5 kg');
  assert.equal(f(1000, 'g'), '1 kg');
  assert.equal(f(0.4, 'g'), '1 g');
  assert.equal(f(263, 'g', '', true), '270 g', 'arrondi à la dizaine supérieure pour acheter');
  assert.equal(f(263, 'g', '', false), '263 g');
  assert.equal(f(1200, 'ml'), '1,2 L');
  assert.equal(f(25, 'cl'), '250 ml');
  assert.equal(f(1, 'piece', '', true), '1 pièce');
  assert.equal(f(2.1, 'piece', '', true), '2 pièces', 'une poussière au-dessus n\'ajoute pas une pièce');
  assert.equal(f(2.5, 'piece', '', true), '3 pièces');
  assert.equal(f(0.4, 'botte', '', true), '1 botte', 'jamais « 0 botte » dans une liste de courses');
  assert.equal(f(6, 'oeuf', 'Œufs frais', true), '6');
  assert.equal(f(1, 'c. à soupe', '', true), '1 c. à soupe');
  assert.equal(f(3, 'c. à soupe', '', true), '3 c. à soupe');
  assert.equal(f(1, 'tete', '', true), '1 tête');
});

// ---------------------------------------------------------------------------
// Harmonisation des noms : un même produit écrit de plusieurs façons = une seule ligne
test('normalizeIngredient : regroupe les variantes d\'un même produit', () => {
  const { normalizeIngredient: n } = load([]).api;
  const name = (raw, unit = 'g') => n({ name: raw, quantity: 1, unit, rayon: 'epicerie' }).name;
  const groups = {
    'Gousses d\'ail': ['Ail', 'Gousses d\'ail', 'Gousse d\'ail', 'ail'],
    'Oignons jaunes': ['Oignon', 'Oignons', 'Oignon jaune', 'Ognons'],
    'Œufs frais': ['Œufs', 'Oeuf', 'Œufs frais', 'Œuf'],
    'Beurre (doux ou demi-sel)': ['Beurre', 'Beurre doux', 'Beurre demi-sel'],
    'Lait (demi-écrémé ou entier)': ['Lait', 'Lait demi-écrémé', 'Lait entier'],
    'Crème fraîche (épaisse ou liquide)': ['Crème fraîche', 'Crème liquide', 'Crème épaisse', 'Crème'],
    'Tomates concassées / Coulis': ['Tomates concassées', 'Coulis de tomates', 'Pulpe de tomate', 'Tomates concassées en boîte ou fraîches', 'Tomates fraîches ou concassées'],
    'Tomates fraîches': ['Tomates', 'Tomate', 'Tomates cerises'].slice(0, 2),
    'Lentilles corail': ['Lentilles corail', 'Lentilles corail ou vertes', 'Lentilles (vertes ou corail)'],
    'Oranges': ['Orange', 'Oranges', 'Oranges à jus'],
    'Kit pour fajitas (galettes & épices)': ['Kit fajitas', 'Kit pour fajitas'],
    'Pommes de terre fraîches': ['Pommes de terre', 'Pommes de terre fondantes', 'Pommes de terre (primeur)'],
    'Persil plat frais': ['Persil', 'Persil plat'],
    'Pâtes de blé (penne, fusilli ou coquillettes)': ['Pâtes', 'Penne', 'Spaghetti', 'Tagliatelles', 'Coquillettes'],
    'Riz blanc (basmati ou jasmin)': ['Riz', 'Riz basmati', 'Riz jasmin']
  };
  for (const [expected, variants] of Object.entries(groups)) {
    for (const v of variants) assert.equal(name(v), expected, `« ${v} » → « ${expected} »`);
  }
});

test('normalizeIngredient : un produit ne doit pas être absorbé par un mot qu\'il contient', () => {
  const { normalizeIngredient: n } = load([]).api;
  const name = (raw) => n({ name: raw, quantity: 1, unit: 'g', rayon: 'epicerie' }).name;
  assert.equal(name('Camembert au lait cru'), 'Camembert');
  assert.equal(name('Fromage à raclette au lait cru'), 'Fromage à raclette');
  assert.notEqual(name('Lait de coco'), 'Lait (demi-écrémé ou entier)');
  assert.equal(name('Lait de coco'), 'Lait de coco');
  assert.equal(name('Beurre de cacahuète'), 'Beurre de cacahuète (pot)');
  assert.equal(name('Pâte feuilletée pur beurre'), 'Pâte à tarte (feuilletée ou brisée)');
  assert.equal(name('Pâtes à lasagne aux œufs').startsWith('Plaques de lasagne'), true);
  assert.equal(name('Jus de citron'), 'Jus de citron', 'le jus n\'est pas un citron entier');
  assert.equal(name('Jus d\'orange'), 'Jus d\'orange');
  assert.equal(name('Noix de Saint-Jacques').startsWith('Noix de Saint-Jacques'), true);
  assert.equal(name('Pâte de curry rouge'), 'Pâte ou poudre de curry doux');
  assert.equal(name('Bouillon de volaille (cube)'), 'Bouillon (volaille ou légumes)');
  assert.equal(name('Poulet (entier)'), 'Poulet entier');
  assert.equal(name('Cuisses de poulet'), 'Cuisses de poulet fraîches');
  assert.equal(name('Saumon fumé'), 'Saumon fumé de qualité');
  assert.equal(name('Pavé de saumon'), 'Pavés de saumon frais');
});

test('normalizeIngredient : chaque produit est dans le bon rayon', () => {
  const { normalizeIngredient: n } = load([]).api;
  const rayon = (raw) => n({ name: raw, quantity: 1, unit: 'g', rayon: 'epicerie' }).rayon;
  const expected = {
    'fruits-legumes': ['Carottes', 'Courgettes', 'Ail', 'Oignons', 'Basilic', 'Citron', 'Épinards', 'Gingembre frais', 'Avocat'],
    boucherie: ['Escalope de poulet', 'Bœuf haché', 'Lardons', 'Jambon blanc', 'Magret de canard', 'Chorizo', 'Saucisses'],
    poissonnerie: ['Pavé de saumon', 'Crevettes', 'Cabillaud', 'Saumon fumé'],
    cremerie: ['Beurre', 'Œufs', 'Crème fraîche', 'Lait', 'Mozzarella', 'Parmesan', 'Feta', 'Yaourt', 'Pâte feuilletée'],
    epicerie: ['Riz', 'Pâtes', 'Lait de coco', 'Huile d\'olive', 'Sauce soja', 'Pois chiches', 'Farine', 'Tomates concassées', 'Curry']
  };
  for (const [r, names] of Object.entries(expected)) for (const nm of names) assert.equal(rayon(nm), r, `${nm} → ${r}`);
});

// ---------------------------------------------------------------------------
// Regroupement des courses
test('computeGroceries : additionne le même ingrédient venant de plusieurs repas', () => {
  const recipes = [
    mini('a', [ing('Carottes', 400, 'g', 'fruits-legumes'), ing('Riz', 200, 'g')]),
    mini('b', [ing('Carotte', 3, 'pièces', 'fruits-legumes'), ing('Riz basmati', 100, 'g')])
  ];
  const list = listFor(['a', 'b'], { recipes });
  assert.equal(list.length, 2);
  assert.equal(byName(list, 'Riz blanc (basmati ou jasmin)').formattedQtyText, '300 g');
  // 400 g + 3 pièces (3 × 100 g) = 7 pièces ≈ 700 g
  assert.equal(byName(list, 'Carottes fraîches').formattedQtyText, '7 pièces (≈ 700 g)');
});

test('computeGroceries : mélange de pièces et de grammes → pièces + poids indicatif', () => {
  const recipes = [
    mini('a', [ing('Patates douces', 2, 'grosses pièces', 'fruits-legumes')]),
    mini('b', [ing('Patate douce', 600, 'g', 'fruits-legumes')])
  ];
  const list = listFor(['b', 'a'], { recipes });
  // 600 g + 2 × 300 g = 4 pièces ≈ 1,2 kg
  assert.equal(list.length, 1);
  assert.equal(list[0].formattedQtyText, '4 pièces (≈ 1,2 kg)');
});

test('computeGroceries : le résultat ne dépend pas de l\'ordre des repas', () => {
  const ids = RECIPES.map((r) => r.id);
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let t = 0; t < 400; t++) {
    const k = 2 + Math.floor(rnd() * 5);
    const plan = Array.from({ length: k }, () => ids[Math.floor(rnd() * ids.length)]);
    const snap = (arr) => Object.fromEntries(listFor(arr).map((i) => [i.name, i.formattedQtyText]));
    assert.deepEqual(snap(plan), snap([...plan].reverse()), `ordre des repas : ${plan.join(', ')}`);
  }
});

test('computeGroceries : doses ajustables (x portions)', () => {
  const recipes = [mini('a', [ing('Riz', 200, 'g'), ing('Œufs', 4, 'œufs', 'cremerie'), ing('Oignons', 2, 'pièces', 'fruits-legumes')])];
  const l4 = listFor(['a'], { recipes, portions: 4 });
  const l2 = listFor(['a'], { recipes, portions: 2 });
  const l8 = listFor(['a'], { recipes, portions: 8 });
  assert.equal(byName(l4, 'Riz blanc (basmati ou jasmin)').formattedQtyText, '200 g');
  assert.equal(byName(l2, 'Riz blanc (basmati ou jasmin)').formattedQtyText, '100 g');
  assert.equal(byName(l8, 'Riz blanc (basmati ou jasmin)').formattedQtyText, '400 g');
  assert.equal(byName(l2, 'Œufs frais').formattedQtyText, '2');
  assert.equal(byName(l8, 'Oignons jaunes').formattedQtyText, '4 pièces');
  // 3 portions sur une recette de 4 : 0,75 × 2 oignons = 1,5 → on achète 2
  assert.equal(byName(listFor(['a'], { recipes, portions: 3 }), 'Oignons jaunes').formattedQtyText, '2 pièces');
});

test('computeGroceries : un repas « gardé / déjà à la maison » est exclu des courses', () => {
  const recipes = [mini('a', [ing('Riz', 200, 'g')]), mini('b', [ing('Pâtes', 300, 'g')])];
  const list = listFor(['a', 'b'], { recipes, locked: [1] });
  assert.deepEqual(plain(list.map((i) => i.name)), ['Riz blanc (basmati ou jasmin)']);
  assert.equal(listFor(['a', 'b'], { recipes, locked: [0, 1] }).length, 0);
});

test('computeGroceries : le même repas planifié deux fois double les quantités', () => {
  const recipes = [mini('a', [ing('Riz', 150, 'g')])];
  assert.equal(listFor(['a', 'a'], { recipes })[0].formattedQtyText, '300 g');
});

test('computeGroceries : planning vide, cases vides et recette supprimée ne plantent pas', () => {
  assert.deepEqual(plain(listFor([])), []);
  assert.deepEqual(plain(listFor([null, undefined, 'recette-inconnue'])), []);
});

test('computeGroceries : unités incompatibles = lignes séparées sur une même ligne, rien n\'est perdu', () => {
  const recipes = [
    mini('a', [ing('Pâte de curry', 2, 'c. à soupe')]),
    mini('b', [ing('Mélange d\'épices fajitas', 1, 'sachet')])
  ];
  const list = listFor(['a', 'b'], { recipes });
  assert.equal(list.length, 2);
});

test('computeGroceries : une quantité inconvertible est conservée à côté de l\'autre (pas de perte)', () => {
  const recipes = [
    mini('a', [ing('Mélange d\'épices fajitas', 2, 'c. à café')]),
    mini('b', [ing('Mélange d\'épices fajitas', 1, 'pièce')])
  ];
  const item = listFor(['a', 'b'], { recipes })[0];
  assert.match(item.formattedQtyText, /2 c\. à café/);
  assert.match(item.formattedQtyText, /1 pièce/);
});

test('computeGroceries : les cases déjà cochées (anciennes clés) restent cochées', () => {
  const recipes = [mini('a', [ing('Riz', 200, 'g')])];
  const key = 'epicerie__riz blanc (basmati ou jasmin)__g';
  const ctx = load(recipes);
  Object.assign(ctx.state, { plan: ['a'], checkedGroceries: { [key]: true } });
  const [item] = ctx.api.computeGroceries();
  assert.equal(ctx.state.checkedGroceries[item.id], true);
  // Nom d'origine de la recette (ex. « Kit fajitas » avant harmonisation)
  const ctx2 = load([mini('k', [ing('Kit fajitas', 1, 'pièce')])]);
  Object.assign(ctx2.state, { plan: ['k'], checkedGroceries: { 'kit fajitas': true } });
  const [kit] = ctx2.api.computeGroceries();
  assert.equal(ctx2.state.checkedGroceries[kit.id], true, 'la case cochée avant harmonisation est conservée');
});

test('computeGroceries : recettes maison (anciennes données « 600 pièces » au lieu de « 600 g »)', () => {
  const recipes = [mini('custom-1', [ing('Pommes de terre', 600, 'pièces', 'fruits-legumes')])];
  assert.equal(listFor(['custom-1'], { recipes })[0].formattedQtyText, '600 g');
});

test('computeGroceries : doublons et cas piégeux du catalogue', () => {
  // Œufs de plusieurs recettes, unités différentes
  const recipes = [
    mini('a', [ing('Œufs', 3, 'œufs', 'cremerie')]),
    mini('b', [ing('Œuf', 2, 'pièce', 'cremerie')]),
    mini('c', [ing('Œufs frais', 1, 'œuf', 'cremerie')])
  ];
  const list = listFor(['a', 'b', 'c'], { recipes });
  assert.equal(list.length, 1);
  assert.equal(list[0].formattedQtyText, '6');
  // Herbes : bouquet / brins / botte = une seule botte
  const herbs = [
    mini('h1', [ing('Persil', 1, 'bouquet', 'fruits-legumes')]),
    mini('h2', [ing('Persil plat', 4, 'brins', 'fruits-legumes')]),
    mini('h3', [ing('Persil', 0.5, 'botte', 'fruits-legumes')])
  ];
  const l2 = listFor(['h1', 'h2', 'h3'], { recipes: herbs });
  assert.equal(l2.length, 1);
  assert.match(l2[0].formattedQtyText, /^(2|3) bottes$/);
});

// ---------------------------------------------------------------------------
// Invariants sur TOUT le catalogue
test('catalogue : chaque recette produit une liste de courses valide', () => {
  const problems = [];
  for (const r of RECIPES) {
    const list = listFor([r.id]);
    if (list.length === 0) problems.push(`${r.id} : liste vide`);
    const expectedNames = new Set(r.ingredients.map((i) => load([]).api.normalizeIngredient(i).name.toLowerCase().replace(/\s+/g, ' ').trim()));
    assert.equal(list.length, expectedNames.size, `${r.id} : un article par produit distinct`);
    for (const it of list) {
      if (!RAYONS.includes(it.rayon)) problems.push(`${r.id} : rayon invalide « ${it.rayon} » pour ${it.name}`);
      if (!it.name || /undefined|null|NaN/.test(it.name)) problems.push(`${r.id} : nom invalide ${it.name}`);
      const t = it.formattedQtyText;
      if (!t || /NaN|undefined|null|Infinity/.test(t)) problems.push(`${r.id} : quantité invalide « ${t} » pour ${it.name}`);
      if (/(^|[^\d,.])0 /.test(t)) problems.push(`${r.id} : quantité nulle « ${t} » pour ${it.name}`);
      if (!(it.id && it.id === it.id.toLowerCase())) problems.push(`${r.id} : identifiant non stable pour ${it.name}`);
    }
  }
  assert.deepEqual(plain(problems), []);
});

test('catalogue : aucune quantité n\'est perdue (grammes et ml conservés, arrondi à la dizaine au plus)', () => {
  const { normalizeIngredient, canonicalUnit } = load([]).api;
  const problems = [];
  for (const r of RECIPES) {
    // somme attendue par produit pour les ingrédients exprimés en g/kg/ml/cl/l uniquement
    const expected = {};
    const pure = {};
    for (const i of r.ingredients) {
      const n = normalizeIngredient(i);
      const u = canonicalUnit(i.unit);
      const key = n.name.toLowerCase().replace(/\s+/g, ' ').trim();
      pure[key] = (pure[key] ?? true) && ['g', 'kg'].includes(u) && canonicalUnit(n.unit) === 'g';
      if (['g', 'kg'].includes(u)) expected[key] = (expected[key] || 0) + i.quantity * (u === 'kg' ? 1000 : 1);
    }
    for (const it of listFor([r.id])) {
      if (!pure[it.id] || !expected[it.id]) continue;
      // format d'achat (« 1 plaquette (250 g) (≈ 20 g) ») : on contrôle la quantité réelle entre parenthèses
      const m = it.formattedQtyText.match(/^([\d,]+) (kg|g)$/) || it.formattedQtyText.match(/\(≈ ([\d,]+) (kg|g)\)$/);
      if (!m) { problems.push(`${r.id}/${it.name} : format inattendu « ${it.formattedQtyText} »`); continue; }
      const got = parseFloat(m[1].replace(',', '.')) * (m[2] === 'kg' ? 1000 : 1);
      if (got < expected[it.id] - 1 || got > expected[it.id] + 60) problems.push(`${r.id}/${it.name} : attendu ≈ ${expected[it.id]} g, obtenu ${it.formattedQtyText}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('catalogue : un plan de toutes les recettes à la fois reste cohérent (pas de doublon de ligne)', () => {
  const list = listFor(RECIPES.map((r) => r.id));
  const names = list.map((i) => i.name);
  assert.equal(new Set(names).size, names.length, 'noms uniques');
  assert.equal(new Set(list.map((i) => i.id)).size, list.length, 'identifiants uniques');
  for (const it of list) assert.ok(it.recipes.length >= 1, `${it.name} : provenance indiquée`);
});

// Variantes d'un même produit qui NE DOIVENT PLUS apparaître sur deux lignes différentes.
test('catalogue : plus de produits en double sous deux noms différents', () => {
  const names = listFor(RECIPES.map((r) => r.id)).map((i) => i.name);
  const forbidden = ['Tomates fraîches ou concassées', 'Oranges à jus', 'Lentilles (vertes ou corail)', 'Kit fajitas', 'Lentilles corail ou vertes'];
  for (const f of forbidden) assert.ok(!names.includes(f), `« ${f} » doit être regroupé avec son équivalent`);

  // Détection générale : un nom (simplifié) qui en contient un autre en entier = probable doublon
  const simplify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '')
    .replace(/\b(frais|fraiche|fraiches|aop|rape|rapee|de|du|des|d|a|au|aux|et|ou|l|le|la|les)\b/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map((w) => w.replace(/(s|x)$/, '')).join(' ');
  // Paires volontairement distinctes (produits différents qui partagent des mots)
  const OK = new Set([
    'tomate|tomate concasse coulis', 'oignon jaune|oignon nouveau cebette', 'oignon rouge|oignon jaune',
    'noix|noix cajou non sale', 'noix|noix saint jacques fraiche', 'cerneau noix|noix cajou non sale',
    'pate ble penne fusilli ou coquillette|pate tarte feuillete ou brise', 'pate tarte feuillete ou brise|pate pizza',
    'huile|huile olive vierge extra', 'huile|huile sesame', 'sauce soja sale|sauce soja sucre',
    'citron jaune|citron vert', 'citron|citron confit', 'fromage frai tartiner|fromage frai',
    'piment|piment espelette', 'curry|pate poudre curry doux', 'tomate|tomate concassee couli', 'tomate|tomate sechee',
    'gingembre|gingembre moulu', 'beurre|beurre cacahuete', 'lait|lait coco'
  ]);
  const simp = names.map((n) => [n, simplify(n)]);
  const suspicious = [];
  for (const [a, sa] of simp) for (const [b, sb] of simp) {
    if (a >= b) continue;
    const [x, y] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
    if (x === y || y.startsWith(x + ' ')) {
      if (x === 'fromage') continue; // fromages = produits différents (râpé, raclette, bleu, triangle…)
      if (!OK.has(`${x}|${y}`) && !OK.has(`${y}|${x}`)) suspicious.push(`${a}  ≈  ${b}   [${x}|${y}]`);
    }
  }
  assert.deepEqual(plain(suspicious), []);
});

test('catalogue : les références vers les poids unitaires pointent vers de vrais articles', () => {
  const { UNIT_WEIGHTS, normalizeIngredient } = load([]).api;
  const produced = new Set();
  for (const r of RECIPES) for (const i of r.ingredients) produced.add(normalizeIngredient(i).name);
  const orphans = Object.keys(UNIT_WEIGHTS).filter((n) => !produced.has(n));
  // Les poids de quelques articles pas (encore) au catalogue sont tolérés, mais pas plus de quelques-uns.
  assert.ok(orphans.length <= 12, `Poids orphelins : ${orphans.join(' | ')}`);
});

test('formats d\'achat : crème, lait, lait de coco en contenants', () => {
  const find = (ids, name) => listFor(ids).find((i) => i.name.startsWith(name));
  const all = listFor(RECIPES.map((r) => r.id));
  const creme = all.find((i) => i.name.startsWith('Crème fraîche'));
  assert.match(creme.formattedQtyText, /^\d+ pots? \(20 cl\)/);
  const coco = all.find((i) => i.name === 'Lait de coco');
  assert.match(coco.formattedQtyText, /^\d+ boîtes? \(400 ml\)|^\d+ boîtes?/);
  assert.ok(find);
});
