import {
  Signal,
  SignalStatus,
  PerformanceAnalytics,
  PerformanceGroup,
  TradeType,
  SignalEvaluationLogEntry,
} from '../src/types';

// In-memory persistent journal
let signalJournal: Signal[] = [];

// Seed historical signals with realistic outcomes for testing calibration
export function initializeHistoricalJournal(force: boolean = false) {
  if (signalJournal.length > 0 && !force) return;

  const now = Date.now();
  const dayMs = 86400000;
  const hourMs = 3600000;

  const mockHistorical: Signal[] = [
    {
      id: 'SIG-EURUSD-HIST-01',
      signalId: 'SIG-EURUSD-HIST-01',
      instrument: 'EURUSD',
      symbol: 'EURUSD',
      direction: 'BUY',
      tradeType: 'DAY',
      strategy: 'TREND_FOLLOWING',
      timeframe: 'M15',
      candleTimestamp: now - 3 * dayMs - 4 * hourMs,
      scanTimestamp: now - 3 * dayMs - 4 * hourMs,
      timestamp: now - 3 * dayMs - 4 * hourMs,
      createdAt: now - 3 * dayMs - 4 * hourMs,
      currentPrice: 1.0842,
      suggestedEntry: 1.0842,
      entry: 1.0842,
      stopLoss: 1.0815,
      takeProfit1: 1.0896,
      takeProfit2: 1.0925,
      riskRewardRatio: 2.0,
      riskReward: 2.0,
      aiConfidence: 86,
      confidenceScore: 86,
      marketBias: 'BULLISH',
      provider: 'Historical Archive',
      dataSource: 'Historical Archive',
      marketPriceAtCreation: 1.0842,
      setupFingerprint: 'EURUSD:BUY:TREND_FOLLOWING:M15:HIST01:1.0838-1.0845',
      isHistoricalSeed: true,
      isSimulated: true,
      setupExplanation: 'Multi-timeframe confluence on H1/M15 with Bullish BOS breaking 1.0838 and retest of dynamic 50 EMA value zone.',
      conditionsDetected: ['Trend Alignment: Bullish Multi-EMA', 'Market Structure: Bullish BOS', 'Pullback: Healthy Retracement', 'MTF Confluence: H1 ➔ M15 Aligned'],
      invalidationCondition: '1-candle close below swing low 1.0815.',
      invalidation: '1-candle close below swing low 1.0815.',
      status: 'TP1_HIT',
      outcomeR: 2.0,
      closedAt: now - 3 * dayMs + 6 * hourMs,
      closedPrice: 1.0896,
      closedByProvider: 'Historical Archive',
      timeframeUsed: { context: 'H1', entry: 'M15' },
      confidenceFactors: [
        { name: 'Multi-Timeframe Alignment', category: 'MTF_CONFLUENCE', weight: 25, score: 95, detail: 'H1 context fully confirms M15 trigger.' },
        { name: 'Market Structure & Order Flow', category: 'STRUCTURE', weight: 20, score: 90, detail: 'Clean BOS breakout with sustained volume.' },
        { name: 'Multi-EMA Trend Cascade', category: 'TREND', weight: 18, score: 88, detail: 'Stacked 20/50/200 EMAs in bullish sequence.' },
        { name: 'Risk/Reward Asymmetry', category: 'RISK_MANAGEMENT', weight: 10, score: 85, detail: '1:2.0 verified ratio.' },
      ],
      strategyBreakdown: {
        trendFollowing: true,
        breakout: true,
        pullback: true,
        supportResistance: true,
        marketStructure: true,
        liquiditySweep: false,
        momentum: true,
        volatility: true,
        mtfConfluence: true,
      },
    },
    {
      id: 'SIG-XAUUSD-HIST-02',
      signalId: 'SIG-XAUUSD-HIST-02',
      instrument: 'XAUUSD',
      symbol: 'XAUUSD',
      direction: 'BUY',
      tradeType: 'SWING',
      strategy: 'LIQUIDITY_SWEEP',
      timeframe: 'H1',
      candleTimestamp: now - 5 * dayMs,
      scanTimestamp: now - 5 * dayMs,
      timestamp: now - 5 * dayMs,
      createdAt: now - 5 * dayMs,
      currentPrice: 2390.5,
      suggestedEntry: 2390.5,
      entry: 2390.5,
      stopLoss: 2372.0,
      takeProfit1: 2436.75,
      takeProfit2: 2465.0,
      riskRewardRatio: 2.5,
      riskReward: 2.5,
      aiConfidence: 91,
      confidenceScore: 91,
      marketBias: 'BULLISH',
      provider: 'Historical Archive',
      dataSource: 'Historical Archive',
      marketPriceAtCreation: 2390.5,
      setupFingerprint: 'XAUUSD:BUY:LIQUIDITY_SWEEP:H1:HIST02:2385.0-2395.0',
      isHistoricalSeed: true,
      isSimulated: true,
      setupExplanation: 'H4 macro liquidity sweep below 2380 with instantaneous aggressive absorption and Bullish CHoCH on H1.',
      conditionsDetected: ['Liquidity Sweep: Sell-Side Liquidity Purged', 'Market Structure: Bullish CHoCH', 'MTF Confluence: H4 ➔ H1 Aligned', 'Momentum: Bullish Acceleration'],
      invalidationCondition: '4-hour close below liquidity sweep low 2372.0.',
      invalidation: '4-hour close below liquidity sweep low 2372.0.',
      status: 'TP2_HIT',
      outcomeR: 3.7,
      closedAt: now - 2 * dayMs,
      closedPrice: 2465.0,
      closedByProvider: 'Historical Archive',
      timeframeUsed: { context: 'H4', entry: 'H1' },
      confidenceFactors: [
        { name: 'Multi-Timeframe Alignment', category: 'MTF_CONFLUENCE', weight: 25, score: 96, detail: 'H4 macro institutional sweep confirmed on H1.' },
        { name: 'Market Structure & Order Flow', category: 'STRUCTURE', weight: 20, score: 94, detail: 'Reversal CHoCH printed with expansion bar.' },
        { name: 'Value Zone & S/R Confluence', category: 'SUPPORT_RESISTANCE', weight: 15, score: 90, detail: 'Institutional demand block defense.' },
      ],
      strategyBreakdown: {
        trendFollowing: true,
        breakout: true,
        pullback: false,
        supportResistance: true,
        marketStructure: true,
        liquiditySweep: true,
        momentum: true,
        volatility: true,
        mtfConfluence: true,
      },
    },
    {
      id: 'SIG-NAS100-HIST-03',
      signalId: 'SIG-NAS100-HIST-03',
      instrument: 'NAS100',
      symbol: 'NAS100',
      direction: 'SELL',
      tradeType: 'SCALP',
      strategy: 'LIQUIDITY_SWEEP',
      timeframe: 'M5',
      candleTimestamp: now - 2 * dayMs + 2 * hourMs,
      scanTimestamp: now - 2 * dayMs + 2 * hourMs,
      timestamp: now - 2 * dayMs + 2 * hourMs,
      createdAt: now - 2 * dayMs + 2 * hourMs,
      currentPrice: 19920.0,
      suggestedEntry: 19920.0,
      entry: 19920.0,
      stopLoss: 19975.0,
      takeProfit1: 19810.0,
      takeProfit2: 19750.0,
      riskRewardRatio: 2.0,
      riskReward: 2.0,
      aiConfidence: 78,
      confidenceScore: 78,
      marketBias: 'BEARISH',
      provider: 'Historical Archive',
      dataSource: 'Historical Archive',
      marketPriceAtCreation: 19920.0,
      setupFingerprint: 'NAS100:SELL:LIQUIDITY_SWEEP:M5:HIST03:19910.0-19930.0',
      isHistoricalSeed: true,
      isSimulated: true,
      setupExplanation: 'M15 double top liquidity purge above session highs followed by Bearish BOS on M5 and RSI overbought divergence.',
      conditionsDetected: ['Liquidity Sweep: Buy-Side Liquidity Purged', 'Market Structure: Bearish BOS', 'Momentum: Overbought Divergence'],
      invalidationCondition: 'M5 candle close above session high 19975.0.',
      invalidation: 'M5 candle close above session high 19975.0.',
      status: 'TP1_HIT',
      outcomeR: 2.0,
      closedAt: now - 2 * dayMs + 5 * hourMs,
      closedPrice: 19810.0,
      closedByProvider: 'Historical Archive',
      timeframeUsed: { context: 'M15', entry: 'M5' },
      confidenceFactors: [
        { name: 'Multi-Timeframe Alignment', category: 'MTF_CONFLUENCE', weight: 25, score: 80, detail: 'M15 resistance rejection.' },
        { name: 'Market Structure & Order Flow', category: 'STRUCTURE', weight: 20, score: 85, detail: 'M5 structural shift.' },
      ],
      strategyBreakdown: {
        trendFollowing: false,
        breakout: false,
        pullback: true,
        supportResistance: true,
        marketStructure: true,
        liquiditySweep: true,
        momentum: true,
        volatility: false,
        mtfConfluence: true,
      },
    },
    {
      id: 'SIG-GBPUSD-HIST-04',
      signalId: 'SIG-GBPUSD-HIST-04',
      instrument: 'GBPUSD',
      symbol: 'GBPUSD',
      direction: 'BUY',
      tradeType: 'DAY',
      strategy: 'PULLBACK',
      timeframe: 'M15',
      candleTimestamp: now - 4 * dayMs,
      scanTimestamp: now - 4 * dayMs,
      timestamp: now - 4 * dayMs,
      createdAt: now - 4 * dayMs,
      currentPrice: 1.2680,
      suggestedEntry: 1.2680,
      entry: 1.2680,
      stopLoss: 1.2645,
      takeProfit1: 1.2750,
      takeProfit2: 1.2785,
      riskRewardRatio: 2.0,
      riskReward: 2.0,
      aiConfidence: 64,
      confidenceScore: 64,
      marketBias: 'BULLISH',
      provider: 'Historical Archive',
      dataSource: 'Historical Archive',
      marketPriceAtCreation: 1.2680,
      setupFingerprint: 'GBPUSD:BUY:PULLBACK:M15:HIST04:1.2675-1.2685',
      isHistoricalSeed: true,
      isSimulated: true,
      setupExplanation: 'Attempted pullback entry at 50% Fib retracement. Higher timeframe bias was moderately bullish.',
      conditionsDetected: ['Pullback: Uptrend Retracement', 'Trend Alignment: Moderate Bullish'],
      invalidationCondition: 'H1 close below 1.2645 support.',
      invalidation: 'H1 close below 1.2645 support.',
      status: 'SL_HIT',
      outcomeR: -1.0,
      closedAt: now - 4 * dayMs + 8 * hourMs,
      closedPrice: 1.2645,
      closedByProvider: 'Historical Archive',
      timeframeUsed: { context: 'H1', entry: 'M15' },
      confidenceFactors: [
        { name: 'Multi-Timeframe Alignment', category: 'MTF_CONFLUENCE', weight: 25, score: 62, detail: 'Moderate alignment.' },
        { name: 'Market Structure & Order Flow', category: 'STRUCTURE', weight: 20, score: 60, detail: 'Weak higher high.' },
      ],
      strategyBreakdown: {
        trendFollowing: true,
        breakout: false,
        pullback: true,
        supportResistance: false,
        marketStructure: false,
        liquiditySweep: false,
        momentum: false,
        volatility: false,
        mtfConfluence: true,
      },
    },
    {
      id: 'SIG-EURUSD-HIST-05',
      signalId: 'SIG-EURUSD-HIST-05',
      instrument: 'EURUSD',
      symbol: 'EURUSD',
      direction: 'SELL',
      tradeType: 'SCALP',
      strategy: 'SUPPORT_RESISTANCE',
      timeframe: 'M5',
      candleTimestamp: now - 1 * dayMs - 2 * hourMs,
      scanTimestamp: now - 1 * dayMs - 2 * hourMs,
      timestamp: now - 1 * dayMs - 2 * hourMs,
      createdAt: now - 1 * dayMs - 2 * hourMs,
      currentPrice: 1.0890,
      suggestedEntry: 1.0890,
      entry: 1.0890,
      stopLoss: 1.0910,
      takeProfit1: 1.0850,
      takeProfit2: 1.0830,
      riskRewardRatio: 2.0,
      riskReward: 2.0,
      aiConfidence: 74,
      confidenceScore: 74,
      marketBias: 'BEARISH',
      provider: 'Historical Archive',
      dataSource: 'Historical Archive',
      marketPriceAtCreation: 1.0890,
      setupFingerprint: 'EURUSD:SELL:SUPPORT_RESISTANCE:M5:HIST05:1.0885-1.0895',
      isHistoricalSeed: true,
      isSimulated: true,
      setupExplanation: 'Rejection at daily pivot R1 with M5 bearish engulfing and MACD crossover.',
      conditionsDetected: ['Resistance Level Rejection', 'Momentum: Bearish Acceleration', 'Market Structure: Bearish Sequence'],
      invalidationCondition: 'M5 close above 1.0910.',
      invalidation: 'M5 close above 1.0910.',
      status: 'TP1_HIT',
      outcomeR: 2.0,
      closedAt: now - 1 * dayMs + 1 * hourMs,
      closedPrice: 1.0850,
      closedByProvider: 'Historical Archive',
      timeframeUsed: { context: 'M15', entry: 'M5' },
      confidenceFactors: [
        { name: 'Value Zone & S/R Confluence', category: 'SUPPORT_RESISTANCE', weight: 15, score: 85, detail: 'Clean R1 pivot rejection.' },
        { name: 'Momentum Agreement (RSI/MACD)', category: 'MOMENTUM', weight: 12, score: 80, detail: 'MACD cross confirmed.' },
      ],
      strategyBreakdown: {
        trendFollowing: false,
        breakout: false,
        pullback: false,
        supportResistance: true,
        marketStructure: true,
        liquiditySweep: false,
        momentum: true,
        volatility: true,
        mtfConfluence: true,
      },
    },
  ];

  signalJournal = mockHistorical;
}

