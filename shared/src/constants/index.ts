/** Constantes métier partagées. Les libellés affichés sont dans i18n/, jamais ici. */

export const USER_ROLES = ['owner', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Rôle d'un utilisateur dans une entreprise. */
export const COMPANY_ROLES = ['admin', 'editor', 'viewer'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];
export const COMPANY_ROLE_RANK: Record<CompanyRole, number> = { viewer: 1, editor: 2, admin: 3 };

export const CLIENT_TYPES = ['individual', 'business'] as const;
export const CATALOG_KINDS = ['product', 'service'] as const;
export const TAX_TREATMENTS = ['taxable', 'zero_rated', 'exempt'] as const;
export const TAX_ROUNDING_MODES = ['per_document', 'per_line'] as const;
export const DISCOUNT_TYPES = ['percent', 'amount'] as const;

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'refused', 'expired', 'cancelled'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Statut stocké d'une facture. */
export const INVOICE_STATUSES = ['draft', 'issued', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
/** Statut affiché, dérivé (voir ARCHITECTURE.md §7.5). */
export const INVOICE_DISPLAY_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const;
export type InvoiceDisplayStatus = (typeof INVOICE_DISPLAY_STATUSES)[number];

export const PAYMENT_METHODS = ['bank_transfer', 'cash', 'card', 'cheque', 'other'] as const;
export const PAYMENT_STATUSES = ['recorded', 'voided'] as const;
export const RECEIPT_STATUSES = ['valid', 'void'] as const;

export const DOC_TYPES = ['quote', 'invoice', 'receipt', 'credit_note'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const NUMBERING_RESETS = ['yearly', 'never'] as const;

export const DEFAULT_NUMBERING: Record<DocType, string> = {
  quote: 'DEV-{YYYY}-{SEQ:4}',
  invoice: 'FAC-{YYYY}-{SEQ:5}',
  receipt: 'REC-{YYYY}-{SEQ:5}',
  credit_note: 'AV-{YYYY}-{SEQ:5}',
};

/** Devises initiales (modifiables / extensibles en base). */
export const SEED_CURRENCIES = [
  { code: 'CAD', name: 'Dollar canadien', symbol: '$', minorUnits: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', minorUnits: 2 },
  { code: 'XOF', name: 'Franc CFA (BCEAO)', symbol: 'F CFA', minorUnits: 0 },
] as const;

/**
 * Préréglages fiscaux proposés à la création d'une entreprise.
 * Ce ne sont que des suggestions : les taxes sont créées en base et restent entièrement modifiables.
 * À vérifier auprès de l'administration fiscale compétente avant usage.
 */
export const TAX_PRESETS = [
  { id: 'ca-qc', label: 'Canada — Québec (TPS + TVQ)', taxes: [{ name: 'TPS', code: 'GST', ratePpm: 50_000 }, { name: 'TVQ', code: 'QST', ratePpm: 99_750 }] },
  { id: 'ca-on', label: 'Canada — Ontario (TVH 13 %)', taxes: [{ name: 'TVH', code: 'HST', ratePpm: 130_000 }] },
  { id: 'ca-gst', label: 'Canada — TPS seule (5 %)', taxes: [{ name: 'TPS', code: 'GST', ratePpm: 50_000 }] },
  { id: 'fr', label: 'France (TVA 20 %, 10 %, 5,5 %)', taxes: [{ name: 'TVA 20 %', code: 'TVA20', ratePpm: 200_000 }, { name: 'TVA 10 %', code: 'TVA10', ratePpm: 100_000 }, { name: 'TVA 5,5 %', code: 'TVA55', ratePpm: 55_000 }] },
  { id: 'uemoa-18', label: 'UEMOA — TVA 18 %', taxes: [{ name: 'TVA 18 %', code: 'TVA18', ratePpm: 180_000 }] },
  { id: 'none', label: 'Aucune taxe', taxes: [] },
] as const;
export type TaxPresetId = (typeof TAX_PRESETS)[number]['id'];

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const API_PREFIX = '/api/v1';
/** En-tête exigé sur toute requête mutante (protection CSRF complémentaire). */
export const CSRF_HEADER = 'x-invoice-manager';
export const SESSION_COOKIE = 'im_session';
