// Tests d'intégrité du catalogue de recettes (recipes.js) et de la logique de courses associée.
// Lancer : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, loadRecipes } = require('./load-groceries.js');

const ROOT = path.join(__dirname, '..');
const RECIPES = loadRecipes();
const plain = (v) => JSON.parse(JSON.stringify(v));
const RAYONS = ['fruits-legumes', 'boucherie', 'poissonnerie', 'cremerie', 'epicerie'];
const SEASONS = ['automne', 'hiver', 'toutes', 'toute-saison', 'toute_saison'];
const TYPES_AUTO_MENU = ['volaille', 'poisson', 'vege', 'vegetarien', 'viande']; // types utilisés par « Générer un menu »

// Lot « Top Jow » ajouté en novembre 2026 (38 recettes) : référence pour les contrôles ciblés.
const LOT1_IDS = [
  'poulet-mafe-riz', 'tagliatelles-crevettes-chorizo-petits-pois', 'riz-facon-grand-mere-poulet-champignons', 'quiche-chevre-epinards',
  'poulet-ail-fines-herbes-lard-pommes-de-terre', 'paella-express-chorizo-petits-pois', 'poelee-patates-douces-feta-oeuf-au-plat',
  'lasagnes-express-ratatouille-mozzarella', 'ravioli-toscane-tomates-sechees-epinards', 'pates-chorizo-ricotta-sauce-tomate',
  'huevos-rotos-pommes-de-terre-chorizo', 'gratin-gnocchi-brocolis-ricotta', 'lasagnes-boscaiola-lardons-champignons',
  'ravioli-creme-champignons', 'rosti-pommes-de-terre-salade', 'salade-pates-grecque-feta-olives', 'filet-mignon-moutarde-miel-pommes-de-terre',
  'riz-saute-tomate-curcuma-yaourt', 'patates-douces-chevre-rotis-thym-miel', 'gratin-ravioles-courgettes-comte', 'quiche-thon-tomate-moutarde',
  'salade-pommes-de-terre-saumon-fume-creme-herbes', 'bricks-courgette-curry-feta-yaourt-ail', 'brochettes-dinde-paprika-haricots-semoule',
  'pates-brocoli-anchois-parmesan', 'pates-brie-courgette-creme', 'gratin-poireaux-reblochon', 'spaghetti-bolognese-express',
  'curry-haricots-rouges-coco-riz', 'endives-au-jambon-bechamel', 'cabillaud-puree-carottes-tomates-cerises', 'pates-thon-citron-ricotta',
  'nouilles-riz-champignons-sesame', 'tarte-fine-pommes-de-terre-morbier', 'couscous-merguez-pois-chiches',
  'cote-porc-miel-curry-puree-patate-douce', 'poelee-pommes-de-terre-saucisse-fumee', 'rigatoni-tomates-cerises-prosciutto-burrata'
];
// Lot 2 (novembre 2026, 40 recettes) : sans poisson ni fruits de mer, donc aucun « terre et mer ».
const LOT2_IDS = [
  "quiche-ratatouille-mozzarella",
  "feuilletes-epinards-feta-salade",
  "quiche-brocoli-fromage-frais-lardons",
  "quiche-chorizo-courgette",
  "boeuf-thai-riz-soja-gingembre",
  "poelee-gnocchi-petits-pois-chevre-citron",
  "fusillotti-roquefort-noix",
  "bo-bun-nems-vermicelles",
  "bricks-poireaux-champignons-feta",
  "bavette-echalotes-puree-maison",
  "tian-legumes-mozzarella",
  "one-pot-ble-patates-douces-epinards-chevre",
  "butternut-roti-chevre-creme-thym",
  "curry-dinde-coco-riz-brocoli",
  "gratin-courgettes-feta-jambon",
  "pates-cremeuses-courge-parmesan",
  "spaghetti-bolognaise-vege-lentilles",
  "risotto-quinoa-carottes-parmesan",
  "one-pot-riz-legumes-poulet",
  "one-pan-poulet-riz-tomate",
  "faux-filet-sauce-echalote-legumes-rotis",
  "legumes-soleil-feta-rotis",
  "tagliatelles-jambon-champignons-creme",
  "one-pan-saucisses-riz-tomate",
  "souffle-au-fromage",
  "croquettes-brocolis-feta-salade",
  "pates-chevre-champignons-epinards",
  "tarte-potimarron-chevre",
  "one-pot-curry-pommes-de-terre-pois-chiches",
  "legumes-sautes-gingembre-cajou",
  "patates-douces-rotis-roquefort-noix",
  "risotto-potimarron",
  "enchiladas-poulet-courgettes-mozzarella",
  "risotto-tomate-parmesan",
  "carottes-rotis-miel-cereales-feta",
  "poulet-cidre-puree-potimarron",
  "poulet-croustillant-parmesan-legumes-rotis",
  "feta-rotie-gnocchi-tomates-cerises",
  "pappardelle-cremeuses-prosciutto-ricotta",
  "nouilles-sautees-courgettes-tomates-oeufs"
];
// Lot 3 (novembre 2026, 50 recettes) : sans poisson ni fruit de mer.
const LOT3_IDS = [
  "poulet-orange-soja-riz",
  "poulet-grec-cereales-yaourt",
  "poulet-poireaux-carottes-thym",
  "poulet-italienne-tomates-sechees-olives",
  "tagliatelles-dinde-tomates-cerises-fromage-ail",
  "dinde-creme-champignons-puree",
  "dinde-courgettes-curry-coco-riz",
  "boulettes-poulet-creme-coquillettes",
  "gnocchi-alfredo-poulet",
  "nouilles-sautees-boeuf-brocolis",
  "boeuf-creme-persillee-pommes-de-terre",
  "saute-boeuf-olives-pommes-de-terre",
  "aiguillettes-boeuf-legumes-poeles-riz",
  "moussaka-aubergines-boeuf",
  "classic-cheeseburger",
  "haricots-verts-sauce-tomate-viande-hachee",
  "steak-beurre-ail-pommes-de-terre-courgettes",
  "polpette-italienne-polenta",
  "chou-braise-saucisse-lardons",
  "poelee-choux-bruxelles-lardons",
  "pappardelle-ragout-chair-saucisse",
  "one-pan-filet-mignon-balsamique-legumes",
  "saute-porc-ananas-curry-riz",
  "aubergines-braisees-porc-gingembre-riz",
  "gratin-pates-lard-cabecou",
  "saucisses-oignons-puree-moutarde",
  "pates-brocolis-facon-carbonara",
  "gnocchiflette-lardons-reblochon",
  "pates-vodka-tomate-creme",
  "tikka-masala-chou-fleur-riz",
  "bourguignon-vege-champignons-polenta",
  "pates-norma-aubergines-ricotta",
  "lasagnes-poireaux-ricotta",
  "curry-courgettes-petits-pois-nouilles-riz",
  "golden-pot-chou-fleur-pois-chiches",
  "gratin-butternut-bleu-noisettes",
  "potimarron-roti-fourme-ambert",
  "one-pan-gnocchi-poivrons-tomate",
  "conchiglioni-farcis-ricotta-epinards",
  "aubergines-roties-burrata-pignons",
  "polenta-legumes-grilles-tomates-cerises",
  "curry-boulettes-vege-epinards-riz",
  "poelee-pois-chiches-epinards-oeuf-feta",
  "haricots-verts-gratines-comte",
  "riz-saute-pimente-oeuf-au-plat",
  "orecchiette-ricotta-courgettes-pignons",
  "camembert-roti-potatoes",
  "gnocchi-poeles-choux-bruxelles-parmesan",
  "feuilletes-saucisse-moutarde",
  "pates-pesto-petits-pois-burrata"
];
const NEW_JOW_IDS = [...LOT1_IDS, ...LOT2_IDS, ...LOT3_IDS];
const byId = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
const imageId = (r) => (String(r.image).split('/').pop() || '').replace(/\.[a-z]+$/i, '');

