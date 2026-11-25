# Gamelle & Panier — référence de l'application

> Document de base : **ce que fait l'application, comment elle le fait, et ce qu'il faut vérifier** avant chaque mise en ligne.
> À tenir à jour à chaque évolution (voir §12 « Règles de travail »). Dernière mise à jour : 25/11/2026 — service worker **v37**.

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
| Fichiers | `index.html` (structure + fenêtres), `app.js` (toute la logique), `recipes.js` (catalogue + rayons), `styles.css` + `tailwind.css` (CSS pré-compilé, pas de CDN), `sw.js` (service worker), `manifest.json`, icônes. |
| Données recettes | `window.DEFAULT_RECIPES` (343 recettes) et `window.GRAND_FRAIS_RAYONS` (6 rayons) dans `recipes.js`. |
| Stockage | `localStorage` (voir §6). Tout est validé/nettoyé à la lecture (`sanitize*`). |
| Synchro foyer | Service public **ntfy.sh** (un « topic » par code foyer). Voir §6. |
| Hors-ligne | `sw.js` : fichiers de l'app en cache (mise à jour discrète), pages réseau d'abord, photos mémorisées (250 max). |
| Mise à jour | Changer `VERSION` dans `sw.js` (actuellement `v37`) à **chaque** modification de `app.js`, `recipes.js`, `index.html` ou des CSS, sinon les téléphones gardent l'ancienne version. Une carte « Mise à jour » (Réglages) permet de vérifier/installer. |
| Tests | `npm test` (ou `node --test tests/`). Node ≥ 20, aucune dépendance. Voir §9. |

Navigation : 4 onglets en bas — **Planning**, **Courses**, **Recettes**, **Réglages** (id interne `tab-partager`). Le dernier onglet ouvert est mémorisé.

---

## 3. Fonctionnement écran par écran

