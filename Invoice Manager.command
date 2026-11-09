#!/bin/bash
# Lanceur macOS : double-cliquez sur ce fichier dans le Finder.
# Installe les dépendances au premier lancement, compile si nécessaire, démarre l'application
# et ouvre le navigateur. Fermez cette fenêtre (ou Ctrl+C) pour arrêter proprement le serveur.
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "Invoice Manager" message "Node.js est introuvable. Installez Node.js 22 ou plus récent (https://nodejs.org), puis relancez."'
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installation des dépendances (première utilisation)…"
  npm install --no-audit --no-fund || { echo "Échec de l'installation."; read -r -p "Appuyez sur Entrée pour fermer."; exit 1; }
fi
trap 'echo; echo "Arrêt d’Invoice Manager…"' INT TERM
node scripts/start.mjs "$@"
status=$?
if [ $status -ne 0 ]; then read -r -p "Une erreur est survenue (code $status). Appuyez sur Entrée pour fermer."; fi
exit $status
