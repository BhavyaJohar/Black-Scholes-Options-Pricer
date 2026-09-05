'use client';

import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
} from 'recharts';

export interface FrontierPoint {
  annualReturn: number;
  annualVolatility: number;
  sharpeRatio: number;
}

interface WeightedFrontierPoint extends FrontierPoint {
  weights: Record<string, number>;
}

export interface EfficientFrontierViewModel {
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

interface ChartDomains {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface ChartReadout {
  label: string;
  point: FrontierPoint;
  exact: boolean;
  x: number;
  y: number;
}

const CHART_MARGIN = { top: 12, right: 20, bottom: 8, left: 4 };
const X_AXIS_HEIGHT = 48;
const Y_AXIS_WIDTH = 64;
const SNAP_RADIUS_PX = 18;

const LEGEND_ITEMS = [
  { label: 'Simulated portfolios', color: '#60707e', type: 'dot' },
  { label: 'Efficient frontier', color: '#38d9a9', type: 'line' },
  { label: 'Capital market line', color: '#e8c45d', type: 'dashed' },
  { label: 'Minimum volatility', color: '#74c0fc', type: 'diamond' },
  { label: 'Maximum Sharpe', color: '#38d9a9', type: 'star' },
  { label: 'Current exposure', color: '#ffffff', type: 'triangle' },
] as const;

function LegendMark({ color, type }: { color: string; type: (typeof LEGEND_ITEMS)[number]['type'] }) {
  if (type === 'line' || type === 'dashed') {
    return <span className={`h-0 w-5 border-t-2 ${type === 'dashed' ? 'border-dashed' : ''}`} style={{ borderColor: color }} />;
  }

  const shape = type === 'diamond' ? 'rotate-45 rounded-[1px]' : type === 'triangle' ? '[clip-path:polygon(50%_0,100%_100%,0_100%)]' : type === 'star' ? '[clip-path:polygon(50%_0,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]' : 'rounded-full';
  return <span className={`h-2.5 w-2.5 ${shape}`} style={{ backgroundColor: color, opacity: type === 'dot' ? 0.65 : 1 }} />;
}

function getChartDomains(frontier: EfficientFrontierViewModel | null): ChartDomains {
  if (!frontier) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

  const points = [
    ...frontier.portfolios,
    ...frontier.frontier,
    ...frontier.capitalMarketLine.map((point) => ({ ...point, sharpeRatio: 0 })),
    frontier.minimumVolatility,
    frontier.maximumSharpe,
    frontier.currentPortfolio,
  ];
  const xMaxRaw = Math.max(...points.map((point) => point.annualVolatility));
  const yMinRaw = Math.min(...points.map((point) => point.annualReturn));
  const yMaxRaw = Math.max(...points.map((point) => point.annualReturn));
  const yPadding = Math.max((yMaxRaw - yMinRaw) * 0.08, 0.01);

  return {
    xMin: 0,
    xMax: Math.max(xMaxRaw * 1.05, 0.01),
    yMin: Math.min(0, yMinRaw - yPadding),
    yMax: yMaxRaw + yPadding,
  };
}

function formatWeights(weights: Record<string, number>): string {
  return Object.entries(weights)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 3)
    .map(([ticker, weight]) => `${ticker} ${(weight * 100).toFixed(0)}%`)
    .join(' · ');
}

const FrontierPlot = memo(function FrontierPlot({
  frontier,
  domains,
}: {
  frontier: EfficientFrontierViewModel;
  domains: ChartDomains;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={CHART_MARGIN}>
        <CartesianGrid stroke="#202a33" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="annualVolatility"
          name="Annual volatility"
          stroke="#71808d"
          tick={{ fontSize: 10 }}
          tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
          label={{ value: 'Annualized volatility', position: 'insideBottom', offset: -9, fill: '#71808d', fontSize: 11 }}
          domain={[domains.xMin, domains.xMax]}
          height={X_AXIS_HEIGHT}
        />
        <YAxis
          type="number"
          dataKey="annualReturn"
          name="Expected return"
          stroke="#71808d"
          tick={{ fontSize: 10 }}
          tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
          label={{ value: 'Expected annual return', angle: -90, position: 'insideLeft', fill: '#71808d', fontSize: 11 }}
          domain={[domains.yMin, domains.yMax]}
          width={Y_AXIS_WIDTH}
        />
        <Scatter name="Simulated portfolios" data={frontier.portfolios} fill="#60707e" fillOpacity={0.28} isAnimationActive={false} />
        <Line name="Efficient frontier" data={frontier.frontier} type="monotone" dataKey="annualReturn" stroke="#38d9a9" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        <Line name="Capital market line" data={frontier.capitalMarketLine} type="linear" dataKey="annualReturn" stroke="#e8c45d" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        <Scatter name="Minimum volatility" data={[frontier.minimumVolatility]} fill="#74c0fc" shape="diamond" isAnimationActive={false} />
        <Scatter name="Maximum Sharpe" data={[frontier.maximumSharpe]} fill="#38d9a9" shape="star" isAnimationActive={false} />
        <Scatter name="Current exposure" data={[frontier.currentPortfolio]} fill="#ffffff" shape="triangle" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

export default function EfficientFrontierChart({ frontier }: { frontier: EfficientFrontierViewModel | null }) {
  const domains = useMemo(() => getChartDomains(frontier), [frontier]);
  const [readout, setReadout] = useState<ChartReadout | null>(null);
  const pendingReadoutRef = useRef<ChartReadout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  function scheduleReadout(nextReadout: ChartReadout | null) {
    pendingReadoutRef.current = nextReadout;
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setReadout(pendingReadoutRef.current);
    });
  }

  function handlePointerLeave() {
    pendingReadoutRef.current = null;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setReadout(null);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!frontier) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const plotLeft = CHART_MARGIN.left + Y_AXIS_WIDTH;
    const plotRight = bounds.width - CHART_MARGIN.right;
    const plotTop = CHART_MARGIN.top;
    const plotBottom = bounds.height - CHART_MARGIN.bottom - X_AXIS_HEIGHT;

    if (x < plotLeft || x > plotRight || y < plotTop || y > plotBottom) {
      scheduleReadout(null);
      return;
    }

    const volatility = domains.xMin + ((x - plotLeft) / (plotRight - plotLeft)) * (domains.xMax - domains.xMin);
    const annualReturn = domains.yMax - ((y - plotTop) / (plotBottom - plotTop)) * (domains.yMax - domains.yMin);
    const importantPoints = [
      { label: 'Minimum volatility', point: frontier.minimumVolatility },
      { label: 'Maximum Sharpe', point: frontier.maximumSharpe },
      { label: 'Current exposure', point: frontier.currentPortfolio },
    ];
    const nearest = importantPoints
      .map((candidate) => {
        const pointX = plotLeft + ((candidate.point.annualVolatility - domains.xMin) / (domains.xMax - domains.xMin)) * (plotRight - plotLeft);
        const pointY = plotTop + ((domains.yMax - candidate.point.annualReturn) / (domains.yMax - domains.yMin)) * (plotBottom - plotTop);
        return { ...candidate, distance: Math.hypot(x - pointX, y - pointY) };
      })
      .sort((left, right) => left.distance - right.distance)[0];

    if (nearest && nearest.distance <= SNAP_RADIUS_PX) {
      scheduleReadout({ label: nearest.label, point: nearest.point, exact: true, x, y });
      return;
    }

    scheduleReadout({
      label: 'Cursor coordinates',
      point: { annualVolatility: volatility, annualReturn, sharpeRatio: 0 },
      exact: false,
      x,
      y,
    });
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
      <div className="flex flex-col gap-1 border-b border-[#26303a] px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-medium">Mean-variance opportunity set</h2>
          <p className="text-xs text-[#71808d]">Long-only portfolio cloud, efficient envelope, and capital market line</p>
        </div>
        {frontier && <p className="font-mono text-xs text-[#60707e]">{frontier.simulations.toLocaleString()} portfolios · {frontier.observations} aligned returns</p>}
      </div>

      {!frontier ? (
        <div className="grid min-h-[380px] place-items-center p-8 text-center text-sm text-[#60707e]">
          Run the portfolio analysis to estimate the efficient frontier.
        </div>
      ) : frontier.tickers.length < 2 ? (
        <div className="grid min-h-[380px] place-items-center p-8 text-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#60707e]">Single-asset opportunity set</p>
            <p className="mt-2 text-sm text-[#8b98a5]">Add at least two distinct tickers to estimate diversification and a non-degenerate efficient frontier.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#202a33] px-4 py-3 text-[11px] text-[#8b98a5]">
            {LEGEND_ITEMS.map((item) => (
              <span key={item.label} className="flex items-center gap-2 whitespace-nowrap">
                <LegendMark color={item.color} type={item.type} />
                {item.label}
              </span>
            ))}
          </div>

          <div className="h-[460px] p-3 sm:p-5">
            <div
              className="relative h-full cursor-crosshair"
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
            >
              <FrontierPlot frontier={frontier} domains={domains} />

              {readout && (
                <>
                  {!readout.exact && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#a9b4be] bg-[#0d1319]"
                      style={{ left: readout.x, top: readout.y }}
                    />
                  )}
                  <div className="pointer-events-none absolute right-3 top-3 min-w-44 rounded border border-[#303c47] bg-[#111820]/95 p-3 font-mono text-xs shadow-lg backdrop-blur-sm">
                    <p className={readout.exact ? 'text-[#38d9a9]' : 'text-[#8b98a5]'}>{readout.label}</p>
                    <p className="mt-1 text-white">Return {(readout.point.annualReturn * 100).toFixed(2)}%</p>
                    <p className="text-[#a9b4be]">Volatility {(readout.point.annualVolatility * 100).toFixed(2)}%</p>
                    {readout.exact && <p className="text-[#a9b4be]">Sharpe {readout.point.sharpeRatio.toFixed(3)}</p>}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-px border-t border-[#26303a] bg-[#26303a] md:grid-cols-3">
            {[
              ['Minimum volatility', frontier.minimumVolatility, '#74c0fc'],
              ['Maximum Sharpe', frontier.maximumSharpe, '#38d9a9'],
              ['Current signed exposure', frontier.currentPortfolio, '#ffffff'],
            ].map(([label, point, color]) => {
              const typedPoint = point as WeightedFrontierPoint;
              return (
                <div key={label as string} className="bg-[#0d1319] p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[#60707e]">{label as string}</p>
                  <div className="mt-2 flex gap-5 font-mono text-sm tabular-nums">
                    <p><span className="text-[#60707e]">Return</span> <span style={{ color: color as string }}>{(typedPoint.annualReturn * 100).toFixed(2)}%</span></p>
                    <p><span className="text-[#60707e]">Vol</span> <span className="text-white">{(typedPoint.annualVolatility * 100).toFixed(2)}%</span></p>
                    <p><span className="text-[#60707e]">SR</span> <span className="text-white">{typedPoint.sharpeRatio.toFixed(2)}</span></p>
                  </div>
                  <p className="mt-2 truncate font-mono text-[10px] text-[#71808d]" title={formatWeights(typedPoint.weights)}>{formatWeights(typedPoint.weights)}</p>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[#26303a] bg-[#0a1015] px-4 py-3 text-xs leading-5 text-[#60707e]">
            Estimates use arithmetic mean returns and the sample covariance matrix, annualized over 252 sessions. The cloud and frontier are in-sample, long-only approximations; the current point preserves signed gross-exposure weights. Risk-free rate {(frontier.riskFreeRate * 100).toFixed(1)}%.
          </div>
        </>
      )}
    </section>
  );
}
