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
    { id: 'street', label: 'Street food', emoji: '' },
    { id: 'italien', label: 'Italien', emoji: '' },
    { id: 'asiatique', label: 'Asiatique', emoji: '' },
    { id: 'orient', label: 'Orient & Indien', emoji: '' },
    { id: 'mexicain', label: 'Tex-Mex', emoji: '' },
    { id: 'terroir', label: 'Terroir & tradition', emoji: '' },
    { id: 'frais', label: 'Frais & bowls', emoji: '' },
    { id: 'quotidien', label: 'Du quotidien', emoji: '' }
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
  function classifyRecipe(r) { return { seasons: classifySeasons(r), styles: classifyStyles(r) }; }

  function recipeSeasons(r) {
    if (Array.isArray(r.seasons) && r.seasons.length) return r.seasons;
    if (r.season === 'printemps' || r.season === 'ete' || r.season === 'automne' || r.season === 'hiver') return [r.season];
    return SEASONS.map((s) => s.id); // « toutes saisons » (recettes maison)
  }
  function recipeStyles(r) { return Array.isArray(r.styles) && r.styles.length ? r.styles : classifyStyles(r); }
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
    if (f.favoritesOnly && !(favorites || []).includes(r.id)) return false;
    return true;
  }
  const DAY = 86400000;
  const RECENT_DAYS = 21;

  // Tire `count` plats : probabilité proportionnelle à la place de chaque type dans le catalogue filtré,
  // sans doublon, jamais plus de 40 % du même type tant qu'il reste du choix.
  function pickMenu(opts) {
    const {
      recipes, count = 7, filters = {}, excludeIds = [], favorites = [], notes = {}, now = Date.now(), rng = Math.random, mood = null
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
      if (fridge.length && matchesFridge(r, fridge)) w *= 25;
      w *= weatherFit(r, mood);
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
    // Budget : on remplace les plats les plus chers par des alternatives moins chères (tirage au hasard parmi les moins chères)
    let cost = null, withinBudget = null;
    if (opts.budget > 0 && typeof opts.costOf === 'function') {
      const costOf = opts.costOf;
      const limit = opts.budget - (opts.fixedCost || 0);
      const byId = Object.fromEntries(pool.map((r) => [r.id, r]));
      const sum = () => picked.reduce((s, id) => s + costOf(byId[id]), 0);
      let guard = 0;
      while (sum() > limit && guard++ < 80) {
        const dearest = picked.reduce((a, b) => (costOf(byId[a]) >= costOf(byId[b]) ? a : b));
        const dc = costOf(byId[dearest]);
        const cheaper = pool.filter((r) => !picked.includes(r.id) && costOf(r) < dc - 0.05).sort((a, b) => costOf(a) - costOf(b));
        if (!cheaper.length) break;
        const top = cheaper.slice(0, Math.max(3, Math.ceil(cheaper.length * 0.35))); // les moins chers, mais pas toujours les mêmes
        const rep = top[Math.floor(rng() * top.length)];
        picked[picked.indexOf(dearest)] = rep.id;
      }
      cost = Math.round(sum() * 100) / 100;
      withinBudget = cost <= limit + 1e-9;
    }
    return { ids: picked, matching: total, cost, withinBudget };
  }

  // ---------------------------------------------------------------- Placard, épices, stock de base
  // Épices : une puce par épice (« j'en ai » / « il m'en manque »)
  const SPICES = [
    ['Paprika doux (ou fumé)', 'Paprika'], ['Cumin en poudre', 'Cumin'], ['Curcuma en poudre', 'Curcuma'], ['Herbes de Provence sèches', 'Herbes de Provence'],
    ['Noix de muscade râpée', 'Muscade'], ['Cannelle en poudre', 'Cannelle'], ['Pâte ou poudre de curry doux', 'Curry'], ["Mélange d'épices (Fajitas / Chili)", 'Fajitas / chili'],
    ['Épices mexicaines', 'Mexicaines'], ['Épices à couscous (ras el hanout)', 'Couscous'], ['Garam masala', 'Garam masala'], ["Piment d'Espelette", 'Espelette'],
    ['Piment (doux)', 'Piment doux'], ['Gingembre moulu', 'Gingembre moulu'], ['Tabasco', 'Tabasco'], ['Harissa (pâte)', 'Harissa'], ['Sauce piment (Sriracha)', 'Sriracha'], ['Wasabi', 'Wasabi']
  ].map(([name, label]) => ({ name, label }));
  const SPICES_BASIC = SPICES.slice(0, 6).map((x) => x.name);
  const SPICES_FULL = SPICES.map((x) => x.name);
  const BASICS = ["Huile d'olive vierge extra", 'Huile', 'Farine de blé ou fécule', 'Sucre (en poudre)', 'Vinaigre balsamique', 'Vinaigre de cidre (ou vin)',
    "Moutarde à l'ancienne ou Dijon", 'Chapelure fine (ou panko)'];
  function splitGroceries(list, opts) {
    const { pantry = [], needed = [], spices = [], stockBasics = false } = opts || {};
    const toBuy = [];
    const atHome = [];
    for (const item of list) {
      if (needed.includes(item.id)) { toBuy.push(item); continue; }
      if (pantry.includes(item.id)) { atHome.push({ item, reason: 'placard' }); continue; }
      if (spices.includes(item.name)) { atHome.push({ item, reason: 'épices' }); continue; }
      if (stockBasics && BASICS.includes(item.name)) { atHome.push({ item, reason: 'base' }); continue; }
      toBuy.push(item);
    }
    return { toBuy, atHome };
  }


  // ---------------------------------------------------------------- Suggestions pour « Ajouter un produit courant »
  const STAPLE_SUGGESTIONS = ['Bananes', 'Pommes', 'Fruits de saison', 'Citrons', 'Clémentines', 'Lait', 'Yaourts', 'Kéfir', 'Beurre', 'Œufs', 'Fromage râpé', 'Jambon', 'Pain de mie', 'Pain', 'Flocons d\'avoine',
    'Céréales', 'Café', 'Thé', 'Sucre', 'Sel', 'Poivre', 'Eau', 'Jus d\'orange', 'Compote', 'Confiture', 'Miel', 'Biscuits', 'Chocolat', 'Pâtes', 'Riz', 'Farine', 'Huile d\'olive', 'Vinaigre',
    'Salade', 'Tomates', 'Carottes', 'Concombre', 'Avocats', 'Pommes de terre', 'Oignons', 'Ail', 'Papier toilette', 'Essuie-tout', 'Liquide vaisselle', 'Lessive', 'Sacs poubelle', 'Éponges',
    'Savon', 'Gel douche', 'Shampooing', 'Dentifrice', 'Mouchoirs', 'Film alimentaire'];
  // Propose jusqu'à `max` produits : ceux qui commencent par la saisie d'abord, puis ceux qui contiennent un mot qui commence par elle.
  function suggestStaples(query, pool, existing, max) {
    const q = norm(query).replace(/[^a-z0-9 ]/g, ' ').trim();
    if (q.length < 1) return [];
    const have = new Set((existing || []).map((x) => norm(x)));
    const seen = new Set();
    const starts = [], words = [];
    for (const label of pool || []) {
      const n = norm(label);
      if (have.has(n) || seen.has(n)) continue;
      seen.add(n);
      const plain = n.replace(/[^a-z0-9 ]/g, ' ');
      if (plain.startsWith(q)) starts.push(label);
      else if (plain.split(/\s+/).some((w) => w.startsWith(q))) words.push(label);
    }
    return [...starts, ...words].slice(0, max || 6);
  }


  // ---------------------------------------------------------------- « Finir mes restes » : recettes classées selon ce qu'on a déjà
  const stem = (w) => w.replace(/(s|x)$/, '');
  const tokens = (t) => norm(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3).map(stem);
  // `have` : libellés saisis ("poulet", "restes de riz", "pommes de terre") ; articleOf(ingredient) → nom d'article de courses
  // opts : { articleOf, pantry: [id d'articles], spices: [noms], stockBasics, limit }
  function rankByLeftovers(recipes, have, opts) {
    const { articleOf, pantry = [], spices = [], limit = 12 } = opts || {};
    const labels = (have || []).map((h) => ({ label: h, tok: tokens(h) })).filter((x) => x.tok.length);
    if (!labels.length) return [];
    const minor = new Set([...BASICS, ...SPICES.map((x) => x.name)]);
    const out = [];
    for (const r of recipes) {
      const used = new Set();
      const missing = [];
      let main = 0, covered = 0;
      for (const ing of r.ingredients || []) {
        const article = articleOf(ing);
        const hay = tokens(article + ' ' + ing.name);
        const hit = labels.find((l) => l.tok.every((t) => hay.some((h) => h === t || h.startsWith(t))));
        if (hit) { used.add(hit.label); main++; covered++; continue; }
        if (minor.has(article)) continue; // huile, farine, épices courantes… : jamais bloquants
        main++;
        if (pantry.includes(article.toLowerCase()) || spices.includes(article)) { covered++; continue; }
        missing.push(article);
      }
      if (!used.size) continue;
      out.push({ recipe: r, used: [...used], missing, covered, main });
    }
    out.sort((a, b) => b.used.length - a.used.length || a.missing.length - b.missing.length || (b.covered / b.main) - (a.covered / a.main) || a.recipe.timeMinutes - b.recipe.timeMinutes);
    return out.slice(0, limit);
  }


  // ---------------------------------------------------------------- Météo (Open-Meteo : gratuit, sans clé) → plats adaptés
  const WET_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
  const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
  // Température retenue : moyenne des maximales des 3 prochains jours (le menu couvre la semaine à venir)
  function weatherMood(w) {
    if (!w || !Number.isFinite(w.tempMax)) return null;
    const t = w.tempMax;
    return { temp: t <= 9 ? 'froid' : t <= 16 ? 'frais' : t <= 23 ? 'doux' : 'chaud', wet: !!w.wet, tempMax: Math.round(t) };
  }
  const COMFORT = /gratin|mijot|soupe|veloute|curry|lasagne|raclette|fondue|hachis|parmentier|blanquette|bourguignon|tartiflette|cassoulet|couscous|tajine|four\b|quiche|risotto|moussaka|pot au feu|potee|chou braise|reblochon/;
  const FRESH = /salade|poke|wrap|bowl|froid|grill|brochette|tzatziki|concombre|fraicheur|ete\b|tomates? cerises|burrata|caprese/;
  function weatherFit(r, mood) {
    if (!mood) return 1;
    const t = norm(r.title + ' ' + (r.tag || ''));
    const seasons = recipeSeasons(r);
    const styles = recipeStyles(r);
    const comfort = styles.includes('terroir') || (seasons.includes('hiver') && !seasons.includes('ete')) || COMFORT.test(t);
    const fresh = styles.includes('frais') || (seasons.includes('ete') && !seasons.includes('hiver')) || FRESH.test(t);
    let m = 1;
    if (mood.temp === 'froid') m = comfort ? 2.5 : fresh ? 0.4 : 1;
    else if (mood.temp === 'frais') m = comfort ? 1.6 : fresh ? 0.7 : 1;
    else if (mood.temp === 'chaud') m = fresh ? 2.5 : comfort ? 0.35 : 1;
    if (mood.wet && mood.temp !== 'chaud' && comfort) m *= 1.3;
    return m;
  }
  async function fetchWeather(lat, lon, fetchFn) {
    const url = `${OPEN_METEO}?latitude=${Number(lat).toFixed(2)}&longitude=${Number(lon).toFixed(2)}&current=temperature_2m,precipitation,weather_code&daily=temperature_2m_max,precipitation_sum&forecast_days=3&timezone=auto`;
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const j = await res.json();
    const maxes = ((j.daily || {}).temperature_2m_max || []).filter(Number.isFinite);
    if (!maxes.length) return null;
    const rain = ((j.daily || {}).precipitation_sum || []).filter(Number.isFinite);
    const wetNow = WET_CODES.has(Number((j.current || {}).weather_code));
    return { tempMax: maxes.reduce((a, b) => a + b, 0) / maxes.length, wet: wetNow || (rain.length > 0 && rain.reduce((a, b) => a + b, 0) / rain.length >= 3) };
  }

  // ---------------------------------------------------------------- Notifications du foyer (ntfy.sh : sujet secret dérivé du code, aucune clé)
  async function notifTopic(code) {
    const bytes = new TextEncoder().encode('gamelle-alerte:' + String(code || '').trim().toUpperCase());
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return 'gamelle-alerte-' + Array.from(new Uint8Array(hash)).slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const listText = (arr, max) => arr.length > max ? `${arr.slice(0, max).join(', ')} +${arr.length - max}` : arr.join(', ');
  // « Julie a ajouté Lait, Avoine dans la liste de courses »
  function buildNotification({ name, staples = [], meals = [] }) {
    const who = (name || '').trim();
    const verb = who ? `${who} a ajouté` : 'A ajouté';
    const parts = [];
    if (staples.length) parts.push(`${verb} ${listText(staples, 5)} dans la liste de courses`);
    if (meals.length) parts.push(`${parts.length ? 'et' : verb} ${meals.length === 1 ? `« ${meals[0]} »` : `${meals.length} repas (${listText(meals, 3)})`} au menu`);
    return parts.length ? parts.join(' ') : null;
  }

  // « il y a 2 h » (état de la synchro)
  function syncAgeText(ts, now) {
    if (!ts) return 'jamais';
    const s = Math.max(0, Math.round(((now || Date.now()) - ts) / 1000));
    if (s < 45) return "à l'instant";
    if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return `il y a ${Math.round(s / 86400)} j`;
  }

  // ---------------------------------------------------------------- Budget estimé
  // Prix de référence (novembre 2026, magasin type Grand Frais) : €/kg (ou €/L pour les liquides) ou €/unité.
  // Sources : prix au kilo imprimés sur un vrai ticket (poivron jaune 4,99, rouge 5,99, tomate olivette 2,99, pomme Gala 1,99,
  // banane 0,99, courgette 2,50, clémentine 4,99, pommes de terre 3,50 les 2 kg, cheddar râpé 140 g à 2,39 = 17,1 €/kg, fromage grec
  // 180 g à 2,29 = 12,7 €/kg, yaourt 8 × 125 g à 1,59, wraps 2,99 les 6, pains burger 1,99 les 4, coriandre 0,50 la botte…),
  // complétés par des prix courants. `u` = prix d'une unité de l'article ; pour les épices/condiments : prix d'une cuillère à soupe
  // (une cuillère à café = 1/3, une pincée = 1/12). Les prix lus sur VOS tickets (carnet de prix) passent avant ceux-ci.
  const REF_PRICES = {
    // fruits & légumes
    "Gousses d'ail": { u: 0.06 }, 'Oignons jaunes': { u: 0.3 }, 'Oignons rouges': { u: 0.4 }, 'Échalotes': { u: 0.35 }, 'Blancs de poireaux': { u: 0.9 },
    'Carottes fraîches': { u: 0.18 }, 'Courgettes fraîches': { u: 0.6 }, 'Tomates fraîches': { u: 0.45 }, 'Poivrons (rouges ou tricolores)': { u: 1.05 },
    'Citrons jaunes': { u: 0.5 }, 'Citrons verts': { u: 0.45 }, 'Avocats mûrs': { u: 1.2 }, 'Aubergines fraîches': { u: 1.0 }, 'Patates douces': { u: 0.85 },
    'Concombre frais': { u: 0.9 }, 'Brocoli frais': { u: 1.6 }, 'Chou-fleur frais': { u: 2.2 }, 'Courge Butternut': { u: 2.2 }, 'Potimarron frais': { u: 2.5 },
    'Oranges': { u: 0.55 }, 'Gingembre frais': { u: 0.05 }, 'Pommes de terre fraîches': { kg: 1.75 }, 'Champignons de Paris frais': { kg: 6.5 },
    'Salade verte (mâche ou roquette)': { kg: 14, u: 0.6 }, "Pousses d'épinards frais": { kg: 9 }, 'Petits pois frais (ou surgelés)': { kg: 3.8 },
    'Haricots verts fins frais': { kg: 5.5 }, 'Noisettes ou amandes décortiquées': { kg: 16 }, 'Cerneaux de noix': { kg: 30 }, 'Pousses de soja': { kg: 5 },
    'Coriandre fraîche': { u: 0.5 }, 'Persil plat frais': { u: 0.8 }, 'Basilic frais': { u: 1.3 }, 'Ciboulette fraîche': { u: 0.9 }, 'Thym frais': { u: 0.9 },
    'Menthe fraîche': { u: 0.9 }, 'Romarin frais': { u: 0.9 }, 'Oignons nouveaux (cébettes)': { u: 1.3 }, 'Bouquet garni': { u: 0.7 },
    // boucherie
    'Filets de poulet frais': { kg: 14 }, 'Lardons fumés pur porc': { kg: 12.5 }, 'Bœuf haché frais (pur bœuf)': { kg: 12 }, 'Bavette ou rumsteck de bœuf': { kg: 24 },
    'Escalopes de dinde fraîches': { kg: 13 }, 'Jambon blanc supérieur': { u: 0.55 }, 'Chorizo en tranches': { kg: 24 }, 'Saucisses de Toulouse ou fumées': { u: 1.1 },
    'Cuisses de poulet fraîches': { u: 1.5 }, 'Filet de porc français': { kg: 11 }, 'Cuisses de canard confites': { u: 3.5 }, 'Magrets de canard': { kg: 28 },
    'Poulet entier': { u: 9 }, 'Poulet pané': { u: 0.9 }, 'Veau français (sauté ou blanquette)': { kg: 20 }, 'Bœuf à mijoter (paleron ou gîte)': { kg: 15 },
    'Chair à saucisse': { kg: 10 }, 'Lard (tranches)': { u: 0.5 }, 'Jambon cru (prosciutto)': { u: 0.9 },
    // poissonnerie
    'Crevettes cuites décortiquées': { kg: 22 }, 'Pavés de saumon frais': { u: 2.6 }, 'Dos de cabillaud / Poisson blanc frais': { kg: 24, u: 3.2 },
    'Saumon fumé de qualité': { kg: 45 }, 'Noix de Saint-Jacques fraîches': { kg: 55 },
    // crèmerie
    'Crème fraîche (épaisse ou liquide)': { kg: 10 }, 'Parmesan AOP râpé': { kg: 26 }, 'Beurre (doux ou demi-sel)': { kg: 11 }, 'Œufs frais': { u: 0.32 },
    'Lait (demi-écrémé ou entier)': { kg: 1.1 }, 'Feta AOP': { kg: 12.7 }, 'Ricotta fraîche': { kg: 8 }, 'Bûche de chèvre frais': { kg: 16 }, 'Emmental râpé': { kg: 10 },
    'Comté AOP râpé': { kg: 22 }, 'Fromage râpé': { kg: 10 }, 'Mozzarella (boule ou râpée)': { kg: 9, u: 1.0 }, 'Cheddar râpé': { kg: 17.1 }, 'Fromage bleu crémeux': { kg: 16 },
    'Reblochon de Savoie AOP': { kg: 15 }, 'Burrata': { kg: 18, u: 2.5 }, 'Camembert': { u: 2.5 }, 'Petits chèvres Cabécous': { u: 1.2 }, 'Yaourts (nature ou aux fruits)': { u: 0.2 },
    'Fromage frais à tartiner': { kg: 8 }, 'Pâte à tarte (feuilletée ou brisée)': { u: 1.5 }, 'Tranches de cheddar affiné': { kg: 18 }, 'Laitue iceberg': { u: 1.3 },
    // épicerie
    'Riz blanc (basmati ou jasmin)': { kg: 3 }, 'Pâtes de blé (penne, fusilli ou coquillettes)': { kg: 1.8 }, 'Tomates concassées / Coulis': { kg: 2 },
    'Bouillon (volaille ou légumes)': { kg: 0.8 }, 'Lait de coco': { kg: 4.5 }, 'Farine de blé ou fécule': { kg: 1.3 }, 'Vin blanc sec de cuisine': { kg: 3 }, 'Vin rouge de cuisine': { kg: 3 },
    'Gnocchis à poêler': { kg: 6.6 }, 'Quinoa ou semoule complète': { kg: 6 }, 'Tortillas de blé': { u: 0.5 }, 'Lentilles corail': { kg: 4 }, 'Nouilles asiatiques (blé ou soba)': { kg: 6 },
    'Olives (noires ou vertes)': { kg: 10 }, 'Pain de campagne (ou pain de mie)': { u: 0.2 }, 'Riz à risotto (Arborio ou Carnaroli)': { kg: 4 }, 'Haricots rouges (bocal)': { kg: 3.5 },
    'Plaques de lasagne aux œufs': { kg: 4 }, 'Cacahuètes grillées': { kg: 9 }, 'Noix de cajou non salées': { kg: 20 }, 'Pois chiches (bocal)': { kg: 3.5 }, 'Nouilles de riz': { kg: 6 },
    'Maïs doux en boîte': { kg: 3.5 }, 'Thon au naturel (boîte)': { kg: 18 }, 'Épinards surgelés': { kg: 3.2 }, 'Pains burger briochés': { u: 0.5 }, 'Pics à brochette': { u: 0.05 },
    'Haricots noirs (bocal)': { kg: 3.5 }, 'Vermicelles de riz': { kg: 7 }, 'Kit pour fajitas (galettes & épices)': { u: 0.9 }, 'Mélange céréales': { kg: 4 }, 'Polenta': { kg: 2.5 },
    'Marrons cuits': { kg: 12 }, 'Blé (à cuire)': { kg: 2.5 }, 'Huile': { kg: 3 }, 'Nouilles instantanées': { u: 0.6 }, 'Chapelure fine (ou panko)': { kg: 6 },
    // condiments & épices (prix d'une cuillère à soupe)
    'Pâte ou poudre de curry doux': { u: 0.25 }, 'Sauce soja salée': { u: 0.08 }, 'Sauce soja sucrée': { u: 0.08 }, "Huile d'olive vierge extra": { u: 0.12 }, 'Huile de sésame': { u: 0.3 },
    'Herbes de Provence sèches': { u: 0.12 }, 'Miel toutes fleurs': { u: 0.2 }, 'Moutarde à l\'ancienne ou Dijon': { u: 0.08 }, 'Graines de sésame': { u: 0.15 }, 'Paprika doux (ou fumé)': { u: 0.2 },
    'Cumin en poudre': { u: 0.2 }, 'Curcuma en poudre': { u: 0.2 }, 'Concentré de tomate': { u: 0.1 }, 'Pesto alla genovese (pot)': { u: 0.4 }, 'Beurre de cacahuète (pot)': { u: 0.15 },
    'Vinaigre de cidre (ou vin)': { u: 0.05 }, "Mélange d'épices (Fajitas / Chili)": { u: 0.3 }, 'Noix de muscade râpée': { u: 0.6 }, "Piment d'Espelette": { u: 1.0 },
    'Gingembre moulu': { u: 0.25 }, 'Graines de courge': { u: 0.3 }, 'Sauce teriyaki': { u: 0.12 }, 'Câpres': { u: 0.2 }, 'Tabasco': { u: 0.3 }, 'Sauce piment (Sriracha)': { u: 0.15 },
    'Épices mexicaines': { u: 0.25 }, 'Vinaigre balsamique': { u: 0.15 },
    // compléments (articles plus rares)
    'Feuilles de brick': { u: 0.15 }, 'Falafels prêts à dorer': { u: 0.45 }, 'Quenelle nature': { u: 0.9 }, 'Merguez': { u: 1.0 }, 'Côtes de porc': { u: 2.2 },
    'Cordons bleus de volaille': { u: 1.25 }, 'Nems (surgelés)': { u: 0.5 }, 'Pains burger aux graines': { u: 0.5 }, 'Pains bagels': { u: 0.6 }, 'Galettes de sarrasin (blé noir)': { u: 0.4 },
    'Fromage triangle': { u: 0.2 }, 'Kit burrito': { u: 1.0 }, "Filets d'anchois à l'huile": { u: 0.2 }, 'Fromage à trous (tranches)': { u: 0.3 }, 'Ananas au sirop': { u: 0.2 },
    'Clémentine': { u: 0.4 }, 'Fenouil': { u: 1.2 }, 'Grenade': { u: 1.3 }, 'Pâte à pizza': { u: 1.8 }, 'Ananas frais ou au jus': { u: 1.4 }, 'Citrons confits': { u: 0.6 }, 'Aneth frais': { u: 1.0 },
    'Pilons de poulet': { kg: 7.5 }, "Sauté d'agneau en morceaux": { kg: 20 }, 'Échine de porc': { kg: 9 }, 'Endives': { kg: 3.5 }, 'Chou frisé': { kg: 4 }, 'Choux de Bruxelles': { kg: 4 },
    'Ravioli frais ricotta-épinards': { kg: 10 }, 'Ravioli frais aux champignons': { kg: 10 }, 'Ravioles du Dauphiné': { kg: 10 }, 'Pois gourmands': { kg: 8 },
    'Haricots verts en conserve': { kg: 3 }, 'Haricots verts surgelés': { kg: 3.5 }, 'Haricots blancs nature (cuits)': { kg: 3.5 }, 'Lentilles cuites (bocal)': { kg: 3.5 }, 'Lentilles vertes françaises': { kg: 3.5 },
    'Boisson coco': { kg: 2.5 }, "Jus d'orange": { kg: 2.5 }, 'Cidre brut': { kg: 2.5 }, 'Roquefort': { kg: 25 }, 'Gorgonzola AOP': { kg: 15 }, 'Brie fondant': { kg: 12 }, 'Morbier': { kg: 14 },
    "Fourme d'Ambert": { kg: 16 }, "Beaufort d'alpage AOP râpé": { kg: 28 }, 'Fromage à raclette': { kg: 15 }, 'Fromage frais': { kg: 8 }, 'Dés de fromage frais': { kg: 14 },
    'Fromage frais ail & fines herbes': { kg: 14 }, 'Béchamel (brique)': { kg: 4 }, 'Ratatouille cuisinée': { kg: 4 }, 'Tomates séchées': { kg: 18 }, 'Houmous classique': { kg: 8 },
    'Sauce Arrabbiata': { kg: 4.5 }, 'Sauce tikka masala': { kg: 4.5 }, 'Crozets de Savoie': { kg: 4 }, 'Émincé végétal': { kg: 14 }, 'Graines de tournesol': { kg: 7 }, 'Corn flakes': { kg: 4 },
    'Abricots secs moelleux': { kg: 12 }, 'Chipolatas': { u: 0.9 }, 'Boisson amande': { kg: 2 }, 'Boulettes végétales': { kg: 12 }, 'Potatoes surgelées': { kg: 3 },
    'Sucre (en poudre)': { u: 0.1 }, 'Pignons de pin': { u: 1.2 }, 'Purée de sésame (Tahini)': { u: 0.4 }, 'Sauce César': { u: 0.2 }, 'Jus de citron': { u: 0.1 }, "Confit d'oignons": { u: 0.3 },
    'Piment (doux)': { u: 0.2 }, 'Sauce barbecue': { u: 0.15 }, 'Harissa (pâte)': { u: 0.3 }, 'Garam masala': { u: 0.3 }, 'Fond de veau': { u: 0.3 }, "Sauce d'huitre": { u: 0.3 },
    'Mayonnaise': { u: 0.12 }, 'Wasabi': { u: 0.6 }, 'Sauce deluxe': { u: 0.2 }, 'Cannelle en poudre': { u: 0.2 }, 'Ketchup': { u: 0.08 }, 'Vodka': { u: 0.5 },
    'Épices à couscous (ras el hanout)': { u: 0.3 }
  };
  const SPOON = { 'c. à soupe': 1, 'c. à café': 1 / 3, pincee: 1 / 12 };
  // Prix de référence d'une ligne de la liste (null si l'article n'est pas dans la table)
  function refPrice(item) {
    const e = REF_PRICES[item.name];
    if (!e) return null;
    const u = item.baseUnit || item.unit;
    const q = Number(item.quantity) || 0;
    const r2 = (v) => Math.round(v * 100) / 100;
    if (u === 'g' || u === 'ml') return e.kg ? r2((q / 1000) * e.kg) : null;
    if (!e.u) return null;
    return r2(q * e.u * (SPOON[u] != null ? SPOON[u] : 1));
  }
  // Repli par rayon quand l'article n'est pas dans la table (€/kg et €/pièce)
  const PRICE_KG = { 'fruits-legumes': 3.5, boucherie: 13, poissonnerie: 24, cremerie: 13, epicerie: 4.5 };
  const PRICE_PIECE = { 'fruits-legumes': 0.8, boucherie: 2.5, poissonnerie: 3.5, cremerie: 1.5, epicerie: 1.0 };
  function estimateItemPrice(item) {
    const ref = refPrice(item);
    if (ref != null) return Math.max(0.05, ref);
    const q = Number(item.quantity) || 0;
    const u = item.baseUnit || item.unit;
    if (u === 'g' || u === 'ml') return Math.max(0.2, (q / 1000) * (PRICE_KG[item.rayon] || 5));
    if (u === 'c. à soupe' || u === 'c. à café' || u === 'pincee') return 0.15;
    if (u === 'oeuf') return q * 0.32;
    return Math.max(0.2, q * (PRICE_PIECE[item.rayon] || 1));
  }
  function estimateCost(items) { return Math.round(items.reduce((s, i) => s + estimateItemPrice(i), 0)); }
  // ---------------------------------------------------------------- Équilibre de la semaine (par repas, pour une portion)
  // meals : [{ kcal, protein, veg, type }] (veg = grammes de fruits/légumes par portion)
  const NUTRI_TARGET = { protein: 25, veg: 200 }; // repères par repas (dîner) : 25 g de protéines, 200 g de légumes
  function weekSummary(meals) {
    const n = meals.length;
    if (!n) return { count: 0 };
    const avg = (k) => Math.round(meals.reduce((s, m) => s + (m[k] || 0), 0) / n);
    const types = {};
    meals.forEach((m) => { const t = m.type === 'vegetarien' ? 'vege' : m.type; types[t] = (types[t] || 0) + 1; });
    return {
      count: n, kcal: avg('kcal'), protein: avg('protein'), veg: avg('veg'), types,
      lowVeg: meals.filter((m) => m.veg < 100).length, lowProtein: meals.filter((m) => m.protein < 15).length,
      target: NUTRI_TARGET
    };
  }

  // ---------------------------------------------------------------- Dates limites (reste à consommer)
  function shelfDays(name, rayon) {
    const n = norm(name);
    if (/herbe|coriandre|persil|basilic|ciboulette|menthe|aneth|salade|mache|roquette|epinard|champignon|framboise|fraise|myrtille/.test(n)) return 4;
    if (/pomme de terre|oignon|ail\b|echalote|carotte|courge|potimarron|butternut|patate|citron|orange|pomme|clementine|banane/.test(n)) return /banane|clementine/.test(n) ? 6 : 21;
    if (/poisson|saumon|cabillaud|crevette|thon frais|saint.?jacques/.test(n)) return 2;
    if (/poulet|boeuf|porc|dinde|veau|agneau|canard|steak|hache|saucisse|merguez|chipolata|cordon|escalope|filet|pilon|cuisse|bavette/.test(n)) return 3;
    if (/lardon|jambon|chorizo|bacon/.test(n)) return 6;
    if (/yaourt|kefir/.test(n)) return 15;
    if (/oeuf/.test(n)) return 25;
    if (/lait|creme/.test(n)) return 7;
    if (/fromage|comte|emmental|parmesan|cheddar|feta|mozzarella|brie|camembert|chevre|ricotta|burrata|reblochon/.test(n)) return /ricotta|burrata|mozzarella|chevre frais|feta/.test(n) ? 7 : 14;
    if (/beurre/.test(n)) return 30;
    if (/pain|brioche|wrap|tortilla|bun/.test(n)) return 5;
    return { 'fruits-legumes': 6, boucherie: 3, poissonnerie: 2, cremerie: 10, epicerie: 120 }[rayon] || 14;
  }

  // Dépenses : moyenne par ticket et par semaine (la période couvre un intervalle de plus que le premier-dernier ticket)
  function budgetStats(trips) {
    const t = (trips || []).filter((x) => x && x.total > 0 && Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
    if (!t.length) return { count: 0, avgTicket: 0, perWeek: 0, last: [] };
    const sum = t.reduce((s, x) => s + x.total, 0);
    let perWeek = 0;
    if (t.length >= 2) {
      const span = t[t.length - 1].t - t[0].t;
      const weeks = (span + span / (t.length - 1)) / (7 * 86400000);
      if (span >= 5 * 86400000 && weeks > 0) perWeek = sum / weeks;
    }
    return { count: t.length, avgTicket: sum / t.length, perWeek, last: t.slice(-12) };
  }
  // Stock dégressif : retire ce qu'une recette consomme ; renvoie les articles épuisés (à racheter)
  function consumeStock(stock, used) {
    const out = {}; Object.keys(stock || {}).forEach((k) => { out[k] = { ...stock[k] }; });
    const depleted = [];
    (used || []).forEach((u) => {
      const e = out[u.id];
      if (!e || e.unit !== u.unit || !(u.qty > 0)) return;
      e.qty = Math.round((e.qty - u.qty) * 10) / 10;
      if (e.qty <= 0) { delete out[u.id]; depleted.push(u.id); }
    });
    return { stock: out, depleted };
  }
  // « 800 g », « 1,5 kg », « 2 L », « 6 » → { qty, unit } (g, ml ou piece)
  function parseStockInput(text) {
    const m = String(text || '').trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)?$/);
    if (!m) return null;
    let q = parseFloat(m[1]); const u = m[2] || '';
    if (!(q > 0)) return null;
    if (u === 'kg') return { qty: q * 1000, unit: 'g' };
    if (u === 'g') return { qty: q, unit: 'g' };
    if (u === 'l') return { qty: q * 1000, unit: 'ml' };
    if (u === 'cl') return { qty: q * 10, unit: 'ml' };
    if (u === 'ml') return { qty: q, unit: 'ml' };
    return { qty: q, unit: 'piece' };
  }
  // Budget du panier : prix réels appris sur vos tickets quand on les connaît, estimation × coefficient sinon
  function estimateBudget(items, factor, learned) {
    let total = 0, real = 0;
    (items || []).forEach((i) => {
      const lp = learned ? learned(i) : null;
      if (lp != null) { total += lp; real++; } else total += estimateItemPrice(i) * (factor || 1);
    });
    return { cost: Math.round(total), total, real, count: (items || []).length };
  }
  // Coefficient « vos vrais prix » : médiane (ticket réel / estimation) des derniers tickets, borné pour rester prudent
  function priceFactor(trips) {
    // t.cal : prix réel des seules lignes reconnues d'un ticket lu (comparé à l'estimation de ces lignes)
    const r = (trips || []).filter((t) => t && t.est > 0 && (t.cal || t.total) > 0).slice(-5).map((t) => (t.cal || t.total) / t.est).sort((a, b) => a - b);
    if (r.length < 2) return 1; // pas assez d'historique : estimation brute
    const mid = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2;
    return Math.max(0.5, Math.min(2, mid));
  }


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
    norm, SEASONS, STYLES, classifyRecipe, classifySeasons, classifyStyles,
    recipeSeasons, recipeStyles, currentSeason,
    containsPork, containsLactose, isOnePan, matchesFridge, parseFridge,
    recipeMatchesFilters, pickMenu, RECENT_DAYS,
    SPICES, SPICES_BASIC, SPICES_FULL, BASICS, splitGroceries, suggestStaples, STAPLE_SUGGESTIONS, rankByLeftovers, estimateItemPrice, refPrice, REF_PRICES, estimateCost, estimateBudget, priceFactor, budgetStats, weekSummary, shelfDays, consumeStock, parseStockInput,
    encryptPayload, decryptPayload, cryptoAvailable,
    weatherMood, weatherFit, fetchWeather, notifTopic, buildNotification, syncAgeText
  };
})(typeof window !== 'undefined' ? window : globalThis);