// ---------------------------------------------------------------------------
test('fichiers : app.js, recipes.js et sw.js se chargent sans erreur de syntaxe', () => {
  for (const f of ['app.js', 'groceries.js', 'sync.js', 'ticket.js', 'receipt.js', 'theme.js', 'recipes.js', 'sw.js']) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }), f);
  }
});

test('catalogue : au moins 300 recettes, toutes avec un identifiant et un titre uniques', () => {
  assert.ok(RECIPES.length >= 300, `trouvé ${RECIPES.length}`);
  assert.equal(new Set(RECIPES.map((r) => r.id)).size, RECIPES.length, 'identifiants uniques');
  const titles = RECIPES.map((r) => r.title.trim().toLowerCase());
  assert.equal(new Set(titles).size, titles.length, 'titres uniques');
});

test('catalogue : structure complète de chaque recette', () => {
  const problems = [];
  for (const r of RECIPES) {
    const p = (m) => problems.push(`${r.id} : ${m}`);
    if (!/^[a-z0-9-]+$/.test(r.id)) p('identifiant non conforme');
    if (!r.title || r.title.length < 3) p('titre manquant');
    if (!r.description || r.description.length < 20) p('description manquante');
    if (!SEASONS.includes(r.season)) p(`saison inconnue « ${r.season} »`);
    if (!Number.isInteger(r.timeMinutes) || r.timeMinutes < 1 || r.timeMinutes > 240) p(`durée invalide ${r.timeMinutes}`);
    if (!r.tag) p('tag manquant');
    if (!r.type) p('type manquant');
    if (typeof r.isBudget !== 'boolean') p('isBudget invalide');
    if (r.basePortions !== 4) p(`basePortions = ${r.basePortions} (attendu 4)`);
    if (!/^https?:\/\//.test(r.image || '')) p('image absente');
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 3) p('moins de 3 ingrédients');
    for (const i of r.ingredients || []) {
      if (!i.name || typeof i.name !== 'string') p('ingrédient sans nom');
      if (!(Number(i.quantity) > 0)) p(`quantité invalide pour ${i.name}`);
      if (typeof i.unit !== 'string') p(`unité manquante pour ${i.name}`);
      if (!RAYONS.includes(i.rayon) && i.rayon !== 'courants') p(`rayon invalide « ${i.rayon} » pour ${i.name}`);
    }
    if (!Array.isArray(r.steps) || r.steps.length < 3) p('moins de 3 étapes');
    for (const [k, s] of (r.steps || []).entries()) {
      if (!s.instruction || s.instruction.length < 10) p(`étape ${k + 1} vide`);
      if (!Array.isArray(s.ingredients) || s.ingredients.some((x) => typeof x !== 'string')) p(`étape ${k + 1} : liste d'ingrédients invalide`);
      if (s.timerMinutes != null && !(Number.isInteger(s.timerMinutes) && s.timerMinutes > 0 && s.timerMinutes <= 240)) p(`étape ${k + 1} : minuteur invalide ${s.timerMinutes}`);
    }
  }
  assert.deepEqual(plain(problems), []);
});

