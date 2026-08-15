import { MarketCandle, IndicatorData, StrategyCondition, StrategyResult, Timeframe } from '../types';

export type TrendPhase =
  | 'STRONG_BULLISH_TREND'
  | 'MODERATE_BULLISH_TREND'
  | 'BULLISH_PULLBACK'
  | 'CHOPPY_CONSOLIDATION'
  | 'BEARISH_PULLBACK'
  | 'MODERATE_BEARISH_TREND'
  | 'STRONG_BEARISH_TREND';

export type EMACascadeState =
  | 'PERFECT_BULLISH_STACK' // Price > EMA20 > EMA50 > EMA200
  | 'MODERATE_BULLISH'      // EMA20 > EMA50 > EMA200, Price near EMA20/50
  | 'BULLISH_CROSSOVER'     // EMA20 crossed above EMA50 recently
  | 'COMPRESSED_RANGING'    // EMAs tangled / overlapping
  | 'BEARISH_CROSSOVER'     // EMA20 crossed below EMA50 recently
  | 'MODERATE_BEARISH'      // EMA20 < EMA50 < EMA200, Price near EMA20/50
  | 'PERFECT_BEARISH_STACK'; // Price < EMA20 < EMA50 < EMA200

export interface TrendFinding {
  id: string;
  category: 'ALIGNMENT' | 'SLOPE' | 'CROSSOVER' | 'OVEREXTENSION' | 'DYNAMIC_SR';
  title: string;
  detail: string;
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  weight: number; // 0-100
}

export interface TrendFollowingAnalysisResult {
  condition: StrategyCondition;
  trendPhase: TrendPhase;
  cascadeState: EMACascadeState;
  trendStrength: number; // 0-100 score
  alignmentScore: number; // 0-100 score
  emaSlope: {
    ema20Slope: number;  // normalized slope / angle percentage
    ema50Slope: number;
    ema200Slope: number;
  };
  priceToEmaDistance: {
    distanceFromEma20Percent: number;
    distanceFromEma50Percent: number;
    distanceFromEma200Percent: number;
    isOverextended: boolean;
  };
  crossoverEvent: {
    type: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'BULLISH_20_50' | 'BEARISH_20_50' | 'NONE';
    barsAgo: number;
    description: string;
  };
  dynamicSupportLevels: number[];
  dynamicResistanceLevels: number[];
  findings: TrendFinding[];
  actionableBias: 'BUY' | 'SELL' | 'WAIT';
  confidenceContribution: number; // 0-25
}

/**
 * Calculates the slope of a series over a lookback window (percentage change per bar)
 */
function calculateSlope(series: number[], lookback = 5): number {
  if (!series || series.length < lookback + 1) return 0;
  const current = series[series.length - 1];
  const previous = series[series.length - 1 - lookback];
  if (previous === 0) return 0;
  return ((current - previous) / previous / lookback) * 100;
}

/**
 * Scans recent candle history for moving average crossovers
 */
