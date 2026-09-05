'use client';

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { simulateTerminalReturns } from '@/lib/monteCarlo';
import EfficientFrontierChart, {
  type EfficientFrontierViewModel,
} from '../components/EfficientFrontierChart';
import TerminalFooter from '../components/TerminalFooter';
import TerminalHeader from '../components/TerminalHeader';

interface Position {
  id: string;
  ticker: string;
  quantity: number;
  averagePrice: number;
  positionType: 'long' | 'short';
}

interface PortfolioMetrics {
  totalReturn: number;
  alpha: number;
  beta: number;
  sharpeRatio: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  valueAtRisk95: number;
  observations: number;
}

interface ApiResult extends PortfolioMetrics {
  dailyReturns: number[];
  efficientFrontier: EfficientFrontierViewModel;
}

interface FormData {
  ticker: string;
  quantity: string;
  averagePrice: string;
  positionType: 'long' | 'short';
}

interface CachedResults {
  metrics: PortfolioMetrics;
  dailyReturns: number[];
  efficientFrontier: EfficientFrontierViewModel;
  timestamp: string;
}

const EMPTY_METRICS: PortfolioMetrics = {
  totalReturn: 0,
  alpha: 0,
  beta: 0,
  sharpeRatio: 0,
  annualizedVolatility: 0,
  maxDrawdown: 0,
  valueAtRisk95: 0,
  observations: 0,
};

const COLORS = ['#38d9a9', '#74c0fc', '#e8c45d', '#b197fc', '#ff8585', '#8b98a5'];
const INPUT_CLASSES = 'mt-1 h-10 w-full rounded border border-[#303c47] bg-[#080c10] px-3 font-mono text-sm text-white outline-none transition focus:border-[#38d9a9] focus:ring-1 focus:ring-[#38d9a9]';
const LABEL_CLASSES = 'text-xs font-medium text-[#8b98a5]';