// ---------------------------------------------------------------------------
// Lot de nouvelles recettes
test('nouvelles recettes « Top Jow » : toutes présentes, au moins 30', () => {
  assert.ok(LOT1_IDS.length >= 30 && LOT2_IDS.length >= 40 && LOT3_IDS.length >= 50);
  for (const id of NEW_JOW_IDS) assert.ok(byId[id], `${id} manque`);
});

test('nouvelles recettes : aucun doublon avec une autre recette (photo, titre, plat)', () => {
  const others = RECIPES.filter((r) => !NEW_JOW_IDS.includes(r.id));
  const stop = new Set('de du des la le les a au aux et en ou un une d l pour avec sur sous maison express facon dore doree fondant fondante cremeux cremeuse croustillant croustillante gourmand gourmande traditionnel traditionnelle frais fraiche petits petit rapide classique'.split(' '));
  const toks = (t) => new Set(t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[^a-z ]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).map((w) => w.replace(/(s|x)$/, '')));
  const jac = (a, b) => { const i = [...a].filter((x) => b.has(x)).length; return i / (a.size + b.size - i); };
  const problems = [];
  for (const id of NEW_JOW_IDS) {
    const r = byId[id];
    for (const o of RECIPES) {
      if (o.id === r.id) continue;
      if (imageId(o) === imageId(r)) problems.push(`${r.id} partage la photo de ${o.id}`);
    }
    for (const o of others) {
      const j = jac(toks(r.title), toks(o.title));
      if (j >= 0.6) problems.push(`${r.id} ressemble à ${o.id} (${Math.round(j * 100)} %)`);
    }
  }
  assert.deepEqual(plain(problems), []);
});

