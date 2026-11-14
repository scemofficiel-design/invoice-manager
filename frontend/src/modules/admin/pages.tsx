import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Coins, History, Plus, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { qk, useAudit, useCurrencies, useRates } from '@/hooks/queries';
import { useErrorMessage, useToastError } from '@/hooks/useApiError';
import { useMe } from '@/contexts/session';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';

function FormDialog({ title, open, onClose, onSubmit, children }: { title: string; open: boolean; onClose: () => void; onSubmit: () => Promise<void>; children: React.ReactNode }) {
  const { t } = useTranslation();
  const msg = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="admin-form" loading={busy}>{t('common.save')}</Button></>}>
      <form id="admin-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {children}
        {error && <p role="alert" className="text-[13px] text-danger sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}

export function CurrenciesPage() {
  const { t } = useTranslation();
  const currencies = useCurrencies();
  const rates = useRates();
  const qc = useQueryClient();
  const onError = useToastError();
  const [cur, setCur] = useState<null | { code: string; name: string; symbol: string; minorUnits: string }>(null);
  const [rate, setRate] = useState<null | { baseCode: string; quoteCode: string; rate: string; effectiveDate: string }>(null);
  const today = new Date().toISOString().slice(0, 10);
  const toggle = async (code: string, isActive: boolean) => {
    try {
      await api.patch(`/currencies/${code}`, { isActive });
      await qc.invalidateQueries({ queryKey: qk.currencies });
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <PageHeader title={t('currency.title')} description={t('currency.subtitle')} actions={<Button onClick={() => setCur({ code: '', name: '', symbol: '', minorUnits: '2' })}><Plus />{t('currency.new')}</Button>} />
      <Card>
        {currencies.isLoading ? <CardBody><Skeleton className="h-24" /></CardBody> : (
          <Table>
            <thead><tr><th>{t('common.code')}</th><th>{t('common.name')}</th><th>{t('currency.symbol')}</th><th className="text-right">{t('currency.minorUnits')}</th><th className="text-right">{t('currency.active')}</th></tr></thead>
            <tbody>
              {currencies.data?.map((c) => (
                <tr key={c.code}>
                  <td className="font-mono font-medium">{c.code}</td><td>{c.name}</td><td>{c.symbol}</td><td className="tabular text-right">{c.minorUnits}</td>
                  <td className="text-right"><input type="checkbox" aria-label={`${t('currency.active')} ${c.code}`} className="size-4 cursor-pointer accent-[var(--accent)]" checked={c.isActive} onChange={(e) => void toggle(c.code, e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title={t('currency.ratesTitle')} description={t('currency.ratesSubtitle')} actions={<Button variant="secondary" size="sm" onClick={() => setRate({ baseCode: 'EUR', quoteCode: 'CAD', rate: '', effectiveDate: today })}><Plus />{t('currency.newRate')}</Button>} />
        {!rates.data?.length ? <EmptyState icon={<Coins />} title={t('currency.ratesEmpty')} /> : (
          <Table>
            <thead><tr><th>{t('currency.effectiveDate')}</th><th>{t('currency.base')}</th><th>{t('currency.quote')}</th><th className="text-right">{t('currency.rate')}</th><th></th></tr></thead>
            <tbody>
              {rates.data.map((r) => (
                <tr key={r.id}>
                  <td className="tabular">{r.effectiveDate}</td><td className="font-mono">{r.baseCode}</td><td className="font-mono">{r.quoteCode}</td>
                  <td className="tabular text-right">1 {r.baseCode} = {r.rate} {r.quoteCode}</td>
                  <td className="text-right"><Button variant="ghost" size="icon" aria-label={t('common.remove')} onClick={async () => { try { await api.del(`/exchange-rates/${r.id}`); await qc.invalidateQueries({ queryKey: qk.rates }); } catch (e) { onError(e); } }}><Trash2 /></Button></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {cur && (
        <FormDialog title={t('currency.new')} open onClose={() => setCur(null)} onSubmit={async () => {
          await api.post('/currencies', { ...cur, minorUnits: Number(cur.minorUnits) });
          await qc.invalidateQueries({ queryKey: qk.currencies });
          toast.success(t('common.created'));
        }}>
          <Field label="Code ISO *" htmlFor="c-code"><Input id="c-code" required maxLength={3} className="uppercase" autoFocus value={cur.code} onChange={(e) => setCur({ ...cur, code: e.target.value })} /></Field>
          <Field label={`${t('currency.symbol')} *`} htmlFor="c-sym"><Input id="c-sym" required value={cur.symbol} onChange={(e) => setCur({ ...cur, symbol: e.target.value })} /></Field>
          <Field label={`${t('common.name')} *`} htmlFor="c-name"><Input id="c-name" required value={cur.name} onChange={(e) => setCur({ ...cur, name: e.target.value })} /></Field>
          <Field label={t('currency.minorUnits')} htmlFor="c-mu"><Select id="c-mu" value={cur.minorUnits} onChange={(e) => setCur({ ...cur, minorUnits: e.target.value })}>{[0, 1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</Select></Field>
        </FormDialog>
      )}
      {rate && (
        <FormDialog title={t('currency.newRate')} open onClose={() => setRate(null)} onSubmit={async () => {
          await api.post('/exchange-rates', { ...rate, rate: rate.rate.replace(',', '.') });
          await qc.invalidateQueries({ queryKey: qk.rates });
          toast.success(t('common.created'));
        }}>
          <Field label={t('currency.base')} htmlFor="r-b"><Select id="r-b" value={rate.baseCode} onChange={(e) => setRate({ ...rate, baseCode: e.target.value })}>{currencies.data?.map((c) => <option key={c.code}>{c.code}</option>)}</Select></Field>
          <Field label={t('currency.quote')} htmlFor="r-q"><Select id="r-q" value={rate.quoteCode} onChange={(e) => setRate({ ...rate, quoteCode: e.target.value })}>{currencies.data?.map((c) => <option key={c.code}>{c.code}</option>)}</Select></Field>
          <Field label={`${t('currency.rate')} *`} htmlFor="r-r" hint={`1 ${rate.baseCode} = ? ${rate.quoteCode}`}><Input id="r-r" required inputMode="decimal" className="tabular" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} /></Field>
          <Field label={t('currency.effectiveDate')} htmlFor="r-d"><Input id="r-d" type="date" required value={rate.effectiveDate} onChange={(e) => setRate({ ...rate, effectiveDate: e.target.value })} /></Field>
        </FormDialog>
      )}
    </>
  );
}

export function AuditPage() {
  const { t } = useTranslation();
  const me = useMe();
  const [companyId, setCompanyId] = useState('');
  const audit = useAudit(companyId || undefined);
  const names = new Map(me.companies.map((c) => [c.id, c.tradeName || c.legalName]));
  return (
    <>
      <PageHeader title={t('audit.title')} description={t('audit.subtitle')} actions={
        <Select aria-label={t('nav.companies')} className="w-56" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">{t('nav.allCompanies')}</option>
          {me.companies.map((c) => <option key={c.id} value={c.id}>{c.tradeName || c.legalName}</option>)}
        </Select>
      } />
      <Card>
        {audit.isLoading ? <CardBody><Skeleton className="h-40" /></CardBody> : !audit.data?.length ? <EmptyState icon={<History />} title={t('audit.empty')} /> : (
          <Table>
            <thead><tr><th>{t('audit.at')}</th><th>{t('audit.user')}</th><th>{t('audit.summary')}</th><th className="hidden md:table-cell">{t('nav.companies')}</th></tr></thead>
            <tbody>
              {audit.data.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted tabular">{formatDateTime(e.at)}</td>
                  <td className="whitespace-nowrap">{e.userName ?? '—'}</td>
                  <td>{e.summary} <span className="text-xs text-subtle">({e.action})</span></td>
                  <td className="hidden text-muted md:table-cell">{e.companyId ? names.get(e.companyId) ?? '—' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const qc = useQueryClient();
  const onError = useToastError();
  const [name, setName] = useState(me.user.displayName);
  const save = async (body: Record<string, unknown>) => {
    try {
      await api.patch('/auth/preferences', body);
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success(t('common.saved'));
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <PageHeader title={t('account.title')} description={me.organization.name} />
      <Card>
        <CardHeader title={t('account.preferences')} />
        <CardBody className="grid max-w-md gap-4">
          <Field label={t('auth.displayName')} htmlFor="acc-name">
            <div className="flex gap-2">
              <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="secondary" disabled={!name.trim() || name === me.user.displayName} onClick={() => void save({ displayName: name })}>{t('common.save')}</Button>
            </div>
          </Field>
          <Field label={t('account.language')} htmlFor="loc">
            <Select id="loc" value={i18n.language} onChange={(e) => void save({ locale: e.target.value })}>
              <option value="fr">{t('account.fr')}</option><option value="en">{t('account.en')}</option>
            </Select>
          </Field>
        </CardBody>
      </Card>
    </>
  );
}
