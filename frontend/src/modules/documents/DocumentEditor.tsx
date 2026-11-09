import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DropdownMenu as M } from 'radix-ui';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { computeDocument, type DocumentResult } from '@im/shared/tax';
import { taxLabel } from '@im/shared/units';
import type { Company, DocumentLine, Invoice, Quote } from '@im/shared/types';
import { api, ApiError } from '@/services/api';
import { useActivities, useCatalog, useClients, useCurrencies, useTaxes } from '@/hooks/queries';
import { useErrorMessage } from '@/hooks/useApiError';
import { minorToInput, ppmToInput, qtyToInput, tryParseMoney, tryParsePercent, tryParseQuantity, useMoney } from '@/lib/money';
import { formatRate } from '@/modules/companies/pages';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Kind = 'quote' | 'invoice';
type Treatment = 'taxable' | 'zero_rated' | 'exempt';

interface LineDraft {
  key: string;
  catalogItemId: string | null;
  kind: 'product' | 'service' | 'custom';
  sku: string | null;
  name: string;
  description: string;
  unit: string;
  qty: string;
  price: string;
  discountType: '' | 'percent' | 'amount';
  discount: string;
  taxTreatment: Treatment;
  taxIds: string[];
  showDetails: boolean;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const newKey = () => Math.random().toString(36).slice(2);

function toDraft(l: DocumentLine, minorUnits: number): LineDraft {
  return {
    key: newKey(),
    catalogItemId: l.catalogItemId,
    kind: l.kind,
    sku: l.sku,
    name: l.name,
    description: l.description ?? '',
    unit: l.unit ?? 'unit',
    qty: qtyToInput(l.quantityMilli),
    price: minorToInput(l.unitPriceMinor, minorUnits),
    discountType: l.discountType ?? '',
    discount: l.discountType === 'percent' ? ppmToInput(l.discountValue ?? 0) : l.discountType === 'amount' ? minorToInput(l.discountValue ?? 0, minorUnits) : '',
    taxTreatment: l.taxTreatment,
    taxIds: l.taxes.map((x) => x.taxId).filter((x): x is string => !!x),
    showDetails: !!l.description,
  };
}

function TaxPicker({ taxes, value, onChange, disabled }: { taxes: { id: string; name: string; ratePpm: number }[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const label = value.length ? value.map((id) => taxes.find((x) => x.id === id)?.name).filter(Boolean).join(' + ') : t('doc.noTax');
  return (
    <M.Root>
      <M.Trigger disabled={disabled} className="flex h-9 w-full items-center justify-between gap-1 rounded-md border border-border bg-surface px-2.5 text-left text-[13px] shadow-card disabled:opacity-50" aria-label={t('doc.taxes')}>
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-lg border border-border bg-surface p-1 shadow-xl">
          {taxes.map((x) => (
            <M.CheckboxItem
              key={x.id}
              checked={value.includes(x.id)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(c) => onChange(c ? [...value, x.id] : value.filter((i) => i !== x.id))}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2"
            >
              <span className="flex size-4 items-center justify-center rounded border border-border-strong">
                <M.ItemIndicator><Check className="size-3 text-accent" /></M.ItemIndicator>
              </span>
              {x.name} <span className="ml-auto text-xs text-muted">{formatRate(x.ratePpm)}</span>
            </M.CheckboxItem>
          ))}
          {!taxes.length && <p className="px-2 py-1.5 text-xs text-muted">{t('tax.empty')}</p>}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function DocumentEditor({ kind, company, existing, initialClientId }: { kind: Kind; company: Company; existing?: Quote | Invoice; initialClientId?: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const msg = useErrorMessage();
  const { fmt, minorUnits } = useMoney();
  const clients = useClients(company.id);
  const activities = useActivities(company.id);
  const taxes = useTaxes(company.id);
  const currencies = useCurrencies();
  const companyId = company.id;

  const isQuote = kind === 'quote';
  const d0 = today();
  const initialClient = clients.data?.find((c) => c.id === initialClientId);
  const [h, setH] = useState(() => ({
    clientId: existing?.clientId ?? initialClientId ?? '',
    activityId: existing?.activityId ?? '',
    currency: existing?.currency ?? initialClient?.preferredCurrency ?? company.defaultCurrency,
    locale: existing?.locale ?? company.defaultLocale,
    issueDate: existing?.issueDate ?? d0,
    secondDate: existing ? (isQuote ? (existing as Quote).validUntil : (existing as Invoice).dueDate) : addDays(d0, isQuote ? company.quoteValidityDays : company.paymentTermsDays),
    pricesIncludeTax: existing?.pricesIncludeTax ?? company.pricesIncludeTax,
    docDiscountType: (existing?.docDiscountType ?? '') as '' | 'percent' | 'amount',
    docDiscount: '',
    terms: existing?.terms ?? company.defaultTerms ?? '',
    notes: existing?.notes ?? '',
    paymentTerms: (existing as Invoice | undefined)?.paymentTerms ?? '',
  }));
  const mu = minorUnits(h.currency);
  const [docDiscountInit] = useState(() =>
    existing?.docDiscountType === 'percent' ? ppmToInput(existing.docDiscountValue ?? 0) : existing?.docDiscountType === 'amount' ? minorToInput(existing.docDiscountValue ?? 0, minorUnits(existing.currency)) : '',
  );
  const [docDiscount, setDocDiscount] = useState(docDiscountInit);
  const [lines, setLines] = useState<LineDraft[]>(() => existing?.lines.map((l) => toDraft(l, minorUnits(existing.currency))) ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  /** Ligne libre qui vient d'être ajoutée : le curseur y est placé directement. */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const catalog = useCatalog(companyId);
  const catalogInCurrency = catalog.data?.filter((i) => i.currency === h.currency) ?? [];
  const defaultTaxIds = taxes.data?.filter((x) => x.isDefault).map((x) => x.id) ?? [];
  const client = clients.data?.find((c) => c.id === h.clientId);

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const move = (i: number, dir: -1 | 1) =>
    setLines((ls) => {
      const j = i + dir;
      if (j < 0 || j >= ls.length) return ls;
      const copy = [...ls];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  const addCustom = () => {
    const key = newKey();
    setFocusKey(key);
    setLines((ls) => [...ls, { key, catalogItemId: null, kind: 'custom', sku: null, name: '', description: '', unit: 'unit', qty: '1', price: '', discountType: '', discount: '', taxTreatment: 'taxable', taxIds: defaultTaxIds, showDetails: false }]);
  };
  const addFromCatalog = (id: string) => {
    const it = catalogInCurrency.find((i) => i.id === id);
    if (!it) return;
    setLines((ls) => [
      ...ls,
      { key: newKey(), catalogItemId: it.id, kind: it.kind, sku: it.sku, name: it.name, description: it.description ?? '', unit: it.unit, qty: '1', price: minorToInput(it.unitPriceMinor, mu), discountType: '', discount: '', taxTreatment: it.taxTreatment, taxIds: it.taxTreatment === 'taxable' ? it.taxIds : [], showDetails: !!it.description },
    ]);
  };

  /** Conversion des saisies en valeurs exactes ; null si une saisie est invalide. */
  const parsed = useMemo(() => {
    const out = lines.map((l) => {
      const quantityMilli = tryParseQuantity(l.qty);
      const unitPriceMinor = tryParseMoney(l.price, mu);
      const discountValue = !l.discountType ? null : l.discountType === 'percent' ? tryParsePercent(l.discount) : tryParseMoney(l.discount, mu);
      return { l, quantityMilli, unitPriceMinor, discountValue, ok: quantityMilli !== null && quantityMilli > 0 && unitPriceMinor !== null && (!l.discountType || discountValue !== null) };
    });
    const docDiscountValue = !h.docDiscountType ? null : h.docDiscountType === 'percent' ? tryParsePercent(docDiscount) : tryParseMoney(docDiscount, mu);
    return { lines: out, docDiscountValue, ok: out.every((x) => x.ok) && (!h.docDiscountType || docDiscountValue !== null) };
  }, [lines, mu, h.docDiscountType, docDiscount]);

  const preview: DocumentResult | null = useMemo(() => {
    if (!parsed.ok || !taxes.data) return null;
    try {
      const disc = (type: '' | 'percent' | 'amount', v: number | null) => (type === 'percent' ? { type, valuePpm: v ?? 0 } : type === 'amount' ? { type, valueMinor: v ?? 0 } : null);
      return computeDocument({
        pricesIncludeTax: h.pricesIncludeTax,
        rounding: company.taxRounding,
        documentDiscount: disc(h.docDiscountType, parsed.docDiscountValue),
        lines: parsed.lines.map(({ l, quantityMilli, unitPriceMinor, discountValue }) => ({
          quantityMilli: quantityMilli!,
          unitPriceMinor: unitPriceMinor!,
          discount: disc(l.discountType, discountValue),
          taxTreatment: client?.taxExempt ? 'exempt' : l.taxTreatment,
          taxes: l.taxIds.map((id) => taxes.data!.find((x) => x.id === id)).filter((x) => !!x).map((x) => ({ key: x!.id, name: x!.name, ratePpm: x!.ratePpm, isCompound: x!.isCompound })),
        })),
      });
    } catch {
      return null;
    }
  }, [parsed, taxes.data, h.pricesIncludeTax, h.docDiscountType, company.taxRounding, client?.taxExempt]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors([]);
    if (!parsed.ok) return setErrors([t('common.error')]);
    setBusy(true);
    const body = {
      clientId: h.clientId,
      activityId: h.activityId || null,
      currency: h.currency,
      locale: h.locale,
      issueDate: h.issueDate,
      ...(isQuote ? { validUntil: h.secondDate } : { dueDate: h.secondDate, paymentTerms: h.paymentTerms }),
      pricesIncludeTax: h.pricesIncludeTax,
      docDiscountType: h.docDiscountType || null,
      docDiscountValue: h.docDiscountType ? parsed.docDiscountValue : null,
      terms: h.terms,
      notes: h.notes,
      lines: parsed.lines.map(({ l, quantityMilli, unitPriceMinor, discountValue }) => ({
        catalogItemId: l.catalogItemId,
        kind: l.kind,
        sku: l.sku,
        name: l.name,
        description: l.description,
        unit: l.unit,
        quantityMilli,
        unitPriceMinor,
        discountType: l.discountType || null,
        discountValue: l.discountType ? discountValue : null,
        taxTreatment: l.taxTreatment,
        taxIds: l.taxTreatment === 'taxable' ? l.taxIds : [],
      })),
    };
    const path = isQuote ? 'quotes' : 'invoices';
    try {
      const saved = existing
        ? await api.put<Quote | Invoice>(`/companies/${companyId}/${path}/${existing.id}`, body)
        : await api.post<Quote | Invoice>(`/companies/${companyId}/${path}`, body);
      await qc.invalidateQueries({ queryKey: ['company', companyId] });
      toast.success(t('common.saved'));
      navigate(`/c/${companyId}/${path}/${saved.id}`);
    } catch (err) {
      setErrors(err instanceof ApiError && err.details?.length ? err.details.map((d) => `${d.path} : ${d.message}`) : [msg(err)]);
    } finally {
      setBusy(false);
    }
  };

  const title = existing ? (isQuote ? t('quote.edit') : t('invoice.edit')) : isQuote ? t('quote.new') : t('invoice.new');
  const backTo = existing ? `/c/${companyId}/${isQuote ? 'quotes' : 'invoices'}/${existing.id}` : `/c/${companyId}/${isQuote ? 'quotes' : 'invoices'}`;
  const currencyLocked = lines.some((l) => l.catalogItemId);

  return (
    <form onSubmit={submit}>
      <Link to={backTo} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><ArrowLeft className="size-3.5" />{t('common.back')}</Link>
      <PageHeader title={title} description={existing?.number ?? t('doc.draftNumber')} actions={<Button type="submit" loading={busy} disabled={!h.clientId}>{t('doc.save')}</Button>} />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={`${t('doc.client')} *`} htmlFor="d-client" className="sm:col-span-2">
            <Select id="d-client" required value={h.clientId} onChange={(e) => {
              const c = clients.data?.find((x) => x.id === e.target.value);
              setH({ ...h, clientId: e.target.value, ...(!existing && !currencyLocked && c?.preferredCurrency ? { currency: c.preferredCurrency } : {}), ...(c?.preferredLocale ? { locale: c.preferredLocale } : {}) });
            }}>
              <option value="">{t('doc.chooseClient')}</option>
              {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label={t('doc.activity')} htmlFor="d-act"><Select id="d-act" value={h.activityId} onChange={(e) => setH({ ...h, activityId: e.target.value })}><option value="">—</option>{activities.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label={t('doc.currency')} htmlFor="d-cur"><Select id="d-cur" value={h.currency} disabled={currencyLocked} onChange={(e) => setH({ ...h, currency: e.target.value })}>{currencies.data?.filter((c) => c.isActive || c.code === h.currency).map((c) => <option key={c.code}>{c.code}</option>)}</Select></Field>
          <Field label={t('doc.issueDate')} htmlFor="d-issue"><Input id="d-issue" type="date" required value={h.issueDate} onChange={(e) => setH({ ...h, issueDate: e.target.value })} /></Field>
          <Field label={isQuote ? t('doc.validUntil') : t('doc.dueDate')} htmlFor="d-second"><Input id="d-second" type="date" required min={h.issueDate} value={h.secondDate} onChange={(e) => setH({ ...h, secondDate: e.target.value })} /></Field>
          <Field label={t('company.defaultLocale')} htmlFor="d-loc"><Select id="d-loc" value={h.locale} onChange={(e) => setH({ ...h, locale: e.target.value as 'fr' | 'en' })}><option value="fr">Français</option><option value="en">English</option></Select></Field>
          <Checkbox id="d-pit" className="self-end pb-2" label={t('doc.pricesIncludeTax')} checked={h.pricesIncludeTax} onChange={(e) => setH({ ...h, pricesIncludeTax: e.target.checked })} />
          {client?.taxExempt && <p className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning sm:col-span-2 lg:col-span-4">{t('client.taxExempt')}{client.exemptionRef ? ` — ${client.exemptionRef}` : ''}</p>}
        </CardBody>
      </Card>

      <Card className="mt-5">
        <CardHeader title={t('doc.lines')} actions={
          <div className="flex flex-wrap gap-2">
            <Select aria-label={t('doc.addFromCatalog')} className="h-8 w-56 text-[13px]" value="" onChange={(e) => addFromCatalog(e.target.value)}>
              <option value="">{catalogInCurrency.length ? `+ ${t('doc.addFromCatalog')}` : t('doc.noCatalog')}</option>
              {catalogInCurrency.map((i) => <option key={i.id} value={i.id}>{i.name} — {fmt(i.unitPriceMinor, i.currency)}</option>)}
            </Select>
            <Button type="button" variant="secondary" size="sm" onClick={addCustom}><Plus />{t('doc.addLine')}</Button>
          </div>
        } />
        {lines.length === 0 ? <CardBody className="text-center text-[13px] text-muted">{t('doc.noLines')}</CardBody> : (
          <div className="@container">
            <div className="hidden grid-cols-[1fr_5rem_7rem_8rem_9rem_7rem_4.5rem] gap-2 border-b border-border px-5 py-2 text-xs font-medium text-muted @4xl:grid">
              <span>{t('doc.description')}</span><span className="text-right">{t('doc.qty')}</span><span className="text-right">{t('doc.unitPrice')}</span><span>{t('doc.discount')}</span><span>{t('doc.taxes')}</span><span className="text-right">{t('doc.lineTotal')}</span><span />
            </div>
            {lines.map((l, i) => {
              const p = parsed.lines[i]!;
              const r = preview?.lines[i];
              return (
                <div key={l.key} className="grid grid-cols-2 gap-2 border-b border-border px-5 py-3 last:border-0 @4xl:grid-cols-[1fr_5rem_7rem_8rem_9rem_7rem_4.5rem] @4xl:items-start">
                  <div className="col-span-2 flex flex-col gap-1.5 @4xl:col-span-1">
                    <Input aria-label={t('doc.description')} required autoFocus={l.key === focusKey} placeholder={t('doc.description')} value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} />
                    {l.showDetails ? (
                      <Textarea aria-label={t('doc.lineDetails')} rows={2} className="min-h-0 text-[13px]" placeholder={t('doc.lineDetails')} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                    ) : (
                      <button type="button" className="self-start text-xs text-muted hover:text-fg" onClick={() => setLine(l.key, { showDetails: true })}>+ {t('doc.lineDetails')}</button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted @4xl:hidden">{t('doc.qty')}</span>
                    <Input aria-label={t('doc.qty')} inputMode="decimal" aria-invalid={l.qty.trim() !== '' && !p.quantityMilli} className="tabular text-right" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted @4xl:hidden">{t('doc.unitPrice')}</span>
                    <Input aria-label={t('doc.unitPrice')} inputMode="decimal" aria-invalid={l.price.trim() !== '' && p.unitPriceMinor === null} className="tabular text-right" placeholder="0,00" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted @4xl:hidden">{t('doc.discount')}</span>
                    <div className="flex gap-1">
                    <Select aria-label={t('doc.discount')} className="w-14 px-1.5 text-[13px]" value={l.discountType} onChange={(e) => setLine(l.key, { discountType: e.target.value as LineDraft['discountType'], discount: '' })}>
                      <option value="">—</option><option value="percent">%</option><option value="amount">{h.currency}</option>
                    </Select>
                    {l.discountType && <Input aria-label={t('doc.discount')} inputMode="decimal" aria-invalid={l.discount.trim() !== '' && p.discountValue === null} className="tabular min-w-0 text-right" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} />}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted @4xl:hidden">{t('doc.taxes')}</span>
                    <Select aria-label={t('catalog.taxTreatment')} className="h-8 text-[12px]" value={l.taxTreatment} onChange={(e) => setLine(l.key, { taxTreatment: e.target.value as Treatment })}>
                      <option value="taxable">{t('catalog.taxable')}</option><option value="zero_rated">{t('catalog.zero_rated')}</option><option value="exempt">{t('catalog.exempt')}</option>
                    </Select>
                    {l.taxTreatment === 'taxable' && <TaxPicker taxes={taxes.data ?? []} value={l.taxIds} onChange={(v) => setLine(l.key, { taxIds: v })} />}
                  </div>
                  <div className="tabular self-center text-right font-medium @4xl:pt-2 @4xl:self-start">{r ? fmt(r.netMinor, h.currency) : '—'}</div>
                  <div className="col-span-2 flex justify-end gap-0.5 @4xl:col-span-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={t('doc.moveUp')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={t('doc.moveDown')} disabled={i === lines.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={t('doc.removeLine')} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardBody className="grid gap-4">
            {!isQuote && <Field label={t('doc.paymentTerms')} htmlFor="d-pt"><Input id="d-pt" value={h.paymentTerms} onChange={(e) => setH({ ...h, paymentTerms: e.target.value })} /></Field>}
            <Field label={t('doc.terms')} htmlFor="d-terms"><Textarea id="d-terms" rows={3} value={h.terms} onChange={(e) => setH({ ...h, terms: e.target.value })} /></Field>
            <Field label={t('doc.notes')} htmlFor="d-notes"><Textarea id="d-notes" rows={3} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></Field>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-2 text-[13px]">
            <div className="flex items-center gap-2 pb-2">
              <span className="flex-1 font-medium">{t('doc.docDiscount')}</span>
              <Select aria-label={t('doc.docDiscount')} className="h-8 w-16 px-1.5 text-[13px]" value={h.docDiscountType} onChange={(e) => { setH({ ...h, docDiscountType: e.target.value as '' | 'percent' | 'amount' }); setDocDiscount(''); }}>
                <option value="">—</option><option value="percent">%</option><option value="amount">{h.currency}</option>
              </Select>
              {h.docDiscountType && <Input aria-label={t('doc.docDiscount')} inputMode="decimal" className="tabular h-8 w-24 text-right" value={docDiscount} onChange={(e) => setDocDiscount(e.target.value)} />}
            </div>
            <Totals result={preview} currency={h.currency} fmt={fmt} />
            <p className="pt-2 text-[11px] text-subtle">{t('doc.previewNote')}</p>
          </CardBody>
        </Card>
      </div>
      {errors.length > 0 && <div role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{errors.map((e) => <p key={e}>{e}</p>)}</div>}
      <div className="mt-5 flex justify-end"><Button type="submit" loading={busy} disabled={!h.clientId}>{t('doc.save')}</Button></div>
    </form>
  );
}

/** Récapitulatif : sous-total, remises, base taxable, détail des taxes, total — toujours séparés. */
export function Totals({ result, currency, fmt, className }: {
  result: Pick<DocumentResult, 'subtotalMinor' | 'discountMinor' | 'taxableBaseMinor' | 'taxTotalMinor' | 'totalMinor' | 'amountsIncludeTax'> & { taxTotals: { name: string; ratePpm: number; amountMinor: number; baseMinor?: number }[]; exemptBaseMinor?: number; zeroRatedBaseMinor?: number } | null;
  currency: string;
  fmt: (m: number, c: string) => string;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!result) return <p className="py-4 text-center text-muted">—</p>;
  const row = (label: string, value: number, cls = '') => (
    <div className={cn('flex justify-between gap-4', cls)}><span className="text-muted">{label}</span><span className="tabular">{fmt(value, currency)}</span></div>
  );
  return (
    <div className={cn('space-y-1.5', className)}>
      {row(t('doc.subtotal'), result.subtotalMinor)}
      {result.discountMinor > 0 && row(t('doc.discounts'), -result.discountMinor)}
      {row(t('doc.taxableBase'), result.taxableBaseMinor)}
      {!!result.zeroRatedBaseMinor && row(t('doc.zeroRatedBase'), result.zeroRatedBaseMinor)}
      {!!result.exemptBaseMinor && row(t('doc.exemptBase'), result.exemptBaseMinor)}
      {result.taxTotals.map((x) => row(taxLabel(x.name, formatRate(x.ratePpm)), x.amountMinor))}
      <div className="flex justify-between gap-4 border-t border-border pt-2 text-[15px] font-semibold">
        <span>{result.amountsIncludeTax ? t('doc.totalIncl') : t('doc.totalTtc')}</span>
        <span className="tabular">{fmt(result.totalMinor, currency)}</span>
      </div>
    </div>
  );
}

