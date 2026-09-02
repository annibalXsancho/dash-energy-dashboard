# Tableau de bord énergie

Un tableau de bord **interactif** pour des séries temporelles d'énergie :
puissance appelée, énergie consommée, monotone et profil de charge.

Il est pensé pour du **conseil en énergie** : analyser un relevé client en
local, puis en tirer un livrable que le client garde.

Le projet existe en **deux versions qui affichent exactement la même chose** —
mêmes indicateurs, mêmes graphiques, mêmes couleurs, mêmes calculs :

| | Où ça tourne | Pour quoi faire |
|---|---|---|
| **Page web** (`index.html`) | dans le navigateur, en JavaScript | avoir une **adresse web** consultable de partout, sans rien installer |
| **Application Dash** (`app.py`) | en local, en Python | travailler dans l'écosystème Python (pandas, scripts, gros volumes) |

---

## La page web

En ligne : **https://annibalxsancho.github.io/dash-energy-dashboard/**
*(à activer une fois : dépôt → Settings → Pages → Source « Deploy from a branch », branche `main`, dossier `/ (root)`).*

Une fois en ligne, la mettre à jour se résume à `git push`.

En local, il lui faut une adresse `http` — ouverte par double-clic (`file://`),
la page ne peut pas lire son fichier de données :

```bash
cd ~/Desktop/dash-energy-dashboard && python3 -m http.server 4180
```

puis **http://127.0.0.1:4180**.

**Pointer la page vers d'autres données**, sans toucher au code : ajouter
`?data=` suivi de l'adresse d'un CSV, par exemple
`…github.io/dash-energy-dashboard/?data=data/2027.csv`. Ou, plus simple encore,
le bouton **« Charger un CSV »** : le fichier est lu par le navigateur et **ne
quitte pas votre ordinateur**.

## L'application Dash

```bash
pip3 install -r requirements.txt
python3 app.py
```

puis **http://127.0.0.1:8050**. Options : `--data mon_fichier.csv`,
`--port 8060`, `--debug` (rechargement automatique).

Elle a besoin d'un serveur Python : c'est pour cela qu'elle ne peut pas vivre
sur GitHub Pages, qui ne sert que des fichiers. Pour la mettre en ligne malgré
tout, l'objet attendu par les hébergeurs est déjà exposé
(`gunicorn app:server`) — Render, Railway, Fly.io ou Hugging Face Spaces savent
la lancer depuis ce dépôt.

---

## Confidentialité — à lire avant la première mission

**Ce dépôt est public, et un site GitHub Pages l'est aussi, même publié depuis
un dépôt privé** (le contrôle d'accès sur Pages n'existe qu'en offre
Enterprise). Une courbe de charge au pas 10 min raconte les horaires de
production, le taux d'occupation et les arrêts machine d'un client : elle n'a
rien à faire ici.

Le montage est donc en trois étages étanches :

| Étage | Où | Quoi |
|---|---|---|
| L'outil | ce dépôt, GitHub Pages | le code et les données de démonstration, synthétiques |
| Les missions | `missions/`, hors dépôt | les relevés réels, sur disque chiffré |
| Le livrable | `livrables/`, hors dépôt | un `.html` autonome par mission, envoyé au client |

Deux garde-fous, à activer **une fois par machine** :

```bash
git config core.hooksPath .githooks
```

Le `.gitignore` exclut `missions/`, `livrables/` et tout fichier de données ; le
hook `pre-commit` refuse en plus tout CSV, XLSX ou livrable ajouté de force —
c'est celui qui sert à 23 h la veille d'un rendu. Il se contourne avec
`git commit --no-verify` : ne le faites pas.

## Le livrable client

```bash
python3 scripts/build_export.py missions/acme/2026-normalise.csv \
    --client "ACME — Usine Nord" --souscrite 1200 --abonnement 3500
```

Produit **un seul fichier HTML de ~3 Mo** dans `livrables/`, contenant la page,
ses styles, plotly et les données. Il s'ouvre par double-clic, fonctionne sans
réseau, n'envoie rien nulle part, et reste interactif : le client filtre ses
sites, change de période, zoome. C'est la pièce jointe qui remplace le PDF de
graphiques morts.

Options : `--titre`, `--out`, `--prix-hp`, `--prix-hc`, `--hc 22-6`,
`--penalite`. Les paramètres tarifaires sont gravés dans le document.

