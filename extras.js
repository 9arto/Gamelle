// Fonctions « confort » : coût des repas, pack hebdomadaire, restes à consommer, équilibre de la semaine,
// retour sonore/vibration, accueil en 3 étapes. Script classique chargé avant app.js (portée globale partagée).

const money = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
const euro = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : money(v)) + ' €';

// ---------------------------------------------------------------------------
// Coût des repas (prix appris sur vos tickets > prix de référence), « pas cher » réel
// ---------------------------------------------------------------------------
const CHEAP_PP = 2.2; // € par portion en dessous duquel un plat est « pas cher »
const costCache = {};
function bumpCosts() { Object.keys(costCache).forEach(k => delete costCache[k]); scheduleRecipeCosts(); }

// Coût d'une recette pour 4 portions, tous les ingrédients achetés (le placard n'est pas déduit : c'est le prix du repas)
function recipeCost4(r) {
  if (costCache[r.id] != null) return costCache[r.id];
  const keep = { plan: state.plan, locked: state.lockedSlots, portions: state.portions };
  let items;
  try { state.plan = [r.id]; state.lockedSlots = []; state.portions = 4; items = computeGroceries(); }
  finally { state.plan = keep.plan; state.lockedSlots = keep.locked; state.portions = keep.portions; }
  const factor = GL.priceFactor(state.trips);
  costCache[r.id] = GL.estimateBudget(items, factor, (i) => GR.learnedPrice(i, state.priceBook)).total;
  return costCache[r.id];
}
const recipePP = (r) => recipeCost4(r) / 4;
const recipeMealCost = (r) => recipePP(r) * state.portions;

let costJob = 0;
// Calcule le coût de tout le catalogue par petits paquets (le téléphone reste fluide), puis met à jour « pas cher »
function scheduleRecipeCosts() {
  const job = ++costJob;
  const list = state.recipes.filter(r => costCache[r.id] == null);
  let i = 0;
  const step = () => {
    if (job !== costJob) return; // un calcul plus récent a pris le relais
    const end = Math.min(list.length, i + 40);
    for (; i < end; i++) { try { recipeCost4(list[i]); } catch (e) { /* recette illisible : ignorée */ } }
    if (i < list.length) { setTimeout(step, 0); return; }
    state.recipes.forEach(r => { if (!String(r.id).startsWith('custom-') && costCache[r.id] != null) r.isBudget = recipePP(r) <= CHEAP_PP; });
    if (typeof renderCatalog === 'function') renderCatalog(false);
    renderPlanning();
  };
  setTimeout(step, 400);
}

// ---------------------------------------------------------------------------
// Produits courants : prix réel d'après vos tickets, pack hebdomadaire
// ---------------------------------------------------------------------------
function staplesCost() {
  let total = 0, n = 0;
  (state.staples || []).forEach(s => { const p = GR.staplePrice(s, state.priceBook); if (p != null) { total += p; n++; } });
  return { total, n };
}

const DEFAULT_PACK = [{ name: 'Bananes', qty: 7 }, { name: 'Kéfir 1 L', qty: 1 }, { name: 'Yaourts', qty: 1 }, { name: 'Fruits de saison (petit-déj)', qty: 1 }, { name: 'Pain de mie', qty: 1 }, { name: "Jus d'orange", qty: 1 }];

