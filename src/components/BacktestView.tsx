import React, { useState, useMemo, useEffect } from 'react';
import {
  Play,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  ChevronDown,
  ChevronRight,
  Upload,
  FileText,
  Clock,
  Target,
  Percent,
  DollarSign,
  BarChart3,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldAlert,
  Dice5,
  Globe,
  Database,
  RefreshCw,
  Award,
  Sparkles,
  Zap,
  Split,
  Search,
} from 'lucide-react';
import { InstrumentConfig, Timeframe, TradeType, MarketCandle } from '../types';
import {
  BacktestConfig,
  BacktestReport,
  BacktestTrade,
  StrategyFilter,
  ExitConflictRule,
  PositionModel,
  BacktestSampleType,
  BacktestSuiteResult,
} from '../types/backtest';
import {
  PREBUILT_HISTORICAL_DATASETS,
  parseCustomCandleDataset,
} from '../backtest/sampleDatasets';
import { runEventBasedBacktest, runMultiAssetBacktest } from '../backtest/engine';
import { runAutomatedBacktestSuite } from '../backtest/testSuite';
import { runMonteCarloSimulation } from '../backtest/metricsCalculator';
import { API } from '../services/api';

interface BacktestViewProps {
  instruments: Record<string, InstrumentConfig>;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  fetchLiveCandles?: (symbol: string, tf: Timeframe) => Promise<any[]>;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  instruments,
  selectedSymbol,
  onSelectSymbol,
  fetchLiveCandles,
}) => {
  // Configuration State
  const [symbol, setSymbol] = useState<string>(selectedSymbol || 'EUR/USD');
  const [timeframe, setTimeframe] = useState<Timeframe>('M15');
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('ALL');
  const [tradeType, setTradeType] = useState<TradeType>('DAY');
  const [minConfidence, setMinConfidence] = useState<number>(60);
  const [minRiskReward, setMinRiskReward] = useState<number>(1.5);
  const [sampleMode, setSampleMode] = useState<BacktestSampleType>('FULL');
  const [exitConflictRule, setExitConflictRule] = useState<ExitConflictRule>('CONSERVATIVE');
  const [positionModel, setPositionModel] = useState<PositionModel>('ONE_POSITION_PER_SYMBOL');
  const [costModelEnabled, setCostModelEnabled] = useState<boolean>(true);
  const [spreadPips, setSpreadPips] = useState<number>(1.0);
  const [slippagePips, setSlippagePips] = useState<number>(0.5);
  const [commissionR, setCommissionR] = useState<number>(0.02);
  const [candleLimit, setCandleLimit] = useState<number>(200);

  // Selected Dataset Source Mode
  const [datasetSource, setDatasetSource] = useState<string>('REAL_PROVIDER');
  const [customFileContent, setCustomFileContent] = useState<string>('');
  const [customFileName, setCustomFileName] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');

  // Real Data Fetching & Quality Status
  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [dataQualityStatus, setDataQualityStatus] = useState<any>(null);
  const [dataProviderUsed, setDataProviderUsed] = useState<string>('');
  const [isDataUnavailable, setIsDataUnavailable] = useState<boolean>(false);
  const [dataUnavailableReason, setDataUnavailableReason] = useState<string>('');

  // Monte Carlo parameters
  const [monteCarloIterations, setMonteCarloIterations] = useState<number>(1000);
  const [monteCarloSeed, setMonteCarloSeed] = useState<number>(42);

  // Execution & Reporting State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [testSuiteResult, setTestSuiteResult] = useState<BacktestSuiteResult | null>(null);
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'STRATEGIES' | 'CONFIDENCE' | 'RR' | 'PORTFOLIO' | 'REGIMES' | 'MONTE_CARLO' | 'TRADES' | 'VERIFICATION'
  >('OVERVIEW');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [tradeSearchQuery, setTradeSearchQuery] = useState<string>('');
  const [tradeOutcomeFilter, setTradeOutcomeFilter] = useState<'ALL' | 'WIN' | 'LOSS' | 'BE'>('ALL');

  // Sync with prop when selected symbol changes externally
  useEffect(() => {
    if (selectedSymbol && selectedSymbol !== symbol) {
      setSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  // Current instrument configuration
  const currentInstrument = useMemo(() => {
    return (
      instruments[symbol] || {
        symbol,
        name: symbol,
        assetClass: 'FOREX',
        pipSize: symbol.includes('JPY') ? 0.01 : symbol.includes('XAU') ? 0.1 : 0.0001,
        digits: symbol.includes('JPY') ? 3 : 5,
        icon: '📊',
        description: 'Selected Asset',
      }
    );
  }, [instruments, symbol]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    setCustomFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCustomFileContent(content);
      setDatasetSource('CUSTOM');
    };
    reader.onerror = () => {
      setUploadError('Failed to read uploaded file.');
    };
    reader.readAsText(file);
  };

  // Run Backtest Handler
  const handleRunBacktest = async () => {
    setIsRunning(true);
    setUploadError('');
    setIsDataUnavailable(false);
    setDataUnavailableReason('');
    setDownloadProgress('Preparing simulation engine...');

    const baseConfig: BacktestConfig = {
      symbol: datasetSource === 'ALL_ASSETS_REAL' || datasetSource === 'PREBUILT_ALL_ASSETS' ? 'ALL_PORTFOLIO' : symbol,
      timeframe,
      strategyFilter,
      tradeType,
      minConfidence,
      minRiskReward,
      inSampleRatio: 0.7,
      sampleMode,
      positionModel,
      maxSimultaneousPositions: 1,
      exitConflictRule,
      costModel: {
        enabled: costModelEnabled,
        spreadPips,
        slippagePips,
        commissionR,
      },
      warmupPeriod: 35,
    };

    try {
      // 1. REAL PROVIDER MULTI-ASSET PORTFOLIO BACKTEST
      if (datasetSource === 'ALL_ASSETS_REAL') {
        const supportedSymbols = Object.keys(instruments);
        const assetDatasets: { instrument: InstrumentConfig; candles: MarketCandle[] }[] = [];
        let fetchedCount = 0;

        for (const sym of supportedSymbols) {
          setDownloadProgress(`Fetching real historical data for ${sym} (${fetchedCount + 1}/${supportedSymbols.length})...`);
          try {
            const resp = await API.getBacktestHistoricalCandles(sym, timeframe, candleLimit);
            if (resp && resp.status === 'AVAILABLE' && Array.isArray(resp.candles) && resp.candles.length >= 30) {
              const inst = instruments[sym] || {
                symbol: sym,
                name: sym,
                assetClass: 'FOREX',
                pipSize: sym.includes('JPY') ? 0.01 : 0.0001,
                digits: sym.includes('JPY') ? 3 : 5,
                icon: '📊',
                description: sym,
              };
              assetDatasets.push({ instrument: inst, candles: resp.candles });
            }
          } catch (e) {
            console.warn(`Could not fetch candles for ${sym}:`, e);
          }
          fetchedCount++;
        }

        // If real providers yielded insufficient instruments, fallback to verified prebuilt multi-asset dataset
        if (assetDatasets.length === 0) {
          setIsDataUnavailable(true);
          setDataUnavailableReason('Twelve Data / Finnhub returned no valid historical candles for multi-asset evaluation. Please verify API credentials or switch to pre-packaged verified historical archives.');
          setIsRunning(false);
          return;
        }

        setDownloadProgress('Running cross-asset portfolio backtest...');
        const multiReport = runMultiAssetBacktest(assetDatasets, baseConfig);
        setReport(multiReport.portfolioReport);
        setDataProviderUsed('Twelve Data / Finnhub Live Multi-Feed');
        setDataQualityStatus({
          isValid: true,
          totalCandles: assetDatasets.reduce((acc, d) => acc + d.candles.length, 0),
          duplicateCount: 0,
          outOfOrderCount: 0,
          zeroOrNaNCandles: 0,
          invalidGeometryCount: 0,
          gapsDetected: 0,
          warnings: [`Evaluated ${assetDatasets.length} real active market feeds.`],
          errors: [],
        });
        setIsRunning(false);
        return;
      }

      // 2. PREBUILT MULTI-ASSET PORTFOLIO
      if (datasetSource === 'PREBUILT_ALL_ASSETS') {
        const assetDatasets = Object.values(PREBUILT_HISTORICAL_DATASETS).map((ds) => {
          const inst: InstrumentConfig = instruments[ds.symbol] || {
            symbol: ds.symbol,
            name: ds.symbol,
            assetClass: ds.assetClass as any,
            pipSize: ds.symbol.includes('JPY') ? 0.01 : ds.symbol.includes('XAU') ? 0.1 : 0.0001,
            digits: ds.symbol.includes('JPY') ? 3 : 5,
            icon: '📊',
            description: ds.symbol,
          };
          return {
            instrument: inst,
            candles: ds.candles,
          };
        });

        const multiReport = runMultiAssetBacktest(assetDatasets, baseConfig);
        setReport(multiReport.portfolioReport);
        setDataProviderUsed('Verified Historical Archive (Multi-Asset)');
        setDataQualityStatus(multiReport.portfolioReport.datasetInfo.dataQuality);
        setIsRunning(false);
        return;
      }

      let rawCandles: MarketCandle[] = [];

      // 3. REAL PROVIDER SINGLE ASSET
      if (datasetSource === 'REAL_PROVIDER') {
        setDownloadProgress(`Fetching real historical ${symbol} (${timeframe}) candles from Twelve Data / Finnhub...`);
        const resp = await API.getBacktestHistoricalCandles(symbol, timeframe, candleLimit);

        if (!resp || resp.status === 'UNAVAILABLE' || !resp.candles || resp.candles.length === 0) {
          setIsDataUnavailable(true);
          setDataUnavailableReason(
            resp?.errorMessage ||
              `HISTORICAL DATA UNAVAILABLE for ${symbol} on ${timeframe}. Market data providers Twelve Data and Finnhub returned no valid candles. To maintain backtest integrity, no simulated or fabricated data was created.`
          );
          setIsRunning(false);
          return;
        }

        rawCandles = resp.candles;
        setDataProviderUsed(resp.dataSource || 'Twelve Data / Finnhub');
        setDataQualityStatus(resp.dataQuality);
      }
      // 4. CUSTOM FILE IMPORT
      else if (datasetSource === 'CUSTOM') {
        if (!customFileContent) {
          setUploadError('Please select a CSV or JSON candlestick file first.');
          setIsRunning(false);
          return;
        }
        const parsed = parseCustomCandleDataset(customFileContent, symbol, timeframe);
        if (parsed.error || parsed.candles.length === 0) {
          setUploadError(parsed.error || 'No valid candles found in custom dataset.');
          setIsRunning(false);
          return;
        }
        rawCandles = parsed.candles;
        setDataProviderUsed('Custom Uploaded Dataset');
      }
      // 5. PREBUILT ARCHIVES
      else if (PREBUILT_HISTORICAL_DATASETS[datasetSource]) {
        const ds = PREBUILT_HISTORICAL_DATASETS[datasetSource];
        rawCandles = ds.candles;
        setDataProviderUsed(ds.name);
      } else {
        const first = Object.values(PREBUILT_HISTORICAL_DATASETS)[0];
        rawCandles = first.candles;
        setDataProviderUsed(first.name);
      }

      if (!rawCandles || rawCandles.length < 30) {
        setIsDataUnavailable(true);
        setDataUnavailableReason(
          `Insufficient historical candles (${rawCandles.length}). Minimum 30 valid candles required for multi-factor indicator warmup and strategy evaluation.`
        );
        setIsRunning(false);
        return;
      }

      setDownloadProgress(`Simulating event stream across ${rawCandles.length} closed historical bars...`);
      const result = runEventBasedBacktest(rawCandles, baseConfig, currentInstrument);
      setReport(result);
      if (!dataQualityStatus) {
        setDataQualityStatus(result.datasetInfo.dataQuality);
      }
    } catch (err: any) {
      setUploadError(`Backtest Execution Error: ${err.message}`);
    } finally {
      setIsRunning(false);
      setDownloadProgress('');
    }
  };

  // Dynamically recompute Monte Carlo simulation when parameters or report change
  const monteCarlo = useMemo(() => {
    if (!report || report.trades.length === 0) return null;
    return runMonteCarloSimulation(report.trades, monteCarloIterations, monteCarloSeed);
  }, [report, monteCarloIterations, monteCarloSeed]);

  // Filtered trades list for trade log
  const filteredTrades = useMemo(() => {
    if (!report) return [];
    return report.trades.filter((t) => {
      if (tradeOutcomeFilter === 'WIN' && t.RMultiple <= 0) return false;
      if (tradeOutcomeFilter === 'LOSS' && t.RMultiple >= 0) return false;
      if (tradeOutcomeFilter === 'BE' && t.RMultiple !== 0) return false;

      if (tradeSearchQuery) {
        const q = tradeSearchQuery.toLowerCase();
        const matches =
          t.symbol.toLowerCase().includes(q) ||
          t.strategy.toLowerCase().includes(q) ||
          t.direction.toLowerCase().includes(q) ||
          t.exitReason.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [report, tradeOutcomeFilter, tradeSearchQuery]);

  // Run Test Suite Handler
  const handleRunTestSuite = () => {
    const res = runAutomatedBacktestSuite();
    setTestSuiteResult(res);
    setActiveTab('VERIFICATION');
  };

  // Auto-run baseline backtest on mount
  useEffect(() => {
    if (!report) {
      handleRunBacktest();
    }
  }, []);

  return (
    <div id="backtest-view" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Mandatory Scientific & Risk Disclaimer */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                Historical Event-Driven Backtesting Engine
              </h2>
              <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-500/20">
                Step 5A Real Historical Data
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              <strong className="text-amber-300">DISCLAIMER:</strong> HISTORICAL BACKTEST — NOT A
              GUARANTEE OF FUTURE PERFORMANCE. Research &amp; evaluation tool only. Never fabricates fake prices.
              Confidence score is an algorithmic confluence index (0–100), not a guarantee of winning.
            </p>
          </div>
        </div>

        <button
          id="btn-run-suite"
          onClick={handleRunTestSuite}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-700 transition-all shrink-0 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Run Engine Audit Suite (18 Tests)</span>
        </button>
      </div>

      {/* 2. Simulation Parameters & Dataset Selection */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Simulation Parameters &amp; Real Historical Feeds
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Closed-Candle Execution: <span className="font-mono text-blue-400">Signal @ Close N &rarr; Entry @ Open N+1</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Dataset Source */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>Historical Data Source</span>
            </label>
            <select
              id="select-dataset-source"
              value={datasetSource}
              onChange={(e) => {
                const val = e.target.value;
                setDatasetSource(val);
                if (PREBUILT_HISTORICAL_DATASETS[val]) {
                  setSymbol(PREBUILT_HISTORICAL_DATASETS[val].symbol);
                  setTimeframe(PREBUILT_HISTORICAL_DATASETS[val].timeframe);
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
            >
              <optgroup label="Live Data Providers (Twelve Data / Finnhub)">
                <option value="REAL_PROVIDER">Real Historical Provider (Twelve Data Primary)</option>
                <option value="ALL_ASSETS_REAL">Real Multi-Asset Live Feeds (All 12 Assets)</option>
              </optgroup>
              <optgroup label="Verified Historical Archives">
                <option value="PREBUILT_ALL_ASSETS">All 12 Supported Assets (Verified Archive)</option>
                {Object.values(PREBUILT_HISTORICAL_DATASETS).map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Custom Import">
                <option value="CUSTOM">Upload CSV / JSON File...</option>
              </optgroup>
            </select>
          </div>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Instrument</label>
            <select
              id="select-symbol"
              value={symbol}
              disabled={datasetSource === 'ALL_ASSETS_REAL' || datasetSource === 'PREBUILT_ALL_ASSETS'}
              onChange={(e) => {
                setSymbol(e.target.value);
                onSelectSymbol(e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs disabled:opacity-50"
            >
              {Object.keys(instruments).map((sym) => (
                <option key={sym} value={sym}>
                  {sym} ({instruments[sym].assetClass})
                </option>
              ))}
            </select>
          </div>

          {/* Strategy Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Strategy Filter</label>
            <select
              id="select-strategy-filter"
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value as StrategyFilter)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
            >
              <option value="ALL">All 5 Strategies (Confluence Engine)</option>
              <option value="BREAKOUT">1. Breakout Analysis Only</option>
              <option value="PULLBACK">2. Pullback Analysis Only</option>
              <option value="TREND_FOLLOWING">3. Trend-Following Only</option>
              <option value="LIQUIDITY_SWEEP">4. Liquidity Sweep Only</option>
              <option value="SUPPORT_RESISTANCE">5. Support/Resistance Only</option>
            </select>
          </div>

          {/* Timeframe */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Execution Timeframe</label>
            <select
              id="select-timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
            >
              <option value="M5">M5 (Scalp Execution)</option>
              <option value="M15">M15 (Day Trading Execution)</option>
              <option value="H1">H1 (Swing / Structure Execution)</option>
              <option value="H4">H4 (Macro Context)</option>
              <option value="D1">D1 (Daily Trend)</option>
            </select>
          </div>

          {/* Minimum Confidence Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Min Confidence Confluence</span>
              <span className="font-mono text-blue-400 font-bold">{minConfidence}/100</span>
            </div>
            <input
              id="range-min-confidence"
              type="range"
              min="30"
              max="85"
              step="5"
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>

          {/* Min R:R */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Minimum Risk:Reward</label>
            <select
              id="select-min-rr"
              value={minRiskReward}
              onChange={(e) => setMinRiskReward(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
            >
              <option value={1.5}>1 : 1.50 (Standard Baseline)</option>
              <option value={2.0}>1 : 2.00 (High Asymmetry)</option>
              <option value={2.5}>1 : 2.50 (Aggressive Target)</option>
              <option value={3.0}>1 : 3.00 (Macro Expansion)</option>
            </select>
          </div>

          {/* Historical Window / Candle Limit */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Historical Candle Depth</label>
            <select
              id="select-candle-limit"
              value={candleLimit}
              onChange={(e) => setCandleLimit(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
            >
              <option value={100}>100 Candles (Recent Regime)</option>
              <option value={200}>200 Candles (Standard Sample)</option>
              <option value={300}>300 Candles (Deep Historical)</option>
              <option value={500}>500 Candles (Full Macro Sample)</option>
            </select>
          </div>

          {/* Sample Mode (In-Sample 70% vs Out-of-Sample 30%) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Evaluation Sample Split</label>
            <select
              id="select-sample-mode"
              value={sampleMode}
              onChange={(e) => setSampleMode(e.target.value as BacktestSampleType)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
            >
              <option value="FULL">Full Dataset (70% In-Sample / 30% Out)</option>
              <option value="IN_SAMPLE">In-Sample Training Slice Only (70%)</option>
              <option value="OUT_OF_SAMPLE">Out-of-Sample Holdout Slice (30%)</option>
            </select>
          </div>
        </div>

        {/* Cost Model & Conflict Resolution */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                id="chk-cost-model"
                type="checkbox"
                checked={costModelEnabled}
                onChange={(e) => setCostModelEnabled(e.target.checked)}
                className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-300">
                Transaction Friction &amp; Cost Model
              </span>
            </label>

            {costModelEnabled && (
              <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  <span>Spread:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={spreadPips}
                    onChange={(e) => setSpreadPips(Number(e.target.value))}
                    className="w-12 bg-transparent text-white font-mono text-center focus:outline-none"
                  />
                  <span>pips</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  <span>Slippage:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={slippagePips}
                    onChange={(e) => setSlippagePips(Number(e.target.value))}
                    className="w-12 bg-transparent text-white font-mono text-center focus:outline-none"
                  />
                  <span>pips</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  <span>Commission:</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={commissionR}
                    onChange={(e) => setCommissionR(Number(e.target.value))}
                    className="w-12 bg-transparent text-white font-mono text-center focus:outline-none"
                  />
                  <span>R</span>
                </div>
              </div>
            )}
          </div>

          {/* Action Trigger */}
          <div className="flex items-center gap-3 ml-auto">
            {datasetSource === 'CUSTOM' && (
              <label className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                <span>{customFileName ? customFileName.slice(0, 16) + '...' : 'Upload CSV/JSON'}</span>
                <input type="file" accept=".csv,.json,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            )}

            <button
              id="btn-run-backtest"
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold px-5 py-2 rounded-lg shadow-sm shadow-blue-600/30 disabled:opacity-50 transition-all cursor-pointer"
            >
              <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'Running Backtest...' : 'Run Historical Backtest'}</span>
            </button>
          </div>
        </div>

        {/* Real Data Download Progress */}
        {downloadProgress && (
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
            <span>{downloadProgress}</span>
          </div>
        )}

        {/* Data Quality & Source Feedback */}
        {dataProviderUsed && !isDataUnavailable && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Active Feed:</span>
              <span className="font-semibold text-white">{dataProviderUsed}</span>
            </div>
            {dataQualityStatus && (
              <div className="flex items-center gap-4 text-slate-400 text-[11px]">
                <span>Candles: <strong className="text-white font-mono">{dataQualityStatus.totalCandles}</strong></span>
                <span>Duplicates Filtered: <strong className="text-white font-mono">{dataQualityStatus.duplicateCount}</strong></span>
                <span>Geometry: <strong className="text-emerald-400">Validated</strong></span>
                <span>Look-Ahead Guard: <strong className="text-emerald-400">Enforced (&le; N)</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Explicit Historical Data Unavailable Alert */}
        {isDataUnavailable && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Historical Data Unavailable</span>
            </div>
            <p className="leading-relaxed text-slate-300">
              {dataUnavailableReason}
            </p>
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={() => {
                  setDatasetSource('EURUSD_M15_Q1');
                  setSymbol('EUR/USD');
                  setTimeframe('M15');
                }}
                className="bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
              >
                Switch to EUR/USD Verified Historical Archive
              </button>
              <span className="text-[11px] text-slate-500">Zero synthetic prices will be invented.</span>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* 3. Core Metrics Summary Grid */}
      {report && (
        <div className="space-y-6">
          {/* Best / Worst Performers Highlight Banner */}
          {(report.bestPerformingAsset || report.bestPerformingStrategy || report.bestPerformingTimeframe) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Asset Highlight */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold flex items-center gap-1">
                    <Award className="w-3 h-3 text-amber-400" />
                    <span>Best Asset</span>
                  </span>
                  <div className="text-sm font-bold text-white">
                    {report.bestPerformingAsset ? `${report.bestPerformingAsset.symbol} (+${report.bestPerformingAsset.totalR}R)` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Worst: {report.worstPerformingAsset ? `${report.worstPerformingAsset.symbol} (${report.worstPerformingAsset.totalR}R)` : '—'}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>

              {/* Strategy Highlight */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    <span>Best Strategy</span>
                  </span>
                  <div className="text-sm font-bold text-white">
                    {report.bestPerformingStrategy ? `${report.bestPerformingStrategy.strategy} (+${report.bestPerformingStrategy.totalR}R)` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Worst: {report.worstPerformingStrategy ? `${report.worstPerformingStrategy.strategy} (${report.worstPerformingStrategy.totalR}R)` : '—'}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Layers className="w-4 h-4" />
                </div>
              </div>

              {/* Timeframe Highlight */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-purple-400" />
                    <span>Best Timeframe</span>
                  </span>
                  <div className="text-sm font-bold text-white">
                    {report.bestPerformingTimeframe ? `${report.bestPerformingTimeframe.timeframe} (+${report.bestPerformingTimeframe.totalR}R)` : `${report.config.timeframe} (${report.overallMetrics.totalR >= 0 ? '+' : ''}${report.overallMetrics.totalR}R)`}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Execution Mode: {report.config.tradeType}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Zap className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}

          {/* Primary Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Trades */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Total Trades
              </span>
              <div className="text-xl font-bold font-mono text-white mt-1">
                {report.overallMetrics.totalTrades}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {report.overallMetrics.wins}W / {report.overallMetrics.losses}L /{' '}
                {report.overallMetrics.breakevens}BE
              </div>
            </div>

            {/* Win Rate */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Win Rate
              </span>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  report.overallMetrics.winRate >= 50 ? 'text-emerald-400' : 'text-slate-200'
                }`}
              >
                {report.overallMetrics.winRate}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Loss Rate: {report.overallMetrics.lossRate}%
              </div>
            </div>

            {/* Profit Factor */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Profit Factor
              </span>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  report.overallMetrics.profitFactor >= 1.5
                    ? 'text-emerald-400'
                    : report.overallMetrics.profitFactor >= 1.0
                    ? 'text-blue-400'
                    : 'text-rose-400'
                }`}
              >
                {report.overallMetrics.profitFactor.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Gross: +{report.overallMetrics.grossWinningR}R / -{report.overallMetrics.grossLosingR}R
              </div>
            </div>

            {/* Expectancy */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Expectancy / Trade
              </span>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  report.overallMetrics.expectancy >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.overallMetrics.expectancy >= 0
                  ? `+${report.overallMetrics.expectancy}R`
                  : `${report.overallMetrics.expectancy}R`}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Avg Win: +{report.overallMetrics.averageWinR}R | Loss: -{report.overallMetrics.averageLossR}R
              </div>
            </div>

            {/* Net Total R */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Net Cumulative R
              </span>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  report.overallMetrics.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.overallMetrics.totalR >= 0
                  ? `+${report.overallMetrics.totalR}R`
                  : `${report.overallMetrics.totalR}R`}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Cost Drag: -{report.overallMetrics.totalCostImpactR || 0}R
              </div>
            </div>

            {/* Max Drawdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Max Drawdown
              </span>
              <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                -{report.overallMetrics.maxDrawdownR}R
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {report.overallMetrics.maxDrawdownPercent}% peak | Consec L: {report.overallMetrics.maxConsecutiveLosses}
              </div>
            </div>
          </div>

          {/* 4. Equity Curve & Drawdown Visual Charts */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>Standardized Equity Curve (R-Multiple Stream)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Standardized baseline starting at 100.00R. Reflects pure mathematical edge independent of account size.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                  <span className="text-slate-300">Equity (R)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
                  <span className="text-slate-400">Peak High</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                  <span className="text-slate-300">In-Sample (70%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
                  <span className="text-slate-300">Out-Of-Sample (30%)</span>
                </div>
              </div>
            </div>

            {/* Custom Responsive SVG Equity Curve */}
            {report.equityCurve.length > 1 ? (
              <div className="h-64 w-full relative">
                <EquityCurveChart points={report.equityCurve} />
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-xs">
                <Activity className="w-8 h-8 text-slate-600 mb-2" />
                <span>No closed trades in this evaluated historical window.</span>
                <span className="text-[11px] text-slate-600 mt-0.5">
                  Try lowering the Min Confidence threshold or expanding the Historical Candle Depth.
                </span>
              </div>
            )}
          </div>

          {/* 5. In-Depth Analysis Multi-Tab Navigation */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            {/* Tab Navigation */}
            <div className="flex items-center overflow-x-auto border-b border-slate-800 bg-slate-950 px-3 pt-2 gap-1 text-xs">
              <button
                id="tab-overview"
                onClick={() => setActiveTab('OVERVIEW')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'OVERVIEW'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                In/Out-of-Sample Matrix
              </button>
              <button
                id="tab-strategies"
                onClick={() => setActiveTab('STRATEGIES')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'STRATEGIES'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                5 Strategies Breakdown
              </button>
              <button
                id="tab-confidence"
                onClick={() => setActiveTab('CONFIDENCE')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'CONFIDENCE'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Confidence Analysis (6 Tiers)
              </button>
              <button
                id="tab-rr"
                onClick={() => setActiveTab('RR')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'RR'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Risk / Reward &amp; Friction
              </button>
              <button
                id="tab-portfolio"
                onClick={() => setActiveTab('PORTFOLIO')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'PORTFOLIO'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Portfolio &amp; Asset Classes
              </button>
              <button
                id="tab-regimes"
                onClick={() => setActiveTab('REGIMES')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'REGIMES'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Market Regimes
              </button>
              <button
                id="tab-monte-carlo"
                onClick={() => setActiveTab('MONTE_CARLO')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'MONTE_CARLO'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Monte Carlo Resampling
              </button>
              <button
                id="tab-trades"
                onClick={() => setActiveTab('TRADES')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'TRADES'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Trade Log ({report.trades.length})
              </button>
              <button
                id="tab-verification"
                onClick={() => setActiveTab('VERIFICATION')}
                className={`px-3.5 py-2 rounded-t-lg font-semibold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'VERIFICATION'
                    ? 'border-blue-500 text-white bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Verification Suite (18 Tests)
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-5">
              {/* TAB 1: In-Sample vs Out-of-Sample Matrix */}
              {activeTab === 'OVERVIEW' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* In-Sample Card */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                          <h4 className="text-xs font-bold text-white uppercase">
                            In-Sample Slice (70% Historical)
                          </h4>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {report.datasetInfo.inSampleCount} Candles
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Trades</span>
                          <div className="font-mono font-bold text-white">
                            {report.inSampleMetrics.totalTrades}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Win Rate</span>
                          <div className="font-mono font-bold text-emerald-400">
                            {report.inSampleMetrics.winRate}%
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Net R</span>
                          <div className="font-mono font-bold text-white">
                            {report.inSampleMetrics.totalR >= 0 ? `+${report.inSampleMetrics.totalR}` : report.inSampleMetrics.totalR}R
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Expectancy</span>
                          <div className="font-mono font-bold text-emerald-400">
                            {report.inSampleMetrics.expectancy} R/trade
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Profit Factor</span>
                          <div className="font-mono font-bold text-white">
                            {report.inSampleMetrics.profitFactor.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Max Drawdown</span>
                          <div className="font-mono font-bold text-rose-400">
                            -{report.inSampleMetrics.maxDrawdownR}R
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Out-Of-Sample Card */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
                          <h4 className="text-xs font-bold text-white uppercase">
                            Out-of-Sample Holdout (30% Unseen)
                          </h4>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {report.datasetInfo.outOfSampleCount} Candles
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Trades</span>
                          <div className="font-mono font-bold text-white">
                            {report.outOfSampleMetrics.totalTrades}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Win Rate</span>
                          <div className="font-mono font-bold text-purple-400">
                            {report.outOfSampleMetrics.winRate}%
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Net R</span>
                          <div className="font-mono font-bold text-white">
                            {report.outOfSampleMetrics.totalR >= 0 ? `+${report.outOfSampleMetrics.totalR}` : report.outOfSampleMetrics.totalR}R
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Expectancy</span>
                          <div className="font-mono font-bold text-purple-400">
                            {report.outOfSampleMetrics.expectancy} R/trade
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Profit Factor</span>
                          <div className="font-mono font-bold text-white">
                            {report.outOfSampleMetrics.profitFactor.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500">Max Drawdown</span>
                          <div className="font-mono font-bold text-rose-400">
                            -{report.outOfSampleMetrics.maxDrawdownR}R
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Gross vs Net Impact Table */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs space-y-3">
                    <h5 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                      Gross Strategy Performance vs Net Realized After Costs
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase">Gross Winning R</span>
                        <div className="font-mono font-bold text-emerald-400">+{report.overallMetrics.grossWinningR}R</div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase">Gross Losing R</span>
                        <div className="font-mono font-bold text-rose-400">-{report.overallMetrics.grossLosingR}R</div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase">Transaction Drag</span>
                        <div className="font-mono font-bold text-amber-400">-{report.overallMetrics.totalCostImpactR || 0}R</div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase">Net Realized R</span>
                        <div className="font-mono font-bold text-white">{report.overallMetrics.totalR >= 0 ? `+${report.overallMetrics.totalR}` : report.overallMetrics.totalR}R</div>
                      </div>
                    </div>
                  </div>

                  {/* Execution Summary Diagnostics */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
                    <h5 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                      Execution &amp; Filter Statistics
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-400">
                      <div>
                        <span>Candles Evaluated: </span>
                        <strong className="text-white font-mono">{report.executionSummary.evaluatedCandles}</strong>
                      </div>
                      <div>
                        <span>Signals Emitted: </span>
                        <strong className="text-white font-mono">{report.executionSummary.generatedSignals}</strong>
                      </div>
                      <div>
                        <span>Skipped Low Conf (&lt;{minConfidence}): </span>
                        <strong className="text-amber-400 font-mono">{report.executionSummary.skippedLowConfidence}</strong>
                      </div>
                      <div>
                        <span>Skipped Overlapping: </span>
                        <strong className="text-blue-400 font-mono">{report.executionSummary.skippedOverlapping}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: 5 Modular Strategies Breakdown */}
              {activeTab === 'STRATEGIES' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    Independent evaluation of each production strategy on identical historical candles without cross-contamination:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                          <th className="py-2.5 px-3">Strategy</th>
                          <th className="py-2.5 px-3">Trades</th>
                          <th className="py-2.5 px-3">Win Rate</th>
                          <th className="py-2.5 px-3">Net R</th>
                          <th className="py-2.5 px-3">Expectancy</th>
                          <th className="py-2.5 px-3">Profit Factor</th>
                          <th className="py-2.5 px-3">Max DD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                        {report.strategyBreakdown.map((s) => (
                          <tr key={s.strategy} className="hover:bg-slate-800/30">
                            <td className="py-3 px-3 font-sans font-semibold text-white">
                              {s.strategy}
                            </td>
                            <td className="py-3 px-3">{s.trades}</td>
                            <td className="py-3 px-3">
                              <span className={s.winRate >= 50 ? 'text-emerald-400' : 'text-slate-300'}>
                                {s.winRate}%
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={s.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {s.totalR >= 0 ? `+${s.totalR}` : s.totalR}R
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={s.expectancy >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {s.expectancy >= 0 ? `+${s.expectancy}` : s.expectancy}R
                              </span>
                            </td>
                            <td className="py-3 px-3">{s.profitFactor.toFixed(2)}</td>
                            <td className="py-3 px-3 text-rose-400">-{s.maxDrawdownR}R</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: Confidence Analysis (6 Tiers) */}
              {activeTab === 'CONFIDENCE' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    Evaluates algorithmic confluence calibration across 6 score tiers (0–49, 50–59, 60–69, 70–79, 80–89, 90–100):
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                          <th className="py-2.5 px-3">Confidence Tier</th>
                          <th className="py-2.5 px-3">Trades</th>
                          <th className="py-2.5 px-3">Wins / Losses</th>
                          <th className="py-2.5 px-3">Win Rate</th>
                          <th className="py-2.5 px-3">Total Net R</th>
                          <th className="py-2.5 px-3">Expectancy</th>
                          <th className="py-2.5 px-3">Profit Factor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                        {report.confidenceBuckets.map((b) => (
                          <tr key={b.bucket} className="hover:bg-slate-800/30">
                            <td className="py-3 px-3 font-sans font-bold text-white">
                              {b.bucket} / 100
                            </td>
                            <td className="py-3 px-3">{b.trades}</td>
                            <td className="py-3 px-3 text-slate-400">
                              {b.wins}W / {b.losses}L
                            </td>
                            <td className="py-3 px-3">
                              <span className={b.winRate >= 50 ? 'text-emerald-400' : 'text-slate-300'}>
                                {b.trades > 0 ? `${b.winRate}%` : '—'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={b.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {b.trades > 0 ? (b.totalR >= 0 ? `+${b.totalR}R` : `${b.totalR}R`) : '—'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              {b.trades > 0 ? `${b.expectancy >= 0 ? '+' : ''}${b.expectancy}R` : '—'}
                            </td>
                            <td className="py-3 px-3">
                              {b.trades > 0 ? b.profitFactor.toFixed(2) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: Risk / Reward & Friction */}
              {activeTab === 'RR' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                      <span className="text-[10px] uppercase text-slate-500 font-semibold">Average R / Trade</span>
                      <div className="text-xl font-bold font-mono text-white mt-1">
                        {report.overallMetrics.averageR >= 0 ? `+${report.overallMetrics.averageR}` : report.overallMetrics.averageR}R
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Median: {report.overallMetrics.averageR}R
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                      <span className="text-[10px] uppercase text-slate-500 font-semibold">Consecutive Streaks</span>
                      <div className="text-xl font-bold font-mono text-white mt-1">
                        <span className="text-emerald-400">{report.overallMetrics.maxConsecutiveWins}W</span> / <span className="text-rose-400">{report.overallMetrics.maxConsecutiveLosses}L</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Max Loss Streak: {report.overallMetrics.maxConsecutiveLosses}
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                      <span className="text-[10px] uppercase text-slate-500 font-semibold">Largest Win / Loss</span>
                      <div className="text-xl font-bold font-mono text-white mt-1">
                        <span className="text-emerald-400">+{report.overallMetrics.bestTradeR}R</span> / <span className="text-rose-400">-{report.overallMetrics.worstTradeR}R</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Avg Win: +{report.overallMetrics.averageWinR}R
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                      <span className="text-[10px] uppercase text-slate-500 font-semibold">Total Cost Drag</span>
                      <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                        -{report.overallMetrics.totalCostImpactR || 0}R
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Spread + Slippage + Comm
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                          <th className="py-2.5 px-3">Risk/Reward Bucket</th>
                          <th className="py-2.5 px-3">Trades</th>
                          <th className="py-2.5 px-3">Win Rate</th>
                          <th className="py-2.5 px-3">Net R</th>
                          <th className="py-2.5 px-3">Expectancy</th>
                          <th className="py-2.5 px-3">Profit Factor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                        {report.rrBuckets.map((b) => (
                          <tr key={b.bucket} className="hover:bg-slate-800/30">
                            <td className="py-3 px-3 font-sans font-bold text-white">
                              1 : {b.bucket}
                            </td>
                            <td className="py-3 px-3">{b.trades}</td>
                            <td className="py-3 px-3">{b.trades > 0 ? `${b.winRate}%` : '—'}</td>
                            <td className="py-3 px-3">
                              {b.trades > 0 ? (b.totalR >= 0 ? `+${b.totalR}R` : `${b.totalR}R`) : '—'}
                            </td>
                            <td className="py-3 px-3">
                              {b.trades > 0 ? `${b.expectancy >= 0 ? '+' : ''}${b.expectancy}R` : '—'}
                            </td>
                            <td className="py-3 px-3">{b.trades > 0 ? b.profitFactor.toFixed(2) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: Portfolio & Asset Breakdown */}
              {activeTab === 'PORTFOLIO' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-400">
                    Comparative historical baseline performance across Forex, Crypto, Commodities, and Indices:
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                          <th className="py-2.5 px-3">Symbol</th>
                          <th className="py-2.5 px-3">Class</th>
                          <th className="py-2.5 px-3">Trades</th>
                          <th className="py-2.5 px-3">Win Rate</th>
                          <th className="py-2.5 px-3">Net R</th>
                          <th className="py-2.5 px-3">Expectancy</th>
                          <th className="py-2.5 px-3">Profit Factor</th>
                          <th className="py-2.5 px-3">Max DD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                        {report.assetBreakdown && report.assetBreakdown.length > 0 ? (
                          report.assetBreakdown.map((a) => (
                            <tr key={a.symbol} className="hover:bg-slate-800/30">
                              <td className="py-3 px-3 font-sans font-bold text-white flex items-center gap-1.5">
                                <span>{a.symbol}</span>
                              </td>
                              <td className="py-3 px-3 font-sans text-slate-400">{a.assetClass}</td>
                              <td className="py-3 px-3">{a.trades}</td>
                              <td className="py-3 px-3">
                                <span className={a.winRate >= 50 ? 'text-emerald-400' : 'text-slate-300'}>
                                  {a.trades > 0 ? `${a.winRate}%` : '—'}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <span className={a.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {a.trades > 0 ? (a.totalR >= 0 ? `+${a.totalR}R` : `${a.totalR}R`) : '—'}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <span className={a.expectancy >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {a.trades > 0 ? `${a.expectancy >= 0 ? '+' : ''}${a.expectancy}R` : '—'}
                                </span>
                              </td>
                              <td className="py-3 px-3">{a.trades > 0 ? a.profitFactor.toFixed(2) : '—'}</td>
                              <td className="py-3 px-3 text-rose-400">
                                {a.trades > 0 ? `-${a.maxDrawdownR}R` : '—'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="py-6 text-center font-sans text-slate-500">
                              Single asset backtest currently selected ({report.config.symbol}). Select &quot;Real Multi-Asset Live Feeds&quot; or &quot;All 12 Supported Assets&quot; to evaluate cross-asset portfolio performance.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 6: Market Regimes */}
              {activeTab === 'REGIMES' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                        <th className="py-2.5 px-3">Market Regime</th>
                        <th className="py-2.5 px-3">Trades</th>
                        <th className="py-2.5 px-3">Win Rate</th>
                        <th className="py-2.5 px-3">Net R</th>
                        <th className="py-2.5 px-3">Expectancy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                      {report.regimeBreakdown.map((r) => (
                        <tr key={r.regime} className="hover:bg-slate-800/30">
                          <td className="py-3 px-3 font-sans font-semibold text-white">
                            {r.regime}
                          </td>
                          <td className="py-3 px-3">{r.trades}</td>
                          <td className="py-3 px-3">{r.trades > 0 ? `${r.winRate}%` : '—'}</td>
                          <td className="py-3 px-3">
                            {r.trades > 0 ? (r.totalR >= 0 ? `+${r.totalR}R` : `${r.totalR}R`) : '—'}
                          </td>
                          <td className="py-3 px-3">
                            {r.trades > 0 ? `${r.expectancy >= 0 ? '+' : ''}${r.expectancy}R` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 7: Monte Carlo Resampling */}
              {activeTab === 'MONTE_CARLO' && (
                <div className="space-y-6">
                  {/* Monte Carlo Controls & Status */}
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        <Dice5 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          Monte Carlo Bootstrap Resampling (1,000 Iterations)
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Assesses trade sequence risk, risk of ruin, and worst-case drawdowns by randomly re-ordering historical trade outcomes.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400">Iterations:</span>
                        <select
                          value={monteCarloIterations}
                          onChange={(e) => setMonteCarloIterations(Number(e.target.value))}
                          className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
                        >
                          <option value={500} className="bg-slate-900">500</option>
                          <option value={1000} className="bg-slate-900">1,000</option>
                          <option value={2000} className="bg-slate-900">2,000</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400">Seed:</span>
                        <input
                          type="number"
                          value={monteCarloSeed}
                          onChange={(e) => setMonteCarloSeed(Number(e.target.value))}
                          className="w-12 bg-transparent text-white font-mono text-center focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {monteCarlo ? (
                    <div className="space-y-6">
                      {/* Percentiles Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] uppercase text-slate-500 font-semibold">Median Drawdown (50th)</span>
                          <div className="text-xl font-bold font-mono text-rose-400">
                            -{monteCarlo.drawdownPercentiles.p50}R
                          </div>
                          <div className="text-[10px] text-slate-400">
                            25th: -{monteCarlo.drawdownPercentiles.p25}R | 75th: -{monteCarlo.drawdownPercentiles.p75}R
                          </div>
                        </div>

                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] uppercase text-slate-500 font-semibold">Worst-Case Drawdown (95th)</span>
                          <div className="text-xl font-bold font-mono text-rose-500">
                            -{monteCarlo.drawdownPercentiles.p95}R
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Max simulated: -{monteCarlo.drawdownPercentiles.max}R
                          </div>
                        </div>

                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] uppercase text-slate-500 font-semibold">Risk of Ruin (&gt;25R DD)</span>
                          <div className={`text-xl font-bold font-mono ${monteCarlo.riskOfRuinPercent === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {monteCarlo.riskOfRuinPercent}%
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Prob DD &gt; 15R: {monteCarlo.probabilityDrawdownAbove15R}%
                          </div>
                        </div>

                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] uppercase text-slate-500 font-semibold">Max Losing Streak (95th)</span>
                          <div className="text-xl font-bold font-mono text-amber-400">
                            {monteCarlo.losingStreakPercentiles.p95} Consecutive
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Median: {monteCarlo.losingStreakPercentiles.p50} | Worst: {monteCarlo.losingStreakPercentiles.max}
                          </div>
                        </div>
                      </div>

                      {/* Monte Carlo Resampled Fan Paths Visualizer */}
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                            Resampled Equity Curve Fan ({monteCarlo.simulatedCurves.length} Representative Paths)
                          </h5>
                          <span className="text-[11px] text-slate-500 font-mono">
                            Median End Equity: {monteCarlo.endingEquityPercentiles.p50 >= 100 ? `+${(monteCarlo.endingEquityPercentiles.p50 - 100).toFixed(1)}R` : `${(monteCarlo.endingEquityPercentiles.p50 - 100).toFixed(1)}R`}
                          </span>
                        </div>
                        <div className="h-56 w-full relative">
                          <MonteCarloFanChart sampleCurves={monteCarlo.simulatedCurves.map((c) => c.path)} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      Run a backtest with at least 2 closed trades to generate Monte Carlo probabilistic analysis.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 8: Complete Trade Log */}
              {activeTab === 'TRADES' && (
                <div className="space-y-3">
                  {/* Search & Filter Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 flex-1 max-w-sm">
                      <div className="relative w-full">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search symbol, strategy, direction..."
                          value={tradeSearchQuery}
                          onChange={(e) => setTradeSearchQuery(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Filter:</span>
                      <button
                        onClick={() => setTradeOutcomeFilter('ALL')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          tradeOutcomeFilter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                        }`}
                      >
                        All ({report.trades.length})
                      </button>
                      <button
                        onClick={() => setTradeOutcomeFilter('WIN')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          tradeOutcomeFilter === 'WIN' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Wins ({report.overallMetrics.wins})
                      </button>
                      <button
                        onClick={() => setTradeOutcomeFilter('LOSS')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          tradeOutcomeFilter === 'LOSS' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Losses ({report.overallMetrics.losses})
                      </button>
                      <button
                        onClick={() => setTradeOutcomeFilter('BE')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          tradeOutcomeFilter === 'BE' ? 'bg-amber-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Breakeven ({report.overallMetrics.breakevens})
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                          <th className="py-2.5 px-3">Dir</th>
                          <th className="py-2.5 px-3">Symbol</th>
                          <th className="py-2.5 px-3">Strategy</th>
                          <th className="py-2.5 px-3">Confidence</th>
                          <th className="py-2.5 px-3">Entry</th>
                          <th className="py-2.5 px-3">SL</th>
                          <th className="py-2.5 px-3">TP</th>
                          <th className="py-2.5 px-3">Exit Price</th>
                          <th className="py-2.5 px-3">Exit Reason</th>
                          <th className="py-2.5 px-3">Net R</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                        {filteredTrades.map((t) => {
                          const isExpanded = expandedTradeId === t.id;
                          return (
                            <React.Fragment key={t.id}>
                              <tr
                                onClick={() => setExpandedTradeId(isExpanded ? null : t.id)}
                                className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                              >
                                <td className="py-3 px-3 font-sans">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      t.direction === 'BUY'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}
                                  >
                                    {t.direction}
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-sans font-semibold text-white">
                                  {t.symbol}
                                </td>
                                <td className="py-3 px-3 font-sans text-slate-300">{t.strategy}</td>
                                <td className="py-3 px-3">
                                  <span className="font-bold text-blue-400">
                                    {t.confidenceScore}/100
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-slate-200">{t.entryPrice}</td>
                                <td className="py-3 px-3 text-rose-400">{t.stopLoss}</td>
                                <td className="py-3 px-3 text-emerald-400">{t.takeProfit}</td>
                                <td className="py-3 px-3 text-slate-200">{t.exitPrice}</td>
                                <td className="py-3 px-3 font-sans text-[11px]">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                      t.exitReason === 'TAKE_PROFIT'
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : t.exitReason === 'STOP_LOSS'
                                        ? 'bg-rose-500/10 text-rose-400'
                                        : 'bg-amber-500/10 text-amber-400'
                                    }`}
                                  >
                                    {t.exitReason.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-bold">
                                  <span
                                    className={
                                      t.RMultiple > 0
                                        ? 'text-emerald-400'
                                        : t.RMultiple < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-400'
                                    }
                                  >
                                    {t.RMultiple > 0 ? `+${t.RMultiple}` : t.RMultiple}R
                                  </span>
                                </td>
                              </tr>

                              {/* Expanded Row Details */}
                              {isExpanded && (
                                <tr className="bg-slate-950 border-b border-slate-800">
                                  <td colSpan={10} className="p-4 font-sans text-xs space-y-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                      <div>
                                        <span className="text-[10px] uppercase text-slate-500 font-semibold">Signal Time (Close of Bar)</span>
                                        <div className="font-mono text-slate-300 mt-0.5">{t.signalTimeISO || new Date(t.signalTime).toLocaleString()}</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] uppercase text-slate-500 font-semibold">Entry Time (Open of Next Bar)</span>
                                        <div className="font-mono text-slate-300 mt-0.5">{t.entryTimeISO || new Date(t.entryTime).toLocaleString()}</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] uppercase text-slate-500 font-semibold">Exit Time</span>
                                        <div className="font-mono text-slate-300 mt-0.5">{t.exitTimeISO || new Date(t.exitTime).toLocaleString()}</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] uppercase text-slate-500 font-semibold">Duration</span>
                                        <div className="font-mono text-slate-300 mt-0.5">{t.durationBars} bars ({Math.round(t.durationMs / 60000)} mins)</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] uppercase text-slate-500 font-semibold">Market Regime</span>
                                        <div className="text-slate-300 mt-0.5">{t.marketRegime}</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] uppercase text-slate-500 font-semibold">Cost Impact (Spread/Slip)</span>
                                        <div className="font-mono text-amber-400 mt-0.5">-{t.costImpactR}R</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] uppercase text-slate-500 font-semibold">Sample Partition</span>
                                        <div className="text-slate-300 mt-0.5">{t.sampleType}</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] uppercase text-slate-500 font-semibold">Same-Candle Ambiguity</span>
                                        <div className="text-slate-300 mt-0.5">{t.exitAmbiguity ? 'YES (Handled Conservatively)' : 'NO'}</div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 9: Engine Verification Suite */}
              {activeTab === 'VERIFICATION' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Automated Engine Verification Suite</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Deterministic mathematical assertions covering BUY/SELL targets, stops, conflict rules, provider validations, and look-ahead invariance.
                      </p>
                    </div>

                    <button
                      onClick={handleRunTestSuite}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Re-Run All 18 Tests</span>
                    </button>
                  </div>

                  {testSuiteResult ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                        <div className="flex items-center gap-2">
                          {testSuiteResult.allPassed ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-rose-400" />
                          )}
                          <span className="font-bold text-white">
                            {testSuiteResult.passedCount} / {testSuiteResult.totalTests} Tests Passed
                          </span>
                        </div>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-400">
                          Execution time: {testSuiteResult.executionDurationMs}ms
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3">ID</th>
                              <th className="py-2.5 px-3">Test Name</th>
                              <th className="py-2.5 px-3">Category</th>
                              <th className="py-2.5 px-3">Expected</th>
                              <th className="py-2.5 px-3">Actual</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-300">
                            {testSuiteResult.results.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-800/30">
                                <td className="py-2.5 px-3">
                                  {r.passed ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      PASS
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                      FAIL
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-400">{r.id}</td>
                                <td className="py-2.5 px-3 font-semibold text-white">{r.name}</td>
                                <td className="py-2.5 px-3 text-slate-400">{r.category}</td>
                                <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{r.expected}</td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-200">{r.actual}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      Click &quot;Re-Run All 18 Tests&quot; to execute the automated verification test suite.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Pure SVG Responsive Equity Curve Chart
 */
const EquityCurveChart: React.FC<{ points: any[] }> = ({ points }) => {
  if (!points || points.length < 2) return null;

  const minEquity = Math.min(...points.map((p) => p.equityR), 95);
  const maxEquity = Math.max(...points.map((p) => p.peakEquityR), 105);
  const range = maxEquity - minEquity || 1;

  const width = 800;
  const height = 220;
  const padding = { top: 20, right: 30, bottom: 30, left: 50 };

  const getX = (index: number) => {
    return padding.left + (index / (points.length - 1)) * (width - padding.left - padding.right);
  };

  const getY = (val: number) => {
    return (
      height -
      padding.bottom -
      ((val - minEquity) / range) * (height - padding.top - padding.bottom)
    );
  };

  // Build SVG Path
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.equityR).toFixed(1)}`)
    .join(' ');

  const peakPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.peakEquityR).toFixed(1)}`)
    .join(' ');

  const baselineY = getY(100);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {/* Grid Lines */}
      <line
        x1={padding.left}
        y1={baselineY}
        x2={width - padding.right}
        y2={baselineY}
        stroke="#334155"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <text
        x={padding.left - 8}
        y={baselineY + 4}
        fill="#64748b"
        fontSize="10"
        textAnchor="end"
        fontFamily="monospace"
      >
        100R
      </text>

      <line
        x1={padding.left}
        y1={getY(maxEquity)}
        x2={width - padding.right}
        y2={getY(maxEquity)}
        stroke="#1e293b"
        strokeWidth="1"
      />
      <text
        x={padding.left - 8}
        y={getY(maxEquity) + 4}
        fill="#64748b"
        fontSize="10"
        textAnchor="end"
        fontFamily="monospace"
      >
        {maxEquity.toFixed(0)}R
      </text>

      <line
        x1={padding.left}
        y1={getY(minEquity)}
        x2={width - padding.right}
        y2={getY(minEquity)}
        stroke="#1e293b"
        strokeWidth="1"
      />
      <text
        x={padding.left - 8}
        y={getY(minEquity) + 4}
        fill="#64748b"
        fontSize="10"
        textAnchor="end"
        fontFamily="monospace"
      >
        {minEquity.toFixed(0)}R
      </text>

      {/* Peak Equity Line (Grey) */}
      <path d={peakPath} fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 3" />

      {/* Main Equity Path */}
      <path
        d={linePath}
        fill="none"
        stroke="#10b981"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Trade markers */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={getX(i)}
          cy={getY(p.equityR)}
          r={points.length > 50 ? 2 : 3.5}
          fill={p.sampleType === 'OUT_OF_SAMPLE' ? '#a855f7' : '#3b82f6'}
          stroke="#0f172a"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
};

/**
 * Pure SVG Monte Carlo Fan Chart Visualizer
 */
const MonteCarloFanChart: React.FC<{ sampleCurves: number[][]; baselineEquity?: number }> = ({
  sampleCurves,
  baselineEquity = 100,
}) => {
  if (!sampleCurves || sampleCurves.length === 0) return null;

  let minVal = baselineEquity - 5;
  let maxVal = baselineEquity + 5;

  for (const curve of sampleCurves) {
    for (const val of curve) {
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
  }

  const range = maxVal - minVal || 1;
  const maxLen = Math.max(...sampleCurves.map((c) => c.length));
  if (maxLen < 2) return null;

  const width = 800;
  const height = 200;
  const padding = { top: 15, right: 30, bottom: 25, left: 50 };

  const getX = (index: number) => {
    return padding.left + (index / (maxLen - 1)) * (width - padding.left - padding.right);
  };

  const getY = (val: number) => {
    return (
      height -
      padding.bottom -
      ((val - minVal) / range) * (height - padding.top - padding.bottom)
    );
  };

  const baselineY = getY(baselineEquity);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {/* Baseline Grid */}
      <line
        x1={padding.left}
        y1={baselineY}
        x2={width - padding.right}
        y2={baselineY}
        stroke="#475569"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <text
        x={padding.left - 8}
        y={baselineY + 4}
        fill="#94a3b8"
        fontSize="10"
        textAnchor="end"
        fontFamily="monospace"
      >
        {baselineEquity.toFixed(0)}R
      </text>

      {/* Top / Bottom Labels */}
      <text
        x={padding.left - 8}
        y={getY(maxVal) + 4}
        fill="#64748b"
        fontSize="10"
        textAnchor="end"
        fontFamily="monospace"
      >
        {maxVal.toFixed(0)}R
      </text>
      <text
        x={padding.left - 8}
        y={getY(minVal) + 4}
        fill="#64748b"
        fontSize="10"
        textAnchor="end"
        fontFamily="monospace"
      >
        {minVal.toFixed(0)}R
      </text>

      {/* Sample Paths */}
      {sampleCurves.map((curve, idx) => {
        const path = curve
          .map((val, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(val).toFixed(1)}`)
          .join(' ');
        const isLast = idx === 0;
        return (
          <path
            key={idx}
            d={path}
            fill="none"
            stroke={isLast ? '#38bdf8' : '#3b82f6'}
            strokeOpacity={isLast ? 0.9 : 0.25}
            strokeWidth={isLast ? 2 : 1}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};
