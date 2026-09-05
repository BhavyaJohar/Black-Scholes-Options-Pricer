import { NextResponse } from 'next/server';
import {
  binomialTreePrice,
  blackScholes,
  type ExerciseStyle,
  type OptionType,
} from '@/utils/pricing';

interface PricingRequest {
  S: number;
  K: number;
  T: number;
  r: number;
  sigma: number;
  q: number;
  type: OptionType;
  position: 'long' | 'short';
  steps: number;
  exerciseStyle: ExerciseStyle;
}

function parsePricingRequest(value: unknown): PricingRequest {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Request body must be a JSON object');
  }

  const body = value as Record<string, unknown>;
  const readNumber = (field: string): number => {
    const candidate = body[field];
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
      throw new TypeError(`${field} must be a finite number`);
    }
    return candidate;
  };
  const spot = readNumber('S');
  const strike = readNumber('K');
  const daysToExpiry = readNumber('T');
  const rate = readNumber('r');
  const volatility = readNumber('sigma');

  if (spot <= 0 || strike <= 0 || daysToExpiry <= 0 || volatility <= 0) {
    throw new RangeError('S, K, T, and sigma must be greater than zero');
  }
  if (body.type !== 'call' && body.type !== 'put') {
    throw new TypeError('type must be "call" or "put"');
  }

  const position = body.position ?? 'long';
  if (position !== 'long' && position !== 'short') {
    throw new TypeError('position must be "long" or "short"');
  }
  const exerciseStyle = body.exerciseStyle ?? 'european';
  if (exerciseStyle !== 'european' && exerciseStyle !== 'american') {
    throw new TypeError('exerciseStyle must be "european" or "american"');
  }

  const steps = body.steps ?? 200;
  if (typeof steps !== 'number' || !Number.isInteger(steps) || steps < 1 || steps > 5_000) {
    throw new RangeError('steps must be an integer between 1 and 5000');
  }
  const dividendYield = body.q ?? 0;
  if (typeof dividendYield !== 'number' || !Number.isFinite(dividendYield)) {
    throw new TypeError('q must be a finite number');
  }

  return {
    S: spot,
    K: strike,
    T: daysToExpiry,
    r: rate,
    sigma: volatility,
    q: dividendYield,
    type: body.type,
    position,
    steps,
    exerciseStyle,
  };
}

export async function POST(request: Request) {
  try {
    const input = parsePricingRequest(await request.json());
    const timeToExpiry = input.T / 365;
    const result = blackScholes(
      input.S,
      input.K,
      timeToExpiry,
      input.r,
      input.sigma,
      input.type,
      input.q
    );

    // Display conventions: theta per calendar day; vega/rho per one-point move.
    result.theta /= 365;
    result.vega /= 100;
    result.rho /= 100;

    if (input.position === 'short') {
      result.delta *= -1;
      result.gamma *= -1;
      result.theta *= -1;
      result.vega *= -1;
      result.rho *= -1;
    }

    const binomialPrice = binomialTreePrice(
      input.S,
      input.K,
      timeToExpiry,
      input.r,
      input.sigma,
      input.type,
      input.steps,
      input.q,
      input.exerciseStyle
    );

    return NextResponse.json({ ...result, binomialPrice });
  } catch (error: unknown) {
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error calculating option price:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
