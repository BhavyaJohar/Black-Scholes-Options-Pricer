import { describe, expect, it } from 'vitest';
import { blackScholes } from '../utils/pricing';
import { buildOptionPriceSurface } from './optionPriceSurface';

describe('buildOptionPriceSurface', () => {
  it('builds a centered 11 by 9 call-price grid', () => {
    const surface = buildOptionPriceSurface({
      spot: 100,
      strike: 100,
      timeToExpiry: 0.5,
      rate: 0.03,
      volatility: 0.2,
      type: 'call',
    });

    expect(surface.spots).toHaveLength(11);
    expect(surface.rows).toHaveLength(9);
    expect(surface.rows.every((row) => row.length === 11)).toBe(true);
    expect(surface.rows[4][5].isCurrent).toBe(true);
    expect(surface.rows[4][5].price).toBeCloseTo(blackScholes(100, 100, 0.5, 0.03, 0.2, 'call').price, 12);
    expect(surface.rows[4][10].price).toBeGreaterThan(surface.rows[4][0].price);
    expect(surface.rows[0][5].price).toBeGreaterThan(surface.rows[8][5].price);
  });
});
