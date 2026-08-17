import React, { useState } from 'react';
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
} from 'lucide-react';
import { Signal, SignalStatus, TradeType } from '../types';

interface SignalJournalViewProps {
  signals: Signal[];
  onSelectSignal?: (signal: Signal) => void;
}

export const SignalJournalView: React.FC<SignalJournalViewProps> = ({ signals, onSelectSignal }) => {
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filtered = signals.filter((sig) => {
    if (filterSymbol !== 'ALL' && sig.instrument !== filterSymbol) return false;
    if (filterStatus === 'ACTIVE' && sig.status !== 'ACTIVE') return false;
    if (filterStatus === 'WINS' && sig.status !== 'TP1_HIT' && sig.status !== 'TP2_HIT' && sig.status !== 'TP_HIT') return false;
    if (filterStatus === 'LOSSES' && sig.status !== 'SL_HIT') return false;
    if (filterStatus === 'AMBIGUOUS' && sig.status !== 'AMBIGUOUS') return false;
    if (filterStatus === 'EXPIRED' && sig.status !== 'EXPIRED') return false;
    if (filterStatus === 'INVALIDATED' && sig.status !== 'INVALIDATED' && sig.status !== 'CANCELLED') return false;
    if (searchTerm && !sig.id.toLowerCase().includes(searchTerm.toLowerCase()) && !sig.setupExplanation.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getStatusBadge = (status: SignalStatus, outcomeR?: number) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-600/10 text-blue-400 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
            ACTIVE
          </span>
        );
      case 'TP1_HIT':
      case 'TP_HIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            TP1 HIT (+{outcomeR || 2.0}R)
          </span>
        );
      case 'TP2_HIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            TP2 HIT (+{outcomeR || 3.2}R)
          </span>
        );
      case 'SL_HIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            SL HIT (-1.0R)
          </span>
        );
      case 'AMBIGUOUS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
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
    return `${mins}m`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Journal Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Immutable Signal Journal & Live Tracker</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Every algorithmic signal decision is permanently recorded with full parameters, rationale, and verified outcome tracking.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2.5 flex-wrap text-xs">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search Signal ID or Reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-xs w-48 font-medium"
            />
          </div>

          {/* Instrument Filter */}
          <select
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs font-medium"
          >
            <option value="ALL">All Instruments</option>
            <option value="EURUSD">EURUSD</option>
            <option value="GBPUSD">GBPUSD</option>
            <option value="XAUUSD">XAUUSD</option>
            <option value="NAS100">NAS100</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="WINS">Wins (TP Hit)</option>
            <option value="LOSSES">Losses (SL Hit)</option>
            <option value="AMBIGUOUS">Ambiguous</option>
            <option value="EXPIRED">Expired</option>
            <option value="INVALIDATED">Invalidated / Cancelled</option>
          </select>
        </div>
      </div>

      {/* Signals Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-500 border-b border-slate-800 uppercase tracking-widest text-[10px] font-bold">
              <th className="py-2.5 px-3">Signal ID & Time</th>
              <th className="py-2.5 px-3">Instrument</th>
              <th className="py-2.5 px-3">Direction & Strat</th>
              <th className="py-2.5 px-3">Style</th>
              <th className="py-2.5 px-3">Entry</th>
              <th className="py-2.5 px-3">SL</th>
              <th className="py-2.5 px-3">TP1 / TP2</th>
              <th className="py-2.5 px-3">R:R</th>
              <th className="py-2.5 px-3">AI Conf</th>
              <th className="py-2.5 px-3">Status / Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500">
                  No signals matched your filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((sig) => (
                <tr
                  key={sig.id}
                  className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                  onClick={() => onSelectSignal?.(sig)}
                >
                  <td className="py-3 px-3 font-mono">
                    <div className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors">
                      {sig.id}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(sig.timestamp || sig.createdAt || Date.now()).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
                      <div className="text-[9px] text-slate-500 font-mono font-normal">
                        Candle: {new Date(sig.candleTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                        sig.direction === 'BUY'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : sig.direction === 'SELL'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {sig.direction}
                    </span>
                    {sig.strategy && (
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate max-w-[100px]">
                        {sig.strategy}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3 font-medium text-slate-400">
                    {sig.tradeType}
                  </td>

                  <td className="py-3 px-3 font-mono text-white font-semibold">
                    {sig.suggestedEntry}
                  </td>

                  <td className="py-3 px-3 font-mono text-rose-400">
                    {sig.stopLoss}
                  </td>

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
                      <span>{sig.aiConfidence}/100</span>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    {getStatusBadge(sig.status, sig.outcomeR)}
                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{calculateDuration(sig.timestamp, sig.closedAt)}</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
