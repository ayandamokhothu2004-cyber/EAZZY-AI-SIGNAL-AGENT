import { MarketCandle, IndicatorData, StrategyCondition, PriceZone, StrategyResult, Timeframe } from '../types';
import { detectSupportResistance } from '../utils/indicators';

export type SRInteractionState =
  | 'AT_MAJOR_SUPPORT'
  | 'AT_MAJOR_RESISTANCE'
  | 'BOUNCING_OFF_SUPPORT'
  | 'REJECTING_AT_RESISTANCE'
  | 'BREAKOUT_ABOVE_RESISTANCE'
  | 'BREAKDOWN_BELOW_SUPPORT'
  | 'MID_RANGE_EQUILIBRIUM';

export interface SRLevelDetail {
  type: 'SUPPORT' | 'RESISTANCE' | 'PIVOT' | 'PSYCHOLOGICAL';
  name: string;
  price: number;
  topPrice?: number;
  bottomPrice?: number;
  distancePercent: number;
  distancePips: number;
  strength: number; // 1-10
  touches: number;
  isFresh: boolean;
}

export interface SRFinding {
  id: string;
  category: 'ZONE_PROXIMITY' | 'PIVOT_CONFLUENCE' | 'REJECTION_WICK' | 'ROOM_TO_RUN' | 'LEVEL_BREAKOUT';
  title: string;
  detail: string;
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  weight: number; // 0-100
}

export interface SupportResistanceAnalysisResult {
  condition: StrategyCondition;
  interactionState: SRInteractionState;
  activeZones: PriceZone[];
  nearestSupport: SRLevelDetail | null;
  nearestResistance: SRLevelDetail | null;
  currentZone: PriceZone | null;
  pivotLevels: {
    pp: number;
    s1: number;
    s2: number;
    s3: number;
    r1: number;
    r2: number;
    r3: number;
    nearestPivotName: string;
    nearestPivotPrice: number;
    nearestPivotDistancePercent: number;
  };
  roomToRun: {
    upsideRoomPercent: number;
    downsideRoomPercent: number;
    riskRewardFeasibility: 'HIGH_CLEARANCE' | 'ADEQUATE_ROOM' | 'CONGESTED_BARRIERS';
  };
  rejectionWickDetected: {
    type: 'BULLISH_PINBAR_AT_SUPPORT' | 'BEARISH_PINBAR_AT_RESISTANCE' | 'NONE';
    rejectionPrice: number;
    candleIndex: number;
  };
  findings: SRFinding[];
  actionableBias: 'BUY' | 'SELL' | 'WAIT';
  confidenceContribution: number; // 0-25
}

/**
 * Detects if the current candle displays a pronounced rejection wick (pin bar) at a boundary
 */
function detectRejectionWick(
  candle: MarketCandle
): 'BULLISH_PINBAR_AT_SUPPORT' | 'BEARISH_PINBAR_AT_RESISTANCE' | 'NONE' {
  const totalRange = candle.high - candle.low;
  if (totalRange === 0) return 'NONE';

  const bodySize = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  // Bullish rejection: Lower wick is >= 55% of the total candle range and body is near the top
  if (lowerWick / totalRange >= 0.55 && bodySize / totalRange <= 0.35) {
    return 'BULLISH_PINBAR_AT_SUPPORT';
  }

  // Bearish rejection: Upper wick is >= 55% of the total candle range and body is near the bottom
  if (upperWick / totalRange >= 0.55 && bodySize / totalRange <= 0.35) {
    return 'BEARISH_PINBAR_AT_RESISTANCE';
  }

  return 'NONE';
}

/**
 * Deep Analysis Engine for Support/Resistance Strategy Module
 * Processes OHLCV market candles, swing points, and pivot coordinates to generate structured findings.
 */
