# Gamelle & Panier — référence de l'application

> Document de base : **ce que fait l'application, comment elle le fait, et ce qu'il faut vérifier** avant chaque mise en ligne.
> À tenir à jour à chaque évolution (voir §12 « Règles de travail »). Dernière mise à jour : 25/11/2026 — service worker **v42**.

---

## 1. À quoi sert l'application

Application web (PWA, installable sur iPhone) pour **un couple actif qui cuisine pour 4 portions** : 2 dîners le soir + 2 gamelles le lendemain midi. Les courses se font à **Grand Frais**.

Le cycle d'usage :

1. **Choisir les plats** de la semaine (à la main ou avec « 7 repas » qui compose un menu équilibré).
2. **Obtenir la liste de courses** automatiquement, regroupée par rayon du magasin, avec les quantités additionnées.
3. **Cocher les articles** en magasin (synchronisé en direct avec le conjoint / la conjointe).
4. **Cuisiner** pas à pas avec minuteurs (mode cuisine).

Principes de conception (à ne pas casser) :

- Visuel validé par le propriétaire : **ne pas le modifier** sans accord.
- **Aucune donnée utilisateur ne doit être perdue ou réinitialisée** par une mise à jour : plats choisis, foyer connecté, liste de courses (cases cochées, articles courants), « j'aime » (favoris), recettes maison, menus enregistrés.
- Fonctionne **hors-ligne** (magasin, sous-sol) et sans compte.
- Aucun build : site 100 % statique, aucune dépendance côté application.

---

## 2. Fiche technique

| Élément | Détail |
|---|---|
| Hébergement | GitHub Pages (dépôt `9arto/Gamelle`, branche `main`, racine). `.nojekyll` présent. |
| Fichiers | `index.html` (structure + fenêtres), `app.js` (interface et état), `logic.js` (logique pure testée : saisons, styles, génération du menu, placard, budget, chiffrement), `nutrition.js` (calories/macros/allergènes + client Open Food Facts), `recipes.js` (catalogue + rayons + anciens identifiants), `styles.css` + `tailwind.css` (CSS pré-compilé, pas de CDN), `sw.js` (service worker), `manifest.json`, icônes. |
| Données recettes | `window.DEFAULT_RECIPES` (342 recettes) et `window.RECIPE_ALIASES` (anciens identifiants → recette conservée) et `window.GRAND_FRAIS_RAYONS` (6 rayons) dans `recipes.js`. |
| Stockage | `localStorage` (voir §6). Tout est validé/nettoyé à la lecture (`sanitize*`). |
| Synchro foyer | Service public **ntfy.sh** (un « topic » par code foyer). Voir §6. |
| Hors-ligne | `sw.js` : fichiers de l'app en cache (mise à jour discrète), pages réseau d'abord, photos mémorisées (250 max). |
| Mise à jour | Changer `VERSION` dans `sw.js` (actuellement `v42`) à **chaque** modification de `app.js`, `recipes.js`, `index.html` ou des CSS, sinon les téléphones gardent l'ancienne version. Une carte « Mise à jour » (Réglages) permet de vérifier/installer. |
| Tests | `npm test` (ou `node --test tests/`). Node ≥ 20, aucune dépendance. Voir §9. |

Navigation : 4 onglets en bas — **Planning**, **Courses**, **Recettes**, **Réglages** (id interne `tab-partager`). Le dernier onglet ouvert est mémorisé.

---

## 3. Fonctionnement écran par écran

### 3.1 Planning (« Mes repas »)
- Titre évolutif : « Mes 3 repas » (« Mon repas » pour un seul, « Mes repas » si vide). Liste ordonnée de repas (sans notion de jour, maximum 60). Chaque repas : photo, titre, durée, tag, badge « 💰 Pas cher ».
- **« Finir mes restes »** : on saisit ce qu'on a à la maison (suggestions à la frappe : poulet, courgettes, riz…). L'app classe les recettes qui les utilisent : d'abord celles qui utilisent le plus de vos produits, puis celles où il **manque le moins** de courses (liste « Il manque : … » ou « Rien à acheter »). Le placard et vos épices comptent comme « déjà là » ; huile, farine, vinaigres et épices courantes ne bloquent jamais. Boutons « Voir » et « Au menu ». La liste est mémorisée et synchronisée (`gamelle_leftovers`).
- **« 7 repas »** ouvre **« Composer mes 7 repas »** : filtres facultatifs **Saison** (🌸 ☀️ 🍁 ❄️, bouton « saison actuelle »), **Type** (volaille, viande, poisson, végétarien), **Style** (Street food, Italien, Asiatique, Orient & Indien, Tex-Mex, Terroir, Frais & bowls, Du quotidien), **Pratique** (pas cher, < 20 min, bon en gamelle, 1 seule poêle, mes favoris), **Régime** (sans porc, sans lactose) et **« J'ai dans le frigo »** (ingrédients à utiliser en priorité). Un compteur indique combien de plats correspondent ; les filtres sont mémorisés.
  - Tirage **proportionnel à la place de chaque type dans le catalogue** (tous les plats peuvent sortir), sans doublon, jamais plus de 3 plats du même type tant qu'il y a du choix ; les plats notés « 👎 Bof » et ceux cuisinés depuis moins de 21 jours sont évités, les « 👍 À refaire » favorisés.
  - Les repas **gardés** sont conservés, seuls les autres sont renouvelés. Remet à zéro les cases cochées de la liste de courses.
