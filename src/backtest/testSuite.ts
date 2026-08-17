import { MarketCandle } from '../types';
import {
  BacktestConfig,
  BacktestTrade,
  TestCaseResult,
  BacktestSuiteResult,
} from '../types/backtest';
import { validateHistoricalDataset } from './dataValidator';
import { simulateTradeOutcome, PendingTradeSetup } from './tradeSimulator';
import {
  calculatePerformanceMetrics,
  generateConfidenceBuckets,
} from './metricsCalculator';

/**
 * Runs the comprehensive automated verification test suite for the backtesting engine.
 */
export function runAutomatedBacktestSuite(): BacktestSuiteResult {
  const startTime = Date.now();
  const results: TestCaseResult[] = [];

  const defaultConfig: BacktestConfig = {
    symbol: 'EUR/USD',
    timeframe: 'M15',
    strategyFilter: 'ALL',
    tradeType: 'DAY',
    minConfidence: 60,
    minRiskReward: 1.5,
    inSampleRatio: 0.7,
    sampleMode: 'FULL',
    positionModel: 'ONE_POSITION_PER_SYMBOL',
    maxSimultaneousPositions: 1,
    exitConflictRule: 'CONSERVATIVE',
    costModel: { enabled: false, spreadPips: 0, slippagePips: 0, commissionR: 0 },
    warmupPeriod: 30,
  };

  // Helper to create synthetic candle sequences for testing
  const makeCandle = (
    ts: number,
    open: number,
    high: number,
    low: number,
    close: number
  ): MarketCandle => ({
    time: ts,
    timestamp: ts,
    datetime: new Date(ts).toISOString(),
    open,
    high,
    low,
    close,
    volume: 1000,
  });

  // TEST 1: BUY trade reaching Take Profit
  try {
    const candles: MarketCandle[] = [
      makeCandle(1000, 1.1000, 1.1010, 1.0990, 1.1005), // Signal candle N
      makeCandle(2000, 1.1005, 1.1020, 1.0995, 1.1015), // Entry candle N+1 (open = 1.1005)
      makeCandle(3000, 1.1015, 1.1050, 1.1010, 1.1045), // Reaches TP (1.1040)
    ];

    const setup: PendingTradeSetup = {
      id: 'T1',
      symbol: 'EUR/USD',
      strategy: 'Breakout Analysis',
      direction: 'BUY',
      signalBarIndex: 0,
      signalTime: 1000,
      signalTimeISO: new Date(1000).toISOString(),
      calculatedEntry: 1.1005,
      stopLoss: 1.0985, // 20 pips risk
      takeProfit: 1.1045, // 40 pips target (2R)
      confidenceScore: 75,
      riskReward: 2.0,
      marketRegime: 'TRENDING_BULLISH',
      volatilityState: 'NORMAL',
      supportingStrategies: ['Breakout'],
      sampleType: 'IN_SAMPLE',
    };

    const trade = simulateTradeOutcome(setup, candles, defaultConfig);
    const passed =
      trade !== null &&
      trade.result === 'WIN' &&
      trade.exitReason === 'TAKE_PROFIT' &&
      trade.RMultiple >= 1.9;

    results.push({
      id: 'TEST-1',
      name: 'BUY Trade Reaching Take Profit',
      category: 'Trade Simulation',
      passed,
      expected: 'WIN with TAKE_PROFIT exit at ~2.0R',
      actual: `${trade?.result} with ${trade?.exitReason} (${trade?.RMultiple}R)`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-1',
      name: 'BUY Trade Reaching Take Profit',
      category: 'Trade Simulation',
      passed: false,
      expected: 'WIN',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 2: BUY trade reaching Stop Loss
  try {
    const candles: MarketCandle[] = [
      makeCandle(1000, 1.1000, 1.1010, 1.0990, 1.1005),
      makeCandle(2000, 1.1005, 1.1010, 1.0990, 1.0995),
      makeCandle(3000, 1.0995, 1.1000, 1.0980, 1.0982), // Hits SL (1.0985)
    ];

    const setup: PendingTradeSetup = {
      id: 'T2',
      symbol: 'EUR/USD',
      strategy: 'Pullback Analysis',
      direction: 'BUY',
      signalBarIndex: 0,
      signalTime: 1000,
      signalTimeISO: new Date(1000).toISOString(),
      calculatedEntry: 1.1005,
      stopLoss: 1.0985,
      takeProfit: 1.1045,
      confidenceScore: 70,
      riskReward: 2.0,
      marketRegime: 'TRENDING_BULLISH',
      volatilityState: 'NORMAL',
      supportingStrategies: ['Pullback'],
      sampleType: 'IN_SAMPLE',
    };

    const trade = simulateTradeOutcome(setup, candles, defaultConfig);
    const passed =
      trade !== null &&
      trade.result === 'LOSS' &&
      trade.exitReason === 'STOP_LOSS' &&
      trade.RMultiple <= -0.9;

    results.push({
      id: 'TEST-2',
      name: 'BUY Trade Reaching Stop Loss',
      category: 'Trade Simulation',
      passed,
      expected: 'LOSS with STOP_LOSS exit at -1.0R',
      actual: `${trade?.result} with ${trade?.exitReason} (${trade?.RMultiple}R)`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-2',
      name: 'BUY Trade Reaching Stop Loss',
      category: 'Trade Simulation',
      passed: false,
      expected: 'LOSS',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 3: SELL trade reaching Take Profit
  try {
    const candles: MarketCandle[] = [
      makeCandle(1000, 1.1000, 1.1010, 1.0990, 1.0995),
      makeCandle(2000, 1.0995, 1.1005, 1.0985, 1.0990),
      makeCandle(3000, 1.0990, 1.0995, 1.0950, 1.0955), // Hits SELL TP (1.0955)
    ];

    const setup: PendingTradeSetup = {
      id: 'T3',
      symbol: 'EUR/USD',
      strategy: 'Trend-Following',
      direction: 'SELL',
      signalBarIndex: 0,
      signalTime: 1000,
      signalTimeISO: new Date(1000).toISOString(),
      calculatedEntry: 1.0995,
      stopLoss: 1.1015, // 20 pips risk
      takeProfit: 1.0955, // 40 pips target (2R)
      confidenceScore: 80,
      riskReward: 2.0,
      marketRegime: 'TRENDING_BEARISH',
      volatilityState: 'NORMAL',
      supportingStrategies: ['Trend-Following'],
      sampleType: 'IN_SAMPLE',
    };

    const trade = simulateTradeOutcome(setup, candles, defaultConfig);
    const passed =
      trade !== null &&
      trade.result === 'WIN' &&
      trade.exitReason === 'TAKE_PROFIT' &&
      trade.RMultiple >= 1.9;

    results.push({
      id: 'TEST-3',
      name: 'SELL Trade Reaching Take Profit',
      category: 'Trade Simulation',
      passed,
      expected: 'WIN with TAKE_PROFIT exit at ~2.0R',
      actual: `${trade?.result} with ${trade?.exitReason} (${trade?.RMultiple}R)`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-3',
      name: 'SELL Trade Reaching Take Profit',
      category: 'Trade Simulation',
      passed: false,
      expected: 'WIN',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 4: SELL trade reaching Stop Loss
  try {
    const candles: MarketCandle[] = [
      makeCandle(1000, 1.1000, 1.1010, 1.0990, 1.0995),
      makeCandle(2000, 1.0995, 1.1010, 1.0990, 1.1005),
      makeCandle(3000, 1.1005, 1.1025, 1.1000, 1.1020), // Pierces SL (1.1015)
    ];

    const setup: PendingTradeSetup = {
      id: 'T4',
      symbol: 'EUR/USD',
      strategy: 'Liquidity Sweep',
      direction: 'SELL',
      signalBarIndex: 0,
      signalTime: 1000,
      signalTimeISO: new Date(1000).toISOString(),
      calculatedEntry: 1.0995,
      stopLoss: 1.1015,
      takeProfit: 1.0955,
      confidenceScore: 72,
      riskReward: 2.0,
      marketRegime: 'TRENDING_BEARISH',
      volatilityState: 'NORMAL',
      supportingStrategies: ['Liquidity Sweep'],
      sampleType: 'IN_SAMPLE',
    };

    const trade = simulateTradeOutcome(setup, candles, defaultConfig);
    const passed =
      trade !== null &&
      trade.result === 'LOSS' &&
      trade.exitReason === 'STOP_LOSS' &&
      trade.RMultiple <= -0.9;

    results.push({
      id: 'TEST-4',
      name: 'SELL Trade Reaching Stop Loss',
      category: 'Trade Simulation',
      passed,
      expected: 'LOSS with STOP_LOSS exit at -1.0R',
      actual: `${trade?.result} with ${trade?.exitReason} (${trade?.RMultiple}R)`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-4',
      name: 'SELL Trade Reaching Stop Loss',
      category: 'Trade Simulation',
      passed: false,
      expected: 'LOSS',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 5: Same-candle SL + TP conflict (Conservative Rule)
  try {
    const candles: MarketCandle[] = [
      makeCandle(1000, 1.1000, 1.1010, 1.0990, 1.1005),
      makeCandle(2000, 1.1005, 1.1060, 1.0970, 1.1020), // High reaches TP (1.1045) AND Low reaches SL (1.0985)
    ];

    const setup: PendingTradeSetup = {
      id: 'T5',
      symbol: 'EUR/USD',
      strategy: 'Breakout Analysis',
      direction: 'BUY',
      signalBarIndex: 0,
      signalTime: 1000,
      signalTimeISO: new Date(1000).toISOString(),
      calculatedEntry: 1.1005,
      stopLoss: 1.0985,
      takeProfit: 1.1045,
      confidenceScore: 68,
      riskReward: 2.0,
      marketRegime: 'BREAKOUT',
      volatilityState: 'HIGH_VOLATILITY',
      supportingStrategies: ['Breakout'],
      sampleType: 'IN_SAMPLE',
    };

    const trade = simulateTradeOutcome(setup, candles, {
      ...defaultConfig,
      exitConflictRule: 'CONSERVATIVE',
    });

    const passed =
      trade !== null &&
      trade.exitAmbiguity === true &&
      (trade.result === 'AMBIGUOUS' || trade.result === 'LOSS') &&
      trade.exitReason === 'SAME_CANDLE_CONFLICT_LOSS';

    results.push({
      id: 'TEST-5',
      name: 'Same-Candle SL+TP Conflict (Conservative)',
      category: 'Safety & Conflict Rules',
      passed,
      expected: 'exitAmbiguity = true, exitReason = SAME_CANDLE_CONFLICT_LOSS',
      actual: `exitAmbiguity: ${trade?.exitAmbiguity}, exitReason: ${trade?.exitReason}`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-5',
      name: 'Same-Candle SL+TP Conflict (Conservative)',
      category: 'Safety & Conflict Rules',
      passed: false,
      expected: 'SAME_CANDLE_CONFLICT_LOSS',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 6: Missing / Corrupt Candles Handled Safely
  try {
    const corruptCandles: any[] = [
      { timestamp: 1000, open: NaN, high: 1.10, low: 1.09, close: 1.095 },
      { timestamp: 2000, open: 1.095, high: 0, low: 0, close: 0 },
      { timestamp: 3000, open: 1.095, high: 1.08, low: 1.11, close: 1.09 }, // Inverted High/Low
    ];

    const { cleanCandles, report } = validateHistoricalDataset(corruptCandles, 'M15');
    const passed = report.zeroOrNaNCandles > 0 && report.isValid === false;

    results.push({
      id: 'TEST-6',
      name: 'Corrupt & NaN Candle Detection',
      category: 'Data Validation',
      passed,
      expected: 'Invalid dataset rejected (isValid: false, zeroOrNaNCandles > 0)',
      actual: `isValid: ${report.isValid}, NaN discarded: ${report.zeroOrNaNCandles}`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-6',
      name: 'Corrupt & NaN Candle Detection',
      category: 'Data Validation',
      passed: false,
      expected: 'Rejection',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 7: Duplicate Candles Deduplication
  try {
    const dupCandles: MarketCandle[] = [
      makeCandle(1000, 1.10, 1.11, 1.09, 1.105),
      makeCandle(1000, 1.10, 1.11, 1.09, 1.105), // Duplicate timestamp
      makeCandle(2000, 1.105, 1.115, 1.10, 1.11),
      makeCandle(2000, 1.105, 1.115, 1.10, 1.11), // Duplicate timestamp
      makeCandle(3000, 1.11, 1.12, 1.105, 1.115),
    ];

    const { cleanCandles, report } = validateHistoricalDataset(dupCandles, 'M15');
    const passed = report.duplicateCount === 2 && cleanCandles.length === 3;

    results.push({
      id: 'TEST-7',
      name: 'Duplicate Timestamp Deduplication',
      category: 'Data Validation',
      passed,
      expected: 'Deduplicated to 3 unique candles, duplicateCount: 2',
      actual: `Clean candles: ${cleanCandles.length}, duplicateCount: ${report.duplicateCount}`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-7',
      name: 'Duplicate Timestamp Deduplication',
      category: 'Data Validation',
      passed: false,
      expected: 'Deduplication',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 8: Out-of-Order Timestamp Sorting
  try {
    const disorderedCandles: MarketCandle[] = [
      makeCandle(3000, 1.11, 1.12, 1.105, 1.115),
      makeCandle(1000, 1.10, 1.11, 1.09, 1.105),
      makeCandle(2000, 1.105, 1.115, 1.10, 1.11),
    ];

    const { cleanCandles, report } = validateHistoricalDataset(disorderedCandles, 'M15');
    const getTs = (c: MarketCandle) => c.time || c.timestamp || 0;
    const isSorted =
      getTs(cleanCandles[0]) === 1000 &&
      getTs(cleanCandles[1]) === 2000 &&
      getTs(cleanCandles[2]) === 3000;

    const passed = report.outOfOrderCount > 0 && isSorted;

    results.push({
      id: 'TEST-8',
      name: 'Chronological Out-of-Order Sorting',
      category: 'Data Validation',
      passed,
      expected: 'Chronologically reordered [1000, 2000, 3000]',
      actual: `Timestamps: [${cleanCandles.map((c) => getTs(c)).join(', ')}]`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-8',
      name: 'Chronological Out-of-Order Sorting',
      category: 'Data Validation',
      passed: false,
      expected: 'Sorting',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 9: R-Multiple & Expectancy Formula Verification
  try {
    // 3 Wins at 2R each (+6R), 2 Losses at -1R each (-2R)
    // Win rate = 60%, Loss rate = 40%
    // Expectancy = (0.6 * 2.0) - (0.4 * 1.0) = 1.2 - 0.4 = +0.80 R/trade
    // Profit Factor = 6R / 2R = 3.0
    const mockTrades: BacktestTrade[] = [
      {
        id: 'T1',
        symbol: 'EUR/USD',
        strategy: 'Breakout',
        direction: 'BUY',
        signalTime: 1000,
        signalTimeISO: '',
        entryTime: 2000,
        entryTimeISO: '',
        entryPrice: 1.10,
        stopLoss: 1.09,
        takeProfit: 1.12,
        confidenceScore: 75,
        riskReward: 2.0,
        exitTime: 3000,
        exitTimeISO: '',
        exitPrice: 1.12,
        exitReason: 'TAKE_PROFIT',
        result: 'WIN',
        grossR: 2.0,
        netR: 2.0,
        RMultiple: 2.0,
        durationMs: 1000,
        durationBars: 1,
        marketRegime: 'TRENDING_BULLISH',
        volatilityState: 'NORMAL',
        newsRisk: 'UNKNOWN',
        exitAmbiguity: false,
        supportingStrategies: [],
        costImpactR: 0,
        sampleType: 'IN_SAMPLE',
        entryBarIndex: 1,
        exitBarIndex: 2,
      },
      {
        id: 'T2',
        symbol: 'EUR/USD',
        strategy: 'Breakout',
        direction: 'BUY',
        signalTime: 4000,
        signalTimeISO: '',
        entryTime: 5000,
        entryTimeISO: '',
        entryPrice: 1.10,
        stopLoss: 1.09,
        takeProfit: 1.12,
        confidenceScore: 75,
        riskReward: 2.0,
        exitTime: 6000,
        exitTimeISO: '',
        exitPrice: 1.12,
        exitReason: 'TAKE_PROFIT',
        result: 'WIN',
        grossR: 2.0,
        netR: 2.0,
        RMultiple: 2.0,
        durationMs: 1000,
        durationBars: 1,
        marketRegime: 'TRENDING_BULLISH',
        volatilityState: 'NORMAL',
        newsRisk: 'UNKNOWN',
        exitAmbiguity: false,
        supportingStrategies: [],
        costImpactR: 0,
        sampleType: 'IN_SAMPLE',
        entryBarIndex: 4,
        exitBarIndex: 5,
      },
      {
        id: 'T3',
        symbol: 'EUR/USD',
        strategy: 'Breakout',
        direction: 'BUY',
        signalTime: 7000,
        signalTimeISO: '',
        entryTime: 8000,
        entryTimeISO: '',
        entryPrice: 1.10,
        stopLoss: 1.09,
        takeProfit: 1.12,
        confidenceScore: 75,
        riskReward: 2.0,
        exitTime: 9000,
        exitTimeISO: '',
        exitPrice: 1.12,
        exitReason: 'TAKE_PROFIT',
        result: 'WIN',
        grossR: 2.0,
        netR: 2.0,
        RMultiple: 2.0,
        durationMs: 1000,
        durationBars: 1,
        marketRegime: 'TRENDING_BULLISH',
        volatilityState: 'NORMAL',
        newsRisk: 'UNKNOWN',
        exitAmbiguity: false,
        supportingStrategies: [],
        costImpactR: 0,
        sampleType: 'IN_SAMPLE',
        entryBarIndex: 7,
        exitBarIndex: 8,
      },
      {
        id: 'T4',
        symbol: 'EUR/USD',
        strategy: 'Breakout',
        direction: 'BUY',
        signalTime: 10000,
        signalTimeISO: '',
        entryTime: 11000,
        entryTimeISO: '',
        entryPrice: 1.10,
        stopLoss: 1.09,
        takeProfit: 1.12,
        confidenceScore: 65,
        riskReward: 2.0,
        exitTime: 12000,
        exitTimeISO: '',
        exitPrice: 1.09,
        exitReason: 'STOP_LOSS',
        result: 'LOSS',
        grossR: -1.0,
        netR: -1.0,
        RMultiple: -1.0,
        durationMs: 1000,
        durationBars: 1,
        marketRegime: 'TRENDING_BULLISH',
        volatilityState: 'NORMAL',
        newsRisk: 'UNKNOWN',
        exitAmbiguity: false,
        supportingStrategies: [],
        costImpactR: 0,
        sampleType: 'IN_SAMPLE',
        entryBarIndex: 10,
        exitBarIndex: 11,
      },
      {
        id: 'T5',
        symbol: 'EUR/USD',
        strategy: 'Breakout',
        direction: 'BUY',
        signalTime: 13000,
        signalTimeISO: '',
        entryTime: 14000,
        entryTimeISO: '',
        entryPrice: 1.10,
        stopLoss: 1.09,
        takeProfit: 1.12,
        confidenceScore: 65,
        riskReward: 2.0,
        exitTime: 15000,
        exitTimeISO: '',
        exitPrice: 1.09,
        exitReason: 'STOP_LOSS',
        result: 'LOSS',
        grossR: -1.0,
        netR: -1.0,
        RMultiple: -1.0,
        durationMs: 1000,
        durationBars: 1,
        marketRegime: 'TRENDING_BULLISH',
        volatilityState: 'NORMAL',
        newsRisk: 'UNKNOWN',
        exitAmbiguity: false,
        supportingStrategies: [],
        costImpactR: 0,
        sampleType: 'IN_SAMPLE',
        entryBarIndex: 13,
        exitBarIndex: 14,
      },
    ];

    const stats = calculatePerformanceMetrics(mockTrades);
    const passed =
      stats.winRate === 60.0 &&
      stats.totalR === 4.0 &&
      stats.profitFactor === 3.0 &&
      stats.expectancy === 0.8 &&
      stats.averageWinR === 2.0 &&
      stats.averageLossR === 1.0;

    results.push({
      id: 'TEST-9',
      name: 'Expectancy & Profit Factor Math Verification',
      category: 'Mathematical Analytics',
      passed,
      expected: 'winRate: 60%, totalR: 4.0R, profitFactor: 3.0, expectancy: +0.80R',
      actual: `winRate: ${stats.winRate}%, totalR: ${stats.totalR}R, PF: ${stats.profitFactor}, Exp: ${stats.expectancy}R`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-9',
      name: 'Expectancy & Profit Factor Math Verification',
      category: 'Mathematical Analytics',
      passed: false,
      expected: 'Exact Math',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 10: Confidence Bucket Bucketing Verification
  try {
    const tradesForBuckets: BacktestTrade[] = [
      { ...createMockTrade('T1', 45, 1.0) }, // 0-49
      { ...createMockTrade('T2', 55, -1.0) }, // 50-59
      { ...createMockTrade('T3', 65, 2.0) }, // 60-69
      { ...createMockTrade('T4', 75, 2.5) }, // 70-79
      { ...createMockTrade('T5', 85, 3.0) }, // 80-89
      { ...createMockTrade('T6', 95, 2.0) }, // 90-100
    ];

    const buckets = generateConfidenceBuckets(tradesForBuckets);
    const countMatch = buckets.every((b) => b.trades === 1);
    const passed = buckets.length === 6 && countMatch;

    results.push({
      id: 'TEST-10',
      name: 'Confidence Score Bucket Aggregation',
      category: 'Segmentation & Analysis',
      passed,
      expected: '6 distinct buckets (0-49 ... 90-100) with exactly 1 trade each',
      actual: `Buckets: ${buckets.length}, Total trade counts: [${buckets.map((b) => `${b.bucket}:${b.trades}`).join(', ')}]`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-10',
      name: 'Confidence Score Bucket Aggregation',
      category: 'Segmentation & Analysis',
      passed: false,
      expected: 'Buckets',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 11: Profit Factor Zero Gross Losses Failsafe
  try {
    const zeroLossTrades: BacktestTrade[] = [
      createMockTrade('T1', 80, 2.0),
      createMockTrade('T2', 85, 2.0),
    ];
    const stats = calculatePerformanceMetrics(zeroLossTrades);
    const passed = stats.profitFactor > 0 && Number.isFinite(stats.profitFactor);

    results.push({
      id: 'TEST-11',
      name: 'Zero Gross Losses Profit Factor Failsafe',
      category: 'Mathematical Analytics',
      passed,
      expected: 'Finite high number (99.99) rather than NaN or Infinity',
      actual: `Profit Factor: ${stats.profitFactor}`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-11',
      name: 'Zero Gross Losses Profit Factor Failsafe',
      category: 'Mathematical Analytics',
      passed: false,
      expected: 'Handled',
      actual: `Error: ${err.message}`,
    });
  }

  // TEST 12: Max Consecutive Losses Calculation
  try {
    const consecTrades: BacktestTrade[] = [
      createMockTrade('T1', 70, 2.0), // Win
      createMockTrade('T2', 70, -1.0), // Loss 1
      createMockTrade('T3', 70, -1.0), // Loss 2
      createMockTrade('T4', 70, -1.0), // Loss 3
      createMockTrade('T5', 70, 2.0), // Win
      createMockTrade('T6', 70, -1.0), // Loss 1
    ];
    const stats = calculatePerformanceMetrics(consecTrades);
    const passed = stats.maxConsecutiveLosses === 3 && stats.maxConsecutiveWins === 1;

    results.push({
      id: 'TEST-12',
      name: 'Maximum Consecutive Losses Tracking',
      category: 'Mathematical Analytics',
      passed,
      expected: 'maxConsecutiveLosses: 3',
      actual: `maxConsecutiveLosses: ${stats.maxConsecutiveLosses}`,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST-12',
      name: 'Maximum Consecutive Losses Tracking',
      category: 'Mathematical Analytics',
      passed: false,
      expected: '3',
      actual: `Error: ${err.message}`,
    });
  }

  const durationMs = Date.now() - startTime;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    timestamp: Date.now(),
    totalTests: results.length,
    passedCount,
    failedCount,
    allPassed: failedCount === 0,
    results,
    executionDurationMs: durationMs,
  };
}

function createMockTrade(id: string, confidence: number, r: number): BacktestTrade {
  return {
    id,
    symbol: 'EUR/USD',
    strategy: 'Trend-Following',
    direction: 'BUY',
    signalTime: Date.now() - 100000,
    signalTimeISO: new Date().toISOString(),
    entryTime: Date.now() - 90000,
    entryTimeISO: new Date().toISOString(),
    entryPrice: 1.1000,
    stopLoss: 1.0900,
    takeProfit: 1.1200,
    confidenceScore: confidence,
    riskReward: 2.0,
    exitTime: Date.now(),
    exitTimeISO: new Date().toISOString(),
    exitPrice: r > 0 ? 1.1200 : 1.0900,
    exitReason: r > 0 ? 'TAKE_PROFIT' : 'STOP_LOSS',
    result: r > 0 ? 'WIN' : 'LOSS',
    grossR: r,
    netR: r,
    RMultiple: r,
    durationMs: 90000,
    durationBars: 3,
    marketRegime: 'TRENDING_BULLISH',
    volatilityState: 'NORMAL',
    newsRisk: 'UNKNOWN',
    exitAmbiguity: false,
    supportingStrategies: ['Trend-Following'],
    costImpactR: 0,
    sampleType: 'IN_SAMPLE',
    entryBarIndex: 1,
    exitBarIndex: 4,
  };
}