test('nouvelles recettes : types reconnus par « Générer un menu », durées et quantités réalistes', () => {
  for (const id of NEW_JOW_IDS) {
    const r = byId[id];
    assert.ok(TYPES_AUTO_MENU.includes(r.type), `${id} : type « ${r.type} » ignoré par le menu automatique`);
    assert.ok(r.timeMinutes >= 5 && r.timeMinutes <= 75, `${id} : durée ${r.timeMinutes}`);
    assert.ok(/^https:\/\/static\.jow\.fr\//.test(r.image), `${id} : photo`);
    const grams = r.ingredients.filter((i) => i.unit === 'g').reduce((s, i) => s + i.quantity, 0);
    assert.ok(grams <= 4500, `${id} : ${grams} g d'ingrédients, trop pour 4 portions`);
    for (const i of r.ingredients) {
      if (i.unit === 'g') assert.ok(i.quantity >= 5 && i.quantity <= 1500, `${id} : ${i.name} ${i.quantity} g`);
      if (i.unit === 'ml') assert.ok(i.quantity >= 5 && i.quantity <= 1000, `${id} : ${i.name} ${i.quantity} ml`);
    }
    // aucun ingrédient en double dans une même recette
    const names = r.ingredients.map((i) => i.name);
    assert.equal(new Set(names).size, names.length, `${id} : ingrédient en double`);
  }
});

test('nouvelles recettes : les étapes citent des ingrédients de la recette et les minuteurs sont cohérents', () => {
  for (const id of NEW_JOW_IDS) {
    const r = byId[id];
    const withIng = r.steps.filter((s) => s.ingredients.length > 0).length;
    assert.ok(withIng >= 2, `${id} : étapes sans ingrédients`);
    for (const s of r.steps) {
      assert.ok(!/\*|Consultez|astuce|tips?\b/i.test(s.instruction), `${id} : texte parasite « ${s.instruction.slice(0, 50)} »`);
      const m = s.instruction.match(/(\d+)(?:\s*à\s*(\d+))?\s*minutes?/i);
      if (m && s.timerMinutes) assert.ok(s.timerMinutes >= Number(m[1]), `${id} : minuteur ${s.timerMinutes} < ${m[1]} min`);
    }
  }
});

test('nouvelles recettes : liste de courses correcte pour chacune (aucun produit absorbé par un autre)', () => {
  const { normalizeIngredient } = load([]).api;
  const sameFirstWord = (a, b) => {
    const clean = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[^a-z ]/g, ' ').trim();
    return clean(a).split(/\s+/)[0].replace(/s$/, '') === clean(b).split(/\s+/)[0].replace(/s$/, '');
  };
  // Produits qu'on accepte de voir fusionnés sous un autre libellé (regroupement voulu par l'application)
  const MERGE_OK = /^(pates|oignon|carotte|courgette|poivron|tomates? (cerises?|concassees)|escalopes? de|riz|semoule|creme|lait|parmesan|comte|beurre|miel|moutarde|curry|paprika|herbes|origan|bouillon|farine|gousses|pommes? de terre|patates?|petits pois|haricots? (verts|rouges)|pousses?|salade|mozzarella|ricotta|brocoli|citron|champignons|poireaux|echalotes?|ciboulette|basilic|persil|menthe|coriandre|thym|cumin|curcuma|olives|crevettes|lardons|chorizo|thon|jambon|saumon|merguez|filet mignon|filets?|cotes?|saucisses?|roquette|nems|pilons|allumettes|maizena|steaks?|aiguillettes|b(oe|œ)uf a sauter|faux-filet|bavette|cabillaud|dos de cabillaud|pates? (brisee|feuilletee)|chevre|crottins|buche|feta|reblochon|ravio|gnocchis?|nouilles|lasagnes?|plaques|sauce|yaourts?|oeufs?|graines|huile|pois chiches|boeuf|epinards?|purée|puree|pois)/;
  for (const id of NEW_JOW_IDS) {
    const r = byId[id];
    for (const i of r.ingredients) {
      const n = normalizeIngredient(i);
      const a = i.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const b = n.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      assert.ok(sameFirstWord(i.name, n.name) || MERGE_OK.test(a) , `${id} : « ${i.name} » devient « ${n.name} »`);
      assert.ok(RAYONS.includes(n.rayon), `${id} : rayon « ${n.rayon} » pour ${i.name}`);
      // grande famille de produit conservée
      const FAMILY = [['fromage', 'fromage'], ['ravioli', 'ravioli'], ['ravioles', 'ravioles'], ['kit', 'kit'], ['epices', 'epices'], ['thon', 'thon'], ['jambon cru', 'jambon cru']];
      for (const [raw, norm] of FAMILY) if (a.includes(raw)) assert.ok(b.includes(norm), `${id} : « ${i.name} » perdu dans « ${n.name} »`);
    }
    // une ligne de courses par produit, quantité lisible
    const ctx = load(RECIPES);
    Object.assign(ctx.state, { plan: [id], portions: 4, lockedSlots: [] });
    const list = ctx.api.computeGroceries();
    for (const it of list) assert.match(it.formattedQtyText, /\d/, `${id}/${it.name}`);
    assert.ok(list.length >= 3, id);
  }
});

