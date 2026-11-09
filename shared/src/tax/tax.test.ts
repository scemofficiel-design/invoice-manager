import { describe, expect, it } from 'vitest';
import { computeDocument, type LineInput, type TaxDefinition } from './index';

const TPS: TaxDefinition = { key: 'tps', name: 'TPS', ratePpm: 50_000, isCompound: false };
const TVQ: TaxDefinition = { key: 'tvq', name: 'TVQ', ratePpm: 99_750, isCompound: false };
const TVA20: TaxDefinition = { key: 'tva20', name: 'TVA 20 %', ratePpm: 200_000, isCompound: false };
const TVA18: TaxDefinition = { key: 'tva18', name: 'TVA 18 %', ratePpm: 180_000, isCompound: false };

const line = (quantityMilli: number, unitPriceMinor: number, taxes: TaxDefinition[], extra: Partial<LineInput> = {}): LineInput => ({
  quantityMilli,
  unitPriceMinor,
  taxes,
  taxTreatment: 'taxable',
  ...extra,
});

describe('computeDocument — cas de référence', () => {
  it('Québec : 100,00 $ + TPS 5 % + TVQ 9,975 % = 114,98 $', () => {
    const r = computeDocument({ lines: [line(1000, 10000, [TPS, TVQ])], pricesIncludeTax: false, rounding: 'per_document' });
    expect(r.taxTotals.map((t) => [t.name, t.baseMinor, t.amountMinor])).toEqual([
      ['TPS', 10000, 500],
      ['TVQ', 10000, 998],
    ]);
    expect(r.totalMinor).toBe(11498);
    expect(r.taxableBaseMinor).toBe(10000);
  });

  it('France : 1,5 h × 80,00 € + TVA 20 % = 144,00 €', () => {
    const r = computeDocument({ lines: [line(1500, 8000, [TVA20])], pricesIncludeTax: false, rounding: 'per_line' });
    expect(r.subtotalMinor).toBe(12000);
    expect(r.taxTotalMinor).toBe(2400);
    expect(r.totalMinor).toBe(14400);
  });

  it('XOF (sans décimales) : 3 × 3 333 F + TVA 18 % = 11 799 F', () => {
    const r = computeDocument({ lines: [line(3000, 3333, [TVA18])], pricesIncludeTax: false, rounding: 'per_document' });
    expect(r.subtotalMinor).toBe(9999);
    expect(r.taxTotalMinor).toBe(1800);
    expect(r.totalMinor).toBe(11799);
  });

  it('arrondi par document vs par ligne', () => {
    const lines = [line(1000, 5, [TPS]), line(1000, 5, [TPS]), line(1000, 5, [TPS])];
    const perLine = computeDocument({ lines, pricesIncludeTax: false, rounding: 'per_line' });
    const perDoc = computeDocument({ lines, pricesIncludeTax: false, rounding: 'per_document' });
    expect(perLine.taxTotalMinor).toBe(0);
    expect(perDoc.taxTotalMinor).toBe(1);
    // la taxe document est répartie sur les lignes et la somme reste exacte
    expect(perDoc.lines.reduce((a, l) => a + l.taxMinor, 0)).toBe(1);
  });

  it('remise de ligne et remise globale réparties au prorata', () => {
    const r = computeDocument({
      lines: [line(1000, 10000, [TPS], { discount: { type: 'amount', valueMinor: 0 } }), line(2000, 2500, [TPS], { discount: { type: 'percent', valuePpm: 100_000 } })],
      documentDiscount: { type: 'percent', valuePpm: 100_000 },
      pricesIncludeTax: false,
      rounding: 'per_document',
    });
    // ligne 2 : brut 50,00, remise 10 % = 5,00 → 45,00 ; total avant remise globale 145,00 ; remise globale 14,50
    expect(r.lineDiscountMinor).toBe(500);
    expect(r.documentDiscountMinor).toBe(1450);
    expect(r.lines.map((l) => l.documentDiscountMinor)).toEqual([1000, 450]);
    expect(r.netMinor).toBe(13050);
    expect(r.taxTotalMinor).toBe(653); // 130,50 × 5 % = 6,525 → 6,53
    expect(r.totalMinor).toBe(13703);
  });

  it('remise globale en montant répartie exactement', () => {
    const r = computeDocument({
      lines: [line(1000, 1000, []), line(1000, 1000, []), line(1000, 1000, [])],
      documentDiscount: { type: 'amount', valueMinor: 100 },
      pricesIncludeTax: false,
      rounding: 'per_line',
    });
    expect(r.lines.map((l) => l.documentDiscountMinor)).toEqual([34, 33, 33]);
    expect(r.totalMinor).toBe(2900);
  });

  it('prix taxes incluses : 114,98 $ TTC → 100,00 $ HT', () => {
    const r = computeDocument({ lines: [line(1000, 11498, [TPS, TVQ])], pricesIncludeTax: true, rounding: 'per_document' });
    expect(r.amountsIncludeTax).toBe(true);
    expect(r.netMinor).toBe(10000);
    expect(r.taxTotalMinor).toBe(1498);
    expect(r.totalMinor).toBe(11498);
  });

  it('prix taxes incluses : le TTC saisi est toujours conservé exactement', () => {
    for (let price = 1; price < 3000; price += 7) {
      const r = computeDocument({ lines: [line(1000, price, [TPS, TVQ])], pricesIncludeTax: true, rounding: 'per_line' });
      expect(r.totalMinor).toBe(price);
      expect(r.netMinor + r.taxTotalMinor).toBe(price);
    }
  });

  it('taxe composée calculée sur le net + taxes simples', () => {
    const TVQ_OLD: TaxDefinition = { key: 'tvq85', name: 'TVQ 8,5 %', ratePpm: 85_000, isCompound: true };
    for (const rounding of ['per_line', 'per_document'] as const) {
      const r = computeDocument({ lines: [line(1000, 10000, [TPS, TVQ_OLD])], pricesIncludeTax: false, rounding });
      expect(r.taxTotals.find((t) => t.key === 'tvq85')).toMatchObject({ baseMinor: 10500, amountMinor: 893 });
      expect(r.totalMinor).toBe(11393);
    }
  });

  it('distingue exonéré, détaxé et lignes sans taxe', () => {
    const r = computeDocument({
      lines: [
        line(1000, 1000, [TPS]),
        line(1000, 2000, [TPS], { taxTreatment: 'exempt' }),
        line(1000, 3000, [TPS], { taxTreatment: 'zero_rated' }),
        line(1000, 4000, []),
      ],
      pricesIncludeTax: false,
      rounding: 'per_document',
    });
    expect(r.taxableBaseMinor).toBe(1000);
    expect(r.exemptBaseMinor).toBe(2000);
    expect(r.zeroRatedBaseMinor).toBe(3000);
    expect(r.untaxedBaseMinor).toBe(4000);
    expect(r.taxTotalMinor).toBe(50);
    expect(r.totalMinor).toBe(10050);
  });

  it('document vide', () => {
    const r = computeDocument({ lines: [], pricesIncludeTax: false, rounding: 'per_document', documentDiscount: { type: 'percent', valuePpm: 100_000 } });
    expect(r.totalMinor).toBe(0);
  });

  it('refuse les entrées incohérentes', () => {
    const base = { pricesIncludeTax: false, rounding: 'per_line' as const };
    expect(() => computeDocument({ ...base, lines: [line(0, 100, [])] })).toThrow(/Quantité/);
    expect(() => computeDocument({ ...base, lines: [line(1000, -1, [])] })).toThrow(/Prix/);
    expect(() => computeDocument({ ...base, lines: [line(1000, 100, [], { discount: { type: 'amount', valueMinor: 101 } })] })).toThrow(/Remise/);
    expect(() => computeDocument({ ...base, lines: [line(1000, 100, [], { discount: { type: 'percent', valuePpm: 1_000_001 } })] })).toThrow(/100 %/);
    expect(() => computeDocument({ ...base, lines: [line(1000, 100, [TPS, TPS])] })).toThrow(/deux fois/);
  });
});
