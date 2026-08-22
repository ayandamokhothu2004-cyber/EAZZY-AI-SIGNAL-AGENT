import {
  saveSignalToJournal,
  getSignalJournal,
  resetSignalJournal,
  calculatePerformanceAnalytics,
  getTotalScanCount,
} from '../server/journalService';
import {
  computeSetupFingerprint,
  generateSignalDecision,
} from '../src/signals/decisionEngine';
import {
  getCandleCountdown,
  formatCountdown,
  mergeCandleUpdates,
  validateCandle,
  TIMEFRAME_MS,
} from '../src/utils/candleLifecycle';
import { Signal, MarketCandle, InstrumentConfig, RiskSettings } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('======================================================');
console.log('RUNNING SIGNAL DEDUPLICATION & CHART SAFETY TEST SUITE');
console.log('======================================================\n');

let passedCount = 0;

function runTest(testNum: number, name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ [PASS] Test ${testNum}: ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Test ${testNum}: ${name}\n   Error: ${err.message}`);
    throw err;
  }
}

const mockInstrument: InstrumentConfig = {
  symbol: 'EURUSD',
  name: 'EUR/USD',
  assetClass: 'FOREX',
  pipSize: 0.0001,
  digits: 5,
  icon: '💶',
  description: 'Euro / US Dollar',
};

const defaultRisk: RiskSettings = {
  maxRiskPerTradePercent: 1.0,
  minRiskReward: 1.5,
  maxSimultaneousSignals: 4,
  maxDailySignals: 10,
  maxConsecutiveLosses: 3,
  maxDailyDrawdownPercent: 3.0,
  minConfidenceRequired: 50,
};

function createBaseSignal(overrides: Partial<Signal>): Signal {
  return {
    id: 'SIG-DEDUP-TEST-1',
    instrument: 'EURUSD',
    direction: 'BUY',
    tradeType: 'DAY',
    strategy: 'TREND_FOLLOWING',
    currentPrice: 1.085,
    suggestedEntry: 1.085,
    stopLoss: 1.08,
    takeProfit1: 1.095,
    takeProfit2: 1.102,
    riskRewardRatio: 2.0,
    aiConfidence: 82,
    marketBias: 'BULLISH',
    candleTimestamp: 1700000000000,
    timestamp: 1700000000000,
    createdAt: 1700000000000,
    setupExplanation: 'Strong trend setup',
    conditionsDetected: ['Bullish BOS', 'EMA Stack Alignment'],
    invalidationCondition: 'Close below 1.0800',
    status: 'ACTIVE',
    timeframeUsed: { context: 'H1', entry: 'M15' },
    confidenceFactors: [],
    strategyBreakdown: {
      trendFollowing: true,
      breakout: false,
      pullback: false,
      supportResistance: false,
      marketStructure: false,
      liquiditySweep: false,
      momentum: true,
      volatility: false,
      mtfConfluence: true,
    },
    setupFingerprint: computeSetupFingerprint(
      'EURUSD',
      'BUY',
      'TREND_FOLLOWING',
      'M15',
      1700000000000,
      { low: 1.0845, high: 1.0855 }
    ),
    ...overrides,
  };
}

// Test 1: 100 Repeated Scans on Same Setup Produces Exactly 1 Journal Entry
runTest(1, '100 Repeated Scans on Same Setup Produces Exactly 1 Journal Entry', () => {
  resetSignalJournal(false);

  const initialSignal = createBaseSignal({ id: 'SIG-100-SCANS' });
  saveSignalToJournal(initialSignal);

  assert(getSignalJournal().length === 1, 'Initial scan should create 1 entry');

  // Simulate 99 repeated scans with slight tick price shifts and confidence variations
  for (let i = 1; i < 100; i++) {
    const rescanSignal: Signal = {
      ...initialSignal,
      id: `SIG-SCAN-RUN-${i}`, // New random temporary scan id
      currentPrice: 1.0850 + (i % 5) * 0.0001,
      aiConfidence: 80 + (i % 10),
      setupExplanation: `Rescan #${i} analysis`,
    };

    const saved = saveSignalToJournal(rescanSignal);
    // Must preserve original immutable parameters
    assert(saved.id === 'SIG-100-SCANS', 'Saved signal ID must match original active ID');
    assert(saved.suggestedEntry === initialSignal.suggestedEntry, 'Entry must remain immutable');
    assert(saved.stopLoss === initialSignal.stopLoss, 'Stop loss must remain immutable');
    assert(saved.takeProfit1 === initialSignal.takeProfit1, 'Take profit 1 must remain immutable');
  }

  const journal = getSignalJournal();
  assert(journal.length === 1, `Journal length must be exactly 1, got ${journal.length}`);
  assert(journal[0].id === 'SIG-100-SCANS', 'Signal in journal must be the single active signal');
});