export function analyzeSupportResistance(
  candles: MarketCandle[],
  indicators: IndicatorData
): SupportResistanceAnalysisResult {
  if (candles.length < 25) {
    const fallbackCondition: StrategyCondition = {
      id: 'support_resistance',
      name: 'Key Level Interaction (S/R)',
      category: 'SUPPORT_RESISTANCE',
      met: false,
      bias: 'NEUTRAL',
      score: 0,
      description: 'Insufficient candles to identify horizontal support/resistance levels.',
    };

    return {
      condition: fallbackCondition,
      interactionState: 'MID_RANGE_EQUILIBRIUM',
      activeZones: [],
      nearestSupport: null,
      nearestResistance: null,
      currentZone: null,
      pivotLevels: {
        pp: 0,
        s1: 0,
        s2: 0,
        s3: 0,
        r1: 0,
        r2: 0,
        r3: 0,
        nearestPivotName: 'NONE',
        nearestPivotPrice: 0,
        nearestPivotDistancePercent: 0,
      },
      roomToRun: {
        upsideRoomPercent: 0,
        downsideRoomPercent: 0,
        riskRewardFeasibility: 'CONGESTED_BARRIERS',
      },
      rejectionWickDetected: {
        type: 'NONE',
        rejectionPrice: 0,
        candleIndex: 0,
      },
      findings: [
        {
          id: 'sr_insufficient_data',
          category: 'ZONE_PROXIMITY',
          title: 'Insufficient Data',
          detail: 'Requires at least 25 candles for robust S/R cluster recognition.',
          impact: 'NEUTRAL',
          weight: 0,
        },
      ],
      actionableBias: 'WAIT',
      confidenceContribution: 0,
    };
  }

  const currentCandle = candles[candles.length - 1];
  const currentPrice = currentCandle.close;
  const zones = detectSupportResistance(candles, indicators.swingHighs, indicators.swingLows);
  const pivots = indicators.pivotPoints;

  // Identify all key candidate levels
  const allLevels: SRLevelDetail[] = [];

  // Add horizontal zones
  zones.forEach((z, i) => {
    const mid = (z.topPrice + z.bottomPrice) / 2;
    const distPct = ((mid - currentPrice) / currentPrice) * 100;
    allLevels.push({
      type: z.type === 'SUPPORT' ? 'SUPPORT' : 'RESISTANCE',
      name: `${z.type === 'SUPPORT' ? 'Support' : 'Resistance'} Zone #${i + 1}`,
      price: mid,
      topPrice: z.topPrice,
      bottomPrice: z.bottomPrice,
      distancePercent: distPct,
      distancePips: Math.abs(mid - currentPrice),
      strength: z.strength,
      touches: z.touches,
      isFresh: z.touches <= 2,
    });
  });

  // Add pivot levels
  const pivotList = [
    { name: 'Pivot PP', price: pivots.pp, type: 'PIVOT' as const },
    { name: 'Pivot S1', price: pivots.s1, type: 'SUPPORT' as const },
    { name: 'Pivot S2', price: pivots.s2, type: 'SUPPORT' as const },
    { name: 'Pivot S3', price: pivots.s3, type: 'SUPPORT' as const },
    { name: 'Pivot R1', price: pivots.r1, type: 'RESISTANCE' as const },
    { name: 'Pivot R2', price: pivots.r2, type: 'RESISTANCE' as const },
    { name: 'Pivot R3', price: pivots.r3, type: 'RESISTANCE' as const },
  ];

  pivotList.forEach((p) => {
    if (p.price > 0) {
      const distPct = ((p.price - currentPrice) / currentPrice) * 100;
      allLevels.push({
        type: p.type,
        name: p.name,
        price: p.price,
        distancePercent: distPct,
        distancePips: Math.abs(p.price - currentPrice),
        strength: 7,
        touches: 2,
        isFresh: false,
      });
    }
  });

  // Find nearest Support below current price
  const supportsBelow = allLevels
    .filter((l) => l.price < currentPrice && (l.type === 'SUPPORT' || l.type === 'PIVOT'))
    .sort((a, b) => b.price - a.price);

  const nearestSupport = supportsBelow.length > 0 ? supportsBelow[0] : null;

  // Find nearest Resistance above current price
  const resistancesAbove = allLevels
    .filter((l) => l.price > currentPrice && (l.type === 'RESISTANCE' || l.type === 'PIVOT'))
    .sort((a, b) => a.price - b.price);

  const nearestResistance = resistancesAbove.length > 0 ? resistancesAbove[0] : null;

  // Nearest pivot in general
  let nearestPivotName = 'PP';
  let nearestPivotPrice = pivots.pp;
  let minPivotDist = Infinity;
  pivotList.forEach((p) => {
    const dist = Math.abs(p.price - currentPrice);
    if (dist < minPivotDist) {
      minPivotDist = dist;
      nearestPivotName = p.name;
      nearestPivotPrice = p.price;
    }
  });
  const nearestPivotDistancePercent = ((nearestPivotPrice - currentPrice) / currentPrice) * 100;

  // Check if current price is sitting directly inside a zone
  const currentZone = zones.find(
    (z) => currentPrice >= z.bottomPrice * 0.999 && currentPrice <= z.topPrice * 1.001
  ) || null;

  // Check rejection candle
  const wickType = detectRejectionWick(currentCandle);
  const rejectionDetected = {
    type: wickType,
    rejectionPrice: wickType === 'BULLISH_PINBAR_AT_SUPPORT' ? currentCandle.low : wickType === 'BEARISH_PINBAR_AT_RESISTANCE' ? currentCandle.high : 0,
    candleIndex: candles.length - 1,
  };

  // Interaction Proximity Threshold (e.g. 0.25%)
  const proximityThreshold = 0.25;

  const isAtSupport =
    (nearestSupport && Math.abs(nearestSupport.distancePercent) <= proximityThreshold) ||
    (currentZone && currentZone.type === 'SUPPORT');

  const isAtResistance =
    (nearestResistance && Math.abs(nearestResistance.distancePercent) <= proximityThreshold) ||
    (currentZone && currentZone.type === 'RESISTANCE');

  let interactionState: SRInteractionState = 'MID_RANGE_EQUILIBRIUM';
  let actionableBias: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let conditionScore = 0;
  const findings: SRFinding[] = [];

  // Calculate Upside & Downside Room to Run
  const upsideRoomPercent = nearestResistance ? Math.abs(nearestResistance.distancePercent) : 2.5;
  const downsideRoomPercent = nearestSupport ? Math.abs(nearestSupport.distancePercent) : 2.5;

  let riskRewardFeasibility: 'HIGH_CLEARANCE' | 'ADEQUATE_ROOM' | 'CONGESTED_BARRIERS' = 'ADEQUATE_ROOM';
  if (upsideRoomPercent > 1.2 && downsideRoomPercent > 1.2) {
    riskRewardFeasibility = 'HIGH_CLEARANCE';
  } else if (upsideRoomPercent < 0.35 || downsideRoomPercent < 0.35) {
    riskRewardFeasibility = 'CONGESTED_BARRIERS';
  }

  // Determine state & findings
  if (isAtSupport) {
    if (wickType === 'BULLISH_PINBAR_AT_SUPPORT' || currentCandle.close > currentCandle.open) {
      interactionState = 'BOUNCING_OFF_SUPPORT';
      actionableBias = 'BUY';
      conditionScore = 18;

      findings.push({
        id: 'sr_bounce_support',
        category: 'REJECTION_WICK',
        title: 'Bullish Rejection at Institutional Support',
        detail: `Price reacted sharply off support level (${(nearestSupport?.price || currentPrice).toFixed(4)}). Long lower wick signals aggressive buyer defense.`,
        impact: 'BULLISH',
        weight: 90,
      });
    } else {
      interactionState = 'AT_MAJOR_SUPPORT';
      actionableBias = 'BUY';
      conditionScore = 14;

      findings.push({
        id: 'sr_testing_support',
        category: 'ZONE_PROXIMITY',
        title: 'Price Testing Key Support Floor',
        detail: `Price is interacting directly with validated horizontal demand at ${(nearestSupport?.price || currentPrice).toFixed(4)}.`,
        impact: 'BULLISH',
        weight: 75,
      });
    }
  } else if (isAtResistance) {
    if (wickType === 'BEARISH_PINBAR_AT_RESISTANCE' || currentCandle.close < currentCandle.open) {
      interactionState = 'REJECTING_AT_RESISTANCE';
      actionableBias = 'SELL';
      conditionScore = 18;

      findings.push({
        id: 'sr_rejection_resistance',
        category: 'REJECTION_WICK',
        title: 'Bearish Rejection at Institutional Resistance',
        detail: `Price rejected tested supply level (${(nearestResistance?.price || currentPrice).toFixed(4)}). Upper shadow indicates strong seller absorption.`,
        impact: 'BEARISH',
        weight: 90,
      });
    } else {
      interactionState = 'AT_MAJOR_RESISTANCE';
      actionableBias = 'SELL';
      conditionScore = 14;

      findings.push({
        id: 'sr_testing_resistance',
        category: 'ZONE_PROXIMITY',
        title: 'Price Testing Key Resistance Ceiling',
        detail: `Price is encountering tested supply at ${(nearestResistance?.price || currentPrice).toFixed(4)}. Resistance pressure present.`,
        impact: 'BEARISH',
        weight: 75,
      });
    }
  } else {
    interactionState = 'MID_RANGE_EQUILIBRIUM';
    actionableBias = 'WAIT';
    conditionScore = 0;

    findings.push({
      id: 'sr_mid_range',
      category: 'ZONE_PROXIMITY',
      title: 'Equilibrium (Mid-Range Oscillation)',
      detail: `Current price (${currentPrice.toFixed(4)}) is floating in open space between Support at ${nearestSupport ? nearestSupport.price.toFixed(4) : '---'} (+${downsideRoomPercent.toFixed(2)}% below) and Resistance at ${nearestResistance ? nearestResistance.price.toFixed(4) : '---'} (+${upsideRoomPercent.toFixed(2)}% above).`,
      impact: 'NEUTRAL',
      weight: 35,
    });
  }

  // Room to Run Finding
  if (riskRewardFeasibility === 'HIGH_CLEARANCE') {
    findings.push({
      id: 'sr_room_to_run_high',
      category: 'ROOM_TO_RUN',
      title: 'High Clearance Path-to-Target',
      detail: `Ample open space (+${upsideRoomPercent.toFixed(2)}% to next resistance, +${downsideRoomPercent.toFixed(2)}% to next support) provides favorable R:R runway.`,
      impact: 'BULLISH',
      weight: 80,
    });
  } else if (riskRewardFeasibility === 'CONGESTED_BARRIERS') {
    findings.push({
      id: 'sr_room_congested',
      category: 'ROOM_TO_RUN',
      title: 'Congested S/R Geometry (Tight Space)',
      detail: `Nearest major barriers are close to current price. Strict stop management recommended.`,
      impact: 'NEUTRAL',
      weight: 50,
    });
  }

  // Pivot finding
  if (Math.abs(nearestPivotDistancePercent) < 0.15) {
    findings.push({
      id: 'sr_pivot_confluence',
      category: 'PIVOT_CONFLUENCE',
      title: `Direct Confluence with ${nearestPivotName}`,
      detail: `Price within ${Math.abs(nearestPivotDistancePercent).toFixed(2)}% of classic daily pivot ${nearestPivotName} (${nearestPivotPrice.toFixed(4)}).`,
      impact: nearestPivotName.startsWith('S') ? 'BULLISH' : nearestPivotName.startsWith('R') ? 'BEARISH' : 'NEUTRAL',
      weight: 70,
    });
  }

  // Standardized StrategyCondition output
  const isBullish = actionableBias === 'BUY' && conditionScore > 0;
  const isBearish = actionableBias === 'SELL' && conditionScore > 0;

  const strategyCondition: StrategyCondition = {
    id: 'support_resistance',
    name:
      interactionState === 'BOUNCING_OFF_SUPPORT'
        ? 'Support Confluence: Bullish Bounce & Demand Defense'
        : interactionState === 'AT_MAJOR_SUPPORT'
        ? 'Support Confluence: Validated Demand Floor'
        : interactionState === 'REJECTING_AT_RESISTANCE'
        ? 'Resistance Confluence: Bearish Rejection & Supply Wall'
        : interactionState === 'AT_MAJOR_RESISTANCE'
        ? 'Resistance Confluence: Tested Supply Ceiling'
        : 'S/R Geometry: Mid-Range Neutral',
    category: 'SUPPORT_RESISTANCE',
    met: isBullish || isBearish,
    bias: isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL',
    score: conditionScore,
    description:
      isBullish
        ? `Price is interacting directly with validated institutional demand at ${nearestSupport ? nearestSupport.price.toFixed(4) : currentPrice.toFixed(4)}. High probability bounce territory.`
        : isBearish
        ? `Price is encountering tested supply barrier at ${nearestResistance ? nearestResistance.price.toFixed(4) : currentPrice.toFixed(4)}. Resistance absorption present.`
        : `Current price (${currentPrice.toFixed(4)}) is floating in mid-range between nearest S1 and R1 levels.`,
  };

  return {
    condition: strategyCondition,
    interactionState,
    activeZones: zones,
    nearestSupport,
    nearestResistance,
    currentZone,
    pivotLevels: {
      pp: Number(pivots.pp.toFixed(5)),
      s1: Number(pivots.s1.toFixed(5)),
      s2: Number(pivots.s2.toFixed(5)),
      s3: Number(pivots.s3.toFixed(5)),
      r1: Number(pivots.r1.toFixed(5)),
      r2: Number(pivots.r2.toFixed(5)),
      r3: Number(pivots.r3.toFixed(5)),
      nearestPivotName,
      nearestPivotPrice: Number(nearestPivotPrice.toFixed(5)),
      nearestPivotDistancePercent: Number(nearestPivotDistancePercent.toFixed(2)),
    },
    roomToRun: {
      upsideRoomPercent: Number(upsideRoomPercent.toFixed(2)),
      downsideRoomPercent: Number(downsideRoomPercent.toFixed(2)),
      riskRewardFeasibility,
    },
    rejectionWickDetected: rejectionDetected,
    findings,
    actionableBias,
    confidenceContribution: Math.min(25, Math.round(conditionScore * 1.25)),
  };
}

