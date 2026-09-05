import { describe, expect, it } from 'vitest';
import { calculateEfficientFrontier } from './efficientFrontier';
import type { PositionWithData, StockData } from './portfolioCalculations';

const histories: Record<string, StockData[]> = {
  ALPHA: [100, 101, 103, 102, 105, 107].map((close, index) => ({ date: `2026-01-0${index + 2}`, close })),
  BETA: [100, 99, 98, 100, 99, 101].map((close, index) => ({ date: `2026-01-0${index + 2}`, close })),
  GAMMA: [100, 100.5, 100.2, 101, 101.4, 101.8].map((close, index) => ({ date: `2026-01-0${index + 2}`, close })),
};

function position(ticker: string, positionType: 'long' | 'short' = 'long'): PositionWithData {
  const history = histories[ticker];
  return {
    ticker,
    quantity: 10,
    averagePrice: 100,
    currentPrice: history[history.length - 1].close,
    positionType,
    historicalData: history,
  };
}

describe('calculateEfficientFrontier', () => {
  it('builds a deterministic cloud, monotone frontier, and tangent CML', () => {
    const input = [position('ALPHA'), position('BETA'), position('GAMMA')];
    const first = calculateEfficientFrontier(input, 0.03, 500, 42);
    const second = calculateEfficientFrontier(input, 0.03, 500, 42);

    expect(first).toEqual(second);
    expect(first.portfolios).toHaveLength(500);
    expect(first.observations).toBe(5);
    expect(first.frontier.every((point, index) => index === 0
      || point.annualReturn > first.frontier[index - 1].annualReturn)).toBe(true);
    expect(first.capitalMarketLine[0]).toEqual({ annualVolatility: 0, annualReturn: 0.03 });
    expect(first.maximumSharpe.sharpeRatio).toBeGreaterThanOrEqual(first.minimumVolatility.sharpeRatio);
  });

  it('uses normalized signed gross exposure for the current portfolio point', () => {
    const result = calculateEfficientFrontier([
      position('ALPHA'),
      position('BETA', 'short'),
    ], 0.03, 200, 7);

    expect(result.currentPortfolio.weights.ALPHA).toBeCloseTo(0.5, 12);
    expect(result.currentPortfolio.weights.BETA).toBeCloseTo(-0.5, 12);
    expect(Object.values(result.maximumSharpe.weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  });
});
