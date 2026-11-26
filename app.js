function cleanSearchText(str) {
  if (!str) return '';
  return str.toString()
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['’\-]/g, ' ')
    .trim();
}
// Logique de l'application Gamelle & Panier

// Icônes vectorielles (nettes sur iPhone, suivent la couleur du texte en mode clair comme sombre)
// Icône de rayon : emoji dans une pastille colorée (couleur par rayon, voir styles.css)
const rayonIcon = (r) => `<span class="rayon-tile rayon-${esc(r.id)}" aria-hidden="true">${r.icon}</span>`;
const ICONS = {
  box: '<svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 7.5L12 12.5l8.7-5"/><path d="M12 12.5V22"/></svg>',
  lock: '<svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
  unlock: '<svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 7.75-1.4"/></svg>',
  heart: (filled, size = 'w-[18px] h-[18px]') => `<svg class="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.7 7.9 3.8 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.4 0 5.5 3.4 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>`
};
// ==========================================
// OUTILS COMMUNS : sécurité, stockage, notifications, boîtes de dialogue
// ==========================================

// Échappe tout texte inséré dans du HTML (titres de recettes, noms, etc.)
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Visuel affiché quand une photo est absente ou indisponible hors ligne (même motif que le logo)
const IMG_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>" +
  "<g fill='#10b981' fill-opacity='.32'>" +
  "<path d='M64 100C64 48 136 48 136 100' fill='none' stroke='#10b981' stroke-opacity='.32' stroke-width='9' stroke-linecap='round'/>" +
  "<rect x='46' y='100' width='108' height='10' rx='5'/>" +
  "<path d='M54 118H146C146 146 124 164 100 164C76 164 54 146 54 118Z'/></g></svg>"
);

// Vignettes de liste : version légère (≈ 140 Ko au lieu de ≈ 430 Ko) pour les photos Jow ; la fiche garde la grande photo
function thumbImg(url) {
  const u = safeImg(url);
  return u.replace('static.jow.fr/550x550/', 'static.jow.fr/304x304/');
}

function safeImg(url) {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u) ? u : IMG_PLACEHOLDER;
}

// Photo introuvable : secours (data-fallback) puis visuel du logo. Écouteurs globaux : pas de code dans le HTML (compatible CSP).
function imgFallback(img) {
  if (img.dataset.fallback && !img.dataset.triedFallback) { img.dataset.triedFallback = '1'; img.src = img.dataset.fallback; return; }
  if (img.src === IMG_PLACEHOLDER) return;
  img.src = IMG_PLACEHOLDER;
}
document.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') imgFallback(e.target); }, true);
// Fond « en chargement » discret retiré dès que la photo est affichée
document.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IMG') e.target.classList.add('img-loaded'); }, true);

// Accès au stockage local sans jamais planter (mode privé, quota plein, données corrompues)
function safeGetItem(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function safeSetItem(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
function safeRemoveItem(key) { try { localStorage.removeItem(key); } catch (e) {} }
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return value === null || value === undefined ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

// --- Validation des données (stockage local, lien de partage, synchro foyer) ---
function cleanStr(v, max = 200) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function cleanNum(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function sanitizeStringList(list, maxItems = 600, maxLen = 120) {
  return Array.isArray(list)
    ? list.filter(x => typeof x === 'string').map(x => cleanStr(x, maxLen)).filter(Boolean).slice(0, maxItems)
    : [];
}
function sanitizePlan(plan) {
  return Array.isArray(plan)
    ? plan.slice(0, 60).map(id => (typeof id === 'string' && id.trim() ? cleanStr(id, 80) : null))
    : [];
}
function sanitizeSlots(slots) {
  return Array.isArray(slots)
    ? [...new Set(slots.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 60))]
    : [];
}
function sanitizeStaples(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((s, i) => {
    if (typeof s === 'string') s = { name: s };
    if (!s || typeof s !== 'object') return null;
    const name = cleanStr(s.name, 80);
    if (!name) return null;
    return { id: cleanStr(s.id, 60) || ('staple_' + Date.now() + '_' + i), name, checked: s.checked === true, qty: Math.round(cleanNum(s.qty, 1, 99, 1)) };
  }).filter(Boolean);
}
function sanitizeChecked(map) {
  const out = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    Object.keys(map).slice(0, 800).forEach(k => { if (map[k] === true) out[cleanStr(k, 200)] = true; });
  }
  return out;
}
function sanitizeSavedMenus(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 30).map(m => {
    if (!m || typeof m !== 'object') return null;
    const planSrc = Array.isArray(m.plan) ? m.plan : (m.plan && typeof m.plan === 'object' ? Object.values(m.plan) : []);
    return {
      id: cleanStr(m.id, 60) || ('menu_' + Date.now()),
      name: cleanStr(m.name, 80) || 'Menu',
      date: cleanStr(m.date, 40),
      portions: Math.round(cleanNum(m.portions, 1, 12, 4)),
      plan: sanitizePlan(planSrc),
      staples: sanitizeStaples(m.staples)
    };
  }).filter(Boolean);
}
function sanitizeNotes(map) {
  const out = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    Object.keys(map).slice(0, 800).forEach(k => {
      const v = map[k];
      if (!v || typeof v !== 'object') return;
      const r = v.r === 1 ? 1 : v.r === -1 ? -1 : 0;
      const cooked = Number.isFinite(v.cooked) ? v.cooked : 0;
      const t = Number.isFinite(v.t) ? v.t : 0;
      if (r || cooked) out[cleanStr(k, 80)] = { r, cooked, t };
    });
  }
  return out;
}
const OFF_TTL = 30 * 86400000;
function sanitizeOffCache(map) {
  const out = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    Object.keys(map).slice(0, 400).forEach(k => {
      const v = map[k];
      if (!v || typeof v !== 'object' || !Number.isFinite(v.t) || Date.now() - v.t > OFF_TTL) return;
      const d = v.d && typeof v.d === 'object' ? v.d : null;
      out[cleanStr(k, 120)] = { t: v.t, d: d ? {
        grade: /^[a-e]$/.test(d.grade) ? d.grade : null,
        nova: [1, 2, 3, 4].includes(d.nova) ? d.nova : null,
        allergens: sanitizeStringList(d.allergens, 14, 30)
      } : null };
    });
  }
  return out;
}
function sanitizeSpices(list) {
  const known = new Set(GL.SPICES_FULL);
  return sanitizeStringList(list, 40, 80).filter(n => known.has(n));
}
function sanitizeStock(map) {
  const out = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    Object.keys(map).slice(0, 300).forEach(k => {
      const v = map[k];
      if (!v || typeof v !== 'object') return;
      const qty = cleanNum(v.qty, 0, 100000, NaN);
      const unit = cleanStr(v.unit, 12);
      if (Number.isFinite(qty) && ['g', 'ml', 'piece'].includes(unit)) out[cleanStr(k, 120)] = { qty, unit };
    });
  }
  return out;
}
function sanitizeStapleHistory(map) {
  const out = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    Object.keys(map).slice(0, 300).forEach(k => {
      const v = map[k];
      if (v && typeof v === 'object' && Number.isFinite(v.n) && v.n > 0) out[cleanStr(k, 80)] = { n: Math.min(999, Math.round(v.n)), last: Number.isFinite(v.last) ? v.last : 0 };
    });
  }
  return out;
}
function sanitizeExpiry(map) {
  const out = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    Object.keys(map).slice(0, 400).forEach(k => { const t = map[k]; if (Number.isFinite(t) && t > 946684800000 && t < 4102444800000) out[cleanStr(k, 120)] = t; });
  }
  return out;
}
function sanitizePack(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 40).map(p => {
    if (typeof p === 'string') p = { name: p };
    if (!p || typeof p !== 'object') return null;
    const name = cleanStr(p.name, 60);
    return name ? { name, qty: Math.round(cleanNum(p.qty, 1, 99, 1)) } : null;
  }).filter(Boolean);
}
function sanitizePriceBook(map) {
  const out = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    Object.keys(map).slice(0, 400).forEach(k => {
      const v = map[k];
      if (!v || typeof v !== 'object') return;
      const e = { n: Math.round(cleanNum(v.n, 0, 9999, 1)), t: Number.isFinite(v.t) ? v.t : 0 };
      const kg = cleanNum(v.kg, 0, 2000, NaN), u = cleanNum(v.u, 0, 2000, NaN);
      if (Number.isFinite(kg) && kg > 0) e.kg = kg;
      if (Number.isFinite(u) && u > 0) e.u = u;
      if (e.kg || e.u) out[cleanStr(k, 120)] = e;
    });
  }
  return out;
}
function sanitizeTrips(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-30).map(t => {
    if (!t || typeof t !== 'object') return null;
    const total = cleanNum(t.total, 0, 5000, NaN), est = cleanNum(t.est, 0, 5000, 0);
    const r = {};
    if (t.r && typeof t.r === 'object' && !Array.isArray(t.r)) Object.keys(t.r).slice(0, 12).forEach(k => { const v = cleanNum(t.r[k], 0, 5000, NaN); if (Number.isFinite(v)) r[cleanStr(k, 30)] = v; });
    const cal = cleanNum(t.cal, 0, 5000, NaN);
    const out = { t: t.t, total, est, items: Math.round(cleanNum(t.items, 0, 500, 0)), r };
    if (Number.isFinite(cal) && cal > 0) out.cal = cal;
    return Number.isFinite(total) && Number.isFinite(t.t) ? out : null;
  }).filter(Boolean);
}
function sanitizeGenFilters(f) {
  const out = {};
  if (!f || typeof f !== 'object') return out;
  ['seasons', 'types', 'styles'].forEach(k => { if (Array.isArray(f[k])) out[k] = sanitizeStringList(f[k], 12, 30); });
  ['budget', 'express', 'onePan', 'favoritesOnly', 'noPork', 'noLactose'].forEach(k => { if (f[k] === true) out[k] = true; });
  const bm = cleanNum(f.budgetMax, 10, 2000, NaN);
  if (Number.isFinite(bm)) out.budgetMax = Math.round(bm);
  if (typeof f.fridge === 'string') out.fridge = cleanStr(f.fridge, 120);
  return out;
}
const KNOWN_RECIPE_TYPES = ['volaille', 'poisson', 'vege', 'vegetarien', 'viande'];
function sanitizeCustomRecipe(r) {
  if (!r || typeof r !== 'object') return null;
  const id = cleanStr(r.id, 80);
  if (!/^custom-[\w-]+$/.test(id)) return null;
  const title = cleanStr(r.title, 140);
  if (!title) return null;
  const rayons = new Set((window.GRAND_FRAIS_RAYONS || []).map(x => x.id));
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, 80).map(i => {
    if (!i || typeof i !== 'object') return null;
    const name = cleanStr(i.name, 100);
    if (!name) return null;
    return {
      name,
      quantity: cleanNum(i.quantity, 0, 100000, 1),
      unit: cleanStr(i.unit, 30).replace(/[<>"'&`]/g, ''),
      rayon: rayons.has(i.rayon) ? i.rayon : 'epicerie'
    };
  }).filter(Boolean);
  const steps = (Array.isArray(r.steps) ? r.steps : []).slice(0, 60).map(s => {
    if (typeof s === 'string') s = { instruction: s };
    if (!s || typeof s !== 'object') return null;
    const instruction = cleanStr(s.instruction, 1500);
    if (!instruction) return null;
    const t = Number(s.timerMinutes);
    return {
      instruction,
      ingredients: sanitizeStringList(s.ingredients, 30, 100),
      timerMinutes: Number.isFinite(t) && t > 0 ? Math.min(600, Math.round(t)) : null
    };
  }).filter(Boolean);
  return {
    id,
    title,
    description: cleanStr(r.description || 'Recette maison personnalisée', 300),
    season: ['printemps', 'ete', 'automne', 'hiver', 'toutes'].includes(r.season) ? r.season : 'toutes',
    timeMinutes: Math.round(cleanNum(r.timeMinutes, 1, 600, 25)),
    tag: cleanStr(r.tag || 'Recette Maison', 60),
    type: KNOWN_RECIPE_TYPES.includes(r.type) ? r.type : 'volaille',
    isBudget: r.isBudget === true,
    basePortions: Math.round(cleanNum(r.basePortions, 1, 24, 4)),
    image: /^https?:\/\//i.test(String(r.image || '').trim()) ? String(r.image).trim().slice(0, 600) : '',
    ingredients,
    steps
  };
}
function sanitizeRecipeList(list) {
  return Array.isArray(list) ? list.slice(0, 200).map(sanitizeCustomRecipe).filter(Boolean) : [];
}

// --- Code foyer : généré au hasard et vérifié ---
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 signes, sans I/O/0/1 (faciles à confondre)
function generateHouseholdCode() {
  const bytes = new Uint8Array(12);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
  else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
  const c = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `FOYER-${c.slice(0, 4).join('')}-${c.slice(4, 8).join('')}-${c.slice(8, 12).join('')}`;
}
function isWeakHouseholdCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length < 12 || !/[0-9]/.test(c) || !/[A-Z]/.test(c) || new Set(c).size < 6;
}

// --- Notifications (avec action « Annuler » possible) ---
let toastTimer = null;
function showToast(text, opts = {}) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'app-toast';
  el.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
  if (opts.action && typeof opts.onAction === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opts.action;
    btn.addEventListener('click', () => {
      clearTimeout(toastTimer);
      host.innerHTML = '';
      opts.onAction();
    });
    el.appendChild(btn);
  }
  host.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => { if (el.parentNode === host) host.removeChild(el); }, 220);
  }, opts.duration || (opts.action ? 5500 : 2600));
}
function showSyncToast(text) { showToast(text); }

// --- Boîtes de dialogue intégrées (remplacent alert / confirm / prompt) ---
function openDialog(opts) {
  return new Promise(resolve => {
    const {
      title = '', message = '', confirmLabel = 'OK', cancelLabel = 'Annuler',
      danger = false, hideCancel = false, input = null
    } = opts;
    const previouslyFocused = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'dlg-backdrop';
    const box = document.createElement('div');
    box.className = 'dlg';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    const titleId = 'dlg-title-' + Date.now();
    box.setAttribute('aria-labelledby', titleId);

    const h = document.createElement('h3');
    h.className = 'dlg-title';
    h.id = titleId;
    h.textContent = title;
    box.appendChild(h);

    if (message) {
      const p = document.createElement('p');
      p.className = 'dlg-msg';
      p.textContent = message;
      box.appendChild(p);
    }

    let field = null;
    if (input) {
      field = document.createElement(input.multiline ? 'textarea' : 'input');
      field.className = 'dlg-input';
      if (!input.multiline) { field.type = 'text'; field.maxLength = 80; }
      else { field.rows = 6; field.readOnly = true; }
      field.value = input.value || '';
      if (input.placeholder) field.placeholder = input.placeholder;
      box.appendChild(field);
    }

    const actions = document.createElement('div');
    actions.className = 'dlg-actions';
    const cancelValue = input ? null : false;
    let cancelBtn = null;
    if (!hideCancel) {
      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'dlg-btn';
      cancelBtn.textContent = cancelLabel;
      actions.appendChild(cancelBtn);
    }
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'dlg-btn dlg-primary' + (danger ? ' dlg-danger' : '');
    okBtn.textContent = confirmLabel;
    actions.appendChild(okBtn);
    box.appendChild(actions);
    backdrop.appendChild(box);

    function finish(value) {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      updateScrollLock();
      if (previouslyFocused && previouslyFocused.focus) { try { previouslyFocused.focus(); } catch (e) {} }
      resolve(value);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(hideCancel ? (input ? field.value : true) : cancelValue); }
      else if (e.key === 'Enter' && !(field && field.tagName === 'TEXTAREA')) { e.preventDefault(); okBtn.click(); }
    }
    if (cancelBtn) cancelBtn.addEventListener('click', () => finish(cancelValue));
    okBtn.addEventListener('click', () => finish(input ? field.value : true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && cancelBtn) finish(cancelValue); });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(backdrop);
    updateScrollLock();
    if (field) { field.focus(); try { field.select(); } catch (e) {} } else okBtn.focus();
  });
}
function confirmDialog(opts) { return openDialog(opts); }
function promptDialog(opts) {
  return openDialog({
    ...opts,
    input: { value: opts.value, placeholder: opts.placeholder, multiline: !!opts.multiline }
  });
}

// --- Blocage du défilement derrière les fenêtres ouvertes ---
const MODAL_IDS = ['recipe-detail-modal', 'cooking-modal', 'select-meal-modal', 'custom-recipe-modal', 'saved-menus-modal', 'generate-modal', 'scan-modal', 'leftovers-modal', 'ticket-modal', 'pack-modal', 'onboarding-modal'];
function updateScrollLock() {
  const anyOpen = MODAL_IDS.some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  }) || !!document.querySelector('.dlg-backdrop');
  document.body.classList.toggle('scroll-locked', anyOpen);
}
function initModalBehaviour() {
  const closeButtons = {
    'custom-recipe-modal': 'btn-close-custom-recipe',
    'select-meal-modal': 'btn-close-select-meal',
    'saved-menus-modal': 'btn-close-saved-menus',
    'cooking-modal': 'btn-close-cooking',
    'recipe-detail-modal': 'btn-close-detail',
    'generate-modal': 'btn-close-generate',
    'scan-modal': 'btn-close-scan',
    'ticket-modal': 'btn-close-ticket',
    'pack-modal': 'btn-close-pack',
    'leftovers-modal': 'btn-close-leftovers'
  };
  // Les fenêtres où un appui involontaire sur le fond ne fait rien perdre se ferment en touchant le fond
  const closeOnBackdrop = ['recipe-detail-modal', 'select-meal-modal', 'saved-menus-modal'];
  MODAL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(updateScrollLock).observe(el, { attributes: true, attributeFilter: ['class'] });
    if (closeOnBackdrop.includes(id)) {
      el.addEventListener('click', (e) => {
        if (e.target === el) { const b = document.getElementById(closeButtons[id]); if (b) b.click(); }
      });
    }
  });
  // Touche Échap : ferme la fenêtre du dessus
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('.dlg-backdrop')) return;
    for (const id of MODAL_IDS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) {
        const b = document.getElementById(closeButtons[id]);
        if (b) b.click();
        break;
      }
    }
  });
  updateScrollLock();
}

// --- Annuler une action (menu vidé, repas retiré, articles décochés…) ---
function takeSnapshot() {
  return JSON.stringify({
    plan: state.plan,
    lockedSlots: state.lockedSlots,
    checkedGroceries: state.checkedGroceries,
    staples: state.staples,
    pantry: state.pantry,
    pantryNeeded: state.pantryNeeded
  });
}
function restoreSnapshot(snapshot) {
  try {
    const s = JSON.parse(snapshot);
    state.plan = sanitizePlan(s.plan);
    state.lockedSlots = sanitizeSlots(s.lockedSlots);
    state.checkedGroceries = sanitizeChecked(s.checkedGroceries);
    state.staples = sanitizeStaples(s.staples);
    state.pantry = sanitizeStringList(s.pantry, 400, 120);
    state.pantryNeeded = sanitizeStringList(s.pantryNeeded, 400, 120);
  } catch (e) { return; }
  saveToLocalStorage();
  renderAll();
}

const DEFAULT_RECIPES = window.DEFAULT_RECIPES || [];
const RECIPE_ALIASES = window.RECIPE_ALIASES || {};
const GL = window.GamelleLogic;
const GN = window.GamelleNutrition;
const GR = window.GamelleReceipt;
// Recettes fusionnées (doublons) : un ancien identifiant pointe vers la recette conservée
function resolveAlias(id) { return (typeof id === 'string' && RECIPE_ALIASES[id]) || id; }
function resolveAliasList(ids) {
  const seen = new Set();
  return (ids || []).map(resolveAlias).filter(id => { if (!id) return true; if (seen.has(id)) return false; seen.add(id); return true; });
}
const GRAND_FRAIS_RAYONS = window.GRAND_FRAIS_RAYONS || [];

// Constantes des jours de la semaine
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// État initial de l'application
let state = {
  portions: 4, // 2 dîners + 2 gamelles par défaut
  recipes: [],
  plan: [], // liste ordonnée d'identifiants de recettes choisies (sans restriction de jour ni de nombre)
  lockedSlots: [], // [slotIndex, ...] indices des plats verrouillés/gardés (non cuisinés)
  savedMenus: [], // [ { id, name, date, portions, plan, staples } ]
  staples: [], // Produits courants hors-recettes [ { id, name, checked } ]
  checkedGroceries: {}, // { 'item-key': true/false }
  activeFilter: 'all',
  sortOption: 'random',
  shuffleSeed: Math.floor(Math.random() * 1e9),
  searchQuery: '',
  selectingSlot: null,
  activeDetailRecipeId: null,
  cookingRecipe: null,
  cookingStepIndex: 0,
  activeTimers: {},
  wakeLock: null,
  // Synchronisation Foyer en Direct
  householdCode: safeGetItem('gamelle_household_code') || '',
  lastSyncTimestamp: parseInt(safeGetItem('gamelle_last_sync') || '0', 10),
  deviceId: safeGetItem('gamelle_device_id') || ('dev-' + Math.random().toString(36).substring(2, 9)),
  syncEventSource: null,
  syncDebounceTimer: null,
  favorites: [], // IDs des recettes favorites
  pantry: [],          // articles « déjà à la maison » mémorisés (identifiants d'articles de courses)
  pantryNeeded: [],    // articles qu'on veut quand même acheter (prioritaire sur placard / épices / base)
  spices: [],          // noms d'épices qu'on a à la maison
  stockBasics: false,  // ne pas lister huile, farine, sucre, vinaigre, moutarde…
  aisleOrder: [],      // ordre des rayons dans le magasin
  notes: {},           // { idRecette: { r: 1|-1|0, cooked: horodatage, t: horodatage } }
  genFilters: {},      // derniers filtres de « Composer mes 7 repas »
  off: {},             // cache Open Food Facts { article: { t, d } }
  leftovers: [],       // produits qu'on a à la maison (« Finir mes restes »)
  notify: true,        // prévenir le foyer quand on ajoute un produit / un repas
  memberName: '',      // prénom (facultatif) affiché dans les notifications
  weatherMood: null,   // météo de la semaine (jamais affichée : elle oriente seulement le tirage des repas)
  pantryStock: {},     // quantités en stock au placard { articleId: { qty, unit } } (facultatif)
  stapleHistory: {},   // produits courants ajoutés { nom: { n, last } } → « vos habituels »
  trips: [],           // dernières courses { t, total, est, items, r } → budget réaliste et stats par rayon
  priceBook: {},       // prix réels appris sur les tickets { article: { kg, u, n, t } }
  pantryExpiry: {},    // dates limites des articles du placard { article: timestamp }
  weeklyPack: [],      // « pack de la semaine » : produits achetés chaque semaine [{ name, qty }]
  feedback: true,      // petit son / vibration quand un rayon est terminé
  sync: { lastOk: 0, pending: false, fail: false }
};