- **« Garder / 🔓 »** sur un repas = « déjà à la maison » : le repas reste au menu mais **ses ingrédients sont exclus de la liste de courses**.
- **« Changer »** : choisir un autre plat. **« ✕ »** retire le repas. **« + Ajouter un plat »**.
- **Sauvegarder / Mes menus** : enregistre le menu en cours (nom, portions, plan, articles courants), 30 menus maximum ; ouverture/suppression.
- **« Ma recette »** : ouvre le studio de recette maison.
- Toutes les actions destructrices proposent **« Annuler »** (bandeau en bas).
- Compteur de portions en haut à droite : **−/+**, de 1 à 12 (4 par défaut) ; tout se recalcule (courses incluses).

### 3.2 Courses (« Courses à Grand Frais »)
- Liste **simplifiée** calculée à partir des repas non « gardés » (§7) : un produit = une ligne, quantités additionnées, classés en **6 rayons** : 🥬 Fruits & Légumes, 🥩 Boucherie & Volailles, 🐟 Poissonnerie & Marée, 🧀 Fromagerie & Crèmerie, 🥫 Épicerie, 🛒 Articles courants (hors recettes).
- Chaque ligne : case à cocher, quantité, nom, et entre parenthèses la ou les recettes concernées. Les articles cochés descendent en bas de leur rayon.
- Barre de progression « N / M articles trouvés », pastille de comptage sur l'onglet.
- **Budget estimé** affiché sous le compteur (« ≈ 61 € », ordre de grandeur par rayon, pas un prix de magasin).
- **🏠 Placard** : le bouton 🏠 d'un article = « j'en ai déjà » (mémorisé d'une semaine à l'autre, annulable). Les articles masqués restent consultables dans **« Déjà à la maison »** avec un bouton **« Il m'en faut »**.
- Carte **« Placard & réglages »** : **mes épices** (une puce par épice : « ✓ » = j'en ai, elle n'est plus listée ; liens « tout / aucune »), **produits de base à la maison** (huile, farine, sucre, vinaigres, moutarde, chapelure), **ordre des rayons** dans mon magasin (▲▼), liste du placard.
- **Articles courants** : saisie avec **suggestions pendant la frappe** (produits usuels, articles du catalogue, produits de la maison comme papier toilette ou lessive ; accents ignorés ; ceux déjà dans la liste ne sont pas proposés) ; champ libre + pastilles 1 tap (Banane, Lait, Fruits, Kéfir, Yaourt, Pain de mie, Flocons d'avoine) ; supprimables un par un.
- **📋 Copier** : texte propre (WhatsApp / Notes) avec `[ ]` par article. **🗑️** : décocher tout (annulable).
- Bandeau 🔒 si des repas sont gardés.

### 3.3 Recettes (catalogue)
- 342 plats affichés par 24 (bouton « Afficher plus » + chargement automatique au défilement).
- **Recherche** insensible à la casse/accents/ponctuation (titre, description, ingrédients).
- **Filtres** : une ligne d'essentiels (Tous · ❤️ Favoris · ⚡ < 20 min · 🍱 Gamelle · 💰 Pas cher · types) + **« ⚙️ Plus de filtres »** (saisons, styles, 1 poêle, sans porc, sans lactose, mes recettes). Liste complète : Tous · 💰 Pas cher · 🌸 Printemps · ☀️ Été · 🍁 Automne · ❄️ Hiver · ⚡ < 20 min · 🍱 Gamelle · 🍗 Volaille · 🥩 Viande · 🐟 Poisson · 🌱 Végétarien · styles (🌮 Street food, 🇮🇹 Italien, 🥢 Asiatique, 🍛 Orient & Indien, 🌶️ Tex-Mex, 🥘 Terroir, 🥗 Frais & bowls) · 🍳 1 poêle · 🚫🐖 Sans porc · 🥛 Sans lactose · ❤️ Favoris · ⭐ Mes recettes.
- **Tri** : **Au hasard** (par défaut, avec un bouton « Mélanger » ; l'ordre reste stable tant qu'on ne mélange pas) / Ordre du catalogue / Moins cher d'abord / Plus rapide.
- **Photos** : les listes utilisent la vignette Jow 304×304 (≈ 140 Ko) ; la fiche recette affiche la grande photo 550×550 (≈ 430 Ko).
- **Fiche recette** : photo, durée, saison, tag, portions ajustables (propres à la fiche), ingrédients (quantités converties), étapes, bouton ❤️ (favori), **avis** (👍 À refaire / 👎 Bof / ✅ Cuisiné — « cuisiné » est aussi coché automatiquement à la fin du mode cuisine), « Ajouter au menu », « Cuisiner ». Recette maison : boutons modifier / supprimer.
- **Mode cuisine pas à pas** : une étape par écran, ingrédients de l'étape, **minuteur** (alerte sonore, un minuteur par étape), **écran maintenu allumé** (Wake Lock).

### 3.3 bis Nutrition & Open Food Facts
- **Allergènes** : affichés **uniquement sur les fiches recettes** (jamais dans la liste de courses). Seule la pastille Nutri-Score apparaît sur les articles.
- **Fiche recette** : bloc « Nutrition estimée par portion » (kcal, protéines, glucides, lipides) et **allergènes** (gluten, lait, œufs, poisson, crustacés, soja, sésame, fruits à coque…). Calcul : poids de chaque ingrédient (mêmes conversions que les courses) × valeur moyenne par article (table `RULES` de `nutrition.js`, valeurs de type Ciqual arrondies). Affiché seulement si ≥ 70 % des ingrédients sont couverts ; l'huile de cuisson n'est comptée que partiellement (15 g/portion max). **Estimation indicative.**
- **Courses → carte « Placard & réglages » → « Nutri-Score & allergènes de ma liste »** : interroge **Open Food Facts** (API publique, **aucune clé nécessaire**) pour les articles d'épicerie et de crèmerie (40 max) et affiche une pastille Nutri-Score A–E (note la plus fréquente parmi 10 produits du même type) ; mémorisé 30 jours sur le téléphone.
- **« 📷 Scanner un produit »** : lecture du code-barres par la caméra (là où le navigateur gère `BarcodeDetector`) ou saisie du numéro ; affiche nom, marque, Nutri-Score, NOVA, kcal/macros pour 100 g, allergènes ; boutons « mettre l'article correspondant au placard » ou « ajouter aux articles courants ». Sur iPhone, la caméra n'est pas toujours disponible : la saisie manuelle fonctionne partout.
- Réseau : pas de réseau = fonction simplement indisponible (le reste de l'app n'est pas affecté). Aucune donnée personnelle n'est envoyée (seulement le nom du type de produit ou le code-barres).

### 3.4 Studio de recette maison
- Titre, durée, type (Volaille / Poisson / Végétarien / Bœuf-Porc), saison, « pas cher », photo (URL ou pastilles prédéfinies), ingrédients (une ligne = `quantité unité nom`), étapes (une par ligne, minuteurs détectés dans le texte).
- Le rayon de chaque ingrédient est détecté automatiquement. Modifiable / supprimable. Synchronisée avec le foyer. Identifiant `custom-…`.

### 3.5 Réglages
- **Apparence** : Clair / Sombre / Système.
- **Mise à jour** : version installée, bouton vérifier/installer.
- **Synchronisation en direct (foyer)** : saisir un code ou « Générer un code sécurisé » ; voyant « En direct » ; copier le code ; se déconnecter ; forcer la synchro.
- **Partage** : lien magique (menu + courses + code foyer), texte de courses pour WhatsApp, QR code **à la demande uniquement** (il passe par un service externe).
- **Export** : sauvegarde JSON de l'état complet.

---

## 4. Règles métier importantes

| Règle | Détail |
|---|---|
| Portions | Toutes les recettes sont écrites **pour 4 portions** (`basePortions: 4`). Les quantités sont multipliées par `portions / basePortions`. |
| Repas gardé | Index du repas dans `lockedSlots` → ignoré par le calcul des courses. |
| Génération de menu | Tirage proportionnel au catalogue filtré (voir §3.1). Types valides : `vege`, `viande`, `poisson`, `volaille` (les anciens `poulet`, `boeuf`, `porc` ont été rattachés). |
| Saisons | Chaque recette a `seasons` (1 à 4 parmi `printemps`, `ete`, `automne`, `hiver`), `styles` (1 à 3) et `gamelle` (vrai/faux), calculés par `classifyRecipe` (logic.js) puis figés dans `recipes.js`. Les recettes maison sont classées à la volée (champ « saison » du studio). Chaque saison couvre au moins 25 % du catalogue. |
| Anciens identifiants | `RECIPE_ALIASES` : menu, favoris, menus enregistrés et liens partagés qui citent une recette fusionnée sont redirigés vers la recette conservée. |
| Recette introuvable | Un identifiant du menu sans recette (ex. recette maison supprimée) est ignoré sans erreur. |
| Suppression d'une recette maison | Retire aussi la recette du menu et réindexe les repas gardés. |
| Codes foyer | `FOYER-XXXX-XXXX-XXXX` (aléatoire sécurisé). Un code « faible » demande confirmation. |

---

## 5. Le catalogue de recettes

### 5.1 Format d'une recette (`recipes.js`)
```js
{
  "id": "poulet-mafe-riz",            // unique, minuscules/chiffres/tirets
  "title": "Poulet façon mafé & riz",
  "description": "…",                   // 1–2 phrases
  "season": "toute_saison",            // ancien champ éditorial (conservé)
  "seasons": ["printemps","ete"],      // saisons où le plat est proposé (filtres + génération)
  "styles": ["italien"],               // street | italien | asiatique | orient | mexicain | terroir | frais | quotidien
  "gamelle": true,                      // se réchauffe / se mange froid sans problème
  "timeMinutes": 21,                    // préparation + cuisson (le filtre « Express » = ≤ 20)
  "tag": "Hit Jow & Express",
  "type": "volaille",                  // volaille | poisson | vege | viande
  "isBudget": true,                     // badge « Pas cher » + filtre
  "basePortions": 4,
  "image": "https://static.jow.fr/550x550/recipes/….png",
  "ingredients": [ { "name": "Riz basmati", "quantity": 280, "unit": "g", "rayon": "epicerie" } ],
  "steps": [ { "instruction": "…", "ingredients": ["280 g de riz basmati"], "timerMinutes": null } ]
}
```
- Rayons : `fruits-legumes`, `boucherie`, `poissonnerie`, `cremerie`, `epicerie` (le rayon `courants` est réservé aux articles courants). **Le rayon final est recalculé par l'application** (voir §7) ; celui du fichier sert de secours pour un produit inconnu.
- Unités reconnues : g, kg, ml, cl, l, c. à soupe, c. à café, pièce(s), gousse, botte/bouquet, brin, branche, tige, tête, tranche, pavé, œuf, pincée, poignée, quartier, pot, cube, boîte, paquet, cm, portion, sachet, morceau, bouteille.

### 5.2 État du catalogue (25/11/2026)
- **342 recettes** : 305 d'origine − 41 doublons fusionnés + **38** (lot 1) **+ 40** (lot 2, sans aucun poisson ni fruit de mer, donc pas de « terre et mer ») nouvelles « Top Jow » (priorité donnée aux recettes Jow les plus « likées » : dans chaque groupe de doublons, la version la plus proche de la recette Jow d'origine a été gardée).
- Répartition par saison (une recette peut compter dans 2–4 saisons) : voir le test « classement ». Chaque saison couvre au moins 25 % du catalogue.
- Quantités des 38 nouvelles recettes recalculées pour 4 portions ; photos officielles Jow (`static.jow.fr`, 550×550).

