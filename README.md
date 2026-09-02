# Tableau de bord énergie — coquille MVP

Un tableau de bord web **interactif** pour des séries temporelles d'énergie :
puissance appelée, énergie consommée, profil de charge, monotone de charge.
Construit avec **Dash** (le framework web de Plotly) : tout est écrit en Python,
il n'y a aucun code JavaScript à maintenir.

C'est une **coquille** : la structure, le style et les mécaniques sont posés et
fonctionnent sur un jeu de démonstration ; il suffit de brancher vos propres
relevés pour qu'elle devienne votre outil.

---

## Démarrer en trois commandes

```bash
pip3 install -r requirements.txt
python3 app.py
```

puis ouvrir **http://127.0.0.1:8050** dans un navigateur.

Options utiles :

```bash
python3 app.py --data mes_releves.csv   # démarrer sur vos données
python3 app.py --port 8060              # autre port
python3 app.py --debug                  # rechargement auto pendant le développement
```

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
| `timestamp` | date et heure de la mesure (ISO 8601 de préférence) |
| `site` | nom du site, de l'atelier ou du compteur — c'est ce qui sépare les couleurs |
| `power_kw` | puissance moyenne sur le pas de temps, en kilowatts |

Toute colonne supplémentaire est ignorée, et l'ordre des colonnes est libre.
Le séparateur (`,`, `;` ou tabulation) est **deviné**, et l'écriture
française des nombres est acceptée (`1 234,5`) : un export Excel francophone
passe directement. Le pas de temps (15 min, 1 h…) est **déduit
automatiquement** de l'écart médian entre deux mesures.

**L'énergie n'est jamais lue dans le fichier, elle est calculée :**
`énergie (kWh) = puissance (kW) × durée du pas (h)`.

Deux façons de charger vos données : le bouton **« Charger un CSV »** dans
l'interface (import à chaud, sans redémarrer), ou l'option `--data` au lancement.
Le bouton **« Démo »** revient au jeu d'exemple.

---

## Ce que montre chaque bloc

| Bloc | Question à laquelle il répond |
|---|---|
| **Énergie consommée** | Combien ai-je consommé sur la période ? (et l'écart avec la période précédente de même durée) |
| **Puissance de pointe** | Quel est l'appel de puissance maximal, et quand ? C'est lui qui dimensionne l'abonnement. |
| **Puissance moyenne** | Le niveau d'appel habituel. |
| **Facteur de charge** | Moyenne ÷ pointe. Bas = quelques pointes brèves écrasent une consommation régulière : le gisement d'économies est là. |
| **Coût estimé** | Énergie × tarif (constante `PRICE_EUR_PER_KWH`, à ajuster au contrat). |
| **Courbe de puissance appelée** | La dynamique : cycles jour/nuit, arrêts, dérives. Une couleur par site. |
| **Énergie par période** | Le cumul, empilé par site : qui pèse combien. |
| **Monotone de charge** | Puissance atteinte ou dépassée en % du temps. Une marche très haute à gauche = pointe brève et chère. |
| **Profil de charge** | Puissance moyenne par heure (vertical) et par jour (horizontal) : les habitudes et les anomalies sautent aux yeux. |

Le repli **« Voir les données »** affiche les mêmes chiffres sous forme de
tableau — utile pour vérifier une valeur ou exporter à la main.

---

## Organisation du code

```
app.py                       point d'entrée : construit l'application et la lance
requirements.txt             versions figées des trois dépendances
assets/style.css             tout le style (Dash sert ce dossier automatiquement)
data/sample_energy.csv       jeu de démonstration (3 sites, 3 mois, pas de 15 min)
scripts/generate_sample_data.py  regénère ce jeu de démonstration
src/theme.py                 couleurs, typographie, gabarit Plotly commun
src/data.py                  lecture CSV, filtres, agrégation, indicateurs
src/figures.py               les quatre graphiques (aucun accès aux fichiers)
src/components.py            la mise en page (HTML décrit en Python)
src/callbacks.py             l'interactivité : « quand ceci change, recalcule cela »
```

Le découpage suit une règle simple : **`data.py` calcule, `figures.py` dessine,
`components.py` dispose, `callbacks.py` relie.** Pour ajouter un graphique :
une fonction dans `figures.py`, une carte dans `components.py`, une sortie dans
`callbacks.py`. Rien d'autre à toucher.

---

## Personnaliser

| Envie | Où |
|---|---|
| Changer le tarif du coût estimé | `PRICE_EUR_PER_KWH` dans `src/data.py` |
| Changer les couleurs | `src/theme.py` **et** les variables en haut de `assets/style.css` |
| Ajouter une granularité (ex. 15 min, mois) | `GRANULARITIES` dans `src/data.py` |
| Ajouter un indicateur | `data.kpis()` puis `components.kpi_tiles()` |
| Changer la période affichée au démarrage | `start_date` dans `components.filter_bar()` |

Les couleurs des séries suivent une palette testée pour le daltonisme, attribuée
dans un **ordre fixe** : un site garde sa couleur quand on filtre les autres.

---

## Mettre en ligne

Ce tableau de bord **exécute du Python à chaque interaction** : il lui faut un
serveur. GitHub Pages, qui ne sert que des fichiers statiques, ne peut donc pas
l'héberger — le dépôt GitHub sert à conserver et partager le **code**.

Pour une mise en ligne, l'application expose déjà l'objet attendu par les
serveurs de production (`server` dans `app.py`) :

```bash
pip3 install gunicorn
gunicorn app:server --bind 0.0.0.0:8050
```

Hébergeurs gratuits ou peu coûteux qui savent lancer cette commande depuis un
dépôt GitHub : Render, Railway, Fly.io, Hugging Face Spaces, PythonAnywhere.

---

## Limites assumées (c'est un MVP)

- **Mono-utilisateur.** Le jeu de données vit en mémoire dans le processus :
  deux personnes connectées en même temps partageraient le même import CSV.
  Pour un usage partagé, passer par un `dcc.Store` par session ou une base.
- **Pas d'authentification.** À n'exposer sur Internet qu'avec une protection
  devant (mot de passe d'hébergeur, réseau privé).
- **Tout est recalculé à chaque filtre.** Confortable jusqu'à quelques centaines
  de milliers de lignes ; au-delà, prévoir un cache (`flask-caching`) ou un
  pré-calcul.
- **Le tableau affiche au plus 500 lignes** (constante `TABLE_ROW_CAP`) : c'est
  une vue de contrôle, pas un export.