initializeHistoricalJournal();

export function getSignalJournal(): Signal[] {
  return [...signalJournal].sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
}

export function resetSignalJournal(seedHistorical: boolean = false) {
  signalJournal = [];
  if (seedHistorical) {
    initializeHistoricalJournal(true);
  }
}

/**
 * Saves a newly scanned or updated signal to the journal.
 * Implements Signal Deduplication:
 * - If an existing ACTIVE signal has the exact same setupFingerprint or id,
 *   we refresh the active signal in place rather than inserting duplicate records.
 */
export function saveSignalToJournal(signal: Signal): Signal {
  const normSym = signal.instrument.replace(/[/_ -]/g, '').toUpperCase();

  // Deduplication check: match existing active signal by fingerprint or ID
  const existingIdx = signalJournal.findIndex((s) => {
    const sNorm = s.instrument.replace(/[/_ -]/g, '').toUpperCase();
    if (s.id === signal.id) return true;

    if (
      s.status === 'ACTIVE' &&
      sNorm === normSym &&
      signal.setupFingerprint &&
      s.setupFingerprint === signal.setupFingerprint
    ) {
      return true;
    }
    return false;
  });

  if (existingIdx >= 0) {
    const existing = signalJournal[existingIdx];
    // Refresh existing active signal without duplicating journal entry
    signalJournal[existingIdx] = {
      ...existing,
      currentPrice: signal.currentPrice,
      scanTimestamp: signal.scanTimestamp || Date.now(),
      aiConfidence: signal.aiConfidence,
      confidenceScore: signal.confidenceScore,
      setupExplanation: signal.setupExplanation,
      reasons: signal.reasons,
      strategyResults: signal.strategyResults,
      confluence: signal.confluence,
    };
    return signalJournal[existingIdx];
  }

  // Insert fresh signal
  signalJournal.unshift(signal);
  return signal;
}