// Catalogue : affichage progressif (24 plats à la fois)
const CATALOG_PAGE = 24;
let catalogLimit = CATALOG_PAGE;
let catalogFiltered = [];
let catalogObserver = null;
let pendingShare = null;
// ==========================================

// ==========================================
// APPARENCE (Clair / Sombre / Système)
// ==========================================
function renderThemeControl() {
  if (!window.gamelleTheme) return;
  const pref = window.gamelleTheme.get();
  document.querySelectorAll('[data-theme-pref]').forEach(btn => {
    const active = btn.dataset.themePref === pref;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const hint = document.getElementById('theme-hint');
  if (hint) {
    hint.textContent = pref === 'light' ? 'Toujours clair sur cet appareil'
      : pref === 'dark' ? 'Toujours sombre sur cet appareil'
      : 'Suit automatiquement le réglage de votre iPhone';
  }
}

function init() {
  const firstLaunch = safeGetItem('gamelle_plan') === null && !safeGetItem('gamelle_household_code'); // tout premier lancement
  // Persister deviceId pour distinguer nos propres messages de ceux du conjoint
  if (!safeGetItem('gamelle_device_id')) {
    safeSetItem('gamelle_device_id', state.deviceId);
  }

  loadFromLocalStorage();
  checkUrlParamsForSharing();
  setupEventListeners();
  setupPackModal();
  setupOnboarding();
  const fb = document.getElementById('chk-feedback');
  if (fb) { fb.checked = state.feedback !== false; fb.addEventListener('change', () => { state.feedback = fb.checked; safeSetItem('gamelle_feedback', fb.checked ? '1' : '0'); if (fb.checked) tickFeedback(); }); }
  purgeOldPantry();
  renderAll();
  renderThemeControl();
  initModalBehaviour();
  initConnectivityNotices();
  restoreLastTab();
  registerServiceWorker();
  initUpdateCard();
  updateQRCode();
  initHouseholdSync();
  updateSyncStatusUI();

  // Écouter le retour au premier plan (iPhone Safari) pour récupérer les courses fraîches
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      pollLatestSync();
      checkForAppUpdate();
    }
  });

  applyPendingShare();
  scheduleRecipeCosts();
  maybeShowOnboarding(firstLaunch);
}

// Dernier onglet ouvert : on y revient à la réouverture de l'app
function restoreLastTab() {
  const last = safeGetItem('gamelle_tab');
  if (last && last !== 'tab-planning' && document.getElementById(last)) switchTab(last);
}

function initConnectivityNotices() {
  window.addEventListener('offline', () => showToast('Hors ligne : vos listes restent disponibles'));
  window.addEventListener('online', () => {
    showToast('Connexion rétablie');
    pollLatestSync();
  });
}

function loadFromLocalStorage() {
  // Recettes : catalogue + recettes maison (validées)
  state.recipes = [...DEFAULT_RECIPES, ...sanitizeRecipeList(readJSON('gamelle_custom_recipes', []))];

  const savedPortions = parseInt(safeGetItem('gamelle_portions'), 10);
  if (Number.isFinite(savedPortions)) state.portions = Math.min(12, Math.max(1, savedPortions));

  // Plats gardés (chargés avant toute génération de menu)
  state.lockedSlots = sanitizeSlots(readJSON('gamelle_locked_slots', []));
  state.favorites = resolveAliasList(sanitizeStringList(readJSON('gamelle_favorites', [])));
  state.notes = sanitizeNotes(readJSON('gamelle_notes', {}));
  state.genFilters = sanitizeGenFilters(readJSON('gamelle_gen_filters', {}));
  state.pantry = sanitizeStringList(readJSON('gamelle_pantry', []), 400, 120);
  state.pantryNeeded = sanitizeStringList(readJSON('gamelle_pantry_needed', []), 400, 120);
  {
    const saved = readJSON('gamelle_spices', null);
    if (Array.isArray(saved)) state.spices = sanitizeSpices(saved);
    else { // ancien réglage « niveau d'épices » → liste d'épices
      const lvl = Math.round(cleanNum(safeGetItem('gamelle_spice_level'), 0, 2, 0));
      state.spices = lvl >= 2 ? [...GL.SPICES_FULL] : lvl === 1 ? [...GL.SPICES_BASIC] : [];
    }
  }
  state.stockBasics = safeGetItem('gamelle_stock_basics') === '1';
  state.aisleOrder = sanitizeStringList(readJSON('gamelle_aisle_order', []), 10, 30);
  state.off = sanitizeOffCache(readJSON('gamelle_off_cache', {}));
  state.leftovers = sanitizeStringList(readJSON('gamelle_leftovers', []), 30, 60);
  state.pantryStock = sanitizeStock(readJSON('gamelle_pantry_stock', {}));
  state.stapleHistory = sanitizeStapleHistory(readJSON('gamelle_staple_history', {}));
  state.trips = sanitizeTrips(readJSON('gamelle_trips', []));
  state.priceBook = sanitizePriceBook(readJSON('gamelle_price_book', {}));
  state.pantryExpiry = sanitizeExpiry(readJSON('gamelle_pantry_expiry', {}));
  state.weeklyPack = sanitizePack(readJSON('gamelle_weekly_pack', []));
  state.feedback = safeGetItem('gamelle_feedback') !== '0';
  state.sync.lastOk = parseInt(safeGetItem('gamelle_sync_ok') || '0', 10) || 0;
  state.notify = safeGetItem('gamelle_notify') !== '0';
  state.memberName = cleanStr(safeGetItem('gamelle_member_name') || '', 30);
  { const w = readJSON('gamelle_weather', null); if (w && Number.isFinite(w.t) && w.w) state.weatherMood = GL.weatherMood(w.w); }

  // Planning (support migration objet {Lundi: ...} -> tableau [])
  let plan = readJSON('gamelle_plan', null);
  if (plan && !Array.isArray(plan) && typeof plan === 'object') plan = Object.values(plan);
  state.plan = Array.isArray(plan) ? sanitizePlan(plan).map(resolveAlias) : [];
  // Premier lancement seulement : un menu d'exemple. Un menu volontairement vidé reste vide (écran d'accueil du Planning).
  if (state.plan.length === 0 && plan === null) generateBalancedWeek();

  state.savedMenus = sanitizeSavedMenus(readJSON('gamelle_saved_menus', [])).map(m => ({ ...m, plan: m.plan.map(resolveAlias) }));
  state.staples = sanitizeStaples(readJSON('gamelle_staples', []));
  state.checkedGroceries = sanitizeChecked(readJSON('gamelle_checked', {}));
}

// Écrit tout l'état local (sans diffuser) — utilisé aussi quand on applique une synchro reçue ou une restauration
function persistLocal() {
  safeSetItem('gamelle_portions', state.portions);
  safeSetItem('gamelle_plan', JSON.stringify(state.plan));
  safeSetItem('gamelle_saved_menus', JSON.stringify(state.savedMenus));
  safeSetItem('gamelle_staples', JSON.stringify(state.staples));
  safeSetItem('gamelle_checked', JSON.stringify(state.checkedGroceries));
  safeSetItem('gamelle_locked_slots', JSON.stringify(state.lockedSlots || []));
  safeSetItem('gamelle_favorites', JSON.stringify(state.favorites || []));
  safeSetItem('gamelle_notes', JSON.stringify(state.notes || {}));
  safeSetItem('gamelle_gen_filters', JSON.stringify(state.genFilters || {}));
  safeSetItem('gamelle_pantry', JSON.stringify(state.pantry || []));
  safeSetItem('gamelle_pantry_needed', JSON.stringify(state.pantryNeeded || []));
  safeSetItem('gamelle_pantry_stock', JSON.stringify(state.pantryStock || {}));
  safeSetItem('gamelle_staple_history', JSON.stringify(state.stapleHistory || {}));
  safeSetItem('gamelle_trips', JSON.stringify(state.trips || []));
  safeSetItem('gamelle_price_book', JSON.stringify(state.priceBook || {}));
  safeSetItem('gamelle_pantry_expiry', JSON.stringify(state.pantryExpiry || {}));
  safeSetItem('gamelle_weekly_pack', JSON.stringify(state.weeklyPack || []));
  safeSetItem('gamelle_spices', JSON.stringify(state.spices || []));
  safeSetItem('gamelle_leftovers', JSON.stringify(state.leftovers || []));
  safeSetItem('gamelle_stock_basics', state.stockBasics ? '1' : '0');
  safeSetItem('gamelle_aisle_order', JSON.stringify(state.aisleOrder || []));
  const customList = (state.recipes || []).filter(r => r.id.startsWith('custom-'));
  safeSetItem('gamelle_custom_recipes', JSON.stringify(customList));
}
function saveToLocalStorage() {
  persistLocal();
  updateQRCode();
  broadcastSync();
}

function checkUrlParamsForSharing() {
  const params = new URLSearchParams(window.location.search);
  const household = cleanStr(params.get('household') || '', 60).toUpperCase();
  const menuParam = params.get('menu');
  if (!household && !menuParam) return;

  pendingShare = { household: household || null, menu: null };

  if (menuParam) {
    const ids = menuParam.split(',').map(s => resolveAlias(cleanStr(s, 80))).filter(Boolean).slice(0, 60);
    let staples = null;
    const rawStaples = params.get('staples');
    if (rawStaples) {
      try {
        const decoded = JSON.parse(rawStaples);
        if (Array.isArray(decoded)) {
          staples = sanitizeStaples(decoded.map(item => (
            typeof item === 'string' ? { name: item } : { name: item && item.n, checked: !!item && item.c === 1 }
          )));
        }
      } catch (e) {
        console.warn('Erreur lecture des articles courants partagés', e);
      }
    }
    pendingShare.menu = {
      ids,
      portions: Math.round(cleanNum(params.get('portions'), 1, 12, state.portions)),
      staples
    };
  }

  // L'adresse est nettoyée tout de suite : le code foyer ne reste pas dans l'historique
  window.history.replaceState({}, document.title, window.location.pathname);
}

// Importer un menu partagé ou rejoindre un foyer : toujours avec l'accord de l'utilisateur
async function applyPendingShare() {
  if (!pendingShare) return;
  const share = pendingShare;
  pendingShare = null;

  if (share.menu && share.menu.ids.length > 0) {
    const ok = await confirmDialog({
      title: 'Importer le menu partagé ?',
      message: `${share.menu.ids.length} repas et la liste de courses associée. Votre planning actuel sera remplacé.`,
      confirmLabel: 'Importer'
    });
    if (ok) {
      state.plan = share.menu.ids;
      state.lockedSlots = [];
      state.checkedGroceries = {};
      state.portions = share.menu.portions;
      if (share.menu.staples) state.staples = share.menu.staples;
      saveToLocalStorage();
      renderAll();
      showToast('Menu et courses importés');
    }
  }

  if (share.household && share.household !== state.householdCode) {
    const ok = await confirmDialog({
      title: 'Rejoindre ce foyer ?',
      message: `Code « ${share.household} ». Votre menu, vos recettes et vos courses seront synchronisés avec ce foyer.`,
      confirmLabel: 'Rejoindre'
    });
    if (ok) {
      if (isWeakHouseholdCode(share.household)) showToast('Code trop faible : demandez à l\'autre téléphone de changer de code', { duration: 6000 });
      else setHouseholdCode(share.household);
    }
  }
}

// ==========================================
// GESTION DES REPAS & PLANNING
// ==========================================
function generateBalancedWeek(forceAll = false, filtersArg) {
  const filters = filtersArg || state.genFilters || {};
  const targetCount = 7;
  const lockedIndices = (!forceAll && Array.isArray(state.lockedSlots)) ? state.lockedSlots : [];

  // Si tous les plats sont verrouillés, avertir l'utilisateur
  if (lockedIndices.length >= targetCount && state.plan.length >= targetCount) {
    showToast('Tous vos repas sont gardés : retirez-en un pour renouveler le menu');
    return;
  }

  // Plats verrouillés à préserver
  const lockedRecipeIds = new Set();
  const newPlan = [];
  for (let i = 0; i < targetCount; i++) {
    if (lockedIndices.includes(i) && state.plan[i]) {
      newPlan[i] = state.plan[i];
      lockedRecipeIds.add(state.plan[i]);
    } else {
      newPlan[i] = null;
    }
  }

  // Tirage proportionnel à la place de chaque type de plat dans le catalogue (filtré), sans doublon
  const need = newPlan.filter(x => x === null).length;
  const pickOpts = {
    recipes: state.recipes, count: need, filters, excludeIds: [...lockedRecipeIds],
    favorites: state.favorites, notes: state.notes, mood: state.weatherMood
  };
  const budgetMax = Number(filters.budgetMax) || 0;
  if (budgetMax > 0) { // « 7 repas à moins de X € » : on remplace les plats les plus chers
    pickOpts.budget = budgetMax; pickOpts.costOf = recipeMealCost;
    pickOpts.fixedCost = [...lockedRecipeIds].reduce((sum, id) => { const r = state.recipes.find(x => x.id === id); return sum + (r ? recipeMealCost(r) : 0); }, 0);
  }
  const res = GL.pickMenu(pickOpts);
  state._budgetMsg = budgetMax > 0 && res.cost != null
    ? (res.withinBudget ? `Menu à ≈ ${euro(res.cost + (pickOpts.fixedCost || 0))} (budget ${euro(budgetMax)})` : `Impossible sous ${euro(budgetMax)} avec ces filtres : ≈ ${euro(res.cost + (pickOpts.fixedCost || 0))} (les moins chers choisis)`)
    : null;
  if (res.ids.length === 0 && need > 0) {
    showToast('Aucun plat ne correspond à ces filtres');
    return;
  }
  let k = 0;
  for (let i = 0; i < targetCount; i++) if (newPlan[i] === null) newPlan[i] = res.ids[k++] || null;
  if (res.ids.length < need) showToast(`Seulement ${res.ids.length} plat${res.ids.length > 1 ? 's' : ''} correspond${res.ids.length > 1 ? 'ent' : ''} à vos filtres`);

  state.plan = newPlan.filter(Boolean);
  state.lockedSlots = state.lockedSlots.filter(idx => idx < state.plan.length);
  state.checkedGroceries = {};
  saveToLocalStorage();
  renderAll();
}

function toggleLockSlot(slotIndex) {
  if (!Array.isArray(state.lockedSlots)) state.lockedSlots = [];
  const isCurrentlyLocked = state.lockedSlots.includes(slotIndex);
  if (isCurrentlyLocked) {
    state.lockedSlots = state.lockedSlots.filter(s => s !== slotIndex);
  } else {
    state.lockedSlots.push(slotIndex);
  }
  saveToLocalStorage();
  renderPlanning();
  renderGroceries();
  broadcastSync();
  showToast(!isCurrentlyLocked ? 'Repas gardé : ses ingrédients sont retirés des courses' : 'Repas remis dans les courses');
}

function removeMealSlot(slotIndex) {
  const snapshot = takeSnapshot();
  state.plan.splice(slotIndex, 1);
  if (Array.isArray(state.lockedSlots)) {
    state.lockedSlots = state.lockedSlots
      .filter(s => s !== slotIndex)
      .map(s => (s > slotIndex ? s - 1 : s));
  }
  saveToLocalStorage();
  renderPlanning();
  renderGroceries();
  showToast('Repas retiré', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
}

async function clearMenu() {
  if (state.plan.length === 0) { showToast('Le menu est déjà vide'); return; }
  const ok = await confirmDialog({
    title: 'Vider le menu ?',
    message: 'Tous les repas seront retirés de votre planning.',
    confirmLabel: 'Vider',
    danger: true
  });
  if (!ok) return;
  const snapshot = takeSnapshot();
  state.plan = [];
  state.lockedSlots = [];
  state.checkedGroceries = {};
  saveToLocalStorage();
  renderAll();
  showToast('Menu vidé', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
}

async function saveCurrentMenu() {
  if (!state.plan.some(Boolean)) { showToast("Ajoutez d'abord des repas au menu"); return; }
  const defaultTitle = `Menu du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
  const name = await promptDialog({
    title: 'Enregistrer ce menu',
    message: 'Donnez-lui un nom pour le retrouver dans « Mes menus ».',
    value: defaultTitle,
    confirmLabel: 'Enregistrer'
  });
  if (name === null || !cleanStr(name, 80)) return;

  const newMenu = {
    id: 'menu_' + Date.now(),
    name: cleanStr(name, 80),
    date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    portions: state.portions,
    plan: Array.isArray(state.plan) ? [...state.plan] : Object.values(state.plan),
    staples: [...state.staples]
  };

  if (!state.savedMenus) state.savedMenus = [];
  state.savedMenus.unshift(newMenu);
  if (state.savedMenus.length > 15) state.savedMenus.pop();
  saveToLocalStorage();
  renderPlanning();
  showToast(`Menu « ${newMenu.name} » enregistré`);
}

function openSavedMenusModal() {
  const modal = document.getElementById('saved-menus-modal');
  if (!modal) return;
  renderSavedMenusList();
  modal.classList.remove('hidden');
}

function closeSavedMenusModal() {
  const modal = document.getElementById('saved-menus-modal');
  if (modal) modal.classList.add('hidden');
}

function renderSavedMenusList() {
  const container = document.getElementById('saved-menus-list');
  if (!container) return;
  container.innerHTML = '';

  if (!state.savedMenus || state.savedMenus.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400 space-y-2">
        <span class="text-3xl block">📁</span>
        <p class="text-xs font-semibold text-slate-600">Aucun menu sauvegardé pour le moment</p>
        <p class="text-[11px]">Enregistrez votre menu en cours pour le recharger quand vous voulez sans perdre vos plats.</p>
      </div>
    `;
    return;
  }

  state.savedMenus.forEach(menu => {
    const planArr = Array.isArray(menu.plan) ? menu.plan : Object.values(menu.plan || {});
    const count = planArr.filter(Boolean).length;
    const card = document.createElement('div');
    card.className = 'ios-card p-3.5 flex items-center justify-between gap-3 border border-slate-100 hover:border-brand-200 transition-all';
    card.innerHTML = `
      <div class="flex-1 min-w-0">
        <h4 class="font-bold text-xs text-slate-800 truncate">${esc(menu.name)}</h4>
        <div class="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
          <span>📅 ${esc(menu.date)}</span>
          <span>•</span>
          <span class="font-semibold text-emerald-700">${count} repas</span>
          <span>•</span>
          <span>${menu.portions || 4} parts</span>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button class="btn-load-saved-menu bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs px-2.5 py-1.5 rounded-lg active:scale-95 transition-all" data-id="${esc(menu.id)}">
          Charger
        </button>
        <button class="btn-delete-saved-menu text-slate-300 hover:text-red-500 text-xs px-2 py-1.5" data-id="${esc(menu.id)}" title="Supprimer" aria-label="Supprimer ce menu">
          🗑️
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.btn-load-saved-menu').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const menu = state.savedMenus.find(m => m.id === id);
      if (!menu) return;
      const ok = await confirmDialog({
        title: `Charger « ${menu.name} » ?`,
        message: 'Votre planning actuel sera remplacé par ce menu.',
        confirmLabel: 'Charger'
      });
      if (!ok) return;
      const snapshot = takeSnapshot();
      state.plan = Array.isArray(menu.plan) ? [...menu.plan] : Object.values(menu.plan || {}).filter(Boolean);
      state.lockedSlots = [];
      state.portions = menu.portions || state.portions;
      if (menu.staples && Array.isArray(menu.staples)) state.staples = [...menu.staples];
      saveToLocalStorage();
      renderAll();
      closeSavedMenusModal();
      showToast(`Menu « ${menu.name} » chargé`, { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
    });
  });

  container.querySelectorAll('.btn-delete-saved-menu').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const before = JSON.stringify(state.savedMenus);
      state.savedMenus = state.savedMenus.filter(m => m.id !== id);
      saveToLocalStorage();
      renderSavedMenusList();
      renderPlanning();
      showToast('Menu supprimé', { action: 'Annuler', onAction: () => {
        state.savedMenus = sanitizeSavedMenus(JSON.parse(before));
        saveToLocalStorage();
        renderSavedMenusList();
        renderPlanning();
      } });
    });
  });
}

// (moteur de la liste de courses : voir groceries.js)


// ==========================================
// PLACARD, ÉPICES, ORDRE DES RAYONS, AVIS
// ==========================================
function currentSplit() {
  return GL.splitGroceries(computeGroceries(), {
    pantry: state.pantry, needed: state.pantryNeeded, spices: state.spices, stockBasics: state.stockBasics
  });
}

function orderedRayons() {
  const all = [...GRAND_FRAIS_RAYONS];
  const order = state.aisleOrder || [];
  return all.sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

const HOME_REASONS = { placard: 'placard', 'épices': 'épices', base: 'produits de base' };
function renderAtHomeSection(container, atHome) {
  if (!atHome.length) return;
  const det = document.createElement('details');
  det.className = 'ios-card overflow-hidden';
  det.innerHTML = `<summary class="p-3 text-xs font-bold text-slate-600 cursor-pointer flex items-center gap-2"><span class="text-slate-400">${ICONS.box}</span> Déjà à la maison <span class="ml-auto text-[10px] font-semibold text-slate-400">${atHome.length} article${atHome.length > 1 ? 's' : ''} non listé${atHome.length > 1 ? 's' : ''}</span></summary><div class="divide-y divide-slate-100"></div>`;
  const list = det.querySelector('div');
  atHome.forEach(({ item, reason }) => {
    const row = document.createElement('div');
    row.className = 'p-3 flex items-center justify-between gap-3';
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-1.5 flex-wrap">
          <span class="font-bold text-xs text-slate-500">${item.formattedQty || ''}</span>
          <span class="text-xs text-slate-700 font-medium">${esc(item.name)}</span>
        </div>
        <span class="text-[10px] text-slate-400">${HOME_REASONS[reason] || ''}</span>
      </div>
      <button class="btn-need text-[11px] font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-1 rounded-lg" data-id="${esc(item.id)}">Il m'en faut</button>`;
    list.appendChild(row);
  });
  container.appendChild(det);
  det.querySelectorAll('.btn-need').forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    state.pantry = state.pantry.filter(x => x !== id);
    delete state.pantryExpiry[id];
    if (!state.pantryNeeded.includes(id)) state.pantryNeeded.push(id);
    saveToLocalStorage();
    renderGroceries();
  }));
}

