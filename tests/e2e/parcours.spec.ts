import { expect, test, type Page } from '@playwright/test';

/** Parcours complet d'un utilisateur, exécuté dans l'ordre sur une base vierge. */
test.describe.configure({ mode: 'serial' });

const OWNER = { email: 'proprietaire@e2e.test', password: 'e2e-motdepasse-2026' };
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
});
test.afterAll(() => page.close());

test('configuration initiale du compte propriétaire', async () => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel('Nom de l’organisation').fill('Organisation E2E');
  await page.getByLabel('Votre nom').fill('Testeur E2E');
  await page.getByLabel('Adresse électronique').fill(OWNER.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(OWNER.password);
  await page.getByLabel('Confirmer le mot de passe').fill(OWNER.password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Entreprises' })).toBeVisible();
});

test('création d’une entreprise (préréglage Québec)', async () => {
  await page.getByRole('link', { name: 'Nouvelle entreprise' }).first().click();
  await page.getByLabel('Raison sociale *').fill('Studio E2E inc.');
  await page.getByLabel('Ville').fill('Montréal');
  await page.getByLabel('Taxes initiales').selectOption('ca-qc');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('heading', { name: 'Studio E2E inc.' })).toBeVisible();
  await page.getByRole('link', { name: 'Taxes', exact: true }).click();
  await expect(page.getByRole('cell', { name: '9,975 %' })).toBeVisible();
});

test('client puis devis avec remise', async () => {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
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
  // 1 000 − 10 % = 900 ; TPS 45 ; TVQ 89,78 → 1 034,78
  await expect(page.getByText(/1\s034,78\s\$/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).first().click();
  await expect(page.getByRole('heading', { name: /DEV-\d{4}-0001/ })).toBeVisible();
});

test('envoi, acceptation et conversion idempotente', async () => {
  await page.getByRole('button', { name: 'Marquer comme envoyé' }).click();
  await page.getByRole('button', { name: 'Accepté' }).click();
  await page.getByRole('button', { name: 'Convertir en facture' }).dblclick();
  await expect(page.getByText(/Issue du devis DEV-/)).toBeVisible();
  const list = await page.request.get(`${new URL(page.url()).pathname.replace(/\/c\/([^/]+)\/invoices\/.*/, '/api/v1/companies/$1/invoices')}`);
  expect((await list.json()).length).toBe(1);
});

test('émission, PDF archivé, paiement partiel et reçu', async () => {
  await page.getByRole('button', { name: 'Émettre la facture' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Émettre la facture' }).click();
  await expect(page.getByRole('heading', { name: /FAC-\d{4}-00001/ })).toBeVisible();

  const pdfHref = await page.getByRole('link', { name: 'Aperçu PDF' }).getAttribute('href');
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect(pdf.headers()['x-archived']).toBe('1');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  await page.getByRole('button', { name: 'Enregistrer un paiement' }).click();
  await page.getByLabel(/Montant \(CAD\)/).fill('500');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Partiellement payée')).toBeVisible();
  await expect(page.getByText(/534,78\s\$/).first()).toBeVisible();
  await page.getByRole('link', { name: /REC-\d{4}-00001/ }).click();
  await expect(page.getByText('Paiement partiel')).toBeVisible();
});

test('tableau de bord et recherche globale', async () => {
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByText(/900,00\s\$/).first()).toBeVisible(); // CA HT
  await page.keyboard.press('Meta+k');
  await page.getByPlaceholder(/Rechercher clients/).fill('client e2e');
  await expect(page.getByRole('option').first()).toContainText('Client E2E');
  await page.keyboard.press('Escape');
});

test('sauvegarde depuis l’administration', async () => {
  await page.getByRole('link', { name: 'Sauvegardes', exact: true }).click();
  await page.getByRole('button', { name: 'Sauvegarder maintenant' }).click();
  await expect(page.getByText('Manuelle').first()).toBeVisible();
});

test('déconnexion puis reconnexion', async () => {
  await page.getByRole('button', { name: /Testeur E2E/ }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Adresse électronique').fill(OWNER.email);
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toContainText('Identifiants incorrects');
  await page.getByLabel('Mot de passe').fill(OWNER.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Entreprises' })).toBeVisible();
});