export interface MarketPriceUpdate {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp?: number;
  dataSource?: string;
  highPrice?: number;
  lowPrice?: number;
}

/**
 * Deterministically evaluates a single signal against a new market tick or candle.
 * Enforces strict terminal state machine, ambiguous candle detection, executable bid/ask sides,
 * and historical look-ahead boundaries.
 */
export function evaluateSignalOutcome(
  signal: Signal,
  marketUpdate: {
    price: number;
    bid?: number;
    ask?: number;
    high?: number;
    low?: number;
    timestamp: number;
    provider?: string;
  }
): { statusChanged: boolean; newStatus?: SignalStatus; outcomeR?: number; reason?: string } {
  // 1. Terminal State Machine Guard: If signal is in any terminal state, it is immutable!
  if (
    signal.status === 'TP1_HIT' ||
    signal.status === 'TP2_HIT' ||
    signal.status === 'TP_HIT' ||
    signal.status === 'SL_HIT' ||
    signal.status === 'AMBIGUOUS' ||
    signal.status === 'EXPIRED' ||
    signal.status === 'CANCELLED' ||
    signal.status === 'INVALIDATED'
  ) {
    return { statusChanged: false };
  }

  if (signal.direction === 'WAIT') {
    return { statusChanged: false };
  }

  // 2. Time Boundary Check: Only evaluate market data occurring AT or AFTER signal creation!
  const signalCreationTime = signal.createdAt || signal.timestamp || 0;
  if (marketUpdate.timestamp > 0 && marketUpdate.timestamp < signalCreationTime) {
    // Market tick occurred in the past before the signal was created. Ignore to prevent look-ahead bias!
    return { statusChanged: false };
  }

  const evalPrice = marketUpdate.price;
  const evalBid = marketUpdate.bid !== undefined ? marketUpdate.bid : evalPrice;
  const evalAsk = marketUpdate.ask !== undefined ? marketUpdate.ask : evalPrice;
  const evalTime = marketUpdate.timestamp || Date.now();
  const provider = marketUpdate.provider || signal.provider || 'Market Provider';

  // 3. Evaluate BUY Position
  if (signal.direction === 'BUY') {
    // For BUY: SL and TP execution happens at BID price (selling into the market)
    const execPrice = evalBid;

    // Track highest / lowest price reached since creation
    signal.highestPriceReached = Math.max(signal.highestPriceReached || signal.suggestedEntry, execPrice);
    signal.lowestPriceReached = Math.min(signal.lowestPriceReached || signal.suggestedEntry, execPrice);

    // Candle Range / Ambiguity Check:
    // If a candle high & low are provided, check if both SL and TP were breached in the same bar
    const barHigh = marketUpdate.high !== undefined ? marketUpdate.high : execPrice;
    const barLow = marketUpdate.low !== undefined ? marketUpdate.low : execPrice;

    const hitSL = barLow <= signal.stopLoss;
    const hitTP1 = barHigh >= signal.takeProfit1;
    const hitTP2 = signal.takeProfit2 ? barHigh >= signal.takeProfit2 : false;

    if (hitSL && (hitTP1 || hitTP2)) {
      // Both SL and TP breached in the same candle/interval! OHLC does not establish intra-bar sequence.
      signal.status = 'AMBIGUOUS';
      signal.outcomeR = 0;
      signal.closedAt = evalTime;
      signal.closedPrice = execPrice;
      signal.closedByProvider = provider;
      signal.closedReason = 'Candle range spanned both Stop Loss and Take Profit simultaneously (Intra-candle sequence ambiguous)';
      return { statusChanged: true, newStatus: 'AMBIGUOUS', outcomeR: 0, reason: signal.closedReason };
    }

    if (hitSL) {
      signal.status = 'SL_HIT';
      signal.outcomeR = -1.0;
      signal.closedAt = evalTime;
      signal.closedPrice = signal.stopLoss;
      signal.closedByProvider = provider;
      signal.closedReason = `Stop loss triggered at ${signal.stopLoss}`;
      return { statusChanged: true, newStatus: 'SL_HIT', outcomeR: -1.0, reason: signal.closedReason };
    }

    if (hitTP2) {
      const outcomeR = Number((signal.riskRewardRatio + 1.2).toFixed(2));
      signal.status = 'TP2_HIT';
      signal.outcomeR = outcomeR;
      signal.closedAt = evalTime;
      signal.closedPrice = signal.takeProfit2!;
      signal.closedByProvider = provider;
      signal.closedReason = `Take profit 2 reached at ${signal.takeProfit2}`;
      return { statusChanged: true, newStatus: 'TP2_HIT', outcomeR, reason: signal.closedReason };
    }

    if (hitTP1) {
      const outcomeR = Number(signal.riskRewardRatio.toFixed(2));
      signal.status = 'TP1_HIT';
      signal.outcomeR = outcomeR;
      signal.closedAt = evalTime;
      signal.closedPrice = signal.takeProfit1;
      signal.closedByProvider = provider;
      signal.closedReason = `Take profit 1 reached at ${signal.takeProfit1}`;
      return { statusChanged: true, newStatus: 'TP1_HIT', outcomeR, reason: signal.closedReason };
    }
  }

  // 4. Evaluate SELL Position
  else if (signal.direction === 'SELL') {
    // For SELL: SL and TP execution happens at ASK price (buying back to cover)
    const execPrice = evalAsk;

    signal.highestPriceReached = Math.max(signal.highestPriceReached || signal.suggestedEntry, execPrice);
    signal.lowestPriceReached = Math.min(signal.lowestPriceReached || signal.suggestedEntry, execPrice);

    const barHigh = marketUpdate.high !== undefined ? marketUpdate.high : execPrice;
    const barLow = marketUpdate.low !== undefined ? marketUpdate.low : execPrice;

    const hitSL = barHigh >= signal.stopLoss;
    const hitTP1 = barLow <= signal.takeProfit1;
    const hitTP2 = signal.takeProfit2 ? barLow <= signal.takeProfit2 : false;

    if (hitSL && (hitTP1 || hitTP2)) {
      signal.status = 'AMBIGUOUS';
      signal.outcomeR = 0;
      signal.closedAt = evalTime;
      signal.closedPrice = execPrice;
      signal.closedByProvider = provider;
      signal.closedReason = 'Candle range spanned both Stop Loss and Take Profit simultaneously (Intra-candle sequence ambiguous)';
      return { statusChanged: true, newStatus: 'AMBIGUOUS', outcomeR: 0, reason: signal.closedReason };
    }

    if (hitSL) {
      signal.status = 'SL_HIT';
      signal.outcomeR = -1.0;
      signal.closedAt = evalTime;
      signal.closedPrice = signal.stopLoss;
      signal.closedByProvider = provider;
      signal.closedReason = `Stop loss triggered at ${signal.stopLoss}`;
      return { statusChanged: true, newStatus: 'SL_HIT', outcomeR: -1.0, reason: signal.closedReason };
    }

    if (hitTP2) {
      const outcomeR = Number((signal.riskRewardRatio + 1.2).toFixed(2));
      signal.status = 'TP2_HIT';
      signal.outcomeR = outcomeR;
      signal.closedAt = evalTime;
      signal.closedPrice = signal.takeProfit2!;
      signal.closedByProvider = provider;
      signal.closedReason = `Take profit 2 reached at ${signal.takeProfit2}`;
      return { statusChanged: true, newStatus: 'TP2_HIT', outcomeR, reason: signal.closedReason };
    }

    if (hitTP1) {
      const outcomeR = Number(signal.riskRewardRatio.toFixed(2));
      signal.status = 'TP1_HIT';
      signal.outcomeR = outcomeR;
      signal.closedAt = evalTime;
      signal.closedPrice = signal.takeProfit1;
      signal.closedByProvider = provider;
      signal.closedReason = `Take profit 1 reached at ${signal.takeProfit1}`;
      return { statusChanged: true, newStatus: 'TP1_HIT', outcomeR, reason: signal.closedReason };
    }
  }

  // 5. Append diagnostic evaluation log (capped at 25 entries per signal)
  if (!signal.evaluationLog) signal.evaluationLog = [];
  if (signal.evaluationLog.length < 25) {
    signal.evaluationLog.push({
      timestamp: evalTime,
      price: evalPrice,
      bid: evalBid,
      ask: evalAsk,
      state: signal.status,
      provider,
    });
  }

  return { statusChanged: false };
}

