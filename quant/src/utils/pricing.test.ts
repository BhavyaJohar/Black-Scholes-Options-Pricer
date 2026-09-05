import { describe, expect, it } from 'vitest';
import { binomialTreePrice, blackScholes, impliedVolatility } from './pricing';

describe('Black-Scholes-Merton', () => {
  it('matches canonical call and put reference values', () => {
    expect(blackScholes(100, 100, 1, 0.05, 0.2, 'call').price).toBeCloseTo(10.4506, 3);
    expect(blackScholes(100, 100, 1, 0.05, 0.2, 'put').price).toBeCloseTo(5.5735, 3);
  });

  it('satisfies put-call parity with a continuous dividend yield', () => {
    const spot = 112;
    const strike = 105;
    const time = 0.75;
    const rate = 0.04;
    const dividendYield = 0.015;
    const call = blackScholes(spot, strike, time, rate, 0.28, 'call', dividendYield);
    const put = blackScholes(spot, strike, time, rate, 0.28, 'put', dividendYield);
    const parity = spot * Math.exp(-dividendYield * time)
      - strike * Math.exp(-rate * time);

    expect(call.price - put.price).toBeCloseTo(parity, 8);
  });

  it('rejects invalid numerical domains', () => {
    expect(() => blackScholes(0, 100, 1, 0.05, 0.2, 'call')).toThrow('spot');
    expect(() => blackScholes(100, 100, 0, 0.05, 0.2, 'call')).toThrow('timeToExpiry');
  });

  it('recovers volatility from a market price', () => {
    const marketPrice = blackScholes(105, 100, 0.5, 0.04, 0.37, 'call', 0.01).price;
    const result = impliedVolatility(marketPrice, 105, 100, 0.5, 0.04, 'call', 0.01);
    expect(result.volatility).toBeCloseTo(0.37, 7);
    expect(Math.abs(result.priceError)).toBeLessThanOrEqual(1e-8);
  });

  it('rejects prices outside European no-arbitrage bounds', () => {
    expect(() => impliedVolatility(101, 100, 100, 1, 0, 'call')).toThrow('no-arbitrage');
  });
});

describe('CRR binomial tree', () => {
  it('converges toward Black-Scholes for a European option', () => {
    const tree = binomialTreePrice(100, 100, 1, 0.05, 0.2, 'call', 1_000);
    const closedForm = blackScholes(100, 100, 1, 0.05, 0.2, 'call').price;
    expect(tree).toBeCloseTo(closedForm, 2);
  });

  it('never values an American put below its European equivalent', () => {
    const european = binomialTreePrice(80, 100, 1, 0.08, 0.25, 'put', 500, 0, 'european');
    const american = binomialTreePrice(80, 100, 1, 0.08, 0.25, 'put', 500, 0, 'american');
    expect(american).toBeGreaterThanOrEqual(european);
  });
});