test('nouvelles recettes : cas précis de la liste de courses', () => {
  const list = (id) => {
    const ctx = load(RECIPES);
    Object.assign(ctx.state, { plan: [id], portions: 4, lockedSlots: [] });
    return Object.fromEntries(ctx.api.computeGroceries().map((i) => [i.name, i.formattedQtyText]));
  };
  // Un fromage « ail & fines herbes » n'est pas de l'ail
  const poulet = list('poulet-ail-fines-herbes-lard-pommes-de-terre');
  assert.equal(poulet['Fromage frais ail & fines herbes'], '160 g');
  assert.equal(poulet["Gousses d'ail"], undefined);
  // Des ravioli ne sont ni de la ricotta ni des champignons
  assert.equal(list('ravioli-toscane-tomates-sechees-epinards')['Ravioli frais ricotta-épinards'], '600 g');
  assert.equal(list('ravioli-toscane-tomates-sechees-epinards')['Ricotta fraîche'], undefined);
  assert.equal(list('ravioli-creme-champignons')['Champignons de Paris frais'], '400 g');
  // Sauce tomate au basilic ≠ basilic ; purée de tomates ≠ tomates fraîches
  assert.equal(list('pates-chorizo-ricotta-sauce-tomate')['Tomates concassées / Coulis'], '320 g');
  assert.equal(list('pates-chorizo-ricotta-sauce-tomate')['Basilic frais'], undefined);
  assert.equal(list('spaghetti-bolognese-express')['Tomates concassées / Coulis'], '400 g');
  assert.equal(list('spaghetti-bolognese-express')['Tomates fraîches'], undefined);
  // Thon au citron = du thon, pas des citrons
  const thon = list('pates-thon-citron-ricotta');
  assert.equal(thon['Thon au naturel (boîte)'], '200 g');
  assert.equal(thon['Citrons jaunes'], '1 pièce');
  // Épices à couscous ≠ semoule
  const cous = list('couscous-merguez-pois-chiches');
  assert.equal(cous['Épices à couscous (ras el hanout)'], '2 c. à café');
  assert.equal(cous['Quinoa ou semoule complète'], '160 g');
  // Côtes de porc, jambon cru, épinards surgelés gardent leur identité
  assert.equal(list('cote-porc-miel-curry-puree-patate-douce')['Côtes de porc'], '4 pièces');
  assert.equal(list('rigatoni-tomates-cerises-prosciutto-burrata')['Jambon cru (prosciutto)'], '8 tranches');
  assert.equal(list('quiche-chevre-epinards')['Épinards surgelés'], '400 g');
  assert.equal(list('quiche-chevre-epinards')['Pâte à tarte (feuilletée ou brisée)'], '1 pièce');
  assert.equal(list('endives-au-jambon-bechamel')['Jambon blanc supérieur'], '8 tranches');
  // Gingembre en cm, yaourt en pots
  assert.equal(list('nouilles-riz-champignons-sesame')['Gingembre frais'], '2 cm');
  assert.equal(list('riz-saute-tomate-curcuma-yaourt')['Yaourts (nature ou aux fruits)'], '1 pot');
});

