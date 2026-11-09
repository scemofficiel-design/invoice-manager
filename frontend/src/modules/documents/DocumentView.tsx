import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice, Quote } from '@im/shared/types';
import { taxLabel, unitLabel } from '@im/shared/units';
import { formatDate, qtyToInput, ppmToInput, useMoney } from '@/lib/money';
import { formatRate } from '@/modules/companies/pages';
import { Card, CardBody } from '@/components/ui/card';
import { Totals } from './DocumentEditor';

/** Rendu lecture seule d'un devis ou d'une facture (snapshot si émis, données courantes sinon). */
export function DocumentView({ doc, kind, header }: { doc: Quote | Invoice; kind: 'quote' | 'invoice'; header?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { fmt } = useMoney();
  const cur = doc.currency;
  const snap = doc.clientSnapshot as Record<string, string | null> | null;
  const taxTotals =
    kind === 'invoice'
      ? (doc as Invoice).taxTotals
      : Object.values(
          doc.lines.flatMap((l) => l.taxes).reduce<Record<string, { name: string; ratePpm: number; amountMinor: number }>>((acc, x) => {
            const k = `${x.name}|${x.ratePpm}`;
            acc[k] = { name: x.name, ratePpm: x.ratePpm, amountMinor: (acc[k]?.amountMinor ?? 0) + x.amountMinor };
            return acc;
          }, {}),
        );
  const fmtDiscount = (type: 'percent' | 'amount' | null, value: number | null) =>
    type === 'percent' ? `${ppmToInput(value ?? 0)} %` : type === 'amount' ? fmt(value ?? 0, cur) : '';
  return (
    <Card>
      <CardBody className="space-y-6">
        {header}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="text-[13px]">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-subtle">{t('doc.client')}</p>
            <p className="font-semibold">{doc.clientName}</p>
            {snap && (
              <>
                {snap.contactName && <p>{snap.contactName}</p>}
                {[snap.addressLine1, snap.addressLine2, [snap.postalCode, snap.city].filter(Boolean).join(' '), snap.country].filter(Boolean).map((x) => <p key={x} className="text-muted">{x}</p>)}
                {snap.email && <p className="text-muted">{snap.email}</p>}
                <p className="mt-1 text-[11px] text-subtle">{t('doc.snapshotNote')}</p>
              </>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:justify-self-end">
            <dt className="text-muted">{t('doc.issueDate')}</dt><dd>{formatDate(doc.issueDate)}</dd>
            {kind === 'quote' ? <><dt className="text-muted">{t('doc.validUntil')}</dt><dd>{formatDate((doc as Quote).validUntil)}</dd></> : <><dt className="text-muted">{t('doc.dueDate')}</dt><dd>{formatDate((doc as Invoice).dueDate)}</dd></>}
            <dt className="text-muted">{t('doc.currency')}</dt><dd className="font-medium">{cur}</dd>
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-border text-xs text-muted">
              <tr><th className="py-2 text-left font-medium">{t('doc.description')}</th><th className="py-2 text-right font-medium">{t('doc.qty')}</th><th className="py-2 text-right font-medium">{t('doc.unitPrice')}</th><th className="hidden py-2 text-right font-medium sm:table-cell">{t('doc.discount')}</th><th className="hidden py-2 pl-4 text-left font-medium md:table-cell">{t('doc.taxes')}</th><th className="py-2 text-right font-medium">{t('doc.lineTotal')}</th></tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => (
                <tr key={l.id} className="border-b border-border align-top last:border-0">
                  <td className="py-2.5 pr-3"><p className="font-medium">{l.name}</p>{l.description && <p className="whitespace-pre-line text-muted">{l.description}</p>}</td>
                  <td className="tabular py-2.5 text-right">{qtyToInput(l.quantityMilli)}{l.unit && l.unit !== 'unit' ? ` ${unitLabel(t(`catalog.units.${l.unit}`, { defaultValue: l.unit }), l.quantityMilli, i18n.language === 'en' ? 'en' : 'fr')}` : ''}</td>
                  <td className="tabular py-2.5 text-right">{fmt(l.unitPriceMinor, cur)}</td>
                  <td className="tabular hidden py-2.5 text-right sm:table-cell">{fmtDiscount(l.discountType, l.discountValue)}</td>
                  <td className="hidden py-2.5 pl-4 text-muted md:table-cell">{l.taxTreatment === 'taxable' ? l.taxes.map((x) => taxLabel(x.name, formatRate(x.ratePpm))).join(', ') || '—' : t(`catalog.${l.taxTreatment}`)}</td>
                  <td className="tabular py-2.5 text-right font-medium">{fmt(l.netMinor, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
          <div className="space-y-3 text-[13px]">
            {kind === 'invoice' && (doc as Invoice).paymentTerms && <div><p className="text-xs font-medium text-muted">{t('doc.paymentTerms')}</p><p className="whitespace-pre-line">{(doc as Invoice).paymentTerms}</p></div>}
            {doc.terms && <div><p className="text-xs font-medium text-muted">{t('doc.terms')}</p><p className="whitespace-pre-line">{doc.terms}</p></div>}
            {doc.notes && <div><p className="text-xs font-medium text-muted">{t('doc.notes')}</p><p className="whitespace-pre-line">{doc.notes}</p></div>}
            {doc.docDiscountType && <p className="text-muted">{t('doc.docDiscount')} : {fmtDiscount(doc.docDiscountType, doc.docDiscountValue)}</p>}
          </div>
          <Totals className="text-[13px]" result={{ ...doc, amountsIncludeTax: doc.pricesIncludeTax, taxTotals }} currency={cur} fmt={fmt} />
        </div>
      </CardBody>
    </Card>
  );
}
