'use client';

import { useMemo, useState } from 'react';
import TerminalFooter from '../components/TerminalFooter';
import TerminalHeader from '../components/TerminalHeader';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ChainContract {
  ticker: string;
  contractType: 'call' | 'put';
  exerciseStyle: 'unknown';
  expirationDate: string;
  strikePrice: number;
  sharesPerContract: number;
  bid?: number;
  ask?: number;
  midpoint?: number;
  quoteTimeframe?: string;
  impliedVolatility?: number;
  modelImpliedVolatility?: number;
  ivDifference?: number;
  spreadPercent?: number;
  openInterest?: number;
  volume?: number;
  underlyingPrice?: number;
  underlyingTimeframe?: string;
  daysToExpiration: number;
  moneyness?: number;
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
}

interface ChainResponse {
  ticker: string;
  underlyingPrice?: number;
  underlyingTimeframe?: string;
  contracts: ChainContract[];
  meta: {
    source: string;
    dataUpdatedAt?: string;
    rateLimit: { consumed?: number; remaining?: number; limit?: number; resetAt?: string };
    strikeLimit: number;
    retrievedAt: string;
    methodology: string;
  };
}

function formatNumber(value: number | undefined, digits = 2): string {
  return value === undefined ? '—' : value.toFixed(digits);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function apiErrorMessage(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return 'The market-data request failed';
  }
  const error = (payload as { error: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'The market-data request failed';
}

function nextMonthlyExpiration(): string {
  const now = new Date();
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firstFridayOffset = (5 - candidate.getUTCDay() + 7) % 7;
  candidate.setUTCDate(1 + firstFridayOffset + 14);
  if (candidate.getTime() <= now.getTime() + 7 * 86_400_000) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1, 1);
    const nextOffset = (5 - candidate.getUTCDay() + 7) % 7;
    candidate.setUTCDate(1 + nextOffset + 14);
  }
  return candidate.toISOString().slice(0, 10);
}

