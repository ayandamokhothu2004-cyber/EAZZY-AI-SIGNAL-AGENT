import {
  MarketCandle,
  Timeframe,
  TradeType,
  StrategyCondition,
  MarketStructure,
  IndicatorData,
  MarketRegime,
  MultiTimeframeTrendReport,
  StrategyResult,
  ConfluenceReport,
  ConfidenceBreakdown,
} from '../types';
import { computeIndicators, analyzeMarketStructure } from '../utils/indicators';
import {
  evaluateTrendFollowing,
  analyzeTrendFollowing,
  analyzeTrendFollowingStrategy,
  TrendFollowingAnalysisResult,
  TrendPhase,
  EMACascadeState,
  TrendFinding,
} from './trendFollowing';
import { evaluateBreakout, analyzeBreakoutStrategy } from './breakoutAnalysis';
import { evaluatePullback, analyzePullbackStrategy } from './pullbackAnalysis';
import {
  evaluateSupportResistance,
  analyzeSupportResistance,
  analyzeSupportResistanceStrategy,
  SupportResistanceAnalysisResult,
  SRInteractionState,
  SRLevelDetail,
  SRFinding,
} from './supportResistance';
import { evaluateMarketStructureStrategy } from './marketStructure';
import { evaluateLiquiditySweep, analyzeLiquiditySweepStrategy } from './liquidityAnalysis';
import { evaluateMomentumVolatility } from './momentumVolatility';
import { evaluateMTFConfluence, MTFAnalysisResult } from './multiTimeframeConfluence';
import { detectMarketRegime } from './marketRegime';
import { evaluateMultiTimeframeTrends } from './trendEngine';
import { analyzeVolatility, VolatilityAnalysisResult } from './volatilityEngine';
import { analyzeMomentum, MomentumAnalysisResult } from './momentumEngine';
import { evaluateConfluenceEngine } from './confluenceEngine';
import { defaultNewsRiskProvider } from './newsRiskProvider';

export * from './trendFollowing';
export * from './supportResistance';
export * from './marketRegime';
export * from './trendEngine';
export * from './volatilityEngine';
export * from './momentumEngine';
export * from './confluenceEngine';
export * from './newsRiskProvider';
export * from './breakoutAnalysis';
export * from './pullbackAnalysis';
export * from './liquidityAnalysis';
export * from './marketStructure';
export * from './momentumVolatility';
export * from './multiTimeframeConfluence';

export interface ComprehensiveStrategyReport {
  instrument: string;
  tradeType: TradeType;
  indicators: IndicatorData;
  structure: MarketStructure;
  marketRegime: MarketRegime;
  mtfTrends: MultiTimeframeTrendReport;
  volatility: VolatilityAnalysisResult;
  momentum: MomentumAnalysisResult;
  trendAnalysis: TrendFollowingAnalysisResult;
  srAnalysis: SupportResistanceAnalysisResult;
  mtfAnalysis: MTFAnalysisResult;
  strategyResults: StrategyResult[];
  confluence: ConfluenceReport;
  confidenceBreakdown: ConfidenceBreakdown;
  confidenceScore: number;
  conditions: StrategyCondition[];
  bullishScore: number;
  bearishScore: number;
  totalConditionsMet: number;
  dominantBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  breakdown: {
    trendFollowing: boolean;
    breakout: boolean;
    pullback: boolean;
    supportResistance: boolean;
    marketStructure: boolean;
    liquiditySweep: boolean;
    momentum: boolean;
    volatility: boolean;
    mtfConfluence: boolean;
  };
}

