// Synchro du foyer en direct (ntfy), chiffrement, messages de contrôle, sauvegarde/restauration.
// Script classique chargé avant app.js (portée globale partagée).
// ==========================================
// MOTEUR DE SYNCHRONISATION FOYER EN DIRECT
// ==========================================

function getHouseholdTopic() {
  if (!state.householdCode) return null;
  return `gamelle_foyer_${state.householdCode.trim().toUpperCase()}`;
}

async function attemptJoinHousehold(raw) {
  const code = cleanStr(raw, 60).toUpperCase();
  if (isWeakHouseholdCode(code)) {
    // Le code sert de mot de passe : un code faible est refusé (pas d'option « utiliser quand même »)
    showToast('Code trop faible : utilisez « Générer un code sécurisé » ou le code complet donné par l\'autre téléphone', { duration: 6000 });
    return;
  }
  setHouseholdCode(code);
}

// options : { silent } sans message ; { keepState } on garde ses données et on les diffuse tout de suite (changement de code)
function setHouseholdCode(code, opts = {}) {
  const clean = cleanStr(code || '', 60).toUpperCase();
  if (!clean) return;

  state.householdCode = clean;
  safeSetItem('gamelle_household_code', clean);
  state.lastSyncTimestamp = 0;
  safeSetItem('gamelle_last_sync', 0);
  state.joinReceived = false;
  updateSyncStatusUI();
  initHouseholdSync();
  if (opts.keepState) broadcastSync(true);
  else {
    // Rejoindre un foyer : on DEMANDE d'abord l'état de l'autre téléphone (sans l'écraser avec un état vide)
    sendControl('request-state');
    setTimeout(() => { if (!state.joinReceived && state.householdCode === clean) broadcastSync(true); }, 8000);
  }
  if (!opts.silent) showToast('Foyer connecté : synchronisation en direct');
}

function disconnectHousehold() {
  if (state.syncEventSource) {
    try { state.syncEventSource.close(); } catch(e) {}
    state.syncEventSource = null;
  }
  state.householdCode = '';
  safeRemoveItem('gamelle_household_code');
  updateSyncStatusUI();
  showSyncToast('Déconnecté du foyer');
}

function updateSyncStatusUI() {
  const syncBadge = document.getElementById('sync-status-badge');
  const setupBox = document.getElementById('sync-setup-box');
  const activeBox = document.getElementById('sync-active-box');
  const codeLabel = document.getElementById('active-household-code-label');
  const headerPill = document.getElementById('header-sync-pill');

  if (state.householdCode) {
    if (syncBadge) {
      syncBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1.5 flex-shrink-0';
      syncBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> En direct';
    }
    if (setupBox) setupBox.classList.add('hidden');
    if (activeBox) activeBox.classList.remove('hidden');
    if (codeLabel) codeLabel.textContent = state.householdCode;
    if (headerPill) {
      headerPill.classList.remove('hidden');
      headerPill.classList.add('flex');
    }
  } else {
    if (syncBadge) {
      syncBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 flex items-center gap-1.5 flex-shrink-0';
      syncBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span> Inactif';
    }
    if (setupBox) setupBox.classList.remove('hidden');
    if (activeBox) activeBox.classList.add('hidden');
    if (headerPill) {
      headerPill.classList.add('hidden');
      headerPill.classList.remove('flex');
    }
  }
}

function initHouseholdSync() {
  const topic = getHouseholdTopic();
  if (!topic) return;

  if (state.syncEventSource) {
    try { state.syncEventSource.close(); } catch(e) {}
    state.syncEventSource = null;
  }

  // 1. Écouteur temps réel via Server-Sent Events (SSE)
  if (typeof EventSource !== 'undefined') {
    try {
      const sseUrl = `https://ntfy.sh/${topic}/sse`;
      state.syncEventSource = new EventSource(sseUrl);

      state.syncEventSource.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (raw.event === 'message') {
            readNtfyPayload(raw).then(payload => { if (payload) handleIncomingSync(payload); });
          }
        } catch (err) {
          console.warn('Sync parse error:', err);
        }
      };
    } catch(e) {
      console.warn('EventSource error:', e);
    }
  }

  // 2. Récupérer l'état actuel
  pollLatestSync();
}

function pollLatestSync() {
  const topic = getHouseholdTopic();
  if (!topic || typeof fetch === 'undefined') return;

  fetch(`https://ntfy.sh/${topic}/json?poll=1`)
    .then(res => res.text())
    .then(async text => {
      const lines = text.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.event && entry.event !== 'message') continue;
          const payload = await readNtfyPayload(entry);
          if (!payload) continue;
          // Seul le message le plus récent compte : on s'arrête dès qu'on l'a examiné
          handleIncomingSync(payload);
          break;
        } catch(e) {}
      }
    })
    .catch(err => console.warn('Erreur poll synchro:', err));
}

