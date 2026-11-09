import type { CatalogItem, Client, ClientDetail, Invoice, InvoiceSummary, PaymentSummary, Quote, QuoteSummary, Receipt } from '@im/shared/types';
import { useQuery } from '@tanstack/react-query';
import type { Activity, AuditEntry, Company, CompanyMember, Currency, ExchangeRate, NumberingSequence, Tax, UserSummary } from '@im/shared/types';
import { api } from '@/services/api';

export const qk = {
  company: (id: string) => ['company', id] as const,
  activities: (id: string, archived: boolean) => ['company', id, 'activities', archived] as const,
  taxes: (id: string, archived: boolean) => ['company', id, 'taxes', archived] as const,
  numbering: (id: string) => ['company', id, 'numbering'] as const,
  members: (id: string) => ['company', id, 'members'] as const,
  currencies: ['currencies'] as const,
  rates: ['exchange-rates'] as const,
  users: ['admin', 'users'] as const,
  audit: (companyId?: string) => ['admin', 'audit', companyId ?? 'all'] as const,
};

export const useCompany = (id: string) => useQuery({ queryKey: qk.company(id), queryFn: () => api.get<Company>(`/companies/${id}`) });
export const useActivities = (id: string, archived = false) =>
  useQuery({ queryKey: qk.activities(id, archived), queryFn: () => api.get<Activity[]>(`/companies/${id}/activities?includeArchived=${archived}`) });
export const useTaxes = (id: string, archived = false) =>
  useQuery({ queryKey: qk.taxes(id, archived), queryFn: () => api.get<Tax[]>(`/companies/${id}/taxes?includeArchived=${archived}`) });
export const useNumbering = (id: string) => useQuery({ queryKey: qk.numbering(id), queryFn: () => api.get<NumberingSequence[]>(`/companies/${id}/numbering`) });
export const useMembers = (id: string) => useQuery({ queryKey: qk.members(id), queryFn: () => api.get<CompanyMember[]>(`/companies/${id}/members`) });
export const useCurrencies = () => useQuery({ queryKey: qk.currencies, queryFn: () => api.get<Currency[]>('/currencies') });
export const useRates = () => useQuery({ queryKey: qk.rates, queryFn: () => api.get<ExchangeRate[]>('/exchange-rates') });
export const useUsers = (enabled = true) => useQuery({ queryKey: qk.users, queryFn: () => api.get<UserSummary[]>('/admin/users'), enabled });
export const useAudit = (companyId?: string) =>
  useQuery({ queryKey: qk.audit(companyId), queryFn: () => api.get<AuditEntry[]>(`/admin/audit${companyId ? `?companyId=${companyId}` : ''}`) });

// ── Commercial ──

export const qkc = {
  clients: (cid: string, archived: boolean, q: string) => ['company', cid, 'clients', archived, q] as const,
  client: (cid: string, id: string) => ['company', cid, 'client', id] as const,
  catalog: (cid: string, archived: boolean, q: string) => ['company', cid, 'catalog', archived, q] as const,
  quotes: (cid: string, f: string) => ['company', cid, 'quotes', f] as const,
  quote: (cid: string, id: string) => ['company', cid, 'quote', id] as const,
  invoices: (cid: string, f: string) => ['company', cid, 'invoices', f] as const,
  invoice: (cid: string, id: string) => ['company', cid, 'invoice', id] as const,
  payments: (cid: string) => ['company', cid, 'payments'] as const,
  receipt: (cid: string, id: string) => ['company', cid, 'receipt', id] as const,
};

export const useClients = (cid: string, archived = false, q = '') =>
  useQuery({ queryKey: qkc.clients(cid, archived, q), queryFn: () => api.get<Client[]>(`/companies/${cid}/clients?includeArchived=${archived}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
export const useClient = (cid: string, id: string) => useQuery({ queryKey: qkc.client(cid, id), queryFn: () => api.get<ClientDetail>(`/companies/${cid}/clients/${id}`), enabled: !!id });
export const useCatalog = (cid: string, archived = false, q = '') =>
  useQuery({ queryKey: qkc.catalog(cid, archived, q), queryFn: () => api.get<CatalogItem[]>(`/companies/${cid}/catalog?includeArchived=${archived}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
export const useQuotes = (cid: string, params: string) => useQuery({ queryKey: qkc.quotes(cid, params), queryFn: () => api.get<QuoteSummary[]>(`/companies/${cid}/quotes?${params}`) });
export const useQuote = (cid: string, id: string) => useQuery({ queryKey: qkc.quote(cid, id), queryFn: () => api.get<Quote>(`/companies/${cid}/quotes/${id}`), enabled: !!id });
export const useInvoices = (cid: string, params: string) => useQuery({ queryKey: qkc.invoices(cid, params), queryFn: () => api.get<InvoiceSummary[]>(`/companies/${cid}/invoices?${params}`) });
export const useInvoice = (cid: string, id: string) => useQuery({ queryKey: qkc.invoice(cid, id), queryFn: () => api.get<Invoice>(`/companies/${cid}/invoices/${id}`), enabled: !!id });
export const usePayments = (cid: string) => useQuery({ queryKey: qkc.payments(cid), queryFn: () => api.get<PaymentSummary[]>(`/companies/${cid}/payments`) });
export const useReceipt = (cid: string, id: string) => useQuery({ queryKey: qkc.receipt(cid, id), queryFn: () => api.get<Receipt>(`/companies/${cid}/receipts/${id}`), enabled: !!id });
