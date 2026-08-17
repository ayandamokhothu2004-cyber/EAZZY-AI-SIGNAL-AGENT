import {
  evaluateSignalOutcome,
  saveSignalToJournal,
  getSignalJournal,
  resetSignalJournal,
  calculatePerformanceAnalytics,
} from '../server/journalService';
import { computeSetupFingerprint, validateSLTPGeometry } from '../src/signals/decisionEngine';
import { Signal } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createBaseSignal(overrides: Partial<Signal>): Signal {
  return {
    id: 'SIG-TEST-BASE',
    instrument: 'EURUSD',
    direction: 'BUY',
    tradeType: 'DAY',
    currentPrice: 1.085,
    suggestedEntry: 1.085,
    stopLoss: 1.08,
    takeProfit1: 1.095,
    riskRewardRatio: 2.0,
    aiConfidence: 80,
    marketBias: 'BULLISH',
    timestamp: 1000,
    createdAt: 1000,
    setupExplanation: 'Test setup',
    conditionsDetected: ['Bullish BOS'],
    invalidationCondition: 'Close below SL',
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
      momentum: false,
      volatility: false,
      mtfConfluence: false,
    },
    ...overrides,
  };
}

console.log('======================================================');
console.log('RUNNING 17-POINT SIGNAL LIFECYCLE & AUDIT TEST SUITE');
console.log('======================================================\n');

let passedCount = 0;
const totalCount = 17;