function updatePackButton() {
  const b = document.getElementById('btn-add-pack');
  if (!b) return;
  const n = (state.weeklyPack || []).length;
  b.textContent = n ? `+ Mon pack de la semaine (${n} produit${n > 1 ? 's' : ''})` : '+ Créer mon pack de la semaine';
}
function addPackToList() {
  if (!(state.weeklyPack || []).length) { openPackModal(); return; }
  const snapshot = takeSnapshot();
  state.weeklyPack.forEach(p => addStaple(p.name, p.qty, true));
  saveToLocalStorage(); renderGroceries(); renderHabituals();
  showToast('Pack de la semaine ajouté', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
}
let packDraft = [];
function openPackModal() {
  packDraft = (state.weeklyPack && state.weeklyPack.length ? state.weeklyPack : DEFAULT_PACK).map(p => ({ ...p }));
  renderPackModal();
  document.getElementById('pack-modal').classList.remove('hidden');
}
function closePackModal() { document.getElementById('pack-modal').classList.add('hidden'); }
function renderPackModal() {
  const box = document.getElementById('pack-body');
  box.innerHTML = packDraft.map((p, i) => {
    const price = GR.staplePrice(p, state.priceBook);
    return `<div class="flex items-center gap-2" data-i="${i}">
      <input type="text" class="pack-name flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold" value="${esc(p.name)}" aria-label="Produit ${i + 1}" maxlength="60">
      <button type="button" class="pack-minus w-8 h-8 rounded-lg bg-slate-100 font-bold" aria-label="Moins">−</button>
      <span class="w-8 text-center font-bold text-xs">${p.qty}</span>
      <button type="button" class="pack-plus w-8 h-8 rounded-lg bg-slate-100 font-bold" aria-label="Plus">+</button>
      <span class="w-14 text-right text-[12px] text-slate-400">${price != null ? '≈ ' + euro(price) : ''}</span>
      <button type="button" class="pack-del w-8 h-8 text-slate-400" aria-label="Retirer ${esc(p.name)}">✕</button></div>`;
  }).join('') + `<div class="flex gap-2 flex-wrap pt-1">
      <button type="button" id="btn-pack-add" class="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">+ Ajouter une ligne</button>
      <button type="button" id="btn-pack-from-list" class="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">Reprendre mes produits courants</button></div>
    <p class="text-[12px] text-slate-400">Le prix « ≈ » apparaît pour les produits déjà vus sur un de vos tickets.</p>`;
}
function setupPackModal() {
  const modal = document.getElementById('pack-modal');
  if (!modal) return;
  document.getElementById('btn-close-pack').addEventListener('click', closePackModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closePackModal(); });
  const body = document.getElementById('pack-body');
  const sync = () => body.querySelectorAll('.pack-name').forEach((inp, i) => { if (packDraft[i]) packDraft[i].name = inp.value; });
  body.addEventListener('click', (e) => {
    sync();
    const row = e.target.closest('[data-i]');
    const i = row ? Number(row.dataset.i) : -1;
    if (e.target.closest('.pack-plus')) packDraft[i].qty = Math.min(99, packDraft[i].qty + 1);
    else if (e.target.closest('.pack-minus')) packDraft[i].qty = Math.max(1, packDraft[i].qty - 1);
    else if (e.target.closest('.pack-del')) packDraft.splice(i, 1);
    else if (e.target.id === 'btn-pack-add') packDraft.push({ name: '', qty: 1 });
    else if (e.target.id === 'btn-pack-from-list') packDraft = state.staples.map(s => ({ name: s.name, qty: s.qty || 1 }));
    else return;
    renderPackModal();
  });
  document.getElementById('btn-pack-save').addEventListener('click', () => {
    sync();
    state.weeklyPack = sanitizePack(packDraft);
    saveToLocalStorage(); updatePackButton(); closePackModal();
    showToast(state.weeklyPack.length ? 'Pack enregistré' : 'Pack vidé');
  });
  document.getElementById('btn-add-pack').addEventListener('click', addPackToList);
  document.getElementById('btn-edit-pack').addEventListener('click', openPackModal);
  updatePackButton();
}

