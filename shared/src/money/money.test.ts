import { describe, expect, it } from 'vitest';
import { allocate, formatDecimal, formatMoney, parseDecimal, parseMoney, parsePercent, roundDiv } from './index';

describe('roundDiv', () => {
  it('arrondit la demi-unité en s’éloignant de zéro', () => {
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundDiv(-5n, 2n)).toBe(-3n);
    expect(roundDiv(4n, 3n)).toBe(1n);
    expect(roundDiv(149n, 100n)).toBe(1n);
    expect(roundDiv(150n, 100n)).toBe(2n);
  });
});

describe('allocate', () => {
  it('répartit exactement le total', () => {
    const parts = allocate(100n, [1n, 1n, 1n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100n);
    expect(parts).toEqual([34n, 33n, 33n]);
  });
  it('respecte les proportions', () => {
    expect(allocate(1000n, [3000n, 1000n])).toEqual([750n, 250n]);
  });
  it('gère un total nul', () => {
    expect(allocate(0n, [0n, 0n])).toEqual([0n, 0n]);
  });
});

describe('parse / format', () => {
  it('analyse sans flottant', () => {
    expect(parseMoney('0,1', 2) + parseMoney('0,2', 2)).toBe(30);
    expect(parseMoney('1 234,56', 2)).toBe(123456);
    expect(parseMoney('5000', 0)).toBe(5000);
    expect(() => parseMoney('5000,5', 0)).toThrow();
    expect(parsePercent('9,975')).toBe(99750);
    expect(parseDecimal('1.5', 3)).toBe(1500);
  });
  it('formate', () => {
    expect(formatDecimal(123456, 2)).toBe('1234.56');
    expect(formatDecimal(5, 2)).toBe('0.05');
    expect(formatDecimal(-5, 2)).toBe('-0.05');
    expect(formatDecimal(5000, 0)).toBe('5000');
    expect(formatMoney(123456, 'CAD', 2, 'fr-CA').replace(/\s/g, ' ')).toBe('1 234,56 $');
    expect(formatMoney(5000, 'XOF', 0, 'fr-FR').replace(/\s/g, ' ')).toMatch(/^5 000 (F CFA|FCFA)$/);
  });
});
