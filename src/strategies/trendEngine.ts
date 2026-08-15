import { MarketCandle, Timeframe, MarketBias, TimeframeTrend, MultiTimeframeTrendReport } from '../types';
import { computeIndicators, analyzeMarketStructure } from '../utils/indicators';

/**
 * Evaluates trend and strength (0-100) for a single timeframe candle series
 */
export function evaluateSingleTimeframeTrend(
  candles: MarketCandle[],
  timeframe: Timeframe
): TimeframeTrend {
  if (!candles || candles.length < 15) {
    return {
      timeframe,
      bias: 'NEUTRAL',
      strength: 0,
      description: `${timeframe}: Insufficient candles for trend calculation.`,
    };
  }

  const indicators = computeIndicators(candles);
  const structure = analyzeMarketStructure(candles);

  const currentPrice = candles[candles.length - 1].close;
  const ema20 = indicators.ema20[indicators.ema20.length - 1] || currentPrice;
  const ema50 = indicators.ema50[indicators.ema50.length - 1] || currentPrice;
  const ema200 = indicators.ema200[indicators.ema200.length - 1] || currentPrice;
  const rsi = indicators.rsi[indicators.rsi.length - 1] || 50;

  // Calculate EMA 20 slope
  const ema20Slice = indicators.ema20.slice(-5);
  const slope = ema20Slice.length >= 5
    ? ((ema20Slice[ema20Slice.length - 1] - ema20Slice[0]) / ema20Slice[0]) / 4 * 100
    : 0;

  let bullPoints = 0;
  let bearPoints = 0;

  // EMA Cascade points (up to 40)
  if (currentPrice > ema20 && ema20 > ema50 && ema50 > ema200) bullPoints += 40;
  else if (currentPrice < ema20 && ema20 < ema50 && ema50 < ema200) bearPoints += 40;
  else if (ema20 > ema50 && currentPrice > ema50) bullPoints += 25;
  else if (ema20 < ema50 && currentPrice < ema50) bearPoints += 25;

  // Slope points (up to 20)
  if (slope > 0.04) bullPoints += 20;
  else if (slope > 0.01) bullPoints += 10;
  else if (slope < -0.04) bearPoints += 20;
  else if (slope < -0.01) bearPoints += 10;

  // Structure points (up to 25)
  if (structure.trend === 'BULLISH') bullPoints += 25;
  else if (structure.trend === 'BEARISH') bearPoints += 25;

  if (structure.lastBOS?.type === 'BULLISH') bullPoints += 10;
  else if (structure.lastBOS?.type === 'BEARISH') bearPoints += 10;

  // RSI points (up to 15)
  if (rsi > 53 && rsi < 70) bullPoints += 15;
  else if (rsi < 47 && rsi > 30) bearPoints += 15;

  let bias: MarketBias = 'NEUTRAL';
  let strength = 30;
  let description = '';

  if (bullPoints >= 45 && bullPoints > bearPoints * 1.6) {
    bias = 'BULLISH';
    strength = Math.min(100, Math.round(bullPoints));
    description = `${timeframe}: Bullish order flow (EMA cascade + ${structure.trend === 'BULLISH' ? 'HH/HL structure' : 'positive momentum'}). Strength: ${strength}/100.`;
  } else if (bearPoints >= 45 && bearPoints > bullPoints * 1.6) {
    bias = 'BEARISH';
    strength = Math.min(100, Math.round(bearPoints));
    description = `${timeframe}: Bearish order flow (EMA cascade + ${structure.trend === 'BEARISH' ? 'LH/LL structure' : 'negative momentum'}). Strength: ${strength}/100.`;
  } else {
    bias = 'NEUTRAL';
    strength = Math.max(20, Math.round(Math.abs(bullPoints - bearPoints)));
    description = `${timeframe}: Neutral / Consolidating. Moving averages intertwined. Strength: ${strength}/100.`;
  }

  return {
    timeframe,
    bias,
    strength,
    description,
  };
}

/**
 * Evaluates multi-timeframe trend across H4, H1, M15, M5
 */
export function evaluateMultiTimeframeTrends(
  candlesByTimeframe: {
    M5?: MarketCandle[];
    M15?: MarketCandle[];
    H1?: MarketCandle[];
    H4?: MarketCandle[];
    D1?: MarketCandle[];
  }
): MultiTimeframeTrendReport {
  const m5Trend = evaluateSingleTimeframeTrend(candlesByTimeframe.M5 || [], 'M5');
  const m15Trend = evaluateSingleTimeframeTrend(candlesByTimeframe.M15 || [], 'M15');
  const h1Trend = evaluateSingleTimeframeTrend(candlesByTimeframe.H1 || [], 'H1');
  const h4Trend = evaluateSingleTimeframeTrend(candlesByTimeframe.H4 || [], 'H4');
  const d1Trend = candlesByTimeframe.D1 ? evaluateSingleTimeframeTrend(candlesByTimeframe.D1, 'D1') : undefined;

  const validTrends = [m5Trend, m15Trend, h1Trend, h4Trend].filter((t) => t.strength > 0);

  const bullishCount = validTrends.filter((t) => t.bias === 'BULLISH').length;
  const bearishCount = validTrends.filter((t) => t.bias === 'BEARISH').length;
  const neutralCount = validTrends.filter((t) => t.bias === 'NEUTRAL').length;

  let overallTrend: MarketBias = 'NEUTRAL';
  let isFullyAligned = false;
  const conflictingTimeframes: Timeframe[] = [];

  // Macro weighting: H4 (weight 35), H1 (weight 30), M15 (weight 20), M5 (weight 15)
  const weights: Record<Timeframe, number> = {
    H4: 35,
    H1: 30,
    M15: 20,
    M5: 15,
    D1: 20,
  };

  let weightedBull = 0;
  let weightedBear = 0;
  let totalWeight = 0;

  for (const t of validTrends) {
    const w = weights[t.timeframe] || 20;
    totalWeight += w;
    if (t.bias === 'BULLISH') weightedBull += w * (t.strength / 100);
    else if (t.bias === 'BEARISH') weightedBear += w * (t.strength / 100);
  }

  const alignmentScore = totalWeight > 0
    ? Math.round((Math.max(weightedBull, weightedBear) / totalWeight) * 100)
    : 0;

  if (weightedBull > weightedBear * 1.5 && weightedBull >= 35) {
    overallTrend = 'BULLISH';
  } else if (weightedBear > weightedBull * 1.5 && weightedBear >= 35) {
    overallTrend = 'BEARISH';
  }

  if (overallTrend !== 'NEUTRAL') {
    for (const t of validTrends) {
      if (t.bias !== 'NEUTRAL' && t.bias !== overallTrend) {
        conflictingTimeframes.push(t.timeframe);
      }
    }
    isFullyAligned = conflictingTimeframes.length === 0 && bullishCount >= 3 || bearishCount >= 3;
  }

  return {
    overallTrend,
    alignmentScore,
    timeframes: {
      M5: m5Trend,
      M15: m15Trend,
      H1: h1Trend,
      H4: h4Trend,
      D1: d1Trend,
    },
    isFullyAligned,
    conflictingTimeframes,
  };
}
