import { describe, expect, it } from 'vitest';
import { calculatePortfolioMetrics, type PositionWithData, type StockData } from './portfolioCalculations';

const history: StockData[] = [
  { date: '2026-01-02', close: 100 },
  { date: '2026-01-05', close: 110 },
  { date: '2026-01-06', close: 115.5 },
];

function position(positionType: 'long' | 'short'): PositionWithData {
  return {
    ticker: 'TEST',
    quantity: 10,
    averagePrice: 100,
    currentPrice: 115.5,
    positionType,
    historicalData: history,
  };
}

describe('calculatePortfolioMetrics', () => {
  it('produces unit beta for a long position matching its benchmark', () => {
    const result = calculatePortfolioMetrics([position('long')], history);
    expect(result.totalReturn).toBeCloseTo(0.155, 12);
    expect(result.beta).toBeCloseTo(1, 12);
    expect(result.alpha).toBeCloseTo(0, 12);
    expect(result.maxDrawdown).toBe(0);
    expect(result.observations).toBe(2);
  });

  it('accounts for short direction in P&L, returns, and historical VaR', () => {
    const result = calculatePortfolioMetrics([position('short')], history, 0);
    expect(result.totalReturn).toBeCloseTo(-0.155, 12);
    expect(result.dailyReturns).toEqual([-0.1, -0.05]);
    expect(result.valueAtRisk95).toBeCloseTo(0.1, 12);
    expect(result.maxDrawdown).toBeCloseTo(0.145, 12);
  });

  it('fails clearly when histories cannot support sample statistics', () => {
    expect(() => calculatePortfolioMetrics(
      [{ ...position('long'), historicalData: history.slice(0, 2) }],
      history.slice(0, 2)
    )).toThrow('three aligned price observations');
  });
});
