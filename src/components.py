"""Briques d'interface : mise en page, filtres, tuiles d'indicateurs, cartes.

Ce module ne contient que de la structure (du HTML décrit en Python). Le style
vit dans ``assets/style.css``, le comportement dans ``callbacks.py``.
"""

from __future__ import annotations

import pandas as pd
from dash import dash_table, dcc, html
from dash.dash_table.Format import Format, Group, Scheme

from . import data as data_mod
from . import theme

# --------------------------------------------------------------------------
# Formatage à la française
# --------------------------------------------------------------------------
NBSP = " "  # espace fine insécable, séparateur de milliers


def fmt(value: float, decimals: int = 0) -> str:
    """1234.5 -> « 1 234,5 » (espace fine pour les milliers, virgule décimale)."""
    if value is None or pd.isna(value):
        return "—"
    text = f"{value:,.{decimals}f}"
    return text.replace(",", NBSP).replace(".", ",")


def human_energy(kwh: float) -> tuple[str, str]:
    """Choisit l'unité lisible : kWh, MWh ou GWh."""
    if abs(kwh) >= 1_000_000:
        return fmt(kwh / 1_000_000, 2), "GWh"
    if abs(kwh) >= 1_000:
        return fmt(kwh / 1_000, 1), "MWh"
    return fmt(kwh, 0), "kWh"


# --------------------------------------------------------------------------
# Tuiles d'indicateurs
# --------------------------------------------------------------------------
def delta_line(current: float, previous: float | None, better: str = "lower") -> html.Div:
    """Écart avec la période précédente.

    La couleur ne porte JAMAIS l'information seule : une flèche et le texte
    « vs période précédente » l'accompagnent toujours.
    """
    if not previous:
        return html.Div("période précédente indisponible", className="delta is-neutral")
    change = (current - previous) / previous * 100.0
    if abs(change) < 0.05:
        return html.Div("stable vs période précédente", className="delta is-neutral")
    rising = change > 0
    good = rising if better == "higher" else not rising
    arrow = "▲" if rising else "▼"
    tone = "is-good" if good else "is-bad"
    return html.Div(
        [
            html.Span(arrow, className="delta-arrow"),
            html.Span(f"{fmt(abs(change), 1)}{NBSP}%", className="delta-value"),
            html.Span("vs période précédente", className="delta-label"),
        ],
        className=f"delta {tone}",
    )


def stat_tile(label: str, value: str, unit: str, caption, delta=None) -> html.Div:
    """Une tuile d'indicateur : étiquette, nombre en vedette, unité, contexte."""
    return html.Div(
        [
            html.Div(label, className="eyebrow"),
            html.Div(
                [html.Span(value, className="stat-value"), html.Span(unit, className="stat-unit")],
                className="stat-line",
            ),
            html.Div(caption, className="stat-caption") if caption else None,
            delta,
        ],
        className="tile",
    )


def kpi_tiles(current: dict, previous: dict | None) -> list[html.Div]:
    """Les cinq indicateurs de tête, calculés dans ``data.kpis``."""
    prev = previous or {}
    energy_value, energy_unit = human_energy(current["energy_kwh"])
    peak_at = current.get("peak_at")
    peak_caption = (
        f"le {peak_at:%d/%m} à {peak_at:%Hh%M}" if isinstance(peak_at, pd.Timestamp) else "—"
    )
    return [
        stat_tile(
            "Énergie consommée",
            energy_value,
            energy_unit,
            "sur la période affichée",
            delta_line(current["energy_kwh"], prev.get("energy_kwh"), "lower"),
        ),
        stat_tile(
            "Puissance de pointe",
            fmt(current["peak_kw"]),
            "kW",
            peak_caption,
            delta_line(current["peak_kw"], prev.get("peak_kw"), "lower"),
        ),
        stat_tile(
            "Puissance moyenne",
            fmt(current["mean_kw"]),
            "kW",
            "tous sites confondus",
            delta_line(current["mean_kw"], prev.get("mean_kw"), "lower"),
        ),
        stat_tile(
            "Facteur de charge",
            fmt(current["load_factor"], 1),
            "%",
            "moyenne ÷ pointe",
            delta_line(current["load_factor"], prev.get("load_factor"), "higher"),
        ),
        stat_tile(
            "Coût estimé",
            fmt(current["cost_eur"]),
            "€",
            f"à {fmt(data_mod.PRICE_EUR_PER_KWH, 2)} €/kWh",
            delta_line(current["cost_eur"], prev.get("cost_eur"), "lower"),
        ),
    ]


# --------------------------------------------------------------------------
# Cartes de graphiques
# --------------------------------------------------------------------------
def chart_card(graph_id: str, title: str, hint: str, wide: bool = False) -> html.Section:
    """Une carte = un en-tête (titre + aide de lecture) et un graphique."""
    return html.Section(
        [
            html.Header(
                [html.H2(title, className="card-title"), html.P(hint, className="card-hint")],
                className="card-head",
            ),
            dcc.Loading(
                dcc.Graph(
                    id=graph_id,
                    config=theme.GRAPH_CONFIG,
                    className="graph",
                    # Le graphique suit la taille de son conteneur : Dash lui
                    # pose alors « height: 100 % » en style en ligne, d'où la
                    # hauteur fixée sur l'emplacement (.graph-slot) et non ici.
                    responsive=True,
                ),
                type="dot",
                color=theme.SERIES[0],
                parent_className="graph-slot",
            ),
        ],
        className="card" + (" card--wide" if wide else ""),
    )