// ---------------------------------------------------------------------------
// Reste à consommer : ce qu'on vient d'acheter entre au placard avec une date limite
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;
function ticketDateToTs(str) {
  const m = String(str || '').match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return Date.now();
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const t = new Date(y, Number(m[2]) - 1, Number(m[1]), 12).getTime();
  return Number.isFinite(t) && t < Date.now() + DAY_MS ? t : Date.now();
}
function dayLabel(ts) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - d0) / DAY_MS);
  if (diff < 0) return diff === -1 ? 'hier' : `il y a ${-diff} j`;
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'demain';
  if (diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
const prettyName = (id) => id.charAt(0).toUpperCase() + id.slice(1);

// lines : lignes retenues du ticket ({ name, rayon, kg, pack, qty }) ; purchasedAt : date du ticket
function addPurchasesToPantry(lines, purchasedAt) {
  let n = 0;
  lines.forEach(l => {
    const id = articleId(l.name);
    if (!id) return;
    if (!state.pantry.includes(id)) state.pantry.push(id);
    state.pantryNeeded = state.pantryNeeded.filter(x => x !== id);
    const grams = l.kg ? l.kg * 1000 : (l.pack ? l.pack * l.qty : 0);
    if (grams) state.pantryStock[id] = { qty: Math.round(grams), unit: 'g' };
    else if (l.qty) state.pantryStock[id] = { qty: l.qty, unit: 'piece' };
    state.pantryExpiry[id] = purchasedAt + GL.shelfDays(l.name, l.rayon) * DAY_MS;
    n++;
  });
  return n;
}
// Un article acheté sur ticket dont la date limite est passée depuis plus d'une semaine n'est plus « au placard »
function purgeOldPantry() {
  const limit = Date.now() - 7 * DAY_MS;
  const gone = Object.keys(state.pantryExpiry).filter(id => state.pantryExpiry[id] < limit);
  if (!gone.length) return;
  gone.forEach(id => { delete state.pantryExpiry[id]; delete state.pantryStock[id]; state.pantry = state.pantry.filter(x => x !== id); });
  persistLocal();
}
// Date limite d'un article du placard : saisie « jj/mm » (vide = aucune)
async function editExpiry(id) {
  const cur = state.pantryExpiry[id];
  const v = await promptDialog({ title: 'À consommer avant', message: `Date limite de « ${id} » (jj/mm), vide = aucune.`, value: cur ? new Date(cur).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '' });
  if (v === null || v === false) return;
  const m = String(v).trim().match(/^(\d{1,2})[\/.\-](\d{1,2})$/);
  if (String(v).trim() === '') delete state.pantryExpiry[id];
  else if (m) {
    const now = new Date(); let t = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[1]), 12);
    if (t.getTime() < now.getTime() - 30 * DAY_MS) t = new Date(now.getFullYear() + 1, Number(m[2]) - 1, Number(m[1]), 12);
    state.pantryExpiry[id] = t.getTime();
  } else { showToast('Date non reconnue (ex. 28/11)'); return; }
  saveToLocalStorage(); renderGroceries();
}

