import { z } from 'zod';
import {
  CATALOG_KINDS,
  CLIENT_TYPES,
  DISCOUNT_TYPES,
  PAYMENT_METHODS,
  TAX_TREATMENTS,
  COMPANY_ROLES,
  LOCALES,
  NUMBERING_RESETS,
  TAX_ROUNDING_MODES,
} from '../constants/index';

/** Chaîne nettoyée ; vide → null pour les champs facultatifs. */
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const requiredText = (max = 200) => z.string().trim().min(1, 'Champ obligatoire').max(max);
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.email().safeParse(v).success, 'Adresse électronique invalide');
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Code devise ISO 4217 attendu (3 lettres)');
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date AAAA-MM-JJ attendue');
export const id = z.string().min(1).max(64);

// ── Authentification ─────────────────────────────────────────────
export const passwordSchema = z
  .string()
  .min(10, 'Au moins 10 caractères')
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Doit contenir des lettres et des chiffres');

export const setupSchema = z.object({
  organizationName: requiredText(120),
  displayName: requiredText(120),
  email: z.string().trim().toLowerCase().pipe(z.email('Adresse électronique invalide')),
  password: passwordSchema,
});
export type SetupInput = z.infer<typeof setupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const userPreferencesSchema = z.object({
  locale: z.enum(LOCALES).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

// ── Entreprises ──────────────────────────────────────────────────
export const legalIdSchema = z.object({ label: requiredText(60), value: requiredText(120) });

export const companyBaseSchema = z.object({
  legalName: requiredText(200),
  tradeName: optionalText(200),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  region: optionalText(120),
  postalCode: optionalText(20),
  country: optionalText(2).refine((v) => v === null || /^[A-Z]{2}$/.test(v), 'Code pays ISO à 2 lettres'),
  phone: optionalText(40),
  email: optionalEmail,
  website: optionalText(200),
  legalIds: z.array(legalIdSchema).max(10).default([]),
  defaultCurrency: currencyCode,
  defaultLocale: z.enum(LOCALES).default('fr'),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  quoteValidityDays: z.number().int().min(1).max(365).default(30),
  pricesIncludeTax: z.boolean().default(false),
  taxRounding: z.enum(TAX_ROUNDING_MODES).default('per_document'),
  bankDetails: optionalText(1000),
  defaultTerms: optionalText(2000),
  legalFooter: optionalText(1000),
});

export const companyCreateSchema = companyBaseSchema.extend({
  taxPreset: z.string().max(40).default('none'),
});
export type CompanyCreateInput = z.input<typeof companyCreateSchema>;
export const companyUpdateSchema = companyBaseSchema.partial();
export type CompanyUpdateInput = z.input<typeof companyUpdateSchema>;

export const numberingUpdateSchema = z.object({
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine((v) => /\{SEQ(:\d)?\}/.test(v), 'Le motif doit contenir {SEQ} ou {SEQ:n}')
    .refine((v) => !/\{(?!YYYY\}|YY\}|MM\}|SEQ(:\d)?\})/.test(v), 'Variable inconnue (autorisées : {YYYY} {YY} {MM} {SEQ:n})'),
  reset: z.enum(NUMBERING_RESETS),
  nextValue: z.number().int().min(1).optional(),
});

export const companyAccessSchema = z.object({
  userId: id,
  role: z.enum(COMPANY_ROLES),
});

// ── Activités ────────────────────────────────────────────────────
export const activityCreateSchema = z.object({
  name: requiredText(120),
  code: optionalText(20),
  description: optionalText(1000),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish()
    .transform((v) => v ?? null),
});
export const activityUpdateSchema = activityCreateSchema.partial();

// ── Taxes ────────────────────────────────────────────────────────
export const taxCreateSchema = z.object({
  name: requiredText(60),
  code: optionalText(20),
  ratePpm: z.number().int().min(0).max(1_000_000),
  isCompound: z.boolean().default(false),
  registrationNumber: optionalText(60),
  jurisdiction: optionalText(60),
  isDefault: z.boolean().default(false),
});
export const taxUpdateSchema = taxCreateSchema.partial();

// ── Devises & taux ───────────────────────────────────────────────
export const currencyCreateSchema = z.object({
  code: currencyCode,
  name: requiredText(60),
  symbol: requiredText(10),
  minorUnits: z.number().int().min(0).max(4),
});
export const currencyUpdateSchema = currencyCreateSchema.omit({ code: true, minorUnits: true }).partial().extend({
  isActive: z.boolean().optional(),
});

export const exchangeRateCreateSchema = z.object({
  baseCode: currencyCode,
  quoteCode: currencyCode,
  rate: z.string().trim().regex(/^\d+(\.\d{1,10})?$/, 'Taux décimal positif attendu (point comme séparateur)'),
  effectiveDate: isoDate,
});

