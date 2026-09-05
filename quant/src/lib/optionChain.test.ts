import { describe, expect, it } from 'vitest';
import type { OptionContractSnapshot } from './marketDataClient';
import { analyzeOptionChain } from './optionChain';
import { blackScholes } from '../utils/pricing';

describe('analyzeOptionChain', () => {
  it('computes quote quality and independently recovers midpoint IV', () => {
    const valuationDate = new Date('2026-01-01T20:00:00.000Z');
    const midpoint = blackScholes(100, 100, 0.5, 0.03, 0.25, 'call').price;
    const contract: OptionContractSnapshot = {
      ticker: 'O:TEST260702C00100000',
      contractType: 'call',
      exerciseStyle: 'unknown',
      expirationDate: '2026-07-02',
      strikePrice: 100,
      sharesPerContract: 100,
      bid: midpoint - 0.1,
      ask: midpoint + 0.1,
      midpoint,
      impliedVolatility: 0.24,
      underlyingPrice: 100,
    };
    const [result] = analyzeOptionChain([contract], { valuationDate });

    expect(result.spread).toBeCloseTo(0.2, 10);
    expect(result.spreadPercent).toBeCloseTo(0.2 / midpoint, 10);
    expect(result.modelImpliedVolatility).toBeCloseTo(0.25, 3);
    expect(result.ivDifference).toBeCloseTo(0.01, 3);
    expect(result.moneyness).toBe(1);
  });

  it('preserves quotes when an account plan omits underlying data', () => {
    const result = analyzeOptionChain([{
      ticker: 'O:TEST',
      contractType: 'put',
      exerciseStyle: 'unknown',
      expirationDate: '2026-07-02',
      strikePrice: 100,
      sharesPerContract: 100,
    }]);
    expect(result).toHaveLength(1);
    expect(result[0].modelImpliedVolatility).toBeUndefined();
    expect(result[0].moneyness).toBeUndefined();
  });
});