/**
 * Tracks active signals against market data updates.
 * Accepts both single object payload or legacy parameter signatures.
 */
export function trackSignalsAgainstMarketData(
  symbolOrUpdate: string | MarketPriceUpdate,
  currentPrice?: number,
  highPrice?: number,
  lowPrice?: number
): { updatedCount: number; statusChanges: { id: string; status: SignalStatus; outcomeR?: number }[] } {
  let update: MarketPriceUpdate;

  if (typeof symbolOrUpdate === 'string') {
    update = {
      symbol: symbolOrUpdate,
      price: currentPrice || 0,
      timestamp: Date.now(),
      // NOTE: We do NOT pass historical 24h high/low into real-time tick evaluation
      // to avoid triggering SL from historical pre-signal price movements.
      bid: currentPrice,
      ask: currentPrice,
    };
  } else {
    update = symbolOrUpdate;
  }

  const normSym = update.symbol.replace(/[/_ -]/g, '').toUpperCase();
  const statusChanges: { id: string; status: SignalStatus; outcomeR?: number }[] = [];

  for (const signal of signalJournal) {
    const sNorm = signal.instrument.replace(/[/_ -]/g, '').toUpperCase();
    if (sNorm !== normSym || signal.status !== 'ACTIVE' || signal.direction === 'WAIT') {
      continue;
    }

    const res = evaluateSignalOutcome(signal, {
      price: update.price,
      bid: update.bid,
      ask: update.ask,
      high: update.highPrice,
      low: update.lowPrice,
      timestamp: update.timestamp || Date.now(),
      provider: update.dataSource,
    });

    if (res.statusChanged && res.newStatus) {
      statusChanges.push({
        id: signal.id,
        status: res.newStatus,
        outcomeR: res.outcomeR,
      });
    }
  }

  return {
    updatedCount: statusChanges.length,
    statusChanges,
  };
}