export default function MarketPage() {
  const [ticker, setTicker] = useState('AAPL');
  const [expiration, setExpiration] = useState(nextMonthlyExpiration);
  const [contractType, setContractType] = useState<'call' | 'put'>('call');
  const [riskFreeRate, setRiskFreeRate] = useState('0.03');
  const [dividendYield, setDividendYield] = useState('0');
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const visibleContracts = useMemo(() => {
    if (!chain) return [];
    if (!chain.underlyingPrice) {
      return [...chain.contracts].slice(0, 60).sort((left, right) => left.strikePrice - right.strikePrice);
    }
    return [...chain.contracts]
      .sort((left, right) =>
        Math.abs(left.strikePrice - chain.underlyingPrice!)
          - Math.abs(right.strikePrice - chain.underlyingPrice!)
      )
      .slice(0, 60)
      .sort((left, right) => left.strikePrice - right.strikePrice);
  }, [chain]);

  const smileData = visibleContracts.map((contract) => ({
    strike: contract.strikePrice,
    providerIv: contract.impliedVolatility === undefined
      ? undefined
      : contract.impliedVolatility * 100,
    midpointIv: contract.modelImpliedVolatility === undefined
      ? undefined
      : contract.modelImpliedVolatility * 100,
  }));
  const medianIv = median(chain?.contracts.flatMap((contract) =>
    contract.impliedVolatility === undefined ? [] : [contract.impliedVolatility]
  ) ?? []);
  const medianSpread = median(chain?.contracts.flatMap((contract) =>
    contract.spreadPercent === undefined ? [] : [contract.spreadPercent]
  ) ?? []);

  const loadChain = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const parameters = new URLSearchParams({
        ticker,
        type: contractType,
        rate: riskFreeRate,
        dividendYield,
      });
      parameters.set('expiration', expiration);
      const response = await fetch(`/api/options?${parameters}`);
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload));
      setChain(payload as ChainResponse);
    } catch (requestError: unknown) {
      setChain(null);
      setError(requestError instanceof Error ? requestError.message : 'The market-data request failed');
    } finally {
      setIsLoading(false);
    }
  };

  const openInPricer = (contract: ChainContract) => {
    if (contract.underlyingPrice === undefined) return;
    const parameters = new URLSearchParams({
      spot: String(contract.underlyingPrice),
      strike: String(contract.strikePrice),
      days: String(contract.daysToExpiration),
      volatility: String(contract.modelImpliedVolatility ?? contract.impliedVolatility ?? 0.3),
      type: contract.contractType,
      style: 'european',
      ticker: chain?.ticker ?? ticker,
    });
    window.location.assign(`/?${parameters}`);
  };

  return (
    <main className="min-h-screen bg-[#080c10] text-[#e6edf3]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-8">
        <TerminalHeader
          active="market"
          eyebrow="Delayed market data"
          title="Options Surface Monitor"
          description="Quote quality, volatility smile, and independent midpoint-IV diagnostics across 40 near-the-money strikes."
        />

        <form onSubmit={loadChain} className="mb-6 grid gap-3 rounded-lg border border-[#26303a] bg-[#0d1319] p-4 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] md:items-end">
          <label className="text-xs font-medium text-[#8b98a5]">
            Underlying
            <input aria-label="Underlying ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} className="mt-1 h-10 w-full rounded border border-[#303c47] bg-[#080c10] px-3 font-mono text-sm text-white outline-none focus:border-[#38d9a9] focus:ring-1 focus:ring-[#38d9a9]" required />
          </label>
          <label className="text-xs font-medium text-[#8b98a5]">
            Expiration
            <input aria-label="Expiration date" type="date" value={expiration} onChange={(event) => setExpiration(event.target.value)} className="mt-1 h-10 w-full rounded border border-[#303c47] bg-[#080c10] px-3 font-mono text-sm text-white outline-none focus:border-[#38d9a9] focus:ring-1 focus:ring-[#38d9a9]" required />
          </label>
          <label className="text-xs font-medium text-[#8b98a5]">
            Contract
            <select aria-label="Contract type" value={contractType} onChange={(event) => setContractType(event.target.value as 'call' | 'put')} className="mt-1 h-10 w-full rounded border border-[#303c47] bg-[#080c10] px-3 text-sm text-white outline-none focus:border-[#38d9a9] focus:ring-1 focus:ring-[#38d9a9]">
              <option value="call">Calls</option>
              <option value="put">Puts</option>
            </select>
          </label>
          <label className="text-xs font-medium text-[#8b98a5]">
            Risk-free rate (decimal)
            <input aria-label="Risk-free rate" type="number" step="0.001" value={riskFreeRate} onChange={(event) => setRiskFreeRate(event.target.value)} className="mt-1 h-10 w-full rounded border border-[#303c47] bg-[#080c10] px-3 font-mono text-sm text-white outline-none focus:border-[#38d9a9] focus:ring-1 focus:ring-[#38d9a9]" />
          </label>
          <label className="text-xs font-medium text-[#8b98a5]">
            Dividend yield (decimal)
            <input aria-label="Dividend yield" type="number" step="0.001" value={dividendYield} onChange={(event) => setDividendYield(event.target.value)} className="mt-1 h-10 w-full rounded border border-[#303c47] bg-[#080c10] px-3 font-mono text-sm text-white outline-none focus:border-[#38d9a9] focus:ring-1 focus:ring-[#38d9a9]" />
          </label>
          <button disabled={isLoading} className="h-10 rounded bg-[#38d9a9] px-5 text-sm font-semibold text-[#06110d] hover:bg-[#63e6be] focus:outline-none focus:ring-2 focus:ring-white disabled:cursor-wait disabled:opacity-60">
            {isLoading ? 'Loading…' : 'Load chain'}
          </button>
        </form>

        {error && (
          <div role="alert" className="mb-6 rounded-lg border border-[#713b3b] bg-[#2a1414] px-4 py-3 text-sm text-[#ffb4b4]">
            <p className="font-medium">Market data unavailable</p>
            <p className="mt-1 text-[#d99b9b]">{error}</p>
          </div>
        )}

        {!chain && !error && !isLoading && (
          <section className="grid min-h-[420px] place-items-center rounded-lg border border-dashed border-[#303c47] bg-[#0b1015] p-8 text-center">
            <div className="max-w-md">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#60707e]">Awaiting query</p>
              <h2 className="mt-3 text-xl font-medium">Inspect a delayed option chain</h2>
              <p className="mt-2 text-sm leading-6 text-[#8b98a5]">Choose an expiration and inspect up to 40 near-the-money contracts. AAPL works without a token; other symbols use a free Market Data token.</p>
            </div>
          </section>
        )}

        {chain && (
          <div className="space-y-6">
            <section aria-label="Chain summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#26303a] bg-[#26303a] lg:grid-cols-5">
              {[
                ['Spot', chain.underlyingPrice === undefined ? '—' : `$${chain.underlyingPrice.toFixed(2)}`],
                ['Contracts', String(chain.contracts.length)],
                ['Median vendor IV', medianIv === undefined ? '—' : `${(medianIv * 100).toFixed(2)}%`],
                ['Median spread', medianSpread === undefined ? '—' : `${(medianSpread * 100).toFixed(2)}%`],
                ['Feed', chain.underlyingTimeframe ?? 'Plan dependent'],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#0d1319] px-4 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#60707e]">{label}</p>
                  <p className="mt-1 font-mono text-lg tabular-nums text-white">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-[#26303a] bg-[#0d1319] p-4">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-medium">Volatility smile</h2>
                  <p className="text-xs text-[#71808d]">Provider IV vs. locally inverted quote-midpoint IV</p>
                </div>
                <p className="font-mono text-xs text-[#60707e]">{visibleContracts.length} nearest-to-money contracts</p>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={smileData} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="#202a33" strokeDasharray="3 3" />
                    <XAxis dataKey="strike" stroke="#71808d" tick={{ fontSize: 11 }} type="number" domain={['dataMin', 'dataMax']} />
                    <YAxis stroke="#71808d" tick={{ fontSize: 11 }} unit="%" domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ background: '#111820', border: '1px solid #303c47', borderRadius: 6 }} labelFormatter={(value) => `Strike $${value}`} formatter={(value) => [`${Number(value).toFixed(2)}%`]} />
                    <Legend />
                    <Line dataKey="providerIv" name="Provider IV" stroke="#38d9a9" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    <Line dataKey="midpointIv" name="Midpoint IV" stroke="#74c0fc" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#26303a] px-4 py-3">
                <div>
                  <h2 className="font-medium">Contract diagnostics</h2>
                  <p className="text-xs text-[#71808d]">Click a row to transfer its market inputs into the pricing model.</p>
                </div>
                <span className="rounded border border-[#26303a] bg-[#10171e] px-2 py-1 text-xs text-[#8b98a5]">{chain.meta.strikeLimit} nearest strikes · credit-aware</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse text-right font-mono text-xs tabular-nums">
                  <thead className="bg-[#10171e] text-[10px] uppercase tracking-wider text-[#71808d]">
                    <tr>
                      {['Expiry', 'Strike', 'Bid', 'Mid', 'Ask', 'Spread', 'Vendor IV', 'Mid IV', 'IV Δ', 'Delta', 'OI', 'Volume'].map((heading) => (
                        <th key={heading} className="border-b border-[#26303a] px-3 py-2.5 font-medium first:text-left">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleContracts.map((contract) => (
                      <tr key={contract.ticker} tabIndex={contract.underlyingPrice === undefined ? -1 : 0} onClick={() => openInPricer(contract)} onKeyDown={(event) => { if (event.key === 'Enter') openInPricer(contract); }} className={contract.underlyingPrice === undefined ? 'border-b border-[#1d262e]' : 'cursor-pointer border-b border-[#1d262e] hover:bg-[#142028] focus:bg-[#142028] focus:outline-none'}>
                        <td className="px-3 py-2.5 text-left text-[#a9b4be]">{contract.expirationDate}</td>
                        <td className={contract.moneyness !== undefined && Math.abs(contract.moneyness - 1) < 0.01 ? 'px-3 py-2.5 font-semibold text-[#38d9a9]' : 'px-3 py-2.5 text-white'}>{formatNumber(contract.strikePrice)}</td>
                        <td className="px-3 py-2.5 text-[#9aa7b3]">{formatNumber(contract.bid)}</td>
                        <td className="px-3 py-2.5 text-white">{formatNumber(contract.midpoint)}</td>
                        <td className="px-3 py-2.5 text-[#9aa7b3]">{formatNumber(contract.ask)}</td>
                        <td className="px-3 py-2.5 text-[#e8c45d]">{contract.spreadPercent === undefined ? '—' : `${(contract.spreadPercent * 100).toFixed(1)}%`}</td>
                        <td className="px-3 py-2.5 text-[#38d9a9]">{contract.impliedVolatility === undefined ? '—' : `${(contract.impliedVolatility * 100).toFixed(2)}%`}</td>
                        <td className="px-3 py-2.5 text-[#74c0fc]">{contract.modelImpliedVolatility === undefined ? '—' : `${(contract.modelImpliedVolatility * 100).toFixed(2)}%`}</td>
                        <td className="px-3 py-2.5 text-[#9aa7b3]">{contract.ivDifference === undefined ? '—' : `${(contract.ivDifference * 10_000).toFixed(0)}bp`}</td>
                        <td className="px-3 py-2.5 text-[#9aa7b3]">{formatNumber(contract.greeks?.delta, 3)}</td>
                        <td className="px-3 py-2.5 text-[#9aa7b3]">{formatNumber(contract.openInterest, 0)}</td>
                        <td className="px-3 py-2.5 text-[#9aa7b3]">{formatNumber(contract.volume, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleContracts.length === 0 && <p className="p-8 text-center text-sm text-[#71808d]">No contracts were returned for this expiration and contract type.</p>}
              </div>
            </section>

            <footer className="flex flex-col gap-1 border-t border-[#26303a] py-4 text-xs text-[#60707e] sm:flex-row sm:justify-between">
              <p>{chain.meta.methodology}</p>
              <p className="font-mono">{chain.meta.source} · Data as of {chain.meta.dataUpdatedAt ? new Date(chain.meta.dataUpdatedAt).toLocaleString() : 'provider snapshot'} · {chain.meta.rateLimit.remaining === undefined ? 'credits not reported' : `${chain.meta.rateLimit.remaining} credits remaining`}</p>
            </footer>
          </div>
        )}
        <TerminalFooter />
      </div>
    </main>
  );
}
