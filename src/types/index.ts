export type Timeframe = 'M5' | 'M15' | 'H1' | 'H4' | 'D1';

export type TradeType = 'SCALP' | 'DAY' | 'SWING';

export type SignalDirection = 'BUY' | 'SELL' | 'WAIT';

export type SignalStatus = 'ACTIVE' | 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT' | 'INVALIDATED' | 'EXPIRED';

export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type AssetClass = 'FOREX' | 'CRYPTO' | 'COMMODITIES' | 'INDICES' | 'STOCKS' | 'COMMODITY' | 'INDEX';

export type MarketDataStatus =
  | 'LIVE'
  | 'STALE'
  | 'OFFLINE'
  | 'ERROR'
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'TEST_DATA';

export type MarketRegimeType =
  | 'TRENDING_BULLISH'
  | 'TRENDING_BEARISH'
  | 'RANGING'
  | 'BREAKOUT'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'UNCLEAR';

export type VolatilityLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

export type StrategyName =
  | 'BREAKOUT'
  | 'PULLBACK'
  | 'TREND_FOLLOWING'
  | 'LIQUIDITY_SWEEP'
  | 'SUPPORT_RESISTANCE';

export type ConfluenceEvidenceLevel =
  | 'STRONG_SUPPORT'
  | 'SUPPORT'
  | 'NEUTRAL'
  | 'CONFLICT'
  | 'STRONG_CONFLICT';

export type NewsRiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface NewsRiskInfo {
  symbol: string;
  riskLevel: NewsRiskLevel;
  notes: string;
  headline?: string;
  source?: string;
  timestamp?: number;
}

export interface NewsRiskProvider {
  getNewsRisk(symbol: string): Promise<NewsRiskInfo> | NewsRiskInfo;
}

export interface MarketRegime {
  regime: MarketRegimeType;
  confidence: number; // 0-100
  description: string;
  adxOrTrendSlope?: number;
  atrPercent?: number;
  rangeWidthPercent?: number;
  primaryCharacteristic: string;
}

export interface TimeframeTrend {
  timeframe: Timeframe;
  bias: MarketBias;
  strength: number; // 0-100
  description: string;
}

export interface MultiTimeframeTrendReport {
  overallTrend: MarketBias;
  alignmentScore: number; // 0-100
  timeframes: {
    M5: TimeframeTrend;
    M15: TimeframeTrend;
    H1: TimeframeTrend;
    H4: TimeframeTrend;
    D1?: TimeframeTrend;
  };
  isFullyAligned: boolean;
  conflictingTimeframes: Timeframe[];
}

export interface StrategyResult {
  strategyName: StrategyName;
  direction: 'BUY' | 'SELL' | 'NONE';
  valid: boolean;
  strength: number; // 0-100
  timeframe: Timeframe;
  reason: string;
  conditions: string[];
  entryZone?: { low: number; high: number };
  invalidationLevel?: number;
}

export interface ConfluenceEvidence {
  source: string;
  classification: ConfluenceEvidenceLevel;
  bias: MarketBias;
  weight: number;
  detail: string;
}

export interface ConfluenceReport {
  overallConfluence: 'HIGH' | 'MODERATE' | 'LOW' | 'CONFLICTING';
  aggregateScore: number; // 0 to 100
  evidence: ConfluenceEvidence[];
  dominantBias: MarketBias;
  supportingCount: number;
  conflictingCount: number;
}

export interface ConfidenceBreakdown {
  htfAlignment: number; // max 20
  marketStructure: number; // max 20
  entryConfirmation: number; // max 15
  momentumAlignment: number; // max 15
  liquidityCondition: number; // max 10
  srClearance: number; // max 10
  volatilitySuitability: number; // max 10
  riskRewardRatio: number; // max 10
  strategyAgreement: number; // max 10
  conflictingPenalty: number; // -10 to -30
  totalScore: number; // 0-100
}

