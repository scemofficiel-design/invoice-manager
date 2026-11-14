# Guide d'utilisation

## 1. Premiers pas

1. Ouvrez l'application dans Safari, puis **Partager → Sur l'écran d'accueil**, et lancez-la depuis son icône.
2. Indiquez le nom de votre organisation et votre nom. Il n'y a ni compte ni mot de passe : le verrouillage de votre iPhone protège l'accès.
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

Sur iPhone, le bouton **PDF** ouvre la feuille de partage d'iOS : aperçu, Imprimer, Enregistrer dans
Fichiers (iCloud Drive), Mail, AirDrop. Sur ordinateur : **Aperçu** et **Télécharger**.
Les PDF des factures émises et des reçus sont archivés dans la base de l'appareil au moment de
l'émission ou du paiement. Le PDF archivé est l'original : il est resservi à l'identique et son
intégrité est vérifiée à chaque ouverture.

## 7. Tableaux de bord et recherche

- **Accueil** : vue consolidée de toutes vos entreprises. Les montants restent **dans leur devise d'origine**. Pour une vue convertie, choisissez une devise dans « Convertir en » : les taux saisis dans **Devises et taux** sont utilisés et affichés avec leur date. Les factures ne sont jamais converties.
- **Vue d'ensemble** d'une entreprise : chiffre d'affaires HT, encaissé, en attente, en retard, évolution mensuelle, meilleurs clients, taxes facturées, sur la période choisie.
- **Recherche globale** : `⌘K` (ou le champ « Rechercher ») trouve clients, factures, devis, articles et références de paiement, sans tenir compte des accents.

## 7 bis. Dossiers clients (anciennes factures)

- **Dossiers clients** → choisissez le client → **Importer des factures** (plusieurs fichiers à la fois : PDF, photos JPEG/PNG/HEIC). Depuis la fiche d'un client, le bouton du dossier importe directement chez ce client.
- Touchez un document pour l'ouvrir (aperçu, impression, partage). **Compléter les informations** : numéro, date, montant, devise, payée ou non, notes, ou changer de client.
- Le dossier affiche le **reste dû déclaré** (documents marqués « non payée »), par devise. Ces documents ne se mélangent pas aux factures créées dans l'app.
- **Exporter le dossier (ZIP)** : anciennes factures et factures émises du client, dans un seul fichier.
- La recherche globale (⌘K) retrouve aussi les documents importés (nom, numéro, notes).

## 8. Sauvegardes et restauration

Vos données ne sont **que sur cet iPhone**. Supprimer l'icône de l'écran d'accueil ou effacer les données de Safari les efface.

- **Administration → Sauvegardes → Exporter une sauvegarde** : un fichier `.zip` contenant tout (PDF et documents importés compris) est créé ; choisissez « Enregistrer dans Fichiers » puis iCloud Drive. Un rappel s'affiche si la dernière sauvegarde date de plus de 7 jours.
- **Choisir un fichier de sauvegarde** : le fichier est vérifié, son contenu est affiché, puis il remplace les données actuelles après confirmation.
- **Annuler la dernière restauration** remet les données d'avant.
- Changer d'iPhone : exportez sur l'ancien, installez l'application sur le nouveau, restaurez le fichier.

## 9. Journal

**Administration → Journal** : historique non modifiable de toutes les opérations (connexions, créations, émissions, annulations, paiements, sauvegardes, restaurations).
