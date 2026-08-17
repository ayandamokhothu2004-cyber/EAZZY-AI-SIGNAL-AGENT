import {
  BacktestTrade,
  PerformanceStats,
  EquityPoint,
  ConfidenceBucketMetric,
  RRBucketMetric,
  StrategyMetric,
  MarketRegimeMetric,
  AssetMetric,
  TimeframeMetric,
} from '../types/backtest';

/**
 * Calculates complete performance analytics, R-multiples, expectancy, drawdown,
 * and bucketed distributions for a set of backtested trades.
 */
export function calculatePerformanceMetrics(
  trades: BacktestTrade[],
  ignoredSignalsCount = 0
): PerformanceStats {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      ambiguousTrades: 0,
      winRate: 0,
      lossRate: 0,
      totalR: 0,
      averageR: 0,
      medianR: 0,
      grossWinningR: 0,
      grossLosingR: 0,
      profitFactor: 0,
      averageWinR: 0,
      averageLossR: 0,
      expectancy: 0,
      maxDrawdownR: 0,
      maxDrawdownPercent: 0,
      maxConsecutiveLosses: 0,
      maxConsecutiveWins: 0,
      averageTradeDurationBars: 0,
      averageTradeDurationMinutes: 0,
      bestTradeR: 0,
      worstTradeR: 0,
      ignoredSignalsCount,
    };
  }

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let ambiguousTrades = 0;
  let totalR = 0;
  let grossWinningR = 0;
  let grossLosingR = 0;
  let bestTradeR = -Infinity;
  let worstTradeR = Infinity;
  let totalDurationBars = 0;
  let totalDurationMs = 0;

  let currentConsecWins = 0;
  let maxConsecWins = 0;
  let currentConsecLosses = 0;
  let maxConsecLosses = 0;

  const rList: number[] = [];

  for (const t of trades) {
    const r = t.RMultiple;
    rList.push(r);
    totalR += r;
    totalDurationBars += t.durationBars;
    totalDurationMs += t.durationMs;

    if (t.exitAmbiguity) {
      ambiguousTrades++;
    }

    if (r > bestTradeR) bestTradeR = r;
    if (r < worstTradeR) worstTradeR = r;

    if (t.result === 'WIN' || r > 0.05) {
      wins++;
      grossWinningR += r;
      currentConsecWins++;
      currentConsecLosses = 0;
      if (currentConsecWins > maxConsecWins) maxConsecWins = currentConsecWins;
    } else if (t.result === 'LOSS' || t.result === 'AMBIGUOUS' || r < -0.05) {
      losses++;
      grossLosingR += Math.abs(r);
      currentConsecLosses++;
      currentConsecWins = 0;
      if (currentConsecLosses > maxConsecLosses) maxConsecLosses = currentConsecLosses;
    } else {
      breakevens++;
      currentConsecWins = 0;
      currentConsecLosses = 0;
    }
  }

  const totalTrades = trades.length;
  const winRate = Number(((wins / totalTrades) * 100).toFixed(1));
  const lossRate = Number(((losses / totalTrades) * 100).toFixed(1));
  const averageR = Number((totalR / totalTrades).toFixed(2));

  // Median R calculation
  const sortedR = [...rList].sort((a, b) => a - b);
  const mid = Math.floor(sortedR.length / 2);
  const medianR =
    sortedR.length % 2 !== 0
      ? Number(sortedR[mid].toFixed(2))
      : Number(((sortedR[mid - 1] + sortedR[mid]) / 2).toFixed(2));

  // Profit Factor (safely handling zero loss case)
  const profitFactor =
    grossLosingR > 0.001
      ? Number((grossWinningR / grossLosingR).toFixed(2))
      : grossWinningR > 0
      ? 99.99
      : 0;

  const averageWinR = wins > 0 ? Number((grossWinningR / wins).toFixed(2)) : 0;
  const averageLossR = losses > 0 ? Number((grossLosingR / losses).toFixed(2)) : 0;

  // Expectancy = (win rate * average win R) - (loss rate * average loss R)
  const expectancy = Number(
    ((winRate / 100) * averageWinR - (lossRate / 100) * averageLossR).toFixed(2)
  );

  // Maximum Drawdown in R and %
  let cumulative = 0;
  let peak = 0;
  let maxDrawdownR = 0;

  let equity = 100;
  let peakEquity = 100;
  let maxDrawdownPercent = 0;

  for (const r of rList) {
    cumulative += r;
    if (cumulative > peak) peak = cumulative;
    const ddR = peak - cumulative;
    if (ddR > maxDrawdownR) maxDrawdownR = ddR;

    equity += r;
    if (equity > peakEquity) peakEquity = equity;
    const ddPct = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;
  }

  return {
    totalTrades,
    wins,
    losses,
    breakevens,
    ambiguousTrades,
    winRate,
    lossRate,
    totalR: Number(totalR.toFixed(2)),
    averageR,
    medianR,
    grossWinningR: Number(grossWinningR.toFixed(2)),
    grossLosingR: Number(grossLosingR.toFixed(2)),
    profitFactor,
    averageWinR,
    averageLossR,
    expectancy,
    maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(1)),
    maxConsecutiveLosses: maxConsecLosses,
    maxConsecutiveWins: maxConsecWins,
    averageTradeDurationBars: Math.round(totalDurationBars / totalTrades),
    averageTradeDurationMinutes: Math.round(totalDurationMs / totalTrades / 60000),
    bestTradeR: bestTradeR === -Infinity ? 0 : Number(bestTradeR.toFixed(2)),
    worstTradeR: worstTradeR === Infinity ? 0 : Number(worstTradeR.toFixed(2)),
    ignoredSignalsCount,
  };
}

