// Ticket de caisse (photo → lecture OCR sur le téléphone → relecture → prix réels) et lecture des codes-barres.
// Script classique chargé avant app.js (portée globale partagée : state, GL, GR, esc, showToast… viennent de app.js).
// Les bibliothèques lourdes (vendor/) ne sont téléchargées qu'à la première utilisation, puis gardées en cache.

const loadedScripts = {};
function loadScriptOnce(src) {
  if (!loadedScripts[src]) {
    loadedScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => { delete loadedScripts[src]; reject(new Error('chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
  }
  return loadedScripts[src];
}

// ---------------------------------------------------------------------------
// Codes-barres (ZXing, car iOS/Safari n'a pas BarcodeDetector)
// ---------------------------------------------------------------------------
function validBarcode(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (![8, 12, 13].includes(c.length)) return false;
  const d = c.split('').map(Number);
  const check = d.pop();
  let sum = 0;
  d.reverse().forEach((v, i) => { sum += v * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

let zxingReader = null;
async function getZxingReader() {
  if (zxingReader) return zxingReader;
  await loadScriptOnce('vendor/zxing.min.js');
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  zxingReader = new ZXing.MultiFormatReader();
  zxingReader.setHints(hints);
  return zxingReader;
}
// Lit un code-barres sur un canvas (null si rien de valide)
async function decodeBarcodeCanvas(canvas) {
  const reader = await getZxingReader();
  try {
    const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas)));
    const res = reader.decode(bmp);
    const text = res && res.getText ? res.getText() : '';
    return validBarcode(text) ? text : null;
  } catch (e) { return null; } // NotFoundException : pas de code dans cette image
}
// Photo d'un code-barres (repli quand la caméra en direct n'est pas disponible)
async function decodeBarcodeFile(file) {
  const bmp = await createImageBitmap(file);
  for (const maxW of [1600, 1000, 700]) {
    const k = Math.min(1, maxW / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const code = await decodeBarcodeCanvas(c);
    if (code) return code;
  }
  return null;
}

// ---------------------------------------------------------------------------
// OCR du ticket (Tesseract.js, hébergé avec le site : rien n'est envoyé sur Internet)
// ---------------------------------------------------------------------------
// Image → niveaux de gris, contraste étiré, largeur limitée (la lecture est plus fiable et plus rapide)
async function prepareReceiptCanvas(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1500 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
  const total = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.25) { hi = v; break; } } // le papier est clair : on prend le fond
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.max(0, Math.min(255, Math.round(((d[i] - lo) / span) * 255)));
    d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
async function ocrReceipt(canvas, onProgress) {
  await loadScriptOnce('vendor/tesseract.min.js');
  const abs = (p) => new URL(p, location.href).href;
  const worker = await Tesseract.createWorker('fra', 1, {
    workerPath: abs('vendor/worker.min.js'),
    corePath: abs('vendor/tesseract-core-lstm.wasm.js'),
    langPath: abs('vendor/lang'),
    workerBlobURL: false, cacheMethod: 'none', gzip: true,
    logger: (m) => { if (onProgress && m) onProgress(m); }
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally { try { await worker.terminate(); } catch (e) { /* déjà arrêté */ } }
}

// ---------------------------------------------------------------------------
// Ticket au format PDF (e-ticket de l'application du magasin) : le texte est lu directement, sans OCR
// ---------------------------------------------------------------------------
async function openPdf(file) {
  await loadScriptOnce('vendor/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', location.href).href;
  return pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}
// Texte d'un PDF : lignes reconstituées d'après la position verticale des morceaux de texte
async function pdfToText(file) {
  const doc = await openPdf(file);
  const out = [];
  for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows = {};
    tc.items.forEach(it => { if (!it.str || !it.str.trim()) return; const k = Math.round(it.transform[5] / 3); (rows[k] = rows[k] || []).push(it); });
    Object.keys(rows).map(Number).sort((a, b) => b - a).forEach(k => out.push(rows[k].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ')));
  }
  return out.join('\n');
}
// PDF sans texte (scan) : première page dessinée sur un canvas, lue par l'OCR
async function pdfToCanvas(file) {
  const doc = await openPdf(file);
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 2 });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}

// ---------------------------------------------------------------------------
// Noms d'articles connus (toutes les recettes) pour rapprocher les lignes du ticket
// ---------------------------------------------------------------------------
let articleIndex = null; // nom → rayon
function getArticleIndex() {
  if (!articleIndex) {
    articleIndex = {};
    try { state.recipes.forEach(r => (r.ingredients || []).forEach(i => { const n = normalizeIngredient(i); articleIndex[n.name] = n.rayon; })); } catch (e) { /* index vide */ }
  }
  return articleIndex;
}
// « BANANE », « POMME POIRE SSA 4X » → « banane », « pomme poire ssa » (sans tailles ni quantités)
const NON_FOOD = /\b(sac|savon|lessive|papier|eponge|pile|ampoule|film|gel douche|shampo|dentifrice|couche|essuie|liquide vaisselle)\b/;
function customProductName(label) {
  const n = GN.norm(label).replace(/\b\d+\s?x\s?\d*\s?(g|kg|ml|cl|l)?\b/g, ' ').replace(/\b\d+\s?(g|kg|ml|cl|l)\b/g, ' ').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  return n.length >= 3 ? n : null;
}
const articleId = (name) => String(name).toLowerCase().replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Fenêtre « Ticket de caisse »
// ---------------------------------------------------------------------------
let ticketDraft = null;
function ticketBody() { return document.getElementById('ticket-body'); }
function openTicketModal() {
  document.getElementById('ticket-modal').classList.remove('hidden');
  showTicketChoose();
}
function closeTicketModal() { document.getElementById('ticket-modal').classList.add('hidden'); ticketDraft = null; }

function showTicketChoose() {
  ticketBody().innerHTML = `
    <p class="text-slate-600 leading-relaxed">Photographiez votre ticket de caisse (ou ouvrez son <b>PDF</b>, par exemple l'e-ticket de l'application du magasin) : l'application lit le <b>total</b> et les <b>prix des articles</b> pour affiner le budget de votre panier et vos statistiques de courses. La lecture se fait <b>sur votre téléphone</b> : la photo n'est envoyée nulle part.</p>
    <button type="button" id="btn-ticket-camera" class="w-full bg-brand-600 text-white font-bold py-3 rounded-2xl text-sm active:scale-95">Photographier le ticket</button>
    <button type="button" id="btn-ticket-library" class="w-full bg-slate-100 text-slate-700 font-bold py-3 rounded-2xl text-sm active:scale-95">Choisir une photo ou un PDF</button>
    <button type="button" id="btn-ticket-manual" class="w-full text-xs font-bold text-slate-500 py-2">Saisir seulement le total à la main</button>
    <p class="text-[12px] text-slate-400 leading-relaxed">Conseils : ticket à plat, bien éclairé, en entier et bien droit. Au premier usage, ≈ 5 Mo de composants sont téléchargés (une seule fois, puis disponibles hors-ligne).</p>`;
  const cam = document.getElementById('ticket-file-cam'), lib = document.getElementById('ticket-file-lib');
  document.getElementById('btn-ticket-camera').addEventListener('click', () => cam.click());
  document.getElementById('btn-ticket-library').addEventListener('click', () => lib.click());
  document.getElementById('btn-ticket-manual').addEventListener('click', () => { closeTicketModal(); recordTicketManually(); });
}

function showTicketProgress(label, pct) {
  ticketBody().innerHTML = `
    <div class="py-6 text-center space-y-3">
      <p class="font-bold text-slate-800 text-sm" id="ticket-progress-label">${esc(label)}</p>
      <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div id="ticket-progress-bar" class="bg-brand-600 h-full transition-all duration-200" style="width:${Math.round(pct)}%"></div></div>
      <p class="text-[12px] text-slate-400">Cela peut prendre une vingtaine de secondes.</p>
    </div>`;
}
function setTicketProgress(label, pct) {
  const l = document.getElementById('ticket-progress-label'), b = document.getElementById('ticket-progress-bar');
  if (l) l.textContent = label; if (b) b.style.width = Math.round(pct) + '%';
}

async function handleTicketFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  showTicketProgress(isPdf ? 'Lecture du PDF…' : 'Préparation de la photo…', 5);
  let text = '';
  try {
    if (isPdf) {
      text = await pdfToText(file);
      if (text.replace(/\s/g, '').length >= 40) { reviewTicketText(text); return; } // texte exact : pas d'OCR
    }
    const canvas = isPdf ? await pdfToCanvas(file) : await prepareReceiptCanvas(file);
    setTicketProgress('Chargement du lecteur…', 10);
    text = await ocrReceipt(canvas, (m) => {
      if (m.status === 'recognizing text') setTicketProgress('Lecture du ticket…', 30 + m.progress * 70);
      else if (/loading/.test(m.status || '')) setTicketProgress('Chargement du lecteur…', 10 + (m.progress || 0) * 20);
    });
  } catch (e) {
    ticketBody().innerHTML = `<p class="text-rose-600 font-semibold">La lecture du ticket a échoué (${esc(e.message || 'erreur')}).</p>
      <p class="text-slate-500">Vérifiez la connexion pour le premier chargement, ou saisissez le total à la main.</p>
      <button type="button" id="btn-ticket-retry" class="w-full bg-slate-100 text-slate-700 font-bold py-3 rounded-2xl text-sm">Réessayer</button>
      <button type="button" id="btn-ticket-manual2" class="w-full text-xs font-bold text-slate-500 py-2">Saisir le total à la main</button>`;
    document.getElementById('btn-ticket-retry').addEventListener('click', showTicketChoose);
    document.getElementById('btn-ticket-manual2').addEventListener('click', () => { closeTicketModal(); recordTicketManually(); });
    return;
  }
  reviewTicketText(text);
}

// Texte lu → lignes rapprochées des articles, à relire avant d'enregistrer
function reviewTicketText(text) {
  const parsed = GR.parseReceipt(text);
  const idx = getArticleIndex();
  const names = Object.keys(idx);
  const lines = parsed.lines.map((l) => {
    const article = GR.matchArticle(l.label, names, (i) => normalizeIngredient(i));
    // produit sans équivalent dans les recettes (banane, jus…) : gardé sous son nom de caisse, pour le prix et le placard
    const custom = article ? null : customProductName(l.label);
    const food = !NON_FOOD.test(GN.norm(l.label)) && l.section !== 'autres';
    return { ...l, article, custom, rayon: (article ? idx[article] : null) || l.section || null, use: food && !!(article || custom) };
  });
  ticketDraft = { text, parsed, lines, total: parsed.total };
  renderTicketReview();
}

function renderTicketReview() {
  const d = ticketDraft;
  const sum = Math.round(d.lines.reduce((s, l) => s + l.price, 0) * 100) / 100;
  const mismatch = d.total != null && d.lines.length && Math.abs(sum - d.total) > Math.max(1.5, d.total * 0.05);
  const money = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
  ticketBody().innerHTML = `
    <div>
      <label class="font-bold text-slate-700 block mb-1" for="ticket-total">Total du ticket (€)</label>
      <input id="ticket-total" type="text" inputmode="decimal" value="${d.total != null ? esc(money(d.total)) : ''}" placeholder="ex. 63,40" class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold">
      ${d.total == null ? '<p class="text-amber-700 mt-1">Total non lu : saisissez-le.</p>' : ''}
      ${mismatch ? `<p class="text-amber-700 mt-1">La somme des lignes lues (${money(sum)} €) diffère du total : certaines lignes ont pu être mal lues.</p>` : ''}
    </div>
    ${d.lines.length ? `<div>
      <p class="font-bold text-slate-700 mb-1">${d.lines.length} ligne${d.lines.length > 1 ? 's' : ''} lue${d.lines.length > 1 ? 's' : ''} — les lignes cochées entrent au placard (avec une date limite) et leur prix est retenu</p>
      <div class="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
        ${d.lines.map((l, i) => `<label class="flex items-center gap-2.5 p-2.5 ${l.use ? '' : 'opacity-60'}">
          <input type="checkbox" class="ticket-line w-5 h-5 rounded flex-shrink-0" data-i="${i}" ${l.use ? 'checked' : ''}>
          <span class="flex-1 min-w-0"><span class="block truncate font-semibold text-slate-800">${esc(l.label)}</span>
            <span class="block text-[12px] text-slate-500">${l.article ? '→ ' + esc(l.article) : (l.custom ? 'produit : ' + esc(l.custom) : 'non alimentaire')}${l.perKg ? ' · ' + money(l.perKg) + ' €/kg' : (l.kg ? ' · ' + String(l.kg).replace('.', ',') + ' kg' : '')}${l.qty > 1 ? ' · ×' + l.qty : ''}</span></span>
          <span class="font-bold text-slate-800 whitespace-nowrap">${money(l.price)} €</span></label>`).join('')}
      </div></div>` : '<p class="text-slate-500">Aucune ligne d\'article reconnue : seul le total sera enregistré.</p>'}
    <details><summary class="text-[12px] text-slate-400 cursor-pointer">Texte lu sur la photo</summary><pre class="whitespace-pre-wrap text-[12px] text-slate-500 mt-1 max-h-40 overflow-y-auto">${esc(d.text)}</pre></details>
    <div class="flex gap-2 pt-1">
      <button type="button" id="btn-ticket-cancel" class="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-2xl text-sm">Annuler</button>
      <button type="button" id="btn-ticket-save" class="flex-1 bg-brand-600 text-white font-bold py-3 rounded-2xl text-sm active:scale-95">Enregistrer</button>
    </div>`;
  ticketBody().querySelectorAll('.ticket-line').forEach(cb => cb.addEventListener('change', () => { d.lines[Number(cb.dataset.i)].use = cb.checked; }));
  document.getElementById('btn-ticket-cancel').addEventListener('click', closeTicketModal);
  document.getElementById('btn-ticket-save').addEventListener('click', saveTicket);
}

// Enregistre le ticket : total, statistiques par rayon, prix réels appris
function saveTicket() {
  const d = ticketDraft;
  const total = parseFloat(String(document.getElementById('ticket-total').value).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(total) || total <= 0 || total > 5000) { showToast('Total non reconnu'); return; }
  const used = d.lines.filter(l => l.use && (l.article || l.custom));
  const matched = used.filter(l => l.article);
  const now = Date.now();
  // Étalonnage : estimation de CES lignes (et non de la liste du moment) comparée à leur prix réel
  let est = 0, cal = 0;
  matched.forEach(l => {
    const grams = l.kg ? l.kg * 1000 : (l.pack ? l.pack * l.qty : 0);
    est += GL.estimateItemPrice({ name: l.article, rayon: l.rayon, quantity: grams || l.qty, baseUnit: grams ? 'g' : 'piece' });
    cal += l.price;
  });
  const trip = { t: now, total: Math.round(total * 100) / 100, est: Math.round(est * 100) / 100, items: d.lines.length, r: Object.keys(d.parsed.sections || {}).length ? d.parsed.sections : GR.rayonTotals(d.lines.map(l => ({ rayon: l.rayon, price: l.price }))) };
  if (matched.length >= 3 && est > 0) trip.cal = Math.round(cal * 100) / 100; // assez de lignes : le coefficient s'appuie sur elles
  else trip.est = GL.estimateCost(currentSplit().toBuy);
  state.trips.push(trip);
  state.trips = state.trips.slice(-30);
  const nameOf = (l) => l.article || l.custom;
  state.priceBook = GR.updatePriceBook(state.priceBook, used.map(l => ({ id: articleId(nameOf(l)), price: l.price, kg: l.kg, perKg: l.perKg, pack: l.pack, qty: l.qty })), now);
  // Reste à consommer : les achats entrent au placard avec une date limite (d'après la date du ticket)
  const stocked = addPurchasesToPantry(used.map(l => ({ name: nameOf(l), rayon: l.rayon, kg: l.kg, pack: l.pack, qty: l.qty })), ticketDateToTs(d.parsed.date));
  bumpCosts();
  saveToLocalStorage();
  renderGroceries();
  renderPlanning();
  closeTicketModal();
  showToast(`Ticket de ${String(trip.total.toFixed(2)).replace('.', ',')} € enregistré${used.length ? ` · ${used.length} produit${used.length > 1 ? 's' : ''} au placard avec date limite` : ''}`);
}

function setupTicketModal() {
  const modal = document.getElementById('ticket-modal');
  if (!modal) return;
  document.getElementById('btn-close-ticket').addEventListener('click', closeTicketModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeTicketModal(); });
  ['ticket-file-cam', 'ticket-file-lib'].forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; handleTicketFile(f); });
  });
}
