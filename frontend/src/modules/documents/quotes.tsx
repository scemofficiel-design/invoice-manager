import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Check, Copy, FileInput, FileText, Pencil, Plus, Send, X } from 'lucide-react';
import { QUOTE_STATUSES } from '@im/shared/constants';
import type { Invoice, Quote } from '@im/shared/types';
import { api } from '@/services/api';
import { useCompany, useCurrencies, useQuote, useQuotes } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useToastError } from '@/hooks/useApiError';
import { useConfirm } from '@/contexts/confirm';
import { formatDate, useMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardBody, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
import { QuoteStatusBadge } from '@/components/StatusBadge';
import { PdfButtons } from '@/components/PdfButtons';
import { canEdit } from '@/modules/clients/pages';
import { DocumentEditor } from './DocumentEditor';
import { DocumentView } from './DocumentView';
import { ListFilters } from './common';

export function QuotesPage() {
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
  const list = useQuotes(companyId, params);
  const { fmt } = useMoney();
  const editable = canEdit(company.data?.role);
  return (
    <>
      <PageHeader title={t('quote.title')} description={t('quote.subtitle')} actions={editable && <Button asChild><Link to={`/c/${companyId}/quotes/new`}><Plus />{t('quote.new')}</Link></Button>} />
      <Card>
        <ListFilters q={q} setQ={setQ} status={status} setStatus={setStatus} from={from} setFrom={setFrom} to={to} setTo={setTo} statuses={QUOTE_STATUSES.map((s) => ({ value: s, label: t(`quote.status.${s}`) }))} />
        {list.isLoading ? <CardBody><Skeleton className="h-24" /></CardBody> : !list.data?.length ? (
          <EmptyState icon={<FileText />} title={t('quote.empty')} text={!q && !status && !from && !to ? t('quote.emptyText') : undefined} action={editable && !q && !status && !from && !to && <Button asChild><Link to={`/c/${companyId}/quotes/new`}><Plus />{t('quote.new')}</Link></Button>} />
        ) : (
          <Table>
            <thead><tr><th>{t('doc.number')}</th><th>{t('doc.client')}</th><th className="hidden sm:table-cell">{t('doc.issueDate')}</th><th className="hidden md:table-cell">{t('doc.validUntil')}</th><th>{t('common.status')}</th><th className="text-right">{t('common.total')}</th></tr></thead>
            <tbody>
              {list.data.map((x) => (
                <tr key={x.id} className="cursor-pointer" onClick={() => navigate(`/c/${companyId}/quotes/${x.id}`)}>
                  <td><Link to={`/c/${companyId}/quotes/${x.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{x.number}</Link></td>
                  <td>{x.clientName}</td>
                  <td className="hidden text-muted sm:table-cell">{formatDate(x.issueDate)}</td>
                  <td className="hidden text-muted md:table-cell">{formatDate(x.validUntil)}</td>
                  <td><QuoteStatusBadge status={x.displayStatus} /></td>
                  <td className="tabular whitespace-nowrap text-right">{fmt(x.totalMinor, x.currency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export function QuoteEditorPage() {
  const { companyId = '', quoteId } = useParams();
  const [sp] = useSearchParams();
  const company = useCompany(companyId);
  const currencies = useCurrencies();
  const quote = useQuote(companyId, quoteId ?? '');
  if (!company.data || !currencies.data || (quoteId && !quote.data)) return <Skeleton className="h-80" />;
  return <DocumentEditor kind="quote" company={company.data} existing={quoteId ? quote.data : undefined} initialClientId={sp.get('client')} />;
}

export function QuoteViewPage() {
  const { t } = useTranslation();
  const { companyId = '', quoteId = '' } = useParams();
  const navigate = useNavigate();
  const company = useCompany(companyId);
  const quote = useQuote(companyId, quoteId);
  const qc = useQueryClient();
  const onError = useToastError();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  if (quote.isLoading) return <Skeleton className="h-80" />;
  if (!quote.data) return null;
  const q = quote.data;
  const editable = canEdit(company.data?.role);
  const act = async (action: string) => {
    if (action === 'cancel' && !(await confirm({ title: t('quote.cancel'), message: t('quote.cancelConfirm'), confirmLabel: t('quote.cancel'), danger: true }))) return;
    setBusy(action);
    try {
      if (action === 'duplicate') {
        const d = await api.post<Quote>(`/companies/${companyId}/quotes/${q.id}/duplicate`);
        await qc.invalidateQueries({ queryKey: ['company', companyId] });
        navigate(`/c/${companyId}/quotes/${d.id}/edit`);
      } else if (action === 'convert') {
        const inv = await api.post<Invoice>(`/companies/${companyId}/quotes/${q.id}/convert`);
        await qc.invalidateQueries({ queryKey: ['company', companyId] });
        toast.success(t('common.created'));
        navigate(`/c/${companyId}/invoices/${inv.id}`);
      } else {
        await api.post(`/companies/${companyId}/quotes/${q.id}/${action}`);
        await qc.invalidateQueries({ queryKey: ['company', companyId] });
      }
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };
  const s = q.status;
  return (
    <>
      <Link to={`/c/${companyId}/quotes`} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><ArrowLeft className="size-3.5" />{t('quote.title')}</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{q.number}<QuoteStatusBadge status={q.displayStatus} /></span>}
        description={q.clientName}
        actions={editable && (
          <div className="flex flex-wrap justify-end gap-2">
            {s === 'draft' && <Button variant="secondary" asChild><Link to={`/c/${companyId}/quotes/${q.id}/edit`}><Pencil />{t('common.edit')}</Link></Button>}
            {s === 'draft' && <Button loading={busy === 'send'} onClick={() => void act('send')}><Send />{t('quote.send')}</Button>}
            {s === 'sent' && q.displayStatus !== 'expired' && <Button loading={busy === 'accept'} onClick={() => void act('accept')}><Check />{t('quote.accept')}</Button>}
            {s === 'sent' && <Button variant="secondary" loading={busy === 'refuse'} onClick={() => void act('refuse')}><X />{t('quote.refuse')}</Button>}
            {s === 'accepted' && !q.invoiceId && <Button loading={busy === 'convert'} disabled={busy === 'convert'} onClick={() => void act('convert')}><FileInput />{t('quote.convert')}</Button>}
            {q.invoiceId && <Button variant="secondary" asChild><Link to={`/c/${companyId}/invoices/${q.invoiceId}`}><FileText />{t('quote.viewInvoice')}</Link></Button>}
            <PdfButtons href={`/api/v1/companies/${companyId}/quotes/${q.id}/pdf`} />
            <Button variant="secondary" loading={busy === 'duplicate'} onClick={() => void act('duplicate')}><Copy />{t('common.duplicate')}</Button>
            {['draft', 'sent', 'accepted'].includes(s) && !q.invoiceId && <Button variant="ghost" loading={busy === 'cancel'} onClick={() => void act('cancel')}><Ban />{t('quote.cancel')}</Button>}
          </div>
        )}
      />
      <DocumentView doc={q} kind="quote" />
    </>
  );
}
