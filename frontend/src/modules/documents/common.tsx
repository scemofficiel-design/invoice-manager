import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useErrorMessage } from '@/hooks/useApiError';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';

/** Boîte de confirmation exigeant un motif (annulation de facture, de paiement…). */
export function ReasonDialog({ title, help, confirmLabel, onConfirm, onClose }: { title: string; help: string; confirmLabel: string; onConfirm: (reason: string) => Promise<void>; onClose: () => void }) {
  const { t } = useTranslation();
  const msg = useErrorMessage();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason);
      onClose();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} description={help}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="reason-form" variant="danger" loading={busy} disabled={reason.trim().length < 3}>{confirmLabel}</Button></>}>
      <form id="reason-form" onSubmit={submit} className="flex flex-col gap-3">
        <Field label={`${t('common.reason')} *`} htmlFor="reason"><Textarea id="reason" autoFocus required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}

export function ListFilters({ q, setQ, status, setStatus, statuses, from, setFrom, to, setTo, children }: { q: string; setQ: (v: string) => void; status: string; setStatus: (v: string) => void; statuses: { value: string; label: string }[]; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input aria-label={t('common.search')} placeholder={t('common.search')} className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Select aria-label={t('common.status')} className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">{t('common.all')}</option>
        {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </Select>
      <Input type="date" aria-label={t('dashboard.from')} title={t('dashboard.from')} className="w-40" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
      <Input type="date" aria-label={t('dashboard.to')} title={t('dashboard.to')} className="w-40" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      {children}
    </div>
  );
}
