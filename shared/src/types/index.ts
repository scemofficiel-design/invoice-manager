import type { CompanyRole, DocType, InvoiceDisplayStatus, InvoiceStatus, Locale, QuoteStatus, UserRole } from '../constants/index';

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  locale: Locale;
  theme: 'light' | 'dark' | 'system';
}

export interface MeResponse {
  user: CurrentUser;
  organization: { name: string };
  profile: string;
  companies: CompanySummary[];
}

export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
  profile: string;
}

export interface CompanySummary {
  id: string;
  legalName: string;
  tradeName: string | null;
  defaultCurrency: string;
  hasLogo: boolean;
  role: CompanyRole;
  archivedAt: string | null;
}

export interface LegalId {
  label: string;
  value: string;
}

export interface Company {
  id: string;
  legalName: string;
  tradeName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  legalIds: LegalId[];
  defaultCurrency: string;
  defaultLocale: Locale;
  paymentTermsDays: number;
  quoteValidityDays: number;
  pricesIncludeTax: boolean;
  taxRounding: 'per_document' | 'per_line';
  bankDetails: string | null;
  defaultTerms: string | null;
  legalFooter: string | null;
  hasLogo: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: CompanyRole;
}

export interface Activity {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  description: string | null;
  color: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface Tax {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  ratePpm: number;
  isCompound: boolean;
  registrationNumber: string | null;
  jurisdiction: string | null;
  isDefault: boolean;
  archivedAt: string | null;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  minorUnits: number;
  isActive: boolean;
}

export interface ExchangeRate {
  id: string;
  baseCode: string;
  quoteCode: string;
  rate: string;
  effectiveDate: string;
  createdAt: string;
}

export interface NumberingSequence {
  docType: DocType;
  pattern: string;
  reset: 'yearly' | 'never';
  periodKey: string;
  nextValue: number;
  preview: string;
}

export interface CompanyMember {
  userId: string;
  displayName: string;
  email: string;
  role: CompanyRole;
}

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  userName: string | null;
  companyId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
}

// ── Commercial ───────────────────────────────────────────────────

export interface Client {
  id: string;
  companyId: string;
  type: 'individual' | 'business';
  name: string;
  contactName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  taxIds: LegalId[];
  taxExempt: boolean;
  exemptionRef: string | null;
  preferredLocale: Locale | null;
  preferredCurrency: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface Balance {
  currency: string;
  invoicedMinor: number;
  paidMinor: number;
  dueMinor: number;
}

export interface ClientDetail extends Client {
  balances: Balance[];
  quotes: QuoteSummary[];
  invoices: InvoiceSummary[];
  payments: PaymentSummary[];
}

export interface CatalogItem {
  id: string;
  companyId: string;
  activityId: string | null;
  kind: 'product' | 'service';
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  unitPriceMinor: number;
  currency: string;
  priceIncludesTax: boolean;
  taxTreatment: 'taxable' | 'zero_rated' | 'exempt';
  taxIds: string[];
  archivedAt: string | null;
}

export interface DocumentLineTax {
  taxId: string | null;
  name: string;
  ratePpm: number;
  isCompound: boolean;
  registrationNumber: string | null;
  baseMinor: number;
  amountMinor: number;
}

export interface DocumentLine {
  id: string;
  position: number;
  catalogItemId: string | null;
  kind: 'product' | 'service' | 'custom';
  sku: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  quantityMilli: number;
  unitPriceMinor: number;
  discountType: 'percent' | 'amount' | null;
  discountValue: number | null;
  taxTreatment: 'taxable' | 'zero_rated' | 'exempt';
  grossMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxes: DocumentLineTax[];
}

interface DocumentCommon {
  id: string;
  companyId: string;
  clientId: string;
  clientName: string;
  activityId: string | null;
  number: string | null;
  currency: string;
  locale: Locale;
  issueDate: string;
  pricesIncludeTax: boolean;
  taxRounding: 'per_document' | 'per_line';
  docDiscountType: 'percent' | 'amount' | null;
  docDiscountValue: number | null;
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxableBaseMinor: number;
  taxTotalMinor: number;
  totalMinor: number;
  terms: string | null;
  notes: string | null;
  clientSnapshot: Record<string, unknown> | null;
  companySnapshot: Record<string, unknown> | null;
  duplicatedFromId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteSummary {
  id: string;
  number: string | null;
  clientId: string;
  clientName: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  totalMinor: number;
  status: QuoteStatus;
  displayStatus: QuoteStatus;
  invoiceId: string | null;
}

export interface Quote extends DocumentCommon {
  status: QuoteStatus;
  displayStatus: QuoteStatus;
  validUntil: string;
  sentAt: string | null;
  decidedAt: string | null;
  cancelledAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  lines: DocumentLine[];
}

export interface InvoiceSummary {
  id: string;
  number: string | null;
  clientId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  balanceMinor: number;
  status: InvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
}

export interface TaxTotalRow {
  taxId: string | null;
  name: string;
  ratePpm: number;
  isCompound: boolean;
  registrationNumber: string | null;
  baseMinor: number;
  amountMinor: number;
}

export interface Invoice extends DocumentCommon {
  status: InvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
  dueDate: string;
  paymentTerms: string | null;
  sourceQuoteId: string | null;
  sourceQuoteNumber: string | null;
  issuedAt: string | null;
  amountPaidMinor: number;
  balanceMinor: number;
  cancelledAt: string | null;
  cancelReason: string | null;
  lines: DocumentLine[];
  taxTotals: TaxTotalRow[];
  payments: PaymentSummary[];
}

export interface PaymentSummary {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientId: string;
  clientName: string;
  paymentDate: string;
  amountMinor: number;
  currency: string;
  method: 'bank_transfer' | 'cash' | 'card' | 'cheque' | 'other';
  reference: string | null;
  notes: string | null;
  status: 'recorded' | 'voided';
  voidReason: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  createdAt: string;
}

export interface Receipt {
  id: string;
  companyId: string;
  paymentId: string;
  number: string;
  issueDate: string;
  amountMinor: number;
  currency: string;
  balanceBeforeMinor: number;
  balanceAfterMinor: number;
  isFullPayment: boolean;
  status: 'valid' | 'void';
  snapshot: ReceiptSnapshot;
  createdAt: string;
}

export interface ReceiptSnapshot {
  company: Record<string, unknown>;
  client: Record<string, unknown>;
  invoice: { id: string; number: string; issueDate: string; totalMinor: number; currency: string };
  payment: { date: string; method: string; reference: string | null };
}
