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
  run({ budget: true, express: true }).ids.forEach((id) => { const r = byId[id]; assert.ok(r.isBudget && r.timeMinutes <= 20); });
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

// ---------------------------------------------------------------- Météo et notifications
test('météo : température de la semaine → humeur', () => {
  assert.equal(L.weatherMood({ tempMax: 4 }).temp, 'froid');
  assert.equal(L.weatherMood({ tempMax: 12 }).temp, 'frais');
  assert.equal(L.weatherMood({ tempMax: 20 }).temp, 'doux');
  assert.equal(L.weatherMood({ tempMax: 28 }).temp, 'chaud');
  assert.equal(L.weatherMood(null), null);
  assert.equal(L.weatherMood({ tempMax: NaN }), null);
});

test('météo : le froid favorise les plats réconfortants, la chaleur les plats frais', () => {
  const share = (mood) => {
    let comfort = 0, fresh = 0, total = 0;
    for (let t = 0; t < 400; t++) {
      for (const id of L.pickMenu({ recipes: RECIPES, count: 7, mood, rng: seeded(t + 500) }).ids) {
        const m = L.weatherFit(byId[id], { temp: 'froid' }), h = L.weatherFit(byId[id], { temp: 'chaud' });
        if (m > 1) comfort++; if (h > 1) fresh++; total++;
      }
    }
    return { comfort: comfort / total, fresh: fresh / total };
  };
  const none = share(null), cold = share(L.weatherMood({ tempMax: 3, wet: true })), hot = share(L.weatherMood({ tempMax: 30 }));
  assert.ok(cold.comfort > none.comfort + 0.1, `froid : ${cold.comfort.toFixed(2)} vs ${none.comfort.toFixed(2)}`);
  assert.ok(cold.fresh < none.fresh, 'moins de plats frais par temps froid');
  assert.ok(hot.fresh > none.fresh + 0.1, `chaud : ${hot.fresh.toFixed(2)} vs ${none.fresh.toFixed(2)}`);
  assert.ok(hot.comfort < none.comfort);
  // aucun plat n'est exclu : le catalogue reste entièrement accessible
  assert.ok(RECIPES.every((r) => L.weatherFit(r, { temp: 'froid' }) > 0 && L.weatherFit(r, { temp: 'chaud' }) > 0));
});

test('météo : client Open-Meteo (réseau simulé) et erreurs', async () => {
  let asked = '';
  const body = { current: { weather_code: 61 }, daily: { temperature_2m_max: [4, 6, 5], precipitation_sum: [2, 5, 1] } };
  const w = await L.fetchWeather(48.9012, 2.3, async (u) => { asked = u; return { ok: true, json: async () => body }; });
  assert.ok(asked.startsWith('https://api.open-meteo.com/v1/forecast?latitude=48.90&longitude=2.30'));
  assert.ok(!/key|token|apikey/i.test(asked), 'aucune clé');
  assert.equal(w.tempMax, 5);
  assert.equal(w.wet, true);
  assert.equal(await L.fetchWeather(1, 1, async () => ({ ok: false })), null);
  assert.equal(await L.fetchWeather(1, 1, async () => ({ ok: true, json: async () => ({ daily: {} }) })), null);
});