function runTest(testNum: number, name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ [PASS] Test ${testNum}: ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Test ${testNum}: ${name}\n   Error: ${err.message}`);
  }
}

// Test 1: BUY Signal Hits TP1 Cleanly
runTest(1, 'BUY Signal Hits TP1 Cleanly', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-01',
    takeProfit1: 1.095,
    takeProfit2: 1.1,
  });

  const res = evaluateSignalOutcome(signal, {
    price: 1.0955,
    bid: 1.0955,
    ask: 1.0956,
    timestamp: 2000,
  });

  assert(res.statusChanged === true, 'Status should change');
  assert(signal.status === 'TP1_HIT', `Status should be TP1_HIT, got ${signal.status}`);
  assert(signal.outcomeR === 2.0, `Outcome R should be 2.0, got ${signal.outcomeR}`);
});

// Test 2: BUY Signal Hits SL Cleanly
runTest(2, 'BUY Signal Hits SL Cleanly', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-02',
    stopLoss: 1.08,
  });

  const res = evaluateSignalOutcome(signal, {
    price: 1.0795,
    bid: 1.0795,
    ask: 1.0796,
    timestamp: 2000,
  });

  assert(res.statusChanged === true, 'Status should change');
  assert(signal.status === 'SL_HIT', `Status should be SL_HIT, got ${signal.status}`);
  assert(signal.outcomeR === -1.0, `Outcome R should be -1.0, got ${signal.outcomeR}`);
});

// Test 3: SELL Signal Hits TP1 Cleanly
runTest(3, 'SELL Signal Hits TP1 Cleanly', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-03',
    instrument: 'GBPUSD',
    direction: 'SELL',
    currentPrice: 1.27,
    suggestedEntry: 1.27,
    stopLoss: 1.275,
    takeProfit1: 1.26,
    marketBias: 'BEARISH',
  });

  const res = evaluateSignalOutcome(signal, {
    price: 1.259,
    bid: 1.2589,
    ask: 1.259,
    timestamp: 2000,
  });

  assert(res.statusChanged === true, 'Status should change');
  assert(signal.status === 'TP1_HIT', `Status should be TP1_HIT, got ${signal.status}`);
  assert(signal.outcomeR === 2.0, `Outcome R should be 2.0, got ${signal.outcomeR}`);
});

// Test 4: SELL Signal Hits SL Cleanly
runTest(4, 'SELL Signal Hits SL Cleanly', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-04',
    instrument: 'GBPUSD',
    direction: 'SELL',
    currentPrice: 1.27,
    suggestedEntry: 1.27,
    stopLoss: 1.275,
    takeProfit1: 1.26,
    marketBias: 'BEARISH',
  });

  const res = evaluateSignalOutcome(signal, {
    price: 1.2755,
    bid: 1.2754,
    ask: 1.2755,
    timestamp: 2000,
  });

  assert(res.statusChanged === true, 'Status should change');
  assert(signal.status === 'SL_HIT', `Status should be SL_HIT, got ${signal.status}`);
  assert(signal.outcomeR === -1.0, `Outcome R should be -1.0, got ${signal.outcomeR}`);
});

// Test 5: Both TP and SL Touched in Same Candle -> AMBIGUOUS
runTest(5, 'Both TP and SL Touched in Same Candle (Ambiguous)', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-05',
    stopLoss: 1.08,
    takeProfit1: 1.095,
  });

  // Candle spans from 1.0790 (below SL) to 1.0960 (above TP1)
  const res = evaluateSignalOutcome(signal, {
    price: 1.085,
    high: 1.096,
    low: 1.079,
    timestamp: 2000,
  });

  assert(res.statusChanged === true, 'Status should change');
  assert(signal.status === 'AMBIGUOUS', `Status must be AMBIGUOUS, got ${signal.status}`);
  assert(signal.outcomeR === 0, `Outcome R should be 0, got ${signal.outcomeR}`);
});

// Test 6: Terminal State Immutability
runTest(6, 'Terminal State Immutability', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-06',
    status: 'TP1_HIT',
    outcomeR: 2.0,
  });

  // Subsequent move drops far below SL
  const res = evaluateSignalOutcome(signal, {
    price: 1.07,
    bid: 1.07,
    timestamp: 3000,
  });

  assert(res.statusChanged === false, 'Terminal signal must not change');
  assert(signal.status === 'TP1_HIT', 'Status must remain TP1_HIT');
  assert(signal.outcomeR === 2.0, 'Outcome R must remain 2.0');
});

// Test 7: Historical Boundary / Look-ahead Check
runTest(7, 'Historical Look-ahead Timestamp Protection', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-07',
    timestamp: 5000,
    createdAt: 5000,
    status: 'ACTIVE',
  });

  // Market tick timestamp is in the past (before signal creation at 5000)
  const res = evaluateSignalOutcome(signal, {
    price: 1.075, // would breach SL if evaluated
    bid: 1.075,
    timestamp: 2000, // pre-signal timestamp
  });

  assert(res.statusChanged === false, 'Tick before signal creation must be ignored');
  assert(signal.status === 'ACTIVE', 'Signal must remain ACTIVE');
});

// Test 8: Duplicate Signal Prevention (Fingerprint Deduplication)
runTest(8, 'Duplicate Signal Prevention via setupFingerprint', () => {
  resetSignalJournal(false);

  const sig1 = createBaseSignal({
    id: 'SIG-DUP-01',
    strategy: 'TREND_FOLLOWING',
    timeframe: 'M15',
    candleTimestamp: 100000,
    timestamp: 100000,
    createdAt: 100000,
    setupFingerprint: 'EURUSD:BUY:TREND_FOLLOWING:M15:100000:1.0850',
  });

  saveSignalToJournal(sig1);
  assert(getSignalJournal().length === 1, 'Should have 1 signal in journal');

  // Exact same setup scanned again on next tick
  const sig2 = {
    ...sig1,
    id: 'SIG-DUP-02',
    currentPrice: 1.0852,
    aiConfidence: 85,
    setupExplanation: 'Setup 1 Refreshed',
  };

  saveSignalToJournal(sig2);
  const journal = getSignalJournal();
  assert(journal.length === 1, `Journal length should remain 1, got ${journal.length}`);
  assert(journal[0].aiConfidence === 85, 'Active signal should be refreshed with new confidence');
});

// Test 9: Geometry Validation (BUY with SL >= Entry)
runTest(9, 'Geometry Validation for BUY (SL >= Entry correction)', () => {
  const corrected = validateSLTPGeometry({
    direction: 'BUY',
    entry: 1.085,
    stopLoss: 1.089, // Invalid: SL is above entry for BUY
    takeProfit1: 1.095,
    pipSize: 0.0001,
  });

  assert(corrected.stopLoss < corrected.entry, 'Corrected SL for BUY must be below entry');
  assert(corrected.takeProfit1 > corrected.entry, 'TP1 for BUY must be above entry');
  assert(corrected.riskRewardRatio >= 1.5, 'Risk-reward ratio must be >= 1.5');
});

// Test 10: Geometry Validation (SELL with SL <= Entry)
runTest(10, 'Geometry Validation for SELL (SL <= Entry correction)', () => {
  const corrected = validateSLTPGeometry({
    direction: 'SELL',
    entry: 1.085,
    stopLoss: 1.081, // Invalid: SL is below entry for SELL
    takeProfit1: 1.075,
    pipSize: 0.0001,
  });

  assert(corrected.stopLoss > corrected.entry, 'Corrected SL for SELL must be above entry');
  assert(corrected.takeProfit1 < corrected.entry, 'TP1 for SELL must be below entry');
  assert(corrected.riskRewardRatio >= 1.5, 'Risk-reward ratio must be >= 1.5');
});

// Test 11: Performance Metrics Excluding Ambiguous / Expired
runTest(11, 'Performance Analytics Win Rate Calculation', () => {
  resetSignalJournal(false);

  // Add 2 Wins, 1 Loss, 1 Ambiguous, 1 Expired
  saveSignalToJournal(
    createBaseSignal({
      id: 'SIG-WIN-1',
      status: 'TP1_HIT',
      outcomeR: 2.0,
    })
  );

  saveSignalToJournal(
    createBaseSignal({
      id: 'SIG-WIN-2',
      status: 'TP2_HIT',
      outcomeR: 3.2,
    })
  );

  saveSignalToJournal(
    createBaseSignal({
      id: 'SIG-LOSS-1',
      status: 'SL_HIT',
      outcomeR: -1.0,
    })
  );

  saveSignalToJournal(
    createBaseSignal({
      id: 'SIG-AMB-1',
      status: 'AMBIGUOUS',
      outcomeR: 0,
    })
  );

  saveSignalToJournal(
    createBaseSignal({
      id: 'SIG-EXP-1',
      status: 'EXPIRED',
      outcomeR: 0,
    })
  );

  const stats = calculatePerformanceAnalytics();
  assert(stats.wins === 2, `Expected 2 wins, got ${stats.wins}`);
  assert(stats.losses === 1, `Expected 1 loss, got ${stats.losses}`);
  assert(stats.ambiguous === 1, `Expected 1 ambiguous, got ${stats.ambiguous}`);
  assert(stats.expired === 1, `Expected 1 expired, got ${stats.expired}`);
  // Win rate = 2 / (2 + 1) * 100 = 66.7%
  assert(stats.winRate === 66.7, `Expected win rate 66.7%, got ${stats.winRate}%`);
  // Total R = 2.0 + 3.2 - 1.0 = 4.2
  assert(stats.totalR === 4.2, `Expected totalR 4.2, got ${stats.totalR}`);
});

// Test 12: BUY Signal Hits TP2 Cleanly
runTest(12, 'BUY Signal Hits TP2 Cleanly', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-12',
    instrument: 'XAUUSD',
    tradeType: 'SWING',
    currentPrice: 2390,
    suggestedEntry: 2390,
    stopLoss: 2370,
    takeProfit1: 2430,
    takeProfit2: 2470,
  });

  const res = evaluateSignalOutcome(signal, {
    price: 2475,
    bid: 2475,
    timestamp: 2000,
  });

  assert(res.statusChanged === true, 'Status should change');
  assert(signal.status === 'TP2_HIT', `Expected TP2_HIT, got ${signal.status}`);
  assert(signal.outcomeR === 3.2, `Expected outcomeR 3.2, got ${signal.outcomeR}`);
});

// Test 13: SELL Signal Hits TP2 Cleanly
runTest(13, 'SELL Signal Hits TP2 Cleanly', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-13',
    instrument: 'NAS100',
    direction: 'SELL',
    tradeType: 'SCALP',
    currentPrice: 19900,
    suggestedEntry: 19900,
    stopLoss: 19950,
    takeProfit1: 19800,
    takeProfit2: 19700,
  });

  const res = evaluateSignalOutcome(signal, {
    price: 19690,
    ask: 19690,
    timestamp: 2000,
  });

  assert(res.statusChanged === true, 'Status should change');
  assert(signal.status === 'TP2_HIT', `Expected TP2_HIT, got ${signal.status}`);
  assert(signal.outcomeR === 3.2, `Expected outcomeR 3.2, got ${signal.outcomeR}`);
});

// Test 14: Executable Price Bid vs Ask Sides
runTest(14, 'Executable Price Bid vs Ask Sides Handling', () => {
  const buySignal = createBaseSignal({
    id: 'SIG-TEST-14-BUY',
    stopLoss: 1.08,
  });

  // If mid price is 1.0801, but bid spread drops to 1.0799 (SL hit on bid for BUY)
  const res = evaluateSignalOutcome(buySignal, {
    price: 1.0801,
    bid: 1.0799,
    ask: 1.0803,
    timestamp: 2000,
  });

  assert(res.statusChanged === true, 'BUY evaluates on bid');
  assert(buySignal.status === 'SL_HIT', 'SL hit when bid breaches stop loss');
});

// Test 15: Signal Expiration / Invalidation Transitions
runTest(15, 'Signal Invalidation / Expiration State Handling', () => {
  const signal = createBaseSignal({
    id: 'SIG-TEST-15',
    status: 'EXPIRED',
  });

  const res = evaluateSignalOutcome(signal, {
    price: 1.096,
    timestamp: 2000,
  });

  assert(res.statusChanged === false, 'EXPIRED signal must not transition to TP');
  assert(signal.status === 'EXPIRED', 'Status remains EXPIRED');
});

// Test 16: Unique Signal Count vs Total Scans Deduplication Metric
runTest(16, 'Unique Signal Count Metric Accuracy', () => {
  resetSignalJournal(false);

  const baseSig = createBaseSignal({
    id: 'SIG-UNIQ-1',
    setupFingerprint: 'EURUSD:BUY:TREND_FOLLOWING:M15:1000:1.0850',
  });

  saveSignalToJournal(baseSig);
  saveSignalToJournal({ ...baseSig, currentPrice: 1.0855 });
  saveSignalToJournal({ ...baseSig, currentPrice: 1.0857 });

  const analytics = calculatePerformanceAnalytics();
  assert(analytics.totalUniqueSignals === 1, `Expected 1 unique signal, got ${analytics.totalUniqueSignals}`);
});

// Test 17: Full Lifecycle from Closed-Candle Generation to Resolution
runTest(17, 'Full Lifecycle from Closed-Candle to Resolution', () => {
  resetSignalJournal(false);

  const fp = computeSetupFingerprint('XAUUSD', 'BUY', 'LIQUIDITY_SWEEP', 'H1', 1700000000000, 2390.5);
  assert(fp.includes('XAUUSD:BUY:LIQUIDITY_SWEEP:H1'), 'Fingerprint contains core setup dimensions');

  const signal = createBaseSignal({
    id: 'SIG-LIFECYCLE-17',
    instrument: 'XAUUSD',
    strategy: 'LIQUIDITY_SWEEP',
    timeframe: 'H1',
    candleTimestamp: 1700000000000,
    scanTimestamp: 1700000005000,
    tradeType: 'SWING',
    currentPrice: 2390.5,
    suggestedEntry: 2390.5,
    stopLoss: 2375.0,
    takeProfit1: 2425.0,
    takeProfit2: 2455.0,
    riskRewardRatio: 2.22,
    aiConfidence: 92,
    timestamp: 1700000005000,
    createdAt: 1700000005000,
    setupFingerprint: fp,
    strategyBreakdown: {
      trendFollowing: false,
      breakout: false,
      pullback: false,
      supportResistance: false,
      marketStructure: false,
      liquiditySweep: true,
      momentum: false,
      volatility: false,
      mtfConfluence: false,
    },
  });

  saveSignalToJournal(signal);
  assert(getSignalJournal().length === 1, 'Signal saved in journal');

  // Step 1: Intermediate tick (within range) -> stays ACTIVE
  const t1 = evaluateSignalOutcome(signal, {
    price: 2405.0,
    bid: 2405.0,
    timestamp: 1700000010000,
  });
  assert(t1.statusChanged === false, 'Stays active within range');
  assert(signal.status === 'ACTIVE', 'Signal status is ACTIVE');

  // Step 2: Target tick reached -> resolves to TP1_HIT
  const t2 = evaluateSignalOutcome(signal, {
    price: 2426.0,
    bid: 2426.0,
    timestamp: 1700000020000,
  });
  assert(t2.statusChanged === true, 'Transitions on TP1 hit');
  assert(signal.status === 'TP1_HIT', 'Signal status is TP1_HIT');

  // Step 3: Journal and performance are updated
  const perf = calculatePerformanceAnalytics();
  assert(perf.wins === 1, 'Performance records 1 win');
  assert(perf.losses === 0, 'Performance records 0 losses');
  assert(perf.winRate === 100, 'Win rate is 100%');
});

// Restore historical seeds after tests
resetSignalJournal(true);

console.log('\n======================================================');
console.log(`TEST SUITE COMPLETE: ${passedCount} / ${totalCount} PASSED`);
console.log('======================================================');
