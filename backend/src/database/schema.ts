/**
 * Schéma de la base SQLite (Drizzle ORM). Voir ARCHITECTURE.md §6.
 *
 * Conventions : montants en unités mineures (`*_minor`), quantités en millièmes (`quantity_milli`),
 * taux en parties par million (`rate_ppm`), dates métier 'YYYY-MM-DD', horodatages ISO UTC.
 *
 * Isolation : chaque table métier expose UNIQUE(company_id, id) ; les relations utilisent des clés
 * étrangères composites (company_id, x_id) pour qu'une entité ne puisse jamais référencer une entité
 * d'une autre entreprise. Les triggers d'immutabilité sont dans la migration personnalisée.
 */
import { sql } from 'drizzle-orm';
import {
  customType,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import type { LegalId } from '@im/shared/types';

/** BLOB portable : Uint8Array côté application (sql.js), Buffer converti pour better-sqlite3. */
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'blob',
  toDriver: (v) => (typeof globalThis.Buffer !== 'undefined' ? globalThis.Buffer.from(v) : v),
  fromDriver: (v) => (v instanceof Uint8Array ? v : new Uint8Array(v as ArrayBuffer)),
});

const ts = (name: string) => text(name);
const bool = (name: string) => integer(name, { mode: 'boolean' });
const minor = (name: string) => integer(name).notNull().default(0);

// ── Organisation & accès ───────────────────────────────────────────

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const orgSettings = sqliteTable(
  'org_settings',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    defaultLocale: text('default_locale').notNull().default('fr'),
    reportingCurrency: text('reporting_currency'),
    sessionIdleMinutes: integer('session_idle_minutes').notNull().default(720),
    backupRetentionDaily: integer('backup_retention_daily').notNull().default(7),
    backupRetentionWeekly: integer('backup_retention_weekly').notNull().default(4),
    backupRetentionMonthly: integer('backup_retention_monthly').notNull().default(12),
    backupExportDir: text('backup_export_dir'),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [check('org_settings_single_row', sql`${t.id} = 1`)],
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    locale: text('locale', { enum: ['fr', 'en'] }).notNull().default('fr'),
    theme: text('theme', { enum: ['light', 'dark', 'system'] }).notNull().default('system'),
    isActive: bool('is_active').notNull().default(true),
    passwordChangedAt: ts('password_changed_at').notNull(),
    lastLoginAt: ts('last_login_at'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [check('users_role_chk', sql`${t.role} IN ('owner','member')`)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ── Référentiels globaux ───────────────────────────────────────────

export const currencies = sqliteTable(
  'currencies',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    minorUnits: integer('minor_units').notNull(),
    isActive: bool('is_active').notNull().default(true),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [check('currencies_minor_chk', sql`${t.minorUnits} BETWEEN 0 AND 4`)],
);

export const exchangeRates = sqliteTable(
  'exchange_rates',
  {
    id: text('id').primaryKey(),
    baseCode: text('base_code')
      .notNull()
      .references(() => currencies.code),
    quoteCode: text('quote_code')
      .notNull()
      .references(() => currencies.code),
    rate: text('rate').notNull(),
    effectiveDate: text('effective_date').notNull(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    unique('exchange_rates_uniq').on(t.baseCode, t.quoteCode, t.effectiveDate),
    check('exchange_rates_distinct_chk', sql`${t.baseCode} <> ${t.quoteCode}`),
  ],
);

// ── Entreprises ────────────────────────────────────────────────────

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  legalName: text('legal_name').notNull(),
  tradeName: text('trade_name'),
  logoFileId: text('logo_file_id'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  region: text('region'),
  postalCode: text('postal_code'),
  country: text('country'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  legalIds: text('legal_ids', { mode: 'json' }).$type<LegalId[]>().notNull().default([]),
  defaultCurrency: text('default_currency')
    .notNull()
    .references(() => currencies.code),
  defaultLocale: text('default_locale', { enum: ['fr', 'en'] }).notNull().default('fr'),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  quoteValidityDays: integer('quote_validity_days').notNull().default(30),
  pricesIncludeTax: bool('prices_include_tax').notNull().default(false),
  taxRounding: text('tax_rounding', { enum: ['per_document', 'per_line'] })
    .notNull()
    .default('per_document'),
  bankDetails: text('bank_details'),
  defaultTerms: text('default_terms'),
  legalFooter: text('legal_footer'),
  archivedAt: ts('archived_at'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const userCompanyAccess = sqliteTable(
  'user_company_access',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companyId] }),
    check('uca_role_chk', sql`${t.role} IN ('admin','editor','viewer')`),
  ],
);

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    code: text('code'),
    description: text('description'),
    color: text('color'),
    archivedAt: ts('archived_at'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [unique('activities_scope').on(t.companyId, t.id), unique('activities_name_uniq').on(t.companyId, t.name)],
);

export const taxes = sqliteTable(
  'taxes',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    code: text('code'),
    ratePpm: integer('rate_ppm').notNull(),
    isCompound: bool('is_compound').notNull().default(false),
    registrationNumber: text('registration_number'),
    jurisdiction: text('jurisdiction'),
    isDefault: bool('is_default').notNull().default(false),
    archivedAt: ts('archived_at'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    unique('taxes_scope').on(t.companyId, t.id),
    check('taxes_rate_chk', sql`${t.ratePpm} BETWEEN 0 AND 1000000`),
  ],
);

export const numberingSequences = sqliteTable(
  'numbering_sequences',
  {
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    docType: text('doc_type', { enum: ['quote', 'invoice', 'receipt', 'credit_note'] }).notNull(),
    pattern: text('pattern').notNull(),
    reset: text('reset', { enum: ['yearly', 'never'] }).notNull().default('yearly'),
    periodKey: text('period_key').notNull(),
    nextValue: integer('next_value').notNull().default(1),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.docType] }),
    check('numbering_next_chk', sql`${t.nextValue} >= 1`),
  ],
);

