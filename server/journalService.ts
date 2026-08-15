import { Signal, SignalStatus, PerformanceAnalytics, PerformanceGroup, TradeType } from '../src/types';

// In-memory persistent journal
let signalJournal: Signal[] = [];

// Seed historical signals with realistic outcomes for testing calibration
function initializeHistoricalJournal() {
  if (signalJournal.length > 0) return;

  const now = Date.now();
  const dayMs = 86400000;
  const hourMs = 3600000;

  const mockHistorical: Signal[] = [
    {
      id: 'SIG-EURUSD-HIST-01',
      instrument: 'EURUSD',
      direction: 'BUY',
      tradeType: 'DAY',
      currentPrice: 1.0842,
      suggestedEntry: 1.0842,
      stopLoss: 1.0815,
      takeProfit1: 1.0896,
      takeProfit2: 1.0925,
      riskRewardRatio: 2.0,
      aiConfidence: 86,
      marketBias: 'BULLISH',
      timestamp: now - 3 * dayMs - 4 * hourMs,
      setupExplanation: 'Multi-timeframe confluence on H1/M15 with Bullish BOS breaking 1.0838 and retest of dynamic 50 EMA value zone.',
      conditionsDetected: ['Trend Alignment: Bullish Multi-EMA', 'Market Structure: Bullish BOS', 'Pullback: Healthy Retracement', 'MTF Confluence: H1 ➔ M15 Aligned'],
      invalidationCondition: '1-candle close below swing low 1.0815.',
      status: 'TP1_HIT',
      outcomeR: 2.0,
      closedAt: now - 3 * dayMs + 6 * hourMs,
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
      instrument: 'XAUUSD',
      direction: 'BUY',
      tradeType: 'SWING',
      currentPrice: 2390.5,
      suggestedEntry: 2390.5,
      stopLoss: 2372.0,
      takeProfit1: 2436.75,
      takeProfit2: 2465.0,
      riskRewardRatio: 2.5,
      aiConfidence: 91,
      marketBias: 'BULLISH',
      timestamp: now - 5 * dayMs,
      setupExplanation: 'H4 macro liquidity sweep below 2380 with instantaneous aggressive absorption and Bullish CHoCH on H1.',
      conditionsDetected: ['Liquidity Sweep: Sell-Side Liquidity Purged', 'Market Structure: Bullish CHoCH', 'MTF Confluence: H4 ➔ H1 Aligned', 'Momentum: Bullish Acceleration'],
      invalidationCondition: '4-hour close below liquidity sweep low 2372.0.',
      status: 'TP2_HIT',
      outcomeR: 3.7,
      closedAt: now - 2 * dayMs,
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
      instrument: 'NAS100',
      direction: 'SELL',
      tradeType: 'SCALP',
      currentPrice: 19920.0,
      suggestedEntry: 19920.0,
      stopLoss: 19975.0,
      takeProfit1: 19810.0,
      takeProfit2: 19750.0,
      riskRewardRatio: 2.0,
      aiConfidence: 78,
      marketBias: 'BEARISH',
      timestamp: now - 2 * dayMs + 2 * hourMs,
      setupExplanation: 'M15 double top liquidity purge above session highs followed by Bearish BOS on M5 and RSI overbought divergence.',
      conditionsDetected: ['Liquidity Sweep: Buy-Side Liquidity Purged', 'Market Structure: Bearish BOS', 'Momentum: Overbought Divergence'],
      invalidationCondition: 'M5 candle close above session high 19975.0.',
      status: 'TP1_HIT',
      outcomeR: 2.0,
      closedAt: now - 2 * dayMs + 5 * hourMs,
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
      instrument: 'GBPUSD',
      direction: 'BUY',
      tradeType: 'DAY',
      currentPrice: 1.2680,
      suggestedEntry: 1.2680,
      stopLoss: 1.2645,
      takeProfit1: 1.2750,
      takeProfit2: 1.2785,
      riskRewardRatio: 2.0,
      aiConfidence: 64,
      marketBias: 'BULLISH',
      timestamp: now - 4 * dayMs,
      setupExplanation: 'Attempted pullback entry at 50% Fib retracement. Higher timeframe bias was moderately bullish.',
      conditionsDetected: ['Pullback: Uptrend Retracement', 'Trend Alignment: Moderate Bullish'],
      invalidationCondition: 'H1 close below 1.2645 support.',
      status: 'SL_HIT',
      outcomeR: -1.0,
      closedAt: now - 4 * dayMs + 8 * hourMs,
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
      instrument: 'EURUSD',
      direction: 'SELL',
      tradeType: 'SCALP',
      currentPrice: 1.0890,
      suggestedEntry: 1.0890,
      stopLoss: 1.0910,
      takeProfit1: 1.0850,
      takeProfit2: 1.0830,
      riskRewardRatio: 2.0,
      aiConfidence: 74,
      marketBias: 'BEARISH',
      timestamp: now - 1 * dayMs - 2 * hourMs,
      setupExplanation: 'Rejection at daily pivot R1 with M5 bearish engulfing and MACD crossover.',
      conditionsDetected: ['Resistance Level Rejection', 'Momentum: Bearish Acceleration', 'Market Structure: Bearish Sequence'],
      invalidationCondition: 'M5 close above 1.0910.',
      status: 'TP1_HIT',
      outcomeR: 2.0,
      closedAt: now - 1 * dayMs + 1 * hourMs,
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
  return [...signalJournal].sort((a, b) => b.timestamp - a.timestamp);
}

export function saveSignalToJournal(signal: Signal): Signal {
  // Check if identical active signal already exists
  const existingIdx = signalJournal.findIndex((s) => s.id === signal.id);
  if (existingIdx >= 0) {
    signalJournal[existingIdx] = { ...signalJournal[existingIdx], ...signal };
    return signalJournal[existingIdx];
  }

  signalJournal.unshift(signal);
  return signal;
}

export function trackSignalsAgainstMarketData(
  symbol: string,
  currentPrice: number,
  highPrice: number,
  lowPrice: number
): { updatedCount: number; statusChanges: { id: string; status: SignalStatus; outcomeR?: number }[] } {
  const statusChanges: { id: string; status: SignalStatus; outcomeR?: number }[] = [];
  const now = Date.now();

  for (const signal of signalJournal) {
    if (signal.instrument !== symbol || signal.status !== 'ACTIVE' || signal.direction === 'WAIT') {
      continue;
    }

    signal.highestPriceReached = Math.max(signal.highestPriceReached || currentPrice, highPrice);
    signal.lowestPriceReached = Math.min(signal.lowestPriceReached || currentPrice, lowPrice);

    if (signal.direction === 'BUY') {
      // Check SL hit
      if (lowPrice <= signal.stopLoss) {
        signal.status = 'SL_HIT';
        signal.outcomeR = -1.0;
        signal.closedAt = now;
        statusChanges.push({ id: signal.id, status: 'SL_HIT', outcomeR: -1.0 });
      }
      // Check TP2 hit
      else if (signal.takeProfit2 && highPrice >= signal.takeProfit2) {
        signal.status = 'TP2_HIT';
        signal.outcomeR = signal.riskRewardRatio + 1.2;
        signal.closedAt = now;
        statusChanges.push({ id: signal.id, status: 'TP2_HIT', outcomeR: signal.outcomeR });
      }
      // Check TP1 hit
      else if (highPrice >= signal.takeProfit1) {
        signal.status = 'TP1_HIT';
        signal.outcomeR = signal.riskRewardRatio;
        signal.closedAt = now;
        statusChanges.push({ id: signal.id, status: 'TP1_HIT', outcomeR: signal.outcomeR });
      }
    } else if (signal.direction === 'SELL') {
      // Check SL hit
      if (highPrice >= signal.stopLoss) {
        signal.status = 'SL_HIT';
        signal.outcomeR = -1.0;
        signal.closedAt = now;
        statusChanges.push({ id: signal.id, status: 'SL_HIT', outcomeR: -1.0 });
      }
      // Check TP2 hit
      else if (signal.takeProfit2 && lowPrice <= signal.takeProfit2) {
        signal.status = 'TP2_HIT';
        signal.outcomeR = signal.riskRewardRatio + 1.2;
        signal.closedAt = now;
        statusChanges.push({ id: signal.id, status: 'TP2_HIT', outcomeR: signal.outcomeR });
      }
      // Check TP1 hit
      else if (lowPrice <= signal.takeProfit1) {
        signal.status = 'TP1_HIT';
        signal.outcomeR = signal.riskRewardRatio;
        signal.closedAt = now;
        statusChanges.push({ id: signal.id, status: 'TP1_HIT', outcomeR: signal.outcomeR });
      }
    }
  }

  return {
    updatedCount: statusChanges.length,
    statusChanges,
  };
}

function initGroup(): PerformanceGroup {
  return { total: 0, wins: 0, losses: 0, invalidated: 0, winRate: 0, totalR: 0, avgR: 0 };
}

function updateGroup(group: PerformanceGroup, isWin: boolean, isLoss: boolean, isInvalid: boolean, rVal: number) {
  group.total++;
  if (isWin) {
    group.wins++;
    group.totalR += rVal;
  } else if (isLoss) {
    group.losses++;
    group.totalR += rVal;
  } else if (isInvalid) {
    group.invalidated++;
  }

  const completed = group.wins + group.losses;
  group.winRate = completed > 0 ? Number(((group.wins / completed) * 100).toFixed(1)) : 0;
  group.avgR = completed > 0 ? Number((group.totalR / completed).toFixed(2)) : 0;
}

export function calculatePerformanceAnalytics(): PerformanceAnalytics {
  const completedSignals = signalJournal.filter(
    (s) => s.direction !== 'WAIT' && (s.status === 'TP1_HIT' || s.status === 'TP2_HIT' || s.status === 'SL_HIT' || s.status === 'INVALIDATED')
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
  let totalR = 0;
  let grossWinR = 0;
  let grossLossR = 0;

  for (const signal of completedSignals) {
    const isWin = signal.status === 'TP1_HIT' || signal.status === 'TP2_HIT';
    const isLoss = signal.status === 'SL_HIT';
    const isInvalid = signal.status === 'INVALIDATED';
    const rVal = signal.outcomeR || (isWin ? signal.riskRewardRatio : isLoss ? -1.0 : 0);

    if (isWin) {
      totalWins++;
      grossWinR += rVal;
    } else if (isLoss) {
      totalLosses++;
      grossLossR += Math.abs(rVal);
    }
    totalR += rVal;

    // Instrument
    if (!byInstrument[signal.instrument]) byInstrument[signal.instrument] = initGroup();
    updateGroup(byInstrument[signal.instrument], isWin, isLoss, isInvalid, rVal);

    // Trade Type
    updateGroup(byTradeType[signal.tradeType], isWin, isLoss, isInvalid, rVal);

    // Direction
    if (signal.direction === 'BUY' || signal.direction === 'SELL') {
      updateGroup(byDirection[signal.direction], isWin, isLoss, isInvalid, rVal);
    }

    // Confidence Bracket
    const conf = signal.aiConfidence;
    let bracketKey: keyof PerformanceAnalytics['byConfidenceBracket'] = '0-49';
    if (conf >= 90) bracketKey = '90-100';
    else if (conf >= 80) bracketKey = '80-89';
    else if (conf >= 70) bracketKey = '70-79';
    else if (conf >= 60) bracketKey = '60-69';
    else if (conf >= 50) bracketKey = '50-59';
    updateGroup(byConfidenceBracket[bracketKey], isWin, isLoss, isInvalid, rVal);

    // Strategies
    if (signal.strategyBreakdown.trendFollowing) updateGroup(byStrategy.TrendFollowing, isWin, isLoss, isInvalid, rVal);
    if (signal.strategyBreakdown.breakout) updateGroup(byStrategy.Breakout, isWin, isLoss, isInvalid, rVal);
    if (signal.strategyBreakdown.pullback) updateGroup(byStrategy.Pullback, isWin, isLoss, isInvalid, rVal);
    if (signal.strategyBreakdown.supportResistance) updateGroup(byStrategy.SupportResistance, isWin, isLoss, isInvalid, rVal);
    if (signal.strategyBreakdown.marketStructure) updateGroup(byStrategy.MarketStructure, isWin, isLoss, isInvalid, rVal);
    if (signal.strategyBreakdown.liquiditySweep) updateGroup(byStrategy.LiquiditySweep, isWin, isLoss, isInvalid, rVal);
    if (signal.strategyBreakdown.mtfConfluence) updateGroup(byStrategy.MTFConfluence, isWin, isLoss, isInvalid, rVal);
  }

  const finishedCount = totalWins + totalLosses;
  const winRate = finishedCount > 0 ? Number(((totalWins / finishedCount) * 100).toFixed(1)) : 0;
  const averageR = finishedCount > 0 ? Number((totalR / finishedCount).toFixed(2)) : 0;
  const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : grossWinR > 0 ? 99 : 1.0;

  // Identify Best/Worst
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
    activeSignals: signalJournal.filter((s) => s.status === 'ACTIVE' && s.direction !== 'WAIT').length,
    completedSignals: completedSignals.length,
    wins: totalWins,
    losses: totalLosses,
    winRate,
    totalR: Number(totalR.toFixed(2)),
    averageR,
    profitFactor,
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