export interface Asset {
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  providerSymbol: string;
  exchange?: string;
  enabled: boolean;
  supportedTimeframes: Timeframe[];
  provider: string;
  pipSize: number;
  digits: number;
  icon: string;
  description: string;
  isCustom?: boolean;
}

export interface InstrumentConfig {
  symbol: string;
  name: string;
  displayName?: string;
  assetClass: AssetClass;
  providerSymbol?: string;
  exchange?: string;
  enabled?: boolean;
  supportedTimeframes?: Timeframe[];
  provider?: string;
  pipSize: number;
  digits: number;
  icon: string;
  description: string;
  isCustom?: boolean;
}

export interface MarketCandle {
  time: number; // unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol?: string;
  timeframe?: Timeframe;
  source?: string;
  timestamp?: number;
  datetime?: string;
}

export interface MarketQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: number;
  marketStatus: 'OPEN' | 'CLOSED' | 'WEEKEND';
  dataSource: string;
  status?: MarketDataStatus;
  errorMessage?: string;
  isTest?: boolean;
}

export interface MarketPrice {
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  price: number;
  bid?: number;
  ask?: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: number;
  lastUpdate: string;
  marketStatus: 'OPEN' | 'CLOSED' | 'WEEKEND';
  dataSource: string;
  status: MarketDataStatus;
  errorMessage?: string;
  exchange?: string;
  isTest?: boolean;
}

export interface ProviderStatusInfo {
  provider: string;
  configured: boolean;
  status: 'ONLINE' | 'RATE_LIMITED' | 'DEGRADED' | 'UNCONFIGURED' | 'ERROR';
  message?: string;
  lastChecked: number;
  rateLimitStats?: {
    minuteRequests: number;
    minuteLimit: number;
    dailyRequests: number;
    dailyLimit: number;
    isLimitReached: boolean;
  };
}

export interface IndicatorData {
  ema20: number[];
  ema50: number[];
  ema200: number[];
  rsi: number[];
  macd: {
    macdLine: number[];
    signalLine: number[];
    histogram: number[];
  };
  atr: number[];
  bollingerBands: {
    upper: number[];
    middle: number[];
    lower: number[];
    bandwidth: number[];
  };
  pivotPoints: {
    pp: number;
    r1: number;
    s1: number;
    r2: number;
    s2: number;
    r3: number;
    s3: number;
  };
  swingHighs: { index: number; price: number; time: number }[];
  swingLows: { index: number; price: number; time: number }[];
}

export interface PriceZone {
  type: 'SUPPORT' | 'RESISTANCE' | 'SUPPLY' | 'DEMAND';
  topPrice: number;
  bottomPrice: number;
  touches: number;
  strength: number; // 1-10
  timeframe?: Timeframe;
  distanceFromPrice?: number;
}

export interface LiquiditySweep {
  type: 'SWEEP_HIGHS' | 'SWEEP_LOWS';
  price: number;
  time: number;
  reversalConfirmed: boolean;
  significance: 'HIGH' | 'MEDIUM' | 'LOW';
  candleIndex?: number;
  sweepDistance?: number;
}

export interface MarketStructure {
  trend: MarketBias;
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  lastBOS: {
    type: 'BULLISH' | 'BEARISH';
    price: number;
    time: number;
  } | null;
  lastCHoCH: {
    type: 'BULLISH' | 'BEARISH';
    price: number;
    time: number;
  } | null;
  supportResistanceZones: PriceZone[];
  liquiditySweeps: LiquiditySweep[];
  volatilityState: 'EXPANDING' | 'COMPRESSING' | 'NORMAL';
  momentumState: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH' | 'DIVERGENT';
}

export interface StrategyCondition {
  id: string;
  name: string;
  category: 'TREND' | 'STRUCTURE' | 'SUPPORT_RESISTANCE' | 'PULLBACK' | 'BREAKOUT' | 'LIQUIDITY' | 'MOMENTUM' | 'VOLATILITY' | 'MTF_CONFLUENCE';
  met: boolean;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number; // weight contribution (0-20)
  description: string;
}

