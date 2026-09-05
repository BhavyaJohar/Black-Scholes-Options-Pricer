'use client';

import { useEffect, useMemo, useState } from 'react';
import PayoffDiagram from './components/PayoffDiagram';
import OptionPriceHeatmap from './components/OptionPriceHeatmap';
import TerminalFooter from './components/TerminalFooter';
import TerminalHeader from './components/TerminalHeader';

interface FormData {
  ticker: string;
  spotPrice: string;
  strikePrice: string;
  optionType: 'call' | 'put';
  expiration: string;
  volatility: string;
  riskFreeRate: string;
  dividendYield: string;
  exerciseStyle: 'european' | 'american';
}

interface PricingResult {
  price: number;
  binomialPrice: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

const DEFAULT_FORM_DATA: FormData = {
  ticker: '',
  spotPrice: '100',
  strikePrice: '100',
  optionType: 'call',
  expiration: '30',
  volatility: '0.30',
  riskFreeRate: '0.03',
  dividendYield: '0',
  exerciseStyle: 'european',
};

const INPUT_CLASSES = 'mt-1 h-10 w-full rounded border border-[#303c47] bg-[#080c10] px-3 font-mono text-sm text-white outline-none transition focus:border-[#38d9a9] focus:ring-1 focus:ring-[#38d9a9] disabled:cursor-not-allowed disabled:opacity-50';
const LABEL_CLASSES = 'text-xs font-medium text-[#8b98a5]';

function apiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return fallback;
  const error = (payload as { error: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

function readSavedForm(): FormData {
  const saved = localStorage.getItem('options_form_data');
  if (!saved) return DEFAULT_FORM_DATA;
  try {
    return { ...DEFAULT_FORM_DATA, ...JSON.parse(saved) } as FormData;
  } catch {
    localStorage.removeItem('options_form_data');
    return DEFAULT_FORM_DATA;
  }
}

export default function Home() {
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [marketState, setMarketState] = useState<'manual' | 'loading' | 'delayed'>('manual');
  const [marketError, setMarketError] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const saved = readSavedForm();
    setFormData({
      ...saved,
      ticker: parameters.get('ticker') ?? saved.ticker,
      spotPrice: parameters.get('spot') ?? saved.spotPrice,
      strikePrice: parameters.get('strike') ?? saved.strikePrice,
      expiration: parameters.get('days') ?? saved.expiration,
      volatility: parameters.get('volatility') ?? saved.volatility,
      optionType: parameters.get('type') === 'put' ? 'put' : saved.optionType,
      exerciseStyle: parameters.get('style') === 'american' ? 'american' : saved.exerciseStyle,
    });
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated) localStorage.setItem('options_form_data', JSON.stringify(formData));
  }, [formData, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !formData.ticker) {
      setMarketState('manual');
      setMarketError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMarketState('loading');
      setMarketError(null);
      try {
        const response = await fetch(`/api/stocks?ticker=${encodeURIComponent(formData.ticker)}`, {
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(payload, 'Quote request failed'));
        if (typeof payload !== 'object' || payload === null || !('price' in payload)) {
          throw new Error('Quote response did not contain a price');
        }
        const price = Number((payload as { price: unknown }).price);
        if (!Number.isFinite(price) || price <= 0) throw new Error('Quote response contained an invalid price');
        setFormData((previous) => ({ ...previous, spotPrice: price.toFixed(2) }));
        setMarketState('delayed');
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMarketState('manual');
        setMarketError(error instanceof Error ? error.message : 'Quote request failed');
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [formData.ticker, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    const spot = Number(formData.spotPrice);
    const strike = Number(formData.strikePrice);
    const days = Number(formData.expiration);
    const volatility = Number(formData.volatility);
    const rate = Number(formData.riskFreeRate);
    const dividendYield = Number(formData.dividendYield);
    if (![spot, strike, days, volatility, rate, dividendYield].every(Number.isFinite)) return;

    const controller = new AbortController();
    fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        S: spot,
        K: strike,
        T: days,
        r: rate,
        sigma: volatility,
        q: dividendYield,
        type: formData.optionType,
        position: 'long',
        steps: 250,
        exerciseStyle: formData.exerciseStyle,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(payload, 'Pricing request failed'));
        return payload as PricingResult;
      })
      .then((result) => {
        setPricing(result);
        setPricingError(null);
        localStorage.setItem('options_results', JSON.stringify({ ...result, timestamp: new Date().toISOString() }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPricing(null);
        setPricingError(error instanceof Error ? error.message : 'Pricing request failed');
      });
    return () => controller.abort();
  }, [formData, isHydrated]);

  const payoffData = useMemo(() => {
    const strike = Number(formData.strikePrice) || 0;
    const premium = pricing?.price ?? 0;
    const lower = Math.max(0, strike - Math.max(50, strike * 0.5));
    const upper = strike + Math.max(50, strike * 0.5);
    const step = (upper - lower) / 50;
    return Array.from({ length: 51 }, (_, index) => {
      const price = lower + index * step;
      const payoff = formData.optionType === 'call'
        ? Math.max(0, price - strike)
        : Math.max(0, strike - price);
      return {
        price: Number(price.toFixed(2)),
        payoff: Number(payoff.toFixed(2)),
        profitLoss: Number((payoff - premium).toFixed(2)),
      };
    });
  }, [formData.optionType, formData.strikePrice, pricing?.price]);

  const handleInput = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormData((previous) => ({
      ...previous,
      [name]: name === 'ticker' ? value.toUpperCase() : value,
    }));
  };

  const modelDifference = pricing ? pricing.binomialPrice - pricing.price : undefined;
  const spot = Number(formData.spotPrice);
  const strike = Number(formData.strikePrice);
  const moneyness = Number.isFinite(spot) && Number.isFinite(strike) && strike > 0 ? spot / strike : undefined;
  const greeks = [
    ['Delta', pricing?.delta, '∂V / ∂S'],
    ['Gamma', pricing?.gamma, '∂²V / ∂S²'],
    ['Theta', pricing?.theta, 'per calendar day'],
    ['Vega', pricing?.vega, 'per volatility point'],
    ['Rho', pricing?.rho, 'per rate point'],
  ] as const;

  return (
    <main className="min-h-screen bg-[#080c10] text-[#e6edf3]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-8">
        <TerminalHeader
          active="pricer"
          eyebrow="Model workspace"
          title="Options Pricing Workbench"
          description="Black-Scholes-Merton analytics and a 250-step CRR lattice with transparent inputs and model comparison."
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <section className="overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
            <div className="flex items-center justify-between border-b border-[#26303a] px-4 py-3">
              <div>
                <h2 className="font-medium">Contract inputs</h2>
                <p className="text-xs text-[#71808d]">Decimal rates · calendar-day expiry · per-share prices</p>
              </div>
              <span className="rounded border border-[#26303a] bg-[#10171e] px-2 py-1 font-mono text-[11px] text-[#8b98a5]">
                {formData.optionType.toUpperCase()} · {formData.exerciseStyle.toUpperCase()}
              </span>
            </div>

            <div className="grid gap-x-4 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={LABEL_CLASSES}>
                Underlying ticker <span className="text-[#60707e]">(optional)</span>
                <div className="relative">
                  <input name="ticker" value={formData.ticker} onChange={handleInput} className={INPUT_CLASSES} placeholder="AAPL" maxLength={10} />
                  {marketState === 'loading' && <span className="absolute right-3 top-4 h-3 w-3 animate-spin rounded-full border border-[#38d9a9] border-t-transparent" aria-label="Loading delayed quote" />}
                </div>
              </label>
              <label className={LABEL_CLASSES}>
                Model spot
                <input name="spotPrice" type="number" min="0.01" step="0.01" value={formData.spotPrice} onChange={handleInput} className={INPUT_CLASSES} />
              </label>
              <label className={LABEL_CLASSES}>
                Strike
                <input name="strikePrice" type="number" min="0.01" step="0.01" value={formData.strikePrice} onChange={handleInput} className={INPUT_CLASSES} />
              </label>
              <label className={LABEL_CLASSES}>
                Days to expiration
                <input name="expiration" type="number" min="1" max="3650" step="1" value={formData.expiration} onChange={handleInput} className={INPUT_CLASSES} />
              </label>
              <label className={LABEL_CLASSES}>
                Volatility σ
                <input name="volatility" type="number" min="0.0001" max="5" step="0.01" value={formData.volatility} onChange={handleInput} className={INPUT_CLASSES} />
              </label>
              <label className={LABEL_CLASSES}>
                Risk-free rate r
                <input name="riskFreeRate" type="number" step="0.001" value={formData.riskFreeRate} onChange={handleInput} className={INPUT_CLASSES} />
              </label>
              <label className={LABEL_CLASSES}>
                Dividend yield q
                <input name="dividendYield" type="number" step="0.001" value={formData.dividendYield} onChange={handleInput} className={INPUT_CLASSES} />
              </label>
              <label className={LABEL_CLASSES}>
                Option side
                <select name="optionType" value={formData.optionType} onChange={handleInput} className={INPUT_CLASSES}>
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </label>
              <label className={LABEL_CLASSES}>
                Tree exercise style
                <select name="exerciseStyle" value={formData.exerciseStyle} onChange={handleInput} className={INPUT_CLASSES}>
                  <option value="european">European</option>
                  <option value="american">American</option>
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-[#26303a] bg-[#0a1015] px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <p className={marketError ? 'text-[#e8c45d]' : 'text-[#71808d]'}>
                {marketError ?? (marketState === 'delayed' ? 'Model spot synchronized to the delayed provider midpoint.' : 'Manual spot mode. Add a ticker to synchronize a delayed quote.')}
              </p>
              <p className="font-mono text-[#60707e]">S/K {moneyness === undefined ? '—' : moneyness.toFixed(4)}</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
            <div className="border-b border-[#26303a] px-4 py-3">
              <h2 className="font-medium">Valuation output</h2>
              <p className="text-xs text-[#71808d]">European closed form versus selected CRR exercise policy</p>
            </div>
            {pricingError ? (
              <div role="alert" className="m-4 rounded border border-[#713b3b] bg-[#2a1414] px-4 py-3 text-sm text-[#ffb4b4]">{pricingError}</div>
            ) : (
              <div className="divide-y divide-[#26303a]">
                <div className="grid grid-cols-2 gap-px bg-[#26303a]">
                  <div className="bg-[#0d1319] p-5">
                    <p className="text-[11px] uppercase tracking-wider text-[#60707e]">Black-Scholes</p>
                    <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-[#38d9a9]">${pricing?.price.toFixed(4) ?? '—'}</p>
                  </div>
                  <div className="bg-[#0d1319] p-5">
                    <p className="text-[11px] uppercase tracking-wider text-[#60707e]">CRR lattice</p>
                    <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-[#74c0fc]">${pricing?.binomialPrice.toFixed(4) ?? '—'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 px-5 py-4 text-sm">
                  <div>
                    <p className="text-xs text-[#60707e]">Model difference</p>
                    <p className="mt-1 font-mono tabular-nums text-white">{modelDifference === undefined ? '—' : `${modelDifference >= 0 ? '+' : ''}${modelDifference.toFixed(5)}`}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#60707e]">Lattice depth</p>
                    <p className="mt-1 font-mono text-white">250 steps</p>
                  </div>
                </div>
                <div className="px-5 py-4 text-xs leading-5 text-[#71808d]">
                  BSM is European-equivalent. The lattice applies the selected exercise policy and continuous dividend yield.
                </div>
              </div>
            )}
          </section>
        </div>

        <section aria-label="Option Greeks" className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#26303a] bg-[#26303a] sm:grid-cols-5">
          {greeks.map(([label, value, detail]) => (
            <div key={label} className="bg-[#0d1319] px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#60707e]">{label}</p>
              <p className="mt-1 font-mono text-xl tabular-nums text-white">{value === undefined ? '—' : value.toFixed(4)}</p>
              <p className="mt-1 text-[10px] text-[#60707e]">{detail}</p>
            </div>
          ))}
        </section>

        <OptionPriceHeatmap
          spot={spot}
          strike={strike}
          daysToExpiration={Number(formData.expiration)}
          rate={Number(formData.riskFreeRate)}
          volatility={Number(formData.volatility)}
          dividendYield={Number(formData.dividendYield)}
          optionType={formData.optionType}
        />

        <div className="mt-6">
          <PayoffDiagram
            data={payoffData}
            currentPrice={Number.isFinite(spot) ? spot : null}
            strikePrice={Number.isFinite(strike) ? strike : 0}
            optionPrice={pricing?.price ?? null}
            optionType={formData.optionType}
          />
        </div>

        <TerminalFooter />
      </div>
    </main>
  );
}
