export type OptionType = 'call' | 'put';
export type ExerciseStyle = 'european' | 'american';

export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface ImpliedVolatilityResult {
  volatility: number;
  iterations: number;
  priceError: number;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

function assertPositive(name: string, value: number): void {
  assertFinite(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`);
  }
}

// Abramowitz-Stegun approximation of the standard normal CDF.
function cdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1)
    * t * Math.exp(-absX * absX);

  return 0.5 * (1 + sign * y);
}

function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function intrinsicValue(spot: number, strike: number, type: OptionType): number {
  return type === 'call'
    ? Math.max(0, spot - strike)
    : Math.max(0, strike - spot);
}

/**
 * Cox-Ross-Rubinstein tree with continuous dividend yield and optional early
 * exercise. Invalid discretizations are rejected rather than returning a
 * plausible-looking price from a probability outside [0, 1].
 */
export function binomialTreePrice(
  spot: number,
  strike: number,
  timeToExpiry: number,
  rate: number,
  volatility: number,
  type: OptionType,
  steps: number,
  dividendYield = 0,
  exerciseStyle: ExerciseStyle = 'european'
): number {
  assertPositive('spot', spot);
  assertPositive('strike', strike);
  assertPositive('timeToExpiry', timeToExpiry);
  assertPositive('volatility', volatility);
  assertFinite('rate', rate);
  assertFinite('dividendYield', dividendYield);
  if (!Number.isInteger(steps) || steps < 1 || steps > 5_000) {
    throw new RangeError('steps must be an integer between 1 and 5000');
  }

  const dt = timeToExpiry / steps;
  const up = Math.exp(volatility * Math.sqrt(dt));
  const down = 1 / up;
  const probability = (Math.exp((rate - dividendYield) * dt) - down) / (up - down);
  if (probability < 0 || probability > 1) {
    throw new RangeError('tree parameters produce an invalid risk-neutral probability');
  }

  let values = Array.from({ length: steps + 1 }, (_, downMoves) => {
    const terminalSpot = spot * up ** (steps - downMoves) * down ** downMoves;
    return intrinsicValue(terminalSpot, strike, type);
  });
  const discount = Math.exp(-rate * dt);

  for (let step = steps - 1; step >= 0; step -= 1) {
    values = Array.from({ length: step + 1 }, (_, downMoves) => {
      const continuation = discount
        * (probability * values[downMoves] + (1 - probability) * values[downMoves + 1]);
      if (exerciseStyle === 'european') return continuation;

      const nodeSpot = spot * up ** (step - downMoves) * down ** downMoves;
      return Math.max(continuation, intrinsicValue(nodeSpot, strike, type));
    });
  }

  return values[0];
}

/** Black-Scholes-Merton price and Greeks with continuous dividend yield. */
export function blackScholes(
  spot: number,
  strike: number,
  timeToExpiry: number,
  rate: number,
  volatility: number,
  type: OptionType,
  dividendYield = 0
): OptionGreeks {
  assertPositive('spot', spot);
  assertPositive('strike', strike);
  assertPositive('timeToExpiry', timeToExpiry);
  assertPositive('volatility', volatility);
  assertFinite('rate', rate);
  assertFinite('dividendYield', dividendYield);

  const sqrtTime = Math.sqrt(timeToExpiry);
  const discountedSpot = spot * Math.exp(-dividendYield * timeToExpiry);
  const discountedStrike = strike * Math.exp(-rate * timeToExpiry);
  const d1 = (
    Math.log(spot / strike)
      + (rate - dividendYield + volatility ** 2 / 2) * timeToExpiry
  ) / (volatility * sqrtTime);
  const d2 = d1 - volatility * sqrtTime;
  const commonTheta = -(discountedSpot * pdf(d1) * volatility) / (2 * sqrtTime);
  const gamma = Math.exp(-dividendYield * timeToExpiry) * pdf(d1)
    / (spot * volatility * sqrtTime);
  const vega = discountedSpot * sqrtTime * pdf(d1);

  if (type === 'call') {
    return {
      price: discountedSpot * cdf(d1) - discountedStrike * cdf(d2),
      delta: Math.exp(-dividendYield * timeToExpiry) * cdf(d1),
      gamma,
      theta: commonTheta
        - rate * discountedStrike * cdf(d2)
        + dividendYield * discountedSpot * cdf(d1),
      vega,
      rho: timeToExpiry * discountedStrike * cdf(d2),
    };
  }

  return {
    price: discountedStrike * cdf(-d2) - discountedSpot * cdf(-d1),
    delta: Math.exp(-dividendYield * timeToExpiry) * (cdf(d1) - 1),
    gamma,
    theta: commonTheta
      + rate * discountedStrike * cdf(-d2)
      - dividendYield * discountedSpot * cdf(-d1),
    vega,
    rho: -timeToExpiry * discountedStrike * cdf(-d2),
  };
}

/**
 * Solves for European-equivalent implied volatility with a bounded bisection.
 * Bisection is slower than Newton-Raphson but remains stable when vega is small.
 */
export function impliedVolatility(
  marketPrice: number,
  spot: number,
  strike: number,
  timeToExpiry: number,
  rate: number,
  type: OptionType,
  dividendYield = 0,
  tolerance = 1e-8,
  maxIterations = 200
): ImpliedVolatilityResult {
  assertFinite('marketPrice', marketPrice);
  assertPositive('spot', spot);
  assertPositive('strike', strike);
  assertPositive('timeToExpiry', timeToExpiry);
  assertFinite('rate', rate);
  assertFinite('dividendYield', dividendYield);
  if (marketPrice <= 0) throw new RangeError('marketPrice must be greater than zero');
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError('tolerance must be greater than zero');
  }
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 1_000) {
    throw new RangeError('maxIterations must be an integer between 1 and 1000');
  }

  const discountedSpot = spot * Math.exp(-dividendYield * timeToExpiry);
  const discountedStrike = strike * Math.exp(-rate * timeToExpiry);
  const lowerBound = type === 'call'
    ? Math.max(0, discountedSpot - discountedStrike)
    : Math.max(0, discountedStrike - discountedSpot);
  const upperBound = type === 'call' ? discountedSpot : discountedStrike;
  if (marketPrice < lowerBound - tolerance || marketPrice > upperBound + tolerance) {
    throw new RangeError(
      `marketPrice violates no-arbitrage bounds [${lowerBound.toFixed(6)}, ${upperBound.toFixed(6)}]`
    );
  }

  let low = 1e-6;
  let high = 5;
  let volatility = (low + high) / 2;
  let priceError = Number.POSITIVE_INFINITY;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    volatility = (low + high) / 2;
    const modelPrice = blackScholes(
      spot,
      strike,
      timeToExpiry,
      rate,
      volatility,
      type,
      dividendYield
    ).price;
    priceError = modelPrice - marketPrice;
    if (Math.abs(priceError) <= tolerance) {
      return { volatility, iterations: iteration, priceError };
    }
    if (priceError > 0) high = volatility;
    else low = volatility;
  }

  return { volatility, iterations: maxIterations, priceError };
}
