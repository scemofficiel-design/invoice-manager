import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { TAX_PRESETS } from '@im/shared/constants';
import type { Company, LegalId } from '@im/shared/types';
import { ApiError } from '@/services/api';
import { useCurrencies } from '@/hooks/queries';
import { useErrorMessage } from '@/hooks/useApiError';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';

type Values = {
  legalName: string; tradeName: string; addressLine1: string; addressLine2: string; city: string; region: string; postalCode: string;
  country: string; phone: string; email: string; website: string; legalIds: LegalId[]; defaultCurrency: string; defaultLocale: 'fr' | 'en';
  paymentTermsDays: string; quoteValidityDays: string; pricesIncludeTax: boolean; taxRounding: 'per_document' | 'per_line';
  bankDetails: string; defaultTerms: string; legalFooter: string; taxPreset: string;
};

const fromCompany = (c?: Company): Values => ({
  legalName: c?.legalName ?? '', tradeName: c?.tradeName ?? '', addressLine1: c?.addressLine1 ?? '', addressLine2: c?.addressLine2 ?? '',
  city: c?.city ?? '', region: c?.region ?? '', postalCode: c?.postalCode ?? '', country: c?.country ?? '', phone: c?.phone ?? '',
  email: c?.email ?? '', website: c?.website ?? '', legalIds: c?.legalIds ?? [], defaultCurrency: c?.defaultCurrency ?? 'CAD',
  defaultLocale: c?.defaultLocale ?? 'fr', paymentTermsDays: String(c?.paymentTermsDays ?? 30), quoteValidityDays: String(c?.quoteValidityDays ?? 30),
  pricesIncludeTax: c?.pricesIncludeTax ?? false, taxRounding: c?.taxRounding ?? 'per_document', bankDetails: c?.bankDetails ?? '',
  defaultTerms: c?.defaultTerms ?? '', legalFooter: c?.legalFooter ?? '', taxPreset: 'ca-qc',
});

/** Défini hors du composant : un composant recréé à chaque rendu ferait perdre le focus aux champs. */
function F({ k, label, children, hint, className, error }: { k: string; label: string; children: ReactNode; hint?: string; className?: string; error?: string | undefined }) {
  return <Field label={label} htmlFor={k} error={error} hint={hint} className={className}>{children}</Field>;
}