### 3.1 Planning (« Mes repas au menu »)
- Liste ordonnée de repas (sans notion de jour, maximum 60). Chaque repas : photo, titre, durée, tag, badge « 💰 Pas cher ».
- **« ✨ 7 repas »** : génère/renouvelle le menu. Composition visée : végétarien, viande, poisson, volaille, viande, poisson, volaille (tirage aléatoire sans doublon). Les repas **gardés** sont conservés, seuls les autres sont renouvelés. Remet à zéro les cases cochées de la liste de courses.
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
- **Articles courants** : champ libre + pastilles 1 tap (Banane, Lait, Fruits, Kéfir, Yaourt, Pain de mie, Flocons d'avoine) ; supprimables un par un.
- **📋 Copier** : texte propre (WhatsApp / Notes) avec `[ ]` par article. **🗑️** : décocher tout (annulable).
- Bandeau 🔒 si des repas sont gardés.

### 3.3 Recettes (catalogue)
- 343 plats affichés par 24 (bouton « Afficher plus » + chargement automatique au défilement).
- **Recherche** insensible à la casse/accents/ponctuation (titre, description, ingrédients).
- **Filtres** : Tous · 💰 Pas cher · 🍁 Automne · ⚡ < 20 min · 🍗 Volaille · 🥩 Viande · 🐟 Poisson · 🌱 Végétarien · ❄️ Hiver · ❤️ Favoris · ⭐ Mes recettes.
- **Tri** : Recommandé / Moins cher d'abord / Plus rapide.
- **Fiche recette** : photo, durée, saison, tag, portions ajustables (propres à la fiche), ingrédients (quantités converties), étapes, bouton ❤️ (favori), « Ajouter au menu », « Cuisiner ». Recette maison : boutons modifier / supprimer.
- **Mode cuisine pas à pas** : une étape par écran, ingrédients de l'étape, **minuteur** (alerte sonore, un minuteur par étape), **écran maintenu allumé** (Wake Lock).

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
| Génération de menu | 7 repas selon les types `vege`, `viande`, `poisson`, `volaille` (voir §10 pour les types non reconnus). |
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
  "season": "toute_saison",            // automne | hiver | toutes | toute_saison (le filtre ne distingue que automne / hiver)
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
- **343 recettes** : 305 d'origine + **38 nouvelles « Top Jow »** (novembre 2026).
- Les 38 nouvelles : sélectionnées parmi les recettes les plus « likées » de Jow (≈ 70 000 à 190 000 likes), hors desserts/petits-déjeuners, **absentes** du catalogue d'origine (contrôle par photo + titre + ingrédients). Répartition : 18 végétariennes, 11 viande/porc, 5 poisson, 4 volaille ; 26 « pas cher » ; 16 en ≤ 20 min.
- Quantités recalculées pour 4 portions à partir des quantités par personne de Jow ; photos officielles Jow (`static.jow.fr`, 550×550).

### 5.3 Ajouter des recettes — marche à suivre
1. Vérifier l'absence de doublon (titre, photo, plat équivalent).
2. Ajouter l'objet dans `DEFAULT_RECIPES` (`recipes.js`) avec un `id` nouveau.
3. Utiliser des noms d'ingrédients clairs ; si un produit est nouveau ou ambigu, vérifier le résultat dans la liste de courses (§7.5).
4. Ajouter l'`id` dans `NEW_JOW_IDS` (tests) si c'est un lot à contrôler ; `npm test`.
5. Si l'instantané des ingrédients change : relire le diff, puis `UPDATE_SNAPSHOT=1 node --test tests/`.
6. **Incrémenter `VERSION` dans `sw.js`**.

---

## 6. Données, synchronisation, partage

### 6.1 Clés `localStorage` (ne jamais renommer sans migration)
`gamelle_plan`, `gamelle_portions`, `gamelle_locked_slots`, `gamelle_checked`, `gamelle_staples`, `gamelle_favorites`, `gamelle_saved_menus`, `gamelle_custom_recipes`, `gamelle_household_code`, `gamelle_last_sync`, `gamelle_device_id`, `gamelle_tab`, plus le thème.

### 6.2 Synchronisation « foyer »
- Chaque appareil publie son état complet (version 2 : portions, plan, repas gardés, articles courants, cases cochées, recettes maison, menus enregistrés, favoris) sur `https://ntfy.sh/gamelle_foyer_<CODE>`, **400 ms après** chaque modification, et écoute le flux en direct (SSE) + une lecture au démarrage.
- Règle : **le message le plus récent gagne** (horodatage) ; ses propres messages sont ignorés (`deviceId`). Aucun contenu reçu n'est exécuté : tout passe par `sanitize*`.
- Limites connues : tout le foyer partage le même topic public → le code doit rester secret ; si deux personnes modifient exactement en même temps, la dernière écriture écrase l'autre.

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
| `tests/recipes.test.js` | syntaxe des fichiers ; structure de chaque recette ; unicité id/titre ; lot « Top Jow » (présence, aucun doublon photo/titre, types reconnus, durées et quantités réalistes, étapes sans texte parasite, minuteurs cohérents) ; **cas précis de courses** des nouvelles recettes ; **instantané** `tests/fixtures/ingredient-mapping.json` (chaque nom d'ingrédient → article de courses : tout changement doit être voulu). |
| « À VALIDER » (marqués *todo*) | constats sur des recettes **existantes** non corrigées sans accord (voir §10) ; ils s'affichent sans faire échouer la suite. |

État au 25/11/2026 : **33 tests passent, 3 constats « À VALIDER »**.

---

## 10. Points connus à valider avec le propriétaire (non modifiés)

1. **Doublons probables dans les 305 recettes d'origine** : 40 groupes (85 recettes) partagent la même photo et sont quasi identiques (ex. plusieurs « gnocchis épinards gorgonzola », « croque-monsieur », « pad thaï crevettes », « quiche poireaux feta »…). Proposition : en garder une par groupe (ou assumer des variantes).
2. **Ingrédient en double dans une même recette** (la quantité est doublée dans les courses) :
   - `ramen-boeuf-nouilles-bouillon` : « Bœuf émincé » 600 g ×2 ;
   - `boeuf-mijjote-mexicaine-riz` : « Bœuf émincé » 600 g ×2 ;
   - `risotto-crevettes-chorizo-parmesan` : le riz est listé deux fois (la 2ᵉ ligne, rangée en boucherie, devrait être le **chorizo**).
3. **Types de recette non reconnus** : 34 recettes ont `type` = `poulet` (24), `boeuf` (6), `porc` (4) au lieu de `volaille` / `viande`. Conséquence : elles n'apparaissent pas dans les filtres 🍗 Volaille / 🥩 Viande et ne sont **jamais tirées** par « ✨ 7 repas ». (5 autres ont `vegetarien`, reconnu.) Correction simple : les rattacher à `volaille` / `viande`.
4. **Jambon cru** : des recettes intitulées « jambon cru » utilisent l'ingrédient « Jambon blanc supérieur » (la liste de courses affiche donc du jambon blanc).
5. **Saisons** : 230 recettes utilisent `toute_saison`, 7 `toute-saison`, 40 `toutes` — trois écritures pour la même chose (sans effet visible aujourd'hui, à unifier).
6. **Gingembre** : « 1 c. à soupe » est converti en 3 cm (≈ 5 g/cm) ; approximation acceptable, à affiner si besoin.
7. **Épinards** : frais et surgelés sont distincts depuis cette version (surgelés = ligne « Épinards surgelés » en épicerie).

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

---

## 12. Règles de travail (convenues avec le propriétaire)
- **Ne jamais modifier** les informations de l'utilisateur (plats choisis, connexion foyer, liste de courses, favoris, etc.) ni le **visuel validé**.
- **Demander avant** de modifier quelque chose d'important : plats existants, fonctionnement, structure des données.
- Proposer librement des idées d'évolution (§13).
- Chaque évolution : tests à jour, `VERSION` du service worker incrémentée, ce document mis à jour.

---

## 13. Idées d'évolution (à valider)
1. **Nettoyage du catalogue** : fusionner les ~40 doublons, corriger les 3 recettes à ingrédient doublé, unifier `type` et `season`.
2. **« Déjà à la maison » par article** (et non par repas entier) : cocher « j'ai déjà du riz » retire l'article des courses de la semaine ; mémoriser un « placard » (huile, épices, riz…).
3. **Stock de base automatique** : ne pas lister sel, poivre, huile d'olive, farine… sauf demande (option).
4. **Ordre de passage dans le magasin** : trier les rayons dans l'ordre réel du Grand Frais et mémoriser l'ordre.
5. **Gamelles** : repérer les plats qui se réchauffent bien / se mangent froids (étiquette « 🍱 Gamelle ») et filtre dédié.
6. **Budget estimé** par menu et par semaine.
7. **Planning avec jours** (optionnel) et rappel « sortir du congélateur ».
8. **Résolution de conflits de synchro** (fusion plutôt que « le dernier gagne ») et chiffrement du contenu du topic ntfy.
9. **Import de recettes par lien** (Jow, Marmiton…) vers le studio de recette maison.
10. **Filtres supplémentaires** : sans porc, sans lactose, « 1 seule poêle », par ingrédient du frigo (« j'ai du poulet et des courgettes »).
11. **Notes et historique** : « on a adoré / à refaire », éviter de reproposer un plat cuisiné récemment.
12. **Tests de bout en bout** dans un navigateur (Playwright) pour automatiser une partie de la check-list §11.

---

## 14. Historique des évolutions

| Date | Évolution |
|---|---|
| 25/11/2026 | **Liste de courses simplifiée fiabilisée** : résultat indépendant de l'ordre des repas ; produits qui disparaissaient ou fusionnaient à tort corrigés (fromage ail & fines herbes, ravioli, thon au citron, épices à couscous, sauce/purée de tomates, côtes de porc, jambon cru, épinards surgelés, kit fajitas, oranges à jus, tomates « fraîches ou concassées », lentilles « vertes ou corail », bœuf émincé, citron en quartiers, laitue, yaourt en cuillères) ; cases cochées conservées ; suite de **33 tests** + instantané du regroupement. **+38 recettes Top Jow** (343 au total). SW v37. Ce document. |
| (avant) | Anti-scintillement des fenêtres de recette, carte « Mise à jour », pastille foyer, correctifs de fusion de produits (SW v31–v36). |
