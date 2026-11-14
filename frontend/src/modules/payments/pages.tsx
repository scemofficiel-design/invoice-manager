import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Wallet } from 'lucide-react';
import { PdfButtons } from '@/components/PdfButtons';
import { PAYMENT_METHODS } from '@im/shared/constants';
import type { Invoice, PaymentSummary } from '@im/shared/types';
import { api } from '@/services/api';
import { useCompany, usePayments, useReceipt } from '@/hooks/queries';
import { useErrorMessage } from '@/hooks/useApiError';
import { formatDate, minorToInput, tryParseMoney, useMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ReasonDialog } from '@/modules/documents/common';

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function PaymentDialog({ companyId, invoice, onClose }: { companyId: string; invoice: Invoice; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const msg = useErrorMessage();
  const { fmt, minorUnits } = useMoney();
  const mu = minorUnits(invoice.currency);
  // Clé d'idempotence générée une fois par ouverture : un double envoi n'enregistre qu'un paiement.
  const key = useRef(crypto.randomUUID());
  const [v, setV] = useState({ amount: minorToInput(invoice.balanceMinor, mu), paymentDate: todayLocal(), method: 'bank_transfer', reference: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountMinor = tryParseMoney(v.amount, mu);
    if (!amountMinor || amountMinor <= 0) return setError(t('payment.amount'));
    if (amountMinor > invoice.balanceMinor) return setError(t('payment.maxHint', { amount: fmt(invoice.balanceMinor, invoice.currency) }));
    setBusy(true);
    try {
      const p = await api.post<PaymentSummary>(`/companies/${companyId}/payments`, { invoiceId: invoice.id, amountMinor, currency: invoice.currency, paymentDate: v.paymentDate, method: v.method, reference: v.reference, notes: v.notes, idempotencyKey: key.current });
      await qc.invalidateQueries({ queryKey: ['company', companyId] });
      toast.success(`${t('payment.receipt')} ${p.receiptNumber}`);
      onClose();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('invoice.recordPayment')} description={`${invoice.number} · ${invoice.clientName}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="pay-form" loading={busy}>{t('common.save')}</Button></>}>
      <form id="pay-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t('payment.amount')} (${invoice.currency}) *`} htmlFor="p-amount" hint={t('payment.maxHint', { amount: fmt(invoice.balanceMinor, invoice.currency) })}>
          <div className="flex gap-2">
            <Input id="p-amount" required autoFocus inputMode="decimal" className="tabular text-right" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            <Button type="button" variant="secondary" onClick={() => setV({ ...v, amount: minorToInput(invoice.balanceMinor, mu) })}>{t('payment.payFull')}</Button>
          </div>
        </Field>
        <Field label={`${t('payment.date')} *`} htmlFor="p-date"><Input id="p-date" type="date" required min={invoice.issueDate} max={todayLocal()} value={v.paymentDate} onChange={(e) => setV({ ...v, paymentDate: e.target.value })} /></Field>
        <Field label={t('payment.method')} htmlFor="p-method"><Select id="p-method" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`payment.methods.${m}`)}</option>)}</Select></Field>
        <Field label={t('payment.reference')} htmlFor="p-ref"><Input id="p-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} /></Field>
        <Field label={t('common.notes')} htmlFor="p-notes" className="sm:col-span-2"><Textarea id="p-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        {error && <p role="alert" className="text-[13px] text-danger sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}

