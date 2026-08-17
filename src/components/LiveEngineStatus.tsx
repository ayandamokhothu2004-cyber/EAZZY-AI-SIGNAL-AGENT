import React from 'react';
import {
  Activity,
  Radio,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Layers,
  Server,
} from 'lucide-react';
import { EngineStatus } from '../types';

interface LiveEngineStatusProps {
  engineStatus: EngineStatus | null;
  onManualRefresh?: () => void;
  isRefreshing?: boolean;
}

export const LiveEngineStatus: React.FC<LiveEngineStatusProps> = ({
  engineStatus,
  onManualRefresh,
  isRefreshing = false,
}) => {
  if (!engineStatus) {
    return (
      <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-3 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400 animate-spin" />
          <span>Synchronizing with Live Market Engine...</span>
        </div>
      </div>
    );
  }

  const {
    marketFeed,
    activeProvider,
    backupProvider,
    lastTickAgeSeconds,
    scannerStatus,
    pauseReason,
    nextScanSeconds,
    candleStates,
    signalsMonitoredCount,
    providerHealth,
  } = engineStatus;

  const getFeedBadge = (feed: string) => {
    switch (feed) {
      case 'LIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            LIVE
          </span>
        );
      case 'STALE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/50">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            STALE
          </span>
        );
      case 'RECONNECTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-950/80 text-blue-400 border border-blue-800/50">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            RECONNECTING
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/50">
            <AlertTriangle className="w-2.5 h-2.5" />
            OFFLINE
          </span>
        );
    }
  };

  const formatCandleStateBadge = (tf: string, state: string) => {
    const isForming = state === 'FORMING';
    const isClosed = state === 'CLOSED';
    const isStale = state === 'STALE';

    return (
      <div
        key={tf}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
          isForming
            ? 'bg-blue-950/40 text-blue-300 border-blue-800/40'
            : isClosed
            ? 'bg-slate-800/60 text-slate-300 border-slate-700/50'
            : isStale
            ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
            : 'bg-slate-900 text-slate-500 border-slate-800'
        }`}
      >
        <span className="font-semibold">{tf}:</span>
        <span className={isForming ? 'text-blue-400 font-bold' : ''}>{state}</span>
      </div>
    );
  };

  return (
    <div id="live-engine-status" className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left Section: Live Market Engine Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-slate-200 uppercase tracking-wide text-xs">Live Engine</span>
            {getFeedBadge(marketFeed)}
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>

          {/* Active & Backup Provider */}
          <div className="flex items-center gap-2 text-slate-300">
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Active:</span>
            <span className="font-semibold text-white">{activeProvider}</span>
            <span className="text-slate-500 text-[11px]">(Backup: {backupProvider})</span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>

          {/* Last Tick Age */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-400">Last Tick:</span>
            <span className={`font-mono font-medium ${lastTickAgeSeconds > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {lastTickAgeSeconds === 0 ? 'just now' : `${lastTickAgeSeconds}s ago`}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>

          {/* Scanner State & Countdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Scanner:</span>
            <span
              className={`font-semibold ${
                scannerStatus === 'ACTIVE'
                  ? 'text-emerald-400'
                  : scannerStatus === 'SCANNING'
                  ? 'text-blue-400 animate-pulse'
                  : 'text-amber-400'
              }`}
            >
              {scannerStatus}
            </span>
            {scannerStatus === 'ACTIVE' && (
              <span className="text-[10px] text-slate-500 font-mono">
                (next ~{nextScanSeconds}s)
              </span>
            )}
            {pauseReason && (
              <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                {pauseReason}
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Timeframe Candles & Signals Monitored */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Multi-Timeframe Status */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-500 hidden md:block" />
            <div className="flex items-center gap-1">
              {['M5', 'M15', 'H1', 'H4'].map((tf) =>
                formatCandleStateBadge(tf, candleStates[tf as keyof typeof candleStates] || 'CLOSED')
              )}
            </div>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>

          {/* Active Signals Monitored */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Signals:</span>
            <span className="font-semibold text-emerald-400 font-mono">{signalsMonitoredCount}</span>
            <span className="text-slate-500 text-[10px]">MONITORING</span>
          </div>

          {/* Manual Refresh Trigger */}
          {onManualRefresh && (
            <button
              onClick={onManualRefresh}
              disabled={isRefreshing}
              title="Force Immediate Market Refresh"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Provider Connectivity Details Footer */}
      <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Server className="w-3 h-3 text-slate-500" />
            Twelve Data:
            <span
              className={`font-semibold ${
                providerHealth.twelveData === 'CONNECTED'
                  ? 'text-emerald-400'
                  : providerHealth.twelveData === 'COOLDOWN'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {providerHealth.twelveData}
            </span>
          </span>

          <span className="flex items-center gap-1.5">
            Finnhub:
            <span
              className={`font-semibold ${
                providerHealth.finnhub === 'CONNECTED'
                  ? 'text-emerald-400'
                  : providerHealth.finnhub === 'RATE_LIMITED'
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}
            >
              {providerHealth.finnhub}
            </span>
          </span>
        </div>

        <div className="text-[10px] text-slate-500 font-mono">
          Refresh: Quote {engineStatus.refreshIntervals.quoteRefreshMs / 1000}s | Candle {engineStatus.refreshIntervals.candleRefreshMs / 1000}s | Scan {engineStatus.refreshIntervals.scanIntervalMs / 1000}s
        </div>
      </div>
    </div>
  );
};
