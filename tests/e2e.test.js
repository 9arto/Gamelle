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
    await page.click('.spice-level-btn[data-level="2"]');
    assert.match(await page.textContent('#courses-stats-label'), /budget ≈ \d+ €/);

    // Catalogue : filtres saison / style
    await page.evaluate(() => { switchTab('tab-recettes'); });
    await page.click('.filter-btn[data-filter="style:street"]');
    const n = await page.evaluate(() => state.recipes.filter((r) => GL.recipeStyles(r).includes('street')).length);
    assert.match(await page.textContent('#recipes-count-label'), new RegExp(String(n)));

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
