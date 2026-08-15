import { MarketCandle, Timeframe, AssetClass } from '../../src/types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  cleanCandles: MarketCandle[];
  stalenessLevel: 'FRESH' | 'STALE' | 'OFFLINE';
}

/**
 * Validates candle geometry, time ordering, and value sanity.
 */
export function validateMarketCandles(
  rawCandles: any[],
  symbol: string,
  timeframe: Timeframe,
  assetClass: AssetClass = 'FOREX'
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
    return {
      isValid: false,
      errors: [`Empty or non-array candle response received for ${symbol} on ${timeframe}`],
      warnings: [],
      cleanCandles: [],
      stalenessLevel: 'OFFLINE',
    };
  }

  const now = Date.now();
  const seenTimestamps = new Set<number>();
  const parsedCandles: MarketCandle[] = [];

  for (let i = 0; i < rawCandles.length; i++) {
    const c = rawCandles[i];

    // Check required properties
    if (c === null || typeof c !== 'object') {
      errors.push(`Candle at index ${i} is null or not an object`);
      continue;
    }

    let time: number;
    if (typeof c.time === 'number') {
      time = c.time;
    } else if (typeof c.timestamp === 'number') {
      time = c.timestamp > 1e11 ? c.timestamp : c.timestamp * 1000;
    } else {
      const dtStr = String(c.datetime || c.date || c.time || '');
      const isoStr = dtStr.includes('T') || dtStr.endsWith('Z') ? dtStr : dtStr.replace(' ', 'T') + 'Z';
      time = new Date(isoStr).getTime();
      if (!Number.isFinite(time)) {
        time = new Date(dtStr).getTime();
      }
    }
    const open = parseFloat(c.open);
    const high = parseFloat(c.high);
    const low = parseFloat(c.low);
    const close = parseFloat(c.close);
    const volume = typeof c.volume !== 'undefined' ? parseFloat(c.volume) || 0 : 0;

    // Check for NaN or non-finite
    if (!Number.isFinite(time) || time <= 0) {
      errors.push(`Invalid timestamp at index ${i}: ${c.time || c.datetime}`);
      continue;
    }
    if (!Number.isFinite(open) || open <= 0) {
      errors.push(`Invalid open price at index ${i}: ${c.open}`);
      continue;
    }
    if (!Number.isFinite(high) || high <= 0) {
      errors.push(`Invalid high price at index ${i}: ${c.high}`);
      continue;
    }
    if (!Number.isFinite(low) || low <= 0) {
      errors.push(`Invalid low price at index ${i}: ${c.low}`);
      continue;
    }
    if (!Number.isFinite(close) || close <= 0) {
      errors.push(`Invalid close price at index ${i}: ${c.close}`);
      continue;
    }

    // Future timestamp check (allowing exchange timezone offset up to 24 hours)
    if (time > now + 24 * 3600 * 1000) {
      errors.push(`Future timestamp detected at index ${i}: ${new Date(time).toISOString()}`);
      continue;
    }

    // Geometry validation
    if (high < low) {
      errors.push(`High (${high}) is less than Low (${low}) at index ${i}`);
      continue;
    }
    if (high < Math.max(open, close) - 1e-7) {
      warnings.push(`High (${high}) is slightly lower than open/close at index ${i}, normalizing.`);
    }
    if (low > Math.min(open, close) + 1e-7) {
      warnings.push(`Low (${low}) is slightly higher than open/close at index ${i}, normalizing.`);
    }

    // Duplicate timestamp check
    if (seenTimestamps.has(time)) {
      warnings.push(`Duplicate candle timestamp ${time} filtered out.`);
      continue;
    }
    seenTimestamps.add(time);

    const safeHigh = Math.max(high, open, close);
    const safeLow = Math.min(low, open, close);

    parsedCandles.push({
      time,
      open,
      high: safeHigh,
      low: safeLow,
      close,
      volume,
      symbol,
      timeframe,
      source: c.source || 'Twelve Data',
    });
  }

  if (parsedCandles.length < 1) {
    errors.push(`Insufficient valid candles after validation (parsed: ${parsedCandles.length}, required min: 1)`);
    return {
      isValid: false,
      errors,
      warnings,
      cleanCandles: [],
      stalenessLevel: 'OFFLINE',
    };
  }

  // Sort ascending by time (chronological order)
  parsedCandles.sort((a, b) => a.time - b.time);

  // Check staleness of latest candle
  const latestCandle = parsedCandles[parsedCandles.length - 1];
  const ageMs = now - latestCandle.time;

  let stalenessLevel: 'FRESH' | 'STALE' | 'OFFLINE' = 'FRESH';
  const maxFreshAgeMs =
    timeframe === 'M5'
      ? 15 * 60 * 1000
      : timeframe === 'M15'
      ? 45 * 60 * 1000
      : timeframe === 'H1'
      ? 3 * 3600 * 1000
      : timeframe === 'H4'
      ? 12 * 3600 * 1000
      : 48 * 3600 * 1000;

  // Crypto trades 24/7, so stale threshold is strict. Forex can be closed on weekends.
  if (assetClass === 'CRYPTO') {
    if (ageMs > maxFreshAgeMs) {
      stalenessLevel = 'STALE';
    }
  } else {
    // If weekend, staleness is expected
    const day = new Date().getUTCDay();
    const isWeekend = day === 6 || day === 0;
    if (ageMs > maxFreshAgeMs && !isWeekend) {
      stalenessLevel = 'STALE';
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    cleanCandles: parsedCandles,
    stalenessLevel,
  };
}

/**
 * Validates a single market price quote
 */
export function validateMarketPrice(
  quote: any,
  symbol: string,
  assetClass: AssetClass = 'FOREX'
): { isValid: boolean; error?: string } {
  if (!quote || typeof quote !== 'object') {
    return { isValid: false, error: `Null or invalid quote object for ${symbol}` };
  }

  const price = typeof quote.price === 'number' ? quote.price : parseFloat(quote.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { isValid: false, error: `Invalid non-positive price for ${symbol}: ${quote.price}` };
  }

  return { isValid: true };
}
