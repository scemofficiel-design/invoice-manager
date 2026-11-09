import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Package, Pencil, Plus, Search } from 'lucide-react';
import type { CatalogItem } from '@im/shared/types';
import { api } from '@/services/api';
import { useActivities, useCatalog, useCompany, useCurrencies, useTaxes } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useErrorMessage, useToastError } from '@/hooks/useApiError';
import { minorToInput, tryParseMoney, useMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { canEdit } from '@/modules/clients/pages';

export const UNITS = ['unit', 'hour', 'day', 'month', 'flat', 'km', 'page'] as const;

function ItemDialog({ companyId, item, onClose }: { companyId: string; item: CatalogItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const msg = useErrorMessage();
  const company = useCompany(companyId);
  const currencies = useCurrencies();
  const taxes = useTaxes(companyId);
  const activities = useActivities(companyId);
  const { minorUnits } = useMoney();
  const currency0 = item?.currency ?? company.data?.defaultCurrency ?? 'CAD';
  const [v, setV] = useState({
    kind: item?.kind ?? 'service', name: item?.name ?? '', sku: item?.sku ?? '', category: item?.category ?? '', description: item?.description ?? '',
    unit: item?.unit ?? 'unit', price: item ? minorToInput(item.unitPriceMinor, minorUnits(item.currency)) : '', currency: currency0,
    priceIncludesTax: item?.priceIncludesTax ?? company.data?.pricesIncludeTax ?? false, taxTreatment: item?.taxTreatment ?? 'taxable', activityId: item?.activityId ?? '',
  });
  const [taxIds, setTaxIds] = useState<string[]>(item?.taxIds ?? taxes.data?.filter((x) => x.isDefault).map((x) => x.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof v) => ({ id: `it-${k}`, value: v[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const unitPriceMinor = tryParseMoney(v.price, minorUnits(v.currency));
    if (unitPriceMinor === null || unitPriceMinor < 0) return setError(`${t('catalog.unitPrice')} : ${t('common.error')}`);
    setBusy(true);
    const { price: _p, ...rest } = v;
    const body = { ...rest, unitPriceMinor, activityId: v.activityId || null, taxIds: v.taxTreatment === 'taxable' ? taxIds : [] };
    try {
      if (item) await api.patch(`/companies/${companyId}/catalog/${item.id}`, body);
      else await api.post(`/companies/${companyId}/catalog`, body);
      await qc.invalidateQueries({ queryKey: ['company', companyId, 'catalog'] });
      toast.success(item ? t('common.saved') : t('common.created'));
      onClose();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open wide onOpenChange={(o) => !o && onClose()} title={item ? item.name : t('catalog.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="item-form" loading={busy}>{t('common.save')}</Button></>}>
      <form id="item-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t('common.name')} *`} htmlFor="it-name" className="sm:col-span-2"><Input {...bind('name')} required autoFocus /></Field>
        <Field label={t('catalog.kind')} htmlFor="it-kind"><Select {...bind('kind')}><option value="service">{t('catalog.service')}</option><option value="product">{t('catalog.product')}</option></Select></Field>
        <Field label={t('catalog.sku')} htmlFor="it-sku"><Input {...bind('sku')} /></Field>
        <Field label={`${t('catalog.unitPrice')} *`} htmlFor="it-price"><Input {...bind('price')} required inputMode="decimal" className="tabular" placeholder="0,00" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('doc.currency')} htmlFor="it-currency"><Select {...bind('currency')}>{currencies.data?.filter((c) => c.isActive).map((c) => <option key={c.code}>{c.code}</option>)}</Select></Field>
          <Field label={t('catalog.unit')} htmlFor="it-unit"><Select {...bind('unit')}>{UNITS.map((u) => <option key={u} value={u}>{t(`catalog.units.${u}`)}</option>)}</Select></Field>
        </div>
        <Field label={t('catalog.category')} htmlFor="it-category"><Input {...bind('category')} /></Field>
        <Field label={t('catalog.activity')} htmlFor="it-activityId"><Select {...bind('activityId')}><option value="">—</option>{activities.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label={t('catalog.taxTreatment')} htmlFor="it-taxTreatment"><Select {...bind('taxTreatment')}><option value="taxable">{t('catalog.taxable')}</option><option value="zero_rated">{t('catalog.zero_rated')}</option><option value="exempt">{t('catalog.exempt')}</option></Select></Field>
        <Checkbox id="it-pit" className="self-end pb-2" label={t('catalog.priceIncludesTax')} checked={v.priceIncludesTax} onChange={(e) => setV({ ...v, priceIncludesTax: e.target.checked })} />
        {v.taxTreatment === 'taxable' && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-[13px] font-medium">{t('catalog.taxes')}</legend>
            <div className="flex flex-wrap gap-4">
              {taxes.data?.map((x) => (
                <Checkbox key={x.id} id={`it-tax-${x.id}`} label={x.name} checked={taxIds.includes(x.id)} onChange={(e) => setTaxIds(e.target.checked ? [...taxIds, x.id] : taxIds.filter((i) => i !== x.id))} />
              ))}
            </div>
          </fieldset>
        )}
        <Field label={t('common.description')} htmlFor="it-description" className="sm:col-span-2"><Textarea {...bind('description')} rows={3} /></Field>
        {error && <p role="alert" className="text-[13px] text-danger sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}

export function CatalogPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const company = useCompany(companyId);
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const list = useCatalog(companyId, archived, useDebounced(q));
  const taxes = useTaxes(companyId, true);
  const { fmt } = useMoney();
  const qc = useQueryClient();
  const onError = useToastError();
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const editable = canEdit(company.data?.role);
  const taxNames = (ids: string[]) => ids.map((i) => taxes.data?.find((x) => x.id === i)?.name).filter(Boolean).join(' + ');
  const toggle = async (it: CatalogItem) => {
    try {
      await api.post(`/companies/${companyId}/catalog/${it.id}/${it.archivedAt ? 'unarchive' : 'archive'}`);
      await qc.invalidateQueries({ queryKey: ['company', companyId, 'catalog'] });
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <PageHeader title={t('catalog.title')} description={t('catalog.subtitle')} actions={editable && <Button onClick={() => setEditing('new')}><Plus />{t('catalog.new')}</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input aria-label={t('common.search')} placeholder={t('common.search')} className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Checkbox id="cat-arch" label={t('common.showArchived')} checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        </div>
        {list.isLoading ? <CardBody><Skeleton className="h-24" /></CardBody> : !list.data?.length ? (
          <EmptyState icon={<Package />} title={t('catalog.empty')} text={!q ? t('catalog.emptyText') : undefined} action={editable && !q && <Button onClick={() => setEditing('new')}><Plus />{t('catalog.new')}</Button>} />
        ) : (
          <Table>
            <thead><tr><th>{t('common.name')}</th><th className="hidden sm:table-cell">{t('catalog.sku')}</th><th className="text-right">{t('catalog.unitPrice')}</th><th className="hidden md:table-cell">{t('catalog.taxes')}</th>{editable && <th className="text-right">{t('common.actions')}</th>}</tr></thead>
            <tbody>
              {list.data.map((it) => (
                <tr key={it.id} className={it.archivedAt ? 'opacity-60' : ''}>
                  <td><p className="font-medium">{it.name}{it.archivedAt && <Badge className="ml-2">{t('common.archived')}</Badge>}</p><p className="text-xs text-muted">{t(`catalog.${it.kind}`)}{it.category ? ` · ${it.category}` : ''}</p></td>
                  <td className="hidden font-mono text-xs text-muted sm:table-cell">{it.sku ?? '—'}</td>
                  <td className="tabular whitespace-nowrap text-right">{fmt(it.unitPriceMinor, it.currency)}<span className="text-xs text-muted"> / {t(`catalog.units.${it.unit}`, { defaultValue: it.unit })}</span></td>
                  <td className="hidden text-muted md:table-cell">{it.taxTreatment === 'taxable' ? taxNames(it.taxIds) || '—' : t(`catalog.${it.taxTreatment}`)}</td>
                  {editable && (
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(it)}><Pencil /></Button>
                      <Button variant="ghost" size="icon" aria-label={it.archivedAt ? t('common.unarchive') : t('common.archive')} onClick={() => void toggle(it)}>{it.archivedAt ? <ArchiveRestore /> : <Archive />}</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <ItemDialog key={editing === 'new' ? 'new' : editing.id} companyId={companyId} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
