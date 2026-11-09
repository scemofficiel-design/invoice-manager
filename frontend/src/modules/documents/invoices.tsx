import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Copy, FileCheck2, FilePlus2, Pencil, Receipt as ReceiptIcon, Trash2, Wallet } from 'lucide-react';
import { INVOICE_DISPLAY_STATUSES } from '@im/shared/constants';
import type { Invoice } from '@im/shared/types';
import { api } from '@/services/api';
import { useCompany, useCurrencies, useInvoice, useInvoices } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useToastError } from '@/hooks/useApiError';
import { useConfirm } from '@/contexts/confirm';
import { formatDate, useMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
import { InvoiceStatusBadge } from '@/components/StatusBadge';
import { PdfButtons } from '@/components/PdfButtons';
import { canEdit } from '@/modules/clients/pages';
import { PaymentDialog, PaymentsTable } from '@/modules/payments/pages';
import { DocumentEditor } from './DocumentEditor';
import { DocumentView } from './DocumentView';
import { ListFilters, ReasonDialog } from './common';

export function InvoicesPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const navigate = useNavigate();
  const company = useCompany(companyId);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounced(q);
  const params = new URLSearchParams({ ...(dq ? { q: dq } : {}), ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const list = useInvoices(companyId, params);
  const { fmt } = useMoney();
  const editable = canEdit(company.data?.role);
  return (
    <>
      <PageHeader title={t('invoice.title')} description={t('invoice.subtitle')} actions={editable && <Button asChild><Link to={`/c/${companyId}/invoices/new`}><FilePlus2 />{t('invoice.new')}</Link></Button>} />
      <Card>
        <ListFilters q={q} setQ={setQ} status={status} setStatus={setStatus} from={from} setFrom={setFrom} to={to} setTo={setTo} statuses={INVOICE_DISPLAY_STATUSES.map((s) => ({ value: s, label: t(`invoice.status.${s}`) }))} />
        {list.isLoading ? <CardBody><Skeleton className="h-24" /></CardBody> : !list.data?.length ? (
          <EmptyState icon={<FileCheck2 />} title={t('invoice.empty')} text={!q && !status && !from && !to ? t('invoice.emptyText') : undefined} action={editable && !q && !status && !from && !to && <Button asChild><Link to={`/c/${companyId}/invoices/new`}><FilePlus2 />{t('invoice.new')}</Link></Button>} />
        ) : (
          <Table>
            <thead><tr><th>{t('doc.number')}</th><th>{t('doc.client')}</th><th className="hidden sm:table-cell">{t('doc.issueDate')}</th><th className="hidden md:table-cell">{t('doc.dueDate')}</th><th>{t('common.status')}</th><th className="text-right">{t('common.total')}</th><th className="hidden text-right lg:table-cell">{t('invoice.balance')}</th></tr></thead>
            <tbody>
              {list.data.map((x) => (
                <tr key={x.id} className="cursor-pointer" onClick={() => navigate(`/c/${companyId}/invoices/${x.id}`)}>
                  <td><Link to={`/c/${companyId}/invoices/${x.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{x.number ?? <span className="text-muted">{t('doc.draftNumber')}</span>}</Link></td>
                  <td>{x.clientName}</td>
                  <td className="hidden text-muted sm:table-cell">{formatDate(x.issueDate)}</td>
                  <td className="hidden text-muted md:table-cell">{formatDate(x.dueDate)}</td>
                  <td><InvoiceStatusBadge status={x.displayStatus} /></td>
                  <td className="tabular whitespace-nowrap text-right">{fmt(x.totalMinor, x.currency)}</td>
                  <td className="tabular hidden whitespace-nowrap text-right lg:table-cell">{x.status === 'issued' ? fmt(x.balanceMinor, x.currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export function InvoiceEditorPage() {
  const { companyId = '', invoiceId } = useParams();
  const [sp] = useSearchParams();
  const company = useCompany(companyId);
  const currencies = useCurrencies();
  const invoice = useInvoice(companyId, invoiceId ?? '');
  if (!company.data || !currencies.data || (invoiceId && !invoice.data)) return <Skeleton className="h-80" />;
  return <DocumentEditor kind="invoice" company={company.data} existing={invoiceId ? invoice.data : undefined} initialClientId={sp.get('client')} />;
}

export function InvoiceViewPage() {
  const { t } = useTranslation();
  const { companyId = '', invoiceId = '' } = useParams();
  const navigate = useNavigate();
  const company = useCompany(companyId);
  const invoice = useInvoice(companyId, invoiceId);
  const { fmt } = useMoney();
  const qc = useQueryClient();
  const onError = useToastError();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'cancel' | 'pay' | null>(null);
  if (invoice.isLoading) return <Skeleton className="h-80" />;
  if (!invoice.data) return null;
  const inv = invoice.data;
  const role = company.data?.role;
  const editable = canEdit(role);
  const refresh = () => qc.invalidateQueries({ queryKey: ['company', companyId] });
  const act = async (action: 'issue' | 'duplicate' | 'delete') => {
    if (action === 'issue' && !(await confirm({ title: t('invoice.issue'), message: t('invoice.issueConfirm'), confirmLabel: t('invoice.issue') }))) return;
    if (action === 'delete' && !(await confirm({ title: t('invoice.deleteDraft'), message: t('invoice.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    setBusy(action);
    try {
      if (action === 'delete') {
        await api.del(`/companies/${companyId}/invoices/${inv.id}`);
        await refresh();
        navigate(`/c/${companyId}/invoices`);
      } else if (action === 'duplicate') {
        const d = await api.post<Invoice>(`/companies/${companyId}/invoices/${inv.id}/duplicate`);
        await refresh();
        navigate(`/c/${companyId}/invoices/${d.id}/edit`);
      } else {
        await api.post(`/companies/${companyId}/invoices/${inv.id}/issue`);
        await refresh();
        toast.success(t('invoice.status.issued'));
      }
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Link to={`/c/${companyId}/invoices`} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><ArrowLeft className="size-3.5" />{t('invoice.title')}</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{inv.number ?? t('doc.draftNumber')}<InvoiceStatusBadge status={inv.displayStatus} /></span>}
        description={[inv.clientName, inv.sourceQuoteNumber ? `${t('doc.fromQuote')} ${inv.sourceQuoteNumber}` : null].filter(Boolean).join(' · ')}
        actions={editable && (
          <div className="flex flex-wrap justify-end gap-2">
            {inv.status === 'draft' && <Button variant="secondary" asChild><Link to={`/c/${companyId}/invoices/${inv.id}/edit`}><Pencil />{t('common.edit')}</Link></Button>}
            {inv.status === 'draft' && <Button loading={busy === 'issue'} onClick={() => void act('issue')}><FileCheck2 />{t('invoice.issue')}</Button>}
            {inv.status === 'issued' && inv.balanceMinor > 0 && <Button onClick={() => setDialog('pay')}><Wallet />{t('invoice.recordPayment')}</Button>}
            <PdfButtons href={`/api/v1/companies/${companyId}/invoices/${inv.id}/pdf`} />
            <Button variant="secondary" loading={busy === 'duplicate'} onClick={() => void act('duplicate')}><Copy />{t('common.duplicate')}</Button>
            {inv.status === 'issued' && role === 'admin' && <Button variant="ghost" onClick={() => setDialog('cancel')}><Ban />{t('invoice.cancel')}</Button>}
            {inv.status === 'draft' && <Button variant="ghost" loading={busy === 'delete'} onClick={() => void act('delete')}><Trash2 />{t('invoice.deleteDraft')}</Button>}
          </div>
        )}
      />
      {inv.status === 'cancelled' && <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{t('invoice.cancelledBecause', { reason: inv.cancelReason })}</p>}
      {inv.status === 'issued' && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Card className="p-4"><p className="text-xs text-muted">{t('common.total')}</p><p className="tabular text-lg font-semibold">{fmt(inv.totalMinor, inv.currency)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted">{t('invoice.paid')}</p><p className="tabular text-lg font-semibold text-success">{fmt(inv.amountPaidMinor, inv.currency)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted">{t('invoice.balance')}</p><p className="tabular text-lg font-semibold">{fmt(inv.balanceMinor, inv.currency)}</p></Card>
        </div>
      )}
      <DocumentView doc={inv} kind="invoice" />
      {inv.payments.length > 0 && (
        <Card className="mt-5">
          <CardHeader title={<span className="flex items-center gap-2"><ReceiptIcon className="size-4 text-muted" />{t('nav.payments')}</span>} />
          <PaymentsTable companyId={companyId} payments={inv.payments} canVoid={role === 'admin'} hideInvoice />
        </Card>
      )}
      {dialog === 'cancel' && (
        <ReasonDialog title={t('invoice.cancel')} help={t('invoice.cancelHelp')} confirmLabel={t('invoice.cancel')} onClose={() => setDialog(null)}
          onConfirm={async (reason) => { await api.post(`/companies/${companyId}/invoices/${inv.id}/cancel`, { reason }); await refresh(); }} />
      )}
      {dialog === 'pay' && <PaymentDialog companyId={companyId} invoice={inv} onClose={() => setDialog(null)} />}
    </>
  );
}
