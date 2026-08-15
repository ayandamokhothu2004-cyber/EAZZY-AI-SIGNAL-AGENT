import { MarketCandle, IndicatorData, MarketRegime, MarketRegimeType } from '../types';

/**
 * Calculates Market Regime based on:
 * - Price structure (higher highs/lows vs ranging)
 * - Moving average slope and cascade alignment (EMA 20, 50, 200)
 * - Volatility metrics (ATR percent of price, Bollinger Bandwidth)
 * - Momentum (RSI, MACD)
 * - Range compression vs expansion
 */
export function detectMarketRegime(
  candles: MarketCandle[],
  indicators: IndicatorData
): MarketRegime {
  if (!candles || candles.length < 20) {
    return {
      regime: 'UNCLEAR',
      confidence: 30,
      description: 'Insufficient historical candle data to calculate market regime accurately.',
      primaryCharacteristic: 'Insufficient Data',
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const lastEma20 = indicators.ema20[indicators.ema20.length - 1] || currentPrice;
  const lastEma50 = indicators.ema50[indicators.ema50.length - 1] || currentPrice;
  const lastEma200 = indicators.ema200[indicators.ema200.length - 1] || currentPrice;
  const lastAtr = indicators.atr[indicators.atr.length - 1] || 0;
  const lastRsi = indicators.rsi[indicators.rsi.length - 1] || 50;

  // Slope of EMA 20 over last 5 candles
  const ema20Slice = indicators.ema20.slice(-6);
  const ema20Slope = ema20Slice.length >= 6
    ? ((ema20Slice[ema20Slice.length - 1] - ema20Slice[0]) / ema20Slice[0]) / 5 * 100
    : 0;

  // ATR as % of current price
  const atrPercent = currentPrice > 0 ? (lastAtr / currentPrice) * 100 : 0;

  // 20-period range width as % of price
  const lookback = Math.min(20, candles.length);
  const recentSlice = candles.slice(-lookback);
  const highest = Math.max(...recentSlice.map((c) => c.high));
  const lowest = Math.min(...recentSlice.map((c) => c.low));
  const rangeWidthPercent = currentPrice > 0 ? ((highest - lowest) / currentPrice) * 100 : 0;

  // Bollinger Bandwidth expansion check
  const bbWidths = indicators.bollingerBands.bandwidth;
  const lastBBWidth = bbWidths[bbWidths.length - 1] || 0;
  const avgBBWidth = bbWidths.length >= 10
    ? bbWidths.slice(-10).reduce((a, b) => a + b, 0) / 10
    : lastBBWidth;

  const isBBExpanding = lastBBWidth > avgBBWidth * 1.35;
  const isBBSqueezing = lastBBWidth < avgBBWidth * 0.75;

  // Moving average alignment checks
  const isBullStack = currentPrice > lastEma20 && lastEma20 > lastEma50 && lastEma50 > lastEma200;
  const isBearStack = currentPrice < lastEma20 && lastEma20 < lastEma50 && lastEma50 < lastEma200;
  const isEmaTangled = Math.abs(lastEma20 - lastEma50) / lastEma50 < 0.0015;

  // Breakout detection
  const prevClose = candles[candles.length - 2]?.close || currentPrice;
  const isRecentBullBreakout = currentPrice > highest * 0.9995 && isBBExpanding && currentPrice > prevClose;
  const isRecentBearBreakout = currentPrice < lowest * 1.0005 && isBBExpanding && currentPrice < prevClose;

  let regime: MarketRegimeType = 'RANGING';
  let confidence = 65;
  let description = '';
  let primaryCharacteristic = '';

  // 1. Extreme / High Volatility Check
  if (atrPercent > 2.5 || lastBBWidth > avgBBWidth * 2.0) {
    regime = 'HIGH_VOLATILITY';
    confidence = 85;
    primaryCharacteristic = 'Extreme Range Expansion';
    description = `High volatility conditions with ATR at ${atrPercent.toFixed(2)}% of asset price and rapid spread expansion.`;
  } else if (isRecentBullBreakout) {
    regime = 'BREAKOUT';
    confidence = 88;
    primaryCharacteristic = 'Bullish Volatility Expansion';
    description = `Bullish breakout in progress. Price expanded beyond 20-period high (${highest.toFixed(4)}) with surge in volatility.`;
  } else if (isRecentBearBreakout) {
    regime = 'BREAKOUT';
    confidence = 88;
    primaryCharacteristic = 'Bearish Volatility Expansion';
    description = `Bearish breakdown in progress. Price pierced 20-period low (${lowest.toFixed(4)}) with surge in volatility.`;
  } else if (isBullStack && ema20Slope > 0.03 && lastRsi >= 50) {
    regime = 'TRENDING_BULLISH';
    confidence = Math.min(95, 70 + Math.round(Math.abs(ema20Slope) * 200));
    primaryCharacteristic = 'Bullish Directional Order Flow';
    description = `Sustained bullish trend. Strong positive EMA cascade (Price > EMA20 > EMA50 > EMA200) with ascending slope (+${ema20Slope.toFixed(3)}%/bar).`;
  } else if (isBearStack && ema20Slope < -0.03 && lastRsi <= 50) {
    regime = 'TRENDING_BEARISH';
    confidence = Math.min(95, 70 + Math.round(Math.abs(ema20Slope) * 200));
    primaryCharacteristic = 'Bearish Directional Order Flow';
    description = `Sustained bearish trend. Strong negative EMA cascade (Price < EMA20 < EMA50 < EMA200) with descending slope (${ema20Slope.toFixed(3)}%/bar).`;
  } else if (isBBSqueezing || (isEmaTangled && atrPercent < 0.35)) {
    regime = 'LOW_VOLATILITY';
    confidence = 80;
    primaryCharacteristic = 'Tight Volatility Compression';
    description = `Low volatility compression. Bollinger Bands are tightly squeezed (${lastBBWidth.toFixed(4)}), indicating imminent energy build-up.`;
  } else if (isEmaTangled || Math.abs(ema20Slope) < 0.015) {
    regime = 'RANGING';
    confidence = 75;
    primaryCharacteristic = 'Mean-Reverting Oscillation';
    description = `Consolidating within a ${rangeWidthPercent.toFixed(2)}% range [${lowest.toFixed(4)} - ${highest.toFixed(4)}]. Moving averages are flat and intertwined.`;
  } else {
    regime = 'UNCLEAR';
    confidence = 50;
    primaryCharacteristic = 'Mixed Technical Signals';
    description = 'Mixed signals without decisive momentum or clear directional structure.';
  }

  return {
    regime,
    confidence,
    description,
    adxOrTrendSlope: Number(ema20Slope.toFixed(4)),
    atrPercent: Number(atrPercent.toFixed(3)),
    rangeWidthPercent: Number(rangeWidthPercent.toFixed(3)),
    primaryCharacteristic,
  };
}
