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

## La page web — trois façons d'y accéder

**1. En ligne, depuis n'importe quel appareil**

**https://annibalxsancho.github.io/dash-energy-dashboard/**

À activer une fois : dépôt → Settings → Pages → Source « Deploy from a branch »,
branche `main`, dossier `/ (root)`. Ensuite, `git push` met la page à jour.
C'est l'adresse à mettre en favori.

**2. Sur ce Mac, sans rien taper**

Double-cliquez **`Ouvrir le tableau de bord.command`** dans le Finder : une
fenêtre de Terminal s'ouvre, le navigateur affiche le tableau de bord. Fermez
la fenêtre pour tout arrêter — le serveur meurt avec elle.

C'est la voie à privilégier pour travailler sur des données client : rien ne
transite par Internet. *(Si macOS refuse de l'ouvrir après un téléchargement du
dépôt en ZIP : clic droit sur le fichier → Ouvrir → Ouvrir.)*

Pourquoi un serveur plutôt qu'un simple double-clic sur `index.html` ? Une page
ouverte en `file://` n'a pas le droit de lire les fichiers voisins, dont le CSV.
Le serveur n'écoute que cet ordinateur (127.0.0.1) et ne sert que ce dossier.

L'équivalent au clavier, si vous préférez :

```bash
cd ~/Desktop/dash-energy-dashboard && python3 -m http.server 4180
```

puis **http://127.0.0.1:4180**.

**3. Sans aucun serveur : un fichier autonome**

`scripts/build_export.py` (voir plus bas) fabrique un `.html` qui contient tout,
données comprises. Celui-là s'ouvre bel et bien par double-clic, hors ligne, et
s'archive ou s'envoie tel quel. C'est la forme du livrable client — et c'est
aussi la bonne façon de figer une analyse pour vous-même.

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

`--meteo "Roubaix"` ajoute le volet climatique : les températures de la commune
sur la durée du relevé sont téléchargées **à la fabrication**, sur votre
machine, et écrites dans le fichier. Le document envoyé au client refait les
degrés-jours tout seul, hors ligne, sans jamais rappeler personne.
(`--base-dju 18`, `--sens auto|chauffage|froid` pour forcer le calcul.)

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

## Météo : degrés-jours et correction climatique

Le panneau **Météo et rigueur climatique** demande une chose : la commune du
site. Le reste suit — températures, degrés-jours, thermosensibilité, et la seule
question qui compte en fin de mission : *« la baisse de consommation, c'est mon
action ou c'est l'hiver ? »*

**Ce qui en sort**

- une tuile **Rigueur climatique** : les degrés-jours de la période, et ceux de
  la période précédente pour comparer ;
- une tuile **Écart corrigé du climat** : l'écart de consommation une fois les
  deux périodes ramenées au même temps qu'il fait. Un « brut −15 % » qui devient
  « corrigé −2 % » n'était qu'un hiver doux ; l'inverse est une économie que la
  facture cachait ;
- une **signature énergétique** : un point par semaine, degrés-jours en
  abscisse, énergie en ordonnée. La pente est la **thermosensibilité** du site
  (kWh par degré-jour), l'ordonnée à l'origine son **talon** — ce qu'il consomme
  quand le climat ne demande rien ;
- **Observé et attendu** : la consommation de chaque jour face à celle que le
  climat laissait prévoir. Ce qui dépasse le trait ne s'explique pas par le
  temps — c'est là qu'on va chercher.

**Les partis pris**

- Les degrés-jours suivent la **méthode Costic**, celle de Météo-France :
  min/max de la journée et pondération, pas un simple écart à la moyenne.
- La droite s'ajuste **par semaine** dès qu'il y a six semaines complètes. Au
  pas journalier, le rythme hebdomadaire pèse plus lourd que la température :
  sur un relevé de test dont on connaissait la réponse (talon 8 000 kWh/j,
  350 kWh par DJU, week-ends au ralenti), l'ajustement journalier rendait R² =
  0,14 et une pente de 249 ; l'hebdomadaire rend R² = 0,96 et 311, soit la
  thermosensibilité réelle du relevé week-ends compris.
- **Quand la droite ne tient pas debout, rien ne s'affiche.** Pente négative ou
  R² sous 0,3 : la carte « observé / attendu » disparaît, aucune correction
  n'est calculée, et le nuage dit en toutes lettres que le site ne réagit pas au
  temps qu'il fait. C'est le cas d'un procédé industriel — et c'est un résultat
  de diagnostic, pas une panne.