// ntfy.sh transforme automatiquement les messages de plus de 4 Ko en pièce jointe :
// on lit alors le JSON depuis l'URL de la pièce jointe.
function readNtfyPayload(entry) {
  const decode = (raw) => GL.decryptPayload(state.householdCode, raw);
  try {
    if (entry.attachment && entry.attachment.url) {
      return fetch(entry.attachment.url).then(r => r.text()).then(decode).catch(() => null);
    }
    if (entry.message) return decode(entry.message);
  } catch (e) {}
  return Promise.resolve(null);
}

// Contenu échangé avec le foyer ET enregistré dans les fichiers de sauvegarde
function buildSyncPayload() {
  const customList = (state.recipes || []).filter(r => r.id.startsWith('custom-'));
  return {
    version: 3,
    timestamp: Date.now(),
    senderId: state.deviceId,
    portions: state.portions,
    plan: state.plan,
    lockedSlots: state.lockedSlots || [],
    staples: state.staples || [],
    checkedGroceries: state.checkedGroceries || {},
    customRecipes: customList,
    savedMenus: state.savedMenus || [],
    favorites: state.favorites || [],
    pantry: state.pantry || [],
    pantryNeeded: state.pantryNeeded || [],
    pantryStock: state.pantryStock || {},
    spices: state.spices || [],
    leftovers: state.leftovers || [],
    stockBasics: !!state.stockBasics,
    aisleOrder: state.aisleOrder || [],
    notes: state.notes || {},
    stapleHistory: state.stapleHistory || {},
    trips: state.trips || [],
    priceBook: state.priceBook || {},
    pantryExpiry: state.pantryExpiry || {},
    weeklyPack: state.weeklyPack || []
  };
}

// Applique des données reçues (synchro, restauration, fichier) : tout est validé, un message ne peut pas injecter de code
function applyPayload(payload) {
  if (Array.isArray(payload.plan)) state.plan = sanitizePlan(payload.plan).map(resolveAlias);
  if (payload.portions) state.portions = Math.round(cleanNum(payload.portions, 1, 12, state.portions));
  if (Array.isArray(payload.lockedSlots)) state.lockedSlots = sanitizeSlots(payload.lockedSlots);
  if (Array.isArray(payload.staples)) state.staples = sanitizeStaples(payload.staples);
  if (payload.checkedGroceries && typeof payload.checkedGroceries === 'object') state.checkedGroceries = sanitizeChecked(payload.checkedGroceries);
  if (Array.isArray(payload.savedMenus)) state.savedMenus = sanitizeSavedMenus(payload.savedMenus);
  if (Array.isArray(payload.favorites)) state.favorites = resolveAliasList(sanitizeStringList(payload.favorites));
  if (Array.isArray(payload.pantry)) state.pantry = sanitizeStringList(payload.pantry, 400, 120);
  if (Array.isArray(payload.pantryNeeded)) state.pantryNeeded = sanitizeStringList(payload.pantryNeeded, 400, 120);
  if (payload.pantryStock) state.pantryStock = sanitizeStock(payload.pantryStock);
  if (Array.isArray(payload.leftovers)) state.leftovers = sanitizeStringList(payload.leftovers, 30, 60);
  if (Array.isArray(payload.spices)) state.spices = sanitizeSpices(payload.spices);
  else if (payload.spiceLevel !== undefined) { const l = Math.round(cleanNum(payload.spiceLevel, 0, 2, 0)); state.spices = l >= 2 ? [...GL.SPICES_FULL] : l === 1 ? [...GL.SPICES_BASIC] : []; }
  if (typeof payload.stockBasics === 'boolean') state.stockBasics = payload.stockBasics;
  if (Array.isArray(payload.aisleOrder)) state.aisleOrder = sanitizeStringList(payload.aisleOrder, 10, 30);
  if (payload.stapleHistory) state.stapleHistory = sanitizeStapleHistory(payload.stapleHistory);
  if (Array.isArray(payload.trips)) state.trips = sanitizeTrips(payload.trips);
  if (payload.priceBook && typeof payload.priceBook === 'object') state.priceBook = sanitizePriceBook(payload.priceBook);
  if (typeof bumpCosts === 'function' && payload.priceBook) bumpCosts();
  if (payload.pantryExpiry && typeof payload.pantryExpiry === 'object') state.pantryExpiry = sanitizeExpiry(payload.pantryExpiry);
  if (Array.isArray(payload.weeklyPack)) { state.weeklyPack = sanitizePack(payload.weeklyPack); if (typeof updatePackButton === 'function') updatePackButton(); }
  // Avis / historique : fusion recette par recette (le plus récent gagne), rien n'est écrasé en bloc
  if (payload.notes && typeof payload.notes === 'object') {
    const incoming = sanitizeNotes(payload.notes);
    Object.keys(incoming).forEach(id => {
      const mine = state.notes[id];
      if (!mine || (incoming[id].t || 0) > (mine.t || 0)) state.notes[id] = { ...incoming[id], cooked: Math.max(incoming[id].cooked || 0, mine ? mine.cooked || 0 : 0) };
      else if (mine && (incoming[id].cooked || 0) > (mine.cooked || 0)) mine.cooked = incoming[id].cooked;
    });
  }
  // Recettes personnalisées
  if (Array.isArray(payload.customRecipes)) {
    const custom = sanitizeRecipeList(payload.customRecipes);
    state.recipes = [...DEFAULT_RECIPES, ...custom];
  }
  persistLocal();
  renderAll();
}

