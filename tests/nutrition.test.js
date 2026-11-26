// Tests de nutrition.js : valeurs par article, calories/macros par recette, allergènes, client Open Food Facts (réseau simulé).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, loadRecipes } = require('./load-groceries.js');

const c = { window: {} };
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'nutrition.js'), 'utf8'), c);
const N = c.window.GamelleNutrition;
const RECIPES = loadRecipes();
const api = load(RECIPES).api;
const nameOf = (i) => api.normalizeIngredient(i).name;
const plain = (v) => JSON.parse(JSON.stringify(v));
const byId = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

test('chaque article de courses du catalogue a une valeur nutritionnelle', () => {
  const unknown = new Set();
  RECIPES.forEach((r) => r.ingredients.forEach((i) => { if (!N.lookupNutrition(nameOf(i))) unknown.add(nameOf(i)); }));
  assert.deepEqual(plain([...unknown]), []);
});

test('valeurs cohérentes : calories ≈ 4×protéines + 4×glucides + 9×lipides (hors épices, alcool, vinaigre)', () => {
  const bad = [];
  for (const r of N.RULES) {
    const [re, kcal, p, g, f] = r;
    if (kcal < 20 || /curry|epices|vin |vinaigre|capres|sucre|miel|sauce|bouillon|fond de/.test(re.source)) continue;
    const calc = 4 * p + 4 * g + 9 * f;
    if (Math.abs(calc - kcal) > Math.max(40, kcal * 0.3)) bad.push(`${re.source} : ${kcal} kcal annoncées, ${Math.round(calc)} calculées`);
  }
  assert.deepEqual(plain(bad), []);
});

test('calories par portion : toutes les recettes sont calculables et plausibles', () => {
  const bad = [];
  for (const r of RECIPES) {
    const n = N.recipeNutrition(r, api.ingredientGrams, nameOf);
    if (n.coverage < 0.9) bad.push(`${r.id} : couverture ${n.coverage.toFixed(2)}`);
    const k = n.perPortion.kcal;
    if (k < 120 || k > 1200) bad.push(`${r.id} : ${k} kcal/portion`);
    const macros = n.perPortion.protein * 4 + n.perPortion.carbs * 4 + n.perPortion.fat * 9;
    if (Math.abs(macros - k) > k * 0.15 + 20) bad.push(`${r.id} : macros incohérentes`);
  }
  assert.deepEqual(plain(bad), []);
});

test('calories : exemple de calcul vérifié à la main', () => {
  const r = { basePortions: 4, ingredients: [{ name: 'Riz basmati', quantity: 280, unit: 'g' }, { name: 'Filets de poulet', quantity: 600, unit: 'g' }, { name: 'Huile d\'olive', quantity: 2, unit: 'c. à soupe' }] };
  const n = N.recipeNutrition(r, api.ingredientGrams, nameOf);
  // riz 280 g × 3,55 = 994 ; poulet 600 g × 1,30 = 780 ; huile 30 g × 9 = 270 → 2044 / 4 = 511
  assert.equal(n.perPortion.kcal, 511);
  assert.equal(n.coverage, 1);
});

test('huile de cuisson : seule une partie est comptée', () => {
  const r = { basePortions: 4, ingredients: [{ name: 'Huile', quantity: 0.2, unit: 'litre' }, { name: 'Riz', quantity: 200, unit: 'g' }, { name: 'Œufs', quantity: 2, unit: 'pièce' }] };
  const n = N.recipeNutrition(r, api.ingredientGrams, nameOf);
  assert.ok(n.perPortion.kcal < 400, `${n.perPortion.kcal} kcal`);
});

test('allergènes des recettes', () => {
  const al = (id) => N.recipeAllergens(byId[id], nameOf);
  assert.ok(al('spaghetti-bolognese-express').includes('gluten'));
  assert.ok(al('spaghetti-bolognese-express').includes('lait'));
  assert.ok(al('tagliatelles-crevettes-chorizo-petits-pois').includes('crustaces'));
  assert.ok(al('pates-thon-citron-ricotta').includes('poisson'));
  assert.ok(al('quiche-chevre-epinards').includes('oeuf'));
  assert.ok(al('nouilles-riz-champignons-sesame').includes('sesame'));
  assert.ok(al('nouilles-riz-champignons-sesame').includes('soja'));
  assert.deepEqual(plain(al('curry-haricots-rouges-coco-riz')), [], 'riz, haricots, coco, tomate : aucun allergène majeur');
  assert.equal(N.allergenLabel('oeuf'), 'œufs');
});

// ---------------------------------------------------------------- Open Food Facts (réseau simulé)
const resp = (body, ok = true) => ({ ok, json: async () => body });

test('Open Food Facts : fiche produit par code-barres', async () => {
  let asked = '';
  const fetchFn = async (u) => { asked = u; return resp({ status: 1, product: { product_name: 'Pâte à tartiner', brands: 'Marque A, B', quantity: '400 g', nutriscore_grade: 'e', nova_group: 4, allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans', 'en:inconnu'], nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } } }); };
  const p = await N.offProduct('3017 620422003', fetchFn);
  assert.ok(asked.startsWith('https://world.openfoodfacts.org/api/v2/product/3017620422003.json'));
  assert.deepEqual(plain(p), { code: '3017620422003', name: 'Pâte à tartiner', quantity: '400 g', brand: 'Marque A', grade: 'e', nova: 4, allergens: ['lait', 'fruits a coque', 'soja'], kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 });
  assert.equal(await N.offProduct('123', fetchFn), null, 'code trop court : aucun appel réseau');
  assert.equal(await N.offProduct('3017620422003', async () => resp({ status: 0 })), null);
  assert.equal(await N.offProduct('3017620422003', async () => resp({}, false)), null);
});

test('Open Food Facts : valeur typique d\'un article (note la plus fréquente, allergènes majoritaires)', async () => {
  let asked = '';
  const hits = [
    { code: '1', product_name: 'a', nutriscore_grade: 'd', nova_group: 3, allergens_tags: ['en:milk'] },
    { code: '2', product_name: 'b', nutriscore_grade: 'd', nova_group: 3, allergens_tags: ['en:milk', 'en:gluten'] },
    { code: '3', product_name: 'c', nutriscore_grade: 'c', nova_group: 4, allergens_tags: [] },
    { code: '4', product_name: 'd', nutriscore_grade: 'd', nova_group: 3, allergens_tags: ['en:milk'] }
  ];
  const r = await N.offTypical('Crème fraîche (épaisse ou liquide)', async (u) => { asked = u; return resp({ hits }); });
  assert.ok(asked.includes('q=Cr%C3%A8me%20fra%C3%AEche'), asked);
  assert.equal(r.grade, 'd');
  assert.equal(r.nova, 3);
  assert.deepEqual(plain(r.allergens), ['lait']);
  assert.equal(await N.offTypical('Lait', async () => resp({ hits: [] })), null);
  const one = await N.offTypical('Produit rare', async () => resp({ hits: [hits[0]] }));
  assert.equal(one.grade, null, 'une seule note ne fait pas une tendance');
  await assert.rejects(N.offTypical('Lait', async () => { throw new Error('réseau'); }));
});

test('Open Food Facts : la recherche renvoie les marques sous forme de liste', () => {
  assert.equal(N.mapProduct({ product_name: 'x', brands: ['Marque A', 'B'] }).brand, 'Marque A');
  assert.equal(N.mapProduct({ product_name: 'x' }).brand, '');
});
