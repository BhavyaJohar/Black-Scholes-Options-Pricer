import type { OptionContractSnapshot } from './marketDataClient';
import { impliedVolatility } from '../utils/pricing';

export interface AnalyzedOptionContract extends OptionContractSnapshot {
  daysToExpiration: number;
  moneyness?: number;
  spread?: number;
  spreadPercent?: number;
  modelImpliedVolatility?: number;
  ivDifference?: number;
}

export interface OptionChainAnalyticsInput {
  valuationDate?: Date;
  riskFreeRate?: number;
  dividendYield?: number;
}

const MILLISECONDS_PER_DAY = 86_400_000;

/** Adds quote-quality and independent European-equivalent IV diagnostics. */
export function analyzeOptionChain(
  contracts: OptionContractSnapshot[],
  {
    valuationDate = new Date(),
    riskFreeRate = 0.03,
    dividendYield = 0,
  }: OptionChainAnalyticsInput = {}
): AnalyzedOptionContract[] {
  return contracts.flatMap((contract) => {
    const expiration = new Date(`${contract.expirationDate}T20:00:00.000Z`);
    const daysToExpiration = Math.max(
      0,
      Math.ceil((expiration.getTime() - valuationDate.getTime()) / MILLISECONDS_PER_DAY)
    );
    const spread = contract.bid !== undefined && contract.ask !== undefined && contract.ask >= contract.bid
      ? contract.ask - contract.bid
      : undefined;
    const spreadPercent = spread !== undefined && contract.midpoint !== undefined && contract.midpoint > 0
      ? spread / contract.midpoint
      : undefined;
    let modelImpliedVolatility: number | undefined;
    const underlyingPrice = contract.underlyingPrice;
    if (
      underlyingPrice !== undefined
      && underlyingPrice > 0
      && contract.midpoint !== undefined
      && contract.midpoint > 0
      && daysToExpiration > 0
    ) {
      try {
        modelImpliedVolatility = impliedVolatility(
          contract.midpoint,
          underlyingPrice,
          contract.strikePrice,
          daysToExpiration / 365,
          riskFreeRate,
          contract.contractType,
          dividendYield
        ).volatility;
      } catch {
        // Crossed/stale quotes can violate no-arbitrage bounds; preserve the row
        // and omit the diagnostic instead of presenting a fabricated IV.
      }
    }

    return [{
      ...contract,
      daysToExpiration,
      moneyness: underlyingPrice === undefined ? undefined : underlyingPrice / contract.strikePrice,
      spread,
      spreadPercent,
      modelImpliedVolatility,
      ivDifference: modelImpliedVolatility !== undefined && contract.impliedVolatility !== undefined
        ? modelImpliedVolatility - contract.impliedVolatility
        : undefined,
    }];
  });
}
