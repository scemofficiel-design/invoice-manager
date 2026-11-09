import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import { taxLabel } from '@im/shared/units';
import { useCurrencies } from '@/hooks/queries';
import { useMoney, formatDate } from '@/lib/money';
import { formatRate } from '@/modules/companies/pages';
import { Card, CardBody, CardHeader, Skeleton, Table } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Kpi, MonthlyBars } from './components';

interface Totals { currency: string; revenueMinor: number; invoicedTtcMinor: number; collectedMinor: number; outstandingMinor: number; overdueMinor: number; taxMinor: number }
interface Counts { issued: number; paid: number; unpaid: number; overdue: number; quotes: number; pendingQuotes: number; activeClients: number }
interface Base { from: string; to: string; totals: Totals[]; counts: Counts; monthly: { month: string; currency: string; revenue: number }[] }
interface CompanyDash extends Base { topClients: { id: string; name: string; currency: string; revenue: number; invoices: number }[]; taxes: { name: string; ratePpm: number; currency: string; amount: number }[] }
interface GeneralDash extends Base {
  companiesCount: number;
  byCompany: { id: string; name: string; totals: Totals[] }[];
  converted: null | { currency: string; revenueMinor: number; collectedMinor: number; outstandingMinor: number; rates: { from: string; to: string; rate: string; effectiveDate: string; inverse: boolean }[]; missing: string[] };
}

const LOCALES: Record<string, string> = { fr: 'fr-CA', en: 'en-CA' };
const defaultFrom = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function PeriodPicker({ from, to, setFrom, setTo, children }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; children?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Field label={t('dashboard.from')} htmlFor="db-from"><Input id="db-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
      <Field label={t('dashboard.to')} htmlFor="db-to"><Input id="db-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field>
      {children}
    </div>
  );
}

function CurrencyKpis({ totals }: { totals: Totals[] }) {
  const { t } = useTranslation();
  const { fmt } = useMoney();
  return (
    <div className="space-y-3">
      {totals.map((x) => (
        <div key={x.currency} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={`${t('dashboard.revenue')} · ${x.currency}`} value={fmt(x.revenueMinor, x.currency)} sub={`TTC ${fmt(x.invoicedTtcMinor, x.currency)}`} />
          <Kpi label={t('dashboard.collected')} value={fmt(x.collectedMinor, x.currency)} tone="success" />
          <Kpi label={t('dashboard.outstanding')} value={fmt(x.outstandingMinor, x.currency)} />
          <Kpi label={t('dashboard.overdue')} value={fmt(x.overdueMinor, x.currency)} tone={x.overdueMinor ? 'danger' : undefined} />
        </div>
      ))}
    </div>
  );
}

export function CompanyDashboard({ companyId }: { companyId: string }) {
  const { t, i18n } = useTranslation();
  const { fmt } = useMoney();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(todayStr);
  const q = useQuery({ queryKey: ['company', companyId, 'dashboard', from, to], queryFn: () => api.get<CompanyDash>(`/companies/${companyId}/dashboard?from=${from}&to=${to}`) });
  const d = q.data;
  return (
    <section className="mt-6">
      <PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {!d ? <Skeleton className="h-40" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={t('dashboard.invoicesIssued')} value={d.counts.issued} />
            <Kpi label={t('dashboard.invoicesUnpaid')} value={d.counts.unpaid} sub={d.counts.overdue ? `${d.counts.overdue} ${t('dashboard.overdue').toLowerCase()}` : undefined} tone={d.counts.overdue ? 'warning' : undefined} />
            <Kpi label={t('dashboard.quotes')} value={d.counts.quotes} sub={`${d.counts.pendingQuotes} ${t('dashboard.pendingQuotes').toLowerCase()}`} />
            <Kpi label={t('dashboard.activeClients')} value={d.counts.activeClients} />
          </div>
          {d.totals.length === 0 ? <Card className="mt-3"><CardBody className="text-[13px] text-muted">{t('dashboard.noData')}</CardBody></Card> : (
            <div className="mt-3"><CurrencyKpis totals={d.totals} /></div>
          )}
          <div className="mt-5 grid gap-5 lg:grid-cols-[3fr_2fr]">
            <Card>
              <CardHeader title={t('dashboard.monthly')} />
              <CardBody>{d.monthly.length ? <MonthlyBars rows={d.monthly} fmt={fmt} locale={LOCALES[i18n.language] ?? 'fr-CA'} /> : <p className="text-[13px] text-muted">{t('dashboard.noData')}</p>}</CardBody>
            </Card>
            <Card>
              <CardHeader title={t('dashboard.topClients')} />
              {!d.topClients.length ? <CardBody className="text-[13px] text-muted">—</CardBody> : (
                <Table>
                  <tbody>{d.topClients.map((c) => (
                    <tr key={`${c.id}-${c.currency}`}><td><Link className="hover:underline" to={`/c/${companyId}/clients/${c.id}`}>{c.name}</Link><p className="text-xs text-muted">{c.invoices} {t('nav.invoices').toLowerCase()}</p></td><td className="tabular text-right">{fmt(c.revenue, c.currency)}</td></tr>
                  ))}</tbody>
                </Table>
              )}
            </Card>
          </div>
          {d.taxes.length > 0 && (
            <Card className="mt-5">
              <CardHeader title={t('dashboard.taxes')} />
              <Table>
                <tbody>{d.taxes.map((x) => <tr key={`${x.name}-${x.ratePpm}-${x.currency}`}><td>{taxLabel(x.name, formatRate(x.ratePpm))}</td><td className="text-muted">{x.currency}</td><td className="tabular text-right">{fmt(x.amount, x.currency)}</td></tr>)}</tbody>
              </Table>
            </Card>
          )}
        </>
      )}
    </section>
  );
}

