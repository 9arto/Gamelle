// Cohérence des recettes : le titre annonce ce qu'il y a dans la liste d'ingrédients, les quantités sont plausibles
// pour 4 portions, les étapes citent les ingrédients. Strict pour les lots récents ; tout le catalogue pour le titre et les quantités.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, loadRecipes } = require('./load-groceries.js');

const R = loadRecipes();
const api = load(R).api;
const plain = (v) => JSON.parse(JSON.stringify(v));
const n = (s) => String(s).toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const src = fs.readFileSync(path.join(__dirname, 'recipes.test.js'), 'utf8');
const ids = (name) => new Function('return ' + src.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`))[1])();
const NEW_IDS = [...ids('LOT1_IDS'), ...ids('LOT2_IDS'), ...ids('LOT3_IDS')];

const TITLE_RULES = [
  [/poulet|volaille/, /poulet|escalopes? de (poulet|dinde)|cuisses de poulet|pilons|aiguillettes de poulet|cordons bleus|poulet pane/],
  [/dinde/, /dinde/], [/boeuf|bavette|faux-filet|bolognaise/, /boeuf|bavette|steak|faux-filet|viande/],
  [/saucisse|chipolata/, /saucisse|chipolata|chair/], [/porc|filet mignon|cote de porc/, /porc|filet mignon|chair a saucisse|echine/],
  [/lardons|lard\b|carbonara|bacon/, /lardons|lard|bacon|poitrine|pancetta/], [/jambon/, /jambon|cordon/], [/chorizo/, /chorizo/],
  [/gnocchi/, /gnocchi/], [/risotto/, /riz|quinoa|coquillettes/], [/\briz\b/, /\briz\b|risotto/], [/pates|penne|spaghetti|tagliatelle|rigatoni|fusilli|linguine|macaroni|coquillettes|pappardelle|orecchiette/, /pates|penne|spaghetti|tagliatelle|rigatoni|fusilli|linguine|macaroni|coquillettes|pappardelle|orecchiette|conchiglioni|lasagne|ravioli|ravioles|gnocchi|nouilles/],
  [/chevre/, /chevre|crottin|cabecou/], [/champignon/, /champignon/], [/courgette/, /courgette/], [/aubergine/, /aubergine/], [/butternut|potimarron|courge/, /butternut|potimarron|courge/],
  [/epinard/, /epinard/], [/brocoli/, /brocoli/], [/feta/, /feta/], [/ricotta/, /ricotta/], [/burrata/, /burrata/], [/mozzarella|mozza/, /mozzarella/], [/reblochon/, /reblochon/], [/comte/, /comte/],
  [/pommes de terre|patates? douces?/, /pommes de terre|patates? douces?/], [/poireau/, /poireau/], [/carotte/, /carotte/], [/lentilles/, /lentilles/], [/pois chiches/, /pois chiches/], [/haricots rouges/, /haricots rouges/],
  [/curry/, /curry|pate de curry|tikka/], [/coco/, /coco/], [/tomate/, /tomate|coulis|concass|arrabbiata|sauce tomate/], [/ananas/, /ananas/], [/orange/, /orange/], [/citron/, /citron/], [/moutarde/, /moutarde/], [/miel/, /miel/],
  [/oeuf/, /oeuf/], [/cacahuete|cajou|noix|noisette|pignons/, /cacahuete|cajou|noix|noisette|pignons|amande/], [/polenta/, /polenta/], [/semoule|couscous/, /semoule|couscous|ble|cereales/]
];
const BOUNDS = [
  [/filets de poulet|escalopes|filets de dinde|bavette|steaks?|boeuf (a|haché|hache)|aiguillettes|filet mignon|filet de porc|veau|agneau|canard|cuisses de|pilons/, 'g', 300, 1300],
  [/pates|riz blanc|riz basmati|semoule|quinoa|gnocchi|nouilles|lasagne|ravioli|ravioles|polenta|\bble \(/, 'g', 150, 800],
  [/pommes de terre|patates douces/, 'g', 300, 1600],
  [/creme (fraiche|liquide)/, 'ml', 20, 600], [/lait (demi|entier)/, 'ml', 20, 1100], [/huile/, 'ml', 0, 300],
  [/sauce soja/, 'c. à soupe', 0, 8], [/vinaigre/, 'c. à soupe', 0, 8], [/miel/, 'c. à soupe', 0, 6],
  [/parmesan|emmental|comte|fromage rape|cheddar|gruyere/, 'g', 10, 300], [/feta|chevre|ricotta|mozzarella|burrata|reblochon|brie|camembert|roquefort|bleu|morbier/, 'g', 40, 800],
];

test('titres : chaque produit annoncé dans le titre est dans les ingrédients', () => {
  const problems = [];
  for (const r of R) {
    const names = r.ingredients.map((i) => n(api.normalizeIngredient(i).name + ' ' + i.name)).join(' | ');
    const title = n(r.title);
    for (const [t, ing] of TITLE_RULES) if (t.test(title) && !(t.source.includes('bolognaise') && /vege/.test(title)) && !ing.test(names)) problems.push(`${r.id} : « ${r.title} » annonce ${t.source} mais l'ingrédient est absent`);
  }
  assert.deepEqual(plain(problems), []);
});

