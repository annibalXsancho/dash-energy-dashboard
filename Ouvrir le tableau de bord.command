#!/bin/bash
# Double-cliquez ce fichier depuis le Finder : il démarre un petit serveur local
# et ouvre le tableau de bord dans votre navigateur.
#
# Pourquoi un serveur ? Le navigateur refuse à une page ouverte par double-clic
# de lire les fichiers voisins (dont le CSV de données). Ce serveur ne sert que
# ce dossier, uniquement à cet ordinateur (127.0.0.1) : rien n'est exposé au
# réseau.
#
# Pour arrêter : fermez cette fenêtre du Terminal, ou tapez Ctrl-C.

cd "$(dirname "$0")" || exit 1

PORT=$(python3 -c "
import socket
for port in range(4180, 4200):
    probe = socket.socket()
    try:
        probe.bind(('127.0.0.1', port))
    except OSError:
        continue
    else:
        print(port)
        break
    finally:
        probe.close()
")

if [ -z "$PORT" ]; then
  echo "Aucun port libre entre 4180 et 4199. Fermez les fenêtres du tableau de bord déjà ouvertes, puis réessayez."
  read -r -p "Appuyez sur Entrée pour fermer."
  exit 1
fi

URL="http://127.0.0.1:$PORT/"

printf '\n  Tableau de bord énergie\n'
printf '  %s\n\n' "$URL"
printf '  Laissez cette fenêtre ouverte tant que vous consultez le tableau de bord.\n'
printf '  Pour arrêter : fermez la fenêtre, ou Ctrl-C.\n\n'

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!

# Laisse au serveur le temps d'accepter la première connexion avant d'ouvrir
# le navigateur, sinon l'onglet s'ouvre sur une erreur de connexion.
sleep 1
open "$URL"

# Le serveur doit mourir avec cette fenêtre, quelle que soit la façon dont elle
# se termine : Ctrl-C, fermeture du Terminal (HUP), ou fin normale. Sans piège
# explicite sur ces signaux, bash est tué pendant le `wait` et laisse derrière
# lui un serveur orphelin qui occupe le port.
cleanup() {
  kill "$SERVER" 2>/dev/null
  wait "$SERVER" 2>/dev/null
}
trap cleanup EXIT INT TERM HUP

wait $SERVER
