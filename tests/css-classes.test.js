// Contrôle : toute classe utilitaire (type Tailwind) utilisée dans index.html / app.js doit exister dans tailwind.css ou styles.css
// (tailwind.css est pré-compilé : une classe absente = mise en page cassée sans aucune erreur visible).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const PREFIX = /^(?:(?:hover|focus|active|dark|disabled|sm|md|lg|placeholder|group-hover|focus-within|focus-visible):)*-?(?:bg|text|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min-w|min-h|max-w|max-h|gap|space-x|space-y|border|rounded|shadow|ring|font|leading|tracking|top|left|right|bottom|z|opacity|divide|line-clamp|grid-cols|col-span|flex|basis|order|inset|translate|scale|rotate|duration|ease|from|to|via|fill|stroke|accent|object|aspect|self|items|justify|content|place|overflow|whitespace|cursor|select|transition|truncate|underline|uppercase|italic|hidden|block|inline|inline-flex|inline-block|grid|relative|absolute|fixed|sticky)(?:-|$)/;
const IGNORE = new Set(['items-list-container', 'flex', 'hidden', 'block', 'grid', 'relative', 'absolute', 'fixed', 'sticky', 'truncate', 'underline', 'uppercase', 'italic', 'border', 'rounded', 'shadow', 'transition', 'inline', 'inline-flex', 'inline-block']);

function definedSelectors() {
  const css = read('tailwind.css') + '\n' + read('styles.css');
  const set = new Set();
  for (const m of css.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) set.add(m[1].replace(/\\(.)/g, '$1'));
  return set;
}
function usedClasses() {
  const used = new Map();
  const add = (cls, where) => cls.split(/\s+/).forEach((c) => { if (c && !/[${}()]/.test(c)) used.set(c, where); });
  const html = read('index.html');
  for (const m of html.matchAll(/class="([^"]*)"/g)) add(m[1], 'index.html');
  for (const f of ['app.js', 'groceries.js', 'sync.js']) {
    for (const m of read(f).matchAll(/class(?:Name)?(?:=|\s*=\s*)["'`]([^"'`]*)["'`]/g)) add(m[1].replace(/\$\{[^}]*\}/g, ' '), f);
  }
  return used;
}

test('CSS : aucune classe utilitaire utilisée ne manque dans tailwind.css / styles.css', () => {
  const defined = definedSelectors();
  const missing = [];
  for (const [c, where] of usedClasses()) {
    if (IGNORE.has(c) || !PREFIX.test(c)) continue;
    if (!defined.has(c)) missing.push(`${c} (${where})`);
  }
  assert.deepEqual(missing.sort(), [], 'classes à ajouter dans styles.css');
});
