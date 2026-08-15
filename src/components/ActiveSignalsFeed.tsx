import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldAlert,
  Target,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Sliders,
  Compass,
  Layers,
  Scale,
  Gauge,
} from 'lucide-react';
import { Signal, TradeType, InstrumentConfig } from '../types';

interface ActiveSignalsFeedProps {
  signal: Signal | null;
  instrument: InstrumentConfig;
  selectedTradeType: TradeType;
  onSelectTradeType: (type: TradeType) => void;
  onTriggerScan: () => void;
  isScanning: boolean;
}

export const ActiveSignalsFeed: React.FC<ActiveSignalsFeedProps> = ({
  signal,
  instrument,
  selectedTradeType,
  onSelectTradeType,
  onTriggerScan,
  isScanning,
}) => {
  const [copied, setCopied] = useState(false);
  const [showFactorDetails, setShowFactorDetails] = useState(false);

  const tradeTypes: { type: TradeType; label: string; timeframes: string }[] = [
    { type: 'SCALP', label: 'Scalp', timeframes: 'M5 / M15' },
    { type: 'DAY', label: 'Day Trade', timeframes: 'M15 / H1' },
    { type: 'SWING', label: 'Swing', timeframes: 'H1 / H4' },
  ];

  const handleCopy = () => {
    if (!signal || signal.direction === 'WAIT') return;
    const text = `[Eazzy AI Signal]
Instrument: ${signal.instrument}
Direction: ${signal.direction} (${signal.tradeType})
Entry: ${signal.suggestedEntry}
${signal.entryZone ? `Entry Zone: ${signal.entryZone.low} - ${signal.entryZone.high}\n` : ''}Stop Loss: ${signal.stopLoss}
TP1: ${signal.takeProfit1}
${signal.takeProfit2 ? `TP2: ${signal.takeProfit2}\n` : ''}R:R: 1:${signal.riskRewardRatio.toFixed(2)}
AI Confidence: ${signal.aiConfidence}/100
Market Regime: ${signal.marketRegime?.regime || 'NORMAL'}
Invalidation: ${signal.invalidationCondition}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regimeColors: Record<string, string> = {
    TRENDING_BULLISH: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    TRENDING_BEARISH: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    RANGING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    BREAKOUT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    HIGH_VOLATILITY: 'bg-red-500/10 text-red-400 border-red-500/20',
    LOW_VOLATILITY: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    UNCLEAR: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col gap-4">
      {/* Header & Trade Style Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Multi-Timeframe Scanner & Strategy Engine
            </h2>
          </div>
          <p className="text-[10px] uppercase text-slate-500 font-semibold mt-0.5">
            {selectedTradeType} Profile • Context: {signal?.timeframeUsed.context} ➔ Trigger: {signal?.timeframeUsed.entry}
          </p>
        </div>

        {/* Trade Type Selector */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          {tradeTypes.map((t) => (
            <button
              key={t.type}
              id={`style-btn-${t.type}`}
              onClick={() => onSelectTradeType(t.type)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex flex-col items-center transition-all ${
                selectedTradeType === t.type
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span>{t.label}</span>
              <span className="text-[9px] opacity-75">{t.timeframes}</span>
            </button>
          ))}
        </div>
      </div>

      {!signal ? (
        <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          <span className="text-xs font-medium">Scanning multi-timeframe liquidity, regime & structure...</span>
        </div>
      ) : signal.direction === 'WAIT' ? (
        /* WAIT / NO VALID SETUP CARD */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold uppercase tracking-wider">
                    WAIT — NO VALID SETUP
                  </span>
                  <span className="text-xs text-slate-300 font-bold">
                    {signal.instrument}
                  </span>
                  {signal.marketRegime && (
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${regimeColors[signal.marketRegime.regime] || regimeColors.UNCLEAR}`}>
                      {signal.marketRegime.regime.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <div className="text-[10px] uppercase text-slate-500 mt-1">
                  Market Bias: <span className="text-slate-300 font-semibold">{signal.marketBias}</span> • Price: <span className="font-mono text-white font-bold">{signal.currentPrice > 0 ? signal.currentPrice.toFixed(instrument.digits) : '---'}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Confidence</span>
              <span className="text-sm font-bold text-slate-300 font-mono">
                {signal.aiConfidence}/100
              </span>
            </div>
          </div>

          <div className="bg-slate-800/40 p-3.5 rounded border border-slate-800 text-xs leading-relaxed text-slate-300">
            <span className="text-[10px] uppercase text-amber-400 font-bold block mb-1">Discipline Reason:</span>
            {signal.setupExplanation}
          </div>

          {/* Detailed Decision Reasons */}
          {signal.reasons && signal.reasons.length > 0 && (
            <div className="bg-slate-950/60 p-3 rounded border border-slate-800/80 text-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Strategy & Confluence Reasons:
              </span>
              {signal.reasons.map((r, idx) => (
                <div key={idx} className="flex items-start gap-2 text-slate-400 text-[11px]">
                  <span className="text-amber-400 font-mono">•</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Conditions Checked:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              {signal.conditionsDetected.map((cond, i) => (
                <div key={i} className="flex items-center gap-2 text-slate-400 bg-slate-800/30 px-2.5 py-1.5 rounded border border-slate-800">
                  <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="truncate text-[11px]">{cond}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ACTIVE BUY / SELL SIGNAL CARD */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden flex flex-col gap-4">
          {/* Top Tag */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`font-bold text-xs px-3 py-2 rounded text-white ${
                  signal.direction === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              >
                {signal.direction}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">
                    {signal.instrument}
                  </h3>
                  {signal.marketRegime && (
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${regimeColors[signal.marketRegime.regime] || regimeColors.UNCLEAR}`}>
                      {signal.marketRegime.regime.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                  {signal.tradeType} • Detected {new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                  signal.direction === 'BUY'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
              >
                Active Signal
              </span>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium px-2.5 py-1 rounded border border-slate-700 transition-colors"
                title="Copy parameters"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Parameters Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/40 p-3 rounded border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Suggested Entry</p>
              <p className="text-sm font-mono font-bold text-white mt-0.5">
                {signal.suggestedEntry.toFixed(instrument.digits)}
              </p>
              {signal.entryZone ? (
                <p className="text-[9px] text-slate-400 mt-0.5 font-mono">
                  Zone: [{signal.entryZone.low.toFixed(instrument.digits)} - {signal.entryZone.high.toFixed(instrument.digits)}]
                </p>
              ) : (
                <p className="text-[9px] text-slate-500 mt-0.5">
                  Live: {signal.currentPrice.toFixed(instrument.digits)}
                </p>
              )}
            </div>

            <div className="bg-slate-800/40 p-3 rounded border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Stop Loss</p>
              <p className="text-sm font-mono font-bold text-rose-400 mt-0.5">
                {signal.stopLoss.toFixed(instrument.digits)}
              </p>
              <p className="text-[9px] text-rose-400/70 mt-0.5">
                {Math.abs(signal.suggestedEntry - signal.stopLoss).toFixed(instrument.digits)} pts
              </p>
            </div>

            <div className="bg-slate-800/40 p-3 rounded border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Take Profit 1</p>
              <p className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
                {signal.takeProfit1.toFixed(instrument.digits)}
              </p>
              <p className="text-[9px] text-emerald-400/70 mt-0.5">Primary Target</p>
            </div>

            <div className="bg-slate-800/40 p-3 rounded border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">TP 2 (Runner)</p>
              <p className="text-sm font-mono font-bold text-emerald-300 mt-0.5">
                {signal.takeProfit2 ? signal.takeProfit2.toFixed(instrument.digits) : '---'}
              </p>
              <p className="text-[9px] text-emerald-400/70 mt-0.5">Extension Target</p>
            </div>
          </div>

          {/* AI Confidence & Risk/Reward Row */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Confidence Score</span>
              <span className="text-sm font-bold text-blue-400 font-mono">{signal.aiConfidence}/100</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Risk/Reward Asymmetry</span>
              <span className="text-sm font-bold text-white font-mono">1:{signal.riskRewardRatio.toFixed(2)}</span>
            </div>
          </div>

          {/* Strategy Rationale */}
          <div className="bg-slate-800/40 p-3 rounded border border-slate-800 text-xs leading-relaxed">
            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Confluence Breakdown</p>
            <p className="text-slate-300">{signal.setupExplanation}</p>
          </div>

          {/* Reasons List */}
          {signal.reasons && signal.reasons.length > 0 && (
            <div className="bg-slate-950/60 p-3 rounded border border-slate-800/80 text-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Confluence Evidence & Triggers:
              </span>
              {signal.reasons.map((r, idx) => (
                <div key={idx} className="flex items-start gap-2 text-slate-300 text-[11px]">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Invalidation Rule */}
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded">
            <p className="text-[10px] text-amber-400 uppercase font-bold mb-0.5">Structural Invalidation Rule</p>
            <p className="text-xs text-amber-200/90">{signal.invalidationCondition}</p>
          </div>
        </div>
      )}
    </div>
  );
};
