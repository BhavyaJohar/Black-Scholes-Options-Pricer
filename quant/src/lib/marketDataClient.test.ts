import { describe, expect, it, vi } from 'vitest';
import { MarketDataApiError, MarketDataRestClient } from './marketDataClient';

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('MarketDataRestClient', () => {
  it('uses header authentication without leaking the token in the URL', async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input.toString());
      expect(url.origin).toBe('https://api.marketdata.app');
      expect(url.searchParams.has('token')).toBe(false);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-token');
      return jsonResponse({
        s: 'ok',
        symbol: ['AAPL'],
        bid: [201.4],
        ask: [201.6],
        mid: [201.5],
        last: [201.45],
        change: [2.5],
        changepct: [0.0125],
        updated: [1_735_000_000],
      });
    });
    const client = new MarketDataRestClient({ token: 'secret-token', fetchImplementation });

    await expect(client.getStockSnapshot('aapl')).resolves.toMatchObject({
      ticker: 'AAPL',
      price: 201.5,
      source: 'midpoint',
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('supports the tokenless AAPL demo without an Authorization header', async () => {
    const fetchImplementation = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
      return jsonResponse({ s: 'ok', symbol: ['AAPL'], last: [200], updated: [1_735_000_000] });
    });
    const client = new MarketDataRestClient({ fetchImplementation });

    await expect(client.getStockSnapshot('AAPL')).resolves.toMatchObject({ price: 200 });
  });

  it('retries rate limits and exposes provider credit metadata', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse(
        { s: 'error', errmsg: 'Credit limit reached' },
        429,
        { 'retry-after': '1', 'x-api-ratelimit-remaining': '0' }
      ))
      .mockResolvedValueOnce(jsonResponse({ s: 'ok', t: [], o: [], h: [], l: [], c: [], v: [] }));
    const client = new MarketDataRestClient({
      token: 'token',
      fetchImplementation,
      maxRetries: 1,
      sleep,
    });

    await expect(client.getAggregateBars('SPY', '2026-01-01', '2026-01-31')).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent authentication failures', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse(
      { s: 'error', errmsg: 'Authentication required' },
      401,
      { 'x-api-ratelimit-remaining': '99' }
    ));
    const client = new MarketDataRestClient({ token: 'bad-token', fetchImplementation });

    try {
      await client.getStockSnapshot('SPY');
      throw new Error('Expected request to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(MarketDataApiError);
      expect(error).toMatchObject({
        status: 401,
        retryable: false,
        rateLimit: { remaining: 99 },
      });
    }
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('normalizes the documented columnar option-chain response', async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe('/v1/options/chain/SPY/');
      expect(url.searchParams.get('expiration')).toBe('2026-10-16');
      expect(url.searchParams.get('side')).toBe('call');
      expect(url.searchParams.get('strikeLimit')).toBe('40');
      return jsonResponse({
        s: 'ok',
        optionSymbol: ['SPY261016C00700000'],
        underlying: ['SPY'],
        expiration: [1_792_180_800],
        side: ['call'],
        strike: [700],
        dte: [42],
        updated: [1_788_465_600],
        bid: [5.2],
        mid: [5.25],
        ask: [5.3],
        openInterest: [1_543],
        volume: [847],
        underlyingPrice: [700],
        iv: [0.21],
        delta: [0.52],
        gamma: [0.01],
        theta: [-0.15],
        vega: [0.44],
      }, 203, {
        'x-api-ratelimit-consumed': '1',
        'x-api-ratelimit-remaining': '99',
      });
    });
    const client = new MarketDataRestClient({ token: 'token', fetchImplementation });
    const result = await client.getOptionChain({
      ticker: 'SPY',
      expirationDate: '2026-10-16',
      contractType: 'call',
    });

    expect(result.rateLimit).toEqual(expect.objectContaining({ consumed: 1, remaining: 99 }));
    expect(result.contracts[0]).toMatchObject({
      ticker: 'SPY261016C00700000',
      contractType: 'call',
      exerciseStyle: 'unknown',
      strikePrice: 700,
      bid: 5.2,
      ask: 5.3,
      midpoint: 5.25,
      impliedVolatility: 0.21,
      openInterest: 1_543,
      underlyingPrice: 700,
    });
  });

  it('maps documented stock candles to millisecond timestamps', async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      expect(url.searchParams.get('adjustsplits')).toBe('true');
      expect(url.searchParams.get('adjustdividends')).toBe('false');
      return jsonResponse({
        s: 'ok',
        t: [1_735_000_000],
        o: [100],
        h: [102],
        l: [99],
        c: [101],
        v: [1_000_000],
      });
    });
    const client = new MarketDataRestClient({ token: 'token', fetchImplementation });

    await expect(client.getAggregateBars('SPY', '2026-01-01', '2026-01-31')).resolves.toEqual([{
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 1_000_000,
      timestamp: 1_735_000_000_000,
    }]);
  });
});
