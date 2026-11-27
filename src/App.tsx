import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { MarketWatch } from './components/MarketWatch';
import { TradingChart } from './components/TradingChart';
import { ActiveSignalsFeed } from './components/ActiveSignalsFeed';
import { MarketAnalysisView } from './components/MarketAnalysisView';
import { SignalJournalView } from './components/SignalJournalView';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { BacktestView } from './components/BacktestView';
import { RiskSettingsModal } from './components/RiskSettingsModal';
import { AddInstrumentModal } from './components/AddInstrumentModal';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { LiveEngineStatus } from './components/LiveEngineStatus';
import { API } from './services/api';
import { playSignalChime, playOutcomeSound } from './utils/audio';
import {
  InstrumentConfig,
  MarketQuote,
  MarketCandle,
  Timeframe,
  TradeType,
  Signal,
  PerformanceAnalytics,
  RiskSettings,
  SignalNotification,
  EngineStatus,
  DataSyncState,
} from './types';
import { mergeCandleUpdates, applyLiveQuoteToCandles } from './utils/candleLifecycle';

const defaultRiskSettings: RiskSettings = {
  maxRiskPerTradePercent: 1.0,
  minRiskReward: 1.5,
  maxSimultaneousSignals: 4,
  maxDailySignals: 10,
  maxConsecutiveLosses: 3,
  maxDailyDrawdownPercent: 3.0,
  minConfidenceRequired: 60,
};

function getSignalKey(symbol: string, tradeType: TradeType): string {
  return `${symbol}::${tradeType}`;
}

function getFallbackInstrumentMeta(symbol: string): InstrumentConfig {
  const upper = symbol.toUpperCase();
  if (upper.includes('XAU')) {
    return {
      symbol,
      name: 'Gold / US Dollar',
      assetClass: 'COMMODITIES',
      pipSize: 0.1,
      digits: 2,
      icon: '🥇',
      description: 'Spot Gold precious metal safe haven and monetary inflation hedge.',
    };
  }
  if (upper.includes('XAG')) {
    return {
      symbol,
      name: 'Silver / US Dollar',
      assetClass: 'COMMODITIES',
      pipSize: 0.01,
      digits: 3,
      icon: '🥈',
      description: 'Spot Silver industrial and monetary precious metal.',
    };
  }
  if (upper.includes('BTC') || upper.includes('ETH') || upper.includes('SOL')) {
    return {
      symbol,
      name: upper,
      assetClass: 'CRYPTO',
      pipSize: upper.includes('BTC') ? 1.0 : upper.includes('ETH') ? 0.1 : 0.01,
      digits: 2,
      icon: '₿',
      description: '24/7 Cryptocurrency Asset',
    };
  }
  if (upper === 'NAS100' || upper === 'SPX500' || upper === 'US30') {
    return {
      symbol,
      name: upper,
      assetClass: 'INDICES',
      pipSize: upper === 'SPX500' ? 0.5 : 1.0,
      digits: 2,
      icon: '📊',
      description: 'Equity Benchmark Index',
    };
  }
  return {
    symbol,
    name: symbol,
    assetClass: 'FOREX',
    pipSize: upper.includes('JPY') ? 0.01 : 0.0001,
    digits: upper.includes('JPY') ? 3 : 5,
    icon: '📊',
    description: 'Active Financial Asset',
  };
}

