import { NextResponse } from 'next/server';
import {
  createMarketDataClient,
  MarketDataApiError,
  MarketDataResponseError,
} from '@/lib/marketDataClient';

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get('ticker')?.trim().toUpperCase() ?? '';
  if (!/^[A-Z][A-Z0-9./-]{0,9}$/.test(ticker)) {
    return NextResponse.json(
      { error: { code: 'INVALID_TICKER', message: 'Ticker must be 1-10 letters, digits, dots, slashes, or hyphens' } },
      { status: 400 }
    );
  }

  try {
    const snapshot = await createMarketDataClient().getStockSnapshot(ticker);
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
    });
  } catch (error: unknown) {
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
        { status: error.status === 404 ? 404 : error.status === 429 ? 429 : error.status === 401 ? 503 : 502 }
      );
    }
    const message = error instanceof Error ? error.message : 'Market-data request failed';
    const invalidResponse = error instanceof MarketDataResponseError;
    return NextResponse.json(
      {
        error: {
          code: invalidResponse ? 'INVALID_MARKET_DATA_RESPONSE' : 'MARKET_DATA_REQUEST_FAILED',
          message,
          retryable: false,
        },
      },
      { status: 502 }
    );
  }
}
