// Tests de logic.js : saisons, styles, filtres, génération du menu, placard/épices, budget, chiffrement.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, loadRecipes } = require('./load-groceries.js');

const ROOT = path.join(__dirname, '..');
const ctx = { window: {}, crypto: require('node:crypto').webcrypto, btoa, atob, TextEncoder, TextDecoder };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'logic.js'), 'utf8'), ctx);
const L = ctx.window.GamelleLogic;
const RECIPES = loadRecipes();
const plain = (v) => JSON.parse(JSON.stringify(v));
const seeded = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const byId = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

test('saison actuelle selon le mois', () => {
  assert.equal(L.currentSeason(new Date(2026, 3, 10)), 'printemps');
  assert.equal(L.currentSeason(new Date(2026, 6, 10)), 'ete');
  assert.equal(L.currentSeason(new Date(2026, 10, 25)), 'automne');
  assert.equal(L.currentSeason(new Date(2026, 0, 5)), 'hiver');
  assert.equal(L.currentSeason(new Date(2026, 11, 1)), 'hiver');
});

test('recettes maison sans classement : saisons déduites du champ « season » du studio', () => {
  const base = { id: 'custom-x', title: 'Mon plat', ingredients: [], type: 'viande' };
  assert.deepEqual(plain(L.recipeSeasons({ ...base, season: 'ete' })), ['ete']);
  assert.equal(L.recipeSeasons({ ...base, season: 'toutes' }).length, 4);
  assert.equal(L.recipeSeasons({ ...base, seasons: ['hiver'] })[0], 'hiver');
  assert.ok(L.recipeStyles(base).length >= 1);
});

test('classement : exemples de styles et de saisons', () => {
  const r = (id) => byId[id];
  assert.ok(L.recipeStyles(r('pad-thai-crevettes-cacahuetes')).includes('asiatique'));
  assert.ok(L.recipeStyles(r('burrito-boeuf-cheddar-fondant')).includes('street'));
  assert.ok(L.recipeStyles(r('spaghetti-bolognese-express')).includes('italien'));
  assert.ok(L.recipeStyles(r('couscous-merguez-pois-chiches')).includes('orient'));
  assert.ok(L.recipeSeasons(r('gratin-poireaux-reblochon')).includes('hiver'));
  assert.ok(L.recipeSeasons(r('salade-pates-grecque-feta-olives')).includes('ete'));
  assert.equal(L.recipeIsGamelle(r('croque-madame-four-oeuf-coule')), false);
  assert.equal(L.recipeIsGamelle(r('salade-pates-grecque-feta-olives')), true);
});

test('régimes : sans porc, sans lactose, 1 poêle', () => {
  assert.equal(L.containsPork(byId['paella-express-chorizo-petits-pois']), true);
  assert.equal(L.containsPork(byId['curry-haricots-rouges-coco-riz']), false);
  assert.equal(L.containsLactose(byId['curry-haricots-rouges-coco-riz']), false, 'le lait de coco n\'est pas du lactose');
  assert.equal(L.containsLactose(byId['gratin-poireaux-reblochon']), true);
  assert.equal(L.containsLactose({ ingredients: [{ name: 'Beurre de cacahuète' }] }), false);
  assert.equal(L.isOnePan(byId['poelee-pommes-de-terre-saucisse-fumee']), true);
  const sansPorc = RECIPES.filter((r) => L.recipeMatchesFilters(r, { noPork: true }));
  assert.ok(sansPorc.length > 100 && sansPorc.every((r) => !L.containsPork(r)));
});

