"""Fabrique un livrable : un seul fichier .html, autonome et hors ligne.

    python3 scripts/build_export.py missions/acme/2026-normalise.csv \
        --client "ACME — Usine Nord" --souscrite 1200 --abonnement 3500

Le fichier produit contient la page, ses styles, plotly et LES DONNÉES. Il
s'ouvre par double-clic, fonctionne sans réseau, et n'envoie rien nulle part :
c'est ce qu'on envoie au client, jamais un lien vers un site public.

Pourquoi un assembleur maison plutôt qu'un outil de build : la machine n'a pas
Node. Les six modules ES du dossier js/ sont donc recousus ici en un seul script
classique — chaque module devient une fonction anonyme qui renvoie ce qu'il
exportait, et les `import` deviennent des variables locales.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Ordre de dépendance : un module ne peut importer que ceux qui le précèdent.
MODULES = ["theme", "format", "data", "tariff", "figures", "app"]

IMPORT_RE = re.compile(
    r'^import\s+(?:\*\s+as\s+(?P<ns>\w+)|\{(?P<names>[^}]*)\})\s+from\s+'
    r'"\./(?P<mod>\w+)\.js(?:\?v=\d+)?";\s*$',
    re.M,
)
EXPORT_RE = re.compile(r"^export\s+(?:const|let|var|function|class)\s+(\w+)", re.M)


def bundle_modules() -> str:
    """Recoud les modules ES en un script classique équivalent."""
    parts = ["(function () {", '"use strict";', "var __m = {};"]
    for name in MODULES:
        source = (ROOT / "js" / f"{name}.js").read_text(encoding="utf-8")

        prelude = []
        for match in IMPORT_RE.finditer(source):
            origin = match.group("mod")
            if origin not in MODULES:
                raise SystemExit(f"{name}.js importe un module inconnu : {origin}")
            if match.group("ns"):
                prelude.append(f'var {match.group("ns")} = __m.{origin};')
            else:
                for imported in match.group("names").split(","):
                    key = imported.strip()
                    if key:
                        prelude.append(f"var {key} = __m.{origin}.{key};")
        source = IMPORT_RE.sub("", source)

        exported = EXPORT_RE.findall(source)
        source = re.sub(r"^export\s+", "", source, flags=re.M)
        returned = ", ".join(f"{key}: {key}" for key in exported)

        parts.append(f"__m.{name} = (function () {{")
        parts.extend(prelude)
        parts.append(source)
        parts.append(f"return {{{returned}}};")
        parts.append("})();")
    parts.append("})();")
    return "\n".join(parts)


def safe(text: str) -> str:
    """Neutralise une fin de balise qui traînerait dans du contenu inséré."""
    return text.replace("</script", "<\\/script")


def build(csv_path: Path, config: dict) -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    plotly = (ROOT / "vendor" / "plotly-cartesian-4.0.0.min.js").read_text(encoding="utf-8")
    locale = (ROOT / "vendor" / "plotly-locale-fr.js").read_text(encoding="utf-8")
    payload = base64.b64encode(csv_path.read_bytes()).decode("ascii")

    html = re.sub(
        r'<link rel="stylesheet" href="css/style\.css\?v=\d+">',
        lambda _: f"<style>\n{css}\n</style>",
        html,
    )
    html = html.replace(
        '<script src="vendor/plotly-cartesian-4.0.0.min.js" charset="utf-8"></script>',
        f"<script>{safe(plotly)}</script>",
    )
    html = html.replace(
        '<script src="vendor/plotly-locale-fr.js" charset="utf-8"></script>',
        f"<script>{safe(locale)}</script>",
    )
    html = re.sub(r'<script type="module" src="js/app\.js\?v=\d+"></script>', "@@BUNDLE@@", html)
    html = html.replace(
        "@@BUNDLE@@",
        '<script type="application/json" id="embedded-config">'
        + safe(json.dumps(config, ensure_ascii=False))
        + "</script>\n"
        + '<script type="application/base64" id="embedded-data">'
        + payload
        + "</script>\n"
        + f"<script>{safe(bundle_modules())}</script>",
    )
    return html


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path, help="relevé normalisé (timestamp, site, power_kw)")
    parser.add_argument("--client", default="", help="nom affiché en tête du document")
    parser.add_argument("--titre", default="", help="titre principal (défaut : Énergie & puissance)")
    parser.add_argument("--out", type=Path, help="fichier produit (défaut : livrables/<date>_<client>.html)")
    parser.add_argument("--souscrite", type=float, default=0, help="puissance souscrite, kW")
    parser.add_argument("--prix-hp", type=float, default=0.19, help="€/kWh heures pleines")
    parser.add_argument("--prix-hc", type=float, default=0.13, help="€/kWh heures creuses")
    parser.add_argument("--hc", default="22-6", help="plage d'heures creuses, ex. 22-6")
    parser.add_argument("--abonnement", type=float, default=0, help="€/mois")
    parser.add_argument("--penalite", type=float, default=12, help="€/kW de dépassement")
    args = parser.parse_args()

    if not args.csv.exists():
        raise SystemExit(f"Relevé introuvable : {args.csv}")

    # Le livrable n'a pas d'interface de rattrapage : ses données doivent déjà
    # porter les bons intitulés. Sinon le client ouvrirait un formulaire de
    # désignation de colonnes — exactement ce qu'on ne veut pas lui montrer.
    header = args.csv.open(encoding="utf-8", errors="replace").readline().lower()
    missing = [c for c in ("timestamp", "site", "power_kw") if c not in header]
    if missing:
        raise SystemExit(
            f"Colonnes absentes de l'en-tête : {', '.join(missing)}.\n"
            "Ouvrez le relevé dans le tableau de bord, désignez les colonnes, puis\n"
            "cliquez « CSV normalisé » : c'est ce fichier-là qu'on exporte."
        )
    hc_start, hc_end = (int(x) for x in args.hc.split("-"))

    today = date.today()
    config = {
        "client": args.client,
        "title": args.titre,
        "generated": today.strftime("%d/%m/%Y"),
        "source": args.csv.name,
        "tariff": {
            "subscribedKw": args.souscrite,
            "priceHp": args.prix_hp,
            "priceHc": args.prix_hc,
            "hcStart": hc_start,
            "hcEnd": hc_end,
            "subscriptionMonthly": args.abonnement,
            "overrunPerKw": args.penalite,
        },
    }

    out = args.out
    if out is None:
        slug = re.sub(r"[^a-z0-9]+", "-", (args.client or args.csv.stem).lower()).strip("-")
        out = ROOT / "livrables" / f"{today:%Y-%m-%d}_{slug}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(args.csv, config), encoding="utf-8")
    print(f"{out}  ({out.stat().st_size / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()