#### Doublons fusionnés (ancien identifiant → recette conservée)
| Supprimée | Conservée |
|---|---|
| `croque-monsieur-gourmand-bechamel-four` | `croque-monsieur-four-bechamel` |
| `fajitas-boeuf-poivrons-express` | `fajitas-tex-mex-boeuf-poivrons-guacamole` |
| `poulet-tikka-masala-express-riz-basmati` | `poulet-tikka-masala-express-riz` |
| `gnocchi-epinards-gorgonzola-creme` | `gnocchis-epinards-creme-gorgonzola` |
| `gnocchis-sauce-cremeuse-gorgonzola-epinards` | `gnocchis-epinards-creme-gorgonzola` |
| `brochettes-yakitori-boeuf-fromage-riz` | `yakitori-boeuf-fromage-riz` |
| `croque-madame-dore-four-salade` | `croque-madame-four-oeuf-coule` |
| `quiche-doree-poireaux-feta` | `quiche-poireaux-feta-doree` |
| `lasagnes-vege-courgettes-champignons` | `lasagnes-vegetariennes-courgettes-champignons-ricotta` |
| `risotto-saint-jacques-poireaux-fondants` | `risotto-saint-jacques-poireaux-parmesan` |
| `burger-parisien-boucher-champignons-frites` | `burger-parisien-boeuf-comte-frites` |
| `curry-crevettes-lait-coco-poivron` | `curry-crevettes-lait-coco-riz` |
| `blanquette-crevettes-poireaux-riz` | `blanquette-express-crevettes-riz` |
| `poulet-miel-haricots-verts-ail` | `poulet-laque-miel-haricots-verts` |
| `burrito-boeuf-haricots-cheddar` | `burrito-boeuf-cheddar-fondant` |
| `gnocchis-poeles-tomates-mozzarella` | `gnocchi-poeles-tomates-cerises-basilic` |
| `pates-alfredo-poulet-parmesan` | `pates-alfredo-au-poulet-dore` |
| `pad-thai-aux-crevettes` | `pad-thai-crevettes-cacahuetes` |
| `curry-d-aubergines-fondant-coco` | `curry-aubergines-lait-coco-pois-chiches` |
| `salade-de-pates-jambon-cru-petits-pois` | `salade-pates-jambon-cru-petits-pois` |
| `veloute-champignons-parmesan` | `veloute-champignons-parmesan-croutons` |
| `boulettes-poulet-thai-gingembre-coco` | `boulettes-poulet-thai-coco` |
| `risotto-cremeux-crevettes-chorizo` | `risotto-crevettes-chorizo-parmesan` |
| `soupe-lentilles-poulet-repas` | `soupe-lentilles-poulet-legumes` |
| `pates-cremeuses-poulet-olives-herbes` | `pates-cremeuses-poulet-olives` |
| `bowl-poulet-laque-teriyaki-sesame-riz` | `bowl-poulet-teriyaki-sesame-riz` |
| `poulet-basquaise-poivrons-tomates-mijjote` | `poulet-basquaise-poivrons-riz` |
| `pates-ragout-canard-mijote` | `rigatoni-ragout-canard-confit-tomate` |
| `enchiladas-dorees-boeuf-sauce-tomate-fromage` | `enchiladas-boeuf-cheddar-gratine` |
| `lentilles-carottes-saucisses-volaille` | `saucisses-toulouse-lentilles-vertes-carottes` |
| `tartiflette-poelee-rapide-reblochon` | `tartiflette-savoyarde-express-lardons-reblochon` |
| `poulet-citron-olives-couscous` | `poulet-citron-confit-olives-couscous` |
| `riz-saute-poulet-petits-pois-oeuf` | `riz-cantonais-poulet-petits-pois` |
| `lasagnes-courgette-ricotta-fondantes` | `lasagnes-vegetariennes-courgettes-champignons-ricotta` |
| `chili-con-carne-boeuf-haricots` | `chili-con-carne-traditionnel-haricots-rouges` |
| `wok-poulet-legumes-sauce-cacahuete` | `wok-poulet-cacahuete-legumes-croquants` |
| `parmentier-de-canard-patates-douces` | `parmentier-canard-patates-douces` |
| `curry-lentilles-vertes-patate-douce` | `curry-lentilles-patates-douces-coco` |
| `tarte-fine-tomates-moutarde-pesto` | `tarte-fine-tomates-moutarde-herbes` |
| `blanquette-veau-traditionnelle-carottes-riz` | `blanquette-veau-traditionnelle-riz-pilaf` |
| `boulettes-bolognaise-spaghetti-parmesan` | `boulettes-boeuf-sauce-tomate-spaghetti` |