// Saisie manuelle du total d'un ticket (sans photo)
async function recordTicketManually() {
    const v = await promptDialog({ title: 'Ticket de caisse', message: 'Total payé (en €) : il sert à ajuster le budget estimé à vos vrais prix.', placeholder: 'ex. 63,40', confirmLabel: 'Enregistrer' });
    if (v === null || v === false) return;
    const total = parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(total) || total <= 0 || total > 5000) { showToast('Montant non reconnu'); return; }
    const split = currentSplit();
    state.trips.push({ t: Date.now(), total: Math.round(total * 100) / 100, est: GL.estimateCost(split.toBuy), items: split.toBuy.length, r: {} });
    state.trips = state.trips.slice(-30);
    saveToLocalStorage(); renderGroceries();
    showToast(`Ticket de ${total.toFixed(2).replace('.', ',')} € enregistré`);
}

// Budget : courbe des derniers tickets, moyenne par ticket et par semaine
function renderBudgetCard() {
  const box = document.getElementById('budget-card-body');
  if (!box) return;
  const st = GL.budgetStats(state.trips);
  if (!st.count) { box.innerHTML = '<p class="text-xs text-slate-500">Notez le total de vos tickets (onglet Courses, menu « … » → « Noter le ticket de caisse ») : l\'application affichera ici vos dépenses.</p>'; return; }
  const W = 280, H = 70, P = 8, vals = st.last.map(t => t.total);
  const max = Math.max(...vals), min = Math.min(...vals), span = Math.max(1, max - min);
  const pts = vals.map((v, i) => [vals.length === 1 ? W / 2 : P + i * (W - 2 * P) / (vals.length - 1), H - P - ((v - min) / span) * (H - 2 * P)]);
  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-[70px]" role="img" aria-label="Évolution de vos derniers tickets de caisse">
      ${pts.length > 1 ? `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="currentColor"/>`).join('')}
    </svg>
    <p class="text-xs text-slate-600 mt-1.5">Ticket moyen <b>${Math.round(st.avgTicket)} €</b>${st.perWeek ? ` · environ <b>${Math.round(st.perWeek)} € par semaine</b>` : ''} · dernier ticket ${Math.round(vals[vals.length - 1])} €</p>
    ${budgetDetailsHTML(st)}`;
}
// Statistiques issues des tickets lus : dépenses par rayon et achats fréquents (prix réels appris)
function budgetDetailsHTML(st) {
  const money = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
  const byRayon = {};
  st.last.forEach(t => Object.entries(t.r || {}).forEach(([k, v]) => { byRayon[k] = (byRayon[k] || 0) + v; }));
  const names = Object.fromEntries(GRAND_FRAIS_RAYONS.map(r => [r.id, r.name]));
  const rows = Object.entries(byRayon).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  let html = '';
  if (rows.length) {
    const max = rows[0][1], sum = rows.reduce((s, r) => s + r[1], 0);
    html += `<p class="text-[12px] font-bold uppercase tracking-wider text-slate-400 mt-3 mb-1">Dépenses par rayon (tickets lus)</p>` + rows.map(([k, v]) => `
      <div class="flex items-center gap-2 text-xs py-0.5"><span class="w-28 truncate text-slate-600">${esc(names[k] || 'Autres')}</span>
        <span class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><span class="block h-full rounded-full bg-brand-600" style="width:${Math.max(4, Math.round(v / max * 100))}%"></span></span>
        <span class="w-20 text-right font-semibold text-slate-700">${money(v)} € <span class="text-slate-400 font-normal">${Math.round(v / sum * 100)} %</span></span></div>`).join('');
  }
  const book = Object.entries(state.priceBook || {}).sort((a, b) => b[1].n - a[1].n || b[1].t - a[1].t).slice(0, 5);
  if (book.length) {
    html += `<p class="text-[12px] font-bold uppercase tracking-wider text-slate-400 mt-3 mb-1">Vos achats fréquents (prix réels)</p>` + book.map(([id, b]) => `
      <div class="flex items-center justify-between text-xs py-0.5"><span class="text-slate-700 truncate">${esc(id.charAt(0).toUpperCase() + id.slice(1))}</span>
        <span class="text-slate-500 whitespace-nowrap">${b.kg ? money(b.kg) + ' €/kg' : money(b.u) + ' €/pièce'} · ${b.n} ticket${b.n > 1 ? 's' : ''}</span></div>`).join('');
  }
  return html;
}

function renderPantryCard() {
  const body = document.getElementById('pantry-body');
  const summary = document.getElementById('pantry-summary');
  if (!body) return;
  if (summary) summary.textContent = `${state.spices.length} épice${state.spices.length > 1 ? 's' : ''} · ${state.pantry.length} en placard`;
  const chip = (on) => 'px-2.5 py-1 rounded-full font-semibold border ' + (on ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-slate-500 border-slate-200');
  const rayons = orderedRayons();
  const h = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
  body.innerHTML = `
    <div class="space-y-1.5">
      <div class="flex items-center justify-between"><p class="${h}">Mes épices</p>
        <span class="text-[10px] text-slate-400"><button type="button" class="spice-all underline" data-all="1">tout</button> · <button type="button" class="spice-all underline" data-all="0">aucune</button></span></div>
      <div class="flex gap-1.5 flex-wrap">${GL.SPICES.map(sp => { const on = state.spices.includes(sp.name); return `<button type="button" class="spice-chip ${chip(on)}" data-name="${esc(sp.name)}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(sp.label)}</button>`; }).join('')}</div>
      <p class="text-[10px] text-slate-400">Une épice « ✓ » n'est plus listée dans les courses.</p>
    </div>
    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="chk-stock-basics" class="w-4 h-4 rounded" ${state.stockBasics ? 'checked' : ''}>
      <span class="text-slate-700 font-semibold">Huile, farine, sucre, vinaigres, moutarde à la maison</span></label>
    ${state.pantry.length ? `<div class="space-y-1.5"><p class="${h}">Mon placard</p>
      <div class="flex gap-1.5 flex-wrap">${state.pantry.map(id => { const st = state.pantryStock[id]; const q = st ? ' · ' + formatQuantityAndUnit(st.qty, st.unit) : ''; const ex = state.pantryExpiry[id]; const late = ex && ex <= Date.now() + 2 * 86400000; return `<span class="inline-flex items-center rounded-full border ${late ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}"><button type="button" class="pantry-qty pl-2.5 pr-1 py-1" data-id="${esc(id)}" aria-label="Quantité en stock : ${esc(id)}">${esc(id.charAt(0).toUpperCase() + id.slice(1))}${esc(q)} ✎</button>${ex ? `<button type="button" class="pantry-date px-1 py-1 text-[12px] font-semibold" data-id="${esc(id)}" aria-label="Date limite de ${esc(id)}">avant ${esc(dayLabel(ex))}</button>` : ''}<button type="button" class="pantry-remove pr-2.5 pl-1 py-1" data-id="${esc(id)}" aria-label="Retirer ${esc(id)} du placard">✕</button></span>`; }).join('')}</div></div>` : ''}
    <div class="flex gap-1.5 flex-wrap pt-1">
      <button type="button" class="off-load px-2.5 py-1.5 rounded-full font-semibold border border-slate-200 bg-white text-slate-600">Nutri-Score de ma liste</button>
      <button type="button" class="off-scan px-2.5 py-1.5 rounded-full font-semibold border border-slate-200 bg-white text-slate-600">Scanner un produit</button>
    </div>
    <details class="pt-1"><summary class="${h} cursor-pointer">Ordre des rayons dans mon magasin</summary>
      <div class="space-y-1 mt-1.5">${rayons.map((r, i) => `<div class="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1">${rayonIcon(r)}<span class="flex-1 text-slate-700">${esc(r.name)}</span>
        <button type="button" class="aisle-move px-1.5 text-slate-500" data-id="${r.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">▲</button>
        <button type="button" class="aisle-move px-1.5 text-slate-500" data-id="${r.id}" data-dir="1" ${i === rayons.length - 1 ? 'disabled' : ''} aria-label="Descendre">▼</button></div>`).join('')}</div>
    </details>`;
}

function setupPantryCard() {
  const body = document.getElementById('pantry-body');
  if (!body) return;
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('pantry-date')) { editExpiry(t.dataset.id); return; }
    if (t.classList.contains('pantry-qty')) {
      const id = t.dataset.id;
      promptDialog({ title: 'Quantité en stock', message: `Combien de « ${id} » avez-vous ? (ex. 800 g, 1,5 L, 6). Elle diminue quand vous cuisinez une recette. Vide = ne pas suivre.`, value: state.pantryStock[id] ? formatQuantityAndUnit(state.pantryStock[id].qty, state.pantryStock[id].unit) : '' }).then(v => {
        if (v === null || v === false) return;
        const parsed = GL.parseStockInput(String(v).replace(/\s*(pièces?|pcs)$/i, ''));
        if (String(v).trim() === '') delete state.pantryStock[id];
        else if (parsed) state.pantryStock[id] = parsed;
        else { showToast('Quantité non reconnue'); return; }
        saveToLocalStorage(); renderGroceries();
        if (!state.pantryExpiry[id]) editExpiry(id);
      });
      return;
    }
    if (t.classList.contains('off-load')) { loadOffInfoForList(); return; }
    if (t.classList.contains('off-scan')) { openScanModal(); return; }
    if (t.classList.contains('spice-chip')) {
      const n = t.dataset.name;
      state.spices = state.spices.includes(n) ? state.spices.filter(x => x !== n) : [...state.spices, n];
      state.pantryNeeded = state.pantryNeeded.filter(id => id !== n.toLowerCase());
    } else if (t.classList.contains('spice-all')) {
      state.spices = t.dataset.all === '1' ? [...GL.SPICES_FULL] : [];
      state.pantryNeeded = [];
    } else if (t.classList.contains('aisle-move')) {
      const ids = orderedRayons().map(r => r.id);
      const i = ids.indexOf(t.dataset.id), j = i + Number(t.dataset.dir);
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      state.aisleOrder = ids;
    } else if (t.classList.contains('pantry-remove')) {
      delete state.pantryExpiry[t.dataset.id];
      state.pantry = state.pantry.filter(x => x !== t.dataset.id);
    } else return;
    saveToLocalStorage();
    renderGroceries();
  });
  body.addEventListener('change', (e) => {
    if (e.target.id === 'chk-stock-basics') {
      state.stockBasics = e.target.checked;
      saveToLocalStorage();
      renderGroceries();
    }
  });
}

// --- Avis & historique d'une recette ---
function setNote(recipeId, patch, silent) {
  if (!recipeId) return;
  const cur = state.notes[recipeId] || { r: 0, cooked: 0, t: 0 };
  state.notes[recipeId] = { ...cur, ...patch, t: Date.now() };
  if (!state.notes[recipeId].r && !state.notes[recipeId].cooked) delete state.notes[recipeId];
  saveToLocalStorage();
  if (!silent) renderNotesRow();
}
function renderNotesRow() {
  const id = state.activeDetailRecipeId;
  const n = (id && state.notes[id]) || { r: 0, cooked: 0 };
  const like = document.getElementById('btn-note-like');
  const dis = document.getElementById('btn-note-dislike');
  const info = document.getElementById('detail-notes-info');
  if (!like || !dis || !info) return;
  const on = 'border-emerald-300 bg-emerald-50 text-emerald-800';
  like.className = like.className.replace(on, '').trim() + (n.r === 1 ? ' ' + on : '');
  dis.className = dis.className.replace('border-rose-300 bg-rose-50 text-rose-700', '').trim() + (n.r === -1 ? ' border-rose-300 bg-rose-50 text-rose-700' : '');
  if (n.cooked) {
    const days = Math.floor((Date.now() - n.cooked) / 86400000);
    info.textContent = days <= 0 ? 'Cuisiné aujourd\'hui' : `Cuisiné il y a ${days} j`;
  } else info.textContent = '';
}
// Stock dégressif : ce que la recette consomme est retiré des quantités du placard ; un article épuisé repasse dans les courses
function consumeStockForRecipe(recipe) {
  if (!recipe || !Object.keys(state.pantryStock || {}).length) return [];
  const ratio = state.portions / (recipe.basePortions || 4);
  const used = (recipe.ingredients || []).map(ing => {
    const n = normalizeIngredient(ing);
    const u = canonicalUnit(ing.unit), q = (Number(ing.quantity) || 0) * ratio;
    const id = n.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (u === 'g') return { id, qty: q, unit: 'g' };
    if (u === 'kg') return { id, qty: q * 1000, unit: 'g' };
    if (u === 'ml') return { id, qty: q, unit: 'ml' };
    if (u === 'cl') return { id, qty: q * 10, unit: 'ml' };
    if (u === 'l') return { id, qty: q * 1000, unit: 'ml' };
    return { id, qty: q, unit: 'piece' };
  });
  const r = GL.consumeStock(state.pantryStock, used);
  state.pantryStock = r.stock;
  r.depleted.forEach(id => {
    state.pantry = state.pantry.filter(x => x !== id);
    delete state.pantryExpiry[id];
    if (!state.pantryNeeded.includes(id)) state.pantryNeeded.push(id);
  });
  saveToLocalStorage(); renderGroceries();
  return r.depleted.map(id => id.charAt(0).toUpperCase() + id.slice(1));
}
function setupNotesRow() {
  const like = document.getElementById('btn-note-like');
  const dis = document.getElementById('btn-note-dislike');
  const cooked = document.getElementById('btn-note-cooked');
  if (!like) return;
  like.addEventListener('click', () => { const id = state.activeDetailRecipeId; setNote(id, { r: (state.notes[id] && state.notes[id].r === 1) ? 0 : 1 }); });
  dis.addEventListener('click', () => { const id = state.activeDetailRecipeId; setNote(id, { r: (state.notes[id] && state.notes[id].r === -1) ? 0 : -1 }); });
  cooked.addEventListener('click', () => {
    setNote(state.activeDetailRecipeId, { cooked: Date.now() });
    const out = consumeStockForRecipe(state.recipes.find(r => r.id === state.activeDetailRecipeId));
    showToast(out.length ? `Cuisiné. Il n'y a plus : ${out.join(', ')} (ajouté aux courses)` : 'Noté : cuisiné aujourd\'hui', { duration: out.length ? 6000 : undefined });
  });
}

// --- Fenêtre « Composer mes 7 repas » ---
let genDraft = {};
function genChipsHTML(group, items, selected) {
  return items.map(it => `<button type="button" class="gen-chip px-2.5 py-1.5 rounded-full font-semibold border ${selected.includes(it.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'}" data-group="${group}" data-value="${it.id}">${it.emoji ? it.emoji + ' ' : ''}${esc(it.label)}</button>`).join('');
}
function genFlagHTML(key, label) {
  return `<button type="button" class="gen-flag px-2.5 py-1.5 rounded-full font-semibold border ${genDraft[key] ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'}" data-flag="${key}">${label}</button>`;
}
function renderGenerateModal() {
  const body = document.getElementById('gen-body');
  if (!body) return;
  const d = genDraft;
  const cur = GL.currentSeason();
  const curS = GL.SEASONS.find(x => x.id === cur);
  body.innerHTML = `
    <div class="space-y-1.5"><p class="font-bold text-slate-700">Saison <button type="button" id="btn-gen-current-season" class="ml-1 text-[10px] font-semibold text-brand-700 underline">saison actuelle</button></p>
      <div class="flex gap-1.5 flex-wrap">${genChipsHTML('seasons', GL.SEASONS, d.seasons || [])}</div></div>
    <div class="space-y-1.5"><p class="font-bold text-slate-700">Type de plat</p>
      <div class="flex gap-1.5 flex-wrap">${genChipsHTML('types', [{ id: 'volaille', label: 'Volaille', emoji: '🍗' }, { id: 'viande', label: 'Viande', emoji: '🥩' }, { id: 'poisson', label: 'Poisson', emoji: '🐟' }, { id: 'vege', label: 'Végétarien', emoji: '🌱' }], d.types || [])}</div></div>
    <div class="space-y-1.5"><p class="font-bold text-slate-700">Style de cuisine</p>
      <div class="flex gap-1.5 flex-wrap">${genChipsHTML('styles', GL.STYLES, d.styles || [])}</div></div>
    <div class="space-y-1.5"><p class="font-bold text-slate-700">Pratique</p>
      <div class="flex gap-1.5 flex-wrap">${genFlagHTML('budget', 'Pas cher')}${genFlagHTML('express', 'Moins de 20 min')}${genFlagHTML('onePan', '1 seule poêle')}${genFlagHTML('favoritesOnly', 'Mes favoris')}</div></div>
    <div class="space-y-1.5"><p class="font-bold text-slate-700">Régime</p>
      <div class="flex gap-1.5 flex-wrap">${genFlagHTML('noPork', 'Sans porc')}${genFlagHTML('noLactose', 'Sans lactose')}</div></div>
    <div class="space-y-1.5"><p class="font-bold text-slate-700">Budget des repas <span class="font-normal text-slate-400">(facultatif)</span></p>
      <div class="flex items-center gap-2"><input type="text" inputmode="numeric" id="gen-budget" class="w-24 border border-slate-200 rounded-xl px-3 py-2 text-xs" placeholder="ex. 60" value="${d.budgetMax ? esc(String(d.budgetMax)) : ''}" aria-label="Budget maximum en euros"><span class="text-slate-500">€ au maximum pour l'ensemble (pour ${state.portions} portion${state.portions > 1 ? 's' : ''})</span></div></div>
    <div class="space-y-1.5"><p class="font-bold text-slate-700">J'ai dans le frigo <span class="font-normal text-slate-400">(à utiliser en priorité)</span></p>
      <input type="text" id="gen-fridge" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" placeholder="Ex : poulet, courgettes, champignons" value="${esc(d.fridge || '')}"></div>`;
  updateGenMatch();
}
function updateGenMatch() {
  const label = document.getElementById('gen-match-label');
  if (!label) return;
  const n = state.recipes.filter(r => GL.recipeMatchesFilters(r, genDraft, state.favorites)).length;
  label.textContent = n === state.recipes.length ? `Tous les plats (${n})` : `${n} plat${n > 1 ? 's' : ''} correspondent`;
}
function openGenerateModal() {
  genDraft = JSON.parse(JSON.stringify(state.genFilters || {}));
  renderGenerateModal();
  document.getElementById('generate-modal').classList.remove('hidden');
}
function closeGenerateModal() { document.getElementById('generate-modal').classList.add('hidden'); }
function setupGenerateModal() {
  const modal = document.getElementById('generate-modal');
  if (!modal) return;
  document.getElementById('btn-close-generate').addEventListener('click', closeGenerateModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeGenerateModal(); });
  document.getElementById('gen-body').addEventListener('click', (e) => {
    const chip = e.target.closest('.gen-chip');
    const flag = e.target.closest('.gen-flag');
    if (chip) {
      const g = chip.dataset.group, v = chip.dataset.value;
      const arr = genDraft[g] || [];
      genDraft[g] = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
    } else if (flag) {
      genDraft[flag.dataset.flag] = !genDraft[flag.dataset.flag];
    } else if (e.target.id === 'btn-gen-current-season') {
      genDraft.seasons = [GL.currentSeason()];
    } else return;
    const fr = document.getElementById('gen-fridge'); if (fr) genDraft.fridge = fr.value;
    renderGenerateModal();
  });
  document.getElementById('gen-body').addEventListener('input', (e) => {
    if (e.target.id === 'gen-fridge') genDraft.fridge = e.target.value;
    if (e.target.id === 'gen-budget') { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); if (Number.isFinite(v) && v > 0) genDraft.budgetMax = v; else delete genDraft.budgetMax; }
  });
  document.getElementById('btn-gen-reset').addEventListener('click', () => { genDraft = {}; renderGenerateModal(); });
  document.getElementById('btn-gen-go').addEventListener('click', async () => {
    state.genFilters = sanitizeGenFilters(genDraft);
    closeGenerateModal();
    await Promise.race([ensureWeather(), new Promise(r => setTimeout(r, 4500))]);
    const snapshot = takeSnapshot();
    const hadMeals = state.plan.some(Boolean);
    generateBalancedWeek(false, state.genFilters);
    if (hadMeals && takeSnapshot() !== snapshot) {
      showToast(state._budgetMsg || 'Nouveau menu généré', { action: 'Annuler', duration: state._budgetMsg ? 8000 : undefined, onAction: () => restoreSnapshot(snapshot) });
    }
  });
}

// ==========================================
// NUTRITION & OPEN FOOD FACTS
// ==========================================
function nutritionOf(recipe) {
  const nameOf = (ing) => normalizeIngredient(ing).name;
  return {
    ...GN.recipeNutrition(recipe, ingredientGrams, nameOf),
    allergens: GN.recipeAllergens(recipe, nameOf)
  };
}
function renderNutritionCard(recipe) {
  const box = document.getElementById('detail-nutrition');
  if (!box) return;
  const n = nutritionOf(recipe);
  if (n.coverage < 0.7) { box.innerHTML = ''; return; }
  const p = n.perPortion;
  const chip = (label, v, unit) => `<span class="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-600"><b class="text-slate-800">${v}</b> ${unit} ${label}</span>`;
  box.innerHTML = `
    <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5"><span>Nutrition estimée</span> <span class="font-normal normal-case text-slate-400">par portion</span></h3>
    <div class="flex flex-wrap gap-1.5 text-[11px]">
      <span class="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900"><b>${p.kcal}</b> kcal</span>
      ${chip('protéines', p.protein, 'g')}${chip('glucides', p.carbs, 'g')}${chip('lipides', p.fat, 'g')}
    </div>
    ${n.allergens.length ? `<p class="text-[11px] text-slate-600">Allergènes : ${n.allergens.map(a => esc(GN.allergenLabel(a))).join(', ')}</p>` : '<p class="text-[11px] text-slate-400">Aucun allergène majeur repéré.</p>'}
    <p class="text-[10px] text-slate-400">Estimation à partir de valeurs moyennes par ingrédient (type Ciqual / Open Food Facts) : à titre indicatif.</p>`;
}

