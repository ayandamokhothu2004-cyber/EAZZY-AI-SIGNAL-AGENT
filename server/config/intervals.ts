import { Timeframe, CandleState } from '../../src/types';

export const REFRESH_INTERVALS = {
  QUOTE_REFRESH_INTERVAL_MS: Number(process.env.QUOTE_REFRESH_INTERVAL_MS) || 5000,
  CANDLE_REFRESH_INTERVAL_MS: Number(process.env.CANDLE_REFRESH_INTERVAL_MS) || 15000,
  SCAN_INTERVAL_MS: Number(process.env.SCAN_INTERVAL_MS) || 30000,
  STALE_THRESHOLD_MS: Number(process.env.STALE_THRESHOLD_MS) || 60000,
  MAX_DATA_AGE_MS: Number(process.env.MAX_DATA_AGE_MS) || 120000,
};

export const TIMEFRAME_DURATIONS_MS: Record<Timeframe, number> = {
  M5: 5 * 60 * 1000,
  M15: 15 * 60 * 1000,
  H1: 60 * 60 * 1000,
  H4: 4 * 60 * 60 * 1000,
  D1: 24 * 60 * 60 * 1000,
};

/**
 * Determines whether a candle is FORMING or CLOSED based on its start timestamp and current time.
 */
export function getCandleState(
  candleTimestamp: number | undefined,
  timeframe: Timeframe,
  now: number = Date.now(),
  staleThresholdMs: number = REFRESH_INTERVALS.STALE_THRESHOLD_MS
): CandleState {
  if (!candleTimestamp || candleTimestamp <= 0) {
    return 'UNAVAILABLE';
  }

  const duration = TIMEFRAME_DURATIONS_MS[timeframe] || 15 * 60 * 1000;
  const candleCloseTime = candleTimestamp + duration;

  // If the candle close time is in the future, it is still FORMING
  if (now < candleCloseTime) {
    return 'FORMING';
  }

  // If candle closed recently (within reasonable delay + duration + stale threshold)
  const ageSinceClose = now - candleCloseTime;
  if (ageSinceClose > staleThresholdMs + duration) {
    return 'STALE';
  }

  return 'CLOSED';
}
