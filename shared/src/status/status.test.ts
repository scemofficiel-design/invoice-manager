import { describe, expect, it } from 'vitest';
import { invoiceDisplayStatus, quoteDisplayStatus } from './index';

const inv = (o: Partial<Parameters<typeof invoiceDisplayStatus>[0]>) => ({ status: 'issued' as const, totalMinor: 1000, amountPaidMinor: 0, dueDate: '2026-12-01', ...o });

describe('statuts dérivés', () => {
  it('factures', () => {
    expect(invoiceDisplayStatus(inv({ status: 'draft' }), '2026-11-09')).toBe('draft');
    expect(invoiceDisplayStatus(inv({}), '2026-11-09')).toBe('issued');
    expect(invoiceDisplayStatus(inv({ amountPaidMinor: 400 }), '2026-11-09')).toBe('partially_paid');
    expect(invoiceDisplayStatus(inv({ amountPaidMinor: 1000 }), '2027-01-01')).toBe('paid');
    expect(invoiceDisplayStatus(inv({ amountPaidMinor: 400 }), '2026-12-02')).toBe('overdue');
    expect(invoiceDisplayStatus(inv({}), '2026-12-01')).toBe('issued'); // échéance le jour même : pas encore en retard
    expect(invoiceDisplayStatus(inv({ status: 'cancelled' }), '2027-01-01')).toBe('cancelled');
  });
  it('devis', () => {
    expect(quoteDisplayStatus({ status: 'sent', validUntil: '2026-11-08' }, '2026-11-09')).toBe('expired');
    expect(quoteDisplayStatus({ status: 'sent', validUntil: '2026-11-09' }, '2026-11-09')).toBe('sent');
    expect(quoteDisplayStatus({ status: 'accepted', validUntil: '2026-01-01' }, '2026-11-09')).toBe('accepted');
  });
});
