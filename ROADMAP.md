# Invoice Manager — Feuille de route

> Chaque phase se termine par : tests verts, vérification terminal + navigateur, commit Git, **validation de votre part** avant la phase suivante.
> Aucun module n'est « terminé » sans tests. Aucun bouton sans action. Aucune donnée simulée présentée comme réelle.

Légende : ☐ à faire · ◐ en cours · ☑ terminé

---

## Phase 1 — Analyse et architecture ☑

- ☑ Examen de l'environnement (Node 24, Git, disque, RAM)
- ☑ ARCHITECTURE.md : architecture, schéma de données, règles métier, sécurité, risques
- ☑ ROADMAP.md
- ☑ **Validation de l'architecture par vous** (2026-11-09)
- ☐ Configuration de l'identité Git + commit initial

**Sortie** : décisions validées (ou amendées) dans ARCHITECTURE.md §12.

---

## Phase 2 — Socle technique ☑ (validé le 2026-11-09)

État au 2026-11-09 : 2.1 à 2.12 réalisés — 53 tests verts (moteur fiscal, isolation, auth, triggers, numérotation), typage strict OK, vérifié dans le navigateur (clair/sombre, mobile). Écart : le lanceur macOS reste en 5.6 comme prévu ; `npm run backup` (sauvegarde cohérente) est déjà opérationnel.

| # | Étape | Détail | Tests de sortie |
|---|---|---|---|
| 2.1 | Monorepo | npm workspaces, TypeScript strict, ESLint/Prettier, `.gitignore`, versions figées | `npm install` OK ; **`better-sqlite3` chargé sur Intel/Node 24 (vérifié en premier)** |
| 2.2 | Configuration & profils | prod/dev/demo/test, répertoires de données, verrou d'instance | chemins résolus par profil |
| 2.3 | Base de données | schéma Drizzle complet, migrations, triggers d'immutabilité, FK composites, seed devises CAD/EUR/XOF | migration sur base vide ; triggers et FK testés |
| 2.4 | `shared/money` + `shared/tax` | moteur de calcul pur (BigInt, remises, taxes simples/composées, TTC, arrondis) | **cas de référence** : TPS+TVQ, TVA 20 %/5,5 %, XOF, remise globale, TTC, exonéré/détaxé |
| 2.5 | Serveur Fastify | `createApp()`, erreurs normalisées, en-têtes de sécurité, `/api/health`, service des fichiers statiques | tests `inject` |
| 2.6 | Authentification | assistant de premier lancement, login/logout, sessions, rate-limit, `reset-password` | sessions expirées/invalidées, CSRF/Origin refusés |
| 2.7 | Journal d'audit | service + table append-only | UPDATE/DELETE refusés |
| 2.8 | Frontend & design system | Vite, Tailwind v4, shadcn/ui, police Inter locale, thème clair/sombre, i18n FR (+ clés EN), AppShell (sidebar, topbar), toasts, modales, états vides | build sans erreur, aucune requête externe |
| 2.9 | Entreprises | CRUD, logo, informations légales, devise, paramètres fiscaux/numérotation, accès utilisateurs | **isolation** : accès croisé → 404 |
| 2.10 | Activités | CRUD + archivage par entreprise | isolation |
| 2.11 | Taxes & devises | taxes configurables par entreprise (préréglages modifiables), ajout de devises | aucun taux codé en dur |
| 2.12 | Scripts | `dev`, `build`, `start`, `test` | démarrage propre, arrêt propre (SIGINT/SIGTERM) |

**Sortie** : on peut se connecter, créer deux entreprises isolées avec activités et taxes, en clair et en sombre.

---

## Phase 3 — Gestion commerciale ☑ (validé le 2026-11-09)

État au 2026-11-09 : 3.1 à 3.9 réalisés — 81 tests verts (dont 28 sur le parcours commercial : isolation, conversion idempotente sous appels concurrents, numérotation sans trou, paiements partiels, idempotence, annulations, XOF). Parcours vérifié dans le navigateur : client → catalogue → devis → envoi → acceptation → conversion (double clic : une seule facture) → émission → paiement partiel → reçu. Reçu imprimable via le navigateur en attendant le modèle PDF (4.1).

| # | Étape | Détail | Tests de sortie |
|---|---|---|---|
| 3.1 | Clients | CRUD, archivage, recherche, fiche avec historique (devis, factures, paiements, solde) | isolation ; solde correct |
| 3.2 | Catalogue | produits/prestations, SKU unique, activité, taxes par défaut, archivage, recherche, sélecteur rapide | modification de prix sans effet rétroactif |
| 3.3 | Numérotation | motifs configurables, remise à zéro annuelle, séquence transactionnelle | unicité, continuité, changement d'année |
| 3.4 | Éditeur de lignes | composant partagé devis/facture : catalogue + lignes libres, quantités, remises, taxes, totaux en direct (aperçu) | recalcul backend identique à l'aperçu |
| 3.5 | Devis | éditeur, statuts et transitions, duplication, modification en brouillon uniquement | transitions interdites refusées |
| 3.6 | Conversion devis → facture | transactionnelle, idempotente, référence conservée | **double appel = une seule facture** |
| 3.7 | Factures | éditeur, émission (numéro + snapshots), statuts dérivés, annulation motivée, duplication, suppression brouillon seulement | facture émise non modifiable (API **et** trigger) |
| 3.8 | Paiements | partiels/multiples, solde restant, contrôles (devise, montant ≤ solde, facture émise), annulation motivée, idempotence | paiement > solde refusé ; statut Payée/Partiellement payée correct |
| 3.9 | Reçus | générés dans la même transaction, partiels/intégraux, annulation liée au paiement | numérotation ; solde avant/après |