function apiErrorMessage(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return 'Portfolio analysis failed';
  }
  const error = (payload as { error: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Portfolio analysis failed';
}

export default function Portfolio() {
  const [formData, setFormData] = useState<FormData>({
    ticker: '',
    quantity: '',
    averagePrice: '',
    positionType: 'long',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PortfolioMetrics>(EMPTY_METRICS);
  const [dailyReturns, setDailyReturns] = useState<number[]>([]);
  const [efficientFrontier, setEfficientFrontier] = useState<EfficientFrontierViewModel | null>(null);
  const [simulation, setSimulation] = useState<{ p5: number; p50: number; p95: number; returns: number[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const storedPositions = localStorage.getItem('portfolio_positions');
    if (storedPositions) {
      try {
        setPositions(JSON.parse(storedPositions) as Position[]);
      } catch {
        localStorage.removeItem('portfolio_positions');
      }
    }
    const cached = localStorage.getItem('portfolio_analysis_results');
    if (cached) {
      try {
        const result = JSON.parse(cached) as CachedResults;
        if (Date.now() - new Date(result.timestamp).getTime() < 60 * 60 * 1_000) {
          setMetrics({ ...EMPTY_METRICS, ...result.metrics });
          setDailyReturns(result.dailyReturns);
          setEfficientFrontier(result.efficientFrontier ?? null);
        } else {
          localStorage.removeItem('portfolio_analysis_results');
        }
      } catch {
        localStorage.removeItem('portfolio_analysis_results');
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated) localStorage.setItem('portfolio_positions', JSON.stringify(positions));
  }, [isHydrated, positions]);

  useEffect(() => {
    if (dailyReturns.length === 0) {
      setSimulation(null);
      return;
    }
    setIsSimulating(true);
    try {
      setSimulation(simulateTerminalReturns(dailyReturns));
    } catch (simulationError: unknown) {
      setSimulation(null);
      setError(simulationError instanceof Error ? simulationError.message : 'Simulation failed');
    } finally {
      setIsSimulating(false);
    }
  }, [dailyReturns]);

  const histogram = useMemo(() => {
    if (!simulation || simulation.returns.length === 0) return [];
    const bins = 20;
    const minimum = Math.min(...simulation.returns);
    const maximum = Math.max(...simulation.returns);
    const width = (maximum - minimum) / bins || 0.01;
    return Array.from({ length: bins }, (_, index) => {
      const lower = minimum + index * width;
      const upper = lower + width;
      const count = simulation.returns.filter((value) =>
        index === bins - 1 ? value >= lower && value <= upper : value >= lower && value < upper
      ).length;
      return { bin: `${(lower * 100).toFixed(0)}%`, count };
    });
  }, [simulation]);

  const grossExposure = positions.reduce((sum, position) => sum + position.quantity * position.averagePrice, 0);
  const netExposure = positions.reduce((sum, position) => {
    const direction = position.positionType === 'long' ? 1 : -1;
    return sum + direction * position.quantity * position.averagePrice;
  }, 0);

  const handleInput = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setError(null);
    setFormData((previous) => ({
      ...previous,
      [name]: name === 'ticker' ? value.toUpperCase() : value,
    }));
  };

  const addPosition = () => {
    const quantity = Number(formData.quantity);
    const averagePrice = Number(formData.averagePrice);
    if (!/^[A-Z][A-Z0-9./-]{0,9}$/.test(formData.ticker) || quantity <= 0 || averagePrice <= 0) {
      setError('Enter a valid ticker, positive quantity, and positive average price.');
      return;
    }
    setPositions((previous) => [...previous, {
      id: uuidv4(),
      ticker: formData.ticker,
      quantity,
      averagePrice,
      positionType: formData.positionType,
    }]);
    setFormData({ ticker: '', quantity: '', averagePrice: '', positionType: 'long' });
  };

  const analyzePortfolio = async (event: React.FormEvent) => {
    event.preventDefault();
    if (positions.length === 0) {
      setError('Add at least one position before running the analysis.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload));
      const result = payload as ApiResult;
      const nextMetrics: PortfolioMetrics = {
        totalReturn: result.totalReturn,
        alpha: result.alpha,
        beta: result.beta,
        sharpeRatio: result.sharpeRatio,
        annualizedVolatility: result.annualizedVolatility,
        maxDrawdown: result.maxDrawdown,
        valueAtRisk95: result.valueAtRisk95,
        observations: result.observations,
      };
      setMetrics(nextMetrics);
      setDailyReturns(result.dailyReturns);
      setEfficientFrontier(result.efficientFrontier);
      localStorage.setItem('portfolio_analysis_results', JSON.stringify({
        metrics: nextMetrics,
        dailyReturns: result.dailyReturns,
        efficientFrontier: result.efficientFrontier,
        timestamp: new Date().toISOString(),
      } satisfies CachedResults));
    } catch (analysisError: unknown) {
      setError(analysisError instanceof Error ? analysisError.message : 'Portfolio analysis failed');
      setDailyReturns([]);
      setEfficientFrontier(null);
    } finally {
      setIsLoading(false);
    }
  };

  const metricRows = [
    ['Total return', `${(metrics.totalReturn * 100).toFixed(2)}%`, 'cost-basis weighted', 'neutral'],
    ['CAPM alpha', `${(metrics.alpha * 100).toFixed(2)}%`, 'annualized vs SPY', 'neutral'],
    ['Beta', metrics.beta.toFixed(2), 'market sensitivity', 'neutral'],
    ['Sharpe', metrics.sharpeRatio.toFixed(2), 'annualized excess return', 'neutral'],
    ['Volatility', `${(metrics.annualizedVolatility * 100).toFixed(2)}%`, 'annualized, √252', 'neutral'],
    ['Max drawdown', `${(metrics.maxDrawdown * 100).toFixed(2)}%`, 'peak-to-trough', 'risk'],
    ['Historical VaR', `${(metrics.valueAtRisk95 * 100).toFixed(2)}%`, 'one-day, 95%', 'warning'],
    ['Observations', String(metrics.observations), 'aligned sessions', 'neutral'],
  ] as const;

  return (
    <main className="min-h-screen bg-[#080c10] text-[#e6edf3]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-8">
        <TerminalHeader
          active="portfolio"
          eyebrow="Portfolio risk"
          title="Portfolio Risk Monitor"
          description="Aligned return analytics, benchmark attribution, historical downside risk, and reproducible terminal-value simulation."
        />

        <form onSubmit={analyzePortfolio} noValidate>
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
            <section className="overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
              <div className="border-b border-[#26303a] px-4 py-3">
                <h2 className="font-medium">Add position</h2>
                <p className="text-xs text-[#71808d]">Long and short equity exposures</p>
              </div>
              <div className="space-y-4 p-4">
                <label className={LABEL_CLASSES}>
                  Ticker
                  <input name="ticker" value={formData.ticker} onChange={handleInput} className={INPUT_CLASSES} placeholder="AAPL" maxLength={10} />
                </label>
                <label className={LABEL_CLASSES}>
                  Quantity
                  <input name="quantity" type="number" min="0.01" step="0.01" value={formData.quantity} onChange={handleInput} className={INPUT_CLASSES} placeholder="100" />
                </label>
                <label className={LABEL_CLASSES}>
                  Average price
                  <input name="averagePrice" type="number" min="0.01" step="0.01" value={formData.averagePrice} onChange={handleInput} className={INPUT_CLASSES} placeholder="150.00" />
                </label>
                <label className={LABEL_CLASSES}>
                  Direction
                  <select name="positionType" value={formData.positionType} onChange={handleInput} className={INPUT_CLASSES}>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                </label>
                <button type="button" onClick={addPosition} className="h-10 w-full rounded border border-[#2f8067] bg-[#123329] text-sm font-semibold text-[#63e6be] hover:bg-[#174638] focus:outline-none focus:ring-2 focus:ring-[#38d9a9] disabled:cursor-not-allowed disabled:opacity-40">
                  Add position
                </button>
              </div>
            </section>

            <section className="min-h-[390px] overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
              <div className="flex items-center justify-between border-b border-[#26303a] px-4 py-3">
                <div>
                  <h2 className="font-medium">Position book</h2>
                  <p className="text-xs text-[#71808d]">Persisted locally in this browser</p>
                </div>
                <span className="font-mono text-xs text-[#60707e]">{positions.length} positions</span>
              </div>
              {positions.length === 0 ? (
                <div className="grid min-h-[320px] place-items-center p-8 text-center">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#60707e]">Empty book</p>
                    <p className="mt-2 text-sm text-[#8b98a5]">Add a position to build an exposure-weighted portfolio.</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-right font-mono text-xs tabular-nums">
                    <thead className="bg-[#10171e] text-[10px] uppercase tracking-wider text-[#71808d]">
                      <tr>
                        <th className="border-b border-[#26303a] px-4 py-2.5 text-left font-medium">Ticker</th>
                        <th className="border-b border-[#26303a] px-3 py-2.5 font-medium">Side</th>
                        <th className="border-b border-[#26303a] px-3 py-2.5 font-medium">Quantity</th>
                        <th className="border-b border-[#26303a] px-3 py-2.5 font-medium">Avg price</th>
                        <th className="border-b border-[#26303a] px-3 py-2.5 font-medium">Exposure</th>
                        <th className="border-b border-[#26303a] px-3 py-2.5 font-medium"><span className="sr-only">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((position) => (
                        <tr key={position.id} className="border-b border-[#1d262e]">
                          <td className="px-4 py-3 text-left font-semibold text-white">{position.ticker}</td>
                          <td className={position.positionType === 'long' ? 'px-3 py-3 text-[#38d9a9]' : 'px-3 py-3 text-[#ff8585]'}>{position.positionType.toUpperCase()}</td>
                          <td className="px-3 py-3 text-[#a9b4be]">{position.quantity.toLocaleString()}</td>
                          <td className="px-3 py-3 text-[#a9b4be]">${position.averagePrice.toFixed(2)}</td>
                          <td className="px-3 py-3 text-white">${(position.quantity * position.averagePrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => setPositions((previous) => previous.filter(({ id }) => id !== position.id))} className="rounded px-2 py-1 text-[#8b98a5] hover:bg-[#2a1414] hover:text-[#ff8585] focus:outline-none focus:ring-2 focus:ring-[#ff8585]" aria-label={`Remove ${position.ticker} position`} title="Remove position">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
              <div className="border-b border-[#26303a] px-4 py-3">
                <h2 className="font-medium">Exposure mix</h2>
                <p className="text-xs text-[#71808d]">Gross capital by position</p>
              </div>
              <div className="h-[270px] p-3">
                {positions.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={positions.map((position) => ({ name: position.ticker, value: position.quantity * position.averagePrice }))} innerRadius="52%" outerRadius="78%" paddingAngle={2} dataKey="value" stroke="none">
                        {positions.map((position, index) => <Cell key={position.id} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #303c47', borderRadius: 6 }} formatter={(value) => [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Exposure']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center text-sm text-[#60707e]">No exposure</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-px border-t border-[#26303a] bg-[#26303a]">
                <div className="bg-[#0d1319] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#60707e]">Gross</p>
                  <p className="mt-1 font-mono text-sm text-white">${grossExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-[#0d1319] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#60707e]">Net</p>
                  <p className="mt-1 font-mono text-sm text-white">${netExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </section>
          </div>

          {error && <div role="alert" className="mt-4 rounded border border-[#713b3b] bg-[#2a1414] px-4 py-3 text-sm text-[#ffb4b4]">{error}</div>}

          <button type="submit" disabled={isLoading || positions.length === 0} className="mt-4 h-11 w-full rounded bg-[#38d9a9] text-sm font-semibold text-[#06110d] hover:bg-[#63e6be] focus:outline-none focus:ring-2 focus:ring-white disabled:cursor-not-allowed disabled:opacity-40">
            {isLoading ? 'Running aligned-history analysis…' : 'Run portfolio analysis'}
          </button>
        </form>

        <section aria-label="Portfolio metrics" className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#26303a] bg-[#26303a] lg:grid-cols-4">
          {metricRows.map(([label, value, detail, tone]) => (
            <div key={label} className="bg-[#0d1319] px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#60707e]">{label}</p>
              <p className={`mt-1 font-mono text-xl tabular-nums ${tone === 'risk' ? 'text-[#ff8585]' : tone === 'warning' ? 'text-[#e8c45d]' : 'text-white'}`}>{isLoading ? '—' : value}</p>
              <p className="mt-1 text-[10px] text-[#60707e]">{detail}</p>
            </div>
          ))}
        </section>

        <EfficientFrontierChart frontier={efficientFrontier} />

        <section className="mt-6 overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
          <div className="flex flex-col gap-1 border-b border-[#26303a] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-medium">Monte Carlo terminal returns</h2>
              <p className="text-xs text-[#71808d]">10,000 seeded paths · 252 sessions · normal log-return model</p>
            </div>
            {simulation && <p className="font-mono text-xs text-[#60707e]">P05 {(simulation.p5 * 100).toFixed(1)}% · P50 {(simulation.p50 * 100).toFixed(1)}% · P95 {(simulation.p95 * 100).toFixed(1)}%</p>}
          </div>
          <div className="h-[280px] p-4">
            {isSimulating ? (
              <div className="grid h-full place-items-center text-sm text-[#8b98a5]">Running deterministic simulation…</div>
            ) : histogram.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogram} margin={{ top: 8, right: 8, bottom: 20, left: 0 }}>
                  <XAxis dataKey="bin" stroke="#71808d" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis stroke="#71808d" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#111820', border: '1px solid #303c47', borderRadius: 6 }} />
                  <Bar dataKey="count" name="Paths" fill="#38d9a9" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-center text-sm text-[#60707e]">Run the portfolio analysis to generate the return distribution.</div>
            )}
          </div>
        </section>

        <TerminalFooter />
      </div>
    </main>
  );
}