export function CompanyForm({ company, onSubmit, submitLabel, readOnly }: { company?: Company; onSubmit: (payload: Record<string, unknown>) => Promise<void>; submitLabel: string; readOnly?: boolean }) {
  const { t } = useTranslation();
  const currencies = useCurrencies();
  const msg = useErrorMessage();
  const [v, setV] = useState<Values>(() => fromCompany(company));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !company;

  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }));
  const text = (k: keyof Values) => ({
    id: k,
    value: v[k] as string,
    disabled: readOnly,
    'aria-invalid': !!errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setBusy(true);
    const { taxPreset, ...rest } = v;
    const payload: Record<string, unknown> = {
      ...rest,
      country: rest.country.trim().toUpperCase(),
      legalIds: rest.legalIds.filter((l) => l.label.trim() || l.value.trim()),
      paymentTermsDays: Number(rest.paymentTermsDays),
      quoteValidityDays: Number(rest.quoteValidityDays),
      ...(isNew ? { taxPreset } : {}),
    };
    try {
      await onSubmit(payload);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const map: Record<string, string> = {};
        for (const d of err.details) map[d.path.split('.')[0] ?? ''] = d.message;
        setErrors(map);
      }
      setFormError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t('company.identity')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <F error={errors.legalName} k="legalName" label={`${t('company.legalName')} *`}><Input {...text('legalName')} required /></F>
          <F error={errors.tradeName} k="tradeName" label={t('company.tradeName')}><Input {...text('tradeName')} /></F>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[13px] font-medium">{t('company.legalIds')} <span className="font-normal text-muted">— {t('company.legalIdsHint')}</span></p>
            <div className="flex flex-col gap-2">
              {v.legalIds.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label={t('company.legalIdLabel')} placeholder={t('company.legalIdLabel')} value={l.label} disabled={readOnly} className="w-36" onChange={(e) => set('legalIds', v.legalIds.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <Input aria-label={t('company.legalIdValue')} placeholder={t('company.legalIdValue')} value={l.value} disabled={readOnly} onChange={(e) => set('legalIds', v.legalIds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  {!readOnly && <Button type="button" variant="ghost" size="icon" aria-label={t('common.remove')} onClick={() => set('legalIds', v.legalIds.filter((_, j) => j !== i))}><Trash2 /></Button>}
                </div>
              ))}
              {!readOnly && <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => set('legalIds', [...v.legalIds, { label: '', value: '' }])}><Plus />{t('company.addLegalId')}</Button>}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('company.address')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <F error={errors.addressLine1} k="addressLine1" label={t('company.addressLine1')} className="sm:col-span-2"><Input {...text('addressLine1')} /></F>
          <F error={errors.addressLine2} k="addressLine2" label={t('company.addressLine2')} className="sm:col-span-2"><Input {...text('addressLine2')} /></F>
          <F error={errors.city} k="city" label={t('company.city')}><Input {...text('city')} /></F>
          <F error={errors.region} k="region" label={t('company.region')}><Input {...text('region')} /></F>
          <F error={errors.postalCode} k="postalCode" label={t('company.postalCode')}><Input {...text('postalCode')} /></F>
          <F error={errors.country} k="country" label={t('company.country')}><Input {...text('country')} maxLength={2} className="uppercase" /></F>
          <F error={errors.phone} k="phone" label={t('company.phone')}><Input {...text('phone')} type="tel" /></F>
          <F error={errors.email} k="email" label={t('auth.email')}><Input {...text('email')} type="email" /></F>
          <F error={errors.website} k="website" label={t('company.website')} className="sm:col-span-2"><Input {...text('website')} /></F>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('company.billing')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <F error={errors.defaultCurrency} k="defaultCurrency" label={`${t('company.defaultCurrency')} *`}>
            <Select {...text('defaultCurrency')}>
              {currencies.data?.filter((c) => c.isActive || c.code === v.defaultCurrency).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </Select>
          </F>
          <F error={errors.defaultLocale} k="defaultLocale" label={t('company.defaultLocale')}>
            <Select {...text('defaultLocale')}><option value="fr">Français</option><option value="en">English</option></Select>
          </F>
          <F error={errors.paymentTermsDays} k="paymentTermsDays" label={t('company.paymentTermsDays')}><Input {...text('paymentTermsDays')} type="number" min={0} max={365} /></F>
          <F error={errors.quoteValidityDays} k="quoteValidityDays" label={t('company.quoteValidityDays')}><Input {...text('quoteValidityDays')} type="number" min={1} max={365} /></F>
          <F error={errors.taxRounding} k="taxRounding" label={t('company.taxRounding')}>
            <Select {...text('taxRounding')}><option value="per_document">{t('company.taxRoundingPerDocument')}</option><option value="per_line">{t('company.taxRoundingPerLine')}</option></Select>
          </F>
          {isNew && (
            <F error={errors.taxPreset} k="taxPreset" label={t('company.taxPreset')} hint={t('company.taxPresetHint')}>
              <Select {...text('taxPreset')}>{TAX_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
            </F>
          )}
          <Checkbox id="pricesIncludeTax" className="sm:col-span-2" label={t('company.pricesIncludeTax')} checked={v.pricesIncludeTax} disabled={readOnly} onChange={(e) => set('pricesIncludeTax', e.target.checked)} />
          <F error={errors.bankDetails} k="bankDetails" label={t('company.bankDetails')} className="sm:col-span-2"><Textarea {...text('bankDetails')} rows={3} /></F>
          <F error={errors.defaultTerms} k="defaultTerms" label={t('company.defaultTerms')} className="sm:col-span-2"><Textarea {...text('defaultTerms')} rows={3} /></F>
          <F error={errors.legalFooter} k="legalFooter" label={t('company.legalFooter')} className="sm:col-span-2"><Textarea {...text('legalFooter')} rows={2} /></F>
        </CardBody>
      </Card>

      {formError && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{formError}</p>}
      {!readOnly && <div className="flex justify-end"><Button type="submit" loading={busy}>{submitLabel}</Button></div>}
    </form>
  );
}