### 5.3 Ajouter des recettes — marche à suivre
1. Vérifier l'absence de doublon (titre, photo, plat équivalent) — le test « nettoyage » le contrôle.
2. Ajouter l'objet dans `DEFAULT_RECIPES` (`recipes.js`) avec un `id` nouveau.
3. Utiliser des noms d'ingrédients clairs ; si un produit est nouveau ou ambigu, vérifier le résultat dans la liste de courses (§7.5).
4. Calculer `seasons` / `styles` / `gamelle` avec `GamelleLogic.classifyRecipe` ; ajouter l'`id` dans `NEW_JOW_IDS` (tests) si c'est un lot à contrôler ; `npm test`.
5. Si l'instantané des ingrédients change : relire le diff, puis `UPDATE_SNAPSHOT=1 node --test tests/`.
6. **Incrémenter `VERSION` dans `sw.js`**.

---

## 6. Données, synchronisation, partage

### 6.1 Clés `localStorage` (ne jamais renommer sans migration)
`gamelle_plan`, `gamelle_portions`, `gamelle_locked_slots`, `gamelle_checked`, `gamelle_staples`, `gamelle_favorites`, `gamelle_saved_menus`, `gamelle_custom_recipes`, `gamelle_notes`, `gamelle_gen_filters`, `gamelle_pantry`, `gamelle_pantry_needed`, `gamelle_spices`, `gamelle_stock_basics`, `gamelle_aisle_order`, `gamelle_off_cache`, `gamelle_household_code`, `gamelle_last_sync`, `gamelle_device_id`, `gamelle_tab`, plus le thème.

