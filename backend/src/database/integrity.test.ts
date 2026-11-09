/** Garde-fous au niveau base : documents émis figés, journal append-only, paiements non supprimables. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { companyInput, makeApp, setupOwner, type TestCtx } from '../test/helpers';
import { newId, nowIso } from '../utils/time';

let ctx: TestCtx;
let companyId: string;
let clientId: string;
beforeEach(async () => {
  ctx = await makeApp();
  const owner = await setupOwner(ctx.app);
  companyId = (await owner.post('/companies', companyInput('Intégrité'))).json().id;
  clientId = newId();
  const now = nowIso();
  ctx.app.conn.sqlite
    .prepare(`INSERT INTO clients (id, company_id, type, name, created_at, updated_at) VALUES (?, ?, 'business', 'Client', ?, ?)`)
    .run(clientId, companyId, now, now);
});
afterEach(() => ctx.close());

function draftInvoice(): { invoiceId: string; lineId: string } {
  const { sqlite } = ctx.app.conn;
  const now = nowIso();
  const invoiceId = newId();
  const lineId = newId();
  sqlite
    .prepare(
      `INSERT INTO invoices (id, company_id, client_id, currency, issue_date, due_date, tax_rounding, total_minor, created_at, updated_at)
       VALUES (?, ?, ?, 'CAD', '2026-11-09', '2026-12-09', 'per_document', 11498, ?, ?)`,
    )
    .run(invoiceId, companyId, clientId, now, now);
  sqlite
    .prepare(
      `INSERT INTO invoice_lines (id, company_id, invoice_id, position, name, quantity_milli, unit_price_minor, tax_treatment, net_minor, total_minor)
       VALUES (?, ?, ?, 0, 'Prestation', 1000, 10000, 'taxable', 10000, 11498)`,
    )
    .run(lineId, companyId, invoiceId);
  return { invoiceId, lineId };
}

const issue = (id: string) =>
  ctx.app.conn.sqlite.prepare(`UPDATE invoices SET status='issued', number='FAC-2026-00001', issued_at=? WHERE id=?`).run(nowIso(), id);

describe('facture émise figée', () => {
  it('un brouillon reste modifiable et supprimable', () => {
    const { sqlite } = ctx.app.conn;
    const { invoiceId, lineId } = draftInvoice();
    sqlite.prepare(`UPDATE invoices SET notes='ok' WHERE id=?`).run(invoiceId);
    sqlite.prepare(`UPDATE invoice_lines SET name='Modifiée' WHERE id=?`).run(lineId);
    sqlite.prepare(`DELETE FROM invoices WHERE id=?`).run(invoiceId);
    expect(sqlite.prepare('SELECT count(*) n FROM invoice_lines').get()).toEqual({ n: 0 });
  });

  it('une facture émise ne peut plus être modifiée ni supprimée', () => {
    const { sqlite } = ctx.app.conn;
    const { invoiceId, lineId } = draftInvoice();
    issue(invoiceId);
    expect(() => sqlite.prepare(`UPDATE invoices SET total_minor=1 WHERE id=?`).run(invoiceId)).toThrow(/INVOICE_IMMUTABLE/);
    expect(() => sqlite.prepare(`UPDATE invoices SET notes='x' WHERE id=?`).run(invoiceId)).toThrow(/INVOICE_IMMUTABLE/);
    expect(() => sqlite.prepare(`UPDATE invoice_lines SET unit_price_minor=1 WHERE id=?`).run(lineId)).toThrow(/INVOICE_IMMUTABLE/);
    expect(() =>
      sqlite.prepare(`INSERT INTO invoice_lines (id, company_id, invoice_id, position, name, quantity_milli, unit_price_minor, tax_treatment) VALUES (?, ?, ?, 1, 'Ajout', 1000, 1, 'taxable')`).run(newId(), companyId, invoiceId),
    ).toThrow(/INVOICE_IMMUTABLE/);
    expect(() => sqlite.prepare(`DELETE FROM invoice_lines WHERE id=?`).run(lineId)).toThrow(/INVOICE_IMMUTABLE/);
    expect(() => sqlite.prepare(`DELETE FROM invoices WHERE id=?`).run(invoiceId)).toThrow(/INVOICE_NO_DELETE/);
    expect(() => sqlite.prepare(`UPDATE invoices SET status='draft' WHERE id=?`).run(invoiceId)).toThrow(/INVOICE_STATUS_TRANSITION/);
  });

  it('seuls le suivi des paiements et l’annulation restent possibles', () => {
    const { sqlite } = ctx.app.conn;
    const { invoiceId } = draftInvoice();
    issue(invoiceId);
    sqlite.prepare(`UPDATE invoices SET amount_paid_minor=5000 WHERE id=?`).run(invoiceId);
    expect(() => sqlite.prepare(`UPDATE invoices SET amount_paid_minor=999999 WHERE id=?`).run(invoiceId)).toThrow(/CHECK/);
    sqlite.prepare(`UPDATE invoices SET status='cancelled', cancelled_at=?, cancel_reason='Erreur de client' WHERE id=?`).run(nowIso(), invoiceId);
    expect(() => sqlite.prepare(`UPDATE invoices SET status='issued' WHERE id=?`).run(invoiceId)).toThrow(/INVOICE_STATUS_TRANSITION/);
    expect(() => sqlite.prepare(`UPDATE invoices SET amount_paid_minor=0 WHERE id=?`).run(invoiceId)).toThrow(/INVOICE_IMMUTABLE/);
  });

  it('une facture émise doit avoir un numéro', () => {
    const { sqlite } = ctx.app.conn;
    const { invoiceId } = draftInvoice();
    expect(() => sqlite.prepare(`UPDATE invoices SET status='issued' WHERE id=?`).run(invoiceId)).toThrow(/CHECK/);
  });

  it('un même devis ne peut être converti qu’une fois (source_quote_id unique)', () => {
    const { sqlite } = ctx.app.conn;
    const now = nowIso();
    const quoteId = newId();
    sqlite
      .prepare(`INSERT INTO quotes (id, company_id, client_id, number, currency, issue_date, valid_until, tax_rounding, created_at, updated_at) VALUES (?, ?, ?, 'DEV-1', 'CAD', '2026-11-09', '2026-12-09', 'per_document', ?, ?)`)
      .run(quoteId, companyId, clientId, now, now);
    const conv = () =>
      sqlite
        .prepare(`INSERT INTO invoices (id, company_id, client_id, currency, issue_date, due_date, tax_rounding, source_quote_id, created_at, updated_at) VALUES (?, ?, ?, 'CAD', '2026-11-09', '2026-12-09', 'per_document', ?, ?, ?)`)
        .run(newId(), companyId, clientId, quoteId, now, now);
    conv();
    expect(conv).toThrow(/UNIQUE/);
  });
});

describe('journal et paiements', () => {
  it('le journal d’audit est en ajout seul', () => {
    const { sqlite } = ctx.app.conn;
    expect(() => sqlite.prepare(`UPDATE audit_log SET summary='effacé'`).run()).toThrow(/AUDIT_APPEND_ONLY/);
    expect(() => sqlite.prepare(`DELETE FROM audit_log`).run()).toThrow(/AUDIT_APPEND_ONLY/);
  });

  it('un paiement ne peut être ni supprimé ni modifié dans son montant', () => {
    const { sqlite } = ctx.app.conn;
    const { invoiceId } = draftInvoice();
    issue(invoiceId);
    const pid = newId();
    sqlite
      .prepare(`INSERT INTO payments (id, company_id, invoice_id, client_id, payment_date, amount_minor, currency, method, created_at) VALUES (?, ?, ?, ?, '2026-11-10', 5000, 'CAD', 'cash', ?)`)
      .run(pid, companyId, invoiceId, clientId, nowIso());
    expect(() => sqlite.prepare(`DELETE FROM payments WHERE id=?`).run(pid)).toThrow(/PAYMENT_NO_DELETE/);
    expect(() => sqlite.prepare(`UPDATE payments SET amount_minor=1 WHERE id=?`).run(pid)).toThrow(/PAYMENT_IMMUTABLE/);
    sqlite.prepare(`UPDATE payments SET status='voided', void_reason='Erreur' WHERE id=?`).run(pid);
    expect(() => sqlite.prepare(`UPDATE payments SET amount_minor=0 WHERE id=?`).run(pid)).toThrow();
  });
});