*(Le fichier n'a pas de dépendance externe — vérifié : aucune requête réseau au
chargement. Ouvrez-en un par double-clic avant le premier envoi client, c'est le
seul test que je n'ai pas pu faire à votre place.)*

## Tarif, puissance souscrite et dépassements

Le panneau **Paramètres tarifaires** (replié, sous les filtres) porte le modèle :
prix heures pleines / heures creuses et leur plage horaire, abonnement mensuel,
puissance souscrite, pénalité au kW. Les valeurs sont mémorisées dans le
navigateur.

Ce qu'il en sort :

- l'énergie affiche la **part en heures creuses** ;
- le coût est décomposé (énergie · abonnement · dépassements) ;
- une tuile **Dépassements** donne les heures passées au-dessus de la puissance
  souscrite et le dépassement maximal ;
- la **monotone de charge** trace la puissance souscrite et annonce le % du
  temps passé au-dessus ;
- tant que la puissance souscrite n'est pas renseignée, la tuile propose la
  **puissance à viser** : celle qui n'est dépassée que 1 % du temps.

Les pénalités sont un **ordre de grandeur** — la formule réelle du TURPE dépend
du contrat. Assez pour dire « votre puissance souscrite est mal calée », pas
pour refaire une facture.

---

## Vos données

Un seul fichier CSV, trois colonnes :

```csv
timestamp,site,power_kw
2026-06-01T00:00:00,Usine Nord,412.5
2026-06-01T00:15:00,Usine Nord,408.1
2026-06-01T00:00:00,Atelier Sud,73.6
```

| Colonne | Rôle |
|---|---|
| `timestamp` | date et heure de la mesure |
| `site` | nom du site, de l'atelier ou du compteur — c'est ce qui sépare les couleurs |
| `power_kw` | puissance moyenne sur le pas de temps, en kilowatts |

L'ordre des colonnes est libre et toute colonne supplémentaire est ignorée. Le
séparateur (`,`, `;` ou tabulation) est **deviné**, les dates françaises
(`31/08/2026 14:30`) et l'écriture française des nombres (`1 234,5`) sont
acceptées : **un export Excel francophone passe directement**.

Le pas de temps (15 min, 1 h…) est **déduit** de l'écart médian entre deux
mesures, et **l'énergie n'est jamais lue dans le fichier, elle est calculée** :
`énergie (kWh) = puissance (kW) × durée du pas (h)`.

Les deux versions acceptent le même fichier, avec les mêmes messages d'erreur.

---

## Ce que montre chaque bloc

| Bloc | Question à laquelle il répond |
|---|---|
| **Énergie consommée** | Combien ai-je consommé ? (et l'écart avec la période précédente de même durée) |
| **Puissance de pointe** | Quel est l'appel maximal, et quand ? C'est lui qui dimensionne l'abonnement. |
| **Puissance moyenne** | Le niveau d'appel habituel. |
| **Facteur de charge** | Moyenne ÷ pointe. Bas = quelques pointes brèves écrasent une consommation régulière : le gisement d'économies est là. |
| **Coût estimé** | Énergie × tarif (à ajuster au contrat). |
| **Courbe de puissance appelée** | La dynamique : cycles jour/nuit, arrêts, dérives. Une couleur par site. |
| **Énergie par période** | Le cumul, empilé par site : qui pèse combien. |
| **Monotone de charge** | Puissance atteinte ou dépassée en % du temps. Une marche haute à gauche = pointe brève et chère. |
| **Profil de charge** | Puissance moyenne par heure et par jour : les habitudes et les anomalies sautent aux yeux. |

Le repli **« Voir les données »** affiche les mêmes chiffres en tableau.

---

## Organisation du code

```
index.html                   la page web
css/style.css                son style
js/theme.js                  couleurs, gabarit des figures
js/format.js                 nombres et dates à la française
js/data.js                   lecture CSV, filtres, agrégation, indicateurs
js/figures.js                les quatre graphiques
js/app.js                    état, contrôles, rendu

app.py                       l'application Dash
src/theme.py  src/data.py  src/figures.py  src/components.py  src/callbacks.py
assets/style.css             le style de la version Dash

js/tariff.js                 prix, heures creuses, puissance souscrite, dépassements
vendor/                      plotly embarqué (voir vendor/LISEZ-MOI.md)
scripts/build_export.py      fabrique un livrable HTML autonome
scripts/generate_sample_data.py  regénère le jeu de démonstration
.githooks/pre-commit         refuse de committer des données client
missions/                    vos relevés réels — hors dépôt
livrables/                   les documents produits — hors dépôt
data/sample_energy.csv       jeu de démonstration (3 sites, 3 mois, pas de 15 min)
requirements.txt             les trois dépendances Python
```

Même découpage des deux côtés : **`data` calcule, `figures` dessine, le reste
dispose et relie.** Pour ajouter un graphique : une fonction dans `figures`, une
carte dans la page, un appel dans le rendu.

## Personnaliser

| Envie | Où (page web) | Où (Dash) |
|---|---|---|
| Tarif | le panneau **Paramètres tarifaires**, dans la page | `PRICE_EUR_PER_KWH` dans `src/data.py` (modèle simple) |
| Couleurs | `js/theme.js` **et** `css/style.css` | `src/theme.py` **et** `assets/style.css` |
| Granularités proposées | `GRANULARITIES` dans `js/data.js` | `src/data.py` |
| Période affichée au démarrage | `adopt()` dans `js/app.js` | `filter_bar()` dans `src/components.py` |

Les couleurs de séries suivent une palette testée pour le daltonisme, attribuée
dans un **ordre fixe** : un site garde sa couleur quand on filtre les autres.

---

## Limites assumées

- **Page web** : le navigateur télécharge tout le fichier de données. Confortable
  jusqu'à quelques dizaines de Mo (la démo pèse 1 Mo) ; au-delà, il faut
  pré-agréger le CSV ou passer à la version Dash.
- **Application Dash** : mono-utilisateur (les données importées vivent dans le
  processus), sans authentification, tout est recalculé à chaque filtre.
- Le tableau affiche au plus 500 lignes : c'est une vue de contrôle, pas un export.
- **Les deux versions ont divergé** : le modèle tarifaire (heures creuses,
  abonnement, dépassements) n'existe que dans la page web, qui est le produit.
  La version Dash garde un coût à tarif unique et sert d'atelier Python.
- Le livrable pèse ~3 Mo : c'est une pièce jointe ordinaire, mais pas un fichier
  à envoyer par messagerie instantanée à quelqu'un en 3G.
