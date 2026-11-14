import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, FilePlus2, FileText, Pencil, Search, UserPlus, Users } from 'lucide-react';
import type { Client } from '@im/shared/types';
import { api } from '@/services/api';
import { useClient, useClients, useCompany } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useToastError } from '@/hooks/useApiError';
import { formatDate, useMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
import { Checkbox, Input } from '@/components/ui/input';
import { InvoiceStatusBadge, QuoteStatusBadge } from '@/components/StatusBadge';
import { ClientDialog } from './ClientDialog';
import { ClientFolderCard } from '@/modules/folders/pages';

export const canEdit = (role?: string) => role === 'admin' || role === 'editor';

export function ClientsPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const navigate = useNavigate();
  const company = useCompany(companyId);
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const dq = useDebounced(q);
  const list = useClients(companyId, archived, dq);
  const [creating, setCreating] = useState(false);
  const editable = canEdit(company.data?.role);
  return (
    <>
      <PageHeader title={t('client.title')} description={t('client.subtitle')} actions={editable && <Button onClick={() => setCreating(true)}><UserPlus />{t('client.new')}</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input aria-label={t('common.search')} placeholder={t('common.search')} className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Checkbox id="cl-arch" label={t('common.showArchived')} checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        </div>
        {list.isLoading ? <CardBody><Skeleton className="h-24" /></CardBody> : !list.data?.length ? (
          <EmptyState icon={<Users />} title={t('client.empty')} text={!q ? t('client.emptyText') : undefined} action={editable && !q && <Button onClick={() => setCreating(true)}><UserPlus />{t('client.new')}</Button>} />
        ) : (
          <Table>
            <thead><tr><th>{t('client.name')}</th><th className="hidden md:table-cell">{t('client.contactName')}</th><th className="hidden sm:table-cell">{t('auth.email')}</th><th className="hidden lg:table-cell">{t('company.city')}</th></tr></thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className={`cursor-pointer ${c.archivedAt ? 'opacity-60' : ''}`} onClick={() => navigate(`/c/${companyId}/clients/${c.id}`)}>
                  <td><Link to={`/c/${companyId}/clients/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{c.name}</Link>{c.archivedAt && <Badge className="ml-2">{t('common.archived')}</Badge>}{c.taxExempt && <Badge tone="warning" className="ml-2">{t('catalog.exempt')}</Badge>}</td>
                  <td className="hidden text-muted md:table-cell">{c.contactName ?? '—'}</td>
                  <td className="hidden text-muted sm:table-cell">{c.email ?? '—'}</td>
                  <td className="hidden text-muted lg:table-cell">{c.city ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {creating && <ClientDialog companyId={companyId} client={null} onClose={() => setCreating(false)} onSaved={(c: Client) => navigate(`/c/${companyId}/clients/${c.id}`)} />}
    </>
  );
}

export function ClientDetailPage() {
  const { t } = useTranslation();
  const { companyId = '', clientId = '' } = useParams();
  const company = useCompany(companyId);
  const detail = useClient(companyId, clientId);
  const { fmt } = useMoney();
  const qc = useQueryClient();
  const onError = useToastError();
  const [editing, setEditing] = useState(false);
  if (detail.isLoading) return <Skeleton className="h-60" />;
  if (!detail.data) return null;
  const c = detail.data;
  const editable = canEdit(company.data?.role);
  const toggleArchive = async () => {
    try {
      await api.post(`/companies/${companyId}/clients/${c.id}/${c.archivedAt ? 'unarchive' : 'archive'}`);
      await qc.invalidateQueries({ queryKey: ['company', companyId] });
    } catch (e) {
      onError(e);
    }
  };
  const addr = [c.addressLine1, c.addressLine2, [c.postalCode, c.city].filter(Boolean).join(' '), c.region, c.country].filter(Boolean);
  return (
    <>
      <Link to={`/c/${companyId}/clients`} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><ArrowLeft className="size-3.5" />{t('client.title')}</Link>
      <PageHeader
        title={<span className="flex items-center gap-2">{c.name}{c.archivedAt && <Badge>{t('common.archived')}</Badge>}</span>}
        description={[c.type === 'business' ? t('client.business') : t('client.individual'), c.contactName].filter(Boolean).join(' · ')}
        actions={editable && (
          <>
            {!c.archivedAt && <Button variant="secondary" asChild><Link to={`/c/${companyId}/quotes/new?client=${c.id}`}><FileText />{t('quote.new')}</Link></Button>}
            {!c.archivedAt && <Button asChild><Link to={`/c/${companyId}/invoices/new?client=${c.id}`}><FilePlus2 />{t('invoice.new')}</Link></Button>}
            <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(true)}><Pencil /></Button>
            <Button variant="ghost" size="icon" aria-label={c.archivedAt ? t('common.unarchive') : t('common.archive')} onClick={() => void toggleArchive()}>{c.archivedAt ? <ArchiveRestore /> : <Archive />}</Button>
          </>
        )}
      />
      <div className="grid gap-5 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader title={t('company.contact')} />
          <CardBody className="space-y-1 text-[13px]">
            {addr.map((l) => <p key={l}>{l}</p>)}
            {c.email && <p className="pt-1 text-muted">{c.email}</p>}
            {c.phone && <p className="text-muted">{c.phone}</p>}
            {c.taxIds.length > 0 && <p className="pt-1 text-muted">{c.taxIds.map((x) => `${x.label} ${x.value}`).join(' · ')}</p>}
            {c.taxExempt && <p className="pt-1"><Badge tone="warning">{t('client.taxExempt')}</Badge> {c.exemptionRef}</p>}
            {c.notes && <p className="whitespace-pre-line border-t border-border pt-2 text-muted">{c.notes}</p>}
            {!addr.length && !c.email && !c.phone && <p className="text-muted">{t('company.notConfigured')}</p>}
          </CardBody>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader title={t('client.balance')} />
          <CardBody>
            {c.balances.length === 0 ? <p className="text-[13px] text-muted">{t('client.noBalance')}</p> : (
              <div className="grid gap-3 sm:grid-cols-3">
                {c.balances.map((b) => (
                  <div key={b.currency} className="contents">
                    <div><p className="text-xs text-muted">{t('client.invoiced')} ({b.currency})</p><p className="tabular font-semibold">{fmt(b.invoicedMinor, b.currency)}</p></div>
                    <div><p className="text-xs text-muted">{t('client.paid')}</p><p className="tabular font-semibold text-success">{fmt(b.paidMinor, b.currency)}</p></div>
                    <div><p className="text-xs text-muted">{t('client.due')}</p><p className="tabular font-semibold">{fmt(b.dueMinor, b.currency)}</p></div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title={t('nav.invoices')} />
        {!c.invoices.length ? <CardBody className="text-[13px] text-muted">{t('invoice.empty')}</CardBody> : (
          <Table>
            <thead><tr><th>{t('doc.number')}</th><th>{t('doc.issueDate')}</th><th>{t('common.status')}</th><th className="text-right">{t('common.total')}</th><th className="text-right">{t('invoice.balance')}</th></tr></thead>
            <tbody>{c.invoices.map((i) => (
              <tr key={i.id}><td><Link className="font-medium hover:underline" to={`/c/${companyId}/invoices/${i.id}`}>{i.number ?? t('doc.draftNumber')}</Link></td><td className="text-muted">{formatDate(i.issueDate)}</td><td><InvoiceStatusBadge status={i.displayStatus} /></td><td className="tabular text-right">{fmt(i.totalMinor, i.currency)}</td><td className="tabular text-right">{fmt(i.balanceMinor, i.currency)}</td></tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('nav.quotes')} />
          {!c.quotes.length ? <CardBody className="text-[13px] text-muted">{t('quote.empty')}</CardBody> : (
            <Table>
              <thead><tr><th>{t('doc.number')}</th><th>{t('common.status')}</th><th className="text-right">{t('common.total')}</th></tr></thead>
              <tbody>{c.quotes.map((q) => (
                <tr key={q.id}><td><Link className="font-medium hover:underline" to={`/c/${companyId}/quotes/${q.id}`}>{q.number}</Link></td><td><QuoteStatusBadge status={q.displayStatus} /></td><td className="tabular text-right">{fmt(q.totalMinor, q.currency)}</td></tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t('nav.payments')} />
          {!c.payments.length ? <CardBody className="text-[13px] text-muted">{t('payment.empty')}</CardBody> : (
            <Table>
              <thead><tr><th>{t('common.date')}</th><th>{t('payment.invoice')}</th><th className="text-right">{t('payment.amount')}</th></tr></thead>
              <tbody>{c.payments.map((p) => (
                <tr key={p.id} className={p.status === 'voided' ? 'opacity-60 line-through' : ''}><td className="text-muted">{formatDate(p.paymentDate)}</td><td><Link className="hover:underline" to={`/c/${companyId}/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link></td><td className="tabular text-right">{fmt(p.amountMinor, p.currency)}</td></tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
      </div>
      <ClientFolderCard companyId={companyId} clientId={c.id} clientName={c.name} />
      {editing && <ClientDialog companyId={companyId} client={c} onClose={() => setEditing(false)} />}
    </>
  );
}
