import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  Shield,
  Target,
  Sparkles,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Gauge,
  Compass,
  FileText,
  AlertTriangle,
  Scale,
} from 'lucide-react';
import {
  InstrumentConfig,
  MarketQuote,
  MarketCandle,
  Timeframe,
  TradeType,
} from '../types';
import { computeIndicators, analyzeMarketStructure } from '../utils/indicators';
import { runComprehensiveStrategyEngine } from '../strategies';

interface MarketAnalysisViewProps {
  symbol: string;
  instrument: InstrumentConfig;
  quote?: MarketQuote | null;
  candles: MarketCandle[];
  h1Candles: MarketCandle[];
  tradeType: TradeType;
}

export const MarketAnalysisView: React.FC<MarketAnalysisViewProps> = ({
  symbol,
  instrument,
  quote,
  candles,
  h1Candles,
  tradeType,
}) => {
  const indicators = computeIndicators(candles);
  const structure = analyzeMarketStructure(candles);
  const report = runComprehensiveStrategyEngine(symbol, candles, h1Candles, tradeType);

  const lastRSI = indicators.rsi[indicators.rsi.length - 1] || 50;
  const lastATR = indicators.atr[indicators.atr.length - 1] || 0.0015;

  const regimeColors: Record<string, string> = {
    TRENDING_BULLISH: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    TRENDING_BEARISH: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    RANGING: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    BREAKOUT: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    HIGH_VOLATILITY: 'bg-red-500/10 text-red-400 border-red-500/30',
    LOW_VOLATILITY: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    UNCLEAR: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <div className="space-y-6">
      {/* Header Overview & Market Regime Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{instrument.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white uppercase">{symbol}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-600/10 text-blue-400 font-bold border border-blue-500/30 uppercase">
                  {instrument.assetClass}
                </span>
                <span className={`text-[10px] px-2.5 py-0.5 rounded font-bold border uppercase ${regimeColors[report.marketRegime.regime] || regimeColors.UNCLEAR}`}>
                  Regime: {report.marketRegime.regime.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{instrument.name} • {instrument.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Current Price</div>
              <div className="text-2xl font-bold font-mono text-white mt-0.5">
                {quote ? quote.price.toFixed(instrument.digits) : '---'}
              </div>
            </div>

            <div className="border-l border-slate-800 pl-6">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Dominant Bias</div>
              <div
                className={`text-sm font-bold flex items-center gap-1.5 mt-0.5 ${
                  report.dominantBias === 'BULLISH'
                    ? 'text-emerald-400'
                    : report.dominantBias === 'BEARISH'
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {report.dominantBias === 'BULLISH' && <TrendingUp className="w-4 h-4" />}
                {report.dominantBias === 'BEARISH' && <TrendingDown className="w-4 h-4" />}
                <span>{report.dominantBias}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Market Regime Details Banner */}
        <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-slate-300 font-medium">{report.marketRegime.description}</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
            <span>Characteristic: <strong className="text-white font-sans">{report.marketRegime.primaryCharacteristic}</strong></span>
            <span>ATR: <strong className="text-white">{report.marketRegime.atrPercent}%</strong></span>
            <span>Confidence: <strong className="text-blue-400">{report.marketRegime.confidence}/100</strong></span>
          </div>
        </div>

        {/* Multi-Timeframe Trend Matrix (H4, H1, M15, M5) */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Multi-Timeframe Trend Matrix (Alignment Score: {report.mtfTrends.alignmentScore}%)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {(['H4', 'H1', 'M15', 'M5'] as const).map((tf) => {
              const trend = report.mtfTrends.timeframes[tf];
              const bias = trend?.bias || 'NEUTRAL';
              const strength = trend?.strength || 0;
              return (
                <div key={tf} className="bg-slate-800/50 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-300 font-mono">{tf}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      bias === 'BULLISH'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : bias === 'BEARISH'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-slate-700 text-slate-300'
                    }`}>
                      {bias}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex justify-between">
                    <span>Strength</span>
                    <span className="font-mono text-slate-300">{strength}/100</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5 Modular Strategy Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            Step 3 Strategy Engine Results (5 Individual Strategies)
          </h3>
          <span className="text-[10px] text-slate-500 uppercase font-semibold">
            Deterministic / Programmatic Triggers
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {report.strategyResults.map((strat) => (
            <div
              key={strat.strategyName}
              className={`p-4 rounded-xl border flex flex-col justify-between gap-3 text-xs transition-all ${
                strat.valid
                  ? strat.direction === 'BUY'
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                    {strat.strategyName.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      strat.valid
                        ? strat.direction === 'BUY'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-rose-500 text-white'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    {strat.valid ? `${strat.direction} SETUP` : 'NO SETUP'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed mb-2">
                  {strat.reason}
                </p>
                {strat.conditions.length > 0 && (
                  <ul className="space-y-1 mt-2 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400">
                    {strat.conditions.map((c, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span className="truncate">{c}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px] text-slate-500">
                <span>Timeframe: <strong className="text-slate-300 font-mono">{strat.timeframe}</strong></span>
                <span>Strength: <strong className="text-slate-300 font-mono">{strat.strength}/100</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confluence Engine & Confidence Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confidence Breakdown Meter */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Confidence Breakdown Scorecard
              </h3>
            </div>
            <span className="text-sm font-bold font-mono text-blue-400">
              Total Score: {report.confidenceBreakdown.totalScore}/100
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400">Higher Timeframe Alignment:</span>
              <span className="font-bold text-white font-mono">{report.confidenceBreakdown.htfAlignment} / 20 pts</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400">Market Structure Order Flow:</span>
              <span className="font-bold text-white font-mono">{report.confidenceBreakdown.marketStructure} / 20 pts</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400">Entry Trigger Confirmations:</span>
              <span className="font-bold text-white font-mono">{report.confidenceBreakdown.entryConfirmation} / 15 pts</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400">Momentum Vector (RSI/MACD):</span>
              <span className="font-bold text-white font-mono">{report.confidenceBreakdown.momentumAlignment} / 15 pts</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400">Liquidity Conditions:</span>
              <span className="font-bold text-white font-mono">{report.confidenceBreakdown.liquidityCondition} / 10 pts</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400">Support / Resistance Clearance:</span>
              <span className="font-bold text-white font-mono">{report.confidenceBreakdown.srClearance} / 10 pts</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400">Volatility Suitability:</span>
              <span className="font-bold text-white font-mono">{report.confidenceBreakdown.volatilitySuitability} / 10 pts</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400">Risk / Reward Ratio Quality:</span>
              <span className="font-bold text-white font-mono">{report.confidenceBreakdown.riskRewardRatio} / 10 pts</span>
            </div>
            {report.confidenceBreakdown.conflictingPenalty < 0 && (
              <div className="flex items-center justify-between p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <span>Conflicting Evidence Penalty:</span>
                <span className="font-bold font-mono">{report.confidenceBreakdown.conflictingPenalty} pts</span>
              </div>
            )}
          </div>
        </div>

        {/* Confluence Evidence Feed */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Confluence Evidence Evaluation
              </h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 uppercase">
              {report.confluence.overallConfluence} CONFLUENCE
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {report.confluence.evidence.map((ev, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                  ev.classification === 'STRONG_SUPPORT' || ev.classification === 'SUPPORT'
                    ? 'bg-emerald-950/15 border-emerald-500/20 text-slate-200'
                    : ev.classification === 'STRONG_CONFLICT' || ev.classification === 'CONFLICT'
                    ? 'bg-rose-950/15 border-rose-500/20 text-slate-200'
                    : 'bg-slate-800/40 border-slate-800 text-slate-400'
                }`}
              >
                <div className="mt-0.5">
                  {ev.classification === 'STRONG_SUPPORT' || ev.classification === 'SUPPORT' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : ev.classification === 'STRONG_CONFLICT' || ev.classification === 'CONFLICT' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between font-semibold text-[11px]">
                    <span className="text-white">{ev.source}</span>
                    <span className="font-mono text-[10px] text-slate-400">{ev.classification} (+{ev.weight}w)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{ev.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