const NUTRI_COLORS = { a: '#038141', b: '#85bb2f', c: '#fecb02', d: '#ee8100', e: '#e63e11' };
// Pastille Nutri-Score : lettre parfaitement centrée (styles en ligne : indépendants du CSS compilé)
function nutriBadge(grade, size, title) {
  const fs = Math.round(size * 0.62);
  return `<span title="${esc(title || 'Nutri-Score')}" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${NUTRI_COLORS[grade]};color:${grade === 'c' ? '#222' : '#fff'};font-size:${fs}px;font-weight:800;line-height:1;text-transform:uppercase;vertical-align:middle;flex:none">${grade}</span>`;
}
function offKey(name) { return cleanStr(String(name).toLowerCase(), 120); }
function offBadgeHTML(name) {
  const e = state.off[offKey(name)];
  if (!e || !e.d) return '';
  const parts = [];
  if (e.d.grade) parts.push(nutriBadge(e.d.grade, 16, 'Nutri-Score typique (Open Food Facts)'));
  return parts.join(' ');
}
function saveOffCache() { safeSetItem('gamelle_off_cache', JSON.stringify(state.off)); }

let offLoading = false;
async function loadOffInfoForList() {
  if (offLoading) return;
  const items = currentSplit().toBuy.filter(i => (i.rayon === 'epicerie' || i.rayon === 'cremerie'));
  const todo = items.filter(i => { const e = state.off[offKey(i.name)]; return !e || Date.now() - e.t > OFF_TTL; }).slice(0, 40);
  if (!todo.length) { showToast('Infos produits déjà à jour'); renderGroceries(); return; }
  offLoading = true;
  showToast(`Open Food Facts : ${todo.length} produit${todo.length > 1 ? 's' : ''}…`, { duration: 4000 });
  let ok = 0, queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      try {
        const d = await GN.offTypical(it.name, (u) => fetch(u));
        state.off[offKey(it.name)] = { t: Date.now(), d };
        if (d) ok++;
      } catch (e) { /* réseau indisponible : on réessaiera plus tard */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  offLoading = false;
  saveOffCache();
  renderGroceries();
  showToast(ok ? `Infos trouvées pour ${ok} produit${ok > 1 ? 's' : ''}` : 'Aucune info trouvée (réseau ?)');
}

// --- Scanner de code-barres (caméra en direct : BarcodeDetector si présent, sinon ZXing embarqué ; repli : photo ou saisie) ---
let scanStream = null, scanTimer = null, scanBusy = false;
function stopScan() {
  clearInterval(scanTimer); scanTimer = null; scanBusy = false;
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const v = document.getElementById('scan-video');
  if (v) { v.srcObject = null; v.classList.add('hidden'); }
}
function onScanned(code) {
  stopScan();
  document.getElementById('scan-code').value = code;
  if (navigator.vibrate) navigator.vibrate(60);
  lookupScannedProduct(code);
}
async function startScanning() {
  const note = document.getElementById('scan-camera-note');
  stopScan();
  note.textContent = '';
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    note.textContent = 'Caméra indisponible ici : prenez le code en photo ou saisissez son numéro.'; return;
  }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    const v = document.getElementById('scan-video');
    v.setAttribute('playsinline', ''); v.muted = true;
    v.srcObject = scanStream; v.classList.remove('hidden'); await v.play();
    let detect;
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      detect = async () => { const c = await detector.detect(v); return c.length ? c[0].rawValue : null; };
    } else {
      note.textContent = 'Préparation du lecteur…';
      await getZxingReader();
      const canvas = document.createElement('canvas');
      detect = async () => {
        const k = Math.min(1, 900 / (v.videoWidth || 900));
        canvas.width = Math.round((v.videoWidth || 640) * k); canvas.height = Math.round((v.videoHeight || 480) * k);
        canvas.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0, canvas.width, canvas.height);
        return decodeBarcodeCanvas(canvas);
      };
    }
    note.textContent = 'Visez le code-barres (bien à plat, bien éclairé), ou prenez-le en photo ci-dessous.';
    scanTimer = setInterval(async () => {
      if (scanBusy || !scanStream) return;
      scanBusy = true;
      try { const code = await detect(); if (code && scanStream) onScanned(code); } catch (e) { /* image pas prête */ }
      scanBusy = false;
    }, 280);
  } catch (e) {
    stopScan();
    note.textContent = /denied|permission|NotAllowed/i.test(String(e && (e.name || e.message))) ? 'Accès à la caméra refusé : autorisez-le dans les réglages du téléphone, ou prenez le code en photo.' : 'Caméra indisponible : prenez le code en photo ou saisissez son numéro.';
  }
}
async function openScanModal() {
  const modal = document.getElementById('scan-modal');
  modal.classList.remove('hidden');
  document.getElementById('scan-result').innerHTML = '';
  document.getElementById('scan-code').value = '';
  startScanning();
}
function closeScanModal() { stopScan(); document.getElementById('scan-modal').classList.add('hidden'); }

function matchGroceryForProduct(name) {
  const idx = getArticleIndex();
  const hit = GR.matchArticle(String(name || ''), Object.keys(idx), (i) => normalizeIngredient(i));
  return hit ? { id: articleId(hit), name: hit } : null;
}
// Quantité Open Food Facts (« 1 l », « 6 x 125 g », « 400 g ») → { qty, unit } ou null
function parseOffQuantity(text) {
  const t = String(text || '').toLowerCase().replace(',', '.').replace(/\s+/g, ' ');
  const m = t.match(/^(?:(\d+)\s?[x×]\s?)?(\d+(?:\.\d+)?)\s?(kg|g|l|cl|ml)\b/);
  if (!m) return null;
  const r = GL.parseStockInput(`${m[2]} ${m[3]}`);
  return r ? { qty: r.qty * (m[1] ? parseInt(m[1], 10) : 1), unit: r.unit } : null;
}
async function addScannedToPantry(p, suggestion) {
  const v = await promptDialog({ title: 'Ajouter au placard', message: 'Nom de l\'ingrédient dans votre placard (il disparaît des courses quand une recette l\'utilise) :', value: suggestion, confirmLabel: 'Ajouter' });
  if (v === null || v === false) return false;
  const name = cleanStr(v, 80);
  if (!name) return false;
  const id = articleId(name);
  if (!state.pantry.includes(id)) state.pantry.push(id);
  state.pantryNeeded = state.pantryNeeded.filter(x => x !== id);
  const q = p && parseOffQuantity(p.quantity);
  if (q) state.pantryStock[id] = q;
  saveToLocalStorage(); renderGroceries();
  showToast(`« ${name} » ajouté au placard${q ? ' (' + formatQuantityAndUnit(q.qty, q.unit) + ')' : ''}`);
  return true;
}
function cleanProductName(n) { return cleanStr(String(n || '').replace(/\s+/g, ' ').trim(), 60); }
async function lookupScannedProduct(code) {
  const out = document.getElementById('scan-result');
  out.innerHTML = '<p class="text-slate-400">Recherche…</p>';
  let p = null, failed = false;
  try { p = await GN.offProduct(code, (u) => fetch(u)); } catch (e) { failed = true; }
  const againBtn = '<button type="button" id="btn-scan-again" class="px-2.5 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-700">Scanner un autre produit</button>';
  const wire = () => { const b = document.getElementById('btn-scan-again'); if (b) b.addEventListener('click', () => { out.innerHTML = ''; document.getElementById('scan-code').value = ''; startScanning(); }); };
  if (failed || !p) {
    out.innerHTML = `<div class="ios-card p-3 space-y-2">
      <p class="${failed ? 'text-rose-600' : 'text-slate-500'}">${failed ? 'Impossible de joindre Open Food Facts (réseau ?).' : 'Produit introuvable dans Open Food Facts.'}</p>
      <div class="flex gap-2 flex-wrap"><button type="button" id="btn-scan-manual" class="px-2.5 py-1.5 rounded-xl font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Ajouter au placard (saisir le nom)</button>${againBtn}</div></div>`;
    document.getElementById('btn-scan-manual').addEventListener('click', async () => { if (await addScannedToPantry(null, '')) { out.innerHTML = ''; startScanning(); } });
    wire(); return;
  }
  const match = matchGroceryForProduct(p.name);
  const suggestion = match ? match.name : cleanProductName(p.name);
  const grade = p.grade ? nutriBadge(p.grade, 26, 'Nutri-Score') : '<span class="text-slate-400">Nutri-Score non disponible</span>';
  out.innerHTML = `
    <div class="ios-card p-3 space-y-2">
      <div><p class="font-bold text-slate-800 text-sm">${esc(p.name || 'Produit sans nom')}</p><p class="text-slate-400">${esc(p.brand)}${p.quantity ? ' · ' + esc(p.quantity) : ''}</p></div>
      <div class="flex items-center gap-2 flex-wrap">${grade}${p.nova ? `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">NOVA ${p.nova}</span>` : ''}</div>
      <p class="text-slate-600">${p.kcal != null ? `<b>${p.kcal}</b> kcal` : ''}${p.protein != null ? ` · ${p.protein} g protéines` : ''}${p.carbs != null ? ` · ${p.carbs} g glucides` : ''}${p.fat != null ? ` · ${p.fat} g lipides` : ''} <span class="text-slate-400">pour 100 g</span></p>
      ${p.allergens.length ? `<p class="text-amber-700">Allergènes : ${p.allergens.map(a => esc(GN.allergenLabel(a))).join(', ')}</p>` : ''}
      <div class="flex gap-2 flex-wrap pt-1">
        <button type="button" id="btn-scan-pantry" class="px-3 py-2 rounded-xl font-bold bg-brand-600 text-white active:scale-95">Ajouter au placard</button>
        <button type="button" id="btn-scan-staple" data-name="${esc(cleanProductName(p.name))}" class="px-2.5 py-2 rounded-xl font-bold bg-white text-slate-700 border border-slate-200">À acheter (articles courants)</button>
        ${againBtn}
      </div>
    </div>`;
  document.getElementById('btn-scan-pantry').addEventListener('click', async () => { if (await addScannedToPantry(p, suggestion)) { out.innerHTML = ''; startScanning(); } });
  document.getElementById('btn-scan-staple').addEventListener('click', (e) => { addStaple(e.currentTarget.dataset.name); showToast('Ajouté aux articles courants'); });
  wire();
}
function setupScanModal() {
  const modal = document.getElementById('scan-modal');
  if (!modal) return;
  document.getElementById('btn-close-scan').addEventListener('click', closeScanModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeScanModal(); });
  const photo = document.getElementById('scan-file');
  document.getElementById('btn-scan-photo').addEventListener('click', () => photo.click());
  photo.addEventListener('change', async () => {
    const f = photo.files && photo.files[0]; photo.value = '';
    if (!f) return;
    stopScan();
    document.getElementById('scan-result').innerHTML = '<p class="text-slate-400">Lecture de la photo…</p>';
    let code = null;
    try { code = await decodeBarcodeFile(f); } catch (e) { /* lecteur indisponible */ }
    if (code) { document.getElementById('scan-code').value = code; lookupScannedProduct(code); }
    else document.getElementById('scan-result').innerHTML = '<p class="text-rose-600">Code-barres non lu : rapprochez-vous, évitez les reflets, ou saisissez le numéro.</p>';
  });
  document.getElementById('scan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = document.getElementById('scan-code').value;
    if (v.replace(/\D/g, '').length < 8) { showToast('Code-barres trop court'); return; }
    lookupScannedProduct(v);
  });
}

// --- Produits courants : suggestions pendant la saisie ---
let staplePool = null;
function getStaplePool() {
  if (!staplePool) {
    const names = new Set(GL.STAPLE_SUGGESTIONS);
    try { state.recipes.forEach(r => (r.ingredients || []).forEach(i => names.add(normalizeIngredient(i).name.replace(/\s*\(.*?\)/g, '')))); } catch (e) { /* liste de base seulement */ }
    (state.savedMenus || []).forEach(m => (m.staples || []).forEach(x => names.add(x.name)));
    staplePool = [...names];
  }
  return staplePool;
}
function setupStapleAutocomplete() {
  const input = document.getElementById('staple-input');
  const list = document.getElementById('staple-suggest');
  if (!input || !list) return;
  let items = [], active = -1;
  const close = () => { list.classList.add('hidden'); list.innerHTML = ''; items = []; active = -1; };
  const choose = (label) => { input.value = label; close(); input.focus(); };
  const paint = () => {
    list.innerHTML = items.map((t, i) => `<li role="option" data-i="${i}" class="px-3 py-2 text-xs ${i === active ? 'bg-brand-50 text-brand-800 font-bold' : 'text-slate-700'}">${esc(t)}</li>`).join('');
    list.classList.toggle('hidden', !items.length);
  };
  const refresh = () => {
    const existing = state.staples.map(x => x.name);
    items = GL.suggestStaples(input.value, getStaplePool(), existing, 5);
    active = -1;
    paint();
  };
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopPropagation(); choose(items[active]); }
    else if (e.key === 'Escape') close();
  });
  // pointerdown (et non click) : le choix passe avant que le champ perde le focus
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); choose(items[Number(li.dataset.i)]); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  document.getElementById('form-add-staple').addEventListener('submit', close);
}

// --- Filtres du catalogue : « Plus de filtres » ---
const FILTER_LABELS = { printemps: '🌸 Printemps', ete: '☀️ Été', automne: '🍁 Automne', hiver: '❄️ Hiver', 'style:street': 'Street food', 'style:italien': 'Italien', 'style:asiatique': 'Asiatique', 'style:orient': 'Orient & Indien', 'style:mexicain': 'Tex-Mex', 'style:terroir': 'Terroir', 'style:frais': 'Frais & bowls', unepoele: '1 poêle', sanspork: 'Sans porc', sanslactose: 'Sans lactose', maison: 'Mes recettes', jamais: 'Jamais cuisinés', recent: 'Cuisinés récemment' };
function updateMoreFiltersButton() {
  const btn = document.getElementById('btn-more-filters');
  const panel = document.getElementById('more-filters');
  if (!btn || !panel) return;
  const label = FILTER_LABELS[state.activeFilter];
  btn.textContent = label ? `${label} ✕` : (panel.classList.contains('hidden') ? 'Plus de filtres' : 'Moins de filtres');
  btn.classList.toggle('bg-brand-600', !!label);
  btn.classList.toggle('text-white', !!label);
  btn.classList.toggle('bg-slate-100', !label);
  btn.classList.toggle('text-slate-700', !label);
}
function setupMoreFilters() {
  const btn = document.getElementById('btn-more-filters');
  const panel = document.getElementById('more-filters');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    if (FILTER_LABELS[state.activeFilter]) { // filtre du panneau actif : le bouton le retire
      const all = document.querySelector('.filter-btn[data-filter="all"]');
      if (all) all.click();
      return;
    }
    panel.classList.toggle('hidden');
    updateMoreFiltersButton();
  });
  // choisir un filtre dans le panneau le referme
  panel.addEventListener('click', (e) => { if (e.target.closest('.filter-btn')) { panel.classList.add('hidden'); updateMoreFiltersButton(); } });
}

// --- Finir mes restes ---
let leftoversPool = null;
function getLeftoversPool() {
  if (!leftoversPool) {
    const names = new Set();
    try { state.recipes.forEach(r => (r.ingredients || []).forEach(i => names.add(normalizeIngredient(i).name.replace(/\s*\(.*?\)/g, '')))); } catch (e) { /* liste vide */ }
    leftoversPool = [...names].filter(n => !GL.BASICS.some(b => b.startsWith(n)));
  }
  return leftoversPool;
}
function renderLeftovers() {
  const chips = document.getElementById('leftovers-chips');
  const box = document.getElementById('leftovers-results');
  if (!chips || !box) return;
  chips.innerHTML = state.leftovers.map(l => `<button type="button" class="leftover-chip px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold" data-label="${esc(l)}">${esc(l)} ✕</button>`).join('');
  if (!state.leftovers.length) {
    box.innerHTML = '<p class="text-xs text-slate-400 pt-2">Ajoutez un ou plusieurs produits (poulet, courgettes, riz, crème…). Les recettes qui les utilisent le mieux, avec le moins de courses à faire, apparaissent ici.</p>';
    return;
  }
  const ranked = GL.rankByLeftovers(state.recipes, state.leftovers, {
    articleOf: (ing) => normalizeIngredient(ing).name, pantry: state.pantry, spices: state.spices, limit: 12
  });
  if (!ranked.length) { box.innerHTML = '<p class="text-xs text-slate-500 pt-2">Aucune recette ne correspond. Essayez un mot plus simple (poulet, riz, courgette).</p>'; return; }
  box.innerHTML = ranked.map(({ recipe: r, used, missing }) => {
    const need = missing.length === 0
      ? '<span class="text-emerald-700 font-bold">Rien à acheter</span>'
      : `<span class="text-slate-500">Il manque : ${esc(missing.slice(0, 3).map(m => m.replace(/\s*\(.*?\)/g, '')).join(', '))}${missing.length > 3 ? ` +${missing.length - 3}` : ''}</span>`;
    return `<div class="ios-card p-2.5 flex gap-3 items-center" data-id="${esc(r.id)}">
      <img src="${esc(thumbImg(r.image))}" alt="" loading="lazy" class="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-slate-100">
      <div class="flex-1 min-w-0 space-y-0.5">
        <p class="font-bold text-xs text-slate-800 leading-snug">${esc(r.title)}</p>
        <p class="text-[11px] text-slate-600">Utilise : ${esc(used.join(', '))}</p>
        <p class="text-[11px]">${need}</p>
        <div class="flex gap-1.5 pt-1">
          <button type="button" class="leftover-view px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold" data-id="${esc(r.id)}">Voir</button>
          <button type="button" class="leftover-add px-2 py-1 rounded-lg bg-brand-50 text-brand-700 text-[11px] font-bold" data-id="${esc(r.id)}">Au menu</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function addLeftover(label) {
  const clean = cleanStr(label, 60);
  if (!clean || state.leftovers.some(l => GL.norm(l) === GL.norm(clean))) return;
  state.leftovers.push(clean);
  saveToLocalStorage();
  renderLeftovers();
}
function openLeftoversModal() {
  document.getElementById('leftovers-modal').classList.remove('hidden');
  renderLeftovers();
}
function setupLeftoversModal() {
  const modal = document.getElementById('leftovers-modal');
  if (!modal) return;
  const input = document.getElementById('leftovers-input');
  const list = document.getElementById('leftovers-suggest');
  document.getElementById('btn-open-leftovers').addEventListener('click', openLeftoversModal);
  document.getElementById('btn-close-leftovers').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  let items = [], active = -1;
  const close = () => { list.classList.add('hidden'); list.innerHTML = ''; items = []; active = -1; };
  const paint = () => {
    list.innerHTML = items.map((t, i) => `<li role="option" data-i="${i}" class="px-3 py-2 text-xs ${i === active ? 'bg-brand-50 text-brand-800 font-bold' : 'text-slate-700'}">${esc(t)}</li>`).join('');
    list.classList.toggle('hidden', !items.length);
  };
  input.addEventListener('input', () => { items = GL.suggestStaples(input.value, getLeftoversPool(), state.leftovers, 5); active = -1; paint(); });
  input.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopPropagation(); addLeftover(items[active]); input.value = ''; close(); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); addLeftover(items[Number(li.dataset.i)]); input.value = ''; close(); input.focus(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  document.getElementById('leftovers-form').addEventListener('submit', (e) => {
    e.preventDefault();
    input.value.split(/[,;]/).forEach(v => addLeftover(v));
    input.value = ''; close();
  });
  modal.addEventListener('click', (e) => {
    const chip = e.target.closest('.leftover-chip');
    const view = e.target.closest('.leftover-view');
    const add = e.target.closest('.leftover-add');
    if (chip) { state.leftovers = state.leftovers.filter(l => l !== chip.dataset.label); saveToLocalStorage(); renderLeftovers(); }
    else if (view) { modal.classList.add('hidden'); openRecipeDetail(view.dataset.id); }
    else if (add) {
      addRecipeToPlan(add.dataset.id);
    }
  });
}

// ==========================================
// MÉTÉO (Open-Meteo, sans clé) — invisible : elle oriente seulement le tirage des repas
// ==========================================
async function ensureWeather() {
  try {
    const cached = readJSON('gamelle_weather', null);
    if (cached && Number.isFinite(cached.t) && Date.now() - cached.t < 3 * 3600000 && cached.w) { state.weatherMood = GL.weatherMood(cached.w); return; }
    if (safeGetItem('gamelle_weather_off') === '1') return;
    let geo = readJSON('gamelle_geo', null);
    if (!geo) {
      if (!navigator.geolocation) return;
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000, maximumAge: 86400000 }));
      // position arrondie (≈ 10 km) : suffisante pour la météo, gardée uniquement sur ce téléphone
      geo = { lat: Math.round(pos.coords.latitude * 10) / 10, lon: Math.round(pos.coords.longitude * 10) / 10 };
      safeSetItem('gamelle_geo', JSON.stringify(geo));
    }
    const w = await GL.fetchWeather(geo.lat, geo.lon, (u) => fetch(u));
    if (w) { safeSetItem('gamelle_weather', JSON.stringify({ t: Date.now(), w })); state.weatherMood = GL.weatherMood(w); }
  } catch (e) {
    if (e && e.code === 1) safeSetItem('gamelle_weather_off', '1'); // localisation refusée : on ne redemande jamais
  }
}

// ==========================================
// NOTIFICATIONS DU FOYER (ntfy.sh, sujet secret dérivé du code foyer, aucune clé)
// ==========================================
let notifQueue = { staples: [], meals: [] }, notifTimer = null;
function queueNotification({ staple, meal }) {
  if (!state.notify || !state.householdCode) return;
  if (staple && !notifQueue.staples.includes(staple)) notifQueue.staples.push(staple);
  if (meal) notifQueue.meals.push(meal);
  clearTimeout(notifTimer);
  notifTimer = setTimeout(flushNotifications, 12000); // regroupe les ajouts rapprochés en un seul message
}
async function flushNotifications() {
  const q = notifQueue;
  notifQueue = { staples: [], meals: [] };
  const text = GL.buildNotification({ name: state.memberName, staples: q.staples, meals: q.meals });
  if (!text || !state.notify || !state.householdCode || !GL.cryptoAvailable()) return;
  try {
    const topic = await GL.notifTopic(state.householdCode);
    await fetch(`https://ntfy.sh/${topic}`, { method: 'POST', headers: { Title: 'Gamelle & Panier', Tags: 'shopping_cart' }, body: text });
  } catch (e) { /* hors ligne : tant pis, la synchro reste la référence */ }
}
function setupNotifySettings() {
  const chk = document.getElementById('chk-notify');
  const name = document.getElementById('member-name');
  const copy = document.getElementById('btn-copy-notif-topic');
  if (!chk) return;
  chk.checked = state.notify;
  name.value = state.memberName;
  chk.addEventListener('change', () => { state.notify = chk.checked; safeSetItem('gamelle_notify', state.notify ? '1' : '0'); });
  name.addEventListener('change', () => { state.memberName = cleanStr(name.value, 30); safeSetItem('gamelle_member_name', state.memberName); });
  if (copy) copy.addEventListener('click', () => copyToClipboard(document.getElementById('notif-topic').textContent, 'Sujet copié'));
}
async function refreshNotifTopic() {
  const el = document.getElementById('notif-topic');
  if (!el) return;
  el.textContent = state.householdCode && GL.cryptoAvailable() ? await GL.notifTopic(state.householdCode) : '';
}

