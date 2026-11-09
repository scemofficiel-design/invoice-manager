-- Garde-fous d'intégrité au niveau de la base (défense en profondeur, voir ARCHITECTURE.md §6.4).
-- Les messages commencent par un code stable intercepté par le backend.

-- ── Factures émises : figées ─────────────────────────────────────────
CREATE TRIGGER invoices_immutable_update
BEFORE UPDATE ON invoices
WHEN OLD.status <> 'draft' AND (
     NEW.company_id IS NOT OLD.company_id OR NEW.client_id IS NOT OLD.client_id
  OR NEW.activity_id IS NOT OLD.activity_id OR NEW.number IS NOT OLD.number
  OR NEW.currency IS NOT OLD.currency OR NEW.locale IS NOT OLD.locale
  OR NEW.issue_date IS NOT OLD.issue_date OR NEW.due_date IS NOT OLD.due_date
  OR NEW.prices_include_tax IS NOT OLD.prices_include_tax OR NEW.tax_rounding IS NOT OLD.tax_rounding
  OR NEW.doc_discount_type IS NOT OLD.doc_discount_type OR NEW.doc_discount_value IS NOT OLD.doc_discount_value
  OR NEW.subtotal_minor IS NOT OLD.subtotal_minor OR NEW.discount_minor IS NOT OLD.discount_minor
  OR NEW.net_minor IS NOT OLD.net_minor OR NEW.taxable_base_minor IS NOT OLD.taxable_base_minor
  OR NEW.tax_total_minor IS NOT OLD.tax_total_minor OR NEW.total_minor IS NOT OLD.total_minor
  OR NEW.terms IS NOT OLD.terms OR NEW.notes IS NOT OLD.notes OR NEW.payment_terms IS NOT OLD.payment_terms
  OR NEW.client_snapshot IS NOT OLD.client_snapshot OR NEW.company_snapshot IS NOT OLD.company_snapshot
  OR NEW.source_quote_id IS NOT OLD.source_quote_id OR NEW.issued_at IS NOT OLD.issued_at
  OR NEW.created_at IS NOT OLD.created_at OR NEW.created_by IS NOT OLD.created_by
)
BEGIN
  SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: une facture émise ne peut pas être modifiée');
END;
--> statement-breakpoint
CREATE TRIGGER invoices_status_transition
BEFORE UPDATE OF status ON invoices
WHEN NOT (
     OLD.status = NEW.status
  OR (OLD.status = 'draft' AND NEW.status = 'issued')
  OR (OLD.status = 'issued' AND NEW.status = 'cancelled')
)
BEGIN
  SELECT RAISE(ABORT, 'INVOICE_STATUS_TRANSITION: transition de statut interdite');
END;
--> statement-breakpoint
CREATE TRIGGER invoices_cancelled_frozen
BEFORE UPDATE ON invoices
WHEN OLD.status = 'cancelled' AND NEW.amount_paid_minor IS NOT OLD.amount_paid_minor
BEGIN
  SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: une facture annulée est figée');
