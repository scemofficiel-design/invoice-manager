import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useSession } from '@/contexts/session';
import { AppShell } from '@/layouts/AppShell';
import { SetupPage } from '@/pages/AuthPages';
import { HomePage } from '@/pages/HomePage';
import { CompanyOverviewPage, GeneralSettingsPage, NewCompanyPage } from '@/modules/companies/pages';
import { ActivitiesPage, NumberingPage, TaxesPage } from '@/modules/companies/settings';
import { AccountPage, AuditPage, CurrenciesPage } from '@/modules/admin/pages';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ClientDetailPage, ClientsPage } from '@/modules/clients/pages';
import { CatalogPage } from '@/modules/catalog/pages';
import { QuoteEditorPage, QuotesPage, QuoteViewPage } from '@/modules/documents/quotes';
import { InvoiceEditorPage, InvoicesPage, InvoiceViewPage } from '@/modules/documents/invoices';
import { PaymentsPage, ReceiptPage } from '@/modules/payments/pages';
import { BackupsPage } from '@/modules/admin/BackupsPage';
import { FoldersPage } from '@/modules/folders/pages';

function Splash() {
  return <div className="flex h-full items-center justify-center"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-9 animate-pulse" /></div>;
}

function Protected({ children }: { children: ReactNode }) {
  const { status, me, loading } = useSession();
  const location = useLocation();
  if (loading || !status) return <Splash />;
  if (status.setupRequired) return <Navigate to="/setup" replace />;
  if (!status.authenticated || !me) return <Navigate to="/setup" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function OwnerOnly({ children }: { children: ReactNode }) {
  const { me } = useSession();
  return me?.user.role === 'owner' ? <>{children}</> : <Navigate to="/" replace />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status, loading } = useSession();
  if (loading || !status) return <Splash />;
  if (!status.setupRequired) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/setup" element={<PublicOnly><SetupPage /></PublicOnly>} />
      <Route element={<Protected><AppShell /></Protected>}>
        <Route index element={<HomePage />} />
        <Route path="companies/new" element={<OwnerOnly><NewCompanyPage /></OwnerOnly>} />
        <Route path="c/:companyId" element={<CompanyOverviewPage />} />
        <Route path="c/:companyId/clients" element={<ClientsPage />} />
        <Route path="c/:companyId/clients/:clientId" element={<ClientDetailPage />} />
        <Route path="c/:companyId/catalog" element={<CatalogPage />} />
        <Route path="c/:companyId/folders" element={<FoldersPage />} />
        <Route path="c/:companyId/quotes" element={<QuotesPage />} />
        <Route path="c/:companyId/quotes/new" element={<QuoteEditorPage />} />
        <Route path="c/:companyId/quotes/:quoteId" element={<QuoteViewPage />} />
        <Route path="c/:companyId/quotes/:quoteId/edit" element={<QuoteEditorPage />} />
        <Route path="c/:companyId/invoices" element={<InvoicesPage />} />
        <Route path="c/:companyId/invoices/new" element={<InvoiceEditorPage />} />
        <Route path="c/:companyId/invoices/:invoiceId" element={<InvoiceViewPage />} />
        <Route path="c/:companyId/invoices/:invoiceId/edit" element={<InvoiceEditorPage />} />
        <Route path="c/:companyId/payments" element={<PaymentsPage />} />
        <Route path="c/:companyId/receipts/:receiptId" element={<ReceiptPage />} />
        <Route path="c/:companyId/settings" element={<Navigate to="general" replace />} />
        <Route path="c/:companyId/settings/general" element={<GeneralSettingsPage />} />
        <Route path="c/:companyId/settings/activities" element={<ActivitiesPage />} />
        <Route path="c/:companyId/settings/taxes" element={<TaxesPage />} />
        <Route path="c/:companyId/settings/numbering" element={<NumberingPage />} />
        <Route path="admin/currencies" element={<OwnerOnly><CurrenciesPage /></OwnerOnly>} />
        <Route path="admin/backups" element={<OwnerOnly><BackupsPage /></OwnerOnly>} />
        <Route path="admin/audit" element={<OwnerOnly><AuditPage /></OwnerOnly>} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