// ==========================================
// Titre évolutif : « Mes 3 repas »
function updatePlanningTitle() {
  const n = state.plan.filter(Boolean).length;
  const t = document.getElementById('planning-title');
  if (t) t.textContent = n === 0 ? 'Mes repas' : (n === 1 ? 'Mon repas' : `Mes ${n} repas`);
}

function renderAll() {
  updatePlanningTitle();
  document.getElementById('current-portions-badge').textContent = `${state.portions} part${state.portions > 1 ? 's' : ''}`;

  // Mettre à jour le sous-titre de la bannière planning si présent
  const planningSubtitle = document.getElementById('planning-portions-subtitle');
  if (planningSubtitle) {
    planningSubtitle.textContent = '';
  }

  // Mettre à jour le modal de choix de plat si présent
  const modalSelectPortions = document.getElementById('modal-select-meal-portions');
  if (modalSelectPortions) {
    modalSelectPortions.textContent = `${state.portions} portion${state.portions > 1 ? 's' : ''}`;
  }

  // Si la fiche d'une recette est ouverte, on ne la reconstruit que si son contenu a réellement changé
  // (portions, recette modifiée…). Sinon, chaque message de synchro reçu du foyer (ex. un article coché
  // par l'autre téléphone) la redessinait et rechargeait sa photo : ça faisait scintiller l'écran.
  const detailModal = document.getElementById('recipe-detail-modal');
  if (detailModal && !detailModal.classList.contains('hidden') && state.activeDetailRecipeId) {
    if (detailSignature(state.activeDetailRecipeId) !== state._detailSig) {
      openRecipeDetail(state.activeDetailRecipeId);
    } else {
      updateDetailFavIcon();
    }
  }

  // Idem pour le mode cuisine
  const cookingModal = document.getElementById('cooking-modal');
  if (cookingModal && !cookingModal.classList.contains('hidden') && state.cookingRecipe) {
    const cookSig = `${state.cookingRecipe.id}|${state.cookingStepIndex}|${state.portions}`;
    if (cookSig !== state._cookingSig) {
      state._cookingSig = cookSig;
      document.getElementById('cooking-recipe-portions').textContent = `🥘 ${state.portions} portions`;
      renderCookingStep();
    }
  }

  renderPlanning();
  renderGroceries();
  renderCatalog();
}