/**
 * Builds equity curve points starting at 100R
 */
export function generateEquityCurve(trades: BacktestTrade[]): EquityPoint[] {
  let cumulativeR = 0;
  let equityR = 100;
  let peakEquityR = 100;

  const points: EquityPoint[] = [
    {
      tradeNumber: 0,
      timestamp: trades.length > 0 ? trades[0].entryTime - 60000 : Date.now(),
      dateISO: trades.length > 0 ? new Date(trades[0].entryTime - 60000).toISOString() : new Date().toISOString(),
      rMultiple: 0,
      cumulativeR: 0,
      equityR: 100,
      peakEquityR: 100,
      drawdownR: 0,
      drawdownPercent: 0,
      sampleType: 'IN_SAMPLE',
    },
  ];

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    cumulativeR += t.RMultiple;
    equityR += t.RMultiple;

    if (equityR > peakEquityR) {
      peakEquityR = equityR;
    }

    const drawdownR = peakEquityR - equityR;
    const drawdownPercent = peakEquityR > 0 ? (drawdownR / peakEquityR) * 100 : 0;

    points.push({
      tradeNumber: i + 1,
      timestamp: t.exitTime,
      dateISO: t.exitTimeISO,
      rMultiple: t.RMultiple,
      cumulativeR: Number(cumulativeR.toFixed(2)),
      equityR: Number(equityR.toFixed(2)),
      peakEquityR: Number(peakEquityR.toFixed(2)),
      drawdownR: Number(drawdownR.toFixed(2)),
      drawdownPercent: Number(drawdownPercent.toFixed(1)),
      sampleType: t.sampleType,
    });
  }

  return points;
}

/**
 * Generates Confidence Score Breakdown (Buckets 0-49, 50-59, 60-69, 70-79, 80-89, 90-100)
 */
export function generateConfidenceBuckets(trades: BacktestTrade[]): ConfidenceBucketMetric[] {
  const buckets: Record<
    ConfidenceBucketMetric['bucket'],
    { trades: BacktestTrade[] }
  > = {
    '0-49': { trades: [] },
    '50-59': { trades: [] },
    '60-69': { trades: [] },
    '70-79': { trades: [] },
    '80-89': { trades: [] },
    '90-100': { trades: [] },
  };

  for (const t of trades) {
    const score = t.confidenceScore;
    if (score < 50) buckets['0-49'].trades.push(t);
    else if (score < 60) buckets['50-59'].trades.push(t);
    else if (score < 70) buckets['60-69'].trades.push(t);
    else if (score < 80) buckets['70-79'].trades.push(t);
    else if (score < 90) buckets['80-89'].trades.push(t);
    else buckets['90-100'].trades.push(t);
  }

  const keys: ConfidenceBucketMetric['bucket'][] = [
    '0-49',
    '50-59',
    '60-69',
    '70-79',
    '80-89',
    '90-100',
  ];

  return keys.map((bucket) => {
    const bTrades = buckets[bucket].trades;
    const stats = calculatePerformanceMetrics(bTrades);
    return {
      bucket,
      trades: stats.totalTrades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      totalR: stats.totalR,
      averageR: stats.averageR,
      expectancy: stats.expectancy,
      profitFactor: stats.profitFactor,
    };
  });
}

/**
 * Generates Risk-to-Reward Ratio Buckets (1.5-1.99, 2.0-2.49, 2.5-2.99, 3.0+)
 */
