import React, { useState } from 'react';
import {
  Activity,
  Radio,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Layers,
  Server,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { EngineStatus, ProviderStatusInfo } from '../types';
import { API } from '../services/api';

interface LiveEngineStatusProps {
  engineStatus: EngineStatus | null;
  onManualRefresh?: () => void;
  isRefreshing?: boolean;
  onReconnectSuccess?: (status: ProviderStatusInfo) => void;
}

export const LiveEngineStatus: React.FC<LiveEngineStatusProps> = ({
  engineStatus,
  onManualRefresh,
  isRefreshing = false,
  onReconnectSuccess,
}) => {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [detailedStatus, setDetailedStatus] = useState<ProviderStatusInfo | null>(null);
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null);

  const handleReconnect = async () => {
    try {
      setIsReconnecting(true);
      setReconnectMessage(null);
      const res = await API.reconnectProviders();
      setDetailedStatus(res.status);
      setReconnectMessage('Providers reconnected & health verified.');
      if (onReconnectSuccess) {
        onReconnectSuccess(res.status);
      }
      if (onManualRefresh) {
        onManualRefresh();
      }
      setTimeout(() => setReconnectMessage(null), 4000);
    } catch (err: any) {
      setReconnectMessage(`Reconnect failed: ${err.message}`);
      setTimeout(() => setReconnectMessage(null), 5000);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleToggleDetails = async () => {
    const nextState = !isDetailsExpanded;
    setIsDetailsExpanded(nextState);
    if (nextState && !detailedStatus) {
      try {
        const status = await API.getProviderStatus();
        setDetailedStatus(status);
      } catch (err) {
        console.error('Failed to load detailed provider status', err);
      }
    }
  };

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
      case 'FAILOVER':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-800/50">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
            FAILOVER
          </span>
        );
      case 'COOLDOWN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/50">
            <Clock className="w-2.5 h-2.5" />
            COOLDOWN
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

  const getProviderStateColor = (state: string) => {
    switch (state) {
      case 'CONNECTED':
        return 'text-emerald-400';
      case 'CONNECTING':
        return 'text-blue-400';
      case 'COOLDOWN':
        return 'text-amber-400';
      case 'RATE_LIMITED':
        return 'text-orange-400';
      case 'DEGRADED':
        return 'text-yellow-400';
      case 'OFFLINE':
      case 'ERROR':
      case 'DISCONNECTED':
      default:
        return 'text-rose-400';
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

        {/* Right Section: Timeframe Candles & Reconnect Controls */}
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
          </div>

          {/* Manual Reconnect Button (Requirement 13) */}
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            title="Reset cooldowns and re-verify provider connections"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/90 hover:bg-blue-600 text-white font-medium text-[11px] transition-all disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
            <span>{isReconnecting ? 'Reconnecting...' : 'Reconnect'}</span>
          </button>

          {/* Force Refresh Trigger */}
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

          {/* Details toggle */}
          <button
            onClick={handleToggleDetails}
            title="Toggle Provider Health Details"
            className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isDetailsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {reconnectMessage && (
        <div className="mt-2 text-xs py-1 px-2.5 rounded bg-blue-950/60 border border-blue-800/60 text-blue-300 flex items-center gap-1.5 animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{reconnectMessage}</span>
        </div>
      )}

      {/* Provider Connectivity Details Bar */}
      <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Server className="w-3 h-3 text-slate-500" />
            Twelve Data (Primary):
            <span className={`font-semibold ${getProviderStateColor(providerHealth.twelveData)}`}>
              {providerHealth.twelveData}
            </span>
          </span>

          <span className="flex items-center gap-1.5">
            Finnhub (Fallback):
            <span className={`font-semibold ${getProviderStateColor(providerHealth.finnhub)}`}>
              {providerHealth.finnhub}
            </span>
          </span>
        </div>

        <div className="text-[10px] text-slate-500 font-mono">
          Refresh: Quote {engineStatus.refreshIntervals.quoteRefreshMs / 1000}s | Candle {engineStatus.refreshIntervals.candleRefreshMs / 1000}s | Scan {engineStatus.refreshIntervals.scanIntervalMs / 1000}s
        </div>
      </div>

      {/* Expanded Provider Diagnostic Drawer (Requirement 11 & 12) */}
      {isDetailsExpanded && detailedStatus && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 bg-slate-950/70 -mx-3 -mb-3 p-3 rounded-b-lg text-xs">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              Live Provider Diagnostic Status
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              Checked: {new Date(detailedStatus.lastChecked).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Twelve Data Card */}
            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-md">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-slate-200">Twelve Data (Primary)</span>
                <span className={`font-semibold text-[11px] ${getProviderStateColor(detailedStatus.providers.twelveData.state)}`}>
                  {detailedStatus.providers.twelveData.state}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-1.5">{detailedStatus.providers.twelveData.message}</p>
              {detailedStatus.providers.twelveData.cooldownRemainingSec && (
                <div className="text-[11px] text-amber-400 font-mono mb-1">
                  Cooldown Remaining: {detailedStatus.providers.twelveData.cooldownRemainingSec}s
                </div>
              )}
              {detailedStatus.providers.twelveData.rateLimitStats && (
                <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span>Minute Requests: {detailedStatus.providers.twelveData.rateLimitStats.minuteRequests} / {detailedStatus.providers.twelveData.rateLimitStats.minuteLimit}</span>
                  <span>Daily: {detailedStatus.providers.twelveData.rateLimitStats.dailyRequests} / {detailedStatus.providers.twelveData.rateLimitStats.dailyLimit}</span>
                </div>
              )}
            </div>

            {/* Finnhub Card */}
            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-md">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-slate-200">Finnhub (Secondary)</span>
                <span className={`font-semibold text-[11px] ${getProviderStateColor(detailedStatus.providers.finnhub.state)}`}>
                  {detailedStatus.providers.finnhub.state}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-1.5">{detailedStatus.providers.finnhub.message}</p>
              {detailedStatus.providers.finnhub.cooldownRemainingSec && (
                <div className="text-[11px] text-amber-400 font-mono mb-1">
                  Cooldown Remaining: {detailedStatus.providers.finnhub.cooldownRemainingSec}s
                </div>
              )}
              {detailedStatus.providers.finnhub.rateLimitStats && (
                <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span>Minute Requests: {detailedStatus.providers.finnhub.rateLimitStats.minuteRequests} / {detailedStatus.providers.finnhub.rateLimitStats.minuteLimit}</span>
                  <span>Daily: {detailedStatus.providers.finnhub.rateLimitStats.dailyRequests} / {detailedStatus.providers.finnhub.rateLimitStats.dailyLimit}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
