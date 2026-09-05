import { NextResponse } from 'next/server';
import { analyzeOptionChain } from '@/lib/optionChain';
import {
  createMarketDataClient,
  MarketDataApiError,
  MarketDataResponseError,
} from '@/lib/marketDataClient';

function parseFiniteParameter(value: string | null, fallback: number, name: string): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} must be a finite number`);
  return parsed;
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const ticker = searchParams.get('ticker')?.trim().toUpperCase() ?? '';
    if (!/^[A-Z][A-Z0-9./-]{0,9}$/.test(ticker)) {
      throw new TypeError('Ticker must be 1-10 letters, digits, dots, slashes, or hyphens');
    }
    const expirationDate = searchParams.get('expiration')?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      throw new TypeError('expiration is required and must use YYYY-MM-DD');
    }
    const contractTypeParameter = searchParams.get('type') ?? 'call';
    if (contractTypeParameter !== 'call' && contractTypeParameter !== 'put') {
      throw new TypeError('type must be "call" or "put"');
    }
    const riskFreeRate = parseFiniteParameter(searchParams.get('rate'), 0.03, 'rate');
    const dividendYield = parseFiniteParameter(searchParams.get('dividendYield'), 0, 'dividendYield');

    const chain = await createMarketDataClient().getOptionChain({
      ticker,
      expirationDate,
      contractType: contractTypeParameter,
      strikeLimit: 40,
    });
    const contracts = analyzeOptionChain(chain.contracts, { riskFreeRate, dividendYield });
    const underlying = contracts.find((contract) => contract.underlyingPrice !== undefined);

    return NextResponse.json({
      ticker,
      underlyingPrice: underlying?.underlyingPrice,
      underlyingTimeframe: underlying?.underlyingTimeframe,
      contracts,
      meta: {
        source: 'Market Data',
        dataUpdatedAt: chain.updatedAt,
        rateLimit: chain.rateLimit,
        strikeLimit: 40,
        retrievedAt: new Date().toISOString(),
        methodology: 'Midpoint IV uses a bounded European BSM inversion; vendor IV is returned separately.',
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
    });
  } catch (error: unknown) {
    if (error instanceof MarketDataResponseError) {
      return NextResponse.json(
        { error: { code: 'INVALID_MARKET_DATA_RESPONSE', message: error.message, retryable: false } },
        { status: 502 }
      );
    }
    if (error instanceof TypeError || error instanceof RangeError) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: error.message,
            retryable: false,
          },
        },
        { status: 400 }
      );
    }
    if (error instanceof MarketDataApiError) {
      return NextResponse.json(
        {
          error: {
            code: error.status === 429 ? 'RATE_LIMITED' : error.status === 401 ? 'MARKET_DATA_TOKEN_REQUIRED' : 'MARKET_DATA_REQUEST_FAILED',
            message: error.message,
            retryable: error.retryable,
            rateLimit: error.rateLimit,
          },
        },
        { status: error.status === 429 ? 429 : error.status === 404 ? 404 : error.status === 401 ? 503 : 502 }
      );
    }
    console.error('Option-chain request failed:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Option-chain request failed', retryable: false } },
      { status: 500 }
    );
  }
}
