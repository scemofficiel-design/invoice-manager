# Invoice Manager

Gestion commerciale et facturation multi-entreprises **pour iPhone** : clients, catalogue, devis,
factures, paiements, reçus, PDF, tableaux de bord, recherche.

**Toutes les données restent sur l'appareil.** GitHub ne sert qu'à héberger l'application (le code) ;
aucune facture, aucun client ni aucun PDF n'est jamais envoyé sur Internet.

**Application** : https://scemofficiel-design.github.io/invoice-manager/

## Installer sur l'iPhone

1. Ouvrez le lien ci-dessus dans **Safari**.
2. Touchez **Partager** → **Sur l'écran d'accueil**.
3. Lancez l'application depuis son icône **avant** de saisir vos données (Safari et l'application
   installée ont des stockages séparés).

L'application fonctionne ensuite **hors connexion**.

## Créer des fichiers sur le téléphone

- **PDF** (devis, factures, reçus) : bouton « PDF » → feuille de partage d'iOS : aperçu, Imprimer,
  Enregistrer dans Fichiers / iCloud Drive, Mail, AirDrop.
- **Sauvegarde** : Administration → Sauvegardes → « Exporter une sauvegarde » crée un fichier `.sqlite`
  contenant tout (PDF compris). Enregistrez-le dans iCloud Drive. « Choisir un fichier de sauvegarde »
  restaure ; « Annuler la dernière restauration » revient en arrière.

⚠️ Supprimer l'icône de l'écran d'accueil ou effacer les données de Safari efface aussi les données
de l'application : **exportez une sauvegarde régulièrement** (un rappel s'affiche après 7 jours).

## Mettre à jour l'application

Chaque `git push` sur `main` déclenche [la publication automatique](.github/workflows/pages.yml) :
vérification des types, tests, compilation, mise en ligne sur GitHub Pages. L'iPhone récupère la
nouvelle version au lancement suivant ; les données sur l'appareil sont conservées (le schéma de la
base est mis à jour automatiquement).

## Développement

Prérequis : Node.js 22+ et npm.

| Commande | Effet |
|---|---|
| `npm install` | Installe les dépendances |
| `npm run dev` | Application en développement (http://127.0.0.1:5173) |
| `npm run build` | Compile l'application (`BASE_PATH=/invoice-manager/` pour GitHub Pages) |
| `npm test` | Tests unitaires et d'intégration du noyau métier (Vitest) |
| `npm run test:e2e` | Parcours complet dans Chromium, compilé comme sur GitHub Pages (Playwright) |
| `npm run typecheck` | Vérification TypeScript stricte |

## Organisation du code

| Dossier | Rôle |
|---|---|
| `shared/` | Calcul exact des montants et des taxes, schémas de validation, statuts, traductions |
| `backend/src/` | Noyau métier : règles (numérotation, factures figées, paiements…), schéma SQLite, modèles PDF. Exécuté **dans le navigateur** par l'application ; exposé aussi par un banc de test Node pour les tests d'intégration |
| `backend/migrations/` | Évolutions du schéma de la base (appliquées automatiquement sur l'appareil) |
| `frontend/src/local/` | Moteur local : SQLite (WebAssembly), stockage sur l'appareil, sauvegardes, PDF |
| `frontend/src/` | Interface (React) |

Conception détaillée : [ARCHITECTURE.md](ARCHITECTURE.md) · Guide d'utilisation : [docs/GUIDE.md](docs/GUIDE.md).
