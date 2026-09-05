export interface StockData {
  date: string;
  close: number;
}

export interface PositionWithData {
  ticker: string;
  quantity: number;
  averagePrice: number;
  positionType: 'long' | 'short';
  currentPrice: number;
  historicalData: StockData[];
}

export interface PortfolioMetrics {
  totalReturn: number;
  alpha: number;
  beta: number;
  sharpeRatio: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  valueAtRisk95: number;
  dailyReturns: number[];
  observations: number;
}

const TRADING_DAYS = 252;

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: number[], average: number): number {
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0)
    / (values.length - 1);
}

function calculateMaxDrawdown(returns: number[]): number {
  let wealth = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const dailyReturn of returns) {
    wealth *= 1 + dailyReturn;
    peak = Math.max(peak, wealth);
    maxDrawdown = Math.max(maxDrawdown, (peak - wealth) / peak);
  }
  return maxDrawdown;
}

export function calculatePortfolioMetrics(
  positions: PositionWithData[],
  benchmarkHistoricalData: StockData[],
  annualRiskFreeRate = 0.03
): PortfolioMetrics {
  if (positions.length === 0) {
    throw new RangeError('At least one position is required');
  }
  if (!Number.isFinite(annualRiskFreeRate)) {
    throw new RangeError('Risk-free rate must be finite');
  }

  const grossExposures = positions.map((position) => {
    if (
      !Number.isFinite(position.quantity)
      || !Number.isFinite(position.averagePrice)
      || !Number.isFinite(position.currentPrice)
      || position.quantity <= 0
      || position.averagePrice <= 0
      || position.currentPrice <= 0
    ) {
      throw new RangeError(`Invalid prices or quantity for ${position.ticker}`);
    }
    return position.quantity * position.averagePrice;
  });
  const grossCapital = grossExposures.reduce((sum, exposure) => sum + exposure, 0);
  const weights = grossExposures.map((exposure) => exposure / grossCapital);

  const benchmarkMap = new Map(benchmarkHistoricalData.map(({ date, close }) => [date, close]));
  const positionMaps = positions.map((position) =>
    new Map(position.historicalData.map(({ date, close }) => [date, close]))
  );
  const commonDates = [...benchmarkMap.keys()]
    .filter((date) => positionMaps.every((priceMap) => priceMap.has(date)))
    .sort();

  if (commonDates.length < 3) {
    throw new RangeError('At least three aligned price observations are required');
  }

  const dailyReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  for (let index = 1; index < commonDates.length; index += 1) {
    const previousDate = commonDates[index - 1];
    const currentDate = commonDates[index];
    const previousBenchmark = benchmarkMap.get(previousDate);
    const currentBenchmark = benchmarkMap.get(currentDate);
    if (!previousBenchmark || !currentBenchmark) {
      throw new RangeError('Benchmark prices must be greater than zero');
    }

    benchmarkReturns.push((currentBenchmark - previousBenchmark) / previousBenchmark);
    dailyReturns.push(positions.reduce((portfolioReturn, position, positionIndex) => {
      const previousPrice = positionMaps[positionIndex].get(previousDate);
      const currentPrice = positionMaps[positionIndex].get(currentDate);
      if (!previousPrice || !currentPrice) {
        throw new RangeError(`Historical prices for ${position.ticker} must be greater than zero`);
      }
      const direction = position.positionType === 'short' ? -1 : 1;
      const positionReturn = direction * (currentPrice - previousPrice) / previousPrice;
      return portfolioReturn + weights[positionIndex] * positionReturn;
    }, 0));
  }

  const totalReturn = positions.reduce((portfolioReturn, position, index) => {
    const direction = position.positionType === 'short' ? -1 : 1;
    const positionReturn = direction
      * (position.currentPrice - position.averagePrice) / position.averagePrice;
    return portfolioReturn + weights[index] * positionReturn;
  }, 0);

  const dailyRiskFreeRate = annualRiskFreeRate / TRADING_DAYS;
  const excessPortfolioReturns = dailyReturns.map((value) => value - dailyRiskFreeRate);
  const excessBenchmarkReturns = benchmarkReturns.map((value) => value - dailyRiskFreeRate);
  const averagePortfolioReturn = mean(excessPortfolioReturns);
  const averageBenchmarkReturn = mean(excessBenchmarkReturns);
  const benchmarkVariance = sampleVariance(excessBenchmarkReturns, averageBenchmarkReturn);
  const covariance = excessPortfolioReturns.reduce((sum, value, index) =>
    sum + (value - averagePortfolioReturn)
      * (excessBenchmarkReturns[index] - averageBenchmarkReturn), 0)
    / (excessPortfolioReturns.length - 1);
  const beta = benchmarkVariance === 0 ? 0 : covariance / benchmarkVariance;
  const alpha = (averagePortfolioReturn - beta * averageBenchmarkReturn) * TRADING_DAYS;
  const portfolioVariance = sampleVariance(excessPortfolioReturns, averagePortfolioReturn);
  const dailyVolatility = Math.sqrt(portfolioVariance);
  const sharpeRatio = dailyVolatility === 0
    ? 0
    : averagePortfolioReturn / dailyVolatility * Math.sqrt(TRADING_DAYS);
  const sortedReturns = [...dailyReturns].sort((a, b) => a - b);
  const fifthPercentile = sortedReturns[Math.floor((sortedReturns.length - 1) * 0.05)];

  return {
    totalReturn,
    alpha,
    beta,
    sharpeRatio,
    annualizedVolatility: dailyVolatility * Math.sqrt(TRADING_DAYS),
    maxDrawdown: calculateMaxDrawdown(dailyReturns),
    valueAtRisk95: Math.max(0, -fifthPercentile),
    dailyReturns,
    observations: dailyReturns.length,
  };
}
