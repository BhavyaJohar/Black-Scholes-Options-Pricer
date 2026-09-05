import { describe, expect, it } from 'vitest';
import { simulateTerminalReturns } from './monteCarlo';

describe('simulateTerminalReturns', () => {
  it('is reproducible for a fixed seed and keeps terminal returns above -100%', () => {
    const first = simulateTerminalReturns([0.01, -0.02, 0.015, 0.005], {
      runs: 100,
      horizonDays: 20,
      seed: 7,
    });
    const second = simulateTerminalReturns([0.01, -0.02, 0.015, 0.005], {
      runs: 100,
      horizonDays: 20,
      seed: 7,
    });

    expect(first).toEqual(second);
    expect(first.returns.every((value) => value > -1)).toBe(true);
    expect(first.p5).toBeLessThanOrEqual(first.p50);
    expect(first.p50).toBeLessThanOrEqual(first.p95);
  });

  it('rejects insufficient return history', () => {
    expect(() => simulateTerminalReturns([0.01])).toThrow('At least two');
  });
});