- Les journées de relevé incomplètes sont écartées du croisement : le premier et
  le dernier jour d'un export ne portent souvent que quelques heures, et leur
  énergie tronquée simulerait une économie.

**Ce qui circule.** Les températures viennent d'`open-meteo.com` (service
public, sans clé ni compte). Ce qui part : la commune choisie et les dates du
relevé. Ce qui ne part pas : **aucune mesure, aucun nom de site, aucun nom de
fichier.** Les températures sont ensuite mémorisées dans le navigateur — seuls
les jours manquants sont redemandés — et le livrable les emporte avec lui.

---

## Vos données

### Ce qu'il faut, au fond

Trois informations par mesure : **quand**, **où**, **combien de kW**. Le reste
est de la tuyauterie que la page prend en charge.

```csv
timestamp,site,power_kw
2026-06-01T00:00:00,Usine Nord,412.5
2026-06-01T00:15:00,Usine Nord,408.1
2026-06-01T00:00:00,Atelier Sud,73.6
```

| Colonne | Rôle |
|---|---|
| `timestamp` | date et heure de la mesure |
| `site` | site, atelier ou compteur — c'est ce qui sépare les couleurs |
| `power_kw` | puissance moyenne sur le pas de temps, en kilowatts |

Le pas de temps (15 min, 1 h…) est **déduit** de l'écart médian entre deux
mesures, et **l'énergie n'est jamais lue dans le fichier, elle est calculée** :
`énergie (kWh) = puissance (kW) × durée du pas (h)`. C'est pourquoi une colonne
d'index kWh ne convient pas : il faut une **puissance**.

### Formats acceptés

- **CSV / TSV** : séparateur (`,` `;` tabulation) deviné, dates françaises
  (`31/08/2026 14:30`) ou ISO, nombres à la française (`1 234,5`).
- **Excel** (`.xlsx`, `.xls`) : lu directement, **première feuille du classeur**.
  La bibliothèque de lecture (1 Mo) n'est chargée qu'à ce moment-là, et n'entre
  jamais dans un livrable client.
- **Google Sheets** : voir ci-dessous.

### Un fichier avec plusieurs compteurs en colonnes

C'est la forme habituelle d'un export de sous-comptage : une ligne par heure,
**une colonne par compteur**.

```
[Date & Heure]    Site   FM Normale   FM Preferenziale   GENERALE CABINA   …
01/01/2025 00:00  Ova        26 345             17 541            84 701   …
```

Chargez-le tel quel : la page repère les colonnes numériques et les propose
**toutes cochées** dans une liste. Chaque colonne retenue devient une série —
une couleur, une courbe, une part dans l'énergie empilée. Décochez ce qui n'est
pas un compteur.

> **Attention aux totaux.** Un tableau divisionnaire contient presque toujours
> un compteur général *et* ses sous-compteurs. Les cocher ensemble compte la
> consommation deux fois. Vérifiez l'additivité sur une ligne avant de choisir :
> si `GENERALE = A + B + C`, cochez soit le général, soit les trois autres.

Quand la colonne de site ne prend qu'une valeur (« Ova »), elle n'est pas
répétée devant chaque nom de compteur ; si plusieurs sites coexistent, les
séries s'appellent `site · compteur`.

**L'unité sans intitulé.** Ces colonnes portent des noms de compteurs, jamais
une unité. La page la déduit alors de l'ordre de grandeur — au-delà de 5 000,
ce sont des watts, pas des kilowatts — et affiche sur quoi elle s'est fondée.
Vérifiez ce champ : c'est le seul endroit où une erreur passe inaperçue en
restant cohérente.

### Quand les intitulés ne sont pas les bons

C'est le cas normal avec un fichier client. La page ne refuse pas le fichier :
elle affiche un **aperçu des premières lignes** et vous fait désigner les trois
colonnes dans des listes déroulantes. Les propositions sont déjà remplies —
elle repère les colonnes de dates, évite les colonnes d'**énergie** (`kWh`,
`index`) quand elle cherche une puissance, et reconnaît une colonne de site à
son faible nombre de valeurs distinctes.

**L'unité compte autant que la colonne.** Un relevé de compteur est souvent en
**watts** (`site A P [W]`) : pris pour des kilowatts, il afficherait des
puissances mille fois trop grandes sans que rien ne le signale. Le formulaire
propose donc une unité (W / kW / MW), devinée d'après l'intitulé, et la
conversion se fait à la lecture.

Trois détails qui font gagner du temps :

- si le fichier ne contient **qu'un seul compteur** et aucune colonne de site,
  choisissez « aucune — un seul site » et donnez-lui un nom ;
