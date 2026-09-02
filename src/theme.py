"""Jetons graphiques et gabarit Plotly.

Une seule source de vérité pour les couleurs : ce fichier. Le CSS
(`assets/style.css`) reprend les mêmes valeurs sous forme de variables CSS.
Pour changer l'apparence du tableau de bord, il suffit de modifier ici.

La palette est celle, validée pour le daltonisme, du guide de dataviz :
huit teintes attribuées dans un ORDRE FIXE (la série 1 est toujours bleue,
la série 2 toujours orange, etc.). Ne jamais réattribuer les couleurs selon
le classement du moment : un lecteur qui a appris « Usine Nord = bleu » ne
doit pas voir la couleur changer quand il filtre.
"""

from __future__ import annotations

import plotly.graph_objects as go
import plotly.io as pio

# --- Surfaces et encre (thème sombre) ------------------------------------
PAGE = "#0d0d0d"          # fond de page
SURFACE = "#1a1a19"       # fond d'une carte / d'un graphique
SURFACE_2 = "#242422"     # surface légèrement surélevée (champs, en-têtes)
INK = "#ffffff"           # texte principal
INK_2 = "#c3c2b7"         # texte secondaire
INK_MUTED = "#898781"     # étiquettes d'axes, légendes discrètes
GRID = "#2c2c2a"          # filet de grille
AXIS = "#383835"          # ligne d'axe / ligne de base
HAIRLINE = "rgba(255,255,255,0.10)"

# --- Palette catégorielle (identité : un site = une couleur) -------------
SERIES = [
    "#3987e5",  # 1 bleu
    "#d95926",  # 2 orange
    "#199e70",  # 3 aqua
    "#c98500",  # 4 jaune
    "#d55181",  # 5 magenta
    "#008300",  # 6 vert
    "#9085e9",  # 7 violet
    "#e66767",  # 8 rouge
]

# --- Rampe séquentielle (magnitude continue : carte de chaleur) ----------
# Une seule teinte, du sombre (proche du fond = « presque rien ») vers le
# clair (valeur forte). Sur fond sombre la rampe est inversée par rapport à
# l'usage sur fond clair, pour que le « zéro » se fonde dans la surface.
SEQUENTIAL = [
    [0.00, "#0d366b"],
    [0.20, "#184f95"],
    [0.40, "#256abf"],
    [0.60, "#3987e5"],
    [0.80, "#86b6ef"],
    [1.00, "#cde2fb"],
]

# --- Couleurs d'état (jamais utilisées comme couleur de série) -----------
STATUS = {
    "good": "#0ca30c",
    "warning": "#fab219",
    "serious": "#ec835a",
    "critical": "#d03b3b",
}

FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif'

TEMPLATE_NAME = "energie_sombre"


def _axis() -> dict:
    """Axe discret : filet plein d'un cran au-dessus du fond, pas de pointillés."""
    return dict(
        gridcolor=GRID,
        gridwidth=1,
        griddash="solid",
        linecolor=AXIS,
        zeroline=False,
        showline=False,
        ticks="outside",
        ticklen=4,
        tickcolor=AXIS,
        tickfont=dict(color=INK_MUTED, size=11),
        title=dict(font=dict(color=INK_MUTED, size=11)),
        automargin=True,
    )


def build_template() -> go.layout.Template:
    """Construit le gabarit Plotly appliqué à toutes les figures."""
    return go.layout.Template(
        layout=go.Layout(
            colorway=SERIES,
            paper_bgcolor=SURFACE,
            plot_bgcolor=SURFACE,
            font=dict(family=FONT_FAMILY, color=INK_2, size=12),
            title=dict(font=dict(color=INK, size=14), x=0, xanchor="left", y=0.97),
            margin=dict(l=8, r=12, t=36, b=8),
            xaxis=_axis(),
            yaxis=_axis(),
            legend=dict(
                orientation="h",
                yanchor="bottom",
                y=1.02,
                xanchor="right",
                x=1,
                font=dict(color=INK_2, size=11),
                bgcolor="rgba(0,0,0,0)",
            ),
            hoverlabel=dict(
                bgcolor=SURFACE_2,
                bordercolor=HAIRLINE,
                font=dict(family=FONT_FAMILY, color=INK, size=12),
            ),
            colorscale=dict(sequential=SEQUENTIAL),
            hovermode="x unified",
            bargap=0.25,
            dragmode="pan",
            # Séparateurs à la française : virgule décimale, espace fine pour les milliers.
            separators=",\u202f",
        )
    )


def register() -> None:
    """Enregistre le gabarit et en fait le défaut (appelé une fois au démarrage)."""
    pio.templates[TEMPLATE_NAME] = build_template()
    pio.templates.default = TEMPLATE_NAME


# Options passées à chaque dcc.Graph : barre d'outils épurée, pas de logo.
GRAPH_CONFIG = {
    "displaylogo": False,
    "responsive": True,
    # Mois et jours en français (fichier de langue chargé par app.py).
    "locale": "fr",
    "displayModeBar": "hover",
    "scrollZoom": False,
    "modeBarButtonsToRemove": [
        "select2d",
        "lasso2d",
        "autoScale2d",
        "toggleSpikelines",
        "hoverCompareCartesian",
        "hoverClosestCartesian",
    ],
    "toImageButtonOptions": {"format": "png", "scale": 2},
}
