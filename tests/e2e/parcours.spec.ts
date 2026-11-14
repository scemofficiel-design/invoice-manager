import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';

/** Parcours complet de l'application iPhone (données dans le navigateur uniquement). */
test.describe.configure({ mode: 'serial' });

let page: Page;
let backupPath = '';

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
});
test.afterAll(() => page.close());

const nav = (name: string) => page.locator('aside nav').first().getByRole('link', { name, exact: true });

test('premier lancement sans compte ni mot de passe', async () => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel('Nom de l’organisation').fill('Organisation E2E');
  await page.getByLabel('Votre nom').fill('Testeur E2E');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('heading', { name: 'Entreprises' })).toBeVisible();
});

test('entreprise, client et devis avec remise', async () => {
  await page.getByRole('link', { name: 'Nouvelle entreprise' }).first().click();
  await page.getByLabel('Raison sociale *').fill('Studio E2E inc.');
  await page.getByLabel('Taxes initiales').selectOption('ca-qc');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('heading', { name: 'Studio E2E inc.' })).toBeVisible();

  await nav('Clients').click();
  await page.getByRole('button', { name: 'Nouveau client' }).first().click();
  await page.getByLabel('Nom ou raison sociale *').fill('Client E2E');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Client E2E' })).toBeVisible();

  await page.getByRole('link', { name: 'Nouveau devis' }).click();
  await page.getByRole('button', { name: 'Ajouter une ligne libre' }).click();
  await page.getByLabel('Désignation').fill('Conseil stratégique');
  await page.getByLabel('Prix unit.').fill('1000');
  await page.getByRole('combobox', { name: 'Remise', exact: true }).selectOption('percent');
  await page.getByRole('textbox', { name: 'Remise', exact: true }).fill('10');
  await expect(page.getByText(/1\s034,78\s\$/).first()).toBeVisible(); // 900 + TPS 45 + TVQ 89,78
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).first().click();
  await expect(page.getByRole('heading', { name: /DEV-\d{4}-0001/ })).toBeVisible();
});

test('conversion idempotente, émission et PDF généré dans l’appareil', async () => {
  await page.getByRole('button', { name: 'Marquer comme envoyé' }).click();
  await page.getByRole('button', { name: 'Accepté' }).click();
  await page.getByRole('button', { name: 'Convertir en facture' }).dblclick();
  await expect(page.getByText(/Issue du devis DEV-/)).toBeVisible();
  await page.getByRole('button', { name: 'Émettre la facture' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Émettre la facture' }).click();
  await expect(page.getByRole('heading', { name: /FAC-\d{4}-00001/ })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger le PDF' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^FAC-\d{4}-00001\.pdf$/);
  const pdf = readFileSync((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(5000);

  await nav('Factures').click();
  await expect(page.getByRole('row')).toHaveCount(2); // en-tête + une seule facture
});

test('paiement partiel et reçu', async () => {
  await page.getByRole('link', { name: /FAC-\d{4}-00001/ }).click();
  await page.getByRole('button', { name: 'Enregistrer un paiement' }).click();
  await page.getByLabel(/Montant \(CAD\)/).fill('500');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Partiellement payée')).toBeVisible();
  await page.getByRole('link', { name: /REC-\d{4}-00001/ }).click();
  await expect(page.getByText('Paiement partiel')).toBeVisible();
});

test('dossier client : import d’anciennes factures et informations', async () => {
  await nav('Clients').click();
  await page.getByRole('link', { name: 'Client E2E' }).click();
  const pdf = (n: string) => ({ name: n, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${n}\n%%EOF`) });
  await page.locator('#documents input[type=file]').setInputFiles([pdf('Facture-2023-041.pdf'), pdf('Facture-2023-052.pdf')]);
  await expect(page.getByText('2 document(s) importé(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Compléter les informations' }).first().click();
  await page.getByLabel('Numéro').fill('2023-041');
  await page.getByLabel('Montant').fill('250');
  await page.getByLabel('Statut').selectOption('no');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('#documents').getByText(/Reste dû \(déclaré\).*250,00\s\$/)).toBeVisible();
  // Les anciennes factures restent à part : la liste des factures de l'app est inchangée.
  await nav('Dossiers clients').click();
  await expect(page.getByRole('link', { name: /Client E2E.*2 document\(s\)/ })).toBeVisible();
  await page.getByRole('link', { name: /Client E2E/ }).first().click();
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter le dossier (ZIP)' }).click()]);
  expect(zip.suggestedFilename()).toBe('Client E2E.zip');
  const entries = Object.keys(unzipSync(new Uint8Array(readFileSync((await zip.path())!))));
  expect(entries.some((e) => e.startsWith('Factures importées/'))).toBe(true);
  expect(entries.some((e) => e.startsWith('Factures émises/FAC-'))).toBe(true);
});

test('les données survivent au rechargement', async () => {
  await page.reload();
  await expect(page.locator('#documents').getByText('2023-041', { exact: true })).toBeVisible();
  await nav('Accueil').click();
  await expect(page.getByText(/900,00\s\$/).first()).toBeVisible();
});

test('export de la sauvegarde (ZIP : base + documents importés)', async () => {
  await nav('Sauvegardes').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter une sauvegarde' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^invoice-manager-sauvegarde-\d{4}-\d{2}-\d{2}\.zip$/);
  backupPath = (await download.path())!;
  const entries = unzipSync(new Uint8Array(readFileSync(backupPath)));
  expect(new TextDecoder().decode(entries['invoice-manager.sqlite']!.subarray(0, 15))).toBe('SQLite format 3');
  expect(Object.keys(entries).filter((e) => e.startsWith('fichiers/'))).toHaveLength(2);
  await expect(page.getByText('Aucune sauvegarde exportée')).toHaveCount(0);
});

test('restauration depuis le fichier', async () => {
  // Modification postérieure à la sauvegarde…
  await nav('Accueil').click();
  await page.getByRole('link', { name: /Studio E2E/ }).first().click();
  await nav('Clients').click();
  await page.getByRole('button', { name: 'Nouveau client' }).first().click();
  await page.getByLabel('Nom ou raison sociale *').fill('Client après sauvegarde');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Client après sauvegarde' })).toBeVisible();
  // … annulée par la restauration.
  await nav('Sauvegardes').click();
  await page.locator('input[type=file]').setInputFiles(backupPath);
  await expect(page.getByText(/1 entreprise\(s\), 1 client\(s\), 1 facture\(s\), 2 document\(s\) importé\(s\)/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurer' }).click();
  await page.waitForLoadState('load');
  await nav('Accueil').click();
  await page.getByRole('link', { name: /Studio E2E/ }).first().click();
  await nav('Clients').click();
  await expect(page.getByRole('link', { name: 'Client E2E' })).toBeVisible();
  await expect(page.getByText('Client après sauvegarde')).toHaveCount(0);
  await page.getByRole('link', { name: 'Client E2E' }).click();
  await expect(page.locator('#documents').getByText('2023-041', { exact: true })).toBeVisible();
  await nav('Sauvegardes').click();
  await expect(page.getByRole('button', { name: 'Annuler la dernière restauration' })).toBeVisible();
});

test('fonctionne hors connexion (application en cache)', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // la page est désormais contrôlée par le service worker
  await page.context().setOffline(true);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Entreprises' })).toBeVisible();
  await page.context().setOffline(false);
});
