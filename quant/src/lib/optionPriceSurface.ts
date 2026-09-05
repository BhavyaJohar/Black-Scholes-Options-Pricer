import { blackScholes, type OptionType } from '../utils/pricing';

export interface OptionPriceSurfaceCell {
  spot: number;
  volatility: number;
  price: number;
  isCurrent: boolean;
}

export interface OptionPriceSurface {
  spots: number[];
  volatilities: number[];
  rows: OptionPriceSurfaceCell[][];
  minimumPrice: number;
  maximumPrice: number;
}

/** Builds an 11×9 BSM price surface around the supplied spot and volatility. */
export function buildOptionPriceSurface({
  spot,
  strike,
  timeToExpiry,
  rate,
  volatility,
  type,
  dividendYield = 0,
}: {
  spot: number;
  strike: number;
  timeToExpiry: number;
  rate: number;
  volatility: number;
  type: OptionType;
  dividendYield?: number;
}): OptionPriceSurface {
  const spots = Array.from({ length: 11 }, (_, index) => spot * (0.75 + index * 0.05));
  const volatilities = Array.from({ length: 9 }, (_, index) => volatility * (1.5 - index * 0.125));
  const rows = volatilities.map((scenarioVolatility, volatilityIndex) =>
    spots.map((scenarioSpot, spotIndex) => ({
      spot: scenarioSpot,
      volatility: scenarioVolatility,
      price: blackScholes(
        scenarioSpot,
        strike,
        timeToExpiry,
        rate,
        scenarioVolatility,
        type,
        dividendYield
      ).price,
      isCurrent: volatilityIndex === 4 && spotIndex === 5,
    }))
  );
  const prices = rows.flatMap((row) => row.map(({ price }) => price));
  return {
    spots,
    volatilities,
    rows,
    minimumPrice: Math.min(...prices),
    maximumPrice: Math.max(...prices),
  };
}
