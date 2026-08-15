import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Radio,
  Clock,
  Database,
  Activity,
  AlertTriangle,
  Layers,
  ChevronRight,
} from 'lucide-react';
import {
  InstrumentConfig,
  MarketQuote,
  MarketPrice,
  Signal,
  AssetClass,
  MarketDataStatus,
} from '../types';

interface MarketWatchProps {
  instruments: InstrumentConfig[];
  quotes: Record<string, MarketQuote | MarketPrice>;
  signals: Record<string, Signal>;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenAddModal: () => void;
  providerStatus?: string;
}

const CATEGORY_TABS: { id: string; label: string; icon: string }[] = [
  { id: 'ALL', label: 'All Assets', icon: '🌐' },
  { id: 'FOREX', label: 'Forex', icon: '💱' },
  { id: 'CRYPTO', label: 'Crypto (24/7)', icon: '₿' },
  { id: 'COMMODITIES', label: 'Commodities', icon: '🥇' },
  { id: 'INDICES', label: 'Indices', icon: '📊' },
  { id: 'STOCKS', label: 'Stocks', icon: '🏢' },
];

export const MarketWatch: React.FC<MarketWatchProps> = ({
  instruments,
  quotes,
  signals,
  selectedSymbol,
  onSelectSymbol,
  onOpenAddModal,
  providerStatus,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  // Filter instruments based on active category
  const filteredInstruments = instruments.filter((inst) => {
    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'COMMODITIES') {
      return inst.assetClass === 'COMMODITIES' || (inst.assetClass as any) === 'COMMODITY';
    }
    if (activeCategory === 'INDICES') {
      return inst.assetClass === 'INDICES' || (inst.assetClass as any) === 'INDEX';
    }
    return inst.assetClass === activeCategory;
  });

  // Bitcoin specific data for crypto spotlight
  const btcQuote = quotes['BTC/USD'] || quotes['BTCUSD'];
  const btcSignal = signals['BTC/USD'] || signals['BTCUSD'];

  const getStatusBadge = (status?: MarketDataStatus, isWeekend?: boolean) => {
    if (status === 'RATE_LIMITED') {
      return (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5" />
          LIMIT REACHED
        </span>
      );
    }
    if (status === 'UNAVAILABLE') {
      return (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          UNAVAILABLE
        </span>
      );
    }
    if (status === 'STALE') {
      return (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
          STALE
        </span>
      );
    }
    if (status === 'OFFLINE' || isWeekend) {
      return (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          OFFLINE
        </span>
      );
    }
    if (status === 'TEST_DATA') {
      return (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
          TEST DATA
        </span>
      );
    }
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        LIVE
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
      {/* Header & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
          <h2 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
            Market Watch & Real Data Feed
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 font-mono">
            Twelve Data Provider
          </span>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-none">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-bold'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <span className="text-xs">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}

          <button
            id="btn-add-instrument"
            onClick={onOpenAddModal}
            className="flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-950/60 px-2.5 py-1 rounded-lg border border-blue-900/50 transition-colors ml-1"
            title="Add Custom Instrument"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Add Asset</span>
          </button>
        </div>
      </div>

      {/* Bitcoin & Crypto Spotlight Card (Active When Crypto or All is Selected) */}
      {(activeCategory === 'ALL' || activeCategory === 'CRYPTO') && btcQuote && (
        <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl text-amber-400 font-bold shadow-sm">
              ₿
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Bitcoin</span>
                <span className="text-xs font-mono font-bold text-amber-400">BTC/USD</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-medium">
                  24/7 Market
                </span>
                {getStatusBadge(btcQuote.status)}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Source: {btcQuote.dataSource || 'Twelve Data Direct'}</span>
                <span>•</span>
                <span>Coinbase Order Flow</span>
                <span>•</span>
                <span>Last Update: {new Date(btcQuote.timestamp).toLocaleTimeString()}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-medium">Current Price</div>
              <div className="text-base font-mono font-bold text-white tracking-tight">
                {btcQuote.price > 0 ? `$${btcQuote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-400 uppercase font-medium">24h Change</div>
              <div
                className={`text-sm font-mono font-bold flex items-center gap-1 ${
                  btcQuote.changePercent24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {btcQuote.changePercent24h >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {btcQuote.changePercent24h >= 0 ? '+' : ''}
                {btcQuote.changePercent24h.toFixed(2)}%
              </div>
            </div>

            <button
              onClick={() => onSelectSymbol('BTC/USD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                selectedSymbol === 'BTC/USD' || selectedSymbol === 'BTCUSD'
                  ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                  : 'bg-slate-800 text-amber-400 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <span>{selectedSymbol === 'BTC/USD' || selectedSymbol === 'BTCUSD' ? 'Selected' : 'Analyze BTC'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Grid of All Filtered Instruments */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {filteredInstruments.map((inst) => {
          const normKey = inst.symbol.replace('/', '');
          const quote = quotes[inst.symbol] || quotes[normKey];
          const signal = signals[inst.symbol] || signals[normKey];
          const isSelected =
            selectedSymbol === inst.symbol || selectedSymbol === normKey;
          const isPositive = quote ? quote.change24h >= 0 : true;
          const isUnavailable = quote?.status === 'UNAVAILABLE' || (quote && quote.price === 0);

          return (
            <div
              key={inst.symbol}
              id={`market-card-${inst.symbol.replace('/', '-')}`}
              onClick={() => onSelectSymbol(inst.symbol)}
              className={`p-3 rounded-lg border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? 'bg-blue-600/10 border-blue-500/60 ring-1 ring-blue-500/40 shadow-sm'
                  : isUnavailable
                  ? 'bg-slate-900/60 border-slate-800/80 opacity-80 hover:opacity-100 hover:border-slate-700'
                  : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Active Selection Indicator */}
              {isSelected && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500"></div>
              )}

              {/* Instrument Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{inst.icon}</span>
                    <p className={`text-xs font-bold ${isSelected ? 'text-blue-400' : 'text-white'}`}>
                      {inst.symbol}
                    </p>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-medium">
                      {inst.assetClass}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate max-w-[120px] mt-0.5">
                    {inst.displayName || inst.name}
                  </p>
                </div>

                <div className="text-right">
                  {isUnavailable ? (
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-slate-400 font-semibold block">
                        UNAVAILABLE
                      </span>
                      <span className="text-[8px] text-slate-400 block leading-tight">
                        No Provider Feed
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-mono font-bold text-white tracking-tight">
                        {quote && quote.price > 0 ? quote.price.toFixed(inst.digits) : '---'}
                      </p>
                      {quote ? (
                        <p
                          className={`text-[10px] font-mono font-medium flex items-center justify-end ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {quote.changePercent24h.toFixed(2)}%
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-500">Connecting...</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Status Badge & Feed Metadata */}
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {getStatusBadge(quote?.status, quote?.marketStatus === 'WEEKEND')}
                </div>

                <div className="text-right">
                  {isUnavailable ? (
                    <span className="text-[9px] text-slate-400">Twelve Data Free Restricted</span>
                  ) : signal && signal.direction !== 'WAIT' ? (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        signal.direction === 'BUY'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {signal.direction} ({signal.aiConfidence}%)
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-500 font-mono">
                      {quote?.marketStatus === 'OPEN' ? '24/7 OPEN' : quote?.marketStatus || 'OPEN'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
