"""Construction des figures Plotly.

Chaque fonction reçoit des données déjà filtrées/agrégées (voir ``data.py``)
et renvoie une ``go.Figure``. Aucune de ces fonctions ne lit un fichier ni ne
connaît l'interface : elles sont testables isolément.

Règles de lecture appliquées ici :
- une couleur = un site (attribution stable, cf. ``color_map``) ;
- un seul axe des ordonnées par graphique (jamais deux échelles superposées) ;
- grille discrète, traits fins, écart de 2 px entre deux aplats voisins ;
- survol actif partout, étiquettes directes seulement là où elles tiennent.
"""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go

from . import theme


def color_map(all_sites: list[str]) -> dict[str, str]:
    """Associe une couleur fixe à chaque site.

    L'attribution se fait sur la liste COMPLÈTE des sites du jeu de données,
    jamais sur les sites filtrés : filtrer ne doit pas repeindre les autres.
    Au-delà de huit sites, les couleurs seraient indiscernables — les suivants
    sont regroupés visuellement (voir ``OTHER_COLOR``).
    """
    return {site: theme.SERIES[i % len(theme.SERIES)] for i, site in enumerate(sorted(all_sites))}


def empty_figure(message: str = "Aucune donnée sur cette sélection") -> go.Figure:
    """Figure de repli, affichée quand le filtre ne renvoie rien."""
    fig = go.Figure()
    fig.add_annotation(
        text=message,
        showarrow=False,
        font=dict(color=theme.INK_MUTED, size=13),
        xref="paper",
        yref="paper",
        x=0.5,
        y=0.5,
    )
    fig.update_xaxes(visible=False)
    fig.update_yaxes(visible=False)
    fig.update_layout(margin=dict(l=8, r=8, t=8, b=8))
    return fig


def power_timeseries(agg: pd.DataFrame, colors: dict[str, str]) -> go.Figure:
    """Courbe de puissance appelée, une ligne par site."""
    if agg.empty:
        return empty_figure()
    fig = go.Figure()
    ends: list[tuple[str, object, float]] = []
    for site, part in agg.groupby("site", observed=True):
        part = part.sort_values("timestamp")
        fig.add_trace(
            go.Scatter(
                x=part["timestamp"],
                y=part["power_kw"],
                name=str(site),
                mode="lines",
                line=dict(color=colors.get(str(site), theme.SERIES[0]), width=2),
                hovertemplate="%{y:,.0f} kW<extra>%{fullData.name}</extra>",
            )
        )
        last = part.iloc[-1]
        ends.append((str(site), last["timestamp"], float(last["power_kw"])))

    # Étiquettes directes en bout de courbe : l'identité se lit sans aller-retour
    # avec la légende (qui reste présente). Au-delà de quatre séries elles se
    # marchent dessus : la légende seule prend alors le relais.
    if len(ends) <= 4:
        top = float(agg["power_kw"].max())
        bottom = min(0.0, float(agg["power_kw"].min()))
        min_gap = (top - bottom) * 0.075  # écart mini entre deux étiquettes
        placed: list[float] = []
        for name, x_end, y_end in sorted(ends, key=lambda e: e[2], reverse=True):
            if placed and placed[-1] - y_end < min_gap:
                y_end = placed[-1] - min_gap  # on décale vers le bas
            placed.append(y_end)
            fig.add_annotation(
                x=x_end,
                y=y_end,
                text=name,
                showarrow=False,
                xanchor="left",
                yanchor="middle",
                xshift=10,
                font=dict(color=colors.get(name, theme.SERIES[0]), size=11),
            )
    fig.update_layout(
        margin=dict(l=8, r=104, t=30, b=8),
        yaxis=dict(title="kW", rangemode="tozero"),
        xaxis=dict(
            showspikes=True,
            spikecolor=theme.AXIS,
            spikethickness=1,
            spikemode="across",
            # Bornage explicite : sans lui, Plotly élargit l'échelle pour faire
            # tenir les étiquettes de bout de courbe, et l'axe déborde de
            # plusieurs semaines après la dernière mesure.
            range=[agg["timestamp"].min(), agg["timestamp"].max()],
        ),
        hovermode="x unified",
    )
    return fig


def energy_bars(agg: pd.DataFrame, colors: dict[str, str]) -> go.Figure:
    """Énergie consommée par période, empilée par site."""
    if agg.empty:
        return empty_figure()
    fig = go.Figure()
    for site, part in agg.groupby("site", observed=True):
        part = part.sort_values("timestamp")
        fig.add_trace(
            go.Bar(
                x=part["timestamp"],
                y=part["energy_kwh"],
                name=str(site),
                marker=dict(
                    color=colors.get(str(site), theme.SERIES[0]),
                    # Un liseré de la couleur du fond crée l'écart de 2 px
                    # entre segments empilés : séparer sans dessiner de bordure.
                    line=dict(color=theme.SURFACE, width=1),
                ),
                hovertemplate="%{y:,.0f} kWh<extra>%{fullData.name}</extra>",
            )
        )
    fig.update_layout(
        barmode="stack",
        margin=dict(l=8, r=12, t=30, b=8),
        yaxis=dict(title="kWh", rangemode="tozero"),
        hovermode="x unified",
    )
    return fig


def load_profile(matrix: pd.DataFrame) -> go.Figure:
    """Profil de charge : puissance moyenne par heure (Y) et par jour (X).

    Une seule teinte du sombre (proche de rien) au clair (forte puissance) :
    la magnitude se lit sans arc-en-ciel.
    """
    if matrix.empty:
        return empty_figure()
    fig = go.Figure(
        go.Heatmap(
            x=matrix.columns,
            y=[f"{h:02d} h" for h in matrix.index],
            z=matrix.values,
            colorscale=theme.SEQUENTIAL,
            # L'échelle part de zéro : les heures creuses se fondent alors dans
            # le fond et le contraste jour/nuit saute aux yeux.
            zmin=0,
            xgap=2,
            ygap=2,
            hovertemplate="%{x|%d/%m} · %{y}<br>%{z:,.0f} kW<extra></extra>",
            colorbar=dict(
                title=dict(text="kW", font=dict(color=theme.INK_MUTED, size=11)),
                thickness=10,
                outlinewidth=0,
                tickfont=dict(color=theme.INK_MUTED, size=10),
                len=0.9,
            ),
        )
    )
    fig.update_layout(
        margin=dict(l=8, r=8, t=30, b=8),
        yaxis=dict(autorange="reversed", showgrid=False, title=""),
        xaxis=dict(showgrid=False),
        hovermode="closest",
    )
    return fig


def load_duration_curve(curve: pd.DataFrame) -> go.Figure:
    """Monotone de charge : puissance atteinte ou dépassée, en % du temps."""
    if curve.empty:
        return empty_figure()
    fig = go.Figure(
        go.Scatter(
            x=curve["share"],
            y=curve["power_kw"],
            mode="lines",
            line=dict(color=theme.SERIES[0], width=2),
            fill="tozeroy",
            fillcolor="rgba(57,135,229,0.16)",
            name="Puissance totale",
            hovertemplate="%{y:,.0f} kW dépassés<br>%{x:.0f} % du temps<extra></extra>",
        )
    )
    fig.update_layout(
        margin=dict(l=8, r=12, t=30, b=8),
        showlegend=False,  # série unique : le titre de la carte suffit
        xaxis=dict(title="% du temps", ticksuffix=" %", range=[0, 100]),
        yaxis=dict(title="kW", rangemode="tozero"),
        hovermode="x unified",
    )
    return fig
