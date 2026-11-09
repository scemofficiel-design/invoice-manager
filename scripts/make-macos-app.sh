#!/bin/sh
# Crée « Invoice Manager.app » (raccourci à placer dans le Dock ou le dossier Applications).
# L'application ouvre une fenêtre Terminal qui exécute le lanceur ; fermer cette fenêtre arrête le serveur.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/Invoice Manager.app"
rm -rf "$OUT"
osacompile -o "$OUT" -e "tell application \"Terminal\"
  activate
  do script \"cd \" & quoted form of \"$DIR\" & \" && ./Invoice\\\\ Manager.command\"
end tell"
echo "Créé : $OUT"
