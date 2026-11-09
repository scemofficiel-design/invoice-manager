# Invoice Manager

Logiciel **local** de gestion commerciale et de facturation multi-entreprises : clients, catalogue,
devis, factures, paiements, reçus, PDF, tableaux de bord, sauvegardes. Aucune donnée n'est envoyée
à un service externe.

- Guide d'utilisation : [docs/GUIDE.md](docs/GUIDE.md)
- Conception technique : [ARCHITECTURE.md](ARCHITECTURE.md) · Avancement : [ROADMAP.md](ROADMAP.md)

## Installation

Prérequis : **Node.js 22 ou plus récent** (développé avec Node 24) et npm. Aucun autre logiciel.

```bash
npm install
```

## Démarrer

| Méthode | Effet |
|---|---|
| Double-clic sur **`Invoice Manager.command`** (Finder) | Installe si besoin, compile, démarre, ouvre le navigateur. Fermer la fenêtre arrête l'application. |
| `npm start` | Idem en ligne de commande (http://127.0.0.1:4300). `npm start -- --no-open` pour ne pas ouvrir le navigateur. |
| `npm run make-app` | Crée **Invoice Manager.app** (à glisser dans le Dock ou Applications). À relancer si le dossier du projet est déplacé. |
| `npm run demo` | Version de **démonstration** sur une base séparée, avec bandeau « DÉMO ». Identifiant `demo@demo.invoice-manager.test`, mot de passe `demo-invoice-2026`. |

Au premier lancement, l'application demande de créer le **compte propriétaire** (il n'existe aucun mot de passe par défaut).

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Développement : API (127.0.0.1:4310) + interface avec rechargement à chaud (http://127.0.0.1:5173), profil **dev** |
| `npm run build` | Compile l'interface et le serveur |
| `npm test` | Tests unitaires et d'intégration (Vitest) |
| `npm run test:e2e` | Parcours de bout en bout dans Chromium (Playwright), sur une base jetable |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm run backup` | Sauvegarde cohérente de la base (sûre pendant l'utilisation) |
| `npm run backup -- --export [dossier]` | Export complet `.tar.gz` (base + PDF) — par exemple vers un disque externe |
| `npm run restore` | Liste les sauvegardes ; `npm run restore -- <nom \| archive.tar.gz>` restaure (application arrêtée) |
| `npm run reset-password -- email@exemple` | Génère un mot de passe temporaire pour un utilisateur |

Les commandes s'appliquent au profil **prod** ; préfixez par `IM_PROFILE=demo` ou `IM_PROFILE=dev` pour un autre profil.

## Où sont mes données ?

Hors du code source (elles survivent aux mises à jour), dans `~/Library/Application Support/` :

| Dossier | Profil |
|---|---|
| `InvoiceManager/` | données réelles (`npm start`, lanceur) |
| `InvoiceManager-dev/` | développement (`npm run dev`) |
| `InvoiceManager-demo/` | démonstration (`npm run demo`) |

Chaque dossier contient `data/` (base SQLite), `documents/` (PDF archivés des factures émises et des
reçus), `backups/` (sauvegardes) et `exports/`. Variable `INVOICE_MANAGER_DATA_DIR` pour un autre emplacement.

**Sauvegardes** : automatiques au démarrage puis toutes les 24 h (7 quotidiennes, 4 hebdomadaires,
12 mensuelles), avant chaque mise à jour de la base et avant chaque restauration. Elles sont sur le
même disque que les données : exportez régulièrement vers un disque externe (Administration →
Sauvegardes → Exporter) et activez Time Machine.

## Sécurité

- Écoute uniquement sur `127.0.0.1` ; le mode réseau local est désactivé.
- Mots de passe chiffrés (scrypt), sessions expirantes, protection CSRF, limitation des tentatives de connexion.
- Fichiers de données accessibles uniquement à votre compte macOS.
- Factures émises, paiements et journal d'audit protégés contre la modification **au niveau de la base**.

## Mise à jour

Remplacez le code (ou `git pull`), puis `npm install` et relancez : les migrations de la base sont
appliquées automatiquement, après une sauvegarde de sécurité.

## Dépannage

| Symptôme | Solution |
|---|---|
| « Invoice Manager est déjà en cours d'exécution » | Une autre fenêtre l'exécute déjà ; fermez-la. |
| Page blanche après une mise à jour | Relancez l'application (le serveur ne voit les nouveaux fichiers qu'au démarrage). |
| Mot de passe oublié | `npm run reset-password -- votre@adresse` |
| « Espace disque insuffisant » | Libérez de l'espace (au moins 200 Mo) ; `npm cache clean --force` libère souvent plusieurs Go. |
