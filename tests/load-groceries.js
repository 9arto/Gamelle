// Charge la logique « liste de courses » de app.js dans Node, sans toucher au fichier.
// On extrait le bloc situé entre les marqueurs HARMONISATION… et renderAll().
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const start = appSrc.indexOf('// HARMONISATION & AGRÉGATION DE LA LISTE DE COURSES');
const end = appSrc.indexOf('function renderAll()');
if (start < 0 || end < 0) throw new Error('Marqueurs introuvables dans app.js');
const block = appSrc.slice(start, end);

function load(recipes) {
  const ctx = { console, window: {}, state: { plan: [], lockedSlots: [], portions: 4, recipes: recipes || [], checkedGroceries: {}, staples: [] } };
  vm.createContext(ctx);
  // const/let au niveau script ne sont pas visibles via ctx : on les exporte explicitement
  vm.runInContext(block + `
    ;this.api = { canonicalUnit, convertQuantity, formatQuantityAndUnit, normalizeIngredient, computeGroceries, UNIT_WEIGHTS, COUNT_UNITS, SPECIAL_PRODUCTS };`, ctx);
  return ctx;
}

function loadRecipes() {
  const src = fs.readFileSync(path.join(root, 'recipes.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.DEFAULT_RECIPES;
}

module.exports = { load, loadRecipes };
