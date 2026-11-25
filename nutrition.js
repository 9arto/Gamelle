// Nutrition & Open Food Facts pour Gamelle & Panier (logique pure, sans DOM, testée dans tests/nutrition.test.js).
//  1. Valeurs nutritionnelles moyennes par article de courses (pour 100 g / 100 ml) → calories et macros estimées par portion.
//  2. Allergènes d'une recette (déduits des ingrédients).
//  3. Client Open Food Facts (lecture libre, sans clé API) : Nutri-Score / NOVA / allergènes d'un produit ou d'un article.
(function (root) {
  'use strict';
  const norm = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // [motif sur le nom d'article sans accents, kcal, protéines g, glucides g, lipides g, allergènes, poids d'une pièce en g (si inconnu ailleurs)]
  // Valeurs moyennes pour 100 g (produit cru / sec tel qu'acheté, sauf conserves). Estimations de type Ciqual arrondies.
  const G = 'gluten', M = 'lait', E = 'oeuf', P = 'poisson', C = 'crustaces', S = 'soja', SE = 'sesame', MO = 'moutarde', N = 'fruits a coque', A = 'arachide', MOL = 'mollusques', CEL = 'celeri', SU = 'sulfites';
  const RULES = [
    [/pics a brochette/, 0, 0, 0, 0, [], 0],
    [/bouquet garni/, 0, 0, 0, 0, [], 0],
    [/gousses d'ail/, 130, 6, 28, 0.5, [], 5],
    [/creme fraiche/, 300, 2.5, 3, 30, [M]],
    [/filets de poulet/, 130, 22, 0, 4.5, [], 150],
    [/cuisses de poulet|pilons/, 120, 15, 0, 6.5, [], 250],
    [/poulet entier/, 150, 17, 0, 9, [], 1200],
    [/poulet pane/, 230, 14, 16, 13, [G, M, E], 100],
    [/cordons bleus/, 230, 14, 16, 13, [G, M, E], 120],
    [/nems/, 230, 8, 25, 11, [G, S], 30],
    [/oignons/, 40, 1, 9, 0.2, [], 120],
    [/echalotes/, 70, 2, 15, 0.2, [], 30],
    [/riz (blanc|a risotto)|riz /, 355, 7, 78, 0.7],
    [/parmesan/, 400, 36, 0, 28, [M]],
    [/beurre de cacahuete/, 600, 25, 12, 50, [A]],
    [/beurre/, 740, 0.7, 0.5, 82, [M]],
    [/salade|laitue|jeunes pousses/, 15, 1.3, 2, 0.2],
    [/tomates concassees|coulis|sauce arrabbiata/, 28, 1.3, 4.5, 0.3],
    [/concentre de tomate/, 80, 4, 15, 0.5],
    [/tomates sechees/, 260, 14, 45, 3],
    [/tomates/, 18, 0.9, 3, 0.2, [], 120],
    [/plaques de lasagne|pates de ble|nouilles asiatiques|crozets/, 355, 12, 72, 1.8, [G], 250],
    [/pate a tarte/, 420, 6, 45, 24, [G, M]],
    [/pate a pizza/, 270, 7, 52, 3, [G], 280],
    [/ravioli|ravioles/, 250, 10, 38, 6, [G, E, M]],
    [/gnocchis/, 160, 4, 34, 0.6, [G]],
    [/nouilles de riz|vermicelles de riz/, 355, 6, 80, 0.6],
    [/nouilles instantanees/, 450, 9, 60, 19, [G], 85],
    [/oeufs/, 140, 12.5, 0.5, 10, [E], 55],
    [/pommes de terre/, 80, 2, 17, 0.1, [], 150],
    [/patates douces/, 85, 1.6, 20, 0.1, [], 300],
    [/curry|garam|epices|ras el hanout|paprika|cumin|curcuma|piment|cannelle|muscade|herbes de provence|gingembre moulu|tabasco|harissa/, 290, 11, 50, 9, [], 1],
    [/gingembre/, 80, 1.8, 18, 0.8, [], 5],
    [/carottes/, 35, 0.8, 7, 0.2, [], 100],
    [/champignons/, 22, 3, 0.5, 0.3],
    [/sauce soja|teriyaki/, 70, 6, 8, 0, [S, G]],
    [/sauce d'huitre/, 50, 1, 11, 0, [MOL]],
    [/lait de coco/, 185, 1.8, 3, 19],
    [/boisson coco/, 20, 0.2, 2, 1.2],
    [/anchois/, 210, 29, 0, 10, [P], 4],
    [/huile/, 900, 0, 0, 100, []],
    [/bouillon/, 5, 0.3, 0.5, 0.2, [CEL], 500],
    [/fond de veau/, 250, 10, 30, 8, [CEL]],
    [/coriandre|persil|ciboulette|basilic|aneth|menthe|thym|romarin/, 40, 3, 6, 0.8, [], 30],
    [/courgettes/, 17, 1.2, 2.5, 0.3, [], 250],
    [/citrons|oranges/, 38, 0.8, 8, 0.3, [], 110],
    [/jus de citron|jus d'orange/, 30, 0.4, 7, 0.1],
    [/lait/, 46, 3.2, 4.8, 1.6, [M]],
    [/miel/, 330, 0.3, 80, 0],
    [/poivrons/, 30, 1, 5.5, 0.3, [], 150],
    [/epinards/, 25, 2.8, 1, 0.5],
    [/graines de sesame|puree de sesame/, 600, 19, 12, 53, [SE]],
    [/graines de courge|graines de tournesol/, 570, 28, 12, 47],
    [/poireaux/, 30, 1.5, 5.5, 0.3, [], 150],
    [/farine|chapelure/, 355, 10, 73, 1.5, [G]],
    [/moutarde/, 150, 7, 5, 10, [MO]],
    [/mayonnaise|sauce deluxe|sauce cesar/, 600, 1.5, 4, 65, [E, MO]],
    [/boeuf hache/, 195, 20, 0, 12.5],
    [/bavette|boeuf a mijoter|veau|filet de porc|cotes de porc|echine|saute d'agneau|escalopes de dinde/, 140, 21, 0, 6, [], 150],
    [/lardons/, 300, 15, 0.5, 27, []],
    [/lard \(/, 340, 14, 0, 31, [], 15],
    [/jambon cru/, 230, 28, 0, 13, [], 15],
    [/jambon blanc/, 110, 19, 0.5, 3.5, [], 40],
    [/chorizo|saucisses|merguez/, 350, 17, 2, 31, [], 80],
    [/magrets/, 230, 20, 0, 17],
    [/canard/, 160, 14, 0, 11, [], 250],
    [/emmental|fromage rape|cheddar|comte|beaufort|raclette/, 390, 26, 0.5, 31, [M]],
    [/fromage a trous/, 350, 26, 0, 28, [M], 20],
    [/mozzarella|burrata/, 250, 18, 1.5, 19, [M], 125],
    [/feta|des de fromage frais/, 260, 14, 1, 21, [M]],
    [/ricotta/, 150, 11, 3, 10, [M]],
    [/chevre|cabecou|morbier|reblochon|camembert|brie|gorgonzola|roquefort|bleu|fromage frais|fromage triangle|fromage ail/, 320, 19, 1, 26, [M], 60],
    [/yaourts/, 60, 4, 5, 3, [M], 125],
    [/kit pour fajitas|kit burrito/, 275, 9, 52, 3.5, [G], 90],
    [/pain|tortillas|galettes|bagels|feuilles de brick/, 275, 9, 52, 3.5, [G], 60],
    [/pains burger/, 290, 9, 48, 7, [G, E, M], 70],
    [/brocoli|chou-fleur|haricots verts|pois gourmands|fenouil|endives|aubergines|concombre|butternut|potimarron|ratatouille|pousses de soja/, 28, 2, 4, 0.3, [], 250],
    [/petits pois/, 80, 5, 12, 0.5],
    [/avocats/, 160, 2, 2, 15, [], 200],
    [/quinoa|semoule|ble \(|melange cereales/, 350, 12, 70, 2, [G]],
    [/lentilles/, 350, 25, 52, 1.5],
    [/haricots (rouges|noirs|blancs)|pois chiches/, 115, 7, 15, 1.5],
    [/maïs|mais doux/, 90, 3, 17, 1.3],
    [/thon/, 110, 25, 0, 1, [P], 140],
    [/saumon fume/, 180, 23, 0, 10, [P], 25],
    [/saumon|cabillaud/, 150, 19, 0, 8, [P], 140],
    [/crevettes/, 95, 20, 0, 1.5, [C]],
    [/saint-jacques/, 80, 16, 2, 1, [MOL], 25],
    [/olives/, 150, 1, 4, 15],
    [/cacahuetes/, 600, 26, 10, 50, [A]],
    [/noix|noisettes|amandes/, 640, 18, 10, 57, [N]],
    [/pesto/, 450, 5, 5, 45, [M, N], 190],
    [/cerneaux/, 690, 15, 7, 65, [N]],
    [/marrons/, 170, 2, 37, 1.5],
    [/vin |cidre/, 55, 0, 3, 0, [SU]],
    [/vinaigre/, 30, 0, 5, 0, [SU]],
    [/sucre/, 400, 0, 100, 0],
    [/capres|wasabi|confit d'oignons|sauce barbecue|sauce piment/, 90, 1, 18, 1],
    [/sauce tikka/, 100, 2, 8, 6, [M]],
    [/houmous|falafels/, 280, 9, 22, 17, [SE]],
    [/emince vegetal/, 200, 18, 6, 11, [S, G]],
    [/quenelle/, 180, 8, 15, 10, [G, E, M, P], 90],
    [/bechamel/, 90, 3, 8, 5, [M, G]],
    [/abricots secs/, 240, 3, 55, 0.5, [SU]],
    [/grenade/, 80, 1, 18, 1, [], 250],
    [/ananas/, 50, 0.5, 12, 0.1, [], 300],
    [/clementine/, 45, 0.8, 10, 0.2, [], 70],
    [/corn flakes/, 375, 7, 84, 0.9, [G]]
  ];

  const ALLERGEN_LABELS = {
    gluten: 'gluten', lait: 'lait', oeuf: 'œufs', poisson: 'poisson', crustaces: 'crustacés', soja: 'soja', sesame: 'sésame',
    moutarde: 'moutarde', 'fruits a coque': 'fruits à coque', arachide: 'arachides', mollusques: 'mollusques', celeri: 'céleri', sulfites: 'sulfites'
  };
  const OFF_ALLERGEN_MAP = {
    'en:gluten': 'gluten', 'en:milk': 'lait', 'en:eggs': 'oeuf', 'en:fish': 'poisson', 'en:crustaceans': 'crustaces', 'en:soybeans': 'soja',
    'en:sesame-seeds': 'sesame', 'en:mustard': 'moutarde', 'en:nuts': 'fruits a coque', 'en:peanuts': 'arachide', 'en:molluscs': 'mollusques',
    'en:celery': 'celeri', 'en:sulphur-dioxide-and-sulphites': 'sulfites'
  };

  function lookupNutrition(articleName) {
    const n = norm(articleName);
    for (const r of RULES) {
      if (r[0].test(n)) return { kcal: r[1], protein: r[2], carbs: r[3], fat: r[4], allergens: r[5] || [], pieceG: r[6] };
    }
    return null;
  }

  // gramsOf(ingredient) -> grammes (ou null) ; name(ingredient) -> nom d'article de courses. Fournis par l'application.
  function recipeNutrition(recipe, gramsOf, nameOf, portions) {
    const base = portions || recipe.basePortions || 4;
    let kcal = 0, p = 0, c = 0, f = 0, known = 0;
    const lines = recipe.ingredients || [];
    for (const ing of lines) {
      const nut = lookupNutrition(nameOf(ing));
      let g = gramsOf(ing);
      if ((g == null) && nut && nut.pieceG != null) g = (Number(ing.quantity) || 1) * nut.pieceG;
      if (!nut || g == null) continue;
      known++;
      if (/huile/.test(norm(nameOf(ing))) && nut.kcal >= 800) g = Math.min(g, 15 * base); // huile de cuisson : seule une partie est consommée
      kcal += (nut.kcal * g) / 100; p += (nut.protein * g) / 100; c += (nut.carbs * g) / 100; f += (nut.fat * g) / 100;
    }
    return {
      perPortion: { kcal: Math.round(kcal / base), protein: Math.round(p / base), carbs: Math.round(c / base), fat: Math.round(f / base) },
      coverage: lines.length ? known / lines.length : 0
    };
  }
  function recipeAllergens(recipe, nameOf) {
    const out = new Set();
    for (const ing of recipe.ingredients || []) {
      const nut = lookupNutrition(nameOf(ing));
      if (nut) nut.allergens.forEach((a) => out.add(a));
    }
    return [...out].sort();
  }
  const allergenLabel = (a) => ALLERGEN_LABELS[a] || a;

  // ---------------------------------------------------------------- Open Food Facts (aucune clé nécessaire)
  const OFF_SEARCH = 'https://search.openfoodfacts.org/search';
  const OFF_PRODUCT = 'https://world.openfoodfacts.org/api/v2/product/';
  const OFF_FIELDS = 'code,product_name,brands,nutriscore_grade,nova_group,allergens_tags,nutriments';

  function mapAllergens(tags) {
    return [...new Set((tags || []).map((t) => OFF_ALLERGEN_MAP[t]).filter(Boolean))];
  }
  function mapProduct(p) {
    const n = p.nutriments || {};
    const grade = /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade : null;
    return {
      code: p.code || null, name: p.product_name || '', brand: String(Array.isArray(p.brands) ? p.brands[0] || '' : p.brands || '').split(',')[0].trim(), grade,
      nova: [1, 2, 3, 4].includes(Number(p.nova_group)) ? Number(p.nova_group) : null,
      allergens: mapAllergens(p.allergens_tags),
      kcal: Number.isFinite(n['energy-kcal_100g']) ? Math.round(n['energy-kcal_100g']) : null,
      protein: Number.isFinite(n.proteins_100g) ? Math.round(n.proteins_100g * 10) / 10 : null,
      carbs: Number.isFinite(n.carbohydrates_100g) ? Math.round(n.carbohydrates_100g * 10) / 10 : null,
      fat: Number.isFinite(n.fat_100g) ? Math.round(n.fat_100g * 10) / 10 : null
    };
  }
  async function offProduct(code, fetchFn) {
    const clean = String(code || '').replace(/\D/g, '');
    if (clean.length < 8 || clean.length > 14) return null;
    const res = await fetchFn(`${OFF_PRODUCT}${clean}.json?fields=${OFF_FIELDS}`);
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.status !== 0 && j.product ? mapProduct({ code: clean, ...j.product }) : null;
  }
  const mode = (arr) => {
    const c = {};
    arr.forEach((x) => { c[x] = (c[x] || 0) + 1; });
    const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  };
  // Valeur « typique » d'un article générique : on interroge OFF et on retient la note la plus fréquente
  async function offTypical(articleName, fetchFn) {
    const q = String(articleName).replace(/\(.*?\)/g, ' ').split(/ ou |\//)[0].replace(/\s+/g, ' ').trim();
    if (q.length < 3) return null;
    const res = await fetchFn(`${OFF_SEARCH}?q=${encodeURIComponent(q)}&page_size=10&langs=fr&fields=${OFF_FIELDS}`);
    if (!res.ok) return null;
    const hits = ((await res.json()).hits || []).map(mapProduct);
    if (!hits.length) return null;
    const grades = hits.map((h) => h.grade).filter(Boolean);
    const novas = hits.map((h) => h.nova).filter(Boolean);
    const withData = hits.filter((h) => h.grade || h.nova);
    const count = {};
    withData.forEach((h) => h.allergens.forEach((a) => { count[a] = (count[a] || 0) + 1; }));
    const allergens = Object.keys(count).filter((a) => count[a] >= Math.max(2, withData.length / 2)).sort();
    return { grade: grades.length >= 2 ? mode(grades) : null, nova: novas.length >= 2 ? Number(mode(novas)) : null, allergens, sample: hits.length };
  }

  root.GamelleNutrition = {
    norm, lookupNutrition, recipeNutrition, recipeAllergens, allergenLabel, ALLERGEN_LABELS,
    offProduct, offTypical, mapProduct, mapAllergens, RULES
  };
})(typeof window !== 'undefined' ? window : globalThis);
