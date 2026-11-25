// Logique « pure » de Gamelle & Panier (sans accès au DOM) : saisons, styles, régimes, génération du menu,
// placard / épices, budget estimé. Chargée avant app.js ; testée dans tests/logic.test.js.
(function (root) {
  'use strict';

  const norm = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ---------------------------------------------------------------- Saisons & styles
  const SEASONS = [
    { id: 'printemps', label: 'Printemps', emoji: '🌸' },
    { id: 'ete', label: 'Été', emoji: '☀️' },
    { id: 'automne', label: 'Automne', emoji: '🍁' },
    { id: 'hiver', label: 'Hiver', emoji: '❄️' }
  ];
  const STYLES = [
    { id: 'street', label: 'Street food', emoji: '🌮' },
    { id: 'italien', label: 'Italien', emoji: '🇮🇹' },
    { id: 'asiatique', label: 'Asiatique', emoji: '🥢' },
    { id: 'orient', label: 'Orient & Indien', emoji: '🍛' },
    { id: 'mexicain', label: 'Tex-Mex', emoji: '🌶️' },
    { id: 'terroir', label: 'Terroir & tradition', emoji: '🥘' },
    { id: 'frais', label: 'Frais & bowls', emoji: '🥗' },
    { id: 'quotidien', label: 'Du quotidien', emoji: '🍽️' }
  ];

  const SEASON_RULES = {
    printemps: /petit.? pois|asperge|epinard|radis|menthe|printemps|ciboulette|aneth|fenouil|jeunes pousses|artichaut|brocoli|haricots? verts?|citron|saumon fume|frittata|ricotta|chevre/,
    ete: /courgette|tomate|aubergine|poivron|concombre|avocat|salade|wrap|poke|grec|basilic|citron vert|crevette|brochette|ratatouille|melon|fraicheur|froid|rouleaux|tzatziki|burrata|mozzarella|pesto|feta|mais|ete\b|bbq|barbecue|guacamole|thon/,
    automne: /butternut|potimarron|courge|champignon|marron|chataigne|noix|noisette|patate douce|lentille|poireau|automne|betterave|pomme\b|poire|cidre|chou-fleur|veloute/,
    hiver: /raclette|reblochon|tartiflette|croziflette|gratin|blanquette|bourguignon|mijot|soupe|veloute|hachis|parmentier|lasagne|endive|chou|comte|fondue|cassoulet|bechamel|hiver|confit|canard|tajine|couscous|potee|saucisse|lardons|pommes? de terre|croque|cheddar|cuisses|four\b|quiche|rosti|morbier|brie\b/
  };
  const STYLE_RULES = {
    street: /burger|tacos?|wrap|quesadilla|burrito|fajita|enchilada|bagel|croque|grilled cheese|\bnems?\b|brick|kebab|galette|hot.?dog|sandwich|pita|naan|tortilla de|croustiwrap|cordon bleu|bouchees|nuggets|pad thai|bo bun|yakitori|samoussa|falafel|street|bang bang/,
    italien: /pates|penne|spaghetti|tagliatelle|rigatoni|fusilli|linguine|orecchiette|pappardelle|gnocchi|risotto|lasagne|ravioli|ravioles|pizza|parmigiana|carbonara|bolognais|pesto|burrata|italien|toscane|alfredo|boscaiola|prosciutto|polenta|sicilienne|milanaise|piccata/,
    asiatique: /\bwok\b|nouilles|pad thai|teriyaki|sauce soja|ramen|cantonais|poke|riz saute|sesame|gingembre|yakitori|satay|cacahuete|udon|soba|thai|japonais|laque|vermicelle|sriracha|wasabi|tsukune|bang bang|imperial|asiatique|bo bun|rouleaux de printemps/,
    orient: /curry|tikka|tandoori|dahl|dhal|tajine|couscous|harissa|ras el hanout|libanais|merguez|falafel|houmous|garam masala|mafe|chakchouka|shakshuka|semoule|pois chiches|lait de coco|orient|rougail|korma/,
    mexicain: /tex.?mex|mexicain|fajita|burrito|enchilada|quesadilla|tacos?|chili\b|haricots noirs|guacamole|cajun|nacho/,
    terroir: /gratin|blanquette|bourguignon|hachis|parmentier|quiche|tartiflette|croziflette|raclette|reblochon|cassoulet|potee|basquaise|vallee d.auge|confit|canard|veloute|soupe|tradition|terroir|bistrot|dauphinois|saucisse|lentilles|endive|flammekueche|galette complete|brandade|mijot|roti|cuisses|tarte|frittata|tortilla/,
    frais: /salade|poke|bowl|rouleaux|froid|fraicheur|tzatziki|crudites|avocat|concombre|ceviche|tartare|wraps? fraicheur/
  };
  const NO_GAMELLE = /croque|burger|fondue|raclette|tartiflette|oeuf au plat|coulant|poches|brouille|benedict|cocotte|papillote|tacos|bagel|grilled|tempura|panes?\b|frites|brick|\bnems?\b|samoussa|rosti|crousti|huevos/;

  function recipeText(r) {
    return norm([r.title, r.tag, r.description, ...(r.ingredients || []).map((i) => i.name)].join(' '));
  }

  // Saisons d'une recette : champ `seasons` s'il existe, sinon déduit (recettes maison : champ `season` du studio)
  function classifySeasons(r) {
    const t = recipeText(r);
    const score = {};
    SEASONS.forEach((s) => { score[s.id] = (t.match(new RegExp(SEASON_RULES[s.id].source, 'g')) || []).length; });
    // Indication éditoriale d'origine
    if (r.season === 'automne') score.automne += 2;
    if (r.season === 'hiver') score.hiver += 2;
    const max = Math.max(...Object.values(score));
    if (max === 0) return SEASONS.map((s) => s.id);
    const cut = Math.max(1, Math.ceil(max * 0.6));
    let picked = SEASONS.filter((s) => score[s.id] >= cut).map((s) => s.id);
    // Les plats frais d'été conviennent aussi au printemps ; les plats d'hiver à la fin de l'automne
    if (picked.includes('ete') && !picked.includes('printemps') && score.printemps >= 1) picked.push('printemps');
    if (picked.includes('hiver') && !picked.includes('automne') && score.automne >= 1) picked.push('automne');
    picked = SEASONS.filter((s) => picked.includes(s.id)).map((s) => s.id);
    return picked.length ? picked : SEASONS.map((s) => s.id);
  }
  function classifyStyles(r) {
    const t = recipeText(r);
    const title = norm(r.title + ' ' + r.tag);
    const found = STYLES.filter((s) => s.id !== 'quotidien' && STYLE_RULES[s.id].test(title)).map((s) => s.id);
    if (found.length < 3) {
      STYLES.forEach((s) => { if (s.id !== 'quotidien' && !found.includes(s.id) && found.length < 3 && STYLE_RULES[s.id].test(t) && ['asiatique', 'orient', 'mexicain', 'italien'].includes(s.id) && STYLE_RULES[s.id].test(norm((r.ingredients || []).map((i) => i.name).join(' ')))) found.push(s.id); });
    }
    return found.length ? found.slice(0, 3) : ['quotidien'];
  }
  function classifyGamelle(r) { return !NO_GAMELLE.test(norm(r.title)); }
  function classifyRecipe(r) { return { seasons: classifySeasons(r), styles: classifyStyles(r), gamelle: classifyGamelle(r) }; }

  function recipeSeasons(r) {
    if (Array.isArray(r.seasons) && r.seasons.length) return r.seasons;
    if (r.season === 'printemps' || r.season === 'ete' || r.season === 'automne' || r.season === 'hiver') return [r.season];
    return SEASONS.map((s) => s.id); // « toutes saisons » (recettes maison)
  }
  function recipeStyles(r) { return Array.isArray(r.styles) && r.styles.length ? r.styles : classifyStyles(r); }
  function recipeIsGamelle(r) { return typeof r.gamelle === 'boolean' ? r.gamelle : classifyGamelle(r); }
  function currentSeason(date) {
    const m = (date || new Date()).getMonth() + 1; // 1..12
    if (m >= 3 && m <= 5) return 'printemps';
    if (m >= 6 && m <= 8) return 'ete';
    if (m >= 9 && m <= 11) return 'automne';
    return 'hiver';
  }

  // ---------------------------------------------------------------- Régimes / pratiques
  const PORK = /porc|lardons?|\blard\b|jambon|chorizo|saucisse|bacon|pancetta|poitrine|prosciutto|coppa|echine|boudin|rillettes/;
  const LACTOSE = /creme(?! de coco)|\blait\b(?! de coco)|beurre(?! de cacahuete)|fromage|mozzarella|parmesan|feta|chevre|ricotta|yaourt|comte|emmental|reblochon|bechamel|brie\b|burrata|cheddar|gorgonzola|raclette|morbier|mascarpone|kefir|gruyere|beaufort|roquefort|\bbleu\b|boursin|kiri|vache qui rit|fromage blanc|crottin|cabecou/;
  const ONE_PAN = /poelee|one pan|one pot|\bwok\b|saute|risotto|curry|chakchouka|shakshuka|dahl|chili|soupe|veloute|riz saute|nouilles saute|plat unique/;
  const ingText = (r) => norm((r.ingredients || []).map((i) => i.name).join(' | '));
  const containsPork = (r) => PORK.test(ingText(r));
  const containsLactose = (r) => LACTOSE.test(ingText(r));
  const isOnePan = (r) => ONE_PAN.test(norm(r.title + ' ' + r.tag));
  function matchesFridge(r, terms) {
    const t = ingText(r) + ' ' + norm(r.title);
    return (terms || []).some((x) => x && t.includes(x));
  }
  function parseFridge(text) {
    return String(text || '').split(/[,;\n]/).map((x) => norm(x).trim().replace(/s$/, '')).filter((x) => x.length >= 3);
  }

  // ---------------------------------------------------------------- Filtres & génération du menu
  function recipeMatchesFilters(r, f, favorites) {
    f = f || {};
    if (f.seasons && f.seasons.length && !recipeSeasons(r).some((s) => f.seasons.includes(s))) return false;
    if (f.types && f.types.length && !f.types.includes(r.type === 'vegetarien' ? 'vege' : r.type)) return false;
    if (f.styles && f.styles.length && !recipeStyles(r).some((s) => f.styles.includes(s))) return false;
    if (f.budget && r.isBudget !== true) return false;
    if (f.express && !(r.timeMinutes <= 20)) return false;
    if (f.noPork && containsPork(r)) return false;
    if (f.noLactose && containsLactose(r)) return false;
    if (f.onePan && !isOnePan(r)) return false;
    if (f.gamelle && !recipeIsGamelle(r)) return false;
    if (f.favoritesOnly && !(favorites || []).includes(r.id)) return false;
    return true;
  }
  const DAY = 86400000;
  const RECENT_DAYS = 21;

  // Tire `count` plats : probabilité proportionnelle à la place de chaque type dans le catalogue filtré,
  // sans doublon, jamais plus de 40 % du même type tant qu'il reste du choix.
  function pickMenu(opts) {
    const {
      recipes, count = 7, filters = {}, excludeIds = [], favorites = [], notes = {}, now = Date.now(), rng = Math.random
    } = opts;
    const excluded = new Set(excludeIds);
    let pool = recipes.filter((r) => !excluded.has(r.id) && recipeMatchesFilters(r, filters, favorites));
    const total = pool.length;
    // Pas de « bof », pas de plat cuisiné récemment (si le choix le permet)
    const notDisliked = pool.filter((r) => !(notes[r.id] && notes[r.id].r === -1));
    if (notDisliked.length >= count) pool = notDisliked;
    const notRecent = pool.filter((r) => !(notes[r.id] && notes[r.id].cooked && now - notes[r.id].cooked < RECENT_DAYS * DAY));
    if (notRecent.length >= count * 2) pool = notRecent;
    const fridge = parseFridge(filters.fridge);
    const weight = (r) => {
      let w = 1;
      if (notes[r.id] && notes[r.id].r === 1) w *= 2;
      if (fridge.length && matchesFridge(r, fridge)) w *= 8;
      return w;
    };
    const cap = Math.max(1, Math.ceil(count * 0.4));
    const typeCount = {};
    const picked = [];
    let rest = [...pool];
    while (picked.length < count && rest.length) {
      let eligible = rest.filter((r) => (typeCount[r.type] || 0) < cap);
      if (!eligible.length) eligible = rest;
      const sum = eligible.reduce((s, r) => s + weight(r), 0);
      let x = rng() * sum;
      let chosen = eligible[eligible.length - 1];
      for (const r of eligible) { x -= weight(r); if (x <= 0) { chosen = r; break; } }
      picked.push(chosen.id);
      typeCount[chosen.type] = (typeCount[chosen.type] || 0) + 1;
      rest = rest.filter((r) => r.id !== chosen.id);
    }
    return { ids: picked, matching: total };
  }

  // ---------------------------------------------------------------- Placard, épices, stock de base
  const SPICES_BASIC = ['Paprika doux (ou fumé)', 'Cumin en poudre', 'Curcuma en poudre', 'Herbes de Provence sèches', 'Noix de muscade râpée', 'Cannelle en poudre'];
  const SPICES_FULL = [...SPICES_BASIC, 'Pâte ou poudre de curry doux', "Mélange d'épices (Fajitas / Chili)", 'Épices mexicaines', 'Épices à couscous (ras el hanout)',
    'Garam masala', "Piment d'Espelette", 'Piment (doux)', 'Gingembre moulu', 'Tabasco', 'Harissa (pâte)', 'Wasabi', 'Fond de veau', 'Sauce piment (Sriracha)'];
  const BASICS = ["Huile d'olive vierge extra", 'Huile', 'Farine de blé ou fécule', 'Sucre (en poudre)', 'Vinaigre balsamique', 'Vinaigre de cidre (ou vin)',
    "Moutarde à l'ancienne ou Dijon", 'Chapelure fine (ou panko)'];
  const SPICE_LEVELS = [
    { id: 0, label: 'Aucune', hint: 'Toutes les épices sont listées' },
    { id: 1, label: 'Basiques', hint: 'Paprika, cumin, curcuma, herbes de Provence, muscade, cannelle' },
    { id: 2, label: 'Bien garni', hint: 'Toutes les épices courantes (curry, fajitas, couscous, piment…)' }
  ];

  function splitGroceries(list, opts) {
    const { pantry = [], needed = [], spiceLevel = 0, stockBasics = false } = opts || {};
    const toBuy = [];
    const atHome = [];
    const spices = spiceLevel >= 2 ? SPICES_FULL : spiceLevel === 1 ? SPICES_BASIC : [];
    for (const item of list) {
      if (needed.includes(item.id)) { toBuy.push(item); continue; }
      if (pantry.includes(item.id)) { atHome.push({ item, reason: 'placard' }); continue; }
      if (spices.includes(item.name)) { atHome.push({ item, reason: 'épices' }); continue; }
      if (stockBasics && BASICS.includes(item.name)) { atHome.push({ item, reason: 'base' }); continue; }
      toBuy.push(item);
    }
    return { toBuy, atHome };
  }

  // ---------------------------------------------------------------- Budget estimé (ordre de grandeur)
  const PRICE_KG = { 'fruits-legumes': 3.2, boucherie: 12, poissonnerie: 20, cremerie: 9, epicerie: 4 };
  const PRICE_PIECE = { 'fruits-legumes': 0.7, boucherie: 2.2, poissonnerie: 3.5, cremerie: 1.2, epicerie: 1.2 };
  function estimateItemPrice(item) {
    const q = Number(item.quantity) || 0;
    const u = item.baseUnit || item.unit;
    if (item.name === 'Œufs frais') return q * 0.4;
    if (u === 'g' || u === 'ml') return Math.max(0.3, (q / 1000) * (PRICE_KG[item.rayon] || 5));
    if (u === 'c. à soupe' || u === 'c. à café' || u === 'pincee') return 0.25;
    if (u === 'oeuf') return q * 0.4;
    return Math.max(0.3, q * (PRICE_PIECE[item.rayon] || 1));
  }
  function estimateCost(items) { return Math.round(items.reduce((s, i) => s + estimateItemPrice(i), 0)); }


  // ---------------------------------------------------------------- Chiffrement de la synchro foyer (AES-GCM, clé dérivée du code foyer)
  const keyCache = {};
  const b64 = (buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  async function deriveKey(code) {
    const k = String(code || '').trim().toUpperCase();
    if (keyCache[k]) return keyCache[k];
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode('gamelle:' + k), 'PBKDF2', false, ['deriveKey']);
    keyCache[k] = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('gamelle-foyer-v1'), iterations: 100000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return keyCache[k];
  }
  async function encryptPayload(code, obj) {
    const key = await deriveKey(code);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return JSON.stringify({ gamelle: 3, iv: b64(iv), d: b64(data) });
  }
  // Renvoie l'objet clair (message chiffré ou ancien message en clair), ou null si illisible
  async function decryptPayload(code, msg) {
    try {
      const o = typeof msg === 'string' ? JSON.parse(msg) : msg;
      if (!o || typeof o !== 'object') return null;
      if (o.gamelle !== 3) return o; // ancien format en clair
      const key = await deriveKey(code);
      const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.d));
      return JSON.parse(new TextDecoder().decode(clear));
    } catch (e) { return null; }
  }
  const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof btoa === 'function';

  root.GamelleLogic = {
    norm, SEASONS, STYLES, classifyRecipe, classifySeasons, classifyStyles, classifyGamelle,
    recipeSeasons, recipeStyles, recipeIsGamelle, currentSeason,
    containsPork, containsLactose, isOnePan, matchesFridge, parseFridge,
    recipeMatchesFilters, pickMenu, RECENT_DAYS,
    SPICES_BASIC, SPICES_FULL, BASICS, SPICE_LEVELS, splitGroceries, estimateItemPrice, estimateCost,
    encryptPayload, decryptPayload, cryptoAvailable
  };
})(typeof window !== 'undefined' ? window : globalThis);