// ---------------------------------------------------------------------------
// Instantané du regroupement des ingrédients : toute modification doit être voulue.
// Pour accepter un changement après vérification : UPDATE_SNAPSHOT=1 node --test tests/
test('instantané : correspondance « ingrédient de recette → article de courses »', () => {
  const api = load(RECIPES).api;
  const current = {};
  for (const r of RECIPES) for (const i of r.ingredients) {
    const n = api.normalizeIngredient(i);
    current[i.name] = { name: n.name, rayon: n.rayon, unit: api.canonicalUnit(n.unit) };
  }
  const sorted = Object.fromEntries(Object.entries(current).sort((a, b) => a[0].localeCompare(b[0], 'fr')));
  const file = path.join(__dirname, 'fixtures', 'ingredient-mapping.json');
  if (process.env.UPDATE_SNAPSHOT || !fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
  }
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const diffs = [];
  for (const k of new Set([...Object.keys(saved), ...Object.keys(sorted)])) {
    if (JSON.stringify(saved[k]) !== JSON.stringify(sorted[k])) diffs.push(`${k} : ${JSON.stringify(saved[k])} → ${JSON.stringify(sorted[k])}`);
  }
  assert.deepEqual(plain(diffs), [], 'le regroupement des ingrédients a changé (voir la liste ci-dessus)');
});

// ---------------------------------------------------------------------------
// Nettoyage du catalogue (doublons fusionnés, données corrigées)
const SHARED_PHOTO_OK = [['tajine-poulet-olives-citron-confit', 'tajine-agneau-abricots-amandes-semoule']]; // plats différents, même univers

test('nettoyage : plus de recettes avec la même photo (hors exceptions validées)', () => {
  const groups = {};
  for (const r of RECIPES) (groups[imageId(r)] ??= []).push(r.id);
  const dup = Object.values(groups).filter((g) => g.length > 1)
    .filter((g) => !SHARED_PHOTO_OK.some((ok) => ok.length === g.length && ok.every((x) => g.includes(x))));
  assert.deepEqual(plain(dup), []);
});

test('nettoyage : aucun titre quasi identique dans tout le catalogue', () => {
  const stop = new Set('de du des la le les a au aux et en ou un une d l pour avec sur sous maison express facon dore doree fondant fondante cremeux cremeuse croustillant croustillante gourmand gourmande traditionnel traditionnelle frais fraiche petits petit rapide classique doux tendre mijote'.split(' '));
  const toks = (t) => new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/[^a-z ]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).map((w) => w.replace(/(s|x)$/, '')));
  const jac = (a, b) => { const i = [...a].filter((x) => b.has(x)).length; return i / (a.size + b.size - i); };
  const T = RECIPES.map((r) => [r.id, toks(r.title)]);
  const bad = [];
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const v = jac(T[i][1], T[j][1]);
    if (v >= 0.8) bad.push(`${T[i][0]} ≈ ${T[j][0]} (${Math.round(v * 100)} %)`);
  }
  assert.deepEqual(plain(bad), []);
});