function detectRecentCrossovers(
  ema20: number[],
  ema50: number[],
  ema200: number[],
  maxLookback = 15
): {
  type: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'BULLISH_20_50' | 'BEARISH_20_50' | 'NONE';
  barsAgo: number;
  description: string;
} {
  const len = Math.min(ema20.length, ema50.length, ema200.length);
  if (len < maxLookback + 2) {
    return { type: 'NONE', barsAgo: 0, description: 'Insufficient data for crossover scan' };
  }

  // Check 50 vs 200 (Golden/Death Cross)
  for (let i = 1; i <= maxLookback; i++) {
    const idx = len - i;
    const prevIdx = idx - 1;
    if (ema50[prevIdx] <= ema200[prevIdx] && ema50[idx] > ema200[idx]) {
      return {
        type: 'GOLDEN_CROSS',
        barsAgo: i,
        description: `Major Golden Cross (EMA 50 crossed above EMA 200) occurred ${i} bar${i > 1 ? 's' : ''} ago.`,
      };
    }
    if (ema50[prevIdx] >= ema200[prevIdx] && ema50[idx] < ema200[idx]) {
      return {
        type: 'DEATH_CROSS',
        barsAgo: i,
        description: `Major Death Cross (EMA 50 crossed below EMA 200) occurred ${i} bar${i > 1 ? 's' : ''} ago.`,
      };
    }
  }

  // Check 20 vs 50 (Fast trend cross)
  for (let i = 1; i <= maxLookback; i++) {
    const idx = len - i;
    const prevIdx = idx - 1;
    if (ema20[prevIdx] <= ema50[prevIdx] && ema20[idx] > ema50[idx]) {
      return {
        type: 'BULLISH_20_50',
        barsAgo: i,
        description: `Fast Bullish EMA Cross (EMA 20 crossed above EMA 50) ${i} bar${i > 1 ? 's' : ''} ago.`,
      };
    }
    if (ema20[prevIdx] >= ema50[prevIdx] && ema20[idx] < ema50[idx]) {
      return {
        type: 'BEARISH_20_50',
        barsAgo: i,
        description: `Fast Bearish EMA Cross (EMA 20 crossed below EMA 50) ${i} bar${i > 1 ? 's' : ''} ago.`,
      };
    }
  }

  return { type: 'NONE', barsAgo: 0, description: 'No recent EMA crossover events' };
}

/**
 * Deep Analysis Engine for Trend-Following Strategy Module
 * Processes OHLCV market candles and computed indicator data to generate structured findings.
 */
