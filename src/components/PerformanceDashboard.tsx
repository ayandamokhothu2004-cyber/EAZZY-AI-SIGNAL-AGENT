import React, { useState } from 'react';
import {
  TrendingUp,
  Award,
  BarChart3,
  Percent,
  CheckCircle2,
  XCircle,
  Sparkles,
  Shield,
  Layers,
  Flame,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  CalendarDays,
  ArrowUpDown,
  Table2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { PerformanceAnalytics, PerformanceGroup, DailyPnlEntry } from '../types';

interface PerformanceDashboardProps {
  performance: PerformanceAnalytics | null;
}

interface DailyPnlTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyPnlEntry }>;
}

const DailyPnlTooltip: React.FC<DailyPnlTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  const isPositive = data.realizedR >= 0;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 shadow-xl text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-200">{data.label}</span>
        <span className="font-mono tabular-nums text-[11px] text-slate-500">{data.date}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-slate-400">Daily P&amp;L</span>
        <span
          className={`font-mono tabular-nums font-bold ${
            isPositive ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {isPositive ? `+${data.realizedR.toFixed(2)}R` : `${data.realizedR.toFixed(2)}R`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-slate-400">Cumulative</span>
        <span
          className={`font-mono tabular-nums font-semibold ${
            data.cumulativeR >= 0 ? 'text-blue-400' : 'text-rose-400'
          }`}
        >
          {data.cumulativeR >= 0 ? `+${data.cumulativeR.toFixed(2)}R` : `${data.cumulativeR.toFixed(2)}R`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6 pt-1 border-t border-slate-800/80 text-[11px]">
        <span className="text-slate-500">Settled</span>
        <span className="font-mono tabular-nums text-slate-300">
          {data.wins}W / {data.losses}L · {data.trades} {data.trades === 1 ? 'trade' : 'trades'}
        </span>
      </div>
    </div>
  );
};

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ performance }) => {
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  if (!performance) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        Calculating performance and win-rate calibration metrics...
      </div>
    );
  }

  const confidenceBrackets = [
    { label: '90 – 100', key: '90-100' as const, color: 'from-emerald-500 to-teal-400' },
    { label: '80 – 89', key: '80-89' as const, color: 'from-cyan-500 to-blue-400' },
    { label: '70 – 79', key: '70-79' as const, color: 'from-indigo-500 to-purple-400' },
    { label: '60 – 69', key: '60-69' as const, color: 'from-amber-500 to-yellow-400' },
    { label: '50 – 59', key: '50-59' as const, color: 'from-orange-500 to-rose-400' },
    { label: '0 – 49', key: '0-49' as const, color: 'from-rose-500 to-red-600' },
  ];

  const dailyPnl = performance.dailyPnl || [];
  const bestDay = dailyPnl.length > 0 ? Math.max(...dailyPnl.map((d) => d.realizedR)) : 0;
  const worstDay = dailyPnl.length > 0 ? Math.min(...dailyPnl.map((d) => d.realizedR)) : 0;
  const profitableDays = dailyPnl.filter((d) => d.realizedR > 0).length;
  const sortedDailyPnl = sortOrder === 'desc' ? [...dailyPnl].reverse() : dailyPnl;
  const totalDailyWins = dailyPnl.reduce((sum, d) => sum + d.wins, 0);
  const totalDailyLosses = dailyPnl.reduce((sum, d) => sum + d.losses, 0);
  const totalDailyTrades = dailyPnl.reduce((sum, d) => sum + d.trades, 0);
  const totalDailyRealizedR = Number(dailyPnl.reduce((sum, d) => sum + d.realizedR, 0).toFixed(2));
  const totalDailyWinRate =
    totalDailyWins + totalDailyLosses > 0
      ? Number(((totalDailyWins / (totalDailyWins + totalDailyLosses)) * 100).toFixed(1))
      : 0;
  const finalCumulativeR = dailyPnl.length > 0 ? dailyPnl[dailyPnl.length - 1].cumulativeR : 0;

  return (
    <div className="space-y-6">
      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Win Rate */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
            <span>Overall Win Rate</span>
            <Percent className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {performance.winRate}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 font-medium">
            <span>{performance.wins}W</span>
            <span>/</span>
            <span>{performance.losses}L</span>
            <span>•</span>
            <span>{performance.completedSignals} Settled</span>
          </div>
        </div>

        {/* Total R-Multiple */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
            <span>Cumulative Return (R)</span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              performance.totalR >= 0 ? 'text-blue-400' : 'text-rose-400'
            }`}
          >
            {performance.totalR >= 0 ? `+${performance.totalR}R` : `${performance.totalR}R`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Average: <span className="font-mono text-slate-200 font-semibold">+{performance.averageR}R</span> per trade
          </div>
        </div>

        {/* Profit Factor */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
            <span>Profit Factor</span>
            <Award className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {performance.profitFactor.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Asymmetric Win/Loss Ratio
          </div>
        </div>

        {/* Best Instrument */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
            <span>Top Asset</span>
            <Flame className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono uppercase">
            {performance.bestInstrument}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Strategy: <span className="text-slate-200 font-semibold">{performance.bestStrategy}</span>
          </div>
        </div>
      </div>

      {/* Daily Realized P&L Bar Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Daily Realized P&amp;L (R-Multiple)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Net daily realized return across settled trades, grouped by closing date.
            </p>
          </div>

          {dailyPnl.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
              <span>
                {profitableDays}/{dailyPnl.length} green {dailyPnl.length === 1 ? 'day' : 'days'}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                Best:{' '}
                <span className={bestDay >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {bestDay >= 0 ? `+${bestDay.toFixed(2)}R` : `${bestDay.toFixed(2)}R`}
                </span>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                Worst:{' '}
                <span className={worstDay >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {worstDay >= 0 ? `+${worstDay.toFixed(2)}R` : `${worstDay.toFixed(2)}R`}
                </span>
              </span>
            </div>
          )}
        </div>

        {dailyPnl.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40 px-4">
            <BarChart3 className="w-6 h-6 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-300">No settled daily P&amp;L recorded yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Daily realized R-multiple bars will populate automatically once active signals reach take profit or stop loss.
            </p>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dailyPnl}
                margin={{ top: 12, right: 16, left: -8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => `${value > 0 ? '+' : ''}${value}R`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                  content={<DailyPnlTooltip />}
                />
                <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
                <Bar dataKey="realizedR" maxBarSize={56} radius={[4, 4, 4, 4]}>
                  {dailyPnl.map((entry) => (
                    <Cell
                      key={entry.date}
                      fill={entry.realizedR >= 0 ? '#10b981' : '#f43f5e'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Detailed Daily Realized P&L Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Daily P&amp;L Breakdown
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Daily realized P&amp;L, win/loss count, and total volume traded per session date.
            </p>
          </div>

          {dailyPnl.length > 1 && (
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </button>
          )}
        </div>

        {dailyPnl.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-slate-500">
            No settled daily records available to display yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th scope="col" className="py-3 px-5 whitespace-nowrap">
                    Date
                  </th>
                  <th scope="col" className="py-3 px-4 whitespace-nowrap">
                    Instruments
                  </th>
                  <th scope="col" className="py-3 px-4 text-right whitespace-nowrap">
                    Win / Loss
                  </th>
                  <th scope="col" className="py-3 px-4 text-right whitespace-nowrap">
                    Total Volume Traded
                  </th>
                  <th scope="col" className="py-3 px-4 text-right whitespace-nowrap">
                    Realized P&amp;L
                  </th>
                  <th scope="col" className="py-3 px-5 text-right whitespace-nowrap">
                    Cumulative P&amp;L
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {sortedDailyPnl.map((entry) => {
                  const isPositive = entry.realizedR >= 0;
                  const settledCount = entry.wins + entry.losses;
                  const dayWinRate =
                    settledCount > 0 ? Math.round((entry.wins / settledCount) * 100) : 0;

                  return (
                    <tr
                      key={entry.date}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-5 whitespace-nowrap">
                        <span className="font-semibold text-slate-200">{entry.label}</span>
                        <span className="ml-2 font-mono tabular-nums text-[11px] text-slate-500">
                          {entry.date}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {entry.instruments && entry.instruments.length > 0
                          ? entry.instruments.join(' · ')
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-emerald-400 font-semibold">{entry.wins}W</span>
                        <span className="text-slate-600 mx-1">/</span>
                        <span className="text-rose-400 font-semibold">{entry.losses}L</span>
                        <span className="text-slate-500 text-[11px] ml-2">
                          ({dayWinRate}%)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-200 font-semibold">
                          {entry.trades} {entry.trades === 1 ? 'trade' : 'trades'}
                        </span>
                        <span className="text-slate-500 text-[11px] ml-2">
                          · {entry.trades.toFixed(1)}R risk
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? `+${entry.realizedR.toFixed(2)}R` : `${entry.realizedR.toFixed(2)}R`}
                      </td>
                      <td
                        className={`py-3 px-5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          entry.cumulativeR >= 0 ? 'text-blue-400' : 'text-rose-400'
                        }`}
                      >
                        {entry.cumulativeR >= 0
                          ? `+${entry.cumulativeR.toFixed(2)}R`
                          : `${entry.cumulativeR.toFixed(2)}R`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950/60 border-t border-slate-800 text-xs font-semibold">
                  <td className="py-3 px-5 text-slate-300 whitespace-nowrap">
                    Total ({dailyPnl.length} {dailyPnl.length === 1 ? 'day' : 'days'})
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">—</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                    <span className="text-emerald-400">{totalDailyWins}W</span>
                    <span className="text-slate-600 mx-1">/</span>
                    <span className="text-rose-400">{totalDailyLosses}L</span>
                    <span className="text-slate-400 text-[11px] ml-2">
                      ({totalDailyWinRate}%)
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                    {totalDailyTrades} {totalDailyTrades === 1 ? 'trade' : 'trades'}
                    <span className="text-slate-500 text-[11px] ml-2 font-normal">
                      · {totalDailyTrades.toFixed(1)}R risk
                    </span>
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                      totalDailyRealizedR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {totalDailyRealizedR >= 0
                      ? `+${totalDailyRealizedR.toFixed(2)}R`
                      : `${totalDailyRealizedR.toFixed(2)}R`}
                  </td>
                  <td
                    className={`py-3 px-5 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                      finalCumulativeR >= 0 ? 'text-blue-400' : 'text-rose-400'
                    }`}
                  >
                    {finalCumulativeR >= 0
                      ? `+${finalCumulativeR.toFixed(2)}R`
                      : `${finalCumulativeR.toFixed(2)}R`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* AI Confidence Calibration Analysis */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                AI Confidence Calibration Matrix
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Evaluating if higher AI confidence scores correlate with higher realized win rates and R-multiples.
            </p>
          </div>

          <div className="text-[10px] px-2.5 py-1 rounded bg-blue-600/10 text-blue-400 border border-blue-500/30 font-bold uppercase tracking-wider">
            Calibration Status: Evidence-Backed
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {confidenceBrackets.map((bracket) => {
            const group = performance.byConfidenceBracket[bracket.key];
            const hasData = group && group.total > 0;

            return (
              <div
                key={bracket.key}
                className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-300">
                    Confidence: <span className="font-mono text-blue-400 font-bold">{bracket.label}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-400 font-mono border border-slate-800">
                    {hasData ? `${group.total} trades` : '0 trades'}
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Win Rate</div>
                    <div className="text-xl font-bold font-mono text-white mt-0.5">
                      {hasData ? `${group.winRate}%` : '---'}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Total R</div>
                    <div className={`text-base font-bold font-mono mt-0.5 ${group?.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {hasData ? (group.totalR >= 0 ? `+${group.totalR}R` : `${group.totalR}R`) : '---'}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800/60">
                  <div
                    className={`h-full bg-gradient-to-r ${bracket.color} rounded-full`}
                    style={{ width: `${hasData ? group.winRate : 0}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800 font-mono">
                  <span>{group?.wins || 0}W / {group?.losses || 0}L</span>
                  <span>Avg: {hasData ? `+${group.avgR}R` : '---'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid: By Instrument & By Strategy Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Instrument Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Performance by Instrument
            </h3>
          </div>

          <div className="space-y-2">
            {(Object.entries(performance.byInstrument) as [string, PerformanceGroup][]).map(([inst, group]) => (
              <div
                key={inst}
                className="p-3 bg-slate-800/40 rounded-lg border border-slate-800 text-xs flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-white uppercase">{inst}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5 font-medium">
                    {group.total} signals • {group.wins}W / {group.losses}L
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold font-mono text-emerald-400 text-sm">
                    {group.winRate}% Win
                  </div>
                  <div className="font-mono text-[11px] text-blue-400 font-semibold">
                    {group.totalR >= 0 ? `+${group.totalR}R` : `${group.totalR}R`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Strategy Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Performance by Strategy Engine
            </h3>
          </div>

          <div className="space-y-2">
            {(Object.entries(performance.byStrategy) as [string, PerformanceGroup][]).map(([strat, group]) => (
              <div
                key={strat}
                className="p-3 bg-slate-800/40 rounded-lg border border-slate-800 text-xs flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-200">{strat}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    {group.total} signals evaluated
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold font-mono text-slate-200">
                    {group.winRate}% Win
                  </div>
                  <div className="font-mono text-[11px] text-blue-400 font-semibold">
                    Avg {group.avgR}R
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