### 6.2 Synchronisation « foyer »
- Chaque appareil publie son état complet (portions, plan, repas gardés, articles courants, cases cochées, recettes maison, menus enregistrés, favoris, placard, niveau d'épices, ordre des rayons, avis) sur `https://ntfy.sh/gamelle_foyer_<CODE>`, **400 ms après** chaque modification, et écoute le flux en direct (SSE) + une lecture au démarrage.
- **Contenu chiffré** (AES-GCM 256, clé dérivée du code foyer) : ntfy.sh ne voit plus le menu en clair. Les anciens messages en clair restent lus. ⚠️ Un téléphone qui n'a pas encore la mise à jour ne comprend pas les messages chiffrés : **mettre à jour les deux téléphones**.
- Règle : **le message le plus récent gagne** (horodatage), sauf les **avis / historique**, fusionnés recette par recette ; ses propres messages sont ignorés (`deviceId`). Aucun contenu reçu n'est exécuté : tout passe par `sanitize*`.
- Limites connues : le nom du topic dérive du code → le code doit rester secret ; si deux personnes modifient exactement en même temps, la dernière écriture écrase l'autre (sauf avis).

### 6.3 Partage
- **Lien magique** : `?menu=id1,id2,…&portions=4&staples=…&household=CODE` ; à l'ouverture, l'application **demande confirmation** avant d'importer le menu ou de rejoindre le foyer, puis nettoie l'adresse.
- ⚠️ Un lien de menu contient des identifiants de recettes : une personne qui n'a pas encore la dernière version de l'app ne verra pas les nouvelles recettes.

---

## 7. La liste de courses « simplifiée » (cœur de l'application)

Code : `app.js`, section « HARMONISATION & AGRÉGATION DE LA LISTE DE COURSES » (`canonicalUnit`, `convertQuantity`, `formatQuantityAndUnit`, `normalizeIngredient`, `computeGroceries`).

### 7.1 Principe
Pour chaque repas non gardé et chaque ingrédient :
1. **Normalisation** (`normalizeIngredient`) : le nom écrit dans la recette (« Escalopes de poulet », « Oignon jaune », « Crème liquide »…) est ramené à **un article de courses unique** (« Filets de poulet frais », « Oignons jaunes », « Crème fraîche (épaisse ou liquide) »), avec son **rayon** et son **unité d'achat**.
2. **Unité canonique** (`canonicalUnit`) : « cuillère à soupe », « cas », « pièces », « litre »… → une seule forme.
3. **Conversion** (`convertQuantity`) : g↔kg, ml↔cl↔l, cuillères ↔ g/ml (1 c. à soupe = 15, 1 c. à café = 5, 1 pincée = 0,5), et pièces ↔ grammes grâce au tableau `UNIT_WEIGHTS` (ex. 1 patate douce = 300 g, 1 œuf = 55 g, 1 botte de persil = 50 g). Sans poids connu, la quantité reste sur **sa propre ligne** (« 2 c. à café + 1 pièce ») : rien n'est jamais perdu ni inventé.
4. **Addition** par article, quel que soit le repas ou l'unité d'origine.
5. **Affichage pour acheter** (`formatQuantityAndUnit`, mode courses) : grammes arrondis à la dizaine supérieure au-dessus de 50 g, kg au-delà de 1000 g (« 1,2 kg »), L au-delà de 1000 ml, unités comptables arrondies à l'unité (`2,1 → 2`, `2,2 → 3`), jamais « 0 botte ». Si des grammes ont été additionnés à des pièces : « 4 pièces (≈ 1,2 kg) ».

### 7.2 Choix de l'unité d'affichage (déterministe)
Si plusieurs unités sont possibles pour un même article, la priorité est : **g → ml → c. à café → c. à soupe → pincée → unités comptables**. Le résultat **ne dépend donc pas de l'ordre des repas** (avant correction, « 280 g » ou « 3 sachets » selon le repas lu en premier).

### 7.3 Produits particuliers (`SPECIAL_PRODUCTS`, traités en premier)
Évitent qu'un produit soit absorbé par un mot qu'il contient : camembert/raclette « au lait » ≠ lait ; **fromage ail & fines herbes ≠ ail** ; **ravioli/ravioles/tortellini ≠ ricotta ni champignons** ; **sauce tomate / purée de tomates / passata** = tomates concassées (pas du basilic ni des tomates fraîches) ; **thon au citron = thon** (pas des citrons) ; **épices à couscous ≠ semoule** ; côtes de porc, jambon cru (prosciutto), épinards surgelés, kit fajitas, harissa, magrets, échine, pâte à pizza, bagels, nouilles instantanées…

### 7.4 Cases cochées
La clé d'un article = son nom normalisé en minuscules. Pour ne pas perdre de coches lors des évolutions, les **anciennes clés** (rayon+nom+unité, et nom d'origine de la recette) sont reconnues.