function initGroup(): PerformanceGroup {
  return {
    total: 0,
    wins: 0,
    losses: 0,
    ambiguous: 0,
    expired: 0,
    cancelled: 0,
    invalidated: 0,
    winRate: 0,
    totalR: 0,
    avgR: 0,
  };
}

function updateGroup(
  group: PerformanceGroup,
  isWin: boolean,
  isLoss: boolean,
  isAmbiguous: boolean,
  isExpired: boolean,
  isCancelled: boolean,
  isInvalid: boolean,
  rVal: number
) {
  group.total++;
  if (isWin) {
    group.wins++;
    group.totalR += rVal;
  } else if (isLoss) {
    group.losses++;
    group.totalR += rVal;
  } else if (isAmbiguous) {
    if (group.ambiguous !== undefined) group.ambiguous++;
  } else if (isExpired) {
    if (group.expired !== undefined) group.expired++;
  } else if (isCancelled) {
    if (group.cancelled !== undefined) group.cancelled++;
  } else if (isInvalid) {
    group.invalidated++;
  }

  const completed = group.wins + group.losses;
  group.winRate = completed > 0 ? Number(((group.wins / completed) * 100).toFixed(1)) : 0;
  group.avgR = completed > 0 ? Number((group.totalR / completed).toFixed(2)) : 0;
}

