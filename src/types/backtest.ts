import { Timeframe, TradeType, AssetClass } from './index';

export type StrategyFilter =
  | 'ALL'
  | 'BREAKOUT'
  | 'PULLBACK'
  | 'TREND_FOLLOWING'
  | 'LIQUIDITY_SWEEP'
  | 'SUPPORT_RESISTANCE';

export type ExitConflictRule = 'CONSERVATIVE' | 'STOP_FIRST' | 'TARGET_FIRST';

export type PositionModel = 'ONE_POSITION_PER_SYMBOL' | 'MAX_POSITIONS' | 'UNLIMITED';

export type BacktestSampleType = 'IN_SAMPLE' | 'OUT_OF_SAMPLE' | 'FULL';

export interface CostModelConfig {
  enabled: boolean;
  spreadPips: number;
  slippagePips: number;
  commissionR: number; // in R per trade (e.g. 0.02R)
}

export interface BacktestConfig {
  symbol: string;
  timeframe: Timeframe;
  strategyFilter: StrategyFilter;
  tradeType: TradeType;
  minConfidence: number; // e.g. 60
  minRiskReward: number; // e.g. 1.5
  inSampleRatio: number; // e.g. 0.70 (70% in-sample, 30% out-of-sample)
  sampleMode: BacktestSampleType;
  positionModel: PositionModel;
  maxSimultaneousPositions: number;
  exitConflictRule: ExitConflictRule;
  costModel: CostModelConfig;
  warmupPeriod: number; // minimum candles before first evaluation (e.g. 35)
}

export type TradeResultType = 'WIN' | 'LOSS' | 'BREAKEVEN' | 'AMBIGUOUS';

export type ExitReason =
  | 'STOP_LOSS'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_2'
  | 'SAME_CANDLE_CONFLICT_LOSS'
  | 'SAME_CANDLE_CONFLICT_WIN'
  | 'MAX_BARS_EXPIRED'
  | 'IN_PROGRESS';

export interface BacktestTrade {
  id: string;
  symbol: string;
  strategy: string;
  direction: 'BUY' | 'SELL';
  signalTime: number;
  signalTimeISO: string;
  entryTime: number;
  entryTimeISO: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;
  confidenceScore: number;
  riskReward: number;
  exitTime: number;
  exitTimeISO: string;
  exitPrice: number;
  exitReason: ExitReason;
  result: TradeResultType;
  grossR: number;
  netR: number;
  RMultiple: number; // identical to netR
  durationMs: number;
  durationBars: number;
  marketRegime: string;
  volatilityState: string;
  newsRisk: 'UNKNOWN';
  exitAmbiguity: boolean;
  supportingStrategies: string[];
  costImpactR: number;
  sampleType: 'IN_SAMPLE' | 'OUT_OF_SAMPLE';
  entryBarIndex: number;
  exitBarIndex: number;
}

export interface EquityPoint {
  tradeNumber: number;
  timestamp: number;
  dateISO: string;
  rMultiple: number;
  cumulativeR: number;
  equityR: number; // Starts at 100R
  peakEquityR: number;
  drawdownR: number;
  drawdownPercent: number;
  sampleType: 'IN_SAMPLE' | 'OUT_OF_SAMPLE';
}

export interface PerformanceStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  ambiguousTrades: number;
  winRate: number; // 0-100
  lossRate: number; // 0-100
  totalR: number;
  averageR: number;
  medianR: number;
  grossWinningR: number;
  grossLosingR: number;
  grossTotalR: number;
  netTotalR: number;
  profitFactor: number;
  grossProfitFactor: number;
  netProfitFactor: number;
  totalCostImpactR: number;
  averageWinR: number;
  averageLossR: number;
  expectancy: number; // in R per trade: (winRate/100 * avgWinR) - (lossRate/100 * avgLossR)
  maxDrawdownR: number;
  maxDrawdownPercent: number;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  averageTradeDurationBars: number;
  averageTradeDurationMinutes: number;
  bestTradeR: number;
  worstTradeR: number;
  largestWinR: number;
  largestLossR: number;
  ignoredSignalsCount: number;
}

