"""Chargement, validation et agrégation des données énergétiques.

Format de fichier attendu (CSV, une ligne = une mesure) :

    timestamp,site,power_kw
    2026-06-01T00:00:00,Usine Nord,412.5
    2026-06-01T00:15:00,Usine Nord,408.1

- ``timestamp`` : date/heure de la mesure (ISO 8601 de préférence).
- ``site``      : nom du site, de l'atelier ou du compteur. Sert de série.
- ``power_kw``  : puissance moyenne sur le pas de temps, en kilowatts.

L'ÉNERGIE n'est pas dans le fichier : elle est calculée. Le pas de temps est
déduit de l'écart médian entre deux mesures, puis
``énergie (kWh) = puissance (kW) × durée du pas (h)``.
Toute colonne supplémentaire est ignorée.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

# Tarif utilisé pour l'indicateur « coût estimé ». À ajuster au contrat réel.
PRICE_EUR_PER_KWH = 0.18

REQUIRED_COLUMNS = ("timestamp", "site", "power_kw")

# Granularités proposées dans l'interface (libellé -> code de rééchantillonnage pandas).
GRANULARITIES = {
    "raw": ("Pas natif", None),
    "h": ("Heure", "h"),
    "D": ("Jour", "D"),
    "W": ("Semaine", "W-MON"),
}

DEFAULT_DATA = Path(__file__).resolve().parent.parent / "data" / "sample_energy.csv"


class DataError(ValueError):
    """Fichier illisible ou colonnes manquantes — message destiné à l'utilisateur."""


# --------------------------------------------------------------------------
# Lecture
# --------------------------------------------------------------------------
def _to_number(column: pd.Series) -> pd.Series:
    """Convertit en nombre en acceptant l'écriture française.

    Un export Excel francophone écrit « 1 234,5 » : virgule décimale et espaces
    (parfois insécables) comme séparateurs de milliers. On les neutralise avant
    la conversion, sans quoi toute la colonne partirait en valeurs manquantes.
    """
    if pd.api.types.is_numeric_dtype(column):
        return column
    cleaned = (
        column.astype("string")
        .str.replace(r"[\s\u00a0\u202f]", "", regex=True)
        .str.replace(",", ".", regex=False)
    )
    return pd.to_numeric(cleaned, errors="coerce")


def _read_table(source) -> pd.DataFrame:
    """Lit un CSV en devinant le séparateur (« , », « ; » ou tabulation)."""
    return pd.read_csv(source, sep=None, engine="python", skipinitialspace=True)


def normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Vérifie les colonnes, convertit les types, trie, retire les lignes vides."""
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if len(missing) == len(REQUIRED_COLUMNS):
        raise DataError(
            "Aucune des colonnes attendues n'a été trouvée. La première ligne du "
            "fichier doit nommer les colonnes : timestamp, site, power_kw."
        )
    if missing:
        raise DataError(
            "Colonne manquante : " + ", ".join(missing)
            + ". Attendu : timestamp, site, power_kw."
        )
    out = df.loc[:, list(REQUIRED_COLUMNS)].copy()
    out["timestamp"] = pd.to_datetime(out["timestamp"], errors="coerce", format="mixed")
    out["site"] = out["site"].astype("string").str.strip()
    out["power_kw"] = _to_number(out["power_kw"])
    out = out.dropna(subset=["timestamp", "site", "power_kw"])
    if out.empty:
        raise DataError("Aucune ligne exploitable après nettoyage.")
    return out.sort_values("timestamp", ignore_index=True)


def read_csv(path: str | Path) -> pd.DataFrame:
    """Lit un CSV depuis le disque."""
    try:
        raw = _read_table(path)
    except FileNotFoundError as exc:
        raise DataError(f"Fichier introuvable : {path}") from exc
    except Exception as exc:  # noqa: BLE001 - message remonté tel quel à l'écran
        raise DataError(f"Lecture impossible : {exc}") from exc
    return normalise(raw)


def read_upload(contents: str, filename: str) -> pd.DataFrame:
    """Lit un fichier déposé dans l'interface (dcc.Upload, encodé en base64)."""
    if not filename.lower().endswith((".csv", ".txt")):
        raise DataError("Format non géré : déposer un fichier .csv.")
    try:
        _, payload = contents.split(",", 1)
        decoded = base64.b64decode(payload)
    except Exception as exc:  # noqa: BLE001
        raise DataError("Fichier illisible : contenu non décodable.") from exc
    try:
        raw = _read_table(io.BytesIO(decoded))
    except Exception as exc:  # noqa: BLE001
        raise DataError(f"Lecture impossible : {exc}") from exc
    return normalise(raw)


@dataclass
class Dataset:
    """Le jeu de données courant + ses métadonnées d'affichage.

    Application mono-utilisateur en local : garder les données en mémoire vive
    suffit. Pour un déploiement multi-utilisateurs, il faudrait passer par un
    ``dcc.Store`` par session ou une base de données.
    """

    frame: pd.DataFrame
    source: str

    @property
    def sites(self) -> list[str]:
        return sorted(self.frame["site"].unique().tolist())

    @property
    def start(self) -> pd.Timestamp:
        return self.frame["timestamp"].min()

    @property
    def end(self) -> pd.Timestamp:
        return self.frame["timestamp"].max()

    @property
    def step_hours(self) -> float:
        """Durée d'un pas de mesure, en heures (écart médian entre deux points)."""
        per_site = self.frame.groupby("site", observed=True)["timestamp"]
        deltas = per_site.diff().dropna()
        if deltas.empty:
            return 1.0
        return float(deltas.median().total_seconds() / 3600.0) or 1.0


