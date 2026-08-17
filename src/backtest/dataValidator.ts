import { MarketCandle } from '../types';
import { DataQualityReport } from '../types/backtest';

/**
 * Pure function to validate a historical candlestick dataset before backtesting.
 * Enforces:
 * - Chronological ordering
 * - Deduplication of timestamps
 * - OHLC geometric validity (High >= Low, High >= Open, High >= Close, Low <= Open, Low <= Close)
 * - Non-zero & finite prices (no NaN or <= 0)
 * - Timestamp gap detection
 */
export function validateHistoricalDataset(
  rawCandles: MarketCandle[],
  timeframe: string
): {
  cleanCandles: MarketCandle[];
  report: DataQualityReport;
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!rawCandles || !Array.isArray(rawCandles) || rawCandles.length === 0) {
    return {
      cleanCandles: [],
      report: {
        isValid: false,
        totalCandles: 0,
        duplicateCount: 0,
        outOfOrderCount: 0,
        zeroOrNaNCandles: 0,
        invalidGeometryCount: 0,
        gapsDetected: 0,
        warnings: [],
        errors: ['HISTORICAL DATA UNAVAILABLE: Provided candle series is empty or undefined.'],
      },
    };
  }

  let duplicateCount = 0;
  let outOfOrderCount = 0;
  let zeroOrNaNCandles = 0;
  let invalidGeometryCount = 0;
  let gapsDetected = 0;

  // 1. Filter out NaN, zero, or non-finite values
  const validPriceCandles: MarketCandle[] = [];
  for (let i = 0; i < rawCandles.length; i++) {
    const c = rawCandles[i];
    const hasValidNumbers =
      typeof c.open === 'number' &&
      typeof c.high === 'number' &&
      typeof c.low === 'number' &&
      typeof c.close === 'number' &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.open > 0 &&
      c.high > 0 &&
      c.low > 0 &&
      c.close > 0;

    if (!hasValidNumbers) {
      zeroOrNaNCandles++;
      continue;
    }

    // Check geometry: High must be >= max(open, close, low), Low must be <= min(open, close, high)
    const trueHigh = Math.max(c.open, c.close, c.high);
    const trueLow = Math.min(c.open, c.close, c.low);

    const candleTime = c.time || c.timestamp || 0;
    const sanitizedCandle: MarketCandle = {
      ...c,
      time: candleTime,
      timestamp: candleTime,
      datetime: c.datetime || new Date(candleTime).toISOString(),
      high: trueHigh,
      low: trueLow,
    };

    if (c.high < trueHigh || c.low > trueLow || c.high < c.low) {
      invalidGeometryCount++;
      validPriceCandles.push(sanitizedCandle);
    } else {
      validPriceCandles.push(sanitizedCandle);
    }
  }

  if (validPriceCandles.length === 0) {
    return {
      cleanCandles: [],
      report: {
        isValid: false,
        totalCandles: rawCandles.length,
        duplicateCount: 0,
        outOfOrderCount: 0,
        zeroOrNaNCandles,
        invalidGeometryCount,
        gapsDetected: 0,
        warnings: [],
        errors: ['All candles in dataset contained invalid zero/NaN numbers.'],
      },
    };
  }

  // Helper for timestamp
  const getTs = (c: MarketCandle) => c.time || c.timestamp || 0;

  // 2. Check and sort chronological ordering
  const sorted = [...validPriceCandles].sort((a, b) => {
    return getTs(a) - getTs(b);
  });

  // Check if original was out of order
  for (let i = 1; i < validPriceCandles.length; i++) {
    if (getTs(validPriceCandles[i]) < getTs(validPriceCandles[i - 1])) {
      outOfOrderCount++;
    }
  }

  // 3. Deduplicate timestamps
  const cleanCandles: MarketCandle[] = [];
  const seenTimestamps = new Set<number>();

  for (const c of sorted) {
    const ts = getTs(c);
    if (seenTimestamps.has(ts)) {
      duplicateCount++;
      continue;
    }
    seenTimestamps.add(ts);
    cleanCandles.push(c);
  }

  // 4. Check for unexpected large gaps in time
  const expectedIntervalMs =
    timeframe === 'M5'
      ? 5 * 60 * 1000
      : timeframe === 'M15'
      ? 15 * 60 * 1000
      : timeframe === 'H1'
      ? 60 * 60 * 1000
      : timeframe === 'H4'
      ? 4 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

  for (let i = 1; i < cleanCandles.length; i++) {
    const diff = getTs(cleanCandles[i]) - getTs(cleanCandles[i - 1]);
    // Allow for weekends / session closes (diff up to 3 days), but flag if huge abnormal gaps
    if (diff > expectedIntervalMs * 4 && diff < 86400000 * 5) {
      gapsDetected++;
    }
  }

  if (outOfOrderCount > 0) {
    warnings.push(`Fixed ${outOfOrderCount} out-of-order candles by chronological timestamp sort.`);
  }
  if (duplicateCount > 0) {
    warnings.push(`Removed ${duplicateCount} duplicate timestamp candles.`);
  }
  if (zeroOrNaNCandles > 0) {
    warnings.push(`Discarded ${zeroOrNaNCandles} candles containing NaN or zero prices.`);
  }
  if (invalidGeometryCount > 0) {
    warnings.push(`Sanitized ${invalidGeometryCount} candles with geometric High/Low anomalies.`);
  }
  if (gapsDetected > 0) {
    warnings.push(`Identified ${gapsDetected} inter-session time gaps.`);
  }

  if (cleanCandles.length < 30) {
    errors.push(`Insufficient clean candles (${cleanCandles.length}). Minimum 30 required for multi-factor strategy evaluation.`);
  }

  return {
    cleanCandles,
    report: {
      isValid: errors.length === 0 && cleanCandles.length >= 30,
      totalCandles: cleanCandles.length,
      duplicateCount,
      outOfOrderCount,
      zeroOrNaNCandles,
      invalidGeometryCount,
      gapsDetected,
      warnings,
      errors,
    },
  };
}
