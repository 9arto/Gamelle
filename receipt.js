// Lecture d'un ticket de caisse (texte issu de l'OCR) : total, lignes d'articles, rapprochement avec les articles
// de la liste de courses, carnet de prix « réels ». Logique pure, testée dans tests/receipt.test.js.
// Aucune donnée ne quitte le téléphone : l'OCR tourne sur l'appareil (voir ticket.js).
(function (root) {
  const norm = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // « 12 , 40 » / « 12.40 » / « 12,4O » (O lu à la place de 0) → 12.4
  function toAmount(a, b) { return Math.round((parseInt(a, 10) + parseInt(b, 10) / 100) * 100) / 100; }
  const MONEY = /(-?)(\d{1,4})\s?[.,]\s?(\d{2})(?!\d)/g;
  function amounts(line) {
    const out = [];
    let m; MONEY.lastIndex = 0;
    while ((m = MONEY.exec(line))) {
      // « - » collé au nombre et précédé d'un espace / début de ligne / « € » = montant négatif (remise, tare)
      const neg = m[1] === '-' && (m.index === 0 || /[\s€x%]/.test(line[m.index - 1]));
      out.push({ v: toAmount(m[2], m[3]), i: m.index, end: m.index + m[0].length, neg });
    }
    return out;
  }
  // Corrige les confusions classiques de l'OCR à l'intérieur des nombres (O→0, l/I→1, S→5)
  function fixDigits(line) {
    return line.replace(/\b[\dOolIS]{1,4}\s?[.,]\s?[\dOolIS]{2,3}\b/g, (t) => t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1').replace(/S/g, '5'));
  }

  const NOT_ITEM = /\b(total|sous.?total|tva|t\.v\.a|carte|cb|visa|mastercard|especes?|rendu|monnaie|remise|reduction|fidelite|cagnotte|points?|siret|tel|www|merci|ticket|caisse|caissier|facture|a payer|bancaire|sans contact|montant|economie|articles?|nb|n°|date|heure|bonjour|bienvenue|retrait|ean|tare|offre|promo|avantage|coupon|prix)\b/;
  const TOTAL_LINE = /\b(total|a payer|net a payer|montant)\b/;
  const TOTAL_EXCL = /sous.?total|tva|article|remise|economie|reduction|fidelite|cagnotte/;
  const PAY_LINE = /\b(cb|carte bancaire|carte|especes?|cb sans contact|visa|mastercard)\b/;

  const WEIGHT = /(\d+\s?[.,]\s?\d{1,3})\s?kg/;
  const KG_PRICE = /(\d+\s?[.,]\s?\d{2})\s?(?:€|eur|euros)?\s?\/\s?kg/;
  const num = (t) => parseFloat(String(t).replace(/\s/g, '').replace(',', '.'));

  // Rayons de caisse (tickets Grand Frais : « LE FROMAGER », « LES VERGERS », « LDGF », « …DIS ») → rayon de l'application
  const SECTIONS = [
    [/fromag|cremerie|laitier|\bcremier/, 'cremerie'],
    [/verger|primeur|fruit|legume|marche/, 'fruits-legumes'],
    [/ldgf|bouch|volaille|charcut|traiteur|viande|\blsb\b/, 'boucherie'],
    [/poisson|maree|\blpm\b/, 'poissonnerie'],
    [/\bdis\b|[a-z]dis$|epicer|cave|boulang|\bepi\b/, 'epicerie'],
    [/\bgie\b|\bsac\b/, 'autres']
  ];
  function sectionRayon(label) {
    const n = norm(label).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [re, r] of SECTIONS) if (re.test(n)) return r;
    return null;
  }

  function cleanLabel(s) {
    return s.replace(/\b\d{3,}\s?-\s?/g, ' ').replace(/[€*#_|]+/g, ' ').replace(/\b(eur|euros?)\b/gi, ' ')
      .replace(/\s+[A-C]$/, '').replace(/\s+/g, ' ').replace(/^[\s.\-:]+|[\s.\-:]+$/g, '').trim();
  }
  const MONTHS = { jan: 1, fev: 2, feb: 2, mar: 3, avr: 4, apr: 4, mai: 5, may: 5, jun: 6, jui: 7, jul: 7, aou: 8, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  // « CHEDDAR RAPE 140G », « POMME SSA 4X100G », « FROMAGE GREC 180G » → poids/volume du paquet en g (ou ml)
  function packSize(label) {
    const n = norm(label);
    const m = n.match(/(?:(\d{1,2})\s?x\s?)?(\d{2,4}(?:[.,]\d)?)\s?(kg|g|ml|cl|l)\b/) || n.match(/()(\d(?:[.,]\d)?)\s?(kg|l)\b/); // « 1 L », « 1,5 kg »
    if (!m) return null;
    const v = parseFloat(m[2].replace(',', '.')) * ({ kg: 1000, g: 1, l: 1000, cl: 10, ml: 1 }[m[3]]);
    return Math.round(v * (m[1] ? parseInt(m[1], 10) : 1));
  }

  // → { total, itemsSum, lines:[{label, price, qty, kg, perKg, section}], sections:{rayon:€}, date }
  // Gère : prix avec « € » et code TVA, articles pesés (« 0.190 kg x 17.99 €/kg », tare), remises (« Offre … -1.10€ »),
  // rayons de caisse et leurs sous-totaux, total sur la ligne suivante (« 49 TOTAL » puis « 110.25€ »).
  function parseReceipt(text) {
    const raw = String(text || '').split(/\r?\n/).map((l) => fixDigits(l.replace(/\t/g, ' ').trim())).filter(Boolean);
    const lines = [];
    const sections = {};
    let total = null, totalWeak = null, afterTotal = false, wantTotal = false, section = null;
    let pendingWeight = null; // ligne « 1,240 kg x 9,90 €/kg » vue avant l'article
    const flat = raw.join(' ');
    const dm = flat.match(/\b(\d{2})\s?[\/\-]\s?(\d{2})\s?[\/\-]\s?(\d{2,4})\b/) || flat.match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
    const dn = norm(flat).match(/\b(\d{1,2})\s?[\/.\-]\s?([a-z]{3})\s?[\/.\-]\s?(\d{2,4})\b/);
    let date = null;
    if (dn && MONTHS[dn[2]]) date = `${dn[1].padStart(2, '0')}/${String(MONTHS[dn[2]]).padStart(2, '0')}/${dn[3]}`;
    else if (dm) date = dm[0].replace(/\s/g, '');

    raw.forEach((line) => {
      const n = norm(line);
      const am = amounts(line);
      // montant seul sur la ligne qui suit « TOTAL »
      if (wantTotal && am.length && !am[0].neg && n.replace(/[^a-z]/g, '').length < 2) { total = am[am.length - 1].v; wantTotal = false; return; }
      // 1. total
      if (!afterTotal && TOTAL_LINE.test(n) && !TOTAL_EXCL.test(n)) {
        afterTotal = true;
        if (am.length) total = Math.max(total || 0, am[am.length - 1].v); else wantTotal = true;
        return;
      }
      if (am.length && PAY_LINE.test(n) && !/rendu|monnaie|fidelite|cagnotte/.test(n) && am[am.length - 1].v > 0) { totalWeak = Math.max(totalWeak || 0, am[am.length - 1].v); afterTotal = true; return; }
      // sous-totaux par rayon de caisse, imprimés sous le total
      if (afterTotal) {
        const r = am.length && sectionRayon(line);
        if (r) sections[r] = Math.round(((sections[r] || 0) + am[am.length - 1].v) * 100) / 100;
        return;
      }
      // 2. en-tête de rayon de caisse (ligne sans prix)
      if (!am.length) { const r = sectionRayon(line); if (r && /^[A-ZÀ-Ý0-9 '\-]+$/.test(line)) section = r; return; }
      // 3. remises / tare : montant négatif → s'applique à l'article précédent
      const last = am[am.length - 1];
      if (last.neg) {
        const prev = lines[lines.length - 1];
        if (prev) prev.price = Math.round((prev.price - last.v) * 100) / 100;
        return;
      }
      if (/^\s*tare\b/.test(n)) return;
      // 4. ligne de poids (sans libellé)
      const w = n.match(WEIGHT);
      if (w) {
        const lettersOnly = n.replace(WEIGHT, '').replace(KG_PRICE, '').replace(/[^a-z]/g, '').replace(/^(x|eur|euros?)+$/, '');
        if (lettersOnly.length < 3) {
          const kp = n.match(KG_PRICE);
          const info = { kg: num(w[1]), perKg: kp ? num(kp[1]) : null };
          const prev = lines[lines.length - 1];
          // « article puis poids » : on rattache au précédent s'il est cohérent
          if (prev && prev.kg == null && info.perKg && Math.abs(info.kg * info.perKg - prev.price) <= Math.max(0.15, prev.price * 0.06)) { prev.kg = info.kg; prev.perKg = info.perKg; }
          else pendingWeight = info;
          return;
        }
      }
      // « 2 x 0,89 » seul : quantité de l'article précédent
      const qOnly = n.match(/^\s*(\d{1,2})\s?[x×]\s?(\d+\s?[.,]\s?\d{2})\s*(?:€|eur)?\s*$/);
      if (qOnly && lines.length) { const prev = lines[lines.length - 1]; const q = parseInt(qOnly[1], 10); if (q > 1 && q <= 20) prev.qty = q; return; }
      // 5. article : un libellé et un prix (suivi éventuellement d'un code TVA)
      if (NOT_ITEM.test(n)) return;
      let label = line.slice(0, last.i);
      let qty = 1, kg = null, perKg = null;
      const qx = label.match(/^\s*(\d{1,2})\s?[x×]\s+/i); // « 3 x LAIT » (et non « 8X12 », « 4X100G »)
      if (qx) qty = parseInt(qx[1], 10) || 1;
      const lw = norm(label).match(WEIGHT);
      if (lw) kg = num(lw[1]);
      label = cleanLabel(label.replace(qx ? qx[0] : '', ' ').replace(WEIGHT, ' ').replace(KG_PRICE, ' '));
      if (norm(label).replace(/[^a-z]/g, '').length < 3) return;
      if (pendingWeight && kg == null) { kg = pendingWeight.kg; perKg = pendingWeight.perKg; }
      pendingWeight = null;
      lines.push({ label, price: last.v, qty, kg, perKg, pack: packSize(label), section });
    });

    if (total == null) total = totalWeak;
    const itemsSum = Math.round(lines.reduce((s, l) => s + l.price, 0) * 100) / 100;
    if (total == null && lines.length) total = itemsSum;
    return { total, itemsSum, lines: lines.filter((l) => l.price > 0), sections, date };
  }

  // ---- rapprochement avec les articles de la liste de courses
  const STOP = new Set(['frais', 'fraiche', 'fraiches', 'bio', 'nature', 'extra', 'fin', 'fins', 'pour', 'avec', 'sans', 'doux', 'les', 'des', 'aux', 'de', 'du', 'la', 'le', 'et', 'ou', 'en', 'sur', 'kg', 'piece', 'pieces', 'filet', 'filets', 'fromage', 'pain', 'vert', 'verte', 'vertes', 'pur', 'jus', 'pomme', 'pommes']);
  const tokens = (s) => norm(s).replace(/\(.*?\)/g, ' ').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/(s|x)$/, ''));

  // Abréviations de caisse (libellés tronqués à 18-20 caractères) → article de l'application. null = produit sans équivalent
  // dans les recettes (on ne devine pas). Première règle qui correspond gagne ; si l'article visé n'existe pas, on passe.
  const RECEIPT_RULES = [
    [/^pdt\b|pommes? de terre|\bbintje|\bcharlotte\b/, 'Pommes de terre fraîches'],
    [/poulet.*(filet|pave|escalope|blanc)|filets? de poulet/, 'Filets de poulet frais'],
    [/lardon/, 'Lardons fumés pur porc'], [/chorizo/, 'Chorizo en tranches'],
    [/creme fraiche/, 'Crème fraîche (épaisse ou liquide)'], [/\boeufs?\b/, 'Œufs frais'],
    [/courgette/, 'Courgettes fraîches'], [/tomate(?!s? (concass|pelee))/, 'Tomates fraîches'], [/poivron/, 'Poivrons (rouges ou tricolores)'],
    [/coriandre/, 'Coriandre fraîche'], [/persil/, 'Persil plat frais'], [/basilic/, 'Basilic frais'], [/ciboulette/, 'Ciboulette fraîche'],
    [/batavia|laitue|salade|mache|roquette/, 'Salade verte (mâche ou roquette)'],
    [/pain burger|buns?\b/, 'Pains burger briochés'], [/\bwrap|tortilla/, 'Tortillas de blé'],
    [/fromage grec|\bfeta\b/, 'Feta AOP'], [/cheddar.*(tra\b|tranche|mature|affine)/, 'Tranches de cheddar affiné'], [/cheddar/, 'Cheddar râpé'],
    [/\bcomte\b/, 'Comté AOP râpé'], [/beurre(?! de cacahuete)/, 'Beurre (doux ou demi-sel)'], [/gnocchi/, 'Gnocchis à poêler'],
    [/yaourt/, 'Yaourts (nature ou aux fruits)'], [/\blait\b(?! de coco)/, 'Lait (demi-écrémé ou entier)'], [/lait de coco/, 'Lait de coco'],
    [/oignon(?!s? (rouge|nouveau))/, 'Oignons jaunes'], [/carotte/, 'Carottes fraîches'], [/champignon/, 'Champignons de Paris frais'],
    [/\bail\b/, "Gousses d'ail"], [/citron vert/, 'Citrons verts'], [/citron/, 'Citrons jaunes'], [/avocat/, 'Avocats mûrs'],
    [/parmesan|grana/, 'Parmesan AOP râpé'], [/mozzarella|mozza/, 'Mozzarella (boule ou râpée)'],
    [/saumon.*(pave|frais|filet)/, 'Pavés de saumon frais'], [/crevette/, 'Crevettes cuites décortiquées'],
    // produits sans équivalent dans les recettes (évite un faux rapprochement par mots)
    [/\bjus\b/, null], [/\bbanane/, null], [/\bpommes?\b(?! de terre)/, null], [/myrtille|framboise|fraise|cranberr|raisin|poire|kiwi|mangue/, null], [/tartiflett|raclette|fondue|poitrine/, null]
  ];

  // names : tableau des noms d'articles connus ; normalizeFn : normalizeIngredient de l'app
  function matchArticle(label, names, normalizeFn) {
    const known = new Set(names);
    const nl = norm(label).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [re, target] of RECEIPT_RULES) {
      if (!re.test(nl)) continue;
      if (target === null) return null;
      if (known.has(target)) return target;
    }
    try {
      const n = normalizeFn({ name: label.toLowerCase() });
      if (n && known.has(n.name)) return n.name;
    } catch (e) { /* on tente le rapprochement par mots */ }
    const words = new Set(tokens(label));
    if (!words.size) return null;
    let best = null, bestScore = 0;
    names.forEach((nm) => {
      const t = tokens(nm);
      const score = t.filter((w) => words.has(w)).length;
      if (score > bestScore || (score === bestScore && score > 0 && best && nm.length < best.length)) { best = nm; bestScore = score; }
    });
    return bestScore >= 1 ? best : null;
  }

  // ---- carnet de prix réels : { id: { kg, u, n, t } } (kg = €/kg ou €/L, u = €/pièce)
  function updatePriceBook(book, items, now) {
    const out = { ...(book || {}) };
    items.forEach((it) => {
      if (!it.id || !(it.price > 0)) return;
      const cur = { ...(out[it.id] || { n: 0 }) };
      const mix = (old, v) => (old ? Math.round((old * 0.4 + v * 0.6) * 100) / 100 : Math.round(v * 100) / 100);
      if (it.perKg > 0) cur.kg = mix(cur.kg, it.perKg); // prix au kilo imprimé sur le ticket : exact (la tare est déjà déduite)
      else if (it.kg > 0) cur.kg = mix(cur.kg, it.price / it.kg);
      else if (it.pack > 0) cur.kg = mix(cur.kg, it.price / ((it.pack * Math.max(1, it.qty || 1)) / 1000)); // « 140G » dans le libellé
      else cur.u = mix(cur.u, it.price / Math.max(1, it.qty || 1));
      cur.n = (cur.n || 0) + 1; cur.t = now;
      out[it.id] = cur;
    });
    const keys = Object.keys(out);
    if (keys.length > 400) keys.sort((a, b) => (out[a].t || 0) - (out[b].t || 0)).slice(0, keys.length - 400).forEach((k) => delete out[k]);
    return out;
  }

  // Prix appris pour une ligne de la liste (null si on ne sait pas)
  function learnedPrice(item, book) {
    const b = book && book[item.id];
    if (!b) return null;
    const unit = item.baseUnit || item.unit;
    const q = Number(item.quantity) || 0;
    const r2 = (v) => Math.round(v * 100) / 100;
    if ((unit === 'g' || unit === 'ml') && b.kg) return r2((q / 1000) * b.kg);
    if (unit !== 'g' && unit !== 'ml' && b.u) return r2(q * b.u);
    return null;
  }

  // ---- prix des produits courants (« Bananes ×7 ») d'après le carnet de prix
  const PIECE_G = { banane: 150, pomme: 180, poire: 180, orange: 200, clementine: 80, kiwi: 80, citron: 100, avocat: 200, yaourt: 125, oeuf: 60, tomate: 150, carotte: 120, concombre: 300, peche: 150, abricot: 50 };
  function singular(w) { return w.replace(/(s|x)$/, ''); }
  // Clé du carnet de prix qui correspond à un nom (mêmes mots, pluriel ignoré) : la plus proche d'abord
  function findPriceKey(name, book) {
    const want = tokens(name).map(singular);
    if (!want.length) return null;
    let best = null, bestScore = 0;
    Object.keys(book || {}).forEach((k) => {
      const have = tokens(k).map(singular);
      const common = want.filter((w) => have.includes(w)).length;
      if (!common) return;
      const score = common / Math.max(want.length, have.length) + common;
      if (score > bestScore) { best = k; bestScore = score; }
    });
    return best;
  }
  // Prix réel d'un produit courant (quantité × prix appris) ; null s'il n'a jamais été vu sur un ticket
  function staplePrice(staple, book) {
    const key = findPriceKey(staple.name, book);
    if (!key) return null;
    const e = book[key], qty = Math.max(1, Number(staple.qty) || 1);
    if (e.u) return Math.round(qty * e.u * 100) / 100;
    if (e.kg) {
      const pack = packSize(staple.name);
      const word = tokens(staple.name).map(singular).find((w) => PIECE_G[w]);
      const grams = pack || (word ? PIECE_G[word] : 150);
      return Math.round(qty * (grams / 1000) * e.kg * 100) / 100;
    }
    return null;
  }

  // Totaux par rayon d'un ticket : { rayon: € } (les lignes non reconnues vont dans « autres »)
  function rayonTotals(matched) {
    const r = {};
    matched.forEach((l) => { const k = l.rayon || 'autres'; r[k] = Math.round(((r[k] || 0) + l.price) * 100) / 100; });
    return r;
  }

  root.GamelleReceipt = { parseReceipt, packSize, findPriceKey, staplePrice, matchArticle, updatePriceBook, learnedPrice, rayonTotals, amounts };
})(typeof window !== 'undefined' ? window : globalThis);
