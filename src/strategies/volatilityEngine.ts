import { MarketCandle, IndicatorData, VolatilityLevel } from '../types';

export interface VolatilityAnalysisResult {
  level: VolatilityLevel;
  atrValue: number;
  atrPercent: number;
  bollingerBandwidth: number;
  isExpanding: boolean;
  isCompressing: boolean;
  isTradeSuitable: boolean;
  stopLossMultiplier: number;
  reason: string;
}

/**
 * Volatility Engine calculates whether market volatility is suitable for disciplined trading,
 * and dynamically adjusts required stop distances and target multipliers.
 */
export function analyzeVolatility(
  candles: MarketCandle[],
  indicators: IndicatorData
): VolatilityAnalysisResult {
  if (!candles || candles.length < 15) {
    return {
      level: 'NORMAL',
      atrValue: 0,
      atrPercent: 0,
      bollingerBandwidth: 0,
      isExpanding: false,
      isCompressing: false,
      isTradeSuitable: true,
      stopLossMultiplier: 1.0,
      reason: 'Insufficient data for volatility analysis; standard baseline applied.',
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const atrs = indicators.atr;
  const lastAtr = atrs[atrs.length - 1] || currentPrice * 0.002;
  const avgAtr = atrs.length >= 14
    ? atrs.slice(-14).reduce((a, b) => a + b, 0) / 14
    : lastAtr;

  const atrRatio = avgAtr > 0 ? lastAtr / avgAtr : 1.0;
  const atrPercent = currentPrice > 0 ? (lastAtr / currentPrice) * 100 : 0;

  const bbWidths = indicators.bollingerBands.bandwidth;
  const lastBBWidth = bbWidths[bbWidths.length - 1] || 0;
  const avgBBWidth = bbWidths.length >= 10
    ? bbWidths.slice(-10).reduce((a, b) => a + b, 0) / 10
    : lastBBWidth;

  const isExpanding = lastBBWidth > avgBBWidth * 1.25 || atrRatio > 1.3;
  const isCompressing = lastBBWidth < avgBBWidth * 0.8 && atrRatio < 0.8;

  let level: VolatilityLevel = 'NORMAL';
  let isTradeSuitable = true;
  let stopLossMultiplier = 1.0;
  let reason = '';

  if (atrRatio > 2.8 || atrPercent > 3.0) {
    level = 'EXTREME';
    isTradeSuitable = false; // Extreme instability / dangerous whipsaws
    stopLossMultiplier = 2.0;
    reason = `Extreme volatility detected (ATR is ${(atrRatio * 100).toFixed(0)}% of 14-period average). High risk of slippage or erratic gap.`;
  } else if (atrRatio > 1.6 || atrPercent > 1.8) {
    level = 'HIGH';
    isTradeSuitable = true;
    stopLossMultiplier = 1.4;
    reason = `Elevated volatility (ATR ratio ${atrRatio.toFixed(2)}x). Wider stop loss buffers required.`;
  } else if (atrRatio < 0.6 || (isCompressing && atrPercent < 0.25)) {
    level = 'LOW';
    isTradeSuitable = true;
    stopLossMultiplier = 0.9;
    reason = `Low volatility compression (ATR ratio ${atrRatio.toFixed(2)}x). Potential explosive breakout pending.`;
  } else {
    level = 'NORMAL';
    isTradeSuitable = true;
    stopLossMultiplier = 1.0;
    reason = `Healthy, normal volatility regime (ATR ${lastAtr.toFixed(4)}, ${atrPercent.toFixed(2)}% of price).`;
  }

  return {
    level,
    atrValue: Number(lastAtr.toFixed(5)),
    atrPercent: Number(atrPercent.toFixed(3)),
    bollingerBandwidth: Number(lastBBWidth.toFixed(5)),
    isExpanding,
    isCompressing,
    isTradeSuitable,
    stopLossMultiplier,
    reason,
  };
}
