import { buildOptionPriceSurface } from '@/lib/optionPriceSurface';

interface OptionPriceHeatmapProps {
  spot: number;
  strike: number;
  daysToExpiration: number;
  rate: number;
  volatility: number;
  dividendYield: number;
  optionType: 'call' | 'put';
}

export default function OptionPriceHeatmap({
  spot,
  strike,
  daysToExpiration,
  rate,
  volatility,
  dividendYield,
  optionType,
}: OptionPriceHeatmapProps) {
  if (
    !Number.isFinite(spot) || spot <= 0
    || !Number.isFinite(strike) || strike <= 0
    || !Number.isFinite(daysToExpiration) || daysToExpiration <= 0
    || !Number.isFinite(volatility) || volatility <= 0
    || !Number.isFinite(rate)
    || !Number.isFinite(dividendYield)
  ) {
    return (
      <section className="mt-6 overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
        <div className="border-b border-[#26303a] px-4 py-3">
          <h2 className="font-medium">Option price heatmap</h2>
        </div>
        <div className="grid min-h-[260px] place-items-center p-8 text-sm text-[#60707e]">
          Enter valid positive spot, strike, expiry, and volatility inputs to build the surface.
        </div>
      </section>
    );
  }

  const surface = buildOptionPriceSurface({
    spot,
    strike,
    timeToExpiry: daysToExpiration / 365,
    rate,
    volatility,
    type: optionType,
    dividendYield,
  });
  const range = surface.maximumPrice - surface.minimumPrice || 1;

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
      <div className="flex flex-col gap-2 border-b border-[#26303a] px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-medium">Option price heatmap</h2>
          <p className="text-xs text-[#71808d]">Black-Scholes price across ±25% spot and ±50% volatility shocks</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#60707e]">
          <span>Low</span>
          <span className="h-2 w-20 rounded-sm bg-gradient-to-r from-[#10171e] via-[#26765f] to-[#63e6be]" aria-hidden="true" />
          <span>High price</span>
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[900px] border-separate border-spacing-1 font-mono text-[11px] tabular-nums">
          <caption className="sr-only">Modeled option prices by implied volatility rows and underlying spot columns</caption>
          <thead>
            <tr>
              <th scope="col" className="w-20 px-2 py-2 text-left font-medium text-[#60707e]">σ \ S</th>
              {surface.spots.map((scenarioSpot, index) => (
                <th key={index} scope="col" className={index === 5 ? 'px-2 py-2 text-center font-semibold text-white' : 'px-2 py-2 text-center font-medium text-[#71808d]'}>
                  ${scenarioSpot.toFixed(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {surface.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th scope="row" className={rowIndex === 4 ? 'px-2 py-3 text-left font-semibold text-white' : 'px-2 py-3 text-left font-medium text-[#71808d]'}>
                  {(surface.volatilities[rowIndex] * 100).toFixed(1)}%
                </th>
                {row.map((cell, columnIndex) => {
                  const intensity = (cell.price - surface.minimumPrice) / range;
                  const alpha = Number((0.06 + intensity * 0.78).toFixed(3));
                  const background = `rgba(56, 217, 169, ${alpha})`;
                  return (
                    <td
                      key={columnIndex}
                      className={cell.isCurrent ? 'rounded-sm px-2 py-3 text-center font-semibold text-white ring-2 ring-inset ring-white' : intensity > 0.62 ? 'rounded-sm px-2 py-3 text-center font-semibold text-[#06110d]' : 'rounded-sm px-2 py-3 text-center text-[#d9e2e8]'}
                      style={{ backgroundColor: background }}
                      title={`Spot $${cell.spot.toFixed(2)}, volatility ${(cell.volatility * 100).toFixed(1)}%, price $${cell.price.toFixed(4)}`}
                    >
                      ${cell.price.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1 border-t border-[#26303a] bg-[#0a1015] px-4 py-3 text-xs text-[#60707e] sm:flex-row sm:justify-between">
        <p>White outline marks the current model inputs.</p>
        <p className="font-mono">K ${strike.toFixed(2)} · T {daysToExpiration.toFixed(0)}d · {optionType.toUpperCase()}</p>
      </div>
    </section>
  );
}