### 7.4 bis Placard, épices, produits de base (`splitGroceries`, logic.js)
Après le calcul, chaque article est classé « à acheter » ou « déjà à la maison » : (1) « Il m'en faut » l'emporte toujours ; (2) article du **placard** ; (3) **épice** cochée dans « Mes épices » (18 épices courantes : paprika, cumin, curcuma, herbes de Provence, muscade, cannelle, curry, fajitas/chili, mexicaines, couscous, garam masala, piment, gingembre moulu, tabasco, harissa, sriracha, wasabi) ; (4) **produit de base** si l'option est activée (huile, farine, sucre, vinaigres, moutarde, chapelure). Les listes sont dans `SPICES_*` / `BASICS` (les noms doivent exister dans les courses : test dédié).

### 7.5 Ajouter / corriger un produit — marche à suivre
1. Ajouter la règle dans `normalizeIngredient` (ou une ligne dans `SPECIAL_PRODUCTS` si le nom contient un autre produit). L'**ordre des règles compte** (la première qui correspond gagne).
2. Si le produit se compte à la pièce : ajouter son poids dans `UNIT_WEIGHTS` (clé = nom normalisé exact).
3. `npm test`. Le test « instantané » signale tout changement de regroupement ; relire, puis `UPDATE_SNAPSHOT=1 node --test tests/`.
4. Ajouter un test ciblé dans `tests/groceries.test.js` (cas précis) si le piège est nouveau.

---

## 8. Hors-ligne et mises à jour
- Premier chargement en ligne obligatoire ; ensuite l'app fonctionne sans réseau (sauf photos non encore vues, synchro foyer, QR code).
- Après une mise en ligne, l'appareil récupère la nouvelle version en arrière-plan ; une pastille propose de l'installer. **Penser à incrémenter `VERSION` dans `sw.js`.**

---

## 9. Tests automatisés (`tests/`)

Lancer : `npm test`. Les tests chargent le vrai code de `app.js` et `recipes.js` (sans les modifier).

