// Génère CATALOGUE.md (liste complète des recettes + statistiques) à partir de recipes.js.
// Usage : npm run docs   (le test « CATALOGUE.md à jour » vérifie que le fichier correspond au catalogue)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, loadRecipes } = require('../tests/load-groceries.js');

function build() {
  const root = path.join(__dirname, '..');
  const R = loadRecipes();
  const api = load(R).api;
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'nutrition.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'logic.js'), 'utf8'), ctx);
  const N = ctx.window.GamelleNutrition;
  const L = ctx.window.GamelleLogic;
  const nameOf = (i) => api.normalizeIngredient(i).name;
  const cnt = (f) => { const m = {}; R.forEach((r) => [].concat(f(r)).forEach((x) => { m[x] = (m[x] || 0) + 1; })); return m; };
  const row = (obj, labels) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${(labels && labels[k]) || k} | ${v} |`).join('\n');
  const TYPE = { volaille: 'Volaille', viande: 'Viande', poisson: 'Poisson', vege: 'Végétarien' };
  const seasonLabel = Object.fromEntries(L.SEASONS.map((s) => [s.id, `${s.emoji} ${s.label}`]));
  const styleLabel = Object.fromEntries(L.STYLES.map((s) => [s.id, s.label]));
  const out = [];
  out.push('# Catalogue des recettes\n');
  out.push('> Fichier **généré** par `npm run docs` (ne pas modifier à la main). Voir `APPLICATION.md` §5 pour ajouter ou corriger une recette.\n');
  out.push(`**${R.length} recettes**, toutes pour 4 portions. Calories et macros : estimation par portion (voir `+'`APPLICATION.md` §3.3 bis).\n');
  out.push('## Répartition\n\n| Type | Recettes |\n|---|---|\n' + row(cnt((r) => r.type), TYPE));
  out.push('\n| Saison (une recette peut compter dans plusieurs) | Recettes |\n|---|---|\n' + row(cnt((r) => r.seasons), seasonLabel));
  out.push('\n| Style | Recettes |\n|---|---|\n' + row(cnt((r) => r.styles), styleLabel));
  out.push(`\n- « Pas cher » : ${R.filter((r) => r.isBudget).length} · moins de 20 min : ${R.filter((r) => r.timeMinutes <= 20).length} · bon en gamelle : ${R.filter((r) => r.gamelle).length}\n`);
  out.push('## Toutes les recettes\n');
  out.push('| Recette | Type | Min | Saisons | Styles | kcal/portion | Identifiant |\n|---|---|---|---|---|---|---|');
  for (const r of [...R].sort((a, b) => a.title.localeCompare(b.title, 'fr'))) {
    const n = N.recipeNutrition(r, api.ingredientGrams, nameOf);
    out.push(`| ${r.title.replace(/\|/g, '/')} | ${TYPE[r.type] || r.type} | ${r.timeMinutes} | ${r.seasons.length === 4 ? 'toutes' : r.seasons.map((s) => (seasonLabel[s] || s).split(' ')[1]).join(', ')} | ${r.styles.map((s) => styleLabel[s]).join(', ')} | ${n.coverage >= 0.7 ? n.perPortion.kcal : '–'} | \`${r.id}\` |`);
  }
  return out.join('\n') + '\n';
}

if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, '..', 'CATALOGUE.md'), build());
  console.log('CATALOGUE.md généré');
}
module.exports = { build };
