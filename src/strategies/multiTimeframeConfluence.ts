import { MarketCandle, Timeframe, TradeType, StrategyCondition, MarketBias } from '../types';
import { analyzeMarketStructure, computeIndicators } from '../utils/indicators';

export interface MTFAnalysisResult {
  tradeType: TradeType;
  contextTimeframe: Timeframe;
  entryTimeframe: Timeframe;
  contextBias: MarketBias;
  entryBias: MarketBias;
  isAligned: boolean;
  confluenceScore: number;
  condition: StrategyCondition;
}

export function evaluateMTFConfluence(
  contextCandles: MarketCandle[],
  entryCandles: MarketCandle[],
  tradeType: TradeType
): MTFAnalysisResult {
  const contextTF: Timeframe = tradeType === 'SCALP' ? 'M15' : tradeType === 'DAY' ? 'H1' : 'H4';
  const entryTF: Timeframe = tradeType === 'SCALP' ? 'M5' : tradeType === 'DAY' ? 'M15' : 'H1';

  if (contextCandles.length < 15 || entryCandles.length < 15) {
    return {
      tradeType,
      contextTimeframe: contextTF,
      entryTimeframe: entryTF,
      contextBias: 'NEUTRAL',
      entryBias: 'NEUTRAL',
      isAligned: false,
      confluenceScore: 0,
      condition: {
        id: 'mtf_confluence',
        name: `Multi-Timeframe (${contextTF} ➔ ${entryTF})`,
        category: 'MTF_CONFLUENCE',
        met: false,
        bias: 'NEUTRAL',
        score: 0,
        description: 'Insufficient candles across context or entry timeframes.',
      },
    };
  }

  const contextStructure = analyzeMarketStructure(contextCandles);
  const contextIndicators = computeIndicators(contextCandles);

  const entryStructure = analyzeMarketStructure(entryCandles);
  const entryIndicators = computeIndicators(entryCandles);

  // Context Bias Assessment
  const contextPrice = contextCandles[contextCandles.length - 1].close;
  const contextEma50 = contextIndicators.ema50[contextIndicators.ema50.length - 1];
  let contextBias: MarketBias = contextStructure.trend;
  if (contextBias === 'NEUTRAL') {
    if (contextPrice > contextEma50) contextBias = 'BULLISH';
    else if (contextPrice < contextEma50) contextBias = 'BEARISH';
  }

  // Entry Bias Assessment
  const entryPrice = entryCandles[entryCandles.length - 1].close;
  const entryEma20 = entryIndicators.ema20[entryIndicators.ema20.length - 1];
  let entryBias: MarketBias = entryStructure.trend;
  if (entryBias === 'NEUTRAL') {
    if (entryPrice > entryEma20) entryBias = 'BULLISH';
    else if (entryPrice < entryEma20) entryBias = 'BEARISH';
  }

  const isAligned = contextBias !== 'NEUTRAL' && contextBias === entryBias;

  let confluenceScore = 0;
  let condition: StrategyCondition;

  if (isAligned) {
    confluenceScore = 25;
    condition = {
      id: 'mtf_confluence',
      name: `MTF Confluence: ${contextTF} Context aligns with ${entryTF} Entry (${contextBias})`,
      category: 'MTF_CONFLUENCE',
      met: true,
      bias: contextBias,
      score: 25,
      description: `Higher timeframe (${contextTF}) macro bias is ${contextBias}, fully confirmed by lower timeframe (${entryTF}) execution structure. High-probability alignment.`,
    };
  } else if (contextBias !== 'NEUTRAL' && entryBias === 'NEUTRAL') {
    confluenceScore = 12;
    condition = {
      id: 'mtf_confluence',
      name: `MTF Alignment: ${contextTF} Bias ${contextBias}, ${entryTF} Consolidating`,
      category: 'MTF_CONFLUENCE',
      met: true,
      bias: contextBias,
      score: 12,
      description: `Macro ${contextTF} structure is ${contextBias}. Lower timeframe ${entryTF} is currently compressing before potential expansion.`,
    };
  } else {
    confluenceScore = 0;
    condition = {
      id: 'mtf_confluence',
      name: `MTF Divergence / Conflict (${contextTF}: ${contextBias} vs ${entryTF}: ${entryBias})`,
      category: 'MTF_CONFLUENCE',
      met: false,
      bias: 'NEUTRAL',
      score: 0,
      description: `Conflict between higher timeframe ${contextTF} (${contextBias}) and lower timeframe ${entryTF} (${entryBias}). Trade filter active to prevent counter-trend friction.`,
    };
  }

  return {
    tradeType,
    contextTimeframe: contextTF,
    entryTimeframe: entryTF,
    contextBias,
    entryBias,
    isAligned,
    confluenceScore,
    condition,
  };
}
