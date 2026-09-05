import { formatISO, subDays } from 'date-fns';
import { createMarketDataClient } from './marketDataClient';

export interface StockData {
  date: string;
  close: number;
}

export type Timeframe = '1d' | '1w' | '1m' | '1y';

const LOOKBACK_DAYS: Record<Timeframe, number> = {
  '1d': 5,
  '1w': 14,
  '1m': 45,
  '1y': 380,
};

/** Returns split-adjusted daily closes from Market Data, normalized to ISO dates. */
export async function getStockData(
  ticker: string,
  timeframe: Timeframe = '1y'
): Promise<StockData[]> {
  const lookbackDays = LOOKBACK_DAYS[timeframe];
  const to = formatISO(new Date(), { representation: 'date' });
  const from = formatISO(subDays(new Date(), lookbackDays), { representation: 'date' });
  const bars = await createMarketDataClient().getAggregateBars(ticker, from, to);
  if (bars.length === 0) throw new RangeError(`No market data for ${ticker} over ${timeframe}`);

  return bars.map((bar) => ({
    date: new Date(bar.timestamp).toISOString().slice(0, 10),
    close: bar.close,
  }));
}
