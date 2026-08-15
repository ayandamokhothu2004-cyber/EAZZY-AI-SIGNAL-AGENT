import { MarketCandle, IndicatorData, StrategyCondition } from '../types';

export function evaluateMomentumVolatility(
  candles: MarketCandle[],
  indicators: IndicatorData
): StrategyCondition {
  if (candles.length < 20) {
    return {
      id: 'momentum_volatility',
      name: 'Momentum & Volatility Filter',
      category: 'MOMENTUM',
      met: false,
      bias: 'NEUTRAL',
      score: 0,
      description: 'Insufficient candles for momentum divergence and volatility checks.',
    };
  }

  const rsi = indicators.rsi[indicators.rsi.length - 1] || 50;
  const macdHist = indicators.macd.histogram[indicators.macd.histogram.length - 1] || 0;
  const prevMacdHist = indicators.macd.histogram[indicators.macd.histogram.length - 2] || 0;
  const bbWidth = indicators.bollingerBands.bandwidth[indicators.bollingerBands.bandwidth.length - 1] || 0;
  const avgBBWidth = indicators.bollingerBands.bandwidth.slice(-15).reduce((a, b) => a + b, 0) / 15;

  const isExpanding = bbWidth > avgBBWidth * 1.1;

  // Bullish Momentum: RSI between 52 and 68 (not extreme overbought yet), MACD histogram increasing positively
  if (rsi >= 52 && rsi <= 72 && macdHist > 0 && macdHist >= prevMacdHist) {
    return {
      id: 'momentum_volatility',
      name: 'Momentum: Bullish Acceleration',
      category: 'MOMENTUM',
      met: true,
      bias: 'BULLISH',
      score: 14,
      description: `RSI is robust (${rsi.toFixed(1)}) and MACD histogram is expanding green (+${macdHist.toFixed(4)}). Volatility state: ${isExpanding ? 'Expanding' : 'Steady'}.`,
    };
  }

  // Bearish Momentum: RSI between 28 and 48 (not extreme oversold yet), MACD histogram decreasing negatively
  if (rsi <= 48 && rsi >= 28 && macdHist < 0 && macdHist <= prevMacdHist) {
    return {
      id: 'momentum_volatility',
      name: 'Momentum: Bearish Acceleration',
      category: 'MOMENTUM',
      met: true,
      bias: 'BEARISH',
      score: 14,
      description: `RSI is weak (${rsi.toFixed(1)}) and MACD histogram is accelerating red (${macdHist.toFixed(4)}). Volatility state: ${isExpanding ? 'Expanding' : 'Steady'}.`,
    };
  }

  // Extreme Oversold bounce condition
  if (rsi < 28 && macdHist > prevMacdHist) {
    return {
      id: 'momentum_volatility',
      name: 'Momentum: Oversold Divergence / Exhaustion',
      category: 'MOMENTUM',
      met: true,
      bias: 'BULLISH',
      score: 11,
      description: `RSI is deeply oversold (${rsi.toFixed(1)}) with MACD histogram beginning upward curl. Exhaustion setup.`,
    };
  }

  // Extreme Overbought rejection condition
  if (rsi > 75 && macdHist < prevMacdHist) {
    return {
      id: 'momentum_volatility',
      name: 'Momentum: Overbought Divergence / Exhaustion',
      category: 'MOMENTUM',
      met: true,
      bias: 'BEARISH',
      score: 11,
      description: `RSI is overstretched (${rsi.toFixed(1)}) with MACD histogram decelerating downward. Exhaustion setup.`,
    };
  }

  return {
    id: 'momentum_volatility',
    name: 'Momentum: Flat / Indecisive',
    category: 'MOMENTUM',
    met: false,
    bias: 'NEUTRAL',
    score: 0,
    description: `RSI is hovering near equilibrium (${rsi.toFixed(1)}). MACD histogram flat (${macdHist.toFixed(4)}).`,
  };
}
