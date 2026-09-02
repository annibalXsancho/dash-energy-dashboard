"""Génère un échantillon réaliste de mesures de puissance (données de démonstration).

Usage :  python3 scripts/generate_sample_data.py [--days 92] [--step-min 15]

Trois sites aux profils volontairement différents, pour que les graphiques
racontent quelque chose : une usine en 3×8, un atelier de jour équipé de
panneaux solaires, un siège tertiaire climatisé. Le tirage est déterministe
(graine fixe) : deux exécutions produisent le même fichier.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 7
OUT = Path(__file__).resolve().parent.parent / "data" / "sample_energy.csv"


def build(days: int, step_min: int) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    end = pd.Timestamp("2026-08-31 23:45")
    index = pd.date_range(end=end, periods=int(days * 24 * 60 / step_min), freq=f"{step_min}min")

    hour = index.hour + index.minute / 60.0
    weekday = index.dayofweek
    is_weekend = weekday >= 5
    day_of_year = index.dayofyear
    # Chaleur saisonnière (pic mi-juillet) : pilote la climatisation du tertiaire.
    heat = np.clip(np.sin((day_of_year - 100) / 365 * 2 * np.pi), 0, None)

    frames = []

    # --- Usine Nord : 3×8, plateau de jour, base de nuit, arrêt en août -----
    shift = np.where((hour >= 6) & (hour < 22), 1.0, 0.42)
    factory = 430 + 520 * shift
    factory = np.where(is_weekend, factory * 0.55, factory)
    shutdown = (index >= "2026-08-03") & (index < "2026-08-17")  # congés d'été
    factory = np.where(shutdown, 180 + rng.normal(0, 12, len(index)), factory)
    # Démarrages machines : brèves pointes de puissance.
    spikes = rng.random(len(index)) < 0.004
    factory = factory + spikes * rng.uniform(120, 380, len(index))
    factory = factory + rng.normal(0, 22, len(index))
    frames.append(("Usine Nord", factory))

    # --- Atelier Sud : équipe de jour + autoconsommation solaire -----------
    day_shift = np.clip(np.sin((hour - 6) / 12 * np.pi), 0, None)
    workshop = 70 + 360 * day_shift
    workshop = np.where(is_weekend, 70 + 40 * day_shift, workshop)
    solar = np.clip(np.sin((hour - 7) / 11 * np.pi), 0, None) * (90 + 60 * heat)
    cloud = rng.uniform(0.35, 1.0, len(index))  # couverture nuageuse du jour
    workshop = workshop - solar * cloud
    workshop = np.clip(workshop + rng.normal(0, 14, len(index)), 15, None)
    frames.append(("Atelier Sud", workshop))

    # --- Siège Est : bureaux 8h-19h, climatisation l'été -------------------
    office_open = (hour >= 8) & (hour < 19) & ~is_weekend
    office = np.where(office_open, 165, 48)
    hvac = np.where(office_open, 1.0, 0.3) * heat * 95
    office = office + hvac + rng.normal(0, 9, len(index))
    frames.append(("Siège Est", np.clip(office, 20, None)))

    return pd.concat(
        [
            pd.DataFrame({"timestamp": index, "site": name, "power_kw": np.round(values, 1)})
            for name, values in frames
        ],
        ignore_index=True,
    ).sort_values(["timestamp", "site"], ignore_index=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=92)
    parser.add_argument("--step-min", type=int, default=15)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    frame = build(args.days, args.step_min)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.out, index=False, date_format="%Y-%m-%dT%H:%M:%S")
    size_mb = args.out.stat().st_size / 1e6
    print(
        f"{len(frame):,} lignes · {frame['site'].nunique()} sites · "
        f"{frame['timestamp'].min()} -> {frame['timestamp'].max()} · "
        f"{size_mb:.2f} Mo -> {args.out}"
    )


if __name__ == "__main__":
    main()