# --------------------------------------------------------------------------
# Barre de filtres
# --------------------------------------------------------------------------
def filter_bar(dataset: data_mod.Dataset) -> html.Section:
    granularity_options = [
        {"label": label, "value": key} for key, (label, _) in data_mod.GRANULARITIES.items()
    ]
    return html.Section(
        [
            html.Div(
                [
                    html.Label("Période", className="eyebrow", htmlFor="date-range"),
                    dcc.DatePickerRange(
                        id="date-range",
                        min_date_allowed=dataset.start.date(),
                        max_date_allowed=dataset.end.date(),
                        start_date=(dataset.end - pd.Timedelta(days=29)).date(),
                        end_date=dataset.end.date(),
                        display_format="DD/MM/YYYY",
                        first_day_of_week=1,
                        minimum_nights=0,
                        clearable=False,
                        updatemode="bothdates",
                    ),
                ],
                className="filter",
            ),
            html.Div(
                [
                    html.Label("Sites", className="eyebrow", htmlFor="site-filter"),
                    dcc.Dropdown(
                        id="site-filter",
                        options=[{"label": s, "value": s} for s in dataset.sites],
                        value=dataset.sites,
                        multi=True,
                        placeholder="Tous les sites",
                        className="dd",
                    ),
                ],
                className="filter filter--grow",
            ),
            html.Div(
                [
                    html.Label("Granularité", className="eyebrow", htmlFor="granularity"),
                    dcc.Dropdown(
                        id="granularity",
                        options=granularity_options,
                        value="h",
                        clearable=False,
                        className="dd",
                    ),
                ],
                className="filter",
            ),
            html.Div(
                [
                    html.Label("Données", className="eyebrow"),
                    html.Div(
                        [
                            dcc.Upload(
                                html.Button("Charger un CSV", className="btn btn--tonal"),
                                id="upload-data",
                                multiple=False,
                                accept=".csv,text/csv",
                            ),
                            html.Button(
                                "Démo", id="reset-data", n_clicks=0, className="btn btn--ghost"
                            ),
                        ],
                        className="btn-row",
                    ),
                ],
                className="filter",
            ),
        ],
        className="filters",
    )


# --------------------------------------------------------------------------
# Vue tabulaire (lecture alternative des mêmes données)
# --------------------------------------------------------------------------
def _num(decimals: int) -> Format:
    """Colonne numérique formatée à la française (espace fine, virgule)."""
    return Format(
        precision=decimals,
        scheme=Scheme.fixed,
        group=Group.yes,
        group_delimiter=NBSP,
        decimal_delimiter=",",
    )


TABLE_COLUMNS = [
    {"name": "Période", "id": "timestamp", "type": "text"},
    {"name": "Site", "id": "site", "type": "text"},
    {"name": "Énergie (kWh)", "id": "energy_kwh", "type": "numeric", "format": _num(0)},
    {"name": "Puissance moy. (kW)", "id": "power_kw", "type": "numeric", "format": _num(0)},
    {"name": "Pointe (kW)", "id": "peak_kw", "type": "numeric", "format": _num(0)},
]


def data_table() -> html.Details:
    return html.Details(
        [
            html.Summary("Voir les données du tableau de bord", className="table-summary"),
            html.Div(id="table-note", className="table-note"),
            dash_table.DataTable(
                id="data-table",
                columns=TABLE_COLUMNS,
                page_size=12,
                sort_action="native",
                style_as_list_view=True,
                style_table={"overflowX": "auto"},
                style_header={
                    "backgroundColor": theme.SURFACE_2,
                    "color": theme.INK_2,
                    "border": "none",
                    "fontSize": "11px",
                    "textTransform": "uppercase",
                    "letterSpacing": "0.06em",
                },
                style_cell={
                    "backgroundColor": theme.SURFACE,
                    "color": theme.INK_2,
                    "border": "none",
                    "borderBottom": f"1px solid {theme.GRID}",
                    "fontFamily": theme.FONT_FAMILY,
                    "fontSize": "12px",
                    "padding": "10px 12px",
                    "fontVariantNumeric": "tabular-nums",
                },
                style_data_conditional=[
                    {"if": {"column_id": "site"}, "color": theme.INK},
                ],
            ),
        ],
        className="table-block",
    )


# --------------------------------------------------------------------------
# Page complète
# --------------------------------------------------------------------------
def layout(dataset: data_mod.Dataset) -> html.Div:
    return html.Div(
        [
            dcc.Store(id="dataset-version", data=0),
            html.Header(
                [
                    html.Div(
                        [
                            html.P("Tableau de bord", className="eyebrow"),
                            html.H1("Énergie & puissance"),
                        ]
                    ),
                    html.Div(id="source-chip", className="chip"),
                ],
                className="topbar",
            ),
            filter_bar(dataset),
            html.Div(id="feedback", className="feedback", role="status"),
            html.Section(id="kpis", className="kpis"),
            html.Div(
                [
                    chart_card(
                        "fig-power",
                        "Courbe de puissance appelée",
                        "Puissance moyenne par pas de temps, une couleur par site.",
                        wide=True,
                    ),
                    chart_card(
                        "fig-energy",
                        "Énergie par période",
                        "Consommation cumulée, empilée par site.",
                    ),
                    chart_card(
                        "fig-duration",
                        "Monotone de charge",
                        "Puissance atteinte ou dépassée, en % du temps.",
                    ),
                    chart_card(
                        "fig-profile",
                        "Profil de charge",
                        "Puissance moyenne par heure et par jour — repère les habitudes.",
                        wide=True,
                    ),
                ],
                className="charts",
            ),
            data_table(),
            html.Footer(
                [
                    html.P(
                        "Coquille MVP — Dash + Plotly. Remplacez le CSV de démonstration "
                        "par vos relevés (colonnes : timestamp, site, power_kw).",
                    )
                ],
                className="page-footer",
            ),
        ],
        className="app",
    )
