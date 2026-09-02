"""Incrémente le numéro de version des fichiers CSS/JS (« cache-buster »).

    python3 scripts/bump_version.py          # v=1 -> v=2 partout
    python3 scripts/bump_version.py --show   # version courante

Pourquoi : servie par `python3 -m http.server` (le lanceur local), la page
n'reçoit aucun en-tête de cache et le navigateur garde ses anciens modules —
on modifie un fichier, l'écran ne bouge pas. Le suffixe `?v=N` sur CHAQUE
adresse de module force le rechargement. GitHub Pages gère correctement le
cache de son côté, mais un numéro identique partout ne coûte rien.

À lancer avant de committer une modification de js/ ou css/.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [ROOT / "index.html", *sorted((ROOT / "js").glob("*.js"))]
PATTERN = re.compile(r"(\.(?:js|css))\?v=(\d+)")


def current() -> int:
    versions = {int(m.group(2)) for f in TARGETS for m in PATTERN.finditer(f.read_text())}
    return max(versions) if versions else 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--show", action="store_true", help="affiche la version sans rien changer")
    args = parser.parse_args()

    version = current()
    if args.show:
        print(f"version courante : v={version}")
        return

    new = version + 1
    touched = 0
    for path in TARGETS:
        text = path.read_text()
        updated = PATTERN.sub(lambda m: f"{m.group(1)}?v={new}", text)
        if updated != text:
            path.write_text(updated)
            touched += 1
    print(f"v={version} -> v={new} ({touched} fichiers)")


if __name__ == "__main__":
    main()
