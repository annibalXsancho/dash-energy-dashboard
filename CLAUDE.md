# Tableau de bord énergie

Outil de **conseil en énergie** : analyser un relevé de puissance (courbe de
charge, sous-comptage), en tirer un diagnostic — pointe, facteur de charge,
dépassements de puissance souscrite, répartition par compteur — puis un livrable
que le client garde.

Deux versions du même tableau de bord, mais **la page web est le produit** :

- `index.html` + `js/` : tout en JavaScript, servie telle quelle par GitHub Pages
  (https://annibalxsancho.github.io/dash-energy-dashboard/). C'est elle qu'on
  fait évoluer.
- `app.py` + `src/` : la version Dash d'origine, gardée comme atelier Python
  local. **Elle a divergé** (pas de modèle tarifaire, pas de désignation de
  colonnes) et ce n'est pas un défaut à corriger. Partage assumé : **Python en
  amont** (préparation, calculs lourds, génération du livrable), **page web en
  aval** (tout l'affichage).

## Confidentialité — la contrainte qui prime sur le reste

Le dépôt est **public**, et un site GitHub Pages l'est aussi **même publié depuis
un dépôt privé** (le contrôle d'accès n'existe qu'en offre Enterprise). Une
courbe de charge au pas 10 min expose les horaires de production, le taux
d'occupation et les arrêts machine d'un client.

- Les relevés réels vivent dans `missions/`, les documents produits dans
  `livrables/` — **les deux hors dépôt** (`.gitignore` + hook
  `.githooks/pre-commit`, à réarmer par `git config core.hooksPath .githooks`
  sur chaque machine).
- Ne jamais proposer de committer, publier ou héberger un fichier de données
  client. Le livrable se fabrique avec `scripts/build_export.py` : un HTML
  autonome, hors ligne, sans aucune requête réseau, qui s'envoie en pièce jointe.
- Une feuille Google **publiée sur le web est lisible par quiconque a le lien** :
  acceptable pour les données de l'utilisateur, jamais pour celles d'un client.

## Contraintes machine

- **Pas de Node/npm.** Aucun outil de build : les modules ES sont recousus à la
  main par `scripts/build_export.py` pour le livrable. Vérifier avant de
  proposer un bundler.
- `pip3` fonctionne (contrairement au projet Sancho Rossi). Python 3.14,
  Dash 4.4 / Plotly 7 / pandas 3 installés.
- Serveur local : `python3 -m http.server`, ou le double-clic sur
  `Ouvrir le tableau de bord.command`. Preview via **127.0.0.1**, pas localhost.
- Déploiement : `git push` (GitHub Pages, ~1 min de latence).

## Pièges résolus — ne pas y retomber

- **Puissance ≠ énergie.** L'outil attend des kW instantanés ; une colonne
  d'index ou de kWh fausse tout d'un facteur « durée du pas ». La détection de
  colonnes écarte explicitement `kWh`, `index`, `énergie`.
- **L'unité est le piège silencieux.** Un relevé de compteur est souvent en
  **watts** (`site A P [W]`, ou sans unité du tout dans un tableau
  divisionnaire). Lu en kW, il donne des chiffres mille fois trop grands et
  parfaitement cohérents entre eux. D'où le champ « unité » (W/kW/MW), deviné de
  l'intitulé puis, à défaut, de l'ordre de grandeur (> 5 000 → watts).
- **Compteur général + sous-compteurs = double comptage.** Un tableau
  divisionnaire est hiérarchique (vérifier l'additivité sur une ligne avant de
  conclure). La liste à cocher le signale ; ne jamais additionner les deux.
- **`?v=` obligatoire.** Servie par `http.server`, la page n'a aucun en-tête de
  cache : sans numéro de version sur chaque import, une correction reste
  invisible et on cherche un bug qui n'existe pas. Lancer
  `python3 scripts/bump_version.py` après toute modification de `js/` ou `css/`.
- **`[hidden]` ne masque pas un `display: flex`** — d'où la règle globale
  `[hidden] { display: none !important; }` dans `css/style.css`.
- **Carte de chaleur : l'écart entre cellules (`xgap`) doit disparaître au-delà
  de ~90 colonnes**, sinon il dépasse leur largeur et le dessin s'efface.
- **`localStorage` est cloisonné par site.** Un lien mémorisé sur `127.0.0.1`
  n'existe pas sur `github.io` : la page y repart des données de démonstration.
  Un signet complet se construit avec `?data=…&t=&p=&s=&u=&n=`.
- **`Date.parse` est trop permissif** : il lit « 45900.5 » comme l'an 45900. Le
  recours à l'analyseur du navigateur est filtré aux chaînes contenant `-`, `/`
  ou `:`.
- Côté Dash (version locale) : `dcc.Graph(responsive=True)` impose
  `height: 100 %` en style en ligne — la hauteur se pose sur le conteneur
  parent ; et les composants Dash 4 se thèment par variables `--Dash-*`.

## Méthode

- Vérifier dans le navigateur avant d'annoncer que ça marche, et le dire quand
  un test n'a pas pu être fait.
- Recalculer un indicateur indépendamment (pandas) avant d'affirmer qu'un
  chiffre est juste.
- Interface : thème sombre, palette catégorielle testée pour le daltonisme,
  attribuée dans un **ordre fixe** (filtrer ne repeint jamais les séries
  restantes). Jamais d'axe double. Le détail vit dans `js/theme.js`.

## Suites envisagées, non faites

Normaliseurs d'import (export Enedis, sous-comptage propriétaire) ; comparaison
avant/après corrigée des degrés-jours (la preuve d'économie qui justifie les
honoraires) ; diagnostic de compensation d'énergie réactive quand le CosPhi est
disponible ; annotations d'événements sur la courbe.