function markSyncOk() {
  state.sync.lastOk = Date.now();
  state.sync.pending = false;
  state.sync.fail = false;
  safeSetItem('gamelle_sync_ok', state.sync.lastOk);
  updateSyncStatusLine();
}

function handleIncomingSync(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.timestamp !== 'number' || !isFinite(payload.timestamp)) return false;

  // Ignorer nos propres messages
  if (payload.senderId && payload.senderId === state.deviceId) return false;

  // Messages de contrôle (demande de restauration, changement de code)
  if (payload.op) return handleControlMessage(payload);

  // Ignorer si ce message est plus ancien que notre dernière synchro
  if (payload.timestamp <= (state.lastSyncTimestamp || 0)) return false;

  state.lastSyncTimestamp = payload.timestamp;
  safeSetItem('gamelle_last_sync', payload.timestamp);
  applyPayload(payload);
  state.joinReceived = true;
  markSyncOk();
  showToast('Synchronisé avec votre foyer');
  return true;
}

// ---- Messages de contrôle échangés entre les téléphones du foyer (chiffrés comme le reste)
async function sendControl(op, extra = {}, codeOverride) {
  const code = codeOverride || state.householdCode;
  if (!code || typeof fetch === 'undefined') return false;
  const msg = { op, timestamp: Date.now(), senderId: state.deviceId, ...extra };
  const body = GL.cryptoAvailable() ? await GL.encryptPayload(code, msg) : JSON.stringify(msg);
  try {
    const res = await fetch(`https://ntfy.sh/gamelle_foyer_${code.trim().toUpperCase()}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Title: 'Gamelle Sync', Tags: 'arrows_counterclockwise' }, body });
    return res.ok;
  } catch (e) { return false; }
}
function handleControlMessage(msg) {
  if (msg.op === 'request-state') {
    // un téléphone du foyer demande l'état complet (nouvelle installation, restauration)
    if (Date.now() - msg.timestamp < 10 * 60000) { state.syncDebounceTimer && clearTimeout(state.syncDebounceTimer); broadcastSync(true); }
    return true;
  }
  if (msg.op === 'rekey' && typeof msg.newCode === 'string') {
    const code = cleanStr(msg.newCode, 60).toUpperCase();
    if (isWeakHouseholdCode(code) || Date.now() - msg.timestamp > 6 * 3600000) return false;
    setHouseholdCode(code, { silent: true });
    showToast('Le code du foyer a été changé par l\'autre téléphone');
    return true;
  }
  return false;
}

function broadcastSync(immediate = false) {
  const topic = getHouseholdTopic();
  if (!topic || typeof fetch === 'undefined') return;
  state.sync.pending = true;
  updateStatusBanner();
  clearTimeout(state.syncDebounceTimer);
  const run = async () => {
    const payload = buildSyncPayload();
    let body;
    try { body = GL.cryptoAvailable() ? await GL.encryptPayload(state.householdCode, payload) : JSON.stringify(payload); }
    catch (e) { body = JSON.stringify(payload); }
    try {
      const res = await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Title': 'Gamelle Sync', 'Tags': 'arrows_counterclockwise' },
        body
      });
      if (res.ok) {
        state.lastSyncTimestamp = payload.timestamp;
        safeSetItem('gamelle_last_sync', payload.timestamp);
        markSyncOk();
      } else state.sync.fail = true;
    } catch (err) { state.sync.fail = true; }
    updateStatusBanner();
    updateSyncStatusLine();
  };
  if (immediate) run(); else state.syncDebounceTimer = setTimeout(run, 400);
}
