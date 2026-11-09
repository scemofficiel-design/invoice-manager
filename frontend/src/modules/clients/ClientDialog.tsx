import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { Client, LegalId } from '@im/shared/types';
import { api } from '@/services/api';
import { useCurrencies } from '@/hooks/queries';
import { useErrorMessage } from '@/hooks/useApiError';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';

export function ClientDialog({ companyId, client, onClose, onSaved }: { companyId: string; client: Client | null; onClose: () => void; onSaved?: (c: Client) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const msg = useErrorMessage();
  const currencies = useCurrencies();
  const [v, setV] = useState({
    type: client?.type ?? 'business', name: client?.name ?? '', contactName: client?.contactName ?? '', email: client?.email ?? '', phone: client?.phone ?? '',
    addressLine1: client?.addressLine1 ?? '', addressLine2: client?.addressLine2 ?? '', city: client?.city ?? '', region: client?.region ?? '',
    postalCode: client?.postalCode ?? '', country: client?.country ?? '', taxExempt: client?.taxExempt ?? false, exemptionRef: client?.exemptionRef ?? '',
    preferredCurrency: client?.preferredCurrency ?? '', notes: client?.notes ?? '',
  });
  const [taxIds, setTaxIds] = useState<LegalId[]>(client?.taxIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof v) => ({ id: `cl-${k}`, value: v[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body = { ...v, country: v.country.trim().toUpperCase(), preferredCurrency: v.preferredCurrency || null, taxIds: taxIds.filter((x) => x.label.trim() && x.value.trim()) };
    try {
      const saved = client ? await api.patch<Client>(`/companies/${companyId}/clients/${client.id}`, body) : await api.post<Client>(`/companies/${companyId}/clients`, body);
      await qc.invalidateQueries({ queryKey: ['company', companyId] });
      toast.success(client ? t('common.saved') : t('common.created'));
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open wide onOpenChange={(o) => !o && onClose()} title={client ? client.name : t('client.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="client-form" loading={busy}>{t('common.save')}</Button></>}>
      <form id="client-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('client.type')} htmlFor="cl-type"><Select {...bind('type')}><option value="business">{t('client.business')}</option><option value="individual">{t('client.individual')}</option></Select></Field>
        <Field label={`${t('client.name')} *`} htmlFor="cl-name"><Input {...bind('name')} required autoFocus /></Field>
        <Field label={t('client.contactName')} htmlFor="cl-contactName"><Input {...bind('contactName')} /></Field>
        <Field label={t('auth.email')} htmlFor="cl-email"><Input {...bind('email')} type="email" /></Field>
        <Field label={t('company.phone')} htmlFor="cl-phone"><Input {...bind('phone')} type="tel" /></Field>
        <Field label={t('client.preferredCurrency')} htmlFor="cl-preferredCurrency"><Select {...bind('preferredCurrency')}><option value="">—</option>{currencies.data?.filter((c) => c.isActive).map((c) => <option key={c.code}>{c.code}</option>)}</Select></Field>
        <Field label={t('company.addressLine1')} htmlFor="cl-addressLine1" className="sm:col-span-2"><Input {...bind('addressLine1')} /></Field>
        <Field label={t('company.addressLine2')} htmlFor="cl-addressLine2" className="sm:col-span-2"><Input {...bind('addressLine2')} /></Field>
        <Field label={t('company.city')} htmlFor="cl-city"><Input {...bind('city')} /></Field>
        <Field label={t('company.region')} htmlFor="cl-region"><Input {...bind('region')} /></Field>
        <Field label={t('company.postalCode')} htmlFor="cl-postalCode"><Input {...bind('postalCode')} /></Field>
        <Field label={t('company.country')} htmlFor="cl-country"><Input {...bind('country')} maxLength={2} className="uppercase" /></Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-medium">{t('client.taxIds')}</p>
          <div className="flex flex-col gap-2">
            {taxIds.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label={t('company.legalIdLabel')} placeholder={t('company.legalIdLabel')} className="w-36" value={l.label} onChange={(e) => setTaxIds(taxIds.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input aria-label={t('company.legalIdValue')} placeholder={t('company.legalIdValue')} value={l.value} onChange={(e) => setTaxIds(taxIds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label={t('common.remove')} onClick={() => setTaxIds(taxIds.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setTaxIds([...taxIds, { label: '', value: '' }])}><Plus />{t('company.addLegalId')}</Button>
          </div>
        </div>
        <Checkbox id="cl-exempt" label={t('client.taxExempt')} checked={v.taxExempt} onChange={(e) => setV({ ...v, taxExempt: e.target.checked })} className="self-center" />
        {v.taxExempt && <Field label={t('client.exemptionRef')} htmlFor="cl-exemptionRef"><Input {...bind('exemptionRef')} /></Field>}
        <Field label={t('client.notes')} htmlFor="cl-notes" className="sm:col-span-2"><Textarea {...bind('notes')} rows={3} /></Field>
        {error && <p role="alert" className="text-[13px] text-danger sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}