END;
--> statement-breakpoint
CREATE TRIGGER invoices_no_delete
BEFORE DELETE ON invoices
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVOICE_NO_DELETE: une facture émise ne peut pas être supprimée');
END;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_ins BEFORE INSERT ON invoice_lines
WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: lignes figées'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_upd BEFORE UPDATE ON invoice_lines
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: lignes figées'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_del BEFORE DELETE ON invoice_lines
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: lignes figées'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_line_taxes_ins BEFORE INSERT ON invoice_line_taxes
WHEN (SELECT i.status FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE l.id = NEW.line_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: taxes figées'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_line_taxes_upd BEFORE UPDATE ON invoice_line_taxes
WHEN (SELECT i.status FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE l.id = OLD.line_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: taxes figées'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_line_taxes_del BEFORE DELETE ON invoice_line_taxes
WHEN (SELECT i.status FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE l.id = OLD.line_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: taxes figées'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_tax_totals_ins BEFORE INSERT ON invoice_tax_totals
WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: récapitulatif fiscal figé'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_tax_totals_upd BEFORE UPDATE ON invoice_tax_totals
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: récapitulatif fiscal figé'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_tax_totals_del BEFORE DELETE ON invoice_tax_totals
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: récapitulatif fiscal figé'); END;
--> statement-breakpoint

-- ── Devis : lignes modifiables uniquement en brouillon ───────────────
CREATE TRIGGER quote_lines_ins BEFORE INSERT ON quote_lines
WHEN (SELECT status FROM quotes WHERE id = NEW.quote_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'QUOTE_IMMUTABLE: devis non modifiable hors brouillon'); END;
--> statement-breakpoint
CREATE TRIGGER quote_lines_upd BEFORE UPDATE ON quote_lines
WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'QUOTE_IMMUTABLE: devis non modifiable hors brouillon'); END;
--> statement-breakpoint
CREATE TRIGGER quote_lines_del BEFORE DELETE ON quote_lines
WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'QUOTE_IMMUTABLE: devis non modifiable hors brouillon'); END;
--> statement-breakpoint
CREATE TRIGGER quotes_immutable_update
BEFORE UPDATE ON quotes
WHEN OLD.status <> 'draft' AND (
     NEW.client_id IS NOT OLD.client_id OR NEW.number IS NOT OLD.number OR NEW.currency IS NOT OLD.currency
  OR NEW.issue_date IS NOT OLD.issue_date OR NEW.valid_until IS NOT OLD.valid_until
  OR NEW.total_minor IS NOT OLD.total_minor OR NEW.tax_total_minor IS NOT OLD.tax_total_minor
  OR NEW.subtotal_minor IS NOT OLD.subtotal_minor OR NEW.terms IS NOT OLD.terms OR NEW.notes IS NOT OLD.notes
  OR NEW.company_id IS NOT OLD.company_id
)
BEGIN
  SELECT RAISE(ABORT, 'QUOTE_IMMUTABLE: devis non modifiable hors brouillon');
END;
--> statement-breakpoint
CREATE TRIGGER quotes_no_delete
BEFORE DELETE ON quotes
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'QUOTE_NO_DELETE: seul un devis brouillon peut être supprimé');
END;
--> statement-breakpoint

-- ── Paiements & reçus : jamais supprimés, seulement annulés ──────────
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments
BEGIN SELECT RAISE(ABORT, 'PAYMENT_NO_DELETE: un paiement ne peut pas être supprimé, il doit être annulé'); END;
--> statement-breakpoint
CREATE TRIGGER payments_immutable BEFORE UPDATE ON payments
WHEN NEW.amount_minor IS NOT OLD.amount_minor OR NEW.invoice_id IS NOT OLD.invoice_id
  OR NEW.currency IS NOT OLD.currency OR NEW.payment_date IS NOT OLD.payment_date
  OR NEW.company_id IS NOT OLD.company_id OR (OLD.status = 'voided' AND NEW.status <> 'voided')
BEGIN SELECT RAISE(ABORT, 'PAYMENT_IMMUTABLE: un paiement enregistré ne peut pas être modifié'); END;
--> statement-breakpoint
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts
BEGIN SELECT RAISE(ABORT, 'RECEIPT_NO_DELETE: un reçu ne peut pas être supprimé'); END;
--> statement-breakpoint
CREATE TRIGGER receipts_immutable BEFORE UPDATE ON receipts
WHEN NEW.number IS NOT OLD.number OR NEW.amount_minor IS NOT OLD.amount_minor
  OR NEW.balance_before_minor IS NOT OLD.balance_before_minor OR NEW.balance_after_minor IS NOT OLD.balance_after_minor
  OR NEW.snapshot IS NOT OLD.snapshot OR NEW.issue_date IS NOT OLD.issue_date
  OR (OLD.status = 'void' AND NEW.status <> 'void')
BEGIN SELECT RAISE(ABORT, 'RECEIPT_IMMUTABLE: un reçu émis ne peut pas être modifié'); END;
--> statement-breakpoint

-- ── Journal d'audit : ajout seulement ────────────────────────────────
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY: le journal ne peut pas être modifié'); END;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY: le journal ne peut pas être modifié'); END;
--> statement-breakpoint

-- ── Recherche globale (FTS5) ─────────────────────────────────────────
CREATE VIRTUAL TABLE search_index USING fts5(
  company_id UNINDEXED,
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
