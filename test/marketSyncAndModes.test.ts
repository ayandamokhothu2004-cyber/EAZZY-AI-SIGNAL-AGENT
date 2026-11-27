import assert from 'node:assert/strict';
import {
  parseProviderTimestamp,
  validateMarketCandles,
} from '../server/validation/marketDataValidator';
import { FinnhubProvider } from '../server/providers/FinnhubProvider';
import { MarketDataManager } from '../server/providers/MarketDataManager';
import { getAssetConfig, SUPPORTED_ASSETS } from '../server/config/assets';
import {
  mergeCandleUpdates,
  applyLiveQuoteToCandles,
} from '../src/utils/candleLifecycle';
import { generateSignalDecision } from '../src/signals/decisionEngine';
import { InstrumentConfig, MarketCandle, MarketPrice, RiskSettings, Timeframe } from '../src/types';

const TEST_RISK_SETTINGS: RiskSettings = {
  maxRiskPerTradePercent: 1.0,
  minRiskReward: 1.5,
  maxSimultaneousSignals: 4,
  maxDailySignals: 10,
  maxConsecutiveLosses: 3,
  maxDailyDrawdownPercent: 3.0,
  minConfidenceRequired: 60,
};

function makeSeries(
  symbol: string,
  timeframe: Timeframe,
  startMs: number,
  stepMs: number,
  count: number,
  basePrice: number,
  volatility: number,
  trendSlope: number
): MarketCandle[] {
  const out: MarketCandle[] = [];
  let prevClose = basePrice;
  for (let i = 0; i < count; i++) {
    const t = startMs + i * stepMs;
    const wave = Math.sin(i * 0.45) * volatility;
    const close = Number((prevClose + trendSlope + wave).toFixed(4));
    const open = prevClose;
    const high = Number((Math.max(open, close) + volatility * 0.6).toFixed(4));
    const low = Number((Math.min(open, close) - volatility * 0.6).toFixed(4));
    out.push({
      time: t,
      timestamp: t,
      datetime: new Date(t).toISOString(),
      open,
      high,
      low,
      close,
      volume: 100 + i * 3,
      symbol,
      timeframe,
      source: 'Test Feed',
    });
    prevClose = close;
  }
  return out;
}