| Fichier | Contrôle |
|---|---|
| `tests/groceries.test.js` | unités (toutes les écritures), conversions, arrondis et grammaire ; regroupement des variantes d'un même produit ; produits non absorbés ; rayons ; additions entre repas ; poids/pièces ; **indépendance vis-à-vis de l'ordre des repas** ; doses (×portions) ; repas gardés exclus ; planning vide/recette inconnue ; quantités inconvertibles conservées ; cases cochées conservées ; anciennes recettes maison ; invariants sur **tout le catalogue** (liste valide pour chaque recette, aucune quantité perdue, pas de doublon de ligne, pas de produit en double sous deux noms). |
| `tests/recipes.test.js` | syntaxe des fichiers ; **nettoyage** (pas de photo partagée, pas de titre quasi identique, alias valides, pas d'ingrédient en double, types valides) ; **classement** (saisons/styles/gamelle présents, 4 saisons ≥ 25 %) ; structure de chaque recette ; unicité id/titre ; lot « Top Jow » (présence, aucun doublon photo/titre, types reconnus, durées et quantités réalistes, étapes sans texte parasite, minuteurs cohérents) ; **cas précis de courses** des nouvelles recettes ; **instantané** `tests/fixtures/ingredient-mapping.json` (chaque nom d'ingrédient → article de courses : tout changement doit être voulu). |
| `tests/logic.test.js` | saison actuelle ; classement saisons/styles/gamelle ; régimes (sans porc / lactose / 1 poêle) ; **génération proportionnelle**, plafond par type, tous les plats peuvent sortir ; filtres respectés ; plats verrouillés, « bof », cuisinés récemment, frigo ; placard / épices / base ; noms d'épices valides ; budget plausible ; **chiffrement** de la synchro. |
| `tests/nutrition.test.js` | chaque article a une valeur ; cohérence kcal/macros ; calories par portion plausibles pour les 302 recettes ; exemple vérifié à la main ; allergènes ; client Open Food Facts (réseau simulé : fiche produit, valeur typique, erreurs). |
| `tests/e2e.test.js` | **navigateur réel** (Playwright, ignoré s'il n'est pas installé : `npm i -D playwright`) : données d'un utilisateur existant conservées (plan, favoris, case cochée, article courant, portions, ancien identifiant redirigé), « Composer mes 7 repas » avec filtres, placard, niveau d'épices, budget, filtre de style, avis, aucune erreur console. |

État au 25/11/2026 : **69 tests passent, 0 échec**.

---

## 10. Points connus / limites

