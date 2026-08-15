import {
  MarketBias,
  ConfluenceReport,
  ConfluenceEvidence,
  ConfidenceBreakdown,
  MultiTimeframeTrendReport,
  MarketStructure,
  MarketRegime,
  StrategyResult,
} from '../types';
import { SupportResistanceAnalysisResult } from './supportResistance';
import { VolatilityAnalysisResult } from './volatilityEngine';
import { MomentumAnalysisResult } from './momentumEngine';

export interface ConfluenceInput {
  targetDirection: 'BUY' | 'SELL' | 'WAIT';
  marketRegime: MarketRegime;
  mtfTrends: MultiTimeframeTrendReport;
  marketStructure: MarketStructure;
  srAnalysis: SupportResistanceAnalysisResult;
  momentum: MomentumAnalysisResult;
  volatility: VolatilityAnalysisResult;
  strategyResults: StrategyResult[];
  riskRewardRatio: number;
  minRR: number;
}

export function evaluateConfluenceEngine(input: ConfluenceInput): {
  confluence: ConfluenceReport;
  confidenceBreakdown: ConfidenceBreakdown;
  confidenceScore: number;
} {
  const {
    targetDirection,
    marketRegime,
    mtfTrends,
    marketStructure,
    srAnalysis,
    momentum,
    volatility,
    strategyResults,
    riskRewardRatio,
    minRR,
  } = input;

  const expectedBias: MarketBias =
    targetDirection === 'BUY' ? 'BULLISH' : targetDirection === 'SELL' ? 'BEARISH' : 'NEUTRAL';

  const evidence: ConfluenceEvidence[] = [];

  // --- 1. Multi-Timeframe Alignment (Max 20 pts) ---
  let htfAlignment = 0;
  if (targetDirection !== 'WAIT') {
    const h4Bias = mtfTrends.timeframes.H4.bias;
    const h1Bias = mtfTrends.timeframes.H1.bias;
    const m15Bias = mtfTrends.timeframes.M15.bias;

    if (h4Bias === expectedBias && h1Bias === expectedBias && m15Bias === expectedBias) {
      htfAlignment = 20;
      evidence.push({
        source: 'Multi-Timeframe Trend (H4+H1+M15)',
        classification: 'STRONG_SUPPORT',
        bias: expectedBias,
        weight: 20,
        detail: `Flawless multi-timeframe alignment across H4 (${h4Bias}), H1 (${h1Bias}), and M15 (${m15Bias}).`,
      });
    } else if (h4Bias === expectedBias && h1Bias === expectedBias) {
      htfAlignment = 16;
      evidence.push({
        source: 'Macro Trend (H4+H1)',
        classification: 'STRONG_SUPPORT',
        bias: expectedBias,
        weight: 16,
        detail: `Macro trend is aligned: H4 and H1 both confirm ${expectedBias} bias.`,
      });
    } else if (h1Bias === expectedBias) {
      htfAlignment = 10;
      evidence.push({
        source: 'Intermediate Trend (H1)',
        classification: 'SUPPORT',
        bias: expectedBias,
        weight: 10,
        detail: `H1 bias confirms ${expectedBias}, though higher timeframe H4 is ${h4Bias}.`,
      });
    } else if (h4Bias !== 'NEUTRAL' && h4Bias !== expectedBias) {
      htfAlignment = 0;
      evidence.push({
        source: 'Macro Trend Conflict (H4)',
        classification: 'STRONG_CONFLICT',
        bias: h4Bias,
        weight: 20,
        detail: `Critical macro divergence: H4 trend is strictly ${h4Bias} against proposed ${targetDirection}.`,
      });
    } else {
      htfAlignment = 5;
      evidence.push({
        source: 'Multi-Timeframe Trend',
        classification: 'NEUTRAL',
        bias: 'NEUTRAL',
        weight: 5,
        detail: 'Multi-timeframe trends are mixed or consolidating in equilibrium.',
      });
    }
  }

  // --- 2. Market Structure (Max 20 pts) ---
  let structScore = 0;
  if (targetDirection !== 'WAIT') {
    const isBOSAligned = marketStructure.lastBOS?.type === expectedBias;
    const isCHoCHAligned = marketStructure.lastCHoCH?.type === expectedBias;
    const isTrendAligned = marketStructure.trend === expectedBias;

    if (isBOSAligned && isTrendAligned) {
      structScore = 20;
      evidence.push({
        source: 'Market Structure Order Flow',
        classification: 'STRONG_SUPPORT',
        bias: expectedBias,
        weight: 20,
        detail: `Confirmed Break of Structure (BOS) in direction of ${expectedBias} order flow series.`,
      });
    } else if (isCHoCHAligned) {
      structScore = 16;
      evidence.push({
        source: 'Structure Shift (CHoCH)',
        classification: 'STRONG_SUPPORT',
        bias: expectedBias,
        weight: 16,
        detail: `Change of Character (CHoCH) shift confirms reversal into ${expectedBias} territory.`,
      });
    } else if (isTrendAligned) {
      structScore = 12;
      evidence.push({
        source: 'Price Action Progression',
        classification: 'SUPPORT',
        bias: expectedBias,
        weight: 12,
        detail: `Progressive ${expectedBias === 'BULLISH' ? 'Higher Highs / Higher Lows' : 'Lower Highs / Lower Lows'} without structure breach.`,
      });
    } else if (marketStructure.trend !== 'NEUTRAL' && marketStructure.trend !== expectedBias) {
      structScore = 0;
      evidence.push({
        source: 'Market Structure Conflict',
        classification: 'CONFLICT',
        bias: marketStructure.trend,
        weight: 15,
        detail: `Structure series opposes trade direction (${marketStructure.trend} vs ${targetDirection}).`,
      });
    } else {
      structScore = 4;
      evidence.push({
        source: 'Market Structure',
        classification: 'NEUTRAL',
        bias: 'NEUTRAL',
        weight: 4,
        detail: 'Structure is oscillating in horizontal range without progressive swing sequence.',
      });
    }
  }

  // --- 3. Entry Confirmation (Max 15 pts) ---
  let entryConfirmation = 0;
  if (targetDirection !== 'WAIT') {
    const validStrategies = strategyResults.filter((s) => s.valid && s.direction === targetDirection);
    if (validStrategies.length >= 2) {
      entryConfirmation = 15;
      evidence.push({
        source: 'Multi-Strategy Trigger Confirmation',
        classification: 'STRONG_SUPPORT',
        bias: expectedBias,
        weight: 15,
        detail: `Multiple independent triggers active (${validStrategies.map((s) => s.strategyName).join(', ')}).`,
      });
    } else if (validStrategies.length === 1) {
      entryConfirmation = 11;
      evidence.push({
        source: `${validStrategies[0].strategyName} Trigger`,
        classification: 'SUPPORT',
        bias: expectedBias,
        weight: 11,
        detail: validStrategies[0].reason,
      });
    } else {
      entryConfirmation = 2;
    }
  }

  // --- 4. Momentum Alignment (Max 15 pts) ---
  let momentumAlignment = 0;
  if (targetDirection !== 'WAIT') {
    if (momentum.bias === expectedBias && momentum.strength >= 65) {
      momentumAlignment = 15;
      evidence.push({
        source: 'Momentum Vector (RSI+MACD+ROC)',
        classification: 'STRONG_SUPPORT',
        bias: expectedBias,
        weight: 15,
        detail: momentum.description,
      });
    } else if (momentum.bias === expectedBias) {
      momentumAlignment = 10;
      evidence.push({
        source: 'Momentum Alignment',
        classification: 'SUPPORT',
        bias: expectedBias,
        weight: 10,
        detail: momentum.description,
      });
    } else if (momentum.bias !== 'NEUTRAL' && momentum.bias !== expectedBias) {
      momentumAlignment = 0;
      evidence.push({
        source: 'Momentum Divergence',
        classification: 'CONFLICT',
        bias: momentum.bias,
        weight: 10,
        detail: `Momentum indicators oppose setup (${momentum.bias} vs ${targetDirection}).`,
      });
    } else {
      momentumAlignment = 5;
      evidence.push({
        source: 'Momentum State',
        classification: 'NEUTRAL',
        bias: 'NEUTRAL',
        weight: 5,
        detail: 'Momentum hovering near equilibrium.',
      });
    }
  }

  // --- 5. Liquidity Condition (Max 10 pts) ---
  let liquidityCondition = 0;
  if (targetDirection !== 'WAIT') {
    const sweepStrategy = strategyResults.find((s) => s.strategyName === 'LIQUIDITY_SWEEP');
    if (sweepStrategy && sweepStrategy.valid && sweepStrategy.direction === targetDirection) {
      liquidityCondition = 10;
      evidence.push({
        source: 'Liquidity Purge & Absorption',
        classification: 'STRONG_SUPPORT',
        bias: expectedBias,
        weight: 10,
        detail: sweepStrategy.reason,
      });
    } else if (marketStructure.liquiditySweeps.length > 0) {
      liquidityCondition = 5;
    } else {
      liquidityCondition = 3;
    }
  }

  // --- 6. Support / Resistance Clearance (Max 10 pts) ---
  let srClearance = 0;
  if (targetDirection !== 'WAIT') {
    if (srAnalysis.actionableBias === targetDirection) {
      srClearance = 10;
      evidence.push({
        source: 'Key S/R Level Interaction',
        classification: 'STRONG_SUPPORT',
        bias: expectedBias,
        weight: 10,
        detail: srAnalysis.condition.description,
      });
    } else if (srAnalysis.roomToRun.riskRewardFeasibility === 'HIGH_CLEARANCE') {
      srClearance = 8;
      evidence.push({
        source: 'S/R Pathway Clearance',
        classification: 'SUPPORT',
        bias: expectedBias,
        weight: 8,
        detail: 'Clean runway to next major institutional barrier.',
      });
    } else if (srAnalysis.roomToRun.riskRewardFeasibility === 'CONGESTED_BARRIERS') {
      srClearance = 2;
      evidence.push({
        source: 'Congested S/R Barrier Warning',
        classification: 'CONFLICT',
        bias: 'NEUTRAL',
        weight: 6,
        detail: 'Nearest opposing barrier is very close to current price.',
      });
    } else {
      srClearance = 5;
    }
  }

  // --- 7. Volatility Suitability (Max 10 pts) ---
  let volatilitySuitability = 0;
  if (volatility.isTradeSuitable) {
    if (volatility.level === 'NORMAL' || volatility.level === 'LOW') {
      volatilitySuitability = 10;
      evidence.push({
        source: 'Volatility Regime',
        classification: 'SUPPORT',
        bias: 'NEUTRAL',
        weight: 10,
        detail: volatility.reason,
      });
    } else {
      volatilitySuitability = 6;
      evidence.push({
        source: 'Volatility State',
        classification: 'SUPPORT',
        bias: 'NEUTRAL',
        weight: 6,
        detail: volatility.reason,
      });
    }
  } else {
    volatilitySuitability = 0;
    evidence.push({
      source: 'Extreme Volatility Alert',
      classification: 'STRONG_CONFLICT',
      bias: 'NEUTRAL',
      weight: 15,
      detail: volatility.reason,
    });
  }

  // --- 8. Risk / Reward Ratio (Max 10 pts) ---
  let rrPoints = 0;
  if (targetDirection !== 'WAIT') {
    if (riskRewardRatio >= 2.5) rrPoints = 10;
    else if (riskRewardRatio >= 2.0) rrPoints = 8;
    else if (riskRewardRatio >= minRR) rrPoints = 6;
    else rrPoints = 0;
  }

  // --- 9. Strategy Agreement (Max 10 pts) ---
  let strategyAgreement = 0;
  if (targetDirection !== 'WAIT') {
    const validCount = strategyResults.filter((s) => s.valid && s.direction === targetDirection).length;
    strategyAgreement = Math.min(10, validCount * 4);
  }

  // --- 10. Conflicting Evidence Penalty (-10 to -30) ---
  let conflictingPenalty = 0;
  const conflictItems = evidence.filter(
    (e) => e.classification === 'CONFLICT' || e.classification === 'STRONG_CONFLICT'
  );

  for (const c of conflictItems) {
    if (c.classification === 'STRONG_CONFLICT') conflictingPenalty -= 15;
    else conflictingPenalty -= 7;
  }
  conflictingPenalty = Math.max(-30, conflictingPenalty);

  // Calculate Raw Total
  const subtotal =
    htfAlignment +
    structScore +
    entryConfirmation +
    momentumAlignment +
    liquidityCondition +
    srClearance +
    volatilitySuitability +
    rrPoints +
    strategyAgreement;

  let totalScore = Math.max(10, Math.min(96, subtotal + conflictingPenalty));

  if (targetDirection === 'WAIT') {
    totalScore = 30;
    conflictingPenalty = 0;
  }

  const confidenceBreakdown: ConfidenceBreakdown = {
    htfAlignment,
    marketStructure: structScore,
    entryConfirmation,
    momentumAlignment,
    liquidityCondition,
    srClearance,
    volatilitySuitability,
    riskRewardRatio: rrPoints,
    strategyAgreement,
    conflictingPenalty,
    totalScore,
  };

  const supportingCount = evidence.filter(
    (e) => e.classification === 'SUPPORT' || e.classification === 'STRONG_SUPPORT'
  ).length;
  const conflictingCount = conflictItems.length;

  let overallConfluence: 'HIGH' | 'MODERATE' | 'LOW' | 'CONFLICTING' = 'LOW';
  if (conflictingCount >= 2 || (conflictingCount >= 1 && conflictingPenalty <= -15)) {
    overallConfluence = 'CONFLICTING';
  } else if (supportingCount >= 4 && totalScore >= 70) {
    overallConfluence = 'HIGH';
  } else if (supportingCount >= 2 && totalScore >= 50) {
    overallConfluence = 'MODERATE';
  }

  return {
    confluence: {
      overallConfluence,
      aggregateScore: totalScore,
      evidence,
      dominantBias: expectedBias,
      supportingCount,
      conflictingCount,
    },
    confidenceBreakdown,
    confidenceScore: totalScore,
  };
}
