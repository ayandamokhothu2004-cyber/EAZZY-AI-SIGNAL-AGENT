import { MarketCandle, IndicatorData, StrategyCondition, StrategyResult, Timeframe } from '../types';

/**
 * Pullback / Retracement Strategy Analysis Engine
 * Detects an established directional move followed by an orderly pullback to a key value zone (Fib 50-61.8% / EMA ribbon)
 * with momentum cooling and continuation confirmation.
 */
export function analyzePullbackStrategy(
  candles: MarketCandle[],
  indicators: IndicatorData,
  timeframe: Timeframe = 'M15'
): StrategyResult {
  if (!candles || candles.length < 30) {
    return {
      strategyName: 'PULLBACK',
      direction: 'NONE',
      valid: false,
      strength: 0,
      timeframe,
      reason: 'Insufficient candles for pullback zone evaluation.',
      conditions: [],
    };
  }

  const currentCandle = candles[candles.length - 1];
  const currentPrice = currentCandle.close;
  const ema20 = indicators.ema20[indicators.ema20.length - 1] || currentPrice;
  const ema50 = indicators.ema50[indicators.ema50.length - 1] || currentPrice;
  const rsi = indicators.rsi[indicators.rsi.length - 1] || 50;

  // Look for swing points over last 30 candles
  const lookback = Math.min(30, candles.length);
  const slice = candles.slice(-lookback);
  const highest = Math.max(...slice.map((c) => c.high));
  const lowest = Math.min(...slice.map((c) => c.low));
  const range = highest - lowest;

  if (range <= 0) {
    return {
      strategyName: 'PULLBACK',
      direction: 'NONE',
      valid: false,
      strength: 0,
      timeframe,
      reason: 'Flat range with zero volatility.',
      conditions: [],
    };
  }

  // Bullish Pullback: Uptrend (EMA20 > EMA50) retracing into 50-61.8% Fib or testing EMA20/50 support with cooling RSI
  const fib50 = highest - range * 0.5;
  const fib618 = highest - range * 0.618;
  const isNearFibBullish = currentPrice >= fib618 * 0.998 && currentPrice <= fib50 * 1.003;
  const isNearEmaBullish = Math.abs(currentCandle.low - ema20) / ema20 < 0.002 || (currentCandle.low <= ema20 && currentPrice >= ema20 * 0.998);
  const isBullRejection = currentCandle.close > currentCandle.open || (currentCandle.high - currentCandle.close) < (currentCandle.close - currentCandle.low);

  if (ema20 > ema50 && (isNearFibBullish || isNearEmaBullish) && rsi >= 38 && rsi <= 58 && isBullRejection) {
    const strength = isNearFibBullish && isNearEmaBullish ? 88 : 75;
    return {
      strategyName: 'PULLBACK',
      direction: 'BUY',
      valid: true,
      strength,
      timeframe,
      reason: `Bullish Pullback: Price retraced into high-confluence value zone (EMA20 at ${ema20.toFixed(4)} / Fib 50-61.8%) with RSI reset to ${rsi.toFixed(1)}.`,
      conditions: [
        `Uptrend verified (EMA 20 > EMA 50)`,
        `Tested dynamic support / Fibonacci zone [${fib618.toFixed(4)} - ${fib50.toFixed(4)}]`,
        `RSI cooled down (${rsi.toFixed(1)}) without breakdown`,
        `Bullish reaction candle confirmed`,
      ],
      entryZone: { low: Math.min(fib618, ema20), high: currentPrice },
      invalidationLevel: Math.min(lowest, fib618 - range * 0.1),
    };
  }

  // Bearish Pullback: Downtrend (EMA20 < EMA50) retracing upward into 50-61.8% Fib or testing EMA20/50 resistance with resetting RSI
  const fib50Bear = lowest + range * 0.5;
  const fib618Bear = lowest + range * 0.618;
  const isNearFibBearish = currentPrice <= fib618Bear * 1.002 && currentPrice >= fib50Bear * 0.997;
  const isNearEmaBearish = Math.abs(currentCandle.high - ema20) / ema20 < 0.002 || (currentCandle.high >= ema20 && currentPrice <= ema20 * 1.002);
  const isBearRejection = currentCandle.close < currentCandle.open || (currentCandle.close - currentCandle.low) < (currentCandle.high - currentCandle.close);

  if (ema20 < ema50 && (isNearFibBearish || isNearEmaBearish) && rsi >= 42 && rsi <= 62 && isBearRejection) {
    const strength = isNearFibBearish && isNearEmaBearish ? 88 : 75;
    return {
      strategyName: 'PULLBACK',
      direction: 'SELL',
      valid: true,
      strength,
      timeframe,
      reason: `Bearish Pullback: Price retraced into dynamic resistance zone (EMA20 at ${ema20.toFixed(4)} / Fib 50-61.8%) with RSI reset to ${rsi.toFixed(1)}.`,
      conditions: [
        `Downtrend verified (EMA 20 < EMA 50)`,
        `Tested dynamic supply / Fibonacci zone [${fib50Bear.toFixed(4)} - ${fib618Bear.toFixed(4)}]`,
        `RSI reset to neutral (${rsi.toFixed(1)}) without upside breach`,
        `Bearish rejection candle confirmed`,
      ],
      entryZone: { low: currentPrice, high: Math.max(fib618Bear, ema20) },
      invalidationLevel: Math.max(highest, fib618Bear + range * 0.1),
    };
  }

  return {
    strategyName: 'PULLBACK',
    direction: 'NONE',
    valid: false,
    strength: 0,
    timeframe,
    reason: 'Price is not currently retesting any major dynamic EMA or Fibonacci retracement zone.',
    conditions: [],
  };
}

export function evaluatePullback(
  candles: MarketCandle[],
  indicators: IndicatorData
): StrategyCondition {
  const result = analyzePullbackStrategy(candles, indicators);

  if (result.valid && result.direction === 'BUY') {
    return {
      id: 'pullback_analysis',
      name: 'Pullback: Healthy Uptrend Retracement',
      category: 'PULLBACK',
      met: true,
      bias: 'BULLISH',
      score: 16,
      description: result.reason,
    };
  }

  if (result.valid && result.direction === 'SELL') {
    return {
      id: 'pullback_analysis',
      name: 'Pullback: Healthy Downtrend Retracement',
      category: 'PULLBACK',
      met: true,
      bias: 'BEARISH',
      score: 16,
      description: result.reason,
    };
  }

  return {
    id: 'pullback_analysis',
    name: 'Pullback Analysis: No Value Zone Test',
    category: 'PULLBACK',
    met: false,
    bias: 'NEUTRAL',
    score: 0,
    description: result.reason,
  };
}

