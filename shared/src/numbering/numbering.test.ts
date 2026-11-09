import { describe, expect, it } from 'vitest';
import { formatDocumentNumber, periodKeyFor } from './index';

describe('numérotation', () => {
  it('formate les motifs', () => {
    expect(formatDocumentNumber('FAC-{YYYY}-{SEQ:5}', '2026-11-09', 42)).toBe('FAC-2026-00042');
    expect(formatDocumentNumber('D{YY}{MM}-{SEQ}', '2026-03-01', 7)).toBe('D2603-7');
    expect(formatDocumentNumber('R-{SEQ:3}', '2026-01-01', 12345)).toBe('R-12345');
  });
  it('clé de période', () => {
    expect(periodKeyFor('yearly', '2026-11-09')).toBe('2026');
    expect(periodKeyFor('never', '2026-11-09')).toBe('all');
  });
});
