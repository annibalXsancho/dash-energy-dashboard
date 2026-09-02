# Tableau de bord énergie

Un tableau de bord **interactif** pour des séries temporelles d'énergie :
puissance appelée, énergie consommée, monotone et profil de charge.

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

data/sample_energy.csv       jeu de démonstration (3 sites, 3 mois, pas de 15 min)
scripts/generate_sample_data.py  le regénère
requirements.txt             les trois dépendances Python
```

Même découpage des deux côtés : **`data` calcule, `figures` dessine, le reste
dispose et relie.** Pour ajouter un graphique : une fonction dans `figures`, une
carte dans la page, un appel dans le rendu.

## Personnaliser

| Envie | Où (page web) | Où (Dash) |
|---|---|---|
| Tarif du coût estimé | `PRICE_EUR_PER_KWH` dans `js/data.js` | `src/data.py` |
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
- Le coût est une **estimation** à tarif unique — ni abonnement, ni heures
  creuses, ni dépassement de puissance souscrite.
