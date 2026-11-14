import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blobStore } from '../files/blob-store';
import { Client, companyInput, makeApp, setupOwner, type TestCtx } from '../../test/helpers';

let ctx: TestCtx;
let c: Client;
let cid: string;
let clientA: string;
let clientB: string;
const PDF = Buffer.from('%PDF-1.4\n% ancienne facture\n1 0 obj << >> endobj\n%%EOF').toString('base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString('base64');
const HEIC = Buffer.from([0, 0, 0, 24, ...Buffer.from('ftypheic'), 0, 0, 0, 0]).toString('base64');

beforeEach(async () => {
  ctx = await makeApp();
  c = await setupOwner(ctx.app);
  cid = (await c.post('/companies', companyInput('Studio'))).json().id;
  clientA = (await c.post(`/companies/${cid}/clients`, { name: 'Client Alpha' })).json().id;
  clientB = (await c.post(`/companies/${cid}/clients`, { name: 'Client Bêta' })).json().id;
});
afterEach(() => ctx.close());

const upload = (clientId: string, body: Record<string, unknown>) => c.post(`/companies/${cid}/clients/${clientId}/documents`, body);
const file = (path: string) => ctx.app.inject({ method: 'GET', url: `/api/v1${path}`, headers: { cookie: `im_session=${c.cookie}` } });

describe('dossiers clients : anciennes factures importées', () => {
  it('importe un PDF avec ses informations, rangé dans le dossier du client', async () => {
    const r = await upload(clientA, { fileName: 'Facture 2024-017.pdf', dataBase64: PDF, number: '2024-017', docDate: '2024-03-15', amountMinor: 125000, currency: 'CAD', paid: false });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ clientId: clientA, clientName: 'Client Alpha', mime: 'application/pdf', number: '2024-017', amountMinor: 125000, currency: 'CAD', paid: false, fileName: 'Facture_2024-017.pdf' });
    const list = (await c.get(`/companies/${cid}/documents?clientId=${clientA}`)).json();
    expect(list).toHaveLength(1);
    expect((await c.get(`/companies/${cid}/documents?clientId=${clientB}`)).json()).toHaveLength(0);
    const f = await file(`/companies/${cid}/documents/${r.json().id}/file`);
    expect(f.headers['content-type']).toBe('application/pdf');
    expect(f.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('accepte les photos iPhone (HEIC) et JPEG, refuse les autres formats', async () => {
    expect((await upload(clientA, { fileName: 'IMG_0001.HEIC', dataBase64: HEIC })).json().mime).toBe('image/heic');
    expect((await upload(clientA, { fileName: 'scan.jpg', dataBase64: JPEG })).json().mime).toBe('image/jpeg');
    expect((await upload(clientA, { fileName: 'virus.exe', dataBase64: Buffer.from('MZ\x90\x00').toString('base64') })).json().error.code).toBe('UNSUPPORTED_FILE');
    expect((await upload(clientA, { fileName: 'vide.pdf', dataBase64: '' })).json().error.code).toBe('EMPTY_FILE');
  });

  it('les informations sont facultatives mais cohérentes', async () => {
    const d = (await upload(clientA, { fileName: 'a.pdf', dataBase64: PDF })).json();
    expect(d).toMatchObject({ number: null, amountMinor: null, paid: null });
    expect((await upload(clientA, { fileName: 'b.pdf', dataBase64: PDF, amountMinor: 100 })).statusCode).toBe(400); // montant sans devise
    const u = await c.patch(`/companies/${cid}/documents/${d.id}`, { number: 'F-9', amountMinor: 5000, currency: 'EUR', paid: true });
    expect(u.json()).toMatchObject({ number: 'F-9', amountMinor: 5000, currency: 'EUR', paid: true });
  });

  it('déplacement vers un autre client et suppression (fichier effacé aussi)', async () => {
    const d = (await upload(clientA, { fileName: 'a.pdf', dataBase64: PDF })).json();
    expect((await c.patch(`/companies/${cid}/documents/${d.id}`, { clientId: clientB })).json().clientName).toBe('Client Bêta');
    expect(await blobStore().get(d.id)).toBeDefined();
    expect((await c.del(`/companies/${cid}/documents/${d.id}`)).statusCode).toBe(204);
    expect(await blobStore().get(d.id)).toBeUndefined();
    const audit = (await c.get(`/admin/audit?companyId=${cid}`)).json();
    expect(audit.some((e: { action: string }) => e.action === 'document_delete')).toBe(true);
  });

  it('isolation : un dossier client d’une autre entreprise est inaccessible', async () => {
    const other = (await c.post('/companies', companyInput('Autre'))).json().id;
    const foreignClient = (await c.post(`/companies/${other}/clients`, { name: 'Étranger' })).json().id;
    expect((await upload(foreignClient, { fileName: 'x.pdf', dataBase64: PDF })).statusCode).toBe(404);
    const d = (await upload(clientA, { fileName: 'a.pdf', dataBase64: PDF })).json();
    expect((await file(`/companies/${other}/documents/${d.id}/file`)).statusCode).toBe(404);
    expect((await c.patch(`/companies/${cid}/documents/${d.id}`, { clientId: foreignClient })).statusCode).toBe(404);
  });

  it('détecte un fichier altéré', async () => {
    const d = (await upload(clientA, { fileName: 'a.pdf', dataBase64: PDF })).json();
    await blobStore().put(d.id, new Uint8Array([37, 80, 68, 70, 45, 0]));
    expect((await file(`/companies/${cid}/documents/${d.id}/file`)).json().error.code).toBe('INTEGRITY_ERROR');
  });

  it('séparé des factures de l’application et retrouvé par la recherche', async () => {
    await upload(clientA, { fileName: 'Facture Dupont.pdf', dataBase64: PDF, number: 'ANC-2023-044', amountMinor: 9900, currency: 'CAD', paid: false });
    expect((await c.get(`/companies/${cid}/invoices`)).json()).toHaveLength(0);
    expect((await c.get(`/companies/${cid}/dashboard`)).json().totals).toEqual([]);
    const s = (await c.get('/search?q=anc-2023')).json();
    expect(s[0]).toMatchObject({ type: 'document', title: 'ANC-2023-044' });
  });
});