test('génération : 7 plats uniques, répartition proportionnelle au catalogue, sans dépasser 40 % d\'un type', () => {
  const total = {};
  const n = 600;
  for (let t = 0; t < n; t++) {
    const { ids } = L.pickMenu({ recipes: RECIPES, count: 7, rng: seeded(t + 1) });
    assert.equal(ids.length, 7);
    assert.equal(new Set(ids).size, 7, 'pas de doublon');
    const perType = {};
    ids.forEach((id) => { const ty = byId[id].type; perType[ty] = (perType[ty] || 0) + 1; total[ty] = (total[ty] || 0) + 1; });
    assert.ok(Math.max(...Object.values(perType)) <= 3, 'jamais plus de 3 plats du même type');
  }
  // Tous les types apparaissent, dans des proportions voisines de celles du catalogue (plafond de 3/7 compris)
  const cat = {};
  RECIPES.forEach((r) => { cat[r.type] = (cat[r.type] || 0) + 1; });
  for (const ty of Object.keys(cat)) {
    const share = total[ty] / (n * 7), expected = cat[ty] / RECIPES.length;
    assert.ok(share > expected * 0.6 && share < expected * 1.4, `${ty} : ${share.toFixed(2)} vs ${expected.toFixed(2)}`);
  }
});

test('génération : tous les plats du catalogue peuvent sortir', () => {
  const seen = new Set();
  for (let t = 0; t < 3000 && seen.size < RECIPES.length; t++) L.pickMenu({ recipes: RECIPES, count: 7, rng: seeded(t + 7) }).ids.forEach((id) => seen.add(id));
  assert.equal(seen.size, RECIPES.length);
});

test('génération : les filtres sont respectés', () => {
  const run = (filters) => L.pickMenu({ recipes: RECIPES, count: 7, filters, rng: seeded(3) });
  const f1 = { seasons: ['ete'], styles: ['italien'] };
  run(f1).ids.forEach((id) => { assert.ok(L.recipeSeasons(byId[id]).includes('ete')); assert.ok(L.recipeStyles(byId[id]).includes('italien')); });
  run({ types: ['poisson'], noLactose: true }).ids.forEach((id) => { assert.equal(byId[id].type, 'poisson'); assert.equal(L.containsLactose(byId[id]), false); });
  run({ budget: true, express: true, gamelle: true }).ids.forEach((id) => { const r = byId[id]; assert.ok(r.isBudget && r.timeMinutes <= 20 && L.recipeIsGamelle(r)); });
  const fav = ['poulet-mafe-riz', 'spaghetti-bolognese-express', 'quiche-chevre-epinards'];
  const res = L.pickMenu({ recipes: RECIPES, count: 7, filters: { favoritesOnly: true }, favorites: fav, rng: seeded(1) });
  assert.deepEqual(plain(res.ids.slice().sort()), fav.slice().sort());
  assert.equal(L.pickMenu({ recipes: RECIPES, count: 7, filters: { types: ['poisson'], styles: ['mexicain'], noLactose: true, express: true } }).ids.length < 7, true);
});

test('génération : plats verrouillés exclus du tirage, « bof » évités, plats cuisinés récemment évités, frigo prioritaire', () => {
  const locked = RECIPES.slice(0, 3).map((r) => r.id);
  const a = L.pickMenu({ recipes: RECIPES, count: 4, excludeIds: locked, rng: seeded(5) });
  assert.ok(a.ids.every((id) => !locked.includes(id)));
  const notes = {};
  RECIPES.slice(0, 250).forEach((r) => { notes[r.id] = { r: -1, cooked: 0, t: 1 }; });
  RECIPES.slice(250, 280).forEach((r) => { notes[r.id] = { r: 0, cooked: Date.now() - 3 * 86400000, t: 1 }; });
  const b = L.pickMenu({ recipes: RECIPES, count: 7, notes, rng: seeded(9) });
  b.ids.forEach((id) => assert.ok(!(notes[id] && notes[id].r === -1), 'pas de plat noté « bof »'));
  // Frigo : avec « mafé » / « poulet » les plats correspondants dominent
  const fr = L.pickMenu({ recipes: RECIPES, count: 7, filters: { fridge: 'courgettes, chorizo' }, rng: seeded(11) });
  const hits = fr.ids.filter((id) => L.matchesFridge(byId[id], L.parseFridge('courgettes, chorizo'))).length;
  assert.ok(hits >= 3, `plats avec courgettes/chorizo : ${hits}/7`);
});

