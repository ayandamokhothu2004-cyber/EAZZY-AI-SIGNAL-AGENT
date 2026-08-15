import { MarketCandle, IndicatorData, MarketBias } from '../types';

export interface MomentumAnalysisResult {
  bias: MarketBias;
  strength: number; // 0-100
  rsi: number;
  macdHistogram: number;
  macdVelocity: number; // change in histogram
  rateOfChange: number; // 5-period ROC %
  isOverbought: boolean;
  isOversold: boolean;
  description: string;
}

/**
 * Momentum Engine evaluates RSI, MACD histogram, and 5-period ROC
 * to provide a measurable momentum bias and strength (0-100).
 */
export function analyzeMomentum(
  candles: MarketCandle[],
  indicators: IndicatorData
): MomentumAnalysisResult {
  if (!candles || candles.length < 15) {
    return {
      bias: 'NEUTRAL',
      strength: 0,
      rsi: 50,
      macdHistogram: 0,
      macdVelocity: 0,
      rateOfChange: 0,
      isOverbought: false,
      isOversold: false,
      description: 'Insufficient candles to compute momentum indicators.',
    };
  }

  const rsis = indicators.rsi;
  const lastRsi = rsis[rsis.length - 1] || 50;

  const hists = indicators.macd.histogram;
  const lastHist = hists[hists.length - 1] || 0;
  const prevHist = hists[hists.length - 2] || 0;
  const macdVelocity = lastHist - prevHist;

  // 5-period Rate of Change
  const currentPrice = candles[candles.length - 1].close;
  const price5BarsAgo = candles.length >= 6 ? candles[candles.length - 6].close : currentPrice;
  const roc = price5BarsAgo > 0 ? ((currentPrice - price5BarsAgo) / price5BarsAgo) * 100 : 0;

  const isOverbought = lastRsi > 70;
  const isOversold = lastRsi < 30;

  let bullPoints = 0;
  let bearPoints = 0;

  // RSI Scoring
  if (lastRsi >= 55 && lastRsi <= 68) bullPoints += 35;
  else if (lastRsi > 68 && lastRsi <= 75) bullPoints += 20; // extended bull
  else if (lastRsi <= 45 && lastRsi >= 32) bearPoints += 35;
  else if (lastRsi < 32 && lastRsi >= 25) bearPoints += 20; // extended bear
  else if (lastRsi < 30 && macdVelocity > 0) bullPoints += 25; // oversold bounce
  else if (lastRsi > 70 && macdVelocity < 0) bearPoints += 25; // overbought rejection

  // MACD Histogram & Velocity Scoring
  if (lastHist > 0) {
    bullPoints += 25;
    if (macdVelocity > 0) bullPoints += 15;
  } else if (lastHist < 0) {
    bearPoints += 25;
    if (macdVelocity < 0) bearPoints += 15;
  }

  // ROC Scoring
  if (roc > 0.2) bullPoints += 25;
  else if (roc < -0.2) bearPoints += 25;

  let bias: MarketBias = 'NEUTRAL';
  let strength = 30;
  let description = '';

  if (bullPoints >= 45 && bullPoints > bearPoints * 1.5) {
    bias = 'BULLISH';
    strength = Math.min(100, Math.round(bullPoints));
    description = `Bullish momentum acceleration. RSI at ${lastRsi.toFixed(1)}, MACD histogram green (+${lastHist.toFixed(4)}) with positive ROC (+${roc.toFixed(2)}%).`;
  } else if (bearPoints >= 45 && bearPoints > bullPoints * 1.5) {
    bias = 'BEARISH';
    strength = Math.min(100, Math.round(bearPoints));
    description = `Bearish momentum acceleration. RSI at ${lastRsi.toFixed(1)}, MACD histogram red (${lastHist.toFixed(4)}) with negative ROC (${roc.toFixed(2)}%).`;
  } else {
    bias = 'NEUTRAL';
    strength = Math.max(20, Math.round(Math.abs(bullPoints - bearPoints)));
    description = `Momentum hovering in neutral equilibrium (RSI ${lastRsi.toFixed(1)}, MACD flat).`;
  }

  return {
    bias,
    strength,
    rsi: Number(lastRsi.toFixed(1)),
    macdHistogram: Number(lastHist.toFixed(5)),
    macdVelocity: Number(macdVelocity.toFixed(5)),
    rateOfChange: Number(roc.toFixed(3)),
    isOverbought,
    isOversold,
    description,
  };
}
