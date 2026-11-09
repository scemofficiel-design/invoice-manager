import { describe, expect, it } from 'vitest';
import { unitLabel } from './units';
describe('unitLabel', () => {
  it('accorde en français et en anglais', () => {
    expect(unitLabel('jour', 1500, 'fr')).toBe('jour');
    expect(unitLabel('jour', 3000, 'fr')).toBe('jours');
    expect(unitLabel('mois', 3000, 'fr')).toBe('mois');
    expect(unitLabel('km', 3000, 'fr')).toBe('km');
    expect(unitLabel('day', 1000, 'en')).toBe('day');
    expect(unitLabel('day', 1500, 'en')).toBe('days');
    expect(unitLabel('flat fee', 2000, 'en')).toBe('flat fees');
  });
});
