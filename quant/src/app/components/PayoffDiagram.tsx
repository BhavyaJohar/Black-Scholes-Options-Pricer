import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer
} from 'recharts';
import type { TooltipProps } from 'recharts';

interface PayoffData {
  price: number;
  payoff: number;
  profitLoss: number;
}

interface PayoffDiagramProps {
  data: PayoffData[];
  currentPrice: number | null;
  strikePrice: number;
  optionPrice: number | null;
  optionType: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded border border-[#303c47] bg-[#111820] p-3 font-mono text-xs shadow-lg">
        <p className="text-[#8b98a5]">Stock price: ${label.toFixed(2)}</p>
        <p className="text-white">
          P/L: ${payload?.[0]?.payload?.profitLoss?.toFixed(2) ?? '0.00'}
        </p>
      </div>
    );
  }
  return null;
};

export default function PayoffDiagram({
  data,
  currentPrice,
  strikePrice,
  optionPrice,
  optionType
}: PayoffDiagramProps) {
  const isCall = optionType === 'call';

  // Calculate break-even price
  const breakEvenPrice = isCall
    ? strikePrice + (optionPrice || 0)
    : strikePrice - (optionPrice || 0);

  // Calculate max profit/loss
  const maxProfit = isCall
    ? Number.POSITIVE_INFINITY
    : strikePrice - (optionPrice || 0);

  const maxLoss = optionPrice || 0;

  // Split data into positive and negative P/L
  const coloredData = data.map(d => ({
    price: d.price,
    profitLoss: d.profitLoss,
    posPL: d.profitLoss > 0 ? d.profitLoss : 0,
    negPL: d.profitLoss < 0 ? d.profitLoss : 0,
  }));

  return (
    <section className="overflow-hidden rounded-lg border border-[#26303a] bg-[#0d1319]">
      <div className="border-b border-[#26303a] px-4 py-3">
        <h2 className="font-medium">Expiration payoff</h2>
        <p className="text-xs text-[#71808d]">Long position profit/loss after the modeled premium</p>
      </div>
      <div className="h-[360px] p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={coloredData} margin={{ bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#202a33" />
            <XAxis
              dataKey="price"
              stroke="#71808d"
              label={{
                value: 'Stock Price',
                position: 'insideBottom',
                fill: '#71808d',
                offset: -20
              }}
            />
            <YAxis
              stroke="#71808d"
              label={{
                value: 'Payoff',
                angle: -90,
                position: 'insideLeft',
                fill: '#71808d'
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Negative region: red */}
            <Area
              type="monotone"
              dataKey="negPL"
              stroke="none"
              fill="#EF4444"
              fillOpacity={0.2}
            />
            <Area
              type="monotone"
              dataKey="negPL"
              stroke="#EF4444"
              strokeWidth={2}
              fill="none"
              dot={false}
            />

            {/* Positive region: green */}
            <Area
              type="monotone"
              dataKey="posPL"
              stroke="none"
              fill="#10B981"
              fillOpacity={0.2}
            />
            <Area
              type="monotone"
              dataKey="posPL"
              stroke="#10B981"
              strokeWidth={2}
              fill="none"
              dot={false}
              activeDot={{ r: 8 }}
            />
            
            {/* Current Price Line */}
            {currentPrice && (
              <ReferenceLine
                x={currentPrice}
                stroke="#74c0fc"
                strokeDasharray="3 3"
                label={{
                  value: 'Current',
                  position: 'top',
                  fill: '#74c0fc'
                }}
              />
            )}
            
            {/* Strike Price Line */}
            <ReferenceLine
              x={strikePrice}
              stroke="#8b98a5"
              strokeDasharray="3 3"
              label={{
                value: 'Strike',
                position: 'top',
                fill: '#8b98a5'
              }}
            />
            
            {/* Break-even Line */}
            <ReferenceLine
              x={breakEvenPrice}
              stroke="#F59E0B"
              strokeDasharray="3 3"
              label={{
                value: 'Break-even',
                position: 'top',
                fill: '#F59E0B'
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-px border-t border-[#26303a] bg-[#26303a] sm:grid-cols-3">
        <div className="bg-[#0d1319] px-4 py-4">
          <p className="text-[11px] uppercase tracking-wider text-[#60707e]">Break-even</p>
          <p className="mt-1 font-mono text-xl text-[#e8c45d]">${breakEvenPrice.toFixed(2)}</p>
        </div>
        <div className="bg-[#0d1319] px-4 py-4">
          <p className="text-[11px] uppercase tracking-wider text-[#60707e]">Max profit</p>
          <p className="mt-1 font-mono text-xl text-[#38d9a9]">
            {maxProfit === Number.POSITIVE_INFINITY ? (
              <span>Unbounded</span>
            ) : (
              `$${maxProfit.toFixed(2)}`
            )}
          </p>
        </div>
        <div className="bg-[#0d1319] px-4 py-4">
          <p className="text-[11px] uppercase tracking-wider text-[#60707e]">Max loss</p>
          <p className="mt-1 font-mono text-xl text-[#ff8585]">${maxLoss.toFixed(2)}</p>
        </div>
      </div>
    </section>
  );
}
