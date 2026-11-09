import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Coins, History, Plus, Trash2, UserPlus } from 'lucide-react';
import { api } from '@/services/api';
import { qk, useAudit, useCurrencies, useRates, useUsers } from '@/hooks/queries';
import { useErrorMessage, useToastError } from '@/hooks/useApiError';
import { useMe } from '@/contexts/session';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
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

export function UsersPage() {
  const { t } = useTranslation();
  const users = useUsers();
  const qc = useQueryClient();
  const onError = useToastError();
  const [form, setForm] = useState<null | { displayName: string; email: string; password: string }>(null);
  return (
    <>
      <PageHeader title={t('users.title')} description={t('users.subtitle')} actions={<Button onClick={() => setForm({ displayName: '', email: '', password: '' })}><UserPlus />{t('users.new')}</Button>} />
      <Card>
        {users.isLoading ? <CardBody><Skeleton className="h-20" /></CardBody> : (
          <Table>
            <thead><tr><th>{t('members.user')}</th><th>{t('members.role')}</th><th className="hidden sm:table-cell">{t('users.lastLogin')}</th><th className="text-right">{t('common.actions')}</th></tr></thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                  <td><p className="font-medium">{u.displayName}</p><p className="text-xs text-muted">{u.email}</p></td>
                  <td>{u.role === 'owner' ? <Badge tone="accent">{t('users.owner')}</Badge> : <Badge>{t('users.member')}</Badge>}{!u.isActive && <Badge tone="danger" className="ml-1">{t('users.inactive')}</Badge>}</td>
                  <td className="hidden text-muted sm:table-cell">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t('users.never')}</td>
                  <td className="text-right">{u.role !== 'owner' && (
                    <Button variant="secondary" size="sm" onClick={async () => { try { await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive }); await qc.invalidateQueries({ queryKey: qk.users }); } catch (e) { onError(e); } }}>
                      {u.isActive ? t('users.deactivate') : t('users.activate')}
                    </Button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {form && (
        <FormDialog title={t('users.new')} open onClose={() => setForm(null)} onSubmit={async () => {
          await api.post('/admin/users', form);
          await qc.invalidateQueries({ queryKey: qk.users });
          toast.success(t('common.created'));
        }}>
          <Field label={`${t('auth.displayName')} *`} htmlFor="u-n" className="sm:col-span-2"><Input id="u-n" required autoFocus value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
          <Field label={`${t('auth.email')} *`} htmlFor="u-e" className="sm:col-span-2"><Input id="u-e" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={`${t('auth.password')} *`} htmlFor="u-p" hint={t('auth.passwordHint')} className="sm:col-span-2"><Input id="u-p" type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
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
  const msg = useErrorMessage();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changeLocale = async (locale: 'fr' | 'en') => {
    try {
      await api.patch('/auth/preferences', { locale });
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch (e) {
      onError(e);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.newPassword !== pw.confirm) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    try {
      await api.post('/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success(t('auth.passwordChanged'));
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title={t('account.title')} description={`${me.user.displayName} · ${me.user.email}`} />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title={t('account.preferences')} />
          <CardBody>
            <Field label={t('account.language')} htmlFor="loc" className="max-w-xs">
              <Select id="loc" value={i18n.language} onChange={(e) => void changeLocale(e.target.value as 'fr' | 'en')}>
                <option value="fr">{t('account.fr')}</option><option value="en">{t('account.en')}</option>
              </Select>
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('auth.changePassword')} />
          <CardBody>
            <form onSubmit={submit} className="grid max-w-md gap-4">
              <Field label={t('auth.currentPassword')} htmlFor="cp"><Input id="cp" type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
              <Field label={t('auth.newPassword')} htmlFor="np" hint={t('auth.passwordHint')}><Input id="np" type="password" required autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
              <Field label={t('auth.confirmPassword')} htmlFor="np2"><Input id="np2" type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
              {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
              <Button type="submit" loading={busy} className="justify-self-start">{t('auth.changePassword')}</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

