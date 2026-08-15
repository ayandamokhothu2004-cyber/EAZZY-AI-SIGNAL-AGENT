import { MarketCandle, IndicatorData, StrategyCondition, StrategyResult, Timeframe } from '../types';

/**
 * Breakout Strategy Analysis Engine
 * Detects range compression, volatility contraction, and subsequent breakout confirmation.
 */
export function analyzeBreakoutStrategy(
  candles: MarketCandle[],
  indicators: IndicatorData,
  timeframe: Timeframe = 'M15'
): StrategyResult {
  if (!candles || candles.length < 25) {
    return {
      strategyName: 'BREAKOUT',
      direction: 'NONE',
      valid: false,
      strength: 0,
      timeframe,
      reason: 'Insufficient candles for range breakout analysis.',
      conditions: [],
    };
  }

  const lookback = 20;
  const recentSlice = candles.slice(-lookback - 1, -1);
  const currentCandle = candles[candles.length - 1];
  const currentPrice = currentCandle.close;

  const highestHigh = Math.max(...recentSlice.map((c) => c.high));
  const lowestLow = Math.min(...recentSlice.map((c) => c.low));
  const range = highestHigh - lowestLow;

  const upperBB = indicators.bollingerBands.upper[indicators.bollingerBands.upper.length - 1] || highestHigh;
  const lowerBB = indicators.bollingerBands.lower[indicators.bollingerBands.lower.length - 1] || lowestLow;

  const bbWidths = indicators.bollingerBands.bandwidth;
  const lastBBWidth = bbWidths[bbWidths.length - 1] || 0;
  const avgBBWidth = bbWidths.length >= 10
    ? bbWidths.slice(-10).reduce((a, b) => a + b, 0) / 10
    : lastBBWidth;

  const isBBExpanding = lastBBWidth > avgBBWidth * 1.15;

  // Bullish Breakout: Candle closes above 20-period highest high or upper BB with expanding volatility
  const isBullishRangeBreak = currentCandle.close > highestHigh && currentCandle.close > currentCandle.open;
  const isUpperBBBreak = currentCandle.close > upperBB;

  if (isBullishRangeBreak || (isUpperBBBreak && isBBExpanding)) {
    const strength = isBullishRangeBreak && isBBExpanding ? 85 : 70;
    return {
      strategyName: 'BREAKOUT',
      direction: 'BUY',
      valid: true,
      strength,
      timeframe,
      reason: `Bullish Breakout: Price closed above 20-period resistance (${highestHigh.toFixed(4)}) with strong candle expansion.`,
      conditions: [
        `Closed above 20-period range high (${highestHigh.toFixed(4)})`,
        `Volatility expansion confirmed (Bandwidth: ${lastBBWidth.toFixed(4)})`,
        `Bullish candle body close near high`,
      ],
      entryZone: { low: highestHigh * 0.999, high: currentPrice * 1.001 },
      invalidationLevel: highestHigh - range * 0.35,
    };
  }

  // Bearish Breakout: Candle closes below 20-period lowest low or lower BB with expanding volatility
  const isBearishRangeBreak = currentCandle.close < lowestLow && currentCandle.close < currentCandle.open;
  const isLowerBBBreak = currentCandle.close < lowerBB;

  if (isBearishRangeBreak || (isLowerBBBreak && isBBExpanding)) {
    const strength = isBearishRangeBreak && isBBExpanding ? 85 : 70;
    return {
      strategyName: 'BREAKOUT',
      direction: 'SELL',
      valid: true,
      strength,
      timeframe,
      reason: `Bearish Breakdown: Price closed below 20-period support (${lowestLow.toFixed(4)}) with strong candle expansion.`,
      conditions: [
        `Closed below 20-period range low (${lowestLow.toFixed(4)})`,
        `Volatility expansion confirmed (Bandwidth: ${lastBBWidth.toFixed(4)})`,
        `Bearish candle body close near low`,
      ],
      entryZone: { low: currentPrice * 0.999, high: lowestLow * 1.001 },
      invalidationLevel: lowestLow + range * 0.35,
    };
  }

  return {
    strategyName: 'BREAKOUT',
    direction: 'NONE',
    valid: false,
    strength: 0,
    timeframe,
    reason: `Price remains within 20-period range [${lowestLow.toFixed(4)} - ${highestHigh.toFixed(4)}]. No breakout confirmed.`,
    conditions: [],
  };
}

export function evaluateBreakout(
  candles: MarketCandle[],
  indicators: IndicatorData
): StrategyCondition {
  const result = analyzeBreakoutStrategy(candles, indicators);

  if (result.valid && result.direction === 'BUY') {
    return {
      id: 'breakout_analysis',
      name: 'Breakout: Bullish Volatility Expansion',
      category: 'BREAKOUT',
      met: true,
      bias: 'BULLISH',
      score: 15,
      description: result.reason,
    };
  }

  if (result.valid && result.direction === 'SELL') {
    return {
      id: 'breakout_analysis',
      name: 'Breakout: Bearish Volatility Expansion',
      category: 'BREAKOUT',
      met: true,
      bias: 'BEARISH',
      score: 15,
      description: result.reason,
    };
  }

  return {
    id: 'breakout_analysis',
    name: 'Breakout Analysis: In-Range',
    category: 'BREAKOUT',
    met: false,
    bias: 'NEUTRAL',
    score: 0,
    description: result.reason,
  };
}