// ---------------------------------------------------------------------------
// Équilibre de la semaine (protéines, légumes, calories par repas) d'après le menu
// ---------------------------------------------------------------------------
const NOT_VEG = /\b(ail|echalote|gingembre|citron|herbe|coriandre|persil|basilic|ciboulette|thym|menthe|romarin|aneth|noix|noisette|amande|cerneau|olive|piment)/;
// Grammes de fruits/légumes par portion
function vegGramsPerPortion(recipe) {
  let g = 0;
  (recipe.ingredients || []).forEach(ing => {
    const n = normalizeIngredient(ing);
    if (n.rayon !== 'fruits-legumes' || NOT_VEG.test(GN.norm(n.name))) return;
    const grams = ingredientGrams(ing);
    if (grams != null && Number.isFinite(grams)) g += grams;
  });
  return g / (recipe.basePortions || 4);
}
function renderWeekBalance() {
  const box = document.getElementById('week-balance');
  if (!box) return;
  const recipes = state.plan.map(id => state.recipes.find(r => r.id === id)).filter(Boolean);
  if (recipes.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const meals = recipes.map(r => ({ kcal: nutritionOf(r).perPortion.kcal, protein: nutritionOf(r).perPortion.protein, veg: Math.round(vegGramsPerPortion(r)), type: r.type }));
  const s = GL.weekSummary(meals);
  // Barre verte quand le repère est atteint, ambrée sinon (couleurs en ligne : indépendantes du CSS compilé)
  const bar = (v, target) => `<div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.min(100, Math.round(v / target * 100))}%;background:${v >= target ? '#10b981' : '#f59e0b'}"></div></div>`;
  const TL = { volaille: 'volaille', viande: 'viande', poisson: 'poisson', vege: 'végétarien' };
  box.classList.remove('hidden');
  box.innerHTML = `<div class="ios-card p-4 space-y-3">
    <div class="flex items-center gap-3"><div class="tile-icon tile-green"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg></div>
      <div><h3 class="text-sm font-bold text-slate-800">Équilibre de vos ${s.count} repas</h3><p class="text-xs text-slate-500">Moyenne par repas et par personne</p></div></div>
    <div class="space-y-1"><div class="flex justify-between text-xs"><span class="text-slate-600">Protéines</span><b class="text-slate-800">${s.protein} g <span class="font-normal text-slate-400">/ ${s.target.protein} g</span></b></div>${bar(s.protein, s.target.protein)}</div>
    <div class="space-y-1"><div class="flex justify-between text-xs"><span class="text-slate-600">Légumes et fruits</span><b class="text-slate-800">${s.veg} g <span class="font-normal text-slate-400">/ ${s.target.veg} g</span></b></div>${bar(s.veg, s.target.veg)}</div>
    <p class="text-xs text-slate-600"><b>${s.kcal} kcal</b> en moyenne · ${Object.entries(s.types).map(([t, n]) => `${n} ${TL[t] || t}`).join(' · ')}</p>
    ${s.lowVeg ? `<p class="text-xs text-amber-700">${s.lowVeg} repas ${s.lowVeg > 1 ? 'sont' : 'est'} pauvre${s.lowVeg > 1 ? 's' : ''} en légumes : pensez à un accompagnement.</p>` : ''}
    ${s.lowProtein ? `<p class="text-xs text-amber-700">${s.lowProtein} repas ${s.lowProtein > 1 ? 'apportent' : 'apporte'} peu de protéines (moins de 15 g).</p>` : ''}
    <p class="text-[12px] text-slate-400">Estimation d'après les ingrédients de chaque recette (hors accompagnements non listés). Repères : 25 g de protéines et 200 g de légumes par repas.</p></div>`;
}

// ---------------------------------------------------------------------------
// Accueil en 3 étapes (première ouverture seulement)
// ---------------------------------------------------------------------------
let onboardStep = 0, onboardDraft = {};
function maybeShowOnboarding(firstLaunch) {
  if (safeGetItem('gamelle_onboarded')) return;
  if (!firstLaunch) { safeSetItem('gamelle_onboarded', '1'); return; } // utilisateur existant : on ne change rien
  onboardStep = 0; onboardDraft = { spices: 'basic', regimes: [] };
  renderOnboarding();
  document.getElementById('onboarding-modal').classList.remove('hidden');
}
function closeOnboarding() { safeSetItem('gamelle_onboarded', '1'); document.getElementById('onboarding-modal').classList.add('hidden'); }
function renderOnboarding() {
  const body = document.getElementById('onboarding-body');
  const dots = [0, 1, 2].map(i => `<span class="w-2 h-2 rounded-full ${i === onboardStep ? 'bg-brand-600' : 'bg-slate-200'}"></span>`).join('');
  const chip = (on, label, attr) => `<button type="button" ${attr} class="ob-opt w-full text-left px-4 py-3 rounded-2xl border ${on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-700'} text-sm font-semibold" aria-pressed="${on}">${label}</button>`;
  let html = '';
  if (onboardStep === 0) {
    html = `<h3 class="text-lg font-bold text-slate-900">Vous cuisinez à deux ?</h3>
      <p class="text-sm text-slate-500">Reliez vos deux téléphones : même menu et même liste de courses en direct. Vous pouvez aussi le faire plus tard dans Réglages.</p>
      <button type="button" id="ob-create" class="w-full bg-brand-600 text-white font-bold py-3 rounded-2xl text-sm">Créer un code foyer</button>
      <div class="flex gap-2"><input id="ob-code" type="text" placeholder="J'ai déjà un code" autocapitalize="characters" class="flex-1 border border-slate-200 rounded-2xl px-3 py-3 text-sm" aria-label="Code foyer"><button type="button" id="ob-join" class="px-4 rounded-2xl bg-slate-100 font-bold text-sm">Rejoindre</button></div>
      <p id="ob-msg" class="text-xs text-brand-700 font-semibold min-h-[1rem]">${onboardDraft.code ? 'Votre code : <b class="font-mono">' + esc(onboardDraft.code) + '</b> (à saisir sur l\'autre téléphone)' : ''}</p>`;
  } else if (onboardStep === 1) {
    html = `<h3 class="text-lg font-bold text-slate-900">Quelles épices avez-vous ?</h3>
      <p class="text-sm text-slate-500">Celles que vous avez ne sont pas ajoutées à la liste de courses. Modifiable à tout moment.</p>
      ${chip(onboardDraft.spices === 'none', 'Aucune : je les achète quand il faut', 'data-spices="none"')}
      ${chip(onboardDraft.spices === 'basic', 'Les basiques : paprika, cumin, curcuma, herbes de Provence, muscade, cannelle', 'data-spices="basic"')}
      ${chip(onboardDraft.spices === 'full', 'Tout le rayon épices', 'data-spices="full"')}`;
  } else {
    html = `<h3 class="text-lg font-bold text-slate-900">Des régimes à respecter ?</h3>
      <p class="text-sm text-slate-500">Ils seront pris en compte quand vous composez vos 7 repas (modifiable à chaque fois).</p>
      ${chip(onboardDraft.regimes.includes('noPork'), 'Sans porc', 'data-regime="noPork"')}
      ${chip(onboardDraft.regimes.includes('noLactose'), 'Sans lactose', 'data-regime="noLactose"')}
      ${chip(onboardDraft.regimes.includes('vege'), 'Végétarien', 'data-regime="vege"')}`;
  }
  body.innerHTML = `<div class="flex justify-center gap-1.5 pb-2" aria-label="Étape ${onboardStep + 1} sur 3">${dots}</div><div class="space-y-3">${html}</div>
    <div class="flex gap-2 pt-4"><button type="button" id="ob-skip" class="px-4 py-3 text-sm font-bold text-slate-500">Passer</button>
      <button type="button" id="ob-next" class="flex-1 bg-slate-900 text-white font-bold py-3 rounded-2xl text-sm">${onboardStep === 2 ? 'Terminer' : 'Suivant'}</button></div>`;
}
function setupOnboarding() {
  const body = document.getElementById('onboarding-body');
  if (!body) return;
  body.addEventListener('click', async (e) => {
    const opt = e.target.closest('.ob-opt');
    if (opt && opt.dataset.spices) { onboardDraft.spices = opt.dataset.spices; renderOnboarding(); return; }
    if (opt && opt.dataset.regime) {
      const r = opt.dataset.regime;
      onboardDraft.regimes = onboardDraft.regimes.includes(r) ? onboardDraft.regimes.filter(x => x !== r) : [...onboardDraft.regimes, r];
      renderOnboarding(); return;
    }
    if (e.target.id === 'ob-create') { onboardDraft.code = generateHouseholdCode(); setHouseholdCode(onboardDraft.code, { silent: true }); renderOnboarding(); return; }
    if (e.target.id === 'ob-join') {
      const code = document.getElementById('ob-code').value.trim().toUpperCase();
      if (isWeakHouseholdCode(code)) { document.getElementById('ob-msg').textContent = 'Code trop court ou trop simple : demandez le code complet à l\'autre téléphone.'; return; }
      setHouseholdCode(code); onboardDraft.code = code; onboardStep = 1; renderOnboarding(); return;
    }
    if (e.target.id === 'ob-skip') {
      if (onboardStep < 2) { onboardStep++; renderOnboarding(); } else closeOnboarding();
      return;
    }
    if (e.target.id === 'ob-next') {
      if (onboardStep < 2) { onboardStep++; renderOnboarding(); return; }
      // Terminer : on applique les choix (premier lancement : le menu d'exemple respecte les régimes)
      state.spices = onboardDraft.spices === 'full' ? [...GL.SPICES_FULL] : onboardDraft.spices === 'basic' ? [...GL.SPICES_BASIC] : [];
      const f = {};
      if (onboardDraft.regimes.includes('noPork')) f.noPork = true;
      if (onboardDraft.regimes.includes('noLactose')) f.noLactose = true;
      if (onboardDraft.regimes.includes('vege')) f.types = ['vege'];
      state.genFilters = sanitizeGenFilters(f);
      if (Object.keys(f).length) generateBalancedWeek(true, state.genFilters);
      saveToLocalStorage(); renderAll(); closeOnboarding();
      showToast('C\'est prêt. Bon appétit !');
    }
  });
}
