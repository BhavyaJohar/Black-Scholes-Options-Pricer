export interface SimulationOptions {
  runs?: number;
  horizonDays?: number;
  seed?: number;
}

export interface SimulationResult {
  returns: number[];
  p5: number;
  p50: number;
  p95: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

/** Parametric Monte Carlo over log returns, seeded for reproducible research. */
export function simulateTerminalReturns(
  dailyReturns: number[],
  { runs = 5_000, horizonDays = 252, seed = 42 }: SimulationOptions = {}
): SimulationResult {
  if (dailyReturns.length < 2 || dailyReturns.some((value) => !Number.isFinite(value) || value <= -1)) {
    throw new RangeError('At least two finite daily returns greater than -100% are required');
  }
  if (!Number.isInteger(runs) || runs < 1 || runs > 100_000) {
    throw new RangeError('runs must be an integer between 1 and 100000');
  }
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 2_520) {
    throw new RangeError('horizonDays must be an integer between 1 and 2520');
  }

  const logReturns = dailyReturns.map((value) => Math.log1p(value));
  const mean = logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length;
  const variance = logReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / (logReturns.length - 1);
  const volatility = Math.sqrt(variance);
  const random = mulberry32(seed);
  const results = Array.from({ length: runs }, () => {
    let terminalLogReturn = 0;
    for (let day = 0; day < horizonDays; day += 1) {
      const firstUniform = Math.max(random(), Number.EPSILON);
      const secondUniform = random();
      const normal = Math.sqrt(-2 * Math.log(firstUniform))
        * Math.cos(2 * Math.PI * secondUniform);
      terminalLogReturn += mean + volatility * normal;
    }
    return Math.expm1(terminalLogReturn);
  }).sort((a, b) => a - b);

  return {
    returns: results,
    p5: results[Math.floor((runs - 1) * 0.05)],
    p50: results[Math.floor((runs - 1) * 0.5)],
    p95: results[Math.floor((runs - 1) * 0.95)],
  };
}
