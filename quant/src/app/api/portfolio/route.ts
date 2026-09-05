import { NextResponse } from 'next/server';
import { calculatePortfolioMetrics, type PositionWithData } from '@/lib/portfolioCalculations';
import { calculateEfficientFrontier } from '@/lib/efficientFrontier';
import { getStockData, type StockData, type Timeframe } from '@/lib/stockData';
import { MarketDataApiError, MarketDataResponseError } from '@/lib/marketDataClient';

interface PositionInput {
  ticker: string;
  quantity: number;
  averagePrice: number;
  positionType: 'long' | 'short';
}

function parsePositions(value: unknown): PositionInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new RangeError('positions must contain between 1 and 50 entries');
  }

  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new TypeError(`positions[${index}] must be an object`);
    }
    const position = item as Record<string, unknown>;
    const ticker = typeof position.ticker === 'string' ? position.ticker.trim().toUpperCase() : '';
    if (!/^[A-Z][A-Z0-9./-]{0,9}$/.test(ticker)) {
      throw new TypeError(`positions[${index}].ticker is invalid`);
    }
    if (typeof position.quantity !== 'number' || !Number.isFinite(position.quantity) || position.quantity <= 0) {
      throw new RangeError(`positions[${index}].quantity must be greater than zero`);
    }
    if (typeof position.averagePrice !== 'number' || !Number.isFinite(position.averagePrice) || position.averagePrice <= 0) {
      throw new RangeError(`positions[${index}].averagePrice must be greater than zero`);
    }
    if (position.positionType !== 'long' && position.positionType !== 'short') {
      throw new TypeError(`positions[${index}].positionType must be "long" or "short"`);
    }
    return {
      ticker,
      quantity: position.quantity,
      averagePrice: position.averagePrice,
      positionType: position.positionType,
    };
  });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      throw new TypeError('Request body must be a JSON object');
    }
    const payload = body as Record<string, unknown>;
    const positions = parsePositions(payload.positions);
    const timeframe = payload.timeframe ?? '1y';
    if (timeframe !== '1m' && timeframe !== '1y') {
      throw new TypeError('timeframe must be "1m" or "1y"');
    }

    const tickers = [...new Set([...positions.map(({ ticker }) => ticker), 'SPY'])];
    const series = new Map<string, StockData[]>(await Promise.all(
      tickers.map(async (ticker) => [ticker, await getStockData(ticker, timeframe as Timeframe)] as const)
    ));
    const enrichedPositions: PositionWithData[] = positions.map((position) => {
      const historicalData = series.get(position.ticker);
      if (!historicalData?.length) {
        throw new Error(`No price history returned for ${position.ticker}`);
      }
      return {
        ...position,
        historicalData,
        currentPrice: historicalData[historicalData.length - 1].close,
      };
    });
    const benchmarkData = series.get('SPY');
    if (!benchmarkData) throw new Error('No benchmark history returned for SPY');

    const annualRiskFreeRate = 0.03;
    return NextResponse.json({
      ...calculatePortfolioMetrics(enrichedPositions, benchmarkData, annualRiskFreeRate),
      efficientFrontier: calculateEfficientFrontier(enrichedPositions, annualRiskFreeRate),
    });
  } catch (error: unknown) {
    if (error instanceof MarketDataApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status === 429 ? 429 : error.status === 401 ? 503 : 502 }
      );
    }
    if (error instanceof MarketDataResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Portfolio analysis failed:', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
