import React from 'react';
import {
  Activity,
  Shield,
  Volume2,
  VolumeX,
  Bell,
  RefreshCw,
  Zap,
  Sliders,
  Radio,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { RiskSettings, PerformanceAnalytics } from '../types';

interface HeaderProps {
  selectedSymbol: string;
  isScanning: boolean;
  onTriggerScan: () => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
  onOpenRiskModal: () => void;
  onOpenNotifications: () => void;
  unreadCount: number;
  dataSource: string;
  marketStatus: 'OPEN' | 'CLOSED' | 'WEEKEND';
  latencyMs: number;
  lastUpdated: number;
  performance?: PerformanceAnalytics | null;
  riskSettings: RiskSettings;
  activeView: 'TERMINAL' | 'ANALYSIS' | 'JOURNAL' | 'PERFORMANCE' | 'BACKTEST';
  onSelectView: (view: 'TERMINAL' | 'ANALYSIS' | 'JOURNAL' | 'PERFORMANCE' | 'BACKTEST') => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedSymbol,
  isScanning,
  onTriggerScan,
  audioMuted,
  onToggleAudio,
  onOpenRiskModal,
  onOpenNotifications,
  unreadCount,
  dataSource,
  marketStatus,
  latencyMs,
  lastUpdated,
  performance,
  riskSettings,
  activeView,
  onSelectView,
}) => {
  const formatTime = (ts: number) => {
    if (!ts) return '--:--:--';
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <header id="main-header" className="bg-slate-900 border-b border-slate-800 text-slate-200 sticky top-0 z-40 shrink-0">
      {/* Top Meta Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800/60">
        <div className="flex items-center gap-4 flex-wrap">
          {/* System Status */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">System Status</span>
            <div className="flex items-center gap-2 mt-0.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  marketStatus === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              ></div>
              <span
                className={`text-xs font-medium uppercase ${
                  marketStatus === 'OPEN' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {marketStatus === 'OPEN' ? 'Data Stream Active' : marketStatus === 'WEEKEND' ? 'Weekend Closed' : 'Session Paused'}
              </span>
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block"></div>

          {/* Feed Provider */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Market Feed</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-0.5">
              <Radio className="w-3 h-3 text-blue-400" />
              <span className="font-medium truncate max-w-[180px]" title={dataSource}>
                {dataSource || 'Live Financial Stream'}
              </span>
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block"></div>

          {/* Last Update */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Last Update</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 mt-0.5">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{formatTime(lastUpdated)}</span>
              <span className="text-[10px] text-emerald-500 font-semibold">({latencyMs}ms)</span>
            </div>
          </div>
        </div>

        {/* Risk & Performance snapshot */}
        <div className="flex items-center gap-3 text-xs">
          <div className="hidden md:flex items-center gap-2 bg-slate-800/60 px-3 py-1 rounded border border-slate-700/60">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Min R:R</span>
            <span className="text-emerald-400 font-mono font-bold">1:{riskSettings.minRiskReward.toFixed(1)}</span>
            <span className="text-slate-700">|</span>
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Min Conf</span>
            <span className="text-blue-400 font-mono font-bold">{riskSettings.minConfidenceRequired}/100</span>
          </div>

          {performance && (
            <div className="hidden lg:flex items-center gap-2 bg-slate-800/60 px-3 py-1 rounded border border-slate-700/60">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] uppercase text-slate-400 font-semibold">Win Rate</span>
              <span className="text-white font-mono font-bold">{performance.winRate}%</span>
              <span className="text-slate-700">|</span>
              <span className="text-[10px] uppercase text-slate-400 font-semibold">Net R</span>
              <span className={`font-mono font-bold ${performance.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {performance.totalR >= 0 ? `+${performance.totalR}R` : `${performance.totalR}R`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shrink-0 shadow-sm shadow-blue-600/30">
            <span className="font-bold text-white text-lg italic">E</span>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white uppercase flex items-center gap-2">
              Eazzy AI <span className="text-blue-500 font-light">Signal Agent</span>
            </h1>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <nav className="flex items-center p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            id="nav-terminal"
            onClick={() => onSelectView('TERMINAL')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeView === 'TERMINAL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Trading Terminal
          </button>
          <button
            id="nav-analysis"
            onClick={() => onSelectView('ANALYSIS')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeView === 'ANALYSIS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Market Analysis ({selectedSymbol})
          </button>
          <button
            id="nav-journal"
            onClick={() => onSelectView('JOURNAL')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeView === 'JOURNAL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Signal Journal
          </button>
          <button
            id="nav-performance"
            onClick={() => onSelectView('PERFORMANCE')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeView === 'PERFORMANCE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Performance & Calibration
          </button>
          <button
            id="nav-backtest"
            onClick={() => onSelectView('BACKTEST')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeView === 'BACKTEST'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Event-Based Backtest</span>
          </button>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            id="btn-trigger-scan"
            onClick={onTriggerScan}
            disabled={isScanning}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm shadow-blue-600/30 disabled:opacity-50 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : `Run AI Scan (${selectedSymbol})`}</span>
          </button>

          <button
            id="btn-toggle-audio"
            onClick={onToggleAudio}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-colors"
            title={audioMuted ? 'Unmute Audio Chimes' : 'Mute Audio Chimes'}
          >
            {audioMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <button
            id="btn-risk-settings"
            onClick={onOpenRiskModal}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-colors"
            title="Risk Management & Engine Rules"
          >
            <Sliders className="w-4 h-4 text-blue-400" />
          </button>

          <button
            id="btn-notifications"
            onClick={onOpenNotifications}
            className="relative p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-colors"
            title="Signal Notifications & Alerts"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-slate-900">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
