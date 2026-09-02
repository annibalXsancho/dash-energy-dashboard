"""Comportement de l'application : les rappels (callbacks) Dash.

Un rappel = « quand cette entrée change, recalcule ces sorties ». Dash relie
tout seul les identifiants (``id=`` posés dans ``components.py``) aux fonctions
ci-dessous ; il n'y a pas de code à écrire côté navigateur.

Deux rappels seulement :
1. ``switch_dataset`` — charge un CSV déposé, ou revient aux données de démo ;
2. ``refresh`` — recalcule indicateurs, figures et tableau à chaque filtrage.
"""

from __future__ import annotations

import pandas as pd
from dash import Input, Output, State, ctx, html

from . import components as ui
from . import data as data_mod
from . import figures

TABLE_ROW_CAP = 500  # au-delà, on tronque : le tableau est une vue de contrôle


def register(app, store) -> None:
    """Attache les rappels à l'application. ``store`` porte le jeu courant."""

    # ------------------------------------------------------------------
    # 1. Changement de source de données
    # ------------------------------------------------------------------
    @app.callback(
        Output("dataset-version", "data"),
        Output("feedback", "children"),
        Output("feedback", "className"),
        Output("site-filter", "options"),
        Output("site-filter", "value"),
        Output("date-range", "min_date_allowed"),
        Output("date-range", "max_date_allowed"),
        Output("date-range", "start_date"),
        Output("date-range", "end_date"),
        Input("upload-data", "contents"),
        Input("reset-data", "n_clicks"),
        State("upload-data", "filename"),
        State("dataset-version", "data"),
        State("date-range", "start_date"),
        State("date-range", "end_date"),
        prevent_initial_call=True,
    )
    def switch_dataset(contents, _clicks, filename, version, kept_start, kept_end):
        message, tone = "", "feedback"
        if ctx.triggered_id == "upload-data" and contents:
            try:
                frame = data_mod.read_upload(contents, filename or "fichier.csv")
            except data_mod.DataError as exc:
                # Échec : on ne touche pas au jeu courant, on explique pourquoi.
                current = store.dataset
                return (
                    version,
                    f"Import refusé — {exc}",
                    "feedback is-error",
                    [{"label": s, "value": s} for s in current.sites],
                    current.sites,
                    current.start.date(),
                    current.end.date(),
                    kept_start,
                    kept_end,
                )
            store.dataset = data_mod.Dataset(frame, filename or "fichier importé")
            message = f"{filename} chargé — {len(frame):,} mesures".replace(",", ui.NBSP)
            tone = "feedback is-ok"
        else:
            store.dataset = data_mod.Dataset(
                data_mod.read_csv(data_mod.DEFAULT_DATA), "sample_energy.csv"
            )
            message = "Retour aux données de démonstration"
            tone = "feedback is-ok"

        ds = store.dataset
        window_start = max(ds.start, ds.end - pd.Timedelta(days=29))
        return (
            (version or 0) + 1,
            message,
            tone,
            [{"label": s, "value": s} for s in ds.sites],
            ds.sites,
            ds.start.date(),
            ds.end.date(),
            window_start.date(),
            ds.end.date(),
        )

    # ------------------------------------------------------------------
    # 2. Recalcul à chaque filtrage
    # ------------------------------------------------------------------
    @app.callback(
        Output("kpis", "children"),
        Output("source-chip", "children"),
        Output("fig-power", "figure"),
        Output("fig-energy", "figure"),
        Output("fig-duration", "figure"),
        Output("fig-profile", "figure"),
        Output("data-table", "data"),
        Output("table-note", "children"),
        Input("date-range", "start_date"),
        Input("date-range", "end_date"),
        Input("site-filter", "value"),
        Input("granularity", "value"),
        Input("dataset-version", "data"),
    )
    def refresh(start_date, end_date, sites, granularity, _version):
        ds = store.dataset
        colors = figures.color_map(ds.sites)  # attribution stable, tous sites confondus
        step = ds.step_hours
        chip = (
            f"{ds.source} · {len(ds.frame):,} mesures · pas de {step * 60:.0f} min".replace(
                ",", ui.NBSP
            )
        )

        selected = sites or []
        current = data_mod.slice_period(ds.frame, start_date, end_date, selected)
        if current.empty:
            empty = figures.empty_figure()
            return (
                ui.kpi_tiles(data_mod.kpis(current, step), None),
                chip,
                empty,
                empty,
                figures.empty_figure(),
                figures.empty_figure(),
                [],
                "Aucune ligne sur cette sélection.",
            )

        previous = data_mod.previous_period(ds.frame, start_date, end_date, selected)
        freq = data_mod.GRANULARITIES.get(granularity, ("", "h"))[1]

        agg = data_mod.aggregate(current, freq, step)
        # L'énergie se lit mieux par tranche large : jamais plus fin que l'heure.
        energy_freq = freq if freq in ("D", "W-MON") else ("D" if freq else "h")
        energy_agg = data_mod.aggregate(current, energy_freq, step)

        stamp_format = {None: "%d/%m %H:%M", "h": "%d/%m %Hh"}.get(freq, "%d/%m/%Y")
        table = agg.sort_values(["timestamp", "site"]).head(TABLE_ROW_CAP).copy()
        table["timestamp"] = table["timestamp"].dt.strftime(stamp_format)
        note = f"{len(agg):,} lignes agrégées".replace(",", ui.NBSP)
        if len(agg) > TABLE_ROW_CAP:
            note += f" — {TABLE_ROW_CAP} premières affichées"

        return (
            ui.kpi_tiles(data_mod.kpis(current, step), data_mod.kpis(previous, step)),
            chip,
            figures.power_timeseries(agg, colors),
            figures.energy_bars(energy_agg, colors),
            figures.load_duration_curve(data_mod.load_duration(current)),
            figures.load_profile(data_mod.heat_matrix(current)),
            table.round(1).to_dict("records"),
            note,
        )