/**
 * Standardized StrategyResult evaluator for Support/Resistance Strategy
 */
export function analyzeSupportResistanceStrategy(
  candles: MarketCandle[],
  indicators: IndicatorData,
  timeframe: Timeframe = 'H1'
): StrategyResult {
  const result = analyzeSupportResistance(candles, indicators);

  if (result.actionableBias === 'BUY') {
    return {
      strategyName: 'SUPPORT_RESISTANCE',
      direction: 'BUY',
      valid: true,
      strength: result.interactionState === 'BOUNCING_OFF_SUPPORT' ? 88 : 75,
      timeframe,
      reason: result.condition.description,
      conditions: result.findings.map((f) => f.title),
      entryZone: result.nearestSupport
        ? { low: result.nearestSupport.bottomPrice || result.nearestSupport.price * 0.999, high: result.nearestSupport.topPrice || candles[candles.length - 1].close }
        : undefined,
      invalidationLevel: result.nearestSupport
        ? (result.nearestSupport.bottomPrice ? result.nearestSupport.bottomPrice * 0.998 : result.nearestSupport.price * 0.998)
        : undefined,
    };
  }

  if (result.actionableBias === 'SELL') {
    return {
      strategyName: 'SUPPORT_RESISTANCE',
      direction: 'SELL',
      valid: true,
      strength: result.interactionState === 'REJECTING_AT_RESISTANCE' ? 88 : 75,
      timeframe,
      reason: result.condition.description,
      conditions: result.findings.map((f) => f.title),
      entryZone: result.nearestResistance
        ? { low: result.nearestResistance.bottomPrice || candles[candles.length - 1].close, high: result.nearestResistance.topPrice || result.nearestResistance.price * 1.001 }
        : undefined,
      invalidationLevel: result.nearestResistance
        ? (result.nearestResistance.topPrice ? result.nearestResistance.topPrice * 1.002 : result.nearestResistance.price * 1.002)
        : undefined,
    };
  }

  return {
    strategyName: 'SUPPORT_RESISTANCE',
    direction: 'NONE',
    valid: false,
    strength: 0,
    timeframe,
    reason: result.condition.description,
    conditions: result.findings.map((f) => f.title),
  };
}

/**
 * Standard strategy evaluator wrapper returning `StrategyCondition`
 * Ensures 100% backwards-compatibility while delegating to the modular deep analysis engine.
 */
export function evaluateSupportResistance(
  candles: MarketCandle[],
  indicators: IndicatorData
): StrategyCondition {
  const result = analyzeSupportResistance(candles, indicators);
  return result.condition;
}