export function GeneralDashboard() {
  const { t, i18n } = useTranslation();
  const { fmt } = useMoney();
  const currencies = useCurrencies();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(todayStr);
  const [report, setReport] = useState('');
  const q = useQuery({ queryKey: ['dashboard', from, to, report], queryFn: () => api.get<GeneralDash>(`/dashboard?from=${from}&to=${to}${report ? `&reportCurrency=${report}` : ''}`) });
  const d = q.data;
  if (!d) return <Skeleton className="h-40" />;
  if (!d.companiesCount) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-[15px] font-semibold">{t('dashboard.generalTitle')}</h2>
      <p className="mb-3 text-xs text-muted">{t('dashboard.perCurrency')}</p>
      <PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo}>
        <Field label={t('dashboard.convert')} htmlFor="db-report">
          <Select id="db-report" className="w-44" value={report} onChange={(e) => setReport(e.target.value)}>
            <option value="">{t('dashboard.noConversion')}</option>
            {currencies.data?.map((c) => <option key={c.code}>{c.code}</option>)}
          </Select>
        </Field>
      </PeriodPicker>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label={t('dashboard.companies')} value={d.companiesCount} />
        <Kpi label={t('dashboard.invoicesIssued')} value={d.counts.issued} />
        <Kpi label={t('dashboard.invoicesPaid')} value={d.counts.paid} tone="success" />
        <Kpi label={t('dashboard.invoicesUnpaid')} value={d.counts.unpaid} tone={d.counts.overdue ? 'warning' : undefined} sub={d.counts.overdue ? `${d.counts.overdue} ${t('dashboard.overdue').toLowerCase()}` : undefined} />
        <Kpi label={t('dashboard.pendingQuotes')} value={d.counts.pendingQuotes} />
      </div>
      {d.totals.length > 0 && <div className="mt-3"><CurrencyKpis totals={d.totals} /></div>}
      {d.converted && (
        <Card className="mt-3 border-dashed">
          <CardBody>
            <p className="mb-2 text-xs font-medium text-muted">{t('dashboard.convertedTitle', { currency: d.converted.currency })}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-muted">{t('dashboard.revenue')}</p><p className="tabular font-semibold">{fmt(d.converted.revenueMinor, d.converted.currency)}</p></div>
              <div><p className="text-xs text-muted">{t('dashboard.collected')}</p><p className="tabular font-semibold">{fmt(d.converted.collectedMinor, d.converted.currency)}</p></div>
              <div><p className="text-xs text-muted">{t('dashboard.outstanding')}</p><p className="tabular font-semibold">{fmt(d.converted.outstandingMinor, d.converted.currency)}</p></div>
            </div>
            <ul className="mt-3 space-y-0.5 text-xs text-muted">
              {d.converted.rates.map((r) => <li key={r.from}>{t(r.inverse ? 'dashboard.rateInverse' : 'dashboard.rateUsed', { from: r.from, to: r.to, rate: r.rate, date: formatDate(r.effectiveDate) })}</li>)}
            </ul>
            {d.converted.missing.length > 0 && <p className="mt-2 text-xs text-warning">{t('dashboard.missingRates', { list: d.converted.missing.join(', ') })} <Link className="underline" to="/admin/currencies">{t('dashboard.addRate')}</Link></p>}
          </CardBody>
        </Card>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.monthly')} />
          <CardBody>{d.monthly.length ? <MonthlyBars rows={d.monthly} fmt={fmt} locale={LOCALES[i18n.language] ?? 'fr-CA'} /> : <p className="text-[13px] text-muted">{t('dashboard.noData')}</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.byCompany')} />
          <Table>
            <tbody>{d.byCompany.map((c) => (
              <tr key={c.id}><td><Link className="font-medium hover:underline" to={`/c/${c.id}`}>{c.name}</Link></td><td className="tabular text-right">{c.totals.length ? c.totals.map((x) => <div key={x.currency}>{fmt(x.revenueMinor, x.currency)}</div>) : <span className="text-muted">—</span>}</td></tr>
            ))}</tbody>
          </Table>
        </Card>
      </div>
    </section>
  );
}
