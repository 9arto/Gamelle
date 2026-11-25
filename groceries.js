// Moteur de la liste de courses : unités, normalisation des ingrédients, agrégation, formats d'achat.
// Script classique chargé avant app.js (portée globale partagée : state, GL, GN viennent de app.js).
// ==========================================
// HARMONISATION & AGRÉGATION DE LA LISTE DE COURSES
// ==========================================

// --- Unités canoniques -------------------------------------------------------
// Toutes les unités écrites dans les recettes (« pièces », « cuillère à soupe »,
// « litre », « grosses pièces »…) sont ramenées à une forme unique.
function canonicalUnit(rawUnit) {
  const s = (rawUnit || '').toString().toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');

  if (!s) return 'piece';
  if (['g', 'gr', 'gramme', 'grammes'].includes(s)) return 'g';
  if (['kg', 'kilo', 'kilos', 'kilogramme', 'kilogrammes'].includes(s)) return 'kg';
  if (['ml', 'millilitre', 'millilitres'].includes(s)) return 'ml';
  if (['cl', 'centilitre', 'centilitres'].includes(s)) return 'cl';
  if (['l', 'litre', 'litres'].includes(s)) return 'l';
  if (/^(c\.?\s*a\.?\s*s|cas|cs|c\.?\s*s|cuil+eres?\s+a\s+soupe|c\.?\s*a\s+soupe|c\s+a\s+soupe)$/.test(s)) return 'c. à soupe';
  if (/^(c\.?\s*a\.?\s*c|cac|cc|c\.?\s*c|cuil+eres?\s+a\s+cafe|c\.?\s*a\s+cafe|c\s+a\s+cafe)$/.test(s)) return 'c. à café';
  if (/^((grosses?|petites?|moyennes?)\s+)?(pieces?|unites?|escalopes?)$/.test(s)) return 'piece';
  if (/^gousses?$/.test(s)) return 'gousse';
  if (/^bottes?$/.test(s)) return 'botte';
  if (/^bouquets?$/.test(s)) return 'bouquet';
  if (/^tiges?$/.test(s)) return 'tige';
  if (/^branches?$/.test(s)) return 'branche';
  if (/^brins?$/.test(s)) return 'brin';
  if (/^tetes?$/.test(s)) return 'tete';
  if (/^tranches?$/.test(s)) return 'tranche';
  if (/^(paves?|dos)$/.test(s)) return 'pave';
  if (/^oeufs?$/.test(s)) return 'oeuf';
  if (/^(sachets?|salades?)$/.test(s)) return 'sachet';
  if (/^pincees?$/.test(s)) return 'pincee';
  if (/^portions?$/.test(s)) return 'portion';
  if (/^poignees?$/.test(s)) return 'poignee';
  if (/^quartiers?$/.test(s)) return 'quartier';
  if (/^pots?$/.test(s)) return 'pot';
  if (/^cubes?$/.test(s)) return 'cube';
  if (/^(boites?|conserves?)$/.test(s)) return 'boite';
  if (/^paquets?$/.test(s)) return 'paquet';
  if (/^(cm|centimetres?)$/.test(s)) return 'cm';
  if (/^morceaux?$/.test(s)) return 'morceau';
  if (/^bouteilles?$/.test(s)) return 'bouteille';
  return s;
}

// Poids (g) et volumes (ml) : convertibles entre eux (densité ≈ 1 pour la cuisine)
const MASS_FACTORS = { g: 1, kg: 1000 };
const VOLUME_FACTORS = { ml: 1, cl: 10, l: 1000, 'c. à soupe': 15, 'c. à café': 5, pincee: 0.5 };

function unitToGrams(unit) {
  if (MASS_FACTORS[unit]) return MASS_FACTORS[unit];
  if (VOLUME_FACTORS[unit]) return VOLUME_FACTORS[unit];
  return null;
}

