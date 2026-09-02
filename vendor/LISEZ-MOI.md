# Bibliothèques embarquées

`plotly-cartesian-4.0.0.min.js` — le lot « cartesian » de plotly.js (1,5 Mo au
lieu de 4,3 Mo pour le lot complet) : il contient exactement les types de
graphiques utilisés ici (lignes, barres, carte de chaleur).
`plotly-locale-fr.js` — dates en français, virgule décimale, espace fine.

Elles sont **copiées dans le dépôt** plutôt qu'appelées sur un CDN pour trois
raisons : la page marche hors ligne, le livrable client fonctionne chez un
client dont l'informatique bloque les domaines externes, et la version ne peut
pas changer sous nos pieds.

Mise à jour (rare, et à vérifier ensuite dans le navigateur) :
    curl -o vendor/plotly-cartesian-4.0.0.min.js https://cdn.plot.ly/plotly-cartesian-4.0.0.min.js