export function analyzeTrendFollowing(
  candles: MarketCandle[],
  indicators: IndicatorData
): TrendFollowingAnalysisResult {
  if (candles.length < 50) {
    const fallbackCondition: StrategyCondition = {
      id: 'trend_following',
      name: 'Trend Alignment (EMA 20/50/200)',
      category: 'TREND',
      met: false,
      bias: 'NEUTRAL',
      score: 0,
      description: 'Insufficient candle history to calculate multi-EMA alignment.',
    };

    return {
      condition: fallbackCondition,
      trendPhase: 'CHOPPY_CONSOLIDATION',
      cascadeState: 'COMPRESSED_RANGING',
      trendStrength: 0,
      alignmentScore: 0,
      emaSlope: { ema20Slope: 0, ema50Slope: 0, ema200Slope: 0 },
      priceToEmaDistance: {
        distanceFromEma20Percent: 0,
        distanceFromEma50Percent: 0,
        distanceFromEma200Percent: 0,
        isOverextended: false,
      },
      crossoverEvent: { type: 'NONE', barsAgo: 0, description: 'Insufficient data' },
      dynamicSupportLevels: [],
      dynamicResistanceLevels: [],
      findings: [
        {
          id: 'trend_insufficient_data',
          category: 'ALIGNMENT',
          title: 'Insufficient Data',
          detail: 'Requires at least 50 candles for multi-EMA trend calculations.',
          impact: 'NEUTRAL',
          weight: 0,
        },
      ],
      actionableBias: 'WAIT',
      confidenceContribution: 0,
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const lastEma20 = indicators.ema20[indicators.ema20.length - 1];
  const lastEma50 = indicators.ema50[indicators.ema50.length - 1];
  const lastEma200 = indicators.ema200[indicators.ema200.length - 1];

  const ema20Slope = calculateSlope(indicators.ema20, 5);
  const ema50Slope = calculateSlope(indicators.ema50, 10);
  const ema200Slope = calculateSlope(indicators.ema200, 20);

  const distEma20 = ((currentPrice - lastEma20) / lastEma20) * 100;
  const distEma50 = ((currentPrice - lastEma50) / lastEma50) * 100;
  const distEma200 = ((currentPrice - lastEma200) / lastEma200) * 100;

  // Overextension threshold: > 1.8% away from EMA 20 in short timeframe
  const isOverextended = Math.abs(distEma20) > 1.8;

  const crossover = detectRecentCrossovers(
    indicators.ema20,
    indicators.ema50,
    indicators.ema200
  );

  const findings: TrendFinding[] = [];

  // Determine Cascade State & Trend Phase
  let cascadeState: EMACascadeState = 'COMPRESSED_RANGING';
  let trendPhase: TrendPhase = 'CHOPPY_CONSOLIDATION';
  let alignmentScore = 0;
  let trendStrength = 0;
  let actionableBias: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let conditionScore = 0;
  let dynamicSupportLevels: number[] = [];
  let dynamicResistanceLevels: number[] = [];

  const isPerfectBullish = currentPrice > lastEma20 && lastEma20 > lastEma50 && lastEma50 > lastEma200;
  const isPerfectBearish = currentPrice < lastEma20 && lastEma20 < lastEma50 && lastEma50 < lastEma200;

  const isModerateBullish = lastEma20 > lastEma50 && lastEma50 > lastEma200;
  const isModerateBearish = lastEma20 < lastEma50 && lastEma50 < lastEma200;

  if (isPerfectBullish) {
    cascadeState = 'PERFECT_BULLISH_STACK';
    alignmentScore = 95;
    dynamicSupportLevels = [lastEma20, lastEma50, lastEma200];

    if (ema20Slope > 0.05 && ema50Slope > 0.02) {
      trendPhase = 'STRONG_BULLISH_TREND';
      trendStrength = 90;
      actionableBias = isOverextended ? 'WAIT' : 'BUY';
      conditionScore = 20;
    } else {
      trendPhase = 'MODERATE_BULLISH_TREND';
      trendStrength = 75;
      actionableBias = 'BUY';
      conditionScore = 17;
    }

    findings.push({
      id: 'trend_cascade_bullish',
      category: 'ALIGNMENT',
      title: 'Bullish Multi-EMA Cascade Active',
      detail: `Price (${currentPrice.toFixed(4)}) > EMA20 (${lastEma20.toFixed(4)}) > EMA50 (${lastEma50.toFixed(4)}) > EMA200 (${lastEma200.toFixed(4)}). Dominant institutional order flow.`,
      impact: 'BULLISH',
      weight: 90,
    });
  } else if (isPerfectBearish) {
    cascadeState = 'PERFECT_BEARISH_STACK';
    alignmentScore = 95;
    dynamicResistanceLevels = [lastEma20, lastEma50, lastEma200];

    if (ema20Slope < -0.05 && ema50Slope < -0.02) {
      trendPhase = 'STRONG_BEARISH_TREND';
      trendStrength = 90;
      actionableBias = isOverextended ? 'WAIT' : 'SELL';
      conditionScore = 20;
    } else {
      trendPhase = 'MODERATE_BEARISH_TREND';
      trendStrength = 75;
      actionableBias = 'SELL';
      conditionScore = 17;
    }

    findings.push({
      id: 'trend_cascade_bearish',
      category: 'ALIGNMENT',
      title: 'Bearish Multi-EMA Cascade Active',
      detail: `Price (${currentPrice.toFixed(4)}) < EMA20 (${lastEma20.toFixed(4)}) < EMA50 (${lastEma50.toFixed(4)}) < EMA200 (${lastEma200.toFixed(4)}). Heavy institutional selling pressure.`,
      impact: 'BEARISH',
      weight: 90,
    });
  } else if (isModerateBullish) {
    cascadeState = 'MODERATE_BULLISH';
    alignmentScore = 75;
    trendStrength = 65;
    dynamicSupportLevels = [lastEma50, lastEma200];

    if (currentPrice < lastEma20 && currentPrice >= lastEma50) {
      trendPhase = 'BULLISH_PULLBACK';
      actionableBias = 'BUY';
      conditionScore = 14;
      findings.push({
        id: 'trend_pullback_bullish',
        category: 'DYNAMIC_SR',
        title: 'Bullish Pullback into EMA 20-50 Value Zone',
        detail: `Healthy retracement in uptrend. Price testing dynamic support at EMA 50 (${lastEma50.toFixed(4)}).`,
        impact: 'BULLISH',
        weight: 75,
      });
    } else {
      trendPhase = 'MODERATE_BULLISH_TREND';
      actionableBias = 'BUY';
      conditionScore = 12;
    }
  } else if (isModerateBearish) {
    cascadeState = 'MODERATE_BEARISH';
    alignmentScore = 75;
    trendStrength = 65;
    dynamicResistanceLevels = [lastEma50, lastEma200];

    if (currentPrice > lastEma20 && currentPrice <= lastEma50) {
      trendPhase = 'BEARISH_PULLBACK';
      actionableBias = 'SELL';
      conditionScore = 14;
      findings.push({
        id: 'trend_pullback_bearish',
        category: 'DYNAMIC_SR',
        title: 'Bearish Pullback into EMA 20-50 Value Zone',
        detail: `Retracement in downtrend. Price testing dynamic resistance at EMA 50 (${lastEma50.toFixed(4)}).`,
        impact: 'BEARISH',
        weight: 75,
      });
    } else {
      trendPhase = 'MODERATE_BEARISH_TREND';
      actionableBias = 'SELL';
      conditionScore = 12;
    }
  } else {
    // Intertwined or ranging
    cascadeState = 'COMPRESSED_RANGING';
    trendPhase = 'CHOPPY_CONSOLIDATION';
    alignmentScore = 30;
    trendStrength = 25;
    actionableBias = 'WAIT';
    conditionScore = 0;

    findings.push({
      id: 'trend_ranging',
      category: 'ALIGNMENT',
      title: 'Moving Averages Compressed & Tangled',
      detail: `EMA 20, 50, and 200 are flat and intertwined. Market is oscillating within a range.`,
      impact: 'NEUTRAL',
      weight: 30,
    });
  }

  // Slope findings
  if (Math.abs(ema20Slope) > 0.08) {
    findings.push({
      id: 'trend_slope_velocity',
      category: 'SLOPE',
      title: ema20Slope > 0 ? 'High Positive EMA Velocity' : 'High Negative EMA Velocity',
      detail: `Fast EMA 20 slope is ${ema20Slope.toFixed(3)}%/bar, confirming strong impulse momentum.`,
      impact: ema20Slope > 0 ? 'BULLISH' : 'BEARISH',
      weight: 70,
    });
  }

  // Overextension finding
  if (isOverextended) {
    findings.push({
      id: 'trend_overextension',
      category: 'OVEREXTENSION',
      title: 'Mean Reversion Warning (Extended from Fast EMA)',
      detail: `Price is stretched ${distEma20.toFixed(2)}% away from EMA 20. Increased risk of sharp mean-reversion pullback before trend resumes.`,
      impact: 'NEUTRAL',
      weight: 60,
    });
  }

  // Crossover findings
  if (crossover.type !== 'NONE') {
    findings.push({
      id: `trend_crossover_${crossover.type.toLowerCase()}`,
      category: 'CROSSOVER',
      title: crossover.type.replace(/_/g, ' '),
      detail: crossover.description,
      impact: crossover.type.includes('BULLISH') || crossover.type === 'GOLDEN_CROSS' ? 'BULLISH' : 'BEARISH',
      weight: crossover.type.includes('GOLDEN') || crossover.type.includes('DEATH') ? 85 : 65,
    });
  }

  // Build the standardized StrategyCondition for downstream engine consumption
  const isBullish = actionableBias === 'BUY' && conditionScore > 0;
  const isBearish = actionableBias === 'SELL' && conditionScore > 0;

  const strategyCondition: StrategyCondition = {
    id: 'trend_following',
    name:
      trendPhase === 'STRONG_BULLISH_TREND'
        ? 'Trend Following: Bullish Multi-EMA Cascade'
        : trendPhase === 'STRONG_BEARISH_TREND'
        ? 'Trend Following: Bearish Multi-EMA Cascade'
        : trendPhase === 'BULLISH_PULLBACK'
        ? 'Trend Following: Bullish Retracement to EMA Ribbon'
        : trendPhase === 'BEARISH_PULLBACK'
        ? 'Trend Following: Bearish Retracement to EMA Ribbon'
        : trendPhase === 'MODERATE_BULLISH_TREND'
        ? 'Trend Alignment: Moderate Bullish Flow'
        : trendPhase === 'MODERATE_BEARISH_TREND'
        ? 'Trend Alignment: Moderate Bearish Flow'
        : 'Trend Alignment: Choppy / Range Bound',
    category: 'TREND',
    met: isBullish || isBearish,
    bias: isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL',
    score: conditionScore,
    description:
      isBullish
        ? `Price (${currentPrice.toFixed(4)}) is aligned with bullish moving average hierarchy (EMA 20/50/200). Trend strength: ${trendStrength}/100.`
        : isBearish
        ? `Price (${currentPrice.toFixed(4)}) is aligned with bearish moving average hierarchy (EMA 20/50/200). Trend strength: ${trendStrength}/100.`
        : `Moving averages are compressed and intertwined. Market is consolidating with no decisive trend.`,
  };

  return {
    condition: strategyCondition,
    trendPhase,
    cascadeState,
    trendStrength,
    alignmentScore,
    emaSlope: {
      ema20Slope: Number(ema20Slope.toFixed(4)),
      ema50Slope: Number(ema50Slope.toFixed(4)),
      ema200Slope: Number(ema200Slope.toFixed(4)),
    },
    priceToEmaDistance: {
      distanceFromEma20Percent: Number(distEma20.toFixed(2)),
      distanceFromEma50Percent: Number(distEma50.toFixed(2)),
      distanceFromEma200Percent: Number(distEma200.toFixed(2)),
      isOverextended,
    },
    crossoverEvent: crossover,
    dynamicSupportLevels: dynamicSupportLevels.map((l) => Number(l.toFixed(5))),
    dynamicResistanceLevels: dynamicResistanceLevels.map((l) => Number(l.toFixed(5))),
    findings,
    actionableBias,
    confidenceContribution: Math.min(25, Math.round(conditionScore * 1.25)),
  };
}

/**
 * Standardized StrategyResult evaluator for Trend-Following Strategy
 */
export function analyzeTrendFollowingStrategy(
  candles: MarketCandle[],
  indicators: IndicatorData,
  timeframe: Timeframe = 'H1'
): StrategyResult {
  const result = analyzeTrendFollowing(candles, indicators);

  if (result.actionableBias === 'BUY') {
    return {
      strategyName: 'TREND_FOLLOWING',
      direction: 'BUY',
      valid: true,
      strength: result.trendStrength,
      timeframe,
      reason: result.condition.description,
      conditions: result.findings.map((f) => f.title),
      entryZone: result.dynamicSupportLevels.length > 0
        ? { low: result.dynamicSupportLevels[0], high: candles[candles.length - 1].close }
        : undefined,
      invalidationLevel: result.dynamicSupportLevels[result.dynamicSupportLevels.length - 1],
    };
  }

  if (result.actionableBias === 'SELL') {
    return {
      strategyName: 'TREND_FOLLOWING',
      direction: 'SELL',
      valid: true,
      strength: result.trendStrength,
      timeframe,
      reason: result.condition.description,
      conditions: result.findings.map((f) => f.title),
      entryZone: result.dynamicResistanceLevels.length > 0
        ? { low: candles[candles.length - 1].close, high: result.dynamicResistanceLevels[0] }
        : undefined,
      invalidationLevel: result.dynamicResistanceLevels[result.dynamicResistanceLevels.length - 1],
    };
  }

  return {
    strategyName: 'TREND_FOLLOWING',
    direction: 'NONE',
    valid: false,
    strength: result.trendStrength,
    timeframe,
    reason: result.condition.description,
    conditions: result.findings.map((f) => f.title),
  };
}

/**
 * Standard strategy evaluator wrapper returning `StrategyCondition`

 * Ensures 100% backwards-compatibility while delegating to the modular deep analysis engine.
 */
export function evaluateTrendFollowing(
  candles: MarketCandle[],
  indicators: IndicatorData
): StrategyCondition {
  const result = analyzeTrendFollowing(candles, indicators);
  return result.condition;
}