**Sortie** : cycle complet client → devis → facture → paiements partiels → reçus, testé de bout en bout.

---

## Phase 4 — Documents et rapports ☑

Livré le 2026-11-09 : PDF devis/facture/reçu (archivage SHA-256, filigranes, multi-pages, accord des unités), tableaux de bord entreprise et consolidé (par devise, conversion explicite), recherche globale ⌘K, filtres par période. Vérifié dans le navigateur.

| # | Étape | Détail | Tests de sortie |
|---|---|---|---|
| 4.1 | PDF | modèles Devis, Facture, Reçu (pdfmake) : logo, identité, mentions fiscales, client, tableau multi-pages, récap taxes, conditions, notes, pied de page ; filigrane « BROUILLON » / « ANNULÉ » | PDF valide, contenu attendu, multi-pages |
| 4.2 | Aperçu / téléchargement / impression | visionneuse intégrée, téléchargement, impression navigateur | — |
| 4.3 | Archivage PDF | PDF figé à l'émission, rangé `documents/<entreprise>/<type>/<année>/`, SHA-256 | hash vérifié à la relecture |
| 4.4 | Dashboard entreprise | CA, encaissé, en attente, nb factures/devis, clients actifs, top clients, évolution mensuelle, taxes facturées — **par devise** | agrégats exacts sur jeu de test |
| 4.5 | Dashboard général | nb entreprises, CA consolidé par devise, émises/payées/impayées, devis en attente, évolution, répartition par entreprise ; vue convertie optionnelle avec taux affichés | **jamais de somme multi-devises sans conversion explicite** |
| 4.6 | Taux de change | saisie manuelle, historique, utilisés uniquement par les rapports | documents inchangés après modification d'un taux |
| 4.7 | Archives & recherche | filtres (période, statut, client, activité, devise), recherche globale FTS5 (Cmd+K) | aucun résultat d'une entreprise non autorisée |

---

## Phase 5 — Stabilisation ☑

Livré le 2026-11-09 : sauvegardes (rotation GFS, contrôle d'espace, export .tar.gz, restauration UI + CLI vérifiée), données de démo (`npm run demo`), lanceur macOS + générateur d'app, revue de sécurité (tests dédiés, permissions 0600/0700, audit npm), 8 étapes Playwright, documentation, mesures de performance (≈ 80 Mo, démarrage ≈ 2 s).

| # | Étape | Détail |
|---|---|---|
| 5.1 | Sauvegardes | automatiques (démarrage, quotidienne, pré-migration, pré-restauration), rotation, contrôle d'espace disque, `npm run backup`, export `.tar.gz` |
| 5.2 | Restauration | UI admin + `npm run restore`, vérifications (hash, intégrité, schéma), sauvegarde de sécurité, remplacement atomique |
| 5.3 | Tests E2E Playwright | parcours complets (setup, entreprise, client, devis, conversion, facture, paiements, reçu, PDF, sauvegarde/restauration) |
| 5.4 | Revue de sécurité | CSP, cookies, CSRF, entrées, chemins de fichiers, journal d'audit, audit `npm audit` |
| 5.5 | Données de démonstration | `npm run demo` : base séparée, bandeau DÉMO, jeux CAD/EUR/XOF |
| 5.6 | Lanceur macOS | `Invoice Manager.command` (build si besoin, démarrage, attente `/api/health`, ouverture du navigateur, arrêt propre) + option `.app` |
| 5.7 | Documentation | README (installation, utilisation, sauvegarde/restauration, dépannage), guide utilisateur, ADR à jour |
| 5.8 | Performance | mesure mémoire/temps de démarrage sur la machine cible |

**Sortie V1** : logiciel local utilisable au quotidien, sauvegardé, documenté. ☑

---

## V2 — Application 100 % iPhone ☑ (2026-11-14)

- Noyau métier rendu indépendant de Node et exécuté dans le navigateur (SQLite WebAssembly).
- Données uniquement sur l'appareil ; PDF et sauvegardes via la feuille de partage iOS.
- Application installable sur l'écran d'accueil, hors connexion, publiée sur GitHub Pages par GitHub Actions.
- Retirés : serveur Mac, lanceur, comptes et multi-utilisateurs, sauvegardes serveur.

## Après la V1 (non planifié)

- Notes de crédit / avoirs, remboursements, trop-perçus
- Facturation électronique structurée (Factur-X / UBL) — **prioritaire si une entreprise est en France**
- Modèles PDF personnalisables
- Langue anglaise complète
- Mode réseau local sécurisé (HTTPS, opt-in)
- Empaquetage desktop (Electron/Tauri) réutilisant `createApp()`
- Factures récurrentes, relances, import/export CSV comptable