export function runComprehensiveStrategyEngine(
  instrument: string,
  entryCandles: MarketCandle[],
  contextCandles: MarketCandle[],
  tradeType: TradeType,
  additionalCandlesByTimeframe?: {
    M5?: MarketCandle[];
    M15?: MarketCandle[];
    H1?: MarketCandle[];
    H4?: MarketCandle[];
    D1?: MarketCandle[];
  }
): ComprehensiveStrategyReport {
  const indicators = computeIndicators(entryCandles);
  const structure = analyzeMarketStructure(entryCandles);

  // 1. Market Regime Analysis
  const marketRegime = detectMarketRegime(entryCandles, indicators);

  // 2. Volatility and Momentum Engine
  const volatility = analyzeVolatility(entryCandles, indicators);
  const momentum = analyzeMomentum(entryCandles, indicators);

  // 3. Multi-Timeframe Trend Engine
  const tfMap = additionalCandlesByTimeframe || {
    M15: entryCandles,
    H1: contextCandles,
    H4: contextCandles,
  };
  const mtfTrends = evaluateMultiTimeframeTrends(tfMap);

  // 4. Modular Strategy Analyses (Individual Strategies)
  const trendResult = analyzeTrendFollowingStrategy(entryCandles, indicators, tradeType === 'SCALP' ? 'M5' : 'H1');
  const breakoutResult = analyzeBreakoutStrategy(entryCandles, indicators, tradeType === 'SCALP' ? 'M5' : 'M15');
  const pullbackResult = analyzePullbackStrategy(entryCandles, indicators, tradeType === 'SCALP' ? 'M5' : 'M15');
  const srResult = analyzeSupportResistanceStrategy(entryCandles, indicators, tradeType === 'SCALP' ? 'M15' : 'H1');
  const liquidityResult = analyzeLiquiditySweepStrategy(entryCandles, structure, tradeType === 'SCALP' ? 'M5' : 'M15');

  const strategyResults: StrategyResult[] = [
    trendResult,
    breakoutResult,
    pullbackResult,
    srResult,
    liquidityResult,
  ];

  // 5. Deep Legacy & Confluence Strategy Checks
  const trendAnalysis = analyzeTrendFollowing(entryCandles, indicators);
  const srAnalysis = analyzeSupportResistance(entryCandles, indicators);
  const condTrend = trendAnalysis.condition;
  const condBreakout = evaluateBreakout(entryCandles, indicators);
  const condPullback = evaluatePullback(entryCandles, indicators);
  const condSR = srAnalysis.condition;
  const condStructure = evaluateMarketStructureStrategy(entryCandles, structure);
  const condLiquidity = evaluateLiquiditySweep(entryCandles, structure);
  const condMomentum = evaluateMomentumVolatility(entryCandles, indicators);
  const mtfAnalysis = evaluateMTFConfluence(contextCandles, entryCandles, tradeType);

  const allConditions: StrategyCondition[] = [
    condTrend,
    condBreakout,
    condPullback,
    condSR,
    condStructure,
    condLiquidity,
    condMomentum,
    mtfAnalysis.condition,
  ];

  let bullishScore = 0;
  let bearishScore = 0;
  let totalConditionsMet = 0;

  for (const cond of allConditions) {
    if (cond.met) {
      totalConditionsMet++;
      if (cond.bias === 'BULLISH') bullishScore += cond.score;
      else if (cond.bias === 'BEARISH') bearishScore += cond.score;
    }
  }

  let dominantBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (bullishScore >= 35 && bullishScore > bearishScore * 1.5) {
    dominantBias = 'BULLISH';
  } else if (bearishScore >= 35 && bearishScore > bullishScore * 1.5) {
    dominantBias = 'BEARISH';
  }

  // 6. Run Confluence Engine
  const targetDirection: 'BUY' | 'SELL' | 'WAIT' =
    dominantBias === 'BULLISH' ? 'BUY' : dominantBias === 'BEARISH' ? 'SELL' : 'WAIT';

  const { confluence, confidenceBreakdown } = evaluateConfluenceEngine({
    targetDirection,
    marketRegime,
    mtfTrends,
    marketStructure: structure,
    srAnalysis,
    momentum,
    volatility,
    strategyResults,
    riskRewardRatio: 2.0,
    minRR: 1.5,
  });

  return {
    instrument,
    tradeType,
    indicators,
    structure,
    marketRegime,
    mtfTrends,
    volatility,
    momentum,
    trendAnalysis,
    srAnalysis,
    mtfAnalysis,
    strategyResults,
    confluence,
    confidenceBreakdown,
    confidenceScore: confidenceBreakdown.totalScore,
    conditions: allConditions,
    bullishScore,
    bearishScore,
    totalConditionsMet,
    dominantBias,
    breakdown: {
      trendFollowing: condTrend.met,
      breakout: condBreakout.met,
      pullback: condPullback.met,
      supportResistance: condSR.met,
      marketStructure: condStructure.met,
      liquiditySweep: condLiquidity.met,
      momentum: condMomentum.met,
      volatility: structure.volatilityState === 'EXPANDING',
      mtfConfluence: mtfAnalysis.isAligned,
    },
  };
}
