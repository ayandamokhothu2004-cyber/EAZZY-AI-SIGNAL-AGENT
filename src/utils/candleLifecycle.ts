import { MarketCandle, Timeframe } from '../types';

/**
 * Milliseconds per standard timeframe interval
 */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  M5: 5 * 60 * 1000,
  M15: 15 * 60 * 1000,
  H1: 60 * 60 * 1000,
  H4: 4 * 60 * 60 * 1000,
  D1: 24 * 60 * 60 * 1000,
};

/**
 * Formats millisecond duration into clean MM:SS or HH:MM:SS countdown string
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Computes the exact timestamp when the current forming candle will close.
 * Synchronized to timeframe boundaries and/or candle start timestamp.
 */
export function getCandleCloseTimestamp(
  timeframe: Timeframe,
  lastCandleTime?: number,
  syncTime: number = Date.now()
): number {
  const tfMs = TIMEFRAME_MS[timeframe] || TIMEFRAME_MS.M15;

  if (lastCandleTime && lastCandleTime > 0) {
    // If the latest candle's timestamp is known:
    // If syncTime is still within that candle's period:
    const candlePeriodEnd = lastCandleTime + tfMs;
    if (syncTime < candlePeriodEnd) {
      return candlePeriodEnd;
    }
  }

  // Fallback: standard wall-clock interval alignment
  const currentPeriodStart = Math.floor(syncTime / tfMs) * tfMs;
  return currentPeriodStart + tfMs;
}

/**
 * Computes live countdown metrics for the active forming candle
 */
export function getCandleCountdown(
  timeframe: Timeframe,
  lastCandleTime?: number,
  syncTime: number = Date.now()
): {
  remainingMs: number;
  formatted: string;
  isClosed: boolean;
  percentElapsed: number;
} {
  const tfMs = TIMEFRAME_MS[timeframe] || TIMEFRAME_MS.M15;
  const closeTime = getCandleCloseTimestamp(timeframe, lastCandleTime, syncTime);
  const remainingMs = Math.max(0, closeTime - syncTime);
  const isClosed = remainingMs <= 0;
  const percentElapsed = Math.min(100, Math.max(0, ((tfMs - remainingMs) / tfMs) * 100));

  return {
    remainingMs,
    formatted: formatCountdown(remainingMs),
    isClosed,
    percentElapsed,
  };
}

/**
 * Validates candle OHLC geometry and timestamp integrity
 */
export function validateCandle(
  candle: MarketCandle,
  maxAllowedFutureTime: number = Date.now() + 60_000
): boolean {
  if (!candle || typeof candle.time !== 'number' || candle.time <= 0) return false;
  if (candle.time > maxAllowedFutureTime) return false;

  const { open, high, low, close } = candle;
  if (typeof open !== 'number' || typeof high !== 'number' || typeof low !== 'number' || typeof close !== 'number') {
    return false;
  }
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return false;

  // OHLC geometry invariants
  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return false;
  }

  return true;
}

/**
 * Merges incoming candles with existing candles safely:
 * - Deduplicates by timestamp
 * - Validates OHLC integrity
 * - Updates the forming candle in-place
 * - Appends new closed candles chronologically
 * - Prevents future timestamp contamination
 */
export function mergeCandleUpdates(
  existing: MarketCandle[],
  incoming: MarketCandle[],
  timeframe: Timeframe,
  syncTime: number = Date.now()
): MarketCandle[] {
  const candleMap = new Map<number, MarketCandle>();

  // 1. Ingest existing valid candles
  for (const c of existing) {
    if (validateCandle(c, syncTime + 60_000)) {
      candleMap.set(c.time, { ...c });
    }
  }

  // 2. Ingest incoming valid candles
  for (const c of incoming) {
    if (validateCandle(c, syncTime + 60_000)) {
      candleMap.set(c.time, { ...c });
    }
  }

  // 3. Sort strictly in ascending chronological order
  const sorted = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

  // 4. Return valid series (clamped to max 500 candles for performance)
  return sorted.slice(-500);
}
