/**
 * Statuts dérivés (ARCHITECTURE.md §7.4 et §7.5) : « En retard » et « Expiré » ne sont jamais
 * stockés, ils sont calculés à partir des dates pour rester toujours exacts.
 */
import type { InvoiceDisplayStatus, InvoiceStatus, QuoteStatus } from '../constants/index';

export function invoiceDisplayStatus(
  inv: { status: InvoiceStatus; totalMinor: number; amountPaidMinor: number; dueDate: string },
  today: string,
): InvoiceDisplayStatus {
  if (inv.status === 'draft') return 'draft';
  if (inv.status === 'cancelled') return 'cancelled';
  if (inv.amountPaidMinor >= inv.totalMinor) return 'paid';
  if (inv.dueDate < today) return 'overdue';
  if (inv.amountPaidMinor > 0) return 'partially_paid';
  return 'issued';
}

export function quoteDisplayStatus(q: { status: QuoteStatus; validUntil: string }, today: string): QuoteStatus {
  if (q.status === 'sent' && q.validUntil < today) return 'expired';
  return q.status;
}

/** Transitions de devis autorisées (le statut source est le statut stocké). */
export const QUOTE_TRANSITIONS: Record<'send' | 'accept' | 'refuse' | 'cancel', { from: QuoteStatus[]; to: QuoteStatus }> = {
  send: { from: ['draft'], to: 'sent' },
  accept: { from: ['sent'], to: 'accepted' },
  refuse: { from: ['sent'], to: 'refused' },
  cancel: { from: ['draft', 'sent', 'accepted'], to: 'cancelled' },
};