export interface ConfidenceBucketMetric {
  bucket: '0-49' | '50-59' | '60-69' | '70-79' | '80-89' | '90-100';
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  averageR: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
}

export interface RRBucketMetric {
  bucket: '1.5-1.99' | '2.0-2.49' | '2.5-2.99' | '3.0+';
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  averageR: number;
  expectancy: number;
  profitFactor: number;
}

export interface StrategyMetric {
  strategy: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  averageR: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
}

export interface MarketRegimeMetric {
  regime: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  averageR: number;
  expectancy: number;
}

export interface AssetMetric {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  averageR: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
}

export interface TimeframeMetric {
  timeframe: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  averageR: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
}

export interface DataQualityReport {
  isValid: boolean;
  totalCandles: number;
  duplicateCount: number;
  outOfOrderCount: number;
  zeroOrNaNCandles: number;
  invalidGeometryCount: number;
  gapsDetected: number;
  warnings: string[];
  errors: string[];
}

export interface DatasetInfo {
  symbol: string;
  timeframe: Timeframe;
  totalCandles: number;
  startDate: string;
  endDate: string;
  inSampleCount: number;
  outOfSampleCount: number;
  source: string;
  dataQuality: DataQualityReport;
}

export interface BacktestReport {
  id: string;
  timestamp: number;
  config: BacktestConfig;
  datasetInfo: DatasetInfo;
  overallMetrics: PerformanceStats;
  inSampleMetrics: PerformanceStats;
  outOfSampleMetrics: PerformanceStats;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  strategyBreakdown: StrategyMetric[];
  confidenceBuckets: ConfidenceBucketMetric[];
  rrBuckets: RRBucketMetric[];
  regimeBreakdown: MarketRegimeMetric[];
  assetBreakdown: AssetMetric[];
  timeframeBreakdown: TimeframeMetric[];
  bestPerformingAsset?: { symbol: string; winRate: number; totalR: number; expectancy: number };
  worstPerformingAsset?: { symbol: string; winRate: number; totalR: number; expectancy: number };
  bestPerformingStrategy?: { strategy: string; winRate: number; totalR: number; expectancy: number };
  worstPerformingStrategy?: { strategy: string; winRate: number; totalR: number; expectancy: number };
  bestPerformingTimeframe?: { timeframe: string; winRate: number; totalR: number; expectancy: number };
  worstPerformingTimeframe?: { timeframe: string; winRate: number; totalR: number; expectancy: number };
  monteCarlo?: MonteCarloSimulationResult;
  executionSummary: {
    durationMs: number;
    evaluatedCandles: number;
    generatedSignals: number;
    executedTrades: number;
    skippedOverlapping: number;
    skippedLowConfidence: number;
    skippedLowRR: number;
  };
}

export interface TestCaseResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export interface MonteCarloSimulationResult {
  iterations: number;
  seed: number;
  drawdownPercentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    max: number;
  };
  losingStreakPercentiles: {
    p5: number;
    p50: number;
    p95: number;
    max: number;
  };
  endingEquityPercentiles: {
    p5: number;
    p50: number;
    p95: number;
  };
  riskOfRuinPercent: number;
  probabilityDrawdownAbove10R: number;
  probabilityDrawdownAbove15R: number;
  probabilityDrawdownAbove20R: number;
  simulatedCurves: {
    id: number;
    path: number[];
  }[];
}

export interface MultiAssetBacktestReport {
  id: string;
  timestamp: number;
  config: BacktestConfig;
  overallMetrics: PerformanceStats;
  portfolioReport: BacktestReport;
  assetReports: Record<string, BacktestReport | { error: string; symbol: string }>;
  monteCarlo?: MonteCarloSimulationResult;
}

export interface BacktestSuiteResult {
  timestamp: number;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  allPassed: boolean;
  results: TestCaseResult[];
  executionDurationMs: number;
}

