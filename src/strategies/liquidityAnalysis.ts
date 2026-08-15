import { MarketCandle, MarketStructure, StrategyCondition, StrategyResult, Timeframe } from '../types';
import { analyzeMarketStructure } from '../utils/indicators';

/**
 * Liquidity-Sweep Strategy Analysis Engine
 * Detects institutional stop hunt / liquidity purges at key swing highs/lows.
 * Requires rejection and structural return. A sweep without confirmation returns NO_SETUP (valid: false).
 */
export function analyzeLiquiditySweepStrategy(
  candles: MarketCandle[],
  structure?: MarketStructure,
  timeframe: Timeframe = 'M15'
): StrategyResult {
  const currentStructure = structure || analyzeMarketStructure(candles);

  if (!currentStructure.liquiditySweeps || currentStructure.liquiditySweeps.length === 0) {
    return {
      strategyName: 'LIQUIDITY_SWEEP',
      direction: 'NONE',
      valid: false,
      strength: 0,
      timeframe,
      reason: 'No active liquidity sweeps detected at swing extremes.',
      conditions: [],
    };
  }

  const lastSweep = currentStructure.liquiditySweeps[currentStructure.liquiditySweeps.length - 1];
  const currentCandle = candles[candles.length - 1];

  // Bullish Liquidity Sweep: Price pierced below swing low, wicked, and closed back above the level
  if (lastSweep.type === 'SWEEP_LOWS' && lastSweep.reversalConfirmed) {
    const strength = lastSweep.significance === 'HIGH' ? 88 : 75;
    return {
      strategyName: 'LIQUIDITY_SWEEP',
      direction: 'BUY',
      valid: true,
      strength,
      timeframe,
      reason: `Bullish Liquidity Sweep: Sell-side stops purged below ${lastSweep.price.toFixed(4)}. Price reclaimed level with strong buying absorption.`,
      conditions: [
        `Sell-side liquidity grab confirmed below ${lastSweep.price.toFixed(4)}`,
        `Immediate reclamation and structural closure back inside range`,
        `High-volume rejection wick confirmed`,
      ],
      entryZone: { low: lastSweep.price, high: currentCandle.close },
      invalidationLevel: lastSweep.price * 0.998,
    };
  }

  // Bearish Liquidity Sweep: Price pierced above swing high, wicked, and closed back below the level
  if (lastSweep.type === 'SWEEP_HIGHS' && lastSweep.reversalConfirmed) {
    const strength = lastSweep.significance === 'HIGH' ? 88 : 75;
    return {
      strategyName: 'LIQUIDITY_SWEEP',
      direction: 'SELL',
      valid: true,
      strength,
      timeframe,
      reason: `Bearish Liquidity Sweep: Buy-side stops purged above ${lastSweep.price.toFixed(4)}. Price rejected level with strong seller defense.`,
      conditions: [
        `Buy-side liquidity grab confirmed above ${lastSweep.price.toFixed(4)}`,
        `Immediate reclamation and structural closure back inside range`,
        `High-volume rejection wick confirmed`,
      ],
      entryZone: { low: currentCandle.close, high: lastSweep.price },
      invalidationLevel: lastSweep.price * 1.002,
    };
  }

  // Sweep without confirmed reversal/reclamation -> NO_SETUP
  return {
    strategyName: 'LIQUIDITY_SWEEP',
    direction: 'NONE',
    valid: false,
    strength: 30,
    timeframe,
    reason: `Liquidity probe at ${lastSweep.price.toFixed(4)} has not confirmed structural return/absorption.`,
    conditions: [],
  };
}

export function evaluateLiquiditySweep(
  candles: MarketCandle[],
  structure?: MarketStructure
): StrategyCondition {
  const result = analyzeLiquiditySweepStrategy(candles, structure);

  if (result.valid && result.direction === 'BUY') {
    return {
      id: 'liquidity_analysis',
      name: 'Liquidity Sweep: Sell-Side Liquidity Purged',
      category: 'LIQUIDITY',
      met: true,
      bias: 'BULLISH',
      score: 16,
      description: result.reason,
    };
  }

  if (result.valid && result.direction === 'SELL') {
    return {
      id: 'liquidity_analysis',
      name: 'Liquidity Sweep: Buy-Side Liquidity Purged',
      category: 'LIQUIDITY',
      met: true,
      bias: 'BEARISH',
      score: 16,
      description: result.reason,
    };
  }

  return {
    id: 'liquidity_analysis',
    name: 'Liquidity Analysis: Neutral / No Setup',
    category: 'LIQUIDITY',
    met: false,
    bias: 'NEUTRAL',
    score: 0,
    description: result.reason,
  };
}

