import { MarketDataManager } from '../server/providers/MarketDataManager';
import { validateHistoricalDataset } from '../src/backtest/dataValidator';
import { runEventBasedBacktest, runMultiAssetBacktest } from '../src/backtest/engine';
import { BacktestConfig } from '../src/types/backtest';
import { MarketCandle, InstrumentConfig } from '../src/types';

console.log('====================================================');
console.log('RUNNING STEP 5A REAL HISTORICAL DATA BACKTESTING TESTS');
console.log('====================================================');

let testsPassed = 0;
let testsTotal = 0;

function assert(condition: boolean, testName: string, errorDetails?: string) {
  testsTotal++;
  if (condition) {
    console.log(`[✅ PASS] TEST-${testsTotal}: ${testName}`);
    testsPassed++;
  } else {
    console.error(`[❌ FAIL] TEST-${testsTotal}: ${testName}`);
    if (errorDetails) console.error(`   Details: ${errorDetails}`);
  }
}

async function runTests() {
  const manager = new MarketDataManager();

  // TEST 1: Backtest Historical Candles Endpoint Method Structure
  const resp = await manager.getBacktestHistoricalCandles('EUR/USD', 'M15', 50);
  assert(
    resp && typeof resp.status === 'string' && Array.isArray(resp.candles),
    'MarketDataManager.getBacktestHistoricalCandles contract compliance',
    `Received: ${JSON.stringify(resp)}`
  );

  // TEST 2: Strict Unavailability Reporting (No fake prices generated)
  // When no provider keys or no candles exist, must report UNAVAILABLE and 0 candles
  if (resp.status === 'UNAVAILABLE') {
    assert(
      resp.candles.length === 0 && resp.errorMessage?.includes('HISTORICAL DATA UNAVAILABLE'),
      'Strict UNAVAILABLE status reported when provider data is absent without fabricating fake prices',
      `Error Message: ${resp.errorMessage}`
    );
  } else {
    assert(
      resp.status === 'AVAILABLE' && resp.candles.length >= 30 && resp.dataQuality?.isValid === true,
      'Real Historical Candles validated for quality and minimum sample size',
      `Candle count: ${resp.candles.length}`
    );
  }

  // TEST 3: Strict Data Quality Validation on Mocked Corrupt Real Feeds
  const corruptFeeds: MarketCandle[] = [
    { time: 1000, timestamp: 1000, datetime: new Date(1000).toISOString(), open: 1.1000, high: 1.1020, low: 1.0990, close: 1.1010, volume: 50 },
    { time: 2000, timestamp: 2000, datetime: new Date(2000).toISOString(), open: 0, high: 0, low: 0, close: 0, volume: 0 }, // Zero price
    { time: 500, timestamp: 500, datetime: new Date(500).toISOString(), open: 1.1015, high: 1.1000, low: 1.1025, close: 1.1005, volume: 50 }, // Out of order (500 after 1000) & invalid geometry
    { time: 3000, timestamp: 3000, datetime: new Date(3000).toISOString(), open: 1.1005, high: 1.1030, low: 1.0995, close: 1.1020, volume: 50 },
    { time: 3000, timestamp: 3000, datetime: new Date(3000).toISOString(), open: 1.1005, high: 1.1030, low: 1.0995, close: 1.1020, volume: 50 }, // Duplicate timestamp
  ];

  const validation = validateHistoricalDataset(corruptFeeds, 'M15');
  assert(
    validation.report.zeroOrNaNCandles === 1 &&
    validation.report.outOfOrderCount >= 1 &&
    validation.report.duplicateCount === 1,
    'Data validator catches zero-prices, duplicates, and out-of-order candles',
    `Report: ${JSON.stringify(validation.report)}`
  );

  // TEST 4: Real Look-Ahead Protection Invariance on Sequential Slices
  const validCandles: MarketCandle[] = [];
  const baseTime = 1700000000000;
  let curPrice = 1.0850;
  for (let i = 0; i < 120; i++) {
    const t = baseTime + i * 15 * 60 * 1000;
    const delta = (Math.sin(i * 0.2) + Math.cos(i * 0.1)) * 0.0008;
    const open = curPrice;
    const close = curPrice + delta;
    const high = Math.max(open, close) + 0.0005;
    const low = Math.min(open, close) - 0.0005;
    curPrice = close;
    validCandles.push({
      time: t,
      timestamp: t,
      datetime: new Date(t).toISOString(),
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: 1000,
    });
  }

  const testConfig: BacktestConfig = {
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
    costModel: { enabled: true, spreadPips: 1.0, slippagePips: 0.5, commissionR: 0.02 },
    warmupPeriod: 30,
  };

  const inst: InstrumentConfig = {
    symbol: 'EUR/USD',
    name: 'EUR/USD',
    assetClass: 'FOREX',
    pipSize: 0.0001,
    digits: 5,
    icon: '📊',
    description: 'Forex',
  };

  const reportFull = runEventBasedBacktest(validCandles, testConfig, inst);
  const reportPrefix = runEventBasedBacktest(validCandles.slice(0, 80), testConfig, inst);

  // Any trade generated within the first 80 candles in reportFull must be identical to reportPrefix
  const tradesPrefixFull = reportFull.trades.filter((t) => t.entryBarIndex < 80);
  const isPrefixIdentical = tradesPrefixFull.every((t, idx) => {
    const p = reportPrefix.trades[idx];
    return p && p.entryBarIndex === t.entryBarIndex && p.direction === t.direction && Math.abs(p.entryPrice - t.entryPrice) < 0.00001;
  });

  assert(
    isPrefixIdentical,
    'Sequential slice evaluation invariant holds (Zero look-ahead bias across prefixes)',
    `Prefix trades: ${reportPrefix.trades.length}, Matching in full: ${tradesPrefixFull.length}`
  );

  // TEST 5: Out-of-Sample Chronological Split Invariant
  // In-Sample trades must strictly precede Out-of-Sample trades in candle bar indices
  const inSampleTrades = reportFull.trades.filter((t) => t.sampleType === 'IN_SAMPLE');
  const outOfSampleTrades = reportFull.trades.filter((t) => t.sampleType === 'OUT_OF_SAMPLE');
  const splitIndex = Math.floor(validCandles.length * 0.7);

  const inSampleAllBefore = inSampleTrades.every((t) => t.entryBarIndex < splitIndex);
  const outOfSampleAllAfter = outOfSampleTrades.every((t) => t.entryBarIndex >= splitIndex);

  assert(
    inSampleAllBefore && outOfSampleAllAfter,
    'Strict chronological Out-of-Sample (70/30) boundary preservation',
    `Split index: ${splitIndex}, In-sample count: ${inSampleTrades.length}, Out-of-sample count: ${outOfSampleTrades.length}`
  );

  // TEST 6: Multi-Asset Portfolio Aggregation & Best/Worst Rankings
  const gbpCandles = validCandles.map((c) => ({
    ...c,
    open: c.open * 1.25,
    high: c.high * 1.25,
    low: c.low * 1.25,
    close: c.close * 1.25,
  }));

  const multiRes = runMultiAssetBacktest(
    [
      { instrument: inst, candles: validCandles },
      {
        instrument: {
          symbol: 'GBP/USD',
          name: 'GBP/USD',
          assetClass: 'FOREX',
          pipSize: 0.0001,
          digits: 5,
          icon: '📊',
          description: 'GBP/USD Forex',
        },
        candles: gbpCandles,
      },
    ],
    testConfig
  );

  assert(
    multiRes.portfolioReport &&
    Array.isArray(multiRes.portfolioReport.trades) &&
    multiRes.portfolioReport.assetBreakdown.length === 2 &&
    multiRes.portfolioReport.strategyBreakdown.length === 5,
    'Multi-Asset Portfolio correctly aggregates trades across instruments and strategies',
    `Total portfolio trades: ${multiRes.portfolioReport.trades.length}`
  );

  console.log('\n====================================================');
  console.log(`Summary: ${testsPassed} / ${testsTotal} tests passed.`);
  console.log('====================================================');

  if (testsPassed === testsTotal) {
    console.log('✅ ALL STEP 5A REAL HISTORICAL DATA VERIFICATION TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Error running test runner:', err);
  process.exit(1);
});