# --------------------------------------------------------------------------
# Filtrage et agrégation
# --------------------------------------------------------------------------
def slice_period(df: pd.DataFrame, start, end, sites: list[str] | None) -> pd.DataFrame:
    """Restreint le jeu de données à une période et à une liste de sites."""
    out = df
    if sites:
        out = out[out["site"].isin(sites)]
    if start is not None:
        out = out[out["timestamp"] >= pd.Timestamp(start)]
    if end is not None:
        # La borne haute est inclusive : on prend la journée entière.
        out = out[out["timestamp"] < pd.Timestamp(end) + pd.Timedelta(days=1)]
    return out


def aggregate(df: pd.DataFrame, freq: str | None, step_hours: float) -> pd.DataFrame:
    """Regroupe par site et par tranche de temps.

    Renvoie une table : timestamp, site, power_kw (moyenne), peak_kw (max),
    energy_kwh (somme). Avec ``freq=None`` les données sont rendues telles quelles.
    """
    if df.empty:
        return pd.DataFrame(
            columns=["timestamp", "site", "power_kw", "peak_kw", "energy_kwh"]
        )
    work = df.copy()
    work["energy_kwh"] = work["power_kw"] * step_hours
    if freq is None:
        work["peak_kw"] = work["power_kw"]
        return work.loc[:, ["timestamp", "site", "power_kw", "peak_kw", "energy_kwh"]]
    grouped = (
        work.groupby([pd.Grouper(key="timestamp", freq=freq), "site"], observed=True)
        .agg(
            power_kw=("power_kw", "mean"),
            peak_kw=("power_kw", "max"),
            energy_kwh=("energy_kwh", "sum"),
        )
        .reset_index()
    )
    return grouped.dropna(subset=["power_kw"])


def total_curve(df: pd.DataFrame) -> pd.DataFrame:
    """Puissance totale tous sites confondus, pas de temps par pas de temps."""
    if df.empty:
        return pd.DataFrame(columns=["timestamp", "power_kw"])
    return (
        df.groupby("timestamp", observed=True)["power_kw"]
        .sum()
        .reset_index()
        .sort_values("timestamp")
    )


def load_duration(df: pd.DataFrame) -> pd.DataFrame:
    """Monotone de charge : puissances totales triées de la plus forte à la plus faible.

    L'axe X est le pourcentage du temps pendant lequel la puissance a été
    ATTEINTE OU DÉPASSÉE. Lecture classique en énergie : une pointe très à
    gauche et très haute signale un appel de puissance bref et coûteux.
    """
    curve = total_curve(df)
    if curve.empty:
        return pd.DataFrame(columns=["share", "power_kw"])
    values = curve["power_kw"].sort_values(ascending=False).reset_index(drop=True)
    share = (values.index + 1) / len(values) * 100.0
    return pd.DataFrame({"share": share, "power_kw": values})


def heat_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Profil de charge : matrice heures (lignes) × jours (colonnes), puissance moyenne."""
    curve = total_curve(df)
    if curve.empty:
        return pd.DataFrame()
    curve = curve.assign(
        day=curve["timestamp"].dt.normalize(),
        hour=curve["timestamp"].dt.hour,
    )
    return curve.pivot_table(
        index="hour", columns="day", values="power_kw", aggfunc="mean"
    ).sort_index()


# --------------------------------------------------------------------------
# Indicateurs
# --------------------------------------------------------------------------
def kpis(df: pd.DataFrame, step_hours: float) -> dict:
    """Calcule les cinq indicateurs de tête pour une période donnée."""
    if df.empty:
        return {
            "energy_kwh": 0.0,
            "peak_kw": 0.0,
            "peak_at": None,
            "mean_kw": 0.0,
            "load_factor": 0.0,
            "cost_eur": 0.0,
        }
    curve = total_curve(df)
    energy = float(df["power_kw"].sum() * step_hours)
    peak_row = curve.loc[curve["power_kw"].idxmax()]
    mean_kw = float(curve["power_kw"].mean())
    peak_kw = float(peak_row["power_kw"])
    return {
        "energy_kwh": energy,
        "peak_kw": peak_kw,
        "peak_at": peak_row["timestamp"],
        "mean_kw": mean_kw,
        "load_factor": (mean_kw / peak_kw * 100.0) if peak_kw else 0.0,
        "cost_eur": energy * PRICE_EUR_PER_KWH,
    }


def previous_period(df: pd.DataFrame, start, end, sites: list[str] | None):
    """Même durée, juste avant la période affichée — sert aux écarts des indicateurs."""
    if start is None or end is None:
        return pd.DataFrame(columns=df.columns)
    start_ts = pd.Timestamp(start)
    end_ts = pd.Timestamp(end) + pd.Timedelta(days=1)
    span = end_ts - start_ts
    return slice_period(
        df, start_ts - span, (start_ts - pd.Timedelta(days=1)).normalize(), sites
    )
