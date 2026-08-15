import React from 'react';
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
} from 'lucide-react';
import { PerformanceAnalytics, PerformanceGroup } from '../types';

interface PerformanceDashboardProps {
  performance: PerformanceAnalytics | null;
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ performance }) => {
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