// ── Clients & catalogue ────────────────────────────────────────────

export const clients = sqliteTable(
  'clients',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    type: text('type', { enum: ['individual', 'business'] }).notNull(),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    region: text('region'),
    postalCode: text('postal_code'),
    country: text('country'),
    phone: text('phone'),
    email: text('email'),
    taxIds: text('tax_ids', { mode: 'json' }).$type<LegalId[]>().notNull().default([]),
    taxExempt: bool('tax_exempt').notNull().default(false),
    exemptionRef: text('exemption_ref'),
    preferredLocale: text('preferred_locale', { enum: ['fr', 'en'] }),
    preferredCurrency: text('preferred_currency').references(() => currencies.code),
    notes: text('notes'),
    archivedAt: ts('archived_at'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [unique('clients_scope').on(t.companyId, t.id), index('clients_company_name_idx').on(t.companyId, t.name)],
);

export const catalogItems = sqliteTable(
  'catalog_items',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    activityId: text('activity_id'),
    kind: text('kind', { enum: ['product', 'service'] }).notNull(),
    sku: text('sku'),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    unit: text('unit').notNull().default('unit'),
    unitPriceMinor: minor('unit_price_minor'),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    priceIncludesTax: bool('price_includes_tax').notNull().default(false),
    taxTreatment: text('tax_treatment', { enum: ['taxable', 'zero_rated', 'exempt'] })
      .notNull()
      .default('taxable'),
    archivedAt: ts('archived_at'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    unique('catalog_scope').on(t.companyId, t.id),
    unique('catalog_sku_uniq').on(t.companyId, t.sku),
    foreignKey({ columns: [t.companyId, t.activityId], foreignColumns: [activities.companyId, activities.id], name: 'catalog_activity_fk' }),
    check('catalog_price_chk', sql`${t.unitPriceMinor} >= 0`),
  ],
);

export const catalogItemTaxes = sqliteTable(
  'catalog_item_taxes',
  {
    companyId: text('company_id').notNull(),
    catalogItemId: text('catalog_item_id').notNull(),
    taxId: text('tax_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.catalogItemId, t.taxId] }),
    foreignKey({ columns: [t.companyId, t.catalogItemId], foreignColumns: [catalogItems.companyId, catalogItems.id], name: 'cit_item_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.companyId, t.taxId], foreignColumns: [taxes.companyId, taxes.id], name: 'cit_tax_fk' }),
  ],
);

// ── Documents : colonnes communes ──────────────────────────────────

const documentColumns = () => ({
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  clientId: text('client_id').notNull(),
  activityId: text('activity_id'),
  number: text('number'),
  currency: text('currency')
    .notNull()
    .references(() => currencies.code),
  locale: text('locale', { enum: ['fr', 'en'] }).notNull().default('fr'),
  issueDate: text('issue_date').notNull(),
  pricesIncludeTax: bool('prices_include_tax').notNull().default(false),
  taxRounding: text('tax_rounding', { enum: ['per_document', 'per_line'] }).notNull(),
  docDiscountType: text('doc_discount_type', { enum: ['percent', 'amount'] }),
  docDiscountValue: integer('doc_discount_value'),
  subtotalMinor: minor('subtotal_minor'),
  discountMinor: minor('discount_minor'),
  netMinor: minor('net_minor'),
  taxableBaseMinor: minor('taxable_base_minor'),
  taxTotalMinor: minor('tax_total_minor'),
  totalMinor: minor('total_minor'),
  terms: text('terms'),
  notes: text('notes'),
  clientSnapshot: text('client_snapshot', { mode: 'json' }).$type<Record<string, unknown>>(),
  companySnapshot: text('company_snapshot', { mode: 'json' }).$type<Record<string, unknown>>(),
  duplicatedFromId: text('duplicated_from_id'),
  version: integer('version').notNull().default(1),
  createdBy: text('created_by').references(() => users.id),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

const lineColumns = () => ({
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  position: integer('position').notNull(),
  catalogItemId: text('catalog_item_id'),
  kind: text('kind', { enum: ['product', 'service', 'custom'] }).notNull().default('custom'),
  sku: text('sku'),
  name: text('name').notNull(),
  description: text('description'),
  unit: text('unit'),
  quantityMilli: integer('quantity_milli').notNull(),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  discountType: text('discount_type', { enum: ['percent', 'amount'] }),
  discountValue: integer('discount_value'),
  taxTreatment: text('tax_treatment', { enum: ['taxable', 'zero_rated', 'exempt'] }).notNull(),
  grossMinor: minor('gross_minor'),
  discountMinor: minor('discount_minor'),
  netMinor: minor('net_minor'),
  taxMinor: minor('tax_minor'),
  totalMinor: minor('total_minor'),
});

const lineTaxColumns = () => ({
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  lineId: text('line_id').notNull(),
  taxId: text('tax_id'),
  name: text('name').notNull(),
  ratePpm: integer('rate_ppm').notNull(),
  isCompound: bool('is_compound').notNull(),
  registrationNumber: text('registration_number'),
  baseMinor: integer('base_minor').notNull(),
  amountMinor: integer('amount_minor').notNull(),
});

// ── Devis ──────────────────────────────────────────────────────────

export const quotes = sqliteTable(
  'quotes',
  {
    ...documentColumns(),
    status: text('status', { enum: ['draft', 'sent', 'accepted', 'refused', 'expired', 'cancelled'] })
      .notNull()
      .default('draft'),
    validUntil: text('valid_until').notNull(),
    sentAt: ts('sent_at'),
    decidedAt: ts('decided_at'),
    cancelledAt: ts('cancelled_at'),
  },
  (t) => [
    unique('quotes_scope').on(t.companyId, t.id),
    unique('quotes_number_uniq').on(t.companyId, t.number),
    foreignKey({ columns: [t.companyId, t.clientId], foreignColumns: [clients.companyId, clients.id], name: 'quotes_client_fk' }),
    foreignKey({ columns: [t.companyId, t.activityId], foreignColumns: [activities.companyId, activities.id], name: 'quotes_activity_fk' }),
    index('quotes_company_status_idx').on(t.companyId, t.status),
    index('quotes_client_idx').on(t.companyId, t.clientId),
    check('quotes_status_chk', sql`${t.status} IN ('draft','sent','accepted','refused','expired','cancelled')`),
    check('quotes_amounts_chk', sql`${t.totalMinor} >= 0 AND ${t.taxTotalMinor} >= 0`),
  ],
);

export const quoteLines = sqliteTable(
  'quote_lines',
  { ...lineColumns(), quoteId: text('quote_id').notNull() },
  (t) => [
    unique('quote_lines_scope').on(t.companyId, t.id),
    foreignKey({ columns: [t.companyId, t.quoteId], foreignColumns: [quotes.companyId, quotes.id], name: 'quote_lines_quote_fk' }).onDelete('cascade'),
    index('quote_lines_quote_idx').on(t.quoteId, t.position),
  ],
);

export const quoteLineTaxes = sqliteTable(
  'quote_line_taxes',
  lineTaxColumns(),
  (t) => [
    foreignKey({ columns: [t.companyId, t.lineId], foreignColumns: [quoteLines.companyId, quoteLines.id], name: 'qlt_line_fk' }).onDelete('cascade'),
    index('qlt_line_idx').on(t.lineId),
  ],
);

// ── Factures ───────────────────────────────────────────────────────

export const invoices = sqliteTable(
  'invoices',
  {
    ...documentColumns(),
    status: text('status', { enum: ['draft', 'issued', 'cancelled'] }).notNull().default('draft'),
    dueDate: text('due_date').notNull(),
    paymentTerms: text('payment_terms'),
    sourceQuoteId: text('source_quote_id').unique(),
    issuedAt: ts('issued_at'),
    amountPaidMinor: minor('amount_paid_minor'),
    cancelledAt: ts('cancelled_at'),
    cancelReason: text('cancel_reason'),
    pdfFileId: text('pdf_file_id'),
  },
  (t) => [
    unique('invoices_scope').on(t.companyId, t.id),
    unique('invoices_number_uniq').on(t.companyId, t.number),
    foreignKey({ columns: [t.companyId, t.clientId], foreignColumns: [clients.companyId, clients.id], name: 'invoices_client_fk' }),
    foreignKey({ columns: [t.companyId, t.activityId], foreignColumns: [activities.companyId, activities.id], name: 'invoices_activity_fk' }),
    foreignKey({ columns: [t.companyId, t.sourceQuoteId], foreignColumns: [quotes.companyId, quotes.id], name: 'invoices_quote_fk' }),
    index('invoices_company_status_idx').on(t.companyId, t.status),
    index('invoices_client_idx').on(t.companyId, t.clientId),
    index('invoices_issue_date_idx').on(t.companyId, t.issueDate),
    check('invoices_status_chk', sql`${t.status} IN ('draft','issued','cancelled')`),
    check('invoices_paid_chk', sql`${t.amountPaidMinor} >= 0 AND ${t.amountPaidMinor} <= ${t.totalMinor}`),
    check('invoices_number_chk', sql`${t.status} = 'draft' OR ${t.number} IS NOT NULL`),
  ],
);

export const invoiceLines = sqliteTable(
  'invoice_lines',
  { ...lineColumns(), invoiceId: text('invoice_id').notNull() },
  (t) => [
    unique('invoice_lines_scope').on(t.companyId, t.id),
    foreignKey({ columns: [t.companyId, t.invoiceId], foreignColumns: [invoices.companyId, invoices.id], name: 'invoice_lines_invoice_fk' }).onDelete('cascade'),
    index('invoice_lines_invoice_idx').on(t.invoiceId, t.position),
  ],
);

export const invoiceLineTaxes = sqliteTable(
  'invoice_line_taxes',
  lineTaxColumns(),
  (t) => [
    foreignKey({ columns: [t.companyId, t.lineId], foreignColumns: [invoiceLines.companyId, invoiceLines.id], name: 'ilt_line_fk' }).onDelete('cascade'),
    index('ilt_line_idx').on(t.lineId),
  ],
);

export const invoiceTaxTotals = sqliteTable(
  'invoice_tax_totals',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').notNull(),
    invoiceId: text('invoice_id').notNull(),
    taxId: text('tax_id'),
    name: text('name').notNull(),
    ratePpm: integer('rate_ppm').notNull(),
    isCompound: bool('is_compound').notNull(),
    registrationNumber: text('registration_number'),
    baseMinor: integer('base_minor').notNull(),
    amountMinor: integer('amount_minor').notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.invoiceId], foreignColumns: [invoices.companyId, invoices.id], name: 'itt_invoice_fk' }).onDelete('cascade'),
    index('itt_invoice_idx').on(t.invoiceId),
  ],
);

// ── Paiements & reçus ──────────────────────────────────────────────

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    invoiceId: text('invoice_id').notNull(),
    clientId: text('client_id').notNull(),
    paymentDate: text('payment_date').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    method: text('method', { enum: ['bank_transfer', 'cash', 'card', 'cheque', 'other'] }).notNull(),
    reference: text('reference'),
    notes: text('notes'),
    status: text('status', { enum: ['recorded', 'voided'] }).notNull().default('recorded'),
    voidedAt: ts('voided_at'),
    voidReason: text('void_reason'),
    idempotencyKey: text('idempotency_key').unique(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    unique('payments_scope').on(t.companyId, t.id),
    foreignKey({ columns: [t.companyId, t.invoiceId], foreignColumns: [invoices.companyId, invoices.id], name: 'payments_invoice_fk' }),
    foreignKey({ columns: [t.companyId, t.clientId], foreignColumns: [clients.companyId, clients.id], name: 'payments_client_fk' }),
    index('payments_invoice_idx').on(t.invoiceId),
    index('payments_company_date_idx').on(t.companyId, t.paymentDate),
    check('payments_amount_chk', sql`${t.amountMinor} > 0`),
  ],
);

export const receipts = sqliteTable(
  'receipts',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    paymentId: text('payment_id').notNull().unique(),
    number: text('number').notNull(),
    issueDate: text('issue_date').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    balanceBeforeMinor: integer('balance_before_minor').notNull(),
    balanceAfterMinor: integer('balance_after_minor').notNull(),
    isFullPayment: bool('is_full_payment').notNull(),
    snapshot: text('snapshot', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: ['valid', 'void'] }).notNull().default('valid'),
    pdfFileId: text('pdf_file_id'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    unique('receipts_number_uniq').on(t.companyId, t.number),
    foreignKey({ columns: [t.companyId, t.paymentId], foreignColumns: [payments.companyId, payments.id], name: 'receipts_payment_fk' }),
  ],
);

// ── Transverse ─────────────────────────────────────────────────────

export const storedFiles = sqliteTable(
  'stored_files',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').references(() => companies.id),
    kind: text('kind', { enum: ['logo', 'pdf', 'export'] }).notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    relPath: text('rel_path').notNull().unique(),
    mime: text('mime').notNull(),
    sha256: text('sha256').notNull(),
    size: integer('size').notNull(),
    /** Contenu du fichier : tout est dans la base, une seule sauvegarde suffit. */
    content: bytes('content'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('stored_files_entity_idx').on(t.entityType, t.entityId)],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: ts('at').notNull(),
    userId: text('user_id').references(() => users.id),
    companyId: text('company_id').references(() => companies.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    summary: text('summary').notNull(),
    changes: text('changes', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (t) => [index('audit_company_at_idx').on(t.companyId, t.at), index('audit_entity_idx').on(t.entityType, t.entityId)],
);