// Poids moyen d'une unité « comptable » pour chaque ingrédient harmonisé (en g, ou ml pour les liquides)
// → permet d'additionner « 2 pièces de patate douce » et « 600 g de patate douce ».
const UNIT_WEIGHTS = {
  "Patates douces": { piece: 300 },
  "Pommes de terre fraîches": { piece: 150 },
  "Oignons jaunes": { piece: 120 },
  "Oignons rouges": { piece: 120 },
  "Échalotes": { piece: 30 },
  "Oignons nouveaux (cébettes)": { botte: 150, piece: 30, tige: 30 },
  "Blancs de poireaux": { piece: 150 },
  "Carottes fraîches": { piece: 100 },
  "Courgettes fraîches": { piece: 250 },
  "Aubergines fraîches": { piece: 300 },
  "Tomates fraîches": { piece: 120 },
  "Champignons de Paris frais": { piece: 20, barquette: 250 },
  "Chou-fleur frais": { piece: 800, tete: 800 },
  "Brocoli frais": { tete: 400, piece: 400 },
  "Pousses d'épinards frais": { sachet: 120, poignee: 30 },
  "Poivrons (rouges ou tricolores)": { piece: 150 },
  "Courge Butternut": { piece: 1000 },
  "Potimarron frais": { piece: 1000 },
  "Citrons verts": { piece: 60 },
  "Citrons jaunes": { piece: 110, quartier: 14 },
  "Laitue iceberg": { poignee: 30, piece: 500 },
  "Citrons confits": { piece: 60 },
  "Bananes fraîches": { piece: 120 },
  "Avocats mûrs": { piece: 200 },
  "Concombre frais": { piece: 300 },
  "Salade verte (mâche ou roquette)": { sachet: 125, poignee: 30, piece: 300 },
  "Gousses d'ail": { gousse: 5, piece: 5, tete: 50 },
  "Gingembre frais": { cm: 5, morceau: 15 },
  "Basilic frais": { botte: 30, bouquet: 30, brin: 1, tige: 1, poignee: 10, pincee: 0.3, 'c. à café': 1 },
  "Thym frais": { botte: 20, bouquet: 20, branche: 1, brin: 1, tige: 1, pincee: 0.3, 'c. à café': 1 },
  "Romarin frais": { botte: 20, bouquet: 20, branche: 2, brin: 2, tige: 2, pincee: 0.3, 'c. à café': 1 },
  "Menthe fraîche": { botte: 30, bouquet: 30, brin: 1, tige: 1, poignee: 10, pincee: 0.3 },
  "Persil plat frais": { botte: 50, bouquet: 50, brin: 3, tige: 3, poignee: 10 },
  "Coriandre fraîche": { botte: 50, bouquet: 50, brin: 3, tige: 3, poignee: 10 },
  "Ciboulette fraîche": { botte: 30, bouquet: 30, brin: 2, tige: 2, poignee: 10 },
  "Aneth frais": { botte: 30, bouquet: 30, brin: 3, tige: 3, poignee: 10 },
  "Petits pois frais (ou surgelés)": { poignee: 40 },
  "Haricots verts fins frais": { poignee: 50 },
  "Bœuf haché frais (pur bœuf)": { piece: 125 },
  "Bavette ou rumsteck de bœuf": { piece: 150 },
  "Chorizo en tranches": { tranche: 5, piece: 200 },
  "Lardons fumés pur porc": { sachet: 200, paquet: 200, barquette: 200 },
  "Saucisses de volaille": { piece: 80 },
  "Saucisses de Toulouse ou fumées": { piece: 100 },
  "Cuisses de poulet fraîches": { piece: 250 },
  "Filets de poulet frais": { piece: 150, morceau: 150 },
  "Escalopes de dinde fraîches": { piece: 130 },
  "Cuisses de canard confites": { piece: 250 },
  "Filet de porc français": { piece: 150 },
  "Veau français (sauté ou blanquette)": { piece: 150 },
  "Jambon blanc supérieur": { tranche: 40 },
  "Pavés de saumon frais": { pave: 130, piece: 130 },
  "Dos de cabillaud / Poisson blanc frais": { pave: 140, piece: 140 },
  "Saumon fumé de qualité": { tranche: 25 },
  "Œufs frais": { oeuf: 55, piece: 55 },
  "Mozzarella (boule ou râpée)": { piece: 125 },
  "Feta AOP": { piece: 200 },
  "Bûche de chèvre frais": { piece: 180 },
  "Reblochon de Savoie AOP": { piece: 450 },
  "Crème fraîche (épaisse ou liquide)": { pot: 200 },
  "Fromage blanc (ou ricotta)": { pot: 500 },
  "Pâte à tarte (feuilletée ou brisée)": { piece: 230 },
  "Pain de campagne (ou pain de mie)": { tranche: 35, piece: 250 },
  "Yaourts (nature ou aux fruits)": { pot: 125 },
  "Pois chiches (bocal)": { boite: 400, pot: 400 },
  "Haricots rouges (bocal)": { boite: 400, pot: 400 },
  "Haricots noirs (bocal)": { boite: 400, pot: 400 },
  "Lait de coco": { boite: 400, piece: 400 },
  "Tomates concassées / Coulis": { boite: 400, piece: 400 },
  "Thon au naturel (boîte)": { boite: 140, piece: 140 },
  "Maïs doux en boîte": { boite: 285, piece: 285 },
  "Bouillon (volaille ou légumes)": { cube: 500 },
  "Gnocchis à poêler": { sachet: 500, paquet: 500 },
  "Falafels prêts à dorer": { piece: 25 },
  "Galettes de sarrasin (blé noir)": { piece: 50 }
};

// Unités qui s'achètent à l'unité (on arrondit à l'unité supérieure dans la liste de courses)
const COUNT_UNITS = ['piece', 'gousse', 'botte', 'bouquet', 'tige', 'branche', 'brin', 'tete', 'tranche', 'pave', 'oeuf', 'sachet', 'portion', 'poignee', 'quartier', 'pot', 'cube', 'boite', 'paquet', 'morceau', 'bouteille'];

// Convertit une quantité d'une unité vers une autre pour un ingrédient donné.
// Renvoie null si la conversion n'a pas de sens (on garde alors une ligne séparée).
function convertQuantity(qty, fromUnit, toUnit, ingredientName) {
  if (fromUnit === toUnit) return qty;
  const weights = UNIT_WEIGHTS[ingredientName] || {};

  const fromG = unitToGrams(fromUnit) ?? weights[fromUnit] ?? null;
  const toG = unitToGrams(toUnit) ?? weights[toUnit] ?? null;
  if (fromG == null || toG == null) return null;
  return (qty * fromG) / toG;
}

