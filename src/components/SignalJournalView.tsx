import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Filter,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ExternalLink,
  Shield,
  Layers,
  Database,
  Download,
  RotateCcw,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  TrendingUp,
  Activity,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { Signal, SignalStatus, TradeType } from '../types';

interface SignalJournalViewProps {
  signals: Signal[];
  onSelectSignal?: (signal: Signal) => void;
  onRefresh?: () => void;
}

export const SignalJournalView: React.FC<SignalJournalViewProps> = ({
  signals,
  onSelectSignal,
  onRefresh,
}) => {
  // Navigation tabs: 'ALL' | 'ACTIVE' | 'HISTORY'
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'HISTORY'>('ALL');

  // Filter states
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterStrategy, setFilterStrategy] = useState<string>('ALL');
  const [filterTradeType, setFilterTradeType] = useState<string>('ALL');
  const [filterDirection, setFilterDirection] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Selected signal for detailed audit modal
  const [detailedSignal, setDetailedSignal] = useState<Signal | null>(null);

  // Filter logic
  const filteredSignals = useMemo(() => {
    return signals.filter((sig) => {
      // Tab filter
      if (activeTab === 'ACTIVE' && sig.status !== 'ACTIVE') return false;
      if (activeTab === 'HISTORY' && sig.status === 'ACTIVE') return false;

      // Symbol
      if (filterSymbol !== 'ALL') {
        const normFilter = filterSymbol.replace(/[/_ -]/g, '').toUpperCase();
        const normSig = sig.instrument.replace(/[/_ -]/g, '').toUpperCase();
        if (normSig !== normFilter) return false;
      }

      // Direction
      if (filterDirection !== 'ALL' && sig.direction !== filterDirection) return false;

      // Trade Type
      if (filterTradeType !== 'ALL' && sig.tradeType !== filterTradeType) return false;

      // Strategy
      if (filterStrategy !== 'ALL') {
        const normStrat = (sig.strategy || '').replace(/[_ -]/g, '').toUpperCase();
        const normFilter = filterStrategy.replace(/[_ -]/g, '').toUpperCase();
        if (normStrat !== normFilter) return false;
      }

      // Status
      if (filterStatus !== 'ALL') {
        if (filterStatus === 'ACTIVE' && sig.status !== 'ACTIVE') return false;
        if (
          filterStatus === 'WINS' &&
          sig.status !== 'TP1_HIT' &&
          sig.status !== 'TP2_HIT' &&
          sig.status !== 'TP_HIT'
        )
          return false;
        if (filterStatus === 'LOSSES' && sig.status !== 'SL_HIT') return false;
        if (filterStatus === 'AMBIGUOUS' && sig.status !== 'AMBIGUOUS') return false;
        if (filterStatus === 'EXPIRED' && sig.status !== 'EXPIRED') return false;
        if (
          filterStatus === 'INVALIDATED' &&
          sig.status !== 'INVALIDATED' &&
          sig.status !== 'CANCELLED'
        )
          return false;
      }

      // Search keyword
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const inId = sig.id.toLowerCase().includes(q);
        const inExpl = (sig.setupExplanation || '').toLowerCase().includes(q);
        const inInst = sig.instrument.toLowerCase().includes(q);
        const inStrat = (sig.strategy || '').toLowerCase().includes(q);
        const inReason = (sig.reasons || []).some((r) => r.toLowerCase().includes(q));
        const inCond = (sig.conditionsDetected || []).some((c) => c.toLowerCase().includes(q));
        const inInvalid = (sig.invalidationCondition || '').toLowerCase().includes(q);
        if (!inId && !inExpl && !inInst && !inStrat && !inReason && !inCond && !inInvalid) {
          return false;
        }
      }

      return true;
    });
  }, [
    signals,
    activeTab,
    filterSymbol,
    filterDirection,
    filterTradeType,
    filterStrategy,
    filterStatus,
    searchTerm,
  ]);

  // Overall Statistics calculated across ALL signals in memory/journal
  const stats = useMemo(() => {
    let active = 0;
    let wins = 0;
    let losses = 0;
    let ambiguous = 0;
    let expired = 0;
    let cancelled = 0;
    let totalR = 0;
    let grossWinR = 0;
    let grossLossR = 0;

    for (const s of signals) {
      if (s.status === 'ACTIVE') {
        active++;
      } else {
        if (s.status === 'TP1_HIT' || s.status === 'TP2_HIT' || s.status === 'TP_HIT') {
          wins++;
          const r = s.outcomeR !== undefined ? s.outcomeR : s.riskRewardRatio;
          grossWinR += r;
          totalR += r;
        } else if (s.status === 'SL_HIT') {
          losses++;
          const r = s.outcomeR !== undefined ? s.outcomeR : -1.0;
          grossLossR += Math.abs(r);
          totalR += r;
        } else if (s.status === 'AMBIGUOUS') {
          ambiguous++;
        } else if (s.status === 'EXPIRED') {
          expired++;
        } else if (s.status === 'CANCELLED' || s.status === 'INVALIDATED') {
          cancelled++;
        }
      }
    }

    const completed = wins + losses;
    const winRate = completed > 0 ? Number(((wins / completed) * 100).toFixed(1)) : 0;
    const avgR = completed > 0 ? Number((totalR / completed).toFixed(2)) : 0;
    const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : grossWinR > 0 ? 99 : 1.0;

    return {
      total: signals.length,
      active,
      completed: signals.length - active,
      wins,
      losses,
      ambiguous,
      expired,
      cancelled,
      winRate,
      totalR: Number(totalR.toFixed(2)),
      avgR,
      profitFactor,
    };
  }, [signals]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredSignals.length / pageSize) || 1;
  const paginatedSignals = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSignals.slice(start, start + pageSize);
  }, [filteredSignals, currentPage, pageSize]);

  // Handle page reset on filter change
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setCurrentPage(1);
  };

  const getStatusBadge = (status: SignalStatus, outcomeR?: number) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
            ACTIVE
          </span>
        );
      case 'TP1_HIT':
      case 'TP_HIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            TP1 HIT (+{outcomeR !== undefined ? outcomeR : 2.0}R)
          </span>
        );
      case 'TP2_HIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3 h-3" />
            TP2 HIT (+{outcomeR !== undefined ? outcomeR : 3.2}R)
          </span>
        );
      case 'SL_HIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" />
            SL HIT ({outcomeR !== undefined ? outcomeR : -1.0}R)
          </span>
        );
      case 'AMBIGUOUS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            AMBIGUOUS (0.0R)
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            EXPIRED
          </span>
        );
      case 'CANCELLED':
      case 'INVALIDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-800/80 text-slate-400 border border-slate-700/80">
            {status}
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  const calculateDuration = (start: number, end?: number) => {
    const elapsed = (end || Date.now()) - start;
    const mins = Math.floor(elapsed / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${Math.max(1, mins)}m`;
  };

  // Export CSV handler
  const handleExportCSV = () => {
    window.open('/api/signals/journal-export?format=csv', '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: Storage Status & Performance Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Signals</div>
          <div className="text-lg font-bold text-white mt-0.5 flex items-center justify-between">
            <span>{stats.total}</span>
            <Database className="w-4 h-4 text-blue-400" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Active Trades</div>
          <div className="text-lg font-bold text-blue-400 mt-0.5 flex items-center justify-between">
            <span>{stats.active}</span>
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Completed</div>
          <div className="text-lg font-bold text-slate-200 mt-0.5">{stats.completed}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Win Rate</div>
          <div
            className={`text-lg font-bold mt-0.5 ${
              stats.winRate >= 60
                ? 'text-emerald-400'
                : stats.winRate >= 45
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {stats.winRate}%
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Realized R</div>
          <div
            className={`text-lg font-bold mt-0.5 ${
              stats.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {stats.totalR > 0 ? `+${stats.totalR}R` : `${stats.totalR}R`}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Profit Factor</div>
          <div className="text-lg font-bold text-slate-200 mt-0.5">
            {stats.profitFactor.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Main Journal Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        {/* Header & Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Permanent Signal History & Audit Journal
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
                <Database className="w-2.5 h-2.5" />
                Persistent Disk Storage
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Every algorithmic signal decision is permanently recorded with full parameters, setup
              fingerprint, execution telemetry, and verified outcome tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Switcher */}
            <div className="bg-slate-950 p-1 border border-slate-800 rounded-lg flex items-center gap-1 text-xs">
              <button
                onClick={() => handleFilterChange(setActiveTab, 'ALL')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === 'ALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Signals ({stats.total})
              </button>
              <button
                onClick={() => handleFilterChange(setActiveTab, 'ACTIVE')}
                className={`px-3 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'ACTIVE'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                Active ({stats.active})
              </button>
              <button
                onClick={() => handleFilterChange(setActiveTab, 'HISTORY')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === 'HISTORY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                History ({stats.completed})
              </button>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
              title="Download full journal CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex items-center gap-2.5 flex-wrap text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search ID, explanation, or condition..."
              value={searchTerm}
              onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-xs w-full font-medium"
            />
          </div>

          {/* Instrument Filter */}
          <select
            value={filterSymbol}
            onChange={(e) => handleFilterChange(setFilterSymbol, e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs font-medium"
          >
            <option value="ALL">All Instruments</option>
            <option value="EURUSD">EURUSD</option>
            <option value="GBPUSD">GBPUSD</option>
            <option value="USDJPY">USDJPY</option>
            <option value="XAUUSD">XAUUSD</option>
            <option value="BTCUSD">BTCUSD</option>
            <option value="ETHUSD">ETHUSD</option>
            <option value="NAS100">NAS100</option>
            <option value="SPX500">SPX500</option>
          </select>

          {/* Direction Filter */}
          <select
            value={filterDirection}
            onChange={(e) => handleFilterChange(setFilterDirection, e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs font-medium"
          >
            <option value="ALL">All Directions</option>
            <option value="BUY">BUY Only</option>
            <option value="SELL">SELL Only</option>
          </select>

          {/* Strategy Filter */}
          <select
            value={filterStrategy}
            onChange={(e) => handleFilterChange(setFilterStrategy, e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs font-medium"
          >
            <option value="ALL">All Strategies</option>
            <option value="TREND_FOLLOWING">Trend Following</option>
            <option value="BREAKOUT">Breakout</option>
            <option value="PULLBACK">Pullback</option>
            <option value="LIQUIDITY_SWEEP">Liquidity Sweep</option>
            <option value="SUPPORT_RESISTANCE">Support / Resistance</option>
          </select>

          {/* Trade Type Filter */}
          <select
            value={filterTradeType}
            onChange={(e) => handleFilterChange(setFilterTradeType, e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs font-medium"
          >
            <option value="ALL">All Styles</option>
            <option value="SCALP">SCALP (M5)</option>
            <option value="DAY">DAY (M15)</option>
            <option value="SWING">SWING (H1)</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => handleFilterChange(setFilterStatus, e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="WINS">Wins (TP Hit)</option>
            <option value="LOSSES">Losses (SL Hit)</option>
            <option value="AMBIGUOUS">Ambiguous</option>
            <option value="EXPIRED">Expired</option>
            <option value="INVALIDATED">Invalidated / Cancelled</option>
          </select>

          {/* Reset Filters */}
          {(filterSymbol !== 'ALL' ||
            filterDirection !== 'ALL' ||
            filterStrategy !== 'ALL' ||
            filterTradeType !== 'ALL' ||
            filterStatus !== 'ALL' ||
            searchTerm) && (
            <button
              onClick={() => {
                setFilterSymbol('ALL');
                setFilterDirection('ALL');
                setFilterStrategy('ALL');
                setFilterTradeType('ALL');
                setFilterStatus('ALL');
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 underline font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Signals Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-widest text-[10px] font-bold">
                <th className="py-3 px-3">Signal ID & Time</th>
                <th className="py-3 px-3">Instrument</th>
                <th className="py-3 px-3">Direction & Strat</th>
                <th className="py-3 px-3">Style</th>
                <th className="py-3 px-3">Entry</th>
                <th className="py-3 px-3">SL</th>
                <th className="py-3 px-3">TP1 / TP2</th>
                <th className="py-3 px-3">R:R</th>
                <th className="py-3 px-3">AI Conf</th>
                <th className="py-3 px-3">Status / Outcome</th>
                <th className="py-3 px-3 text-right">Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {paginatedSignals.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <BookOpen className="w-6 h-6 text-slate-600" />
                      <div className="font-semibold text-slate-400">No signals found</div>
                      <div className="text-xs text-slate-500">
                        Adjust your filters or generate a new market scan.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedSignals.map((sig) => (
                  <tr
                    key={sig.id}
                    className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                    onClick={() => setDetailedSignal(sig)}
                  >
                    <td className="py-3 px-3 font-mono">
                      <div className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                        <span>{sig.id}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(sig.timestamp || sig.createdAt || Date.now()).toLocaleString(
                          [],
                          {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                      </div>
                      {sig.provider && (
                        <div className="text-[9px] text-blue-400/80 font-mono">
                          {sig.provider}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 font-bold text-slate-200">
                      <div>{sig.instrument}</div>
                      {sig.candleTimestamp && (
                        <div className="text-[9px] text-slate-400 font-mono font-normal">
                          Candle:{' '}
                          {new Date(sig.candleTimestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                          sig.direction === 'BUY'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : sig.direction === 'SELL'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {sig.direction}
                      </span>
                      {sig.strategy && (
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate max-w-[110px]">
                          {sig.strategy}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 font-medium text-slate-300">{sig.tradeType}</td>

                    <td className="py-3 px-3 font-mono text-white font-semibold">
                      {sig.suggestedEntry}
                    </td>

                    <td className="py-3 px-3 font-mono text-rose-400">{sig.stopLoss}</td>

                    <td className="py-3 px-3 font-mono text-emerald-400">
                      <div>{sig.takeProfit1}</div>
                      {sig.takeProfit2 && (
                        <div className="text-[10px] text-emerald-500">{sig.takeProfit2}</div>
                      )}
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-200 font-bold">
                      1:{sig.riskRewardRatio.toFixed(1)}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1 font-mono font-bold text-blue-400">
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        <span>{sig.aiConfidence || sig.confidenceScore}/100</span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {getStatusBadge(sig.status, sig.outcomeR)}
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {calculateDuration(
                            sig.timestamp || sig.createdAt || 0,
                            sig.closedAt
                          )}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailedSignal(sig);
                        }}
                        className="p-1.5 bg-slate-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-300 rounded transition-colors"
                        title="View Full Audit Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Showing {filteredSignals.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(currentPage * pageSize, filteredSignals.length)} of{' '}
              {filteredSignals.length} filtered signals ({signals.length} total)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Page Size selector */}
            <div className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* Prev / Next buttons */}
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono font-medium text-slate-200">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Signal Audit Detail Modal */}
      {detailedSignal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white font-mono">
                      {detailedSignal.id}
                    </h3>
                    {getStatusBadge(detailedSignal.status, detailedSignal.outcomeR)}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{detailedSignal.instrument}</span>
                    <span>•</span>
                    <span>{detailedSignal.tradeType}</span>
                    <span>•</span>
                    <span>{detailedSignal.strategy || 'STRATEGY CONFLUENCE'}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setDetailedSignal(null)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Geometry Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">
                  Suggested Entry
                </div>
                <div className="text-base font-mono font-bold text-white mt-0.5">
                  {detailedSignal.suggestedEntry}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">
                  Stop Loss (SL)
                </div>
                <div className="text-base font-mono font-bold text-rose-400 mt-0.5">
                  {detailedSignal.stopLoss}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">
                  Take Profit 1 (TP1)
                </div>
                <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">
                  {detailedSignal.takeProfit1}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">
                  Take Profit 2 (TP2)
                </div>
                <div className="text-base font-mono font-bold text-emerald-300 mt-0.5">
                  {detailedSignal.takeProfit2 || 'N/A'}
                </div>
              </div>
            </div>

            {/* Execution Timestamps & Setup Fingerprint */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                Deterministic Setup Telemetry
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-300 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 font-sans">Created: </span>
                  {new Date(
                    detailedSignal.timestamp || detailedSignal.createdAt || Date.now()
                  ).toLocaleString()}
                </div>
                <div>
                  <span className="text-slate-400 font-sans">Provider: </span>
                  {detailedSignal.provider || 'Twelve Data'}
                </div>
                {detailedSignal.candleTimestamp && (
                  <div>
                    <span className="text-slate-400 font-sans">Originating Candle: </span>
                    {new Date(detailedSignal.candleTimestamp).toLocaleString()}
                  </div>
                )}
                {detailedSignal.closedAt && (
                  <div>
                    <span className="text-slate-400 font-sans">Closed At: </span>
                    {new Date(detailedSignal.closedAt).toLocaleString()}
                  </div>
                )}
              </div>
              {detailedSignal.setupFingerprint && (
                <div className="pt-2 border-t border-slate-850">
                  <div className="text-[10px] text-slate-400 font-sans uppercase">
                    Setup Fingerprint (Deduplication Key)
                  </div>
                  <div className="text-[10px] font-mono text-blue-400 break-all bg-slate-900 p-2 rounded mt-1 border border-slate-800">
                    {detailedSignal.setupFingerprint}
                  </div>
                </div>
              )}
            </div>

            {/* Strategy Rationale & Explanation */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Setup Explanation & Institutional Thesis
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
                {detailedSignal.setupExplanation || 'Deterministic algorithmic setup generated.'}
              </div>
            </div>

            {/* Invalidation Conditions */}
            {detailedSignal.invalidationCondition && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Invalidation Condition</span>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300">
                  {detailedSignal.invalidationCondition}
                </div>
              </div>
            )}

            {/* Conditions Detected */}
            {detailedSignal.conditionsDetected && detailedSignal.conditionsDetected.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Confluence Conditions Detected ({detailedSignal.conditionsDetected.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detailedSignal.conditionsDetected.map((cond, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-slate-950 border border-slate-800 text-slate-300 rounded text-[11px] font-medium"
                    >
                      {cond}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Outcome Details if Closed */}
            {detailedSignal.status !== 'ACTIVE' && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                  Verified Outcome Summary
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-slate-300">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Realized Gain/Loss</div>
                    <div
                      className={`text-sm font-bold font-mono ${
                        (detailedSignal.outcomeR || 0) > 0
                          ? 'text-emerald-400'
                          : (detailedSignal.outcomeR || 0) < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {detailedSignal.outcomeR !== undefined
                        ? detailedSignal.outcomeR > 0
                          ? `+${detailedSignal.outcomeR}R`
                          : `${detailedSignal.outcomeR}R`
                        : '0.0R'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Closing Price</div>
                    <div className="text-sm font-bold font-mono text-white">
                      {detailedSignal.closedPrice || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Tracking Provider</div>
                    <div className="text-sm font-mono text-blue-400">
                      {detailedSignal.closedByProvider || 'Market Provider'}
                    </div>
                  </div>
                </div>
                {detailedSignal.closedReason && (
                  <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-850">
                    <span className="font-semibold text-slate-300">Close Reason: </span>
                    {detailedSignal.closedReason}
                  </div>
                )}
              </div>
            )}

            {/* Evaluation Log (Audit Trail) */}
            {detailedSignal.evaluationLog && detailedSignal.evaluationLog.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Real-time Tick Evaluation Trail ({detailedSignal.evaluationLog.length} ticks)
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-36 overflow-y-auto space-y-1 font-mono text-[10px]">
                  {detailedSignal.evaluationLog.map((log, idx) => (
                    <div key={idx} className="flex items-center justify-between text-slate-400">
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className="text-white">Price: {log.price}</span>
                      <span className="text-blue-400">State: {log.state}</span>
                      <span>{log.provider}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setDetailedSignal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