- la désignation est **mémorisée par forme d'en-tête** : le même export, le mois
  suivant, se charge sans rien redemander ;
- le nom du site est déduit de l'intitulé de la puissance (`site A P [W]` →
  `site A P`), modifiable avant validation.

Le bouton **« CSV normalisé »** enregistre les données affichées aux trois
colonnes canoniques. C'est ce fichier-là qu'on range dans `missions/` et qu'on
donne à `build_export.py` (qui refuse tout fichier non normalisé, pour qu'un
client n'ouvre jamais un formulaire de désignation de colonnes).

### Brancher un Google Sheets

Bouton **« Lien… »**, coller l'adresse, **Charger**. L'adresse est mémorisée :
à chaque ouverture de la page, les données sont **relues à la source** — c'est
la « connexion » au sens courant du terme. Le bouton **Démo** l'oublie.

*(Vérifié sur une vraie feuille publiée : Google répond avec l'en-tête
`access-control-allow-origin: *`, la lecture directe fonctionne.)*

Pour qu'une feuille soit lisible par une page web, elle doit être **publiée** :
dans Google Sheets, `Fichier → Partager → Publier sur le web → CSV`. Une adresse
d'édition ordinaire (`.../edit#gid=0`) est tentée en `export?format=csv`, mais
Google la refuse le plus souvent — le message vous renvoie alors vers la
publication.

> **Une feuille publiée est lisible par quiconque connaît le lien.** Pour vos
> propres relevés, c'est commode. Pour ceux d'un client, **jamais** : téléchargez
> le fichier et chargez-le localement, ou travaillez depuis le lanceur hors ligne.

### Un signet qui ouvre directement les bonnes données

`?data=<url>` charge une source sans la mémoriser. Pour qu'un signet fonctionne
**du premier coup sur n'importe quel navigateur**, on peut y joindre la
désignation des colonnes :

| Paramètre | Rôle |
|---|---|
| `data` | adresse du CSV (feuille publiée, fichier en ligne…) |
| `t` | numéro de la colonne date/heure (0 = la première) |
| `p` | colonne(s) de puissance — plusieurs se séparent par des virgules : `p=2,3,6` |
| `s` | numéro de la colonne de site, ou `-1` s'il n'y en a pas |
| `u` | unité : `W`, `kW` ou `MW` |
| `n` | nom du site quand `s=-1` |

Exemple :
`…/?data=https://…/pub%3Foutput%3Dcsv&t=0&p=6&s=-1&u=W&n=site%20A`

Sans `p`, la page retombe sur la détection automatique et le formulaire.
Rappel : l'adresse contient le lien de la feuille — un signet de ce genre ne se
partage pas avec des données client.

Les deux versions du tableau de bord acceptent le même fichier ; en revanche la
désignation de colonnes, l'Excel et les liens n'existent que dans la page web.

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
| **Rigueur climatique** | Combien de degrés-jours la période a-t-elle demandés ? Le contexte sans lequel deux mois ne se comparent pas. |
| **Écart corrigé du climat** | À temps identique, ai-je vraiment consommé moins ? La preuve d'économie, une fois la météo neutralisée. |
| **Signature énergétique** | De combien la consommation monte-t-elle par degré-jour, et sur quel talon ? Le chauffage face au reste. |
| **Observé et attendu** | Quels jours ont consommé plus que le temps ne l'expliquait ? |

Le repli **« Voir les données »** affiche les mêmes chiffres en tableau.

---

## Organisation du code

```
index.html                   la page web
css/style.css                son style
js/theme.js                  couleurs, gabarit des figures
js/format.js                 nombres et dates à la française
js/data.js                   lecture CSV, filtres, agrégation, indicateurs
js/figures.js                les six graphiques
js/app.js                    état, contrôles, rendu

app.py                       l'application Dash
src/theme.py  src/data.py  src/figures.py  src/components.py  src/callbacks.py
assets/style.css             le style de la version Dash

Ouvrir le tableau de bord.command   lanceur : double-clic depuis le Finder
js/tariff.js                 prix, heures creuses, puissance souscrite, dépassements
js/weather.js                degrés-jours, signature énergétique, correction climatique
vendor/                      plotly + lecteur Excel embarqués (voir vendor/LISEZ-MOI.md)
scripts/build_export.py      fabrique un livrable HTML autonome
scripts/bump_version.py      incrémente le ?v= des CSS/JS (à lancer après toute modification)
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

Après toute modification de `js/` ou `css/`, lancez
`python3 scripts/bump_version.py` : servie en local, la page garde sinon ses
anciens modules en cache et vos changements restent invisibles.

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