async function runTests() {
  console.log('Running Market Sync, Gold (XAU/USD), and Trading Modes Test Suite...\n');

  // 1. Timestamp Parsing & Timezone Safety
  {
    const utcStr = parseProviderTimestamp('2026-11-27 09:30:00');
    assert.equal(utcStr, Date.parse('2026-11-27T09:30:00Z'), 'Bare timestamp string must parse strictly as UTC');

    const dateOnly = parseProviderTimestamp('2026-11-27');
    assert.equal(dateOnly, Date.parse('2026-11-27T00:00:00Z'), 'Date-only string must parse as UTC midnight');

    const explicitOffset = parseProviderTimestamp('2026-11-27T20:30:00+11:00');
    assert.equal(explicitOffset, Date.parse('2026-11-27T09:30:00Z'), 'Explicit offset must normalize to exact UTC epoch');

    const numericSec = parseProviderTimestamp(1795771800);
    assert.equal(numericSec, 1795771800 * 1000, 'Unix seconds must normalize to milliseconds');
    console.log('✓ 1. parseProviderTimestamp parses UTC and offsets deterministically without drift');
  }

  // 2. Market Candle Validator rejects +11h future-shifted candles and invalid OHLC
  {
    const now = Date.now();
    const rawValues = [
      {
        datetime: new Date(now - 30 * 60_000).toISOString(),
        open: '2650.00',
        high: '2654.20',
        low: '2649.10',
        close: '2653.40',
        volume: '120',
      },
      {
        datetime: new Date(now - 15 * 60_000).toISOString(),
        open: '2653.40',
        high: '2656.00',
        low: '2652.00',
        close: '2655.10',
        volume: '95',
      },
      // Timezone-shifted future bar (+11h ahead of UTC) -> MUST be rejected
      {
        datetime: new Date(now + 11 * 3600_000).toISOString(),
        open: '2655.10',
        high: '2657.00',
        low: '2654.00',
        close: '2656.50',
        volume: '80',
      },
      // Invalid geometry (high < low) -> MUST be rejected
      {
        datetime: new Date(now - 5 * 60_000).toISOString(),
        open: '2655.10',
        high: '2650.00',
        low: '2654.00',
        close: '2652.50',
        volume: '50',
      },
    ];

    const validation = validateMarketCandles(rawValues, 'XAU/USD', 'M15', 'COMMODITIES');
    assert.equal(validation.cleanCandles.length, 2, 'Validator must drop future-shifted and broken-OHLC bars');
    assert.ok(validation.cleanCandles[0].time < validation.cleanCandles[1].time, 'Candles must remain strictly ascending chronologically');
    console.log('✓ 2. validateMarketCandles rejects future-shifted timestamps & invalid OHLC on XAU/USD');
  }

  // 3. Finnhub Gold/Silver mapping & aligned H4 aggregation
  {
    const fh = new FinnhubProvider();
    const xauAsset = getAssetConfig('XAU/USD');
    const xagAsset = getAssetConfig('XAG/USD');
    assert.ok(xauAsset, 'XAU/USD must be registered in SUPPORTED_ASSETS');
    assert.ok(xagAsset, 'XAG/USD must be registered in SUPPORTED_ASSETS');

    const xauResolved = (fh as any).resolveFinnhubSymbol(xauAsset);
    const xagResolved = (fh as any).resolveFinnhubSymbol(xagAsset);
    assert.equal(xauResolved.symbol, 'OANDA:XAU_USD', 'Gold must map to spot OANDA:XAU_USD, never GLD ETF');
    assert.notEqual(xauResolved.symbol, 'GLD');
    assert.equal(xagResolved.symbol, 'OANDA:XAG_USD', 'Silver must map to spot OANDA:XAG_USD, never SLV ETF');
    assert.notEqual(xagResolved.symbol, 'SLV');

    // Test H4 alignment across 4-hour UTC boundaries (03:00 and 04:00 belong to 00:00 and 04:00 buckets!)
    const day0 = Date.UTC(2026, 10, 27, 0, 0, 0);
    const h1Bars: MarketCandle[] = [
      { time: day0 + 2 * 3600_000, open: 2650, high: 2652, low: 2649, close: 2651, volume: 10 },
      { time: day0 + 3 * 3600_000, open: 2651, high: 2655, low: 2650, close: 2654, volume: 15 },
      { time: day0 + 4 * 3600_000, open: 2654, high: 2660, low: 2653, close: 2659, volume: 20 },
      { time: day0 + 5 * 3600_000, open: 2659, high: 2662, low: 2658, close: 2661, volume: 25 },
    ];
    const h4Bars: MarketCandle[] = (fh as any).aggregateCandles(h1Bars, 4, 'H4', 'XAU/USD');
    assert.equal(h4Bars.length, 2, 'H4 aggregation must split cleanly across UTC 04:00 boundary');
    assert.equal(h4Bars[0].time, day0, 'First H4 bar must align to 00:00 UTC');
    assert.equal(h4Bars[0].open, 2650);
    assert.equal(h4Bars[0].high, 2655);
    assert.equal(h4Bars[0].close, 2654);
    assert.equal(h4Bars[1].time, day0 + 4 * 3600_000, 'Second H4 bar must align to 04:00 UTC');
    assert.equal(h4Bars[1].open, 2654);
    assert.equal(h4Bars[1].close, 2661);
    console.log('✓ 3. FinnhubProvider keeps XAU/XAG spot mapping & UTC-aligned H4 buckets');
  }

  // 4. Synchronizing Forming Candle & Deriving Data Sync States (Shared across Markets)
  {
    const mgr = new MarketDataManager();
    const tfMs = 15 * 60_000;
    const bucket0 = Date.UTC(2026, 10, 27, 9, 0, 0);
    const bucket1 = bucket0 + tfMs;

    const baseCandles: MarketCandle[] = [
      {
        time: bucket0,
        open: 2650,
        high: 2654,
        low: 2648,
        close: 2652,
        volume: 100,
        symbol: 'XAU/USD',
        timeframe: 'M15',
        source: 'Twelve Data',
      },
      {
        time: bucket1,
        open: 2652,
        high: 2653,
        low: 2651,
        close: 2652.5,
        volume: 40,
        symbol: 'XAU/USD',
        timeframe: 'M15',
        source: 'Twelve Data',
      },
    ];

    const liveQuoteSameBar: MarketPrice = {
      symbol: 'XAU/USD',
      displayName: 'Gold / US Dollar',
      assetClass: 'COMMODITIES',
      price: 2658.4,
      high24h: 2660,
      low24h: 2640,
      change24h: 8,
      changePercent24h: 0.3,
      timestamp: bucket1 + 120_000,
      lastUpdate: new Date(bucket1 + 120_000).toISOString(),
      marketStatus: 'OPEN',
      dataSource: 'Twelve Data',
      status: 'LIVE',
    };

    const syncedSame = mgr.synchronizeFormingCandle(baseCandles, liveQuoteSameBar, 'M15', bucket1 + 120_000);
    assert.equal(syncedSame.length, 2);
    assert.equal(syncedSame[0].close, 2652, 'Historical closed bar must remain immutable');
    assert.equal(syncedSame[1].close, 2658.4, 'Forming candle close must sync to live quote');
    assert.equal(syncedSame[1].high, 2658.4, 'Forming candle high must expand to live quote');
    assert.equal(syncedSame[1].low, 2651, 'Forming candle low must preserve lower bound');

    const stateLive = mgr.deriveDataSyncState(liveQuoteSameBar, syncedSame, 'M15', bucket1 + 130_000);
    assert.equal(stateLive, 'LIVE', 'Fresh open quote + active bar must yield LIVE state');

    // Immediate next bar roll while OPEN & LIVE
    const nextBarTime = bucket1 + tfMs + 5_000;
    const liveQuoteNextBar: MarketPrice = {
      ...liveQuoteSameBar,
      price: 2660.1,
      timestamp: nextBarTime,
      lastUpdate: new Date(nextBarTime).toISOString(),
    };
    const syncedRoll = mgr.synchronizeFormingCandle(syncedSame, liveQuoteNextBar, 'M15', nextBarTime);
    assert.equal(syncedRoll.length, 3, 'Immediate next bucket opens genuine forming bar anchored to last close');
    assert.equal(syncedRoll[2].time, bucket1 + tfMs);
    assert.equal(syncedRoll[2].open, 2658.4);
    assert.equal(syncedRoll[2].close, 2660.1);

    // Multi-bar gap MUST NOT fabricate intermediate synthetic candles
    const gapTime = bucket1 + tfMs * 4;
    const syncedGap = mgr.synchronizeFormingCandle(syncedSame, {
      ...liveQuoteSameBar,
      price: 2670,
      timestamp: gapTime,
    }, 'M15', gapTime);
    assert.equal(syncedGap.length, 2, 'Multi-bar gap must NEVER fabricate synthetic intermediate candles');

    // Stale / Weekend / Disconnected classification
    const stateDelayed = mgr.deriveDataSyncState(
      { ...liveQuoteSameBar, status: 'STALE' },
      syncedSame,
      'M15',
      bucket1 + 130_000
    );
    assert.equal(stateDelayed, 'DELAYED');

    const stateHistorical = mgr.deriveDataSyncState(
      { ...liveQuoteSameBar, marketStatus: 'WEEKEND' },
      syncedSame,
      'M15',
      bucket1 + 130_000
    );
    assert.equal(stateHistorical, 'HISTORICAL');

    const stateDisconnected = mgr.deriveDataSyncState(
      { ...liveQuoteSameBar, price: 0, status: 'UNAVAILABLE' },
      syncedSame,
      'M15',
      bucket1 + 130_000
    );
    assert.equal(stateDisconnected, 'DISCONNECTED');
    assert.equal(
      mgr.deriveDataSyncState(liveQuoteSameBar, [], 'M15', bucket1 + 130_000),
      'DISCONNECTED',
      'Empty candle set must report DISCONNECTED'
    );

    console.log('✓ 4. synchronizeFormingCandle & deriveDataSyncState accurately sync & classify states without fabrication');
  }

  // 5. Client-Side Cross-Timeframe Protection & Quote Forming Update
  {
    const nowBucket = Math.floor(Date.now() / 3600_000) * 3600_000;
    const t0 = nowBucket - 9 * 3600_000;
    const h1Candles = makeSeries('BTC/USD', 'H1', t0, 3600_000, 10, 95000, 200, 50);
    const m15Contaminated = makeSeries('BTC/USD', 'M15', nowBucket - 3600_000, 900_000, 4, 96000, 100, 10);

    const merged = mergeCandleUpdates(h1Candles, m15Contaminated, 'H1');
    assert.equal(merged.length, h1Candles.length, 'M15 updates must not contaminate active H1 chart series');

    const latestTime = h1Candles[h1Candles.length - 1].time;
    const updated = applyLiveQuoteToCandles(
      h1Candles,
      {
        price: 96500,
        timestamp: latestTime + 600_000,
        status: 'LIVE',
        marketStatus: 'OPEN',
      },
      'H1',
      latestTime + 600_000
    );
    assert.equal(updated[updated.length - 1].close, 96500, 'Live BTC tick must update active H1 candle close');
    assert.ok(updated[updated.length - 1].high >= 96500, 'Live BTC tick must update active H1 candle high');
    console.log('✓ 5. Client candleLifecycle prevents cross-timeframe leakage and syncs live forming ticks');
  }

  // 6. Gold (XAU/USD) Multi-Style Strategy Evaluation (SCALP / DAY / SWING) Preserves Risk Rules
  {
    const xauAsset = getAssetConfig('XAU/USD');
    assert.ok(xauAsset, 'SUPPORTED_ASSETS must include XAU/USD');
    assert.equal(xauAsset.assetClass, 'COMMODITIES');
    assert.equal(xauAsset.digits, 2);
    assert.equal(xauAsset.pipSize, 0.1);
    assert.ok(
      xauAsset.supportedTimeframes.includes('M5') &&
        xauAsset.supportedTimeframes.includes('M15') &&
        xauAsset.supportedTimeframes.includes('H1') &&
        xauAsset.supportedTimeframes.includes('H4') &&
        xauAsset.supportedTimeframes.includes('D1'),
      'XAU/USD must support all chart timeframes M5..D1'
    );

    const xauConfig: InstrumentConfig = {
      symbol: xauAsset.symbol,
      name: xauAsset.displayName,
      assetClass: xauAsset.assetClass,
      pipSize: xauAsset.pipSize,
      digits: xauAsset.digits,
      icon: xauAsset.icon,
      description: xauAsset.description,
    };

    const startMs = Date.UTC(2026, 10, 20, 0, 0, 0);
    const m5 = makeSeries('XAU/USD', 'M5', startMs, 5 * 60_000, 120, 2620, 1.5, 0.3);
    const m15 = makeSeries('XAU/USD', 'M15', startMs, 15 * 60_000, 120, 2620, 2.5, 0.5);
    const h1 = makeSeries('XAU/USD', 'H1', startMs, 60 * 60_000, 120, 2620, 4.0, 0.8);
    const h4 = makeSeries('XAU/USD', 'H4', startMs, 4 * 60 * 60_000, 120, 2600, 6.0, 1.2);
    const tfMap = { M5: m5, M15: m15, H1: h1, H4: h4 };

    const riskSnapshot = JSON.stringify(TEST_RISK_SETTINGS);

    const scalpSig = generateSignalDecision(xauConfig, 'SCALP', m5, m15, TEST_RISK_SETTINGS, undefined, tfMap);
    const daySig = generateSignalDecision(xauConfig, 'DAY', m15, h1, TEST_RISK_SETTINGS, undefined, tfMap);
    const swingSig = generateSignalDecision(xauConfig, 'SWING', h1, h4, TEST_RISK_SETTINGS, undefined, tfMap);

    assert.equal(scalpSig.tradeType, 'SCALP');
    assert.equal(daySig.tradeType, 'DAY');
    assert.equal(swingSig.tradeType, 'SWING');
    assert.equal(scalpSig.timeframeUsed.context, 'M15', 'SCALP mode must anchor higher-TF context on M15');
    assert.equal(scalpSig.timeframeUsed.entry, 'M5', 'SCALP mode must anchor entry timeframe on M5');
    assert.equal(daySig.timeframeUsed.context, 'H1', 'DAY mode must anchor higher-TF context on H1');
    assert.equal(daySig.timeframeUsed.entry, 'M15', 'DAY mode must anchor entry timeframe on M15');
    assert.equal(swingSig.timeframeUsed.context, 'H4', 'SWING mode must anchor higher-TF context on H4');
    assert.equal(swingSig.timeframeUsed.entry, 'H1', 'SWING mode must anchor entry timeframe on H1');
    assert.equal(JSON.stringify(TEST_RISK_SETTINGS), riskSnapshot, 'Strategy evaluation must NEVER mutate risk settings');

    console.log('✓ 6. Gold (XAU/USD) strategy engine evaluates SCALP, DAY, and SWING cleanly while preserving risk rules');
  }

  console.log('\nALL MARKET SYNC, GOLD, AND TRADING MODE TESTS PASSED.');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