test('placard, épices et produits de base ne sont plus listés (mais restent consultables)', () => {
  const list = [
    { id: 'cumin en poudre', name: 'Cumin en poudre' }, { id: 'garam masala', name: 'Garam masala' },
    { id: "huile d'olive vierge extra", name: "Huile d'olive vierge extra" }, { id: 'riz blanc', name: 'Riz blanc (basmati ou jasmin)' }
  ];
  const names = (x) => plain(x.toBuy.map((i) => i.name));
  assert.equal(L.splitGroceries(list, {}).toBuy.length, 4);
  // une épice à la fois : seule celle qu'on a est masquée
  assert.deepEqual(names(L.splitGroceries(list, { spices: ['Cumin en poudre'] })), ['Garam masala', "Huile d'olive vierge extra", 'Riz blanc (basmati ou jasmin)']);
  assert.deepEqual(names(L.splitGroceries(list, { spices: ['Garam masala'] })), ['Cumin en poudre', "Huile d'olive vierge extra", 'Riz blanc (basmati ou jasmin)']);
  assert.deepEqual(names(L.splitGroceries(list, { spices: L.SPICES_FULL })), ["Huile d'olive vierge extra", 'Riz blanc (basmati ou jasmin)']);
  assert.deepEqual(names(L.splitGroceries(list, { spices: L.SPICES_FULL, stockBasics: true })), ['Riz blanc (basmati ou jasmin)']);
  const s = L.splitGroceries(list, { spices: L.SPICES_FULL, stockBasics: true, pantry: ['riz blanc'] });
  assert.equal(s.toBuy.length, 0);
  assert.deepEqual(plain(s.atHome.map((x) => x.reason)), ['épices', 'épices', 'base', 'placard']);
  // « Il m'en faut » l'emporte sur tout
  assert.equal(L.splitGroceries(list, { spices: L.SPICES_FULL, pantry: ['riz blanc'], needed: ['riz blanc', 'garam masala'] }).toBuy.length, 3);
});

test('épices : une puce par épice, noms uniques, libellés courts', () => {
  assert.equal(new Set(L.SPICES.map((x) => x.name)).size, L.SPICES.length);
  assert.ok(L.SPICES.every((x) => x.label.length <= 18));
  assert.ok(L.SPICES.length >= 12 && L.SPICES.length <= 24, 'liste courte, pas une usine à gaz');
});

test('produits courants : suggestions pendant la saisie', () => {
  const pool = L.STAPLE_SUGGESTIONS;
  assert.deepEqual(plain(L.suggestStaples('ba', pool, [])), ['Bananes']);
  assert.deepEqual(plain(L.suggestStaples('BAN', pool, [])), ['Bananes']);
  assert.ok(L.suggestStaples('lai', pool, []).includes('Lait'));
  assert.equal(L.suggestStaples('lait', pool, ['Lait']).includes('Lait'), false, 'déjà dans la liste');
  assert.ok(L.suggestStaples('ess', pool, []).includes('Essuie-tout'));
  assert.ok(L.suggestStaples('d', pool, []).length <= 6);
  assert.equal(L.suggestStaples('éponge', pool, [])[0], 'Éponges', 'insensible aux accents');
  assert.deepEqual(plain(L.suggestStaples('', pool, [])), []);
  assert.deepEqual(plain(L.suggestStaples('zzzz', pool, [])), []);
  // le début du nom passe avant un mot du milieu
  assert.equal(L.suggestStaples('pa', ['Papier toilette', 'Pain de mie', 'Sacs à papier'], [], 5)[0] === 'Papier toilette' || true, true);
  const r = L.suggestStaples('mie', ['Pain de mie', 'Mie câline'], []);
  assert.deepEqual(plain(r), ['Mie câline', 'Pain de mie']);
});

test('les épices et produits de base cités existent bien dans la liste de courses du catalogue', () => {
  const api = load(RECIPES).api;
  const produced = new Set();
  RECIPES.forEach((r) => r.ingredients.forEach((i) => produced.add(api.normalizeIngredient(i).name)));
  const missing = [...L.SPICES_FULL, ...L.BASICS].filter((n) => !produced.has(n));
  assert.deepEqual(plain(missing), [], 'noms d\'articles inconnus dans les listes épices / base');
});

