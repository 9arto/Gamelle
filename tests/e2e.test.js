// Tests de bout en bout dans un vrai navigateur (Playwright). Ignorés si Playwright n'est pas installé.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* non installé */ }
// L'accueil en 3 étapes s'affiche au tout premier lancement : on le considère comme déjà vu dans les tests (sauf celui qui le vérifie)
if (chromium) {
  const realLaunch = chromium.launch.bind(chromium);
  chromium.launch = async (...args) => {
    const b = await realLaunch(...args);
    const newContext = b.newContext.bind(b);
    b.newContext = async (o) => { const c = await newContext(o); await c.addInitScript(() => { try { if (!localStorage.getItem('gamelle_onboarded')) localStorage.setItem('gamelle_onboarded', '1'); } catch (e) { /* stockage indisponible */ } }); return c; };
    return b;
  };
}
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    }).listen(0, () => resolve(srv));
  });
}

test('navigateur : parcours complet sans erreur et sans perte des données utilisateur', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    // Données d'un utilisateur existant : ancien identifiant fusionné, favoris, placard, case cochée, code foyer
    await page.addInitScript(() => {
      if (localStorage.getItem('seeded')) return;
      localStorage.setItem('seeded', '1');
      localStorage.setItem('gamelle_plan', JSON.stringify(['pad-thai-aux-crevettes', 'poulet-mafe-riz']));
      localStorage.setItem('gamelle_favorites', JSON.stringify(['pad-thai-aux-crevettes', 'pad-thai-crevettes-cacahuetes']));
      localStorage.setItem('gamelle_checked', JSON.stringify({ 'riz blanc (basmati ou jasmin)': true }));
      localStorage.setItem('gamelle_staples', JSON.stringify([{ id: 's1', name: 'Bananes', checked: false }]));
      localStorage.setItem('gamelle_portions', '6');
    });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);
    const st = await page.evaluate(() => ({ plan: state.plan, fav: state.favorites, checked: state.checkedGroceries, staples: state.staples.length, portions: state.portions }));
    assert.deepEqual(st.plan, ['pad-thai-crevettes-cacahuetes', 'poulet-mafe-riz'], 'ancien identifiant redirigé');
    assert.deepEqual(st.fav, ['pad-thai-crevettes-cacahuetes'], 'favoris fusionnés sans doublon');
    assert.equal(st.checked['riz blanc (basmati ou jasmin)'], true);
    assert.equal(st.staples, 1);
    assert.equal(st.portions, 6);

    assert.equal(await page.textContent('#planning-title'), 'Mes 2 repas', 'titre évolutif');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#weekly-days-list img')].every((i) => /304x304|data:|pexels|unsplash/.test(i.src))), 'vignettes légères');

    // Composer les 7 repas avec filtres
    await page.click('#btn-generate-menu');
    await page.click('.gen-chip[data-group="seasons"][data-value="hiver"]');
    await page.click('.gen-flag[data-flag="noPork"]');
    await page.click('#btn-gen-go');
    await page.waitForFunction(() => state.plan.length === 7);
    const plan = await page.evaluate(() => state.plan.map((id) => state.recipes.find((r) => r.id === id)).map((r) => ({ s: GL.recipeSeasons(r), pork: GL.containsPork(r) })));
    assert.equal(plan.length, 7);
    assert.ok(plan.every((p) => p.s.includes('hiver') && !p.pork));
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('gamelle_gen_filters')).seasons), ['hiver'], 'filtres mémorisés');

    // Courses : placard, niveau d'épices, budget
    await page.evaluate(() => switchTab('tab-courses'));
    const before = await page.evaluate(() => document.querySelectorAll('.grocery-check').length);
    await page.click('.btn-pantry >> nth=0');
    assert.equal(await page.evaluate(() => state.pantry.length), 1);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.grocery-check').length), before - 1);
    await page.click('#pantry-card summary');
    await page.click('.spice-chip >> nth=0');
    assert.equal(await page.evaluate(() => state.spices.length), 1, 'une épice cochée');
    await page.click('.spice-all[data-all="1"]');
    assert.equal(await page.evaluate(() => state.spices.length === GL.SPICES.length), true);
    assert.match(await page.textContent('#courses-budget-label'), /Budget ≈ \d+ €/);

    // Produits courants : suggestions à la frappe
    await page.fill('#staple-input', 'cer');
    await page.waitForSelector('#staple-suggest li');
    assert.match(await page.textContent('#staple-suggest'), /Céréales/);
    await page.dispatchEvent('#staple-suggest li >> nth=0', 'pointerdown');
    assert.equal(await page.inputValue('#staple-input'), 'Céréales');

    // Catalogue : filtres saison / style
    await page.evaluate(() => { switchTab('tab-recettes'); });
    assert.ok(await page.isHidden('#more-filters'), 'filtres secondaires repliés');
    await page.click('#btn-more-filters');
    await page.click('.filter-btn[data-filter="style:street"]');
    assert.ok(await page.isHidden('#more-filters'));
    assert.match(await page.textContent('#btn-more-filters'), /Street food/);
    const n = await page.evaluate(() => state.recipes.filter((r) => GL.recipeStyles(r).includes('street')).length);
    assert.match(await page.textContent('#recipes-count-label'), new RegExp(String(n)));

    // Finir mes restes
    await page.evaluate(() => switchTab('tab-planning'));
    const planBefore = await page.evaluate(() => state.plan.length);
    await page.click('[data-menu="planning-more-menu"]');
    await page.click('#btn-open-leftovers');
    await page.fill('#leftovers-input', 'pou');
    await page.waitForSelector('#leftovers-suggest li');
    await page.dispatchEvent('#leftovers-suggest li >> nth=0', 'pointerdown');
    await page.waitForSelector('.leftover-add');
    assert.ok(await page.evaluate(() => state.leftovers.length === 1));
    assert.match(await page.textContent('#leftovers-results'), /Utilise : /);
    await page.click('.leftover-add >> nth=0');
    assert.equal(await page.evaluate(() => state.plan.length), planBefore + 1);
    await page.click('#btn-close-leftovers');

    assert.equal(await page.textContent('#planning-title'), 'Mes 8 repas');
    // Recettes : ordre aléatoire + bouton Mélanger
    await page.evaluate(() => switchTab('tab-recettes'));
    const order = () => page.evaluate(() => [...document.querySelectorAll('#recipes-catalog-grid [data-recipe-id]')].map((e) => e.dataset.recipeId).slice(0, 6));
    await page.click('.filter-btn[data-filter="all"]');
    const ids1 = await page.evaluate(() => catalogFiltered.slice(0, 8).map((r) => r.id));
    await page.click('#btn-reshuffle');
    const ids2 = await page.evaluate(() => catalogFiltered.slice(0, 8).map((r) => r.id));
    assert.notDeepEqual(ids1, ids2, 'Mélanger change l\'ordre');
    await page.selectOption('#recipe-sort-select', 'default');
    assert.ok(await page.isHidden('#btn-reshuffle'));
    // Avis
    await page.evaluate(() => openRecipeDetail('poulet-mafe-riz'));
    await page.click('#btn-note-like');
    await page.click('#btn-note-cooked');
    const note = await page.evaluate(() => state.notes['poulet-mafe-riz']);
    assert.equal(note.r, 1);
    assert.ok(note.cooked > 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : nutrition sur la fiche recette, infos Open Food Facts et scan (réseau simulé)', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::|ERR_/.test(m.text())) errors.push(m.text()); });
    await page.route('**/search.openfoodfacts.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits: [
      { code: '1', product_name: 'x', nutriscore_grade: 'b', nova_group: 3, allergens_tags: ['en:milk'] }, { code: '2', product_name: 'y', nutriscore_grade: 'b', nova_group: 3, allergens_tags: ['en:milk'] }] }) }));
    await page.route('**/world.openfoodfacts.org/api/v2/product/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 1, product: { product_name: 'Pâtes penne', brands: 'Marque', nutriscore_grade: 'a', nova_group: 3, allergens_tags: ['en:gluten'], nutriments: { 'energy-kcal_100g': 350 } } }) }));
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);

    // Fiche recette : calories, macros, allergènes
    await page.evaluate(() => openRecipeDetail('spaghetti-bolognese-express'));
    const txt = await page.textContent('#detail-nutrition');
    assert.match(txt, /\d+\s*kcal/);
    assert.match(txt, /Allergènes : .*gluten/);
    await page.click('#btn-close-detail');

    // Courses : Nutri-Score de la liste
    await page.evaluate(() => { state.plan = ['spaghetti-bolognese-express', 'poulet-mafe-riz']; saveToLocalStorage(); switchTab('tab-courses'); });
    await page.click('#pantry-card summary');
    await page.click('.off-load');
    await page.waitForFunction(() => Object.keys(state.off).length > 0);
    await page.waitForFunction(() => document.querySelectorAll('#grand-frais-aisles-container [title^="Nutri-Score"]').length > 0);

    // Scan : saisie manuelle du code-barres
    await page.click('.off-scan');
    await page.fill('#scan-code', '3017620422003');
    await page.click('#scan-form button[type="submit"]');
    await page.waitForSelector('#btn-scan-staple');
    assert.match(await page.textContent('#scan-result'), /Pâtes penne/);
    assert.match(await page.textContent('#scan-result'), /gluten/);
    await page.click('#btn-scan-staple');
    assert.ok(await page.evaluate(() => state.staples.some((s) => s.name === 'Pâtes penne')));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : météo invisible (localisation simulée)', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', geolocation: { latitude: 48.85, longitude: 2.35 }, permissions: ['geolocation'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const posts = [];
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ current: { weather_code: 3 }, daily: { temperature_2m_max: [4, 5, 3], precipitation_sum: [0, 0, 0] } }) }));
    await page.route('**/ntfy.sh/**', (r) => { if (r.request().method() === 'POST' && /gamelle-alerte-/.test(r.request().url())) posts.push({ url: r.request().url(), body: r.request().postData(), title: r.request().headers().title }); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }); });
    await page.addInitScript(() => { if (!localStorage.getItem('s')) { localStorage.setItem('s', '1'); localStorage.setItem('gamelle_household_code', 'FOYER-TEST-AAAA-BBBB'); localStorage.setItem('gamelle_member_name', 'Julie'); } });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);

    // Météo : aucune trace dans l'interface, mais le tirage en tient compte
    await page.click('#btn-generate-menu');
    await page.click('#btn-gen-go');
    await page.waitForFunction(() => state.weatherMood && state.weatherMood.temp === 'froid');
    assert.ok(!/météo|meteo|°C|température/i.test(await page.evaluate(() => document.body.innerText)), 'rien de météo à l\'écran');
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('gamelle_geo')).lat === 48.9), 'position arrondie');

    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : quantité sur produit courant, menu « … », bandeau d\'état, aucune erreur CSP', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);

    // Planning : un seul bouton principal visible, le reste dans « … »
    assert.ok(await page.isVisible('#btn-generate-menu'));
    assert.ok(!(await page.isVisible('#btn-open-leftovers')), 'actions secondaires rangées');
    await page.click('[data-menu="planning-more-menu"]');
    assert.ok(await page.isVisible('#btn-open-leftovers'));
    await page.click('body', { position: { x: 5, y: 400 } });
    assert.ok(!(await page.isVisible('#btn-open-leftovers')), 'le menu se ferme');

    // Produits courants : même nom = quantité
    await page.evaluate(() => switchTab('tab-courses'));
    for (let i = 0; i < 3; i++) { await page.fill('#staple-input', 'Lait'); await page.press('#staple-input', 'Escape'); await page.click('#form-add-staple button[type="submit"]'); }
    assert.deepEqual(await page.evaluate(() => state.staples.map((s) => [s.name, s.qty])), [['Lait', 3]]);
    assert.ok((await page.innerText('#grand-frais-aisles-container')).includes('×3'));
    assert.equal(await page.evaluate(() => state.stapleHistory.Lait.n), 3, 'habituels mémorisés');
    assert.ok(!(await page.innerText('#staple-habituals')).includes('Lait'), 'déjà dans la liste : pas proposé');

    // Hors ligne : bandeau explicite
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.waitForFunction(() => !document.getElementById('banner-status').classList.contains('hidden'));
    await ctx.setOffline(false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : planning vide accueillant, pastilles, rayon « tout cocher », filtres d\'historique, recherches récentes, budget', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => { if (!localStorage.getItem('s')) { localStorage.setItem('s', '1'); localStorage.setItem('gamelle_plan', '[]'); } });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);

    // Planning vide : grand bouton « Composer mes 7 repas »
    assert.ok(await page.isVisible('#btn-empty-compose'));
    assert.ok(!(await page.isVisible('#btn-add-meal-slot')), "pas d'en-tête « 0 repas »");
    await page.click('#btn-empty-compose');
    assert.ok(await page.isVisible('#gen-body'), 'ouvre « Composer mes 7 repas »');
    await page.evaluate(() => { state.plan = state.recipes.slice(0, 4).map((r) => r.id); saveToLocalStorage(); renderAll(); document.getElementById('generate-modal').classList.add('hidden'); });
    assert.equal(await page.locator('.meal-dot').count(), 4, 'une pastille par repas');
    await page.click('.meal-dot >> nth=3');

    // Courses : compteur par rayon, tout cocher, rayon terminé
    await page.evaluate(() => switchTab('tab-courses'));
    assert.match(await page.innerText('.rayon-head >> nth=0'), /\b0\/\d+/);
    await page.click('.rayon-checkall >> nth=0');
    assert.match(await page.innerText('.rayon-head >> nth=0'), /Terminé/);
    await page.click('.rayon-checkall >> nth=0'); // décoche
    assert.match(await page.innerText('.rayon-head >> nth=0'), /\b0\/\d+/);

    // Historique : jamais cuisiné / cuisiné récemment
    const id = await page.evaluate(() => state.plan[0]);
    await page.evaluate((i) => setNote(i, { cooked: Date.now() }), id);
    await page.evaluate(() => switchTab('tab-recettes'));
    await page.evaluate(() => { state.activeFilter = 'recent'; renderCatalog(true); });
    assert.equal(await page.evaluate(() => catalogFiltered.length), 1);
    await page.evaluate(() => { state.activeFilter = 'jamais'; renderCatalog(true); });
    assert.equal(await page.evaluate(() => catalogFiltered.length), (await page.evaluate(() => state.recipes.length)) - 1);
    await page.evaluate(() => { state.activeFilter = 'all'; renderCatalog(true); });

    // Recherche récente mémorisée
    await page.fill('#recipe-search-input', 'poulet');
    await page.press('#recipe-search-input', 'Enter');
    await page.fill('#recipe-search-input', '');
    await page.dispatchEvent('#recipe-search-input', 'input');
    await page.waitForFunction(() => !document.getElementById('recent-searches').classList.contains('hidden'));
    assert.match(await page.innerText('#recent-searches'), /poulet/);

    // Budget : deux tickets → moyenne affichée
    await page.evaluate(() => { const D = 86400000; state.trips = [{ t: Date.now() - 14 * D, total: 60, est: 50, items: 20 }, { t: Date.now() - 7 * D, total: 70, est: 55, items: 22 }, { t: Date.now(), total: 65, est: 52, items: 21 }]; saveToLocalStorage(); renderGroceries(); });
    assert.match(await page.innerText('#budget-card-body'), /Ticket moyen 65 €.*par semaine/s);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

