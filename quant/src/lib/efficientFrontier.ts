import type { PositionWithData, StockData } from './portfolioCalculations';

const TRADING_DAYS = 252;

export interface FrontierPoint {
  annualReturn: number;
  annualVolatility: number;
  sharpeRatio: number;
}

export interface WeightedFrontierPoint extends FrontierPoint {
  weights: Record<string, number>;
}

export interface EfficientFrontierResult {
  tickers: string[];
  portfolios: FrontierPoint[];
  frontier: FrontierPoint[];
  minimumVolatility: WeightedFrontierPoint;
  maximumSharpe: WeightedFrontierPoint;
  currentPortfolio: WeightedFrontierPoint;
  capitalMarketLine: Array<{ annualVolatility: number; annualReturn: number }>;
  riskFreeRate: number;
  observations: number;
  simulations: number;
}

interface AssetSeries {
  ticker: string;
  history: StockData[];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomLongOnlyWeights(assetCount: number, random: () => number): number[] {
  const draws = Array.from({ length: assetCount }, () => -Math.log(Math.max(random(), Number.EPSILON)));
  const total = draws.reduce((sum, value) => sum + value, 0);
  return draws.map((value) => value / total);
}

function calculatePoint(
  weights: number[],
  annualReturns: number[],
  annualCovariance: number[][],
  riskFreeRate: number
): FrontierPoint {
  const annualReturn = weights.reduce((sum, weight, index) => sum + weight * annualReturns[index], 0);
  let variance = 0;
  for (let row = 0; row < weights.length; row += 1) {
    for (let column = 0; column < weights.length; column += 1) {
      variance += weights[row] * weights[column] * annualCovariance[row][column];
    }
  }
  const annualVolatility = Math.sqrt(Math.max(0, variance));
  return {
    annualReturn,
    annualVolatility,
    sharpeRatio: annualVolatility === 0 ? 0 : (annualReturn - riskFreeRate) / annualVolatility,
  };
}

function withWeights(point: FrontierPoint, tickers: string[], weights: number[]): WeightedFrontierPoint {
  return {
    ...point,
    weights: Object.fromEntries(tickers.map((ticker, index) => [ticker, weights[index]])),
  };
}

function alignReturns(assets: AssetSeries[]): number[][] {
  const maps = assets.map(({ history }) => new Map(history.map(({ date, close }) => [date, close])));
  const commonDates = [...maps[0].keys()]
    .filter((date) => maps.every((prices) => prices.has(date)))
    .sort();
  if (commonDates.length < 3) throw new RangeError('At least three aligned prices are required for frontier estimation');

  return Array.from({ length: commonDates.length - 1 }, (_, dayIndex) => {
    const previousDate = commonDates[dayIndex];
    const currentDate = commonDates[dayIndex + 1];
    return maps.map((prices, assetIndex) => {
      const previous = prices.get(previousDate);
      const current = prices.get(currentDate);
      if (previous === undefined || current === undefined || previous <= 0 || current <= 0) {
        throw new RangeError(`Historical prices for ${assets[assetIndex].ticker} must be positive`);
      }
      return current / previous - 1;
    });
  });
}

/** Builds an approximate long-only mean-variance frontier from aligned historical returns. */
export function calculateEfficientFrontier(
  positions: PositionWithData[],
  annualRiskFreeRate = 0.03,
  simulations = 2_000,
  seed = 20_260_904
): EfficientFrontierResult {
  if (positions.length === 0) throw new RangeError('At least one position is required');
  if (!Number.isFinite(annualRiskFreeRate)) throw new RangeError('Risk-free rate must be finite');
  if (!Number.isInteger(simulations) || simulations < 100 || simulations > 10_000) {
    throw new RangeError('simulations must be an integer between 100 and 10000');
  }

  const assetsByTicker = new Map<string, AssetSeries>();
  for (const position of positions) {
    if (!assetsByTicker.has(position.ticker)) {
      assetsByTicker.set(position.ticker, { ticker: position.ticker, history: position.historicalData });
    }
  }
  const assets = [...assetsByTicker.values()];
  const tickers = assets.map(({ ticker }) => ticker);
  const returnsByDay = alignReturns(assets);
  const returnsByAsset = assets.map((_, assetIndex) => returnsByDay.map((row) => row[assetIndex]));
  const dailyMeans = returnsByAsset.map(mean);
  const annualReturns = dailyMeans.map((value) => value * TRADING_DAYS);
  const annualCovariance = assets.map((_, row) => assets.map((__, column) => {
    const covariance = returnsByDay.reduce((sum, returns) =>
      sum + (returns[row] - dailyMeans[row]) * (returns[column] - dailyMeans[column]), 0)
      / (returnsByDay.length - 1);
    return covariance * TRADING_DAYS;
  }));

  const random = mulberry32(seed);
  const candidates: Array<{ point: FrontierPoint; weights: number[] }> = [];
  const equalWeights = assets.map(() => 1 / assets.length);
  candidates.push({
    weights: equalWeights,
    point: calculatePoint(equalWeights, annualReturns, annualCovariance, annualRiskFreeRate),
  });
  for (let index = 0; index < assets.length; index += 1) {
    const weights = assets.map((_, assetIndex) => assetIndex === index ? 1 : 0);
    candidates.push({ weights, point: calculatePoint(weights, annualReturns, annualCovariance, annualRiskFreeRate) });
  }
  for (let index = candidates.length; index < simulations; index += 1) {
    const weights = randomLongOnlyWeights(assets.length, random);
    candidates.push({ weights, point: calculatePoint(weights, annualReturns, annualCovariance, annualRiskFreeRate) });
  }

  const minimum = candidates.reduce((best, candidate) =>
    candidate.point.annualVolatility < best.point.annualVolatility ? candidate : best
  );
  const maximumSharpe = candidates.reduce((best, candidate) =>
    candidate.point.sharpeRatio > best.point.sharpeRatio ? candidate : best
  );
  const sorted = [...candidates].sort((left, right) =>
    left.point.annualVolatility - right.point.annualVolatility
      || right.point.annualReturn - left.point.annualReturn
  );
  let bestReturn = Number.NEGATIVE_INFINITY;
  const frontier = sorted.flatMap(({ point }) => {
    if (point.annualVolatility + 1e-12 < minimum.point.annualVolatility || point.annualReturn <= bestReturn + 1e-8) {
      return [];
    }
    bestReturn = point.annualReturn;
    return [point];
  });

  const grossByTicker = new Map<string, number>();
  for (const position of positions) {
    const direction = position.positionType === 'short' ? -1 : 1;
    grossByTicker.set(
      position.ticker,
      (grossByTicker.get(position.ticker) ?? 0) + direction * position.quantity * position.averagePrice
    );
  }
  const grossCapital = positions.reduce((sum, position) => sum + position.quantity * position.averagePrice, 0);
  const currentWeights = tickers.map((ticker) => (grossByTicker.get(ticker) ?? 0) / grossCapital);
  const currentPoint = calculatePoint(currentWeights, annualReturns, annualCovariance, annualRiskFreeRate);
  const maximumChartVolatility = Math.max(...candidates.map(({ point }) => point.annualVolatility), currentPoint.annualVolatility) * 1.08;
  const cmlReturn = annualRiskFreeRate + maximumSharpe.point.sharpeRatio * maximumChartVolatility;

  return {
    tickers,
    portfolios: candidates.map(({ point }) => point),
    frontier,
    minimumVolatility: withWeights(minimum.point, tickers, minimum.weights),
    maximumSharpe: withWeights(maximumSharpe.point, tickers, maximumSharpe.weights),
    currentPortfolio: withWeights(currentPoint, tickers, currentWeights),
    capitalMarketLine: [
      { annualVolatility: 0, annualReturn: annualRiskFreeRate },
      { annualVolatility: maximumChartVolatility, annualReturn: cmlReturn },
    ],
    riskFreeRate: annualRiskFreeRate,
    observations: returnsByDay.length,
    simulations: candidates.length,
  };
}
