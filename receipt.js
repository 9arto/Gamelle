// Lecture d'un ticket de caisse (texte issu de l'OCR) : total, lignes d'articles, rapprochement avec les articles
// de la liste de courses, carnet de prix « réels ». Logique pure, testée dans tests/receipt.test.js.
// Aucune donnée ne quitte le téléphone : l'OCR tourne sur l'appareil (voir ticket.js).
(function (root) {
  const norm = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // « 12 , 40 » / « 12.40 » / « 12,4O » (O lu à la place de 0) → 12.4
  function toAmount(a, b) { return Math.round((parseInt(a, 10) + parseInt(b, 10) / 100) * 100) / 100; }
  const MONEY = /(\d{1,4})\s?[.,]\s?(\d{2})(?!\d)/g;
  function amounts(line) {
    const out = [];
    let m; MONEY.lastIndex = 0;
    while ((m = MONEY.exec(line))) out.push({ v: toAmount(m[1], m[2]), i: m.index, end: m.index + m[0].length });
    return out;
  }
  // Corrige les confusions classiques de l'OCR à l'intérieur des nombres (O→0, l/I→1, S→5)
  function fixDigits(line) {
    return line.replace(/\b[\dOolIS]{1,4}\s?[.,]\s?[\dOolIS]{2,3}\b/g, (t) => t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1').replace(/S/g, '5'));
  }

  const NOT_ITEM = /\b(total|sous.?total|tva|t\.v\.a|carte|cb|visa|mastercard|especes?|rendu|monnaie|remise|reduction|fidelite|cagnotte|points?|siret|tel|www|merci|ticket|caisse|caissier|facture|a payer|bancaire|sans contact|montant|economie|articles?|nb|n°|date|heure|bonjour|bienvenue|retrait|ean)\b/;
  const TOTAL_LINE = /\b(total|a payer|net a payer|montant)\b/;
  const TOTAL_EXCL = /sous.?total|tva|article|remise|economie|reduction|fidelite|cagnotte/;
  const PAY_LINE = /\b(cb|carte bancaire|carte|especes?|cb sans contact|visa|mastercard)\b/;

  const WEIGHT = /(\d+\s?[.,]\s?\d{1,3})\s?kg/;
  const KG_PRICE = /(\d+\s?[.,]\s?\d{2})\s?(?:€|eur|euros)?\s?\/\s?kg/;

  function cleanLabel(s) {
    return s.replace(/\b\d+\s?[x×]\b/gi, ' ').replace(/[€*#_|]+/g, ' ').replace(/\b(eur|euros?)\b/gi, ' ')
      .replace(/\s+[A-C]$/, '').replace(/\s+/g, ' ').replace(/^[\s.\-:]+|[\s.\-:]+$/g, '').trim();
  }

  // → { total, lines:[{label, price, qty, kg}], date }
  function parseReceipt(text) {
    const raw = String(text || '').split(/\r?\n/).map((l) => fixDigits(l.replace(/\t/g, ' ').trim())).filter(Boolean);
    const lines = [];
    let total = null, totalWeak = null;
    let pendingWeight = null; // ligne « 1,240 kg x 9,90 €/kg » vue avant l'article
    const dateMatch = raw.join(' ').match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})\b/);

    raw.forEach((line) => {
      const n = norm(line);
      const am = amounts(line);
      // 1. total
      if (am.length && TOTAL_LINE.test(n) && !TOTAL_EXCL.test(n)) { total = Math.max(total || 0, am[am.length - 1].v); return; }
      if (am.length && PAY_LINE.test(n) && !/rendu|monnaie|fidelite|cagnotte/.test(n) && am[am.length - 1].v > 0) { totalWeak = Math.max(totalWeak || 0, am[am.length - 1].v); return; }
      // 2. ligne de poids seule (sans libellé)
      const w = n.match(WEIGHT);
      if (w) {
        const lettersOnly = n.replace(WEIGHT, '').replace(KG_PRICE, '').replace(/[^a-z]/g, '').replace(/^(x|eur|euros?)+$/, '');
        if (lettersOnly.length < 3) {
          const kg = parseFloat(w[1].replace(/\s/g, '').replace(',', '.'));
          const kp = n.match(KG_PRICE);
          const info = { kg, perKg: kp ? parseFloat(kp[1].replace(/\s/g, '').replace(',', '.')) : null };
          const prev = lines[lines.length - 1];
          // « article puis poids » : on rattache au précédent s'il est cohérent
          if (prev && prev.kg == null && info.perKg && Math.abs(info.kg * info.perKg - prev.price) <= Math.max(0.15, prev.price * 0.06)) prev.kg = info.kg;
          else pendingWeight = info;
          return;
        }
      }
      // « 2 x 0,89 » seul : quantité de l'article précédent
      const qOnly = n.match(/^\s*(\d{1,2})\s?[x×]\s?(\d+\s?[.,]\s?\d{2})\s*(?:€|eur)?\s*$/);
      if (qOnly && lines.length) { const prev = lines[lines.length - 1]; const q = parseInt(qOnly[1], 10); if (q > 1 && q <= 20) prev.qty = q; return; }
      // 3. article : un libellé et un prix en fin de ligne
      if (!am.length || NOT_ITEM.test(n)) return;
      const last = am[am.length - 1];
      let label = line.slice(0, last.i);
      let qty = 1, kg = null;
      const qx = label.match(/(?:^|\s)(\d{1,2})\s?[x×]\s?(\d+\s?[.,]\s?\d{2})?/i);
      if (qx) { qty = parseInt(qx[1], 10) || 1; }
      const lw = norm(label).match(WEIGHT);
      if (lw) kg = parseFloat(lw[1].replace(/\s/g, '').replace(',', '.'));
      label = cleanLabel(label.replace(WEIGHT, ' ').replace(KG_PRICE, ' '));
      if (norm(label).replace(/[^a-z]/g, '').length < 3) return;
      if (pendingWeight && kg == null) { kg = pendingWeight.kg; }
      pendingWeight = null;
      lines.push({ label, price: last.v, qty, kg });
    });

    if (total == null) total = totalWeak;
    const itemsSum = Math.round(lines.reduce((s, l) => s + l.price, 0) * 100) / 100;
    if (total == null && lines.length) total = itemsSum;
    return { total, itemsSum, lines, date: dateMatch ? dateMatch[0] : null };
  }

  // ---- rapprochement avec les articles de la liste de courses
  const STOP = new Set(['frais', 'fraiche', 'fraiches', 'bio', 'nature', 'extra', 'fin', 'fins', 'pour', 'avec', 'sans', 'doux', 'les', 'des', 'aux', 'de', 'du', 'la', 'le', 'et', 'ou', 'en', 'sur', 'kg', 'piece', 'pieces']);
  const tokens = (s) => norm(s).replace(/\(.*?\)/g, ' ').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/(s|x)$/, ''));

  // names : tableau des noms d'articles connus ; normalizeFn : normalizeIngredient de l'app
  function matchArticle(label, names, normalizeFn) {
    const known = new Set(names);
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
      if (it.kg > 0) cur.kg = mix(cur.kg, it.price / it.kg);
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

  // Totaux par rayon d'un ticket : { rayon: € } (les lignes non reconnues vont dans « autres »)
  function rayonTotals(matched) {
    const r = {};
    matched.forEach((l) => { const k = l.rayon || 'autres'; r[k] = Math.round(((r[k] || 0) + l.price) * 100) / 100; });
    return r;
  }

  root.GamelleReceipt = { parseReceipt, matchArticle, updatePriceBook, learnedPrice, rayonTotals, amounts };
})(typeof window !== 'undefined' ? window : globalThis);