test('nettoyage : anciens identifiants (alias) redirigés vers une recette qui existe', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'recipes.js'), 'utf8'), ctx);
  const aliases = ctx.window.RECIPE_ALIASES;
  assert.ok(Object.keys(aliases).length >= 30);
  for (const [from, to] of Object.entries(aliases)) {
    assert.ok(!byId[from], `${from} est encore au catalogue`);
    assert.ok(byId[to], `${from} → ${to} : cible introuvable`);
    assert.ok(!aliases[to], `${from} → ${to} : chaîne d'alias`);
  }
});

test('nettoyage : aucun ingrédient en double dans une recette', () => {
  const problems = [];
  for (const r of RECIPES) {
    const seen = new Set();
    for (const i of r.ingredients) { if (seen.has(i.name)) problems.push(`${r.id} : ${i.name}`); seen.add(i.name); }
  }
  assert.deepEqual(plain(problems), []);
  const risotto = byId['risotto-crevettes-chorizo-parmesan'];
  assert.ok(risotto.ingredients.some((i) => i.name === 'Chorizo' && i.rayon === 'boucherie'));
});

test('nettoyage : tous les types de recette sont reconnus par « Générer un menu » et les filtres', () => {
  const bad = RECIPES.filter((r) => !['volaille', 'poisson', 'vege', 'viande'].includes(r.type)).map((r) => `${r.id} (${r.type})`);
  assert.deepEqual(plain(bad), []);
});

test('classement : chaque recette a des saisons, des styles et un indicateur gamelle ; les 4 saisons sont bien représentées', () => {
  const L = (() => { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(ROOT, 'logic.js'), 'utf8'), c); return c.window.GamelleLogic; })();
  const seasons = L.SEASONS.map((x) => x.id), styles = L.STYLES.map((x) => x.id);
  const count = Object.fromEntries(seasons.map((x) => [x, 0]));
  const styleCount = Object.fromEntries(styles.map((x) => [x, 0]));
  for (const r of RECIPES) {
    assert.ok(Array.isArray(r.seasons) && r.seasons.length >= 1 && r.seasons.every((x) => seasons.includes(x)), `${r.id} : saisons`);
    assert.ok(Array.isArray(r.styles) && r.styles.length >= 1 && r.styles.every((x) => styles.includes(x)), `${r.id} : styles`);
    r.seasons.forEach((x) => count[x]++); r.styles.forEach((x) => styleCount[x]++);
  }
  for (const x of seasons) assert.ok(count[x] >= RECIPES.length * 0.25, `saison ${x} sous-représentée : ${count[x]}`);
  for (const x of ['street', 'italien', 'asiatique', 'orient', 'mexicain', 'terroir', 'frais']) assert.ok(styleCount[x] >= 10, `style ${x} : ${styleCount[x]}`);
});

test('lots 2 et 3 : aucun poisson ni fruit de mer (pas de « terre et mer »)', () => {
  const sea = /saumon|thon|cabillaud|crevette|poisson|colin|lieu|merlu|truite|sardine|maquereau|anchois|saint-jacques|moule|surimi|crabe|langoustine|dorade|gambas|calamar|haddock/i;
  for (const id of [...LOT2_IDS, ...LOT3_IDS]) {
    const r = byId[id];
    assert.notEqual(r.type, 'poisson', id);
    assert.ok(!sea.test(r.title + ' ' + r.ingredients.map((i) => i.name).join(' ')), `${id} contient du poisson / fruits de mer`);
  }
});