// ── Utilisateurs ─────────────────────────────────────────────────
export const userCreateSchema = z.object({
  displayName: requiredText(120),
  email: z.string().trim().toLowerCase().pipe(z.email('Adresse électronique invalide')),
  password: passwordSchema,
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// ── Clients ──────────────────────────────────────────────────────

export const clientCreateSchema = z.object({
  type: z.enum(CLIENT_TYPES).default('business'),
  name: requiredText(200),
  contactName: optionalText(200),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  region: optionalText(120),
  postalCode: optionalText(20),
  country: optionalText(2).refine((v) => v === null || /^[A-Z]{2}$/.test(v), 'Code pays ISO à 2 lettres'),
  phone: optionalText(40),
  email: optionalEmail,
  taxIds: z.array(legalIdSchema).max(10).default([]),
  taxExempt: z.boolean().default(false),
  exemptionRef: optionalText(100),
  preferredLocale: z.enum(LOCALES).nullish().transform((v) => v ?? null),
  preferredCurrency: currencyCode.nullish().transform((v) => v ?? null),
  notes: optionalText(5000),
});
export type ClientInput = z.input<typeof clientCreateSchema>;
export const clientUpdateSchema = clientCreateSchema.partial();

// ── Catalogue ────────────────────────────────────────────────────
export const catalogItemCreateSchema = z.object({
  kind: z.enum(CATALOG_KINDS).default('service'),
  sku: optionalText(60),
  name: requiredText(200),
  description: optionalText(2000),
  category: optionalText(100),
  unit: z.string().trim().min(1).max(30).default('unit'),
  unitPriceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: currencyCode,
  priceIncludesTax: z.boolean().default(false),
  taxTreatment: z.enum(TAX_TREATMENTS).default('taxable'),
  activityId: id.nullish().transform((v) => v ?? null),
  taxIds: z.array(id).max(10).default([]),
});
export const catalogItemUpdateSchema = catalogItemCreateSchema.partial();

// ── Documents (devis / factures) ─────────────────────────────────
const discountFields = {
  discountType: z.enum(DISCOUNT_TYPES).nullish().transform((v) => v ?? null),
  discountValue: z.number().int().min(0).nullish().transform((v) => v ?? null),
};

export const documentLineSchema = z
  .object({
    catalogItemId: id.nullish().transform((v) => v ?? null),
    kind: z.enum(['product', 'service', 'custom']).default('custom'),
    sku: optionalText(60),
    name: requiredText(300),
    description: optionalText(4000),
    unit: optionalText(30),
    quantityMilli: z.number().int().min(1, 'Quantité strictement positive').max(1_000_000_000_000),
    unitPriceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    ...discountFields,
    taxTreatment: z.enum(TAX_TREATMENTS).default('taxable'),
    taxIds: z.array(id).max(10).default([]),
  })
  .refine((l) => (l.discountType === null) === (l.discountValue === null), 'Remise incomplète');
export type DocumentLineInput = z.input<typeof documentLineSchema>;

const documentBase = {
  clientId: id,
  activityId: id.nullish().transform((v) => v ?? null),
  currency: currencyCode,
  locale: z.enum(LOCALES).default('fr'),
  issueDate: isoDate,
  pricesIncludeTax: z.boolean().default(false),
  docDiscountType: z.enum(DISCOUNT_TYPES).nullish().transform((v) => v ?? null),
  docDiscountValue: z.number().int().min(0).nullish().transform((v) => v ?? null),
  terms: optionalText(5000),
  notes: optionalText(5000),
  lines: z.array(documentLineSchema).max(500),
};

export const quoteInputSchema = z
  .object({ ...documentBase, validUntil: isoDate })
  .refine((q) => q.validUntil >= q.issueDate, { message: 'La date d’expiration précède la date d’émission', path: ['validUntil'] })
  .refine((q) => (q.docDiscountType === null) === (q.docDiscountValue === null), { message: 'Remise globale incomplète', path: ['docDiscountValue'] });
export type QuoteInput = z.input<typeof quoteInputSchema>;

export const invoiceInputSchema = z
  .object({ ...documentBase, dueDate: isoDate, paymentTerms: optionalText(500) })
  .refine((q) => q.dueDate >= q.issueDate, { message: 'L’échéance précède la date d’émission', path: ['dueDate'] })
  .refine((q) => (q.docDiscountType === null) === (q.docDiscountValue === null), { message: 'Remise globale incomplète', path: ['docDiscountValue'] });
export type InvoiceInput = z.input<typeof invoiceInputSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Motif obligatoire (3 caractères minimum)').max(1000) });

export const documentListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.string().max(30).optional(),
  clientId: z.string().max(64).optional(),
  activityId: z.string().max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// ── Paiements ────────────────────────────────────────────────────
export const paymentCreateSchema = z.object({
  invoiceId: id,
  paymentDate: isoDate,
  amountMinor: z.number().int().min(1, 'Montant strictement positif').max(Number.MAX_SAFE_INTEGER),
  currency: currencyCode.optional(),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(200),
  notes: optionalText(2000),
  idempotencyKey: z.string().min(8).max(100),
});
export type PaymentInput = z.input<typeof paymentCreateSchema>;

// ── Documents importés (anciennes factures) ─────────────────────
export const clientDocumentInfoSchema = z
  .object({
    number: optionalText(60),
    docDate: isoDate.nullish().transform((v) => v ?? null),
    amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullish().transform((v) => v ?? null),
    currency: currencyCode.nullish().transform((v) => v ?? null),
    paid: z.boolean().nullish().transform((v) => v ?? null),
    notes: optionalText(2000),
  })
  .refine((d) => d.amountMinor === null || d.currency !== null, { message: 'Indiquez la devise du montant', path: ['currency'] });
export type ClientDocumentInfo = z.input<typeof clientDocumentInfoSchema>;