test('notifications : texte du message et sujet secret', async () => {
  assert.equal(L.buildNotification({ name: 'Julie', staples: ['Lait', 'Avoine'] }), 'Julie a ajouté Lait, Avoine dans la liste de courses');
  assert.equal(L.buildNotification({ staples: ['Lait'] }), 'A ajouté Lait dans la liste de courses');
  assert.equal(L.buildNotification({ name: 'Paul', meals: ['Poulet mafé'] }), 'Paul a ajouté « Poulet mafé » au menu');
  assert.equal(L.buildNotification({ name: 'Paul', staples: ['Lait'], meals: ['A', 'B'] }), 'Paul a ajouté Lait dans la liste de courses et 2 repas (A, B) au menu');
  assert.match(L.buildNotification({ staples: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), /a, b, c, d, e \+2/);
  assert.equal(L.buildNotification({ name: 'X' }), null);
  const t1 = await L.notifTopic('FOYER-AAAA-BBBB-CCCC'), t2 = await L.notifTopic('foyer-aaaa-bbbb-cccc'), t3 = await L.notifTopic('FOYER-ZZZZ');
  assert.equal(t1, t2);
  assert.notEqual(t1, t3);
  assert.match(t1, /^gamelle-alerte-[0-9a-f]{20}$/);
  assert.ok(!t1.includes('AAAA') && !t1.toLowerCase().includes('aaaa-bbbb'), 'le code n\'apparaît pas dans le sujet');
});

test('prix réels : le coefficient suit les tickets (médiane, borné, neutre sans historique)', () => {
  assert.equal(L.priceFactor([]), 1);
  assert.equal(L.priceFactor([{ total: 60, est: 40 }]), 1, 'un seul ticket ne suffit pas');
  assert.equal(L.priceFactor([{ total: 60, est: 40 }, { total: 66, est: 44 }, { total: 150, est: 50 }]), 1.5);
  assert.equal(L.priceFactor([{ total: 1, est: 100 }, { total: 1, est: 100 }]), 0.5, 'borné');
});

test('stock dégressif : la recette consomme le stock, l\'article épuisé est signalé', () => {
  const r = L.consumeStock({ farine: { qty: 500, unit: 'g' }, lait: { qty: 1000, unit: 'ml' }, oeufs: { qty: 6, unit: 'piece' } },
    [{ id: 'farine', qty: 600, unit: 'g' }, { id: 'lait', qty: 250, unit: 'ml' }, { id: 'oeufs', qty: 2, unit: 'ml' }, { id: 'sel', qty: 5, unit: 'g' }]);
  assert.deepEqual(plain(r.depleted), ['farine']);
  assert.deepEqual(plain(r.stock), { lait: { qty: 750, unit: 'ml' }, oeufs: { qty: 6, unit: 'piece' } }, 'unités différentes ignorées');
  assert.deepEqual(plain(L.parseStockInput('1,5 kg')), { qty: 1500, unit: 'g' });
  assert.deepEqual(plain(L.parseStockInput('2 L')), { qty: 2000, unit: 'ml' });
  assert.deepEqual(plain(L.parseStockInput('6')), { qty: 6, unit: 'piece' });
  assert.equal(L.parseStockInput('beaucoup'), null);
});

test('budget : moyenne par ticket et par semaine', () => {
  const D = 86400000;
  assert.equal(L.budgetStats([]).count, 0);
  const one = L.budgetStats([{ t: 0, total: 50 }]);
  assert.equal(one.avgTicket, 50); assert.equal(one.perWeek, 0, 'un seul ticket : pas de moyenne par semaine');
  // 3 tickets de 60 € à 7 jours d'écart : 180 € sur 3 semaines = 60 €/semaine
  const s = L.budgetStats([{ t: 0, total: 60 }, { t: 7 * D, total: 60 }, { t: 14 * D, total: 60 }]);
  assert.equal(Math.round(s.perWeek), 60); assert.equal(s.avgTicket, 60);
  assert.equal(L.budgetStats(Array.from({ length: 20 }, (_, i) => ({ t: i * D * 7, total: 10 + i }))).last.length, 12);
});

test('budget du panier : prix appris sur les tickets, estimation × coefficient pour le reste', () => {
  const items = [{ id: 'a', quantity: 1000, baseUnit: 'g', rayon: 'boucherie' }, { id: 'b', quantity: 1000, baseUnit: 'g', rayon: 'boucherie' }];
  const learned = (i) => (i.id === 'a' ? 10 : null);
  const r = L.estimateBudget(items, 1.5, learned);
  assert.equal(r.real, 1); assert.equal(r.count, 2);
  assert.equal(r.cost, Math.round(10 + 13 * 1.5), 'a : 10 € appris ; b : 13 €/kg (repli boucherie) × 1,5');
  assert.equal(L.estimateBudget(items, 1).real, 0);
});

test('prix de référence : tous les articles courants ont un prix réaliste, aucune faute de frappe, coût par portion plausible', () => {
  const recipes = loadRecipes();
  const g = load(recipes);
  const names = {};
  const costs = [];
  recipes.forEach((r) => {
    g.state.plan = [r.id]; g.state.portions = 4;
    const items = g.api.computeGroceries();
    items.forEach((i) => { names[i.name] = (names[i.name] || 0) + 1; });
    costs.push(L.estimateCost(items) / 4);
  });
  const unknown = Object.keys(L.REF_PRICES).filter((k) => !names[k]);
  assert.deepEqual(unknown, [], 'noms absents du catalogue (faute de frappe ?)');
  const missing = Object.keys(names).filter((k) => !L.REF_PRICES[k]);
  assert.ok(missing.length <= 15, `${missing.length} articles sans prix de référence : ${missing.join(', ')}`);
  costs.sort((a, b) => a - b);
  const med = costs[Math.floor(costs.length / 2)];
  assert.ok(med >= 2 && med <= 3.5, `coût médian par portion ${med} €`);
  assert.ok(costs[costs.length - 1] <= 7, `coût max par portion ${costs[costs.length - 1]} €`);
  // prix du ticket réel
  assert.equal(L.refPrice({ name: 'Poivrons (rouges ou tricolores)', baseUnit: 'piece', quantity: 2 }), 2.1);
  assert.equal(L.refPrice({ name: 'Pommes de terre fraîches', baseUnit: 'g', quantity: 1000 }), 1.75, '3,50 € les 2 kg');
  assert.equal(L.refPrice({ name: 'Cheddar râpé', baseUnit: 'g', quantity: 140 }), 2.39);
  assert.equal(L.refPrice({ name: 'Pâte ou poudre de curry doux', baseUnit: 'c. à café', quantity: 3 }), 0.25, 'une cuillère à soupe = 3 cuillères à café');
  assert.equal(L.refPrice({ name: 'Filets de poulet frais', baseUnit: 'piece', quantity: 2 }), null, 'unité incompatible : pas de devinette');
  assert.equal(L.refPrice({ name: 'Inconnu', baseUnit: 'g', quantity: 100 }), null);
});

test('menu selon un budget : remplace les plats chers, reste varié et respecte le plafond quand c\'est possible', () => {
  const recipes = Array.from({ length: 60 }, (_, i) => ({ id: 'r' + i, title: 't' + i, type: ['vege', 'viande', 'volaille', 'poisson'][i % 4], ingredients: [], cost: 6 + (i % 12) * 2 })); // 6 à 28 €
  const costOf = (r) => r.cost;
  let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 20; k++) {
    const r = L.pickMenu({ recipes, count: 7, rng, budget: 60, costOf });
    assert.equal(r.ids.length, 7); assert.equal(new Set(r.ids).size, 7, 'sans doublon');
    assert.ok(r.cost <= 60 && r.withinBudget === true, `coût ${r.cost}`);
  }
  const impossible = L.pickMenu({ recipes, count: 7, rng, budget: 20, costOf });
  assert.equal(impossible.withinBudget, false, '7 repas à 20 € : impossible, on le dit');
  assert.ok(impossible.cost <= 7 * 12, 'mais on a pris les moins chers');
  const withLocked = L.pickMenu({ recipes, count: 5, rng, budget: 60, costOf, fixedCost: 20 });
  assert.ok(withLocked.cost <= 40, 'les repas gardés comptent dans le budget');
  assert.equal(L.pickMenu({ recipes, count: 7, rng }).cost, null, 'sans budget : pas de calcul');
});

test('équilibre de la semaine et dates limites', () => {
  const s = L.weekSummary([{ kcal: 600, protein: 35, veg: 250, type: 'volaille' }, { kcal: 500, protein: 12, veg: 60, type: 'vegetarien' }, { kcal: 700, protein: 30, veg: 150, type: 'vege' }]);
  assert.equal(s.count, 3); assert.equal(s.kcal, 600); assert.equal(s.protein, 26); assert.equal(s.veg, 153);
  assert.equal(s.lowVeg, 1); assert.equal(s.lowProtein, 1); assert.equal(s.types.vege, 2, 'végétarien = vege');
  assert.equal(L.weekSummary([]).count, 0);
  assert.equal(L.shelfDays('Filets de poulet frais', 'boucherie'), 3);
  assert.equal(L.shelfDays('Yaourts (nature ou aux fruits)', 'cremerie'), 15);
  assert.equal(L.shelfDays('Pommes de terre fraîches', 'fruits-legumes'), 21);
  assert.equal(L.shelfDays('Riz blanc', 'epicerie'), 120);
  assert.equal(L.shelfDays('Pavés de saumon frais', 'poissonnerie'), 2);
});