/**
 * Performance Analytics Computation:
 * - Deduplicates signals by unique ID / fingerprint.
 * - Wins: TP1_HIT, TP2_HIT, TP_HIT
 * - Losses: SL_HIT
 * - Ambiguous: AMBIGUOUS (tracked separately, excluded from win rate)
 * - Expired: EXPIRED (excluded from win rate)
 * - Cancelled / Invalidated: CANCELLED, INVALIDATED (excluded from win rate)
 * - Win Rate = Wins / (Wins + Losses) * 100
 */
export function calculatePerformanceAnalytics(): PerformanceAnalytics {
  // Extract unique signals by fingerprint or ID
  const seenKeys = new Set<string>();
  const uniqueSignals: Signal[] = [];

  for (const s of signalJournal) {
    const key = s.setupFingerprint || s.id;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSignals.push(s);
    }
  }

  const completedSignals = uniqueSignals.filter(
    (s) =>
      s.direction !== 'WAIT' &&
      (s.status === 'TP1_HIT' ||
        s.status === 'TP2_HIT' ||
        s.status === 'TP_HIT' ||
        s.status === 'SL_HIT' ||
        s.status === 'AMBIGUOUS' ||
        s.status === 'EXPIRED' ||
        s.status === 'CANCELLED' ||
        s.status === 'INVALIDATED')
  );

  const byInstrument: Record<string, PerformanceGroup> = {};
  const byStrategy: Record<string, PerformanceGroup> = {
    TrendFollowing: initGroup(),
    Breakout: initGroup(),
    Pullback: initGroup(),
    SupportResistance: initGroup(),
    MarketStructure: initGroup(),
    LiquiditySweep: initGroup(),
    MTFConfluence: initGroup(),
  };
  const byTradeType: Record<TradeType, PerformanceGroup> = {
    SCALP: initGroup(),
    DAY: initGroup(),
    SWING: initGroup(),
  };
  const byConfidenceBracket: PerformanceAnalytics['byConfidenceBracket'] = {
    '0-49': initGroup(),
    '50-59': initGroup(),
    '60-69': initGroup(),
    '70-79': initGroup(),
    '80-89': initGroup(),
    '90-100': initGroup(),
  };
  const byDirection = {
    BUY: initGroup(),
    SELL: initGroup(),
  };

  let totalWins = 0;
  let totalLosses = 0;
  let totalAmbiguous = 0;
  let totalExpired = 0;
  let totalCancelled = 0;
  let totalR = 0;
  let grossWinR = 0;
  let grossLossR = 0;
  let totalConfidenceSum = 0;
  let totalRRSum = 0;

  for (const signal of completedSignals) {
    const isWin = signal.status === 'TP1_HIT' || signal.status === 'TP2_HIT' || signal.status === 'TP_HIT';
    const isLoss = signal.status === 'SL_HIT';
    const isAmbiguous = signal.status === 'AMBIGUOUS';
    const isExpired = signal.status === 'EXPIRED';
    const isCancelled = signal.status === 'CANCELLED';
    const isInvalid = signal.status === 'INVALIDATED';
    const rVal = signal.outcomeR !== undefined ? signal.outcomeR : (isWin ? signal.riskRewardRatio : isLoss ? -1.0 : 0);

    totalConfidenceSum += signal.aiConfidence || signal.confidenceScore || 0;
    totalRRSum += signal.riskRewardRatio || 0;

    if (isWin) {
      totalWins++;
      grossWinR += rVal;
      totalR += rVal;
    } else if (isLoss) {
      totalLosses++;
      grossLossR += Math.abs(rVal);
      totalR += rVal;
    } else if (isAmbiguous) {
      totalAmbiguous++;
    } else if (isExpired) {
      totalExpired++;
    } else if (isCancelled || isInvalid) {
      totalCancelled++;
    }

    // Instrument grouping
    const instKey = signal.instrument.replace(/[/_ -]/g, '').toUpperCase();
    if (!byInstrument[instKey]) byInstrument[instKey] = initGroup();
    updateGroup(byInstrument[instKey], isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);

    // Trade Type grouping
    if (byTradeType[signal.tradeType]) {
      updateGroup(byTradeType[signal.tradeType], isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
    }

    // Direction grouping
    if (signal.direction === 'BUY' || signal.direction === 'SELL') {
      updateGroup(byDirection[signal.direction], isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
    }

    // Confidence Bracket
    const conf = signal.aiConfidence || signal.confidenceScore || 0;
    let bracketKey: keyof PerformanceAnalytics['byConfidenceBracket'] = '0-49';
    if (conf >= 90) bracketKey = '90-100';
    else if (conf >= 80) bracketKey = '80-89';
    else if (conf >= 70) bracketKey = '70-79';
    else if (conf >= 60) bracketKey = '60-69';
    else if (conf >= 50) bracketKey = '50-59';
    updateGroup(byConfidenceBracket[bracketKey], isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);

    // Strategy Grouping
    const sBreakdown = signal.strategyBreakdown;
    if (sBreakdown) {
      if (sBreakdown.trendFollowing) updateGroup(byStrategy.TrendFollowing, isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
      if (sBreakdown.breakout) updateGroup(byStrategy.Breakout, isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
      if (sBreakdown.pullback) updateGroup(byStrategy.Pullback, isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
      if (sBreakdown.supportResistance) updateGroup(byStrategy.SupportResistance, isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
      if (sBreakdown.marketStructure) updateGroup(byStrategy.MarketStructure, isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
      if (sBreakdown.liquiditySweep) updateGroup(byStrategy.LiquiditySweep, isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
      if (sBreakdown.mtfConfluence) updateGroup(byStrategy.MTFConfluence, isWin, isLoss, isAmbiguous, isExpired, isCancelled, isInvalid, rVal);
    }
  }

  const finishedCount = totalWins + totalLosses;
  const winRate = finishedCount > 0 ? Number(((totalWins / finishedCount) * 100).toFixed(1)) : 0;
  const averageR = finishedCount > 0 ? Number((totalR / finishedCount).toFixed(2)) : 0;
  const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : grossWinR > 0 ? 99 : 1.0;
  const averageConfidence = completedSignals.length > 0 ? Number((totalConfidenceSum / completedSignals.length).toFixed(1)) : 0;
  const averageRiskReward = completedSignals.length > 0 ? Number((totalRRSum / completedSignals.length).toFixed(2)) : 0;

  // Identify Best/Worst Instrument
  let bestInst = 'EURUSD';
  let worstInst = 'GBPUSD';
  let bestInstWinRate = -1;
  let worstInstWinRate = 101;

  for (const [sym, group] of Object.entries(byInstrument)) {
    if (group.total >= 1) {
      if (group.winRate > bestInstWinRate) {
        bestInstWinRate = group.winRate;
        bestInst = sym;
      }
      if (group.winRate < worstInstWinRate) {
        worstInstWinRate = group.winRate;
        worstInst = sym;
      }
    }
  }

  let bestStrat = 'MarketStructure';
  let bestStratWinRate = -1;
  for (const [strat, group] of Object.entries(byStrategy)) {
    if (group.total >= 1 && group.winRate > bestStratWinRate) {
      bestStratWinRate = group.winRate;
      bestStrat = strat;
    }
  }

  let bestType: TradeType = 'SWING';
  let bestTypeWinRate = -1;
  for (const [tt, group] of Object.entries(byTradeType)) {
    if (group.total >= 1 && group.winRate > bestTypeWinRate) {
      bestTypeWinRate = group.winRate;
      bestType = tt as TradeType;
    }
  }

  return {
    totalSignals: signalJournal.length,
    totalUniqueSignals: uniqueSignals.length,
    activeSignals: uniqueSignals.filter((s) => s.status === 'ACTIVE' && s.direction !== 'WAIT').length,
    completedSignals: completedSignals.length,
    wins: totalWins,
    losses: totalLosses,
    ambiguous: totalAmbiguous,
    expired: totalExpired,
    cancelled: totalCancelled,
    winRate,
    totalR: Number(totalR.toFixed(2)),
    averageR,
    profitFactor,
    averageConfidence,
    averageRiskReward,
    bestInstrument: bestInst,
    worstInstrument: worstInst,
    bestStrategy: bestStrat,
    bestTradeType: bestType,
    byInstrument,
    byStrategy,
    byTradeType,
    byConfidenceBracket,
    byDirection,
  };
}