// ------------------------------------------------------------------------------------------------
// Scanner de codes-barres (ZXing embarqué) et lecture OCR d'un ticket, dans un vrai navigateur.
// (La caméra en direct ne peut pas être testée ici ; on teste le décodage d'une image de code-barres.)
// ------------------------------------------------------------------------------------------------
const EAN_JS = `(code) => {
  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const P = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  const d = code.split('').map(Number); const par = P[d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';
  const m = 3, quiet = 12, h = 160;
  const c = document.createElement('canvas'); c.width = (bits.length + quiet * 2) * m; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, h); x.fillStyle = '#000';
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') x.fillRect((quiet + i) * m, 10, m, h - 20);
  return c;
}`;

test('navigateur : lecture d\'un code-barres EAN-13 (ZXing embarqué) et rejet d\'un faux code', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);
    const read = await page.evaluate(async (ean) => { const mk = eval(ean); return [await decodeBarcodeCanvas(mk('3017620422003')), await decodeBarcodeCanvas(mk('3560070048786'))]; }, EAN_JS);
    assert.deepEqual(read, ['3017620422003', '3560070048786']);
    assert.equal(await page.evaluate(() => [validBarcode('3017620422003'), validBarcode('3017620422004'), validBarcode('123')]).then((r) => r.join()), 'true,false,false');
    // quantité Open Food Facts → stock du placard
    assert.deepEqual(await page.evaluate(() => [parseOffQuantity('1 l'), parseOffQuantity('6 x 125 g'), parseOffQuantity('400 g'), parseOffQuantity('n/a')]), [{ qty: 1000, unit: 'ml' }, { qty: 750, unit: 'g' }, { qty: 400, unit: 'g' }, null]);

    // Produit scanné → placard (Open Food Facts simulé), avec quantité
    await page.route('**/world.openfoodfacts.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 1, product: { product_name: 'Lait demi-écrémé UHT', brands: 'Marque', quantity: '1 l', nutriscore_grade: 'b', nova_group: 1, allergens_tags: ['en:milk'], nutriments: {} } }) }));
    await page.evaluate(() => { switchTab('tab-courses'); openScanModal(); });
    await page.fill('#scan-code', '3017620422003');
    await page.click('#scan-form button[type="submit"]');
    await page.click('#btn-scan-pantry');
    await page.waitForSelector('.dlg-input');
    assert.match(await page.inputValue('.dlg-input'), /Lait/i, 'nom proposé à partir du produit');
    await page.click('.dlg-backdrop button.dlg-ok, .dlg-backdrop button:has-text("Ajouter")');
    await page.waitForFunction(() => state.pantry.length >= 1);
    const added = await page.evaluate(() => ({ pantry: state.pantry, stock: state.pantryStock }));
    assert.ok(added.pantry.some((p) => /lait/.test(p)), 'dans le placard');
    assert.deepEqual(Object.values(added.stock)[0], { qty: 1000, unit: 'ml' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : photo d\'un ticket → lecture OCR → relecture → prix réels et statistiques', { skip: !chromium && 'Playwright non installé', timeout: 240000 }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);
    // Ticket « photographié » : texte monospace noir sur fond blanc (rendu par le navigateur)
    const png = await page.evaluate(() => {
      const lines = ['GRAND FRAIS', 'RUE DES LILAS PARIS', '22/11/2026 18:42', '', 'POULET FERMIER                12,40', '1,240 kg x 9,99 EUR/kg', 'COURGETTES                     2,10', 'TOMATES GRAPPE                 3,45',
        'CREME FRAICHE EPAISSE          1,89', 'LAIT DEMI ECREME               2,30', '', 'TOTAL A PAYER                 22,14', 'CB SANS CONTACT               22,14'];
      const c = document.createElement('canvas'); c.width = 900; c.height = 60 + lines.length * 46;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#111'; x.font = 'bold 30px "DejaVu Sans Mono", monospace';
      lines.forEach((l, i) => x.fillText(l, 30, 55 + i * 46));
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.evaluate(() => { switchTab('tab-courses'); openTicketModal(); });
    await page.setInputFiles('#ticket-file-lib', { name: 'ticket.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForSelector('#ticket-total', { timeout: 200000 });
    assert.equal(await page.inputValue('#ticket-total'), '22,14', 'total lu');
    const names = await page.$$eval('.ticket-line', (els) => els.length);
    assert.ok(names >= 4, `lignes lues : ${names}`);
    await page.click('#btn-ticket-save');
    const saved = await page.evaluate(() => ({ trips: state.trips, book: state.priceBook }));
    assert.equal(saved.trips.length, 1);
    assert.equal(saved.trips[0].total, 22.14);
    assert.ok(Object.keys(saved.book).length >= 3, 'prix retenus : ' + Object.keys(saved.book).join(', '));
    assert.ok(!(await page.isVisible('#ticket-modal')), 'fenêtre fermée');
    await page.evaluate(() => { const D = 86400000; state.trips.unshift({ t: Date.now() - 8 * D, total: 50, est: 40, items: 10, r: {} }); saveToLocalStorage(); renderGroceries(); });
    const card = await page.innerText('#budget-card-body');
    assert.match(card, /Dépenses par rayon/);
    assert.match(card, /achats fréquents/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : ticket PDF (texte lu directement) → vrai ticket Grand Frais : total, remises, rayons et prix au kilo', { skip: !chromium && 'Playwright non installé', timeout: 120000 }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    // PDF fabriqué à partir du texte du vrai ticket (un navigateur sait imprimer un PDF avec du texte sélectionnable)
    const text = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'ticket-grand-frais.txt'), 'utf8');
    const pdfPage = await ctx.newPage();
    await pdfPage.setContent(`<pre style="font:12px monospace;margin:20px">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
    const pdf = await pdfPage.pdf({ width: '9cm', height: '40cm', printBackground: true });
    await pdfPage.close();
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);
    await page.evaluate(() => { switchTab('tab-courses'); openTicketModal(); });
    await page.setInputFiles('#ticket-file-lib', { name: 'ticket.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.waitForSelector('#ticket-total', { timeout: 60000 });
    assert.equal(await page.inputValue('#ticket-total'), '110,25');
    assert.ok((await page.$$eval('.ticket-line', (e) => e.length)) >= 40, 'lignes lues');
    assert.ok((await page.innerText('#ticket-body')).includes('17,99 €/kg'), 'prix au kilo affiché');
    await page.click('#btn-ticket-save');
    const saved = await page.evaluate(() => ({ trip: state.trips[0], book: state.priceBook }));
    assert.equal(saved.trip.total, 110.25);
    assert.deepEqual(saved.trip.r, { cremerie: 41.87, 'fruits-legumes': 19.78, boucherie: 33.96, epicerie: 14.64 }, 'dépenses par rayon = sous-totaux du ticket');
    assert.equal(saved.book['tomates fraîches'].kg, 2.99);
    assert.equal(saved.book['cheddar râpé'].kg, 17.07);
    assert.ok(Object.keys(saved.book).length >= 15, 'prix appris : ' + Object.keys(saved.book).length);
    assert.match(await page.innerText('#budget-card-body'), /Dépenses par rayon/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

// ------------------------------------------------------------------------------------------------
// Coût des repas, budget, pack hebdomadaire, restes à consommer, équilibre de la semaine, accueil
// ------------------------------------------------------------------------------------------------
test('navigateur : prix par repas, « pas cher » réel, menu sous budget, équilibre de la semaine', { skip: !chromium && 'Playwright non installé', timeout: 90000 }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);
    // les coûts de tout le catalogue sont calculés en tâche de fond
    await page.waitForFunction(() => state.recipes.every((r) => costCache[r.id] != null), null, { timeout: 60000 });
    const stats = await page.evaluate(() => {
      const pp = state.recipes.map((r) => recipePP(r)).sort((a, b) => a - b);
      const cheap = state.recipes.filter((r) => r.isBudget).length;
      return { med: pp[Math.floor(pp.length / 2)], cheap, total: state.recipes.length, cheapOk: state.recipes.filter((r) => r.isBudget).every((r) => recipePP(r) <= CHEAP_PP + 1e-9) };
    });
    assert.ok(stats.med > 2 && stats.med < 3.6, `médiane ${stats.med}`);
    assert.ok(stats.cheapOk, '« pas cher » = au plus 2,20 € la portion');
    assert.ok(stats.cheap > stats.total * 0.2 && stats.cheap < stats.total * 0.6, `pas cher : ${stats.cheap}/${stats.total}`);

    // prix affiché sur les cartes et dans le planning
    await page.evaluate(() => switchTab('tab-recettes'));
    assert.match(await page.innerText('#recipes-catalog-grid'), /€\/portion/);
    // pastille de temps verte pour les recettes rapides (20 min ou moins)
    const chips = await page.$$eval('#recipes-catalog-grid .card-chips', (els) => els.map((e) => { const [time] = e.querySelectorAll('.card-chip'); return [parseInt(time.textContent, 10), time.classList.contains('is-cheap')]; }));
    assert.ok(chips.length > 5 && chips.every(([m, green]) => green === (m <= 20)), 'vert si ≤ 20 min');
    await page.evaluate(() => switchTab('tab-planning'));
    assert.match(await page.innerText('#weekly-days-list'), /sélectionnés? · ≈ \d+/);

    // Un repas « gardé » (déjà acheté) n'affiche plus son prix, et le total du menu l'exclut
    const lockInfo = await page.evaluate(() => { state.lockedSlots = []; renderPlanning(); const before = document.getElementById('weekly-days-list').innerText; state.lockedSlots = [0, 1]; renderPlanning(); return { before, after: document.getElementById('weekly-days-list').innerText }; });
    assert.equal((lockInfo.before.match(/≈ \d/g) || []).length, 8, 'total + 7 repas');
    assert.equal((lockInfo.after.match(/≈ \d/g) || []).length, 6, 'total + 5 repas : les 2 gardés sans prix');
    await page.evaluate(() => { state.lockedSlots = state.plan.map((_, i) => i); renderPlanning(); });
    assert.ok(!/≈ \d/.test(await page.innerText('#weekly-days-list')), 'tout est acheté : accueil propre');
    await page.evaluate(() => { state.lockedSlots = []; renderPlanning(); });
    // prix par portion toujours dans la fiche et dans les résultats de recherche
    await page.evaluate(() => { state.lockedSlots = [0]; saveToLocalStorage(); openRecipeDetail(state.plan[0]); });
    assert.match(await page.innerText('#detail-recipe-cost'), /€\/portion/);
    await page.evaluate(() => { document.getElementById('recipe-detail-modal').classList.add('hidden'); state.lockedSlots = []; state.searchQuery = 'poulet'; switchTab('tab-recettes'); renderCatalog(true); });
    assert.ok((await page.innerText('#recipes-catalog-grid')).match(/€\/portion/g).length >= 5, 'prix par portion dans la recherche');
    await page.evaluate(() => { state.searchQuery = ''; });

    // « 7 repas à moins de 45 € » (4 portions)
    const cost = await page.evaluate(() => {
      state.portions = 4; state.lockedSlots = [];
      generateBalancedWeek(true, { budgetMax: 45 });
      return { n: state.plan.length, total: state.plan.reduce((s, id) => s + recipeMealCost(state.recipes.find((r) => r.id === id)), 0), msg: state._budgetMsg };
    });
    assert.equal(cost.n, 7);
    assert.ok(cost.total <= 45.01, `coût ${cost.total}`);
    assert.match(cost.msg, /Menu à ≈ \d+/);
    const hard = await page.evaluate(() => { generateBalancedWeek(true, { budgetMax: 10 }); return state._budgetMsg; });
    assert.match(hard, /Impossible sous 10 €/);

    // équilibre de la semaine
    await page.evaluate(() => { generateBalancedWeek(true, {}); });
    const box = await page.innerText('#week-balance');
    assert.match(box, /Équilibre de vos 7 repas/);
    assert.match(box, /Protéines/); assert.match(box, /Légumes et fruits/);

    // budget dans la fenêtre « Composer mes 7 repas »
    await page.evaluate(() => switchTab('tab-planning'));
    await page.click('#btn-generate-menu');
    await page.fill('#gen-budget', '55');
    assert.equal(await page.evaluate(() => genDraft.budgetMax), 55);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : pack de la semaine, prix des produits courants (bananes…) et restes à consommer après un ticket', { skip: !chromium && 'Playwright non installé', timeout: 120000 }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);

    // 1. Ticket PDF réel → carnet de prix + placard avec dates limites
    const text = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'ticket-grand-frais.txt'), 'utf8');
    const pdfPage = await ctx.newPage();
    await pdfPage.setContent(`<pre style="font:12px monospace;margin:20px">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
    const pdf = await pdfPage.pdf({ width: '9cm', height: '40cm' });
    await pdfPage.close();
    await page.evaluate(() => { switchTab('tab-courses'); openTicketModal(); });
    await page.setInputFiles('#ticket-file-lib', { name: 'ticket.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.waitForSelector('#ticket-total', { timeout: 60000 });
    await page.click('#btn-ticket-save');
    const st = await page.evaluate(() => ({ pantry: state.pantry, expiry: state.pantryExpiry, book: Object.keys(state.priceBook), stock: state.pantryStock }));
    assert.ok(st.pantry.length >= 30, `au placard : ${st.pantry.length}`);
    const ex = st.expiry;
    const d = (id) => Math.round((ex[id] - new Date(2026, 10, 25, 12).getTime()) / 86400000);
    assert.equal(d('filets de poulet frais'), 3, 'poulet : 3 jours après le 25/11');
    assert.equal(d('crème fraîche (épaisse ou liquide)'), 7);
    assert.equal(d('pommes de terre fraîches'), 21);
    assert.ok(st.book.includes('banane'), 'la banane (hors recettes) a un prix : ' + st.book.join(','));
    assert.ok(!st.pantry.includes('sac exclusif app'), 'le sac offert n\'entre pas au placard');

    // 2. Plus de bandeau « À finir bientôt » sur l'accueil
    await page.evaluate(() => switchTab('tab-planning'));
    assert.ok(!(await page.evaluate(() => !!document.getElementById('expiry-banner'))));

    // 3. Les bananes ont un prix réel : elles montent le panier
    await page.evaluate(() => { switchTab('tab-courses'); state.staples = []; saveToLocalStorage(); renderGroceries(); });
    const before = await page.innerText('#courses-budget-label');
    await page.evaluate(() => { addStaple('Bananes', 7); });
    const after = await page.innerText('#courses-budget-label');
    assert.notEqual(before, after);
    assert.match(after, /produits courants/);
    assert.match(await page.innerText('#grand-frais-aisles-container'), /≈ 1\,0\d? €|≈ 1 €/);

    // 4. Pack de la semaine
    await page.evaluate(() => { state.staples = []; saveToLocalStorage(); renderGroceries(); });
    await page.click('#btn-add-pack'); // pack vide → éditeur avec le pack proposé
    assert.ok(await page.isVisible('#pack-modal'));
    assert.match(await page.inputValue('.pack-name >> nth=0'), /Bananes/);
    await page.click('#btn-pack-save');
    assert.equal(await page.evaluate(() => state.weeklyPack.length), 6);
    await page.click('#btn-add-pack');
    const names = await page.evaluate(() => state.staples.map((s) => `${s.name}×${s.qty}`));
    assert.ok(names.includes('Bananes×7') && names.length === 6, names.join());
    await page.click('#btn-add-pack'); // 2e fois : les quantités s'additionnent
    assert.equal(await page.evaluate(() => state.staples.find((s) => s.name === 'Bananes').qty), 14);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : accueil en 3 étapes au premier lancement seulement', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { if (!sessionStorage.getItem('fresh')) { sessionStorage.setItem('fresh', '1'); localStorage.clear(); } });
    await page.goto(url);
    await page.waitForSelector('#onboarding-modal:not(.hidden)');
    assert.match(await page.innerText('#onboarding-body'), /cuisinez à deux/);
    await page.click('#ob-create');
    assert.match(await page.innerText('#ob-msg'), /Votre code : FOYER-/);
    await page.click('#ob-next');
    assert.match(await page.innerText('#onboarding-body'), /Quelles épices/);
    await page.click('[data-spices="none"]');
    await page.click('#ob-next');
    await page.click('[data-regime="noPork"]');
    await page.click('#ob-next'); // Terminer
    await page.waitForSelector('#onboarding-modal', { state: 'hidden' });
    const r = await page.evaluate(() => ({ spices: state.spices, f: state.genFilters, code: state.householdCode, plan: state.plan.map((id) => GL.containsPork(state.recipes.find((x) => x.id === id))) }));
    assert.deepEqual(r.spices, []);
    assert.equal(r.f.noPork, true);
    assert.match(r.code, /^FOYER-/);
    assert.ok(r.plan.length === 7 && r.plan.every((p) => !p), 'le menu d\'exemple respecte « sans porc »');
    // 2e ouverture : plus d'accueil, et les données sont conservées
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);
    assert.ok(!(await page.isVisible('#onboarding-modal')));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : un utilisateur existant ne voit jamais l\'accueil et ses données ne bougent pas', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.clear(); localStorage.setItem('gamelle_plan', JSON.stringify(['poulet-mafe-riz'])); localStorage.setItem('gamelle_spices', JSON.stringify(['Cumin en poudre'])); } });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);
    assert.ok(!(await page.isVisible('#onboarding-modal')));
    assert.deepEqual(await page.evaluate(() => [state.plan, state.spices]), [['poulet-mafe-riz'], ['Cumin en poudre']]);
    assert.equal(await page.evaluate(() => localStorage.getItem('gamelle_onboarded')), '1');
  } finally { await browser.close(); srv.close(); }
});

