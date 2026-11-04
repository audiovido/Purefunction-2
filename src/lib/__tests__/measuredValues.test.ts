import { describe, expect, it } from 'vitest';
import { measuredAsymmetry, measuredRomSide } from '../measurements';
import { calculateAsymmetryPercent } from '../../types';

describe('measured ROM and asymmetry', () => {
  it('does not equate a missing side with zero or 100% asymmetry', () => {
    expect(measuredRomSide({ id: 'r', name: 'Hip IR', left: 0, right: 55 }, 'left')).toBe(null);
    expect(measuredAsymmetry(null, 55)).toBe(null);
    expect(calculateAsymmetryPercent(null, 55)).toBe(null);
  });
  it('allows a genuinely measured 0 degrees', () => {
    const r = { id: 'r', name: 'Hip IR', left: 0, right: 55, measuredSides: { left: true, right: true } };
    expect(measuredRomSide(r, 'left')).toBe(0);
    expect(measuredAsymmetry(0, 55)).toBe(100);
    expect(measuredAsymmetry(0, 0)).toBe(0);
  });
  it('does not allow an invalid value', () => {
    expect(measuredAsymmetry(Number.NaN, 30)).toBe(null);
    expect(measuredRomSide({ id: 'r', name: 'Hip', left: -2, right: null }, 'left')).toBe(null);
  });
});