// 1. Rendu du Planning (liste de plats sans limitation de nombre ni de jours fixes)
// « · ≈ 54 € » : coût estimé des repas encore à acheter (un repas « gardé » est déjà acheté : son prix disparaît)
function planCostLabel() {
  let total = 0, n = 0;
  state.plan.forEach((id, i) => {
    if (state.lockedSlots.includes(i)) return;
    const r = state.recipes.find(x => x.id === id);
    if (r) { total += recipeMealCost(r); n++; }
  });
  return n ? ` · ≈ ${euro(total)}` : '';
}
function renderPlanning() {
  updatePlanningTitle();
  renderWeekBalance();
  const container = document.getElementById('weekly-days-list');
  if (!container) return;
  container.innerHTML = '';

  // Mettre à jour le badge du nombre de menus sauvegardés
  const countBadge = document.getElementById('saved-menus-count');
  if (countBadge) {
    countBadge.textContent = state.savedMenus ? state.savedMenus.length : 0;
  }

  // Header avec compteur de plats et bouton d'ajout rapide
  const lockedCount = Array.isArray(state.lockedSlots)
    ? state.lockedSlots.filter(idx => idx < state.plan.length && Boolean(state.plan[idx])).length
    : 0;

  const headerDiv = document.createElement('div');
  headerDiv.className = 'flex items-center justify-between px-1 pb-1 flex-wrap gap-2';
  headerDiv.innerHTML = `
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs font-bold text-slate-700">${state.plan.length} repas sélectionné${state.plan.length > 1 ? 's' : ''}${planCostLabel()}</span>
    </div>
    <button id="btn-add-meal-slot" class="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1 active:scale-95 transition-all">
      <span>+</span> Ajouter un plat
    </button>
  `;
  if (state.plan.length > 0) container.appendChild(headerDiv);

  headerDiv.querySelector('#btn-add-meal-slot').addEventListener('click', () => {
    addMealSlot();
  });

  // Aperçu des repas : une pastille par repas (sans jours : les courses peuvent couvrir plusieurs semaines)
  if (state.plan.length >= 2) {
    const strip = document.createElement('div');
    strip.className = 'meal-strip flex gap-2 overflow-x-auto scrollbar-none pb-1';
    strip.setAttribute('aria-label', 'Aperçu des repas');
    strip.innerHTML = state.plan.map((id, i) => {
      const r = state.recipes.find(x => x.id === id);
      const locked = Array.isArray(state.lockedSlots) && state.lockedSlots.includes(i);
      const cooked = state.notes[id] && state.notes[id].cooked && (Date.now() - state.notes[id].cooked) < 3 * 86400000;
      return `<button type="button" class="meal-dot ${locked ? 'is-locked' : ''}" data-slot="${i}" aria-label="Repas ${i + 1}${r ? ' : ' + esc(r.title) : ''}">
        ${r ? `<img src="${esc(thumbImg(r.image))}" alt="" loading="lazy" decoding="async" class="img-soft">` : '<span>+</span>'}
        <b>${i + 1}</b>${cooked ? '<i aria-hidden="true">✓</i>' : ''}</button>`;
    }).join('');
    strip.addEventListener('click', (e) => {
      const b = e.target.closest('.meal-dot'); if (!b) return;
      const card = document.getElementById('meal-card-' + b.dataset.slot);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    container.appendChild(strip);
  }

  // Liste des repas
  state.plan.forEach((recipeId, slotIndex) => {
    const recipe = state.recipes.find(r => r.id === recipeId);
    const card = document.createElement('div');
    const isLocked = Array.isArray(state.lockedSlots) && state.lockedSlots.includes(slotIndex);

    card.id = 'meal-card-' + slotIndex;
    card.className = `ios-card p-3.5 flex flex-col gap-2.5 transition-all ${
      isLocked ? 'border-amber-300 bg-amber-50/25 ring-1 ring-amber-200' : ''
    }`;

    if (recipe) {
      card.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-xs ${isLocked ? 'text-amber-900 bg-amber-100' : 'text-slate-800 bg-slate-100'} px-2.5 py-1 rounded-lg">Repas ${slotIndex + 1}</span>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button class="btn-lock-meal text-xs font-semibold px-2.5 py-1 rounded-lg transition-all border flex items-center gap-1 ${
              isLocked 
                ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 shadow-xs' 
                : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900'
            }" data-slot="${slotIndex}" title="${isLocked ? 'Plat gardé (non ajouté aux courses)' : 'Garder ce plat (ne pas ajouter aux courses)'}">
              ${isLocked ? ICONS.lock : ICONS.unlock}
              <span>${isLocked ? 'Gardé' : 'Garder'}</span>
            </button>
            <button class="btn-change-meal text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg font-medium transition-colors" data-slot="${slotIndex}">
              Changer
            </button>
            <button aria-label="Retirer ce repas" class="btn-remove-meal text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors" data-slot="${slotIndex}" title="Retirer ce plat">
              ✕
            </button>
          </div>
        </div>
        
        <div class="flex items-center gap-3.5 cursor-pointer btn-open-detail py-0.5" data-id="${esc(recipe.id)}">
          <img src="${esc(thumbImg(recipe.image))}" alt="" loading="lazy" decoding="async" class="img-soft w-24 h-24 rounded-2xl object-cover shadow-sm flex-shrink-0">
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-sm text-slate-900 leading-snug">${esc(recipe.title)}</h3>
            <div class="flex items-center gap-2 mt-2 text-[11px] text-slate-600 font-medium flex-wrap">
              <span>⏱️ ${recipe.timeMinutes} min</span>
              ${isLocked ? '' : `<span>•</span><span>≈ ${euro(recipeMealCost(recipe))}</span>`}
              <span>•</span>
              <span class="text-emerald-700 font-semibold">${esc(recipe.tag)}</span>
              ${recipe.isBudget ? `<span class="text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded-md">💰 Pas cher</span>` : ''}
            </div>
          </div>
          <span class="text-slate-300 text-lg font-bold pr-1 flex-shrink-0">›</span>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-xs text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">Repas ${slotIndex + 1}</span>
          <button aria-label="Retirer ce repas" class="btn-remove-meal text-xs text-slate-400 hover:text-red-500 px-2 py-1" data-slot="${slotIndex}">✕</button>
        </div>
        <button class="btn-choose-meal w-full py-3 border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-xl text-slate-500 hover:text-brand-600 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all" data-slot="${slotIndex}">
          <span>+</span> Choisir une recette
        </button>
      `;
    }

    container.appendChild(card);
  });

  if (state.plan.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'ios-card p-6 text-center space-y-3';
    emptyNotice.innerHTML = `
      <span class="empty-badge" aria-hidden="true">🍽️</span>
      <h3 class="font-bold text-slate-900 text-base">Qu'est-ce qu'on mange ?</h3>
      <p class="text-xs text-slate-500 leading-relaxed">En un geste, l'application compose vos 7 repas variés (vous pouvez filtrer par saison, style ou régime) et prépare la liste de courses.</p>
      <button type="button" id="btn-empty-compose" class="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm py-3.5 rounded-2xl shadow-md shadow-brand-500/20 active:scale-95 transition-all">Composer mes 7 repas</button>
      <button type="button" id="btn-empty-browse" class="w-full text-xs font-bold text-slate-600 py-2">Ou choisir dans les recettes</button>
    `;
    container.appendChild(emptyNotice);
    emptyNotice.querySelector('#btn-empty-compose').addEventListener('click', () => document.getElementById('btn-generate-menu').click());
    emptyNotice.querySelector('#btn-empty-browse').addEventListener('click', () => switchTab('tab-recettes'));
  }

  // Écouteurs pour le planning
  container.querySelectorAll('.btn-lock-meal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slot = parseInt(e.currentTarget.dataset.slot, 10);
      toggleLockSlot(slot);
    });
  });

  container.querySelectorAll('.btn-change-meal, .btn-choose-meal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const slot = parseInt(e.currentTarget.dataset.slot, 10);
      openSelectMealModal(slot);
    });
  });

  container.querySelectorAll('.btn-remove-meal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slot = parseInt(e.currentTarget.dataset.slot, 10);
      removeMealSlot(slot);
    });
  });

  container.querySelectorAll('.btn-open-detail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const recipeId = e.currentTarget.dataset.id;
      openRecipeDetail(recipeId);
    });
  });
}

function addRecipeToPlan(recipeId) {
  state.plan.push(recipeId);
  { const r = state.recipes.find(x => x.id === recipeId); if (r) queueNotification({ meal: r.title }); }
  saveToLocalStorage();
  renderPlanning();
  renderGroceries();
  showToast(`Ajouté au menu (repas ${state.plan.length})`, { action: 'Voir', onAction: () => switchTab('tab-planning') });
}

function addMealSlot(recipeId = null) {
  if (recipeId) {
    state.plan.push(recipeId);
    saveToLocalStorage();
    renderPlanning();
    renderGroceries();
  } else {
    state.plan.push(null);
    const newSlotIndex = state.plan.length - 1;
    saveToLocalStorage();
    renderPlanning();
    openSelectMealModal(newSlotIndex);
  }
}
// 2. Rendu de la Liste de Courses Grand Frais
const collapsedRayons = new Set();
const celebratedRayons = new Set();
let settleId = null; // dernière ligne cochée : petite animation d'arrivée
// Gestes sur la liste : glisser à droite = coché, à gauche = « j'ai déjà » (ou retirer un produit courant)
function setupGrocerySwipe() {
  const c = document.getElementById('grand-frais-aisles-container');
  let sx = 0, sy = 0, row = null, dx = 0;
  c.addEventListener('touchstart', (e) => {
    row = e.target.closest('.grocery-row'); if (!row || e.touches.length !== 1) { row = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0;
  }, { passive: true });
  c.addEventListener('touchmove', (e) => {
    if (!row) return;
    const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (Math.abs(my) > Math.abs(mx)) { row.style.transform = ''; row = null; return; }
    dx = mx; row.style.transform = `translateX(${Math.max(-90, Math.min(90, dx))}px)`;
  }, { passive: true });
  c.addEventListener('touchend', () => {
    if (!row) return;
    const r = row, d = dx; row = null; r.style.transform = '';
    if (Math.abs(d) < 70) return;
    const id = r.dataset.id, type = r.dataset.type;
    if (d > 0) {
      if (type === 'staple') { const it = state.staples.find(x => x.id === id); if (it) it.checked = !it.checked; }
      else state.checkedGroceries[id] = !state.checkedGroceries[id];
      saveToLocalStorage(); renderGroceries();
    } else {
      const snapshot = takeSnapshot();
      if (type === 'staple') state.staples = state.staples.filter(x => x.id !== id);
      else { if (!state.pantry.includes(id)) state.pantry.push(id); state.pantryNeeded = state.pantryNeeded.filter(x => x !== id); }
      saveToLocalStorage(); renderGroceries();
      showToast(type === 'staple' ? 'Produit retiré' : 'Ajouté au placard', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
    }
  });
}

// Ajout d'un produit courant : s'il existe déjà, la quantité augmente (« Lait ×3 »)
function addStaple(name, qty = 1, silent = false) {
  const val = cleanStr(name, 80);
  if (!val) return;
  const same = state.staples.find(x => x.name.toLowerCase() === val.toLowerCase());
  if (same) { same.qty = Math.min(99, (same.qty || 1) + qty); same.checked = false; }
  else state.staples.push({ id: 'staple_' + Date.now() + '_' + Math.floor(Math.random() * 1000), name: val, checked: false, qty: Math.max(1, qty) });
  const h = state.stapleHistory[val] || { n: 0, last: 0 };
  state.stapleHistory[val] = { n: h.n + 1, last: Date.now() };
  queueNotification({ staple: val });
  if (silent) return;
  saveToLocalStorage();
  renderGroceries();
  renderHabituals();
}
// « Vos habituels » : les produits les plus ajoutés (sinon une base), sans ceux déjà dans la liste
function renderHabituals() {
  const box = document.getElementById('staple-habituals');
  if (!box) return;
  const inList = new Set(state.staples.map(x => x.name.toLowerCase()));
  const fav = Object.entries(state.stapleHistory || {}).sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).map(e => e[0]);
  const base = ['Bananes', 'Lait', 'Fruits de saison', 'Kéfir', 'Yaourts', 'Pain de mie', "Flocons d'avoine"];
  const names = [...new Set([...fav, ...base])].filter(n => !inList.has(n.toLowerCase())).slice(0, 8);
  box.innerHTML = names.map(n => `<button type="button" class="staple-quick-btn whitespace-nowrap text-[12px] bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full font-medium" data-name="${esc(n)}">${esc(n)}</button>`).join('');
}

function renderGroceries() {
  const container = document.getElementById('grand-frais-aisles-container');
  container.innerHTML = '';

  const split = currentSplit();
  const groceries = split.toBuy;
  const atHome = split.atHome;
  let totalItems = groceries.length + state.staples.length;
  let checkedCount = 0;

  // Calcul du nombre de cochés
  groceries.forEach(item => {
    if (state.checkedGroceries[item.id]) checkedCount++;
  });
  state.staples.forEach(staple => {
    if (staple.checked) checkedCount++;
  });

  // Mise à jour de la barre de progression
  const percentage = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;
  document.getElementById('courses-progress-bar').style.width = `${percentage}%`;
  const factor = GL.priceFactor(state.trips);
  const budget = GL.estimateBudget(groceries, factor, (i) => GR.learnedPrice(i, state.priceBook));
  const stp = staplesCost();   // produits courants déjà vus sur un ticket : leur vrai prix s'ajoute au panier
  const cost = Math.round(budget.total + stp.total);
  const lastTrip = (state.trips || [])[state.trips.length - 1];
  document.getElementById('courses-stats-label').textContent = `${checkedCount} / ${totalItems} article${totalItems > 1 ? 's' : ''} trouvé${checkedCount > 1 ? 's' : ''}`;
  document.getElementById('courses-budget-label').textContent = cost > 0 ? `Budget ≈ ${cost} €${budget.real + stp.n ? ` (${budget.real + stp.n} article${budget.real + stp.n > 1 ? 's' : ''} à vos prix réels${stp.n ? `, dont ${euro(stp.total)} de produits courants` : ''})` : (factor !== 1 ? ' (selon vos tickets)' : '')}${lastTrip ? ` · dernier ticket ${Math.round(lastTrip.total)} €` : ''}` : (lastTrip ? `Dernier ticket ${Math.round(lastTrip.total)} €` : '');
  
  // Badge sur l'onglet inférieur
  const navBadge = document.getElementById('nav-badge-groceries');
  if (totalItems > 0) {
    navBadge.textContent = totalItems - checkedCount;
    navBadge.classList.toggle('hidden', totalItems - checkedCount === 0);
  } else {
    navBadge.classList.add('hidden');
  }

  // Bannière informative si des repas sont gardés avec ingrédients déjà à la maison
  const lockedCount = Array.isArray(state.lockedSlots)
    ? state.lockedSlots.filter(idx => idx < (state.plan || []).length && Boolean(state.plan[idx])).length
    : 0;

  if (lockedCount > 0) {
    const lockedMealsBanner = document.createElement('div');
    lockedMealsBanner.className = 'ios-card bg-amber-50/80 border border-amber-200/90 p-3 mb-3.5 flex items-start gap-2.5 text-xs text-amber-900 rounded-2xl shadow-xs';
    lockedMealsBanner.innerHTML = `
      <span class="text-lg flex-shrink-0 leading-none mt-0.5">🔒</span>
      <div class="flex-1">
        <div class="flex items-center justify-between gap-1 flex-wrap">
          <p class="font-bold text-amber-950">${lockedCount} repas gardé${lockedCount > 1 ? 's' : ''} au menu</p>
          <span class="text-[10px] bg-amber-200/60 text-amber-900 font-semibold px-2 py-0.5 rounded-full">Déjà à la maison</span>
        </div>
        <p class="text-[11px] text-amber-800/90 mt-1 leading-relaxed">
          Les ingrédients de ce${lockedCount > 1 ? 's repas sont déjà dans vos placards/frigo' : ' repas sont déjà dans vos placards/frigo'} et sont <strong>exclus</strong> de votre liste de courses pour le week-end.
        </p>
      </div>
    `;
    container.appendChild(lockedMealsBanner);
  }

  // Rendu de chaque rayon Grand Frais
  orderedRayons().forEach(rayon => {
    const isStapleRayon = rayon.id === 'courants';
    let itemsInRayon = isStapleRayon 
      ? [...state.staples] 
      : groceries.filter(g => g.rayon === rayon.id);

    if (itemsInRayon.length === 0) return;

    // Tri : les articles restants à acheter en haut, les articles cochés envoyés en bas du rayon
    itemsInRayon.sort((a, b) => {
      const aChecked = isStapleRayon ? (a.checked ? 1 : 0) : (state.checkedGroceries[a.id] ? 1 : 0);
      const bChecked = isStapleRayon ? (b.checked ? 1 : 0) : (state.checkedGroceries[b.id] ? 1 : 0);
      if (aChecked !== bChecked) {
        return aChecked - bChecked; // 0 (non coché) avant 1 (coché)
      }
      return a.name.localeCompare(b.name, 'fr');
    });

    const section = document.createElement('div');
    section.className = 'ios-card overflow-hidden';
    const collapsed = collapsedRayons.has(rayon.id);
    const leftInRayon = itemsInRayon.filter(i => isStapleRayon ? !i.checked : !state.checkedGroceries[i.id]).length;

    // En-tête du rayon (toucher pour replier / déplier)
    const rayonDone = leftInRayon === 0;
    const justDone = rayonDone && !celebratedRayons.has(rayon.id);
    if (justDone && settleId !== null) setTimeout(tickFeedback, 0); // seulement quand c'est vous qui venez de cocher
    if (rayonDone) celebratedRayons.add(rayon.id); else celebratedRayons.delete(rayon.id);
    section.innerHTML = `
      <div class="bg-slate-50 border-b border-slate-100 flex items-center">
        <button type="button" class="rayon-head flex-1 min-w-0 text-left p-3 flex items-center justify-between gap-2" data-rayon="${esc(rayon.id)}" aria-expanded="${!collapsed}">
          <div class="flex items-center gap-2 min-w-0">
            ${rayonIcon(rayon)}
            <h3 class="font-bold text-xs text-slate-800 leading-tight">${rayon.name}</h3>
          </div>
          ${rayonDone
            ? `<span class="rayon-done flex-shrink-0 ${justDone ? 'pop' : ''}" aria-label="Rayon terminé">✓ Terminé</span>`
            : `<span class="text-[12px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 whitespace-nowrap flex-shrink-0" aria-label="${itemsInRayon.length - leftInRayon} sur ${itemsInRayon.length} trouvés">${itemsInRayon.length - leftInRayon}/${itemsInRayon.length}</span>`}
        </button>
        <button type="button" class="rayon-checkall text-[12px] font-bold text-brand-700 px-3 py-3 whitespace-nowrap" data-rayon="${esc(rayon.id)}">${rayonDone ? 'Décocher' : 'Tout cocher'}</button>
      </div>
      <div class="divide-y divide-slate-100 items-list-container ${collapsed ? 'hidden' : ''}">
      </div>
    `;

    const listContainer = section.querySelector('.items-list-container');

    itemsInRayon.forEach(item => {
      const itemRow = document.createElement('div');
      itemRow.className = 'grocery-row p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors';
      itemRow.dataset.id = item.id;
      if (settleId === item.id) { itemRow.classList.add('row-settle'); settleId = null; }
      itemRow.dataset.type = isStapleRayon ? 'staple' : 'recipe';

      const isChecked = isStapleRayon 
        ? item.checked 
        : !!state.checkedGroceries[item.id];

      // Quantité harmonisée et formatée
      let qtyStr = '';
      if (!isStapleRayon) {
        qtyStr = item.formattedQty || formatQuantityAndUnit(item.quantity, item.baseUnit || item.unit);
      }

      itemRow.innerHTML = `
        <label class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
          <input type="checkbox" class="grocery-check w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 rounded cursor-pointer" data-id="${esc(item.id)}" data-type="${isStapleRayon ? 'staple' : 'recipe'}" ${isChecked ? 'checked' : ''} aria-label="${esc(item.name)}">
          <div class="flex-1 min-w-0 ${isChecked ? 'item-checked' : ''}">
            <div class="flex items-baseline gap-1.5 flex-wrap">
              ${qtyStr ? `<span class="font-bold text-xs text-brand-700">${qtyStr}</span>` : ''}
              <span class="text-xs text-slate-800 font-medium">${esc(item.name)}</span>
              ${isStapleRayon && (item.qty || 1) > 1 ? `<span class="font-bold text-xs text-brand-700">×${item.qty}</span>` : ''}
              ${isStapleRayon && GR.staplePrice(item, state.priceBook) != null ? `<span class="text-[12px] text-slate-400">≈ ${euro(GR.staplePrice(item, state.priceBook))}</span>` : ''}
              ${isStapleRayon ? '' : offBadgeHTML(item.name)}
            </div>
            ${item.recipes && item.recipes.length > 0 ? `
              <span class="text-[10px] text-slate-400 truncate block">(${esc(item.recipes.join(', '))})</span>
            ` : ''}
          </div>
        </label>
        ${isStapleRayon ? `
          <span class="flex items-center gap-1 flex-shrink-0">
            <button class="btn-staple-plus text-slate-500 text-sm font-bold w-7 h-7 rounded-lg bg-slate-100" data-id="${esc(item.id)}" aria-label="Une unité de plus : ${esc(item.name)}">+</button>
            <button class="btn-delete-staple text-slate-400 hover:text-red-500 text-xs w-7 h-7" data-id="${esc(item.id)}" aria-label="Retirer ${esc(item.name)}">✕</button>
          </span>
        ` : `
          <button class="btn-pantry text-slate-300 hover:text-emerald-600 text-xs px-1" data-id="${esc(item.id)}" title="J'en ai déjà (placard)" aria-label="J'ai déjà ${esc(item.name)}">${ICONS.box}</button>
        `}
      `;

      listContainer.appendChild(itemRow);
    });

    container.appendChild(section);
  });

  if (totalItems === 0) {
    container.innerHTML = `
      <div class="ios-card p-8 text-center text-slate-400 space-y-2">
        <span class="text-3xl block">🥦</span>
        <p class="text-xs font-semibold text-slate-600">Votre liste de courses est vide</p>
        <p class="text-[11px]">Choisissez vos plats dans le planning pour générer automatiquement les ingrédients par rayon Grand Frais.</p>
      </div>
    `;
  }

  renderAtHomeSection(container, atHome);
  renderPantryCard();
  renderBudgetCard();

  // « J'en ai déjà » : mémorisé dans le placard
  container.querySelectorAll('.btn-pantry').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const snapshot = takeSnapshot();
      if (!state.pantry.includes(id)) state.pantry.push(id);
      state.pantryNeeded = state.pantryNeeded.filter(x => x !== id);
      saveToLocalStorage();
      renderGroceries();
      showToast('Ajouté au placard', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
    });
  });

  // Événements pour cocher / décocher
  container.querySelectorAll('.grocery-check').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = e.currentTarget.dataset.id;
      const type = e.currentTarget.dataset.type;
      const checked = e.currentTarget.checked;

      if (type === 'staple') {
        const item = state.staples.find(s => s.id === id);
        if (item) item.checked = checked;
      } else {
        state.checkedGroceries[id] = checked;
      }
      if (checked) settleId = id;

      saveToLocalStorage();
      renderGroceries();
    });
  });

  container.querySelectorAll('.btn-staple-plus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const st = state.staples.find(x => x.id === e.currentTarget.dataset.id);
      if (st) { st.qty = Math.min(99, (st.qty || 1) + 1); saveToLocalStorage(); renderGroceries(); }
    });
  });
  container.querySelectorAll('.rayon-checkall').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.rayon;
      const items = id === 'courants' ? state.staples : currentSplit().toBuy.filter(g => g.rayon === id);
      const isChecked = (it) => id === 'courants' ? it.checked : !!state.checkedGroceries[it.id];
      const target = !items.every(isChecked); // tout est coché → on décoche, sinon on coche tout
      const snapshot = takeSnapshot();
      items.forEach(it => { if (id === 'courants') it.checked = target; else state.checkedGroceries[it.id] = target; });
      saveToLocalStorage(); renderGroceries();
      showToast(target ? 'Rayon coché' : 'Rayon décoché', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
    });
  });
  container.querySelectorAll('.rayon-head').forEach(h => {
    h.addEventListener('click', () => {
      const id = h.dataset.rayon;
      if (collapsedRayons.has(id)) collapsedRayons.delete(id); else collapsedRayons.add(id);
      renderGroceries();
    });
  });

  // Suppression des produits courants individuels
  container.querySelectorAll('.btn-delete-staple').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const snapshot = takeSnapshot();
      state.staples = state.staples.filter(s => s.id !== id);
      saveToLocalStorage();
      renderGroceries();
      showToast('Produit retiré', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
    });
  });
}

// 3. Rendu du Catalogue de Recettes (affichage progressif, photos différées)
function recipeCardHTML(recipe, idx = 99) {
  const isFav = state.favorites.includes(recipe.id);
  const isCustom = recipe.id.startsWith('custom-');
  return `
    <div class="ios-card p-3.5 flex gap-3 hover:border-brand-300 transition-all cursor-pointer btn-open-detail" data-id="${esc(recipe.id)}" role="button" tabindex="0">
      <img src="${esc(thumbImg(recipe.image))}" alt="" ${idx < 3 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async" class="img-soft w-24 h-24 rounded-2xl object-cover shadow-sm flex-shrink-0">
      <div class="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-1 flex-wrap mb-0.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-600">${esc(recipe.tag)}</span>
              ${isCustom ? `<span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">Maison</span>` : ''}
            </div>
            <div class="flex items-center gap-1.5">
              ${recipe.isBudget ? `<span class="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">💰 Pas cher</span>` : ''}
              <span class="text-[11px] text-slate-500 font-medium">≈ ${money(recipePP(recipe))} €/portion</span>
              <span class="text-[11px] text-slate-500 font-medium">⏱️ ${esc(recipe.timeMinutes)} min</span>
            </div>
          </div>
          <h3 class="font-bold text-sm text-slate-900 mt-0.5 leading-snug">${esc(recipe.title)}</h3>
        </div>

        <div class="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
          <button type="button" class="btn-toggle-fav flex items-center justify-center w-8 h-8 rounded-xl transition-all ${isFav ? 'text-rose-500 bg-rose-50 hover:bg-rose-100' : 'text-slate-400 bg-slate-100 hover:text-rose-500 hover:bg-rose-50'}" data-id="${esc(recipe.id)}" title="${isFav ? 'Retirer des favoris' : 'Mettre en favori'}" aria-label="${isFav ? 'Retirer des favoris' : 'Mettre en favori'}" aria-pressed="${isFav}">${ICONS.heart(isFav)}</button>
          <button type="button" class="btn-add-to-plan bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs py-1.5 px-3 rounded-xl active:scale-95 transition-all text-center flex-shrink-0" data-id="${esc(recipe.id)}">
            + Au planning
          </button>
        </div>
      </div>
    </div>`;
}

function appendCatalogFooter(container) {
  const remaining = catalogFiltered.length - catalogLimit;
  if (catalogObserver) { catalogObserver.disconnect(); catalogObserver = null; }
  if (remaining <= 0) return;
  container.insertAdjacentHTML('beforeend', `
    <div id="catalog-more" class="text-center pt-1 pb-2">
      <button type="button" id="btn-catalog-more" class="text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-4 py-2.5 rounded-xl active:scale-95 transition-all">
        Afficher plus de plats (${remaining})
      </button>
    </div>`);
  const btn = document.getElementById('btn-catalog-more');
  if (btn && 'IntersectionObserver' in window) {
    catalogObserver = new IntersectionObserver(entries => {
      if (entries.some(en => en.isIntersecting)) showMoreRecipes();
    }, { rootMargin: '700px 0px' });
    catalogObserver.observe(btn);
  }
}

function showMoreRecipes() {
  const container = document.getElementById('recipes-catalog-grid');
  if (!container || catalogLimit >= catalogFiltered.length) return;
  const from = catalogLimit;
  catalogLimit = Math.min(catalogFiltered.length, catalogLimit + CATALOG_PAGE);
  const more = document.getElementById('catalog-more');
  if (more) more.remove();
  container.insertAdjacentHTML('beforeend', catalogFiltered.slice(from, catalogLimit).map((r) => recipeCardHTML(r)).join(''));
  appendCatalogFooter(container);
}

function renderCatalog(resetLimit = false) {
  const container = document.getElementById('recipes-catalog-grid');
  if (resetLimit) catalogLimit = CATALOG_PAGE;

  let filtered = [...state.recipes];

  // Filtrage par catégorie
  const f = state.activeFilter;
  if (f === 'budget') {
    filtered = filtered.filter(r => r.isBudget === true);
  } else if (['printemps', 'ete', 'automne', 'hiver'].includes(f)) {
    filtered = filtered.filter(r => GL.recipeSeasons(r).includes(f));
  } else if (f.startsWith('style:')) {
    filtered = filtered.filter(r => GL.recipeStyles(r).includes(f.slice(6)));
  } else if (f === 'unepoele') {
    filtered = filtered.filter(r => GL.isOnePan(r));
  } else if (f === 'sanspork') {
    filtered = filtered.filter(r => !GL.containsPork(r));
  } else if (f === 'sanslactose') {
    filtered = filtered.filter(r => !GL.containsLactose(r));
  } else if (f === 'express') {
    filtered = filtered.filter(r => r.timeMinutes <= 20);
  } else if (f === 'favoris') {
    filtered = filtered.filter(r => state.favorites.includes(r.id));
  } else if (f === 'maison') {
    filtered = filtered.filter(r => r.id.startsWith('custom-'));
  } else if (f === 'jamais') {
    filtered = filtered.filter(r => !(state.notes[r.id] && state.notes[r.id].cooked));
  } else if (f === 'recent') {
    filtered = filtered.filter(r => state.notes[r.id] && state.notes[r.id].cooked && (Date.now() - state.notes[r.id].cooked) < 30 * 86400000);
  } else if (f !== 'all') {
    filtered = filtered.filter(r => r.type === f || (f === 'vege' && r.type === 'vegetarien'));
  }

  // Filtrage par recherche (insensible à la casse, accents et ponctuation)
  if (state.searchQuery.trim()) {
    const q = cleanSearchText(state.searchQuery);
    filtered = filtered.filter(r =>
      cleanSearchText(r.title).includes(q) ||
      cleanSearchText(r.description).includes(q) ||
      (r.ingredients && r.ingredients.some(i => cleanSearchText(i.name).includes(q)))
    );
  }

  // Tri
  if (state.sortOption === 'budget') {
    filtered.sort((a, b) => recipePP(a) - recipePP(b));
  } else if (state.sortOption === 'fastest') {
    filtered.sort((a, b) => a.timeMinutes - b.timeMinutes);
  } else if (state.sortOption === 'random') {
    // ordre aléatoire stable tant qu'on ne clique pas sur « Mélanger » (la pagination ne saute pas)
    const rank = (id) => { let h = state.shuffleSeed | 0; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761); return (h ^ (h >>> 15)) >>> 0; };
    filtered.sort((a, b) => rank(a.id) - rank(b.id));
  }
  if (f === 'recent') filtered.sort((a, b) => state.notes[b.id].cooked - state.notes[a.id].cooked); // les plus récents d'abord
  const reshuffle = document.getElementById('btn-reshuffle');
  if (reshuffle) reshuffle.classList.toggle('hidden', state.sortOption !== 'random');

  catalogFiltered = filtered;
  document.getElementById('recipes-count-label').textContent = `${filtered.length} plat${filtered.length > 1 ? 's' : ''} disponible${filtered.length > 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="ios-card p-8 text-center text-slate-400 space-y-2">
        <span class="text-3xl block">🔍</span>
        <p class="text-xs font-semibold text-slate-600">Aucun plat ne correspond</p>
        <p class="text-[11px]">Essayez un autre mot ou un autre filtre.</p>
      </div>`;
    return;
  }

  const visible = Math.min(catalogLimit, filtered.length);
  catalogLimit = visible;
  container.innerHTML = filtered.slice(0, visible).map(recipeCardHTML).join('');
  appendCatalogFooter(container);
}

function recentSearches() {
  try { const l = JSON.parse(safeGetItem('gamelle_recent_searches') || '[]'); return Array.isArray(l) ? l.filter(x => typeof x === 'string').slice(0, 6) : []; } catch (e) { return []; }
}
function renderRecentSearches() {
  const box = document.getElementById('recent-searches');
  if (!box) return;
  const list = (state.searchQuery || '').trim() ? [] : recentSearches();
  box.classList.toggle('hidden', !list.length);
  box.innerHTML = list.length ? '<span class="text-[12px] font-semibold text-slate-400 flex-shrink-0">Récent</span>' + list.map(q => `<button type="button" class="recent-chip whitespace-nowrap text-[12px] bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium" data-q="${esc(q)}">${esc(q)}</button>`).join('') : '';
}

// Un seul écouteur pour toute la grille (favoris, ajout au planning, fiche détaillée)
function setupCatalogEvents() {
  const grid = document.getElementById('recipes-catalog-grid');
  if (!grid) return;
  grid.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.btn-toggle-fav');
    if (favBtn) {
      e.stopPropagation();
      toggleFavorite(favBtn.dataset.id);
      if (state.activeFilter === 'favoris') {
        renderCatalog();
      } else {
        const isFav = state.favorites.includes(favBtn.dataset.id);
        favBtn.className = `btn-toggle-fav fav-pop flex items-center justify-center w-8 h-8 rounded-xl transition-all ${isFav ? 'text-rose-500 bg-rose-50 hover:bg-rose-100' : 'text-slate-400 bg-slate-100 hover:text-rose-500 hover:bg-rose-50'}`;
        favBtn.title = isFav ? 'Retirer des favoris' : 'Mettre en favori';
        favBtn.setAttribute('aria-label', favBtn.title);
        favBtn.setAttribute('aria-pressed', String(isFav));
        favBtn.innerHTML = ICONS.heart(isFav);
      }
      return;
    }
    const addBtn = e.target.closest('.btn-add-to-plan');
    if (addBtn) {
      e.stopPropagation();
      addRecipeToPlan(addBtn.dataset.id);
      return;
    }
    if (e.target.closest('#btn-catalog-more')) { showMoreRecipes(); return; }
    const card = e.target.closest('.btn-open-detail');
    if (card) openRecipeDetail(card.dataset.id);
  });
  grid.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('btn-open-detail')) {
      e.preventDefault();
      openRecipeDetail(e.target.dataset.id);
    }
  });
}

function openSelectDayForRecipe(recipeId) {
  addRecipeToPlan(recipeId);
}

// ==========================================
// FICHE DÉTAILLÉE DE LA RECETTE (INGRÉDIENTS)
// ==========================================
function toggleFavorite(recipeId) {
  if (!Array.isArray(state.favorites)) state.favorites = [];
  if (state.favorites.includes(recipeId)) {
    state.favorites = state.favorites.filter(id => id !== recipeId);
  } else {
    state.favorites.push(recipeId);
  }
  saveToLocalStorage();
}

function updateDetailFavIcon() {
  const icon = document.getElementById('detail-fav-icon');
  if (icon && state.activeDetailRecipeId) {
    const isFav = state.favorites.includes(state.activeDetailRecipeId);
    icon.innerHTML = ICONS.heart(isFav, 'w-4 h-4');
    icon.classList.toggle('text-rose-400', isFav);
    const btn = document.getElementById('btn-detail-fav');
    if (btn) btn.title = isFav ? 'Retirer des favoris' : 'Mettre en favori';
  }
}
// Empreinte de ce qu'affiche la fiche recette : si elle ne change pas, inutile de la redessiner
function detailSignature(recipeId) {
  const r = state.recipes.find(x => x.id === recipeId);
  if (!r) return '';
  return JSON.stringify([recipeId, state.portions, r.title, r.image, r.tag, r.timeMinutes, r.season, r.isBudget, r.basePortions, r.ingredients, r.steps]);
}

function openRecipeDetail(recipeId) {
  updateDetailFavIcon();
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  state.activeDetailRecipeId = recipeId;
  updateDetailFavIcon();
  const modal = document.getElementById('recipe-detail-modal');

  const detailImg = document.getElementById('detail-recipe-image');
  detailImg.onerror = () => imgFallback(detailImg);
  const detailSrc = safeImg(recipe.image);
  if (detailImg.getAttribute('src') !== detailSrc) detailImg.src = detailSrc;
  document.getElementById('detail-recipe-title').textContent = recipe.title;
  document.getElementById('detail-recipe-tag').textContent = recipe.tag;
  document.getElementById('detail-recipe-time').textContent = `${recipe.timeMinutes} min`;
  {
    const seasons = GL.recipeSeasons(recipe);
    document.getElementById('detail-recipe-season').textContent = seasons.length >= 4 ? 'Toute saison'
      : GL.SEASONS.filter(x => seasons.includes(x.id)).map(x => `${x.emoji} ${x.label}`).join(' · ');
  }
  renderNotesRow();
  renderNutritionCard(recipe);
  
  const costEl = document.getElementById('detail-recipe-cost');
  if (costEl) costEl.textContent = `≈ ${money(recipePP(recipe))} € / portion · ≈ ${euro(recipeMealCost(recipe))}`;
  const budgetBadge = document.getElementById('detail-recipe-budget');
  if (recipe.isBudget) {
    budgetBadge.classList.remove('hidden');
  } else {
    budgetBadge.classList.add('hidden');
  }

  document.getElementById('detail-recipe-portions').textContent = `${state.portions} portion${state.portions > 1 ? 's' : ''}`;

  // Rendu des ingrédients par rayon Grand Frais
  const ratio = state.portions / (recipe.basePortions || 4);
  const ingsList = document.getElementById('detail-ingredients-list');
  ingsList.innerHTML = '';
  document.getElementById('detail-ingredients-count').textContent = `${recipe.ingredients.length} articles`;

  GRAND_FRAIS_RAYONS.forEach(rayon => {
    const itemsInRayon = recipe.ingredients.filter(i => i.rayon === rayon.id);
    if (itemsInRayon.length === 0) return;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'bg-slate-50 rounded-2xl p-3 border border-slate-100';

    groupDiv.innerHTML = `
      <div class="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
        ${rayonIcon(rayon)} <span>${rayon.name}</span>
      </div>
      <div class="space-y-1.5 divide-y divide-slate-100">
        ${itemsInRayon.map(ing => {
          const qty = (ing.quantity || 1) * ratio;
          const formatted = formatQuantityAndUnit(qty, ing.unit, ing.name);
          return `
            <div class="flex items-center justify-between text-xs pt-1.5">
              <span class="text-slate-800 font-medium">${esc(ing.name)}</span>
              <span class="font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200">${formatted}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    ingsList.appendChild(groupDiv);
  });

  // Rendu des étapes résumées
  const stepsList = document.getElementById('detail-steps-list');
  stepsList.innerHTML = '';
  recipe.steps.forEach((step, idx) => {
    const stepRow = document.createElement('div');
    stepRow.className = 'flex gap-2.5 py-1.5';
    const instruction = typeof step === 'string' ? step : (step.instruction || '');
    stepRow.innerHTML = `
      <span class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">${idx + 1}</span>
      <p class="text-xs text-slate-700 leading-relaxed font-medium flex-1">${esc(instruction)}</p>
    `;
    stepsList.appendChild(stepRow);
  });

  state._detailSig = detailSignature(recipeId);

  // Actions spécifiques aux recettes créées maison (Modifier / Supprimer)
  const customActions = document.getElementById('detail-custom-actions');
  if (customActions) {
    if (recipe.id.startsWith('custom-')) {
      customActions.classList.remove('hidden');
    } else {
      customActions.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
}

// ==========================================
// MODAL SELECTION DE PLAT POUR UN JOUR
// ==========================================
function openSelectMealModal(day) {
  state.selectingDay = day;
  document.getElementById('modal-day-name').textContent = typeof day === 'number' ? `repas ${day + 1}` : day;
  const modalSelectPortions = document.getElementById('modal-select-meal-portions');
  if (modalSelectPortions) {
    modalSelectPortions.textContent = `${state.portions} portion${state.portions > 1 ? 's' : ''}`;
  }
  const list = document.getElementById('modal-meal-choices-list');
  list.innerHTML = '';

  // Bouton création rapide de recette maison pour ce jour
  const quickAddBtn = document.createElement('button');
  quickAddBtn.className = 'w-full py-2.5 px-3 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 mb-2 active:scale-95 transition-all shadow-xs';
  quickAddBtn.innerHTML = 'Créer une nouvelle recette maison';
  quickAddBtn.addEventListener('click', () => {
    document.getElementById('select-meal-modal').classList.add('hidden');
    openCustomRecipeModal();
  });
  list.appendChild(quickAddBtn);

  state.recipes.forEach(recipe => {
    const item = document.createElement('div');
    item.className = 'ios-card p-2.5 flex items-center justify-between gap-3 cursor-pointer hover:border-brand-500 transition-all';
    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <img src="${esc(thumbImg(recipe.image))}" alt="" loading="lazy" decoding="async" class="img-soft w-12 h-12 rounded-xl object-cover flex-shrink-0">
        <div class="min-w-0">
          <h4 class="font-bold text-xs text-slate-800 truncate">${esc(recipe.title)}</h4>
          <span class="text-[11px] text-slate-400">⏱️ ${esc(recipe.timeMinutes)} min • ${esc(recipe.tag)}</span>
        </div>
      </div>
      <button class="bg-brand-50 text-brand-700 font-bold text-xs px-2.5 py-1.5 rounded-lg">Choisir</button>
    `;

    item.addEventListener('click', () => {
      state.plan[state.selectingDay] = recipe.id;
      saveToLocalStorage();
      document.getElementById('select-meal-modal').classList.add('hidden');
      renderPlanning();
      renderGroceries();
    });

    list.appendChild(item);
  });

  document.getElementById('select-meal-modal').classList.remove('hidden');
}

// ==========================================
// MODE CUISINE PAS-À-PAS (STYLE JOW)
// ==========================================
function startCookingMode(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  // Si on change de recette, on remet le minuteur à zéro
  if (!state.cookingRecipe || state.cookingRecipe.id !== recipeId) {
    resetCookingTimer();
  }

  state.cookingRecipe = recipe;
  state.cookingStepIndex = 0;

  document.getElementById('cooking-recipe-title').textContent = recipe.title;
  document.getElementById('cooking-recipe-tag').textContent = recipe.tag;
  document.getElementById('cooking-recipe-time').textContent = `⏱️ ${recipe.timeMinutes} min`;
  document.getElementById('cooking-recipe-portions').textContent = `🥘 ${state.portions} portions`;

  renderCookingStep();
  document.getElementById('cooking-modal').classList.remove('hidden');

  // Demander le WakeLock (garder l'écran allumé)
  requestWakeLock();
}

function renderCookingStep() {
  const recipe = state.cookingRecipe;
  const stepIndex = state.cookingStepIndex;
  const step = recipe.steps[stepIndex];
  const totalSteps = recipe.steps.length;

  document.getElementById('cooking-step-indicator').textContent = `Étape ${stepIndex + 1} sur ${totalSteps}`;
  document.getElementById('cooking-step-text').textContent = typeof step === 'string' ? step : (step.instruction || '');

  // Ingrédients spécifiques à cette étape
  const ingBox = document.getElementById('cooking-step-ingredients-box');
  const ingList = document.getElementById('cooking-step-ingredients-list');
  ingList.innerHTML = '';

  if (step.ingredients && step.ingredients.length > 0) {
    ingBox.classList.remove('hidden');
    const ratio = (state.portions || 4) / (recipe.basePortions || 4);
    step.ingredients.forEach(ingName => {
      const badge = document.createElement('span');
      badge.className = 'text-xs font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg';
      // Cherche l'ingrédient correspondant dans la recette pour afficher la quantité
      const matched = (recipe.ingredients || []).find(i => {
        const iName = (i.name || '').toLowerCase();
        const sName = ingName.toLowerCase();
        return iName === sName
          || iName.includes(sName.split(' ')[0])
          || sName.includes(iName.split(' ')[0]);
      });
      if (matched && matched.quantity) {
        const qty = matched.quantity * ratio;
        const formatted = formatQuantityAndUnit(qty, matched.unit, matched.name);
        badge.textContent = `${formatted} — ${matched.name}`;
      } else {
        badge.textContent = ingName;
      }
      ingList.appendChild(badge);
    });
  } else {
    ingBox.classList.add('hidden');
  }

  // Minuteur intégré pour cette étape
  const timerContainer = document.getElementById('cooking-timer-container');
  if (step.timerMinutes) {
    timerContainer.classList.remove('hidden');
  } else {
    timerContainer.classList.add('hidden');
  }

  // Mettre à jour l'affichage du minuteur sans couper le compte à rebours
  updateCookingTimerUI();

  // Boutons Suivant / Précédent
  const prevBtn = document.getElementById('btn-cooking-prev');
  const nextBtn = document.getElementById('btn-cooking-next');

  prevBtn.disabled = stepIndex === 0;
  prevBtn.classList.toggle('opacity-50', stepIndex === 0);

  if (stepIndex === totalSteps - 1) {
    nextBtn.innerHTML = `<span>Bon appétit</span>`;
    nextBtn.className = " w-2/3 bg-emerald-700 text-white font-bold py-3 rounded-2xl text-xs active:scale-95";
  } else {
    nextBtn.innerHTML = `<span>Étape suivante</span> →`;
    nextBtn.className = " w-2/3 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-2xl text-xs active:scale-95";
  }
}

// ==========================================
// GESTION DES MINUTEURS MULTIPLES & INDÉPENDANTS
// (Chaque étape ayant une durée possède son propre minuteur, qui continue
//  de tourner même en changeant d'étape ou en passant à une autre)
// ==========================================
function formatCookingTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getStepTimer(stepIndex) {
  if (!state.activeTimers) state.activeTimers = {};
  return state.activeTimers[stepIndex];
}

function initStepTimer(stepIndex, durationMinutes) {
  if (!state.activeTimers) state.activeTimers = {};
  if (!state.activeTimers[stepIndex]) {
    state.activeTimers[stepIndex] = {
      stepIndex: stepIndex,
      label: `Étape ${stepIndex + 1}`,
      totalSeconds: durationMinutes * 60,
      remainingSeconds: durationMinutes * 60,
      running: false,
      intervalId: null
    };
  }
  return state.activeTimers[stepIndex];
}

function toggleCookingTimer(targetStepIndex = null) {
  const stepIdx = targetStepIndex !== null ? targetStepIndex : state.cookingStepIndex;
  const currentStep = state.cookingRecipe?.steps[stepIdx];
  if (!currentStep || !currentStep.timerMinutes) return;

  const timer = initStepTimer(stepIdx, currentStep.timerMinutes);

  if (timer.running) {
    // Pause
    timer.running = false;
    if (timer.intervalId) {
      clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
  } else {
    // Démarrer ou reprendre
    if (timer.remainingSeconds <= 0) {
      timer.remainingSeconds = timer.totalSeconds;
    }
    timer.running = true;
    timer.intervalId = setInterval(() => {
      if (timer.remainingSeconds > 0) {
        timer.remainingSeconds--;
        updateCookingTimerUI();
      } else {
        clearInterval(timer.intervalId);
        timer.intervalId = null;
        timer.running = false;
        playTimerSound();
        if ('vibrate' in navigator) {
          try { navigator.vibrate([400, 200, 400, 200, 800]); } catch (e) {}
        }
        showToast(`Minuteur terminé : ${timer.label}`, { duration: 9000 });
        updateCookingTimerUI();
      }
    }, 1000);
  }

  updateCookingTimerUI();
}

function resetCookingTimer(targetStepIndex = null) {
  const stepIdx = targetStepIndex !== null ? targetStepIndex : state.cookingStepIndex;
  const timer = getStepTimer(stepIdx);
  if (timer) {
    if (timer.intervalId) {
      clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
    timer.running = false;
    timer.remainingSeconds = timer.totalSeconds;
  }
  updateCookingTimerUI();
}

function resetAllCookingTimers() {
  if (state.activeTimers) {
    Object.values(state.activeTimers).forEach(t => {
      if (t.intervalId) {
        clearInterval(t.intervalId);
        t.intervalId = null;
      }
    });
  }
  state.activeTimers = {};
  updateCookingTimerUI();
}

function updateCookingTimerUI() {
  const currentStep = state.cookingRecipe?.steps[state.cookingStepIndex];
  const stepTimerBox = document.getElementById('cooking-timer-container');
  const stepTimerDisplay = document.getElementById('timer-display');
  const stepTimerToggle = document.getElementById('btn-timer-toggle');
  const stepTimerReset = document.getElementById('btn-timer-reset');

  // 1. Mise à jour du timer de l'étape courante
  if (currentStep && currentStep.timerMinutes) {
    if (stepTimerBox) stepTimerBox.classList.remove('hidden');
    const timer = getStepTimer(state.cookingStepIndex);
    const remaining = timer ? timer.remainingSeconds : currentStep.timerMinutes * 60;
    const isRunning = timer ? timer.running : false;

    if (stepTimerDisplay) stepTimerDisplay.textContent = formatCookingTime(remaining);
    if (stepTimerToggle) {
      stepTimerToggle.textContent = isRunning ? 'Pause' : (timer && timer.remainingSeconds < timer.totalSeconds ? 'Reprendre' : 'Démarrer');
      stepTimerToggle.className = isRunning
        ? "bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-sm active:scale-95"
        : "bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-sm active:scale-95";
    }
    if (stepTimerReset) {
      if (timer && timer.remainingSeconds < timer.totalSeconds) {
        stepTimerReset.classList.remove('hidden');
      } else {
        stepTimerReset.classList.add('hidden');
      }
    }
  } else {
    if (stepTimerBox) stepTimerBox.classList.add('hidden');
  }

  // 2. Bannière sticky en haut : affiche tous les minuteurs actifs ou en pause
  const stickyBanner = document.getElementById('sticky-cooking-timer-banner');
  if (stickyBanner) {
    const activeTimersList = Object.values(state.activeTimers || {}).filter(t => t.running || (t.remainingSeconds > 0 && t.remainingSeconds < t.totalSeconds));
    if (activeTimersList.length > 0) {
      stickyBanner.classList.remove('hidden');
      let timersContainer = stickyBanner.querySelector('.timers-list');
      if (!timersContainer) {
        timersContainer = document.createElement('div');
        timersContainer.className = 'timers-list px-4 py-2 flex flex-col gap-2';
        stickyBanner.appendChild(timersContainer);
      }
      timersContainer.innerHTML = '';

      activeTimersList.forEach(t => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-2 py-0.5 border-b border-emerald-700/50 last:border-0';
        row.innerHTML = `
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs">${t.running ? '⏳' : '⏸️'}</span>
            <span class="font-mono font-bold text-sm bg-emerald-900/90 px-2 py-0.5 rounded-md tracking-wider text-emerald-200">
              ${formatCookingTime(t.remainingSeconds)}
            </span>
            <span class="text-xs font-semibold truncate text-white">
              ${t.label} ${t.running ? '' : '(en pause)'}
            </span>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button class="btn-sub-timer-toggle bg-white text-emerald-800 hover:bg-emerald-50 font-bold text-[11px] px-2.5 py-1 rounded-lg active:scale-95 shadow-xs" data-step="${t.stepIndex}">
              ${t.running ? 'Pause' : 'Reprendre'}
            </button>
            <button class="btn-sub-timer-reset bg-emerald-700 hover:bg-emerald-900 text-white text-[11px] px-2 py-1 rounded-lg active:scale-95" data-step="${t.stepIndex}" title="Réinitialiser">
              ↺
            </button>
          </div>
        `;

        row.querySelector('.btn-sub-timer-toggle').addEventListener('click', () => {
          toggleCookingTimer(t.stepIndex);
        });
        row.querySelector('.btn-sub-timer-reset').addEventListener('click', () => {
          resetCookingTimer(t.stepIndex);
        });

        timersContainer.appendChild(row);
      });
    } else {
      stickyBanner.classList.add('hidden');
    }
  }
}

function playTimerSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // Ré
    osc.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    console.log("Audio not allowed", e);
  }
}

// WakeLock API (garde l'écran iPhone allumé)
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      document.getElementById('wake-lock-label').textContent = 'Écran actif';
    }
  } catch (err) {
    console.log('WakeLock non supporté ou refusé', err);
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    state.wakeLock.release().then(() => state.wakeLock = null);
  }
}

// ==========================================
// EXPORTS & PARTAGE FAMILLE
// ==========================================

function getShareUrl() {
  const ids = (Array.isArray(state.plan) ? state.plan : Object.values(state.plan)).map(id => id || '').join(',');
  let url = `${window.location.origin}${window.location.pathname}?menu=${ids}&portions=${state.portions}`;
  if (state.householdCode) {
    url += `&household=${encodeURIComponent(state.householdCode)}`;
  }

  // Inclure les articles courants s'il y en a (œufs, lait, etc.)
  if (state.staples && state.staples.length > 0) {
    const minStaples = state.staples.map(s => ({ n: s.name, c: s.checked ? 1 : 0 }));
    url += `&staples=${encodeURIComponent(JSON.stringify(minStaples))}`;
  }

  return url;
}

function updateQRCode() {
  const shareUrl = getShareUrl();
  const qrImg = document.getElementById('share-qr-image');
  if (qrImg && qrImg.dataset.enabled === '1') {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`;
  }
}

// 1. Lien Magique partagé
function shareMagicLink() {
  const shareUrl = getShareUrl();

  if (navigator.share) {
    navigator.share({
      title: "Notre menu de la semaine & Courses Grand Frais",
      text: `Voici nos repas (${state.portions} portions) et la liste de courses !`,
      url: shareUrl
    }).catch(() => copyToClipboard(shareUrl, 'Lien copié'));
  } else {
    copyToClipboard(shareUrl, 'Lien copié');
  }
}

// 2. Texte propre pour WhatsApp ou Notes Apple
function getFormattedGroceriesText() {
  const groceries = currentSplit().toBuy;
  let text = `🛒 *COURSES GRAND FRAIS* (${state.portions} portions)\n`;
  text += `📅 Semaine du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}\n\n`;

  GRAND_FRAIS_RAYONS.forEach(rayon => {
    const isStaple = rayon.id === 'courants';
    const items = isStaple ? state.staples : groceries.filter(g => g.rayon === rayon.id);
    if (items.length === 0) return;

    text += `${rayon.icon} *${rayon.name.toUpperCase()}*\n`;
    items.forEach(item => {
      if (isStaple) {
        text += `[ ] ${item.name}\n`;
      } else {
        const qStr = item.formattedQtyText || formatQuantityAndUnit(item.quantity, item.baseUnit || item.unit);
        text += `[ ] ${qStr} - ${item.name}\n`;
      }
    });
    text += `\n`;
  });

  return text;
}

function copyFormattedText() {
  const text = getFormattedGroceriesText();
  copyToClipboard(text, 'Liste copiée : collez-la dans Notes ou WhatsApp');
}

function copyToClipboard(content, okMessage = 'Copié dans le presse-papier') {
  const manual = () => promptDialog({
    title: 'Copier manuellement',
    message: 'Sélectionnez le texte puis copiez-le.',
    value: content,
    multiline: true,
    confirmLabel: 'Fermer',
    hideCancel: true
  });
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(content).then(() => showToast(okMessage)).catch(manual);
  } else {
    manual();
  }
}

// ==========================================
// CONFIGURATION DES ÉCOUTEURS D'ÉVÉNEMENTS
// ==========================================
function switchTab(tabId) {
  const tab = document.getElementById(tabId);
  if (!tab) return;
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.nav-tab-btn').forEach(b => {
    b.classList.remove('active', 'text-brand-600', 'font-bold');
    b.classList.add('text-slate-400');
  });
  tab.classList.add('active');
  const btn = document.querySelector(`.nav-tab-btn[data-tab="${tabId}"]`);
  if (btn) {
    btn.classList.add('active', 'text-brand-600', 'font-bold');
    btn.classList.remove('text-slate-400');
  }
  window.scrollTo(0, 0);
  safeSetItem('gamelle_tab', tabId);
}

function setupEventListeners() {
  // Navigation par onglets
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab));
  });

  // Apparence : Clair / Sombre / Système
  document.querySelectorAll('[data-theme-pref]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.gamelleTheme) window.gamelleTheme.set(btn.dataset.themePref);
      renderThemeControl();
    });
  });

  // Réglage des portions (+ / -) dans l'en-tête (pas de 1 portion, de 1 à 12)
  document.getElementById('btn-portion-minus').addEventListener('click', () => {
    if (state.portions > 1) {
      state.portions -= 1;
      saveToLocalStorage();
      renderAll();
    }
  });

  document.getElementById('btn-portion-plus').addEventListener('click', () => {
    if (state.portions < 12) {
      state.portions += 1;
      saveToLocalStorage();
      renderAll();
    }
  });

  // Réglage des portions (+ / -) directement dans la fiche détaillée d'un plat
  const btnDetailMinus = document.getElementById('btn-detail-portion-minus');
  if (btnDetailMinus) {
    btnDetailMinus.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.portions > 1) {
        state.portions -= 1;
        saveToLocalStorage();
        renderAll();
      }
    });
  }

  const btnDetailPlus = document.getElementById('btn-detail-portion-plus');
  if (btnDetailPlus) {
    btnDetailPlus.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.portions < 12) {
        state.portions += 1;
        saveToLocalStorage();
        renderAll();
      }
    });
  }

  // Générer & Effacer le planning
  document.getElementById('btn-generate-menu').addEventListener('click', openGenerateModal);
  setupGenerateModal();
  setupPantryCard();
  setupNotesRow();
  setupScanModal();
  setupStapleAutocomplete();
  setupMoreFilters();
  setupLeftoversModal();
  setupNotifySettings();
  setupTicketModal();
  setupBackupUI();
  initSyncMonitoring();
  document.getElementById('btn-clear-menu').addEventListener('click', clearMenu);

  const saveMenuBtn = document.getElementById('btn-save-current-menu');
  if (saveMenuBtn) saveMenuBtn.addEventListener('click', saveCurrentMenu);

  const openSavedBtn = document.getElementById('btn-open-saved-menus');
  if (openSavedBtn) openSavedBtn.addEventListener('click', openSavedMenusModal);

  const closeSavedBtn = document.getElementById('btn-close-saved-menus');
  if (closeSavedBtn) closeSavedBtn.addEventListener('click', closeSavedMenusModal);

  // Menus « … » : un seul bouton principal par écran, le reste est rangé dedans
  document.querySelectorAll('.more-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById(btn.dataset.menu);
      const open = menu.classList.contains('hidden');
      document.querySelectorAll('.more-menu').forEach(m => m.classList.add('hidden'));
      document.querySelectorAll('.more-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
      if (open) { menu.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.more-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.more-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
  });
  document.getElementById('btn-record-ticket').addEventListener('click', openTicketModal);
  document.getElementById('btn-menu-scan').addEventListener('click', openScanModal);
  document.getElementById('btn-open-pantry').addEventListener('click', () => {
    const d = document.getElementById('pantry-card'); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Copier & Vider les courses
  document.getElementById('btn-copy-groceries').addEventListener('click', copyFormattedText);
  document.getElementById('btn-clear-checked').addEventListener('click', () => {
    const anyChecked = Object.values(state.checkedGroceries).some(Boolean) || state.staples.some(s => s.checked);
    if (!anyChecked) { showToast('Aucun article coché'); return; }
    const snapshot = takeSnapshot();
    state.checkedGroceries = {};
    state.staples.forEach(s => s.checked = false);
    saveToLocalStorage();
    renderGroceries();
    showToast('Articles décochés', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
  });

  // Ajout de produits courants
  document.getElementById('form-add-staple').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('staple-input');
    if (input.value.trim()) { addStaple(input.value); input.value = ''; }
  });
  document.getElementById('staple-habituals').addEventListener('click', (e) => {
    const b = e.target.closest('.staple-quick-btn');
    if (b) addStaple(b.dataset.name);
  });
  renderHabituals();
  setupGrocerySwipe();

  // Recherche & Filtres dans le catalogue
  let searchTimer = null;
  document.getElementById('recipe-search-input').addEventListener('input', (e) => {
    const value = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = value;
      renderCatalog(true);
      renderRecentSearches();
    }, 160);
  });
  // Recherches récentes : mémorisées quand on valide ou quitte le champ
  const rememberSearch = () => {
    const v = (document.getElementById('recipe-search-input').value || '').trim();
    if (v.length < 3) return;
    const list = [v, ...recentSearches().filter(x => x.toLowerCase() !== v.toLowerCase())].slice(0, 6);
    safeSetItem('gamelle_recent_searches', JSON.stringify(list));
  };
  document.getElementById('recipe-search-input').addEventListener('blur', () => { rememberSearch(); renderRecentSearches(); });
  document.getElementById('recipe-search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { rememberSearch(); e.target.blur(); } });
  document.getElementById('recent-searches').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.recent-chip'); if (!b) return;
    e.preventDefault();
    const input = document.getElementById('recipe-search-input');
    input.value = b.dataset.q; state.searchQuery = b.dataset.q; renderCatalog(true); renderRecentSearches();
  });
  renderRecentSearches();
  setupCatalogEvents();
  setupQrOptIn();

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active', 'bg-brand-600', 'text-white');
        b.classList.add('bg-white', 'text-slate-600');
      });
      e.currentTarget.classList.add('active', 'bg-brand-600', 'text-white');
      e.currentTarget.classList.remove('bg-white', 'text-slate-600');
      state.activeFilter = e.currentTarget.dataset.filter;
      renderCatalog(true);
      updateMoreFiltersButton();
    });
  });

  // Tri du catalogue
  const sortSelect = document.getElementById('recipe-sort-select');
  if (sortSelect) {
    sortSelect.value = state.sortOption;
    const reshuffleBtn = document.getElementById('btn-reshuffle');
    if (reshuffleBtn) reshuffleBtn.addEventListener('click', () => { state.shuffleSeed = Math.floor(Math.random() * 1e9); renderCatalog(true); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    sortSelect.addEventListener('change', (e) => {
      state.sortOption = e.target.value;
      renderCatalog(true);
    });
  }

  // Fiche Recette Détaillée (Modal Ingrédients)
  const btnDetailFav = document.getElementById('btn-detail-fav');
  if (btnDetailFav) {
    btnDetailFav.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.activeDetailRecipeId) return;
      toggleFavorite(state.activeDetailRecipeId);
      updateDetailFavIcon();
      renderCatalog();
    });
  }

  document.getElementById('btn-close-detail').addEventListener('click', () => {
    document.getElementById('recipe-detail-modal').classList.add('hidden');
  });

  document.getElementById('btn-detail-add-to-plan').addEventListener('click', () => {
    if (state.activeDetailRecipeId) {
      document.getElementById('recipe-detail-modal').classList.add('hidden');
      addRecipeToPlan(state.activeDetailRecipeId);
    }
  });

  document.getElementById('btn-detail-cook').addEventListener('click', () => {
    if (state.activeDetailRecipeId) {
      document.getElementById('recipe-detail-modal').classList.add('hidden');
      startCookingMode(state.activeDetailRecipeId);
    }
  });

  // Mode Cuisine
  document.getElementById('btn-close-cooking').addEventListener('click', () => {
    document.getElementById('cooking-modal').classList.add('hidden');
    resetCookingTimer();
    releaseWakeLock();
  });

  // Navigation dans les étapes : conserve le minuteur en arrière-plan sans le remettre à zéro !
  document.getElementById('btn-cooking-prev').addEventListener('click', () => {
    if (state.cookingStepIndex > 0) {
      state.cookingStepIndex--;
      renderCookingStep();
    }
  });

  document.getElementById('btn-cooking-next').addEventListener('click', () => {
    const total = state.cookingRecipe.steps.length;
    if (state.cookingStepIndex < total - 1) {
      state.cookingStepIndex++;
      renderCookingStep();
    } else {
      if (state.cookingRecipe && state.cookingRecipe.id) setNote(state.cookingRecipe.id, { cooked: Date.now() }, true);
      document.getElementById('cooking-modal').classList.add('hidden');
      resetAllCookingTimers();
      releaseWakeLock();
    }
  });

  // Glisser pour changer d'étape (gauche = suivante, droite = précédente ; jamais de fin de recette par un glissement)
  const cookBody = document.getElementById('cooking-step-text').closest('.overflow-y-auto');
  let cx = 0, cy = 0;
  cookBody.addEventListener('touchstart', (e) => { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }, { passive: true });
  cookBody.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - cx, dy = e.changedTouches[0].clientY - cy;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const total = state.cookingRecipe ? state.cookingRecipe.steps.length : 0;
    if (dx < 0 && state.cookingStepIndex < total - 1) { state.cookingStepIndex++; renderCookingStep(); }
    else if (dx > 0 && state.cookingStepIndex > 0) { state.cookingStepIndex--; renderCookingStep(); }
  }, { passive: true });

  // Contrôles du minuteur (dans l'étape)
  const timerToggleBtn = document.getElementById('btn-timer-toggle');
  if (timerToggleBtn) {
    timerToggleBtn.addEventListener('click', () => toggleCookingTimer());
  }
  const timerResetBtn = document.getElementById('btn-timer-reset');
  if (timerResetBtn) {
    timerResetBtn.addEventListener('click', () => resetCookingTimer());
  }

  // Modals Fermetures
  document.getElementById('btn-close-select-meal').addEventListener('click', () => {
    document.getElementById('select-meal-modal').classList.add('hidden');
  });

  // Partage
  document.getElementById('btn-share-magic-link').addEventListener('click', shareMagicLink);
  document.getElementById('btn-share-whatsapp-text').addEventListener('click', copyFormattedText);

  // Gestion du Studio de Recette Maison
  const btnOpenAddRecipe = document.getElementById('btn-open-add-recipe');
  if (btnOpenAddRecipe) {
    btnOpenAddRecipe.addEventListener('click', () => openCustomRecipeModal());
  }

  const btnPlanningAddRecipe = document.getElementById('btn-planning-add-recipe');
  if (btnPlanningAddRecipe) {
    btnPlanningAddRecipe.addEventListener('click', () => openCustomRecipeModal());
  }

  document.getElementById('btn-close-custom-recipe').addEventListener('click', () => {
    document.getElementById('custom-recipe-modal').classList.add('hidden');
  });

  // Boutons photos prédéfinies
  document.querySelectorAll('.preset-photo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.currentTarget.dataset.img;
      const preview = document.getElementById('custom-image-preview');
      const urlInput = document.getElementById('custom-image-url');
      if (preview) preview.src = url;
      if (urlInput) urlInput.value = url;
    });
  });

  const customImgInput = document.getElementById('custom-image-url');
  if (customImgInput) {
    customImgInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const preview = document.getElementById('custom-image-preview');
      if (preview && val) preview.src = val;
    });
  }

  // Modifier une recette maison existante depuis la fiche détail
  const btnEditCustom = document.getElementById('btn-edit-custom-recipe');
  if (btnEditCustom) {
    btnEditCustom.addEventListener('click', () => {
      const recipe = state.recipes.find(r => r.id === state.activeDetailRecipeId);
      if (recipe) {
        document.getElementById('recipe-detail-modal').classList.add('hidden');
        openCustomRecipeModal(recipe);
      }
    });
  }

  // Supprimer une recette maison
  const btnDeleteCustom = document.getElementById('btn-delete-custom-recipe');
  if (btnDeleteCustom) {
    btnDeleteCustom.addEventListener('click', async () => {
      const recipe = state.recipes.find(r => r.id === state.activeDetailRecipeId);
      if (!recipe) return;
      const ok = await confirmDialog({
        title: 'Supprimer cette recette ?',
        message: `« ${recipe.title} » sera définitivement retirée de votre catalogue.`,
        confirmLabel: 'Supprimer',
        danger: true
      });
      if (ok) deleteCustomRecipe(recipe.id);
    });
  }

  // Soumission du formulaire de recette maison
  document.getElementById('form-custom-recipe').addEventListener('submit', (e) => {
    e.preventDefault();
    const existingId = document.getElementById('custom-recipe-id').value.trim();
    const title = document.getElementById('custom-title').value.trim();
    const time = parseInt(document.getElementById('custom-time').value, 10) || 25;
    const type = document.getElementById('custom-type').value;
    const season = document.getElementById('custom-season').value;
    const isBudget = document.getElementById('custom-budget').checked;
    const imgUrl = document.getElementById('custom-image-url').value.trim() || document.getElementById('custom-image-preview').src;
    const ingRaw = document.getElementById('custom-ingredients-text').value.trim();
    const stepsRaw = document.getElementById('custom-steps-text').value.trim();

    // Parser les ingrédients avec notre normaliseur expert Grand Frais
    const parsedIngs = ingRaw.split('\n').map(l => l.trim()).filter(Boolean).map(parseCustomIngredientLine);

    // Parser les étapes avec détection automatique des minuteurs
    const parsedSteps = stepsRaw.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const instruction = line.replace(/^[0-9]+[.)]\s*/, '').trim();
      let timerMinutes = null;
      const m = instruction.match(/(\d+)\s*(?:minutes?|min)\b/i);
      if (m) timerMinutes = parseInt(m[1], 10);
      return {
        instruction,
        ingredients: [],
        timerMinutes
      };
    });

    const targetId = existingId || ('custom-' + Date.now());
    const recipeObj = {
      id: targetId,
      title,
      description: "Recette maison personnalisée",
      season: season || "toutes",
      timeMinutes: time,
      tag: "Recette Maison",
      type: type,
      isBudget: isBudget,
      basePortions: 4,
      image: imgUrl,
      ingredients: parsedIngs,
      steps: parsedSteps
    };

    // Mettre à jour state.recipes
    const existingIdx = state.recipes.findIndex(r => r.id === targetId);
    if (existingIdx !== -1) {
      state.recipes[existingIdx] = recipeObj;
    } else {
      state.recipes.push(recipeObj);
    }

    saveToLocalStorage();
    document.getElementById('custom-recipe-modal').classList.add('hidden');
    document.getElementById('form-custom-recipe').reset();
    renderCatalog();
    renderPlanning();
    renderGroceries();
    showSyncToast(existingId ? 'Recette modifiée & synchronisée' : 'Recette ajoutée au catalogue & synchronisée');
  });

  // Boutons du Foyer Partagé en Direct
  const btnJoinHousehold = document.getElementById('btn-join-household');
  if (btnJoinHousehold) {
    btnJoinHousehold.addEventListener('click', () => {
      const input = document.getElementById('input-household-code');
      const value = input ? input.value.trim() : '';
      if (!value) { showToast('Saisissez le code de votre foyer'); return; }
      attemptJoinHousehold(value);
    });
  }

  const btnGenCode = document.getElementById('btn-generate-household-code');
  if (btnGenCode) {
    btnGenCode.addEventListener('click', () => {
      const code = generateHouseholdCode();
      const input = document.getElementById('input-household-code');
      if (input) input.value = code;
      setHouseholdCode(code);
    });
  }

  const btnDisconnect = document.getElementById('btn-disconnect-household');
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Quitter le foyer ?',
        message: 'La synchronisation s\'arrête. Vos données restent sur ce téléphone.',
        confirmLabel: 'Quitter',
        danger: true
      });
      if (ok) disconnectHousehold();
    });
  }

  const btnCopyCode = document.getElementById('btn-copy-sync-code');
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      if (state.householdCode && navigator.clipboard) {
        navigator.clipboard.writeText(state.householdCode).then(() => {
          showToast('Code du foyer copié');
        });
      }
    });
  }

  const btnForceSync = document.getElementById('btn-force-sync');
  if (btnForceSync) {
    btnForceSync.addEventListener('click', () => {
      broadcastSync();
      pollLatestSync();
      showSyncToast('Synchronisation effectuée');
    });
  }

  const headerSyncPill = document.getElementById('header-sync-pill');
  if (headerSyncPill) {
    headerSyncPill.addEventListener('click', () => {
      // Basculer vers l'onglet Partager
      switchTab('tab-partager');
    });
  }
}

let swRegistration = null;
let pendingUpdateWorker = null; // nouvelle version téléchargée, en attente d'installation

// Texte et bouton de la carte « Mise à jour » (Réglages)
function refreshUpdateCard() {
  const btn = document.getElementById('btn-check-update');
  const hint = document.getElementById('update-hint');
  if (!btn || !hint) return;
  if (pendingUpdateWorker) {
    hint.textContent = 'Une nouvelle version est prête';
    btn.textContent = 'Installer la mise à jour';
  } else {
    btn.textContent = 'Rechercher une mise à jour';
  }
}

function getAppVersion() {
  return new Promise(resolve => {
    const ctrl = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    if (!ctrl) return resolve(null);
    const ch = new MessageChannel();
    ch.port1.onmessage = e => resolve((e.data && e.data.version) || null);
    ctrl.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
    setTimeout(() => resolve(null), 1500);
  });
}

function waitInstalled(worker) {
  return new Promise(resolve => {
    if (worker.state === 'installed') return resolve(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') resolve(worker);
      else if (worker.state === 'redundant') resolve(null);
    });
    setTimeout(() => resolve(null), 20000);
  });
}

function initUpdateCard() {
  const btn = document.getElementById('btn-check-update');
  const hint = document.getElementById('update-hint');
  if (!btn || !hint) return;
  getAppVersion().then(v => { if (v && !pendingUpdateWorker) hint.textContent = `Version ${v} · vérifier les mises à jour`; });
  btn.addEventListener('click', async () => {
    if (!('serviceWorker' in navigator)) { window.location.reload(); return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Recherche…';
    try {
      const reg = swRegistration || await navigator.serviceWorker.getRegistration();
      if (!reg) { window.location.reload(); return; }
      let worker = pendingUpdateWorker || reg.waiting;
      if (!worker) {
        await reg.update();
        worker = reg.waiting || (reg.installing ? await waitInstalled(reg.installing) : null);
      }
      if (worker && navigator.serviceWorker.controller) {
        btn.textContent = 'Installation…';
        worker.postMessage({ type: 'SKIP_WAITING' }); // l'app se recharge toute seule
        setTimeout(() => { btn.disabled = false; refreshUpdateCard(); }, 6000);
        return;
      }
      showToast('Vous avez déjà la dernière version');
    } catch (err) {
      showToast('Vérification impossible (hors connexion ?)');
    }
    btn.disabled = false;
    btn.textContent = pendingUpdateWorker ? 'Installer la mise à jour' : label === 'Recherche…' ? 'Rechercher une mise à jour' : label;
    refreshUpdateCard();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    swRegistration = reg;
    const announce = (worker) => {
      pendingUpdateWorker = worker;
      refreshUpdateCard();
      const banner = document.getElementById('banner-update');
      if (banner) {
        banner.classList.remove('hidden');
        document.getElementById('btn-banner-update').onclick = () => { document.getElementById('btn-banner-update').textContent = 'Installation…'; worker.postMessage({ type: 'SKIP_WAITING' }); };
        document.getElementById('btn-banner-later').onclick = () => banner.classList.add('hidden');
      }
    };
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
      });
    });
  }).catch(err => console.log('SW registration failed:', err));

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

function checkForAppUpdate() {
  if (swRegistration) swRegistration.update().catch(() => {});
}

function setupQrOptIn() {
  const btn = document.getElementById('btn-show-qr');
  const img = document.getElementById('share-qr-image');
  const box = document.getElementById('share-qr-box');
  if (!btn || !img || !box) return;
  btn.addEventListener('click', () => {
    img.dataset.enabled = '1';
    box.classList.remove('hidden');
    btn.classList.add('hidden');
    updateQRCode();
  });
}

// Lancement au chargement du DOM
document.addEventListener('DOMContentLoaded', init);


// ==========================================
// STUDIO RECETTES MAISON (OUVERTURE & SUPPRESSION)
// ==========================================

function openCustomRecipeModal(recipeToEdit = null) {
  const modal = document.getElementById('custom-recipe-modal');
  const form = document.getElementById('form-custom-recipe');
  const idInput = document.getElementById('custom-recipe-id');
  const titleInput = document.getElementById('custom-title');
  const timeInput = document.getElementById('custom-time');
  const typeInput = document.getElementById('custom-type');
  const seasonInput = document.getElementById('custom-season');
  const budgetInput = document.getElementById('custom-budget');
  const imgInput = document.getElementById('custom-image-url');
  const previewImg = document.getElementById('custom-image-preview');
  const ingsText = document.getElementById('custom-ingredients-text');
  const stepsText = document.getElementById('custom-steps-text');
  const submitLabel = document.getElementById('custom-submit-label');

  if (recipeToEdit) {
    idInput.value = recipeToEdit.id;
    titleInput.value = recipeToEdit.title || '';
    timeInput.value = recipeToEdit.timeMinutes || 25;
    typeInput.value = recipeToEdit.type || 'volaille';
    seasonInput.value = recipeToEdit.season || 'toutes';
    budgetInput.checked = recipeToEdit.isBudget !== false;
    imgInput.value = recipeToEdit.image || '';
    previewImg.src = recipeToEdit.image || 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&auto=format&fit=crop&q=80';

    ingsText.value = (recipeToEdit.ingredients || []).map(i => {
      return `${i.quantity || 1} ${i.unit || ''} ${i.name}`.replace(/\s+/g, ' ').trim();
    }).join('\n');

    stepsText.value = (recipeToEdit.steps || []).map((s, idx) => {
      const text = typeof s === 'string' ? s : (s.instruction || '');
      return `${idx + 1}. ${text}`;
    }).join('\n');

    if (submitLabel) submitLabel.textContent = 'Enregistrer les modifications';
  } else {
    form.reset();
    idInput.value = '';
    previewImg.src = 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&auto=format&fit=crop&q=80';
    imgInput.value = '';
    if (submitLabel) submitLabel.textContent = 'Enregistrer dans mon catalogue';
  }

  modal.classList.remove('hidden');
}

// Lecture d'une ligne d'ingrédient saisie à la main :
// « 600g patate douce », « 2 grosses pièces de patate douce », « 1 c. à soupe d'huile d'olive »,
// « 1,5 kg de pommes de terre », « 3 oignons »…
function parseCustomIngredientLine(line) {
  const UNIT_PATTERN = '(?:kg|g|gr|grammes?|ml|cl|l|litres?|' +
    'c\\.?\\s*à\\s*s(?:oupe)?\\.?|c\\.?\\s*à\\s*c(?:afé)?\\.?|c\\.?\\s*a\\s*soupe|c\\.?\\s*a\\s*cafe|cuill[eè]res?\\s+à\\s+(?:soupe|café)|cs|cc|cas|cac|' +
    '(?:grosses?|petites?|moyennes?)\\s+pi[eè]ces?|pi[eè]ces?|unités?|gousses?|bottes?|bouquets?|brins?|tiges?|branches?|' +
    'tranches?|pav[eé]s?|sachets?|bo[iî]tes?|cubes?|pincées?|pincees?|poignées?|poignees?|pots?|paquets?|t[eê]tes?|cm|morceaux?)';
  const re = new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(?:(' + UNIT_PATTERN + ')(?=\\s|$)\\s*)?(.*)$', 'i');

  let quantity = 1;
  let unit = 'piece';
  let rawName = line;
  const m = line.match(re);
  if (m) {
    quantity = parseFloat(m[1].replace(',', '.')) || 1;
    if (m[2]) unit = canonicalUnit(m[2]);
    rawName = (m[3] || '').trim();
  }
  // « de patate douce », « d'huile » → « patate douce », « huile »
  rawName = rawName.replace(/^(de|des|du)\s+/i, '').replace(/^d['’]\s*/i, '').trim() || line;

  const norm = normalizeIngredient({ name: rawName, quantity, unit, rayon: 'epicerie' });
  return {
    name: norm.name || rawName,
    quantity,
    unit,               // unité d'origine conservée : la conversion se fait dans la liste de courses
    rayon: norm.rayon || 'epicerie'
  };
}

function deleteCustomRecipe(recipeId) {
  state.recipes = state.recipes.filter(r => r.id !== recipeId);
  const keptLocked = [];
  const newPlan = [];
  state.plan.forEach((id, idx) => {
    if (id === recipeId) return;
    if ((state.lockedSlots || []).includes(idx)) keptLocked.push(newPlan.length);
    newPlan.push(id);
  });
  state.plan = newPlan;
  state.lockedSlots = keptLocked;

  const savedCustom = safeGetItem('gamelle_custom_recipes');
  if (savedCustom) {
    const list = JSON.parse(savedCustom).filter(r => r.id !== recipeId);
    safeSetItem('gamelle_custom_recipes', JSON.stringify(list));
  }

  saveToLocalStorage();
  document.getElementById('recipe-detail-modal').classList.add('hidden');
  renderAll();
  showSyncToast('🗑️ Recette supprimée de votre catalogue');
}

// (moteur de synchro foyer : voir sync.js)


// ==========================================
// ÉTAT DE LA SYNCHRO, HORS CONNEXION, MISE À JOUR
// ==========================================
function updateStatusBanner() {
  const box = document.getElementById('banner-status');
  const text = document.getElementById('banner-status-text');
  if (!box || !text) return;
  let msg = '';
  if (!navigator.onLine) msg = state.householdCode ? 'Hors connexion · vos modifications seront synchronisées dès le retour du réseau' : 'Hors connexion · vos données restent enregistrées sur ce téléphone';
  else if (state.householdCode && state.sync.fail) msg = 'Synchronisation impossible pour le moment · nouvel essai automatique';
  text.textContent = msg;
  box.classList.toggle('hidden', !msg);
}
function updateSyncStatusLine() {
  const el = document.getElementById('sync-status-line');
  if (!el) return;
  const age = GL.syncAgeText(state.sync.lastOk, Date.now());
  const late = state.sync.lastOk && Date.now() - state.sync.lastOk > 3600000;
  el.textContent = `Dernière synchro : ${age}` + (state.sync.fail ? ' · en attente de réseau' : '');
  el.classList.toggle('text-amber-700', !!(state.sync.fail || late));
  el.classList.toggle('text-emerald-800', !(state.sync.fail || late));
}
function initSyncMonitoring() {
  updateStatusBanner();
  updateSyncStatusLine();
  window.addEventListener('offline', updateStatusBanner);
  window.addEventListener('online', () => {
    updateStatusBanner();
    if (state.householdCode) { broadcastSync(true); pollLatestSync(); }
  });
  setInterval(() => {
    updateSyncStatusLine();
    if (state.householdCode && state.sync.fail && navigator.onLine) broadcastSync(true);
  }, 60000);
}

// ==========================================
// SAUVEGARDE, RESTAURATION, CODE DU FOYER
// ==========================================
function exportBackup() {
  const file = { app: 'gamelle-panier', format: 1, exportedAt: new Date().toISOString(), data: buildSyncPayload() };
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gamelle-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  safeSetItem('gamelle_backup_at', Date.now());
  updateBackupInfo();
  showToast('Sauvegarde exportée');
}
function updateBackupInfo() {
  const el = document.getElementById('backup-info');
  if (!el) return;
  const t = parseInt(safeGetItem('gamelle_backup_at') || '0', 10);
  el.textContent = t ? `Dernière sauvegarde en fichier : ${new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : 'Aucune sauvegarde en fichier pour le moment';
}
// Lit et valide un fichier de sauvegarde ; renvoie les données ou lève une erreur lisible
function parseBackup(text) {
  let file;
  try { file = JSON.parse(text); } catch (e) { throw new Error('Ce fichier n\'est pas une sauvegarde Gamelle (format illisible)'); }
  if (!file || file.app !== 'gamelle-panier' || !file.data || typeof file.data !== 'object') throw new Error('Ce fichier n\'est pas une sauvegarde Gamelle');
  return file.data;
}
async function importBackupFile(file) {
  if (!file) return;
  let data;
  try { data = parseBackup(await file.text()); } catch (e) { showToast(e.message); return; }
  const ok = await confirmDialog({
    title: 'Restaurer cette sauvegarde ?',
    message: `Les données de ce téléphone (menu, favoris, courses, placard, recettes maison) seront remplacées par celles du fichier${file.name ? ' « ' + file.name + ' »' : ''}.`,
    confirmLabel: 'Restaurer', danger: true
  });
  if (!ok) return;
  const snapshot = takeSnapshot();
  applyPayload(data);
  saveToLocalStorage();
  showToast('Sauvegarde restaurée', { action: 'Annuler', onAction: () => restoreSnapshot(snapshot) });
}
async function restoreFromHousehold() {
  if (!state.householdCode) { showToast('Connectez d\'abord un foyer'); return; }
  const ok = await confirmDialog({
    title: 'Récupérer depuis l\'autre téléphone ?',
    message: 'Les données de ce téléphone seront remplacées par celles de l\'autre téléphone du foyer (il doit être connecté).',
    confirmLabel: 'Récupérer', danger: true
  });
  if (!ok) return;
  state.lastSyncTimestamp = 0;
  safeSetItem('gamelle_last_sync', 0);
  const sent = await sendControl('request-state');
  pollLatestSync();
  showToast(sent ? 'Demande envoyée : les données arrivent dans quelques secondes' : 'Impossible de joindre le foyer (réseau ?)');
}
async function changeHouseholdCode() {
  if (!state.householdCode) return;
  const ok = await confirmDialog({
    title: 'Changer le code du foyer ?',
    message: 'Un nouveau code secret est créé. L\'autre téléphone passe automatiquement dessus (il doit être ouvert ou le rouvrir dans les 6 heures). Vos données sont conservées.',
    confirmLabel: 'Changer le code'
  });
  if (!ok) return;
  const newCode = generateHouseholdCode();
  const sent = await sendControl('rekey', { newCode });
  if (!sent) { showToast('Impossible de prévenir l\'autre téléphone (réseau ?) : réessayez'); return; }
  setHouseholdCode(newCode, { keepState: true });
  showToast('Nouveau code actif');
}
function setupBackupUI() {
  const exp = document.getElementById('btn-export-json');
  const file = document.getElementById('input-import-backup');
  const imp = document.getElementById('btn-import-backup');
  if (exp) exp.addEventListener('click', exportBackup);
  if (imp && file) {
    imp.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { importBackupFile(file.files[0]); file.value = ''; });
  }
  const restore = document.getElementById('btn-restore-household');
  if (restore) restore.addEventListener('click', restoreFromHousehold);
  const change = document.getElementById('btn-change-code');
  if (change) change.addEventListener('click', changeHouseholdCode);
  updateBackupInfo();
}