export function generateRRBuckets(trades: BacktestTrade[]): RRBucketMetric[] {
  const buckets: Record<RRBucketMetric['bucket'], { trades: BacktestTrade[] }> = {
    '1.5-1.99': { trades: [] },
    '2.0-2.49': { trades: [] },
    '2.5-2.99': { trades: [] },
    '3.0+': { trades: [] },
  };

  for (const t of trades) {
    const rr = t.riskReward;
    if (rr < 2.0) buckets['1.5-1.99'].trades.push(t);
    else if (rr < 2.5) buckets['2.0-2.49'].trades.push(t);
    else if (rr < 3.0) buckets['2.5-2.99'].trades.push(t);
    else buckets['3.0+'].trades.push(t);
  }

  const keys: RRBucketMetric['bucket'][] = ['1.5-1.99', '2.0-2.49', '2.5-2.99', '3.0+'];

  return keys.map((bucket) => {
    const bTrades = buckets[bucket].trades;
    const stats = calculatePerformanceMetrics(bTrades);
    return {
      bucket,
      trades: stats.totalTrades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      totalR: stats.totalR,
      averageR: stats.averageR,
      expectancy: stats.expectancy,
      profitFactor: stats.profitFactor,
    };
  });
}

/**
 * Generates Breakdown across the 5 Modular Strategies
 */
export function generateStrategyBreakdown(trades: BacktestTrade[]): StrategyMetric[] {
  const strategyNames = [
    'Breakout Analysis',
    'Pullback Analysis',
    'Trend-Following',
    'Liquidity Sweep',
    'Support & Resistance',
  ];

  const grouped: Record<string, BacktestTrade[]> = {};
  for (const name of strategyNames) {
    grouped[name] = [];
  }

  for (const t of trades) {
    const matched = strategyNames.find(
      (s) => t.strategy.toLowerCase().includes(s.toLowerCase().slice(0, 5))
    ) || t.strategy;

    if (!grouped[matched]) grouped[matched] = [];
    grouped[matched].push(t);
  }

  return Object.keys(grouped).map((strategy) => {
    const strTrades = grouped[strategy];
    const stats = calculatePerformanceMetrics(strTrades);
    return {
      strategy,
      trades: stats.totalTrades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      totalR: stats.totalR,
      averageR: stats.averageR,
      expectancy: stats.expectancy,
      profitFactor: stats.profitFactor,
      maxDrawdownR: stats.maxDrawdownR,
    };
  });
}

/**
 * Generates Breakdown across Market Regimes
 */
export function generateRegimeBreakdown(trades: BacktestTrade[]): MarketRegimeMetric[] {
  const regimes = [
    'TRENDING_BULLISH',
    'TRENDING_BEARISH',
    'RANGING',
    'BREAKOUT',
    'HIGH_VOLATILITY',
    'LOW_VOLATILITY',
  ];

  const grouped: Record<string, BacktestTrade[]> = {};
  for (const r of regimes) grouped[r] = [];

  for (const t of trades) {
    const reg = t.marketRegime || 'RANGING';
    if (!grouped[reg]) grouped[reg] = [];
    grouped[reg].push(t);
  }

  return Object.keys(grouped).map((regime) => {
    const regTrades = grouped[regime];
    const stats = calculatePerformanceMetrics(regTrades);
    return {
      regime,
      trades: stats.totalTrades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      totalR: stats.totalR,
      averageR: stats.averageR,
      expectancy: stats.expectancy,
    };
  });
}

/**
 * Generates Asset Breakdown
 */
export function generateAssetBreakdown(trades: BacktestTrade[]): AssetMetric[] {
  const grouped: Record<string, BacktestTrade[]> = {};

  for (const t of trades) {
    if (!grouped[t.symbol]) grouped[t.symbol] = [];
    grouped[t.symbol].push(t);
  }

  return Object.keys(grouped).map((symbol) => {
    const aTrades = grouped[symbol];
    const stats = calculatePerformanceMetrics(aTrades);
    return {
      symbol,
      trades: stats.totalTrades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      totalR: stats.totalR,
      averageR: stats.averageR,
      expectancy: stats.expectancy,
      profitFactor: stats.profitFactor,
    };
  });
}

/**
 * Generates Timeframe Breakdown
 */
export function generateTimeframeBreakdown(
  trades: BacktestTrade[],
  defaultTF: string
): TimeframeMetric[] {
  const grouped: Record<string, BacktestTrade[]> = {};

  for (const t of trades) {
    const tf = defaultTF;
    if (!grouped[tf]) grouped[tf] = [];
    grouped[tf].push(t);
  }

  return Object.keys(grouped).map((timeframe) => {
    const tfTrades = grouped[timeframe];
    const stats = calculatePerformanceMetrics(tfTrades);
    return {
      timeframe,
      trades: stats.totalTrades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      totalR: stats.totalR,
      averageR: stats.averageR,
      expectancy: stats.expectancy,
    };
  });
}