export function App() {
  // Navigation & View
  const [activeView, setActiveView] = useState<'TERMINAL' | 'ANALYSIS' | 'JOURNAL' | 'PERFORMANCE' | 'BACKTEST'>('TERMINAL');

  // Instruments & Market state
  const [instruments, setInstruments] = useState<InstrumentConfig[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EUR/USD');
  const [selectedTradeType, setSelectedTradeType] = useState<TradeType>(() => {
    try {
      const saved = localStorage.getItem('eazzy_trading_style');
      if (saved === 'SCALP' || saved === 'DAY' || saved === 'SWING') {
        return saved;
      }
      return 'DAY';
    } catch {
      return 'DAY';
    }
  });
  const [timeframe, setTimeframe] = useState<Timeframe>('M15');
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [h1Candles, setH1Candles] = useState<MarketCandle[]>([]);
  const [dataSource, setDataSource] = useState<string>('Twelve Data');
  const [dataState, setDataState] = useState<DataSyncState>('DELAYED');
  const [providerError, setProviderError] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'WEEKEND'>('OPEN');
  const [latencyMs, setLatencyMs] = useState<number>(45);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);

  // Request sequence guards to prevent stale async responses on rapid market/timeframe switching
  const marketDataReqSeqRef = useRef<number>(0);
  const scanReqSeqRef = useRef<number>(0);

  // Signals (isolated by symbol::tradeType so modes never bleed), Journal & Performance
  const [signals, setSignals] = useState<Record<string, Signal>>({});
  const [journal, setJournal] = useState<Signal[]>([]);
  const [performance, setPerformance] = useState<PerformanceAnalytics | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isRefreshingEngine, setIsRefreshingEngine] = useState<boolean>(false);

  // Risk & Audio (never modified or reset by trading style changes)
  const [riskSettings, setRiskSettings] = useState<RiskSettings>(() => {
    try {
      const saved = localStorage.getItem('eazzy_risk_settings');
      return saved ? JSON.parse(saved) : defaultRiskSettings;
    } catch {
      return defaultRiskSettings;
    }
  });
  const [audioMuted, setAudioMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('eazzy_audio_muted') === 'true';
    } catch {
      return false;
    }
  });

  // Modals & Notifications
  const [isRiskModalOpen, setIsRiskModalOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<SignalNotification[]>([
    {
      id: 'notif-welcome',
      title: 'Eazzy AI Signal Agent Active',
      message: 'Multi-Timeframe Market Structure and Strategy Engine initialized.',
      type: 'INFO',
      timestamp: Date.now(),
      read: false,
    },
  ]);

  const handleSelectTradeType = useCallback((nextStyle: TradeType) => {
    setSelectedTradeType(nextStyle);
    try {
      localStorage.setItem('eazzy_trading_style', nextStyle);
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const activeSignal = signals[getSignalKey(selectedSymbol, selectedTradeType)] || null;
  const signalsBySymbol: Record<string, Signal> = {};
  for (const inst of instruments) {
    const modeSig = signals[getSignalKey(inst.symbol, selectedTradeType)];
    if (modeSig) {
      signalsBySymbol[inst.symbol] = modeSig;
    }
  }
  const currentInstrument =
    instruments.find((i) => i.symbol === selectedSymbol || i.symbol.replace('/', '') === selectedSymbol.replace('/', '')) ||
    getFallbackInstrumentMeta(selectedSymbol);

  // Helper to add notification
  const addNotification = useCallback((title: string, message: string, type: SignalNotification['type']) => {
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        title,
        message,
        type,
        timestamp: Date.now(),
        read: false,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // 1. Initial Load: Instruments, Journal, Performance, Market Overview, and Engine Status
  useEffect(() => {
    async function initApp() {
      try {
        const [instList, journalData, perfData, marketOverview, engStatus] = await Promise.all([
          API.getInstruments(),
          API.getJournal(),
          API.getPerformance(),
          API.getMarketOverview().catch(() => ({})),
          API.getEngineStatus(selectedSymbol).catch(() => null),
        ]);
        setInstruments(instList);
        setJournal(journalData.signals);
        setPerformance(perfData);
        if (marketOverview && Object.keys(marketOverview).length > 0) {
          setQuotes(marketOverview as any);
        }
        if (engStatus) {
          setEngineStatus(engStatus);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    initApp();
  }, []);

  // 2. Fetch candles and quote for selected symbol & timeframe (race-safe & timeframe-isolated)
  const fetchMarketDataForSymbol = useCallback(
    async (sym: string, tf: Timeframe) => {
      const reqId = ++marketDataReqSeqRef.current;
      const startTime = performanceNow();
      try {
        const data = await API.getCandles(sym, tf);
        if (reqId !== marketDataReqSeqRef.current) return;

        setCandles((prev) =>
          prev.length > 0 && prev[0].symbol === sym && prev[0].timeframe === tf
            ? mergeCandleUpdates(prev, data.candles, tf)
            : data.candles
        );
        if (data.quote) {
          setQuotes((prev) => ({ ...prev, [sym]: data.quote as MarketQuote }));
          if (data.quote.marketStatus) {
            setMarketStatus(data.quote.marketStatus);
          }
        }
        setDataSource(data.dataSource || 'Twelve Data');
        setDataState(
          data.dataState ||
            (data.candles.length === 0 ? 'DISCONNECTED' : data.quote?.status === 'LIVE' ? 'LIVE' : 'DELAYED')
        );
        setProviderError(data.candles.length === 0 ? data.errorMessage || 'Live candle data unavailable.' : null);
        setLatencyMs(Math.max(12, Math.round(performanceNow() - startTime)));
        setLastUpdated(data.lastUpdated || data.quote?.timestamp || Date.now());

        // Context H1 candles for analysis
        if (tf !== 'H1') {
          const h1Data = await API.getCandles(sym, 'H1');
          if (reqId !== marketDataReqSeqRef.current) return;
          setH1Candles((prev) =>
            prev.length > 0 && prev[0].symbol === sym && prev[0].timeframe === 'H1'
              ? mergeCandleUpdates(prev, h1Data.candles, 'H1')
              : h1Data.candles
          );
        } else {
          setH1Candles((prev) =>
            prev.length > 0 && prev[0].symbol === sym && prev[0].timeframe === 'H1'
              ? mergeCandleUpdates(prev, data.candles, 'H1')
              : data.candles
          );
        }
      } catch (err: any) {
        if (reqId !== marketDataReqSeqRef.current) return;
        console.error(`Failed to fetch candles for ${sym}:`, err);
        setDataState('DISCONNECTED');
        setProviderError(err?.message || `Failed to fetch market data for ${sym}`);
      }
    },
    []
  );

  function performanceNow() {
    return typeof window !== 'undefined' && window.performance ? window.performance.now() : Date.now();
  }

  // Trigger market data fetch when symbol or timeframe changes
  useEffect(() => {
    setCandles((prev) =>
      prev.length > 0 && prev[0].symbol === selectedSymbol && prev[0].timeframe === timeframe ? prev : []
    );
    fetchMarketDataForSymbol(selectedSymbol, timeframe);
  }, [selectedSymbol, timeframe, fetchMarketDataForSymbol]);

  // 3. Scan Signal for Selected Symbol & Trading Style
  const handleScanSignal = useCallback(async () => {
    const reqId = ++scanReqSeqRef.current;
    const scanSymbol = selectedSymbol;
    const scanTradeType = selectedTradeType;
    setIsScanning(true);
    try {
      const { signal, quote, dataSource: ds, dataState: nextState } = await API.scanSignal(
        scanSymbol,
        scanTradeType,
        riskSettings
      );

      if (reqId !== scanReqSeqRef.current) return;

      setSignals((prev) => ({ ...prev, [getSignalKey(scanSymbol, scanTradeType)]: signal }));
      setQuotes((prev) => ({ ...prev, [scanSymbol]: quote }));
      setDataSource(ds);
      if (nextState) setDataState(nextState);

      // Play acoustic chime
      playSignalChime(signal.direction, audioMuted);

      // Refresh journal & performance
      const [jData, pData] = await Promise.all([API.getJournal(), API.getPerformance()]);
      if (reqId !== scanReqSeqRef.current) return;
      setJournal(jData.signals);
      setPerformance(pData);

      // Push notification
      if (signal.direction !== 'WAIT') {
        addNotification(
          `New ${signal.direction} Signal: ${signal.instrument}`,
          `${signal.tradeType} setup detected at ${signal.suggestedEntry}. AI Confidence: ${signal.aiConfidence}/100. R:R 1:${signal.riskRewardRatio.toFixed(1)}`,
          'NEW_SIGNAL'
        );
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      if (reqId === scanReqSeqRef.current) {
        setIsScanning(false);
      }
    }
  }, [selectedSymbol, selectedTradeType, riskSettings, audioMuted, addNotification]);

  // Auto scan on symbol or trade type switch
  useEffect(() => {
    handleScanSignal();
  }, [selectedSymbol, selectedTradeType]);

  // 4. Background Multi-Tier Live Market Refresh Loop
  // TIER 1: Continuous Live Quote Refresh, Forming-Candle Price Sync & Signal Outcome Tracker (every 5000ms by default)
  useEffect(() => {
    const quoteIntervalMs = engineStatus?.refreshIntervals?.quoteRefreshMs || 5000;
    const interval = setInterval(async () => {
      const symSnapshot = selectedSymbol;
      const tfSnapshot = timeframe;
      try {
        const [tickRes, engStatus] = await Promise.all([
          API.trackerTick(symSnapshot),
          API.getEngineStatus(symSnapshot).catch(() => null),
        ]);

        if (tickRes.performance) {
          setPerformance(tickRes.performance);
        }

        if (tickRes.quote && tickRes.quote.price > 0 && tickRes.quote.status !== 'UNAVAILABLE') {
          setQuotes((prev) => ({ ...prev, [symSnapshot]: tickRes.quote as MarketQuote }));
          if (tickRes.dataSource) setDataSource(tickRes.dataSource);
          setLastUpdated(tickRes.lastUpdated || tickRes.quote.timestamp || Date.now());
          setProviderError(null);
          if (tickRes.quote.marketStatus) {
            setMarketStatus(tickRes.quote.marketStatus);
          }

          // Synchronize current forming candle using genuine live market price
          setCandles((prev) =>
            prev.length > 0 && prev[0].symbol === symSnapshot && prev[0].timeframe === tfSnapshot
              ? applyLiveQuoteToCandles(prev, tickRes.quote, tfSnapshot)
              : prev
          );
          setH1Candles((prev) =>
            prev.length > 0 && prev[0].symbol === symSnapshot && prev[0].timeframe === 'H1'
              ? applyLiveQuoteToCandles(prev, tickRes.quote, 'H1')
              : prev
          );
        }

        if (tickRes.dataState) {
          setDataState(tickRes.dataState);
          if (tickRes.dataState === 'DISCONNECTED') {
            setProviderError(tickRes.quote?.errorMessage || `Live data temporarily unavailable for ${symSnapshot}`);
          }
        }

        if (engStatus) {
          setEngineStatus(engStatus);
          if (engStatus.marketFeed === 'OFFLINE') {
            setMarketStatus('CLOSED');
          }
        }

        // Check if any active signals changed status
        if (tickRes.trackingResult && tickRes.trackingResult.statusChanges.length > 0) {
          const updatedJournal = await API.getJournal();
          setJournal(updatedJournal.signals);

          for (const change of tickRes.trackingResult.statusChanges) {
            if (change.status === 'TP1_HIT' || change.status === 'TP2_HIT') {
              playOutcomeSound('TP_HIT', audioMuted);
              addNotification(
                `Target Hit: ${change.id}`,
                `${change.status.replace('_', ' ')} reached! Realized outcome: +${change.outcomeR || 2.0}R`,
                'TP1_HIT'
              );
            } else if (change.status === 'SL_HIT') {
              playOutcomeSound('SL_HIT', audioMuted);
              addNotification(
                `Stop Loss Triggered: ${change.id}`,
                `Trade closed at stop loss (-1.0R). Capital protected.`,
                'SL_HIT'
              );
            }
          }
        }
      } catch (err) {
        // Silently continue loop
      }
    }, quoteIntervalMs);

    return () => clearInterval(interval);
  }, [selectedSymbol, timeframe, audioMuted, addNotification, engineStatus?.refreshIntervals?.quoteRefreshMs]);

  // TIER 2: Live Candlestick Sync (every 15000ms by default)
  useEffect(() => {
    const candleIntervalMs = engineStatus?.refreshIntervals?.candleRefreshMs || 15000;
    const candleInterval = setInterval(() => {
      fetchMarketDataForSymbol(selectedSymbol, timeframe);
    }, candleIntervalMs);

    return () => clearInterval(candleInterval);
  }, [selectedSymbol, timeframe, fetchMarketDataForSymbol, engineStatus?.refreshIntervals?.candleRefreshMs]);

  // TIER 3: Periodic Auto-Rescan Loop (every 30000ms by default)
  useEffect(() => {
    const scanIntervalMs = engineStatus?.refreshIntervals?.scanIntervalMs || 30000;
    const scanInterval = setInterval(() => {
      if (engineStatus?.scannerStatus === 'ACTIVE') {
        handleScanSignal();
      }
    }, scanIntervalMs);

    return () => clearInterval(scanInterval);
  }, [handleScanSignal, engineStatus?.scannerStatus, engineStatus?.refreshIntervals?.scanIntervalMs]);

  // Force Manual Refresh of all layers
  const handleManualRefreshAll = async () => {
    setIsRefreshingEngine(true);
    try {
      await Promise.all([
        fetchMarketDataForSymbol(selectedSymbol, timeframe),
        handleScanSignal(),
        API.getEngineStatus(selectedSymbol).then(setEngineStatus).catch(() => null),
      ]);
    } finally {
      setIsRefreshingEngine(false);
    }
  };

  // Toggle Audio
  const handleToggleAudio = () => {
    setAudioMuted((prev) => {
      const next = !prev;
      localStorage.setItem('eazzy_audio_muted', String(next));
      return next;
    });
  };

  // Save Risk Settings
  const handleSaveRiskSettings = (newSettings: RiskSettings) => {
    setRiskSettings(newSettings);
    localStorage.setItem('eazzy_risk_settings', JSON.stringify(newSettings));
    addNotification('Risk Rules Updated', 'New quantitative risk parameters applied.', 'INFO');
  };

  // Add Custom Instrument
  const handleAddInstrument = (newInst: InstrumentConfig) => {
    setInstruments((prev) => {
      if (prev.some((i) => i.symbol === newInst.symbol)) return prev;
      return [...prev, newInst];
    });
    setSelectedSymbol(newInst.symbol);
    addNotification(
      'Custom Instrument Added',
      `${newInst.symbol} added to live monitoring grid.`,
      'INFO'
    );
  };

  // Unread Notifications Count
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        selectedSymbol={selectedSymbol}
        isScanning={isScanning}
        onTriggerScan={handleScanSignal}
        audioMuted={audioMuted}
        onToggleAudio={handleToggleAudio}
        onOpenRiskModal={() => setIsRiskModalOpen(true)}
        onOpenNotifications={() => setIsNotifDrawerOpen(true)}
        unreadCount={unreadNotifCount}
        dataSource={dataSource}
        marketStatus={marketStatus}
        latencyMs={latencyMs}
        lastUpdated={lastUpdated}
        performance={performance}
        riskSettings={riskSettings}
        activeView={activeView}
        onSelectView={setActiveView}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Live Engine Status Diagnostic */}
        <LiveEngineStatus
          engineStatus={engineStatus}
          onManualRefresh={handleManualRefreshAll}
          isRefreshing={isRefreshingEngine}
        />

        {/* Market Watch Ticker Ribbon */}
        <MarketWatch
          instruments={instruments}
          quotes={quotes}
          signals={signalsBySymbol}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={(sym) => {
            setSelectedSymbol(sym);
          }}
          onOpenAddModal={() => setIsAddModalOpen(true)}
        />

        {/* Dynamic View Panels */}
        {activeView === 'TERMINAL' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 Cols: Interactive Trading Chart */}
            <div className="lg:col-span-7 flex flex-col">
              <TradingChart
                symbol={selectedSymbol}
                instrument={currentInstrument}
                candles={candles}
                timeframe={timeframe}
                onSelectTimeframe={(tf) => {
                  setTimeframe(tf);
                }}
                activeSignal={activeSignal}
                dataSource={dataSource}
                dataState={dataState}
                lastUpdated={lastUpdated}
                providerError={providerError}
              />
            </div>

            {/* Right 5 Cols: Actionable Signal Card & AI Confidence */}
            <div className="lg:col-span-5 flex flex-col">
              <ActiveSignalsFeed
                signal={activeSignal}
                instrument={currentInstrument}
                selectedTradeType={selectedTradeType}
                onSelectTradeType={handleSelectTradeType}
                onTriggerScan={handleScanSignal}
                isScanning={isScanning}
              />
            </div>
          </div>
        )}

        {activeView === 'ANALYSIS' && (
          <MarketAnalysisView
            symbol={selectedSymbol}
            instrument={currentInstrument}
            quote={quotes[selectedSymbol]}
            candles={candles}
            h1Candles={h1Candles}
            tradeType={selectedTradeType}
            onSelectTradeType={handleSelectTradeType}
            dataSource={dataSource}
            dataState={dataState}
            lastUpdated={lastUpdated}
          />
        )}

        {activeView === 'JOURNAL' && (
          <SignalJournalView
            signals={journal}
            onSelectSignal={(sig) => {
              setSelectedSymbol(sig.instrument);
              handleSelectTradeType(sig.tradeType);
              setActiveView('TERMINAL');
            }}
            onRefresh={async () => {
              try {
                const [jData, pData] = await Promise.all([API.getJournal(), API.getPerformance()]);
                setJournal(jData.signals);
                setPerformance(pData);
              } catch (e) {
                console.error('Failed to refresh journal:', e);
              }
            }}
          />
        )}

        {activeView === 'PERFORMANCE' && (
          <PerformanceDashboard performance={performance} />
        )}

        {activeView === 'BACKTEST' && (
          <BacktestView
            instruments={instruments.reduce((acc, curr) => ({ ...acc, [curr.symbol]: curr }), {})}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
            }}
            fetchLiveCandles={async (sym, tf) => {
              try {
                const res = await API.getCandles(sym, tf);
                return res?.candles || [];
              } catch {
                return candles;
              }
            }}
          />
        )}
      </main>

      {/* Footer / Risk Disclaimer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-3 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>Eazzy AI Trading Signal Agent • Systematic Multi-Timeframe Confluence Engine</span>
          <span className="text-[11px] text-slate-600">
            Automated Analysis Tool • Does NOT execute automatic trades • Strictly for educational & disciplined decision support
          </span>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <RiskSettingsModal
        isOpen={isRiskModalOpen}
        onClose={() => setIsRiskModalOpen(false)}
        settings={riskSettings}
        onSave={handleSaveRiskSettings}
      />

      <AddInstrumentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddInstrument}
      />

      <NotificationsDrawer
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
        notifications={notifications}
        onClear={() => setNotifications([])}
        onMarkAllRead={() => {
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
      />
    </div>
  );
}

export default App;
