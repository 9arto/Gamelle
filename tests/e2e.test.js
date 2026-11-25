// Tests de bout en bout dans un vrai navigateur (Playwright). Ignorés si Playwright n'est pas installé.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* non installé */ }
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
