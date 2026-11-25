// Charge la logique « liste de courses » de app.js dans Node, sans toucher au fichier.
// On charge groceries.js (moteur de la liste de courses).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

const block = fs.readFileSync(path.join(root, 'groceries.js'), 'utf8');

function load(recipes) {
  const ctx = { console, window: {}, state: { plan: [], lockedSlots: [], portions: 4, recipes: recipes || [], checkedGroceries: {}, staples: [] } };
  vm.createContext(ctx);
  // const/let au niveau script ne sont pas visibles via ctx : on les exporte explicitement
  vm.runInContext(block + `
    ;this.api = { canonicalUnit, convertQuantity, ingredientGrams, formatQuantityAndUnit, normalizeIngredient, computeGroceries, UNIT_WEIGHTS, COUNT_UNITS, SPECIAL_PRODUCTS };`, ctx);
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