// Test 2: WAIT Scan Does Not Insert Phantom Trades in Journal
runTest(2, 'WAIT Scan Results Do Not Insert Phantom Trades in Journal', () => {
  resetSignalJournal(false);

  const waitSignal = createBaseSignal({
    id: 'SIG-WAIT-01',
    direction: 'WAIT',
    status: 'INVALIDATED',
    setupExplanation: 'Consolidation - No clear edge',
  });

  const result = saveSignalToJournal(waitSignal);
  assert(result.direction === 'WAIT', 'Returned signal must be WAIT');
  assert(getSignalJournal().length === 0, 'WAIT scan must not create a journal trade entry');
});

// Test 3: Multiple Distinct Instruments Have Independent Active Signals
runTest(3, 'Multiple Distinct Instruments Have Independent Active Signals', () => {
  resetSignalJournal(false);

  const eurSignal = createBaseSignal({
    id: 'SIG-EURUSD-01',
    instrument: 'EURUSD',
    direction: 'BUY',
    candleTimestamp: 1700000000000,
  });

  const gbpSignal = createBaseSignal({
    id: 'SIG-GBPUSD-01',
    instrument: 'GBPUSD',
    direction: 'SELL',
    candleTimestamp: 1700000000000,
    setupFingerprint: computeSetupFingerprint('GBPUSD', 'SELL', 'TREND_FOLLOWING', 'M15', 1700000000000, { low: 1.269, high: 1.271 }),
  });

  saveSignalToJournal(eurSignal);
  saveSignalToJournal(gbpSignal);

  const journal = getSignalJournal();
  assert(journal.length === 2, `Journal should contain 2 signals for 2 distinct pairs, got ${journal.length}`);
});

// Test 4: Chart Candle Validation and Safe Deduplication
runTest(4, 'Chart Candle Validation Rejects Invalid OHLC Geometry', () => {
  // Valid candle
  const validCandle: MarketCandle = {
    time: 1700000000000,
    open: 1.0850,
    high: 1.0880,
    low: 1.0840,
    close: 1.0870,
    volume: 1200,
  };
  assert(validateCandle(validCandle) === true, 'Valid candle must pass validation');

  // Invalid: High lower than close
  const invalidHigh: MarketCandle = {
    time: 1700000000000,
    open: 1.0850,
    high: 1.0840, // High < Open
    low: 1.0830,
    close: 1.0860,
    volume: 1000,
  };
  assert(validateCandle(invalidHigh) === false, 'Candle with High < Max(Open, Close) must fail');

  // Invalid: Future timestamp far beyond allowable skew
  const futureCandle: MarketCandle = {
    time: Date.now() + 1000 * 3600 * 24 * 30, // 30 days in future
    open: 1.0850,
    high: 1.0880,
    low: 1.0840,
    close: 1.0870,
    volume: 1000,
  };
  assert(validateCandle(futureCandle, Date.now() + 60000) === false, 'Future timestamp must fail');
});

// Test 5: mergeCandleUpdates Updates Forming Candle In-Place
runTest(5, 'mergeCandleUpdates Updates Forming Candle In-Place Without Duplicates', () => {
  const c1: MarketCandle = { time: 1000, open: 1.0, high: 1.1, low: 0.9, close: 1.05, volume: 100 };
  const c2: MarketCandle = { time: 2000, open: 1.05, high: 1.15, low: 1.0, close: 1.10, volume: 200 };
  const existing = [c1, c2];

  // Incoming tick mutates c2 (the forming candle) with new high and close
  const c2Updated: MarketCandle = { time: 2000, open: 1.05, high: 1.20, low: 1.0, close: 1.18, volume: 350 };
  const merged = mergeCandleUpdates(existing, [c2Updated], 'M15', 5000);

  assert(merged.length === 2, `Merged length must remain 2, got ${merged.length}`);
  assert(merged[1].high === 1.20, 'Forming candle high must be updated in-place');
  assert(merged[1].close === 1.18, 'Forming candle close must be updated in-place');
  assert(merged[1].volume === 350, 'Forming candle volume must be updated in-place');
});

// Test 6: Real-Time Candle Countdown Mathematics
runTest(6, 'Real-Time Candle Countdown Calculates Time Remaining Accurately', () => {
  const syncTime = 1000 * 60 * 12; // 12:00 (12 minutes)
  // For M15 (15 min period: 0:00 -> 15:00):
  // Close time is 15:00. Remaining: 3 minutes (180,000 ms)
  const cdM15 = getCandleCountdown('M15', undefined, syncTime);
  assert(cdM15.remainingMs === 3 * 60 * 1000, `Expected 180000ms remaining, got ${cdM15.remainingMs}`);
  assert(cdM15.formatted === '03:00', `Formatted expected '03:00', got ${cdM15.formatted}`);

  // Test formatCountdown helper for hours
  const cdHour = formatCountdown(3665 * 1000); // 1 hour 1 minute 5 seconds
  assert(cdHour === '01:01:05', `Expected '01:01:05', got ${cdHour}`);
});

console.log('\n======================================================');
console.log(`TEST SUITE COMPLETE: ${passedCount} / 6 PASSED`);
console.log('======================================================\n');
