# Guide d'utilisation

## 1. Premiers pas

1. Lancez l'application (double-clic sur `Invoice Manager.command`).
2. Créez le **compte propriétaire** : nom de l'organisation, votre nom, adresse, mot de passe (10 caractères minimum, lettres et chiffres).
3. Créez votre première **entreprise** : raison sociale, devise principale, et un **préréglage fiscal** (TPS+TVQ, TVH, TVA France, TVA UEMOA ou aucune taxe). Les taux restent modifiables ; faites-les valider par votre comptable.
4. Dans **Paramètres** de l'entreprise : logo, coordonnées bancaires, conditions par défaut, pied de page légal, numéros d'inscription des taxes (ils apparaissent sur les factures).

Chaque entreprise est **totalement isolée** : clients, catalogue, documents et numérotation lui sont propres. Changez d'entreprise avec le sélecteur en haut de la barre latérale.

## 2. Clients et catalogue

- **Clients** : particulier ou entreprise, coordonnées, identifiants fiscaux, devise préférée. Un client **exonéré** (avec sa référence) reçoit automatiquement des documents sans taxes. La fiche client montre ses devis, factures, paiements et son **solde par devise**.
- **Catalogue** : produits et prestations avec prix, devise, unité, taxes et activité. Modifier un prix n'a **aucun effet** sur les documents déjà créés.

## 3. Devis

1. **Devis → Nouveau devis**, choisissez le client.
2. Ajoutez des lignes depuis le catalogue ou des lignes libres. Quantités décimales acceptées (`1,5`). Remise par ligne (% ou montant) et remise globale.
3. Les totaux s'affichent en direct ; le serveur les recalcule à l'enregistrement.
4. Cycle : **Brouillon → Envoyé → Accepté / Refusé**. Un devis envoyé dont la date de validité est dépassée apparaît **Expiré**.
5. Un devis accepté se **convertit en facture** (brouillon) en gardant la référence du devis. Un double clic ne crée jamais deux factures.

## 4. Factures

- Une facture **brouillon** est librement modifiable, n'a pas encore de numéro et peut être supprimée.
- **Émettre** attribue le numéro définitif (séquence sans trou), fige les coordonnées du client et de l'entreprise, et **archive le PDF** avec une empreinte de contrôle. La facture ne peut plus être modifiée ni supprimée.
- Statuts : Émise, Partiellement payée, Payée, **En retard** (échéance dépassée), Annulée.
- **Corriger une facture émise** : l'annuler (motif obligatoire, journalisé ; les paiements doivent d'abord être annulés), puis **Dupliquer** pour créer un nouveau brouillon corrigé. Les notes de crédit sont prévues dans une version ultérieure.

## 5. Paiements et reçus

- Sur une facture émise : **Enregistrer un paiement** (montant, date, mode, référence). Paiements partiels et multiples acceptés ; un paiement supérieur au solde est refusé.
- Chaque paiement génère un **reçu** numéroté (partiel ou intégral, avec solde avant/après) et son PDF archivé.
- Une erreur ? **Annulez le paiement** (motif obligatoire) : il reste visible, son reçu est marqué « ANNULÉ » et le solde de la facture est rétabli.

## 6. PDF

Boutons **Aperçu PDF** (s'ouvre dans le navigateur, d'où vous pouvez imprimer) et **Télécharger**.
Les PDF des factures émises et des reçus sont archivés dans le dossier de données
(`documents/companies/<entreprise>/invoices/<année>/`). Le PDF archivé est l'original : il est resservi
à l'identique et son intégrité est vérifiée à chaque ouverture.

## 7. Tableaux de bord et recherche

- **Accueil** : vue consolidée de toutes vos entreprises. Les montants restent **dans leur devise d'origine**. Pour une vue convertie, choisissez une devise dans « Convertir en » : les taux saisis dans **Devises et taux** sont utilisés et affichés avec leur date. Les factures ne sont jamais converties.
- **Vue d'ensemble** d'une entreprise : chiffre d'affaires HT, encaissé, en attente, en retard, évolution mensuelle, meilleurs clients, taxes facturées, sur la période choisie.
- **Recherche globale** : `⌘K` (ou le champ « Rechercher ») trouve clients, factures, devis, articles et références de paiement, sans tenir compte des accents.

## 8. Utilisateurs et accès

Le propriétaire crée des utilisateurs (**Administration → Utilisateurs**) et leur donne accès entreprise par entreprise (**Paramètres → Accès**) : *Lecteur* (consultation), *Éditeur* (clients, catalogue, documents, paiements), *Administrateur* (paramètres, annulations).

## 9. Sauvegardes et restauration

- **Administration → Sauvegardes** : sauvegarder maintenant, exporter une archive complète (base + PDF), choisir le dossier d'export (idéalement un disque externe) et la durée de conservation.
- **Restaurer** : choisissez une sauvegarde, retapez son nom pour confirmer. L'état actuel est d'abord sauvegardé automatiquement ; vous devrez ensuite vous reconnecter.
- En ligne de commande (application arrêtée) : `npm run restore -- <nom-ou-archive.tar.gz>`.

## 10. Journal

**Administration → Journal** : historique non modifiable de toutes les opérations (connexions, créations, émissions, annulations, paiements, sauvegardes, restaurations).