1. **Tajines** : `tajine-poulet-…` et `tajine-agneau-…` partagent encore la même photo (plats différents, exception validée dans les tests).
2. **Jambon cru** : des recettes intitulées « jambon cru » utilisent l'ingrédient « Jambon blanc supérieur » (à corriger recette par recette si besoin).
3. **Gingembre** : « 1 c. à soupe » est converti en 3 cm (≈ 5 g/cm) ; approximation.
4. **Budget estimé** : ordre de grandeur par rayon, pas un vrai prix.
5. **Classement saisons/styles** : automatique (mots-clés) ; quelques plats peuvent être mal rangés — corriger `seasons` / `styles` à la main dans `recipes.js` (les tests restent valables).
6. **Synchro** : « le dernier écrit gagne » (sauf avis) ; deux appareils non mis à jour ne comprennent pas les messages chiffrés.
7. **Open Food Facts** : base collaborative, parfois incomplète ; elle décrit des produits, pas des plats (les infos d'un plat sont donc calculées). Pas de clé API : si un service payant (Edamam, Spoonacular…) était ajouté un jour, la clé serait saisie dans les Réglages et stockée sur le téléphone, jamais dans le dépôt.
8. **Import de recette par lien (Jow, Marmiton…)** : impossible depuis un navigateur sans serveur intermédiaire (blocage CORS) ; le studio de recette maison accepte le copier-coller des ingrédients.

---

## 11. Check-list de vérification avant chaque mise en ligne

**Automatique**
- [ ] `npm test` : 0 échec (les « À VALIDER » restent en *todo*).
- [ ] `VERSION` de `sw.js` incrémentée.

**Manuel (iPhone, application installée)**
- [ ] Au lancement : plats choisis, favoris, cases cochées, articles courants, recettes maison, code foyer **toujours présents** (aucune perte).
- [ ] Planning : « 7 repas », Garder/Changer/✕, « Annuler », sauvegarde et ouverture d'un menu enregistré, portions −/+.
- [ ] Courses : rayons corrects, quantités plausibles, cocher/décocher, ajout d'un article courant, « Copier », 🗑️ + Annuler. Comparer avec les recettes du menu sur 2–3 repas.
- [ ] Repas gardé : ses ingrédients disparaissent des courses.
- [ ] Recettes : recherche (avec accents), chaque filtre, tri, « Afficher plus », fiche recette (photo, portions, ingrédients, étapes), ❤️.
- [ ] Mode cuisine : étapes, minuteur + alerte sonore, écran qui reste allumé.
- [ ] Studio recette maison : création, modification, suppression ; rayon détecté.
- [ ] Foyer : sur 2 téléphones, ajouter un repas / cocher un article → apparaît chez l'autre ; déconnexion/reconnexion ; lien magique (confirmation demandée).
- [ ] Hors-ligne (mode avion) : l'app s'ouvre, planning et courses utilisables.
- [ ] Réglages : Clair/Sombre/Système, carte « Mise à jour » (version affichée = `VERSION`), export JSON.
- [ ] Visuel : aucune différence involontaire (barres, fenêtres de recette sans scintillement, défilement).
- [ ] Nouvelles recettes : photo qui s'affiche, durée, ingrédients et étapes lisibles.
- [ ] « Composer mes 7 repas » : filtres saison/style/régime/frigo, compteur, résultat conforme.
- [ ] Placard : 🏠 sur un article, « Déjà à la maison », « Il m'en faut », niveau d'épices, ordre des rayons.
- [ ] Avis : 👍/👎/✅ sur une fiche ; synchro des avis entre les deux téléphones.
- [ ] Fiche recette : bloc nutrition et allergènes cohérents ; Courses : « Nutri-Score & allergènes » (réseau) ; scan d'un produit (saisie du code si pas de caméra).
- [ ] Foyer après mise à jour des **deux** téléphones (messages chiffrés).

---

## 12. Règles de travail (convenues avec le propriétaire)
- **Ne jamais modifier** les informations de l'utilisateur (plats choisis, connexion foyer, liste de courses, favoris, etc.) ni le **visuel validé**.
- **Demander avant** de modifier quelque chose d'important : plats existants, fonctionnement, structure des données.
- Proposer librement des idées d'évolution (§13).
- Chaque évolution : tests à jour, `VERSION` du service worker incrémentée, ce document mis à jour.

---

## 13. Idées d'évolution
**Réalisées le 25/11/2026** : nettoyage du catalogue ; placard (par article) ; stock de base optionnel ; niveau d'épices ; ordre des rayons ; étiquette et filtre « gamelle » ; budget estimé ; filtres (sans porc, sans lactose, 1 poêle, frigo) ; avis et historique ; chiffrement de la synchro ; tests de bout en bout. *(Planning avec jours : refusé par le propriétaire.)*

**Réalisées ensuite** : nutrition estimée et allergènes sur les fiches ; Nutri-Score Open Food Facts sur les courses ; scan de code-barres.

**Reste à étudier**
1. Fusion complète de la synchro (au-delà des avis) pour deux modifications simultanées.
2. Import d'une recette par lien (nécessite un petit serveur relais).
3. Vrais prix par article (saisie ou import d'un ticket).
4. Alertes : « sortir du congélateur », plat du soir à lancer.

---

## 14. Historique des évolutions

| Date | Évolution |
|---|---|
| 25/11/2026 | **Liste de courses simplifiée fiabilisée** : résultat indépendant de l'ordre des repas ; produits qui disparaissaient ou fusionnaient à tort corrigés (fromage ail & fines herbes, ravioli, thon au citron, épices à couscous, sauce/purée de tomates, côtes de porc, jambon cru, épinards surgelés, kit fajitas, oranges à jus, tomates « fraîches ou concassées », lentilles « vertes ou corail », bœuf émincé, citron en quartiers, laitue, yaourt en cuillères) ; cases cochées conservées ; suite de **33 tests** + instantané du regroupement. **+38 recettes Top Jow** (343 au total). SW v37. Ce document. |
| 25/11/2026 (2) | **Catalogue nettoyé** (41 doublons fusionnés, 3 recettes corrigées, types unifiés, photos distinctes) ; **saisons ×4, styles, gamelle** sur toutes les recettes ; **« Composer mes 7 repas »** (filtres, frigo, tirage proportionnel) ; **placard, épices, produits de base, ordre des rayons** ; **budget estimé** ; **avis & historique** ; **synchro chiffrée** ; `logic.js` ; 52 tests dont navigateur réel. SW v38. |
| 25/11/2026 (3) | **Nutrition** (kcal/macros/allergènes par portion), **Open Food Facts** (Nutri-Score sur les courses, scan de code-barres, sans clé API) ; `nutrition.js` ; 61 tests. SW v39. |
| 25/11/2026 (4) | **+40 recettes Top Jow sans poisson** (342 au total) ; **suggestions à la frappe** pour les produits courants ; **épices une par une** (remplace les niveaux) ; Nutri-Score centré ; **interface épurée** (budget en pied d'en-tête, produits courants compacts, filtres secondaires repliés, rayons sans sous-titre, allergènes sur la ligne de détail) ; nems, pilons, haricots verts surgelés reconnus. 65 tests. SW v40. |
| 25/11/2026 (5) | **Finir mes restes** (recettes déduites de ce qu'on a) ; allergènes retirés de la liste de courses ; « Budget » sur sa propre ligne ; **emojis décoratifs supprimés** (boutons, filtres, titres) et icône de placard remplacée par un petit pictogramme « colis » ; « Mes repas ». 69 tests. SW v41. |
| 25/11/2026 (6) | Titre évolutif **« Mes N repas »** ; onglet Recettes **au hasard** + bouton Mélanger ; **vignettes Jow légères** (3× moins lourdes). SW v42. |
| (avant) | Anti-scintillement des fenêtres de recette, carte « Mise à jour », pastille foyer, correctifs de fusion de produits (SW v31–v36). |