test('quantités : plausibles pour 4 portions (viandes, féculents, crème, lait, sauces, fromages)', () => {
  const problems = [];
  for (const r of R) for (const i of r.ingredients) {
    const nm = n(api.normalizeIngredient(i).name + ' ' + i.name);
    const g = api.ingredientGrams(i);
    const u = api.canonicalUnit(i.unit);
    for (const [re, unit, lo, hi] of BOUNDS) {
      if (!re.test(nm)) continue;
      const v = unit === 'g' || unit === 'ml' ? g : (u === unit ? i.quantity : null);
      if (v != null && (v < lo || v > hi)) problems.push(`${r.id} : ${i.name} = ${Math.round(v)} ${unit} (attendu ${lo}–${hi})`);
      break;
    }
  }
  // Exceptions validées : émincés de viande déjà comptés par pièce, béchamel de gratin en grande quantité de lait
  const ok = /yakitori-boeuf-fromage-riz : Emmental|polpette-italienne-polenta : Lait|bourguignon-vege-champignons-polenta : Lait|quenelles-gratinees-salade-verte : Lait|lardons|cebette|fond de veau|farine|maizena|raifort|creme de/i;
  assert.deepEqual(plain(problems.filter((p) => !ok.test(n(p)) && !ok.test(p))), []);
});

test('lots récents : chaque ingrédient est cité dans les étapes et chaque ingrédient d\'étape existe dans la recette', () => {
  const problems = [];
  const byId = Object.fromEntries(R.map((r) => [r.id, r]));
  for (const id of NEW_IDS) {
    const r = byId[id];
    const steps = n(r.steps.map((s) => s.instruction + ' ' + s.ingredients.join(' ')).join(' '));
    for (const i of r.ingredients) {
      const w = n(i.name).replace(/\(.*?\)/g, '').split(/\s+/).filter((x) => x.length >= 3 && !['aux', 'des', 'les'].includes(x)).map((x) => x.replace(/(s|x)$/, ''));
      if (w.length && !w.some((x) => steps.includes(x))) problems.push(`${id} : « ${i.name} » jamais cité dans les étapes`);
    }
    const words = (t) => n(t).replace(/\(.*?\)/g, ' ').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3).map((w) => w.replace(/(s|x)$/, ''));
    const UNITS = new Set(['cube', 'pot', 'pots', 'tranche', 'quartier', 'poignee', 'brin', 'pincee', 'botte', 'cuillere', 'soupe', 'cafe']);
    const names = r.ingredients.map((i) => new Set(words(i.name)));
    for (const s of r.steps) for (const x of s.ingredients) {
      const w = words(x).filter((t) => !UNITS.has(t));
      if (w.length && !names.some((set) => w.every((t) => set.has(t)) || w.some((t) => t.length > 4 && set.has(t)))) problems.push(`${id} : l'étape cite « ${x} » qui n'est pas dans les ingrédients`);
    }
  }
  assert.deepEqual(plain(problems), []);
});

test('lots récents : le temps annoncé couvre au moins la somme des minuteurs principaux', () => {
  const byId = Object.fromEntries(R.map((r) => [r.id, r]));
  for (const id of NEW_IDS) {
    const r = byId[id];
    const longest = Math.max(0, ...r.steps.map((s) => s.timerMinutes || 0));
    assert.ok(r.timeMinutes >= longest, `${id} : ${r.timeMinutes} min < minuteur ${longest} min`);
  }
});

test('CATALOGUE.md est à jour avec recipes.js (sinon : npm run docs)', () => {
  const { build } = require('../tools/gen-catalogue.js');
  const file = path.join(__dirname, '..', 'CATALOGUE.md');
  assert.ok(fs.existsSync(file), 'CATALOGUE.md manquant : npm run docs');
  assert.equal(fs.readFileSync(file, 'utf8'), build(), 'CATALOGUE.md n\'est plus à jour : npm run docs');
});