export interface ConfidenceFactor {
  name: string;
  category: string;
  weight: number;
  score: number; // 0-100
  detail: string;
}

export interface Signal {
  id: string;
  signalId?: string; // alias for id
  instrument: string;
  symbol?: string; // alias for instrument
  assetClass?: AssetClass;
  direction: SignalDirection;
  tradeType: TradeType;
  timeframe?: Timeframe;
  currentPrice: number;
  suggestedEntry: number;
  entry?: number; // alias for suggestedEntry
  entryZone?: { low: number; high: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  riskRewardRatio: number; // e.g., 2.5 means 1:2.5
  riskReward?: number; // alias for riskRewardRatio
  aiConfidence: number; // 0-100
  confidenceScore?: number; // alias for aiConfidence
  confidenceBreakdown?: ConfidenceBreakdown;
  marketBias: MarketBias;
  marketRegime?: MarketRegime;
  strategyResults?: StrategyResult[];
  confluence?: ConfluenceReport;
  reasons?: string[]; // list of key decision reasons
  timestamp: number;
  createdAt?: number; // alias for timestamp
  setupExplanation: string;
  conditionsDetected: string[];
  invalidationCondition: string;
  invalidation?: string; // alias for invalidationCondition
  status: SignalStatus;
  outcomeR?: number; // realized gain/loss in R-multiples (e.g. +2.0, -1.0)
  closedAt?: number;
  timeframeUsed: {
    context: Timeframe;
    entry: Timeframe;
  };
  confidenceFactors: ConfidenceFactor[];
  strategyBreakdown: {
    trendFollowing: boolean;
    breakout: boolean;
    pullback: boolean;
    supportResistance: boolean;
    marketStructure: boolean;
    liquiditySweep: boolean;
    momentum: boolean;
    volatility: boolean;
    mtfConfluence: boolean;
  };
  highestPriceReached?: number;
  lowestPriceReached?: number;
  newsRisk?: NewsRiskInfo;
}

export interface RiskSettings {
  maxRiskPerTradePercent: number; // e.g. 1.0%
  minRiskReward: number; // e.g. 1.5
  maxSimultaneousSignals: number; // e.g. 4
  maxDailySignals: number; // e.g. 10
  maxConsecutiveLosses: number; // e.g. 3
  maxDailyDrawdownPercent: number; // e.g. 3.0%
  minConfidenceRequired: number; // e.g. 65
}

export interface PerformanceGroup {
  total: number;
  wins: number;
  losses: number;
  invalidated: number;
  winRate: number; // 0-100
  totalR: number;
  avgR: number;
}

export interface PerformanceAnalytics {
  totalSignals: number;
  activeSignals: number;
  completedSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  averageR: number;
  profitFactor: number;
  bestInstrument: string;
  worstInstrument: string;
  bestStrategy: string;
  bestTradeType: TradeType;
  byInstrument: Record<string, PerformanceGroup>;
  byStrategy: Record<string, PerformanceGroup>;
  byTradeType: Record<TradeType, PerformanceGroup>;
  byConfidenceBracket: {
    '0-49': PerformanceGroup;
    '50-59': PerformanceGroup;
    '60-69': PerformanceGroup;
    '70-79': PerformanceGroup;
    '80-89': PerformanceGroup;
    '90-100': PerformanceGroup;
  };
  byDirection: {
    BUY: PerformanceGroup;
    SELL: PerformanceGroup;
  };
}

export interface SignalNotification {
  id: string;
  type: 'NEW_SIGNAL' | 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT' | 'INVALIDATED' | 'INFO';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  signalId?: string;
  instrument?: string;
}

export interface NotificationItem {
  id: string;
  type: 'SIGNAL_NEW' | 'TP_HIT' | 'SL_HIT' | 'INVALIDATED' | 'RISK_ALERT' | 'SYSTEM';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  signalId?: string;
  instrument?: string;
}

export * from './backtest';