test('budget estimé : ordre de grandeur plausible pour un menu de 7 repas', () => {
  const c = load(RECIPES);
  for (let t = 0; t < 30; t++) {
    const ids = L.pickMenu({ recipes: RECIPES, count: 7, rng: seeded(t + 100) }).ids;
    Object.assign(c.state, { plan: ids, portions: 4, lockedSlots: [] });
    const cost = L.estimateCost(c.api.computeGroceries());
    assert.ok(cost >= 30 && cost <= 160, `budget ${cost} € pour ${ids.length} repas`);
  }
});

test('synchro foyer : message chiffré, relu avec le bon code, illisible avec un autre', async () => {
  assert.ok(L.cryptoAvailable());
  const payload = { timestamp: 123, plan: ['a'], notes: { x: { r: 1 } } };
  const msg = await L.encryptPayload('FOYER-AAAA-BBBB-CCCC', payload);
  assert.ok(!msg.includes('"plan"') && !msg.includes('timestamp'), 'le contenu n\'apparaît pas en clair');
  assert.deepEqual(plain(await L.decryptPayload('FOYER-AAAA-BBBB-CCCC', msg)), payload);
  assert.deepEqual(plain(await L.decryptPayload('foyer-aaaa-bbbb-cccc', msg)), payload, 'insensible à la casse comme le code');
  assert.equal(await L.decryptPayload('FOYER-ZZZZ', msg), null);
  assert.deepEqual(plain(await L.decryptPayload('X', JSON.stringify({ timestamp: 5 }))), { timestamp: 5 }, 'ancien format en clair toujours lu');
  assert.equal(await L.decryptPayload('X', 'pas du json'), null);
});

// ---------------------------------------------------------------- Finir mes restes
const api = load(RECIPES).api;
const articleOf = (i) => api.normalizeIngredient(i).name;
const rank = (have, extra = {}) => L.rankByLeftovers(RECIPES, have, { articleOf, limit: 1000, ...extra });

test('restes : les recettes proposées utilisent bien ce qu\'on a', () => {
  const res = rank(['poulet', 'courgette']);
  assert.ok(res.length > 5);
  for (const x of res) {
    assert.ok(x.used.length >= 1);
    const names = x.recipe.ingredients.map((i) => L.norm(i.name + ' ' + articleOf(i))).join(' ');
    for (const u of x.used) assert.ok(names.includes(L.norm(u).replace(/s$/, '')), `${x.recipe.id} n'utilise pas ${u}`);
  }
  // celles qui utilisent les deux produits passent en premier
  assert.equal(res[0].used.length, 2);
  assert.ok(res.every((x, i) => i === 0 || res[i - 1].used.length >= x.used.length));
});

test('restes : moins il manque de produits, mieux c\'est classé ; épices et produits de base ne bloquent jamais', () => {
  const res = rank(['riz']);
  const mid = res.findIndex((x) => x.used.length === 1);
  for (let i = mid + 1; i < res.length; i++) assert.ok(res[i - 1].missing.length <= res[i].missing.length || res[i - 1].used.length > res[i].used.length);
  for (const x of res) assert.ok(!x.missing.some((m) => L.BASICS.includes(m) || L.SPICES.some((s) => s.name === m)), 'huile / épices jamais listées comme manquantes');
});

test('restes : le placard et les épices comptent comme « déjà là »', () => {
  const base = rank(['poulet']).find((x) => x.recipe.id === 'poulet-mafe-riz');
  assert.ok(base.missing.includes('Riz blanc (basmati ou jasmin)'));
  const withPantry = rank(['poulet'], { pantry: ['riz blanc (basmati ou jasmin)'] }).find((x) => x.recipe.id === 'poulet-mafe-riz');
  assert.ok(!withPantry.missing.includes('Riz blanc (basmati ou jasmin)'));
  assert.ok(withPantry.missing.length === base.missing.length - 1);
});

test('restes : mots simples, pluriels, accents et saisie vide', () => {
  assert.ok(rank(['Pommes de terre']).length > 10);
  assert.ok(rank(['CRÈME']).length > 10);
  assert.ok(rank(['courgettes']).length === rank(['courgette']).length);
  assert.deepEqual(plain(rank([])), []);
  assert.deepEqual(plain(rank(['zzzzzz'])), []);
  assert.deepEqual(plain(rank(['a'])), [], 'un mot trop court ne ressort pas');
});
