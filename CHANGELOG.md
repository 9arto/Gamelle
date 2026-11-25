# Historique des évolutions (CHANGELOG)

Gamelle & Panier — ce qui a changé, du plus récent au plus ancien. Détails de fonctionnement : `APPLICATION.md`.

## 25/11/2026 — v53 : retrait du mode courses
- Titre « Liste de courses » (au lieu de « Courses à Grand Frais ») ; **mode courses supprimé** (on défilait plus pour voir les ingrédients). Gestes, rayons repliables et menu « … » conservés.

## 25/11/2026 — v52 : fiabilité, courses en magasin, contenu
- **Sauvegarde et restauration** : export/import d'un fichier validé ; « Récupérer depuis l'autre téléphone » ; un téléphone neuf demande l'état du foyer au lieu de l'écraser.
- **Synchro lisible** : « dernière synchro il y a 2 h », bandeau hors connexion, bandeau persistant de mise à jour.
- **Codes foyer forts** : les codes faibles sont refusés ; bouton « Changer de code » (l'autre téléphone suit seul).
- **CSP** : scripts du site uniquement (`theme.js` remplace le script en ligne), connexions limitées à ntfy, Open Food Facts, Open-Meteo.
- **Courses en magasin** : « Mode courses » (gros texte, grosses cases, rayons repliables, « Terminé »), glisser pour cocher / « j'ai déjà », produits courants avec quantité (« Lait ×3 ») et « vos habituels », menu « … ».
- **Une action principale par écran** : « 7 repas » (Planning) et « Mode courses » (Courses), le reste dans « … » (`docs/hierarchie-avant-apres.png`).
- **Icônes filaires** (onglets, rayons), photos des 3 premières cartes prioritaires, accessibilité (texte ≥ 12 px, contrastes, libellés `aria-label`).
- **Prix réels** : total du ticket de caisse saisi → budget estimé ajusté à vos prix. **Stock dégressif** : quantités du placard décrémentées à « Cuisiné ».
- **Contenu** : classement « gamelle » supprimé ; 39 recettes dont les saisons étaient douteuses corrigées (`CLASSEMENT_A_VERIFIER.md`) ; formats d'achat (pot de crème 20 cl, brique de lait, boîte de coco, beurre) ; 18 photos Pexels/TheMealDB remplacées par les photos Jow correspondantes.
- **Technique** : `app.js` découpé (`groceries.js`, `sync.js`) ; test qui détecte toute classe CSS manquante (le CSS est pré-compilé). 84 tests.
- **Non fait** : calories officielles Ciqual (la base Anses est injoignable depuis l'environnement de développement ; les valeurs restent des estimations) ; lecture automatique du ticket de caisse (OCR) ; reste ~36 photos Pexels/TheMealDB sans équivalent Jow certain ; `recipes.js` non découpé (≈ 180 Ko compressé, le chargement différé n'apporterait rien).

## 25/11/2026 — v44 : météo et notifications
- **Météo invisible** : Open-Meteo (gratuit, sans clé) oriente le tirage des « 7 repas » (froid/pluie → plats réconfortants ; chaud → plats frais). Aucun affichage, position arrondie gardée sur le téléphone, jamais redemandée si refusée.
- **Notifications du foyer** via ntfy.sh (sujet secret dérivé du code, sans clé) : « Julie a ajouté Lait, Avoine dans la liste de courses », regroupées, désactivables, prénom facultatif.

## 25/11/2026 — v43 : +50 recettes et audit de cohérence
- **+50 recettes Top Jow** (392 au total), sans poisson ni fruit de mer, sans redondance avec le catalogue (photo, titre, ingrédients principaux comparés). Poulet/dinde (9), bœuf (9), porc/saucisse (11), végétariennes (21).
- **Contrôle des ingrédients et quantités** : comparaison avec les données Jow (chaque ingrédient retrouvé, quantités par personne × 4), plausibilité par catégorie, ingrédients cités dans les étapes.
- **Audit de tout le catalogue** : 21 titres de recettes d'origine qui annonçaient des ingrédients absents ont été alignés sur la vraie liste d'ingrédients :

  - `aubergines-gratinees-tomate-mozzarella` : « Aubergines Rôties Façon Parmigiana à la Sauce Tomate & Mozzarella » → « Aubergines gratinées, feta & grenade »
  - `boeuf-bourguignon-mijjote-carottes-champignons` : « Bœuf Bourguignon Mijoté aux Petits Oignons, Carottes & Champignons » → « Bœuf bourguignon, carottes & lardons »
  - `boeuf-mijjote-mexicaine-riz` : « Mijoté de Bœuf à la Mexicaine aux Poivrons, Maïs & Riz Épicé » → « Bœuf à la mexicaine, haricots rouges & tomates »
  - `brochettes-poulet-coco-coriandre` : « Brochettes Exotiques de Poulet Mariné au Lait de Coco & Coriandre » → « Brochettes de poulet, coriandre & citron vert, riz »
  - `croque-monsieur-four-bechamel` : « Croque-Monsieur Doré au Four, Béchamel Maison & Comté AOP » → « Croque-monsieur au four, béchamel maison »
  - `curry-aubergines-lait-coco-pois-chiches` : « Curry Onctueux d'Aubergines Fondantes au Lait de Coco & Riz Blanc » → « Curry d'aubergines & lentilles au lait de coco »
  - `curry-lentilles-patates-douces-coco` : « Curry Fondant de Lentilles Corail & Patates Douces au Lait de Coco » → « Lentilles corail & patates douces au lait de coco »
  - `curry-lentilles-poivrons-riz` : « Dahl Parfumé de Lentilles aux Poivrons Rouges, Épices Douces & Riz » → « Curry de lentilles & poivrons au lait de coco »
  - `curry-poisson-blanc-legumes-riz` : « Curry Onctueux de Poisson Blanc, Courgettes Fondantes & Riz Blanc » → « Curry de poisson blanc, tomates & riz »
  - `gratin-gnocchi-poulet-pesto-rosso-mozza` : « Gratin de Gnocchi au Poulet Doré, Pesto Rosso & Mozzarella » → « Gratin de gnocchi au poulet & pesto rosso »
  - `magret-canard-orange-glace` : « Aiguillettes de Canard Laquées à l'Orange & Riz Basmati » → « Magret de canard à l'orange & salade »
  - `pates-a-la-sicilienne-aubergines` : « Penne à la Sicilienne : Aubergines Rissolées, Sauce Tomate & Mozzarella » → « Pâtes à la sicilienne : thon, câpres & tomates »
  - `pates-cremeuses-avocat-citron` : « Spaghetti Crémeuses à la Purée d'Avocat Mûr, Citron & Basilic » → « Spaghetti crémeuses à l'avocat & basilic »
  - `poulet-basquaise-poivrons-riz` : « Poulet Basquaise aux Poivrons Fondants, Tomates & Riz Blanc » → « Poulet basquaise, poivrons & tomates »
  - `poulet-clementine-moutarde-miel` : « Mijoté de Poulet Doré au Jus de Clémentine, Miel & Moutarde » → « Poulet à la clémentine & à la moutarde »
  - `poulet-roti-harissa-epices` : « Cuisses de Poulet Rôties à la Harissa Douce & Duo de Pommes de Terre » → « Poulet rôti à la harissa & poivrons »
  - `quenelles-gratinees-salade-verte` : « Quenelles Dorées au Four Sauce Tomate Crémée & Salade Verte » → « Quenelles gratinées & salade verte »
  - `risotto-express-pesto-burrata` : « Risotto Crémeux au Pesto Verde Génois & Cœur de Burrata Crémeuse » → « Risotto au pesto & noix de cajou »
  - `salade-courgettes-poelees-jambon-cru` : « Salade Tiède de Courgettes Poêlées, Chiffonnade de Jambon Cru & Mozza » → « Salade tiède de courgettes poêlées & jambon cru »
  - `soupe-a-l-oignon-gratinee` : « Soupe Traditionnelle à l'Oignon Gratinée au Four, Croûtons & Comté » → « Soupe à l'oignon gratinée & croûtons »
  - `tajine-vege-legumes-semoule` : « Tajine Végétarien Parfumé aux Carottes, Courgettes & Pois Chiches » → « Tajine végétal, olives & semoule aux épices »
- Ingrédients erronés corrigés : Pad Thaï (nouilles de riz, beurre de cacahuète), Gnocchi all'arrabbiata (chorizo), Soupe de nouilles au curry (nouilles de riz), Bouillon coco-crevettes (nouilles de riz), Boulettes de poulet thaï (vermicelles de riz), Fajitas au bœuf (bœuf émincé), Salade courgettes-jambon cru (jambon cru), Poulet pané mayo-wasabi (600 g de poulet au lieu de 1,8 kg).
- Nouveaux fichiers : `CATALOGUE.md` (généré), `CHANGELOG.md`, `tests/coherence.test.js`, `tools/gen-catalogue.js`.
- Reconnaissance de nouveaux produits dans les courses : aiguillettes / steaks de bœuf, bœuf à sauter, chair à saucisse, boissons végétales, haricots verts en conserve.

## 25/11/2026 — v42 : Mes N repas, recettes au hasard, vignettes légères
- Titre évolutif « Mes 3 repas ». Onglet Recettes au hasard + bouton « Mélanger ». Vignettes Jow 304 px (3× plus légères).

## 25/11/2026 — v41 : Finir mes restes, interface épurée
- **Finir mes restes** : recettes classées selon ce qu'on a à la maison (placard et épices pris en compte).
- Allergènes uniquement sur les plats (plus dans la liste de courses). « Budget » sur sa propre ligne. Emojis décoratifs supprimés, icône de placard remplacée. Fenêtre de restes qui défile (classe de style manquante).

## 25/11/2026 — v40 : +40 recettes sans poisson, suggestions, épices une par une
- +40 recettes Top Jow sans poisson (342). Suggestions à la frappe pour les produits courants. Épices une par une (remplace les niveaux). Nutri-Score centré. Interface épurée (filtres secondaires repliés, produits courants compacts).

## 25/11/2026 — v39 : nutrition et Open Food Facts
- Calories, macros et allergènes par portion sur les fiches. Nutri-Score Open Food Facts sur les courses. Scan de code-barres. Sans clé API.

## 25/11/2026 — v38 : catalogue nettoyé, 7 repas filtrés, placard
- 41 doublons fusionnés (anciens identifiants redirigés), 3 recettes corrigées, types unifiés. Saisons (4), styles, étiquette gamelle. « Composer mes 7 repas » (filtres, frigo, tirage proportionnel). Placard, épices, produits de base, ordre des rayons, budget estimé. Avis et historique. Synchro foyer chiffrée. `logic.js`. Tests en navigateur.

## 25/11/2026 — v37 : courses fiabilisées, 38 recettes
- Liste de courses indépendante de l'ordre des repas ; produits fusionnés à tort corrigés (fromage ail & fines herbes, ravioli, thon au citron, épices à couscous, sauces tomate…). +38 recettes Top Jow. Suite de tests. `APPLICATION.md`.

## Avant le 25/11/2026 (v31 à v36)
- Anti-scintillement des fenêtres de recette, carte « Mise à jour », pastille foyer, correctifs de fusion de produits dans les courses.