export function PaymentsTable({ companyId, payments, canVoid, hideInvoice }: { companyId: string; payments: PaymentSummary[]; canVoid: boolean; hideInvoice?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { fmt } = useMoney();
  const [voiding, setVoiding] = useState<PaymentSummary | null>(null);
  return (
    <>
      <Table>
        <thead><tr><th>{t('common.date')}</th>{!hideInvoice && <th>{t('payment.invoice')}</th>}{!hideInvoice && <th className="hidden md:table-cell">{t('doc.client')}</th>}<th className="hidden sm:table-cell">{t('payment.method')}</th><th>{t('payment.receipt')}</th><th className="text-right">{t('payment.amount')}</th>{canVoid && <th />}</tr></thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className={p.status === 'voided' ? 'opacity-60' : ''}>
              <td className="whitespace-nowrap text-muted">{formatDate(p.paymentDate)}</td>
              {!hideInvoice && <td><Link className="font-medium hover:underline" to={`/c/${companyId}/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link></td>}
              {!hideInvoice && <td className="hidden md:table-cell">{p.clientName}</td>}
              <td className="hidden text-muted sm:table-cell">{t(`payment.methods.${p.method}`)}{p.reference ? ` · ${p.reference}` : ''}</td>
              <td>{p.receiptId && <Link className="hover:underline" to={`/c/${companyId}/receipts/${p.receiptId}`}>{p.receiptNumber}</Link>}{p.status === 'voided' && <Badge tone="danger" className="ml-2" >{t('payment.voided')}</Badge>}</td>
              <td className={`tabular whitespace-nowrap text-right font-medium ${p.status === 'voided' ? 'line-through' : ''}`}>{fmt(p.amountMinor, p.currency)}</td>
              {canVoid && <td className="text-right">{p.status === 'recorded' && <Button variant="ghost" size="icon" aria-label={t('payment.void')} onClick={() => setVoiding(p)}><Ban /></Button>}</td>}
            </tr>
          ))}
        </tbody>
      </Table>
      {voiding && (
        <ReasonDialog title={t('payment.void')} help={t('payment.voidHelp')} confirmLabel={t('payment.void')} onClose={() => setVoiding(null)}
          onConfirm={async (reason) => { await api.post(`/companies/${companyId}/payments/${voiding.id}/void`, { reason }); await qc.invalidateQueries({ queryKey: ['company', companyId] }); }} />
      )}
    </>
  );
}

export function PaymentsPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const company = useCompany(companyId);
  const list = usePayments(companyId);
  return (
    <>
      <PageHeader title={t('payment.title')} description={t('payment.subtitle')} />
      <Card>
        {list.isLoading ? <CardBody><Skeleton className="h-24" /></CardBody> : !list.data?.length ? <EmptyState icon={<Wallet />} title={t('payment.empty')} /> : (
          <PaymentsTable companyId={companyId} payments={list.data} canVoid={company.data?.role === 'admin'} />
        )}
      </Card>
    </>
  );
}

/** Reçu imprimable (le modèle PDF dédié arrive en phase 4 ; l'impression navigateur permet déjà l'export PDF). */
export function ReceiptPage() {
  const { t } = useTranslation();
  const { companyId = '', receiptId = '' } = useParams();
  const r = useReceipt(companyId, receiptId);
  const { fmt } = useMoney();
  if (r.isLoading) return <Skeleton className="h-80" />;
  if (!r.data) return null;
  const rc = r.data;
  const co = rc.snapshot.company as Record<string, string | null>;
  const cl = rc.snapshot.client as Record<string, string | null>;
  const row = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-0"><span className="text-muted">{label}</span><span className={`tabular ${strong ? 'font-semibold' : ''}`}>{value}</span></div>
  );
  return (
    <>
      <div className="mb-3 flex items-center justify-between print:hidden">
        <Link to={`/c/${companyId}/payments`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><ArrowLeft className="size-3.5" />{t('payment.title')}</Link>
        <div className="flex gap-2"><PdfButtons path={`/companies/${companyId}/receipts/${rc.id}/pdf`} /></div>
      </div>
      <Card className="relative mx-auto max-w-2xl print:border-0 print:shadow-none">
        {rc.status === 'void' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="-rotate-12 rounded-lg border-4 border-danger px-6 py-2 text-3xl font-bold text-danger opacity-70">{t('receipt.void')}</span></div>}
        <CardBody className="space-y-6 p-8 text-[13px]">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <p className="text-base font-semibold">{co.tradeName || co.legalName}</p>
              {co.tradeName && <p className="text-muted">{co.legalName}</p>}
              {[co.addressLine1, [co.postalCode, co.city].filter(Boolean).join(' '), co.country].filter(Boolean).map((x) => <p key={x} className="text-muted">{x}</p>)}
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">{t('receipt.title')}</p>
              <p>{t('receipt.number')} {rc.number}</p>
              <p className="text-muted">{formatDate(rc.issueDate)}</p>
              <Badge tone={rc.isFullPayment ? 'success' : 'warning'} className="mt-1">{rc.isFullPayment ? t('receipt.full') : t('receipt.partial')}</Badge>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-subtle">{t('receipt.receivedFrom')}</p>
            <p className="font-medium">{cl.name}</p>
            {[cl.addressLine1, [cl.postalCode, cl.city].filter(Boolean).join(' ')].filter(Boolean).map((x) => <p key={x} className="text-muted">{x}</p>)}
          </div>
          <div>
            {row(t('receipt.for'), `${rc.snapshot.invoice.number} (${formatDate(rc.snapshot.invoice.issueDate)})`)}
            {row(t('common.total'), fmt(rc.snapshot.invoice.totalMinor, rc.currency))}
            {row(t('payment.method'), `${t(`payment.methods.${rc.snapshot.payment.method}`)}${rc.snapshot.payment.reference ? ` · ${rc.snapshot.payment.reference}` : ''}`)}
            {row(t('receipt.balanceBefore'), fmt(rc.balanceBeforeMinor, rc.currency))}
            {row(t('receipt.received'), fmt(rc.amountMinor, rc.currency), true)}
            {row(t('receipt.balanceAfter'), fmt(rc.balanceAfterMinor, rc.currency), true)}
          </div>
          <p className="text-xs text-subtle print:hidden">{t('receipt.printHint')}</p>
        </CardBody>
      </Card>
    </>
  );
}