// Fonction de formatage d'unité et quantité respectant la grammaire française
// forShopping = true : arrondi pratique pour acheter (2,3 oignons → 3 pièces)
function formatQuantityAndUnit(quantity, baseUnit, itemName = '', forShopping = false) {
  let q = Number(quantity) || 0;
  let unit = canonicalUnit(baseUnit);

  // Poids : tout en grammes, puis kg au-delà de 1000 g
  if (unit === 'kg') { q *= 1000; unit = 'g'; }
  if (unit === 'g') {
    if (q >= 1000) {
      const kg = Math.round((q / 1000) * 10) / 10;
      return `${kg.toString().replace('.', ',')} kg`;
    }
    if (forShopping && q > 50) q = Math.ceil(q / 10) * 10;
    return `${Math.max(1, Math.round(q))} g`;
  }

  // Volumes : tout en ml, puis L au-delà de 1000 ml
  if (unit === 'cl') { q *= 10; unit = 'ml'; }
  if (unit === 'l') { q *= 1000; unit = 'ml'; }
  if (unit === 'ml') {
    if (q >= 1000) {
      const l = Math.round((q / 1000) * 10) / 10;
      return `${l.toString().replace('.', ',')} L`;
    }
    if (forShopping && q > 50) q = Math.ceil(q / 10) * 10;
    return `${Math.max(1, Math.round(q))} ml`;
  }

  if (forShopping && (COUNT_UNITS.includes(unit) || unit === 'c. à soupe' || unit === 'c. à café')) {
    q = Math.max(1, Math.ceil(q - 0.15));
  } else {
    q = Math.round(q * 10) / 10;
  }

  const numStr = Number.isInteger(q) ? q.toString() : q.toString().replace('.', ',');
  const isPlural = q >= 2;
  const lowerName = (itemName || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe');

  // Évite les doublons d'unité si le libellé de l'ingrédient l'exprime déjà
  if (unit === 'oeuf' && lowerName.includes('oeuf')) return numStr;
  if (unit === 'gousse' && lowerName.includes('gousse')) return numStr;
  if (unit === 'pave' && lowerName.includes('pave')) return numStr;
  if (unit === 'tranche' && lowerName.includes('tranche')) return numStr;
  if (unit === 'botte' && lowerName.includes('botte')) return numStr;

  const LABELS = {
    piece: ['pièce', 'pièces'], gousse: ['gousse', 'gousses'], botte: ['botte', 'bottes'],
    bouquet: ['bouquet', 'bouquets'], tige: ['tige', 'tiges'], branche: ['branche', 'branches'],
    brin: ['brin', 'brins'], tete: ['tête', 'têtes'], tranche: ['tranche', 'tranches'],
    pave: ['pavé', 'pavés'], oeuf: ['œuf', 'œufs'], sachet: ['sachet', 'sachets'],
    pincee: ['pincée', 'pincées'], portion: ['portion', 'portions'], poignee: ['poignée', 'poignées'],
    quartier: ['quartier', 'quartiers'], pot: ['pot', 'pots'], cube: ['cube', 'cubes'],
    boite: ['boîte', 'boîtes'], paquet: ['paquet', 'paquets'], morceau: ['morceau', 'morceaux'],
    bouteille: ['bouteille', 'bouteilles'], cm: ['cm', 'cm'],
    'c. à soupe': ['c. à soupe', 'c. à soupe'], 'c. à café': ['c. à café', 'c. à café']
  };
  const label = LABELS[unit] ? LABELS[unit][isPlural ? 1 : 0] : unit;
  return `${numStr} ${label}`.trim();
}
// Formats d'achat courants : unité de la quantité calculée, taille du contenant, libellés singulier/pluriel
const PACKS = {
  "Crème fraîche (épaisse ou liquide)": { unit: 'ml', size: 200, label: 'pot (20 cl)', plural: 'pots (20 cl)' },
  "Lait (demi-écrémé ou entier)": { unit: 'ml', size: 1000, label: 'brique (1 L)', plural: 'briques (1 L)' },
  "Lait de coco": { unit: 'ml', size: 400, label: 'boîte (400 ml)', plural: 'boîtes (400 ml)' },
  "Beurre (doux ou demi-sel)": { unit: 'g', size: 250, label: 'plaquette (250 g)', plural: 'plaquettes (250 g)' }
};
// [motif sur le nom sans accents, nom affiché dans les courses, unité cible (null = unité d'origine), rayon]
const SPECIAL_PRODUCTS = [
  [/\bcamembert\b/, "Camembert", "piece", "cremerie"],
  [/\braclette\b/, "Fromage à raclette", "g", "cremerie"],
  [/\bharissa\b/, "Harissa (pâte)", null, "epicerie"],
  [/\bpate\s+a\s+pizza\b/, "Pâte à pizza", "piece", "cremerie"],
  [/\bnouilles?\s+instantanees?\b/, "Nouilles instantanées", "piece", "epicerie"],
  [/\bnouilles?\s+de\s+riz\b/, "Nouilles de riz", "g", "epicerie"],
  [/\bbagels?\b/, "Pains bagels", "piece", "epicerie"],
  [/\bcoulis\s+de\s+tomates?\b/, "Tomates concassées / Coulis", "g", "epicerie"],
  [/\bpoulet\s*\(?\s*entier\b/, "Poulet entier", "piece", "boucherie"],
  [/\bpoulet\s*\(?\s*pane\b/, "Poulet pané", "piece", "boucherie"],
  [/\bpoulet\s*\(\s*cuisses?\s*\)/, "Cuisses de poulet fraîches", "piece", "boucherie"],
  [/\bfond\s+de\s+veau\b/, "Fond de veau", null, "epicerie"],
  [/\bmagrets?\b/, "Magrets de canard", "g", "boucherie"],
  [/\bechine\b/, "Échine de porc", "g", "boucherie"],
  [/\bpois\s+gourmands?\b/, "Pois gourmands", "g", "fruits-legumes"],
  [/\bgingembre\s*\(?\s*moulu\b/, "Gingembre moulu", null, "epicerie"],
  [/\bcotes?\s+de\s+porc\b/, "Côtes de porc", "piece", "boucherie"],
  [/\b(jambon\s+(cru|sec|de\s+parme)|prosciutto)\b/, "Jambon cru (prosciutto)", "tranche", "boucherie"],
  [/\bepinards?\s+surgeles?\b/, "Épinards surgelés", "g", "epicerie"],
  [/\bharicots?\s+verts?\s+surgeles?\b/, "Haricots verts surgelés", "g", "epicerie"],
  // Produits dont le nom contient un autre produit (ail, ricotta, champignons, couscous, citron, tomates…)
  [/\bfromage\b.*\bail\b/, "Fromage frais ail & fines herbes", "g", "cremerie"],
  [/\bpilons?\b/, "Pilons de poulet", "g", "boucherie"],
  [/\bboisson\s+(amande|avoine|soja|coco)\b/, null, "ml", "epicerie"],
  [/\bchair\s+a\s+saucisse\b/, "Chair à saucisse", "g", "boucherie"],
  [/\bharicots?\s+verts?\b.*\b(conserve|bocal|boite)\b/, "Haricots verts en conserve", "g", "epicerie"],
  [/\bnems?\b/, "Nems (surgelés)", "piece", "epicerie"],
  [/\bkit\b.*\bfajitas?\b/, "Kit pour fajitas (galettes & épices)", "piece", "epicerie"],
  [/\b(ravioli|ravioles?|tortellini)\b/, null, "g", "cremerie"],
  [/\b(puree\s+de\s+tomates?|sauce\s+tomate|passata)\b/, "Tomates concassées / Coulis", "g", "epicerie"],
  [/\bthon\b/, "Thon au naturel (boîte)", "g", "epicerie"],
  [/\bepices?\b.*\bcouscous\b|\bras\s+el\s+hanout\b/, "Épices à couscous (ras el hanout)", "c. à café", "epicerie"]
];

function normalizeIngredient(ing) {
  const raw = (ing.name || '').toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .trim();

  let name = (ing.name || '').trim();
  // Unité d'origine harmonisée (« pièces », « cuillère à soupe », « litre »… → forme unique).
  // Les règles ci-dessous fixent l'unité CIBLE de la liste de courses ; la quantité est
  // convertie ensuite dans computeGroceries() grâce à convertQuantity().
  let unit = canonicalUnit(ing.unit);
  let quantity = ing.quantity || 1;
  let rayon = ing.rayon || 'epicerie';
  if (unit === 'kg') { quantity *= 1000; unit = 'g'; }
  else if (unit === 'cl') { quantity *= 10; unit = 'ml'; }
  else if (unit === 'l') { quantity *= 1000; unit = 'ml'; }

  // --- 0. PRODUITS PARTICULIERS ---
  // Ces produits contiennent un mot (lait, pâte, curry, poulet, veau…) qui les faisait absorber par
  // une règle plus générale : « Camembert au lait cru » devenait du lait et disparaissait de la liste.
  // Ils sont traités en premier et gardent leur propre ligne de courses (unité d'origine conservée).
  const special = SPECIAL_PRODUCTS.find(([re]) => re.test(raw));
  if (special) {
    return { name: special[1] || name, quantity, unit: special[2] || unit, rayon: special[3] };
  }

  // --- 1. CRÈMERIE & PRODUITS LAITIERS ---
  // Pâtes à tarte AVANT le beurre pour éviter qu'une "pâte feuilletée pur beurre" devienne du beurre
  // Regroupements : un même produit écrit de plusieurs façons = une seule ligne de courses
  if (/\bbouquet\s+garni\b/.test(raw)) {
    name = "Bouquet garni"; unit = "piece"; rayon = "fruits-legumes";
  } else if (/\bbasilic\b/.test(raw)) {
    name = "Basilic frais"; unit = "botte"; rayon = "fruits-legumes";
  } else if (/\bthym\b/.test(raw)) {
    name = "Thym frais"; unit = "botte"; rayon = "fruits-legumes";
  } else if (/\bromarin\b/.test(raw)) {
    name = "Romarin frais"; unit = "botte"; rayon = "fruits-legumes";
  } else if (/\bmenthe\b/.test(raw)) {
    name = "Menthe fraîche"; unit = "botte"; rayon = "fruits-legumes";
  } else if (/\bcacahuetes?\b/.test(raw) && !/beurre/.test(raw)) {
    name = "Cacahuètes grillées"; unit = "g"; rayon = "epicerie";
  } else if (/\btortillas?\b/.test(raw)) {
    name = "Tortillas de blé"; unit = "piece"; rayon = "epicerie";
  } else if (/\bmarrons?\b/.test(raw)) {
    name = "Marrons cuits"; unit = "g"; rayon = "epicerie";
  } else if (/\boranges?\b/.test(raw) && !/\bjus\s+d/.test(raw)) {
    name = "Oranges"; unit = "piece"; rayon = "fruits-legumes";
  } else if (/\bpousses?\s+de\s+(soja|haricots?\s+mungo)\b/.test(raw)) {
    name = "Pousses de soja"; unit = "g"; rayon = "fruits-legumes";
  } else if (/\bfromage\s+frais\s+a\s+tartiner\b/.test(raw)) {
    name = "Fromage frais à tartiner"; unit = "g"; rayon = "cremerie";
  } else if (/\bepices?\s+mexicaines?\b/.test(raw)) {
    name = "Épices mexicaines"; rayon = "epicerie";
  } else if (/\b(pate\s+feuilletee|feuilletage|pate\s+brisee|pate\s+a\s+tarte)\b/.test(raw)) {
    name = "Pâte à tarte (feuilletée ou brisée)";
    unit = "piece";
    rayon = "cremerie";
  } else if (/\bbeurre\b/.test(raw) && !raw.includes("cacahu")) {
    name = "Beurre (doux ou demi-sel)";
    unit = "g";
    rayon = "cremerie";
  } else if ((/\b(oeufs?|oeufs?)\b/.test(raw) && !raw.includes('lasagne') && !raw.includes('pate')) || unit === 'oeuf') {
    name = "Œufs frais";
    unit = "oeuf";
    rayon = "cremerie";
  } else if (/\bcreme\b/.test(raw) && !raw.includes("ail") && !raw.includes("avocat")) {
    name = "Crème fraîche (épaisse ou liquide)";
    unit = 'ml';
    rayon = "cremerie";
  } else if (/\blait\b/.test(raw) && !raw.includes("coco") && !/\bau\s+lait\b|fromage/.test(raw)) {
    name = "Lait (demi-écrémé ou entier)";
    unit = "ml";
    rayon = "cremerie";
  } else if (/\b(mozzarella|mozza)\b/.test(raw)) {
    name = "Mozzarella (boule ou râpée)";
    unit = (unit === 'g' ? 'g' : 'piece');
    rayon = "cremerie";
  } else if (/\bparmesan\b/.test(raw)) {
    name = "Parmesan AOP râpé";
    unit = "g";
    rayon = "cremerie";
  } else if (/\bemmental\b/.test(raw)) {
    name = "Emmental râpé";
    unit = "g";
    rayon = "cremerie";
  } else if (/\bcomte\b/.test(raw)) {
    name = "Comté AOP râpé";
    unit = "g";
    rayon = "cremerie";
  } else if (/\bchevre\b/.test(raw)) {
    name = "Bûche de chèvre frais";
    unit = "g";
    rayon = "cremerie";
  } else if (/\bfeta\b/.test(raw)) {
    name = "Feta AOP";
    unit = "g";
    rayon = "cremerie";
  } else if (/\bricotta\b/.test(raw)) {
    name = "Ricotta fraîche";
    unit = "g";
    rayon = "cremerie";
  } else if (/\breblochon\b/.test(raw)) {
    name = "Reblochon de Savoie AOP";
    unit = "g";
    rayon = "cremerie";
  } else if (/\bgorgonzola\b/.test(raw)) {
    name = "Gorgonzola AOP";
    unit = "g";
    rayon = "cremerie";
  } else if (/\bfromage\s+blanc\b/.test(raw)) {
    name = "Fromage blanc (ou ricotta)";
    unit = "g";
    rayon = "cremerie";
  } else if (/\bkefir\b/.test(raw)) {
    name = "Kéfir (bouteille)";
    unit = "bouteille";
    rayon = "cremerie";
  } else if (/\byaourts?\b/.test(raw)) {
    name = "Yaourts (nature ou aux fruits)";
    unit = "pot";
    rayon = "cremerie";
  } else if (/\b(galettes?.*(sarrasin|ble\s+noir|bretonne)|crepes?.*sarrasin)\b/.test(raw)) {
    name = "Galettes de sarrasin (blé noir)";
    unit = "piece";
    rayon = "cremerie";
  }

  // --- 2. HUILES, VINAIGRES & CONDIMENTS (Épicerie - AVANT olives & pâtes) ---
  else if (/\bhuile.*olive\b/.test(raw) || (raw.includes("huile") && raw.includes("olive"))) {
    name = "Huile d'olive vierge extra";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\bhuile.*sesame\b/.test(raw)) {
    name = "Huile de sésame";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\b(beurre\s+de\s+cacahuete|beurre\s+d'arachide)\b/.test(raw)) {
    name = "Beurre de cacahuète (pot)";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\b(sauce\s+soja\s+sucree|soja\s+sucree)\b/.test(raw)) {
    name = "Sauce soja sucrée";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\b(sauce\s+soja|soja\s+salee)\b/.test(raw)) {
    name = "Sauce soja salée";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\b(sauce\s+teriyaki|teriyaki)\b/.test(raw)) {
    name = "Sauce teriyaki";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\b(vinaigre.*balsamique|balsamique)\b/.test(raw)) {
    name = "Vinaigre balsamique";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\b(vinaigre.*cidre|vinaigre.*vin|vinaigre)\b/.test(raw)) {
    name = "Vinaigre de cidre (ou vin)";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\b(moutarde.*ancienne|moutarde.*dijon|moutarde)\b/.test(raw)) {
    name = "Moutarde à l'ancienne ou Dijon";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\bmiel\b/.test(raw)) {
    name = "Miel toutes fleurs";
    unit = "c. à soupe";
    rayon = "epicerie";
  }

  // --- 3. ÉPICES, CURRY & CONDIMENTS SECS (AVANT PÂTES DE BLÉ) ---
  else if (/\b(curry|pate\s+de\s+curry)\b/.test(raw)) {
    name = "Pâte ou poudre de curry doux";
    unit = (unit === 'c. à soupe' ? 'c. à soupe' : 'c. à café');
    rayon = "epicerie";
  } else if (/\bcurcuma\b/.test(raw)) {
    name = "Curcuma en poudre";
    unit = "c. à café";
    rayon = "epicerie";
  } else if (/\b(cumin|cumin\s+en\s+poudre)\b/.test(raw)) {
    name = "Cumin en poudre";
    unit = "c. à café";
    rayon = "epicerie";
  } else if (/\b(paprika|paprika\s+fume)\b/.test(raw)) {
    name = "Paprika doux (ou fumé)";
    unit = "c. à café";
    rayon = "epicerie";
  } else if (/\b(epices?\s+cajun|cajun|epices?\s+fajitas?|epices?\s+chili)\b/.test(raw) || (raw.includes("epices") && (raw.includes("fajita") || raw.includes("chili")))) {
    name = "Mélange d'épices (Fajitas / Chili)";
    unit = "c. à café";
    rayon = "epicerie";
  } else if (/\bherbes?\s+de\s+provence\b/.test(raw) || /\borigan\b/.test(raw)) {
    name = "Herbes de Provence sèches";
    unit = "c. à café";
    rayon = "epicerie";
  } else if (/\bnoix\s+de\s+muscade\b/.test(raw) || /\bmuscade\b/.test(raw)) {
    name = "Noix de muscade râpée";
    unit = "pincee";
    rayon = "epicerie";
  } else if (/\bcannelle\b/.test(raw)) {
    name = "Cannelle en poudre";
    unit = "c. à café";
    rayon = "epicerie";
  } else if (/\bgraines?\s+de\s+sesame\b/.test(raw)) {
    name = "Graines de sésame";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\bgraines?\s+de\s+courge\b/.test(raw)) {
    name = "Graines de courge";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\bnoix\s+de\s+cajou\b/.test(raw)) {
    name = "Noix de cajou non salées";
    unit = "g";
    rayon = "epicerie";
  } else if (/\b(noix|cerneaux\s+de\s+noix)\b/.test(raw) && !raw.includes("saint-jacques") && !raw.includes("st-jacques")) {
    name = "Cerneaux de noix";
    unit = "g";
    rayon = "fruits-legumes";
  } else if (/\b(noisettes?|amandes?)\b/.test(raw)) {
    name = "Noisettes ou amandes décortiquées";
    unit = "g";
    rayon = "fruits-legumes";
  }

  // --- 4. FRUITS & LÉGUMES FRAIS ---
  else if (/\b(ail|gousses?\s+d'ail)\b/.test(raw) && !raw.includes("creme d'ail")) {
    name = "Gousses d'ail";
    unit = "gousse";
    rayon = "fruits-legumes";
  } else if (/\boignons?\s+rouges?\b/.test(raw)) {
    name = "Oignons rouges";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\b(cebettes?|oignons?\s+nouveaux?)\b/.test(raw)) {
    name = "Oignons nouveaux (cébettes)";
    unit = "botte";
    rayon = "fruits-legumes";
  } else if (/\bechalotes?\b/.test(raw)) {
    name = "Échalotes";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bconfit.*oignons?\b/.test(raw)) {
    name = "Confit d'oignons";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\b(oignons?|ognons?)\b/.test(raw)) {
    name = "Oignons jaunes";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bpoireaux?\b/.test(raw)) {
    name = "Blancs de poireaux";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bcarottes?\b/.test(raw)) {
    name = "Carottes fraîches";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bcourgettes?\b/.test(raw)) {
    name = "Courgettes fraîches";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\baubergines?\b/.test(raw)) {
    name = "Aubergines fraîches";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\btomates?\b/.test(raw) && !raw.includes("concasse") && !raw.includes("coulis") && !raw.includes("concentre") && !raw.includes("seche") && !raw.includes("pelee") && !raw.includes("pulpe")) {
    name = "Tomates fraîches";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bchampignons?\b/.test(raw)) {
    name = "Champignons de Paris frais";
    unit = "g";
    rayon = "fruits-legumes";
  } else if (/\bchou.*fleur\b/.test(raw)) {
    name = "Chou-fleur frais";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bbrocolis?\b/.test(raw)) {
    name = "Brocoli frais";
    unit = "tete";
    rayon = "fruits-legumes";
  } else if (/\bepinards?\b/.test(raw)) {
    name = "Pousses d'épinards frais";
    unit = "g";
    rayon = "fruits-legumes";
  } else if (/\bpoivrons?\b/.test(raw)) {
    name = "Poivrons (rouges ou tricolores)";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bpatates?\s+douces?\b/.test(raw)) {
    name = "Patates douces";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bpommes?\s+de\s+terre\b/.test(raw)) {
    name = "Pommes de terre fraîches";
    unit = "g";
    rayon = "fruits-legumes";
  } else if (/\bbutternut\b/.test(raw)) {
    name = "Courge Butternut";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bpotimarron\b/.test(raw)) {
    name = "Potimarron frais";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bcitrons?\s+verts?\b/.test(raw)) {
    name = "Citrons verts";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bcitrons?\s+confits?\b/.test(raw)) {
    name = "Citrons confits";
    unit = "piece";
    rayon = "epicerie";
  } else if (/\bcitrons?\b/.test(raw) && !raw.startsWith("jus de citron")) {
    name = "Citrons jaunes";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bbananes?\b/.test(raw)) {
    name = "Bananes fraîches";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bfruits?\b/.test(raw) && !raw.includes("mer") && !raw.includes("sec") && !raw.includes("passion")) {
    name = "Fruits frais de saison";
    unit = "portion";
    rayon = "fruits-legumes";
  } else if (/\bavocats?\b/.test(raw)) {
    name = "Avocats mûrs";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\bconcombres?\b/.test(raw)) {
    name = "Concombre frais";
    unit = "piece";
    rayon = "fruits-legumes";
  } else if (/\b(salades?|maches?|roquettes?|jeunes pousses)\b/.test(raw)) {
    name = "Salade verte (mâche ou roquette)";
    unit = (unit === "g" ? "g" : "sachet");
    rayon = "fruits-legumes";
  } else if (/\bpersil\b/.test(raw)) {
    name = "Persil plat frais";
    unit = "botte";
    rayon = "fruits-legumes";
  } else if (/\bcoriandre\b/.test(raw)) {
    name = "Coriandre fraîche";
    unit = "botte";
    rayon = "fruits-legumes";
  } else if (/\bciboulette\b/.test(raw)) {
    name = "Ciboulette fraîche";
    unit = "botte";
    rayon = "fruits-legumes";
  } else if (/\baneth\b/.test(raw)) {
    name = "Aneth frais";
    unit = "botte";
    rayon = "fruits-legumes";
  } else if (/\bgingembre\b/.test(raw)) {
    name = "Gingembre frais";
    unit = "cm";
    rayon = "fruits-legumes";
  } else if (/\bpetits?\s+pois\b/.test(raw)) {
    name = "Petits pois frais (ou surgelés)";
    unit = "g";
    rayon = "fruits-legumes";
  } else if (/\babricots?\s+secs?\b/.test(raw)) {
    name = "Abricots secs moelleux";
    unit = "g";
    rayon = "fruits-legumes";
  } else if (/\bharicots?\s+verts?\b/.test(raw) || /\bpois gourmands?\b/.test(raw)) {
    name = "Haricots verts fins frais";
    unit = "g";
    rayon = "fruits-legumes";
  }

  // --- 5. BOUCHERIE & VOLAILLES ---
  // GLOBALISATION BŒUF (haché, à sauter, à mijoter) : regroupe pur bœuf, bœuf cuit, steak haché, etc.
  else if ((/\bhach(e|ee|es|ees)?\b/.test(raw) && /\bboeuf\b/.test(raw)) || /\bpur\s+boeuf\b/.test(raw) || /\bboeuf\s+cuit\b/.test(raw) || /\bsteak\s+hache\b/.test(raw) || /\bviande\s+hachee\b/.test(raw)) {
    name = "Bœuf haché frais (pur bœuf)";
    unit = "g";
    rayon = "boucherie";
  } else if (/\b(bavette|rumsteck|hampe|onglet|faux-filet|entrecote)\b/.test(raw) || /\b(aiguillettes?|steaks?|pieces?)\s+(de\s+)?boeuf\b|\bboeuf\s+a\s+(sauter|fondue)\b/.test(raw) || (/\bboeuf\b/.test(raw) && /\b(saute|piece|lamelles?|poeler|emince)\b/.test(raw))) {
    name = "Bavette ou rumsteck de bœuf";
    unit = "g";
    rayon = "boucherie";
  } else if (/\b(paleron|gite|macreuse|bourguignon|ragout)\b/.test(raw) || (/\bboeuf\b/.test(raw) && !raw.includes("bouillon") && !raw.includes("sauce"))) {
    name = "Bœuf à mijoter (paleron ou gîte)";
    unit = "g";
    rayon = "boucherie";
  }
  // CHARCUTERIE & VOLAILLE
  else if (/\b(chorizo|saucisse.*seche)\b/.test(raw)) {
    name = "Chorizo en tranches";
    unit = "g";
    rayon = "boucherie";
  } else if (/\b(lardons?|pancetta|poitrine\s+fumee)\b/.test(raw)) {
    name = "Lardons fumés pur porc";
    unit = "g";
    rayon = "boucherie";
  } else if (/\bsaucisses?\s+de\s+volaille\b/.test(raw)) {
    name = "Saucisses de volaille";
    unit = "piece";
    rayon = "boucherie";
  } else if (/\bsaucisses?\b/.test(raw)) {
    name = "Saucisses de Toulouse ou fumées";
    unit = "piece";
    rayon = "boucherie";
  } else if (/\bcuisses?\s+de\s+poulet\b/.test(raw)) {
    name = "Cuisses de poulet fraîches";
    unit = "piece";
    rayon = "boucherie";
  } else if (/\b(poulet|blancs?\s+de\s+poulet|filets?\s+de\s+poulet|aiguillettes?\s+de\s+poulet|escalope.*poulet)\b/.test(raw) && !raw.includes("bouillon")) {
    name = "Filets de poulet frais";
    unit = "g";
    rayon = "boucherie";
  } else if (/\bdinde\b/.test(raw)) {
    name = "Escalopes de dinde fraîches";
    unit = "g";
    rayon = "boucherie";
  } else if (/\bcanard\b/.test(raw)) {
    name = "Cuisses de canard confites";
    unit = "piece";
    rayon = "boucherie";
  } else if (/\bveau\b/.test(raw) && !raw.includes("bouillon")) {
    name = "Veau français (sauté ou blanquette)";
    unit = "g";
    rayon = "boucherie";
  } else if (/\bagneau\b/.test(raw)) {
    name = "Sauté d'agneau en morceaux";
    unit = "g";
    rayon = "boucherie";
  } else if (/\b(porc|filet mignon)\b/.test(raw)) {
    name = "Filet de porc français";
    unit = "g";
    rayon = "boucherie";
  } else if (/\bjambon\b/.test(raw)) {
    name = "Jambon blanc supérieur";
    unit = "tranche";
    rayon = "boucherie";
  }

  // --- 6. POISSONNERIE & MARÉE ---
  else if (/\b(saint-jacques|st-jacques|coquilles?\s+saint-jacques)\b/.test(raw)) {
    name = "Noix de Saint-Jacques fraîches";
    unit = "g";
    rayon = "poissonnerie";
  } else if (/\bsaumon\b/.test(raw) && (raw.includes("fume") || raw.includes("truite"))) {
    name = "Saumon fumé de qualité";
    unit = "g";
    rayon = "poissonnerie";
  } else if (/\bsaumon\b/.test(raw)) {
    name = "Pavés de saumon frais";
    unit = "pave";
    rayon = "poissonnerie";
  } else if (/\bcrevettes?\b/.test(raw)) {
    name = "Crevettes cuites décortiquées";
    unit = "g";
    rayon = "poissonnerie";
  } else if (/\b(cabillaud|lieu noir|colin|merlu)\b/.test(raw)) {
    name = "Dos de cabillaud / Poisson blanc frais";
    unit = (unit === 'pave' ? 'pave' : 'g');
    rayon = "poissonnerie";
  }

  // --- 7. ÉPICERIE SALÉE & FÉCULENTS ---
  else if (/\bkit.*fajitas?\b/.test(raw)) {
    name = "Kit pour fajitas (galettes & épices)";
    unit = "piece";
    rayon = "epicerie";
  } else if (/\bpommes?\s+noisettes?\b/.test(raw)) {
    name = "Pommes noisettes (surgelées ou fraîches)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\b(riz.*risotto|arborio|carnaroli)\b/.test(raw)) {
    name = "Riz à risotto (Arborio ou Carnaroli)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\briz\b/.test(raw) && !raw.includes("vermicelle") && !raw.includes("nouille")) {
    name = "Riz blanc (basmati ou jasmin)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\blasagnes?\b/.test(raw)) {
    name = "Plaques de lasagne aux œufs";
    unit = "g";
    rayon = "epicerie";
  } else if (/\b(pates?|penne|tagliatelles?|spaghettis?|coquillettes?|fusilli|linguine)\b/.test(raw)) {
    name = "Pâtes de blé (penne, fusilli ou coquillettes)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bgnocchis?\b/.test(raw)) {
    name = "Gnocchis à poêler";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bnouilles?\b/.test(raw)) {
    name = "Nouilles asiatiques (blé ou soba)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\b(quinoa|semoule|boulghour|couscous)\b/.test(raw)) {
    name = "Quinoa ou semoule complète";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bpesto\b/.test(raw)) {
    name = "Pesto alla genovese (pot)";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\bpois\s+chiches?\b/.test(raw)) {
    name = "Pois chiches (bocal)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bharicots?\s+noirs?\b/.test(raw)) {
    name = "Haricots noirs (bocal)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bharicots?\s+rouges?\b/.test(raw)) {
    name = "Haricots rouges (bocal)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\blentilles?\b.*\bcorail\b/.test(raw)) {
    name = "Lentilles corail";
    unit = "g";
    rayon = "epicerie";
  } else if (/\blentilles?\s+vertes?\b/.test(raw)) {
    name = "Lentilles vertes françaises";
    unit = "g";
    rayon = "epicerie";
  } else if (/\blait\s+de\s+coco\b/.test(raw)) {
    name = "Lait de coco";
    unit = "ml";
    rayon = "epicerie";
  } else if (/\b(coulis|pulpe|tomates?\s+concassees?|tomates?\s+fraiches?\s+ou\s+concassees?|puree.*tomates?|tomates?\s+pelees?)\b/.test(raw)) {
    name = "Tomates concassées / Coulis";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bconcentre.*tomates?\b/.test(raw)) {
    name = "Concentré de tomate";
    unit = "c. à soupe";
    rayon = "epicerie";
  } else if (/\bthon\b/.test(raw)) {
    name = "Thon au naturel (boîte)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bbouillon\b/.test(raw)) {
    name = "Bouillon (volaille ou légumes)";
    unit = "ml";
    rayon = "epicerie";
  } else if (/\b(pain\s+de\s+mie|pain)\b/.test(raw)) {
    name = "Pain de campagne (ou pain de mie)";
    unit = "tranche";
    rayon = "epicerie";
  } else if (/\bchapelure\b/.test(raw) || /\bpanko\b/.test(raw)) {
    name = "Chapelure fine (ou panko)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bolives?\b/.test(raw)) {
    name = "Olives (noires ou vertes)";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bfalafels?\b/.test(raw)) {
    name = "Falafels prêts à dorer";
    unit = "piece";
    rayon = "epicerie";
  } else if (/\bhoumous\b/.test(raw)) {
    name = "Houmous classique";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bflocons?\s+d'avoine\b/.test(raw)) {
    name = "Flocons d'avoine";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bfarine\b/.test(raw) || /\bmaizena\b/.test(raw) || /\bfecule\b/.test(raw)) {
    name = "Farine de blé ou fécule";
    unit = "g";
    rayon = "epicerie";
  } else if (/\bmais\b/.test(raw)) {
    name = "Maïs doux en boîte";
    unit = "g";
    rayon = "epicerie";
  } else if (/\b(vin\s+blanc|vin\s+blanc\s+sec)\b/.test(raw)) {
    name = "Vin blanc sec de cuisine";
    unit = "ml";
    rayon = "epicerie";
  } else if (/\bvin\s+rouge\b/.test(raw)) {
    name = "Vin rouge de cuisine";
    unit = "ml";
    rayon = "epicerie";
  }

  return { name, quantity, unit, rayon };
}

// Poids (g) d'un ingrédient de recette, pour le calcul nutritionnel (null si impossible à convertir)
function ingredientGrams(ing) {
  const norm = normalizeIngredient(ing);
  return convertQuantity(Number(ing.quantity) || 0, canonicalUnit(ing.unit), 'g', norm.name);
}

// Choix déterministe de l'unité d'affichage d'un article : le résultat ne dépend plus de l'ordre
// des repas dans le planning (avant : « 280 g » ou « 3 sachets » selon le repas lu en premier).
// Priorité : grammes / ml (toujours convertibles), puis cuillères, pincée, puis unités comptables.
const TARGET_UNIT_PRIORITY = ['g', 'ml', 'c. à café', 'c. à soupe', 'pincee'];
function pickTargetUnit(candidates) {
  const list = [...candidates];
  for (const u of TARGET_UNIT_PRIORITY) if (list.includes(u)) return u;
  for (const u of COUNT_UNITS) if (list.includes(u)) return u;
  return list.sort()[0];
}

function computeGroceries() {
  // Regroupement par ingrédient harmonisé (rayon + nom), indépendamment de l'unité d'origine :
  // « 2 grosses pièces de patate douce » + « 600 g de patate douce » → « 4 pièces (≈ 1,2 kg) »
  const aggregated = {};
  const contributions = [];

  // Supporte plan en tableau ([id1,id2,...]) ou objet legacy ({Lundi: id,...})
  const planEntries = Array.isArray(state.plan)
    ? state.plan.map((id, idx) => ({ id, slotIndex: idx }))
    : Object.entries(state.plan).map(([key, id], idx) => ({ id, slotIndex: idx, dayKey: key }));

  // Passe 1 : normaliser chaque ingrédient et repérer les unités cibles possibles de chaque article
  planEntries.forEach(({ id: recipeId, slotIndex }) => {
    if (!recipeId) return;

    // Repas dont les ingrédients sont déjà à la maison (verrouillé / gardé au menu)
    if (Array.isArray(state.lockedSlots) && state.lockedSlots.includes(slotIndex)) {
      return;
    }

    const recipe = state.recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    const ratio = state.portions / (recipe.basePortions || 4);

    (recipe.ingredients || []).forEach(rawIng => {
      const norm = normalizeIngredient(rawIng);
      let sourceUnit = canonicalUnit(rawIng.unit);
      const qty = (Number(rawIng.quantity) || 1) * ratio;

      // Réparation des anciennes recettes maison enregistrées avec « 600 pièces » au lieu de « 600 g »
      if (recipe.id && recipe.id.startsWith('custom-') && COUNT_UNITS.includes(sourceUnit)
          && (Number(rawIng.quantity) || 0) >= 40 && (UNIT_WEIGHTS[norm.name] || {})[sourceUnit]) {
        sourceUnit = 'g';
      }

      const key = norm.name.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!aggregated[key]) {
        aggregated[key] = {
          id: key,
          name: norm.name,
          rayon: norm.rayon,
          candidates: new Set(),
          amounts: {},          // { unité: quantité } (unité cible + unités non convertibles)
          convertedFromMass: false,
          legacyIds: new Set(),
          recipes: []
        };
      }
      const item = aggregated[key];
      item.candidates.add(canonicalUnit(norm.unit));
      // Anciennes clés de cases cochées : (rayon, nom, unité) et nom d'origine de la recette
      item.legacyIds.add(`${norm.rayon}__${norm.name.toLowerCase().trim()}__${norm.unit}`);
      item.legacyIds.add((rawIng.name || '').toLowerCase().replace(/\s+/g, ' ').trim());
      if (!item.recipes.includes(recipe.title)) item.recipes.push(recipe.title);

      contributions.push({ item, sourceUnit, qty });
    });
  });

  Object.values(aggregated).forEach(item => { item.targetUnit = pickTargetUnit(item.candidates); });

  // Passe 2 : convertir dans l'unité cible et additionner
  contributions.forEach(({ item, sourceUnit, qty }) => {
    const converted = convertQuantity(qty, sourceUnit, item.targetUnit, item.name);
    if (converted !== null) {
      item.amounts[item.targetUnit] = (item.amounts[item.targetUnit] || 0) + converted;
      if (sourceUnit !== item.targetUnit && unitToGrams(sourceUnit) && COUNT_UNITS.includes(item.targetUnit)) {
        item.convertedFromMass = true;
      }
    } else {
      item.amounts[sourceUnit] = (item.amounts[sourceUnit] || 0) + qty;
    }
  });

  return Object.values(aggregated).map(item => {
    const units = Object.keys(item.amounts);
    // Unité cible en premier, puis les éventuelles unités non convertibles (ordre alphabétique : stable)
    units.sort((a, b) => (a === item.targetUnit ? -1 : b === item.targetUnit ? 1 : a.localeCompare(b)));
    const parts = units.map(u => formatQuantityAndUnit(item.amounts[u], u, item.name, true));
    let formatted = parts.join(' + ');

    // Indication du poids total quand on a additionné des grammes à des pièces
    const w = (UNIT_WEIGHTS[item.name] || {})[item.targetUnit];
    if (item.convertedFromMass && w && units.length === 1) {
      const count = Math.max(1, Math.ceil(item.amounts[item.targetUnit] - 0.15));
      formatted += ` <span class="font-medium text-slate-400">(≈ ${formatQuantityAndUnit(count * w, 'g')})</span>`;
    }

    // Formats d'achat : on affiche ce qu'on met dans le caddie (1 pot de 20 cl) plutôt qu'un volume brut
    const pack = PACKS[item.name];
    if (pack && units.length === 1 && units[0] === pack.unit) {
      const n = Math.max(1, Math.ceil(item.amounts[pack.unit] / pack.size - 0.1));
      formatted = `${n} ${n > 1 ? pack.plural : pack.label}`;
      formatted += ` <span class="font-medium text-slate-400">(≈ ${formatQuantityAndUnit(item.amounts[pack.unit], pack.unit)})</span>`;
    }

    // Conserver les articles déjà cochés avec l'ancienne clé (unité incluse)
    if (state.checkedGroceries[item.id] === undefined) {
      for (const legacy of item.legacyIds) {
        if (state.checkedGroceries[legacy]) { state.checkedGroceries[item.id] = true; break; }
      }
    }

    item.quantity = item.amounts[item.targetUnit] || 0;
    item.baseUnit = item.targetUnit;
    item.unit = item.targetUnit;
    item.formattedQty = formatted;
    item.formattedQtyText = formatted.replace(/<[^>]+>/g, '');
    delete item.legacyIds;
    delete item.candidates;
    return item;
  });
}