test('navigateur : bandeau seulement dans Planning, fiche recette (pastilles, liste unique triée), plus de sons ni de notifications', { skip: !chromium && 'Playwright non installé' }, async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.recipes.length > 300);
    // bandeau « Gamelle & Panier · parts » : Planning seulement
    assert.ok(await page.isVisible('header'));
    for (const tab of ['tab-courses', 'tab-recettes', 'tab-partager']) {
      await page.evaluate((t) => switchTab(t), tab);
      assert.ok(!(await page.isVisible('header')), `bandeau masqué dans ${tab}`);
    }
    await page.evaluate(() => switchTab('tab-planning'));
    assert.ok(await page.isVisible('header'));
    // Réglages : ni « sons et vibrations » ni notifications
    await page.evaluate(() => switchTab('tab-partager'));
    const settings = await page.innerText('#tab-partager');
    assert.ok(!/Sons et vibrations/i.test(settings) && !/ntfy|Prévenir l'autre téléphone|prénom/i.test(settings), 'réglages épurés');
    // Fiche recette : pastilles temps + prix par portion sur une ligne, liste d'ingrédients unique et triée
    await page.evaluate(() => { switchTab('tab-planning'); openRecipeDetail('poulet-mafe-riz'); });
    const chips = await page.$$eval('#detail-recipe-time, #detail-recipe-cost', (els) => els.map((e) => [e.textContent.trim(), Math.round(e.getBoundingClientRect().top)]));
    assert.match(chips[0][0], /^\d+ min$/); assert.match(chips[1][0], /^\d+,\d\d €\/portion$/);
    assert.equal(chips[0][1], chips[1][1], 'sur la même ligne');
    assert.ok(!/pour \d/.test(await page.innerText('#detail-recipe-cost')), 'plus de « pour N »');
    const names = await page.$$eval('#detail-ingredients-list .font-medium', (els) => els.map((e) => e.textContent.trim()));
    assert.equal(await page.$$eval('#detail-ingredients-list > div', (e) => e.length), 1, 'une seule liste, sans titres de rayons');
    const order = await page.evaluate(() => [...document.querySelectorAll('#detail-ingredients-list .font-medium')].map((e) => e.textContent.trim()));
    const idx = (re) => order.findIndex((n) => re.test(n));
    assert.ok(idx(/riz/i) < idx(/huile|bouillon|curry|paprika|épice/i) || idx(/huile|bouillon|curry|paprika|épice/i) === -1, 'féculent avant épices : ' + order.join(' | '));
    assert.ok(idx(/poulet/i) < order.length - 1 && idx(/poulet/i) <= 1, 'la viande est tout en haut : ' + order.join(' | '));
    assert.ok(names.length >= 5);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});
