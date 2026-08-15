import { MarketCandle, MarketStructure, StrategyCondition } from '../types';
import { analyzeMarketStructure } from '../utils/indicators';

export function evaluateMarketStructureStrategy(
  candles: MarketCandle[],
  structure?: MarketStructure
): StrategyCondition {
  const currentStructure = structure || analyzeMarketStructure(candles);

  if (currentStructure.lastBOS && currentStructure.lastBOS.type === 'BULLISH') {
    return {
      id: 'market_structure',
      name: 'Market Structure: Bullish Break of Structure (BOS)',
      category: 'STRUCTURE',
      met: true,
      bias: 'BULLISH',
      score: 18,
      description: `Higher high confirmed with a clean Bullish BOS breaking ${currentStructure.lastBOS.price.toFixed(4)}. Order flow is bullish.`,
    };
  }

  if (currentStructure.lastBOS && currentStructure.lastBOS.type === 'BEARISH') {
    return {
      id: 'market_structure',
      name: 'Market Structure: Bearish Break of Structure (BOS)',
      category: 'STRUCTURE',
      met: true,
      bias: 'BEARISH',
      score: 18,
      description: `Lower low confirmed with a clean Bearish BOS piercing ${currentStructure.lastBOS.price.toFixed(4)}. Order flow is bearish.`,
    };
  }

  if (currentStructure.lastCHoCH && currentStructure.lastCHoCH.type === 'BULLISH') {
    return {
      id: 'market_structure',
      name: 'Market Structure: Bullish Change of Character (CHoCH)',
      category: 'STRUCTURE',
      met: true,
      bias: 'BULLISH',
      score: 15,
      description: `Trend transition signal: Bullish CHoCH detected as price breached previous lower high at ${currentStructure.lastCHoCH.price.toFixed(4)}.`,
    };
  }

  if (currentStructure.lastCHoCH && currentStructure.lastCHoCH.type === 'BEARISH') {
    return {
      id: 'market_structure',
      name: 'Market Structure: Bearish Change of Character (CHoCH)',
      category: 'STRUCTURE',
      met: true,
      bias: 'BEARISH',
      score: 15,
      description: `Trend transition signal: Bearish CHoCH detected as price violated previous higher low at ${currentStructure.lastCHoCH.price.toFixed(4)}.`,
    };
  }

  if (currentStructure.trend === 'BULLISH') {
    return {
      id: 'market_structure',
      name: 'Market Structure: Bullish Sequence (HH/HL)',
      category: 'STRUCTURE',
      met: true,
      bias: 'BULLISH',
      score: 12,
      description: 'Progressing higher highs and higher lows without structure breakdown.',
    };
  }

  if (currentStructure.trend === 'BEARISH') {
    return {
      id: 'market_structure',
      name: 'Market Structure: Bearish Sequence (LH/LL)',
      category: 'STRUCTURE',
      met: true,
      bias: 'BEARISH',
      score: 12,
      description: 'Progressing lower highs and lower lows without structure breach.',
    };
  }

  return {
    id: 'market_structure',
    name: 'Market Structure: Undefined / Ranging',
    category: 'STRUCTURE',
    met: false,
    bias: 'NEUTRAL',
    score: 0,
    description: 'No clear BOS or CHoCH. Market is oscillating in consolidation without distinct higher/lower series.',
  };
}
