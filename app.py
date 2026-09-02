"""Tableau de bord énergie — point d'entrée.

Lancer :  python3 app.py            (puis ouvrir http://127.0.0.1:8050)
Options :  --data mon_fichier.csv --port 8060 --debug
"""

from __future__ import annotations

import argparse
from pathlib import Path
from types import SimpleNamespace

from dash import Dash

from src import callbacks, components, data, theme

theme.register()  # gabarit graphique appliqué à toutes les figures

# Le jeu de données courant vit ici, en mémoire. Un import de CSV le remplace.
# (Suffisant pour un usage local mono-utilisateur ; voir README pour un
# déploiement partagé.)
STORE = SimpleNamespace(dataset=None)


def create_app(csv_path: Path | str = data.DEFAULT_DATA) -> Dash:
    STORE.dataset = data.Dataset(data.read_csv(csv_path), Path(csv_path).name)
    app = Dash(
        __name__,
        title="Énergie & puissance",
        # Traduit les dates des axes en français (sans ce fichier, plotly.js
        # affiche « Aug 9 » au lieu de « 9 août »). Chargé depuis le CDN Plotly ;
        # hors ligne, les dates restent simplement en anglais.
        external_scripts=["https://cdn.plot.ly/plotly-locale-fr-latest.js"],
        update_title="Calcul…",
        meta_tags=[{"name": "viewport", "content": "width=device-width, initial-scale=1"}],
    )
    app.layout = components.layout(STORE.dataset)
    callbacks.register(app, STORE)
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=str(data.DEFAULT_DATA), help="CSV à charger au démarrage")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8050)
    parser.add_argument("--debug", action="store_true", help="rechargement auto + traces")
    args = parser.parse_args()

    # L'application est déjà construite au chargement du module (pour gunicorn) ;
    # on ne la reconstruit que si un autre fichier de données est demandé.
    application = app if args.data == str(data.DEFAULT_DATA) else create_app(args.data)
    application.run(host=args.host, port=args.port, debug=args.debug)


# Objet exposé aux serveurs de production (gunicorn app:server)
app = create_app()
server = app.server

if __name__ == "__main__":
    main()
